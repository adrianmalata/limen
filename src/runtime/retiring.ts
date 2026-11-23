// Retire takes a finished job by its record's marker alone, since the git graph cannot tell a landed job from one with
// no commit, never one with unlanded work, and moves its folder whole, since only a person deletes a job's record
// (A-002, A-001; R-031, Decision 6). The moves run under the jobs lock, the token draw's, so no draw meets a job in
// neither place (A-018).
import { existsSync } from "node:fs";
import { basename, dirname, join, relative, resolve } from "node:path";
import { atomicRename, makeDurableFolder } from "../atomic-write.ts";
import { retainedGroupJob } from "../job/group-cabinet.ts";
import { isTerminal } from "../job/job.ts";
import { archiveMonth, type JobRecord, jobFolders, readRecord } from "../job/record.ts";
import { jobsLock } from "../job/reference.ts";
import { unlandedWork } from "../job/unlanded.ts";
import { withLock } from "../lock.ts";
import { unlandedBranches } from "../project/git.ts";
import { deleteLandedBranches, type PruneKept, plannedLandedBranches } from "./pruning.ts";

/** A job retire moved, or with `dryRun` would move: its id and its folder in the archive, from the project's root. */
export type Retired = { readonly id: string; readonly to: string };
/**
 * What one retire did: the jobs it moved, how many landed branches it deleted, and the worktree of each finished job
 * that holds unlanded work, which it keeps with its record, as prune does.
 */
export type RetireResult = {
	readonly retired: readonly Retired[];
	readonly branches: number;
	readonly kept: readonly PruneKept[];
};

/** A job retire takes: its folder, its record as the first read found it, and its folder in the archive. */
type Candidate = { readonly id: string; readonly jobDir: string; readonly record: JobRecord; readonly to: string };

/**
 * Retires the marked jobs of the project at `root`, or with `dryRun` only names them, as the run decides them, and
 * the worktrees it would keep; returns what it did.
 */
export async function retireMarkedJobs(root: string, dryRun: boolean): Promise<RetireResult> {
	const holding = await unlandedWork(root);
	const kept = holding.flatMap((work) => (work.worktree ? [{ path: work.worktree, job: work.id }] : []));
	const candidates = await markedJobs(root, new Set(holding.map((work) => work.id)));
	if (candidates.length === 0) {
		return { retired: [], branches: 0, kept };
	}
	// Branches go before records: a record names the finished worktree that may still hold its branch.
	const owned = landedBranches(root, candidates);
	const results = await (dryRun ? plannedLandedBranches(root, owned) : deleteLandedBranches(root, owned));
	const stays = new Set(results.flatMap((result) => (result.worktree?.job ? [result.worktree.job] : [])));
	const staying = [...kept, ...results.flatMap((result) => (result.worktree ? [result.worktree] : []))];
	if (dryRun) {
		return {
			retired: candidates.filter((job) => !stays.has(job.id)).map((job) => shown(root, job)),
			branches: 0,
			kept: staying,
		};
	}
	const retired = await withLock(jobsLock(root), () => moveJobs(root, candidates, stays));
	return { retired, branches: results.filter((result) => !result.kept).length, kept: staying };
}

/**
 * The finished jobs of `.limen/jobs/` that hold a marker, outside an open group and not among `holding`, the jobs with
 * unlanded work; each with its folder in the archive.
 */
async function markedJobs(root: string, holding: ReadonlySet<string>): Promise<Candidate[]> {
	const jobsRoot = join(root, ".limen", "jobs");
	const candidates: Candidate[] = [];
	for (const id of await jobFolders(jobsRoot)) {
		const jobDir = join(jobsRoot, id);
		const record = await readRecord(jobDir);
		const at = record ? markedAt(record) : undefined;
		if (record && at !== undefined && !holding.has(id) && !(await retainedGroupJob(jobDir))) {
			candidates.push({ id, jobDir, record, to: join(archiveMonth(root, at), id) });
		}
	}
	return candidates;
}

/** The time of a finished record's marker, `landed` before `abandoned`; undefined for a record retire does not take. */
function markedAt(record: JobRecord): string | undefined {
	return isTerminal(record.state) ? (record.landed?.at ?? record.abandoned?.at) : undefined;
}

/**
 * The own branch of each landed job among `candidates` that holds no commit outside HEAD of its repository: a branch
 * with such a commit stays, whatever its job's marker says, since only the graph can say that it holds nothing more.
 */
function landedBranches(root: string, candidates: readonly Candidate[]): { repository: string; branch: string }[] {
	const owned = candidates.flatMap(({ record }) =>
		record.landed && record.branch && record.role !== "reviewer"
			? [{ repository: record.repo ? resolve(root, record.repo) : root, branch: record.branch }]
			: [],
	);
	return [...Map.groupBy(owned, (entry) => entry.repository)].flatMap(([repository, entries]) => {
		if (!existsSync(join(repository, ".git"))) {
			return [];
		}
		const unlanded = unlandedBranches(
			repository,
			entries.map((entry) => entry.branch),
		);
		return entries.filter((entry) => !unlanded.has(entry.branch));
	});
}

/**
 * Under the jobs lock: reads each candidate's record again and moves its folder to the archive in one rename, after
 * the month's folder is made and its name synced, since the move is the one place a record leaves `.limen/jobs/`
 * (R-031, review round 2, G5); a candidate whose folder is gone, as another retire moved it, or whose landed branch
 * stays with a worktree kept for it (`stays`), is left where it is.
 */
async function moveJobs(
	root: string,
	candidates: readonly Candidate[],
	stays: ReadonlySet<string>,
): Promise<Retired[]> {
	const retired: Retired[] = [];
	for (const job of candidates) {
		const record = stays.has(job.id) ? undefined : await readRecord(job.jobDir);
		if (record === undefined || markedAt(record) === undefined) {
			continue;
		}
		await makeDurableFolder(dirname(job.to));
		await atomicRename(job.jobDir, job.to);
		retired.push(shown(root, job));
	}
	return retired;
}

/** The job as retire's lines name it: its id and its archive folder from the project's root. */
function shown(root: string, job: Candidate): Retired {
	return { id: basename(job.jobDir), to: relative(root, job.to) };
}
