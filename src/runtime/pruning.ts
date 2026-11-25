// The prune of finished worktrees and the delete of landed branches (T-26 (2)): the daily prune of `limen seat sweep`
// is prune's one caller (src/runtime/sweeping.ts, D-097 (4) (c)), and `limen land` deletes the branch it merged. Prune
// removes only what Git holds elsewhere: a clean worktree, whose tracked files are on its branch, and a landed branch,
// whose tip is in the target's history; it moves what Git does not hold into the job archive instead (z. 29, D-097 (4)
// (d)). No removal takes a worktree that `git status` shows dirty, whatever job names it, or the worktree of a finished
// job whose unlanded work nothing resolved (A-001, src/job/unlanded.ts); `limen abandon` removes one only once its state
// is on a branch and only what prune could remove itself (src/job/abandoning.ts), through `removalBlock`,
// `removeWorktree` and `removeTrash` here.
import { randomUUID } from "node:crypto";
import { existsSync, statSync } from "node:fs";
import { readdir, realpath, rm } from "node:fs/promises";
import { basename, dirname, join, resolve } from "node:path";
import { atomicRename, makeDurableFolder } from "../atomic-write.ts";
import { shownField } from "../boundary.ts";
import { retainedGroupJob } from "../job/group-cabinet.ts";
import { everRan, isTerminal } from "../job/job.ts";
import { PUBLISHING, worktreeLock } from "../job/publication.ts";
import {
	archiveMonth,
	type JobRecord,
	jobFolders,
	readRecord,
	readRecordOf,
	unregisteredArchive,
} from "../job/record.ts";
import { jobsLock } from "../job/reference.ts";
import { unlandedWork } from "../job/unlanded.ts";
import { moveLockedFolder, withLock } from "../lock.ts";
import {
	branchExists,
	deleteBranch,
	type GitWorktree,
	listWorktrees,
	pruneWorktrees,
	unsavedGitlink,
	workspaceRepository,
	worktreeChanges,
} from "../project/git.ts";
import { STARTUP_GRACE_MS, scopeHolds, startingJob } from "./reap.ts";

/**
 * One path that prune removed or moved: the job that recorded it, when one did, why no job kept it, and for a folder
 * it moved into the archive instead of removing it, where it went.
 */
export type PruneRemoval = {
	readonly path: string;
	readonly jobDir: string | undefined;
	readonly reason: string;
	readonly to?: string;
};
/**
 * A worktree that stays: its path, the job that holds it, when one does, and why, `unlanded work` unless a cause is
 * given, as `limen abandon` gives one.
 */
export type PruneKept = { readonly path: string; readonly job: string | undefined; readonly reason?: string };
/** What one prune did: the paths it removed and the worktrees it kept for their unlanded work. */
export type PruneResult = { readonly removed: readonly PruneRemoval[]; readonly kept: readonly PruneKept[] };
/** Why prune removes a worktree some job recorded; a job that keeps it never gets here. */
type PruneOwners = Map<string, { readonly jobDir: string; readonly reason: string }>;
/**
 * The line of one removal, or of one move into the archive, which names where the folder went (z. 10). A job can name
 * a folder of the worktree root or of `.limen/jobs/`, and the sweep's lines reach the coordinator's model, so every
 * path and name is escaped (`shownField`) and keeps the line one line (z. 15, R-101 review round 1, F3).
 */
export function pruneLine(removal: PruneRemoval): string {
	const path = shownField(removal.path);
	const done = removal.to === undefined ? `pruned ${path}` : `archived ${path} to ${shownField(removal.to)}`;
	return `${done} (job ${removal.jobDir ? shownField(basename(removal.jobDir)) : "none"}): ${removal.reason}`;
}
/**
 * The one line of every kept worktree (z. 10), from the seat sweep's daily prune and retire, land and abandon: it
 * names the worktree and the job, escaped as `pruneLine` names them, and says why.
 */
export function keptLine(kept: PruneKept): string {
	const job = kept.job === undefined ? "none" : shownField(kept.job);
	return `kept ${shownField(kept.path)} (job ${job}): ${kept.reason ?? "unlanded work"}`;
}
/**
 * Why the checkout at `path` holds state the project's repository cannot hold: a nested repository whose commit its
 * object store lacks (`unsavedGitlink`), the one rule prune, retire, land and abandon keep a worktree by, like a dirty
 * one, whatever job names it and whether or not that job is resolved (R-030). The cause names the nested path, escaped;
 * undefined when there is none.
 */
export function unsavedNested(path: string, repository: string): string | undefined {
	const nested = unsavedGitlink(path, repository);
	return nested === undefined
		? undefined
		: `the nested repository ${shownField(nested)} holds a commit that the project's repository lacks`;
}
/**
 * Why removing the folder `path` would take another registered worktree with it, the one rule prune, land and abandon
 * share (R-030): the first of `registered`, real paths, that lies below `path`, named as a `kept` line's cause, its
 * path escaped. Undefined when none does.
 */
function registeredBelow(path: string, registered: Iterable<string>): string | undefined {
	const inner = [...registered].find((other) => other.startsWith(`${path}/`));
	return inner === undefined ? undefined : `it holds the registered worktree ${shownField(inner)}`;
}
/**
 * The daily prune of the project at `root` (D-097 (4)): moves into the job archive what no job keeps and Git does not
 * hold (`archiveUnstarted`), then removes the clean worktrees of each of its repositories that no job keeps, moving the
 * folders of the worktree root that Git does not register and that hold no `.git` into the project's archive. Returns
 * what it removed or moved and the worktrees it kept.
 */
export async function pruneFinishedWorktrees(root: string): Promise<PruneResult> {
	const { repositories, removals, owners } = await archiveUnstarted(root, `${root}/.limen/jobs`);
	const kept: PruneKept[] = [];
	for (const repository of repositories) {
		const pruned = await pruneRepositoryWorktrees(repository, root, owners);
		removals.push(...pruned.removed);
		kept.push(...pruned.kept);
	}
	return { removed: removals, kept };
}
/**
 * The one rule every removal obeys: a job keeps its record and its worktree while it is starting, running, or in an
 * open group, and a finished job keeps its worktree while its scope holds processes, as after a scope end that failed
 * (`scopeHolds`, D-097 (4) (e)). Starting is a record its wrapper has not run yet whose spawner lives or whose startup
 * grace runs. Prune does not ask whether a running job's process lives: a running record keeps its worktree, and the
 * reaper writes a dead wrapper's job `failed` only once its scope or group is gone (A-005, src/runtime/reap.ts).
 */
async function jobKeeps(jobDir: string, record: JobRecord | undefined): Promise<boolean> {
	if (record && record.state !== "starting") {
		return !isTerminal(record.state) || scopeHolds(record) || retainedGroupJob(jobDir);
	}
	const startedAt = Date.parse(record?.startedAt ?? "");
	if ((Number.isFinite(startedAt) && Date.now() - startedAt < STARTUP_GRACE_MS) || startingJob(record)) {
		return true;
	}
	return retainedGroupJob(jobDir);
}
type LandedBranch = { readonly repository: string; readonly branch: string };
/** For one branch: a job that keeps it, and each worktree a finished job that names it left, with that job's id. */
type BranchUse = { busy?: string; worktrees: Map<string, string> };
/**
 * What became of one landed branch: deleted, or kept with why; `worktree` is the worktree that holds it, when that
 * stays for its unlanded work, which the caller prints as `keptLine` does.
 */
export type BranchResult = { readonly branch: string; readonly kept?: string; readonly worktree?: PruneKept };
/**
 * Deletes each landed `limen/*` branch and the finished worktree that holds it, since Git keeps a checked-out branch.
 * The caller has proven every branch landed. A branch stays while a job that names it keeps it, while a checkout no
 * job recorded holds it, or while the worktree that holds it is dirty (A-001). Decides under the worktree lock, as
 * prune does. Returns why each kept branch stays.
 */
export async function deleteLandedBranches(root: string, landed: readonly LandedBranch[]): Promise<BranchResult[]> {
	const jobsRoot = `${root}/.limen/jobs`;
	const trashRoots = new Set<string>();
	const results = await worktreeLock(jobsRoot, async () => {
		const uses = await branchUses(jobsRoot);
		const checkouts = new Map<string, readonly GitWorktree[]>();
		const decided: BranchResult[] = [];
		for (const target of landed) {
			decided.push(await deleteLandedBranch(target, uses.get(target.branch), checkouts, trashRoots));
		}
		return decided;
	});
	for (const trashRoot of trashRoots) {
		await emptyTrash(trashRoot);
	}
	return results;
}
/** Deletes one landed branch and moves the finished worktree that holds it out of reach, or says why it stays. */
async function deleteLandedBranch(
	target: LandedBranch,
	use: BranchUse | undefined,
	checkouts: Map<string, readonly GitWorktree[]>,
	trashRoots: Set<string>,
): Promise<BranchResult> {
	const decision = await landedBranchDecision(target, use, checkouts);
	if (decision.kind === "stays") {
		return decision.result;
	}
	const { repository, branch } = target;
	try {
		if (decision.holder) {
			trashRoots.add(dirname(decision.holder));
			await detach(decision.holder);
			pruneWorktrees(repository);
		}
		deleteBranch(repository, branch);
		return { branch };
	} catch (error) {
		return keptFor(branch, error);
	}
}
/** One landed branch's fate: it stays, with why, or it goes with the worktree that holds it, when one does. */
type BranchDecision =
	| { readonly kind: "stays"; readonly result: BranchResult }
	| { readonly kind: "goes"; readonly holder: string | undefined };
/**
 * Whether one landed branch goes, with the worktree that holds it, or stays, and why. Git's list of worktrees is pruned
 * before it is read, which the delete needs.
 */
async function landedBranchDecision(
	{ repository, branch }: LandedBranch,
	use: BranchUse | undefined,
	checkouts: Map<string, readonly GitWorktree[]>,
): Promise<BranchDecision> {
	const stays = (result: BranchResult): BranchDecision => ({ kind: "stays", result });
	if (!branch.startsWith("limen/") || use?.busy || !branchExists(repository, branch)) {
		return stays({ branch, kept: use?.busy ? `job ${use.busy} still uses it` : "not a present limen/ branch" });
	}
	if (!checkouts.has(repository)) {
		pruneWorktrees(repository);
		checkouts.set(repository, listWorktrees(repository));
	}
	const holder = checkouts.get(repository)?.find((worktree) => worktree.branch === branch);
	const path = holder ? await resolved(holder.path) : undefined;
	if (holder?.locked || (path && !use?.worktrees.has(path))) {
		return stays({ branch, kept: `it is checked out at ${path}${holder?.locked ? ", which is locked" : ""}` });
	}
	try {
		// A Git failure of a check keeps the branch and the worktree too.
		const job = path ? use?.worktrees.get(path) : undefined;
		const registered = await Promise.all((checkouts.get(repository) ?? []).map((worktree) => resolved(worktree.path)));
		const kept = path ? keptHolder({ path, job }, repository, registered) : undefined;
		return kept
			? stays({ branch, kept: kept.reason ?? "its worktree holds unlanded work", worktree: kept })
			: { kind: "goes", holder: path };
	} catch (error) {
		return stays(keptFor(branch, error));
	}
}
/** A branch kept because a step on it failed, with the failure's words. */
function keptFor(branch: string, error: unknown): BranchResult {
	return { branch, kept: error instanceof Error ? error.message.trim() : String(error) };
}
/**
 * The worktree that holds a landed branch, when it must stay, and why: `git status` shows it dirty, whatever job names
 * it (A-001); it holds a nested commit the project's repository lacks (`unsavedNested`); or a registered worktree lies
 * below it, which its own `git status` may not show and its removal would take.
 */
function keptHolder(holder: PruneKept, repository: string, registered: readonly string[]): PruneKept | undefined {
	const changes = worktreeChanges(holder.path, holder.job);
	if ((changes?.length ?? 0) > 0) {
		return holder;
	}
	const reason =
		(changes ? unsavedNested(holder.path, repository) : undefined) ?? registeredBelow(holder.path, registered);
	return reason === undefined ? undefined : { ...holder, reason };
}
/** For each recorded branch: a job that keeps it, and the worktrees its other jobs left. */
async function branchUses(jobsRoot: string): Promise<Map<string, BranchUse>> {
	const uses = new Map<string, BranchUse>();
	for (const id of await jobFolders(jobsRoot)) {
		const jobDir = `${jobsRoot}/${id}`;
		const record = await readRecord(jobDir);
		const [branch, worktree] = [record?.branch ?? "", record?.worktree ?? ""];
		if (!branch) {
			continue;
		}
		const use = uses.get(branch) ?? { worktrees: new Map<string, string>() };
		uses.set(branch, use);
		if (await jobKeeps(jobDir, record)) {
			use.busy ??= id;
		} else if (worktree) {
			use.worktrees.set(await resolved(worktree), id);
		}
	}
	return uses;
}
/** What the moves into the job archive did: the folders that went, and why each worktree their records named goes. */
type Archived = { readonly removals: PruneRemoval[]; readonly owners: PruneOwners };
/** A folder `.limen/.publishing-<id>` a publication made, by the job's id and its time of change. */
type Publication = { readonly folder: string; readonly id: string; readonly changed: number };

/**
 * Moves into the job archive, never deleting (z. 29, D-097 (4) (d)), each record of `.limen/jobs/` that never started
 * and no longer starts, each folder there with no record, and each `.limen/.publishing-<id>` that a publication left,
 * and says why the worktree such a record named goes. The moves run under the jobs lock, the token draw's, as retire's
 * do (A-018), each folder read again there, and a publication's under the worktree lock too, which publication renames
 * it under. Names the repositories whose worktrees the prune visits: those of jobs that started, else the root, each
 * only while it is a Git repository, as a workspace with no job is not.
 */
async function archiveUnstarted(
	root: string,
	jobsRoot: string,
): Promise<{ repositories: Set<string>; removals: PruneRemoval[]; owners: PruneOwners }> {
	const repositories = new Set<string>();
	const unstarted: string[] = [];
	for (const id of await jobFolders(jobsRoot)) {
		const jobDir = `${jobsRoot}/${id}`;
		const record = await readRecord(jobDir);
		if (everRan(record?.state)) {
			repositories.add(record?.repo ? workspaceRepository(root, record.repo) : root);
		} else if (!(await jobKeeps(jobDir, record))) {
			unstarted.push(jobDir);
		}
	}
	const publications = await leftPublications(root);
	const archived: Archived =
		unstarted.length + publications.length === 0
			? { removals: [], owners: new Map() }
			: await withLock(jobsLock(root), () => moveUnstarted(root, unstarted, publications));
	if (repositories.size === 0) {
		repositories.add(root);
	}
	const git = [...repositories].filter((repository) => existsSync(`${repository}/.git`));
	return { repositories: new Set(git), ...archived };
}
/**
 * Under the jobs lock: moves each of `unstarted` that still holds no record or a record that never started and no
 * longer starts, read again under the job's own lock, and each of `publications` still left, each into the month of the
 * job archive of its start, else of the move.
 */
async function moveUnstarted(
	root: string,
	unstarted: readonly string[],
	publications: readonly Publication[],
): Promise<Archived> {
	const removals: PruneRemoval[] = [];
	const owners: PruneOwners = new Map();
	for (const jobDir of unstarted) {
		const record = existsSync(jobDir) ? await readRecord(jobDir) : undefined;
		if (!existsSync(jobDir) || everRan(record?.state) || (await jobKeeps(jobDir, record))) {
			continue;
		}
		const to = await archiveFolder(root, basename(jobDir), record);
		const again = async () => {
			const now = await readRecord(jobDir);
			return !(everRan(now?.state) || (await jobKeeps(jobDir, now)));
		};
		if (await moveLockedFolder(jobDir, to, again)) {
			if (record?.worktree) {
				owners.set(await resolved(record.worktree), {
					jobDir,
					reason: "its record never started and went to the archive",
				});
			}
			const reason = record ? "its record never started and its spawner is gone" : "the folder holds no record";
			removals.push({ path: jobDir, jobDir, reason, to });
		}
	}
	if (publications.length > 0) {
		removals.push(...(await worktreeLock(`${root}/.limen/jobs`, () => movePublications(root, publications))));
	}
	return { removals, owners };
}
/** Under the jobs lock and the worktree lock: moves each of `publications` that is still there and still left. */
async function movePublications(root: string, publications: readonly Publication[]): Promise<PruneRemoval[]> {
	const removals: PruneRemoval[] = [];
	for (const { folder, id, changed } of publications) {
		const record = existsSync(folder) ? await readRecordOf(folder, id) : undefined;
		if (!(existsSync(folder) && publicationLeft(record, changed))) {
			continue;
		}
		const to = await archiveFolder(root, id, record);
		if (await moveLockedFolder(folder, to, async () => true)) {
			const jobDir = `${root}/.limen/jobs/${id}`;
			removals.push({ path: folder, jobDir, reason: "its publication never finished and its spawner is gone", to });
		}
	}
	return removals;
}
/**
 * The folder of the job archive of the project at `root` that the job `id` of `record` moves to, its month's folder
 * made and synced first, as retire makes it: the month of its start, else of the move.
 */
async function archiveFolder(root: string, id: string, record: JobRecord | undefined): Promise<string> {
	const month = archiveMonth(root, record?.startedAt ?? new Date().toISOString());
	await makeDurableFolder(month);
	return join(month, id);
}
/**
 * The folders `.limen/.publishing-<id>` of the project at `root` that a publication left (D-080): a crash before its
 * rename leaves one, which no other code removes. One that is gone by its stat is skipped: a spawn renamed it into
 * `.limen/jobs/` since the listing, under the worktree lock, which this read does not hold (R-101 review round 1, F4).
 */
async function leftPublications(root: string): Promise<Publication[]> {
	const limen = `${root}/.limen`;
	const names = existsSync(limen) ? await readdir(limen, { withFileTypes: true }) : [];
	const left: Publication[] = [];
	for (const entry of names) {
		if (!(entry.isDirectory() && entry.name.startsWith(PUBLISHING))) {
			continue;
		}
		const folder = `${limen}/${entry.name}`;
		const id = entry.name.slice(PUBLISHING.length);
		const changed = statSync(folder, { throwIfNoEntry: false })?.mtimeMs;
		if (changed === undefined) {
			continue;
		}
		if (publicationLeft(await readRecordOf(folder, id), changed)) {
			left.push({ folder, id, changed });
		}
	}
	return left;
}
/**
 * Whether a publication's folder is left: its spawner is gone, and its startup grace has passed since the start its
 * record holds, or since the folder changed when it holds no record yet.
 */
function publicationLeft(record: JobRecord | undefined, changed: number): boolean {
	const start = Date.parse(record?.startedAt ?? "");
	return !startingJob(record) && Date.now() - (Number.isFinite(start) ? start : changed) >= STARTUP_GRACE_MS;
}
/**
 * Removes the worktrees and leftover folders in the repository's Limen worktree root that no job keeps. It lists them
 * first and reads the job records second, under the worktree lock: a job publishes its record before Git makes its
 * worktree, and a job that reuses a worktree publishes under the same lock. A removal is one rename out of reach there;
 * the slow delete runs after the lock.
 */
async function pruneRepositoryWorktrees(
	repository: string,
	root: string,
	removedOwners: PruneOwners,
): Promise<PruneResult> {
	const jobsRoot = `${root}/.limen/jobs`;
	const worktreeRoot = await resolved(worktreeRootOf(repository));
	const listed = await removalCandidates(repository, worktreeRoot);
	const result = await worktreeLock(jobsRoot, async () => {
		const { kept, owners } = await worktreeClaims(jobsRoot);
		const unlanded = await unlandedWorktrees(root);
		const pass: PrunePass = { ...listed, root, repository, kept, owners, removedOwners, unlanded };
		const decided = await prunePass(pass);
		// Git forgets the moved worktrees before a job can claim their paths again.
		pruneWorktrees(repository);
		return decided;
	});
	await emptyTrash(worktreeRoot);
	return result;
}
/** What one repository's prune decides from: its candidates and registered worktrees, and what the jobs keep and own. */
type PrunePass = {
	readonly candidates: ReadonlyMap<string, boolean>;
	readonly registered: ReadonlySet<string>;
	readonly kept: ReadonlySet<string>;
	readonly owners: PruneOwners;
	readonly removedOwners: PruneOwners;
	readonly unlanded: ReadonlyMap<string, string>;
	readonly repository: string;
	/** The project's root, whose archive takes the folders of the worktree root that hold no checkout. */
	readonly root: string;
};
/**
 * The removals of one prune, deepest first (A-001): what a kept job keeps stays, with what is inside it; a worktree with
 * unlanded work, one `git status` shows dirty, or one with a nested commit the project's repository lacks
 * (`unsavedNested`), read before anything moves, stays and is named, with what is inside it, a held one inside it named
 * too; and a candidate that still holds a registered worktree once the worktrees below
 * it were decided stays, named with that cause, since its removal would take that one with it. A folder Git does not
 * register that holds no `.git` is no checkout whose files a branch holds, so it moves into the project's archive
 * instead of being removed (`archiveUnregistered`, z. 29).
 */
async function prunePass(pass: PrunePass): Promise<PruneResult> {
	const jobOf = (path: string) => passJob(pass, path);
	const held = heldCandidates(pass);
	const present = new Set(pass.registered);
	const removed: PruneRemoval[] = [];
	const kept: PruneKept[] = [];
	for (const [path, registered] of [...pass.candidates].sort(([left], [right]) => right.length - left.length)) {
		// A clean worktree inside a kept job's or a held one stays with it, without a line of its own.
		const inHeld = [...held.keys()].some((folder) => path.startsWith(`${folder}/`));
		if (within(path, pass.kept) || (inHeld && !held.has(path))) {
			continue;
		}
		const reason = held.has(path) ? held.get(path) : registeredBelow(path, present);
		if (held.has(path) || reason) {
			kept.push({ path, job: jobOf(path), ...(reason === undefined ? {} : { reason }) });
			continue;
		}
		const owner = pass.owners.get(path) ?? pass.removedOwners.get(path);
		// A folder another prune moved since the listing is gone: every move of one holds the worktree lock.
		if (!(registered || existsSync(`${path}/.git`)) && existsSync(path)) {
			const to = await archiveUnregistered(pass.root, path);
			const why = "the directory is not a registered Git worktree and holds no .git";
			removed.push({ path, jobDir: owner?.jobDir, reason: owner?.reason ?? why, to });
			continue;
		}
		if (!(await detach(path))) {
			continue;
		}
		present.delete(path);
		const why = registered ? "no job records this worktree" : "directory is not a registered Git worktree";
		removed.push({ path, jobDir: owner?.jobDir, reason: owner?.reason ?? why });
	}
	return { removed: removed.reverse(), kept: kept.reverse() };
}
/**
 * Moves the folder `path` of a worktree root, which Git does not register and which holds no `.git`, whole into the
 * archive of the project at `root`, `.limen/archive/unregistered/<name>-<time>/`, whose name is no month, so no reader
 * of the job archive takes it for a job (D-097 (4) (d), Decision 3); returns where it went.
 */
async function archiveUnregistered(root: string, path: string): Promise<string> {
	const folder = unregisteredArchive(root);
	await makeDurableFolder(folder);
	const to = join(folder, `${basename(path)}-${new Date().toISOString().replaceAll(/[:.]/g, "-")}`);
	await atomicRename(path, to);
	return to;
}
/** The job a candidate of `pass` belongs to: the one whose unlanded work it holds, else its newest record's. */
function passJob(pass: PrunePass, path: string): string | undefined {
	const owner = pass.owners.get(path) ?? pass.removedOwners.get(path);
	return pass.unlanded.get(path) ?? (owner ? basename(owner.jobDir) : undefined);
}
/**
 * Each candidate of `pass` that holds what no removal may take, read before anything moves: unlanded work, a dirty
 * `git status`, or a nested commit the project's repository lacks; with the cause its line names when that is not
 * `unlanded work`.
 */
function heldCandidates(pass: PrunePass): Map<string, string | undefined> {
	const held = new Map<string, string | undefined>();
	for (const [path] of pass.candidates) {
		if (within(path, pass.kept)) {
			continue;
		}
		if (pass.unlanded.has(path)) {
			held.set(path, undefined);
			continue;
		}
		const changes = worktreeChanges(path, passJob(pass, path));
		const unsaved = changes?.length === 0 ? unsavedNested(path, pass.repository) : undefined;
		if ((changes?.length ?? 0) > 0 || unsaved) {
			held.set(path, unsaved);
		}
	}
	return held;
}
/** Whether `path` is one of `folders` or inside one. */
function within(path: string, folders: Iterable<string>): boolean {
	return [...folders].some((folder) => path === folder || path.startsWith(`${folder}/`));
}
/** The worktree of each finished job of the project whose unlanded work nothing resolved, with the job's id. */
async function unlandedWorktrees(root: string): Promise<Map<string, string>> {
	const held = new Map<string, string>();
	for (const work of await unlandedWork(root)) {
		if (work.worktree) {
			held.set(await resolved(work.worktree), work.id);
		}
	}
	return held;
}
/** The folder beside `repository` that Limen makes its job worktrees in. */
function worktreeRootOf(repository: string): string {
	return `${dirname(repository)}/.${basename(repository)}-limen-worktrees`;
}
/**
 * Whether prune may remove the registered worktree `worktree` at the real path `path`: not the primary checkout, not
 * locked in Git, and below the worktree root, outside its dot entries, which belong to Limen: nested worktree roots
 * of other checkouts, and removals in progress.
 */
function removable(worktree: GitWorktree, path: string, primary: string, worktreeRoot: string): boolean {
	const inRoot = path.startsWith(`${worktreeRoot}/`) && !path.slice(worktreeRoot.length + 1).startsWith(".");
	return path !== primary && inRoot && !worktree.locked;
}
/**
 * Every path prune may remove and whether Git registers it: the worktrees `removable` takes, then the root's other
 * folders but its dot entries; and the real path of every worktree Git registers.
 */
async function removalCandidates(
	repository: string,
	worktreeRoot: string,
): Promise<{ readonly candidates: Map<string, boolean>; readonly registered: Set<string> }> {
	const candidates = new Map<string, boolean>();
	const registered = new Set<string>();
	const primary = await resolved(repository);
	for (const worktree of listWorktrees(repository)) {
		const path = await resolved(worktree.path);
		registered.add(path);
		if (removable(worktree, path, primary, worktreeRoot)) {
			candidates.set(path, true);
		}
	}
	for (const name of await readdir(worktreeRoot).catch(() => [])) {
		const path = await resolved(resolve(worktreeRoot, name));
		if (!(name.startsWith(".") || registered.has(path))) {
			candidates.set(path, false);
		}
	}
	return { candidates, registered };
}
/**
 * Why prune could not remove the worktree at `path` of `repository`, for `limen abandon`, which removes only what
 * prune could (R-030): Git does not register it, it is the primary checkout, Git locks it, it lies outside the worktree
 * root, or it holds another registered worktree, which its removal would take with it. Undefined when prune could.
 */
export async function removalBlock(repository: string, path: string): Promise<string | undefined> {
	const [target, primary, worktreeRoot] = await Promise.all([
		resolved(path),
		resolved(repository),
		resolved(worktreeRootOf(repository)),
	]);
	const listed = await Promise.all(
		listWorktrees(repository).map(async (worktree) => ({ worktree, path: await resolved(worktree.path) })),
	);
	const own = listed.find((entry) => entry.path === target);
	if (!own) {
		return "Git does not register it as a worktree";
	}
	if (!removable(own.worktree, target, primary, worktreeRoot)) {
		const where = target === primary ? "it is the primary checkout" : `it is outside the worktree root ${worktreeRoot}`;
		return own.worktree.locked ? "Git locks it" : where;
	}
	return registeredBelow(
		target,
		listed.map((entry) => entry.path),
	);
}
/** The worktrees jobs keep; for each other recorded worktree, the latest record and why it goes. */
async function worktreeClaims(jobsRoot: string): Promise<{ kept: Set<string>; owners: PruneOwners }> {
	const kept = new Set<string>();
	const owners: PruneOwners = new Map();
	for (const id of await jobFolders(jobsRoot)) {
		const jobDir = `${jobsRoot}/${id}`;
		const record = await readRecord(jobDir);
		const recorded = record?.worktree;
		if (!recorded) {
			continue;
		}
		const path = await resolved(recorded);
		if (await jobKeeps(jobDir, record)) {
			kept.add(path);
		} else {
			owners.set(path, { jobDir, reason: `job ${everRan(record?.state) ? record?.state : "never started"}` });
		}
	}
	return { kept, owners };
}
/** Moves a worktree out of every job's reach in one rename beside it; false when it is gone already. */
function detach(path: string): Promise<boolean> {
	return atomicRename(path, trashPath(path)).then(
		() => true,
		() => false,
	);
}
/**
 * Removes the worktree at `path` of `repository` as prune removes one, for `limen abandon`: one rename out of reach,
 * then Git forgets it; a failure of either is the command's. The caller holds the worktree lock, and after it removes
 * the trash this returns (`removeTrash`).
 */
export async function removeWorktree(repository: string, path: string): Promise<string> {
	const trash = trashPath(path);
	await atomicRename(path, trash);
	pruneWorktrees(repository);
	return trash;
}
/** A new name beside `path` that every job's worktree claim and every prune's list skips. */
function trashPath(path: string): string {
	return `${dirname(path)}/.pruned-${randomUUID()}`;
}
/** Deletes every moved worktree in the folder: this prune's, and any an earlier prune could not finish. */
async function emptyTrash(folder: string): Promise<void> {
	for (const name of await readdir(folder).catch(() => [])) {
		if (name.startsWith(".pruned-")) {
			await removeTrash(`${folder}/${name}`);
		}
	}
}
/** Deletes one moved worktree; a process that still writes there can fail the delete, and the next prune tries again. */
export async function removeTrash(path: string): Promise<void> {
	await rm(path, { recursive: true, force: true, maxRetries: 3 }).catch(() => {});
}

function resolved(path: string): Promise<string> {
	return realpath(path).then(
		(value) => value,
		() => resolve(path),
	);
}
