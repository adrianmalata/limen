// `limen picture build --strict`: a map with an error diagnostic is refused through the final line.
import assert from "node:assert/strict";
import { writeFile } from "node:fs/promises";
import { join } from "node:path";
import { test } from "node:test";
import { outputText, readOutcome } from "../../src/outcome.ts";
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

test("PICTURE_INVALID: picture build --strict with an error diagnostic exits 1, lists it and names the fix in next", async (t) => {
	const p = await plant();
	t.after(() => p.cleanup());
	await writeFile(join(p.root, ".limen/picture/nodes/misnamed.md"), MISNAMED);
	const run = limen(p, ["picture", "build", "--strict"]);
	assert.equal(run.status, 1, run.stdout);
	assert.deepEqual(readOutcome(run), {
		class: "refused",
		code: "PICTURE_INVALID",
		next: "fix the errors listed above, then run limen picture build --strict",
	});
	assert.match(outputText(run), /^error node\.file-name \S*misnamed\.md/m);
	assert.match(run.stdout, /^picture: \d+ places, \d+ edges\n$/);
});
