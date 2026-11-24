// src/job/continuation.ts: two continuations of one job whose checks both ran before either wrote, in a plant in the
// OS temporary folder, in this process with the plant's environment.
import assert from "node:assert/strict";
import { readdirSync } from "node:fs";
import { join } from "node:path";
import { test } from "node:test";
import { checkContinue, continueChecked } from "../../src/job/continuation.ts";
import { withEnvironment } from "../environment.ts";
import { jobRecord, plant, spawnJob, waitJob } from "../plant.ts";

// D-097 (5) (d), z. 14: the newest record on the worktree is held under the jobs lock, so the continuation that writes
// second finds the first one's record and writes nothing; before, an ordinary job's continuation held no such fact.
test("two continuations of one ordinary job checked before either writes start one job, and the second ends in STATE_CHANGED", async (t) => {
	const p = await plant();
	t.after(() => p.cleanup());
	const parent = spawnJob(p, "say first");
	assert.equal(waitJob(p, parent), "done");
	// The routes of a coordinator's shell stay out, so the wake goes to the parent's origin as from a plain shell.
	withEnvironment(t, {
		...p.env,
		PI_SESSION_ID: "",
		HERDR_ENV: "",
		HERDR_PANE_ID: "",
		HERDR_TAB_ID: "",
		LIMEN_JOB: "",
		LIMEN_JOB_ID: "",
		LIMEN_GROUP_ID: "",
	});
	const lines: string[] = [];
	const out = { line: (text: string) => lines.push(text), diagnostic: (text: string) => lines.push(text) };
	const again = `limen continue ${parent} "say again"`;
	const first = await checkContinue({ query: parent, instruction: ["say one"] }, p.root, out, undefined, again);
	const second = await checkContinue({ query: parent, instruction: ["say two"] }, p.root, out, undefined, again);
	const started = await continueChecked(first);
	await assert.rejects(continueChecked(second), { class: "transient", code: "STATE_CHANGED", next: again });
	const id = started.ids?.job ?? "";
	assert.equal(waitJob(p, id), "done");
	const children = readdirSync(join(p.root, ".limen", "jobs")).filter((job) => jobRecord(p, job)?.parent === parent);
	assert.deepEqual(children, [id]);
});
