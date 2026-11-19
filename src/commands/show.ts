import { renderJobDirectory } from "../job/listing.ts";
import { resolveJob } from "../job/lookup.ts";
import { colorWanted, humanDetail, paintWhen, resolveView } from "../job/view.ts";
import type { Parsed } from "../parser.ts";
import { limenRoot } from "../project/git.ts";
import { confirmDeadJobs } from "../runtime/reap.ts";

/**
 * `limen show`: one job's record. In a terminal it is a view for people; through a pipe, the compact text that tools
 * read. `LIMEN_VIEW=human|compact` chooses the view, and `NO_COLOR` removes the color.
 */
export async function showCommand(values: Parsed, cwd: string): Promise<undefined> {
	const tty = process.stdout.isTTY === true;
	const human = resolveView(process.env.LIMEN_VIEW, tty) === "human";
	const paint = paintWhen(human && colorWanted(tty, process.env.NO_COLOR, process.env.TERM));
	const root = limenRoot(cwd);
	const jobsRoot = `${root}/.limen/jobs`;
	await confirmDeadJobs(jobsRoot);
	const { id } = await resolveJob(cwd, values.get("job") ?? "", "read");
	const loaded = await renderJobDirectory(root, jobsRoot, id, "detail");
	console.log(human ? humanDetail(loaded.record, paint) : loaded.compact);
}
