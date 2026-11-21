// `limen continue`: it finds the project from a subdirectory, its engine does not inherit the continue flag, and it
// refuses a parent whose engine was removed.
import assert from "node:assert/strict";
import { chmodSync, readdirSync, readFileSync, rmSync, statSync } from "node:fs";
import { join } from "node:path";
import { test } from "node:test";
import { isTerminal } from "../../src/job/job.ts";
import { outputText, readOutcome } from "../final-line.ts";
import {
	editRecord,
	jobDir,
	jobRecord,
	jobState,
	limen,
	type Plant,
	plant,
	spawnJob,
	startedJob,
	until,
} from "../plant.ts";

/** A job id that names no job: a usage error comes before any record is read. */
const NO_JOB = "2026-11-18-none-1a2b3c4d";

/** Resolves once the job's record is terminal, the commit point of its end. */
function ended(p: Plant, id: string): Promise<void> {
	return until(jobDir(p, id), () => isTerminal(jobState(p, id)));
}

test("a continuation started from a subdirectory of the project continues its parent and ends done", async (t) => {
	const p = await plant();
	t.after(() => p.cleanup());
	const parent = spawnJob(p, "commit");
	await ended(p, parent);
	const run = limen(p, ["continue", parent, "say continued"], { cwd: join(p.root, "spec") });
	assert.equal(run.status, 0, run.stderr);
	const id = startedJob(run);
	await ended(p, id);
	assert.deepEqual([jobRecord(p, id)?.parent, jobState(p, id)], [parent, "done"]);
});

// D-046 (3): the sentence is text for the coordinator, so it is the last text line, and nothing follows in `next`.
test("a continuation says to end the turn on its last text line and ends with a null next and the job in ids", async (t) => {
	const p = await plant();
	t.after(() => p.cleanup());
	const parent = spawnJob(p, "commit");
	await ended(p, parent);
	const run = limen(p, ["continue", parent, "say continued"]);
	assert.equal(run.status, 0, run.stderr);
	const id = startedJob(run);
	await ended(p, id);
	assert.deepEqual(
		[outputText(run).trimEnd().split("\n").at(-1), readOutcome(run)],
		["End your turn; Limen wakes you when the job ends.", { class: "ok", code: null, next: null, ids: { job: id } }],
	);
});

test("limen continue copies the parent's session transcript with the transcript's permission bits", async (t) => {
	const p = await plant();
	t.after(() => p.cleanup());
	const parent = spawnJob(p, "say first");
	await ended(p, parent);
	const [name = "", ...more] = readdirSync(join(jobDir(p, parent), "session")).filter((file) =>
		file.endsWith(".jsonl"),
	);
	assert.deepEqual(more, [], "the parent holds one transcript");
	chmodSync(join(jobDir(p, parent), "session", name), 0o600);
	const id = startedJob(limen(p, ["continue", parent, "say continued"]));
	await ended(p, id);
	assert.equal(statSync(join(jobDir(p, id), "session", name)).mode & 0o777, 0o600);
});

test("a job continued with limen continue starts an engine whose environment holds no LIMEN_CONTINUE", async (t) => {
	const p = await plant();
	t.after(() => p.cleanup());
	const parent = spawnJob(p, "say first");
	await ended(p, parent);
	const id = startedJob(limen(p, ["continue", parent, "say continued"]));
	await ended(p, id);
	// The fake engine records the names of its LIMEN_, HERDR_ and PI_ variables.
	const names: string[] = JSON.parse(readFileSync(join(jobDir(p, id), "fake-env.json"), "utf8"));
	assert.deepEqual(
		[jobState(p, id), names.includes("LIMEN_JOB_ID"), names.includes("LIMEN_CONTINUE")],
		["done", true, false],
	);
});

test("limen continue of a finished job recorded with the removed engine devin refuses with its line and starts no job", async (t) => {
	const p = await plant();
	t.after(() => p.cleanup());
	const parent = spawnJob(p, "commit");
	await ended(p, parent);
	// A Devin job's record names its engine and holds no session transcript, as the cut wrapper wrote it.
	const dir = jobDir(p, parent);
	await editRecord(dir, (record) => ({ route: { ...record.route, engine: "devin" } }));
	for (const name of readdirSync(join(dir, "session"))) {
		rmSync(join(dir, "session", name), { recursive: true });
	}
	const run = limen(p, ["continue", parent, "say continued"]);
	assert.notEqual(run.status, 0, run.stdout);
	assert.equal(outputText(run), "engine devin was removed with Devin cloud jobs (R-003); use --engine pi\n");
	// Read from a record, not given on the command line: a refusal, not a usage error.
	assert.deepEqual(readOutcome(run), { class: "refused", code: "REMOVED", next: null });
	assert.deepEqual(readdirSync(join(p.root, ".limen/jobs")), [parent]);
});

test("limen continue of a finished job recorded with the removed engine omp refuses with its line and starts no job", async (t) => {
	const p = await plant();
	t.after(() => p.cleanup());
	const parent = spawnJob(p, "commit");
	await ended(p, parent);
	// An OMP job's record names its engine and keeps the session transcript that OMP wrote.
	await editRecord(jobDir(p, parent), (record) => ({ route: { ...record.route, engine: "omp" } }));
	const run = limen(p, ["continue", parent, "say continued"]);
	assert.notEqual(run.status, 0, run.stdout);
	assert.equal(outputText(run), "engine omp was removed with the OMP engine (R-004); use --engine pi\n");
	assert.deepEqual(readOutcome(run), { class: "refused", code: "REMOVED", next: null });
	assert.deepEqual(readdirSync(join(p.root, ".limen/jobs")), [parent]);
});

test("BAD_ARGUMENT: continue with --label given twice exits 2, as every value flag given twice does", async (t) => {
	const p = await plant();
	t.after(() => p.cleanup());
	const run = limen(p, ["continue", NO_JOB, "x", "--label", "a", "--label", "b"]);
	assert.equal(run.status, 2, run.stderr);
	assert.deepEqual(readOutcome(run), { class: "usage", code: "BAD_ARGUMENT", next: "limen continue --help" });
	assert.equal(outputText(run).split("\n")[0], "limen continue: --label given twice");
});
