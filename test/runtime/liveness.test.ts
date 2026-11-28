// src/runtime/liveness.ts: whether the process a job record names still runs, by its pid, start time and boot (A-056).
import assert from "node:assert/strict";
import test from "node:test";
import { ownerState } from "../../src/runtime/liveness.ts";
import { OTHER_BOOT, own } from "../plant.ts";

test("A-056: a missing identity, or a pid without its start time, is unknown and never alive", async () => {
	const self = await own();
	assert.equal(await ownerState(null), "unknown");
	assert.equal(await ownerState({ ...self, born: null }), "unknown", "a live pid without its start time");
});

test("a recorded boot id that is not the current boot makes the owner dead, though its pid and start time match", async (t) => {
	const self = await own();
	if (self.bootId === null) {
		t.skip("the system gives no boot id");
		return;
	}
	assert.equal(await ownerState(self), "alive");
	assert.equal(await ownerState({ ...self, bootId: OTHER_BOOT }), "dead");
});
