// `limen picture build --strict`: a map with an error diagnostic is refused through the final line.
import assert from "node:assert/strict";
import { writeFile } from "node:fs/promises";
import { join } from "node:path";
import { test } from "node:test";
import { outputText, readOutcome } from "../final-line.ts";
import { limen, plant } from "../plant.ts";

/** A module node whose id does not match its file name, an error of the map. */
const MISNAMED = `---
schema: architecture-map/1
kind: module
id: demo.other
project: demo
title: demo.other
status: ready
parent: demo
sources:
  - README.md
---
`;

test("PICTURE_INVALID: picture build --strict with an error diagnostic exits 1, lists it and names the build again in next", async (t) => {
	const p = await plant();
	t.after(() => p.cleanup());
	await writeFile(join(p.root, ".limen/picture/nodes/misnamed.md"), MISNAMED);
	const run = limen(p, ["picture", "build", "--strict"]);
	assert.equal(run.status, 1, run.stdout);
	assert.deepEqual(readOutcome(run), {
		class: "refused",
		code: "PICTURE_INVALID",
		next: "limen picture build --strict",
	});
	assert.match(outputText(run), /^error node\.file-name \S*misnamed\.md/m);
	assert.match(run.stdout, /^picture: \d+ places, \d+ edges\n$/);
});

test("PICTURE_INVALID: picture build --strict --dir names the same folder in next", async (t) => {
	const p = await plant();
	t.after(() => p.cleanup());
	await writeFile(join(p.root, ".limen/picture/nodes/misnamed.md"), MISNAMED);
	const run = limen(p, ["picture", "build", "--strict", "--dir", ".limen/picture"]);
	assert.equal(run.status, 1, run.stdout);
	assert.equal(readOutcome(run).next, "limen picture build --dir .limen/picture --strict");
});

// D-045 (5.1): the fix is prose, so it leaves `next` for the stderr line after the refusal's own.
test("PICTURE_INVALID: picture build --strict says on stderr to fix the errors listed above", async (t) => {
	const p = await plant();
	t.after(() => p.cleanup());
	await writeFile(join(p.root, ".limen/picture/nodes/misnamed.md"), MISNAMED);
	const run = limen(p, ["picture", "build", "--strict"]);
	assert.deepEqual(outputText(run).trimEnd().split("\n").slice(-2), [
		"picture build --strict: 1 error in the map, its tickets or its board",
		"fix the errors listed above",
	]);
});
