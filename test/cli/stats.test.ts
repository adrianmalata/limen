// `limen stats`: this project's job records and each job's own transcript, counted by route and role, then the
// failures by kind, then what it did not read (D-072, D-073), on records written by hand.
import assert from "node:assert/strict";
import { mkdir, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { type TestContext, test } from "node:test";
import type { JobRecord } from "../../src/job/record.ts";
import { outputText, readOutcome } from "../final-line.ts";
import { limen, type Plant, plant, writeRecord } from "../plant.ts";
import { snapshot } from "../snapshot.ts";

/** A project with no job yet; removed after the test. */
async function project(t: TestContext): Promise<Plant> {
	const p = await plant();
	t.after(() => p.cleanup());
	return p;
}

const jobs = (p: Plant, id: string) => join(p.root, ".limen", "jobs", id);

const HIGH = { engine: "pi", provider: "anthropic", model: "claude-opus-5-5", thinking: "high" };
const XHIGH = { ...HIGH, thinking: "xhigh" };
/** The route of a migrated record: the older Limen kept only its engine and model (D-057 (4)). */
const OLD = { engine: "pi", provider: null, model: "openai-codex/gpt-6-astra:high", thinking: null };
const MIGRATED = { migrated: { at: "2026-11-20T12:00:00.000Z" } };

/** The fields of a record of this Limen that went from `starting` through `running` to `state` at the three times. */
function ran(state: "done" | "failed", [started, running, ended]: readonly string[]): Partial<JobRecord> {
	return {
		state,
		startedAt: started ?? null,
		finishedAt: ended ?? null,
		transitions: [
			{ from: null, to: "starting", at: started ?? "" },
			{ from: "starting", to: "running", at: running ?? "" },
			{ from: "running", to: state, at: ended ?? "" },
		],
	};
}

/** The fields of a migrated record, whose transitions come only from its start and finish times (D-057 (4)). */
function old(state: "done" | "failed" | "stopped", started: string | null, ended: string): Partial<JobRecord> {
	return {
		state,
		startedAt: started,
		finishedAt: ended,
		transitions: [
			...(started ? [{ from: null, to: "starting" as const, at: started }] : []),
			{ from: null, to: state, at: ended },
		],
		...MIGRATED,
	};
}

/** A Pi `Usage` with its four classes. */
function usage(input: number, output: number, cacheRead: number, cacheWrite: number) {
	const cost = { input: 0, output: 0, cacheRead: 0, cacheWrite: 0, total: 0 };
	return { input, output, cacheRead, cacheWrite, totalTokens: input + output + cacheRead + cacheWrite, cost };
}
function assistant(timestamp: string, tokens: ReturnType<typeof usage>): string {
	const message = { role: "assistant", content: [], provider: "anthropic", model: "claude-opus-5-5", usage: tokens };
	return JSON.stringify({ type: "message", id: timestamp, parentId: null, timestamp, message });
}
/** Writes `lines` as the transcript of the job folder `dir`, as Pi writes it below `--session-dir`. */
async function transcript(dir: string, lines: readonly string[]): Promise<void> {
	await mkdir(join(dir, "session"), { recursive: true });
	await writeFile(join(dir, "session", "2026-11-01T00-00-00-000Z_0b1c.jsonl"), `${lines.join("\n")}\n`);
}

/**
 * The history of a project: four records of this Limen on two routes (a worker done, one failed on the quota, one
 * failed with no known kind, and a reviewer whose transcript has a line cut in the middle), four migrated records on
 * the older route (a worker failed on a timeout, a scout, a job with no role, and a worker with no start time), a
 * record that does not parse, a folder with no record, and a folder the migration could not move.
 */
async function history(p: Plant): Promise<void> {
	const done = jobs(p, "2026-11-02-worker-1a2b3c4d");
	await writeRecord(done, {
		role: "worker",
		route: HIGH,
		...ran("done", ["2026-11-02T10:00:00.000Z", "2026-11-02T10:00:05.000Z", "2026-11-02T11:30:00.000Z"]),
	});
	await transcript(done, [assistant("2026-11-02T10:10:00.000Z", usage(400_000, 700_000, 100_000_000, 3_000_000))]);
	const quota = jobs(p, "2026-11-03-worker-2b3c4d5e");
	await writeRecord(quota, {
		role: "worker",
		route: HIGH,
		...ran("failed", ["2026-11-03T09:00:00.000Z", "2026-11-03T09:00:10.000Z", "2026-11-03T09:40:00.000Z"]),
		failure: { kind: "quota", detail: "error: You've hit your session limit · resets 3pm (UTC)", resetAt: null },
	});
	await transcript(quota, [assistant("2026-11-03T09:10:00.000Z", usage(12_345, 999, 0, 60_000))]);
	await writeRecord(jobs(p, "2026-11-04-worker-3c4d5e6f"), {
		role: "worker",
		route: HIGH,
		...ran("failed", ["2026-11-04T14:00:00.000Z", "2026-11-04T14:00:03.000Z", "2026-11-04T14:20:00.000Z"]),
		failure: { kind: null, detail: "the engine said nothing", resetAt: null },
	});
	const review = jobs(p, "2026-11-05-reviewer-4d5e6f7a");
	await writeRecord(review, {
		role: "reviewer",
		route: XHIGH,
		...ran("done", ["2026-11-05T12:00:00.000Z", "2026-11-05T12:00:02.000Z", "2026-11-05T12:45:00.000Z"]),
	});
	const turn = assistant("2026-11-05T12:05:00.000Z", usage(5_000, 45_678, 1_234_567, 20_000));
	const compaction = JSON.stringify({
		type: "compaction",
		id: "c",
		parentId: "2026-11-05T12:05:00.000Z",
		timestamp: "2026-11-05T12:30:00.000Z",
		summary: "the review so far",
		firstKeptEntryId: "2026-11-05T12:05:00.000Z",
		tokensBefore: 900_000,
		usage: usage(2_000, 1_000, 3_000, 24_000),
	});
	await transcript(review, [turn, turn.slice(0, 50), compaction]);

	const timeout = jobs(p, "2026-10-02-worker-5e6f7a8b");
	await writeRecord(timeout, {
		role: "worker",
		route: OLD,
		...old("failed", "2026-10-02T08:00:00.000Z", "2026-10-02T09:30:00.000Z"),
		failure: { kind: "timeout", detail: "timeout after 5400000ms", resetAt: null },
	});
	await transcript(timeout, [assistant("2026-10-02T08:30:00.000Z", usage(950, 120, 0, 0))]);
	await writeRecord(jobs(p, "2026-10-03-scout-6f7a8b9c"), {
		role: "scout",
		route: OLD,
		...old("done", "2026-10-03T08:00:00.000Z", "2026-10-03T08:20:00.000Z"),
	});
	await writeRecord(jobs(p, "2026-10-04-job-7a8b9c0d"), {
		role: null,
		route: OLD,
		...old("stopped", "2026-10-04T08:00:00.000Z", "2026-10-04T08:10:00.000Z"),
	});
	await writeRecord(jobs(p, "2026-10-05-worker-8b9c0d1e"), {
		role: "worker",
		route: OLD,
		...old("done", null, "2026-10-05T10:00:00.000Z"),
	});

	await mkdir(jobs(p, "2026-11-06-broken-9c0d1e2f"));
	await writeFile(join(jobs(p, "2026-11-06-broken-9c0d1e2f"), "record.json"), '{"version":1,"id":"2026-11-06-broken');
	await mkdir(jobs(p, "2026-11-07-empty-0e1f2a3b"));
	await writeFile(join(jobs(p, "2026-11-07-empty-0e1f2a3b"), "task.md"), "a task with no record\n");
	const unmigrated = join(p.root, ".limen", "unmigrated", "2026-09-30-orphan-0d1e2f3a");
	await mkdir(unmigrated, { recursive: true });
	await writeFile(join(unmigrated, "label"), "never published\n");
}

const SUCCESS = '{"class":"ok","code":null,"next":null}';

test("limen stats: the jobs by route and role, the failures by kind and what was not read, over a project's history", async (t) => {
	const p = await project(t);
	await history(p);
	const run = limen(p, ["stats"]);
	assert.equal(run.status, 0, run.stderr);
	assert.equal(run.stdout.trimEnd().split("\n").at(-1), SUCCESS);
	assert.deepEqual(outputText(run).split("\n"), [
		"Jobs by route and role (8 records, 2026-10-02 to 2026-11-05)",
		"  route                                          role      jobs  done  failed  run time  input  cache write  cache read  output",
		"  anthropic/claude-opus-5-5 high                 worker       3     1       2    2 h 30   0.4M         3.1M        100M    0.7M",
		"  anthropic/claude-opus-5-5 xhigh                reviewer     1     1       0    0 h 45   7.0k          44k        1.2M     47k",
		"  unknown/openai-codex/gpt-6-astra:high unknown  scout        1     1       0    0 h 20      0            0           0       0",
		"  unknown/openai-codex/gpt-6-astra:high unknown  unknown      1     0       0    0 h 10      0            0           0       0",
		"  unknown/openai-codex/gpt-6-astra:high unknown  worker       2     1       1    1 h 30    950            0           0     120",
		"Failed by kind: quota 1 · timeout 1 · unknown 1",
		"Not read: 1 folder in .limen/unmigrated/ · 1 folder with no record (limen status --all) · 1 record that does not parse (limen status --all) · 1 transcript line of 2026-11-05-reviewer-4d5e6f7a · the run time of 1 finished job",
		"",
	]);
});

// T-33: the scout role is cut, and the records of the scouts that ran stay history, read like any other role.
test("T-33: limen stats reads a historical scout record as a row of its role", async (t) => {
	const p = await project(t);
	await writeRecord(jobs(p, "2026-10-03-scout-6f7a8b9c"), {
		role: "scout",
		route: OLD,
		...old("done", "2026-10-03T08:00:00.000Z", "2026-10-03T08:20:00.000Z"),
	});
	const run = limen(p, ["stats"]);
	assert.equal(run.status, 0, run.stderr);
	assert.deepEqual(outputText(run).split("\n"), [
		"Jobs by route and role (1 record, 2026-10-03 to 2026-10-03)",
		"  route                                          role   jobs  done  failed  run time  input  cache write  cache read  output",
		"  unknown/openai-codex/gpt-6-astra:high unknown  scout     1     1       0    0 h 20      0            0           0       0",
		"Failed by kind: none",
		"",
	]);
});

// Gate 2 §2: the counts run over every record, the job archive included, so a retire takes no job out of them.
test("limen stats counts a job of the job archive as a record of its route and role, with its transcript", async (t) => {
	const p = await project(t);
	const times = ["2026-10-02T08:00:00.000Z", "2026-10-02T08:01:00.000Z", "2026-10-02T08:30:00.000Z"];
	const kept = jobs(p, "2026-10-02-kept-1a2b3c4d");
	const archived = join(p.root, ".limen", "archive", "2026-10", "2026-10-02-archived-5e6f7a8b");
	for (const dir of [kept, archived]) {
		await writeRecord(dir, { role: "worker", route: HIGH, ...ran("done", times) });
	}
	await transcript(archived, [assistant("2026-10-02T08:10:00.000Z", usage(1_000, 2_000, 0, 0))]);
	const run = limen(p, ["stats"]);
	assert.equal(run.status, 0, run.stderr);
	assert.deepEqual(outputText(run).split("\n"), [
		"Jobs by route and role (2 records, 2026-10-02 to 2026-10-02)",
		"  route                           role    jobs  done  failed  run time  input  cache write  cache read  output",
		"  anthropic/claude-opus-5-5 high  worker     2     2       0    1 h 00   1.0k            0           0    2.0k",
		"Failed by kind: none",
		"",
	]);
});

test("limen stats on a project with no records prints a heading of 0 records, no rows and no failure", async (t) => {
	const p = await project(t);
	const run = limen(p, ["stats"]);
	assert.equal(run.status, 0, run.stderr);
	assert.deepEqual(outputText(run).split("\n"), ["Jobs by route and role (0 records)", "Failed by kind: none", ""]);
});

// T-04: a read command writes nothing, so the state snapshot of the refusal tests (T-38 (4)) stays the same.
test("T-04: limen stats writes nothing: the project's state snapshot stays identical", async (t) => {
	const p = await project(t);
	await history(p);
	const before = snapshot(p.root);
	const run = limen(p, ["stats"]);
	assert.equal(run.status, 0, run.stderr);
	assert.deepEqual(snapshot(p.root), before);
});

// D-057 (6): until the migration ran, a command that reads jobs refuses the project and names the migration.
test("NOT_MIGRATED: limen stats refuses a project not yet migrated with exit 4 and names limen migrate --dry-run", async (t) => {
	const p = await project(t);
	const dir = jobs(p, "2026-11-11-old-1a2b3c4d");
	await mkdir(dir, { recursive: true });
	await writeFile(join(dir, "state"), "done\n");
	const run = limen(p, ["stats"]);
	assert.equal(run.status, 4, run.stdout);
	assert.deepEqual(readOutcome(run), { class: "environment", code: "NOT_MIGRATED", next: "limen migrate --dry-run" });
});
