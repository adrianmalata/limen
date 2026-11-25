// src/runtime/retiring.ts on a plant: retire takes a finished job only once its marker is at least 24 hours old, so the
// owed wakes and alerts of its end go out first, and it moves the job's folder only under the job's own lock, which it
// does not wait for.
import assert from "node:assert/strict";
import { existsSync } from "node:fs";
import { join } from "node:path";
import { type TestContext, test } from "node:test";
import { withLock } from "../../src/lock.ts";
import { retireMarkedJobs } from "../../src/runtime/retiring.ts";
import { jobDir, type Plant, plant, writeRecord } from "../plant.ts";

const HOUR = 60 * 60_000;

/** A fresh plant, removed after the test. */
async function fresh(t: TestContext): Promise<Plant> {
	const p = await plant();
	t.after(() => p.cleanup());
	return p;
}

/** A done job of the plant with no branch and no worktree, whose `abandoned` marker is `hoursAgo` hours old. */
async function abandonedJob(p: Plant, id: string, hoursAgo: number): Promise<string> {
	const at = new Date(Date.now() - hoursAgo * HOUR).toISOString();
	const abandoned = { branch: `limen/abandon/${id}`, commit: "2".repeat(40), at };
	await writeRecord(jobDir(p, id), { state: "done", startedAt: at, finishedAt: at, abandoned });
	return at;
}

// D-097 (4) (g), R-031 open point 4: a job retired at once lost the completion wake and the alert of its end, which the
// hooks, the sweep and the alerts read from `.limen/jobs/` only.
test("retire keeps a job whose marker is younger than 24 hours and moves one whose marker is older", async (t) => {
	const p = await fresh(t);
	const [young, old] = ["2026-11-24-young-1a2b3c4d", "2026-11-23-old-5e6f7a8b"];
	await abandonedJob(p, young, 23);
	const at = await abandonedJob(p, old, 25);
	const { retired } = await retireMarkedJobs(p.root);
	const to = join(".limen", "archive", at.slice(0, 7), old);
	assert.deepEqual(
		[retired, existsSync(jobDir(p, young)), existsSync(jobDir(p, old)), existsSync(join(p.root, to))],
		[[{ id: old, to }], true, false, true],
	);
});

// D-097 (4) (h), R-031 review round 1, finding 8: retire renamed a job's folder while a marker write held its lock.
// R-101 review round 1, F5: retire takes that lock with one attempt, so it names the job as held instead of waiting.
test("retire moves a job's folder only under the job's own lock, so while another process holds it the job stays", async (t) => {
	const p = await fresh(t);
	const id = "2026-11-23-held-1a2b3c4d";
	const at = await abandonedJob(p, id, 25);
	const whileHeld = await withLock({ folder: jobDir(p, id) }, () => retireMarkedJobs(p.root));
	assert.deepEqual(
		[
			whileHeld.retired,
			whileHeld.held,
			existsSync(join(jobDir(p, id), "record.json")),
			existsSync(join(p.root, ".limen", "archive", at.slice(0, 7), id)),
		],
		[[], [id], true, false],
	);
	const { retired } = await retireMarkedJobs(p.root);
	assert.deepEqual(
		retired.map((job) => job.id),
		[id],
	);
});

// D-096 (3) (h), R-103: a land run again goes on from the job's folder, so retire leaves a land with steps left.
test("retire keeps a landed job whose land has not recorded its cleaned step, and moves it once the step is recorded", async (t) => {
	const p = await fresh(t);
	const id = "2026-11-23-landing-1a2b3c4d";
	const at = new Date(Date.now() - 25 * HOUR).toISOString();
	const landed = { sha: "3".repeat(40), at };
	const closed = { sha: "4".repeat(40), at };
	await writeRecord(jobDir(p, id), { state: "done", startedAt: at, finishedAt: at, landed, land: { closed } });
	const kept = await retireMarkedJobs(p.root);
	await writeRecord(jobDir(p, id), {
		state: "done",
		startedAt: at,
		finishedAt: at,
		landed,
		land: { closed, cleaned: { at } },
	});
	const moved = await retireMarkedJobs(p.root);
	assert.deepEqual([kept.retired, moved.retired.map((job) => job.id)], [[], [id]]);
});
