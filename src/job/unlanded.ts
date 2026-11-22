// The unlanded work of finished jobs (A-001, R-030), the one reading of it that prune, spawn, `limen status` and
// `limen abandon` share (T-25 (1)). A finished job has unlanded work when its worktree is there and `git status` lists
// anything in it (changes, deletions and untracked files, not ignored ones), or when its own branch holds commits that
// HEAD of its repository's primary checkout does not reach (`unlandedBranches`). The work belongs to the newest record
// that names it: an older record on the same worktree, a continued parent, carries nothing, and a member of an open
// group carries nothing while the group holds it. A review job's branch is its candidate's, so it carries only its
// worktree. The work is resolved once it lands, once a newer job takes the worktree (`limen continue`), or once the
// branch `limen/abandon/<id>` exists (R-030; R-031 adds the record's own marker). Every read is a read: `git status`
// runs without optional locks, so it refreshes no index (T-04).
import { existsSync, realpathSync } from "node:fs";
import { resolve } from "node:path";
import type { StateView } from "../operation.ts";
import { isRefusal } from "../outcome.ts";
import { branchesBelow, commitsOutsideHead, unlandedBranches, worktreeChanges } from "../project/git.ts";
import { jobMembership } from "./group-cabinet.ts";
import { isTerminal } from "./job.ts";
import { type JobRecord, type JobState, jobFolders, readRecord } from "./record.ts";

/** The reads of the job records this module makes: a validate's view (src/operation.ts), or the records themselves. */
export type JobReader = Pick<StateView, "jobs" | "record">;
const RECORDS: JobReader = { jobs: jobFolders, record: readRecord };

/** The folder of the branches `limen abandon` keeps the work of abandoned jobs on. */
const ABANDONED = "limen/abandon/";

/** The branch that holds the work `limen abandon` saved of the job `id`. */
export function abandonBranch(id: string): string {
	return `${ABANDONED}${id}`;
}

/** What a finished job that holds its work leaves outside HEAD (A-001). */
export type Work = {
	readonly id: string;
	readonly jobDir: string;
	readonly state: JobState;
	/** The workspace repository the record names, or null for the project's own. */
	readonly repo: string | null;
	/** The primary checkout of the job's repository. */
	readonly repository: string;
	/** The job's worktree as its record names it, when a checkout is there. */
	readonly worktree: string | undefined;
	/** The paths `git status` lists in the worktree. */
	readonly changed: readonly string[];
	/**
	 * The job's own branch, when its record is the newest non-review record that names the branch in its repository, and
	 * how many commits the branch holds that HEAD does not reach (0 once it landed).
	 */
	readonly branch: string | undefined;
	readonly commits: number;
};

/**
 * Where one job's work stands: a job that has not finished; a member of an open group, named as `<feature> (<id>)`;
 * a finished job whose worktree a newer record holds (`by`); or a finished job with what it holds, and whether its
 * `limen/abandon/<id>` exists.
 */
export type Standing =
	| { readonly kind: "unfinished"; readonly state: JobState | undefined }
	| { readonly kind: "group"; readonly group: string }
	| { readonly kind: "taken"; readonly by: string }
	| { readonly kind: "finished"; readonly work: Work; readonly abandoned: boolean };

/** Whether `work` holds anything that is not on HEAD: a changed path or an unlanded commit. */
export function hasWork(work: Work): boolean {
	return work.changed.length > 0 || work.commits > 0;
}

/** What `work` holds, as spawn's refusal and `limen status` say it: its changed files and its unlanded commits. */
export function unlandedSummary(work: Work): string {
	const files = `${work.changed.length} changed file${work.changed.length === 1 ? "" : "s"}`;
	return `${files}, ${work.commits} unlanded commit${work.commits === 1 ? "" : "s"}`;
}

/**
 * A worker spawn with `--branch`: its repository, the branch, and the worktree it reuses, the one that has the branch
 * checked out, when there is one.
 */
export type Takeover = { readonly repository: string; readonly branch: string; readonly reuses: string | undefined };

/**
 * Whether the spawn `takeover` takes over the work of `work`'s job (R-030), as a continuation does: the branch is the
 * job's own, and the spawn reuses the job's worktree or the job's worktree is gone. A job whose worktree is there
 * without that branch checked out keeps its work, so it still makes the spawn refuse.
 */
export function takesOver(work: Work, takeover: Takeover): boolean {
	const own = work.branch === takeover.branch && pathKey(work.repository) === pathKey(takeover.repository);
	const reused = work.worktree !== undefined && takeover.reuses !== undefined;
	return own && (work.worktree === undefined || (reused && pathKey(work.worktree) === pathKey(takeover.reuses ?? "")));
}

/** The finished jobs of the project at `root` whose unlanded work no landing, continuation or abandon resolved. */
export async function unlandedWork(root: string, reader: JobReader = RECORDS): Promise<Work[]> {
	const project = await projectJobs(root, reader);
	const standings = await standingsOf(project, project.entries);
	return standings.flatMap((standing) =>
		standing.kind === "finished" && !standing.abandoned && hasWork(standing.work) ? [standing.work] : [],
	);
}

/** Where the work of the job `id` of the project at `root` stands; a job with no record has not finished. */
export async function jobStanding(root: string, id: string, reader: JobReader = RECORDS): Promise<Standing> {
	const project = await projectJobs(root, reader);
	const entry = project.entries.find((candidate) => candidate.id === id);
	if (!entry) {
		return { kind: "unfinished", state: undefined };
	}
	const [standing] = await standingsOf(project, [entry]);
	return standing ?? { kind: "unfinished", state: undefined };
}

/** A record of the project with the keys its work is held by: its worktree's path and its own branch. */
type Entry = {
	readonly id: string;
	readonly jobDir: string;
	readonly record: JobRecord;
	readonly repository: string;
	readonly worktree: string | undefined;
	readonly branch: string | undefined;
};
/** The records of a project, and for each worktree and each own branch the newest record that names it. */
type Project = {
	readonly entries: readonly Entry[];
	readonly worktrees: ReadonlyMap<string, Entry>;
	readonly branches: ReadonlyMap<string, Entry>;
};

async function projectJobs(root: string, reader: JobReader): Promise<Project> {
	const jobsRoot = `${root}/.limen/jobs`;
	const entries: Entry[] = [];
	for (const id of await reader.jobs(jobsRoot)) {
		const jobDir = `${jobsRoot}/${id}`;
		const record = await reader.record(jobDir);
		if (!record) {
			continue;
		}
		const repository = record.repo ? resolve(root, record.repo) : root;
		// A review job's branch is its candidate's, which it never holds.
		const branch = record.branch && record.role !== "reviewer" ? record.branch : undefined;
		const worktree = record.worktree ? pathKey(record.worktree) : undefined;
		entries.push({ id, jobDir, record, repository, worktree, branch });
	}
	const worktrees = new Map<string, Entry>();
	const branches = new Map<string, Entry>();
	for (const entry of entries) {
		keepNewest(worktrees, entry.worktree, entry);
		keepNewest(branches, entry.branch && `${entry.repository}\0${entry.branch}`, entry);
	}
	return { entries, worktrees, branches };
}

/** Puts `entry` at `key` unless a newer record is there: the later start, then the later id. */
function keepNewest(held: Map<string, Entry>, key: string | undefined, entry: Entry): void {
	const other = key === undefined ? undefined : held.get(key);
	if (key === undefined || (other && order(other) > order(entry))) {
		return;
	}
	held.set(key, entry);
}
function order(entry: Entry): string {
	return `${entry.record.startedAt ?? entry.record.transitions[0]?.at ?? ""}\0${entry.id}`;
}

/** The standing of each of `entries`, with the branch facts read once per repository. */
async function standingsOf(project: Project, entries: readonly Entry[]): Promise<Standing[]> {
	const held: { readonly entry: Entry; readonly changed: readonly string[] | undefined }[] = [];
	const standings = new Map<Entry, Standing>();
	for (const entry of entries) {
		const standing = await heldStanding(project, entry);
		if (standing) {
			standings.set(entry, standing);
		} else {
			const { worktree } = entry.record;
			held.push({ entry, changed: worktree ? worktreeChanges(worktree, entry.id) : undefined });
		}
	}
	const facts = branchFacts(
		project,
		held.map(({ entry }) => entry),
	);
	for (const { entry, changed } of held) {
		// No fact: the repository is gone, so no branch of the job is left there.
		const fact = facts.get(entry);
		const work: Work = {
			id: entry.id,
			jobDir: entry.jobDir,
			state: entry.record.state,
			repo: entry.record.repo,
			repository: entry.repository,
			worktree: changed === undefined ? undefined : (entry.record.worktree ?? undefined),
			changed: changed ?? [],
			branch: fact?.branch,
			commits: fact?.commits ?? 0,
		};
		standings.set(entry, { kind: "finished", work, abandoned: fact?.abandoned ?? false });
	}
	return entries.flatMap((entry) => standings.get(entry) ?? []);
}

/** The standing of a job that holds no work of its own: not finished, in an open group, or taken by a newer record. */
async function heldStanding(project: Project, entry: Entry): Promise<Standing | undefined> {
	if (!isTerminal(entry.record.state)) {
		return { kind: "unfinished", state: entry.record.state };
	}
	const group = await openGroup(entry.jobDir);
	if (group) {
		return { kind: "group", group };
	}
	const holder = entry.worktree === undefined ? undefined : project.worktrees.get(entry.worktree);
	return holder && holder !== entry ? { kind: "taken", by: holder.id } : undefined;
}

/** What the branches say of one job: its own branch, its commits outside HEAD, and whether it was abandoned. */
type BranchFact = { readonly branch: string | undefined; readonly commits: number; readonly abandoned: boolean };
/**
 * For each of `entries`, its own branch, when it is the newest record on that branch, with the commits it holds outside
 * HEAD, and whether its `limen/abandon/<id>` exists: per repository, at most four Git processes for the branches
 * (`unlandedBranches`), one `rev-list` for each unlanded one, and one for the abandoned ones. A repository that is
 * gone holds no branch.
 */
function branchFacts(project: Project, entries: readonly Entry[]): Map<Entry, BranchFact> {
	const facts = new Map<Entry, BranchFact>();
	for (const [repository, jobs] of Map.groupBy(entries, (entry) => entry.repository)) {
		if (!existsSync(`${repository}/.git`)) {
			continue;
		}
		const own = (entry: Entry): string | undefined =>
			entry.branch && project.branches.get(`${repository}\0${entry.branch}`) === entry ? entry.branch : undefined;
		const branches = jobs.flatMap((entry) => own(entry) ?? []);
		const unlanded = branches.length > 0 ? unlandedBranches(repository, branches) : new Set<string>();
		const abandoned = branchesBelow(repository, ABANDONED);
		for (const entry of jobs) {
			const branch = own(entry);
			facts.set(entry, {
				branch,
				commits: branch && unlanded.has(branch) ? commitsOutsideHead(repository, branch) : 0,
				abandoned: abandoned.has(abandonBranch(entry.id)),
			});
		}
	}
	return facts;
}

/**
 * The open group the job is a member of, as `<feature> (<id>)`; none when it is in none. A group record that cannot
 * be read holds nothing, so the job's work counts (z. 29): `limen group status` names what is wrong with it.
 */
async function openGroup(jobDir: string): Promise<string | undefined> {
	try {
		const membership = await jobMembership(jobDir);
		return membership?.run.closed === false ? `${membership.run.feature} (${membership.run.id})` : undefined;
	} catch (error) {
		if (isRefusal(error)) {
			return undefined;
		}
		throw error;
	}
}

/** The real path of `path`, by which two records name one worktree, or the path itself once nothing is there. */
function pathKey(path: string): string {
	return existsSync(path) ? realpathSync(path) : resolve(path);
}
