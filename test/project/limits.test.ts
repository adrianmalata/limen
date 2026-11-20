// src/project/limits.ts: the limits of a project's .agents/limen/limits.json, the only place that sets them.
import assert from "node:assert/strict";
import { mkdir, mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test, { type TestContext } from "node:test";
import { limitCount, limitMs, PLANT_LIMITS, plantLimits } from "../../src/project/limits.ts";
import { withEnvironment } from "../environment.ts";

/** A project folder in the OS temporary folder whose limits file holds `text`; none when `text` is undefined. */
async function project(t: TestContext, text?: string): Promise<string> {
	const root = await mkdtemp(join(tmpdir(), "limen-limits-"));
	t.after(() => rm(root, { recursive: true, force: true }));
	if (text !== undefined) {
		await mkdir(join(root, ".agents/limen"), { recursive: true });
		await writeFile(join(root, PLANT_LIMITS), text);
	}
	return root;
}

test("T-03: LIMEN_PREPARE_MS and LIMEN_TOOL_STALL_MS set in the environment do not override prepare and toolStall", async (t) => {
	const root = await project(t, '{ "prepare": "20m", "toolStall": "15m" }\n');
	withEnvironment(t, { LIMEN_PREPARE_MS: "1000", LIMEN_TOOL_STALL_MS: "1000" });
	assert.deepEqual([limitMs("prepare", 1, root), limitMs("toolStall", 1, root)], [20 * 60_000, 15 * 60_000]);
});

test("T-03: LIMEN_MAX_TOOL_CALLS set in the environment does not override toolCalls", async (t) => {
	const root = await project(t, '{ "toolCalls": 40 }\n');
	withEnvironment(t, { LIMEN_MAX_TOOL_CALLS: "1" });
	assert.equal(limitCount("toolCalls", 900, root), 40);
});

test("a limits file of the rebuild-base form, with prepare and toolStall, reads as it did", async (t) => {
	const root = await project(t, '{ "prepare": "20m", "toolStall": "15m" }\n');
	assert.deepEqual(plantLimits(root), { limits: { prepare: 20 * 60_000, toolStall: 15 * 60_000 }, ignored: [] });
});

test("a project with no limits file, or a file without toolCalls, keeps the cap its caller gives", async (t) => {
	const [none, other] = await Promise.all([project(t), project(t, '{ "prepare": "20m" }\n')]);
	assert.deepEqual([limitCount("toolCalls", 900, none), limitCount("toolCalls", 900, other)], [900, 900]);
});

test("a toolCalls that is not a positive integer is ignored with its reason, and an unknown key names toolCalls", async (t) => {
	const root = await project(t, '{ "toolCalls": 0, "timeout": "2h" }\n');
	assert.deepEqual(plantLimits(root), {
		limits: {},
		ignored: ["toolCalls 0 is not a positive integer", "timeout is not a limit; use prepare, toolStall or toolCalls"],
	});
	assert.equal(limitCount("toolCalls", 900, root), 900);
	for (const value of ['"40"', "1.5", "-3"]) {
		await writeFile(join(root, PLANT_LIMITS), `{ "toolCalls": ${value} }\n`);
		assert.deepEqual(plantLimits(root).ignored, [`toolCalls ${value} is not a positive integer`]);
	}
});
