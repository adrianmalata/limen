// src/job/wake-delivery.ts: the notify/ record of who heard a job, on a job folder in the OS temporary folder: the
// delivered slots, the receipt family of a slot, and the unconfirmed attempts of a family.
import assert from "node:assert/strict";
import { existsSync, mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test, { type TestContext } from "node:test";
import { claimDelivery, deliveredSlots, receiptFamily, recordUnconfirmed } from "../../src/job/wake-delivery.ts";

/** A job folder in the OS temporary folder, removed after the test. */
function jobFolder(t: TestContext): string {
	const job = mkdtempSync(join(tmpdir(), "limen-wake-delivery-"));
	t.after(() => rmSync(job, { recursive: true, force: true }));
	return job;
}

// A temp of src/atomic-write.ts sits beside its target until the rename or link; a leftover one, after a crash, stays.
test("deliveredSlots does not take the temp of a delivery write for a delivered slot", (t) => {
	const job = jobFolder(t);
	mkdirSync(join(job, "notify", "delivered"), { recursive: true });
	writeFileSync(join(job, "notify", "delivered", "_advisory.1"), "");
	writeFileSync(join(job, "notify", "delivered", "session-a.4242.9f3c.tmp"), "");
	assert.deepEqual(deliveredSlots(job), ["_advisory.1"]);
});

// The D-092 note: one family per job made a heard queue diagnosis hold back a later stall note in the same session.
// The slots written before R-036 (`_advisory.<session>`, and `_uncertainty.` before R-005) stay advisory receipts of no
// source, never a completion's.
test("receiptFamily gives each advisory source its own family, an older advisory slot the family of no source, and the others theirs", () => {
	const slots = [
		"_advisory.queue.s1",
		"_advisory.stall._fallback",
		"_advisory.s1",
		"_uncertainty.s1",
		"_start.s1",
		"s1",
	];
	assert.deepEqual(slots.map(receiptFamily), [
		"_advisory.queue",
		"_advisory.stall",
		"_advisory",
		"_advisory",
		"_start",
		"_completion",
	]);
});

/** Callbacks of a delivery that the test does not watch. */
const QUIET = { blocked() {}, protected: () => false, pending() {}, accepted() {}, released() {} };

// The D-092 note: the attempt counter's family is per source, so the queue's failed wakes do not spend the stall's.
test("an advisory source whose two attempts went unconfirmed does not stop the delivery of another source's", (t) => {
	const job = jobFolder(t);
	const queue = join(job, "notify", "claims", "_advisory.queue.s1");
	for (let attempt = 0; attempt < 2; attempt += 1) {
		mkdirSync(queue, { recursive: true });
		recordUnconfirmed(queue);
	}
	const sent: string[] = [];
	const routed = claimDelivery(
		job,
		"_advisory.stall.s1",
		() => true,
		() => {
			sent.push("stall");
		},
		QUIET,
	);
	assert.deepEqual([existsSync(join(queue, "blocked")), routed, sent], [true, true, ["stall"]]);
});
