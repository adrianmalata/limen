// src/commands/land.ts: `limen land` through the CLI.
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { join } from "node:path";
import test from "node:test";
import { readOutcome } from "../final-line.ts";
import { jobDir, limen, plant, writeRecord } from "../plant.ts";

const ID = "2026-11-21-land-label-5e6f7a8b";

test("JOB_NOT_EXACT: land with a job's label exits 2, names the command with the token in next and leaves the record byte-identical", async (t) => {
	const p = await plant();
	t.after(p.cleanup);
	const record = join(jobDir(p, ID), "record.json");
	await writeRecord(jobDir(p, ID), { state: "done", label: "F001 demo work", branch: "main", base: "HEAD" });
	const before = await readFile(record);
	const run = limen(p, ["land", "F001 demo work", "--yes"]);
	assert.equal(run.status, 2, run.stderr);
	assert.deepEqual(readOutcome(run), { class: "usage", code: "JOB_NOT_EXACT", next: "limen land 5e6f7a8b --yes" });
	assert.deepEqual(await readFile(record), before);
});
