// The job record (S1+, A-019, D-057): one `record.json` per job folder, schema version 1, and beside it `progress.json`,
// which the wrapper rewrites per stream event outside the transition function (D-057 (7.1)). This is the one module
// that names either file or a file of the older record (T-25 (1)); src/job/migration.ts, which moves older records
// into this one, is the only other. Every read opens the file with O_NOFOLLOW, takes only a regular file with at most
// one name (none when a rewrite renamed a new record over it after the read opened it) under a size cap, and checks
// the text with the validators of src/boundary.ts (T-27 (2)). Every write of
// `record.json` is `transition`'s: under the job's lock (src/lock.ts), from an expected state only (compare-and-swap),
// never after a terminal state, with an exclusive claim at the terminal transition so that one finisher wins; the write
// is atomicWrite's temp, fsync and rename, so a reader sees the old record or the new one. The content files
// (`task.md`, `log`, `result`, the notes, `start-notice`, `session/`) and the receipt folders stay plain files; `log` is
// appended to (`appendLimenLog`), not written by atomicWrite. `jobFolderNames` lists a folder of job folders, with its
// rule for a folder that does not exist. `jobFolders` and its callers list through it, and test/structure.test.ts
// requires src/job/reference.ts and src/job/migration.ts to use it (T-25 (1)); `jobFoldersSync` reads the folder with
// its own `readdirSync` and `ENOENT` rule, and shares only the filter of names with it.
import {
	closeSync,
	constants,
	type Dirent,
	existsSync,
	fstatSync,
	openSync,
	readdirSync,
	readSync,
	type Stats,
} from "node:fs";
import { appendFile, type FileHandle, open, readdir, readFile, rm } from "node:fs/promises";
import { basename, dirname, join } from "node:path";
import { atomicWrite } from "../atomic-write.ts";
import {
	arrayOf,
	at,
	checkValue,
	matching,
	nullOr,
	numberIn,
	object,
	oneOf,
	parseJson,
	refusedValue,
	string,
	type Validator,
} from "../boundary.ts";
import { withLock } from "../lock.ts";
import { LimenError } from "../outcome.ts";
import { BOOT_ID } from "../platform/platform.ts";
import { hasCode } from "../system-error.ts";
import { isTerminal, SESSION_ID } from "./job.ts";

/** The record's schema version (D-057 (7.8)); a field added later is optional for a record of this version. */
export const RECORD_VERSION = 1;
const RECORD = "record.json";
const PROGRESS = "progress.json";
/** The exclusive claim of the terminal transition (S1+): it holds the terminal record its winner writes. */
const CLAIM = "terminal";
/** The file of the older record that marks a folder the migration has not moved yet (D-057 (6)). */
const OLD_STATE = "state";
/** The largest record and progress file a read takes; a larger one is damaged data. */
const RECORD_BYTES = 1024 * 1024;
const PROGRESS_BYTES = 64 * 1024;

export const JOB_STATES = ["starting", "running", "done", "failed", "stopped"] as const;
/** `starting`: published, its wrapper not yet running; `running`; and the terminal states. */
export type JobState = (typeof JOB_STATES)[number];
/** The failure kinds of A-016 (1). */
export const FAILURE_KINDS = [
	"quota",
	"timeout",
	"tool-cap",
	"stall",
	"reaped",
	"engine-error",
	"exit",
	"signal",
	"oom",
	"queue",
	"read-only-violation",
	"quota-exhausted",
] as const;
export type FailureKind = (typeof FAILURE_KINDS)[number];

/** The process that runs the job (A-056): written in the transition to `running`; each part null when unknown. */
export type Identity = { readonly pid: number | null; readonly born: string | null; readonly bootId: string | null };
/** Why a failed job failed: a kind of A-016 or null when no known pattern names it, the original text, the reset time. */
export type Failure = { readonly kind: FailureKind | null; readonly detail: string; readonly resetAt: string | null };
/** A side channel of the terminal transition that failed (T-01), written with the terminal state. */
export type SideFailure = { readonly channel: string; readonly message: string; readonly at: string };
export type Transition = { readonly from: JobState | null; readonly to: JobState; readonly at: string };
/** A job that waits in the seat's start queue: since when, and the wait's reason and place once decided. */
export type Queued = { readonly since: string; readonly detail: string | null; readonly ahead: number | null };
/** The wrapper's note on a running job, such as an uncertain stall observation, and when it was set. */
export type Advisory = { readonly text: string; readonly at: string };
/** Where the job's wake goes: the Herdr tab and pane of its coordinator, and its Pi session. */
export type Origin = { readonly tab: string | null; readonly pane: string | null; readonly session: string | null };
/**
 * The systemd user scope the job runs in (A-029): its unit and its cgroup, which the wrapper writes in the transition
 * to running, and the readings its finisher takes from that cgroup just before the terminal transition (M-09, A-052),
 * each null until then and when it could not be read, as from a scope already gone.
 */
export type Scope = {
	readonly unit: string;
	readonly cgroup: string;
	readonly memoryPeakBytes: number | null;
	readonly cpuMicroseconds: number | null;
	readonly oomKills: number | null;
};
/** The route a job runs on (D-043); an older record's engine stays as it was written (D-057 (2)). */
export type Route = {
	readonly engine: string | null;
	readonly model: string | null;
	readonly provider: string | null;
	readonly thinking: string | null;
};

/** The facts publication writes once (D-057 (7.4)); each one null when the job has none. */
export type Facts = {
	readonly label: string | null;
	readonly branch: string | null;
	readonly worktree: string | null;
	readonly base: string | null;
	readonly role: string | null;
	readonly repo: string | null;
	readonly origin: Origin;
	readonly group: string | null;
	readonly team: string | null;
	readonly parent: string | null;
	/** Who ran the spawn, as `spawnerLine` (src/job/publication.ts) says it. */
	readonly spawner: string | null;
	/** The job whose agent ran the spawn. */
	readonly spawnedBy: string | null;
	readonly candidate: string | null;
	/** The start-queue order: 1 is the most urgent. */
	readonly priority: number | null;
	readonly route: Route;
	readonly extensions: readonly string[] | null;
	/** The process that published the job: until the wrapper runs it, a live one means the job is starting. */
	readonly spawnerPid: number | null;
	readonly startedAt: string | null;
};

export type JobRecord = Facts & {
	readonly version: typeof RECORD_VERSION;
	readonly id: string;
	readonly state: JobState;
	readonly transitions: readonly Transition[];
	readonly identity: Identity | null;
	readonly finishedAt: string | null;
	readonly failure: Failure | null;
	readonly sideFailures: readonly SideFailure[];
	readonly queued: Queued | null;
	/** The reason `limen stop` gave a job that waited in the start queue. */
	readonly stopRequested: string | null;
	readonly advisory: Advisory | null;
	/** The engine's stop reason for its last message. */
	readonly stopReason: string | null;
	/** The items a done job's final "Note check" left open. */
	readonly openChecks: readonly string[] | null;
	/** The job's commits on its branch, one `git log --oneline` line each; null when they were not counted. */
	readonly commits: readonly string[] | null;
	/** The versions of the engine and the tools the job started with. */
	readonly versions: string | null;
	/** Set once the wrapper ran in the job's scope; a record from before R-026, or of a job that never ran, has none. */
	readonly scope?: Scope;
	/** Set on a record the migration wrote (D-057 (4)): history only. */
	readonly migrated?: { readonly at: string };
};

/** The fields a change may set; the state and the transitions are the transition function's own. */
export type Fields = Partial<Omit<JobRecord, "version" | "id" | "state" | "transitions">>;

/**
 * What the wrapper reports per stream event (D-057 (7.1)), which writes every part. A part is null only in a migrated
 * folder whose older record had no file for it, such as `tool-calls` before the first tool call.
 */
export type Progress = {
	readonly activity: string | null;
	readonly lastTool: string | null;
	readonly toolCalls: number | null;
};

const RECORD_FIELDS = [
	"version",
	"id",
	"state",
	"transitions",
	"identity",
	"label",
	"branch",
	"worktree",
	"base",
	"role",
	"repo",
	"origin",
	"group",
	"team",
	"parent",
	"spawner",
	"spawnedBy",
	"candidate",
	"priority",
	"route",
	"extensions",
	"spawnerPid",
	"startedAt",
	"finishedAt",
	"failure",
	"sideFailures",
	"queued",
	"stopRequested",
	"advisory",
	"stopReason",
	"openChecks",
	"commits",
	"versions",
	"scope",
	"migrated",
] as const;

const ISO_TIME = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z$/;
/** A unit name of systemd for a scope. */
const SCOPE_UNIT = /^[\w:.@-]+\.scope$/;
/** A path of the cgroup v2 hierarchy: absolute, one line, with no `..` part. */
const CGROUP = /^(?:\/(?!\.\.?(?:\/|$))[^/\n]+)+$/;
const BORN = /^\d{1,20}$/;
const MAX_PID = 2_147_483_647;

/** The path of a job's record; for a reader that only asks when it changed (the picture's event time). */
export function recordPath(jobDir: string): string {
	return join(jobDir, RECORD);
}
/** The path of a job's progress file. */
export function progressPath(jobDir: string): string {
	return join(jobDir, PROGRESS);
}
/** Whether `name`, a file name inside a job folder, is the progress file, which the coordinator's watcher ignores. */
export function isProgressName(name: string): boolean {
	return name === PROGRESS;
}

/** The refusal of a project whose job folders an older Limen wrote (D-057 (6)): exit 4, and the migration next. */
export function notMigrated(jobsRoot: string, id: string): LimenError {
	return new LimenError({
		class: "environment",
		code: "NOT_MIGRATED",
		message: `${jobsRoot} holds job records of an older Limen (${id} has a ${OLD_STATE} file and no ${RECORD}); see what limen migrate would do, then run it`,
		next: "limen migrate --dry-run",
	});
}

/** Whether the folder `jobDir` holds an older record: its state file and no record (D-057 (6)). */
export function unmigratedFolder(jobDir: string): boolean {
	return !existsSync(join(jobDir, RECORD)) && existsSync(join(jobDir, OLD_STATE));
}

/**
 * The names of the job folders below `folder`, such as `.limen/jobs/` or `.limen/unmigrated/`: sorted, without hidden
 * names, none when `folder` does not exist. It reads no record; `jobFolders` also refuses an older one.
 */
export async function jobFolderNames(folder: string): Promise<string[]> {
	const entries = await readdir(folder, { withFileTypes: true }).catch((error: unknown) => {
		if (hasCode(error, "ENOENT")) {
			return [];
		}
		throw error;
	});
	return visibleFolders(entries);
}
/** The job folders below `jobsRoot`, sorted, none when it does not exist; NOT_MIGRATED when one holds an older record. */
export async function jobFolders(jobsRoot: string): Promise<string[]> {
	return checkedFolders(jobsRoot, await jobFolderNames(jobsRoot));
}
/** `jobFolders` for a caller that cannot wait, such as a hook. */
export function jobFoldersSync(jobsRoot: string): string[] {
	let entries: Dirent[];
	try {
		entries = readdirSync(jobsRoot, { withFileTypes: true });
	} catch (error) {
		if (hasCode(error, "ENOENT")) {
			return [];
		}
		throw error;
	}
	return checkedFolders(jobsRoot, visibleFolders(entries));
}
/** The folders among `entries` whose names are not hidden, sorted by name. */
function visibleFolders(entries: readonly Dirent[]): string[] {
	return entries
		.filter((entry) => entry.isDirectory() && !entry.name.startsWith("."))
		.map((entry) => entry.name)
		.sort();
}
function checkedFolders(jobsRoot: string, folders: string[]): string[] {
	const old = folders.find((name) => unmigratedFolder(join(jobsRoot, name)));
	if (old !== undefined) {
		throw notMigrated(jobsRoot, old);
	}
	return folders;
}

/**
 * The record of the job folder `jobDir`: undefined when the folder holds none, NOT_MIGRATED when it holds an older one,
 * and BAD_DATA for a file that is no regular file with at most one name, too large, or damaged.
 */
export async function readRecord(jobDir: string): Promise<JobRecord | undefined> {
	const text = await guardedText(join(jobDir, RECORD), RECORD_BYTES);
	return recordFrom(jobDir, text);
}
/** `readRecord` for a caller that cannot wait, such as a hook. */
export function readRecordSync(jobDir: string): JobRecord | undefined {
	return recordFrom(jobDir, guardedTextSync(join(jobDir, RECORD), RECORD_BYTES));
}
function recordFrom(jobDir: string, text: string | undefined): JobRecord | undefined {
	if (text === undefined) {
		if (existsSync(join(jobDir, OLD_STATE))) {
			throw notMigrated(dirname(jobDir), basename(jobDir));
		}
		return undefined;
	}
	const file = join(jobDir, RECORD);
	const record = parseJson(file, text, recordOf);
	if (record instanceof LimenError) {
		throw record;
	}
	if (record.id !== basename(jobDir)) {
		throw refusedValue(file, { field: "id", expected: `the folder's name ${basename(jobDir)}`, got: record.id });
	}
	return record;
}

/** The job's progress, or undefined when it has none; BAD_DATA as `readRecord` gives it. */
export async function readProgress(jobDir: string): Promise<Progress | undefined> {
	return progressFrom(jobDir, await guardedText(join(jobDir, PROGRESS), PROGRESS_BYTES));
}
/** `readProgress` for a caller that cannot wait. */
export function readProgressSync(jobDir: string): Progress | undefined {
	return progressFrom(jobDir, guardedTextSync(join(jobDir, PROGRESS), PROGRESS_BYTES));
}
function progressFrom(jobDir: string, text: string | undefined): Progress | undefined {
	if (text === undefined) {
		return undefined;
	}
	const progress = parseJson(join(jobDir, PROGRESS), text, progressOf);
	if (progress instanceof LimenError) {
		throw progress;
	}
	return progress;
}
/** Rewrites the job's progress; the wrapper calls it per stream event, outside the transition function. */
export async function writeProgress(jobDir: string, progress: Progress): Promise<void> {
	await atomicWrite(join(jobDir, PROGRESS), `${JSON.stringify(progress)}\n`);
}

/** A read that follows no symlink and does not wait on a pipe. */
const GUARDED_FLAGS = constants.O_RDONLY | constants.O_NOFOLLOW | constants.O_NONBLOCK;

/**
 * A file the poller reads from a worker-owned checkout (A-028): only a regular file with exactly one name counts, so a
 * symlink, a second name of another file or a pipe reads as empty, as a missing file does. At most `limit` bytes are
 * read, from the end when `tail` is set. Any failure to open reads as empty too. The record's read differs: it takes a
 * file with at most one name (none when it was renamed over after it was opened), reads a missing file as none,
 * refuses a symlink and any other file it does not take as BAD_DATA, and lets any other failure to open go on.
 */
export async function readJobFile(path: string, limit = 65_536, tail = false): Promise<string> {
	const handle = await open(path, GUARDED_FLAGS).catch(() => undefined);
	if (!handle) {
		return "";
	}
	try {
		const info = await handle.stat();
		if (!info.isFile() || info.nlink !== 1) {
			return "";
		}
		const length = Math.min(info.size, limit);
		const buffer = Buffer.alloc(length);
		const { bytesRead } = await handle.read(buffer, 0, length, tail ? info.size - length : 0);
		return buffer.subarray(0, bytesRead).toString("utf8");
	} finally {
		await handle.close();
	}
}

/** The text of `path` under the read rule: undefined when absent, BAD_DATA for a file of another kind or size. */
async function guardedText(path: string, limit: number): Promise<string | undefined> {
	let handle: FileHandle;
	try {
		handle = await open(path, GUARDED_FLAGS);
	} catch (error) {
		return openFailure(path, error);
	}
	try {
		const info = await handle.stat();
		refuseFile(path, info, limit);
		return await handle.readFile("utf8");
	} finally {
		await handle.close();
	}
}
function guardedTextSync(path: string, limit: number): string | undefined {
	let descriptor: number;
	try {
		descriptor = openSync(path, GUARDED_FLAGS);
	} catch (error) {
		return openFailure(path, error);
	}
	try {
		const info = fstatSync(descriptor);
		refuseFile(path, info, limit);
		const buffer = Buffer.alloc(info.size);
		const read = readSync(descriptor, buffer, 0, info.size, 0);
		return buffer.subarray(0, read).toString("utf8");
	} finally {
		closeSync(descriptor);
	}
}
/** A missing file is absent; a symlink (ELOOP under O_NOFOLLOW) is refused; any other failure goes on. */
function openFailure(path: string, error: unknown): undefined {
	if (hasCode(error, "ENOENT")) {
		return undefined;
	}
	if (hasCode(error, "ELOOP")) {
		throw refusedValue(path, { field: "", expected: "a regular file with one name", got: "a symbolic link" });
	}
	throw error;
}
function refuseFile(path: string, info: Stats, limit: number): void {
	if (!info.isFile()) {
		throw refusedValue(path, { field: "", expected: "a regular file with one name", got: "another kind of file" });
	}
	// No name left is a record a rewrite renamed over after this read opened it: its text is still a whole record.
	if (info.nlink > 1) {
		throw refusedValue(path, { field: "", expected: "a regular file with one name", got: `${info.nlink} names` });
	}
	if (info.size > limit) {
		throw refusedValue(path, { field: "", expected: `at most ${limit} bytes`, got: `${info.size} bytes` });
	}
}

/** A change of a record (A-019): the states it may start from, the state it moves to, and the fields it sets. */
export type Change = {
	/** The states the record must be in; `absent` when the folder may hold no record yet. */
	readonly from: readonly (JobState | "absent")[];
	/** The state the record moves to; without it the change sets fields and leaves the state alone. */
	readonly to?: JobState;
	/** The fields to set, or a function of the record as the lock finds it, called after `prepare`. */
	readonly set?: Fields | ((record: JobRecord) => Fields);
	/**
	 * Work that must be durable before the record changes, run under the lock once the change applies: the terminal
	 * log line, which a loser never writes.
	 */
	readonly prepare?: (record: JobRecord) => Promise<void>;
};

/**
 * The one writer of `record.json` (A-019, S1+). Under the job's lock it reads the record and applies `change` only
 * when the record is in one of the states `from` names and not terminal: the first finisher wins, and a loser, or any
 * change after a terminal state, returns undefined without writing. A terminal transition takes the claim `terminal`
 * exclusively, holding the record it then writes. A claim whose record is not yet written, because its writer died in
 * between, still wins: the next terminal transition writes that record instead of its own and returns undefined
 * before its `prepare` runs. Every claim is taken under the lock, so none can appear between that check and the
 * exclusive write. A change that leaves the state alone never reads the claim. Returns the record written.
 */
export async function transition(jobDir: string, change: Change): Promise<JobRecord | undefined> {
	if (!(change.from.includes("absent") || existsSync(jobDir))) {
		return undefined;
	}
	return withLock({ folder: jobDir }, async () => {
		const current = await readRecord(jobDir);
		if (!(change.from.includes(current?.state ?? "absent") && !(current && isTerminal(current.state)))) {
			return undefined;
		}
		const terminal = change.to !== undefined && isTerminal(change.to);
		if (terminal && (await writeDeadClaim(jobDir))) {
			return undefined;
		}
		await change.prepare?.(current ?? emptyRecord(basename(jobDir)));
		const next = changed(jobDir, current, change);
		if (terminal) {
			await atomicWrite(join(jobDir, CLAIM), serialized(next), { exclusive: true });
		}
		try {
			await atomicWrite(join(jobDir, RECORD), serialized(next));
		} catch (error) {
			if (terminal) {
				await rm(join(jobDir, CLAIM), { force: true });
			}
			throw error;
		}
		return next;
	});
}

/** The record `change` makes of `current` (a new one in an empty folder), checked by the record's validator. */
function changed(jobDir: string, current: JobRecord | undefined, change: Change): JobRecord {
	const base = current ?? emptyRecord(basename(jobDir));
	const fields = typeof change.set === "function" ? change.set(base) : (change.set ?? {});
	const to = change.to ?? base.state;
	const moved = current === undefined || to !== current.state;
	const at = new Date().toISOString();
	const next: JobRecord = {
		...base,
		...fields,
		state: to,
		transitions: moved ? [...base.transitions, { from: current?.state ?? null, to, at }] : base.transitions,
		...(moved && isTerminal(to) && fields.finishedAt === undefined ? { finishedAt: at } : {}),
	};
	const checked = checkValue(join(jobDir, RECORD), next, recordOf);
	if (checked instanceof LimenError) {
		throw checked;
	}
	return checked;
}

/**
 * Writes the record of a terminal claim that never reached `record.json` (its writer died between the two writes),
 * since that claim won; true when there was one, false when the folder holds no claim.
 */
async function writeDeadClaim(jobDir: string): Promise<boolean> {
	const claim = join(jobDir, CLAIM);
	let text: string;
	try {
		text = await readFile(claim, "utf8");
	} catch (error) {
		if (hasCode(error, "ENOENT")) {
			return false;
		}
		throw error;
	}
	const won = parseJson(claim, text, recordOf);
	if (won instanceof LimenError) {
		throw won;
	}
	await atomicWrite(join(jobDir, RECORD), serialized(won));
	return true;
}

/** The first record of a job (state `starting`), which publication writes once into its hidden folder `folder`. */
export async function publishRecord(folder: string, id: string, facts: Facts): Promise<void> {
	const at = new Date().toISOString();
	const record: JobRecord = {
		...emptyRecord(id),
		...facts,
		state: "starting",
		transitions: [{ from: null, to: "starting", at }],
	};
	const checked = checkValue(join(folder, RECORD), record, recordOf);
	if (checked instanceof LimenError) {
		throw checked;
	}
	await atomicWrite(join(folder, RECORD), serialized(checked), { exclusive: true });
}

/** A record with nothing known (z. 10): every fact null, no transition yet. */
export function emptyRecord(id: string): JobRecord {
	return {
		version: RECORD_VERSION,
		id,
		state: "starting",
		transitions: [],
		identity: null,
		label: null,
		branch: null,
		worktree: null,
		base: null,
		role: null,
		repo: null,
		origin: { tab: null, pane: null, session: null },
		group: null,
		team: null,
		parent: null,
		spawner: null,
		spawnedBy: null,
		candidate: null,
		priority: null,
		route: { engine: null, model: null, provider: null, thinking: null },
		extensions: null,
		spawnerPid: null,
		startedAt: null,
		finishedAt: null,
		failure: null,
		sideFailures: [],
		queued: null,
		stopRequested: null,
		advisory: null,
		stopReason: null,
		openChecks: null,
		commits: null,
		versions: null,
	};
}

/** The text of a record as the file holds it; the migration writes its records through this too. */
export function serialized(record: JobRecord): string {
	return `${JSON.stringify(record, null, 2)}\n`;
}

/** `record` checked by the record's validator, as a write to `file` would need it; BAD_DATA when it does not hold. */
export function checkedRecord(file: string, record: JobRecord): JobRecord {
	const checked = checkValue(file, record, recordOf);
	if (checked instanceof LimenError) {
		throw checked;
	}
	return checked;
}

/** The failure `detail` names by today's patterns (D-057 (4)); a detail no pattern knows keeps a null kind (z. 10). */
export function failureFrom(detail: string): Failure {
	return { kind: failureKind(detail), detail, resetAt: null };
}
const FAILURE_PATTERNS: ReadonlyArray<readonly [RegExp, FailureKind]> = [
	[/^timeout after \d+ms\b/, "timeout"],
	[/^tool-call cap reached after \d+ calls\b/, "tool-cap"],
	[/^stalled tool /, "stall"],
	[/^process group gone\b/, "reaped"],
	[/^worker exited with code /, "exit"],
	[/^process group interrupted\b/, "signal"],
];
/**
 * The provider's text when a subscription limit is hit (D-071): "You've hit your session limit · resets <hour> (UTC)"
 * for the 5-hour limit (audit.md, gate 2 §1, Q1), "You've hit your weekly limit · …" for the weekly one, as the
 * seat's quota extension matches it (docs/seat/quota-resume.ts). The reset time stays null even where the text names
 * one: the migration fills in only the kind (D-057 (4)), and finalize will take it from the provider's field, not from
 * this text (R-029).
 */
const SUBSCRIPTION_LIMIT = /hit your (?:[\w-]+ )?limit/i;
function failureKind(detail: string): FailureKind | null {
	const text = detail.trim();
	const known = FAILURE_PATTERNS.find(([pattern]) => pattern.test(text))?.[1];
	if (known) {
		return known;
	}
	// The engine's own stop reasons (`isFailedStopReason`, src/job/finalize.ts): the subscription limit or a 429 with a
	// rate limit is the quota.
	if (/^(?:error|aborted)(?::|$)/.test(text)) {
		return SUBSCRIPTION_LIMIT.test(text) || isRateLimit(text) ? "quota" : "engine-error";
	}
	return null;
}
/** A 429 of the provider's API with its rate-limit error. */
function isRateLimit(text: string): boolean {
	return /\b429\b/.test(text) && /rate_limit_error|rate limit/i.test(text);
}

/** Appends one Limen line to the job's log, which is appended to and never rewritten. */
export async function appendLimenLog(jobDir: string, message: string): Promise<void> {
	await appendFile(`${jobDir}/log`, `[limen ${new Date().toISOString()}] ${message}\n`);
}
/**
 * The trimmed text of a file of Limen's own folders outside the job record, such as a receipt or a claim entry; ""
 * for a file that cannot be read.
 */
export async function textFile(path: string): Promise<string> {
	return readFile(path, "utf8").then(
		(value) => value.trim(),
		() => "",
	);
}

// The validators of the record (src/boundary.ts). They are functions, not values built when the module loads, so that
// the order in which src/boundary.ts and this module load does not matter.

function isoTime(value: unknown, field: string): string {
	return matching(ISO_TIME, "an ISO time")(value, field);
}
function pidOf(value: unknown, field: string): number {
	return numberIn({ integer: true, min: 1, max: MAX_PID })(value, field);
}
function stateOf(value: unknown, field: string): JobState {
	return oneOf(JOB_STATES)(value, field);
}
function transitionOf(value: unknown, field: string): Transition {
	const fields = object(["from", "to", "at"])(value, field);
	return {
		from: nullOr(stateOf)(fields.get("from"), at(field, "from")),
		to: stateOf(fields.get("to"), at(field, "to")),
		at: isoTime(fields.get("at"), at(field, "at")),
	};
}
function identityOf(value: unknown, field: string): Identity {
	const fields = object(["pid", "born", "bootId"])(value, field);
	return {
		pid: nullOr(pidOf)(fields.get("pid"), at(field, "pid")),
		born: nullOr(matching(BORN, "a start time in clock ticks"))(fields.get("born"), at(field, "born")),
		bootId: nullOr(matching(BOOT_ID, "a lower-case UUID"))(fields.get("bootId"), at(field, "bootId")),
	};
}
function originOf(value: unknown, field: string): Origin {
	const fields = object(["tab", "pane", "session"])(value, field);
	return {
		tab: nullOr(string)(fields.get("tab"), at(field, "tab")),
		pane: nullOr(string)(fields.get("pane"), at(field, "pane")),
		session: nullOr(matching(SESSION_ID, "a session ID"))(fields.get("session"), at(field, "session")),
	};
}
function routeOf(value: unknown, field: string): Route {
	const fields = object(["engine", "model", "provider", "thinking"])(value, field);
	return {
		engine: nullOr(string)(fields.get("engine"), at(field, "engine")),
		model: nullOr(string)(fields.get("model"), at(field, "model")),
		provider: nullOr(string)(fields.get("provider"), at(field, "provider")),
		thinking: nullOr(string)(fields.get("thinking"), at(field, "thinking")),
	};
}
function jobFailureOf(value: unknown, field: string): Failure {
	const fields = object(["kind", "detail", "resetAt"])(value, field);
	return {
		kind: nullOr(oneOf(FAILURE_KINDS))(fields.get("kind"), at(field, "kind")),
		detail: string(fields.get("detail"), at(field, "detail")),
		resetAt: nullOr(isoTime)(fields.get("resetAt"), at(field, "resetAt")),
	};
}
function sideFailureOf(value: unknown, field: string): SideFailure {
	const fields = object(["channel", "message", "at"])(value, field);
	return {
		channel: string(fields.get("channel"), at(field, "channel")),
		message: string(fields.get("message"), at(field, "message")),
		at: isoTime(fields.get("at"), at(field, "at")),
	};
}
function queuedOf(value: unknown, field: string): Queued {
	const fields = object(["since", "detail", "ahead"])(value, field);
	return {
		since: isoTime(fields.get("since"), at(field, "since")),
		detail: nullOr(string)(fields.get("detail"), at(field, "detail")),
		ahead: nullOr(numberIn({ integer: true, min: 0 }))(fields.get("ahead"), at(field, "ahead")),
	};
}
function advisoryOf(value: unknown, field: string): Advisory {
	const fields = object(["text", "at"])(value, field);
	return { text: string(fields.get("text"), at(field, "text")), at: isoTime(fields.get("at"), at(field, "at")) };
}
function migratedOf(value: unknown, field: string): { readonly at: string } {
	const fields = object(["at"])(value, field);
	return { at: isoTime(fields.get("at"), at(field, "at")) };
}
function scopeOf(value: unknown, field: string): Scope {
	const fields = object(["unit", "cgroup", "memoryPeakBytes", "cpuMicroseconds", "oomKills"])(value, field);
	const reading = nullOr(numberIn({ integer: true, min: 0 }));
	return {
		unit: matching(SCOPE_UNIT, "the unit of a systemd user scope")(fields.get("unit"), at(field, "unit")),
		cgroup: matching(CGROUP, "a path of the cgroup v2 hierarchy")(fields.get("cgroup"), at(field, "cgroup")),
		memoryPeakBytes: reading(fields.get("memoryPeakBytes"), at(field, "memoryPeakBytes")),
		cpuMicroseconds: reading(fields.get("cpuMicroseconds"), at(field, "cpuMicroseconds")),
		oomKills: reading(fields.get("oomKills"), at(field, "oomKills")),
	};
}

/** Each field of the record with its validator, in the order the file holds them. */
function recordOf(value: unknown, field: string): JobRecord {
	const fields = object(RECORD_FIELDS)(value, field);
	const read = <T>(key: (typeof RECORD_FIELDS)[number], validator: Validator<T>): T =>
		validator(fields.get(key), at(field, key));
	const text = nullOr(string);
	// Fields added after the record's version are optional (`## Stages` → conventions, D-079).
	const scope = fields.has("scope") ? { scope: read("scope", scopeOf) } : {};
	const migrated = fields.has("migrated") ? { migrated: read("migrated", migratedOf) } : {};
	return {
		version: read("version", oneOf([RECORD_VERSION])),
		id: read("id", matching(SESSION_ID, "a job ID")),
		state: read("state", stateOf),
		transitions: read("transitions", arrayOf(transitionOf)),
		identity: read("identity", nullOr(identityOf)),
		label: read("label", text),
		branch: read("branch", text),
		worktree: read("worktree", text),
		base: read("base", text),
		role: read("role", text),
		repo: read("repo", text),
		origin: read("origin", originOf),
		group: read("group", text),
		team: read("team", text),
		parent: read("parent", text),
		spawner: read("spawner", text),
		spawnedBy: read("spawnedBy", text),
		candidate: read("candidate", text),
		priority: read("priority", nullOr(numberIn({ integer: true, min: 1, max: 3 }))),
		route: read("route", routeOf),
		extensions: read("extensions", nullOr(arrayOf(string))),
		spawnerPid: read("spawnerPid", nullOr(pidOf)),
		startedAt: read("startedAt", nullOr(isoTime)),
		finishedAt: read("finishedAt", nullOr(isoTime)),
		failure: read("failure", nullOr(jobFailureOf)),
		sideFailures: read("sideFailures", arrayOf(sideFailureOf)),
		queued: read("queued", nullOr(queuedOf)),
		stopRequested: read("stopRequested", text),
		advisory: read("advisory", nullOr(advisoryOf)),
		stopReason: read("stopReason", text),
		openChecks: read("openChecks", nullOr(arrayOf(string))),
		commits: read("commits", nullOr(arrayOf(string))),
		versions: read("versions", text),
		...scope,
		...migrated,
	};
}
function progressOf(value: unknown, field: string): Progress {
	const fields = object(["activity", "lastTool", "toolCalls"])(value, field);
	return {
		activity: nullOr(string)(fields.get("activity"), at(field, "activity")),
		lastTool: nullOr(string)(fields.get("lastTool"), at(field, "lastTool")),
		toolCalls: nullOr(numberIn({ integer: true, min: 0 }))(fields.get("toolCalls"), at(field, "toolCalls")),
	};
}
