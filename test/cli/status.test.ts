// `limen status` lists the leftover files of cut features in the project it reports on, and names a running job's note.
import assert from "node:assert/strict";
import { copyFileSync, existsSync, mkdirSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { test } from "node:test";
import { fileURLToPath } from "node:url";
import { jobDir, limen, plant, release, spawnJob, until } from "../plant.ts";

const AGENTS_TEMPLATE = fileURLToPath(new URL("../../templates/agents.md", import.meta.url));
const STUB_TEMPLATE = fileURLToPath(new URL("../../templates/limen-extension.ts", import.meta.url));
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

test("limen status lists a spec/linear.md left by the cut Linear mirror as a leftover file", async (t) => {
	const p = await plant();
	t.after(() => p.cleanup());
	writeFileSync(join(p.root, "spec/linear.md"), "# Linear mirror\nTeam: T\nProject: P\n");
	const run = limen(p, ["status"]);
	assert.equal(run.status, 0, run.stderr);
	const lines = run.stdout.split("\n");
	assert.ok(lines.includes(HEADER), run.stdout);
	const at = lines.indexOf(HEADER);
	assert.deepEqual(lines.slice(at, at + 2), [HEADER, "  spec/linear.md (the Linear mirror (R-003))"]);
});

test("limen status lists a .omp/extensions/limen.ts left by the cut OMP engine as a leftover file", async (t) => {
	const p = await plant();
	t.after(() => p.cleanup());
	// The extension stub that `limen init` copied for OMP coordinators before the cut.
	mkdirSync(join(p.root, ".omp/extensions"), { recursive: true });
	copyFileSync(STUB_TEMPLATE, join(p.root, ".omp/extensions/limen.ts"));
	const run = limen(p, ["status"]);
	assert.equal(run.status, 0, run.stderr);
	const lines = run.stdout.split("\n");
	assert.ok(lines.includes(HEADER), run.stdout);
	const at = lines.indexOf(HEADER);
	assert.deepEqual(lines.slice(at, at + 2), [HEADER, "  .omp/extensions/limen.ts (the OMP engine (R-004))"]);
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

test("limen status names a running job's note by its file, advisory", async (t) => {
	const p = await plant();
	t.after(() => p.cleanup());
	const id = spawnJob(p, "block", ["--label", "noted"]);
	const dir = jobDir(p, id);
	await until(dir, () => existsSync(join(dir, "fake-blocked-1")));
	// The note the detached wrapper writes when it cannot observe a tool stall (src/runtime/wrapper.ts).
	writeFileSync(join(dir, "advisory"), "tool stall observation uncertain: CPU or process identity unavailable\n");
	const run = limen(p, ["status"]);
	await release(dir);
	assert.equal(run.status, 0, run.stderr);
	const line = run.stdout.split("\n").find((entry) => entry.startsWith(`  noted (${id})`)) ?? run.stdout;
	assert.ok(line.endsWith(" · advisory: tool stall observation uncertain: CPU or process identity unavailable"), line);
});
