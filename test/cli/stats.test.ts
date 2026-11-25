// `limen stats` on records and sessions written by hand: the jobs by route and role, the lands with their tokens and
// lead time, the coordinator sessions of `--sessions`, the failures by kind and what it did not read (D-073, D-098).
import assert from "node:assert/strict";
import { existsSync, readdirSync } from "node:fs";
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
		"Lands: none",
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
		"Lands: none",
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
		"Lands: none",
		"Failed by kind: none",
		"",
	]);
});

// R-101 review round 2, G2: before R-101 the daily prune deleted a record that never started and a folder with no
// record, and now it moves them into the job archive; neither ran, so the counts skip them there (`everRan`), as the
// claim lookup does (F1), and a project's counts stay what they were before the crash left them.
test("limen stats counts after a daily prune archived a record that never started and a folder with no record as before they were left", async (t) => {
	const p = await project(t);
	const times = ["2026-10-02T08:00:00.000Z", "2026-10-02T08:01:00.000Z", "2026-10-02T08:30:00.000Z"];
	await writeRecord(jobs(p, "2026-10-02-worker-1a2b3c4d"), { role: "worker", route: HIGH, ...ran("done", times) });
	const before = limen(p, ["stats"]);
	const [stale, empty] = ["2026-10-01-stale-5e6f7a8b", "2026-11-24-norecord-9c0d1e2f"];
	const started = { startedAt: "2026-10-01T00:00:00.000Z", spawnerPid: null };
	await writeRecord(jobs(p, stale), { role: "worker", route: HIGH, state: "starting", ...started });
	await mkdir(jobs(p, empty));
	await writeFile(join(jobs(p, empty), "task.md"), "a task with no record\n");
	const swept = limen(p, ["seat", "sweep"]);
	const archive = join(p.root, ".limen", "archive");
	const archived = existsSync(archive)
		? readdirSync(archive).flatMap((month) => readdirSync(join(archive, month)))
		: [];
	assert.deepEqual([swept.status, archived.sort()], [0, [stale, empty].sort()], swept.stderr);
	const after = limen(p, ["stats"]);
	assert.deepEqual([before.status, after.status, outputText(after)], [0, 0, outputText(before)], after.stderr);
});

test("limen stats on a project with no records prints a heading of 0 records, no rows, no land and no failure", async (t) => {
	const p = await project(t);
	const run = limen(p, ["stats"]);
	assert.equal(run.status, 0, run.stderr);
	assert.deepEqual(outputText(run).split("\n"), [
		"Jobs by route and role (0 records)",
		"Lands: none",
		"Failed by kind: none",
		"",
	]);
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

const SHA = "a".repeat(40);
/** The branch of the job `id`, as spawn names a new job's branch. */
const branchOf = (id: string) => ({ branch: `limen/${id}` });

/**
 * The history of a project with three lands and two jobs of no land. A land by `limen land`: a worker continued once
 * (its parent waited 10 minutes in the start queue) and a reviewer of its branch. A land by `limen ticket done`, whose
 * marker holds a day. A migrated land: a worker and a reviewer of its branch on the older route, with no queue wait.
 * Outside every land: a worker failed on the quota and a reviewer of that worker's branch.
 */
async function lands(p: Plant): Promise<void> {
	const first = jobs(p, "2026-11-02-worker-1a2b3c4d");
	const branch = branchOf("2026-11-02-worker-1a2b3c4d");
	await writeRecord(first, {
		role: "worker",
		route: HIGH,
		...branch,
		...ran("done", ["2026-11-02T10:00:00.000Z", "2026-11-02T10:00:05.000Z", "2026-11-02T11:00:00.000Z"]),
		queueWait: {
			since: "2026-11-02T10:00:05.000Z",
			diagnosedAt: null,
			diagnosis: null,
			leftAt: "2026-11-02T10:10:05.000Z",
		},
	});
	await transcript(first, [assistant("2026-11-02T10:20:00.000Z", usage(100_000, 50_000, 10_000_000, 500_000))]);
	const landed = jobs(p, "2026-11-02-worker-2b3c4d5e");
	await writeRecord(landed, {
		role: "worker",
		route: HIGH,
		...branch,
		parent: "2026-11-02-worker-1a2b3c4d",
		...ran("done", ["2026-11-02T12:00:00.000Z", "2026-11-02T12:00:02.000Z", "2026-11-02T12:30:00.000Z"]),
		landed: { sha: SHA, at: "2026-11-02T14:00:00.000Z" },
	});
	await transcript(landed, [assistant("2026-11-02T12:10:00.000Z", usage(50_000, 30_000, 5_000_000, 200_000))]);
	const review = jobs(p, "2026-11-02-reviewer-3c4d5e6f");
	await writeRecord(review, {
		role: "reviewer",
		route: XHIGH,
		...branch,
		...ran("done", ["2026-11-02T12:35:00.000Z", "2026-11-02T12:35:01.000Z", "2026-11-02T13:20:00.000Z"]),
	});
	await transcript(review, [assistant("2026-11-02T12:40:00.000Z", usage(20_000, 10_000, 2_000_000, 100_000))]);

	const done = jobs(p, "2026-11-03-worker-4d5e6f7a");
	await writeRecord(done, {
		role: "worker",
		route: HIGH,
		...branchOf("2026-11-03-worker-4d5e6f7a"),
		...ran("done", ["2026-11-03T09:00:00.000Z", "2026-11-03T09:00:03.000Z", "2026-11-03T09:50:00.000Z"]),
		landed: { sha: SHA, at: "2026-11-04T00:00:00.000Z" },
	});
	await transcript(done, [assistant("2026-11-03T09:10:00.000Z", usage(10_000, 5_000, 1_000_000, 60_000))]);

	const migrated = jobs(p, "2026-10-09-worker-5e6f7a8b");
	await writeRecord(migrated, {
		role: "worker",
		route: OLD,
		...branchOf("2026-10-09-worker-5e6f7a8b"),
		...old("done", "2026-10-09T08:00:00.000Z", "2026-10-09T09:20:00.000Z"),
		landed: { sha: SHA, at: "2026-10-09T10:00:00.000Z" },
	});
	await transcript(migrated, [assistant("2026-10-09T08:30:00.000Z", usage(120_000, 5_000, 0, 0))]);
	await writeRecord(jobs(p, "2026-10-09-reviewer-6f7a8b9c"), {
		role: "reviewer",
		route: OLD,
		...branchOf("2026-10-09-worker-5e6f7a8b"),
		...old("done", "2026-10-09T09:30:00.000Z", "2026-10-09T09:55:00.000Z"),
	});

	const quota = jobs(p, "2026-11-05-worker-7a8b9c0d");
	await writeRecord(quota, {
		role: "worker",
		route: HIGH,
		...branchOf("2026-11-05-worker-7a8b9c0d"),
		...ran("failed", ["2026-11-05T09:00:00.000Z", "2026-11-05T09:00:10.000Z", "2026-11-05T09:40:00.000Z"]),
		failure: { kind: "quota", detail: "error: You've hit your session limit · resets 3pm (UTC)", resetAt: null },
	});
	await transcript(quota, [assistant("2026-11-05T09:10:00.000Z", usage(12_345, 999, 0, 60_000))]);
	const elsewhere = jobs(p, "2026-11-05-reviewer-8b9c0d1e");
	await writeRecord(elsewhere, {
		role: "reviewer",
		route: XHIGH,
		...branchOf("2026-11-05-worker-7a8b9c0d"),
		...ran("done", ["2026-11-05T10:00:00.000Z", "2026-11-05T10:00:02.000Z", "2026-11-05T10:30:00.000Z"]),
	});
	await transcript(elsewhere, [assistant("2026-11-05T10:05:00.000Z", usage(5_000, 45_678, 1_234_567, 20_000))]);
}

/** A Pi session entry as one line, as `assistant` writes a message. */
function entry(type: string, timestamp: string, fields: Record<string, unknown>): string {
	return JSON.stringify({ type, id: `e-${timestamp}`, parentId: null, timestamp, ...fields });
}
/** The owner's message, which starts a run of the coordinator. */
const owner = (timestamp: string) =>
	entry("message", timestamp, { message: { role: "user", content: "go on", timestamp: Date.parse(timestamp) } });
/** A Limen message (a wake), which starts a run of the coordinator as a Pi custom message (E-16). */
const wake = (timestamp: string) =>
	entry("custom_message", timestamp, { customType: "limen-wake", content: "a job ended", display: true });
/** An assistant message whose one bash tool call runs `command`. */
function calling(timestamp: string, command: string, tokens: ReturnType<typeof usage>): string {
	const call = { type: "toolCall", id: `call-${timestamp}`, name: "bash", arguments: { command } };
	const message = {
		role: "assistant",
		content: [call],
		provider: "anthropic",
		model: "claude-opus-5-5",
		usage: tokens,
	};
	return entry("message", timestamp, { message });
}
/** The bash result of the call that `calling` made at `timestamp`. */
const answered = (timestamp: string, at: string) =>
	entry("message", at, {
		message: { role: "toolResult", toolCallId: `call-${timestamp}`, toolName: "bash", content: [], isError: false },
	});
/** A session file's first line, which holds no usage. */
const header = (timestamp: string) =>
	JSON.stringify({ type: "session", version: 3, id: timestamp, timestamp, cwd: "/work/project" });

/** Writes each of `files`, a name and its lines, into the folder `dir` of coordinator sessions, as Pi writes them. */
async function sessions(dir: string, files: Readonly<Record<string, readonly string[]>>): Promise<void> {
	await mkdir(dir, { recursive: true });
	for (const [name, lines] of Object.entries(files)) {
		await writeFile(join(dir, name), `${lines.join("\n")}\n`);
	}
}

/**
 * Two coordinator sessions: in the first, a `limen land` call, the rest of its run, a wake that starts the next run, a
 * line cut in the middle and a compaction; in the second, a `limen ticket done` call and the owner's message that
 * starts the next run. They span 2026-11-02 to 2026-11-05, so the migrated land of `lands` lies outside them.
 */
async function coordinator(dir: string): Promise<void> {
	const turn = assistant("2026-11-02T09:00:10.000Z", usage(1_000, 500, 200_000, 20_000));
	await sessions(dir, {
		"2026-11-02T09-00-00-000Z_0a1b.jsonl": [
			header("2026-11-02T09:00:00.000Z"),
			owner("2026-11-02T09:00:00.500Z"),
			turn,
			calling("2026-11-02T13:59:00.000Z", "limen land 2b3c4d5e", usage(1_000, 200, 300_000, 5_000)),
			answered("2026-11-02T13:59:00.000Z", "2026-11-02T13:59:30.000Z"),
			assistant("2026-11-02T13:59:40.000Z", usage(500, 100, 305_000, 1_000)),
			wake("2026-11-02T14:30:00.000Z"),
			assistant("2026-11-02T14:30:05.000Z", usage(2_000, 300, 10_000, 90_000)),
			turn.slice(0, 40),
			JSON.stringify({
				type: "compaction",
				id: "c",
				parentId: null,
				timestamp: "2026-11-02T15:00:00.000Z",
				summary: "the work so far",
				firstKeptEntryId: "e-2026-11-02T14:30:05.000Z",
				tokensBefore: 900_000,
				usage: usage(2_000, 1_000, 3_000, 24_000),
			}),
		],
		"2026-11-04T08-00-00-000Z_1c2d.jsonl": [
			header("2026-11-04T08:00:00.000Z"),
			owner("2026-11-04T08:00:00.000Z"),
			calling(
				"2026-11-04T08:00:20.000Z",
				"cd /work/project && limen ticket done F002",
				usage(1_000, 400, 280_000, 30_000),
			),
			answered("2026-11-04T08:00:20.000Z", "2026-11-04T08:00:40.000Z"),
			owner("2026-11-05T09:00:00.000Z"),
			assistant("2026-11-05T09:00:05.000Z", usage(3_000, 500, 2_000, 70_000)),
			assistant("2026-11-05T09:10:00.000Z", usage(500, 1_000, 100_000, 0)),
		],
	});
}

/** The lines of `limen stats` on the history of `lands`, from the heading to the jobs table's last row. */
const LAND_TABLE = [
	"Jobs by route and role (8 records, 2026-10-09 to 2026-11-05)",
	"  route                                          role      jobs  done  failed  run time  input  cache write  cache read  output",
	"  anthropic/claude-opus-5-5 high                 worker       4     3       1    3 h 00   0.2M         0.8M         16M     86k",
	"  anthropic/claude-opus-5-5 xhigh                reviewer     2     2       0    1 h 15    25k         0.1M        3.2M     56k",
	"  unknown/openai-codex/gpt-6-astra:high unknown  reviewer     1     1       0    0 h 25      0            0           0       0",
	"  unknown/openai-codex/gpt-6-astra:high unknown  worker       1     1       0    1 h 20   0.1M            0           0    5.0k",
];
/** The two lines about the lands of `lands` (D-098 (4), variant A). */
const LAND_LINES = [
	"Lands (3, 2026-10-09 to 2026-11-04), per land: jobs 2.0 · input 0.1M · cache write 0.3M · cache read 6.0M · output 33k",
	"Lead time per land (median): 3 h 00 · queue 0 h 10 · job runs 1 h 20 · review 0 h 45",
];
/** What `Not read` names of the lands of `lands`: the `ticket done` land, and the migrated land's queue and run parts. */
const LANDS_NOT_READ =
	"the lead time of 1 land by limen ticket done · the queue of 1 land · the job runs of 1 land · the review of 1 land";

test("limen stats: the lands of the records and the coordinator's sessions, with their tokens, lead time, turns and turns after a land", async (t) => {
	const p = await project(t);
	await lands(p);
	const dir = join(p.parent, "sessions");
	await coordinator(dir);
	const run = limen(p, ["stats", "--sessions", dir]);
	assert.equal(run.status, 0, run.stderr);
	assert.equal(run.stdout.trimEnd().split("\n").at(-1), SUCCESS);
	assert.deepEqual(outputText(run).split("\n"), [
		...LAND_TABLE,
		...LAND_LINES,
		"Coordinator (2 sessions, 7 turns, 2026-11-02 to 2026-11-05): input 11k · cache write 0.2M · cache read 1.2M · output 4.0k",
		"Coordinator cache read: 0.2M per turn · 0.6M per land · first turn after a land: cache write 80k median, 90k max (2 lands)",
		"Failed by kind: quota 1",
		`Not read: ${LANDS_NOT_READ} · 1 land outside the coordinator sessions' span · 1 line of the coordinator sessions`,
		"",
	]);
});

// D-098 (3): without the flag, stats reads no file outside the project and prints no coordinator line.
test("limen stats without --sessions prints the lands of the records and no coordinator line", async (t) => {
	const p = await project(t);
	await lands(p);
	const run = limen(p, ["stats"]);
	assert.equal(run.status, 0, run.stderr);
	assert.deepEqual(outputText(run).split("\n"), [
		...LAND_TABLE,
		...LAND_LINES,
		"Failed by kind: quota 1",
		`Not read: ${LANDS_NOT_READ}`,
		"",
	]);
});

/** The lines of `limen stats` on the project `p` that start with the lead time line or `Not read`. */
function leadTimeLines(p: Plant): string[] {
	const run = limen(p, ["stats"]);
	assert.equal(run.status, 0, run.stderr);
	return outputText(run)
		.split("\n")
		.filter((line) => line.startsWith("Lead time per land") || line.startsWith("Not read:"));
}

// D-098 (5) (d): `limen ticket done` marks a migrated record with the ticket's day at midnight too (src/job/landing.ts),
// so a land at that time has no lead time, migrated or not.
test("limen stats gives no lead time to a migrated record that limen ticket done marked, and names it on Not read", async (t) => {
	const p = await project(t);
	await writeRecord(jobs(p, "2026-10-09-worker-5e6f7a8b"), {
		role: "worker",
		route: OLD,
		...branchOf("2026-10-09-worker-5e6f7a8b"),
		...old("done", "2026-10-09T08:00:00.000Z", "2026-10-09T09:20:00.000Z"),
		landed: { sha: SHA, at: "2026-10-10T00:00:00.000Z" },
	});
	assert.deepEqual(leadTimeLines(p), [
		"Lead time per land (median): — · queue — · job runs — · review —",
		"Not read: the lead time of 1 land by limen ticket done",
	]);
});

// AC-8: a lead time part that no land's records give is `—`, and `Not read` names the lands each part leaves out.
test("limen stats prints — for each lead time part no land has, and names on Not read the lands whose part is unknown", async (t) => {
	const p = await project(t);
	const branch = branchOf("2026-10-09-worker-5e6f7a8b");
	await writeRecord(jobs(p, "2026-10-09-worker-5e6f7a8b"), {
		role: "worker",
		route: OLD,
		...branch,
		...old("done", null, "2026-10-09T09:20:00.000Z"),
		landed: { sha: SHA, at: "2026-10-09T10:00:00.000Z" },
	});
	await writeRecord(jobs(p, "2026-10-09-reviewer-6f7a8b9c"), {
		role: "reviewer",
		route: OLD,
		...branch,
		...old("done", "2026-10-09T09:30:00.000Z", "2026-10-09T09:55:00.000Z"),
	});
	assert.deepEqual(leadTimeLines(p), [
		"Lead time per land (median): — · queue — · job runs — · review —",
		"Not read: the run time of 1 finished job · the lead time of 1 land · the queue of 1 land · the job runs of 1 land · the review of 1 land",
	]);
});

// D-098 (2): M-03 divides the sessions' cache read by the lands whose time lies within the sessions' span.
test("limen stats leaves a land outside the coordinator sessions' span out of the cache read per land", async (t) => {
	const p = await project(t);
	for (const [id, at] of [
		["2026-11-02-worker-1a2b3c4d", "2026-11-02T14:00:00.000Z"],
		["2026-10-01-worker-2b3c4d5e", "2026-10-01T14:00:00.000Z"],
	] as const) {
		const day = at.slice(0, 10);
		await writeRecord(jobs(p, id), {
			role: "worker",
			route: HIGH,
			...branchOf(id),
			...ran("done", [`${day}T10:00:00.000Z`, `${day}T10:00:01.000Z`, `${day}T11:00:00.000Z`]),
			landed: { sha: SHA, at },
		});
	}
	const dir = join(p.parent, "sessions");
	await sessions(dir, {
		"2026-11-02T09-00-00-000Z_0a1b.jsonl": [
			assistant("2026-11-02T09:00:00.000Z", usage(0, 0, 40_000, 0)),
			assistant("2026-11-02T18:00:00.000Z", usage(0, 0, 20_000, 0)),
		],
	});
	const run = limen(p, ["stats", "--sessions", dir]);
	assert.equal(run.status, 0, run.stderr);
	const lines = outputText(run).split("\n");
	assert.deepEqual(
		lines.filter((line) => line.startsWith("Coordinator cache read:")),
		["Coordinator cache read: 30k per turn · 60k per land · first turn after a land: none found"],
	);
});

// D-098 (2), (5) (d): a land by `limen ticket done` holds its day at midnight UTC, not the time of its call, so it lies
// in the sessions' span by its day, as `ticket done` takes it, the local one (src/project/lanes.ts). The sessions run
// from 09:00 to 18:00 UTC of that day, so in every time zone, from UTC-12 to UTC+14, the day lies from the local day of
// their first entry to that of their last.
test("limen stats counts a land by limen ticket done on the first day of the coordinator sessions in the cache read per land", async (t) => {
	const p = await project(t);
	const id = "2026-11-01-worker-1a2b3c4d";
	await writeRecord(jobs(p, id), {
		role: "worker",
		route: HIGH,
		...branchOf(id),
		...ran("done", ["2026-11-01T10:00:00.000Z", "2026-11-01T10:00:01.000Z", "2026-11-01T11:00:00.000Z"]),
		landed: { sha: SHA, at: "2026-11-02T00:00:00.000Z" },
	});
	const dir = join(p.parent, "sessions");
	await sessions(dir, {
		"2026-11-02T09-00-00-000Z_0a1b.jsonl": [
			assistant("2026-11-02T09:00:00.000Z", usage(0, 0, 40_000, 0)),
			assistant("2026-11-02T18:00:00.000Z", usage(0, 0, 20_000, 0)),
		],
	});
	const run = limen(p, ["stats", "--sessions", dir]);
	assert.equal(run.status, 0, run.stderr);
	assert.deepEqual(
		outputText(run)
			.split("\n")
			.filter((line) => line.startsWith("Coordinator cache read:")),
		["Coordinator cache read: 30k per turn · 60k per land · first turn after a land: none found"],
	);
});

/**
 * The cache read line of `limen stats` on one coordinator session: an assistant message whose bash call runs
 * `command`, then the owner's message and the turn of the run it starts, whose cache write is 50k.
 */
async function afterCallLines(t: TestContext, command: string): Promise<string[]> {
	const p = await project(t);
	const dir = join(p.parent, "sessions");
	await sessions(dir, {
		"2026-11-02T09-00-00-000Z_0a1b.jsonl": [
			calling("2026-11-02T09:00:00.000Z", command, usage(10, 20, 1_000, 30)),
			owner("2026-11-02T09:10:00.000Z"),
			assistant("2026-11-02T09:10:05.000Z", usage(10, 20, 1_000, 50_000)),
		],
	});
	const run = limen(p, ["stats", "--sessions", dir]);
	assert.equal(run.status, 0, run.stderr);
	return outputText(run)
		.split("\n")
		.filter((line) => line.startsWith("Coordinator cache read:"));
}
/** The cache read line of `afterCallLines` when its call is no land. */
const NO_LAND_FOUND = "Coordinator cache read: 1.0k per turn · — per land · first turn after a land: none found";

test("limen stats finds no land in a coordinator's call of limen land --help, which lands nothing", async (t) => {
	assert.deepEqual(await afterCallLines(t, "limen land --help"), [NO_LAND_FOUND]);
});

// The parser takes `-h` as `--help` (src/parser.ts, `asksHelp`), so `limen land <id> -h` prints help and lands nothing.
test("limen stats finds no land in a coordinator's call of limen land <id> -h, which the parser takes as help", async (t) => {
	assert.deepEqual(await afterCallLines(t, "limen land 2b3c4d5e -h"), [NO_LAND_FOUND]);
});

test("limen stats with sessions but no land prints Lands: none and no cache read per land", async (t) => {
	const p = await project(t);
	const dir = join(p.parent, "sessions");
	await sessions(dir, {
		"2026-11-02T09-00-00-000Z_0a1b.jsonl": [assistant("2026-11-02T09:00:00.000Z", usage(10, 20, 1_000, 30))],
	});
	const run = limen(p, ["stats", "--sessions", dir]);
	assert.equal(run.status, 0, run.stderr);
	assert.deepEqual(outputText(run).split("\n"), [
		"Jobs by route and role (0 records)",
		"Lands: none",
		"Coordinator (1 session, 1 turn, 2026-11-02 to 2026-11-02): input 10 · cache write 30 · cache read 1.0k · output 20",
		"Coordinator cache read: 1.0k per turn · — per land · first turn after a land: none found",
		"Failed by kind: none",
		"",
	]);
});

test("SESSIONS_NOT_FOUND: limen stats --sessions with a folder that does not exist exits 2 and names limen stats --help", async (t) => {
	const p = await project(t);
	const run = limen(p, ["stats", "--sessions", join(p.parent, "no-sessions")]);
	assert.equal(run.status, 2, run.stdout);
	assert.deepEqual(readOutcome(run), { class: "usage", code: "SESSIONS_NOT_FOUND", next: "limen stats --help" });
});

test("SESSIONS_NOT_FOUND: limen stats --sessions with a path that names a file, not a folder, refuses as for no folder", async (t) => {
	const p = await project(t);
	const file = join(p.parent, "sessions.jsonl");
	await writeFile(file, `${assistant("2026-11-02T09:00:00.000Z", usage(10, 20, 1_000, 30))}\n`);
	const run = limen(p, ["stats", "--sessions", file]);
	assert.equal(run.status, 2, run.stdout);
	assert.deepEqual(readOutcome(run), { class: "usage", code: "SESSIONS_NOT_FOUND", next: "limen stats --help" });
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
