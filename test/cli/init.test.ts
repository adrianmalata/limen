// `limen init --drop-leftovers` removes the leftover files of cut features and names each one.
import assert from "node:assert/strict";
import { copyFileSync, existsSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { test } from "node:test";
import { fileURLToPath } from "node:url";
import { limen, plant } from "../plant.ts";

const template = (name: string) => fileURLToPath(new URL(`../../templates/${name}`, import.meta.url));

test("limen init --drop-leftovers drops an identical AGENTS.md, keeps a changed worker prompt and names the drop", async (t) => {
	const p = await plant();
	t.after(() => p.cleanup());
	copyFileSync(template("agents.md"), join(p.root, "AGENTS.md"));
	const worker = join(p.root, ".agents/limen/worker.md");
	writeFileSync(worker, `${readFileSync(template("worker.md"), "utf8")}\nA project rule.\n`);
	const run = limen(p, ["init", "--drop-leftovers"]);
	assert.equal(run.status, 0, run.stderr);
	assert.equal(existsSync(join(p.root, "AGENTS.md")), false);
	assert.equal(existsSync(worker), true);
	assert.equal(run.stdout, "dropped AGENTS.md (identical copy of the package's templates/agents.md)\n");
});

test("a second limen init --drop-leftovers prints no leftover files and exits 0", async (t) => {
	const p = await plant();
	t.after(() => p.cleanup());
	copyFileSync(template("agents.md"), join(p.root, "AGENTS.md"));
	const first = limen(p, ["init", "--drop-leftovers"]);
	assert.equal(first.status, 0, first.stderr);
	const second = limen(p, ["init", "--drop-leftovers"]);
	assert.equal(second.status, 0, second.stderr);
	assert.equal(second.stdout, "no leftover files\n");
});
