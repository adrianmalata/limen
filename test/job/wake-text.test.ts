// src/job/wake-text.ts: the text of a job's wake, here how the job ended and what a quota job's wake asks, on a job
// folder in the OS temporary folder.
import assert from "node:assert/strict";
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { basename, join } from "node:path";
import test, { type TestContext } from "node:test";
import { emptyRecord, type JobRecord, serialized } from "../../src/job/record.ts";
import { advisoryWake, completionWake, jobEnding } from "../../src/job/wake-text.ts";

// A temp of src/atomic-write.ts sits beside its target until the link; a leftover one, after a crash, stays.
test("jobEnding counts each steer left in the inbox, but not the temp of a steer write", (t) => {
	const job = mkdtempSync(join(tmpdir(), "limen-wake-text-"));
	t.after(() => rmSync(job, { recursive: true, force: true }));
	mkdirSync(join(job, "steer", "inbox"), { recursive: true });
	writeFileSync(join(job, "steer", "inbox", "0001"), "check the logs\n");
	writeFileSync(join(job, "steer", "inbox", "0002.4242.9f3c.tmp"), "stop\n");
	assert.equal(jobEnding(job), "1 steer(s) never delivered");
});

// T-01: the hook builds an advisory wake from the record its tick read through the damage guard, so the wake reads no
// record of its own, which a damage since that read would throw out of the tick.
test("advisoryWake ends with the record its caller read, not with the job's record file", (t) => {
	const job = mkdtempSync(join(tmpdir(), "limen-wake-text-"));
	t.after(() => rmSync(job, { recursive: true, force: true }));
	writeFileSync(join(job, "record.json"), "{ not json\n");
	const record: JobRecord = { ...emptyRecord(basename(job)), state: "running", commits: ["abc1234 first"] };
	const wake = advisoryWake(job, "demo", basename(job), "limen/demo", "", "a tool stall", false, record);
	assert.match(wake, /\n\nCommits:\nabc1234 first\n\n/);
});

/** The provider's text of the 5-hour limit, which no coordinator message quotes (A-068). */
const LIMIT_TEXT = "error: You've hit your session limit · resets 3pm (UTC)";

/** A failed job's folder in the OS temporary folder, removed after the test, whose record is the job of `fields`. */
function failedJob(t: TestContext, fields: Partial<JobRecord>): { readonly job: string; readonly record: JobRecord } {
	const job = mkdtempSync(join(tmpdir(), "limen-wake-text-"));
	t.after(() => rmSync(job, { recursive: true, force: true }));
	const record: JobRecord = {
		...emptyRecord(basename(job)),
		state: "failed",
		stopReason: LIMIT_TEXT,
		failure: { kind: "quota", detail: LIMIT_TEXT, resetAt: "2026-11-24T15:00:00.000Z" },
		...fields,
	};
	writeFileSync(join(job, "record.json"), serialized(record));
	return { job, record };
}

// D-097 (5) (i), A-068: the wake said `Stop reason: <provider text>` and left the resume to the coordinator.
test("the ending of a quota job says when Limen resumes it and which resume of 3 that is, from the record, with no provider text", (t) => {
	const { job, record } = failedJob(t, { quotaAttempt: 1 });
	assert.equal(
		jobEnding(job, record),
		"Stop: the subscription limit, which resets at 2026-11-24T15:00:00.000Z. Limen resumes the job at 2026-11-24T15:05:00.000Z, resume 2 of 3.",
	);
});

// D-097 (5) (b): without a reset time the resume waits for R-059's usage reading.
test("the ending of a quota job with no reset time says that Limen resumes it once the reset time is known", (t) => {
	const { job, record } = failedJob(t, { failure: { kind: "quota", detail: LIMIT_TEXT, resetAt: null } });
	assert.equal(
		jobEnding(job, record),
		"Stop: the subscription limit, with no reset time read. Limen resumes the job once the reset time is known, resume 1 of 3.",
	);
});

// A-016 (5): the third resume that stops on the limit again is the last one.
test("the ending of a quota-exhausted job says the cap of 3 resumes was reached, with no provider text", (t) => {
	const failure = { kind: "quota-exhausted", detail: LIMIT_TEXT, resetAt: "2026-11-24T15:00:00.000Z" } as const;
	const { job, record } = failedJob(t, { quotaAttempt: 3, failure });
	assert.equal(
		jobEnding(job, record),
		"Stop: the subscription limit, after 3 resumes, the most Limen makes. Limen does not resume it again.",
	);
});

// D-097 (5) (i), templates/agents.md: the coordinator does not continue a job Limen resumes, unless the owner asks.
test("the completion wake of a quota job Limen resumes tells the coordinator to go on with other work and not to continue it", (t) => {
	const { job, record } = failedJob(t, {});
	const wake = completionWake(job, "fix login · F012", "failed", record.id, "limen/fix", "");
	assert.deepEqual(
		{
			provider: wake.includes("hit your session limit"),
			ends: wake.split("\n\n").slice(-2),
		},
		{
			provider: false,
			ends: [
				"Limen resumes this job by itself; it needs nothing from you now.",
				`Go on with other work, and do not continue this job yourself: Limen resumes it. Only when the owner asks to resume it at once, run limen continue ${record.id} "<instruction>"; Limen then leaves it to that continuation.`,
			],
		},
	);
});
