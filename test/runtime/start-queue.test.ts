// src/runtime/start-queue.ts: the seat's start gate comes from <seat>/start-gate.json and its defaults only, and a
// queued job whose folder or record is gone leaves the queue.
import assert from "node:assert/strict";
import { existsSync, mkdirSync, readdirSync, readFileSync, rmSync } from "node:fs";
import { mkdir, mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test, { type TestContext } from "node:test";
import { setTimeout as delay } from "node:timers/promises";
import { GATE_FILE, type QueueEnd, startGate, waitForStart } from "../../src/runtime/start-queue.ts";
import { withEnvironment } from "../environment.ts";
import { until, writeRecord } from "../plant.ts";

const DEFAULTS = { cpuIdle: 25, memoryFree: 20, settleMs: 60_000 };
const JOB = "2026-11-21-queued-1a2b3c4d";
/** The poll of the folder tests. */
const POLL_MS = 20;
/**
 * How long a folder test waits for the wait to end. A passing run returns at the first poll after the change; the
 * bound only ends the test of a wait that never returns, so it is 250 polls, which a loaded machine does not reach for
 * one poll, and the tests' names claim no number of polls.
 */
const BOUND_MS = 250 * POLL_MS;
/** The job folder's log, "" while it has none. */
const logOf = (dir: string): string => (existsSync(join(dir, "log")) ? readFileSync(join(dir, "log"), "utf8") : "");
/** How the wait `waiting` ended, or "still waiting" when it has not ended within `BOUND_MS`. */
const ended = (waiting: Promise<QueueEnd>) => Promise.race([waiting, delay(BOUND_MS, "still waiting", { ref: false })]);

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

/** A job queued in the seat of one test: its folder, its queue entry, and its wait, which runs in this process. */
type QueuedJob = { readonly dir: string; readonly entry: string; readonly waiting: Promise<QueueEnd> };
/**
 * Runs `check` on a job queued behind a held gate once its wait has logged its place: the log line follows the
 * record's change, so the job's lock is free and the wait sleeps to its next poll. The wait is stopped before the seat
 * goes, so a wait that never ends writes nothing after the test.
 */
async function whileQueued(t: TestContext, check: (job: QueuedJob) => Promise<void>): Promise<void> {
	const home = await seat(t);
	const reading = join(home, "reading.json");
	// Below the default gate's 25% CPU idle, so the gate holds the job.
	await writeFile(reading, '{"cpuIdle":10,"memoryFree":80}\n');
	withEnvironment(t, { LIMEN_START_POLL_MS: String(POLL_MS), LIMEN_START_READING: reading });
	const dir = join(home, "repo", ".limen", "jobs", JOB);
	await writeRecord(dir, { state: "running", queued: { since: new Date().toISOString(), detail: null, ahead: null } });
	const entry = join(home, ".limen", "start-queue", "entries", `${JOB}.json`);
	const stop = new AbortController();
	const waiting = waitForStart(dir, stop.signal);
	try {
		await until(dir, () => logOf(dir).includes("] queued: CPU 10% idle"));
		await check({ dir, entry, waiting });
	} finally {
		stop.abort();
		await waiting;
	}
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
	const { gate, ignored } = startGate();
	assert.deepEqual(
		{ gate, ignored: ignored.map(({ message }) => message) },
		{
			gate: { ...DEFAULTS, settleMs: 1 },
			ignored: ["start-gate.json: fast: expected one of the fields cpuIdle, memoryFree or settle, got true"],
		},
	);
});

test('a start-gate.json that is neither "off" nor an object keeps the default gate and names the file', async (t) => {
	await seat(t, '"on"\n');
	const { gate, ignored } = startGate();
	assert.deepEqual(
		{ gate, ignored: ignored.map(({ message }) => message) },
		{ gate: DEFAULTS, ignored: ['start-gate.json: expected "off" or an object, got "on"'] },
	);
});

// D-063 (3): a wrapper whose plant was removed polled the queue until it was killed, since no poll read its own folder.
test("a job queued behind a held gate whose folder is removed stops waiting, leaves the queue and recreates nothing", (t) =>
	whileQueued(t, async ({ dir, entry, waiting }) => {
		assert.ok(existsSync(entry), "the queued job holds its place in the queue");
		await rm(dir, { recursive: true });
		assert.deepEqual(
			{ outcome: await ended(waiting), entry: existsSync(entry), folder: existsSync(dir) },
			{ outcome: "gone", entry: false, folder: false },
		);
	}));

// D-063 (3): a folder removed while the wrapper takes the job's lock comes back empty, since the lock creates its folder
// (src/lock.ts), and a wait that read only the folder polled on in it until it was killed.
test("a job queued behind a held gate whose folder is recreated without its record stops waiting, leaves the queue and writes nothing into the folder", (t) =>
	whileQueued(t, async ({ dir, entry, waiting }) => {
		// Both in one step of this process, where the wait runs, so the wait never sees the folder missing.
		rmSync(dir, { recursive: true });
		mkdirSync(dir);
		assert.deepEqual(
			{ outcome: await ended(waiting), entry: existsSync(entry), files: readdirSync(dir) },
			{ outcome: "gone", entry: false, files: [] },
		);
	}));
