// U9: a recorded process is the same process only while its pid, its start time and its boot all match (A-056). A
// recycled pid with another start time is a stranger: containment never signals it and names it in the cleanup note;
// the recorded process is signaled. The reaper treats a stranger, another boot and a missing identity as a dead owner.
import assert from "node:assert/strict";
import { spawn } from "node:child_process";
import { once } from "node:events";
import { mkdtemp, readFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test, { type TestContext } from "node:test";
import { type Identity, readRecord } from "../src/job/record.ts";
import { platform } from "../src/platform/platform.ts";
import { containEscapedDescendants } from "../src/runtime/contain.ts";
import { ownerState, reapDeadJobs } from "../src/runtime/reap.ts";
import { writeRecord } from "./plant.ts";

/** A sleeping child, its exit and its recorded identity; the test kills it when it ends. */
async function sleeper(t: TestContext, detached: boolean) {
	const code = "Atomics.wait(new Int32Array(new SharedArrayBuffer(4)), 0, 0)";
	const child = spawn(process.execPath, ["-e", code], { detached, stdio: "ignore" });
	t.after(() => child.kill("SIGKILL"));
	const [exited, info] = [once(child, "exit"), await platform.processInfo(child.pid ?? 0)];
	assert.ok(info.kind === "present", "the child is present");
	return { child, exited, info };
}

/** A jobs folder in the OS temporary folder, removed after the test. */
async function jobsFolder(t: TestContext): Promise<string> {
	const jobs = await mkdtemp(join(tmpdir(), "u9-jobs-"));
	t.after(() => rm(jobs, { recursive: true, force: true }));
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

test("a recycled pid with another birth is never signaled and is named for cleanup; the recorded birth is signaled", async (t) => {
	const job = await mkdtemp(join(tmpdir(), "u9-"));
	t.after(() => rm(job, { recursive: true, force: true }));
	const { child, exited, info } = await sleeper(t, true);
	await containEscapedDescendants(job, [{ ...info.process, born: "0.000000" }], "u9");
	assert.deepEqual([child.exitCode, child.signalCode], [null, null], "the stranger is still running");
	assert.match(await readFile(join(job, "cleanup"), "utf8"), new RegExp(`^${info.process.pid} 0\\.000000 `, "m"));
	await containEscapedDescendants(job, [info.process], "u9");
	assert.deepEqual(await exited, [null, "SIGTERM"]);
});

test("the reaper keeps a live owner and finalizes a dead owner and a stranger at its pid", async (t) => {
	const jobs = await jobsFolder(t);
	const { child, exited, info } = await sleeper(t, false);
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
