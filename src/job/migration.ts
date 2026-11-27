// The migration of a project's job folders from the record of plain one-value files to `record.json` (S1+, D-057).
// This module and src/job/record.ts are the only code that names the files of the older record. Each folder with a
// known state becomes a record that holds every value of its files, marked `migrated` (history only); the files it
// moved go, and so do the files of removed features that nothing reads; the content files and the receipt folders
// stay. A value its field cannot hold keeps its file, so nothing is lost (T-28 (3), z. 29). A folder without a known
// state moves unchanged to `.limen/unmigrated/<id>/`. Its marker step takes a land only from land's own closing
// commit and an abandon only from a branch that holds the job's work, never from the git graph, so that retire moves
// no job on a guess; a job it cannot establish keeps no marker and is named (R-031, Decision 10; D-057 (4), A-002,
// `## Deployment` 3.6). The migration refuses while a job runs or starts, and a second run finds nothing to do.
// `--dry-run` plans the same steps and writes nothing.
import { existsSync, type Stats } from "node:fs";
import { mkdir, readFile, rm, stat } from "node:fs/promises";
import { join, resolve } from "node:path";
import { atomicRename, atomicWrite } from "../atomic-write.ts";
import { arrayOf, isIsoTime, nullOr, numberIn, object, parseJson, string } from "../boundary.ts";
import { LimenError, type Success } from "../outcome.ts";
import { platform } from "../platform/platform.ts";
import { branchTip, committerTime, isGitRepository, limenRoot } from "../project/git.ts";
import { landClosingCommits } from "../project/lanes.ts";
import { PLANT_LIMITS } from "../project/limits.ts";
import { MODULES, type Module } from "../project/modules.ts";
import { holdsProcesses, STARTUP_GRACE_MS, startingJob } from "../runtime/reap.ts";
import { JOB_ROLES } from "../runtime/roles.ts";
import { hasCode } from "../system-error.ts";
import { hexEndOf, TOKEN, tokenOf } from "./id.ts";
import { isTerminal, SESSION_ID } from "./job.ts";
import {
	type Abandoned,
	archivedJobs,
	checkedRecord,
	emptyRecord,
	type Facts,
	type Fields,
	failureFrom,
	JOB_STATES,
	type JobRecord,
	type JobState,
	jobFolderNames,
	type Landed,
	type Progress,
	progressPath,
	type Queued,
	readRecord,
	recordPath,
	serialized,
	writeMarker,
} from "./record.ts";
import { abandonBranch, holdsTip } from "./unlanded.ts";

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

/**
 * What the marker step did, or would do, to one finished record with no marker: the markers it writes, each one only
 * where its evidence holds, or none, for a record it leaves without one and names; and the job's abandon branch when
 * it gives no marker because it lacks the job's work.
 */
export type MarkerStep = {
	readonly id: string;
	readonly landed: Landed | undefined;
	readonly abandoned: Abandoned | undefined;
	readonly unsaved: UnsavedBranch | undefined;
};

/** An abandon branch at `commit` that does not hold `tip`, the tip of the job's own branch `own` (`holdsTip`). */
export type UnsavedBranch = {
	readonly branch: string;
	readonly commit: string;
	readonly own: string;
	readonly tip: string;
};

/**
 * The whole report: every folder's step, the older id formats and the tokens several folders share (T-20 (6)): those
 * that name none of their folders, and those that one job shares only with folders of `.limen/unmigrated/`; and the
 * marker step of each finished record with no marker.
 */
export type MigrationReport = {
	readonly jobsRoot: string;
	readonly dryRun: boolean;
	readonly steps: readonly FolderStep[];
	readonly markers: readonly MarkerStep[];
	/** Each module with whether the project uses it and the evidence (R-044 Change 8). */
	readonly modules: readonly ModuleUse[];
	/** The records of the job archive the module report could not read (R-044 Decision 20 G5). */
	readonly damagedRecords: number;
	readonly olderIds: readonly string[];
	readonly collisions: ReadonlyArray<{ readonly token: string; readonly ids: readonly string[] }>;
	readonly unmigratedShares: ReadonlyArray<{
		readonly token: string;
		readonly job: string;
		readonly unmigrated: readonly string[];
	}>;
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

/**
 * `limen migrate`: migrates the job folders of the project at `cwd` (D-057 (1)), from the project's root on the agents'
 * account, with its report as the text; with `dryRun` the same report, nothing written, and the run that would write
 * as `next` while there is something to do. A second run has nothing to do.
 */
export async function migrateProjectAt(cwd: string, dryRun: boolean): Promise<Success> {
	const report = await migrateProject(limenRoot(cwd), dryRun);
	const changes = report.steps.some((step) => step.kind !== "current") || marksAny(report.markers);
	return { next: dryRun && changes ? "limen migrate" : null, text: reportLines(report).join("\n") };
}

/** Whether the marker step writes a marker, or with a dry run would write one. */
function marksAny(markers: readonly MarkerStep[]): boolean {
	return markers.some((step) => step.landed !== undefined || step.abandoned !== undefined);
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
	const records: JobRecord[] = [];
	for (const id of ids) {
		const migrated = await migrateFolder(root, id, dryRun);
		steps.push(migrated.step);
		records.push(...(migrated.record ? [migrated.record] : []));
	}
	// The folders as the run leaves them, each listed once: one it moves, or with `dryRun` would move, is only below
	// `.limen/unmigrated/`, so a dry run reports the tokens as the run would.
	const moved = steps.flatMap((step) => (step.kind === "move" ? [step.id] : []));
	const jobs = (await jobFolderNames(jobsRoot)).filter((id) => !moved.includes(id));
	const unmigrated = [...new Set([...(await jobFolderNames(join(root, ".limen", "unmigrated"))), ...moved])];
	const markers = await markerSteps(root, records, dryRun);
	const { modules, damagedRecords } = await moduleUses(root, records);
	return { jobsRoot, dryRun, steps, markers, modules, damagedRecords, ...tokenReport(jobs, unmigrated) };
}

/**
 * The marker step over `records`, the records the folder steps leave (with `dryRun`, the ones they would write): for
 * each finished one with no marker, the markers its evidence gives, written through the record module unless `dryRun`.
 */
async function markerSteps(root: string, records: readonly JobRecord[], dryRun: boolean): Promise<MarkerStep[]> {
	const unmarked = records.filter(
		(record) => isTerminal(record.state) && record.landed === undefined && record.abandoned === undefined,
	);
	const closes = unmarked.length > 0 ? closingCommits(root) : new Map<string, Landed>();
	const steps: MarkerStep[] = [];
	for (const record of unmarked) {
		const step = { id: record.id, landed: closes.get(record.id), ...abandonEvidence(root, record) };
		const jobDir = join(root, ".limen", "jobs", record.id);
		for (const marker of dryRun ? [] : markersOf(step)) {
			await writeMarker(jobDir, marker);
		}
		steps.push(step);
	}
	return steps;
}
/** The markers of a step, each as `writeMarker` takes it. */
function markersOf(step: MarkerStep): Array<{ landed: Landed } | { abandoned: Abandoned }> {
	return [
		...(step.landed ? [{ landed: step.landed }] : []),
		...(step.abandoned ? [{ abandoned: step.abandoned }] : []),
	];
}

/**
 * A module and its use: `in use (<evidence>)`, with a path from the project's root or a job; `not in use`; or `unknown
 * (<n> damaged records)` where only a job record could show its use and some could not be read (T-01).
 */
type ModuleUse = { readonly module: Module; readonly use: string };
/** The modules whose use a job record of one of their roles shows (src/runtime/roles.ts): research and quality. */
const ROLE_EVIDENCE: readonly Module[] = ["research", "quality"];

/**
 * Each module, in the order of the modules, with the first evidence that the project at `root` uses it, so that the
 * owner switches on the modules in use at `## Deployment` 4.9 (R-044 Change 8): a GitHub binding, a group's run record,
 * a map folder, a `spec/workspace.md` in a root that is no Git repository, and a job of a module's role among `records`,
 * the records the folder steps leave, and those of the job archive, as `limen stats` reads them. An archived record it
 * cannot read (BAD_DATA) is counted, and a module that only a job record could show is then unknown, not "not in use"
 * (T-01, R-044 Decision 20 G5). It writes nothing, the limits file least of all, which is the owner's.
 */
async function moduleUses(
	root: string,
	records: readonly JobRecord[],
): Promise<{ readonly modules: ModuleUse[]; readonly damagedRecords: number }> {
	const archive = await archivedRecords(root);
	const jobs = [...records, ...archive.records];
	// The groups' folders are listed as the job folders are, by the record module's lister (T-25 (1)).
	const runs = (await jobFolderNames(join(root, ".limen/groups"))).sort();
	const run = runs.find((id) => existsSync(join(root, ".limen/groups", id, "run.json")));
	const found: Partial<Record<Module, string | undefined>> = {
		github: existsSync(join(root, ".limen/github/binding.json")) ? ".limen/github/binding.json" : undefined,
		group: run === undefined ? undefined : `.limen/groups/${run}/run.json`,
		picture: existsSync(join(root, ".limen/picture")) ? ".limen/picture/" : undefined,
		workspace: existsSync(join(root, "spec/workspace.md")) && !isGitRepository(root) ? "spec/workspace.md" : undefined,
	};
	const damaged = archive.damaged;
	const unknown = `unknown (${damaged} damaged record${damaged === 1 ? "" : "s"})`;
	const modules = MODULES.map((module) => {
		const byRole = ROLE_EVIDENCE.includes(module);
		const roles = JOB_ROLES.filter((role) => role.module === module && byRole);
		const job = jobs.find((record) => roles.some((role) => role.name === record.role));
		const evidence = found[module] ?? (job ? `job ${job.id}, role ${job.role}` : undefined);
		if (evidence !== undefined) {
			return { module, use: `in use (${evidence})` };
		}
		return { module, use: byRole && damaged > 0 ? unknown : "not in use" };
	});
	return { modules, damagedRecords: damaged };
}
/** The records of the job archive, and how many it could not read: a damaged one (BAD_DATA), as `limen stats` counts. */
async function archivedRecords(root: string): Promise<{ readonly records: JobRecord[]; readonly damaged: number }> {
	const records: JobRecord[] = [];
	let damaged = 0;
	for (const { jobDir } of await archivedJobs(root)) {
		const record = await readRecord(jobDir).catch((error: unknown) => {
			if (hasCode(error, "BAD_DATA")) {
				damaged += 1;
				return undefined;
			}
			throw error;
		});
		records.push(...(record ? [record] : []));
	}
	return { records, damaged };
}
/**
 * The report's line of each module, the line of the archived records it could not read when there are any, then where
 * the owner switches a module on.
 */
function moduleLines(modules: readonly ModuleUse[], damaged: number): string[] {
	return [
		...modules.map(({ module, use }) => `module ${module}: ${use}`),
		...(damaged > 0 ? [`job archive: ${damaged} damaged record${damaged === 1 ? "" : "s"} not read`] : []),
		`modules: the owner switches each on in ${PLANT_LIMITS} ("modules": {"<name>": true})`,
	];
}
/**
 * The `landed` marker of each job a closing commit of `limen land` in the history of HEAD of the project's repository
 * names (`landClosingCommits`, the rule a land that goes on after its close reads too, T-25): that commit and its
 * committer time; the oldest such commit, the first close, for a job two name. None in a project that is no Git
 * repository, where land commits no close.
 */
function closingCommits(root: string): Map<string, Landed> {
	const landed = new Map<string, Landed>();
	for (const [id, commit] of landClosingCommits(root)) {
		landed.set(id, { sha: commit.sha, at: new Date(commit.time * 1000).toISOString() });
	}
	return landed;
}
/**
 * The `abandoned` marker of a record whose `limen/abandon/<id>` exists in its repository while its worktree is gone:
 * the branch, its commit, and that commit's committer time, the time of the save when abandon made the commit; none
 * when either does not hold. A branch that lacks the tip of the job's own branch is no save of the job, which a marker
 * would hide, so it gives none and is named, as abandon refuses it (R-031, Decisions 3 and 10; review round 2, G2).
 * The evidence is Git's; the record's own marker is read by `abandonedMarker` of src/job/record.ts (T-18).
 */
function abandonEvidence(root: string, record: JobRecord): Pick<MarkerStep, "abandoned" | "unsaved"> {
	const none = { abandoned: undefined, unsaved: undefined };
	const repository = record.repo ? resolve(root, record.repo) : root;
	if ((record.worktree && existsSync(record.worktree)) || !existsSync(join(repository, ".git"))) {
		return none;
	}
	const branch = abandonBranch(record.id);
	const commit = branchTip(repository, branch);
	if (commit === undefined) {
		return none;
	}
	// A review job's branch is its candidate's, which it never holds (src/job/unlanded.ts).
	const own = record.role === "reviewer" ? undefined : (record.branch ?? undefined);
	const tip = own === undefined ? undefined : branchTip(repository, own);
	if (own !== undefined && tip !== undefined && !holdsTip(repository, commit, tip)) {
		return { abandoned: undefined, unsaved: { branch, commit, own, tip } };
	}
	return {
		...none,
		abandoned: { branch, commit, at: new Date(committerTime(repository, commit) * 1000).toISOString() },
	};
}

/**
 * Whether the folder's job runs or starts now: by its record, a dead wrapper whose scope still holds a process included
 * (R-032 (c)), or by the files of the older record.
 */
export async function folderLive(jobDir: string): Promise<boolean> {
	if (existsSync(recordPath(jobDir))) {
		const record = await readRecord(jobDir);
		return (await holdsProcesses(record)) || startingJob(record);
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
		if (hasCode(error, "ENOENT")) {
			return value;
		}
		throw error;
	};
}

/** A folder's step, and the record it leaves the folder with (with `dryRun`, would leave); none for a folder it moves. */
type Migrated = { readonly step: FolderStep; readonly record: JobRecord | undefined };

async function migrateFolder(root: string, id: string, dryRun: boolean): Promise<Migrated> {
	const jobDir = join(root, ".limen", "jobs", id);
	if (existsSync(recordPath(jobDir))) {
		return { step: await finishFolder(jobDir, id, dryRun), record: await readRecord(jobDir) };
	}
	const files = await oldFiles(jobDir);
	const state = files.get("state") ?? "";
	if (!OLD_STATES.includes(state)) {
		const reason = state ? `unknown state ${JSON.stringify(state.slice(0, 40))}` : "no state";
		if (!dryRun) {
			await mkdir(join(root, ".limen", "unmigrated"), { recursive: true });
			await atomicRename(jobDir, join(root, ".limen", "unmigrated", id));
		}
		return { step: { id, kind: "move", reason }, record: undefined };
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
	return { step: { id, kind: "migrate", state: built.record.state, notes, removed }, record: built.record };
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
	const timeOf = (text: string) => (isIsoTime(text) ? text : undefined);
	const startedAt = values.field("started-at", timeOf, "not an ISO time");
	const finishedAt =
		values.field("finished-at", timeOf, "not an ISO time") ?? (terminal ? await modifiedAt(jobDir, "state") : null);
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
	return read && isIsoTime(read.since) ? read : undefined;
}

/**
 * The ids of an older format, which take only the full id, and the tokens several folders share (T-20 (6)), told apart
 * as the resolver (src/job/reference.ts) tells them: it counts a token's owners among the folders of `.limen/jobs/`
 * only, so a token that one job shares only with folders of `.limen/unmigrated/` still names that job, and no reference
 * names those folders, which retire never moves to the job archive. Every other shared token keeps the line that only
 * full ids name its folders.
 */
function tokenReport(
	jobs: readonly string[],
	unmigrated: readonly string[],
): Pick<MigrationReport, "olderIds" | "collisions" | "unmigratedShares"> {
	const ids = [...jobs, ...unmigrated];
	const olderIds = ids.filter((id) => tokenOf(id) === undefined);
	const byToken = Map.groupBy(
		ids.flatMap((id) => {
			const token = hexEndOf(id);
			return token ? [{ id, token }] : [];
		}),
		(entry) => entry.token,
	);
	const collisions: Array<MigrationReport["collisions"][number]> = [];
	const unmigratedShares: Array<MigrationReport["unmigratedShares"][number]> = [];
	for (const [token, entries] of byToken) {
		const shared = entries.map((entry) => entry.id);
		if (shared.length < 2) {
			continue;
		}
		const [job, ...others] = shared.filter((id) => jobs.includes(id));
		if (job !== undefined && others.length === 0 && TOKEN.test(token)) {
			unmigratedShares.push({ token, job, unmigrated: shared.filter((id) => id !== job) });
		} else {
			collisions.push({ token, ids: shared });
		}
	}
	return { olderIds, collisions, unmigratedShares };
}

/** The report as lines for the owner: each folder, each removed file, each older id and each shared token. */
export function reportLines(report: MigrationReport): string[] {
	const lines = [
		`limen migrate${report.dryRun ? " --dry-run (nothing written)" : ""}: ${report.jobsRoot}`,
		...moduleLines(report.modules, report.damagedRecords),
	];
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
	for (const { token, job, unmigrated } of report.unmigratedShares) {
		const folders = unmigrated.join(", ");
		lines.push(
			`token ${token} names job ${job}; it also ends ${folders} in .limen/unmigrated/, which no reference names`,
		);
	}
	lines.push(...markerLines(report.markers, would));
	const count = (kind: FolderStep["kind"]) => report.steps.filter((step) => step.kind === kind).length;
	const changed = count("migrate") + count("finish") + count("move");
	// A run that writes a marker, or would, has something to do, so the 3.6 report never says both (R-031, review
	// round 1, F4).
	lines.push(
		changed === 0 && !marksAny(report.markers)
			? "nothing to do: every job folder holds a record"
			: `${count("migrate")} migrated, ${count("move")} moved to .limen/unmigrated, ${count("finish")} finished, ${count("current")} already records`,
	);
	return lines;
}
/**
 * The marker step's lines: each marker written, or with a dry run that would be, each finished record left without
 * one, and their counts; none when no finished record lacked a marker.
 */
function markerLines(markers: readonly MarkerStep[], would: string): string[] {
	const lines: string[] = [];
	for (const step of markers) {
		const { id, landed, abandoned } = step;
		if (landed) {
			lines.push(`job ${id}: ${would}mark landed (${landed.sha}, ${landed.at})`);
		}
		if (abandoned) {
			lines.push(`job ${id}: ${would}mark abandoned (${abandoned.branch} at ${abandoned.commit}, ${abandoned.at})`);
		}
		if (!(landed || abandoned)) {
			lines.push(`job ${id}: left without a marker: ${leftWithout(step)}`);
		}
	}
	if (markers.length === 0) {
		return lines;
	}
	const landed = markers.filter((step) => step.landed).length;
	const abandoned = markers.filter((step) => step.abandoned).length;
	const left = markers.filter((step) => !(step.landed || step.abandoned)).length;
	const written = would ? "would be written" : "written";
	const jobs = left === 1 ? "job" : "jobs";
	return [
		...lines,
		`markers: ${landed} landed and ${abandoned} abandoned ${written}; ${left} finished ${jobs} left without one`,
	];
}
/** Why the marker step left a finished record without a marker: no close names it, and no abandon branch saves it. */
function leftWithout({ id, unsaved }: MarkerStep): string {
	const save = unsaved
		? `${unsaved.branch} at ${unsaved.commit} does not hold ${unsaved.tip}, the tip of its branch ${unsaved.own}`
		: `no ${abandonBranch(id)} with its worktree gone`;
	return `no closing commit of land names it, and ${save}`;
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
