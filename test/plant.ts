// The shared throwaway plant every scenario runs on: a temp Git repo after a real `limen init`, an environment built
// from an allowlist, the scripted fake engine (test/fake-engine.mjs) as `pi`, and a fetch sink that records
// every request a Limen process makes. Scenarios wait on file events and FIFOs; nothing here sleeps, and only a
// process's exit, which raises no file event, is read again on a short interval (`waitJob`, and cleanup's listing of
// the plant's processes).
import { type ChildProcess, execFileSync, spawn, spawnSync } from "node:child_process";
import { existsSync, readFileSync, watch } from "node:fs";
import { mkdir, mkdtemp, readdir, realpath, rm, symlink, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { basename, dirname, join, resolve } from "node:path";
import { setTimeout as delay } from "node:timers/promises";
import { fileURLToPath } from "node:url";
import { atomicWrite } from "../src/atomic-write.ts";
import { TERMINAL_STATES } from "../src/job/job.ts";
import { emptyRecord, type JobRecord, readRecordSync, serialized } from "../src/job/record.ts";
import { platform } from "../src/platform/platform.ts";
import { hasCode } from "../src/system-error.ts";
import { readOutcome } from "./final-line.ts";

export const LIMEN = fileURLToPath(new URL("../bin/limen", import.meta.url));
const FAKE_ENGINE = fileURLToPath(new URL("./fake-engine.mjs", import.meta.url));
/**
 * The child `waitJob` runs, so its caller stays synchronous. It watches the job folder (argument 1) and prints the
 * state of the job's record once it is one of the terminal states (argument 2, JSON) and the process the record names
 * has exited: the wrapper writes the terminal record first and then finishes, and while that process lives a command
 * such as `limen keeper` refuses the job (A-088). A process's exit raises no file event, so the waiter reads the
 * process again every 50 ms once the record is terminal; a zombie counts as exited. A missing record, or a state that
 * is neither starting, running nor terminal, fails it. The one-second re-check closes the gap of a watch that starts
 * late, as in `until`.
 */
const WAITER = `
import { readFileSync, watch } from "node:fs";
import { join } from "node:path";
const [dir, terminal] = [process.argv[1], JSON.parse(process.argv[2])];
let done = false;
let poll;
const watcher = watch(dir, () => settle());
const recheck = setInterval(() => settle(), 1000);
function exited(pid) {
	try {
		const stat = readFileSync("/proc/" + pid + "/stat", "utf8");
		return stat[stat.lastIndexOf(") ") + 2] === "Z";
	} catch {
		return true;
	}
}
function settle() {
	if (done) {
		return;
	}
	const record = JSON.parse(readFileSync(join(dir, "record.json"), "utf8"));
	const ended = terminal.includes(record.state);
	if (record.state === "starting" || record.state === "running") {
		return;
	}
	if (ended && record.identity?.pid && !exited(record.identity.pid)) {
		poll ??= setInterval(() => settle(), 50);
		return;
	}
	done = true;
	watcher.close();
	clearInterval(recheck);
	clearInterval(poll);
	if (ended) {
		process.stdout.write(record.state);
		return;
	}
	console.error("job state", JSON.stringify(record.state), "is neither running nor terminal");
	process.exitCode = 1;
}
settle();
`;
/** The bound of one `waitJob`: below the suite's 180-second test timeout, which cannot fire while `spawnSync` blocks. */
const WAIT_MS = 120_000;
/** How long cleanup goes on stopping the plant's processes; SIGKILL ends a process within milliseconds. */
const STOP_MS = 10_000;
/** How long cleanup waits after a round of signals before it lists the plant's processes again, as `WAITER` does. */
const STOP_CHECK_MS = 20;

export type Plant = {
	readonly parent: string;
	readonly root: string;
	readonly bin: string;
	readonly env: Readonly<Record<string, string>>;
	cleanup(): Promise<void>;
};
export type Run = { readonly stdout: string; readonly stderr: string; readonly status: number };
export type RunOptions = { readonly cwd?: string; readonly env?: Readonly<Record<string, string>> };

export const TICKET = "spec/features/active/F001-demo/ticket.md";
const report = `Done: ż € 🦀 stay whole.\n${"Done: one report line, long enough to count.\n".repeat(200)}Note check: not proven yet: none`;
export const FINAL = { text: report, line: report.replaceAll("\n", "\\n") };
const ticket = `---
touches:
  - demo.place
opened: 2026-10-06
---

# F001 · The demo plant has one ticket

## Outcome

A throwaway plant for one test file.
`;
const node = (kind: string, id: string, parent: string) => `---
schema: architecture-map/1
kind: ${kind}
id: ${id}
project: demo
title: ${id}
status: ready
parent: ${parent}
sources:
  - README.md
---
`;

/**
 * The plant's folder for the runner's git (D-060): a link to the first `git` on the PATH of the process that runs the
 * tests, so a plant meets the git the suite runs with, not the system's in /usr/bin. None when that git sits in the
 * node's folder `nodeFolder` (the gate's shim, which then comes first and never meets a link to itself) or there is
 * none.
 */
async function runnerGit(parent: string, nodeFolder: string): Promise<string[]> {
	const found = (process.env.PATH ?? "").split(":").find((folder) => folder !== "" && existsSync(join(folder, "git")));
	if (found === undefined || resolve(found) === resolve(nodeFolder)) {
		return [];
	}
	const folder = join(parent, "runner-git");
	await mkdir(folder);
	await symlink(resolve(found, "git"), join(folder, "git"));
	return [folder];
}

/** A fresh plant. `root` is the real path: macOS tmpdir is a /var symlink and Git reports /private/var. */
export async function plant(): Promise<Plant> {
	const parent = await realpath(await mkdtemp(join(tmpdir(), "limen-plant-")));
	const root = join(parent, "repo");
	const bin = join(parent, "bin");
	await Promise.all([mkdir(bin), mkdir(join(parent, "home")), mkdir(join(parent, ".limen"))]);
	// The seat's start gate settles for 1 ms instead of a minute, so the jobs of one test start one after another at once.
	await writeFile(join(parent, ".limen", "start-gate.json"), '{"settle":"1ms"}\n');
	await symlink(FAKE_ENGINE, join(bin, "pi"));
	await writeFile(join(parent, "sink.mjs"), sinkSource(parent));
	const nodeFolder = dirname(process.execPath);
	const env = {
		PATH: [bin, nodeFolder, ...(await runnerGit(parent, nodeFolder)), "/usr/bin", "/bin", "/usr/sbin", "/sbin"].join(
			":",
		),
		HOME: join(parent, "home"),
		TMPDIR: tmpdir(),
		LIMEN_HOME: parent,
		LIMEN_HERDR: "0",
		LIMEN_HUNK: "0",
		GIT_CONFIG_GLOBAL: "/dev/null",
		GIT_CONFIG_NOSYSTEM: "1",
		// Without start-reading.json the reading is unknown and the gate is open; a test writes the file to close it.
		LIMEN_START_READING: join(parent, "start-reading.json"),
		LIMEN_START_POLL_MS: "50",
		NODE_NO_WARNINGS: "1",
		NODE_OPTIONS: `--import=${join(parent, "sink.mjs")}`,
	};
	const made: Plant = {
		parent,
		root,
		bin,
		env,
		cleanup: async () => {
			await stopProcesses(parent);
			// A process started outside the plant's environment still ends here when its argv holds the plant path.
			spawnSync("pkill", ["-f", parent]);
			await rm(parent, { recursive: true, force: true, maxRetries: 10, retryDelay: 100 });
		},
	};
	await repository(root);
	const init = limen(made, ["init"]);
	if (init.status !== 0) {
		throw new Error(`limen init failed: ${init.stderr}`);
	}
	await mkdir(join(root, dirname(TICKET)), { recursive: true });
	await mkdir(join(root, ".limen/picture/nodes"), { recursive: true });
	await writeFile(join(root, TICKET), ticket);
	await writeFile(join(root, ".limen/picture/nodes/demo.md"), node("plant", "demo", "null"));
	await writeFile(join(root, ".limen/picture/nodes/demo.place.md"), node("module", "demo.place", "demo"));
	git(root, "add", "-A");
	git(root, "commit", "-q", "-m", "limen init");
	return made;
}

/**
 * Stops every process of the plant `parent` and returns once none is left. Each process the plant starts inherits the
 * plant's `LIMEN_HOME` (a test knob, src/config.ts), so the environment names them all, a queued wrapper included,
 * which has no engine yet and no path of the plant in its command line (D-063 (3)). The processes are listed again
 * after each round of signals until the list is empty: a process can start another one between the listing and its
 * signal, and that one inherits the plant's environment too. The signal is SIGKILL: a stopped process (a test's
 * SIGSTOP) holds a SIGTERM until it continues, and a wrapper that ends normally writes into the folder that cleanup
 * removes next. The platform adapter sends it (src/platform/): a process that exited after the listing is `missing`
 * and needs none. A process the system does not let the test signal, or one of the plant still running after
 * `STOP_MS`, fails the cleanup, and the folder stays.
 */
async function stopProcesses(parent: string): Promise<void> {
	const deadline = Date.now() + STOP_MS;
	for (let left = await plantProcesses(parent); left.length > 0; left = await plantProcesses(parent)) {
		if (Date.now() >= deadline) {
			throw new Error(`cleanup: processes ${left.join(", ")} of the plant ${parent} still run after SIGKILL`);
		}
		const denied: number[] = [];
		for (const pid of left) {
			if (platform.signalProcess(pid, "SIGKILL") === "denied") {
				denied.push(pid);
			}
		}
		if (denied.length > 0) {
			throw new Error(`cleanup: the test may not signal processes ${denied.join(", ")} of the plant ${parent}`);
		}
		await delay(STOP_CHECK_MS);
	}
}
/**
 * The processes that carry the plant's environment and have not exited, the test's own process aside. A process that
 * is gone or a zombie is absent for the platform adapter (src/platform/); one the system cannot describe still counts.
 */
async function plantProcesses(parent: string): Promise<number[]> {
	const mark = `LIMEN_HOME=${parent}`;
	const marked = (await readdir("/proc"))
		.filter((name) => /^\d+$/.test(name))
		.map(Number)
		.filter((pid) => pid !== process.pid && environment(pid).includes(mark));
	const running: number[] = [];
	for (const pid of marked) {
		if ((await platform.processInfo(pid)).kind !== "absent") {
			running.push(pid);
		}
	}
	return running;
}
/** The environment entries of the process `pid`; none for a process that is gone or that another user owns. */
function environment(pid: number): string[] {
	try {
		return readFileSync(`/proc/${pid}/environ`, "utf8").split("\0");
	} catch (error) {
		if (hasCode(error, "ENOENT") || hasCode(error, "ESRCH") || hasCode(error, "EACCES")) {
			return [];
		}
		throw error;
	}
}

/** A Git repo with one commit, configured for commits under GIT_CONFIG_GLOBAL=/dev/null. */
export async function repository(root: string): Promise<void> {
	await mkdir(root, { recursive: true });
	git(root, "init", "-q", "-b", "main");
	git(root, "config", "user.email", "limen@example.test");
	git(root, "config", "user.name", "Limen Test");
	await writeFile(join(root, "README.md"), "plant\n");
	git(root, "add", ".");
	git(root, "commit", "-q", "-m", "initial");
}

/** Runs the real CLI in the plant with the allowlisted environment plus `options.env`. */
export function limen(plant: Plant, args: readonly string[], options: RunOptions = {}): Run {
	const result = spawnSync(process.execPath, [LIMEN, ...args], {
		cwd: options.cwd ?? plant.root,
		encoding: "utf8",
		env: { ...plant.env, ...options.env },
	});
	if (result.error) {
		throw result.error;
	}
	return { stdout: result.stdout, stderr: result.stderr, status: result.status ?? 1 };
}

/** Runs the real CLI beside the test and other runs; `done` resolves once it exits. */
export function start(plant: Plant, args: readonly string[], options: RunOptions = {}) {
	const child: ChildProcess = spawn(process.execPath, [LIMEN, ...args], {
		cwd: options.cwd ?? plant.root,
		env: { ...plant.env, ...options.env },
	});
	const run = { stdout: "", stderr: "", status: 1 };
	child.stdout?.on("data", (chunk) => (run.stdout += chunk));
	child.stderr?.on("data", (chunk) => (run.stderr += chunk));
	const done = new Promise<Run>((resolve) => child.on("close", (status) => resolve({ ...run, status: status ?? 1 })));
	return { child, done };
}

/** The route of a test job: spawn requires all four flags (D-043), and the fake engine runs any of them. */
const ROUTE = { "--engine": "pi", "--provider": "p", "--model": "m", "--thinking": "high" } as const;

/** `flags` with each route flag they do not give itself. */
export function routed(flags: readonly string[]): string[] {
	return [...Object.entries(ROUTE).flatMap(([flag, value]) => (flags.includes(flag) ? [] : [flag, value])), ...flags];
}

/** `limen spawn [flags] <task>` on the test route; returns the job id or throws with the CLI output. */
export function spawnJob(plant: Plant, task: string, flags: readonly string[] = [], options: RunOptions = {}): string {
	const run = limen(plant, ["spawn", ...routed(flags), task], options);
	if (run.status !== 0) {
		throw new Error(`spawn failed (${run.status}): ${run.stdout}${run.stderr}`);
	}
	return startedJob(run);
}

/** The id of the job a run of the CLI started, from `ids.job` of its final line; throws with the output without it. */
export function startedJob(run: Run): string {
	const id = readOutcome(run).ids?.job;
	if (!id) {
		throw new Error(`the final line names no job: ${run.stdout}${run.stderr}`);
	}
	return id;
}

/**
 * Blocks until the job's record is terminal and the wrapper it names has exited, then returns the state, so the caller
 * acts on a job no process owns any more (see `WAITER`). The job folder is under
 * `options.cwd` when given, as for a job of a workspace or of another checkout, otherwise under the plant root;
 * `options.env` plays no part. A child node process watches the folder, so the caller needs no `await` and nothing
 * sleeps; the wait ends with an error after `WAIT_MS`.
 */
export function waitJob(plant: Plant, id: string, options: RunOptions = {}): string {
	const dir = join(options.cwd ?? plant.root, ".limen", "jobs", id);
	const terminal = JSON.stringify(TERMINAL_STATES);
	const run = spawnSync(process.execPath, ["--input-type=module", "--eval", WAITER, dir, terminal], {
		encoding: "utf8",
		env: {},
		timeout: WAIT_MS,
	});
	if (run.error) {
		throw new Error(`waiting for job ${id} failed within ${WAIT_MS} ms: ${run.error.message}`, { cause: run.error });
	}
	if (run.status !== 0) {
		throw new Error(`waiting for job ${id} failed: ${run.stderr}`);
	}
	return run.stdout;
}

export function jobDir(plant: Plant, id: string): string {
	return join(plant.root, ".limen", "jobs", id);
}

/** A content file of a job (`log`, `result`, `task.md`, …) as trimmed text; "" when it does not exist. */
export function jobFile(plant: Plant, id: string, name: string): string {
	const path = join(jobDir(plant, id), name);
	return existsSync(path) ? readFileSync(path, "utf8").trim() : "";
}

/** The job's record, read through the record module; undefined when the folder holds none. */
export function jobRecord(plant: Plant, id: string, options: RunOptions = {}): JobRecord | undefined {
	return readRecordSync(join(options.cwd ?? plant.root, ".limen", "jobs", id));
}

/**
 * Writes the record of the job folder `dir` by hand, as a test that plants a job without a wrapper needs: the empty
 * record of the folder's name (src/job/record.ts) with `fields`. The write is atomicWrite's, as every write of a
 * record is, so a Limen process that reads the record meanwhile reads the old one or the new one, never a part
 * (D-063 (1)).
 */
export async function writeRecord(dir: string, fields: Partial<JobRecord> = {}): Promise<void> {
	await mkdir(dir, { recursive: true });
	await atomicWrite(join(dir, "record.json"), serialized({ ...emptyRecord(basename(dir)), ...fields }));
}

/**
 * Changes fields of the record of the job folder `dir` by hand, as a test that plants an older or odd record does;
 * written whole, as `writeRecord` writes.
 */
export async function editRecord(dir: string, fields: (record: JobRecord) => Partial<JobRecord>): Promise<void> {
	const record = readRecordSync(dir);
	if (!record) {
		throw new Error(`${dir} holds no record to edit`);
	}
	await atomicWrite(join(dir, "record.json"), serialized({ ...record, ...fields(record) }));
}

/** The state of the job's record, or "" while it has none. */
export function jobState(plant: Plant, id: string, options: RunOptions = {}): string {
	return jobRecord(plant, id, options)?.state ?? "";
}

/**
 * Resolves once `check()` holds, re-checked on every file event below `dir`; bounded only by the test timeout.
 * macOS starts a directory watch asynchronously, so a file made just after `watch()` can raise no event; the
 * one-second re-check closes that gap, as the watcher of `waitJob` does. Nothing here waits for time to pass.
 */
export function until(dir: string, check: () => boolean): Promise<void> {
	const { promise, resolve } = Promise.withResolvers<void>();
	const settle = () => {
		if (!check()) {
			return;
		}
		watcher.close();
		clearInterval(fallback);
		resolve();
	};
	const watcher = watch(dir, { recursive: true }, settle);
	const fallback = setInterval(settle, 1_000);
	settle();
	return promise;
}

/** Waits until the fake engine reaches its `n`th `block` in `dir`, then releases it. */
export async function release(dir: string, n = 1): Promise<void> {
	await until(dir, () => existsSync(join(dir, `fake-blocked-${n}`)));
	await writeFile(join(dir, "fake-gate"), "go\n");
}

/** What the fake engine received through the extension API: steers, follow-ups, messages, notices, its exit. */
export function engineEvents(
	dir: string,
): Array<{ readonly event: string; readonly text?: string; readonly code?: number }> {
	const path = join(dir, "fake-events.jsonl");
	return existsSync(path) ? JSON.parse(`[${readFileSync(path, "utf8").trim().split("\n").join(",")}]`) : [];
}

/** Every fetch any Limen process in this plant made; `respond` rows answer the first request whose URL contains `match`. */
export function requests(plant: Plant): Array<{
	readonly url: string;
	readonly method: string;
	readonly headers: Record<string, string>;
	readonly body: string;
}> {
	const path = join(plant.parent, "fetch.jsonl");
	return existsSync(path) ? JSON.parse(`[${readFileSync(path, "utf8").trim().split("\n").join(",")}]`) : [];
}
/**
 * A row answers after `delayMs`, with its `headers` beside the JSON content type, and only the first `upTo` requests
 * to its URL; later ones fall to the next row or 200.
 */
export async function respond(
	plant: Plant,
	rows: ReadonlyArray<{
		match: string;
		status?: number;
		body: unknown;
		headers?: Readonly<Record<string, string>>;
		delayMs?: number;
		upTo?: number;
	}>,
): Promise<void> {
	await writeFile(join(plant.parent, "fetch-responses.json"), JSON.stringify(rows));
}

/**
 * The plant's PATH without `tool`: each folder that holds it gives way to a new folder of links to its other entries, so
 * every other program stays where the plant finds it, the runner's git and the gate's git shim included.
 */
export async function pathWithout(plant: Plant, tool: string): Promise<string> {
	const folders = (plant.env.PATH ?? "").split(":");
	const kept: string[] = [];
	for (const [index, folder] of folders.entries()) {
		if (!existsSync(join(folder, tool))) {
			kept.push(folder);
			continue;
		}
		const links = join(plant.parent, `path-without-${tool}-${index}`);
		await mkdir(links);
		const names = (await readdir(folder)).filter((name) => name !== tool);
		await Promise.all(names.map((name) => symlink(join(folder, name), join(links, name))));
		kept.push(links);
	}
	return kept.join(":");
}

/**
 * A PATH whose `git` refuses `-z` as git before 2.36 does (exit 129) and passes every other call to the plant's git,
 * under the plant's own PATH, so a git shim on that PATH never finds this one again.
 */
export async function pathWithOldGit(plant: Plant): Promise<string> {
	const folder = join(plant.parent, "old-git");
	await mkdir(folder);
	const script = [
		"#!/bin/sh",
		'for arg in "$@"; do',
		'\tif [ "$arg" = -z ]; then',
		"\t\techo \"error: unknown switch 'z'\" >&2",
		"\t\texit 129",
		"\tfi",
		"done",
		`PATH='${plant.env.PATH}' exec git "$@"`,
	].join("\n");
	await writeFile(join(folder, "git"), `${script}\n`, { mode: 0o755 });
	return `${folder}:${plant.env.PATH}`;
}

/**
 * Pull request `pr` of the plant as GitHub serves it, from a local remote in GitHub's place: a clone of the plant whose
 * `refs/pull/<pr>/head` is one commit past `main`. Returns the base, the head and a PATH whose first `git` reads
 * `origin` in `ls-remote` and `fetch` as that remote, so a review's checks reach no network, and passes every call to
 * the plant's git; `git remote get-url origin` still names what the plant set.
 */
export async function pullRequestOrigin(
	plant: Plant,
	pr: number,
): Promise<{ readonly base: string; readonly head: string; readonly path: string }> {
	const remote = join(plant.parent, "remote");
	git(plant.parent, "clone", "-q", plant.root, remote);
	git(remote, "checkout", "-qb", "pull");
	const identity = ["-c", "user.name=Limen Test", "-c", "user.email=limen@example.test"];
	git(remote, ...identity, "commit", "-q", "--allow-empty", "-m", "the pull request");
	const head = git(remote, "rev-parse", "pull");
	git(remote, "update-ref", `refs/pull/${pr}/head`, head);
	const base = git(remote, "rev-parse", "main");
	const folder = join(plant.parent, "pull-request-origin");
	await mkdir(folder);
	const script = [
		"#!/bin/sh",
		'if [ "$1" = ls-remote ] || [ "$1" = fetch ]; then',
		"\tfor arg do",
		"\t\tshift",
		`\t\tif [ "$arg" = origin ]; then set -- "$@" '${remote}'; else set -- "$@" "$arg"; fi`,
		"\tdone",
		"fi",
		`PATH='${plant.env.PATH}' exec git "$@"`,
	].join("\n");
	await writeFile(join(folder, "git"), `${script}\n`, { mode: 0o755 });
	return { base, head, path: `${folder}:${plant.env.PATH}` };
}

export function git(cwd: string, ...args: readonly string[]): string {
	return execFileSync("git", args, {
		cwd,
		encoding: "utf8",
		env: { ...process.env, GIT_CONFIG_GLOBAL: "/dev/null", GIT_CONFIG_NOSYSTEM: "1" },
	}).trim();
}

function sinkSource(parent: string): string {
	return `import { appendFileSync, existsSync, readFileSync } from "node:fs";
globalThis.fetch = async (input, init = {}) => {
	const url = String(input instanceof Request ? input.url : input);
	const body = typeof init.body === "string" ? init.body : init.body ? String(init.body) : "";
	const log = ${JSON.stringify(join(parent, "fetch.jsonl"))};
	appendFileSync(log, JSON.stringify({ url, method: init.method ?? "GET", headers: Object.fromEntries(new Headers(init.headers)), body }) + "\\n");
	const file = ${JSON.stringify(join(parent, "fetch-responses.json"))};
	const count = readFileSync(log, "utf8").split("\\n").filter((line) => line.includes(JSON.stringify(url))).length;
	const row = existsSync(file) ? JSON.parse(readFileSync(file, "utf8")).find((candidate) => url.includes(candidate.match) && count <= (candidate.upTo ?? count)) : undefined;
	await new Promise((resolve) => setTimeout(resolve, row?.delayMs ?? 0));
	return new Response(JSON.stringify(row?.body ?? {}), { status: row?.status ?? 200, headers: { ...row?.headers, "content-type": "application/json" } });
};
`;
}
