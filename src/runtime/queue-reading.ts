// The read half of the seat's start queue (docs/jobs.md, "Start queue"): the gate and the wait's two thresholds that
// the seat's gate file sets, the reading of the machine, and the queue's live entries in start order. It writes
// nothing, so `limen seat queue` reads the queue without loading a state transition (T-04, R-105); its one wait is the
// 2 s sample of the machine's CPU, a bounded reading that T-04 names (D-107 (3)). The waiting wrappers write the queue
// (src/runtime/start-queue.ts). The gate's defaults, 25% CPU idle and 20% memory free, are the values Limen started
// with, kept as the starting point of every limit (T-10); only the seat's gate file changes them (T-03).
import { readFileSync } from "node:fs";
import { readdir, readFile, realpath } from "node:fs/promises";
import { basename, isAbsolute, join } from "node:path";
import { setTimeout as delay } from "node:timers/promises";
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
import { readRecord, textFile } from "../job/record.ts";
import { LimenError } from "../outcome.ts";
import { platform } from "../platform/platform.ts";
import { readOptional } from "../project/inherit.ts";
import { registeredProjects, seatDir } from "../project/seat.ts";
import { hasCode } from "../system-error.ts";

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

export const GATE_FILE = "start-gate.json";
const DEFAULT_GATE: StartGate = { cpuIdle: 25, memoryFree: 20, settleMs: 60_000 };
/** The thresholds of a gate file that sets none (A-036), and the same as the file would write them, for its messages. */
const DEFAULT_WAIT: WaitLimits = { diagnoseAfterMs: 30 * 60_000, failAfterMs: 2 * 3_600_000 };
const DEFAULT_WAIT_TEXT = { diagnoseAfter: "30m", failAfter: "2h" } as const;
const SAMPLE_MS = 2_000;
/** The seat's queue folder: its entries, the last reading and the time of the last start. */
export const queueDir = () => join(seatDir(), "start-queue");

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

/** How long the settle after the seat's last start still runs, in milliseconds; 0 once it passed. */
export async function settleLeft(gate: StartGate): Promise<number> {
	const last = Date.parse(await textFile(join(queueDir(), "last-start")));
	return Number.isFinite(last) ? Math.max(0, last + gate.settleMs - Date.now()) : 0;
}
/** The reading the first waiting job wrote last, which the jobs behind it show. */
export function lastReading(): Reading | undefined {
	try {
		const recorded = JSON.parse(readFileSync(join(queueDir(), "reading"), "utf8")) as Record<string, unknown>;
		return { cpuIdle: percent(recorded.cpuIdle), memoryFree: percent(recorded.memoryFree) };
	} catch {
		return undefined;
	}
}
/** The start order of two entries: priority, then queue time, then id. */
export const startOrder = (a: Entry, b: Entry): number =>
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
export async function readEntries(
	reader: QueueReader = {},
): Promise<{ readonly live: Entry[]; readonly dead: string[] }> {
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
	return { live: live.sort(startOrder), dead };
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

/** The queue in start order, as `limen seat queue` shows it: a read, which leaves a dead entry where it is (T-04). */
export async function queueEntries(): Promise<readonly Entry[]> {
	return (await readEntries()).live;
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
