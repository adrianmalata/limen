// `limen continue`: its start, the transcript it copies with the same mode, the context message it carries, its
// engine's environment, its refusals, and the unlanded work of its parent that it takes (A-001).
import assert from "node:assert/strict";
import { chmodSync, existsSync, readdirSync, readFileSync, rmSync, statSync } from "node:fs";
import { mkdir, writeFile } from "node:fs/promises";
import { dirname, join } from "node:path";
import { test } from "node:test";
import { fileURLToPath } from "node:url";
import { isTerminal } from "../../src/job/job.ts";
import { processIdentity } from "../../src/runtime/reap.ts";
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
	release,
	routed,
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

test("limen continue: a continuation started from a subdirectory of the project continues its parent and ends done", async (t) => {
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

/** The entries of type `limen-context` in the job `id`'s session transcript: the context messages its session holds. */
function contextEntries(p: Plant, id: string): number {
	const lines = readFileSync(join(jobDir(p, id), "session", "fake.jsonl"), "utf8")
		.split("\n")
		.filter(Boolean);
	return lines.filter((line) => JSON.parse(line).customType === "limen-context").length;
}

// A-079: the child carries the message its parent's session holds, not one built again from files that changed since.
test("A-079: a continuation publishes its parent's context.md byte for byte, also after the project's styleguide changed", async (t) => {
	const p = await plant();
	t.after(() => p.cleanup());
	const parent = spawnJob(p, "say first");
	await ended(p, parent);
	// A changed styleguide, which every job's message holds, shows that the child carries its parent's bytes instead of
	// building its own.
	await writeFile(join(p.root, ".agents/limen/styleguide.md"), "# Styleguide\n\nchanged-styleguide-marker\n");
	const child = startedJob(limen(p, ["continue", parent, "say next"]));
	const saved = (id: string) => readFileSync(join(jobDir(p, id), "context.md"));
	const published = saved(child);
	await ended(p, child);
	assert.deepEqual(published, saved(parent));
});

// A second message beside the copied transcript would give the child two, and its parent's cached prefix would be lost
// (A-079).
test("a continued job's session holds the one context message its parent's transcript brings, and sends no second one", async (t) => {
	const p = await plant();
	t.after(() => p.cleanup());
	const parent = spawnJob(p, "say first");
	await ended(p, parent);
	const child = startedJob(limen(p, ["continue", parent, "say next"]));
	await ended(p, child);
	assert.equal(contextEntries(p, child), 1);
});

/** The reference of the worker's context message for a project as `limen init` leaves it, as the plant's is (A-051). */
const WORKER_CONTEXT = fileURLToPath(new URL("../runtime/context-message/worker.md", import.meta.url));

// R-039's migration: a job folder published before context.md existed holds none, and its session's transcript no
// context message, so its continuation gets one built at its publication.
test("a continuation of a parent folder without context.md publishes one built for its role", async (t) => {
	const p = await plant();
	t.after(() => p.cleanup());
	const parent = spawnJob(p, "say first");
	assert.equal(waitJob(p, parent), "done");
	const dir = jobDir(p, parent);
	rmSync(join(dir, "context.md"));
	const transcript = join(dir, "session", "fake.jsonl");
	const kept = readFileSync(transcript, "utf8")
		.split("\n")
		.filter((line) => line && JSON.parse(line).customType !== "limen-context");
	await writeFile(transcript, `${kept.join("\n")}\n`);
	const child = startedJob(limen(p, ["continue", parent, "say next"]));
	await ended(p, child);
	assert.equal(readFileSync(join(jobDir(p, child), "context.md"), "utf8"), readFileSync(WORKER_CONTEXT, "utf8"));
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

// D-097 (5) (d), z. 14: only a group worker was checked, so two continuations of one ordinary job could both run on
// its worktree, and a resume after the subscription limit beside a coordinator's own continue started a second job.
test("LIVE_CONTINUATION: a second continuation of an ordinary job while its first one runs exits 1 and leaves the snapshot identical", async (t) => {
	const p = await plant();
	t.after(() => p.cleanup());
	const parent = spawnJob(p, "say first");
	assert.equal(waitJob(p, parent), "done");
	// The first continuation runs on the parent's worktree, owned by this test's process, which writes nothing.
	const first = "2026-11-24-first-1a2b3c4d";
	await writeRecord(jobDir(p, first), {
		state: "running",
		label: "first continuation",
		parent,
		worktree: jobRecord(p, parent)?.worktree ?? null,
		branch: jobRecord(p, parent)?.branch ?? null,
		identity: await processIdentity(),
		startedAt: new Date().toISOString(),
	});
	const before = snapshot(p.root);
	const second = limen(p, ["continue", parent, "say second"]);
	assert.deepEqual(
		[second.status, readOutcome(second), snapshot(p.root)],
		[1, { class: "refused", code: "LIVE_CONTINUATION", next: `limen show ${first}` }, before],
		second.stderr,
	);
});

// A-001: the continuation takes its parent's worktree, and the work in it, so the parent no longer holds it.
test("a continuation takes its parent's unlanded work: a worker spawn starts while it runs, and status names it alone after", async (t) => {
	const p = await plant();
	t.after(() => p.cleanup());
	const parent = spawnJob(p, "fail 3");
	assert.equal(waitJob(p, parent), "failed");
	await writeFile(join(jobRecord(p, parent)?.worktree ?? "", "wip.txt"), "half-done edit\n");
	const child = startedJob(limen(p, ["continue", parent, "block"]));
	await until(jobDir(p, child), () => existsSync(join(jobDir(p, child), "fake-blocked-1")));
	const beside = limen(p, ["spawn", ...routed([]), "say beside"]);
	assert.equal(beside.status, 0, beside.stderr);
	await release(jobDir(p, child));
	assert.deepEqual([waitJob(p, startedJob(beside)), waitJob(p, child)], ["done", "done"]);
	// The continuation ended with the file still in the worktree, so the work is its own now.
	const lines = limen(p, ["status"]).stdout.split("\n");
	const at = lines.indexOf("Unlanded work (spawn refuses until each is continued or abandoned):");
	assert.deepEqual(
		[at > 0, lines[at + 1], lines.some((line) => line.includes(parent))],
		[true, `  ${child} · done · 1 changed file, 0 unlanded commits`, false],
		lines.join("\n"),
	);
});
