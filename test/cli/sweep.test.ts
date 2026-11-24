// `limen seat sweep` (src/runtime/sweeping.ts): a run over every registered project reaps dead jobs, ends the scopes
// finished jobs left, counts and escalates a job it cannot end, removes dead start-queue entries, rings for unheard
// ends and names a project that fails; its refusals; the install, removal and status of its user timer against the
// tests' systemd; and the old name `limen sweep`.
import assert from "node:assert/strict";
import { chmodSync, existsSync, mkdirSync, readdirSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { appendFile, mkdir, writeFile } from "node:fs/promises";
import { userInfo } from "node:os";
import { join } from "node:path";
import { type TestContext, test } from "node:test";
import { fileURLToPath } from "node:url";
import { type Identity, type JobRecord, readRecordSync, type Scope } from "../../src/job/record.ts";
import { platform } from "../../src/platform/platform.ts";
import { renderUnit, sweepUnits } from "../../src/platform/systemd-units.ts";
import { jobScope } from "../../src/runtime/launcher.ts";
import { withEnvironment } from "../environment.ts";
import { outputText, readOutcome } from "../final-line.ts";
import {
	failingSystemctl,
	fakeCgroup,
	fakeManager,
	jobDir,
	jobRecord,
	limen,
	type Plant,
	plant,
	type RunOptions,
	scopeCalls,
	scopeProcess,
	spawnJob,
	waitJob,
	writeRecord,
} from "../plant.ts";
import { snapshot } from "../snapshot.ts";

/** The package root of the CLI the tests run, whose `bin/limen` the sweep's service runs. */
const PACKAGE_ROOT = fileURLToPath(new URL("../..", import.meta.url)).replace(/\/$/, "");
/** A wrapper that is gone: a pid no process holds, under this boot, as a wrapper killed alone leaves it. */
const DEAD: Identity = { pid: 2_147_483_646, born: "1", bootId: platform.bootId() ?? null };
/** The seat's folder of a plant, beside its root (LIMEN_HOME), which the snapshot of a refusal digests too. */
const SEAT = ["../.limen"] as const;

/** A fresh plant, removed after the test. */
async function fresh(t: TestContext): Promise<Plant> {
	const p = await plant();
	t.after(() => p.cleanup());
	return p;
}

/** `limen seat sweep` in the plant, its dead-job confirmation shortened to 1 ms, with `options`. */
function sweep(p: Plant, args: readonly string[] = [], options: RunOptions = {}) {
	return limen(p, ["seat", "sweep", ...args], { ...options, env: { LIMEN_REAP_CONFIRM_MS: "1", ...options.env } });
}

/** A running job of `jobs` whose wrapper is dead, with `fields`. */
async function deadJob(jobs: string, id: string, fields: Partial<JobRecord> = {}): Promise<string> {
	const dir = join(jobs, id);
	await writeRecord(dir, {
		state: "running",
		label: id,
		identity: DEAD,
		startedAt: new Date().toISOString(),
		...fields,
	});
	return dir;
}

/** A second project of the plant's seat, beside the plant's own: its folder with `.limen/jobs/`, registered. */
async function secondProject(p: Plant, name = "second"): Promise<string> {
	const root = join(p.parent, name);
	await mkdir(join(root, ".limen", "jobs"), { recursive: true });
	await appendFile(join(p.parent, ".limen", "projects"), `${root}\n`);
	return root;
}

/** The scope of job `id` as its wrapper records it, with its folder below the plant's cgroup folder. */
function scopeOf(p: Plant, id: string): Scope {
	const unit = jobScope(id);
	mkdirSync(join(p.env.LIMEN_CGROUP_ROOT ?? "", fakeCgroup(unit)), { recursive: true });
	return { unit, cgroup: fakeCgroup(unit), memoryPeakBytes: null, cpuMicroseconds: null, oomKills: null };
}

/** The messages of the Limen lines of the job's log that start with `start`, without their time. */
function logged(job: string, start: string): string[] {
	const path = join(job, "log");
	const lines = existsSync(path) ? readFileSync(path, "utf8").split("\n") : [];
	return lines.flatMap((line) => /^\[limen \S+\] (.*)$/.exec(line)?.slice(1) ?? []).filter((m) => m.startsWith(start));
}

// A-024, A-005: the seat's one reaper, over every registered project.
test("limen seat sweep: reaps a dead running job of each of two registered projects and says how many it swept", async (t) => {
	const p = await fresh(t);
	const other = await secondProject(p);
	const own = await deadJob(join(p.root, ".limen", "jobs"), "2026-11-24-own-1a2b3c4d");
	const theirs = await deadJob(join(other, ".limen", "jobs"), "2026-11-24-theirs-5e6f7a8b");
	const run = sweep(p);
	assert.equal(run.status, 0, run.stderr);
	const kinds = [own, theirs].map((dir) => {
		const record = readRecordSync(dir);
		return [record?.state, record?.failure?.kind];
	});
	assert.deepEqual(
		[kinds, outputText(run).trim().split("\n").at(-1)],
		[
			[
				["failed", "reaped"],
				["failed", "reaped"],
			],
			"swept 2 projects",
		],
	);
});

// R-027 Out of scope, R-032 (a) 2: a finished job whose scope end failed keeps its processes until the sweep ends them.
test("the sweep ends the live scope a finished job left, by TERM, and the job stays as it ended", async (t) => {
	const p = await fresh(t);
	const id = "2026-11-24-left-1a2b3c4d";
	const scope = scopeOf(p, id);
	const job = jobDir(p, id);
	const at = new Date().toISOString();
	await writeRecord(job, { state: "done", identity: DEAD, scope, startedAt: at, finishedAt: at });
	withEnvironment(t, { LIMEN_CGROUP_ROOT: p.env.LIMEN_CGROUP_ROOT ?? "" });
	const engine = await scopeProcess(t, scope.cgroup);
	const run = sweep(p);
	assert.equal(run.status, 0, run.stderr);
	assert.deepEqual(
		{
			engine: await engine.end(),
			state: jobRecord(p, id)?.state,
			stuck: jobRecord(p, id)?.stuck,
			log: logged(job, "reap: "),
		},
		{
			engine: "SIGTERM",
			state: "done",
			stuck: undefined,
			log: [`reap: the done job's scope ${scope.unit} ended after TERM`],
		},
	);
});

/** A running job whose wrapper is dead and whose scope the user manager cannot read, with systemctl failing for it. */
async function unreadableJob(p: Plant, id: string): Promise<{ readonly job: string; readonly path: string }> {
	const job = await deadJob(join(p.root, ".limen", "jobs"), id, { scope: scopeOf(p, id) });
	return { job, path: `${await failingSystemctl(p.parent)}:${p.env.PATH}` };
}

// R-032 (b), T-02: a timer rings only after several runs in a row, so the record counts the attempts from the first.
test("a job whose scope the sweep cannot end gets stuck at each attempt, one more each run, since the first, and stays running", async (t) => {
	const p = await fresh(t);
	const { job, path } = await unreadableJob(p, "2026-11-24-stuck-1a2b3c4d");
	const seen = [1, 2, 3].map(() => {
		const run = sweep(p, [], { env: { PATH: path } });
		assert.equal(run.status, 0, run.stderr);
		const record = readRecordSync(job);
		return { state: record?.state, attempts: record?.stuck?.attempts, since: record?.stuck?.since };
	});
	const detail = `${jobScope("2026-11-24-stuck-1a2b3c4d")} not ended: Failed to connect to bus: No medium found`;
	assert.deepEqual(
		{
			seen: seen.map(({ state, attempts }) => [state, attempts]),
			since: new Set(seen.map(({ since }) => since)).size,
			detail: jobRecord(p, "2026-11-24-stuck-1a2b3c4d")?.stuck?.detail,
		},
		{
			seen: [
				["running", 1],
				["running", 2],
				["running", 3],
			],
			since: 1,
			detail,
		},
	);
});

test("a run that ends a job the sweep could not end before removes its stuck", async (t) => {
	const p = await fresh(t);
	const id = "2026-11-24-later-1a2b3c4d";
	const { job, path } = await unreadableJob(p, id);
	assert.equal(sweep(p, [], { env: { PATH: path } }).status, 0);
	assert.equal(jobRecord(p, id)?.stuck?.attempts, 1, "the first run failed to end it");
	const run = sweep(p);
	assert.equal(run.status, 0, run.stderr);
	assert.deepEqual([jobRecord(p, id)?.state, jobRecord(p, id)?.stuck, existsSync(job)], ["failed", undefined, true]);
});

// D-092 note (R-027 finding A): a reaper inside the reaped job's scope gets its own TERM before any write.
test("SWEEP_IN_JOB: limen seat sweep in a job's scope exits 1 before any write and signals no scope", async (t) => {
	const p = await fresh(t);
	const id = "2026-11-24-dead-1a2b3c4d";
	await deadJob(join(p.root, ".limen", "jobs"), id, { scope: scopeOf(p, id) });
	const inside = fakeCgroup(jobScope("2026-11-24-runner-5e6f7a8b"));
	const before = snapshot(p.root, SEAT);
	const run = sweep(p, [], { env: { LIMEN_CGROUP: inside } });
	assert.deepEqual(
		[run.status, readOutcome(run), scopeCalls(p, "systemctl"), jobRecord(p, id)?.state],
		[1, { class: "refused", code: "SWEEP_IN_JOB", next: null }, [], "running"],
		run.stderr,
	);
	assert.deepEqual(snapshot(p.root, SEAT), before);
});

test("SWEEP_FLAGS: limen seat sweep with --install and --status exits 2 and changes nothing", async (t) => {
	const p = await fresh(t);
	await deadJob(join(p.root, ".limen", "jobs"), "2026-11-24-dead-1a2b3c4d");
	const before = snapshot(p.root, SEAT);
	const run = sweep(p, ["--install", "--status"]);
	assert.deepEqual(
		[run.status, readOutcome(run)],
		[2, { class: "usage", code: "SWEEP_FLAGS", next: "limen seat sweep --help" }],
		run.stderr,
	);
	assert.deepEqual(snapshot(p.root, SEAT), before);
});

// T-04, R-032 (d): `limen seat queue` leaves a dead entry in place, and the sweep removes it; that it does so once per
// run is the test with no registered project below.
test("the sweep removes a dead entry of the start queue and says how many it removed", async (t) => {
	const p = await fresh(t);
	await secondProject(p);
	const entries = join(p.parent, ".limen", "start-queue", "entries");
	await mkdir(entries, { recursive: true });
	const entry = { id: "2026-11-24-gone-1a2b3c4d", jobDir: join(p.root, ".limen", "jobs", "gone") };
	await writeFile(
		join(entries, `${entry.id}.json`),
		JSON.stringify({ ...entry, label: "gone", priority: 2, queuedAt: 1, pid: DEAD.pid }),
	);
	const run = sweep(p);
	assert.equal(run.status, 0, run.stderr);
	assert.deepEqual(
		[
			readdirSync(entries),
			outputText(run)
				.split("\n")
				.filter((line) => line.startsWith("removed ")),
		],
		[[], ["removed 1 dead entry of the start queue"]],
	);
});

// z. 10, T-02: one project's failure is reported once the others are done, with its class.
test("a project whose job folder an older Limen wrote is named with that folder, the run exits with its class, and the other project's dead job is still reaped", async (t) => {
	const p = await fresh(t);
	const older = await secondProject(p, "older");
	await mkdir(join(older, ".limen", "jobs", "2026-11-10-old-1a2b"), { recursive: true });
	await writeFile(join(older, ".limen", "jobs", "2026-11-10-old-1a2b", "state"), "running\n");
	const own = await deadJob(join(p.root, ".limen", "jobs"), "2026-11-24-own-1a2b3c4d");
	const run = sweep(p);
	const message = outputText(run);
	assert.deepEqual(
		[run.status, readOutcome(run), jobRecord(p, "2026-11-24-own-1a2b3c4d")?.state, existsSync(own)],
		[4, { class: "environment", code: "NOT_MIGRATED", next: "limen seat sweep" }, "failed", true],
		run.stderr,
	);
	assert.match(
		message,
		new RegExp(
			`^the sweep did not finish one step:\\n${older}/.limen/jobs/2026-11-10-old-1a2b: .+ holds job records of an older Limen .+\\(NOT_MIGRATED\\)$`,
			"m",
		),
	);
});

// A-016 (3), D-097 (5) (a), (d), (e): the resume after the subscription limit is a step of the minute run, due 5
// minutes after the reset, on the parent's recorded route; on the next run the continuation holds the worktree, so
// nothing is due.
test("limen seat sweep: resumes a due quota job of a registered project once, on its recorded route, as attempt 1", async (t) => {
	const p = await fresh(t);
	const reset = Date.now() - 10 * 60_000;
	const parent = spawnJob(p, `rate-limit five_hour ${reset}\nerror You've hit your session limit · resets 3pm (UTC)`);
	assert.equal(waitJob(p, parent), "failed");
	const first = sweep(p);
	assert.equal(first.status, 0, first.stderr);
	const jobs = join(p.root, ".limen", "jobs");
	const children = () => readdirSync(jobs).filter((id) => jobRecord(p, id)?.parent === parent);
	const [child = ""] = children();
	assert.equal(waitJob(p, child), "done");
	const second = sweep(p);
	assert.equal(second.status, 0, second.stderr);
	assert.deepEqual(
		{
			reset: jobRecord(p, parent)?.failure?.resetAt,
			children: children(),
			route: jobRecord(p, child)?.route,
			quotaAttempt: jobRecord(p, child)?.quotaAttempt,
			said: outputText(first).includes(`resumed ${parent} after the subscription limit as ${child}, resume 1 of 3\n`),
			again: outputText(second).includes("resumed"),
		},
		{
			reset: new Date(reset).toISOString(),
			children: [child],
			route: jobRecord(p, parent)?.route,
			quotaAttempt: 1,
			said: true,
			again: false,
		},
	);
});

// z. 10, T-01 (review round 1, note 8): one record that does not read stops neither its project's other jobs nor steps.
test("a damaged record is named with its reason, the run exits with its class, and the dead job beside it is reaped", async (t) => {
	const p = await fresh(t);
	const damaged = jobDir(p, "2026-11-24-damaged-5e6f7a8b");
	await mkdir(damaged, { recursive: true });
	await writeFile(join(damaged, "record.json"), "{ not json\n");
	await deadJob(join(p.root, ".limen", "jobs"), "2026-11-24-own-1a2b3c4d");
	const run = sweep(p);
	assert.deepEqual(
		[run.status, readOutcome(run), jobRecord(p, "2026-11-24-own-1a2b3c4d")?.state],
		[4, { class: "environment", code: "BAD_DATA", next: "limen seat sweep" }, "failed"],
		run.stderr,
	);
	assert.match(
		outputText(run),
		new RegExp(`^the sweep did not finish one step:\\n${damaged}: .+record\\.json.+\\(BAD_DATA\\)$`, "m"),
	);
});

// R-032 review round 1, note 6: a missing user manager must not read as one that lists no leftover scope.
test("NO_USER_MANAGER: a run whose account's user manager has no cgroup folder names it, exits 4, still reaps, and keeps a finished job's stuck", async (t) => {
	const p = await fresh(t);
	const id = "2026-11-24-kept-1a2b3c4d";
	const stuck = { since: "2026-11-24T10:00:00.000Z", attempts: 2, detail: "limen-job-x.scope not ended: timed out" };
	await writeRecord(jobDir(p, id), { state: "done", identity: DEAD, scope: scopeOf(p, id), stuck });
	await deadJob(join(p.root, ".limen", "jobs"), "2026-11-24-own-1a2b3c4d");
	rmSync(join(p.env.LIMEN_CGROUP_ROOT ?? "", fakeManager()), { recursive: true });
	const run = sweep(p);
	assert.deepEqual(
		[run.status, readOutcome(run), jobRecord(p, id)?.stuck, jobRecord(p, "2026-11-24-own-1a2b3c4d")?.state],
		[4, { class: "environment", code: "NO_USER_MANAGER", next: "limen seat sweep" }, stuck, "failed"],
		run.stderr,
	);
});

/** The lines `limen status` lists under `Jobs the sweep cannot end`. */
function escalated(p: Plant): string[] {
	const lines = limen(p, ["status"]).stdout.split("\n");
	const at = lines.findIndex((line) => line.startsWith("Jobs the sweep cannot end"));
	if (at < 0) {
		return [];
	}
	const end = lines.findIndex((line, index) => index > at && !line.startsWith("  "));
	return lines.slice(at + 1, end < 0 ? undefined : end);
}

/** Three runs of the sweep with `env`: after each, the job's attempts in `stuck`, and whether `limen status` lists it
 * then. */
function threeRuns(p: Plant, id: string, env: Readonly<Record<string, string>> = {}): [number | undefined, boolean][] {
	return [1, 2, 3].map(() => {
		const run = sweep(p, [], { env });
		assert.equal(run.status, 0, run.stderr);
		return [jobRecord(p, id)?.stuck?.attempts, escalated(p).some((line) => line.startsWith(`  ${id}: `))];
	});
}

// R-032 (b), review round 1, note 5: a finished job's leftover scope that will not end is counted and escalated too.
test("a finished job whose leftover scope the sweep cannot end gets stuck one more each run, and limen status lists it from the third", async (t) => {
	const p = await fresh(t);
	const id = "2026-11-24-leftover-1a2b3c4d";
	const at = new Date().toISOString();
	await writeRecord(jobDir(p, id), {
		state: "done",
		identity: DEAD,
		scope: scopeOf(p, id),
		startedAt: at,
		finishedAt: at,
	});
	const path = `${await failingSystemctl(p.parent)}:${p.env.PATH}`;
	assert.deepEqual(threeRuns(p, id, { PATH: path }), [
		[1, false],
		[2, false],
		[3, true],
	]);
	assert.equal(jobRecord(p, id)?.state, "done");
});

// R-027 Night default 2, Q-44: a pid with no start time held by a live process may be the wrapper or a stranger.
test("a running job with no scope whose pid has no start time while a live process holds it gets stuck each run, and limen status lists it from the third", async (t) => {
	const p = await fresh(t);
	const id = "2026-11-24-unknown-1a2b3c4d";
	await deadJob(join(p.root, ".limen", "jobs"), id, { identity: { ...DEAD, pid: process.pid, born: null } });
	assert.deepEqual(threeRuns(p, id), [
		[1, false],
		[2, false],
		[3, true],
	]);
	assert.equal(jobRecord(p, id)?.state, "running");
});

// R-032 (a) 4, review round 1, note 5: the start queue is the seat's, so its dead entries go once per run, not per
// project.
test("the sweep removes a dead start-queue entry once per run, also when no project is registered", async (t) => {
	const p = await fresh(t);
	await writeFile(join(p.parent, ".limen", "projects"), "");
	const entries = join(p.parent, ".limen", "start-queue", "entries");
	await mkdir(entries, { recursive: true });
	const entry = { id: "2026-11-24-gone-1a2b3c4d", jobDir: join(p.root, ".limen", "jobs", "gone") };
	await writeFile(
		join(entries, `${entry.id}.json`),
		JSON.stringify({ ...entry, label: "gone", priority: 2, queuedAt: 1, pid: DEAD.pid }),
	);
	const run = sweep(p);
	assert.equal(run.status, 0, run.stderr);
	assert.deepEqual(
		[readdirSync(entries), outputText(run).trim().split("\n")],
		[[], ["removed 1 dead entry of the start queue", "swept 0 projects"]],
	);
});

// T-01, review round 2, note 13: the sweep read an unreadable start-queue folder as an empty queue and said nothing.
test("a start-queue folder the sweep cannot list fails the run with its reason, and the dead job is still reaped", async (t) => {
	if (process.getuid?.() === 0) {
		t.skip("root lists a folder whatever its mode");
		return;
	}
	const p = await fresh(t);
	const entries = join(p.parent, ".limen", "start-queue", "entries");
	await mkdir(entries, { recursive: true });
	await deadJob(join(p.root, ".limen", "jobs"), "2026-11-24-own-1a2b3c4d");
	// The mode goes back before the plant's cleanup, which an after hook of the test would follow.
	chmodSync(entries, 0o000);
	let run: ReturnType<typeof sweep>;
	try {
		run = sweep(p);
	} finally {
		chmodSync(entries, 0o755);
	}
	assert.deepEqual(
		[run.status, readOutcome(run), jobRecord(p, "2026-11-24-own-1a2b3c4d")?.state],
		[4, { class: "environment", code: "STEP_FAILED", next: "limen seat sweep" }, "failed"],
		run.stderr,
	);
	assert.match(outputText(run), /^the start queue: EACCES: permission denied, scandir .+entries.+\(STEP_FAILED\)$/m);
});

// A temp of src/atomic-write.ts sits beside its target until the link; a leftover one, after a crash, stays.
test("the sweep rings for a finished job whose delivered folder holds only the temp of a delivery write", async (t) => {
	const p = await fresh(t);
	const job = join(p.root, ".limen/jobs/2026-11-20-sweep-1a2b3c4d");
	mkdirSync(join(job, "notify", "delivered"), { recursive: true });
	writeFileSync(join(job, "notify", "delivered", "session-a.4242.9f3c.tmp"), "");
	// The sweep rings for an event at least five minutes old; the record's finish time is the event's.
	await writeRecord(job, { state: "done", finishedAt: new Date(Date.now() - 10 * 60_000).toISOString() });
	const run = sweep(p);
	assert.equal(run.status, 0, run.stderr);
	// The sweep claims a seat event by its marker before it rings; a sweep that rings for nothing writes none.
	const seat = join(job, "notify", "seat");
	const markers = existsSync(seat) ? readdirSync(seat) : [];
	assert.deepEqual(
		markers.map((name) => name.replace(/\d+$/, "<since>")),
		["_terminal.done.<since>"],
	);
});

/** The user unit folder of the plant's account: `~/.config/systemd/user` under the plant's HOME. */
const unitFolder = (p: Plant) => join(p.parent, "home", ".config", "systemd", "user");

/** How the tests' user manager answers: its verification's exit code, whether the service failed. */
type ManagerAnswers = { readonly verify?: number; readonly failed?: boolean };

/**
 * The tests' user manager for the sweep's units, first on the plant's PATH: a systemctl that takes `--user
 * daemon-reload`, `enable --now` and `disable --now` of a timer, keeping the enabled timer in a file, answers `--user
 * is-active` of that timer and `--user is-failed` of the service from it, and passes every other call to the plant's
 * own; and a systemd-analyze whose `--user verify` exits `verify`. Both log their words to `calls`. As systemd does,
 * its `disable` fails for a timer with no unit file; its reload fails once after `failNextReload`.
 */
function userManager(
	p: Plant,
	{ verify = 0, failed = false }: ManagerAnswers = {},
): { readonly env: Readonly<Record<string, string>>; readonly calls: () => string[]; failNextReload(): void } {
	const folder = join(p.parent, `user-manager-${verify}-${failed}`);
	mkdirSync(folder, { recursive: true });
	const log = join(folder, "calls");
	const enabled = join(folder, "enabled");
	const failReload = join(folder, "fail-reload");
	const timerFile = join(unitFolder(p), "limen-sweep.timer");
	const systemctl = [
		"#!/bin/sh",
		'case "$*" in',
		`"--user daemon-reload") echo "systemctl $*" >> ${log}; [ -e ${failReload} ] && { rm -f ${failReload}; echo "Failed to reload daemon: Connection timed out" >&2; exit 1; }; exit 0 ;;`,
		`"--user enable --now limen-sweep.timer") echo "systemctl $*" >> ${log}; touch ${enabled}; exit 0 ;;`,
		`"--user disable --now limen-sweep.timer") echo "systemctl $*" >> ${log}; [ -e ${timerFile} ] || { echo "Failed to disable unit: Unit file limen-sweep.timer does not exist." >&2; exit 1; }; rm -f ${enabled}; exit 0 ;;`,
		`"--user is-active limen-sweep.timer") [ -e ${enabled} ] && { echo active; exit 0; }; echo inactive; exit 3 ;;`,
		`"--user is-failed limen-sweep.service") ${failed ? "echo failed; exit 0" : "echo inactive; exit 1"} ;;`,
		"esac",
		`exec ${join(p.bin, "systemctl")} "$@"`,
	];
	writeFileSync(join(folder, "systemctl"), `${systemctl.join("\n")}\n`, { mode: 0o755 });
	const analyze = [
		"#!/bin/sh",
		`echo "systemd-analyze $*" >> ${log}`,
		...(verify ? ['echo "bad unit" >&2'] : []),
		`exit ${verify}`,
	];
	writeFileSync(join(folder, "systemd-analyze"), `${analyze.join("\n")}\n`, { mode: 0o755 });
	const lingering = join(folder, "linger");
	mkdirSync(lingering, { recursive: true });
	writeFileSync(join(lingering, userInfo().username), "");
	const calls = () => (existsSync(log) ? readFileSync(log, "utf8").trim().split("\n") : []);
	const failNextReload = () => writeFileSync(failReload, "");
	return { env: { PATH: `${folder}:${p.env.PATH}`, LIMEN_LINGER_DIR: lingering }, calls, failNextReload };
}

/** The text of each sweep unit in the plant's user unit folder, undefined for one that is not there. */
function installed(p: Plant): (string | undefined)[] {
	return ["limen-sweep.service", "limen-sweep.timer"].map((name) => {
		const path = join(unitFolder(p), name);
		return existsSync(path) ? readFileSync(path, "utf8") : undefined;
	});
}

// A-024, A-017, D-056 (4): user units, no root; the verification comes before the manager loads them.
test("--install writes both units, verifies them, reloads the user manager and enables the timer", async (t) => {
	const p = await fresh(t);
	const manager = userManager(p);
	const run = sweep(p, ["--install"], { env: manager.env });
	assert.equal(run.status, 0, run.stderr);
	const [service, timer] = [join(unitFolder(p), "limen-sweep.service"), join(unitFolder(p), "limen-sweep.timer")];
	assert.deepEqual(
		{ installed: installed(p), calls: manager.calls() },
		{
			installed: sweepUnits(PACKAGE_ROOT, manager.env.PATH ?? "").map((unit) => renderUnit(unit)),
			calls: [
				`systemd-analyze --user verify ${service} ${timer}`,
				"systemctl --user daemon-reload",
				"systemctl --user enable --now limen-sweep.timer",
			],
		},
	);
});

// A-024: the install is idempotent; it reloads and enables again, which a run that failed there left undone.
test("--install run again writes and verifies nothing, and reloads the user manager and enables the timer as before", async (t) => {
	const p = await fresh(t);
	const manager = userManager(p);
	assert.equal(sweep(p, ["--install"], { env: manager.env }).status, 0);
	const before = { units: installed(p), calls: manager.calls().length };
	const again = sweep(p, ["--install"], { env: manager.env });
	assert.equal(again.status, 0, again.stderr);
	assert.deepEqual(
		{ units: installed(p), calls: manager.calls().slice(before.calls) },
		{
			units: before.units,
			calls: ["systemctl --user daemon-reload", "systemctl --user enable --now limen-sweep.timer"],
		},
	);
	assert.match(outputText(again), /^limen-sweep.service and limen-sweep.timer unchanged in .+; reloaded$/m);
});

// R-034 (g), R-034 Decision 2: a resumed job's start needs pi, node and herdr, which lie where the installing shell
// finds them; an install from another PATH rewrites the service, and the timer stays as it was.
test("--install writes the PATH it runs with into the service, and an install from another PATH rewrites only the service", async (t) => {
	const p = await fresh(t);
	const manager = userManager(p);
	const path = manager.env.PATH ?? "";
	assert.equal(sweep(p, ["--install"], { env: manager.env }).status, 0);
	const [service, timer] = installed(p);
	const other = `${join(p.parent, "tools")}:${path}`;
	const again = sweep(p, ["--install"], { env: { ...manager.env, PATH: other } });
	assert.equal(again.status, 0, again.stderr);
	const [rewritten, kept] = installed(p);
	assert.deepEqual(
		{
			first: service?.split("\n").filter((line) => line.startsWith("Environment=")),
			rewritten: rewritten?.split("\n").filter((line) => line.startsWith("Environment=")),
			timer: kept === timer,
			said: /^limen-sweep.service and limen-sweep.timer written in .+ and verified; reloaded$/m.test(outputText(again)),
		},
		{ first: [`Environment="PATH=${path}"`], rewritten: [`Environment="PATH=${other}"`], timer: true, said: true },
	);
});

test("NO_PATH: --install from a process with no PATH exits 4, names the install, and writes no unit", async (t) => {
	const p = await fresh(t);
	const manager = userManager(p);
	// The plant's own node runs the CLI, so the process needs no PATH to start; an empty one is no PATH.
	const run = sweep(p, ["--install"], { env: { ...manager.env, PATH: "" } });
	assert.deepEqual(
		[run.status, readOutcome(run), installed(p), manager.calls()],
		[4, { class: "environment", code: "NO_PATH", next: "limen seat sweep --install" }, [undefined, undefined], []],
		run.stderr,
	);
});

test("NO_LINGER: --install on an account that does not linger exits 4, names loginctl enable-linger and writes no unit", async (t) => {
	const p = await fresh(t);
	const manager = userManager(p);
	const run = sweep(p, ["--install"], { env: { ...manager.env, LIMEN_LINGER_DIR: join(p.parent, "no-linger") } });
	assert.deepEqual(
		[run.status, readOutcome(run), installed(p), manager.calls()],
		[4, { class: "environment", code: "NO_LINGER", next: "limen seat sweep --install" }, [undefined, undefined], []],
		run.stderr,
	);
	assert.ok(outputText(run).includes(`as root, run loginctl enable-linger ${userInfo().username}`), run.stderr);
});

test("--install whose verification fails puts the earlier units back, exits 4 naming the verification, and enables nothing", async (t) => {
	const p = await fresh(t);
	mkdirSync(unitFolder(p), { recursive: true });
	writeFileSync(join(unitFolder(p), "limen-sweep.service"), "# an earlier unit\n");
	const manager = userManager(p, { verify: 1 });
	const run = sweep(p, ["--install"], { env: manager.env });
	assert.deepEqual(
		[run.status, readOutcome(run).code, installed(p), manager.calls().filter((call) => call.startsWith("systemctl"))],
		[4, "UNITS_INVALID", ["# an earlier unit\n", undefined], []],
		run.stderr,
	);
	assert.match(
		outputText(run),
		/systemd-analyze --user verify failed for limen-sweep.service and limen-sweep.timer: bad unit; the units are back as they were/,
	);
});

test("--uninstall disables the timer at once, removes both units and reloads the user manager", async (t) => {
	const p = await fresh(t);
	const manager = userManager(p);
	assert.equal(sweep(p, ["--install"], { env: manager.env }).status, 0);
	const after = manager.calls().length;
	const run = sweep(p, ["--uninstall"], { env: manager.env });
	assert.equal(run.status, 0, run.stderr);
	assert.deepEqual(
		[installed(p), manager.calls().slice(after)],
		[
			[undefined, undefined],
			["systemctl --user disable --now limen-sweep.timer", "systemctl --user daemon-reload"],
		],
	);
});

// T-38 (3), review round 2, note 11: a second removal found no file and returned before the reload the first one
// missed.
test("--uninstall run again after one whose reload failed disables the timer and reloads the user manager, with no unit left", async (t) => {
	const p = await fresh(t);
	const manager = userManager(p);
	assert.equal(sweep(p, ["--install"], { env: manager.env }).status, 0);
	manager.failNextReload();
	const after = manager.calls().length;
	const first = sweep(p, ["--uninstall"], { env: manager.env });
	const between = manager.calls().length;
	const second = sweep(p, ["--uninstall"], { env: manager.env });
	assert.deepEqual(
		[first.status, readOutcome(first).code, installed(p), second.status, manager.calls().slice(between)],
		[
			4,
			"USER_MANAGER_FAILED",
			[undefined, undefined],
			0,
			["systemctl --user disable --now limen-sweep.timer", "systemctl --user daemon-reload"],
		],
		`${first.stderr}${second.stderr}`,
	);
	assert.equal(manager.calls().slice(after, between).at(-1), "systemctl --user daemon-reload");
});

// R-032 (f): --status prints what `limen status` prints of the sweep.
test("--status says limen-sweep.timer is active once the timer runs, and before that names the install, as limen status does", async (t) => {
	const p = await fresh(t);
	const manager = userManager(p);
	const before = sweep(p, ["--status"], { env: manager.env });
	assert.equal(sweep(p, ["--install"], { env: manager.env }).status, 0);
	const active = sweep(p, ["--status"], { env: manager.env });
	assert.deepEqual(
		[before.status, outputText(before).trim().split("\n"), active.status, outputText(active).trim()],
		[
			0,
			[
				"Sweep not working (1); no dead job is finalized until each is fixed:",
				"  limen-sweep.timer is not active; on the agents' account, install the sweep:",
				"    limen seat sweep --install",
			],
			0,
			"limen-sweep.timer is active",
		],
	);
});

// T-18: the seat's commands are a group, and an old name names its new form (the `queue` pattern).
test("REMOVED: limen sweep exits 2, says it was renamed and names limen seat sweep", async (t) => {
	const p = await fresh(t);
	await deadJob(join(p.root, ".limen", "jobs"), "2026-11-24-dead-1a2b3c4d");
	const before = snapshot(p.root, SEAT);
	const run = limen(p, ["sweep", "--install"]);
	assert.deepEqual(
		[run.status, readOutcome(run), outputText(run).split("\n")[0]],
		[
			2,
			{ class: "usage", code: "REMOVED", next: "limen seat sweep" },
			"limen sweep was renamed to limen seat sweep (R-032)",
		],
	);
	assert.deepEqual(snapshot(p.root, SEAT), before);
});
