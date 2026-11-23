// src/job/finalize.ts: the end of a job through its terminal transition: the log line and the failure it writes, the
// readings of the job's systemd user scope it writes with them, the start of its group's next round, and the end of
// that scope after them.
import assert from "node:assert/strict";
import { mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test, { type TestContext } from "node:test";
import { finalizeJob } from "../../src/job/finalize.ts";
import { readRecord, type Scope } from "../../src/job/record.ts";
import { withEnvironment } from "../environment.ts";
import {
	failingSystemdRun,
	fakeCgroup,
	fakeSystemd,
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
	await finalizeJob(job, "stopped", "stopped by request");
	assert.equal((await readRecord(job))?.state, "stopped");
	assert.match(
		readFileSync(join(job, "log"), "utf8"),
		/\] stopped: stopped by request; 1 steer\(s\) never delivered\n$/,
	);
});

// D-071: the wrapper ends a job whose engine stopped on an error with that stop reason, `error: <the provider's text>`.
test("finalizeJob records the failure kind quota for a job whose engine stopped on the subscription limit", async (t) => {
	const { job } = await jobFolder(t);
	await writeRecord(job, { state: "running", identity: IDENTITY });
	const stopReason = "error: You've hit your session limit · resets 3pm (UTC)";
	await finalizeJob(job, "failed", stopReason);
	const record = await readRecord(job);
	assert.deepEqual([record?.state, record?.failure], ["failed", { kind: "quota", detail: stopReason, resetAt: null }]);
});

// A-036, D-072: any finisher of a queued job, such as `limen stop` or the reaper, clears `queued`, so the wait itself
// stays in `queueWait` with the time the job left the queue.
test("finalizeJob of a job still in the start queue keeps its wait in queueWait, with the time it left", async (t) => {
	const { job } = await jobFolder(t);
	const since = "2026-11-21T09:00:00.000Z";
	await writeRecord(job, { state: "running", identity: IDENTITY, queued: { since, detail: "held", ahead: 0 } });
	await finalizeJob(job, "stopped", "stopped by request");
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
	await finalizeJob(job, "failed", "worker exited with code 137");
	const record = await readRecord(job);
	assert.deepEqual([record?.state, record?.scope], ["failed", { ...RECORDED, ...SCOPE_READINGS, oomKills: 1 }]);
});

// A-052: an OOM kill ends a process by SIGKILL, so it shows as an engine's signal death or as a wrapper the reaper
// found gone; a limit's kind stays, since its own detector decided the end (R-034 resumes `quota` jobs). The signal
// death is the older wrapper's detail, whose pattern names it `signal` without the newer `killed by` one, so the test
// checks the rule alone; test/job/record.test.ts checks that pattern (T-29 (3)).
test("finalizeJob records kind oom for a signal death or a reaped wrapper when the job's scope counted an OOM kill, and keeps quota and timeout", async (t) => {
	const { folder, cgroups } = await jobFolder(t);
	const details = [
		"process group interrupted",
		"process group gone: wrapper 4242 is not running; scope limen-job-job.scope ended after TERM",
		"error: You've hit your session limit · resets 3pm (UTC)",
		"timeout after 3000ms",
	];
	const kinds: (string | null | undefined)[] = [];
	for (const [n, detail] of details.entries()) {
		// Each end ends the scope, which takes its folder with it, so each job gets the readings anew.
		cgroupWithReadings(cgroups);
		const job = join(folder, `job-${n}`);
		await writeRecord(job, { state: "running", identity: IDENTITY, scope: RECORDED });
		await finalizeJob(job, "failed", detail);
		kinds.push((await readRecord(job))?.failure?.kind);
	}
	assert.deepEqual(kinds, ["oom", "oom", "quota", "timeout"]);
});

test("finalizeJob writes null readings when the job's scope is already gone, and a record without a scope keeps none", async (t) => {
	const { job } = await jobFolder(t);
	await writeRecord(job, { state: "running", identity: IDENTITY, scope: RECORDED });
	await finalizeJob(job, "done", "pi exited 0");
	const plain = join(job, "..", "plain");
	await writeRecord(plain, { state: "running", identity: IDENTITY });
	await finalizeJob(plain, "done", "pi exited 0");
	const [scoped, unscoped] = [await readRecord(job), await readRecord(plain)];
	assert.deepEqual([scoped?.scope, unscoped && "scope" in unscoped], [RECORDED, false]);
});

// A-029: a process the engine detached left the job's process group, so only the end of the scope reaches it.
test("finalizeJob ends the job's scope after its terminal state: every process left in the scope gets SIGKILL", async (t) => {
	const { job, cgroups } = await jobFolder(t);
	cgroupWithReadings(cgroups);
	await writeRecord(job, { state: "running", identity: IDENTITY, scope: RECORDED });
	const member = await scopeProcess(t, RECORDED.cgroup);
	await finalizeJob(job, "done", "pi exited 0");
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
		finalizeJob(job, "stopped", "stopped by request", { beforeScopeEnd: grace }),
		/the grace failed/,
	);
	assert.equal(await member.end(), "SIGKILL");
});

// A launch that failed, or a stop before systemd-run ran, leaves a job with no scope: there is nothing to end.
test("finalizeJob of a job whose scope never started sends no kill and logs no failed end of its scope", async (t) => {
	const { job, cgroups } = await jobFolder(t);
	await writeRecord(job, { state: "starting" });
	await finalizeJob(job, "failed", "failed to launch wrapper: the job's systemd user scope did not start");
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
	await finalizeJob(job, "done", "pi exited 0");
	assert.match(
		readFileSync(join(job, "log"), "utf8"),
		/\] the group's next round could not start: systemd-run did not run .+: it ended with exit code 1\n/,
	);
});
