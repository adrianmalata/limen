// src/runtime/queue-reading.ts: the seat's start gate and the wait's two thresholds come from <seat>/start-gate.json
// and their defaults only, and the queue as `limen seat queue` reads it holds only the live entries of the registered
// projects' jobs and removes no entry, which the seat sweep removes (R-032, R-104).
import assert from "node:assert/strict";
import { readdirSync } from "node:fs";
import { writeFile } from "node:fs/promises";
import { join } from "node:path";
import test from "node:test";
import { GATE_FILE, queueEntries, startGate } from "../../src/runtime/queue-reading.ts";
import { withEnvironment } from "../environment.ts";
import { foreignQueueEntry, queueSeat, seatOfQueueEntries, threeQueueEntries } from "../plant.ts";

const DEFAULTS = { cpuIdle: 25, memoryFree: 20, settleMs: 60_000 };
/** The wait's thresholds with no gate file: a diagnosis after 30 minutes, a failure after 2 hours (A-036). */
const LIMITS = { diagnoseAfterMs: 30 * 60_000, failAfterMs: 2 * 3_600_000 };

test("T-03: LIMEN_START_GATE set in the environment does not override start-gate.json", async (t) => {
	await queueSeat(t, '{ "cpuIdle": 50, "memoryFree": 30, "settle": "5s" }\n');
	const file = { gate: { cpuIdle: 50, memoryFree: 30, settleMs: 5_000 }, limits: LIMITS, ignored: [] };
	withEnvironment(t, { LIMEN_START_GATE: "off" });
	assert.deepEqual(startGate(), file);
	process.env.LIMEN_START_GATE = '{ "cpuIdle": 1 }';
	assert.deepEqual(startGate(), file);
});

test('a start-gate.json that holds the JSON string "off" turns the gate off and keeps the default thresholds', async (t) => {
	await queueSeat(t, '"off"\n');
	assert.deepEqual(startGate(), { gate: undefined, limits: LIMITS, ignored: [] });
});

test("a seat with no start-gate.json gets the default gate, and a gate file object reads as it did", async (t) => {
	const home = await queueSeat(t);
	assert.deepEqual(startGate(), { gate: DEFAULTS, limits: LIMITS, ignored: [] });
	await writeFile(join(home, ".limen", GATE_FILE), '{ "settle": "1ms", "fast": true }\n');
	const { gate, ignored } = startGate();
	assert.deepEqual(
		{ gate, ignored: ignored.map(({ message }) => message) },
		{
			gate: { ...DEFAULTS, settleMs: 1 },
			ignored: [
				"start-gate.json: fast: expected one of the fields cpuIdle, memoryFree, settle, diagnoseAfter or failAfter, got true",
			],
		},
	);
});

// A-036: the wait's two thresholds live in the seat's gate file, read as `settle` is.
test("start-gate.json sets when a wait gets its diagnosis and when it fails, as durations, beside the gate's values", async (t) => {
	await queueSeat(t, '{ "cpuIdle": 50, "diagnoseAfter": "1m", "failAfter": "3m" }\n');
	assert.deepEqual(startGate(), {
		gate: { ...DEFAULTS, cpuIdle: 50 },
		limits: { diagnoseAfterMs: 60_000, failAfterMs: 180_000 },
		ignored: [],
	});
});

// A-036: a failure before the diagnosis would end a job no one was told of, so the pair is one value of the file.
test("BAD_DATA: a failAfter not above diagnoseAfter leaves both at their defaults and names the field, as the gate's other bad values do", async (t) => {
	const home = await queueSeat(t);
	const cases = [
		[
			'{ "cpuIdle": 50, "diagnoseAfter": "2h", "failAfter": "1h" }',
			'failAfter: expected a duration above diagnoseAfter (2h), got "1h"',
		],
		[
			'{ "cpuIdle": 50, "failAfter": "30m" }',
			'failAfter: expected a duration above diagnoseAfter (30m by default), got "30m"',
		],
		[
			'{ "cpuIdle": 50, "diagnoseAfter": "3h" }',
			'diagnoseAfter: expected a duration below failAfter (2h by default), got "3h"',
		],
	];
	const read: unknown[] = [];
	for (const [text] of cases) {
		await writeFile(join(home, ".limen", GATE_FILE), `${text}\n`);
		const { gate, limits, ignored } = startGate();
		read.push({ gate, limits, ignored: ignored.map(({ code, message }) => `${code} ${message}`) });
	}
	assert.deepEqual(
		read,
		cases.map(([, message]) => ({
			gate: { ...DEFAULTS, cpuIdle: 50 },
			limits: LIMITS,
			ignored: [`BAD_DATA start-gate.json: ${message}`],
		})),
	);
});

test('a start-gate.json that is neither "off" nor an object keeps the default gate and names the file', async (t) => {
	await queueSeat(t, '"on"\n');
	const { gate, ignored } = startGate();
	assert.deepEqual(
		{ gate, ignored: ignored.map(({ message }) => message) },
		{ gate: DEFAULTS, ignored: ['start-gate.json: expected "off" or an object, got "on"'] },
	);
});

// T-04, R-032 (d): `limen seat queue` reads the queue through `queueEntries`, which removed what it found dead.
test("the queue's entries as seat queue reads them hold only the live one, and every entry file stays", async (t) => {
	const entries = await threeQueueEntries(t);
	const listed = await queueEntries();
	assert.deepEqual(
		[listed.map((entry) => entry.id), readdirSync(entries).sort()],
		[["2026-11-24-live-1a2b3c4d"], ["dead.json", "live.json", "malformed.json"]],
	);
});

// D-107 (5), R-102 open point 9: an entry was live on its pid and its record alone, so any process of the agents'
// account could hold every other job's start until its failAfter with an entry that names a running record anywhere.
test("the queue's entries as seat queue reads them leave out an entry whose folder is no job of a registered project", async (t) => {
	const entries = await threeQueueEntries(t);
	await foreignQueueEntry(seatOfQueueEntries(entries));
	const listed = await queueEntries();
	assert.deepEqual(
		listed.map((entry) => entry.id),
		["2026-11-24-live-1a2b3c4d"],
	);
});
