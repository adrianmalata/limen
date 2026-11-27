// `limen picture build --strict`: a map with an error diagnostic is refused through the final line, and a refused build
// writes nothing, its `--json` model included (T-38, D-061).
import assert from "node:assert/strict";
import { readFile, rm, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { test } from "node:test";
import { outputText, readOutcome } from "../final-line.ts";
import { limen, plant } from "../plant.ts";
import { snapshot } from "../snapshot.ts";

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
	const p = await plant({ modules: ["picture"] });
	t.after(() => p.cleanup());
	await writeFile(join(p.root, ".limen/picture/nodes/misnamed.md"), MISNAMED);
	const before = snapshot(p.root);
	const run = limen(p, ["picture", "build", "--strict"]);
	assert.deepEqual(
		[run.status, readOutcome(run), snapshot(p.root)],
		[1, { class: "refused", code: "PICTURE_INVALID", next: "limen picture build --strict" }, before],
		run.stdout,
	);
	assert.match(outputText(run), /^error node\.file-name \S*misnamed\.md/m);
	assert.match(run.stdout, /^picture: \d+ places, \d+ edges\n$/);
});

test("PICTURE_INVALID: picture build --strict --dir names the same folder in next", async (t) => {
	const p = await plant({ modules: ["picture"] });
	t.after(() => p.cleanup());
	await writeFile(join(p.root, ".limen/picture/nodes/misnamed.md"), MISNAMED);
	const before = snapshot(p.root);
	const run = limen(p, ["picture", "build", "--strict", "--dir", ".limen/picture"]);
	assert.deepEqual(
		[run.status, readOutcome(run).next, snapshot(p.root)],
		[1, "limen picture build --dir .limen/picture --strict", before],
		run.stdout,
	);
});

// D-045 (5.1): the fix is prose, so it leaves `next` for the stderr line after the refusal's own.
test("PICTURE_INVALID: picture build --strict says on stderr to fix the errors listed above", async (t) => {
	const p = await plant({ modules: ["picture"] });
	t.after(() => p.cleanup());
	await writeFile(join(p.root, ".limen/picture/nodes/misnamed.md"), MISNAMED);
	const before = snapshot(p.root);
	const run = limen(p, ["picture", "build", "--strict"]);
	assert.deepEqual(
		[outputText(run).trimEnd().split("\n").slice(-2), snapshot(p.root)],
		[["picture build --strict: 1 error in the map, its tickets or its board", "fix the errors listed above"], before],
	);
});

// Before R-092 the build wrote the --json model before the strict check refused.
test("PICTURE_INVALID: picture build --strict --json with an error diagnostic writes no model and leaves the snapshot identical", async (t) => {
	const p = await plant({ modules: ["picture"] });
	t.after(() => p.cleanup());
	await writeFile(join(p.root, ".limen/picture/nodes/misnamed.md"), MISNAMED);
	const before = snapshot(p.root);
	const run = limen(p, ["picture", "build", "--strict", "--json", ".limen/model/picture.json"]);
	assert.deepEqual([run.status, readOutcome(run).code, snapshot(p.root)], [1, "PICTURE_INVALID", before], run.stderr);
	assert.match(run.stdout, /^picture: \d+ places, \d+ edges\n$/);
});

test("limen picture build: --json of a map with no error writes the model and says where", async (t) => {
	const p = await plant({ modules: ["picture"] });
	t.after(() => p.cleanup());
	const run = limen(p, ["picture", "build", "--strict", "--json", ".limen/model/picture.json"]);
	assert.equal(run.status, 0, run.stderr);
	const model = JSON.parse(await readFile(join(p.root, ".limen/model/picture.json"), "utf8"));
	assert.equal(model.nodes.length > 0, true);
	assert.match(run.stdout, new RegExp(`; wrote ${join(p.root, ".limen/model/picture.json")}\n`));
});

// Before R-092 a map path that is a file ended in a plain Error, UNTYPED.
test("PICTURE_NOT_A_FOLDER: picture build where .limen/picture is a file exits 1 and leaves the snapshot identical", async (t) => {
	const p = await plant({ modules: ["picture"] });
	t.after(() => p.cleanup());
	await rm(join(p.root, ".limen/picture"), { recursive: true });
	await writeFile(join(p.root, ".limen/picture"), "no map\n");
	const before = snapshot(p.root);
	const run = limen(p, ["picture", "build", "--strict"]);
	assert.deepEqual(
		[run.status, readOutcome(run).code, snapshot(p.root)],
		[1, "PICTURE_NOT_A_FOLDER", before],
		run.stderr,
	);
});
