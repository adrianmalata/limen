// `limen continue`: it finds the project from a subdirectory, its engine does not inherit the continue flag, and it
// refuses a parent whose engine was removed, or a group worker whose worktree and branch are gone, leaving the shared
// snapshot identical (T-38 (4)).
import assert from "node:assert/strict";
import { chmodSync, readdirSync, readFileSync, rmSync, statSync } from "node:fs";
import { mkdir, writeFile } from "node:fs/promises";
import { dirname, join } from "node:path";
import { test } from "node:test";
import { isTerminal } from "../../src/job/job.ts";
import { outputText, readOutcome } from "../final-line.ts";
import {
	editRecord,
	git,
	jobDir,
	jobRecord,
	jobState,
	limen,
	type Plant,
	plant,
	spawnJob,
	startedJob,
	TICKET,
	until,
	waitJob,
	writeRecord,
} from "../plant.ts";
import { snapshot } from "../snapshot.ts";

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
	// Its wrapper has exited, after its last write to the job's folder, so the snapshot below holds still.
	waitJob(p, parent);
	// A Devin job's record names its engine and holds no session transcript, as the cut wrapper wrote it.
	const dir = jobDir(p, parent);
	await editRecord(dir, (record) => ({ route: { ...record.route, engine: "devin" } }));
	for (const name of readdirSync(join(dir, "session"))) {
		rmSync(join(dir, "session", name), { recursive: true });
	}
	const before = snapshot(p.root);
	const run = limen(p, ["continue", parent, "say continued"]);
	assert.notEqual(run.status, 0, run.stdout);
	assert.equal(outputText(run), "engine devin was removed with Devin cloud jobs (R-003); use --engine pi\n");
	// Read from a record, not given on the command line: a refusal, not a usage error.
	assert.deepEqual([readOutcome(run), snapshot(p.root)], [{ class: "refused", code: "REMOVED", next: null }, before]);
});

test("limen continue of a finished job recorded with the removed engine omp refuses with its line and starts no job", async (t) => {
	const p = await plant();
	t.after(() => p.cleanup());
	const parent = spawnJob(p, "commit");
	waitJob(p, parent);
	// An OMP job's record names its engine and keeps the session transcript that OMP wrote.
	await editRecord(jobDir(p, parent), (record) => ({ route: { ...record.route, engine: "omp" } }));
	const before = snapshot(p.root);
	const run = limen(p, ["continue", parent, "say continued"]);
	assert.notEqual(run.status, 0, run.stdout);
	assert.equal(outputText(run), "engine omp was removed with the OMP engine (R-004); use --engine pi\n");
	assert.deepEqual([readOutcome(run), snapshot(p.root)], [{ class: "refused", code: "REMOVED", next: null }, before]);
});

test("BAD_ARGUMENT: continue with --label given twice exits 2, as every value flag given twice does", async (t) => {
	const p = await plant();
	t.after(() => p.cleanup());
	const run = limen(p, ["continue", NO_JOB, "x", "--label", "a", "--label", "b"]);
	assert.equal(run.status, 2, run.stderr);
	assert.deepEqual(readOutcome(run), { class: "usage", code: "BAD_ARGUMENT", next: "limen continue --help" });
	assert.equal(outputText(run).split("\n")[0], "limen continue: --label given twice");
});

const WORKER = "2026-11-21-f001-team-1-worker-1a2b3c4d";
const ROUTE_FLAGS = ["--engine", "pi", "--provider", "p", "--model", "m", "--thinking", "high"];

/**
 * A run of one team whose finished worker `WORKER` the lead continues, written as group start and the worker's spawn
 * left them: its record, its session transcript, and `fields` of the run. No process owns the job.
 */
async function finishedWorker(p: Plant, worker: Record<string, unknown>, fields: Record<string, unknown>) {
	const now = Date.now();
	const run = {
		id: "gone-group",
		root: p.root,
		feature: dirname(TICKET),
		lead: "gone-lead",
		startedAt: now,
		teams: ["team-1"],
		routes: { "team-1": { engine: "pi", provider: "p", model: "m", thinking: "high" } },
		workersPerTeam: 2,
		rounds: ["draft"],
		round: 0,
		deadline: now + 60 * 60_000,
		reserveMs: 60_000,
		stopped: false,
		closed: false,
		members: [{ id: WORKER, team: "team-1", role: "worker", deadline: now + 60 * 60_000 }],
		...fields,
	};
	await mkdir(join(p.root, ".limen/groups", run.id), { recursive: true });
	await writeFile(join(p.root, ".limen/groups", run.id, "run.json"), `${JSON.stringify(run)}\n`);
	const dir = jobDir(p, WORKER);
	await writeRecord(dir, {
		state: "done",
		label: "team-1 worker",
		role: "worker",
		branch: "limen/gone",
		worktree: join(p.parent, "gone"),
		group: run.id,
		team: "team-1",
		...worker,
	});
	await mkdir(join(dir, "session"));
	await writeFile(join(dir, "session", "s.jsonl"), "{}\n");
	return { PI_SESSION_ID: run.lead };
}

// Before R-092 a worker's continuation took the group's launch lock (a folder that stays) and claimed its member slot in
// run.json before it found the parent's worktree and branch gone.
test("JOB_TREE_GONE: the lead's continuation of a group worker whose worktree and branch are gone exits 1 and leaves the snapshot identical", async (t) => {
	const p = await plant();
	t.after(() => p.cleanup());
	const env = await finishedWorker(p, {}, {});
	const before = snapshot(p.root);
	const continued = limen(p, ["continue", WORKER, "go on", ...ROUTE_FLAGS], { env });
	assert.deepEqual(
		[continued.status, readOutcome(continued).code, snapshot(p.root)],
		[1, "JOB_TREE_GONE", before],
		continued.stderr,
	);
});

// Before R-092 the allowance was checked when the slot was claimed, after the group's launch lock, a folder that stays.
test("GROUP_ALLOWANCE: the lead's continuation of a worker past its team's worker allowance exits 1 and leaves the snapshot identical", async (t) => {
	const p = await plant();
	t.after(() => p.cleanup());
	git(p.root, "branch", "limen/gone");
	const env = await finishedWorker(p, {}, { workersPerTeam: 1 });
	const before = snapshot(p.root);
	const continued = limen(p, ["continue", WORKER, "go on", ...ROUTE_FLAGS], { env });
	assert.deepEqual(
		[continued.status, readOutcome(continued).code, snapshot(p.root)],
		[1, "GROUP_ALLOWANCE", before],
		continued.stderr,
	);
});

// Before R-092 continue read its wake route in its apply, after it had claimed a group worker's slot in run.json.
test("UNSAFE_HERDR_PANE_ID: the lead's continuation of a group worker from an unsafe Herdr pane exits 4 and leaves the snapshot identical", async (t) => {
	const p = await plant();
	t.after(() => p.cleanup());
	git(p.root, "branch", "limen/gone");
	const lead = await finishedWorker(p, {}, {});
	const env = { ...lead, HERDR_ENV: "1", HERDR_PANE_ID: "pane; rm -rf" };
	const before = snapshot(p.root);
	const continued = limen(p, ["continue", WORKER, "go on", ...ROUTE_FLAGS], { env });
	assert.deepEqual(
		[continued.status, readOutcome(continued).code, snapshot(p.root)],
		[4, "UNSAFE_HERDR_PANE_ID", before],
		continued.stderr,
	);
});

// T-02: the group id comes from the parent's record, not from the command line, so a run that is gone is a refusal.
test("GROUP_GONE: continue of a job whose record names a group with no run exits 1 and leaves the snapshot identical", async (t) => {
	const p = await plant();
	t.after(() => p.cleanup());
	const dir = jobDir(p, WORKER);
	await writeRecord(dir, {
		state: "done",
		label: "w",
		role: "worker",
		branch: "limen/gone",
		group: "gone-group",
		team: "team-1",
	});
	const before = snapshot(p.root);
	const continued = limen(p, ["continue", WORKER, "go on", ...ROUTE_FLAGS]);
	assert.deepEqual(
		[continued.status, readOutcome(continued).code, snapshot(p.root)],
		[1, "GROUP_GONE", before],
		continued.stderr,
	);
});

// The parent's own recorded extensions differ from its team's: a refusal of a record, apart from the usage error of an
// --extension that differs (GROUP_EXTENSIONS).
test("GROUP_EXTENSIONS_PARENT: the continuation of a group worker whose extensions differ from its team's exits 1 and leaves the snapshot identical", async (t) => {
	const p = await plant();
	t.after(() => p.cleanup());
	const extension = join(p.parent, "team.ts");
	await writeFile(extension, "export default () => {};\n");
	git(p.root, "branch", "limen/gone");
	const env = await finishedWorker(p, { extensions: [] }, { teamExtensions: { "team-1": [extension] } });
	const before = snapshot(p.root);
	const continued = limen(p, ["continue", WORKER, "go on", ...ROUTE_FLAGS], { env });
	assert.deepEqual(
		[continued.status, readOutcome(continued).code, snapshot(p.root)],
		[1, "GROUP_EXTENSIONS_PARENT", before],
		continued.stderr,
	);
});
