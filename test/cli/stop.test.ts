// `limen stop` (src/job/stopping.ts) on a job named approximately, and on a job whose wrapper moves it from starting
// to running while the stop runs.
import assert from "node:assert/strict";
import { spawn } from "node:child_process";
import { once } from "node:events";
import { existsSync, readFileSync } from "node:fs";
import { mkdtemp, readFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";
import { readRecord } from "../../src/job/record.ts";
import { stopJob } from "../../src/job/stopping.ts";
import { withLock } from "../../src/lock.ts";
import { platform } from "../../src/platform/platform.ts";
import { readOutcome } from "../final-line.ts";
import { jobDir, limen, plant, repository, until, writeRecord } from "../plant.ts";

const ID = "2026-11-21-stop-1a2b3c4d";

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
	// The test holds the job's lock, so the stop's terminal transition waits until the wrapper has moved to running.
	let locked!: () => void;
	let free!: () => void;
	const held = new Promise<void>((resolve) => {
		locked = resolve;
	});
	const lock = withLock({ folder: job }, async () => {
		locked();
		await new Promise<void>((resolve) => {
			free = resolve;
		});
	});
	await held;
	const stopping = stopJob(ID, "", root);
	await until(
		job,
		() => existsSync(join(job, "log")) && readFileSync(join(job, "log"), "utf8").includes("stop requested"),
	);
	await writeRecord(job, {
		state: "running",
		label: "demo",
		identity: { pid: info.process.pid, born: info.process.born, bootId: platform.bootId() ?? null },
		startedAt: new Date().toISOString(),
	});
	free();
	await lock;
	await stopping;
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

test("JOB_NOT_EXACT: stop with a job's label exits 2, names the command with the token in next and leaves the record byte-identical", async (t) => {
	const p = await plant();
	t.after(p.cleanup);
	const record = join(jobDir(p, ID), "record.json");
	await writeRecord(jobDir(p, ID), { state: "starting", label: "demo", spawnerPid: process.pid });
	const before = await readFile(record);
	const run = limen(p, ["stop", "demo", "not needed"]);
	assert.equal(run.status, 2, run.stderr);
	assert.deepEqual(readOutcome(run), {
		class: "usage",
		code: "JOB_NOT_EXACT",
		next: "limen stop 1a2b3c4d 'not needed'",
	});
	assert.deepEqual(await readFile(record), before);
});
