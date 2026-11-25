// Retire, a daily step of `limen seat sweep` (src/runtime/sweeping.ts, D-097 (4)), takes a finished job by its record's
// marker alone, since the git graph cannot tell a landed job from one with no commit, never one with unlanded work, and
// moves its folder whole, since only a person deletes a job's record (A-002, A-001; R-031, Decision 6). It waits until
// the marker is 24 hours old, so the owed wakes and the alerts of the job's end, which read `.limen/jobs/`, go out
// first (D-097 (4) (g)). The moves run under the jobs lock, the token draw's, so no draw meets a job in neither place
// (A-018), and each under the job's own lock, which every write of its record takes (D-097 (4) (h)). That lock is taken
// with one attempt, since a wait for it under the jobs lock would hold every spawn's token draw: a job whose lock is
// held elsewhere stays for the next daily run (R-101 review round 1, F5).
import { existsSync } from "node:fs";
import { basename, dirname, join, relative, resolve } from "node:path";
import { makeDurableFolder } from "../atomic-write.ts";
import { shownField } from "../boundary.ts";
import { retainedGroupJob } from "../job/group-cabinet.ts";
import { isTerminal } from "../job/job.ts";
import { archiveMonth, type JobRecord, jobFolders, readRecord } from "../job/record.ts";
import { jobsLock } from "../job/reference.ts";
import { unlandedWork } from "../job/unlanded.ts";
import { moveLockedFolder, withLock } from "../lock.ts";
import { unlandedBranches } from "../project/git.ts";
import { deleteLandedBranches, type PruneKept } from "./pruning.ts";

/** How old a job's `landed` or `abandoned` marker is before retire takes the job; a constant, as no setting chooses it. */
export const RETIRE_AFTER_MS = 24 * 60 * 60_000;

/** A job retire moved: its id and its folder in the archive, from the project's root. */
export type Retired = { readonly id: string; readonly to: string };
/**
 * What one retire did: the jobs it moved, the jobs it kept because another process held their own lock, how many
 * landed branches it deleted, and the worktree of each finished job that holds unlanded work, which it keeps with its
 * record, as prune does.
 */
export type RetireResult = {
	readonly retired: readonly Retired[];
	readonly held: readonly string[];
	readonly branches: number;
	readonly kept: readonly PruneKept[];
};

/**
 * The line of a job retire moved, its id and its folder escaped as `keptLine` escapes a path, since the sweep's lines
 * reach the coordinator's model (z. 15, R-101 review round 1, F3).
 */
export function retiredLine({ id, to }: Retired): string {
	return `retired ${shownField(id)} to ${shownField(to)}`;
}

/** The line of a job retire kept because another process held its own lock, which the next daily retire takes. */
export function heldLine(id: string): string {
	return `kept job ${shownField(id)} for the next daily retire: another process holds its lock`;
}

/** A job retire takes: its folder, its record as the first read found it, and its folder in the archive. */
type Candidate = { readonly id: string; readonly jobDir: string; readonly record: JobRecord; readonly to: string };

/** Retires the marked jobs of the project at `root` whose marker is at least `RETIRE_AFTER_MS` old; returns what it did. */
export async function retireMarkedJobs(root: string): Promise<RetireResult> {
	const holding = await unlandedWork(root);
	const kept = holding.flatMap((work) => (work.worktree ? [{ path: work.worktree, job: work.id }] : []));
	const candidates = await markedJobs(root, new Set(holding.map((work) => work.id)));
	if (candidates.length === 0) {
		return { retired: [], held: [], branches: 0, kept };
	}
	// Branches go before records: a record names the finished worktree that may still hold its branch.
	const results = await deleteLandedBranches(root, landedBranches(root, candidates));
	const stays = new Set(results.flatMap((result) => (result.worktree?.job ? [result.worktree.job] : [])));
	const staying = [...kept, ...results.flatMap((result) => (result.worktree ? [result.worktree] : []))];
	const { retired, held } = await withLock(jobsLock(root), () => moveJobs(root, candidates, stays));
	return { retired, held, branches: results.filter((result) => !result.kept).length, kept: staying };
}

/**
 * The finished jobs of `.limen/jobs/` whose marker is old enough, outside an open group and not among `holding`, the
 * jobs with unlanded work; each with its folder in the archive.
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

/**
 * The time of a finished record's marker, `landed` before `abandoned`, once it is at least `RETIRE_AFTER_MS` old;
 * undefined for a record retire does not take, also one whose marker is younger.
 */
function markedAt(record: JobRecord): string | undefined {
	const at = isTerminal(record.state) ? (record.landed?.at ?? record.abandoned?.at) : undefined;
	return at !== undefined && Date.now() - Date.parse(at) >= RETIRE_AFTER_MS ? at : undefined;
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
 * Under the jobs lock: for each candidate whose folder is still there, makes the month's folder and syncs its name,
 * since the move is the one place a record leaves `.limen/jobs/` (R-031, review round 2, G5), then, under the job's own
 * lock, taken with one attempt, reads its record again and moves its folder to the archive in one rename
 * (`moveLockedFolder`). A candidate whose folder is gone, as another retire moved it, whose record no longer holds an
 * old enough marker, or whose landed branch stays with a worktree kept for it (`stays`), is left where it is; one whose
 * lock another process holds is left too, and named in `held`.
 */
async function moveJobs(
	root: string,
	candidates: readonly Candidate[],
	stays: ReadonlySet<string>,
): Promise<{ readonly retired: Retired[]; readonly held: string[] }> {
	const retired: Retired[] = [];
	const held: string[] = [];
	for (const job of candidates) {
		if (stays.has(job.id) || !existsSync(job.jobDir)) {
			continue;
		}
		await makeDurableFolder(dirname(job.to));
		const again = async () => {
			const record = await readRecord(job.jobDir);
			return record !== undefined && markedAt(record) !== undefined;
		};
		const moved = await moveLockedFolder(job.jobDir, job.to, again, { mode: "skip" });
		if (moved === undefined) {
			held.push(job.id);
		} else if (moved) {
			retired.push(shown(root, job));
		}
	}
	return { retired, held };
}

/** The job as retire's lines name it: its id and its archive folder from the project's root. */
function shown(root: string, job: Candidate): Retired {
	return { id: basename(job.jobDir), to: relative(root, job.to) };
}
