// U9: a recorded process is the same process only while its pid, its start time and its boot all match (A-056). The
// reaper treats a stranger (a recycled pid with another start time), another boot and a missing identity as a dead
// owner.
import assert from "node:assert/strict";
import { spawn } from "node:child_process";
import { once } from "node:events";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test, { type TestContext } from "node:test";
import { type Identity, readRecord } from "../src/job/record.ts";
import { platform } from "../src/platform/platform.ts";
import { ownerState, reapDeadJobs } from "../src/runtime/reap.ts";
import { withEnvironment } from "./environment.ts";
import { fakeSystemd, writeRecord } from "./plant.ts";

/** A sleeping child, its exit and its recorded identity; the test kills it when it ends. */
async function sleeper(t: TestContext) {
	const code = "Atomics.wait(new Int32Array(new SharedArrayBuffer(4)), 0, 0)";
	const child = spawn(process.execPath, ["-e", code], { stdio: "ignore" });
	t.after(() => child.kill("SIGKILL"));
	const [exited, info] = [once(child, "exit"), await platform.processInfo(child.pid ?? 0)];
	assert.ok(info.kind === "present", "the child is present");
	return { child, exited, info };
}

/**
 * A jobs folder in the OS temporary folder, removed after the test. The reaper ends each job's systemd user scope, so
 * the test runs with the tests' systemd (test/plant.ts), never the machine's.
 */
async function jobsFolder(t: TestContext): Promise<string> {
	const jobs = await mkdtemp(join(tmpdir(), "u9-jobs-"));
	const systemd = await mkdtemp(join(tmpdir(), "u9-systemd-"));
	t.after(() => Promise.all([jobs, systemd].map((folder) => rm(folder, { recursive: true, force: true }))));
	withEnvironment(t, await fakeSystemd(systemd));
	return jobs;
}

/** A running job's record under `jobs` with the identity `identity`, started at `startedAt`. */
async function running(jobs: string, id: string, identity: Identity | null, startedAt = new Date()): Promise<string> {
	const dir = join(jobs, id);
	await writeRecord(dir, { state: "running", identity, startedAt: startedAt.toISOString() });
	return dir;
}

/** This process's identity, as the transition to running records it. */
async function own(): Promise<Identity> {
	const info = await platform.processInfo(process.pid);
	assert.ok(info.kind === "present", "this process is present");
	return { pid: process.pid, born: info.process.born, bootId: platform.bootId() ?? null };
}

test("the reaper keeps a live owner and finalizes a dead owner and a stranger at its pid", async (t) => {
	const jobs = await jobsFolder(t);
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

test("A-056: a missing identity, or a pid without its start time, is unknown and never alive", async () => {
	const self = await own();
	assert.equal(await ownerState(null), "unknown");
	assert.equal(await ownerState({ ...self, born: null }), "unknown", "a live pid without its start time");
});

// The transition to running writes the identity in the same write as the state, so no startup grace keeps it alive.
test("A-056: the reaper ends a running job whose identity is unknown once confirmed, also one that started just now", async (t) => {
	const jobs = await jobsFolder(t);
	const young = await running(jobs, "young", null);
	const pidOnly = await running(jobs, "pid-only", { ...(await own()), born: null });
	const seen = new Map<string, number>();
	const now = Date.now();
	await reapDeadJobs(jobs, seen, now);
	assert.deepEqual([(await readRecord(young))?.state, (await readRecord(pidOnly))?.state], ["running", "running"]);
	await reapDeadJobs(jobs, seen, now + 11_000);
	assert.deepEqual([(await readRecord(young))?.state, (await readRecord(pidOnly))?.state], ["failed", "failed"]);
});

const OTHER_BOOT = "00000000-0000-4000-8000-000000000000";

test("a recorded boot id that is not the current boot makes the owner dead, though its pid and start time match", async (t) => {
	const self = await own();
	if (self.bootId === null) {
		t.skip("the system gives no boot id");
		return;
	}
	assert.equal(await ownerState(self), "alive");
	assert.equal(await ownerState({ ...self, bootId: OTHER_BOOT }), "dead");
});

test("the reaper ends a running job whose recorded boot id is not the current boot", async (t) => {
	const self = await own();
	if (self.bootId === null) {
		t.skip("the system gives no boot id");
		return;
	}
	const jobs = await jobsFolder(t);
	const rebooted = await running(jobs, "rebooted", { ...self, bootId: OTHER_BOOT });
	const seen = new Map<string, number>();
	await reapDeadJobs(jobs, seen, Date.now() + 1_000);
	await reapDeadJobs(jobs, seen, Date.now() + 12_000);
	assert.equal((await readRecord(rebooted))?.state, "failed");
});
