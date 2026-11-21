// src/runtime/start-queue.ts: the seat's start gate comes from <seat>/start-gate.json and its defaults only, and a
// queued job whose folder or record is gone leaves the queue, at whichever of its record checks meets the removal.
import assert from "node:assert/strict";
import { existsSync, mkdirSync, readdirSync, readFileSync, rmSync, symlinkSync } from "node:fs";
import { mkdir, mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { basename, join } from "node:path";
import test, { type TestContext } from "node:test";
import { setTimeout as delay } from "node:timers/promises";
import { recordPath } from "../../src/job/record.ts";
import { withLock } from "../../src/lock.ts";
import { LimenError } from "../../src/outcome.ts";
import { GATE_FILE, type QueueEnd, startGate, waitForStart } from "../../src/runtime/start-queue.ts";
import { hasCode } from "../../src/system-error.ts";
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
const ended = (waiting: Promise<QueueEnd>) =>
	Promise.race([waiting, delay<"still waiting">(BOUND_MS, "still waiting", { ref: false })]);

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

/** A reading below the default gate's 25% CPU idle, so the gate holds the job. */
const HELD = '{"cpuIdle":10,"memoryFree":80}\n';
/** A reading above the default gate, so the job's turn comes once it is first and no start is settling. */
const OPEN = '{"cpuIdle":80,"memoryFree":80}\n';

/** The paths of a job queued in the seat of one test: its folder, its queue entry, and the seat's queue folder. */
type JobPaths = { readonly dir: string; readonly entry: string; readonly queue: string };
/** A job in the seat of one test whose record says it waits in the queue, with `reading` as the load it reads. */
async function queuedJob(t: TestContext, reading: string): Promise<JobPaths> {
	const home = await seat(t);
	const file = join(home, "reading.json");
	await writeFile(file, reading);
	withEnvironment(t, { LIMEN_START_POLL_MS: String(POLL_MS), LIMEN_START_READING: file });
	const dir = join(home, "repo", ".limen", "jobs", JOB);
	await writeRecord(dir, { state: "running", queued: { since: new Date().toISOString(), detail: null, ahead: null } });
	const queue = join(home, ".limen", "start-queue");
	return { dir, entry: join(queue, "entries", `${JOB}.json`), queue };
}

/** A job queued in the seat of one test: its paths and its wait, which runs in this process. */
type QueuedJob = JobPaths & { readonly waiting: Promise<QueueEnd> };
/**
 * Runs `check` on a job queued behind a held gate once its wait has logged its place: the log line follows the
 * record's change, so the job's lock is free and the wait sleeps to its next poll. The wait is stopped before the seat
 * goes, so a wait that never ends writes nothing after the test; `check` reads how it ended, here it only has to end.
 */
async function whileQueued(t: TestContext, check: (job: QueuedJob) => Promise<void>): Promise<void> {
	const paths = await queuedJob(t, HELD);
	const stop = new AbortController();
	const waiting = waitForStart(paths.dir, stop.signal);
	try {
		await until(paths.dir, () => logOf(paths.dir).includes("] queued: CPU 10% idle"));
		await check({ ...paths, waiting });
	} finally {
		stop.abort();
		await Promise.allSettled([waiting]);
	}
}

/**
 * Starts the job's wait while this test holds the job's lock and, inside it, the queue's lock, so the wait meets them
 * in order: the queue's lock when its turn comes, the job's lock at its record change. `whileBothHeld` runs with both
 * locks held, then `whileJobLockHeld` with the job's lock alone. Returns how the wait ended once this test released
 * both; the wait is stopped before the seat goes.
 */
async function withLocksHeld(
	{ dir, queue }: JobPaths,
	whileBothHeld: () => Promise<void>,
	whileJobLockHeld: (waiting: Promise<QueueEnd>) => Promise<void>,
): Promise<QueueEnd | "still waiting"> {
	const stop = new AbortController();
	let waiting: Promise<QueueEnd> | undefined;
	const started = () => waiting ?? assert.fail("the wait has not started");
	try {
		await withLock({ folder: dir }, async () => {
			await withLock({ folder: queue }, () => {
				waiting = waitForStart(dir, stop.signal);
				return whileBothHeld();
			});
			await whileJobLockHeld(started());
		});
		return await ended(started());
	} finally {
		stop.abort();
		await Promise.allSettled([waiting]);
	}
}

/** Replaces the record of the job folder `dir` with a link to itself, so its check fails with ELOOP. */
function breakRecord(dir: string): void {
	rmSync(recordPath(dir));
	symlinkSync(basename(recordPath(dir)), recordPath(dir));
}
/** The error the wait `waiting` rejects with; the test fails when the wait ends otherwise or with another error type. */
async function waitFailure(waiting: Promise<QueueEnd>): Promise<LimenError> {
	const end: unknown = await waiting.then(
		() => undefined,
		(error: unknown) => error,
	);
	assert.ok(end instanceof LimenError, `the wait ended with ${String(end)}`);
	return end;
}
/** The class, the code and whether the cause is the ELOOP of `breakRecord`, of a failure of the record check. */
const failureFacts = (failure: LimenError) => ({
	class: failure.class,
	code: failure.code,
	cause: hasCode(failure.cause, "ELOOP"),
});
const CHECK_FAILED = { class: "environment", code: "QUEUE_RECORD_UNREADABLE", cause: true };

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

// R-094 (`review.md` → Round 3): the record can go while the wait decides, here while it waits for the queue's lock to
// start; the check after the decision ends the wait there. The job's lock stays held, so a wait that went on to its
// record change could not end.
test("a job whose record goes while its wait decides stops waiting after the decision, with the job's lock still held", async (t) => {
	const paths = await queuedJob(t, OPEN);
	let outcome: QueueEnd | "still waiting" = "still waiting";
	await withLocksHeld(
		paths,
		async () => {
			// The wait writes the load it read after this poll's first record check, then waits for the queue's lock.
			await until(paths.queue, () => existsSync(join(paths.queue, "reading")));
			await rm(recordPath(paths.dir));
		},
		async (waiting) => {
			outcome = await ended(waiting);
		},
	);
	assert.deepEqual({ outcome, files: readdirSync(paths.dir) }, { outcome: "gone", files: [] });
});

// R-094 (`review.md` → Round 3): the record can go while the wait's record change waits for the job's lock, here the
// lock this test holds; the check after the change ends the wait before it logs its place.
test("a job whose record goes while its wait's record change waits for the job's lock stops waiting after the change and writes nothing more", async (t) => {
	const paths = await queuedJob(t, OPEN);
	const outcome = await withLocksHeld(
		paths,
		async () => {
			await until(paths.queue, () => existsSync(join(paths.queue, "reading")));
			// Under the queue's lock the wait reads the queue again and removes a damaged entry, here its own, so it does
			// not start and goes on to record its place.
			await writeFile(paths.entry, "{}\n");
		},
		async () => {
			// The entry's removal shows that the wait took the queue's lock. From its release to the record change the
			// wait does no file operation and this test needs several to take that lock, so the record goes after the
			// check of the decision, while the change waits for the job's lock.
			await until(paths.queue, () => !existsSync(paths.entry));
			await withLock({ folder: paths.queue }, () => rm(recordPath(paths.dir)));
		},
	);
	assert.deepEqual({ outcome, files: readdirSync(paths.dir) }, { outcome: "gone", files: [] });
});

// R-094 (`review.md` → Round 3): `existsSync` read every error of the check as absence, so a wait whose record could not
// be checked ended as if its job were gone, with exit 0 and no line in the log (T-01).
test("QUEUE_RECORD_UNREADABLE: a queued job whose record check fails with an error other than ENOENT ends its wait as an environment failure, with the cause in its log", (t) =>
	whileQueued(t, async ({ dir, waiting }) => {
		// A record that links to itself, so its check fails with ELOOP; in one step of this process, where the wait runs,
		// so the wait never sees the record missing.
		breakRecord(dir);
		await assert.rejects(waiting, { class: "environment", code: "QUEUE_RECORD_UNREADABLE" });
		assert.match(
			logOf(dir),
			/\] start queue: the record \S+ cannot be checked, so the queued job does not start: ELOOP/,
		);
	}));

// R-095 (`review.md` → Round 1): the cleanup of the wait wrote the failed check's line with no guard, so a log that
// could not take it replaced the check's failure with its own error, and the class and the code were lost (T-01).
test("QUEUE_RECORD_UNREADABLE: a queued job whose record check fails ends its wait with that failure also when its log cannot take the line", (t) =>
	whileQueued(t, async ({ dir, waiting }) => {
		// The record links to itself, so its check fails with ELOOP, and the log is a folder, which takes no line (EISDIR).
		// All in one step of this process, where the wait runs, so the wait never sees the record missing.
		breakRecord(dir);
		rmSync(join(dir, "log"));
		mkdirSync(join(dir, "log"));
		const failure = await waitFailure(waiting);
		assert.deepEqual(failureFacts(failure), CHECK_FAILED);
		assert.match(failure.message, /the job's log could not take this line either: EISDIR/);
	}));

// R-095 (`review.md` → Round 2): the wait's `finally` removed its queue entry with no guard, so an entry that could not
// be removed replaced the check's failure with its own error (T-01).
test("QUEUE_RECORD_UNREADABLE: a queued job whose record check fails ends its wait with that failure also when its queue entry cannot be removed", (t) =>
	whileQueued(t, async ({ dir, entry, waiting }) => {
		// The record links to itself (ELOOP), and the queue entry is a folder, which a removal without recursion refuses.
		// All in one step of this process, where the wait runs, so the wait never sees the record missing.
		breakRecord(dir);
		rmSync(entry);
		mkdirSync(entry);
		const failure = await waitFailure(waiting);
		assert.deepEqual(failureFacts(failure), CHECK_FAILED);
		assert.match(failure.message, /its queue entry could not be removed either: /);
	}));
