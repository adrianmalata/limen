import { existsSync, statSync } from "node:fs";
import { mkdir, rm } from "node:fs/promises";
import { basename, join } from "node:path";
import { setTimeout as delay } from "node:timers/promises";
import { atomicWrite } from "../atomic-write.ts";
import { testKnob } from "../config.ts";
import { groupLock } from "../job/group-cabinet.ts";
import { formatDuration } from "../job/job.ts";
import {
	appendLimenLog,
	type JobRecord,
	type Queued,
	queueLeft,
	readRecord,
	recordPath,
	transition,
	waitOf,
} from "../job/record.ts";
import { LimenError, usageError } from "../outcome.ts";
import { hasCode } from "../system-error.ts";
import { queueDiagnosis } from "./queue-diagnosis.ts";
import {
	type Entry,
	type GateFile,
	gateOpen,
	ignoredText,
	lastReading,
	queueDir,
	readEntries,
	readingText,
	readLoad,
	type StartGate,
	settleLeft,
	startGate,
	startOrder,
} from "./queue-reading.ts";

// The projects of the seat share its CPU and memory, so one queue and one gate serve the whole seat (docs/jobs.md,
// "Start queue"). A detached job's own wrapper waits in it after its handshake and before setup; no daemon runs it. The
// gate, the reading and the queue's live entries are read in src/runtime/queue-reading.ts, which writes nothing, so
// `limen seat queue` reads them without this module's writes (T-04, R-105). Only the gate and the jobs ahead hold a
// job: the start priority of a seat rule, which any process could set, went with the rules (A-010, R-102). A wait has
// two thresholds (A-036): past the first the job's coordinator gets one diagnosis and the job waits on; past the second
// the job ends failed, so no wait outlasts it.
type Decision =
	| { readonly start: true; readonly detail: string }
	| { readonly start: false; readonly kind: string; readonly detail: string; readonly ahead: number };

export const PRIORITIES = [1, 2, 3] as const;
export const DEFAULT_PRIORITY = 2;
const DETAIL_REFRESH_MS = 60_000;
const entryPath = (id: string) => join(queueDir(), "entries", `${id}.json`);
const pollMs = (): number => {
	const knob = Number(testKnob("LIMEN_START_POLL_MS"));
	return knob > 0 ? knob : 5_000;
};

/**
 * Whether the job queues: while the gate is on. The wrapper writes the result into the record with its handshake, so
 * no reader sees a queued job running as started; logs gate values it ignored.
 */
export async function enterStartQueue(jobDir: string): Promise<Queued | undefined> {
	const { gate, ignored } = startGate();
	if (ignored.length > 0) {
		await appendLimenLog(jobDir, `start gate: ignored ${ignoredText(ignored)}`);
	}
	return gate === undefined ? undefined : { since: new Date().toISOString(), detail: null, ahead: null };
}

/**
 * How a job's wait in the start queue ended: its turn came, it was stopped, its folder or record is gone, or it passed
 * the gate file's failAfter, with the detail its job fails with (A-036).
 */
export type QueueEnd = "started" | "stopped" | "gone" | { readonly failed: string };

/**
 * Holds the job in the seat queue until it is first in priority, then queue-time order, the settle interval since the
 * last start has passed, and its reading passes the gate. Only the first job samples the load. The gate is read again
 * on each poll, so an edit reaches waiting jobs. A job that waited leaves `start-notice` for its coordinator. A wait
 * past the gate file's diagnoseAfter gets one diagnosis and goes on; one past its failAfter ends, and the job's
 * finisher ends the job (A-036). A job whose folder or record is gone stops at its next poll and writes nothing more
 * into the folder, since no record is left to end and no engine can start (D-063 (3)). A record check that fails for
 * another reason ends the wait with that failure. Its cause is kept in the job's log, or, when the log cannot take the
 * line, in the failure's message, which then names that error too (T-01).
 */
export async function waitForStart(jobDir: string, stop: AbortSignal): Promise<QueueEnd> {
	const id = basename(jobDir);
	const record = await readRecord(jobDir);
	const since = record?.queued?.since ?? new Date().toISOString();
	const entry: Entry = {
		id,
		jobDir,
		label: record?.label || id,
		priority: jobPriority(record),
		queuedAt: Date.parse(since) || Date.now(),
		pid: process.pid,
	};
	const checked: Checked = { gone: false, failure: undefined };
	const wait: Wait = { since, diagnosed: (record?.queueWait?.diagnosedAt ?? null) !== null };
	let end: QueueEnd | undefined;
	try {
		end = await pollQueue(entry, wait, stop, checked);
		return end;
	} catch (error) {
		const { failure } = checked;
		throw failure !== undefined && error === failure ? await failureAfterCleanup(jobDir, failure) : error;
	} finally {
		await leaveQueue(jobDir, checked, typeof end === "object");
	}
}

/** A job's wait as its polls know it: since when it waits, and whether its record got the diagnosis. */
type Wait = { readonly since: string; diagnosed: boolean };

/** The polls of `waitForStart` for the job of `entry` and its `wait`; `checked` notes what its record checks found. */
async function pollQueue(entry: Entry, wait: Wait, stop: AbortSignal, checked: Checked): Promise<QueueEnd> {
	const { jobDir } = entry;
	let shown: { kind: string; ahead: number; at: number } | undefined;
	// Before the poll, after its decision and after a record change: the folder can go while the job sleeps or samples
	// the load. The record, not only the folder: a folder removed while a change takes the job's lock comes back empty,
	// since the lock creates its folder (src/lock.ts).
	const recordGone = () => recordGoneAt(jobDir, checked);
	while (!(stop.aborted || recordGone())) {
		await enqueue(entry);
		const file = startGate();
		const decision = await decide(entry, file.gate, stop).catch((error: unknown) => {
			if (stop.aborted) {
				return undefined;
			}
			throw error;
		});
		if (!decision) {
			return "stopped";
		}
		if (recordGone()) {
			return "gone";
		}
		if (decision.start) {
			await started(jobDir, entry, decision.detail, shown !== undefined);
			return "started";
		}
		const end = await atThresholds({ entry, wait, detail: decision.detail, file, stop, recordGone });
		if (end !== undefined) {
			return end;
		}
		if (
			!shown ||
			shown.kind !== decision.kind ||
			shown.ahead !== decision.ahead ||
			Date.now() - shown.at >= DETAIL_REFRESH_MS
		) {
			const queued: Queued = { since: wait.since, detail: decision.detail, ahead: decision.ahead };
			await transition(jobDir, { from: ["running"], set: { queued } });
			if (recordGone()) {
				return "gone";
			}
			if (!shown) {
				await appendLimenLog(jobDir, `queued: ${decision.detail}, ${decision.ahead} ahead`);
			}
			shown = { kind: decision.kind, ahead: decision.ahead, at: Date.now() };
		}
		await delay(pollMs(), undefined, { signal: stop }).catch(() => {});
	}
	return checked.gone ? "gone" : "stopped";
}

/** What the record checks of one wait found: no record (`gone`), or a check that failed (`failure`). */
type Checked = { gone: boolean; failure: LimenError | undefined };

/** A poll that did not start its job: the job, its wait, why it waits now, the gate file, the stop, the record check. */
type HeldPoll = {
	readonly entry: Entry;
	readonly wait: Wait;
	readonly detail: string;
	readonly file: GateFile;
	readonly stop: AbortSignal;
	readonly recordGone: () => boolean;
};

/**
 * The wait's thresholds at a poll that did not start its job (A-036): past failAfter the wait ends failed, naming how
 * long it waited and why it waits now; past diagnoseAfter its record gets the diagnosis once, and its log the same
 * line, and the job keeps waiting. Returns how the wait ends, or undefined while it goes on.
 */
async function atThresholds(poll: HeldPoll): Promise<QueueEnd | undefined> {
	const { entry, wait, file } = poll;
	const waited = Date.now() - entry.queuedAt;
	if (waited >= file.limits.failAfterMs) {
		return { failed: `queued for ${formatDuration(waited)} without a start: ${poll.detail}` };
	}
	if (wait.diagnosed || waited < file.limits.diagnoseAfterMs) {
		return undefined;
	}
	const advisory = await diagnose(entry.jobDir, wait, waited, file.gate, poll.stop);
	if (poll.recordGone()) {
		return "gone";
	}
	if (advisory !== undefined) {
		await appendLimenLog(entry.jobDir, `start queue: ${advisory}`);
	}
	return undefined;
}

/**
 * Ends a wait that no failed record check ended: its entry goes, and the queue is cleared from the record the checks
 * found, its wait kept in `queueWait` with the time it left and the queue's advisory gone, since the job no longer
 * waits (A-036). A wait that passed failAfter leaves the record to the job's finisher, which clears it the same way,
 * so no reader sees that job out of the queue before it ends. A failed check is thrown the moment it is noted, so the
 * wait ends on it, and `failureAfterCleanup` ends it.
 */
async function leaveQueue(jobDir: string, checked: Checked, failed: boolean): Promise<void> {
	if (checked.failure) {
		return;
	}
	await rm(entryPath(basename(jobDir)), { force: true });
	// A job that ended while it waited has no queue left to clear: its terminal record holds none. A job whose record is
	// gone has none either, and the lock of a transition that raced a removal would create the folder again.
	if (!(checked.gone || failed)) {
		await transition(jobDir, {
			from: ["running"],
			set: (current) => ({
				...queueLeft(current, new Date().toISOString()),
				...((current.queueWait?.diagnosedAt ?? null) === null ? {} : { advisory: null }),
			}),
		});
	}
}

/**
 * The diagnosis of a wait past diagnoseAfter (A-036), `waited` long: the gate reading, sampled now, and the largest
 * units by memory and CPU (src/runtime/queue-diagnosis.ts), written into the record's `queueWait` and into its
 * `advisory`, which the wake hook delivers to the job's coordinator. Returns the advisory's text once written; undefined
 * when the wait was stopped meanwhile.
 */
async function diagnose(
	jobDir: string,
	wait: Wait,
	waited: number,
	gate: StartGate | undefined,
	stop: AbortSignal,
): Promise<string | undefined> {
	const diagnosis = await queueDiagnosis(async () => readingText(await readLoad(stop), gate)).catch(
		(error: unknown) => {
			if (stop.aborted) {
				return undefined;
			}
			throw error;
		},
	);
	if (diagnosis === undefined) {
		return undefined;
	}
	const at = new Date().toISOString();
	const text = `queued for ${formatDuration(waited)} without a start: ${diagnosis}`;
	const begun = { since: wait.since, diagnosedAt: null, diagnosis: null, leftAt: null };
	await transition(jobDir, {
		from: ["running"],
		set: (current) => ({
			queueWait: { ...(waitOf(current) ?? begun), diagnosedAt: at, diagnosis },
			// The queue's own source, so a later stall note of the job still wakes a session that heard this one.
			advisory: { text, at, source: "queue" },
		}),
	});
	wait.diagnosed = true;
	return text;
}

/**
 * The failure of a record check once the wait has left the queue: its entry goes, and the job's log takes the
 * failure's line, since the record cannot hold its cause (T-01). The queue is not cleared from the record: the change
 * would fail on the record the check could not read. A step that fails does not replace the failure, as
 * `releaseAfterFailure` (src/lock.ts) keeps an operation's error: the failure keeps its class, code, `next` and cause,
 * and its message also names each step that failed, so no error is lost.
 */
async function failureAfterCleanup(jobDir: string, failure: LimenError): Promise<LimenError> {
	const removal = () => rm(entryPath(basename(jobDir)), { force: true });
	const line = () => appendLimenLog(jobDir, `start queue: ${failure.message}`);
	const failed = [
		await stepError(removal, "its queue entry could not be removed either"),
		await stepError(line, "the job's log could not take this line either"),
	].filter((text) => text !== undefined);
	if (failed.length === 0) {
		return failure;
	}
	return new LimenError({
		class: failure.class,
		code: failure.code,
		message: [failure.message, ...failed].join("; "),
		next: failure.next,
		cause: failure.cause,
	});
}

/** `what` with the error of `step` when the step fails, for the message of the failure it follows; else undefined. */
async function stepError(step: () => Promise<void>, what: string): Promise<string | undefined> {
	try {
		await step();
		return undefined;
	} catch (error) {
		return `${what}: ${error instanceof Error ? error.message : String(error)}`;
	}
}

/**
 * Whether the job's record is gone, noted in `checked`. Absence is ENOENT alone (T-01): any other error of the check,
 * such as EACCES, EIO or ELOOP, leaves the job's state unknown, so it is noted and thrown as an environment failure
 * (T-02) that names the record and the cause.
 */
function recordGoneAt(jobDir: string, checked: Checked): boolean {
	try {
		statSync(recordPath(jobDir));
	} catch (error) {
		if (!hasCode(error, "ENOENT")) {
			const cause = error instanceof Error ? error.message : String(error);
			checked.failure = new LimenError({
				class: "environment",
				code: "QUEUE_RECORD_UNREADABLE",
				message: `the record ${recordPath(jobDir)} cannot be checked, so the queued job does not start: ${cause}`,
				next: null,
				cause: error,
			});
			throw checked.failure;
		}
		checked.gone = true;
	}
	return checked.gone;
}
/** Writes the job's entry, and writes it again if a reader removed it, so a live wrapper always holds its place. */
async function enqueue(entry: Entry): Promise<void> {
	if (!existsSync(entryPath(entry.id))) {
		await mkdir(join(queueDir(), "entries"), { recursive: true });
		await atomicWrite(entryPath(entry.id), `${JSON.stringify(entry)}\n`);
	}
}
async function decide(entry: Entry, gate: StartGate | undefined, stop: AbortSignal): Promise<Decision> {
	const ahead = (await liveEntries(entry.id)).filter(
		(other) => other.id !== entry.id && startOrder(other, entry) < 0,
	).length;
	if (!gate) {
		return { start: true, detail: "the gate is off" };
	}
	if (ahead > 0) {
		return { start: false, kind: "ahead", detail: readingText(lastReading(), gate), ahead };
	}
	const reading = await readLoad(stop);
	await mkdir(queueDir(), { recursive: true });
	await atomicWrite(join(queueDir(), "reading"), `${JSON.stringify(reading)}\n`);
	const detail = readingText(reading, gate);
	if (!gateOpen(reading, gate)) {
		return { start: false, kind: "gate", detail, ahead: 0 };
	}
	const settling = await settleLeft(gate);
	if (settling > 0) {
		return {
			start: false,
			kind: "settle",
			detail: `${detail}; settling ${formatDuration(settling)} after the last start`,
			ahead: 0,
		};
	}
	// Under the lock the head and the settle are checked again, so two jobs that sampled at once never both start
	// inside one settle.
	return groupLock(
		queueDir(),
		async (): Promise<Decision> => {
			if ((await liveEntries(entry.id))[0]?.id !== entry.id || (await settleLeft(gate)) > 0) {
				return { start: false, kind: "raced", detail, ahead: 0 };
			}
			await atomicWrite(join(queueDir(), "last-start"), `${new Date().toISOString()}\n`);
			await rm(entryPath(entry.id), { force: true });
			return { start: true, detail };
		},
		"wait",
	);
}
async function started(jobDir: string, entry: Entry, detail: string, waited: boolean): Promise<void> {
	if (!waited) {
		await appendLimenLog(jobDir, `start gate: open; ${detail}`);
		return;
	}
	const wait = formatDuration(Date.now() - entry.queuedAt);
	const job = `Limen job ${JSON.stringify(entry.label)} (${entry.id})`;
	await atomicWrite(
		`${jobDir}/start-notice`,
		`${job} started after ${wait} in the start queue: ${detail}.\nNo action is needed; its finish wakes you as usual.\n`,
	);
	await appendLimenLog(jobDir, `start queue: started after ${wait}; ${detail}`);
}

/**
 * The queue in start order, for the waiting wrapper of the job `own`: a dead, foreign or malformed entry is removed, so
 * it never blocks, and the wrapper's own entry is judged by its wrapper and its job alone (`readEntries`).
 */
async function liveEntries(own: string): Promise<Entry[]> {
	const { live, dead } = await readEntries({ own });
	for (const path of dead) {
		await rm(path, { force: true });
	}
	return live;
}

/**
 * Removes every dead, foreign or malformed entry of the start queue, once per run of the seat sweep (R-032), since
 * `limen seat queue` only skips one and a dead wrapper never removes its own; returns how many it removed. A queue
 * folder that cannot be listed for another reason than its absence is the sweep's failure, never an empty queue.
 */
export async function removeDeadEntries(): Promise<number> {
	const { dead } = await readEntries({ strict: true });
	for (const path of dead) {
		await rm(path, { force: true });
	}
	return dead.length;
}

/** The job's start-queue priority, from its record; a record without one has the default. */
export function jobPriority(record: JobRecord | undefined): number {
	return PRIORITIES.find((priority) => priority === record?.priority) ?? DEFAULT_PRIORITY;
}
export function parsePriority(value: string | undefined): number | undefined {
	if (value === undefined) {
		return undefined;
	}
	const priority = PRIORITIES.find((candidate) => String(candidate) === value.trim());
	if (!priority) {
		throw usageError("BAD_PRIORITY", "--priority must be 1, 2 or 3; 1 is the most urgent");
	}
	return priority;
}

/**
 * Spawn and continue call this after the handshake. It waits, at most a few seconds, for the wrapper's first decision.
 * The result is the `queued` line to print, or undefined once the job left the queue.
 */
export async function queuedLine(jobDir: string, label: string): Promise<string | undefined> {
	const deadline = Date.now() + 10_000;
	for (;;) {
		const record = await readRecord(jobDir);
		const queued = record?.queued;
		if (!queued) {
			return undefined;
		}
		if (queued.detail) {
			return `queued ${label}: ${queued.detail}, ${queued.ahead ?? 0} ahead`;
		}
		if (Date.now() >= deadline || record.state !== "running") {
			return `queued ${label}`;
		}
		await delay(20);
	}
}
