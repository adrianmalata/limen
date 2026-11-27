// src/runtime/start-queue.ts: the seat's start gate and the wait's two thresholds come from <seat>/start-gate.json and
// their defaults only; a wait past the first threshold gets one diagnosis and goes on, and one past the second ends
// failed; a queued job whose folder or record is gone leaves the queue, at whichever of its record checks meets the
// removal; a record check that fails for another reason than ENOENT ends the wait with that failure; the queue as
// `limen seat queue` reads it removes no entry, which the seat sweep removes (R-032); and only the gate and the jobs
// ahead hold a job, whatever the seat folder holds (R-102).
import assert from "node:assert/strict";
import { existsSync, mkdirSync, readdirSync, readFileSync, rmSync, symlinkSync } from "node:fs";
import { mkdir, mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { basename, dirname, join } from "node:path";
import test, { type TestContext } from "node:test";
import { setTimeout as delay } from "node:timers/promises";
import { type JobRecord, readRecordSync, recordPath } from "../../src/job/record.ts";
import { withLock } from "../../src/lock.ts";
import { LimenError } from "../../src/outcome.ts";
import { queueDiagnosis } from "../../src/runtime/queue-diagnosis.ts";
import {
	enterStartQueue,
	GATE_FILE,
	type QueueEnd,
	queueEntries,
	removeDeadEntries,
	startGate,
	waitForStart,
} from "../../src/runtime/start-queue.ts";
import { hasCode } from "../../src/system-error.ts";
import { withEnvironment } from "../environment.ts";
import { until, within, writeRecord } from "../plant.ts";

const DEFAULTS = { cpuIdle: 25, memoryFree: 20, settleMs: 60_000 };
/** The wait's thresholds with no gate file: a diagnosis after 30 minutes, a failure after 2 hours (A-036). */
const LIMITS = { diagnoseAfterMs: 30 * 60_000, failAfterMs: 2 * 3_600_000 };
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

/**
 * A seat in the OS temporary folder for one test, its gate file holding `text` (none when undefined), with one
 * registered project, `<seat>/repo`, whose jobs the tests queue; its path.
 */
async function seat(t: TestContext, text?: string): Promise<string> {
	const home = await mkdtemp(join(tmpdir(), "limen-start-gate-"));
	t.after(() => rm(home, { recursive: true, force: true }));
	await mkdir(join(home, ".limen"));
	await writeFile(join(home, ".limen", "projects"), `${join(home, "repo")}\n`);
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

/**
 * The paths of a job queued in the seat of one test: its folder, its queue entry, the seat's queue folder, and the
 * test's folder that holds the seat.
 */
type JobPaths = { readonly dir: string; readonly entry: string; readonly queue: string; readonly home: string };
/**
 * A job in the seat of one test whose record says it waits in the queue, with `reading` as the load it reads; its wait
 * started `waitedMs` ago, so a test plants a long wait without waiting for it (T-31 (4)).
 */
async function queuedJob(t: TestContext, reading: string, waitedMs = 0): Promise<JobPaths> {
	const home = await seat(t);
	const file = join(home, "reading.json");
	await writeFile(file, reading);
	withEnvironment(t, { LIMEN_START_POLL_MS: String(POLL_MS), LIMEN_START_READING: file });
	const dir = join(home, "repo", ".limen", "jobs", JOB);
	const since = new Date(Date.now() - waitedMs).toISOString();
	await writeRecord(dir, { state: "running", queued: { since, detail: null, ahead: null } });
	const queue = join(home, ".limen", "start-queue");
	return { dir, entry: join(queue, "entries", `${JOB}.json`), queue, home };
}

/** The gate's reading of `HELD`, as the diagnosis of a held job starts with it. */
const HELD_READING = "CPU 10% idle (gate 25%), memory 80% free (gate 20%)";
/**
 * Runs this process in a fake cgroup below `home` for one test, outside every user manager, so the diagnosis reads no
 * unit of the system's; the units of a user manager are test/runtime/queue-diagnosis.test.ts's.
 */
function outsideUserManager(t: TestContext, home: string): void {
	withEnvironment(t, { LIMEN_CGROUP_ROOT: join(home, "cgroup"), LIMEN_CGROUP: "/system.slice/limen-test.service" });
}

/** A queued job's record, which the test needs. */
function recordOf(dir: string): JobRecord {
	return readRecordSync(dir) ?? assert.fail(`${dir} holds no record`);
}

// A-036: a wait had no threshold, so a job the gate held waited with no word to anyone. The wait is planted 31 minutes
// long; the test then makes the next decision `settle`, whose record change follows that poll's threshold check, so
// it reads the record after a second poll by the order of events, not by time (T-31 (4)). The diagnosis is the one
// `queueDiagnosis` gives for the gate's reading, whose text test/runtime/queue-diagnosis.test.ts checks.
test("a job queued past diagnoseAfter gets its diagnosis in queueWait and in one advisory, and keeps waiting", async (t) => {
	const paths = await queuedJob(t, HELD, 31 * 60_000);
	outsideUserManager(t, paths.home);
	const { since } = recordOf(paths.dir).queued ?? assert.fail("the job is queued");
	const stop = new AbortController();
	let waitEnded = false;
	const waiting = waitForStart(paths.dir, stop.signal).finally(() => {
		waitEnded = true;
	});
	try {
		const diagnosed = await within(paths.dir, () => recordOf(paths.dir).queueWait?.diagnosedAt != null, BOUND_MS);
		assert.equal(diagnosed, true, "the wait gets its diagnosis");
		const first = recordOf(paths.dir);
		const diagnosis = await queueDiagnosis(async () => HELD_READING);
		const diagnosedAt = first.queueWait?.diagnosedAt ?? "";
		assert.deepEqual(
			{ wait: first.queueWait, advisory: first.advisory },
			{
				wait: { since, diagnosedAt, diagnosis, leftAt: null },
				// The D-092 note: the diagnosis is the queue's advisory, whose receipt is its own.
				advisory: { text: `queued for 31m without a start: ${diagnosis}`, at: diagnosedAt, source: "queue" },
			},
		);
		// A start just now settles, then the gate opens: the next decision is `settle`, which the record shows. The start
		// comes first, so no poll finds the gate open with nothing settling.
		await writeFile(join(paths.queue, "last-start"), `${new Date().toISOString()}\n`);
		await writeFile(join(paths.home, "reading.json"), OPEN);
		const settling = await within(paths.dir, () => /settling/.test(recordOf(paths.dir).queued?.detail ?? ""), BOUND_MS);
		const later = recordOf(paths.dir);
		assert.deepEqual(
			{ settling, wait: later.queueWait, advisory: later.advisory, ended: waitEnded, entry: existsSync(paths.entry) },
			{ settling: true, wait: first.queueWait, advisory: first.advisory, ended: false, entry: true },
		);
	} finally {
		stop.abort();
		await Promise.allSettled([waiting]);
	}
});

// A-036: after the second threshold the wrapper ends the job `failed`, kind `queue`, and its end clears the queue from
// the record and keeps the wait (test/runtime/wrapper.test.ts), so until then the record still shows the job queued.
test("a job queued past failAfter leaves the queue and ends its wait failed, naming the wait and the last reading, and leaves its record to its finisher", async (t) => {
	const paths = await queuedJob(t, HELD, 2 * 3_600_000 + 60_000);
	const before = recordOf(paths.dir).queued;
	const stop = new AbortController();
	const waiting = waitForStart(paths.dir, stop.signal);
	try {
		const outcome = await ended(waiting);
		const record = recordOf(paths.dir);
		assert.deepEqual(
			{ outcome, entry: existsSync(paths.entry), queued: record.queued?.since, state: record.state },
			{
				outcome: { failed: "queued for 2h1m without a start: CPU 10% idle (gate 25%), memory 80% free (gate 20%)" },
				entry: false,
				queued: before?.since,
				state: "running",
			},
		);
	} finally {
		stop.abort();
		await Promise.allSettled([waiting]);
	}
});

// A-036, D-072: `queued` is cleared at the start, so the wait itself lives on in `queueWait` for later readers.
test("a job that leaves the queue to start keeps its wait in queueWait, with the time it left", async (t) => {
	const paths = await queuedJob(t, OPEN);
	const { since } = recordOf(paths.dir).queued ?? assert.fail("the job is queued");
	const stop = new AbortController();
	const waiting = waitForStart(paths.dir, stop.signal);
	try {
		const outcome = await ended(waiting);
		const record = recordOf(paths.dir);
		assert.deepEqual(
			{ outcome, queued: record.queued, wait: record.queueWait, advisory: record.advisory },
			{
				outcome: "started",
				queued: null,
				wait: { since, diagnosedAt: null, diagnosis: null, leftAt: record.queueWait?.leftAt ?? "a time" },
				advisory: null,
			},
		);
		assert.ok(Date.parse(record.queueWait?.leftAt ?? "") >= Date.parse(since), "it left after it entered");
	} finally {
		stop.abort();
		await Promise.allSettled([waiting]);
	}
});

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
/**
 * The error the wait `waiting` rejects with. The test fails when the wait resolves, and says how it ended (`"gone"`,
 * `"stopped"` or `"started"`), or when it rejects with another error type.
 */
async function waitFailure(waiting: Promise<QueueEnd>): Promise<LimenError> {
	const end = await waiting.then(
		(ended): { readonly ended: QueueEnd } => ({ ended }),
		(error: unknown) => ({ error }),
	);
	if ("ended" in end) {
		assert.fail(`the wait did not fail: it ended "${end.ended}"`);
	}
	assert.ok(end.error instanceof LimenError, `the wait failed with ${String(end.error)}`);
	return end.error;
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
	const file = { gate: { cpuIdle: 50, memoryFree: 30, settleMs: 5_000 }, limits: LIMITS, ignored: [] };
	withEnvironment(t, { LIMEN_START_GATE: "off" });
	assert.deepEqual(startGate(), file);
	process.env.LIMEN_START_GATE = '{ "cpuIdle": 1 }';
	assert.deepEqual(startGate(), file);
});

test('a start-gate.json that holds the JSON string "off" turns the gate off and keeps the default thresholds', async (t) => {
	await seat(t, '"off"\n');
	assert.deepEqual(startGate(), { gate: undefined, limits: LIMITS, ignored: [] });
});

test("a seat with no start-gate.json gets the default gate, and a gate file object reads as it did", async (t) => {
	const home = await seat(t);
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
	await seat(t, '{ "cpuIdle": 50, "diagnoseAfter": "1m", "failAfter": "3m" }\n');
	assert.deepEqual(startGate(), {
		gate: { ...DEFAULTS, cpuIdle: 50 },
		limits: { diagnoseAfterMs: 60_000, failAfterMs: 180_000 },
		ignored: [],
	});
});

// A-036: a failure before the diagnosis would end a job no one was told of, so the pair is one value of the file.
test("BAD_DATA: a failAfter not above diagnoseAfter leaves both at their defaults and names the field, as the gate's other bad values do", async (t) => {
	const home = await seat(t);
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

/**
 * The start queue of a seat for one test with three entries: a live one, whose wrapper is this process and whose job
 * runs; a dead one, whose wrapper is gone; and a malformed one. Returns the folder of the entries.
 */
async function threeEntries(t: TestContext): Promise<string> {
	const home = await seat(t);
	const entries = join(home, ".limen", "start-queue", "entries");
	await mkdir(entries, { recursive: true });
	const job = (id: string) => join(home, "repo", ".limen", "jobs", id);
	await writeRecord(job("2026-11-24-live-1a2b3c4d"), { state: "running" });
	const entry = (id: string, pid: number) => ({ id, jobDir: job(id), label: id, priority: 2, queuedAt: 1, pid });
	await writeFile(join(entries, "live.json"), JSON.stringify(entry("2026-11-24-live-1a2b3c4d", process.pid)));
	await writeFile(join(entries, "dead.json"), JSON.stringify(entry("2026-11-24-dead-5e6f7a8b", 2_147_483_646)));
	await writeFile(join(entries, "malformed.json"), "{ not json\n");
	return entries;
}

// T-04, R-032 (d): `limen seat queue` reads the queue through `queueEntries`, which removed what it found dead.
test("the queue's entries as seat queue reads them hold only the live one, and every entry file stays", async (t) => {
	const entries = await threeEntries(t);
	const listed = await queueEntries();
	assert.deepEqual(
		[listed.map((entry) => entry.id), readdirSync(entries).sort()],
		[["2026-11-24-live-1a2b3c4d"], ["dead.json", "live.json", "malformed.json"]],
	);
});

// R-032 (a) 4: the seat sweep removes them once per run instead.
test("removeDeadEntries removes the dead and the malformed entry, keeps the live one, and says how many it removed", async (t) => {
	const entries = await threeEntries(t);
	assert.deepEqual([await removeDeadEntries(), readdirSync(entries)], [2, ["live.json"]]);
});

/** The job of the entry `foreignEntry` writes: it runs in a folder of no project the seat registers. */
const FOREIGN = "2026-11-26-foreign-9a8b7c6d";
/** The test's folder that holds the seat whose start queue keeps its entries in `entries`. */
const homeOf = (entries: string): string => dirname(dirname(dirname(entries)));
/**
 * Writes, into the start queue of the seat at `home`, the entry of a job whose wrapper is this process, whose record
 * runs and whose folder is no job of a project the seat registers (`<seat>/elsewhere`), first in start order (priority
 * 1, queued at 1); its file's name.
 */
async function foreignEntry(home: string): Promise<string> {
	const dir = join(home, "elsewhere", ".limen", "jobs", FOREIGN);
	await writeRecord(dir, { state: "running" });
	const entries = join(home, ".limen", "start-queue", "entries");
	await mkdir(entries, { recursive: true });
	const entry = { id: FOREIGN, jobDir: dir, label: FOREIGN, priority: 1, queuedAt: 1, pid: process.pid };
	await writeFile(join(entries, `${FOREIGN}.json`), JSON.stringify(entry));
	return `${FOREIGN}.json`;
}

// D-107 (5), R-102 open point 9: an entry was live on its pid and its record alone, so any process of the agents'
// account could hold every other job's start until its failAfter with an entry that names a running record anywhere.
test("the queue's entries as seat queue reads them leave out an entry whose folder is no job of a registered project", async (t) => {
	const entries = await threeEntries(t);
	await foreignEntry(homeOf(entries));
	const listed = await queueEntries();
	assert.deepEqual(
		listed.map((entry) => entry.id),
		["2026-11-24-live-1a2b3c4d"],
	);
});

test("removeDeadEntries removes an entry whose folder is no job of a registered project", async (t) => {
	const entries = await threeEntries(t);
	const foreign = await foreignEntry(homeOf(entries));
	await removeDeadEntries();
	assert.equal(existsSync(join(entries, foreign)), false);
});

test("a queued job of a registered project starts while an entry whose folder is no job of a registered project is first in start order", async (t) => {
	const paths = await queuedJob(t, OPEN);
	await foreignEntry(paths.home);
	const stop = new AbortController();
	const waiting = waitForStart(paths.dir, stop.signal);
	try {
		assert.equal(await ended(waiting), "started");
	} finally {
		stop.abort();
		await Promise.allSettled([waiting]);
	}
});

// R-104 Decision 7: the rule holds the starts of other jobs only, so a waiting wrapper judges its own entry by its
// wrapper and its job alone; judged by the rule, the entry of a job of a project the seat does not register would be
// dead to its own wrapper, which would then never be first in the queue and would wait until failAfter.
test("a queued job of a project the seat does not register starts in its turn", async (t) => {
	const paths = await queuedJob(t, OPEN);
	await writeFile(join(paths.home, ".limen", "projects"), "");
	const stop = new AbortController();
	const waiting = waitForStart(paths.dir, stop.signal);
	try {
		assert.equal(await ended(waiting), "started");
	} finally {
		stop.abort();
		await Promise.allSettled([waiting]);
	}
});

/**
 * Writes, into the seat folder below `home`, a seat rule as `limen rule set --start-priority 1` wrote one before R-102,
 * which held every job less urgent than priority 1 until a time far ahead.
 */
async function oldRule(home: string): Promise<void> {
	const rule = {
		name: "claude-week",
		text: "Only urgent jobs until the reset",
		until: "2999-01-01T00:00:00.000Z",
		setBy: "a job",
		setAt: "2026-11-24T14:10:00.000Z",
		startPriority: 1,
		version: "1",
	};
	await mkdir(join(home, ".limen", "rules", rule.name), { recursive: true });
	await writeFile(join(home, ".limen", "rules", rule.name, "rule.json"), JSON.stringify(rule));
}

// A-010, R-102: a start priority that any process could set held every other job of the seat; the start priority goes
// with no replacement (D-097 (6) (d)), so only the gate and the jobs ahead hold a job.
test("a job with the gate off does not enter the start queue, whatever the seat folder holds", async (t) => {
	const home = await seat(t, '"off"\n');
	await oldRule(home);
	const dir = join(home, "repo", ".limen", "jobs", JOB);
	await mkdir(dir, { recursive: true });
	assert.equal(await enterStartQueue(dir), undefined);
});

test("a queued job starts once the gate is open and no job is ahead, whatever the seat folder holds", async (t) => {
	const paths = await queuedJob(t, OPEN);
	await oldRule(paths.home);
	const stop = new AbortController();
	const waiting = waitForStart(paths.dir, stop.signal);
	try {
		assert.equal(await ended(waiting), "started");
	} finally {
		stop.abort();
		await Promise.allSettled([waiting]);
	}
});
