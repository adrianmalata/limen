// The abandon of a finished job (A-001, T-26 (2)): it keeps the job's work on the branch `limen/abandon/<id>` and
// removes the worktree only while that branch holds all of it, so nothing goes that Git does not hold (R-030, D-088),
// and only then writes the `abandoned` marker that resolves the job, since a marker never hides work (R-031,
// Decisions 3 and 5). Ignored files go with the worktree, which is why the registry marks the command irreversible.
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
	namesUnsavedCommit,
	treeOf,
	worktreeChanges,
	worktreeTree,
} from "../project/git.ts";
import { keptLine, removalBlock, removeTrash, removeWorktree, unsavedNested } from "../runtime/pruning.ts";
import { worktreeGuard } from "./publication.ts";
import { type Abandoned, writeMarker } from "./record.ts";
import { type JobReference, resolveJob } from "./reference.ts";
import { abandonBranch, hasWork, holdsTip, jobStanding, type Standing, type Work } from "./unlanded.ts";

/**
 * Where step (1) takes the commit from: the branch an earlier run made, the worktree, or the job's own branch; or
 * nowhere, for a job whose record holds the `abandoned` marker, with the commit its branch points at now, if any.
 */
type Source =
	| { readonly kind: "saved"; readonly commit: string }
	| { readonly kind: "worktree"; readonly path: string }
	| { readonly kind: "tip"; readonly commit: string }
	| { readonly kind: "marked"; readonly marker: Abandoned; readonly now: string | undefined };
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
type Applied = {
	readonly commit: string;
	readonly made: boolean;
	readonly worktree:
		| { readonly path: string; readonly trash: string; readonly kept?: undefined }
		| { readonly path: string; readonly kept: string }
		| undefined;
};

/** Abandons the finished job `query` names; returns the text that says where its work is and what was removed. */
export async function abandonJob(query: JobReference, cwd: string, again: string | null = null): Promise<string> {
	const { plan, done } = await runOperation<AbandonPlan, { plan: AbandonPlan; done: Applied }>({
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

/**
 * What validate holds of a job: where its work stands, the tips of the branches step (1) may take, and, for an
 * unmarked job whose worktree is gone, whether the first holds the second.
 */
type Facts = {
	readonly standing: Standing;
	readonly saved: string | undefined;
	readonly tip: string | undefined;
	readonly savedHoldsTip: boolean | undefined;
};

/**
 * The commit the abandon branch holds (the marker's branch, else `limen/abandon/<id>`), whether or not an earlier run
 * got as far as the marker; the tip of the job's own branch; and, for an unmarked job with the worktree gone and both
 * there, whether the first holds the second, since nothing else can say then that the branch is the job's save.
 */
function branchTips(standing: Standing, id: string): Omit<Facts, "standing"> {
	if (standing.kind !== "finished") {
		return { saved: undefined, tip: undefined, savedHoldsTip: undefined };
	}
	const { repository, branch, worktree } = standing.work;
	const saved = branchTip(repository, standing.abandoned?.branch ?? abandonBranch(id));
	const tip = branch ? branchTip(repository, branch) : undefined;
	const check = !standing.abandoned && saved !== undefined && tip !== undefined && worktree === undefined;
	return { saved, tip, savedHoldsTip: check ? holdsTip(repository, saved, tip) : undefined };
}

/** Refuses a job abandon does not take, with the command that comes first; else where its work comes from. */
function decide(id: string, facts: Facts): Pick<AbandonPlan, "repository" | "branch" | "source" | "worktree"> {
	const { standing } = facts;
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
	return finishedSource(id, standing.work, standing.abandoned, facts);
}

/**
 * Where the work of a finished job comes from. A job abandon marked changes nothing again (T-28 (3); R-031, review
 * round 1, F7). With the worktree gone, an abandon branch that does not hold the tip of the job's branch is no save of
 * this job, which a marker would hide (R-031, Decision 3; review round 1, F3).
 */
function finishedSource(
	id: string,
	work: Work,
	marker: Abandoned | undefined,
	{ saved, tip, savedHoldsTip }: Facts,
): Pick<AbandonPlan, "repository" | "branch" | "source" | "worktree"> {
	const base = { repository: work.repository, branch: marker?.branch ?? abandonBranch(id), worktree: work.worktree };
	if (marker) {
		return { ...base, source: { kind: "marked", marker, now: saved } };
	}
	if (saved && savedHoldsTip === false) {
		throw refused(
			"ABANDON_BRANCH_LACKS_WORK",
			`${base.branch} is at ${saved}, which does not hold ${tip}, the tip of the branch ${work.branch} of job ${id}, so it is no save of this job; move that branch aside with git branch -m, then abandon the job again`,
		);
	}
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
		`job ${id} holds no unlanded work: no changed file in its worktree and no commit outside HEAD on its branch; the daily prune of limen seat sweep removes what is left`,
		"limen seat sweep",
	);
}

/**
 * The steps under the worktree lock, each found again from Git and the record when the command runs again (T-38 (3)):
 * (1) the branch, unless an earlier run made it; (2) the worktree's removal unless `keptBecause` names a cause; (3)
 * the marker once no worktree is left. A job abandon marked takes none. The temporary index lives in a folder of its
 * own in the system's temporary folder, removed after.
 */
async function applyAbandon(plan: AbandonPlan): Promise<Applied> {
	const { source } = plan;
	if (source.kind === "marked") {
		return { commit: source.marker.commit, made: false, worktree: undefined };
	}
	const scratch = await mkdtemp(join(tmpdir(), "limen-abandon-"));
	const index = join(scratch, "index");
	try {
		const commit = source.kind === "saved" ? source.commit : saveWork(plan, source, index);
		const made = source.kind !== "saved";
		const path = plan.worktree && existsSync(plan.worktree) ? plan.worktree : undefined;
		if (path === undefined) {
			await markAbandoned(plan, commit);
			return { commit, made, worktree: undefined };
		}
		const kept = await keptBecause(plan, path, commit, index);
		if (kept !== undefined) {
			return { commit, made, worktree: { path, kept } };
		}
		const trash = await removeWorktree(plan.repository, path);
		await markAbandoned(plan, commit);
		return { commit, made, worktree: { path, trash } };
	} finally {
		await rm(scratch, { recursive: true, force: true });
	}
}

/**
 * Step (3): the record's `abandoned` marker, the branch and its commit, which hold the job's whole state now that no
 * worktree is left (D-088); a run again finds the same marker and writes nothing.
 */
async function markAbandoned(plan: AbandonPlan, commit: string): Promise<void> {
	await writeMarker(plan.jobDir, { abandoned: { branch: plan.branch, commit, at: new Date().toISOString() } });
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
		nestedNamedCommit(plan, path, commit) ??
		(await removalBlock(plan.repository, path))
	);
}

/**
 * A nested repository of the commit whose branches, tags, stash or reflog name a commit that the project's object
 * store lacks (D-088): the save holds a nested repository only as the commit it has checked out, so such a commit
 * would go with the worktree.
 */
function nestedNamedCommit(plan: AbandonPlan, path: string, commit: string): string | undefined {
	const nested = [...gitlinks(path, commit).keys()].find(
		(link) => existsSync(join(path, link, ".git")) && namesUnsavedCommit(join(path, link), plan.repository),
	);
	return nested === undefined
		? undefined
		: `the nested repository ${shownField(nested)} holds a branch, tag, stash or reflog entry at a commit that the project's repository lacks`;
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
function saveWork(plan: AbandonPlan, source: Extract<Source, { kind: "worktree" | "tip" }>, index: string): string {
	const commit =
		source.kind === "tip"
			? source.commit
			: commitTree(source.path, worktreeTree(source.path, index), headCommit(source.path), `limen abandon ${plan.id}`);
	createBranchOnce(plan.repository, plan.branch, commit);
	return commit;
}

/** What the run says: where the work is now, and what became of the worktree. */
function report(plan: AbandonPlan, done: Applied): string {
	if (plan.source.kind === "marked") {
		return markedLine(plan.id, plan.source.marker, plan.source.now);
	}
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

/**
 * The line of a job abandon marked: the marker's branch and commit, and where that branch points now when a person
 * deleted or moved it, since Limen never does (A-002).
 */
function markedLine(id: string, marker: Abandoned, now: string | undefined): string {
	const { branch, commit } = marker;
	if (now === commit) {
		return `job ${id} is abandoned: its work is on ${branch} at ${commit}`;
	}
	return `job ${id} is abandoned: its work was on ${branch} at ${commit}; ${now === undefined ? "that branch is gone" : `that branch is at ${now} now`}`;
}
