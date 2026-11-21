// `limen status` lists the leftover files of cut features in the project it reports on, the Limen variables of its
// environment that it no longer reads or reads only until a ticket, and names a running job's note.
import assert from "node:assert/strict";
import { copyFileSync, existsSync, mkdirSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { test } from "node:test";
import { fileURLToPath } from "node:url";
import { outputText } from "../final-line.ts";
import { editRecord, jobDir, limen, plant, release, spawnJob, until, waitJob } from "../plant.ts";

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

test("limen status lists a .limen/planning-source left by the cut private planning as a leftover file", async (t) => {
	const p = await plant();
	t.after(() => p.cleanup());
	// The planning source that the removed `limen planning private` stored.
	writeFileSync(join(p.root, ".limen/planning-source"), "private\n");
	const run = limen(p, ["status"]);
	assert.equal(run.status, 0, run.stderr);
	const lines = run.stdout.split("\n");
	assert.ok(lines.includes(HEADER), run.stdout);
	const at = lines.indexOf(HEADER);
	assert.deepEqual(lines.slice(at, at + 2), [HEADER, "  .limen/planning-source (private planning (R-006))"]);
});

test("limen status lists the files the cut Picture viewer, map jobs and map watch left, the marked watch hook included", async (t) => {
	const p = await plant();
	t.after(() => p.cleanup());
	// What `picture build`, `picture tick` and `picture watch on` wrote before the cut; the hook carries the watch's marker.
	writeFileSync(join(p.root, ".limen/picture/map.html"), "<!doctype html>\n");
	writeFileSync(join(p.root, ".limen/picture/job"), "2026-11-18-map-1a2b3c4d\n");
	writeFileSync(join(p.root, ".limen/picture/tick.lock"), "4242\n");
	writeFileSync(join(p.root, ".limen/picture-watch.log"), "2026-11-18T10:00:00Z refs/heads/main moved to 0123abc\n");
	mkdirSync(join(p.root, ".git/hooks"), { recursive: true });
	writeFileSync(
		join(p.root, ".git/hooks/reference-transaction"),
		'#!/bin/sh\n# limen picture watch {"branch":"main"}\nexit 0\n',
		{ mode: 0o755 },
	);
	const run = limen(p, ["status"]);
	assert.equal(run.status, 0, run.stderr);
	const header = "Leftover files (5); check them, then run limen init --drop-leftovers:";
	const lines = run.stdout.split("\n");
	assert.ok(lines.includes(header), run.stdout);
	const at = lines.indexOf(header);
	assert.deepEqual(lines.slice(at, at + 6), [
		header,
		"  .git/hooks/reference-transaction (the map watch (R-007))",
		"  .limen/picture-watch.log (the map jobs (R-007))",
		"  .limen/picture/job (the map jobs (R-007))",
		"  .limen/picture/map.html (the Picture viewer (R-007))",
		"  .limen/picture/tick.lock (the map jobs (R-007))",
	]);
});

test("limen status does not list a reference-transaction hook without the map watch's marker", async (t) => {
	const p = await plant();
	t.after(() => p.cleanup());
	// The project's own hook: Limen did not write it, so it is never listed or dropped.
	mkdirSync(join(p.root, ".git/hooks"), { recursive: true });
	writeFileSync(join(p.root, ".git/hooks/reference-transaction"), "#!/bin/sh\n# the project's own hook\nexit 0\n", {
		mode: 0o755,
	});
	const run = limen(p, ["status"]);
	assert.equal(run.status, 0, run.stderr);
	assert.deepEqual(
		run.stdout.split("\n").filter((line) => line.startsWith("Leftover files")),
		[],
	);
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

const UNREAD = "Environment settings Limen no longer reads (1); remove them:";
const UNTIL = "Environment variables read until a ticket replaces them (1):";

test("limen status names a setting of its environment that it no longer reads and a variable it reads until a ticket", async (t) => {
	const p = await plant();
	t.after(() => p.cleanup());
	const run = limen(p, ["status"], { env: { LIMEN_PREPARE: "pnpm install", LIMEN_WORKER_MODEL: "p/m" } });
	assert.equal(run.status, 0, run.stderr);
	const lines = run.stdout.split("\n");
	const at = lines.indexOf(UNREAD);
	assert.deepEqual(lines.slice(at, at + 5), [
		UNREAD,
		"  LIMEN_PREPARE: the spawn flag --prepare",
		UNTIL,
		"  LIMEN_WORKER_MODEL: until R-062",
		"Older: 0 records (limen status --all)",
	]);
});

test("limen status prints neither environment section when its environment holds no such variable", async (t) => {
	const p = await plant();
	t.after(() => p.cleanup());
	const run = limen(p, ["status"]);
	assert.equal(run.status, 0, run.stderr);
	assert.deepEqual(
		run.stdout.split("\n").filter((line) => line.startsWith("Environment ")),
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
	const text = "tool stall observation uncertain: CPU or process identity unavailable";
	await editRecord(dir, () => ({ advisory: { text, at: new Date().toISOString() } }));
	const run = limen(p, ["status"]);
	await release(dir);
	assert.equal(run.status, 0, run.stderr);
	const line = run.stdout.split("\n").find((entry) => entry.startsWith(`  noted (${id})`)) ?? run.stdout;
	assert.ok(line.endsWith(" · advisory: tool stall observation uncertain: CPU or process identity unavailable"), line);
});

test("limen status --all prints the summary without the 7-day window and under it one row for each job", async (t) => {
	const p = await plant();
	t.after(() => p.cleanup());
	const old = spawnJob(p, "say old", ["--label", "old"]);
	const recent = spawnJob(p, "say recent", ["--label", "recent"]);
	assert.deepEqual([waitJob(p, old), waitJob(p, recent)], ["done", "done"]);
	// A job that ended eight days ago is outside the window of the plain summary.
	await editRecord(jobDir(p, old), () => ({ finishedAt: new Date(Date.now() - 8 * 86_400_000).toISOString() }));
	assert.ok(limen(p, ["status"]).stdout.includes("Older: 1 record (limen status --all)"));
	const run = limen(p, ["status", "--all"]);
	assert.equal(run.status, 0, run.stderr);
	const lines = outputText(run).split("\n");
	const rows = (id: string) => lines.filter((line) => line.includes(` · id ${id} · `)).length;
	assert.deepEqual(
		[lines[0]?.startsWith("Plant "), lines.some((line) => line.startsWith("Older:")), lines.includes("Jobs (2):")],
		[true, false, true],
	);
	assert.deepEqual([rows(old), rows(recent)], [1, 1]);
});
