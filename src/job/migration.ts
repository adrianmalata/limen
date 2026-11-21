// The migration of a project's job folders from the record of plain one-value files to `record.json` (S1+, D-057).
// This module and src/job/record.ts are the only code that names the files of the older record. Each folder with a
// known state becomes a record that holds every value of its files, marked `migrated` (history only); the files it
// moved go, and so do the files of removed features that nothing reads; the content files and the receipt folders
// stay. A value its field cannot hold keeps its file, so nothing is lost (T-28 (3), z. 29). A folder without a known
// state moves unchanged to `.limen/unmigrated/<id>/`. The migration refuses while a job runs or starts, and a second
// run finds nothing to do. `--dry-run` plans the same steps and writes nothing.
import { existsSync, type Stats } from "node:fs";
import { mkdir, readFile, rm, stat } from "node:fs/promises";
import { join } from "node:path";
import { atomicRename, atomicWrite } from "../atomic-write.ts";
import { arrayOf, nullOr, numberIn, object, parseJson, string } from "../boundary.ts";
import { LimenError } from "../outcome.ts";
import { platform } from "../platform/platform.ts";
import { liveJob, STARTUP_GRACE_MS, startingJob } from "../runtime/reap.ts";
import { hexEndOf, tokenOf } from "./id.ts";
import { SESSION_ID } from "./job.ts";
import {
	checkedRecord,
	emptyRecord,
	type Facts,
	type Fields,
	failureFrom,
	JOB_STATES,
	type JobRecord,
	type JobState,
	jobFolderNames,
	type Progress,
	progressPath,
	type Queued,
	readRecord,
	recordPath,
	serialized,
} from "./record.ts";

/** The one-value files whose values the record holds, and the progress files that `progress.json` holds. */
const MOVED = [
	"state",
	"pid",
	"born",
	"group-owner.json",
	"starting",
	"started-at",
	"finished-at",
	"label",
	"branch",
	"worktree",
	"base",
	"role",
	"repo",
	"candidate",
	"parent",
	"group",
	"team",
	"origin-tab",
	"origin-pane",
	"origin-session",
	"spawner",
	"spawned-by",
	"priority",
	"engine",
	"model",
	"extensions.json",
	"queued",
	"stop-requested",
	"advisory",
	"stop-reason",
	"open-checks",
	"commits",
	"versions",
	"tool-calls",
	"last-tool",
	"activity",
] as const;
type Moved = (typeof MOVED)[number];
/** Files of removed features that nothing reads (D-057 (3), (7.4)): the unread deadline and tip, and R-005's hosted jobs. */
const REMOVED_FEATURES = [
	"deadline",
	"tip",
	"hosted",
	"agent-name",
	"engine-binding",
	"ownership-uncertainty",
	"herdr/agent",
];
const OLD_STATES: readonly string[] = ["running", "done", "failed", "stopped"];
const CLOCK_TICKS = /^\d{1,20}$/;
const ISO_TIME = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z$/;

/** What the migration did, or would do, to one job folder. */
export type FolderStep =
	| {
			readonly id: string;
			readonly kind: "migrate";
			readonly state: JobState;
			/** What the migration found missing or kept, for the report. */
			readonly notes: readonly string[];
			readonly removed: readonly string[];
	  }
	| { readonly id: string; readonly kind: "finish"; readonly removed: readonly string[] }
	| { readonly id: string; readonly kind: "current" }
	| { readonly id: string; readonly kind: "move"; readonly reason: string };

/** The whole report: every folder's step, the older id formats and the token collisions (T-20 (6)). */
export type MigrationReport = {
	readonly jobsRoot: string;
	readonly dryRun: boolean;
	readonly steps: readonly FolderStep[];
	readonly olderIds: readonly string[];
	readonly collisions: ReadonlyArray<{ readonly token: string; readonly ids: readonly string[] }>;
};

/** The refusal while a job of the project runs or starts (D-057 (7.6)): exit 4, and the plan again once it ended. */
function jobsRunning(ids: readonly string[]): LimenError {
	return new LimenError({
		class: "environment",
		code: "MIGRATE_JOBS_RUNNING",
		message: `jobs still running or starting: ${ids.join(", ")}; the migration moves no record under a live job, so run it again once they have ended`,
		next: "limen migrate --dry-run",
	});
}

/** Migrates the job folders of the project at `root`, or with `dryRun` only plans it; returns the report. */
export async function migrateProject(root: string, dryRun: boolean): Promise<MigrationReport> {
	const jobsRoot = join(root, ".limen", "jobs");
	const ids = await jobFolderNames(jobsRoot);
	const running: string[] = [];
	for (const id of ids) {
		if (await folderLive(join(jobsRoot, id))) {
			running.push(id);
		}
	}
	if (running.length) {
		throw jobsRunning(running);
	}
	const steps: FolderStep[] = [];
	for (const id of ids) {
		steps.push(await migrateFolder(root, id, dryRun));
	}
	// The folders after the moves, each listed once: one this run moved is now only below `.limen/unmigrated/`.
	const known = [...(await jobFolderNames(jobsRoot)), ...(await jobFolderNames(join(root, ".limen", "unmigrated")))];
	return { jobsRoot, dryRun, steps, ...tokenReport(known) };
}

/** Whether the folder's job runs or starts now: by its record, or by the files of the older record. */
export async function folderLive(jobDir: string): Promise<boolean> {
	if (existsSync(recordPath(jobDir))) {
		const record = await readRecord(jobDir);
		return (await liveJob(record)) || startingJob(record);
	}
	return oldJobLive(jobDir);
}

/**
 * Whether the older record's job runs or starts, as the Limen that wrote it decided: a running state whose pid lives
 * with its recorded start time (a start time it did not record counts as alive), or without a pid inside the startup
 * grace; no state while the spawner named in `starting` lives. The deployment's gate (seat/deploy.ts) asks this of a
 * project the migration has not reached yet.
 */
export async function oldJobLive(jobDir: string, now = Date.now()): Promise<boolean> {
	const files = await oldFiles(jobDir);
	const state = files.get("state") ?? "";
	if (!state) {
		const spawner = Number(files.get("starting"));
		return Number.isSafeInteger(spawner) && spawner > 0 && platform.processAlive(spawner);
	}
	if (state !== "running") {
		return false;
	}
	const pid = Number(files.get("pid"));
	if (!(Number.isSafeInteger(pid) && pid > 0)) {
		const started = Date.parse(files.get("started-at") ?? "");
		return Number.isFinite(started) && now - started < STARTUP_GRACE_MS;
	}
	if (!platform.processAlive(pid)) {
		return false;
	}
	const born = files.get("born") ?? "";
	const info = await platform.processInfo(pid);
	return !born || info.kind === "unavailable" || (info.kind === "present" && info.process.born === born);
}

/** The label the older record holds; for the deployment's gate, which names the jobs it waits for. */
export async function oldLabel(jobDir: string): Promise<string> {
	return (await oldFiles(jobDir)).get("label") ?? "";
}

/** The trimmed text of each file of the older record the folder holds, by name. */
async function oldFiles(jobDir: string): Promise<Map<Moved, string>> {
	const files = new Map<Moved, string>();
	for (const name of MOVED) {
		const text = await readFile(join(jobDir, name), "utf8").catch(whenAbsent(undefined));
		if (text !== undefined) {
			files.set(name, text.trim());
		}
	}
	return files;
}

/** A catch that gives `value` for an absent file (`ENOENT`) and rethrows any other error (T-01). */
function whenAbsent<T>(value: T): (error: unknown) => T {
	return (error) => {
		if (typeof error === "object" && error !== null && "code" in error && error.code === "ENOENT") {
			return value;
		}
		throw error;
	};
}

async function migrateFolder(root: string, id: string, dryRun: boolean): Promise<FolderStep> {
	const jobDir = join(root, ".limen", "jobs", id);
	if (existsSync(recordPath(jobDir))) {
		return finishFolder(jobDir, id, dryRun);
	}
	const files = await oldFiles(jobDir);
	const state = files.get("state") ?? "";
	if (!OLD_STATES.includes(state)) {
		const reason = state ? `unknown state ${JSON.stringify(state.slice(0, 40))}` : "no state";
		if (!dryRun) {
			await mkdir(join(root, ".limen", "unmigrated"), { recursive: true });
			await atomicRename(jobDir, join(root, ".limen", "unmigrated", id));
		}
		return { id, kind: "move", reason };
	}
	const built = await migratedRecord(jobDir, id, files);
	const removed = [...built.moved, ...(await present(jobDir, REMOVED_FEATURES))];
	if (!dryRun) {
		await atomicWrite(recordPath(jobDir), serialized(built.record), { exclusive: true });
		await writeOldProgress(jobDir, built.progress);
		await removeFiles(jobDir, removed);
	}
	const notes = [
		...["task.md", "log"].filter((name) => !existsSync(join(jobDir, name))).map((name) => `no ${name}`),
		...built.kept,
	];
	return { id, kind: "migrate", state: built.record.state, notes, removed };
}

/**
 * A folder that already holds a record: one the migration wrote and could not finish (its files of the older record
 * are still there, and the record holds their values) gets the progress file it lacks and loses them now; any other
 * record is current.
 */
async function finishFolder(jobDir: string, id: string, dryRun: boolean): Promise<FolderStep> {
	const record = await readRecord(jobDir);
	if (!record?.migrated) {
		return { id, kind: "current" };
	}
	const files = await oldFiles(jobDir);
	const { kept, progress } = await migratedRecord(jobDir, id, files);
	const left = [...files.keys()].filter((name) => !kept.some((note) => note.startsWith(`kept ${name}:`)));
	const removed = [...left, ...(await present(jobDir, REMOVED_FEATURES))];
	if (!removed.length) {
		return { id, kind: "current" };
	}
	if (!dryRun) {
		if (!existsSync(progressPath(jobDir))) {
			await writeOldProgress(jobDir, progress);
		}
		await removeFiles(jobDir, removed);
	}
	return { id, kind: "finish", removed };
}

/** Writes the progress file of a migrated folder, once, when its older files held a progress value. */
async function writeOldProgress(jobDir: string, progress: Progress | undefined): Promise<void> {
	if (progress) {
		await atomicWrite(progressPath(jobDir), `${JSON.stringify(progress)}\n`, { exclusive: true });
	}
}

async function present(jobDir: string, names: readonly string[]): Promise<string[]> {
	return names.filter((name) => existsSync(join(jobDir, name)));
}
async function removeFiles(jobDir: string, names: readonly string[]): Promise<void> {
	for (const name of names) {
		await rm(join(jobDir, name), { force: true });
	}
}

/** The record of an older folder, its progress file, the files it moved, and each file it keeps with the reason. */
type Built = {
	readonly record: JobRecord;
	readonly progress: Progress | undefined;
	readonly moved: readonly string[];
	readonly kept: readonly string[];
};

/**
 * The values of an older folder's files: each one its field takes, or null. A file whose text its field cannot hold
 * stays where it is, named with the reason, so the migration loses nothing.
 */
class OldValues {
	readonly kept: string[] = [];
	readonly unread = new Set<Moved>();
	readonly files: ReadonlyMap<Moved, string>;
	constructor(files: ReadonlyMap<Moved, string>) {
		this.files = files;
	}
	/** The value `read` makes of the file's text; null for a missing or empty file, or one `read` does not take. */
	field<T>(name: Moved, read: (text: string) => T | undefined, why: string): T | null {
		const text = this.files.get(name);
		if (text === undefined || text === "") {
			return null;
		}
		const value = read(text);
		if (value === undefined) {
			this.unread.add(name);
			this.kept.push(`kept ${name}: ${why}`);
			return null;
		}
		return value;
	}
	/** The file's text, or null when it is missing or empty. */
	text(name: Moved): string | null {
		return this.field(name, (value) => value, "");
	}
	/** Keeps the file with the reason `why` when it holds text that no field of the record takes. */
	keep(name: Moved, why: string): void {
		if (this.files.get(name)) {
			this.unread.add(name);
			this.kept.push(`kept ${name}: ${why}`);
		}
	}
}

async function migratedRecord(jobDir: string, id: string, files: ReadonlyMap<Moved, string>): Promise<Built> {
	const values = new OldValues(files);
	const state = JOB_STATES.find((one) => one === files.get("state")) ?? "running";
	const terminal = state !== "running";
	const startedAt = values.field("started-at", isoTime, "not an ISO time");
	const finishedAt =
		values.field("finished-at", isoTime, "not an ISO time") ?? (terminal ? await modifiedAt(jobDir, "state") : null);
	const record = checkedRecord(recordPath(jobDir), {
		...emptyRecord(id),
		...factsOf(values),
		state,
		// Only `started-at` and `finished-at` say when a state began (D-057 (4)); the state before is not known.
		transitions: [
			...(startedAt ? [{ from: null, to: "starting" as const, at: startedAt }] : []),
			...(terminal && finishedAt ? [{ from: null, to: state, at: finishedAt }] : []),
		],
		identity: identityOf(values),
		startedAt,
		finishedAt,
		failure: state === "failed" ? await oldFailure(jobDir, files.get("stop-reason") ?? "") : null,
		...(await runValues(jobDir, values)),
		migrated: { at: new Date().toISOString() },
	});
	const toolCalls = values.field(
		"tool-calls",
		(text) => (/^\d+$/.test(text) ? Number(text) : undefined),
		"not a count",
	);
	// Each progress value that exists, the rest null: an older wrapper wrote `activity` before the first `tool-calls`.
	const activity = files.get("activity") ?? null;
	const lastTool = files.get("last-tool") ?? null;
	const progress =
		activity === null && lastTool === null && toolCalls === null ? undefined : { activity, lastTool, toolCalls };
	const moved = [...files.keys()].filter((name) => !values.unread.has(name));
	return { record, progress, moved, kept: values.kept };
}

/** The facts publication wrote (D-057 (7.4)), from their files; the provider and the reasoning level had none. */
function factsOf(values: OldValues): Omit<Facts, "spawnerPid" | "startedAt"> & Pick<Facts, "spawnerPid"> {
	return {
		label: values.text("label"),
		branch: values.text("branch"),
		worktree: values.text("worktree"),
		base: values.text("base"),
		role: values.text("role"),
		repo: values.text("repo"),
		origin: {
			tab: values.text("origin-tab"),
			pane: values.text("origin-pane"),
			session: values.field("origin-session", (text) => (SESSION_ID.test(text) ? text : undefined), "not a session ID"),
		},
		group: values.text("group"),
		team: values.text("team"),
		parent: values.text("parent"),
		spawner: values.text("spawner"),
		spawnedBy: values.text("spawned-by"),
		candidate: values.text("candidate"),
		priority: values.field("priority", (text) => [1, 2, 3].find((one) => String(one) === text), "not 1, 2 or 3"),
		route: { engine: values.text("engine"), model: values.text("model"), provider: null, thinking: null },
		extensions: values.field("extensions.json", jsonOf(arrayOf(string)), "not a JSON array of paths"),
		spawnerPid: values.field("starting", pidOf, "not a pid"),
	};
}

/** The values the run left: the queue, the stop request, the advisory with its time, the end's facts. */
async function runValues(jobDir: string, values: OldValues): Promise<Fields> {
	const advisory = values.text("advisory");
	return {
		queued: values.field("queued", queuedOf, "not the JSON of a queued job"),
		stopRequested: values.text("stop-requested"),
		advisory: advisory
			? { text: advisory, at: (await modifiedAt(jobDir, "advisory")) ?? new Date().toISOString() }
			: null,
		stopReason: values.text("stop-reason"),
		openChecks: values.field("open-checks", lines, ""),
		commits: values.files.has("commits") ? lines(values.files.get("commits") ?? "") : null,
		versions: values.text("versions"),
	};
}

/**
 * The identity of the older record: its `pid` and `born`, else the group owner's. A `born` stays in its file, as any
 * value its field cannot hold, when it is not in clock ticks, and when the folder has no usable pid: the group owner's
 * identity has a start time of its own, so no identity takes the folder's (before R-021, `finalizeJob` removed `pid`
 * before `born`, so a finished folder can hold such a `born`).
 */
function identityOf(values: OldValues): JobRecord["identity"] {
	const pid = values.field("pid", pidOf, "not a pid");
	const owner = values.field("group-owner.json", jsonOf(ownerOf), "not the JSON of a group owner");
	if (pid === null) {
		values.keep("born", "no usable pid");
		return owner ? { pid: owner.pid, born: CLOCK_TICKS.test(owner.born) ? owner.born : null, bootId: null } : null;
	}
	const born = values.field("born", (text) => (CLOCK_TICKS.test(text) ? text : undefined), "not in clock ticks");
	return { pid, born, bootId: null };
}

/** The failure of a failed job by today's patterns: its last `failed:` log line, else its engine's stop reason. */
async function oldFailure(jobDir: string, stopReason: string): Promise<JobRecord["failure"]> {
	const log = await readFile(join(jobDir, "log"), "utf8").catch(whenAbsent(""));
	const line = log.split("\n").findLast((entry) => /^\[limen [^\]]*\] failed: /.test(entry));
	const detail = line ? line.replace(/^\[limen [^\]]*\] failed: /, "") : stopReason;
	return detail ? failureFrom(detail) : null;
}

/** When the file was last written, as an ISO time; null when it is missing. */
async function modifiedAt(jobDir: string, name: string): Promise<string | null> {
	const info: Stats | undefined = await stat(join(jobDir, name)).catch(whenAbsent(undefined));
	return info ? new Date(info.mtimeMs).toISOString() : null;
}

function isoTime(value: string): string | undefined {
	return ISO_TIME.test(value) ? value : undefined;
}
function pidOf(value: string): number | undefined {
	const pid = Number(value);
	return /^\d+$/.test(value) && Number.isSafeInteger(pid) && pid > 0 ? pid : undefined;
}
function lines(value: string): string[] {
	return value.split("\n").filter((line) => line.trim() !== "");
}
/** A reader of a JSON file of the older record through `validator`; undefined for text it does not take. */
function jsonOf<T>(validator: (value: unknown, field: string) => T): (text: string) => T | undefined {
	return (text) => {
		const read = parseJson("old record", text, validator);
		return read instanceof LimenError ? undefined : read;
	};
}
function ownerOf(value: unknown, field: string): { readonly pid: number; readonly born: string } {
	const fields = object(["pid", "born"])(value, field);
	return {
		pid: numberIn({ integer: true, min: 1 })(fields.get("pid"), `${field}.pid`),
		born: string(fields.get("born"), `${field}.born`),
	};
}
function queuedOf(text: string): Queued | undefined {
	const read = jsonOf((value, field) => {
		const fields = object(["since", "detail", "ahead"])(value, field);
		return {
			since: string(fields.get("since"), "since"),
			detail: nullOr(string)(fields.get("detail") ?? null, "detail"),
			ahead: nullOr(numberIn({ integer: true, min: 0 }))(fields.get("ahead") ?? null, "ahead"),
		};
	})(text);
	return read && ISO_TIME.test(read.since) ? read : undefined;
}

/** The ids of an older format and the tokens two ids share (T-20 (6)): their jobs take only the full id. */
function tokenReport(ids: readonly string[]): Pick<MigrationReport, "olderIds" | "collisions"> {
	const olderIds = ids.filter((id) => tokenOf(id) === undefined);
	const byToken = Map.groupBy(
		ids.flatMap((id) => {
			const token = hexEndOf(id);
			return token ? [{ id, token }] : [];
		}),
		(entry) => entry.token,
	);
	const collisions = [...byToken]
		.filter(([, entries]) => entries.length > 1)
		.map(([token, entries]) => ({ token, ids: entries.map((entry) => entry.id) }));
	return { olderIds, collisions };
}

/** The report as lines for the owner: each folder, each removed file, each older id and each token collision. */
export function reportLines(report: MigrationReport): string[] {
	const lines = [`limen migrate${report.dryRun ? " --dry-run (nothing written)" : ""}: ${report.jobsRoot}`];
	const would = report.dryRun ? "would " : "";
	for (const step of report.steps) {
		lines.push(stepLine(step, would));
		if ((step.kind === "migrate" || step.kind === "finish") && step.removed.length) {
			lines.push(`  ${would}remove ${step.removed.join(", ")}`);
		}
	}
	for (const id of report.olderIds) {
		lines.push(`older id ${id}: only its full id names it`);
	}
	for (const { token, ids } of report.collisions) {
		lines.push(`token ${token} is shared by ${ids.join(", ")}: only their full ids name them`);
	}
	const count = (kind: FolderStep["kind"]) => report.steps.filter((step) => step.kind === kind).length;
	const changed = count("migrate") + count("finish") + count("move");
	lines.push(
		changed === 0
			? "nothing to do: every job folder holds a record"
			: `${count("migrate")} migrated, ${count("move")} moved to .limen/unmigrated, ${count("finish")} finished, ${count("current")} already records`,
	);
	return lines;
}
function stepLine(step: FolderStep, would: string): string {
	if (step.kind === "migrate") {
		return `job ${step.id}: ${would}migrate (${step.state})${step.notes.length ? `; ${step.notes.join("; ")}` : ""}`;
	}
	if (step.kind === "finish") {
		return `job ${step.id}: ${would}finish an earlier migration`;
	}
	if (step.kind === "move") {
		return `job ${step.id}: ${would}move to .limen/unmigrated/${step.id}: ${step.reason}`;
	}
	return `job ${step.id}: already a record`;
}
