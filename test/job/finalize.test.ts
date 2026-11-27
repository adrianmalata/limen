// src/job/finalize.ts: the end of a job through its terminal transition: the log line and the failure it writes, no
// open checks read from a done job's result while an older record's still read, the readings of the job's systemd
// user scope it writes with them, the start of its group's next round, and the end of that scope after them.
import assert from "node:assert/strict";
import { mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test, { type TestContext } from "node:test";
import { finalizeJob, requestedEnd } from "../../src/job/finalize.ts";
import { type JobRecord, readRecord, type Scope } from "../../src/job/record.ts";
import { withEnvironment } from "../environment.ts";
import {
	failingSystemdRun,
	fakeCgroup,
	fakeSystemd,
	git,
	repository,
	SCOPE_READINGS,
	scopeProcess,
	systemdCalls,
	writeRecord,
} from "../plant.ts";

const IDENTITY = { pid: 4242, born: "123", bootId: null } as const;
const UNIT = "limen-job-job.scope";

/**
 * A job folder `job` in the OS temporary folder `folder`, removed after the test, and the folder of the tests' cgroups:
 * the end of a job ends its scope, so the test runs with the tests' systemd (test/plant.ts), never the machine's.
 */
async function jobFolder(
	t: TestContext,
): Promise<{ readonly folder: string; readonly job: string; readonly cgroups: string }> {
	const folder = mkdtempSync(join(tmpdir(), "limen-finalize-"));
	t.after(() => rmSync(folder, { recursive: true, force: true }));
	const systemd = await fakeSystemd(folder);
	withEnvironment(t, systemd);
	return { folder, job: join(folder, "job"), cgroups: systemd.LIMEN_CGROUP_ROOT };
}

/** The scope a wrapper records in the transition to running: its unit and cgroup, no reading yet. */
const RECORDED: Scope = {
	unit: UNIT,
	cgroup: fakeCgroup(UNIT),
	memoryPeakBytes: null,
	cpuMicroseconds: null,
	oomKills: null,
};

/** The folder of the scope's cgroup below `cgroups`, with the readings the tests' systemd-run writes. */
function cgroupWithReadings(cgroups: string): string {
	const folder = join(cgroups, RECORDED.cgroup);
	mkdirSync(folder, { recursive: true });
	writeFileSync(join(folder, "memory.peak"), `${SCOPE_READINGS.memoryPeakBytes}\n`);
	writeFileSync(join(folder, "cpu.stat"), `usage_usec ${SCOPE_READINGS.cpuMicroseconds}\nuser_usec 0\nsystem_usec 0\n`);
	writeFileSync(join(folder, "memory.events"), "low 0\nhigh 0\nmax 0\noom 1\noom_kill 1\n");
	return folder;
}

/** The lines of the job's log that say its scope was not ended. */
function notEnded(job: string): string[] {
	return readFileSync(join(job, "log"), "utf8")
		.split("\n")
		.filter((line) => / was not ended: /.test(line));
}

// A temp of src/atomic-write.ts sits beside its target until the link; a leftover one, after a crash, stays.
test("finalizeJob counts each steer left in the inbox in its log line, but not the temp of a steer write", async (t) => {
	const { job } = await jobFolder(t);
	await writeRecord(job, { state: "running", identity: IDENTITY });
	mkdirSync(join(job, "steer", "inbox"), { recursive: true });
	writeFileSync(join(job, "steer", "inbox", "0001"), "check the logs\n");
	writeFileSync(join(job, "steer", "inbox", "0002.4242.9f3c.tmp"), "stop\n");
	await finalizeJob(job, { state: "stopped", detail: "stopped by request" });
	assert.equal((await readRecord(job))?.state, "stopped");
	assert.match(
		readFileSync(join(job, "log"), "utf8"),
		/\] stopped: stopped by request; 1 steer\(s\) never delivered\n$/,
	);
});

// A-016 (1): the kind is set by whoever detected the failure, never read back from its detail, so a detail that one of
// the migration's patterns would name otherwise keeps the kind its detector passed.
test("finalizeJob records the kind, the detail and the reset time its detector passes, whatever a pattern reads in the detail", async (t) => {
	const { folder } = await jobFolder(t);
	const passed = [
		{ kind: "launch", detail: "timeout after 5ms", resetAt: null },
		{ kind: "quota", detail: "error: You've hit your session limit", resetAt: "2026-11-24T15:00:00.000Z" },
	] as const;
	const failures = [];
	for (const [n, failure] of passed.entries()) {
		const job = join(folder, `job-${n}`);
		await writeRecord(job, { state: "running", identity: IDENTITY });
		await finalizeJob(job, { state: "failed", failure });
		failures.push((await readRecord(job))?.failure);
	}
	assert.deepEqual(failures, passed);
});

// A-044: the end parsed the "Note check" of the result into open checks; the task note is cut, so nothing reads it.
test("finalizeJob of a done job whose result holds a Note check with lines not proven records openChecks null", async (t) => {
	const { job } = await jobFolder(t);
	await writeRecord(job, { state: "running", identity: IDENTITY });
	writeFileSync(join(job, "result"), "Done.\n\n## Note check\n- Tests: not proven. No run.\n- Build: dropped.\n");
	await finalizeJob(job, { state: "done", detail: "pi exited 0" });
	const record = await readRecord(job);
	assert.deepEqual([record?.state, record?.openChecks], ["done", null]);
});

// The field stays in schema version 1 as history (R-042 Decision 1), so a record that holds its value still reads.
test("a version-1 record of a done job that holds openChecks reads with its lines", async (t) => {
	const { job } = await jobFolder(t);
	await writeRecord(job, { state: "done", openChecks: ["Tests: not proven. No run."] });
	const record = await readRecord(job);
	assert.deepEqual([record?.version, record?.openChecks], [1, ["Tests: not proven. No run."]]);
});

// A-036, D-072: any finisher of a queued job, such as `limen stop` or the reaper, clears `queued`, so the wait itself
// stays in `queueWait` with the time the job left the queue.
test("finalizeJob of a job still in the start queue keeps its wait in queueWait, with the time it left", async (t) => {
	const { job } = await jobFolder(t);
	const since = "2026-11-21T09:00:00.000Z";
	await writeRecord(job, { state: "running", identity: IDENTITY, queued: { since, detail: "held", ahead: 0 } });
	await finalizeJob(job, { state: "stopped", detail: "stopped by request" });
	const record = await readRecord(job);
	const wait = record?.queueWait;
	assert.deepEqual(
		{ queued: record?.queued, wait: wait && { ...wait, leftAt: Number.isFinite(Date.parse(wait.leftAt ?? "")) } },
		{ queued: null, wait: { since, diagnosedAt: null, diagnosis: null, leftAt: true } },
	);
});

// M-09, A-052: the scope's memory.peak goes with the scope, so the finisher reads it before the transition.
test("finalizeJob writes the memory peak, CPU time and OOM kills of the job's scope with its terminal state", async (t) => {
	const { job, cgroups } = await jobFolder(t);
	cgroupWithReadings(cgroups);
	await writeRecord(job, { state: "running", identity: IDENTITY, scope: RECORDED });
	await finalizeJob(job, { state: "failed", failure: { kind: "exit", detail: "worker exited with code 137" } });
	const record = await readRecord(job);
	assert.deepEqual([record?.state, record?.scope], ["failed", { ...RECORDED, ...SCOPE_READINGS, oomKills: 1 }]);
});

// A-052: an OOM kill ends a process by SIGKILL, so it shows as an engine's signal death or as a wrapper the reaper
// found gone; a limit's kind stays, since its own detector decided the end (R-034 resumes `quota` jobs).
test("finalizeJob records kind oom for a signal death or a reaped wrapper when the job's scope counted an OOM kill, and keeps quota and timeout", async (t) => {
	const { folder, cgroups } = await jobFolder(t);
	const passed = [
		{ kind: "signal", detail: "killed by SIGKILL" },
		{
			kind: "reaped",
			detail: "process group gone: wrapper 4242 is not running; scope limen-job-job.scope ended after TERM",
		},
		{ kind: "quota", detail: "error: You've hit your session limit · resets 3pm (UTC)" },
		{ kind: "timeout", detail: "timeout after 3000ms" },
	] as const;
	const kinds: (string | null | undefined)[] = [];
	for (const [n, failure] of passed.entries()) {
		// Each end ends the scope, which takes its folder with it, so each job gets the readings anew.
		cgroupWithReadings(cgroups);
		const job = join(folder, `job-${n}`);
		await writeRecord(job, { state: "running", identity: IDENTITY, scope: RECORDED });
		await finalizeJob(job, { state: "failed", failure });
		kinds.push((await readRecord(job))?.failure?.kind);
	}
	assert.deepEqual(kinds, ["oom", "oom", "quota", "timeout"]);
});

// A-016 (5), D-097 (5) (g): the third resume is the last, so its end on the limit is the one terminal record that says
// so; a resume before it stays `quota`, for the next one.
test("finalizeJob records kind quota-exhausted for a limit end of a job whose quotaAttempt is 3, and quota for attempt 2", async (t) => {
	const { folder } = await jobFolder(t);
	const failure = {
		kind: "quota",
		detail: "error: You've hit your session limit · resets 3pm (UTC)",
		resetAt: "2026-11-24T15:00:00.000Z",
	} as const;
	const failures = [];
	for (const quotaAttempt of [2, 3]) {
		const job = join(folder, `job-${quotaAttempt}`);
		await writeRecord(job, { state: "running", identity: IDENTITY, quotaAttempt });
		await finalizeJob(job, { state: "failed", failure });
		failures.push((await readRecord(job))?.failure);
	}
	assert.deepEqual(failures, [failure, { ...failure, kind: "quota-exhausted" }]);
});

test("finalizeJob writes null readings when the job's scope is already gone, and a record without a scope keeps none", async (t) => {
	const { job } = await jobFolder(t);
	await writeRecord(job, { state: "running", identity: IDENTITY, scope: RECORDED });
	await finalizeJob(job, { state: "done", detail: "pi exited 0" });
	const plain = join(job, "..", "plain");
	await writeRecord(plain, { state: "running", identity: IDENTITY });
	await finalizeJob(plain, { state: "done", detail: "pi exited 0" });
	const [scoped, unscoped] = [await readRecord(job), await readRecord(plain)];
	assert.deepEqual([scoped?.scope, unscoped && "scope" in unscoped], [RECORDED, false]);
});

// A-029: a process the engine detached left the job's process group, so only the end of the scope reaches it.
test("finalizeJob ends the job's scope after its terminal state: every process left in the scope gets SIGKILL", async (t) => {
	const { job, cgroups } = await jobFolder(t);
	cgroupWithReadings(cgroups);
	await writeRecord(job, { state: "running", identity: IDENTITY, scope: RECORDED });
	const member = await scopeProcess(t, RECORDED.cgroup);
	await finalizeJob(job, { state: "done", detail: "pi exited 0" });
	assert.deepEqual(
		[(await readRecord(job))?.state, await member.end(), systemdCalls(cgroups, "systemctl").at(-1)],
		["done", "SIGKILL", `--user kill --signal=SIGKILL ${UNIT}`],
	);
});

// A-029, R-026: any terminal transition stops the whole scope, so no step after the transition can skip its end.
test("finalizeJob ends the job's scope also when a step after the transition rejects, and the rejection goes on", async (t) => {
	const { job, cgroups } = await jobFolder(t);
	cgroupWithReadings(cgroups);
	await writeRecord(job, { state: "running", identity: IDENTITY, scope: RECORDED });
	const member = await scopeProcess(t, RECORDED.cgroup);
	const grace = () => Promise.reject(new Error("the grace failed"));
	await assert.rejects(
		finalizeJob(job, { state: "stopped", detail: "stopped by request" }, { beforeScopeEnd: grace }),
		/the grace failed/,
	);
	assert.equal(await member.end(), "SIGKILL");
});

// A launch that failed, or a stop before systemd-run ran, leaves a job with no scope: there is nothing to end.
test("finalizeJob of a job whose scope never started sends no kill and logs no failed end of its scope", async (t) => {
	const { job, cgroups } = await jobFolder(t);
	await writeRecord(job, { state: "starting" });
	const detail = "failed to launch wrapper: the job's systemd user scope did not start";
	await finalizeJob(job, { state: "failed", failure: { kind: "launch", detail } });
	const kills = systemdCalls(cgroups, "systemctl").filter((words) => words.includes(" kill "));
	assert.deepEqual([(await readRecord(job))?.state, kills, notEnded(job)], ["failed", [], []]);
});

/** The run of a group whose one member, a team's coordinator in its first round, is the job `id` of `root`. */
function groupOf(root: string, id: string, group: string): void {
	const deadline = Date.now() + 3_600_000;
	const run = {
		id: group,
		root,
		feature: "spec/features/active/F001-demo",
		lead: "lead",
		startedAt: Date.now(),
		teams: ["team-1"],
		routes: { "team-1": { engine: "pi", provider: "p", model: "m", thinking: "high" } },
		workersPerTeam: 0,
		rounds: ["draft", "final"],
		round: 0,
		deadline,
		reserveMs: 0,
		stopped: false,
		closed: false,
		members: [{ id, team: "team-1", role: "coordinator", deadline, round: 0 }],
	};
	mkdirSync(join(root, ".limen", "groups", group), { recursive: true });
	writeFileSync(join(root, ".limen", "groups", group, "run.json"), `${JSON.stringify(run)}\n`);
}

// T-01: the next round is a side channel of the end of a team's job, so its failure is written where the job is read.
test("finalizeJob of a team's coordinator writes a line in the job's log when the group's next round cannot start", async (t) => {
	const { folder } = await jobFolder(t);
	process.env.PATH = `${await failingSystemdRun(folder)}:${process.env.PATH ?? ""}`;
	const root = join(folder, "project");
	const id = "2026-11-22-team-1a2b3c4d";
	const job = join(root, ".limen", "jobs", id);
	groupOf(root, id, "g1");
	await writeRecord(job, { state: "running", identity: IDENTITY, group: "g1", team: "team-1" });
	await finalizeJob(job, { state: "done", detail: "pi exited 0" });
	assert.match(
		readFileSync(join(job, "log"), "utf8"),
		/\] the group's next round could not start: systemd-run did not run .+: it ended with exit code 1\n/,
	);
});

/**
 * A running job `name` of `role` in `folder` whose worktree is a new repository on `main`, clean at its one commit,
 * and the job folder's `start-state.json` as docs/jobs.md describes it: that commit as HEAD, no branch of its own (a
 * reviewer's), no path in `git status`. A writer's job holds the file too, which its end does not read.
 */
async function roleJob(folder: string, name: string, role: string): Promise<{ job: string; worktree: string }> {
	const worktree = join(folder, `${name}-worktree`);
	await repository(worktree);
	const job = join(folder, name);
	const base = git(worktree, "rev-parse", "HEAD");
	await writeRecord(job, { state: "running", identity: IDENTITY, role, worktree, branch: "main", base });
	writeFileSync(join(job, "start-state.json"), `${JSON.stringify({ head: base, branch: null, status: [] })}\n`);
	return { job, worktree };
}

/** The record of the job folder `job`, which the test wrote. */
async function recordOf(job: string): Promise<JobRecord> {
	const record = await readRecord(job);
	assert.ok(record, `${job} holds a record`);
	return record;
}

/** The first 12 hex digits of HEAD in `worktree`. */
const head = (worktree: string) => git(worktree, "rev-parse", "HEAD").slice(0, 12);

// A-081: the tool list is a noise guard, since bash can still write; the effect check at the end is the guarantee, and
// it holds a read-only role only, so a worker's commit is its work.
test("A-081: a reviewer's done end after a commit in its worktree ends failed, kind read-only-violation, naming HEAD's move, and a worker's done end after a commit stays done", async (t) => {
	const { folder } = await jobFolder(t);
	const reviewer = await roleJob(folder, "reviewer", "reviewer");
	const worker = await roleJob(folder, "worker", "worker");
	const before = head(reviewer.worktree);
	for (const { worktree } of [reviewer, worker]) {
		git(worktree, "commit", "-q", "--allow-empty", "-m", "a write");
	}
	await finalizeJob(reviewer.job, { state: "done", detail: "pi exited 0" });
	await finalizeJob(worker.job, { state: "done", detail: "pi exited 0" });
	const [ended, kept] = [await recordOf(reviewer.job), await recordOf(worker.job)];
	assert.deepEqual(
		{ reviewer: [ended.state, ended.failure], worker: [kept.state, kept.failure, kept.commits?.length] },
		{
			reviewer: [
				"failed",
				{ kind: "read-only-violation", detail: `HEAD moved ${before}..${head(reviewer.worktree)}`, resetAt: null },
			],
			worker: ["done", null, 1],
		},
	);
});

// R-045 Decision 12: a silent false success is critical, so an end that cannot be compared is never done.
test("a reviewer's done end with no start state, a damaged one, or a worktree git cannot read ends failed, kind read-only-violation, detail unproven", async (t) => {
	const { folder } = await jobFolder(t);
	const missing = await roleJob(folder, "missing", "reviewer");
	rmSync(join(missing.job, "start-state.json"));
	const damaged = await roleJob(folder, "damaged", "reviewer");
	writeFileSync(join(damaged.job, "start-state.json"), "{");
	// A `.git` file that names no repository stops git at once, so it never reads a repository above the worktree.
	const gone = await roleJob(folder, "gone", "reviewer");
	rmSync(join(gone.worktree, ".git"), { recursive: true, force: true });
	writeFileSync(join(gone.worktree, ".git"), "gitdir: /nonexistent\n");
	const failures = [];
	for (const { job } of [missing, damaged, gone]) {
		await finalizeJob(job, { state: "done", detail: "pi exited 0" });
		const { state, failure } = await recordOf(job);
		failures.push([state, failure?.kind, failure?.detail.split(": ").slice(0, 2).join(": ")]);
	}
	assert.deepEqual(failures, [
		["failed", "read-only-violation", `unproven: ${join(missing.job, "start-state.json")} is missing`],
		["failed", "read-only-violation", `unproven: ${join(damaged.job, "start-state.json")}`],
		["failed", "read-only-violation", `unproven: the worktree ${gone.worktree} cannot be read`],
	]);
});

// Fact 4 of R-045: a stop whose reason starts with `done:` ends the job done through the same end as the engine's.
test("a done: stop of a reviewer that committed ends failed, kind read-only-violation", async (t) => {
	const { folder } = await jobFolder(t);
	const { job, worktree } = await roleJob(folder, "reviewer", "reviewer");
	const before = head(worktree);
	git(worktree, "commit", "-q", "--allow-empty", "-m", "a write");
	await finalizeJob(job, requestedEnd("done: reviewed"));
	const { state, failure } = await recordOf(job);
	assert.deepEqual(
		[state, failure?.kind, failure?.detail],
		["failed", "read-only-violation", `HEAD moved ${before}..${head(worktree)}`],
	);
});

// A-016 (1): one cause per job, so a failed end keeps its kind and a stopped end its state; the log keeps the write.
test("a reviewer's failed end keeps its kind and a stopped end its state, and each logs read-only: with the difference", async (t) => {
	const { folder } = await jobFolder(t);
	const failed = await roleJob(folder, "failed", "reviewer");
	const stopped = await roleJob(folder, "stopped", "reviewer");
	for (const { worktree } of [failed, stopped]) {
		writeFileSync(join(worktree, "notes.txt"), "a write through bash\n");
	}
	await finalizeJob(failed.job, { state: "failed", failure: { kind: "timeout", detail: "timeout after 3000ms" } });
	await finalizeJob(stopped.job, { state: "stopped", detail: "stopped by request" });
	const ends = [];
	for (const { job } of [failed, stopped]) {
		const { state, failure } = await recordOf(job);
		const logged = readFileSync(join(job, "log"), "utf8").includes("] read-only: 1 path changed: notes.txt\n");
		ends.push([state, failure?.kind ?? null, logged]);
	}
	assert.deepEqual(ends, [
		["failed", "timeout", true],
		["stopped", null, true],
	]);
});
