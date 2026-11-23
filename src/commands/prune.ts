import type { Parsed } from "../parser.ts";
import { limenRoot } from "../project/git.ts";
import { keptLine, pruneFinishedWorktrees, pruneLine } from "../runtime/pruning.ts";
import { retireMarkedJobs } from "../runtime/retiring.ts";

/** `limen prune`: removes finished worktrees, or with `--retire` moves the marked jobs to the job archive (A-002). */
export async function pruneCommand(values: Parsed, cwd: string): Promise<undefined> {
	const retire = values.has("retire"),
		dryRun = values.has("dry-run");
	if (dryRun && !retire) {
		throw new Error("prune --dry-run requires --retire");
	}
	if (!retire) {
		const { removed, kept } = await pruneFinishedWorktrees(limenRoot(cwd));
		for (const removal of removed) {
			console.log(pruneLine(removal));
		}
		for (const each of kept) {
			console.log(keptLine(each));
		}
		console.log(
			removed.length === 0
				? "no finished worktrees"
				: `pruned ${removed.length} finished worktree${removed.length === 1 ? "" : "s"}`,
		);
		return;
	}
	const { retired, branches, kept } = await retireMarkedJobs(limenRoot(cwd), dryRun);
	for (const each of kept) {
		console.log(keptLine(each));
	}
	for (const { id, to } of retired) {
		console.log(`${dryRun ? "would retire" : "retired"} ${id} to ${to}`);
	}
	if (retired.length === 0) {
		console.log("no finished jobs to retire");
	} else if (!dryRun) {
		console.log(`retired ${retired.length} job${retired.length === 1 ? "" : "s"}`);
	}
	if (branches) {
		console.log(`deleted ${branches} landed branch${branches === 1 ? "" : "es"}`);
	}
}
