// src/job/landing.ts: in a terminal, `limen land` asks its question after the lines the owner reads to decide, and a
// no refuses before the merge.
import assert from "node:assert/strict";
import { writeFile } from "node:fs/promises";
import { join } from "node:path";
import { test } from "node:test";
import { landJob } from "../../src/job/landing.ts";
import { type CommandText, LimenError } from "../../src/outcome.ts";
import { git, jobRecord, plant, spawnJob, waitJob } from "../plant.ts";
import { snapshot } from "../snapshot.ts";

// AC-10 within D-061 (3): the note comes once, with the question, so the wrapper holds no copy of it for the end.
// R-103: the answer comes between the land's checks and its first write, and a no was an untyped refusal.
test("LAND_CANCELLED: in a terminal, land asks after the uncommitted-files note, and a no refuses with the snapshot identical", async (t) => {
	const p = await plant();
	t.after(() => p.cleanup());
	const id = spawnJob(p, "commit");
	assert.equal(waitJob(p, id), "done");
	await writeFile(join(p.root, "draft.txt"), "another session drafts\n");
	const held: string[] = [];
	const out: CommandText = { line: (text) => held.push(text), diagnostic: (text) => held.push(text) };
	const questions: string[] = [];
	const ask = async (question: string): Promise<boolean> => {
		questions.push(question);
		return false;
	};
	const request = { query: { word: id }, yes: false, keepOpen: false, onto: undefined, again: `limen land ${id}` };
	const before = snapshot(p.root);
	const refused = await landJob(request, p.root, out, ask).then(
		() => undefined,
		(error: unknown) => error,
	);
	const label = jobRecord(p, id)?.label ?? "";
	const target = git(p.root, "branch", "--show-current");
	assert.deepEqual(
		[
			refused instanceof LimenError ? [refused.class, refused.code, refused.next] : refused,
			questions,
			held,
			snapshot(p.root),
		],
		[
			["refused", "LAND_CANCELLED", null],
			[
				`land: 1 uncommitted file in ${p.root} stay untouched; none is in this merge\nLand ${label} onto ${target}? [y/N] `,
			],
			[],
			before,
		],
	);
});
