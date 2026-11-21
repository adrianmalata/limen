// src/job/wake-text.ts: the text of a job's wake, here how the job ended, on a job folder in the OS temporary folder.
import assert from "node:assert/strict";
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { basename, join } from "node:path";
import test from "node:test";
import { emptyRecord, type JobRecord } from "../../src/job/record.ts";
import { advisoryWake, jobEnding } from "../../src/job/wake-text.ts";

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
