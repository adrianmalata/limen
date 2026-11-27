import { existsSync, readFileSync, statSync } from "node:fs";
import { mkdir, readdir, readFile, realpath, rm } from "node:fs/promises";
import { basename, isAbsolute, join } from "node:path";
import { setTimeout as delay } from "node:timers/promises";
import { atomicWrite } from "../atomic-write.ts";
import {
	type BadData,
	duration,
	eachField,
	either,
	numberIn,
	object,
	oneOf,
	parseJson,
	refusedValue,
} from "../boundary.ts";
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
	textFile,
	transition,
	waitOf,
} from "../job/record.ts";
import { LimenError, usageError } from "../outcome.ts";
import { platform } from "../platform/platform.ts";
import { readOptional } from "../project/inherit.ts";
import { registeredProjects, seatDir } from "../project/seat.ts";
import { hasCode } from "../system-error.ts";
import { queueDiagnosis } from "./queue-diagnosis.ts";

// The projects of the seat share its CPU and memory, so one queue and one gate serve the whole seat (docs/jobs.md,
// "Start queue"). A detached job's own wrapper waits in it after its handshake and before setup; no daemon runs it. The
// gate's defaults, 25% CPU idle and 20% memory free, are the values Limen started with, kept as the starting point of
// every limit (T-10); only the seat's gate file changes them (T-03). Only the gate and the jobs ahead hold a job: the
// start priority of a seat rule, which any process could set, went with the rules (A-010, R-102). A wait has two
// thresholds (A-036): past the first the job's coordinator gets one diagnosis and the job waits on; past the second the
// job ends failed, so no wait outlasts it.
export type StartGate = { readonly cpuIdle: number; readonly memoryFree: number; readonly settleMs: number };
/** When a wait gets its diagnosis and when it fails, in milliseconds since the job entered the queue (A-036). */
export type WaitLimits = { readonly diagnoseAfterMs: number; readonly failAfterMs: number };
/** Percentages; a value the machine could not report is undefined and does not hold a job back. */
export type Reading = { readonly cpuIdle: number | undefined; readonly memoryFree: number | undefined };
/** One job's place in the start queue, as its wrapper writes it. */
export type Entry = {
	readonly id: string;
	readonly jobDir: string;
	readonly label: string;
	readonly priority: number;
	readonly queuedAt: number;
	readonly pid: number;
};
type Decision =
	| { readonly start: true; readonly detail: string }
	| { readonly start: false; readonly kind: string; readonly detail: string; readonly ahead: number };

export const GATE_FILE = "start-gate.json";
export const PRIORITIES = [1, 2, 3] as const;
export const DEFAULT_PRIORITY = 2;
const DEFAULT_GATE: StartGate = { cpuIdle: 25, memoryFree: 20, settleMs: 60_000 };
/** The thresholds of a gate file that sets none (A-036), and the same as the file would write them, for its messages. */
const DEFAULT_WAIT: WaitLimits = { diagnoseAfterMs: 30 * 60_000, failAfterMs: 2 * 3_600_000 };
const DEFAULT_WAIT_TEXT = { diagnoseAfter: "30m", failAfter: "2h" } as const;
const SAMPLE_MS = 2_000;
const DETAIL_REFRESH_MS = 60_000;
const queueDir = () => join(seatDir(), "start-queue");
const entryPath = (id: string) => join(queueDir(), "entries", `${id}.json`);
const pollMs = (): number => {
	const knob = Number(testKnob("LIMEN_START_POLL_MS"));
	return knob > 0 ? knob : 5_000;
};

/** The values `start-gate.json` may change, each with its validator: percentages, the settle time, the thresholds. */
const GATE_FIELDS = {
	cpuIdle: numberIn({ min: 0, max: 100 }),
	memoryFree: numberIn({ min: 0, max: 100 }),
	settle: duration,
	diagnoseAfter: duration,
	failAfter: duration,
};

/** What the seat's gate file sets: the gate, undefined when it is off, the wait's thresholds, and what it ignored. */
export type GateFile = {
	readonly gate: StartGate | undefined;
	readonly limits: WaitLimits;
	readonly ignored: readonly BadData[];
};

/**
 * The gate: `<seat>/start-gate.json`, the JSON string `"off"` or an object of the values it changes, else the
 * defaults; the seat's file is the only source, and no environment variable overrides it (T-03, R-015). Undefined
 * when the gate is off; the wait's thresholds keep their defaults then.
 * `ignored` holds the typed error of each value Limen did not use (T-27 (2)): an invalid or unknown value on its own,
 * a pair of thresholds out of order as one, and a file of another shape as a whole.
 */
export function startGate(): GateFile {
	const source = readOptional(join(seatDir(), GATE_FILE));
	if (!source) {
		return { gate: DEFAULT_GATE, limits: DEFAULT_WAIT, ignored: [] };
	}
	const read = parseJson(GATE_FILE, source, either(oneOf(["off"]), object()));
	if (read instanceof LimenError) {
		return { gate: DEFAULT_GATE, limits: DEFAULT_WAIT, ignored: [read] };
	}
	if (read === "off") {
		return { gate: undefined, limits: DEFAULT_WAIT, ignored: [] };
	}
	const { values, ignored } = eachField(GATE_FILE, read, GATE_FIELDS);
	const gate = {
		cpuIdle: values.cpuIdle ?? DEFAULT_GATE.cpuIdle,
		memoryFree: values.memoryFree ?? DEFAULT_GATE.memoryFree,
		settleMs: values.settle ?? DEFAULT_GATE.settleMs,
	};
	const wait = waitLimits(read, values);
	return { gate, limits: wait.limits, ignored: [...ignored, ...wait.ignored] };
}

/**
 * The wait's thresholds from the gate file's valid values `values` of its fields `fields`, each else its default. A
 * failure that came before the diagnosis would end a job its coordinator was never told of, so a pair out of order is
 * one bad value: both keep their defaults, and the typed error names the field the file gave, `failAfter` when it
 * gave both (T-27 (2)).
 */
function waitLimits(
	fields: ReadonlyMap<string, unknown>,
	values: Partial<Record<keyof typeof GATE_FIELDS, number>>,
): { readonly limits: WaitLimits; readonly ignored: readonly BadData[] } {
	const limits = {
		diagnoseAfterMs: values.diagnoseAfter ?? DEFAULT_WAIT.diagnoseAfterMs,
		failAfterMs: values.failAfter ?? DEFAULT_WAIT.failAfterMs,
	};
	if (limits.failAfterMs > limits.diagnoseAfterMs) {
		return { limits, ignored: [] };
	}
	const given = (name: keyof typeof DEFAULT_WAIT_TEXT) =>
		values[name] === undefined ? `${DEFAULT_WAIT_TEXT[name]} by default` : String(fields.get(name));
	const refused =
		values.failAfter === undefined
			? {
					field: "diagnoseAfter",
					expected: `a duration below failAfter (${given("failAfter")})`,
					got: fields.get("diagnoseAfter"),
				}
			: {
					field: "failAfter",
					expected: `a duration above diagnoseAfter (${given("diagnoseAfter")})`,
					got: fields.get("failAfter"),
				};
	return { limits: DEFAULT_WAIT, ignored: [refusedValue(GATE_FILE, refused)] };
}
/** The messages of the gate values Limen ignored, for the job log and `limen seat queue`; each names the file. */
export function ignoredText(ignored: readonly BadData[]): string {
	return ignored.map(({ message }) => message).join("; ");
}

/** CPU idle across all cores over about two seconds, and free memory. `LIMEN_START_READING` names a file that holds
 * both instead; tests and manual checks set the reading there, so the machine's load never decides them. */
export async function readLoad(signal?: AbortSignal): Promise<Reading> {
	const fixed = testKnob("LIMEN_START_READING")?.trim();
	if (fixed) {
		const recorded: Partial<Record<keyof Reading, unknown>> = await readFile(fixed, "utf8").then(
			(body) => JSON.parse(body),
			() => ({}),
		);
		return { cpuIdle: percent(recorded.cpuIdle), memoryFree: percent(recorded.memoryFree) };
	}
	const before = platform.coreTimes();
	await delay(SAMPLE_MS, undefined, signal ? { signal } : {});
	const after = platform.coreTimes();
	let idle = 0;
	let total = 0;
	after.forEach((core, index) => {
		const earlier = before[index];
		if (!earlier) {
			return;
		}
		idle += core.idle - earlier.idle;
		total += core.total - earlier.total;
	});
	return { cpuIdle: total > 0 ? (100 * idle) / total : undefined, memoryFree: memoryFree() };
}
/** The share of memory the system can give to new work without swapping. */
function memoryFree(): number | undefined {
	const memory = platform.memory();
	return memory ? percent((100 * memory.availableKib) / memory.totalKib) : undefined;
}
function percent(value: unknown): number | undefined {
	return typeof value === "number" && Number.isFinite(value) ? Math.max(0, Math.min(100, value)) : undefined;
}
/** The reading with the gate's values beside it; with the gate off, the reading alone and that the gate is off. */
export function readingText(reading: Reading | undefined, gate: StartGate | undefined): string {
	if (!reading) {
		return "no reading yet";
	}
	const shown = (value: number | undefined) => (value === undefined ? "unknown" : `${Math.round(value)}%`);
	if (!gate) {
		return `CPU ${shown(reading.cpuIdle)} idle, memory ${shown(reading.memoryFree)} free; the gate is off`;
	}
	const cpu = `CPU ${shown(reading.cpuIdle)} idle (gate ${gate.cpuIdle}%)`;
	return `${cpu}, memory ${shown(reading.memoryFree)} free (gate ${gate.memoryFree}%)`;
}
/** Whether `reading` passes the gate `gate`; a value the machine did not report does not hold a job back. */
export function gateOpen(reading: Reading, gate: StartGate): boolean {
	return (reading.cpuIdle ?? 100) >= gate.cpuIdle && (reading.memoryFree ?? 100) >= gate.memoryFree;
}

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
		(other) => other.id !== entry.id && order(other, entry) < 0,
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
/** How long the settle after the seat's last start still runs, in milliseconds; 0 once it passed. */
export async function settleLeft(gate: StartGate): Promise<number> {
	const last = Date.parse(await textFile(join(queueDir(), "last-start")));
	return Number.isFinite(last) ? Math.max(0, last + gate.settleMs - Date.now()) : 0;
}
function lastReading(): Reading | undefined {
	try {
		const recorded = JSON.parse(readFileSync(join(queueDir(), "reading"), "utf8")) as Record<string, unknown>;
		return { cpuIdle: percent(recorded.cpuIdle), memoryFree: percent(recorded.memoryFree) };
	} catch {
		return undefined;
	}
}
const order = (a: Entry, b: Entry): number =>
	a.priority - b.priority || a.queuedAt - b.queuedAt || a.id.localeCompare(b.id);

/**
 * How a reader reads the queue: `strict`, as the seat sweep reads it, and `own`, the id of a waiting wrapper's own job,
 * whose entry `readEntries` judges by its wrapper and its job alone, every other entry also by whether its folder is a
 * job of a registered project.
 */
type QueueReader = { readonly strict?: boolean; readonly own?: string };

/**
 * The queue in start order, read only: the entries whose wrapper lives, whose folder is a job of a project the seat
 * registers (`projectJob`, D-107 (5)) and whose job runs, and the files of the dead, foreign and malformed ones, which
 * whoever may write removes. So any process of the agents' account that writes an entry naming a running record
 * elsewhere holds no other job's start. The entry of the reader's own job (`own`) is judged by its wrapper and its job
 * alone: the rule guards the other jobs' starts, so a job of a project the seat does not register still starts in its
 * turn (R-104 Decision 7). A recycled pid can keep a dead entry until the reaper ends its job; the state check then
 * finds it dead. A missing folder is an empty queue. With `strict`, as the seat sweep reads it, any other failure to
 * list the folder goes on (T-01, review round 2, note 13); the waiting wrappers and `limen seat queue` still read such
 * a folder as empty, until R-082 brings the swallowed errors to zero.
 */
async function readEntries(reader: QueueReader = {}): Promise<{ readonly live: Entry[]; readonly dead: string[] }> {
	const folder = join(queueDir(), "entries");
	const live: Entry[] = [];
	const dead: string[] = [];
	const names = await readdir(folder).catch((error: unknown) => {
		if (reader.strict && !hasCode(error, "ENOENT")) {
			throw error;
		}
		return [] as string[];
	});
	// A relative path would name a folder below the reader's working folder, so it names no project.
	const roots = registeredProjects().filter((root) => isAbsolute(root));
	for (const name of names) {
		if (!name.endsWith(".json")) {
			continue;
		}
		const body = await readFile(join(folder, name), "utf8").catch(() => undefined);
		if (body === undefined) {
			continue;
		}
		const entry = parseEntry(body);
		if (entry && (await liveEntry(entry, entry.id === reader.own ? undefined : roots))) {
			live.push(entry);
		} else {
			dead.push(join(folder, name));
		}
	}
	return { live: live.sort(order), dead };
}

/**
 * Whether the entry `entry` is live: its wrapper lives, its folder is a job of one of the registered projects `roots`
 * (none to check for the reader's own job), and its job runs. The folder is checked before its record is read, so no
 * record outside the registered projects is read.
 */
async function liveEntry(entry: Entry, roots: readonly string[] | undefined): Promise<boolean> {
	return (
		platform.processAlive(entry.pid) &&
		(roots === undefined || (await projectJob(entry, roots))) &&
		(await entryState(entry.jobDir)) === "running"
	);
}

/**
 * Whether the folder of `entry` is one of the jobs of a project the seat registers (D-107 (5), R-104 Decision 6): its
 * `jobDir` is `<root>/.limen/jobs/<id>` for one of `roots`, the entry's own id a folder name there, compared as real
 * paths, so neither a link nor `..` makes another folder one of the project's jobs.
 */
async function projectJob(entry: Entry, roots: readonly string[]): Promise<boolean> {
	const { id } = entry;
	if (id === "" || id.startsWith(".") || basename(id) !== id) {
		return false;
	}
	const real = await realPath(entry.jobDir);
	if (real === undefined) {
		return false;
	}
	for (const root of roots) {
		if ((await realPath(join(root, ".limen", "jobs", id))) === real) {
			return true;
		}
	}
	return false;
}

/**
 * The real path of `path`; undefined when nothing is there (ENOENT), as a project holds no job of that id. Any other
 * failure to resolve it goes on (T-01).
 */
async function realPath(path: string): Promise<string | undefined> {
	try {
		return await realpath(path);
	} catch (error) {
		if (hasCode(error, "ENOENT")) {
			return undefined;
		}
		throw error;
	}
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

/** The queue in start order, as `limen seat queue` shows it: a read, which leaves a dead entry where it is (T-04). */
export async function queueEntries(): Promise<readonly Entry[]> {
	return (await readEntries()).live;
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
function parseEntry(body: string): Entry | undefined {
	try {
		const value = JSON.parse(body) as Partial<Entry>;
		const { id, jobDir, label, priority, queuedAt, pid } = value;
		if (
			typeof id === "string" &&
			typeof jobDir === "string" &&
			typeof label === "string" &&
			typeof priority === "number" &&
			typeof queuedAt === "number" &&
			typeof pid === "number" &&
			pid > 0
		) {
			return { id, jobDir, label, priority, queuedAt, pid };
		}
	} catch {
		// A malformed entry is removed like a dead one.
	}
	return undefined;
}

/**
 * The state of the job an entry names. The queue is the seat's, so the job may belong to any of its projects: a record
 * this Limen cannot read (damaged, or not migrated) ends the entry as a dead job's does, and the job's own commands
 * report the record.
 */
async function entryState(jobDir: string): Promise<string | undefined> {
	const record = await readRecord(jobDir).catch((error: unknown) => {
		if (error instanceof LimenError) {
			return undefined;
		}
		throw error;
	});
	return record?.state;
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

/** The wait and the reason a queued job shows in `limen status` and `limen show`. */
export function queuedText(queued: Queued): string {
	const since = Date.parse(queued.since);
	const wait = Number.isFinite(since) ? ` ${formatDuration(Date.now() - since)}` : "";
	return queued.detail ? `waiting${wait}: ${queued.detail}, ${queued.ahead ?? 0} ahead` : `waiting${wait}: deciding`;
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
