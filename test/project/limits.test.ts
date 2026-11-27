// src/project/limits.ts: the limits and the module switches of a project's .agents/limen/limits.json, the only place
// that sets them.
import assert from "node:assert/strict";
import { mkdir, mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test, { type TestContext } from "node:test";
import { LimenError } from "../../src/outcome.ts";
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

test("a limits file of the rebuild-base form, with prepare and toolStall, reads as it did, with every module off", async (t) => {
	const root = await project(t, '{ "prepare": "20m", "toolStall": "15m" }\n');
	assert.deepEqual(plantLimits(root), {
		limits: { prepare: 20 * 60_000, toolStall: 15 * 60_000 },
		modules: new Set(),
		ignored: [],
	});
});

// G1.10: a module is off by default, so a project with no file, or a file with no modules field, has every one off.
test("the modules field switches on each module it sets true, and no file or no field leaves every module off", async (t) => {
	const [on, none, other] = await Promise.all([
		project(t, '{ "modules": { "group": true, "picture": false, "research": true } }\n'),
		project(t),
		project(t, '{ "toolCalls": 40 }\n'),
	]);
	assert.deepEqual(
		[plantLimits(on), plantLimits(none).modules, plantLimits(other).modules],
		[{ limits: {}, modules: new Set(["group", "research"]), ignored: [] }, new Set(), new Set()],
	);
});

// T-27 (2): a switch is read on its own, as each limit is, so one bad entry leaves the module off and the others hold.
test("a module switch that is not a boolean and an unknown module name are each ignored and named, and the other switches hold", async (t) => {
	const root = await project(t, '{ "modules": { "group": "yes", "groups": true, "picture": true } }\n');
	const { modules, ignored } = plantLimits(root);
	assert.deepEqual(
		{ modules, ignored: ignored.map(({ message }) => message) },
		{
			modules: new Set(["picture"]),
			ignored: [
				'.agents/limen/limits.json: modules.group: expected true or false, got "yes"',
				".agents/limen/limits.json: modules.groups: expected one of the fields github, group, picture, workspace, research or quality, got true",
			],
		},
	);
});

test("a modules field that is not an object is ignored as a whole and named, and every module stays off", async (t) => {
	const root = await project(t, '{ "modules": ["group"], "toolCalls": 40 }\n');
	const { limits, modules, ignored } = plantLimits(root);
	assert.deepEqual(
		{ limits, modules, ignored: ignored.map(({ message }) => message) },
		{
			limits: { toolCalls: 40 },
			modules: new Set(),
			ignored: ['.agents/limen/limits.json: modules: expected an object, got ["group"]'],
		},
	);
});

// T-01: only nothing at the path is an expected absence, so a file the read fails on is no "every module off".
test("LIMITS_UNREADABLE: a limits file that is a folder fails the read with a typed error that names the file, and nothing at its path reads as no file", async (t) => {
	const folder = await project(t);
	await mkdir(join(folder, PLANT_LIMITS), { recursive: true });
	assert.throws(() => plantLimits(folder), {
		constructor: LimenError,
		class: "environment",
		code: "LIMITS_UNREADABLE",
		message: /^\.agents\/limen\/limits\.json cannot be read: EISDIR/,
	});
	const through = await project(t);
	await writeFile(join(through, ".agents"), "a file where a folder of the path would be\n");
	assert.deepEqual(plantLimits(through), { limits: {}, modules: new Set(), ignored: [] });
});

// T-03: a switch is a setting, so only the owner's file sets it; no environment variable switches a module on.
test("T-03: no environment variable switches a module on in a project whose file sets none", async (t) => {
	const root = await project(t, '{ "modules": { "github": true } }\n');
	withEnvironment(t, {
		LIMEN_MODULES: "group,picture",
		LIMEN_MODULE_GROUP: "1",
		LIMEN_GROUP: "1",
		LIMEN_PICTURE: "1",
		LIMEN_RESEARCH: "1",
	});
	assert.deepEqual(plantLimits(root).modules, new Set(["github"]));
});

test("a project with no limits file, or a file without toolCalls, keeps the cap its caller gives", async (t) => {
	const [none, other] = await Promise.all([project(t), project(t, '{ "prepare": "20m" }\n')]);
	assert.deepEqual([limitCount("toolCalls", 900, none), limitCount("toolCalls", 900, other)], [900, 900]);
});

test("a toolCalls that is not a positive integer is ignored with its reason, and an unknown key names toolCalls", async (t) => {
	const root = await project(t, '{ "toolCalls": 0, "timeout": "2h" }\n');
	const { limits, ignored } = plantLimits(root);
	assert.deepEqual(
		{ limits, ignored: ignored.map(({ message }) => message) },
		{
			limits: {},
			ignored: [
				".agents/limen/limits.json: toolCalls: expected an integer of at least 1, got 0",
				'.agents/limen/limits.json: timeout: expected one of the fields prepare, toolStall, toolCalls or modules, got "2h"',
			],
		},
	);
	assert.equal(limitCount("toolCalls", 900, root), 900);
	for (const value of ['"40"', "1.5", "-3"]) {
		await writeFile(join(root, PLANT_LIMITS), `{ "toolCalls": ${value} }\n`);
		assert.deepEqual(
			plantLimits(root).ignored.map(({ message }) => message),
			[`.agents/limen/limits.json: toolCalls: expected an integer of at least 1, got ${value}`],
		);
	}
});

test("a limits file that is not a JSON object is ignored as a whole and named", async (t) => {
	const root = await project(t, '["prepare", "20m"]\n');
	const { limits, ignored } = plantLimits(root);
	assert.deepEqual(
		{ limits, ignored: ignored.map(({ message }) => message) },
		{ limits: {}, ignored: ['.agents/limen/limits.json: expected an object, got ["prepare","20m"]'] },
	);
});
