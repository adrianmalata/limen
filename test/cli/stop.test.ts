// `limen stop` (src/job/stopping.ts) on a job named approximately, on a running job with no pid, on a job whose
// wrapper moves it from starting to running while the stop runs, and the stop request it records in a running job.
import assert from "node:assert/strict";
import { spawn } from "node:child_process";
import { once } from "node:events";
import { existsSync } from "node:fs";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test, { type TestContext } from "node:test";
import { isTerminal } from "../../src/job/job.ts";
import { readRecord } from "../../src/job/record.ts";
import { stopJob } from "../../src/job/stopping.ts";
import { platform } from "../../src/platform/platform.ts";
import { withEnvironment } from "../environment.ts";
import { readOutcome } from "../final-line.ts";
import {
	fakeSystemd,
	jobDir,
	jobFile,
	jobRecord,
	jobState,
	limen,
	type Plant,
	plant,
	repository,
	spawnJob,
	until,
	waitJob,
	writeRecord,
} from "../plant.ts";
import { snapshot } from "../snapshot.ts";

const ID = "2026-11-21-stop-1a2b3c4d";

/**
 * A folder for a project in the OS temporary folder, removed after the test. A stop that ends a job ends its systemd
 * user scope, so the test runs with the tests' systemd (test/plant.ts), never the machine's.
 */
async function project(t: TestContext): Promise<string> {
	const root = await mkdtemp(join(tmpdir(), "limen-stop-"));
	const systemd = await mkdtemp(join(tmpdir(), "limen-stop-systemd-"));
	t.after(() => Promise.all([root, systemd].map((folder) => rm(folder, { recursive: true, force: true }))));
	withEnvironment(t, await fakeSystemd(systemd));
	return root;
}

// The stop read `starting`, wrote its first line, and the wrapper won the race to running before the stop's terminal
// transition: the seam `requested` (D-029) runs in that window, so the stop must find the job running and signal it.
test("a stop that read a starting job, whose wrapper then won the race to running, signals the wrapper as for a running job", async (t) => {
	const root = await project(t);
	await repository(root);
	const job = join(root, ".limen", "jobs", ID);
	await writeRecord(job, { state: "starting", label: "demo", spawnerPid: process.pid });
	// The wrapper stands in as a sleeping child in its own process group, which the stop signals.
	const wrapper = spawn(process.execPath, ["-e", "Atomics.wait(new Int32Array(new SharedArrayBuffer(4)), 0, 0)"], {
		detached: true,
		stdio: "ignore",
	});
	t.after(() => wrapper.kill("SIGKILL"));
	const exited = once(wrapper, "exit");
	const info = await platform.processInfo(wrapper.pid ?? 0);
	assert.ok(info.kind === "present", "the wrapper is present");
	await stopJob(ID, "", root, {
		requested: () =>
			writeRecord(job, {
				state: "running",
				label: "demo",
				identity: { pid: info.process.pid, born: info.process.born, bootId: platform.bootId() ?? null },
				startedAt: new Date().toISOString(),
			}),
	});
	let timer: NodeJS.Timeout | undefined;
	const signal = await Promise.race([
		exited.then(([, code]) => String(code)),
		new Promise<string>((resolve) => {
			timer = setTimeout(() => resolve("still running"), 3_000);
		}),
	]);
	clearTimeout(timer);
	assert.deepEqual([signal, (await readRecord(job))?.state], ["SIGTERM", "stopped"]);
});

/** The terminal lines of the job's log: one per job, from the finisher that won (A-019). */
function terminalLines(p: Plant, id: string): string[] {
	return jobFile(p, id, "log").match(/\] (?:done|failed|stopped): .*/g) ?? [];
}

/** A running job of a fresh plant whose engine waits at its first `block`, and the plant, removed after the test. */
async function blockedJob(t: TestContext): Promise<{ readonly p: Plant; readonly id: string }> {
	const p = await plant();
	t.after(() => p.cleanup());
	const id = spawnJob(p, "block");
	await until(jobDir(p, id), () => existsSync(join(jobDir(p, id), "fake-blocked-1")));
	return { p, id };
}

// A-052: the wrapper tells a stop from any other TERM only by the request in the record; before, only a queued job's
// stop wrote it, and a running job's request was a log line alone.
test("limen stop of a running job records its reason as the job's stop request and ends the job stopped with it", async (t) => {
	const { p, id } = await blockedJob(t);
	const run = limen(p, ["stop", id, "the ticket changed"]);
	assert.equal(run.status, 0, run.stderr);
	assert.equal(waitJob(p, id), "stopped");
	assert.deepEqual(
		[jobRecord(p, id)?.stopRequested, jobRecord(p, id)?.failure, terminalLines(p, id)],
		["the ticket changed", null, ["] stopped: the ticket changed"]],
	);
});

// A-019: the first finisher wins, so the wrapper that ends the job first must end it as the stop asked; before, its own
// detail replaced the stop's reason, and a `done:` stop ended `stopped`. The seam `signalled` (D-029) holds the stop
// after its TERM until the wrapper has ended the job.
test("a done: stop of a running job whose wrapper ends the job first ends it done, with the stop's reason", async (t) => {
	const { p, id } = await blockedJob(t);
	// The stop runs in this process, so it gets the plant's environment: its systemd, its seat folder and no Herdr.
	withEnvironment(t, {
		PATH: p.env.PATH ?? "",
		LIMEN_HOME: p.env.LIMEN_HOME ?? "",
		LIMEN_HERDR: "0",
		LIMEN_HUNK: "0",
		LIMEN_CGROUP_ROOT: p.env.LIMEN_CGROUP_ROOT ?? "",
	});
	const ended = () => until(jobDir(p, id), () => isTerminal(jobState(p, id)));
	const line = await stopJob(id, "done: accepted", p.root, { signalled: ended });
	assert.equal(waitJob(p, id), "done");
	assert.deepEqual(
		[line, jobRecord(p, id)?.stopRequested, terminalLines(p, id)],
		[`${id} is already done`, "done: accepted", ["] done: done: accepted"]],
	);
});

test("JOB_NOT_EXACT: stop with a job's label exits 2, names the command with the token in next and leaves the snapshot identical", async (t) => {
	const p = await plant();
	t.after(p.cleanup);
	await writeRecord(jobDir(p, ID), { state: "starting", label: "demo", spawnerPid: process.pid });
	const before = snapshot(p.root);
	const run = limen(p, ["stop", "demo", "not needed"]);
	assert.equal(run.status, 2, run.stderr);
	assert.deepEqual(readOutcome(run), {
		class: "usage",
		code: "JOB_NOT_EXACT",
		next: "limen stop 1a2b3c4d 'not needed'",
	});
	assert.deepEqual(snapshot(p.root), before);
});

// Before R-092 the stop appended its "stop requested" line to the job's log before it found no pid.
test("JOB_NO_PID: stop of a running job whose record has no pid exits 1 and leaves the snapshot identical", async (t) => {
	const p = await plant();
	t.after(p.cleanup);
	await writeRecord(jobDir(p, ID), { state: "running", label: "demo", startedAt: new Date().toISOString() });
	const before = snapshot(p.root);
	const run = limen(p, ["stop", ID, "no pid"]);
	assert.deepEqual([run.status, readOutcome(run).code, snapshot(p.root)], [1, "JOB_NO_PID", before], run.stderr);
});

// T-37: the failure after the stop's first write names the same stop, which reads the job again.
test("JOB_PID_PENDING: a stop whose job moved to running with no pid after its first write exits 3 and names the same stop in next", async (t) => {
	const root = await project(t);
	await repository(root);
	const job = join(root, ".limen", "jobs", ID);
	await writeRecord(job, { state: "starting", label: "demo", spawnerPid: process.pid });
	const again = `limen stop ${ID}`;
	const stopping = stopJob(
		ID,
		"",
		root,
		{ requested: () => writeRecord(job, { state: "running", label: "demo" }) },
		again,
	);
	await assert.rejects(stopping, { class: "transient", code: "JOB_PID_PENDING", next: again });
});
