// The job record (S1+, A-019, D-057): the one module, with src/job/migration.ts for older records, that reads, writes
// and lists job records and the job archive, so that every read goes through one validator and every write through
// one lock (T-25 (1), T-27 (2)). A record changes through `transition` until its job finishes, and after that only
// through `writeMarker`, once per marker and once per step of a land, so that what a finished job left stays as it was
// (A-002; R-031, Decision 2; R-103).
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
	isoTime,
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
import { QUOTA_RESUMES } from "./quota.ts";

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
/**
 * The failure kinds of A-016 (1), then the two of D-095: `launch`, an end where the job's engine did not start, and
 * `internal`, an error the job's wrapper itself threw.
 */
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
	"launch",
	"internal",
] as const;
export type FailureKind = (typeof FAILURE_KINDS)[number];

/** The process that runs the job (A-056): written in the transition to `running`; each part null when unknown. */
export type Identity = { readonly pid: number | null; readonly born: string | null; readonly bootId: string | null };
/**
 * Why a failed job failed (A-016 (1)): the kind the code that detected the failure set, the detail, and for `quota` the
 * reset time, null when it was not read. The kind is null only in a record the migration wrote from a text no pattern
 * names (D-057 (4)).
 */
export type Failure = { readonly kind: FailureKind | null; readonly detail: string; readonly resetAt: string | null };
/** A failure as its detector passes it to the job's end: always with its kind; the reset time only for `quota`. */
export type DetectedFailure = {
	readonly kind: FailureKind;
	readonly detail: string;
	readonly resetAt?: string | null;
};
/**
 * A `kendex:rate-limit` event the job's engine received (E-9): the limit's type and its reset time, each null when the
 * event held none, and when it came.
 */
export type RateLimit = { readonly type: string | null; readonly resetAt: string | null; readonly at: string };
/**
 * A Limen hook's refusal of a Pi value of the wrong shape (T-32 (4)): the event, command or tool it came with, the field
 * and the whole message of the guard's BAD_DATA, and when.
 */
export type Refusal = { readonly event: string; readonly field: string; readonly message: string; readonly at: string };
/** A side channel of the terminal transition that failed (T-01), written with the terminal state. */
export type SideFailure = { readonly channel: string; readonly message: string; readonly at: string };
export type Transition = { readonly from: JobState | null; readonly to: JobState; readonly at: string };
/** A job that waits in the seat's start queue: since when, and the wait's reason and place once decided. */
export type Queued = { readonly since: string; readonly detail: string | null; readonly ahead: number | null };
/**
 * A job's wait in the start queue, which stays once `queued` is cleared (A-036, D-072): since when it waited, when it
 * got its diagnosis and what that said, and when it left the queue, each null until then.
 */
export type QueueWait = {
	readonly since: string;
	readonly diagnosedAt: string | null;
	readonly diagnosis: string | null;
	readonly leftAt: string | null;
};
/** Who sets a running job's note: the start queue its diagnosis of a long wait, or the wrapper its stall note. */
export const ADVISORY_SOURCES = ["queue", "stall"] as const;
export type AdvisorySource = (typeof ADVISORY_SOURCES)[number];
/**
 * A note on a running job, when it was set, and its source, by which the wake hook and the seat sweep count who heard
 * it (the D-092 note); a record written before R-036 holds no source, only the wrapper's note (`advisorySource`).
 */
export type Advisory = { readonly text: string; readonly at: string; readonly source?: AdvisorySource };
/** The source of `advisory`: the one it names, else `stall`, the wrapper's note of a record written before R-036. */
export function advisorySource(advisory: Advisory): AdvisorySource {
	return advisory.source ?? "stall";
}
/**
 * A job whose processes the seat sweep could not end (R-032): since its first failed attempt in a row, how many
 * attempts in a row failed, and why the last one did. An attempt that ends them removes it.
 */
export type Stuck = { readonly since: string; readonly attempts: number; readonly detail: string };
/**
 * A wake of a job (its completion, an advisory, a start notice) that the subscription limit kept from a coordinator's
 * turn (A-016 (2), D-097 (5) (h)): since when it is owed, and the reset that the turn's error text named, null when it
 * named none. The job's wakes wait while it is set; the sweep releases it (src/job/quota.ts), and the coordinator's hook
 * delivers them then.
 */
export type OwedWake = { readonly since: string; readonly resetAt: string | null };
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
	/**
	 * The largest CPU rate between two of the wrapper's samples, as an integer percentage of the whole machine (M-09):
	 * null from the transition to running until the wrapper ends the job, so a job another process ends keeps null;
	 * absent in a record written before R-036 (D-079).
	 */
	readonly cpuPeakPercent?: number | null;
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
	/**
	 * The job's wait in the start queue, written at its diagnosis or when it leaves the queue; a job that never queued,
	 * or a record from before R-035, has none.
	 */
	readonly queueWait?: QueueWait;
	/**
	 * The reason of a stop request: `limen stop` writes it before its TERM, so whichever finisher ends the job ends it as
	 * the stop asked; a signal without it is a failure (A-052).
	 */
	readonly stopRequested: string | null;
	readonly advisory: Advisory | null;
	/** The engine's stop reason for its last message. */
	readonly stopReason: string | null;
	/**
	 * History only: the items an older done job's final "Note check" left open. The task note is cut (A-044), so a new
	 * record holds `null`, and the field stays in version 1 so that every older record still reads (R-042 Decision 1).
	 */
	readonly openChecks: readonly string[] | null;
	/** The job's commits on its branch, one `git log --oneline` line each; null when they were not counted. */
	readonly commits: readonly string[] | null;
	/** The versions of the engine and the tools the job started with. */
	readonly versions: string | null;
	/** Set once the wrapper ran in the job's scope; a record from before R-026, or of a job that never ran, has none. */
	readonly scope?: Scope;
	/** Set on a record the migration wrote (D-057 (4)): history only. */
	readonly migrated?: { readonly at: string };
	/** Set once the job's work is on its target (A-002); only `writeMarker` writes it. */
	readonly landed?: Landed;
	/**
	 * The steps of `limen land` after its merge (A-021, R-103): set empty with `landed` in one write by the land's
	 * `merged` step, then `closed` and `cleaned`, each once; only `writeMarker` writes it. A record that `limen ticket
	 * done` or the migration marked, or that a land before R-103 wrote, has `landed` and no `land`.
	 */
	readonly land?: Land;
	/** Set once `limen abandon` saved the job's whole worktree on a branch (A-002); only `writeMarker` writes it. */
	readonly abandoned?: Abandoned;
	/** The last `kendex:rate-limit` event the job's engine received (E-9); a job that met none has none. */
	readonly rateLimit?: RateLimit;
	/** The first refusal of a Limen hook in the job (T-32 (4)), which its end reads; a job with none has none. */
	readonly refusal?: Refusal;
	/** Set while the seat sweep cannot end the job's processes (R-032); only `writeStuck` writes it, in any state. */
	readonly stuck?: Stuck;
	/**
	 * The number of this job's resume after the subscription limit, 1 to 3 (A-016 (5)), set when the sweep resumes its
	 * parent; a job no such resume started has none.
	 */
	readonly quotaAttempt?: number;
	/** Set while a wake of the job is owed (A-016 (2)); only `writeOwedWake` writes it, in any state. */
	readonly owedWake?: OwedWake;
};

/**
 * The marker of a landed job: the commit that holds its work on the target (the merge of `limen land`, the closing
 * commit of `limen ticket done`) and when it landed.
 */
export type Landed = { readonly sha: string; readonly at: string };
/** The marker of an abandoned job: the branch that holds its whole worktree, the branch's commit, and when. */
export type Abandoned = { readonly branch: string; readonly commit: string; readonly at: string };
/**
 * A land's `closed` step: the closing commit of the job's tickets, or null when the land made none (no active ticket,
 * `--keep-open`, or a project root that is no Git repository), and when it was recorded.
 */
export type LandClosed = { readonly sha: string | null; readonly at: string };
/** A land's `cleaned` step: when it was done with the job's branch, its worktree and its Herdr tabs. */
export type LandCleaned = { readonly at: string };
/**
 * The steps of a land after its merge, which `landed` records (R-103): what a land run again needs to go on from the
 * first step not recorded, and nothing more; what each step did goes to the land's output and the job's log.
 */
export type Land = { readonly closed?: LandClosed; readonly cleaned?: LandCleaned };
/**
 * One marker for `writeMarker` to write. `merged`, `closed` and `cleaned` are the steps of a land, in that order:
 * `merged` writes `landed` with an empty `land` in one write, the other two a field of `land` each.
 */
export type Marker =
	| { readonly landed: Landed }
	| { readonly abandoned: Abandoned }
	| { readonly merged: Landed }
	| { readonly closed: LandClosed }
	| { readonly cleaned: LandCleaned };

/** The fields a change may set; the state, the transitions and the markers are the record module's own. */
export type Fields = Partial<
	Omit<JobRecord, "version" | "id" | "state" | "transitions" | "landed" | "land" | "abandoned" | "stuck" | "owedWake">
>;

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
	"queueWait",
	"stopRequested",
	"advisory",
	"stopReason",
	"openChecks",
	"commits",
	"versions",
	"scope",
	"migrated",
	"landed",
	"land",
	"abandoned",
	"rateLimit",
	"refusal",
	"stuck",
	"quotaAttempt",
	"owedWake",
] as const;

/** A full commit SHA, as `git rev-parse` gives it. */
const COMMIT = /^[0-9a-f]{40}$/;
/** A branch name as one word of one line; Git checks the rest of its form when the branch is made. */
const BRANCH = /^\S+$/;
/** The folder of the job archive below `.limen/` (A-002), and the form of the name of each of its month folders. */
const ARCHIVE = "archive";
const MONTH = /^\d{4}-\d{2}$/;
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

/** A job folder of the job archive: the job's id and its folder. */
export type ArchivedJob = { readonly id: string; readonly jobDir: string };

/**
 * The folder of the job archive of the project at `root` that a job marked at the ISO time `at` moves to (A-002):
 * `.limen/archive/<YYYY-MM>/`, the UTC month of `at`, so a retire run again after a crash puts the job in the same place.
 */
export function archiveMonth(root: string, at: string): string {
	return join(root, ".limen", ARCHIVE, at.slice(0, 7));
}

/**
 * The folder of the archive of the project at `root` that prune moves a folder of the worktree root to when Git does
 * not register it and it holds no `.git` (D-097 (4) (d)): `.limen/archive/unregistered/`, whose name is no month, so no
 * reader of the job archive takes what it holds for a job.
 */
export function unregisteredArchive(root: string): string {
	return join(root, ".limen", ARCHIVE, "unregistered");
}

/**
 * Every job folder of the job archive of the project at `root`, by month and then by id; none when the project has no
 * archive. A folder of the archive whose name is no month holds no job. Only a person deletes a month's folder.
 */
export async function archivedJobs(root: string): Promise<ArchivedJob[]> {
	const archive = join(root, ".limen", ARCHIVE);
	const jobs: ArchivedJob[] = [];
	for (const month of (await jobFolderNames(archive)).filter((name) => MONTH.test(name))) {
		for (const id of await jobFolderNames(join(archive, month))) {
			jobs.push({ id, jobDir: join(archive, month, id) });
		}
	}
	return jobs;
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
/**
 * The record in `folder`, whose name is not the job's id, as `readRecord` reads one, with its id checked against `id`:
 * the hidden folder a publication writes its record in before one rename makes it the job's (src/job/publication.ts).
 */
export async function readRecordOf(folder: string, id: string): Promise<JobRecord | undefined> {
	return recordFrom(folder, await guardedText(join(folder, RECORD), RECORD_BYTES), id);
}
function recordFrom(jobDir: string, text: string | undefined, id = basename(jobDir)): JobRecord | undefined {
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
	if (record.id !== id) {
		const expected = id === basename(jobDir) ? `the folder's name ${id}` : `the id ${id} of the folder's job`;
		throw refusedValue(file, { field: "id", expected, got: record.id });
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
/** The largest refusal file of a coordinator's process a read takes; a larger one is damaged data. */
const REFUSAL_BYTES = 64 * 1024;
/**
 * A hook's refusal in the file `path` of a coordinator's process (T-32 (4), R-102), under the record's read rule:
 * undefined when the file is absent; BAD_DATA for a symlink, a file of another kind or size, or a damaged one.
 */
export async function readRefusalFile(path: string): Promise<Refusal | undefined> {
	const text = await guardedText(path, REFUSAL_BYTES);
	if (text === undefined) {
		return undefined;
	}
	const refusal = parseJson(path, text, refusalOf);
	if (refusal instanceof LimenError) {
		throw refusal;
	}
	return refusal;
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

/**
 * The one write after a terminal state (A-002, T-38 (2)): under the job's lock it sets `marker` on the finished record
 * of `jobDir` and returns the record. A marker is written once: when the record holds the same one, with the same commit
 * (and branch), it writes nothing and returns the record as it is, so a caller run again changes nothing; it keeps the
 * first time. A land's steps are written so too, each once and in their order (R-103): `merged` writes `landed` and an
 * empty `land` in one write, then `closed` and `cleaned` each fill their field of `land`; a record with `landed` and no
 * `land`, which an older land, `limen ticket done` or the migration wrote, takes `land` with its first step. A record
 * that is not finished, or a folder without one, refuses with MARKER_NOT_FINISHED, a marker or step of the same kind
 * with another commit with MARKER_DIFFERS, and a step before the one it follows with MARKER_OUT_OF_ORDER: Limen's
 * callers check all three first, so each is a fault.
 */
export async function writeMarker(jobDir: string, marker: Marker): Promise<JobRecord> {
	if (!existsSync(join(jobDir, RECORD))) {
		throw markerRefusal("MARKER_NOT_FINISHED", `job ${basename(jobDir)} has no record in ${jobDir}`);
	}
	return withLock({ folder: jobDir }, async () => {
		const current = await readRecord(jobDir);
		if (!(current && isTerminal(current.state))) {
			const state = current?.state ?? "without a record";
			throw markerRefusal(
				"MARKER_NOT_FINISHED",
				`job ${basename(jobDir)} is ${state}; only a finished job takes a marker`,
			);
		}
		const changed = "closed" in marker || "cleaned" in marker ? landStep(current, marker) : marked(current, marker);
		if (changed === undefined) {
			return current;
		}
		const next = checkedRecord(join(jobDir, RECORD), changed);
		await atomicWrite(join(jobDir, RECORD), serialized(next));
		return next;
	});
}
/**
 * The record a marker, or a land's `merged` step, makes of `current`, or undefined when `current` holds the same one
 * already; MARKER_DIFFERS when it holds one of that kind with another commit (and branch).
 */
function marked(
	current: JobRecord,
	marker: Exclude<Marker, { readonly closed: LandClosed } | { readonly cleaned: LandCleaned }>,
): JobRecord | undefined {
	if ("abandoned" in marker) {
		return current.abandoned === undefined
			? { ...current, abandoned: marker.abandoned }
			: same(current, "abandoned marker", markerKey(current.abandoned), markerKey(marker.abandoned));
	}
	const given = "landed" in marker ? marker.landed : marker.merged;
	if (current.landed !== undefined) {
		return same(current, "landed marker", markerKey(current.landed), markerKey(given));
	}
	return "merged" in marker ? { ...current, landed: given, land: {} } : { ...current, landed: given };
}
/**
 * The record the land step `marker` makes of `current`, or undefined when `current` holds it already: `closed` follows
 * `landed`, and `cleaned` follows `closed` (R-103); a `closed` with another commit is MARKER_DIFFERS.
 */
function landStep(
	current: JobRecord,
	marker: { readonly closed: LandClosed } | { readonly cleaned: LandCleaned },
): JobRecord | undefined {
	const land = current.land ?? {};
	if ("closed" in marker) {
		if (current.landed === undefined) {
			throw outOfOrder(current, "closed", "the landed marker");
		}
		if (land.closed !== undefined) {
			return same(current, "closed step", closedKey(land.closed), closedKey(marker.closed));
		}
		return { ...current, land: { ...land, closed: marker.closed } };
	}
	if (land.closed === undefined) {
		throw outOfOrder(current, "cleaned", "the closed step");
	}
	return land.cleaned === undefined ? { ...current, land: { ...land, cleaned: marker.cleaned } } : undefined;
}
/** Nothing to write when a record holds the marker `kind` with the key it is given; MARKER_DIFFERS when another. */
function same(current: JobRecord, kind: string, held: string, given: string): undefined {
	if (held !== given) {
		throw markerRefusal("MARKER_DIFFERS", `job ${current.id} holds the ${kind} ${held}, not ${given}`);
	}
	return undefined;
}
/** What tells two `closed` steps apart: the closing commit, or that the land made none; never the time. */
function closedKey(closed: LandClosed): string {
	return closed.sha ?? "with no closing commit";
}
/** The fault of a land step written before the step it follows. */
function outOfOrder(current: JobRecord, step: string, before: string): LimenError {
	return markerRefusal(
		"MARKER_OUT_OF_ORDER",
		`job ${current.id} has no ${before}, which comes before the land's ${step} step`,
	);
}
/**
 * The one write of `stuck` (R-032): under the job's lock it sets the field of the record of `jobDir` to what `update`
 * makes of the field as the lock finds it, or removes it when `update` gives undefined, and never changes the state or
 * any other field. A finished record takes it too, since a finished job's scope can outlive its end, so this is no
 * transition (A-019). It writes nothing when the field stays as it was, or when the folder holds no record; it returns
 * the record as it is after the call.
 */
export async function writeStuck(
	jobDir: string,
	update: (stuck: Stuck | undefined) => Stuck | undefined,
): Promise<JobRecord | undefined> {
	return writeAnyState(jobDir, (current) => {
		const stuck = update(current.stuck);
		if (JSON.stringify(stuck) === JSON.stringify(current.stuck)) {
			return undefined;
		}
		const { stuck: _earlier, ...rest } = current;
		return stuck === undefined ? rest : { ...rest, stuck };
	});
}
/**
 * The one write of `owedWake` (R-034, D-097 (5) (h)), as `writeStuck` writes `stuck`: the coordinator's hook sets it
 * on the record of a job whose wake the subscription limit kept from a turn, and the seat sweep removes it once it is
 * due; neither changes the state or any other field.
 */
export async function writeOwedWake(
	jobDir: string,
	update: (owed: OwedWake | undefined) => OwedWake | undefined,
): Promise<JobRecord | undefined> {
	return writeAnyState(jobDir, (current) => {
		const owedWake = update(current.owedWake);
		if (JSON.stringify(owedWake) === JSON.stringify(current.owedWake)) {
			return undefined;
		}
		const { owedWake: _earlier, ...rest } = current;
		return owedWake === undefined ? rest : { ...rest, owedWake };
	});
}
/**
 * A write of a field that every state takes, with no transition (A-019): under the job's lock, `change` gives the
 * record that the record as the lock finds it becomes, or undefined when it stays as it is; nothing is written for a
 * folder without a record. Returns the record as it is after the call.
 */
async function writeAnyState(
	jobDir: string,
	change: (current: JobRecord) => JobRecord | undefined,
): Promise<JobRecord | undefined> {
	if (!existsSync(join(jobDir, RECORD))) {
		return undefined;
	}
	return withLock({ folder: jobDir }, async () => {
		const current = await readRecord(jobDir);
		if (current === undefined) {
			return undefined;
		}
		const changed = change(current);
		if (changed === undefined) {
			return current;
		}
		const next = checkedRecord(join(jobDir, RECORD), changed);
		await atomicWrite(join(jobDir, RECORD), serialized(next));
		return next;
	});
}

/** The attempt in a row from which a job the sweep cannot end is escalated, as T-02 has a timer ring after several. */
export const STUCK_ESCALATION = 3;

/**
 * The `stuck` of `record` once it is escalated, from the third failed attempt in a row (R-032): the alerts send it and
 * `limen status` names it; undefined before then, and for a record the sweep has not failed on.
 */
export function escalatedStuck(record: JobRecord): Stuck | undefined {
	return record.stuck !== undefined && record.stuck.attempts >= STUCK_ESCALATION ? record.stuck : undefined;
}

/** What tells two markers of one kind apart: the commit, and the branch of an abandoned job; never the time. */
function markerKey(marker: Landed | Abandoned): string {
	return "sha" in marker ? marker.sha : `${marker.branch} at ${marker.commit}`;
}
function markerRefusal(
	code: "MARKER_NOT_FINISHED" | "MARKER_DIFFERS" | "MARKER_OUT_OF_ORDER",
	message: string,
): LimenError {
	return new LimenError({ class: "internal", code, message, next: null });
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

/**
 * The first record of a job (state `starting`), which publication writes once into its hidden folder `folder`, with
 * `quotaAttempt` when the job is a resume after the subscription limit.
 */
export async function publishRecord(
	folder: string,
	id: string,
	facts: Facts & Pick<JobRecord, "quotaAttempt">,
): Promise<void> {
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

/**
 * The wait of `record` in the start queue: its `queueWait`, or the one its `queued` began when no reader has written
 * it yet; undefined for a job that did not queue.
 */
export function waitOf(record: JobRecord): QueueWait | undefined {
	return (
		record.queueWait ??
		(record.queued ? { since: record.queued.since, diagnosedAt: null, diagnosis: null, leftAt: null } : undefined)
	);
}
/**
 * The fields that take a job out of the start queue at the ISO time `at`: no `queued`, and its wait kept with the time
 * it left, so that it outlives `queued` (A-036, D-072). Every writer that clears `queued` sets them: the queue when the
 * job starts, is stopped or fails there, and any finisher.
 */
export function queueLeft(record: JobRecord, at: string): { readonly queued: null; readonly queueWait?: QueueWait } {
	const wait = waitOf(record);
	if (wait === undefined) {
		return { queued: null };
	}
	return { queued: null, queueWait: wait.leftAt === null ? { ...wait, leftAt: at } : wait };
}

/**
 * The failure the detail of an older record names, for the migration alone (D-057 (4)): each end that Limen writes now
 * gets its kind from its detector (A-016 (1)). A detail no pattern knows keeps a null kind (z. 10).
 */
export function failureFrom(detail: string): Failure {
	return { kind: failureKind(detail), detail, resetAt: null };
}
const FAILURE_PATTERNS: ReadonlyArray<readonly [RegExp, FailureKind]> = [
	[/^timeout after \d+ms\b/, "timeout"],
	[/^tool-call cap reached after \d+ calls\b/, "tool-cap"],
	[/^stalled tool /, "stall"],
	[/^process group gone\b/, "reaped"],
	[/^worker exited with code /, "exit"],
	// The wrapper's end of a job its engine or its wrapper got a signal for, with no stop request (A-052).
	[/^killed by SIG[A-Z0-9]+\b/, "signal"],
	// The detail an older wrapper wrote with `stopped` for an end by a signal, kept for records that hold it (R-028).
	[/^process group interrupted\b/, "signal"],
	// The wrapper's end of a wait in the start queue past the gate file's failAfter (A-036).
	[/^queued for \S+ without a start\b/, "queue"],
];
/**
 * The provider's text when a subscription limit is hit (D-071): "You've hit your session limit · resets <hour> (UTC)"
 * for the 5-hour limit (audit.md, gate 2 §1, Q1), "You've hit your weekly limit · …" for the weekly one; with the 429
 * rule, the one definition of a limit end (`isLimitEnd`).
 */
const SUBSCRIPTION_LIMIT = /hit your (?:[\w-]+ )?limit/i;
function failureKind(detail: string): FailureKind | null {
	const text = detail.trim();
	const known = FAILURE_PATTERNS.find(([pattern]) => pattern.test(text))?.[1];
	if (known) {
		return known;
	}
	// The engine's own stop reasons (`isFailedStopReason`, src/job/finalize.ts), by the rule of their one detector.
	return /^(?:error|aborted)(?::|$)/.test(text) ? engineStopKind(text) : null;
}
/**
 * The kind of a job whose engine stopped on `stopReason`, `error` or `aborted` with the provider's text after it: a
 * subscription limit or a 429 with a rate limit is `quota`, anything else `engine-error`. The wrapper, which detects
 * that end, and the migration's patterns share this one rule (T-25 (1)); a stalled stream of the bridge, which it frames
 * as a retryable overload, stays `engine-error` (R-029, Decision 6).
 */
export function engineStopKind(stopReason: string): "quota" | "engine-error" {
	return isLimitEnd(stopReason) ? "quota" : "engine-error";
}
/**
 * Whether the provider's text `text` says that a limit ended the turn: a subscription limit, or a 429 with a rate
 * limit. The one definition (T-25 (1)) that a job's failure kind and the wake hook's reading of a coordinator's turn
 * that ended on `error` share (D-097 (5) (h)).
 */
export function isLimitEnd(text: string): boolean {
	return SUBSCRIPTION_LIMIT.test(text) || isRateLimit(text);
}
/**
 * A 429 of the provider's API with its rate-limit error: the one rule, which the failure kind and the stop summary of a
 * job's view (src/job/listing.ts) share (T-25 (1)).
 */
export function isRateLimit(text: string): boolean {
	return /\b429\b/.test(text) && /rate_limit_error|rate limit/i.test(text);
}

/**
 * The reset that a limit's text names, as the provider writes it (Q1): `resets 3pm (UTC)`, `resets 3:30pm (UTC)` or
 * `resets Nov 26, 5pm (Europe/Warsaw)`, the zone in brackets.
 */
const RESET = /\bresets\s+(?:([A-Z][a-z]{2})\s+(\d{1,2}),\s+)?(\d{1,2})(?::(\d{2}))?\s*(am|pm)\s*\(([^)]+)\)/i;
const MONTHS = ["jan", "feb", "mar", "apr", "may", "jun", "jul", "aug", "sep", "oct", "nov", "dec"];
const DAY_MS = 24 * 60 * 60 * 1000;
/** How far before the error a reset with a date may lie before it means that date of the next year. */
const HALF_YEAR_MS = 183 * DAY_MS;

/**
 * The reset time, as an ISO time, that the provider's limit text `text` names (A-016 (1), E-9), read at the epoch time
 * `said` the error came: a reset hour with no date is the first such hour after `said`, the 5-hour window's one
 * reading; a reset with a month and a day is that time, in the year that puts it nearest to `said`. A text with no
 * reset, or whose reset names no zone or a zone the clock does not know, gives null, so no zone is guessed (z. 10) and
 * R-059's usage reading takes over (A-016 (4)).
 */
export function limitReset(text: string, said: number): string | null {
	const found = RESET.exec(text);
	const zone = found?.[6]?.trim();
	if (!(found && zone && knownZone(zone))) {
		return null;
	}
	const [, month, day, hourText, minuteText, half] = found;
	const hour = (Number(hourText) % 12) + (half?.toLowerCase() === "pm" ? 12 : 0);
	const minute = Number(minuteText ?? 0);
	const local = new Date(said + zoneOffset(said, zone));
	const [year, today] = [local.getUTCFullYear(), local.getUTCDate()];
	if (month === undefined) {
		const moment = instant({ year, month: local.getUTCMonth(), day: today, hour, minute }, zone);
		const next =
			moment > said ? moment : instant({ year, month: local.getUTCMonth(), day: today + 1, hour, minute }, zone);
		return new Date(next).toISOString();
	}
	const index = MONTHS.indexOf(month.toLowerCase());
	if (index < 0) {
		return null;
	}
	const moment = instant({ year, month: index, day: Number(day), hour, minute }, zone);
	const nearest =
		moment < said - HALF_YEAR_MS
			? instant({ year: year + 1, month: index, day: Number(day), hour, minute }, zone)
			: moment;
	return new Date(nearest).toISOString();
}
/** Whether the clock knows the time zone `zone`; Intl refuses an unknown one with a RangeError. */
function knownZone(zone: string): boolean {
	try {
		new Intl.DateTimeFormat("en-US", { timeZone: zone });
		return true;
	} catch (error) {
		if (error instanceof RangeError) {
			return false;
		}
		throw error;
	}
}
/** The offset of the time zone `zone` from UTC at the epoch time `at`, in milliseconds. */
function zoneOffset(at: number, zone: string): number {
	const format = new Intl.DateTimeFormat("en-US", {
		timeZone: zone,
		hourCycle: "h23",
		year: "numeric",
		month: "numeric",
		day: "numeric",
		hour: "numeric",
		minute: "numeric",
		second: "numeric",
	});
	const parts = new Map(format.formatToParts(at).map((part) => [part.type, Number(part.value)]));
	const part = (name: Intl.DateTimeFormatPartTypes) => parts.get(name) ?? 0;
	const wall = Date.UTC(part("year"), part("month") - 1, part("day"), part("hour"), part("minute"), part("second"));
	return wall - Math.floor(at / 1000) * 1000;
}
/** A wall-clock time in a zone; the month counts from 0, and a day past the month's end runs on into the next month. */
type WallClock = {
	readonly year: number;
	readonly month: number;
	readonly day: number;
	readonly hour: number;
	readonly minute: number;
};
/** The epoch time of the wall-clock time `wall` in the time zone `zone`. */
function instant(wall: WallClock, zone: string): number {
	const guess = Date.UTC(wall.year, wall.month, wall.day, wall.hour, wall.minute);
	return guess - zoneOffset(guess - zoneOffset(guess, zone), zone);
}

/** The detail of a job's end that a hook's refusal decides (T-32 (4)): what the guard refused, whole. */
export function refusalDetail(refusal: Refusal): string {
	return `a Limen hook refused ${refusal.message}`;
}

/**
 * Writes a Limen hook's refusal of a Pi value into the record of the running job `jobDir` and the job's log (T-32
 * (4)); the first refusal stays, since the job's end reads the first cause (A-019).
 */
export async function recordRefusal(jobDir: string, refusal: Refusal): Promise<void> {
	await transition(jobDir, { from: ["running"], set: (record) => (record.refusal ? {} : { refusal }) });
	await appendLimenLog(jobDir, refusalDetail(refusal));
}

/**
 * Writes a `kendex:rate-limit` event the engine of the running job `jobDir` received into its record and the line
 * `rate-limit event: <type>, resets <ISO time>` into its log, which seat step 3.4 reads (E-9); a later event replaces an
 * earlier one, so the record holds the one nearest the limit's end.
 */
export async function recordRateLimit(jobDir: string, rateLimit: RateLimit): Promise<void> {
	await transition(jobDir, { from: ["running"], set: { rateLimit } });
	await appendLimenLog(
		jobDir,
		`rate-limit event: ${rateLimit.type ?? "unknown"}, resets ${rateLimit.resetAt ?? "unknown"}`,
	);
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
function queueWaitOf(value: unknown, field: string): QueueWait {
	const fields = object(["since", "diagnosedAt", "diagnosis", "leftAt"])(value, field);
	return {
		since: isoTime(fields.get("since"), at(field, "since")),
		diagnosedAt: nullOr(isoTime)(fields.get("diagnosedAt"), at(field, "diagnosedAt")),
		diagnosis: nullOr(string)(fields.get("diagnosis"), at(field, "diagnosis")),
		leftAt: nullOr(isoTime)(fields.get("leftAt"), at(field, "leftAt")),
	};
}
function advisoryOf(value: unknown, field: string): Advisory {
	const fields = object(["text", "at", "source"])(value, field);
	// The source came with R-036, so an advisory written before it reads without one (D-079).
	const source = fields.has("source")
		? { source: oneOf(ADVISORY_SOURCES)(fields.get("source"), at(field, "source")) }
		: {};
	return {
		text: string(fields.get("text"), at(field, "text")),
		at: isoTime(fields.get("at"), at(field, "at")),
		...source,
	};
}
function migratedOf(value: unknown, field: string): { readonly at: string } {
	const fields = object(["at"])(value, field);
	return { at: isoTime(fields.get("at"), at(field, "at")) };
}
function commitOf(value: unknown, field: string): string {
	return matching(COMMIT, "a full commit SHA")(value, field);
}
function landedOf(value: unknown, field: string): Landed {
	const fields = object(["sha", "at"])(value, field);
	return { sha: commitOf(fields.get("sha"), at(field, "sha")), at: isoTime(fields.get("at"), at(field, "at")) };
}
/** The validator of a land's steps after its merge (R-103): each step optional, a key of no step refused. */
function landOf(value: unknown, field: string): Land {
	const fields = object(["closed", "cleaned"])(value, field);
	const closed = (step: unknown, name: string): LandClosed => {
		const parts = object(["sha", "at"])(step, name);
		return { sha: nullOr(commitOf)(parts.get("sha"), at(name, "sha")), at: isoTime(parts.get("at"), at(name, "at")) };
	};
	const cleaned = (step: unknown, name: string): LandCleaned => {
		const parts = object(["at"])(step, name);
		return { at: isoTime(parts.get("at"), at(name, "at")) };
	};
	return {
		...(fields.has("closed") ? { closed: closed(fields.get("closed"), at(field, "closed")) } : {}),
		...(fields.has("cleaned") ? { cleaned: cleaned(fields.get("cleaned"), at(field, "cleaned")) } : {}),
	};
}
/** The validator of the record's `abandoned` marker (`abandonEvidence` of src/job/migration.ts reads Git's, T-18). */
function abandonedMarker(value: unknown, field: string): Abandoned {
	const fields = object(["branch", "commit", "at"])(value, field);
	return {
		branch: matching(BRANCH, "a branch name")(fields.get("branch"), at(field, "branch")),
		commit: commitOf(fields.get("commit"), at(field, "commit")),
		at: isoTime(fields.get("at"), at(field, "at")),
	};
}
function rateLimitOf(value: unknown, field: string): RateLimit {
	const fields = object(["type", "resetAt", "at"])(value, field);
	return {
		type: nullOr(string)(fields.get("type"), at(field, "type")),
		resetAt: nullOr(isoTime)(fields.get("resetAt"), at(field, "resetAt")),
		at: isoTime(fields.get("at"), at(field, "at")),
	};
}
/** The validator of a hook's refusal, which the record and a coordinator process's refusal file hold (T-32 (4)). */
export function refusalOf(value: unknown, field: string): Refusal {
	const fields = object(["event", "field", "message", "at"])(value, field);
	return {
		event: string(fields.get("event"), at(field, "event")),
		field: string(fields.get("field"), at(field, "field")),
		message: string(fields.get("message"), at(field, "message")),
		at: isoTime(fields.get("at"), at(field, "at")),
	};
}
function owedWakeOf(value: unknown, field: string): OwedWake {
	const fields = object(["since", "resetAt"])(value, field);
	return {
		since: isoTime(fields.get("since"), at(field, "since")),
		resetAt: nullOr(isoTime)(fields.get("resetAt"), at(field, "resetAt")),
	};
}
function stuckOf(value: unknown, field: string): Stuck {
	const fields = object(["since", "attempts", "detail"])(value, field);
	return {
		since: isoTime(fields.get("since"), at(field, "since")),
		attempts: numberIn({ integer: true, min: 1 })(fields.get("attempts"), at(field, "attempts")),
		detail: string(fields.get("detail"), at(field, "detail")),
	};
}
function scopeOf(value: unknown, field: string): Scope {
	const keys = ["unit", "cgroup", "memoryPeakBytes", "cpuMicroseconds", "oomKills", "cpuPeakPercent"];
	const fields = object(keys)(value, field);
	const reading = nullOr(numberIn({ integer: true, min: 0 }));
	// The peak came with R-036, so a scope written before it reads without one (D-079).
	const share = nullOr(numberIn({ integer: true, min: 0, max: 100 }));
	const peak = fields.has("cpuPeakPercent")
		? { cpuPeakPercent: share(fields.get("cpuPeakPercent"), at(field, "cpuPeakPercent")) }
		: {};
	return {
		unit: matching(SCOPE_UNIT, "the unit of a systemd user scope")(fields.get("unit"), at(field, "unit")),
		cgroup: matching(CGROUP, "a path of the cgroup v2 hierarchy")(fields.get("cgroup"), at(field, "cgroup")),
		memoryPeakBytes: reading(fields.get("memoryPeakBytes"), at(field, "memoryPeakBytes")),
		cpuMicroseconds: reading(fields.get("cpuMicroseconds"), at(field, "cpuMicroseconds")),
		oomKills: reading(fields.get("oomKills"), at(field, "oomKills")),
		...peak,
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
	const queueWait = fields.has("queueWait") ? { queueWait: read("queueWait", queueWaitOf) } : {};
	const migrated = fields.has("migrated") ? { migrated: read("migrated", migratedOf) } : {};
	const landed = fields.has("landed") ? { landed: read("landed", landedOf) } : {};
	const land = fields.has("land") ? { land: read("land", landOf) } : {};
	const abandoned = fields.has("abandoned") ? { abandoned: read("abandoned", abandonedMarker) } : {};
	const rateLimit = fields.has("rateLimit") ? { rateLimit: read("rateLimit", rateLimitOf) } : {};
	const refusal = fields.has("refusal") ? { refusal: read("refusal", refusalOf) } : {};
	const stuck = fields.has("stuck") ? { stuck: read("stuck", stuckOf) } : {};
	const attempt = numberIn({ integer: true, min: 1, max: QUOTA_RESUMES });
	const quotaAttempt = fields.has("quotaAttempt") ? { quotaAttempt: read("quotaAttempt", attempt) } : {};
	const owedWake = fields.has("owedWake") ? { owedWake: read("owedWake", owedWakeOf) } : {};
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
		...queueWait,
		...migrated,
		...landed,
		...land,
		...abandoned,
		...rateLimit,
		...refusal,
		...stuck,
		...quotaAttempt,
		...owedWake,
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
