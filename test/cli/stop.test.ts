// `limen stop` (src/job/stopping.ts) on a job named approximately, on a running job with no pid, and on a job whose
// wrapper moves it from starting to running while the stop runs.
import assert from "node:assert/strict";
import { spawn } from "node:child_process";
import { once } from "node:events";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";
import { readRecord } from "../../src/job/record.ts";
import { stopJob } from "../../src/job/stopping.ts";
import { platform } from "../../src/platform/platform.ts";
import { readOutcome } from "../final-line.ts";
import { jobDir, limen, plant, repository, writeRecord } from "../plant.ts";
import { snapshot } from "../snapshot.ts";

const ID = "2026-11-21-stop-1a2b3c4d";

// The stop read `starting`, wrote its first line, and the wrapper won the race to running before the stop's terminal
// transition: the seam `requested` (D-029) runs in that window, so the stop must find the job running and signal it.
test("a stop that read a starting job, whose wrapper then won the race to running, signals the wrapper as for a running job", async (t) => {
	const root = await mkdtemp(join(tmpdir(), "limen-stop-"));
	t.after(() => rm(root, { recursive: true, force: true }));
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
	const root = await mkdtemp(join(tmpdir(), "limen-stop-"));
	t.after(() => rm(root, { recursive: true, force: true }));
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
