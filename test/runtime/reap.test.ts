// src/runtime/reap.ts: whether a job holds any process, its wrapper or its scope (R-032), and the reaper, which ends a
// running job whose wrapper is gone only once the job's scope, or its wrapper's group, is gone (A-005).
import assert from "node:assert/strict";
import { spawn } from "node:child_process";
import { once } from "node:events";
import { existsSync, mkdirSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test, { type TestContext } from "node:test";
import { folderLive } from "../../src/job/migration.ts";
import { type Identity, type JobRecord, readRecord, type Scope } from "../../src/job/record.ts";
import { platform } from "../../src/platform/platform.ts";
import { jobScope } from "../../src/runtime/launcher.ts";
import { ownerState } from "../../src/runtime/liveness.ts";
import { holdsProcesses, liveJob, reapDeadJobs } from "../../src/runtime/reap.ts";
import { withEnvironment } from "../environment.ts";
import {
	failingSystemctl,
	fakeCgroup,
	fakeSystemd,
	OTHER_BOOT,
	own,
	SCOPE_READINGS,
	scopeProcess,
	writeRecord,
} from "../plant.ts";

/** A sleeping child, its exit and its recorded identity; the test kills it when it ends. */
async function sleeper(t: TestContext) {
	const code = "Atomics.wait(new Int32Array(new SharedArrayBuffer(4)), 0, 0)";
	const child = spawn(process.execPath, ["-e", code], { stdio: "ignore" });
	t.after(() => child.kill("SIGKILL"));
	const [exited, info] = [once(child, "exit"), await platform.processInfo(child.pid ?? 0)];
	assert.ok(info.kind === "present", "the child is present");
	return { child, exited, info };
}

/** The identity of a wrapper that was killed alone, as the transition to running recorded it: its process is gone. */
async function killedWrapper(t: TestContext): Promise<Identity> {
	const { child, exited, info } = await sleeper(t);
	child.kill("SIGKILL");
	await exited;
	return { pid: info.process.pid, born: info.process.born, bootId: platform.bootId() ?? null };
}

/**
 * A jobs folder and a folder for the test's own files in the OS temporary folder, removed after the test. The reaper
 * reads and ends each job's systemd user scope, so the test runs with the tests' systemd (test/plant.ts), never the
 * machine's; `cgroups` is where its scopes keep their folders.
 */
async function jobsFolder(
	t: TestContext,
): Promise<{ readonly jobs: string; readonly folder: string; readonly cgroups: string }> {
	const jobs = await mkdtemp(join(tmpdir(), "reap-jobs-"));
	const folder = await mkdtemp(join(tmpdir(), "reap-systemd-"));
	t.after(() => Promise.all([jobs, folder].map((path) => rm(path, { recursive: true, force: true }))));
	const systemd = await fakeSystemd(folder);
	withEnvironment(t, systemd);
	return { jobs, folder, cgroups: systemd.LIMEN_CGROUP_ROOT };
}

/** A running job's record under `jobs` with the identity `identity`, started now, and `fields`. */
async function running(
	jobs: string,
	id: string,
	identity: Identity | null,
	fields: Partial<JobRecord> = {},
): Promise<string> {
	const dir = join(jobs, id);
	await writeRecord(dir, { state: "running", identity, startedAt: new Date().toISOString(), ...fields });
	return dir;
}

/** The scope of job `id` as its wrapper records it, with its folder below `cgroups` and the tests' readings in it. */
function scopeOf(cgroups: string, id: string): Scope {
	const unit = jobScope(id);
	const folder = join(cgroups, fakeCgroup(unit));
	mkdirSync(folder, { recursive: true });
	writeFileSync(join(folder, "memory.peak"), `${SCOPE_READINGS.memoryPeakBytes}\n`);
	writeFileSync(join(folder, "cpu.stat"), `usage_usec ${SCOPE_READINGS.cpuMicroseconds}\n`);
	writeFileSync(join(folder, "memory.events"), `oom_kill ${SCOPE_READINGS.oomKills}\n`);
	return { unit, cgroup: fakeCgroup(unit), memoryPeakBytes: null, cpuMicroseconds: null, oomKills: null };
}

/** Two passes of the reaper over `jobs`: a first sighting at `now`, and its confirmation 11 s later. */
async function reapConfirmed(jobs: string, seen = new Map<string, number>(), now = Date.now()): Promise<void> {
	await reapDeadJobs(jobs, seen, now);
	await reapDeadJobs(jobs, seen, now + 11_000);
}

/** The messages of the Limen lines of the job's log that start with `start`, without their time. */
function logged(job: string, start: string): string[] {
	const path = join(job, "log");
	const lines = existsSync(path) ? readFileSync(path, "utf8").split("\n") : [];
	return lines.flatMap((line) => /^\[limen \S+\] (.*)$/.exec(line)?.slice(1) ?? []).filter((m) => m.startsWith(start));
}

/** An engine that writes the job's state, as its record says it when the TERM comes, to the file of its second word. */
const READS_STATE_AT_TERM = `const fs = require("node:fs");
const [record, seen] = process.argv.slice(1);
process.on("SIGTERM", () => {
	fs.writeFileSync(seen, JSON.parse(fs.readFileSync(record, "utf8")).state);
	process.exit(0);
});`;
/** An engine that ignores TERM, as the fake engine's `deaf` does, and marks each TERM in the file of its first word. */
const IGNORES_TERM = `const fs = require("node:fs");
process.on("SIGTERM", () => fs.writeFileSync(process.argv[1], "TERM ignored"));`;

test("the reaper keeps a live owner and finalizes a dead owner and a stranger at its pid", async (t) => {
	const { jobs } = await jobsFolder(t);
	const { child, exited, info } = await sleeper(t);
	const bootId = platform.bootId() ?? null;
	const owner = await running(jobs, "owner", { pid: info.process.pid, born: info.process.born, bootId });
	// This live process is not that start time.
	const stranger = await running(jobs, "stranger", { pid: process.pid, born: "1", bootId });
	const t0 = Date.now();
	assert.equal(await ownerState({ pid: info.process.pid, born: info.process.born, bootId }), "alive");
	assert.equal(await ownerState({ pid: process.pid, born: "1", bootId }), "dead");
	child.kill("SIGKILL");
	await exited;
	assert.equal((await platform.processInfo(info.process.pid)).kind, "absent", "a gone pid is absent");
	const seen = new Map<string, number>();
	await reapDeadJobs(jobs, seen, t0 + 31_000);
	await reapDeadJobs(jobs, seen, t0 + 91_000);
	assert.deepEqual([(await readRecord(owner))?.state, (await readRecord(stranger))?.state], ["failed", "failed"]);
});

// The transition to running writes the identity in the same write as the state, so no startup grace keeps it alive.
// The pid without its start time is this live process, so the job's scope, which holds no process, is what ends.
test("A-056: the reaper ends a running job whose identity is unknown once confirmed, also one that started just now", async (t) => {
	const { jobs, cgroups } = await jobsFolder(t);
	const young = await running(jobs, "young", null);
	const scope = scopeOf(cgroups, "pid-only");
	const pidOnly = await running(jobs, "pid-only", { ...(await own()), born: null }, { scope });
	const seen = new Map<string, number>();
	const now = Date.now();
	await reapDeadJobs(jobs, seen, now);
	assert.deepEqual([(await readRecord(young))?.state, (await readRecord(pidOnly))?.state], ["running", "running"]);
	await reapDeadJobs(jobs, seen, now + 11_000);
	assert.deepEqual([(await readRecord(young))?.state, (await readRecord(pidOnly))?.state], ["failed", "failed"]);
});

// The pid and start time are this live process's: only the boot differs, so no group of this boot is the job's.
test("the reaper ends a running job whose recorded boot id is not the current boot", async (t) => {
	const self = await own();
	if (self.bootId === null) {
		t.skip("the system gives no boot id");
		return;
	}
	const { jobs } = await jobsFolder(t);
	const rebooted = await running(jobs, "rebooted", { ...self, bootId: OTHER_BOOT });
	const seen = new Map<string, number>();
	await reapDeadJobs(jobs, seen, Date.now() + 1_000);
	await reapDeadJobs(jobs, seen, Date.now() + 12_000);
	assert.equal((await readRecord(rebooted))?.state, "failed");
});

// Before R-027 the reaper wrote `failed` first and ended the scope after it, so the engine ran on under `failed`.
test("A-005: a job whose wrapper was killed alone stays running until its scope is gone, then ends failed with what was checked", async (t) => {
	const { jobs, folder, cgroups } = await jobsFolder(t);
	const wrapper = await killedWrapper(t);
	const id = "2026-11-22-killed-1a2b3c4d";
	const scope = scopeOf(cgroups, id);
	const job = await running(jobs, id, wrapper, { scope });
	const atTerm = join(folder, "state-at-term");
	const engine = await scopeProcess(t, scope.cgroup, READS_STATE_AT_TERM, [join(job, "record.json"), atTerm]);
	await reapConfirmed(jobs);
	assert.deepEqual(
		{
			atTerm: existsSync(atTerm) ? readFileSync(atTerm, "utf8") : "no TERM",
			state: (await readRecord(job))?.state,
			failed: logged(job, "failed: "),
			engine: await engine.end(),
		},
		{
			atTerm: "running",
			state: "failed",
			failed: [
				`failed: process group gone: wrapper ${wrapper.pid} is not running; scope ${scope.unit} ended after TERM`,
			],
			engine: "exit 0",
		},
	);
});

/**
 * A running job whose wrapper was killed alone and whose scope holds an engine that ignores TERM, under a grace of
 * 200 ms, so that only the reaper's KILL ends the scope; `ignored` is the file the engine marks at each TERM.
 */
async function deafJob(t: TestContext) {
	const { jobs, folder, cgroups } = await jobsFolder(t);
	withEnvironment(t, { LIMEN_STOP_GRACE_MS: "200" });
	const wrapper = await killedWrapper(t);
	const id = "2026-11-22-deaf-1a2b3c4d";
	const scope = scopeOf(cgroups, id);
	const job = await running(jobs, id, wrapper, { scope });
	const ignored = join(folder, "term-ignored");
	const engine = await scopeProcess(t, scope.cgroup, IGNORES_TERM, [ignored]);
	return { jobs, cgroups, wrapper, scope, job, ignored, engine };
}

test("A-005: the reaper ends a scope whose engine ignores TERM by KILL once the grace passed", async (t) => {
	const { jobs, wrapper, scope, job, ignored, engine } = await deafJob(t);
	await reapConfirmed(jobs);
	assert.deepEqual(
		{ ignored: existsSync(ignored), engine: await engine.end(), failed: logged(job, "failed: ") },
		{
			ignored: true,
			engine: "SIGKILL",
			failed: [
				`failed: process group gone: wrapper ${wrapper.pid} is not running; scope ${scope.unit} ended after KILL`,
			],
		},
	);
});

// The KILL removes the scope's folder with its readings, so the record holds what the reaper read before the TERM.
test("the record of a reaped job holds the scope's readings taken before the TERM, though the KILL removed the scope's folder", async (t) => {
	const { jobs, cgroups, scope, job } = await deafJob(t);
	await reapConfirmed(jobs);
	assert.deepEqual(
		{ scope: (await readRecord(job))?.scope, folder: existsSync(join(cgroups, scope.cgroup)) },
		{ scope: { ...scope, ...SCOPE_READINGS }, folder: false },
	);
});

// T-01: before R-027 the reaper wrote `failed` and only logged that the scope was not ended, which may hold the engine;
// R-032 counts each attempt in the record's `stuck`, which nothing else of the record changes with.
test("a reap whose scope the user manager cannot read leaves the job running with one log line and one more stuck attempt each time, and tries again once confirmed", async (t) => {
	const { jobs, folder, cgroups } = await jobsFolder(t);
	const wrapper = await killedWrapper(t);
	const id = "2026-11-22-unread-1a2b3c4d";
	const scope = scopeOf(cgroups, id);
	const job = await running(jobs, id, wrapper, { scope });
	// After the tests' systemd, whose setting of PATH the test's environment puts back after the test.
	process.env.PATH = `${await failingSystemctl(folder)}:${process.env.PATH ?? ""}`;
	const before = await readRecord(job);
	const seen = new Map<string, number>();
	const now = Date.now();
	await reapConfirmed(jobs, seen, now);
	// A pass within the new confirmation makes no attempt.
	await reapDeadJobs(jobs, seen, now + 12_000);
	const first = logged(job, "reap: ");
	await reapDeadJobs(jobs, seen, now + 23_000);
	const line = `reap: ${scope.unit} not ended: Failed to connect to bus: No medium found`;
	const after = await readRecord(job);
	const stuck = { since: after?.stuck?.since ?? "", attempts: 2, detail: line.slice("reap: ".length) };
	assert.deepEqual(
		{ first, record: after, claim: existsSync(join(job, "terminal")), lines: logged(job, "reap: ") },
		{ first: [line], record: before && { ...before, stuck }, claim: false, lines: [line, line] },
	);
});

/**
 * A folder below `parent` whose systemctl fails the call that sends SIGTERM to a scope, as a user manager that does not
 * answer in time fails it, and passes every other call to the systemctl that `path` finds.
 */
function failingTerm(parent: string, path: string): string {
	const folder = join(parent, "failing-term");
	mkdirSync(folder);
	const script = [
		"#!/bin/sh",
		'if [ "$2" = kill ] && [ "$3" = --signal=SIGTERM ]; then',
		'\techo "Failed to kill unit $4: Connection timed out" >&2',
		"\texit 1",
		"fi",
		`PATH='${path}' exec systemctl "$@"`,
	];
	writeFileSync(join(folder, "systemctl"), `${script.join("\n")}\n`, { mode: 0o755 });
	return folder;
}

// T-01: before the first round of fixes, a TERM whose call failed left no trace once the KILL had ended the scope.
test("a reap whose TERM to the scope fails names that failure in the line that ends the job", async (t) => {
	const { jobs, folder, cgroups } = await jobsFolder(t);
	const wrapper = await killedWrapper(t);
	const id = "2026-11-22-noterm-1a2b3c4d";
	const scope = scopeOf(cgroups, id);
	const job = await running(jobs, id, wrapper, { scope });
	await scopeProcess(t, scope.cgroup);
	// After the tests' systemd, whose setting of PATH the test's environment puts back after the test.
	const path = process.env.PATH ?? "";
	process.env.PATH = `${failingTerm(folder, path)}:${path}`;
	await reapConfirmed(jobs);
	const term = `SIGTERM failed: Failed to kill unit ${scope.unit}: Connection timed out`;
	assert.deepEqual(logged(job, "failed: "), [
		`failed: process group gone: wrapper ${wrapper.pid} is not running; scope ${scope.unit} ended after KILL; ${term}`,
	]);
});

/** A process group whose leader, standing for the wrapper, has exited while the member it started runs on. */
async function orphanedGroup(t: TestContext): Promise<{ readonly leader: number; readonly member: number }> {
	const shell = spawn("sh", ["-c", "sleep 600 >/dev/null 2>&1 & echo $!"], {
		detached: true,
		stdio: ["ignore", "pipe", "ignore"],
	});
	let said = "";
	shell.stdout.on("data", (chunk: Buffer) => {
		said += chunk.toString();
	});
	await once(shell, "close");
	const leader = shell.pid ?? 0;
	t.after(() => platform.signalProcessGroup(leader, "SIGKILL"));
	return { leader, member: Number(said.trim()) };
}

// A record without a scope was written before R-026; the wrapper's process group is the only container it names. The
// recorded start time is one no process at that pid had: the leader has exited.
test("A-005: the reaper ends a running job without a scope by its wrapper's process group, which outlived the wrapper", async (t) => {
	const { jobs } = await jobsFolder(t);
	const { leader, member } = await orphanedGroup(t);
	assert.ok(platform.processGroupAlive(leader), "the group outlives its leader");
	const job = await running(jobs, "2026-11-22-group-1a2b3c4d", {
		pid: leader,
		born: "1",
		bootId: platform.bootId() ?? null,
	});
	await reapConfirmed(jobs);
	assert.deepEqual(
		{
			failed: logged(job, "failed: "),
			group: platform.processGroupAlive(leader),
			member: (await platform.processInfo(member)).kind,
		},
		{
			failed: [`failed: process group gone: wrapper ${leader} is not running; group ${leader} ended after TERM`],
			group: false,
			member: "absent",
		},
	);
});

// z. 14: a process at the recorded pid whose start time the record lacks may be the wrapper or a stranger that leads a
// group of its own, so the reaper signals no group it cannot tell apart, and the job stays running (T-01).
test("the reaper leaves running a job without a scope whose wrapper's pid runs a process it cannot tell from the wrapper", async (t) => {
	const { jobs } = await jobsFolder(t);
	const job = await running(jobs, "2026-11-22-unknown-1a2b3c4d", {
		pid: process.pid,
		born: null,
		bootId: platform.bootId() ?? null,
	});
	await reapConfirmed(jobs);
	assert.deepEqual(
		{ state: (await readRecord(job))?.state, lines: logged(job, "reap: ") },
		{
			state: "running",
			lines: [`reap: group ${process.pid} not ended: pid ${process.pid} runs a process that may be the wrapper`],
		},
	);
});

/** Writes the `cgroup.events` the kernel keeps in the folder of the cgroup `cgroup`, populated or not. */
function cgroupEvents(cgroups: string, cgroup: string, populated: boolean): void {
	writeFileSync(join(cgroups, cgroup, "cgroup.events"), `populated ${populated ? 1 : 0}\nfrozen 0\n`);
}

// R-027 Out of scope, R-032 (c): a wrapper killed alone leaves its engine in the job's scope, so the callers outside
// the reaper ask whether the job holds any process; the reaper asks about the wrapper alone, since it ends the scope.
test("R-032: a running job whose wrapper is dead holds processes while its scope's cgroup is populated, though liveJob says it is not live", async (t) => {
	const { jobs, cgroups } = await jobsFolder(t);
	const id = "2026-11-24-engine-1a2b3c4d";
	const scope = scopeOf(cgroups, id);
	const job = await running(jobs, id, await killedWrapper(t), { scope });
	cgroupEvents(cgroups, scope.cgroup, true);
	const record = await readRecord(job);
	const whileEngine = [await holdsProcesses(record), await liveJob(record), await folderLive(job)];
	cgroupEvents(cgroups, scope.cgroup, false);
	assert.deepEqual(
		[whileEngine, await holdsProcesses(record), await folderLive(job)],
		[[true, false, true], false, false],
	);
});

// R-032 review round 1, note 7: the deployment's gate runs as root, whose user manager calls an agents' scope inactive.
test("R-032: holdsProcesses asks the cgroup, not a user manager: a populated scope holds processes while systemctl says inactive", async (t) => {
	const { jobs, folder, cgroups } = await jobsFolder(t);
	const id = "2026-11-24-root-1a2b3c4d";
	const scope = scopeOf(cgroups, id);
	const job = await running(jobs, id, await killedWrapper(t), { scope });
	cgroupEvents(cgroups, scope.cgroup, true);
	const inactive = join(folder, "inactive");
	mkdirSync(inactive);
	writeFileSync(join(inactive, "systemctl"), "#!/bin/sh\necho inactive\nexit 3\n", { mode: 0o755 });
	process.env.PATH = `${inactive}:${process.env.PATH ?? ""}`;
	assert.deepEqual(
		[platform.scopeState(scope.unit, scope.cgroup), await holdsProcesses(await readRecord(job))],
		[{ kind: "gone" }, true],
	);
});

test("R-032: a running job whose wrapper is dead holds processes when its scope's cgroup.events does not read, and none when its folder is gone", async (t) => {
	const { jobs, cgroups } = await jobsFolder(t);
	const id = "2026-11-24-unread-1a2b3c4d";
	const scope = scopeOf(cgroups, id);
	const job = await running(jobs, id, await killedWrapper(t), { scope });
	const unread = await holdsProcesses(await readRecord(job));
	rmSync(join(cgroups, scope.cgroup), { recursive: true });
	assert.deepEqual([unread, await holdsProcesses(await readRecord(job))], [true, false]);
});
