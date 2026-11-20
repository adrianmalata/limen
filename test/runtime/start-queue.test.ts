// src/runtime/start-queue.ts: the seat's start gate comes from <seat>/start-gate.json and its defaults only.
import assert from "node:assert/strict";
import { mkdir, mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test, { type TestContext } from "node:test";
import { GATE_FILE, startGate } from "../../src/runtime/start-queue.ts";
import { withEnvironment } from "../environment.ts";

const DEFAULTS = { cpuIdle: 25, memoryFree: 20, settleMs: 60_000 };

/** A seat in the OS temporary folder for one test, its gate file holding `text` (none when undefined); its path. */
async function seat(t: TestContext, text?: string): Promise<string> {
	const home = await mkdtemp(join(tmpdir(), "limen-start-gate-"));
	t.after(() => rm(home, { recursive: true, force: true }));
	await mkdir(join(home, ".limen"));
	if (text !== undefined) {
		await writeFile(join(home, ".limen", GATE_FILE), text);
	}
	withEnvironment(t, { LIMEN_HOME: home });
	return home;
}

test("T-03: LIMEN_START_GATE set in the environment does not override start-gate.json", async (t) => {
	await seat(t, '{ "cpuIdle": 50, "memoryFree": 30, "settle": "5s" }\n');
	const file = { gate: { cpuIdle: 50, memoryFree: 30, settleMs: 5_000 }, ignored: [] };
	withEnvironment(t, { LIMEN_START_GATE: "off" });
	assert.deepEqual(startGate(), file);
	process.env.LIMEN_START_GATE = '{ "cpuIdle": 1 }';
	assert.deepEqual(startGate(), file);
});

test('a start-gate.json that holds the JSON string "off" turns the gate off', async (t) => {
	await seat(t, '"off"\n');
	assert.deepEqual(startGate(), { gate: undefined, ignored: [] });
});

test("a seat with no start-gate.json gets the default gate, and a gate file object reads as it did", async (t) => {
	const home = await seat(t);
	assert.deepEqual(startGate(), { gate: DEFAULTS, ignored: [] });
	await writeFile(join(home, ".limen", GATE_FILE), '{ "settle": "1ms", "fast": true }\n');
	assert.deepEqual(startGate(), {
		gate: { ...DEFAULTS, settleMs: 1 },
		ignored: ["fast true", "use cpuIdle and memoryFree from 0 to 100, and settle such as 60s"],
	});
});
