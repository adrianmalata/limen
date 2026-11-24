// src/job/landing.ts: in a terminal, `limen land` asks its question after the lines the owner reads to decide.
import assert from "node:assert/strict";
import { writeFile } from "node:fs/promises";
import { join } from "node:path";
import { test } from "node:test";
import { landJob } from "../../src/job/landing.ts";
import type { CommandText } from "../../src/outcome.ts";
import { git, jobRecord, plant, spawnJob, waitJob } from "../plant.ts";

// AC-10 within D-061 (3): the note comes once, with the question, so the wrapper holds no copy of it for the end.
test("in a terminal, land asks after the uncommitted-files note, which it holds for no later print", async (t) => {
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
	await assert.rejects(landJob(request, p.root, out, ask), { message: "land cancelled" });
	const label = jobRecord(p, id)?.label ?? "";
	const target = git(p.root, "branch", "--show-current");
	assert.deepEqual(
		[questions, held],
		[
			[
				`land: 1 uncommitted file in ${p.root} stay untouched; none is in this merge\nLand ${label} onto ${target}? [y/N] `,
			],
			[],
		],
	);
});
