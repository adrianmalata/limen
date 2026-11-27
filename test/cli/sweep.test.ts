// `limen seat sweep` (src/runtime/sweeping.ts): a run over every registered project reaps dead jobs, ends the scopes
// finished jobs left, counts and escalates a job it cannot end, removes dead start-queue entries, rings for unheard
// ends and advisories, per advisory source, names each project that fails, and once a day per project, after its minute
// steps, runs the daily steps, the retire among them; its refusals; the install, removal and status of its user timer
// against the tests' systemd; and the old name `limen sweep`.
import assert from "node:assert/strict";
import {
	chmodSync,
	existsSync,
	mkdirSync,
	readdirSync,
	readFileSync,
	realpathSync,
	rmSync,
	writeFileSync,
} from "node:fs";
import { appendFile, mkdir, writeFile } from "node:fs/promises";
import { userInfo } from "node:os";
import { basename, join } from "node:path";
import { type TestContext, test } from "node:test";
import { fileURLToPath } from "node:url";
import { type Identity, type JobRecord, readRecordSync, type Scope } from "../../src/job/record.ts";
import { withLock } from "../../src/lock.ts";
import { platform } from "../../src/platform/platform.ts";
import { renderUnit, sweepUnits } from "../../src/platform/systemd-units.ts";
import { jobScope } from "../../src/runtime/launcher.ts";
import { processIdentity } from "../../src/runtime/reap.ts";
import { withEnvironment } from "../environment.ts";
import { outputText, readOutcome } from "../final-line.ts";
import {
	editRecord,
	failingSystemctl,
	fakeCgroup,
	fakeManager,
	git,
	herdrFake,
	jobDir,
	jobRecord,
	limen,
	type Plant,
	plant,
	type RunOptions,
	recordTab,
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
const HOUR = 60 * 60_000;

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
// The reap that goes on beside it is the test of the project that fails, above (R-032 review round 3, note 7).
test("a start-queue folder the sweep cannot list fails the run with its reason", async (t) => {
	if (process.getuid?.() === 0) {
		t.skip("root lists a folder whatever its mode");
		return;
	}
	const p = await fresh(t);
	const entries = join(p.parent, ".limen", "start-queue", "entries");
	await mkdir(entries, { recursive: true });
	// The mode goes back before the plant's cleanup, which an after hook of the test would follow.
	chmodSync(entries, 0o000);
	let run: ReturnType<typeof sweep>;
	try {
		run = sweep(p);
	} finally {
		chmodSync(entries, 0o755);
	}
	assert.deepEqual(
		[run.status, readOutcome(run)],
		[4, { class: "environment", code: "STEP_FAILED", next: "limen seat sweep" }],
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

// The D-092 note: the seat notification of a running job's advisory waited while any advisory receipt of the job was
// delivered, so a stall note after a heard queue diagnosis rang nothing.
test("the sweep rings for a running job's stall advisory when a coordinator heard only its queue diagnosis", async (t) => {
	const p = await fresh(t);
	const job = join(p.root, ".limen/jobs/2026-11-24-sources-1a2b3c4d");
	mkdirSync(join(job, "notify", "delivered"), { recursive: true });
	writeFileSync(join(job, "notify", "delivered", "_advisory.queue.session-a"), "");
	// The sweep rings for an event at least five minutes old; the advisory's time is the event's. A record without a
	// source holds the wrapper's note, the stall's.
	const at = new Date(Date.now() - 10 * 60_000).toISOString();
	const advisory = { text: "tool stall observation uncertain: scope CPU unavailable: cpu.stat is missing", at };
	await writeRecord(job, { state: "running", identity: await processIdentity(), startedAt: at, advisory });
	const run = sweep(p);
	assert.equal(run.status, 0, run.stderr);
	const seat = join(job, "notify", "seat");
	const markers = existsSync(seat) ? readdirSync(seat) : [];
	assert.deepEqual(markers, [`_advisory.stall.${Date.parse(at)}`]);
});

/** The project's stamp of its last successful daily steps. */
const stampOf = (p: Plant) => join(p.root, ".limen", "daily-sweep");

/** Writes the project's stamp of its last successful daily steps `hoursAgo` hours ago. */
async function stampAgo(p: Plant, hoursAgo: number): Promise<string> {
	const at = new Date(Date.now() - hoursAgo * HOUR).toISOString();
	await writeFile(stampOf(p), `${at}\n`);
	return at;
}

/**
 * A folder of `.limen/jobs/` with no record and one file in it, which the daily prune moves into the job archive: the
 * mark that the daily steps ran.
 */
async function leftover(p: Plant): Promise<string> {
	const dir = jobDir(p, "2026-11-24-leftover-1a2b3c4d");
	await mkdir(dir, { recursive: true });
	await writeFile(join(dir, "log"), "a log with no record\n");
	return dir;
}

// D-097 (4) (a): the daily steps (prune, retire, the leftover Herdr tabs) run inside the minute run, once a day per
// project, from the project's stamp; before R-101 the sweep ran neither prune nor retire.
test("limen seat sweep: runs the daily steps of a project with no stamp, says so, and writes the stamp", async (t) => {
	const p = await fresh(t);
	const folder = await leftover(p);
	const run = sweep(p);
	assert.equal(run.status, 0, run.stderr);
	const age = Date.now() - Date.parse(existsSync(stampOf(p)) ? readFileSync(stampOf(p), "utf8") : "");
	assert.deepEqual(
		[existsSync(folder), outputText(run).includes(`ran the daily steps of ${p.root}\n`), age >= 0 && age < HOUR],
		[false, true, true],
	);
});

test("the daily steps run again once the project's stamp is more than 24 hours old", async (t) => {
	const p = await fresh(t);
	const folder = await leftover(p);
	const old = await stampAgo(p, 25);
	const run = sweep(p);
	assert.equal(run.status, 0, run.stderr);
	assert.deepEqual([existsSync(folder), readFileSync(stampOf(p), "utf8") > old], [false, true]);
});

test("the daily steps do not run while the project's stamp is less than 24 hours old", async (t) => {
	const p = await fresh(t);
	const folder = await leftover(p);
	const at = await stampAgo(p, 23);
	const run = sweep(p);
	assert.equal(run.status, 0, run.stderr);
	assert.deepEqual(
		[existsSync(folder), readFileSync(stampOf(p), "utf8"), outputText(run).includes("ran the daily steps")],
		[true, `${at}\n`, false],
	);
});

test("a second run within 24 hours does no daily step", async (t) => {
	const p = await fresh(t);
	assert.equal(sweep(p).status, 0);
	const folder = await leftover(p);
	const second = sweep(p);
	assert.equal(second.status, 0, second.stderr);
	assert.deepEqual([existsSync(folder), outputText(second).includes("ran the daily steps")], [true, false]);
});

// R-103 Decision 23 (d): on a hung Herdr the daily close of leftover tabs could pass the sweep unit's 300 s, and the
// cut run wrote no stamp, so every minute ran the daily steps again.
test("a daily close of leftover tabs that reaches its bound on a Herdr that hangs names what it left, and the run writes the stamp", async (t) => {
	const p = await fresh(t);
	await mkdir(join(p.root, "spec/features/done/2026-11/F009-old"), { recursive: true });
	const id = "2026-11-24-f009-old-1a2b3c4d";
	await writeRecord(jobDir(p, id), { state: "done", label: "F009 old" });
	await recordTab(jobDir(p, id), "log", "w1:t1");
	await recordTab(jobDir(p, id), "diff", "w1:t2");
	const herdr = await herdrFake(join(p.parent, "herdr-hung"), { tabs: {}, hang: true });
	const run = sweep(p, [], { env: { LIMEN_HERDR: herdr.binary, LIMEN_LEFTOVER_TABS_MS: "300" } });
	assert.equal(run.status, 0, run.stderr);
	assert.deepEqual(
		[
			outputText(run).includes(
				`the close of leftover Herdr tabs reached its bound of 0.3 s, so 1 tab waits for the next daily run: w1:t2 of job ${id}\n`,
			),
			outputText(run).includes(`ran the daily steps of ${p.root}\n`),
			existsSync(stampOf(p)),
		],
		[true, true, true],
		outputText(run),
	);
});

/** A done job of the plant with no branch and no worktree, whose `abandoned` marker is 25 hours old. */
async function retirable(p: Plant, id: string): Promise<string> {
	const at = new Date(Date.now() - 25 * HOUR).toISOString();
	const abandoned = { branch: `limen/abandon/${id}`, commit: "2".repeat(40), at };
	await writeRecord(jobDir(p, id), { state: "done", label: id, startedAt: at, finishedAt: at, abandoned });
	return at;
}

/**
 * The project's job archive, with write and search but no read, while `work` runs: retire then makes the month's
 * folder and cannot sync the archive's own (R-031, review round 2, G5). The mode goes back after it.
 */
async function unreadableArchive<T>(p: Plant, work: () => T): Promise<T> {
	const archive = join(p.root, ".limen", "archive");
	await mkdir(archive, { recursive: true });
	chmodSync(archive, 0o300);
	try {
		return work();
	} finally {
		chmodSync(archive, 0o700);
	}
}

// T-02: a step that fails leaves the stamp as it was, so the timer's next minute runs the daily steps again.
test("a daily step that fails is named, writes no stamp, and the next run does the daily steps again", async (t) => {
	if (process.getuid?.() === 0) {
		t.skip("root opens every folder");
		return;
	}
	const p = await fresh(t);
	const id = "2026-11-23-abandoned-1a2b3c4d";
	await retirable(p, id);
	const failed = await unreadableArchive(p, () => sweep(p));
	const stampAfterFailure = existsSync(stampOf(p));
	const again = sweep(p);
	assert.deepEqual(
		{
			failed: [failed.status, readOutcome(failed).code],
			named: new RegExp(`^${p.root} \\(daily retire\\): EACCES`, "m").test(outputText(failed)),
			stampAfterFailure,
			again: [again.status, existsSync(stampOf(p)), existsSync(jobDir(p, id))],
		},
		{ failed: [4, "STEP_FAILED"], named: true, stampAfterFailure: false, again: [0, true, false] },
		`${failed.stderr}${again.stderr}`,
	);
});

/** Every file below `dir` with its text, by its path below `dir`. */
function tree(dir: string): Record<string, string> {
	const files: Record<string, string> = {};
	for (const entry of readdirSync(dir, { recursive: true, withFileTypes: true })) {
		if (entry.isFile()) {
			const path = join(entry.parentPath, entry.name);
			files[path.slice(dir.length + 1)] = readFileSync(path, "utf8");
		}
	}
	return files;
}

/** A done job of the plant with one commit on its branch, and a transcript and a result in its folder. */
async function finishedJob(p: Plant): Promise<string> {
	const id = spawnJob(p, "commit");
	assert.equal(waitJob(p, id), "done");
	await mkdir(join(jobDir(p, id), "session"), { recursive: true });
	await writeFile(join(jobDir(p, id), "session", "2026-11-23T00-00-00-000Z_a.jsonl"), '{"type":"session"}\n');
	await writeFile(join(jobDir(p, id), "result"), "the job's result\n");
	return id;
}

/** Moves the time of the job's `landed` or `abandoned` marker 25 hours back, past retire's wait; returns its new time. */
async function markedLongAgo(p: Plant, id: string, marker: "landed" | "abandoned"): Promise<string> {
	const at = new Date(Date.now() - 25 * HOUR).toISOString();
	await editRecord(jobDir(p, id), (record) => {
		const set = record[marker];
		assert.ok(set, `job ${id} holds no ${marker} marker`);
		return { [marker]: { ...set, at } };
	});
	return at;
}

/** The folder of the job archive that a job marked at the ISO time `at` moves to. */
function archived(p: Plant, id: string, at: string): string {
	return join(p.root, ".limen", "archive", at.slice(0, 7), id);
}

// A-002: before R-031 retire took a branch still at its base, gone, or merged by hand for landed, and deleted the
// records and the merged branch; a hand `git merge` writes no `landed` marker.
test("A-002: the daily retire keeps the record of a failed job with no commit, of a job whose branch a human deleted, and of one whose branch a human merged, with that branch", async (t) => {
	const p = await fresh(t);
	// Spawned first: a worker spawn refuses while a finished job holds unlanded work, and the merge leaves it none.
	const merged = spawnJob(p, "commit");
	assert.equal(waitJob(p, merged), "done");
	const branch = jobRecord(p, merged)?.branch ?? "";
	git(p.root, "merge", "-q", "--no-edit", branch);
	const failed = spawnJob(p, "fail 3");
	assert.equal(waitJob(p, failed), "failed");
	const gone = spawnJob(p, "commit");
	assert.equal(waitJob(p, gone), "done");
	const record = jobRecord(p, gone);
	git(p.root, "worktree", "remove", "--force", record?.worktree ?? "");
	git(p.root, "branch", "-D", record?.branch ?? "");
	const jobs = [failed, gone, merged];
	const before = jobs.map((id) => tree(jobDir(p, id)));
	const run = sweep(p);
	assert.equal(run.status, 0, run.stderr);
	assert.deepEqual(
		[
			outputText(run).includes("retired "),
			jobs.map((id) => tree(jobDir(p, id))),
			existsSync(join(p.root, ".limen", "archive")),
			git(p.root, "for-each-ref", "--format=%(refname:short)", `refs/heads/${branch}`),
		],
		[false, before, false, branch],
	);
});

// D-097 (4) (a): the daily steps run after the minute steps, so the reap finalizes a running job whose wrapper is gone
// and the daily prune of the same run removes its clean worktree as a finished job's; before R-101 the sweep pruned
// nothing.
test("the daily prune removes the clean worktree of a dead running job that the same run's reap finalized", async (t) => {
	const p = await fresh(t);
	const id = "2026-11-24-dead-1a2b3c4d";
	const worktree = join(p.parent, ".repo-limen-worktrees", id);
	git(p.root, "worktree", "add", "-q", "--detach", worktree, "HEAD");
	await deadJob(join(p.root, ".limen", "jobs"), id, { worktree });
	const line = `pruned ${realpathSync(worktree)} (job ${id}): job failed`;
	const run = sweep(p);
	assert.equal(run.status, 0, run.stderr);
	assert.deepEqual([existsSync(worktree), outputText(run).split("\n").includes(line)], [false, true], run.stdout);
});

// T-28 (3): retire moves data, so nothing of the folder is lost: the archive holds every file byte for byte.
test("the daily retire moves a landed job's folder to the job archive of its marker's month, every file byte for byte", async (t) => {
	const p = await fresh(t);
	const id = await finishedJob(p);
	const landed = limen(p, ["land", id]);
	assert.equal(landed.status, 0, landed.stderr);
	const target = archived(p, id, await markedLongAgo(p, id, "landed"));
	const before = tree(jobDir(p, id));
	const run = sweep(p);
	assert.equal(run.status, 0, run.stderr);
	const line = `retired ${id} to .limen/archive/${target.split("/").slice(-2).join("/")}`;
	assert.deepEqual(
		[existsSync(jobDir(p, id)), existsSync(target) && tree(target), outputText(run).split("\n").includes(line)],
		[false, before, true],
	);
	assert.ok(before["record.json"] && before.log && before.result && before["session/2026-11-23T00-00-00-000Z_a.jsonl"]);
});

// Review round 1, F5: retire keeps a landed branch whose worktree stays, and the job's record with it.
test("the daily retire keeps a landed job whose branch stays with its worktree, and names that worktree", async (t) => {
	const p = await fresh(t);
	const id = await finishedJob(p);
	const worktree = jobRecord(p, id)?.worktree ?? "";
	const inner = join(worktree, ".limen/inner");
	git(p.root, "worktree", "add", "-q", "--detach", inner, "HEAD");
	await writeFile(join(inner, "wip.txt"), "half-done edit\n");
	assert.equal(limen(p, ["land", id]).status, 0);
	await markedLongAgo(p, id, "landed");
	const run = sweep(p);
	assert.equal(run.status, 0, run.stderr);
	const kept = outputText(run)
		.split("\n")
		.filter((line) => line.startsWith("kept "));
	assert.deepEqual(
		[kept, existsSync(jobDir(p, id))],
		[
			[
				`kept ${worktree} (job ${id}): it holds the registered worktree ${inner}`,
				`kept ${inner} (job none): unlanded work`,
			],
			true,
		],
	);
});

// R-031, review round 2, G5: the move is the one place a record leaves .limen/jobs/, so the month's folder must survive
// a crash before the job goes in; before the fix retire made it with mkdir and never synced .limen/archive/.
test("the daily retire syncs the job archive's folder before the move, so an archive folder it cannot open moves no job", async (t) => {
	if (process.getuid?.() === 0) {
		t.skip("root opens every folder");
		return;
	}
	const p = await fresh(t);
	const id = "2026-11-23-abandoned-1a2b3c4d";
	const target = archived(p, id, await retirable(p, id));
	const run = await unreadableArchive(p, () => sweep(p));
	assert.deepEqual(
		[run.status === 0, existsSync(join(jobDir(p, id), "record.json")), existsSync(target)],
		[false, true, false],
		run.stderr,
	);
});

test("a second daily retire after a retire changes nothing and leaves the job in the job archive", async (t) => {
	const p = await fresh(t);
	const id = await finishedJob(p);
	assert.equal(limen(p, ["land", id]).status, 0);
	const target = archived(p, id, await markedLongAgo(p, id, "landed"));
	assert.equal(sweep(p).status, 0);
	await stampAgo(p, 25);
	const { ".limen/daily-sweep": _first, ...after } = snapshot(p.root).files;
	const again = sweep(p);
	assert.equal(again.status, 0, again.stderr);
	const { ".limen/daily-sweep": _second, ...files } = snapshot(p.root).files;
	assert.deepEqual(
		[outputText(again).includes("retired "), files, existsSync(join(target, "record.json"))],
		[false, after, true],
	);
});

// Before R-031 retire left an abandoned job whose own branch held commits outside HEAD in `.limen/jobs/` for ever.
test("the daily retire moves an abandoned job to the job archive and keeps its limen/abandon/<id> branch and its own branch", async (t) => {
	const p = await fresh(t);
	const id = spawnJob(p, "commit");
	assert.equal(waitJob(p, id), "done");
	const branch = jobRecord(p, id)?.branch ?? "";
	const abandoned = limen(p, ["abandon", id]);
	assert.equal(abandoned.status, 0, abandoned.stderr);
	const target = archived(p, id, await markedLongAgo(p, id, "abandoned"));
	const run = sweep(p);
	assert.equal(run.status, 0, run.stderr);
	const refs = git(
		p.root,
		"for-each-ref",
		"--format=%(refname:short)",
		`refs/heads/${branch}`,
		"refs/heads/limen/abandon",
	);
	assert.deepEqual(
		[existsSync(jobDir(p, id)), existsSync(join(target, "record.json")), refs.split("\n").sort()],
		[false, true, [`limen/abandon/${id}`, branch].sort()],
	);
});

// R-101 review round 1, F5: retire waited up to 60 s for a job's own lock while it held the jobs lock, so a spawn in
// that window could end in LOCK_TIMEOUT, and one job lock held elsewhere failed the whole daily retire, stamp and all.
// The wait is cut to 200 ms, so a run that still waits fails at once.
test("the daily retire keeps a job whose lock another process holds, with a line, retires the others and writes the stamp", async (t) => {
	const p = await fresh(t);
	const [held, free] = ["2026-11-23-held-1a2b3c4d", "2026-11-23-free-5e6f7a8b"];
	await retirable(p, held);
	const target = archived(p, free, await retirable(p, free));
	const run = await withLock({ folder: jobDir(p, held) }, async () =>
		sweep(p, [], { env: { LIMEN_LOCK_WAIT_MS: "200" } }),
	);
	assert.equal(run.status, 0, run.stderr);
	assert.deepEqual(
		{
			held: existsSync(join(jobDir(p, held), "record.json")),
			retired: existsSync(join(target, "record.json")),
			stamp: existsSync(stampOf(p)),
			line: outputText(run)
				.split("\n")
				.includes(`kept job ${held} for the next daily retire: another process holds its lock`),
		},
		{ held: true, retired: true, stamp: true, line: true },
	);
});

// R-104, R-101 open point 6: prune waited up to 60 s for a folder's own lock while it held the jobs lock, so one lock
// held elsewhere failed the whole daily prune with LOCK_TIMEOUT, and no stamp was written. The wait is cut to 200 ms,
// so a run that still waits fails at once.
test("the daily prune keeps a folder whose lock another process holds, with a line, and the run writes the stamp", async (t) => {
	const p = await fresh(t);
	const folder = await leftover(p);
	const run = await withLock({ folder }, async () => sweep(p, [], { env: { LIMEN_LOCK_WAIT_MS: "200" } }));
	assert.equal(run.status, 0, run.stderr);
	assert.deepEqual(
		{
			kept: existsSync(join(folder, "log")),
			stamp: existsSync(stampOf(p)),
			line: outputText(run)
				.split("\n")
				.includes(`kept job ${basename(folder)} for the next daily prune: another process holds its lock`),
		},
		{ kept: true, stamp: true, line: true },
	);
});

// R-104, R-101 open point 4: a writer that takes a job's lock after a retire moved the job makes the job's folder
// again, empty, and the daily prune's move of it into the month of the job archive that holds the retired job failed
// with STEP_FAILED, so no stamp was written and the daily steps ran every minute until the month changed.
test("the daily prune moves an empty job folder whose month in the job archive holds the retired job, leaves that job byte for byte, and the run writes the stamp", async (t) => {
	const p = await fresh(t);
	const id = "2026-11-23-retired-1a2b3c4d";
	const now = new Date().toISOString();
	const retired = archived(p, id, now);
	const abandoned = { branch: `limen/abandon/${id}`, commit: "2".repeat(40), at: now };
	await writeRecord(retired, { state: "done", label: id, startedAt: now, finishedAt: now, abandoned });
	await writeFile(join(retired, "log"), "the retired job's log\n");
	const before = tree(retired);
	await mkdir(jobDir(p, id), { recursive: true });
	const run = sweep(p);
	assert.equal(run.status, 0, run.stderr);
	const unregistered = join(p.root, ".limen", "archive", "unregistered");
	assert.deepEqual(
		{
			archived: tree(retired),
			stamp: existsSync(stampOf(p)),
			left: existsSync(jobDir(p, id)),
			moved: existsSync(unregistered) && readdirSync(unregistered).some((name) => name.startsWith(`${id}-`)),
		},
		{ archived: before, stamp: true, left: false, moved: true },
	);
});

// R-101 review round 1, F6 (T-01): the run named a failure once by its message and code alone, so a second project that
// failed with the same message went unnamed. A stamp that is a folder fails to read with a message that names no path.
test("two projects whose daily steps fail with the same message are both named", async (t) => {
	const p = await fresh(t);
	const other = await secondProject(p);
	for (const root of [p.root, other]) {
		await mkdir(join(root, ".limen", "daily-sweep"));
	}
	const run = sweep(p);
	const named = (root: string) =>
		outputText(run)
			.split("\n")
			.some((line) => line.startsWith(`${root} (daily stamp): EISDIR: `));
	assert.deepEqual([run.status, named(p.root), named(other)], [4, true, true], run.stderr);
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
