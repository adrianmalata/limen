// `limen continue` run from a subdirectory of the project finds the project and continues the parent job there.
import assert from "node:assert/strict";
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
