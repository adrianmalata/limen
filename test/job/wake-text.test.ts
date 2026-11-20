// src/job/wake-text.ts: the text of a job's wake, here how the job ended, on a job folder in the OS temporary folder.
import assert from "node:assert/strict";
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";
import { jobEnding } from "../../src/job/wake-text.ts";

// A temp of src/atomic-write.ts sits beside its target until the link; a leftover one, after a crash, stays.
test("jobEnding counts each steer left in the inbox, but not the temp of a steer write", (t) => {
	const job = mkdtempSync(join(tmpdir(), "limen-wake-text-"));
	t.after(() => rmSync(job, { recursive: true, force: true }));
	mkdirSync(join(job, "steer", "inbox"), { recursive: true });
	writeFileSync(join(job, "steer", "inbox", "0001"), "check the logs\n");
	writeFileSync(join(job, "steer", "inbox", "0002.4242.9f3c.tmp"), "stop\n");
	assert.equal(jobEnding(job), "1 steer(s) never delivered");
});
