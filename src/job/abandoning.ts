// The abandon of a finished job (A-001, T-26 (2)): `limen abandon <id>` gives up on the job and keeps its work on the
// branch `limen/abandon/<id>`. It is an operation of T-38 (src/operation.ts): its validate reads where the job's work
// stands (src/job/unlanded.ts) and refuses a job that has not finished, a member of an open group, a job whose worktree
// a newer record holds, and one with nothing to keep; its apply runs under the worktree lock that prune and publication
// take. Its steps are found again from git when the command runs again, since a terminal record takes no write before
// R-031 (T-38 (3)): (1) unless the branch exists, a commit of the worktree's whole state on the worktree's HEAD, made
// through a temporary index, so no hook of the project runs and the job's own branch stays where it is, and the branch
// made at it only while it does not exist, so two runs cannot both write it; a job whose worktree is gone gets the
// branch at its own branch's tip; (2) the worktree removed as prune removes one, only while the branch holds all of
// it and prune itself could remove it, else kept and named with the cause: it changed after the commit, a nested
// repository holds commits or changes the commit does not, or a commit the project's object store lacks, also when the
// worktree's HEAD records it (`unsavedNested`, which keeps such a worktree from every later removal too), it holds
// another registered worktree, Git locks it, or it is no worktree prune would take (src/runtime/pruning.ts); (3) the job's Herdr tab closed (T-18); (4) the branch and
// the commit printed. Ignored files go with the worktree, which is why the registry marks the command irreversible.
import { existsSync } from "node:fs";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { shownField } from "../boundary.ts";
import { settleJobTab } from "../integrations/herdr.ts";
import { runOperation, stepFailure } from "../operation.ts";
import { refused } from "../outcome.ts";
import {
	branchTip,
	commitTree,
	createBranchOnce,
	gitlinks,
	headCommit,
	limenRoot,
	treeOf,
	worktreeChanges,
	worktreeTree,
} from "../project/git.ts";
import { keptLine, removalBlock, removeTrash, removeWorktree, unsavedNested } from "../runtime/pruning.ts";
import { worktreeGuard } from "./publication.ts";
import { type JobReference, resolveJob } from "./reference.ts";
import { abandonBranch, hasWork, jobStanding, type Standing } from "./unlanded.ts";

/** Where step (1) takes the commit from: the branch an earlier run made, the worktree, or the job's own branch. */
type Source =
	| { readonly kind: "saved"; readonly commit: string }
	| { readonly kind: "worktree"; readonly path: string }
	| { readonly kind: "tip"; readonly commit: string };
/** What abandon's validate decided: the job, its repository, the branch it keeps the work on, and where from. */
type AbandonPlan = {
	readonly id: string;
	readonly jobDir: string;
	readonly jobsRoot: string;
	readonly repository: string;
	readonly branch: string;
	readonly source: Source;
	/** The job's worktree, when a checkout is there. */
	readonly worktree: string | undefined;
};
/**
 * What apply did: the commit the branch holds, whether this run made it, and what became of the worktree: removed, with
 * the trash it left for after the lock, or kept, with the cause.
 */
type Abandoned = {
	readonly commit: string;
	readonly made: boolean;
	readonly worktree:
		| { readonly path: string; readonly trash: string; readonly kept?: undefined }
		| { readonly path: string; readonly kept: string }
		| undefined;
};

/** Abandons the finished job `query` names; returns the text that says where its work is and what was removed. */
export async function abandonJob(query: JobReference, cwd: string, again: string | null = null): Promise<string> {
	const { plan, done } = await runOperation<AbandonPlan, { plan: AbandonPlan; done: Abandoned }>({
		again,
		validate: async (view) => {
			const root = limenRoot(cwd);
			const jobsRoot = `${root}/.limen/jobs`;
			const { id, jobDir } = await resolveJob(cwd, query, "control");
			const facts = await view.hold(`where the work of job ${id} stands`, async () => {
				const standing = await jobStanding(root, id, view);
				return { standing, ...branchTips(standing, id) };
			});
			return { id, jobDir, jobsRoot, ...decide(id, facts) };
		},
		lock: (plan) => worktreeGuard(plan.jobsRoot),
		apply: async (plan) => ({ plan, done: await applyAbandon(plan) }),
	});
	try {
		if (done.worktree && done.worktree.kept === undefined) {
			await removeTrash(done.worktree.trash);
		}
		await settleJobTab(plan.jobDir);
	} catch (error) {
		throw stepFailure(error);
	}
	return report(plan, done);
}

/** What validate holds of a job: where its work stands, and the tips of the branches step (1) may take. */
type Facts = { readonly standing: Standing; readonly saved: string | undefined; readonly tip: string | undefined };

/**
 * The commit `limen/abandon/<id>` holds, when an earlier run made it, and the tip of the job's own branch, when that
 * holds unlanded commits.
 */
function branchTips(standing: Standing, id: string): Omit<Facts, "standing"> {
	if (standing.kind !== "finished") {
		return { saved: undefined, tip: undefined };
	}
	const { repository, branch } = standing.work;
	return {
		saved: standing.abandoned ? branchTip(repository, abandonBranch(id)) : undefined,
		tip: branch ? branchTip(repository, branch) : undefined,
	};
}

/** Refuses a job abandon does not take, with the command that comes first; else where its work comes from. */
function decide(
	id: string,
	{ standing, saved, tip }: Facts,
): Pick<AbandonPlan, "repository" | "branch" | "source" | "worktree"> {
	if (standing.kind === "unfinished") {
		const state = standing.state ?? "without a record";
		throw refused(
			"JOB_NOT_FINISHED",
			`job ${id} is ${state}; abandon takes a finished job, so stop it first`,
			`limen stop ${id}`,
		);
	}
	if (standing.kind === "group") {
		throw refused(
			"JOB_IN_GROUP",
			`job ${id} is a member of the open group ${standing.group}, which holds its work until the group closes`,
		);
	}
	if (standing.kind === "taken") {
		throw refused(
			"JOB_CONTINUED",
			`the newer job ${standing.by} holds the worktree of job ${id} and the work in it; abandon that job instead`,
			`limen abandon ${standing.by}`,
		);
	}
	const { work } = standing;
	const base = { repository: work.repository, branch: abandonBranch(id), worktree: work.worktree };
	if (saved) {
		return { ...base, source: { kind: "saved", commit: saved } };
	}
	if (hasWork(work) && work.worktree) {
		return { ...base, source: { kind: "worktree", path: work.worktree } };
	}
	if (hasWork(work) && tip) {
		return { ...base, source: { kind: "tip", commit: tip } };
	}
	throw refused(
		"NO_UNLANDED_WORK",
		`job ${id} holds no unlanded work: no changed file in its worktree and no commit outside HEAD on its branch; prune removes what is left`,
		"limen prune",
	);
}

/**
 * Steps (1) and (2) under the worktree lock: the branch, then the worktree's removal unless `keptBecause` names a
 * cause. The temporary index lives in a folder of its own in the system's temporary folder, removed after.
 */
async function applyAbandon(plan: AbandonPlan): Promise<Abandoned> {
	const scratch = await mkdtemp(join(tmpdir(), "limen-abandon-"));
	const index = join(scratch, "index");
	try {
		const { source } = plan;
		const commit = source.kind === "saved" ? source.commit : saveWork(plan, source, index);
		const made = source.kind !== "saved";
		const path = plan.worktree && existsSync(plan.worktree) ? plan.worktree : undefined;
		if (path === undefined) {
			return { commit, made, worktree: undefined };
		}
		const kept = await keptBecause(plan, path, commit, index);
		if (kept !== undefined) {
			return { commit, made, worktree: { path, kept } };
		}
		return { commit, made, worktree: { path, trash: await removeWorktree(plan.repository, path) } };
	} finally {
		await rm(scratch, { recursive: true, force: true });
	}
}

/**
 * Why step (2) keeps the worktree at `path`: its state is not the commit's tree, a nested repository holds what the
 * commit does not (A-001: nothing goes that the branch does not hold), or prune could not remove it
 * (`removalBlock`). Undefined when it goes.
 */
async function keptBecause(
	plan: AbandonPlan,
	path: string,
	commit: string,
	index: string,
): Promise<string | undefined> {
	if (worktreeTree(path, index) !== treeOf(plan.repository, commit)) {
		return `it changed after the save, so ${plan.branch} does not hold its state`;
	}
	return (
		nestedWork(plan, path, commit) ??
		unsavedNested(path, plan.repository) ??
		(await removalBlock(plan.repository, path))
	);
}

/**
 * A nested repository whose state the commit does not hold: `add -A` saves one only as a gitlink to its checked-out
 * commit, so a gitlink that the worktree's HEAD does not hold at the same commit may name commits that live nowhere
 * else, and a nested repository's own changes and untracked files are in no tree at all. A gitlink at HEAD's commit
 * whose commit the project's object store lacks, as when the job committed that gitlink itself, is `unsavedNested`'s,
 * the rule every removal shares.
 */
function nestedWork(plan: AbandonPlan, path: string, commit: string): string | undefined {
	const head = gitlinks(path, "HEAD");
	for (const [nested, recorded] of gitlinks(path, commit)) {
		if (head.get(nested) !== recorded) {
			return `the nested repository ${shownField(nested)} holds commits that ${plan.branch} does not`;
		}
		if ((worktreeChanges(join(path, nested), plan.id)?.length ?? 0) > 0) {
			return `the nested repository ${shownField(nested)} holds changes that ${plan.branch} does not`;
		}
	}
	return undefined;
}

/** Step (1): the commit of the worktree's whole state on its HEAD, or the job's own tip, and the branch made there. */
function saveWork(plan: AbandonPlan, source: Exclude<Source, { kind: "saved" }>, index: string): string {
	const commit =
		source.kind === "tip"
			? source.commit
			: commitTree(source.path, worktreeTree(source.path, index), headCommit(source.path), `limen abandon ${plan.id}`);
	createBranchOnce(plan.repository, plan.branch, commit);
	return commit;
}

/** Step (4): where the work is now, and what became of the worktree. */
function report(plan: AbandonPlan, done: Abandoned): string {
	const saved = done.made
		? `saved job ${plan.id} on ${plan.branch} at ${done.commit}`
		: `job ${plan.id} is saved on ${plan.branch} at ${done.commit}`;
	if (!done.worktree) {
		return saved;
	}
	const { path, kept } = done.worktree;
	return [
		saved,
		kept === undefined ? `removed its worktree ${path}` : keptLine({ path, job: plan.id, reason: kept }),
	].join("\n");
}
