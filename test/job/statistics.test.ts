// src/job/statistics.ts: the operation of `limen stats`, called directly (T-26 (5)): the units of its tokens, the jobs
// of a land and a land's lead time.
import assert from "node:assert/strict";
import { mkdir, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { type TestContext, test } from "node:test";
import { dayOnlyTime, emptyRecord, type JobRecord } from "../../src/job/record.ts";
import { landsOf, leadTimeOf, projectStatistics } from "../../src/job/statistics.ts";
import { plant, writeRecord } from "../plant.ts";

type Tokens = {
	readonly input: number;
	readonly cacheWrite: number;
	readonly cacheRead: number;
	readonly output: number;
};

/**
 * The four token cells (input, cache write, cache read, output) of the one row of the report on a project whose one
 * job has a transcript of one assistant message with `tokens`.
 */
async function tokenCells(t: TestContext, tokens: Tokens): Promise<string[]> {
	const p = await plant();
	t.after(() => p.cleanup());
	const dir = join(p.root, ".limen", "jobs", "2026-11-02-worker-1a2b3c4d");
	await writeRecord(dir);
	const message = { role: "assistant", content: [], provider: "anthropic", model: "claude-opus-5-5", usage: tokens };
	const timestamp = "2026-11-02T10:10:00.000Z";
	await mkdir(join(dir, "session"));
	await writeFile(
		join(dir, "session", "2026-11-02T10-00-00-000Z_0b1c.jsonl"),
		`${JSON.stringify({ type: "message", id: "a", parentId: null, timestamp, message })}\n`,
	);
	// The heading, the line of headers, then the row; its cells stand at least two spaces apart.
	const [, , row] = (await projectStatistics(p.root)).split("\n");
	return (row ?? "").trim().split(/ {2,}/).slice(-4);
}

test("the decimal of a token count follows its rounded value: 9,949 tokens are 9.9k, and 9,950 to 10,000 are 10k", async (t) => {
	const cells = await tokenCells(t, { input: 9_949, cacheWrite: 9_950, cacheRead: 9_999, output: 10_000 });
	assert.deepEqual(cells, ["9.9k", "10k", "10k", "10k"]);
});

test("the unit of a token count follows its rounded value: 99,499 tokens are 99k, and 99,500 to 100,000 are 0.1M", async (t) => {
	const cells = await tokenCells(t, { input: 99_499, cacheWrite: 99_500, cacheRead: 99_999, output: 100_000 });
	assert.deepEqual(cells, ["99k", "0.1M", "0.1M", "0.1M"]);
});

const SHA = "a".repeat(40);
/** A finished record of the job `id` that went from `starting` to `done` at the two times, with `fields`. */
function job(id: string, [started, ended]: readonly [string, string], fields: Partial<JobRecord> = {}): JobRecord {
	return {
		...emptyRecord(id),
		state: "done",
		startedAt: started,
		finishedAt: ended,
		transitions: [
			{ from: null, to: "starting", at: started },
			{ from: "starting", to: "running", at: started },
			{ from: "running", to: "done", at: ended },
		],
		...fields,
	};
}
const ids = (records: readonly JobRecord[]) => records.map((record) => record.id);

// D-098 (1): a land's jobs come from `parent` and from the reviewer's branch, never from Git.
test("a land holds its job, the jobs its parent chain reaches and the reviewers of its branch, and no reviewer of another branch", () => {
	const branch = { branch: "limen/2026-11-01-worker-1a2b3c4d" };
	const parent = job("2026-11-01-worker-1a2b3c4d", ["2026-11-01T10:00:00.000Z", "2026-11-01T11:00:00.000Z"], {
		role: "worker",
		...branch,
	});
	const landed = job("2026-11-01-worker-2b3c4d5e", ["2026-11-01T12:00:00.000Z", "2026-11-01T12:30:00.000Z"], {
		role: "worker",
		parent: parent.id,
		landed: { sha: SHA, at: "2026-11-01T14:00:00.000Z" },
		...branch,
	});
	const reviewer = job("2026-11-01-reviewer-3c4d5e6f", ["2026-11-01T12:40:00.000Z", "2026-11-01T13:00:00.000Z"], {
		role: "reviewer",
		...branch,
	});
	const elsewhere = job("2026-11-01-reviewer-4d5e6f7a", ["2026-11-01T12:40:00.000Z", "2026-11-01T13:00:00.000Z"], {
		role: "reviewer",
		branch: "limen/2026-11-01-worker-9f8e7d6c",
	});
	const lands = landsOf([reviewer, elsewhere, parent, landed]);
	assert.deepEqual(
		lands.map((land) => ids(land.jobs)),
		[[landed.id, parent.id, reviewer.id]],
	);
});

test("a parent that two lands reach through parent belongs only to the land that came first", () => {
	const parent = job("2026-11-01-worker-1a2b3c4d", ["2026-11-01T10:00:00.000Z", "2026-11-01T11:00:00.000Z"], {
		role: "worker",
	});
	const child = (id: string, at: string) =>
		job(id, ["2026-11-01T12:00:00.000Z", "2026-11-01T12:30:00.000Z"], {
			role: "worker",
			parent: parent.id,
			landed: { sha: SHA, at },
		});
	const later = child("2026-11-01-worker-2b3c4d5e", "2026-11-02T09:00:00.000Z");
	const first = child("2026-11-01-worker-3c4d5e6f", "2026-11-01T15:00:00.000Z");
	assert.deepEqual(
		landsOf([later, parent, first]).map((land) => ids(land.jobs)),
		[[first.id, parent.id], [later.id]],
	);
});

// M-06: a part the records cannot give stays unknown, never guessed (D-057 (4)).
test("a land's lead time runs from its first start to its land, split into queue, job runs and review, a migrated job's queue and run part unknown", () => {
	const branch = "limen/2026-10-09-worker-1a2b3c4d";
	const migrated = { at: "2026-11-20T12:00:00.000Z" };
	const worker = job("2026-10-09-worker-1a2b3c4d", ["2026-10-09T08:00:00.000Z", "2026-10-09T09:20:00.000Z"], {
		role: "worker",
		branch,
		migrated,
		landed: { sha: SHA, at: "2026-10-09T10:00:00.000Z" },
	});
	const reviewer = job("2026-10-09-reviewer-2b3c4d5e", ["2026-10-09T09:30:00.000Z", "2026-10-09T09:55:00.000Z"], {
		role: "reviewer",
		branch,
		queueWait: {
			since: "2026-10-09T09:30:00.000Z",
			diagnosedAt: null,
			diagnosis: null,
			leftAt: "2026-10-09T09:35:00.000Z",
		},
	});
	const [land] = landsOf([worker, reviewer]);
	assert.ok(land);
	const minutes = (count: number) => count * 60_000;
	assert.deepEqual(leadTimeOf(land), {
		total: minutes(120),
		queue: undefined,
		runs: undefined,
		review: minutes(20),
	});
});

// M-06 is a split: a job waits in the start queue while its record is `running` (src/runtime/wrapper.ts), so its run
// part leaves out its own queue wait, which `queue` counts.
test("a land's queue, job runs and review add up to its jobs' run times: a job's run part leaves out its own queue wait", () => {
	const branch = "limen/2026-11-01-worker-1a2b3c4d";
	const wait = (since: string, leftAt: string) => ({ since, diagnosedAt: null, diagnosis: null, leftAt });
	const worker = job("2026-11-01-worker-1a2b3c4d", ["2026-11-01T10:00:00.000Z", "2026-11-01T11:00:00.000Z"], {
		role: "worker",
		branch,
		landed: { sha: SHA, at: "2026-11-01T13:00:00.000Z" },
		queueWait: wait("2026-11-01T10:00:00.000Z", "2026-11-01T10:15:00.000Z"),
	});
	const reviewer = job("2026-11-01-reviewer-2b3c4d5e", ["2026-11-01T11:10:00.000Z", "2026-11-01T11:50:00.000Z"], {
		role: "reviewer",
		branch,
		queueWait: wait("2026-11-01T11:10:00.000Z", "2026-11-01T11:20:00.000Z"),
	});
	const [land] = landsOf([worker, reviewer]);
	assert.ok(land);
	const minutes = (count: number) => count * 60_000;
	const time = leadTimeOf(land);
	assert.deepEqual(time, { total: minutes(180), queue: minutes(25), runs: minutes(45), review: minutes(30) });
	assert.equal((time?.queue ?? 0) + (time?.runs ?? 0) + (time?.review ?? 0), minutes(60) + minutes(40));
});

// R-098, review round 3, note 2: the marker's day-only form had two copies, the writer's and this reader's (T-25 (2)).
test("a land by limen ticket done, whose marker holds the ticket's day at midnight, has no lead time", () => {
	const record = job("2026-11-03-worker-1a2b3c4d", ["2026-11-03T09:00:00.000Z", "2026-11-03T09:50:00.000Z"], {
		role: "worker",
		landed: { sha: SHA, at: dayOnlyTime("2026-11-04") },
	});
	const [land] = landsOf([record]);
	assert.ok(land);
	assert.equal(leadTimeOf(land), undefined);
});
