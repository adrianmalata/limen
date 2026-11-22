// The prune of finished worktrees and the delete of landed branches (T-26 (2)): a job's setup prunes before its engine
// starts (src/runtime/job-setup.ts), `limen land` deletes the branch it merged, and `limen prune` runs both. No removal
// takes a worktree that `git status` shows dirty, whatever job names it, or the worktree of a finished job whose
// unlanded work nothing resolved (A-001, src/job/unlanded.ts); `limen abandon` removes one only once its state is on
// a branch and only what prune could remove itself (src/job/abandoning.ts), through `removalBlock`, `removeWorktree`
// and `removeTrash` here.
import { randomUUID } from "node:crypto";
import { readdir, realpath, rm } from "node:fs/promises";
import { basename, dirname, resolve } from "node:path";
import { atomicRename } from "../atomic-write.ts";
import { shownField } from "../boundary.ts";
import { retainedGroupJob } from "../job/group-cabinet.ts";
import { isTerminal } from "../job/job.ts";
import { worktreeLock } from "../job/publication.ts";
import { appendLimenLog, type JobRecord, jobFolders, readRecord } from "../job/record.ts";
import { unlandedWork } from "../job/unlanded.ts";
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
import { STARTUP_GRACE_MS, startingJob } from "./reap.ts";

/** One path that prune removed: the job that recorded it, when one did, and why no job kept it. */
export type PruneRemoval = { readonly path: string; readonly jobDir: string | undefined; readonly reason: string };
/**
 * A worktree that stays: its path, the job that holds it, when one does, and why, `unlanded work` unless a cause is
 * given, as `limen abandon` gives one.
 */
export type PruneKept = { readonly path: string; readonly job: string | undefined; readonly reason?: string };
/** What one prune did: the paths it removed and the worktrees it kept for their unlanded work. */
export type PruneResult = { readonly removed: readonly PruneRemoval[]; readonly kept: readonly PruneKept[] };
/** Why prune removes a worktree some job recorded; a job that keeps it never gets here. */
type PruneOwners = Map<string, { readonly jobDir: string; readonly reason: string }>;
export function pruneLine(removal: PruneRemoval): string {
	return `pruned ${removal.path} (job ${removal.jobDir ? basename(removal.jobDir) : "none"}): ${removal.reason}`;
}
/**
 * The one line of every kept worktree (z. 10), from prune, the setup prune, land, `prune --retire` and abandon: it
 * names the worktree and the job, and says why.
 */
export function keptLine(kept: PruneKept): string {
	return `kept ${shownField(kept.path)} (job ${kept.job ?? "none"}): ${kept.reason ?? "unlanded work"}`;
}
/**
 * Why the checkout at `path` holds state the project's repository cannot hold: a nested repository whose commit its
 * object store lacks (`unsavedGitlink`), the one rule prune, the setup prune, land, `prune --retire` and abandon keep a
 * worktree by, like a dirty one, whatever job names it and whether or not that job is resolved (R-030). The cause names
 * the nested path, escaped; undefined when there is none.
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
 * Prunes, writes each line to this job's log and each removal's line to the log of the job whose worktree went too;
 * returns the count of removals.
 */
export async function pruneForJob(jobDir: string, root: string, keep: readonly string[]): Promise<number> {
	const { removed, kept } = await pruneFinishedWorktrees(root, keep);
	for (const removal of removed) {
		const line = pruneLine(removal);
		await appendLimenLog(jobDir, line);
		if (removal.jobDir && removal.jobDir !== jobDir) {
			await appendLimenLog(removal.jobDir, line).catch(() => {});
		}
	}
	for (const each of kept) {
		await appendLimenLog(jobDir, keptLine(each));
	}
	return removed.length;
}
export async function pruneFinishedWorktrees(root: string, keep: readonly string[] = []): Promise<PruneResult> {
	const jobsRoot = `${root}/.limen/jobs`;
	const keepPaths = new Set<string>();
	for (const path of keep) {
		keepPaths.add(await resolved(path));
	}
	const { repositories, removals, owners } = await removeUnstartedRecords(root, jobsRoot);
	const kept: PruneKept[] = [];
	for (const repository of repositories) {
		const pruned = await pruneRepositoryWorktrees(repository, root, keepPaths, owners);
		removals.push(...pruned.removed);
		kept.push(...pruned.kept);
	}
	return { removed: removals, kept };
}
/**
 * The one rule every removal obeys: a job keeps its record and its worktree while it is starting, running, or in an
 * open group. Starting is a record its wrapper has not run yet whose spawner lives or whose startup grace runs. Prune
 * does not ask whether a running job's process lives; the sweep finalizes a dead job first.
 */
async function jobKeeps(jobDir: string, record: JobRecord | undefined): Promise<boolean> {
	if (record && record.state !== "starting") {
		return !isTerminal(record.state) || retainedGroupJob(jobDir);
	}
	const startedAt = Date.parse(record?.startedAt ?? "");
	if ((Number.isFinite(startedAt) && Date.now() - startedAt < STARTUP_GRACE_MS) || startingJob(record)) {
		return true;
	}
	return retainedGroupJob(jobDir);
}
/** Whether the record's job ever ran: a record past `starting`. A folder without a record never did. */
function started(record: JobRecord | undefined): boolean {
	return record !== undefined && record.state !== "starting";
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
	{ repository, branch }: LandedBranch,
	use: BranchUse | undefined,
	checkouts: Map<string, readonly GitWorktree[]>,
	trashRoots: Set<string>,
): Promise<BranchResult> {
	if (!branch.startsWith("limen/") || use?.busy || !branchExists(repository, branch)) {
		return { branch, kept: use?.busy ? `job ${use.busy} still uses it` : "not a present limen/ branch" };
	}
	if (!checkouts.has(repository)) {
		pruneWorktrees(repository);
		checkouts.set(repository, listWorktrees(repository));
	}
	const holder = checkouts.get(repository)?.find((worktree) => worktree.branch === branch);
	const path = holder ? await resolved(holder.path) : undefined;
	if (holder?.locked || (path && !use?.worktrees.has(path))) {
		return { branch, kept: `it is checked out at ${path}${holder?.locked ? ", which is locked" : ""}` };
	}
	try {
		// A Git failure of a check keeps the branch and the worktree too.
		const job = path ? use?.worktrees.get(path) : undefined;
		const registered = await Promise.all((checkouts.get(repository) ?? []).map((worktree) => resolved(worktree.path)));
		const stays = path ? keptHolder({ path, job }, repository, registered) : undefined;
		if (stays) {
			return { branch, kept: stays.reason ?? "its worktree holds unlanded work", worktree: stays };
		}
		if (path) {
			trashRoots.add(dirname(path));
			await detach(path);
			pruneWorktrees(repository);
		}
		deleteBranch(repository, branch);
		return { branch };
	} catch (error) {
		return { branch, kept: error instanceof Error ? error.message.trim() : String(error) };
	}
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
/**
 * Removes each record that never started and no longer starts, and a folder without a record, and says why the
 * worktree it named goes. Names the repositories whose worktrees the prune visits: those of jobs that started, else
 * the root.
 */
async function removeUnstartedRecords(
	root: string,
	jobsRoot: string,
): Promise<{ repositories: Set<string>; removals: PruneRemoval[]; owners: PruneOwners }> {
	const repositories = new Set<string>();
	const removals: PruneRemoval[] = [];
	const owners: PruneOwners = new Map();
	for (const id of await jobFolders(jobsRoot)) {
		const jobDir = `${jobsRoot}/${id}`;
		const record = await readRecord(jobDir);
		if (started(record)) {
			repositories.add(record?.repo ? workspaceRepository(root, record.repo) : root);
			continue;
		}
		if (await jobKeeps(jobDir, record)) {
			continue;
		}
		const tree = record?.worktree;
		if (tree) {
			owners.set(await resolved(tree), { jobDir, reason: "its record never started and was removed" });
		}
		await rm(jobDir, { recursive: true, force: true });
		removals.push({ path: jobDir, jobDir, reason: "record never started and its spawner is gone" });
	}
	if (repositories.size === 0) {
		repositories.add(root);
	}
	return { repositories, removals, owners };
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
	keepPaths: ReadonlySet<string>,
	removedOwners: PruneOwners,
): Promise<PruneResult> {
	const jobsRoot = `${root}/.limen/jobs`;
	const worktreeRoot = await resolved(worktreeRootOf(repository));
	const listed = await removalCandidates(repository, worktreeRoot);
	const result = await worktreeLock(jobsRoot, async () => {
		const { kept, owners } = await worktreeClaims(jobsRoot, keepPaths);
		const unlanded = await unlandedWorktrees(root);
		const pass: PrunePass = { ...listed, repository, kept, owners, removedOwners, unlanded };
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
};
/**
 * The removals of one prune, deepest first (A-001): what a kept job keeps stays, with what is inside it; a worktree with
 * unlanded work, one `git status` shows dirty, or one with a nested commit the project's repository lacks
 * (`unsavedNested`), read before anything moves, stays and is named, with what is inside it, a held one inside it named
 * too; and a candidate that still holds a registered worktree once the worktrees below
 * it were decided stays, named with that cause, since its removal would take that one with it.
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
		if (!(await detach(path))) {
			continue;
		}
		present.delete(path);
		const owner = pass.owners.get(path) ?? pass.removedOwners.get(path);
		const why = registered ? "no job records this worktree" : "directory is not a registered Git worktree";
		removed.push({ path, jobDir: owner?.jobDir, reason: owner?.reason ?? why });
	}
	return { removed: removed.reverse(), kept: kept.reverse() };
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
/** The worktrees jobs keep, with `keepPaths`; for each other recorded worktree, the latest record and why it goes. */
async function worktreeClaims(
	jobsRoot: string,
	keepPaths: ReadonlySet<string>,
): Promise<{ kept: Set<string>; owners: PruneOwners }> {
	const kept = new Set(keepPaths);
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
			owners.set(path, { jobDir, reason: `job ${started(record) ? record?.state : "never started"}` });
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
