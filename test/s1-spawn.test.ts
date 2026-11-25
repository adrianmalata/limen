// S1 · Spawn, detached. A job gets its own worktree and branch from the base commit, the exact task bytes and an
// engine environment built from the allow-list, which its --prepare command gets too, without the caller's Herdr pane,
// Pi session, token or git credential helper; reading a running job leaves its index alone; a workspace job works in
// one child repository; each refusal leaves the shared snapshot identical (T-38 (4)).
import assert from "node:assert/strict";
import { existsSync, readdirSync, readFileSync } from "node:fs";
import { mkdir, rm, utimes, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { after, before, test } from "node:test";
import { ENVIRONMENT } from "../src/config.ts";
import { readOutcome } from "./final-line.ts";
import {
	editRecord,
	git,
	jobDir,
	jobFile,
	jobRecord,
	limen,
	type Plant,
	plant,
	release,
	repository,
	routed,
	spawnJob,
	startedJob,
	TICKET,
	waitJob,
} from "./plant.ts";
import { snapshot } from "./snapshot.ts";

let p: Plant;
before(async () => {
	p = await plant();
});
after(() => p.cleanup());

const json = (path: string) => JSON.parse(readFileSync(path, "utf8"));

// The plant has no job yet, so the folder of job worktrees does not exist: a spawn that made it before its ticket
// check (before R-092) changed the snapshot.
test("each spawn refusal exits with its class's code, names its cause and its own code, and leaves the snapshot identical", async (context) => {
	const draft = "spec/features/active/F002-draft/ticket.md";
	await mkdir(join(p.root, "spec/features/active/F002-draft"));
	context.after(() => rm(join(p.root, "spec/features/active/F002-draft"), { recursive: true }));
	await writeFile(join(p.root, draft), "# F002 · Not committed yet\n");
	const clean = snapshot(p.root);
	const refusals: ReadonlyArray<readonly [readonly string[], string, number, string, Record<string, string>?]> = [
		[[`Implement F002. Ticket: ${draft}`], draft, 1, "TICKET_NOT_AT_BASE"],
		[["--role", "coordinator", "work"], "coordinator", 1, "SPAWN_LEAD_ROLE"],
		[["--engine", "claude", "work"], "--engine", 2, "BAD_ENGINE"],
		[["--engine", "pi", "work"], "PATH", 4, "ENGINE_MISSING", { PATH: "/usr/bin:/bin" }],
		[["--engine", "pi", "--extension", "missing.ts", "work"], "missing.ts", 2, "BAD_EXTENSION"],
		[["--provider", "pi-claude", "--model", "claude-opus-5-5", "work"], "pi install", 4, "BRIDGE_MISSING"],
	];
	for (const [args, cause, status, code, env] of refusals) {
		const run = limen(p, ["spawn", ...routed(args)], env ? { env } : {});
		assert.deepEqual([run.status, readOutcome(run).code, snapshot(p.root)], [status, code, clean], args.join(" "));
		assert.ok(run.stderr.includes(cause), `${args.join(" ")}: ${run.stderr}`);
	}
});

test("limen spawn: a detached job runs in its own worktree from the base with the exact task and a clean engine environment", async () => {
	const base = git(p.root, "rev-parse", "HEAD");
	const task = `block\ncommit\nsay all done\n\nTicket: ${TICKET}  \n\t'quoted' $HOME \`tick\`\n`;
	const caller = {
		PI_SESSION_ID: "coord",
		PI_SESSION_FILE: join(p.parent, "coord.jsonl"),
		HERDR_ENV: "1",
		HERDR_PANE_ID: "p1",
		LIMEN_JOB_ID: "2026-10-08-f001-coordinator-1a2b3c4d",
	};
	const id = spawnJob(p, task, ["--detached", "--label", "F001 demo"], { env: caller });
	const dir = jobDir(p, id);
	const tree = jobRecord(p, id)?.worktree ?? "";
	assert.deepEqual([git(tree, "branch", "--show-current"), git(tree, "rev-parse", "HEAD")], [`limen/${id}`, base]);
	// `show` below reads the picture's link to the spawner job, `spawnedBy`, alone.
	await editRecord(dir, () => ({ spawner: null }));

	// Plain `git status` on stale stat data rewrites the index under the worker's own `git add`.
	// regression: 43c01cf
	const index = join(git(tree, "rev-parse", "--absolute-git-dir"), "index");
	await utimes(join(tree, "README.md"), new Date(0), new Date(0));
	const bytes = readFileSync(index);
	for (const read of [["status", "--all"], ["status"], ["show", id]]) {
		assert.equal(limen(p, read).status, 0, read.join(" "));
	}
	assert.deepEqual(readFileSync(index), bytes);

	await release(dir);
	assert.deepEqual([waitJob(p, id), readFileSync(join(dir, "task.md"), "utf8")], ["done", task]);
	assert.equal(readFileSync(join(dir, "fake-task.txt"), "utf8"), task);
	const argv: string[] = json(join(dir, "fake-argv.json"));
	assert.ok(!argv.some((value) => value.includes("say all done")), "the task stays out of argv");
	const leak = /^(HERDR_|PI_SESSION_)/;
	const leaked = json(join(dir, "fake-env.json")).filter((name: string) => leak.test(name));
	assert.deepEqual(leaked, []);
	const commits = git(p.root, "rev-list", `${base}..limen/${id}`).split("\n");
	assert.equal(commits.length, 1);
	assert.deepEqual([git(p.root, "rev-parse", "HEAD"), git(p.root, "status", "--porcelain")], [base, ""]);
	const shown = limen(p, ["show", id]);
	assert.ok(shown.stdout.includes(commits[0]?.slice(0, 7) ?? "?"), shown.stdout);
	assert.ok(shown.stdout.includes("all done"), shown.stdout);
	assert.ok(shown.stdout.includes(`\n  spawned-by job ${caller.LIMEN_JOB_ID}\n`), shown.stdout);

	// A served model other than the requested one shows both; a turn copied from a parent session is not counted.
	const usage = { input: 1, output: 10, cacheRead: 100, cacheWrite: 1000 };
	const turn = (timestamp: string, model: string) =>
		JSON.stringify({ type: "message", timestamp, message: { role: "assistant", provider: "p", model, usage } });
	const now = new Date().toISOString();
	const turns = [turn("2020-01-01T00:00:00.000Z", "parent"), turn(now, "other"), turn(now, "other")];
	await writeFile(join(dir, "session", "turns.jsonl"), `${turns.join("\n")}\n`);
	const detail = limen(p, ["show", id]).stdout;
	assert.ok(detail.includes(`model served p/other · requested ${jobRecord(p, id)?.route.model}`), detail);
	assert.ok(detail.includes("tokens 2 turns · input 2 · output 20 · cache read 200 · cache write 2,000"), detail);
	// The next tests of this plant spawn workers, which a finished job with unlanded work refuses (A-001).
	const abandoned = limen(p, ["abandon", id]);
	assert.equal(abandoned.status, 0, abandoned.stderr);
});

/** The names of the plant's environment, which the list passes in the plant's test mode (R-087 (b)). */
const PLANT_NAMES = [
	"PATH",
	"HOME",
	"TMPDIR",
	"GIT_CONFIG_GLOBAL",
	"GIT_CONFIG_NOSYSTEM",
	"NODE_NO_WARNINGS",
	"NODE_OPTIONS",
	"LIMEN_TEST_MODE",
	"LIMEN_HOME",
	"LIMEN_HERDR",
	"LIMEN_HUNK",
	"LIMEN_START_READING",
	"LIMEN_START_POLL_MS",
	"LIMEN_STALL_TICK_MS",
	"LIMEN_CGROUP_ROOT",
	"LIMEN_CGROUP",
];
/** What Limen sets in every job's environment, and the transport names a job's engine gets (R-087 (a)). */
const LIMEN_NAMES = [
	"DISABLE_UPDATES",
	"GIT_CONFIG_COUNT",
	"GIT_CONFIG_KEY_0",
	"GIT_CONFIG_VALUE_0",
	"GIT_TERMINAL_PROMPT",
	"GIT_ASKPASS",
	"GH_CONFIG_DIR",
	"LIMEN_JOB",
	"LIMEN_JOB_ID",
	"LIMEN_CONTEXT_ROOT",
];

// A-004 (T1): a coordinator's pane may hold a token for its own use; a job never sees it, nor LIMEN_COORDINATOR
// (A-061).
test("A-004: a spawn from an environment with a token and LIMEN_COORDINATOR starts an engine with only the list's names and Limen's, and its log names the dropped ones", () => {
	const caller = { DEMO_API_TOKEN: "dummy-not-a-secret", LIMEN_COORDINATOR: "1" };
	const id = spawnJob(p, "say listed", [], { env: caller });
	assert.equal(waitJob(p, id), "done");
	const names: string[] = json(join(jobDir(p, id), "fake-env.json"));
	const dropped = jobFile(p, id, "log")
		.split("\n")
		.filter((line) => line.includes("] environment: "));
	// The tests' systemd-run is a shell script, and the shell exports PWD to the wrapper; systemd's own adds no name.
	assert.deepEqual(
		[names, dropped.map((line) => line.slice(line.indexOf("] ") + 2))],
		[
			[...PLANT_NAMES, ...LIMEN_NAMES, "PWD"].sort(),
			["environment: dropped 2 names of the spawner: DEMO_API_TOKEN, LIMEN_COORDINATOR"],
		],
	);
});

/** The transport names only a job's wrapper reads, which its engine never gets (src/config.ts). */
const WRAPPER_READS = Object.entries(ENVIRONMENT).flatMap(([name, entry]) =>
	entry.kind === "transport" && entry.reader === "wrapper" ? [name] : [],
);

// R-087 (c), review round 2 (G1): the prepare command is the project's code, as the engine's tools are, so the wrapper
// hands it the engine's environment; before, it ran with the wrapper's own, the spawner's Herdr pane included.
test("a spawn's --prepare command runs with its engine's environment: no Herdr name, no transport name only the wrapper reads, and the engine's LIMEN_JOB", () => {
	const recorded = join(p.parent, "prepare-names.json");
	const names = `require("node:fs").writeFileSync(${JSON.stringify(recorded)}, JSON.stringify(Object.keys(process.env)))`;
	const prepare = `${JSON.stringify(process.execPath)} -e ${JSON.stringify(names)}`;
	const id = spawnJob(p, "say prepared", ["--prepare", prepare], { env: { HERDR_ENV: "1", HERDR_PANE_ID: "p1" } });
	assert.equal(waitJob(p, id), "done");
	const got: string[] = json(recorded);
	assert.deepEqual(
		[got.filter((name) => name.startsWith("HERDR_") || WRAPPER_READS.includes(name)), got.includes("LIMEN_JOB")],
		[[], true],
		got.join(", "),
	);
});

// A-004 (T1): git reads Limen's empty credential.helper after every configuration file, the repository's own too.
test("A-004: a job's git credential fill gets no password from a URL-scoped helper in the repository's own .git/config, and fails without asking", (context) => {
	const key = "credential.https://github.com.helper";
	git(p.root, "config", key, "!f() { echo username=agents; echo password=dummy-not-a-secret; }; f");
	context.after(() => git(p.root, "config", "--unset", key));
	const id = spawnJob(p, "credential");
	assert.equal(waitJob(p, id), "done");
	const fill = json(join(jobDir(p, id), "fake-credential.json"));
	assert.deepEqual(
		[
			fill.status === 0,
			fill.signal,
			fill.stdout.includes("password="),
			fill.stderr.includes("terminal prompts disabled"),
		],
		[false, null, false, true],
		fill.stderr,
	);
});

// A-004 (T1): git asks an askpass program before it reads GIT_TERMINAL_PROMPT, and a configuration file can name one;
// Limen's empty GIT_ASKPASS is set, so git skips core.askPass and SSH_ASKPASS.
test("A-004: a job's git credential fill gets no password from a core.askPass program in the repository's own .git/config, which never runs", async (context) => {
	const ran = join(p.parent, "askpass-ran");
	const program = join(p.parent, "askpass");
	await writeFile(program, `#!/bin/sh\n: > ${JSON.stringify(ran)}\necho dummy-not-a-secret\n`, { mode: 0o755 });
	git(p.root, "config", "core.askPass", program);
	context.after(() => git(p.root, "config", "--unset", "core.askPass"));
	const id = spawnJob(p, "credential");
	assert.equal(waitJob(p, id), "done");
	const fill = json(join(jobDir(p, id), "fake-credential.json"));
	assert.deepEqual([fill.stdout.includes("password="), existsSync(ran)], [false, false], fill.stderr);
});

test("a detached spawn says to end the turn, then ends with the golden final line, whose ids.job names its job folder", () => {
	const before = new Set(readdirSync(join(p.root, ".limen/jobs")));
	const run = limen(p, ["spawn", ...routed([]), "say golden"]);
	assert.equal(run.status, 0, run.stderr);
	const made = readdirSync(join(p.root, ".limen/jobs")).filter((name) => !before.has(name));
	assert.equal(made.length, 1, made.join(", "));
	assert.equal(readOutcome(run).ids?.job, made[0]);
	// The raw lines, not a re-serialised object, so the key order counts; the sentence is text before the line (D-046).
	const golden = `{"class":"ok","code":null,"next":null,"ids":{"job":"${made[0]}"}}`;
	const lines = run.stdout.trimEnd().split("\n").slice(-2);
	assert.deepEqual(lines, ["End your turn; Limen wakes you when the job ends.", golden]);
	assert.equal(waitJob(p, made[0] ?? ""), "done");
});

// D-061 (3): the wrapper prints a command's text at its end, so spawn no longer prints the id before the worktree
// exists; the text names the job once, after its start line, and the final line carries it in ids.job.
test("a spawn prints no early id line: its id is one line of text, after the start line and before the sentence", () => {
	const run = limen(p, ["spawn", ...routed([]), "say once"]);
	assert.equal(run.status, 0, run.stderr);
	const id = startedJob(run);
	const lines = run.stdout.trimEnd().split("\n");
	assert.deepEqual(
		[lines.filter((line) => line === id).length, lines.at(-4), lines.at(-3)],
		[1, "started say once", id],
	);
	assert.equal(waitJob(p, id), "done");
});

test("a workspace job works in one child repository", async () => {
	const workspace = join(p.parent, "workspace");
	await Promise.all(["api", "web"].map((name) => repository(join(workspace, name))));
	assert.equal(limen(p, ["workspace", "init"], { cwd: workspace }).status, 0);
	const id = spawnJob(p, "commit", ["--repo", "api", "--engine", "pi"], { cwd: workspace });
	assert.equal(waitJob(p, id, { cwd: workspace }), "done");
	assert.equal(jobRecord(p, id, { cwd: workspace })?.repo, "api");
	assert.match(limen(p, ["show", id], { cwd: workspace }).stdout, /\n {2}spawned-by user \S+, parent .+ \(pid \d+\)\n/);
	assert.equal(git(join(workspace, "api"), "rev-list", "--count", `main..limen/${id}`), "1");
	assert.equal(git(join(workspace, "web"), "branch", "--list", `limen/${id}`), "");
});
