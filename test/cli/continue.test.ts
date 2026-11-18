// `limen continue`: it finds the project from a subdirectory, and it refuses a parent whose engine was removed.
import assert from "node:assert/strict";
import { readdirSync, rmSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { test } from "node:test";
import { isTerminal } from "../../src/job/job.ts";
import { jobDir, jobFile, limen, type Plant, plant, spawnJob, until } from "../plant.ts";

/** Resolves once the job's `state` is terminal, the commit point of its record. */
function ended(p: Plant, id: string): Promise<void> {
	return until(jobDir(p, id), () => isTerminal(jobFile(p, id, "state")));
}

test("a continuation started from a subdirectory of the project continues its parent and ends done", async (t) => {
	const p = await plant();
	t.after(() => p.cleanup());
	const parent = spawnJob(p, "commit");
	await ended(p, parent);
	const run = limen(p, ["continue", parent, "say continued"], { cwd: join(p.root, "spec") });
	assert.equal(run.status, 0, run.stderr);
	const id = run.stdout.trim().split("\n").at(-1) ?? "";
	await ended(p, id);
	assert.deepEqual([jobFile(p, id, "parent"), jobFile(p, id, "state")], [parent, "done"]);
});

test("limen continue of a finished job recorded with the removed engine devin refuses with its line and starts no job", async (t) => {
	const p = await plant();
	t.after(() => p.cleanup());
	const parent = spawnJob(p, "commit");
	await ended(p, parent);
	// A Devin job's record names its engine and holds no session transcript, as the cut wrapper wrote it.
	const dir = jobDir(p, parent);
	writeFileSync(join(dir, "engine"), "devin\n");
	for (const name of readdirSync(join(dir, "session"))) {
		rmSync(join(dir, "session", name), { recursive: true });
	}
	const run = limen(p, ["continue", parent, "say continued"]);
	assert.notEqual(run.status, 0, run.stdout);
	assert.equal(run.stderr, "engine devin was removed with Devin cloud jobs (R-003); use --engine pi\n");
	assert.deepEqual(readdirSync(join(p.root, ".limen/jobs")), [parent]);
});
