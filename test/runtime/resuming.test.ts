// src/runtime/resuming.ts: the seat sweep's step after the subscription limit on planted records: which failed jobs it
// resumes, when, on which route and as which attempt, the line of a group member and of a resume another path won, a
// failure to start that stops no other job, the task it builds, and the release of owed wakes.
import assert from "node:assert/strict";
import { mkdtemp, readdir, realpath, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test, { type TestContext } from "node:test";
import { type ContinueRequest, startContinue } from "../../src/job/continuation.ts";
import { type JobRecord, readRecord } from "../../src/job/record.ts";
import { referenceWord } from "../../src/job/reference.ts";
import { stateChanged } from "../../src/operation.ts";
import { type CommandText, environmentError, refused, type Success } from "../../src/outcome.ts";
import { resumeAfterQuota } from "../../src/runtime/resuming.ts";
import { repository, writeRecord } from "../plant.ts";

const MINUTE = 60_000;
/** The provider's text of the 5-hour limit: a synthetic copy of the format of audit.md, gate 2 §1, Q1. */
const LIMIT_TEXT = "error: You've hit your session limit · resets 3pm (UTC)";
const ROUTE = { engine: "pi", model: "claude-opus-5-5", provider: "pi-claude", thinking: "high" } as const;

/** An ISO time `minutes` from now: in the past when negative. */
const fromNow = (minutes: number) => new Date(Date.now() + minutes * MINUTE).toISOString();

/** A project in a new folder of the OS temporary folder, removed after the test, and its jobs folder. */
async function project(t: TestContext): Promise<{ readonly root: string; readonly jobs: string }> {
	const root = await realpath(await mkdtemp(join(tmpdir(), "limen-resuming-")));
	t.after(() => rm(root, { recursive: true, force: true }));
	return { root, jobs: join(root, ".limen", "jobs") };
}

/** A job that failed on the subscription limit with the reset `resetAt`, on a worktree of its own, with `fields`. */
async function quotaJob(jobs: string, id: string, resetAt: string | null, fields: Partial<JobRecord> = {}) {
	await writeRecord(join(jobs, id), {
		state: "failed",
		label: "fix login · F012",
		role: "worker",
		branch: `limen/${id}`,
		worktree: join(jobs, "..", "worktrees", id),
		startedAt: fromNow(-120),
		finishedAt: fromNow(-60),
		route: ROUTE,
		stopReason: LIMIT_TEXT,
		failure: { kind: "quota", detail: LIMIT_TEXT, resetAt },
		...fields,
	});
}

/** What a step wrote to its stdout and its stderr. */
function output(): CommandText & { readonly lines: string[]; readonly diagnostics: string[] } {
	const lines: string[] = [];
	const diagnostics: string[] = [];
	return { lines, diagnostics, line: (text) => lines.push(text), diagnostic: (text) => diagnostics.push(text) };
}

/**
 * A start in place of `startContinue`: it keeps each request and publishes the continuation's record on the parent's
 * worktree, newer than the parent, as a published continuation stands; `fail` throws instead for the parent it names.
 */
function starter(jobs: string, fail: Readonly<Record<string, unknown>> = {}) {
	const requests: ContinueRequest[] = [];
	const start = async (request: ContinueRequest): Promise<Success> => {
		const parentId = referenceWord(request.query);
		if (parentId in fail) {
			throw fail[parentId];
		}
		requests.push(request);
		const parent = await readRecord(join(jobs, parentId));
		const id = `2026-11-24-resume-${String(requests.length).padStart(8, "0")}`;
		await writeRecord(join(jobs, id), {
			state: "starting",
			parent: parentId,
			worktree: parent?.worktree ?? null,
			startedAt: new Date().toISOString(),
			...(request.quotaAttempt === undefined ? {} : { quotaAttempt: request.quotaAttempt }),
		});
		return { next: null, ids: { job: id } };
	};
	return { requests, start };
}

/** What one run of the step started and said, with no failure. */
async function quietRun(root: string, jobs: string): Promise<readonly unknown[]> {
	const { requests, start } = starter(jobs);
	const out = output();
	assert.deepEqual(await resumeAfterQuota(root, out, start), []);
	return [requests, out.lines];
}

// D-097 (5) (c), D-057 (4): the record's own fields keep a job from a resume: history, a closed job, the cap reached.
test("a due quota job is not resumed when its record is migrated, landed, abandoned or already exhausted", async (t) => {
	const { root, jobs } = await project(t);
	const sha = "a".repeat(40);
	await quotaJob(jobs, "2026-11-24-migrated-00000001", fromNow(-30), { migrated: { at: fromNow(-10) } });
	await quotaJob(jobs, "2026-11-24-landed-00000002", fromNow(-30), { landed: { sha, at: fromNow(-10) } });
	await quotaJob(jobs, "2026-11-24-abandoned-00000003", fromNow(-30), {
		abandoned: { branch: "limen/abandon/2026-11-24-abandoned-00000003", commit: sha, at: fromNow(-10) },
	});
	await quotaJob(jobs, "2026-11-24-exhausted-00000004", fromNow(-30), {
		quotaAttempt: 3,
		failure: { kind: "quota-exhausted", detail: LIMIT_TEXT, resetAt: fromNow(-30) },
	});
	assert.deepEqual(await quietRun(root, jobs), [[], []]);
});

// D-097 (5) (a), (b): due once now ≥ resetAt + 5 min; with no reset time only R-059's usage reading can resume it.
test("a quota job is not resumed before its reset and 5 minutes, nor without a reset time", async (t) => {
	const { root, jobs } = await project(t);
	await quotaJob(jobs, "2026-11-24-future-00000001", fromNow(30));
	await quotaJob(jobs, "2026-11-24-margin-00000002", fromNow(-2));
	await quotaJob(jobs, "2026-11-24-unknown-00000003", null);
	assert.deepEqual(await quietRun(root, jobs), [[], []]);
});

// D-097 (5) (c): the newest record on a worktree holds its work; an older one's resume would run beside it.
test("a due quota job whose worktree a newer record holds is not resumed", async (t) => {
	const { root, jobs } = await project(t);
	await quotaJob(jobs, "2026-11-24-older-00000001", fromNow(-30));
	await writeRecord(join(jobs, "2026-11-24-newer-00000002"), {
		state: "done",
		worktree: join(root, ".limen", "worktrees", "2026-11-24-older-00000001"),
		startedAt: fromNow(-50),
	});
	assert.deepEqual(await quietRun(root, jobs), [[], []]);
});

// D-097 (5) (c): `continue` refuses a group member outside its team, so the sweep names it and goes on.
test("a due quota job of a group is skipped with one line that names it and its group", async (t) => {
	const { root, jobs } = await project(t);
	const id = "2026-11-24-member-00000001";
	await quotaJob(jobs, id, fromNow(-30), { group: "f012-group", team: "team-1" });
	const { requests, start } = starter(jobs);
	const out = output();
	assert.deepEqual(await resumeAfterQuota(root, out, start), []);
	assert.deepEqual(
		[requests, out.lines],
		[[], [`not resumed ${id}: a member of group f012-group, which only its team continues`]],
	);
});

// A-016 (3), D-097 (5) (d), (e): exactly one resume per reset, on the parent's recorded route and the default timeout.
test("a due quota job is resumed once on its recorded route as attempt 1, and a second run resumes nothing", async (t) => {
	const { root, jobs } = await project(t);
	const id = "2026-11-24-due-00000001";
	await quotaJob(jobs, id, fromNow(-30));
	const { requests, start } = starter(jobs);
	const out = output();
	assert.deepEqual(await resumeAfterQuota(root, out, start), []);
	assert.deepEqual(await resumeAfterQuota(root, out, start), []);
	assert.deepEqual(
		{
			resumed: requests.map(({ query, engine, provider, model, thinking, timeout, quotaAttempt }) => ({
				parent: referenceWord(query),
				route: { engine, provider, model, thinking },
				timeout,
				quotaAttempt,
			})),
			lines: out.lines,
		},
		{
			resumed: [{ parent: id, route: ROUTE, timeout: undefined, quotaAttempt: 1 }],
			lines: [`resumed ${id} after the subscription limit as 2026-11-24-resume-00000001, resume 1 of 3`],
		},
	);
});

// D-097 (5) (g): the cap of 3 counts on the record of the job that stopped on the limit again.
test("a resumed job that stops on the limit again is resumed as the next attempt: 2 after 1, 3 after 2", async (t) => {
	const { root, jobs } = await project(t);
	await quotaJob(jobs, "2026-11-24-second-00000001", fromNow(-30), { quotaAttempt: 1 });
	await quotaJob(jobs, "2026-11-24-third-00000002", fromNow(-30), { quotaAttempt: 2 });
	const { requests, start } = starter(jobs);
	assert.deepEqual(await resumeAfterQuota(root, output(), start), []);
	assert.deepEqual(
		requests.map((request) => [referenceWord(request.query), request.quotaAttempt]),
		[
			["2026-11-24-second-00000001", 2],
			["2026-11-24-third-00000002", 3],
		],
	);
});

// D-097 (5) (f), T-07, T-13, A-068: code builds the task from record fields, with no provider text.
test("the resume's task names the job, the attempt, the reset and the ticket from the record, and no provider text", async (t) => {
	const { root, jobs } = await project(t);
	const id = "2026-11-24-task-00000001";
	const resetAt = fromNow(-30);
	await quotaJob(jobs, id, resetAt);
	const { requests, start } = starter(jobs);
	await resumeAfterQuota(root, output(), start);
	const task = requests[0]?.instruction.join(" ") ?? "";
	assert.equal(
		task,
		[
			`Limen resumed job ${id} after the subscription limit stopped it: resume 1 of 3 (ticket F012).`,
			`The limit reset at ${resetAt}. This job continues in the same session and worktree.`,
			"Continue the task from the point where the last turn stopped; do not redo work that the worktree already holds.",
		].join("\n"),
	);
	assert.equal(task.includes("hit your session limit"), false);
});

// R-034 Decision 4: a refusal of a race is a line, since another path resumed the job; nothing is lost and nothing
// fails.
test("a resume that a live continuation of the job refused is a line of the run and no failure (LIVE_CONTINUATION)", async (t) => {
	const { root, jobs } = await project(t);
	const id = "2026-11-24-live-00000001";
	await quotaJob(jobs, id, fromNow(-30));
	const { start } = starter(jobs, {
		[id]: refused("LIVE_CONTINUATION", "the worktree runs job 2026-11-24-other-00000002"),
	});
	const out = output();
	assert.deepEqual(await resumeAfterQuota(root, out, start), []);
	assert.deepEqual(out.lines, [
		`not resumed ${id}: the worktree runs job 2026-11-24-other-00000002 (LIVE_CONTINUATION)`,
	]);
});

// R-034 Decision 4: another continuation published between the resume's checks and its write is the same race.
test("a resume whose checks another process overtook before its write is a line of the run and no failure (STATE_CHANGED)", async (t) => {
	const { root, jobs } = await project(t);
	const id = "2026-11-24-changed-00000001";
	await quotaJob(jobs, id, fromNow(-30));
	const { start } = starter(jobs, { [id]: stateChanged("the jobs on the worktree") });
	const out = output();
	assert.deepEqual(await resumeAfterQuota(root, out, start), []);
	assert.deepEqual(out.lines, [
		`not resumed ${id}: the jobs on the worktree changed since the command checked it, so it wrote nothing; run it again (STATE_CHANGED)`,
	]);
});

// D-097 (5) (d): the step reads the newest record outside the jobs lock; the resume's checks require it again there,
// so a continuation that another path published and ended in between leaves no second resume.
test("a continuation of the job published and ended between the step's read and the resume's checks leaves no second resume, and the line names the job", async (t) => {
	const { root, jobs } = await project(t);
	await repository(root);
	const id = "2026-11-24-raced-00000001";
	const other = "2026-11-24-other-00000002";
	await quotaJob(jobs, id, fromNow(-30));
	const out = output();
	// The coordinator's own `limen continue` won: its job took the worktree and ended before the resume's checks.
	const start = async (request: ContinueRequest, cwd: string, said: CommandText): Promise<Success> => {
		const parent = await readRecord(join(jobs, id));
		const at = new Date().toISOString();
		await writeRecord(join(jobs, other), {
			state: "done",
			parent: id,
			worktree: parent?.worktree ?? null,
			startedAt: at,
		});
		return startContinue(request, cwd, said, undefined, "limen seat sweep");
	};
	assert.deepEqual(await resumeAfterQuota(root, out, start), []);
	assert.deepEqual(
		{ jobs: (await readdir(jobs)).sort(), lines: out.lines.map((line) => line.replace(/: .*\(/, ": … (")) },
		{ jobs: [other, id].sort(), lines: [`not resumed ${id}: … (LIVE_CONTINUATION)`] },
	);
});

// R-034 Decision 4, R-032's steps: a failure to start is that job's, and the other jobs go on.
test("a resume that fails to start is returned as that job's failure, and the next due job is still resumed", async (t) => {
	const { root, jobs } = await project(t);
	const [broken, next] = ["2026-11-24-broken-00000001", "2026-11-24-next-00000002"];
	await quotaJob(jobs, broken, fromNow(-30));
	await quotaJob(jobs, next, fromNow(-30));
	const missing = environmentError("ENGINE_MISSING", "pi is not on PATH");
	const { requests, start } = starter(jobs, { [broken]: missing });
	const failed = await resumeAfterQuota(root, output(), start);
	assert.deepEqual(
		[failed, requests.map((request) => referenceWord(request.query))],
		[[{ jobDir: join(jobs, broken), error: missing }], [next]],
	);
});

// A-016 (2), (4), D-097 (5) (h): the sweep releases an owed wake 5 minutes after its reset, or one hour after it was
// owed when no reset was read, and the hook then delivers it.
test("an owed wake is released 5 minutes after its reset, or an hour after it was owed with no reset, and not before", async (t) => {
	const { root, jobs } = await project(t);
	const owed = {
		"2026-11-24-reset-00000001": { since: fromNow(-40), resetAt: fromNow(-30) },
		"2026-11-24-early-00000002": { since: fromNow(-40), resetAt: fromNow(-2) },
		"2026-11-24-hour-00000003": { since: fromNow(-61), resetAt: null },
		"2026-11-24-wait-00000004": { since: fromNow(-50), resetAt: null },
	};
	for (const [id, owedWake] of Object.entries(owed)) {
		await writeRecord(join(jobs, id), { state: "done", finishedAt: owedWake.since, owedWake });
	}
	const out = output();
	assert.deepEqual(await resumeAfterQuota(root, out, starter(jobs).start), []);
	const left = await Promise.all(Object.keys(owed).map(async (id) => (await readRecord(join(jobs, id)))?.owedWake));
	assert.deepEqual(
		[left, out.lines],
		[
			[undefined, owed["2026-11-24-early-00000002"], undefined, owed["2026-11-24-wait-00000004"]],
			["released the owed wake of 2026-11-24-hour-00000003", "released the owed wake of 2026-11-24-reset-00000001"],
		],
	);
});
