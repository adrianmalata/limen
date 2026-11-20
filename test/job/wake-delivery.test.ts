// src/job/wake-delivery.ts: the notify/ record of who heard a job, on a job folder in the OS temporary folder.
import assert from "node:assert/strict";
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";
import { deliveredSlots } from "../../src/job/wake-delivery.ts";

// A temp of src/atomic-write.ts sits beside its target until the rename or link; a leftover one, after a crash, stays.
test("deliveredSlots does not take the temp of a delivery write for a delivered slot", (t) => {
	const job = mkdtempSync(join(tmpdir(), "limen-wake-delivery-"));
	t.after(() => rmSync(job, { recursive: true, force: true }));
	mkdirSync(join(job, "notify", "delivered"), { recursive: true });
	writeFileSync(join(job, "notify", "delivered", "_advisory.1"), "");
	writeFileSync(join(job, "notify", "delivered", "session-a.4242.9f3c.tmp"), "");
	assert.deepEqual(deliveredSlots(job), ["_advisory.1"]);
});
