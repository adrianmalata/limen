import { renderJobDirectory } from "../job/listing.ts";
import { resolveJob } from "../job/lookup.ts";
import { colorWanted, humanDetail, paintWhen } from "../job/view.ts";
import type { Parsed } from "../parser.ts";
import { limenRoot } from "../project/git.ts";
import { confirmDeadJobs } from "../runtime/reap.ts";

/**
 * `limen show`: one job's record. In a terminal it is a view for people; through a pipe, the compact text that tools
 * read. The terminal alone chooses the view (R-015), and `NO_COLOR` removes the color.
 */
export async function showCommand(values: Parsed, cwd: string): Promise<undefined> {
	const human = process.stdout.isTTY === true;
	const paint = paintWhen(colorWanted(human, process.env.NO_COLOR, process.env.TERM));
	const root = limenRoot(cwd);
	const jobsRoot = `${root}/.limen/jobs`;
	await confirmDeadJobs(jobsRoot);
	const { id } = await resolveJob(cwd, values.get("job") ?? "", "read");
	const loaded = await renderJobDirectory(root, jobsRoot, id, "detail");
	console.log(human ? humanDetail(loaded.record, paint) : loaded.compact);
}
