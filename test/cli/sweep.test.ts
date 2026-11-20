// `limen sweep`: one pass over every registered project, here the seat event of a finished job.
import assert from "node:assert/strict";
import { existsSync, mkdirSync, readdirSync, utimesSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { test } from "node:test";
import { limen, plant } from "../plant.ts";

// A temp of src/atomic-write.ts sits beside its target until the link; a leftover one, after a crash, stays.
test("limen sweep rings for a finished job whose delivered folder holds only the temp of a delivery write", async (t) => {
	const p = await plant();
	t.after(() => p.cleanup());
	const job = join(p.root, ".limen/jobs/2026-11-20-sweep-1a2b3c4d");
	mkdirSync(join(job, "notify", "delivered"), { recursive: true });
	writeFileSync(join(job, "notify", "delivered", "session-a.4242.9f3c.tmp"), "");
	writeFileSync(join(job, "state"), "done\n");
	writeFileSync(join(job, "finished-at"), "2026-11-20T10:00:00.000Z\n");
	// The sweep rings for an event at least five minutes old.
	const ended = new Date(Date.now() - 10 * 60_000);
	utimesSync(join(job, "state"), ended, ended);
	utimesSync(join(job, "finished-at"), ended, ended);
	const run = limen(p, ["sweep"]);
	assert.equal(run.status, 0, run.stderr);
	// The sweep claims a seat event by its marker before it rings; a sweep that rings for nothing writes none.
	const seat = join(job, "notify", "seat");
	const markers = existsSync(seat) ? readdirSync(seat) : [];
	assert.deepEqual(
		markers.map((name) => name.replace(/\d+$/, "<since>")),
		["_terminal.done.<since>"],
	);
});
