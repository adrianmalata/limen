// src/job/record.ts: a job's record folder, here the log line finalizeJob writes when a job ends.
import assert from "node:assert/strict";
import { mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";
import { finalizeJob } from "../../src/job/record.ts";

// A temp of src/atomic-write.ts sits beside its target until the link; a leftover one, after a crash, stays.
test("finalizeJob counts each steer left in the inbox in its log line, but not the temp of a steer write", async (t) => {
	const job = mkdtempSync(join(tmpdir(), "limen-record-"));
	t.after(() => rmSync(job, { recursive: true, force: true }));
	mkdirSync(join(job, "steer", "inbox"), { recursive: true });
	writeFileSync(join(job, "state"), "running\n");
	writeFileSync(join(job, "steer", "inbox", "0001"), "check the logs\n");
	writeFileSync(join(job, "steer", "inbox", "0002.4242.9f3c.tmp"), "stop\n");
	await finalizeJob(job, "stopped", "stopped by request");
	assert.match(
		readFileSync(join(job, "log"), "utf8"),
		/\] stopped: stopped by request; 1 steer\(s\) never delivered\n$/,
	);
});
