// `limen keeper`: the jobs it reads for its task, named by a job argument and through a group.
import assert from "node:assert/strict";
import { mkdir, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { test } from "node:test";
import { git, jobDir, jobFile, limen, plant, routed, startedJob, TICKET, waitJob, writeRecord } from "../plant.ts";

// R-022 (`review.md` → Round 3): the keeper keyed its queries by the word given, so a job named by its token and as a
// member of its group was read twice and stood twice in the keeper's task.
test("keeper reads a job once when the command names it by its token and through its group", async (t) => {
	const p = await plant();
	t.after(() => p.cleanup());
	const id = "2026-11-21-f001-demo-1a2b3c4d";
	const branch = "limen/f001-demo";
	git(p.root, "branch", branch);
	// A finished job with no process identity, so no live owner holds it back.
	await writeRecord(jobDir(p, id), { state: "done", label: "F001 demo", branch });
	const group = join(p.root, ".limen", "groups", "g1");
	await mkdir(group, { recursive: true });
	const member = { id, team: "a", role: "coordinator", deadline: 0 };
	await writeFile(join(group, "run.json"), `${JSON.stringify({ id: "g1", members: [member] })}\n`);
	const run = limen(p, ["keeper", TICKET, ...routed(["--job", "1a2b3c4d", "--group", "g1", "--candidate", branch])]);
	const keeper = startedJob(run);
	waitJob(p, keeper);
	const blocks = jobFile(p, keeper, "task.md")
		.split("\n")
		.filter((line) => line.startsWith("Job: "));
	assert.deepEqual(blocks, [`Job: ${id}`]);
});
