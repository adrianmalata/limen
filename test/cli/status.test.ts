// `limen status` lists the leftover files of cut features in the project it reports on.
import assert from "node:assert/strict";
import { copyFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { test } from "node:test";
import { fileURLToPath } from "node:url";
import { limen, plant } from "../plant.ts";

const AGENTS_TEMPLATE = fileURLToPath(new URL("../../templates/agents.md", import.meta.url));
const HEADER = "Leftover files (1); check them, then run limen init --drop-leftovers:";

test("limen status lists an AGENTS.md identical to the package's template as a leftover file before Older", async (t) => {
	const p = await plant();
	t.after(() => p.cleanup());
	copyFileSync(AGENTS_TEMPLATE, join(p.root, "AGENTS.md"));
	const run = limen(p, ["status"]);
	assert.equal(run.status, 0, run.stderr);
	const lines = run.stdout.split("\n");
	assert.ok(lines.includes(HEADER), run.stdout);
	const at = lines.indexOf(HEADER);
	assert.deepEqual(lines.slice(at, at + 3), [
		HEADER,
		"  AGENTS.md (identical copy of the package's templates/agents.md)",
		"Older: 0 records (limen status --all)",
	]);
});

test("limen status lists a .limen/finish-webhook.env left by the cut finish webhooks as a leftover file", async (t) => {
	const p = await plant();
	t.after(() => p.cleanup());
	writeFileSync(join(p.root, ".limen/finish-webhook.env"), "a credential the cut feature left\n");
	const run = limen(p, ["status"]);
	assert.equal(run.status, 0, run.stderr);
	const lines = run.stdout.split("\n");
	assert.ok(lines.includes(HEADER), run.stdout);
	const at = lines.indexOf(HEADER);
	assert.deepEqual(lines.slice(at, at + 2), [HEADER, "  .limen/finish-webhook.env (finish webhooks (R-002))"]);
});

test("limen status prints no Leftover files section when the project has no leftover", async (t) => {
	const p = await plant();
	t.after(() => p.cleanup());
	const run = limen(p, ["status"]);
	assert.equal(run.status, 0, run.stderr);
	assert.deepEqual(
		run.stdout.split("\n").filter((line) => line.startsWith("Leftover files")),
		[],
	);
});
