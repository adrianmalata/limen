import { rm } from "node:fs/promises";
import { retainedGroupJob } from "../job/group-cabinet.ts";
import { isTerminal } from "../job/job.ts";
import { jobFolders, readRecord } from "../job/record.ts";
import type { Parsed } from "../parser.ts";
import { limenRoot, unlandedBranches, workspaceRepository } from "../project/git.ts";
import { deleteLandedBranches, pruneFinishedWorktrees, pruneLine } from "../runtime/pruning.ts";

/** `limen prune`: removes finished worktrees, or with `--retire` the records of finished jobs that landed. */
export async function pruneCommand(values: Parsed, cwd: string): Promise<undefined> {
	const retire = values.has("retire"),
		dryRun = values.has("dry-run");
	if (dryRun && !retire) {
		throw new Error("prune --dry-run requires --retire");
	}
	if (!retire) {
		const removals = await pruneFinishedWorktrees(limenRoot(cwd));
		for (const removal of removals) {
			console.log(pruneLine(removal));
		}
		console.log(
			removals.length === 0
				? "no finished worktrees"
				: `pruned ${removals.length} finished worktree${removals.length === 1 ? "" : "s"}`,
		);
		return;
	}
	const { ids, branches } = await retireFinishedJobs(limenRoot(cwd), dryRun);
	if (dryRun && ids.length) {
		console.log(ids.map((id) => `would retire ${id}`).join("\n"));
	} else {
		console.log(
			ids.length === 0 ? "no finished jobs to retire" : `retired ${ids.length} job${ids.length === 1 ? "" : "s"}`,
		);
	}
	if (branches) {
		console.log(`deleted ${branches} landed branch${branches === 1 ? "" : "es"}`);
	}
}

type FinishedJob = { id: string; repository: string; branch: string };
/** The terminal jobs outside an open group, each with the repository of its branch; one whose repository is gone is left out. */
async function finishedJobs(root: string, jobsRoot: string): Promise<FinishedJob[]> {
	const finished: FinishedJob[] = [];
	const repositories = new Map<string, string>();
	for (const id of await jobFolders(jobsRoot)) {
		const jobDir = `${jobsRoot}/${id}`;
		if (await retainedGroupJob(jobDir)) {
			continue;
		}
		const record = await readRecord(jobDir);
		const [branch, repo] = [record?.branch ?? "", record?.repo ?? ""];
		if (!(record && isTerminal(record.state))) {
			continue;
		}
		try {
			const repository = !branch ? root : (repositories.get(repo) ?? (repo ? workspaceRepository(root, repo) : root));
			if (branch) {
				repositories.set(repo, repository);
			}
			finished.push({ id, repository, branch });
		} catch {}
	}
	return finished;
}

async function retireFinishedJobs(
	root: string,
	dryRun: boolean,
): Promise<{ readonly ids: readonly string[]; readonly branches: number }> {
	const jobsRoot = `${root}/.limen/jobs`,
		retired: FinishedJob[] = [],
		finished = await finishedJobs(root, jobsRoot);
	const unlanded = new Map<string, ReadonlySet<string> | undefined>();
	for (const repository of new Set(finished.map((job) => job.repository))) {
		try {
			unlanded.set(
				repository,
				unlandedBranches(
					repository,
					finished.filter((job) => job.repository === repository && job.branch).map((job) => job.branch),
				),
			);
		} catch {
			unlanded.set(repository, undefined);
		}
	}
	for (const job of finished) {
		const pending = unlanded.get(job.repository);
		if (pending && !pending.has(job.branch)) {
			retired.push(job);
		}
	}
	if (dryRun) {
		return { ids: retired.map((job) => job.id), branches: 0 };
	}
	// Branches go before records: a record names the finished worktree that may still hold its branch.
	const landed = new Map(retired.filter((job) => job.branch).map((job) => [`${job.repository}\0${job.branch}`, job]));
	const deleted = (await deleteLandedBranches(root, [...landed.values()])).filter((result) => !result.kept).length;
	for (const { id } of retired) {
		await rm(`${jobsRoot}/${id}`, { recursive: true, force: true });
	}
	return { ids: retired.map((job) => job.id), branches: deleted };
}
