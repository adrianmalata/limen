// `limen show`: one job's record in detail. In a terminal it is a view for people; through a pipe, the compact text
// that tools read. The terminal alone chooses the view (R-015), and `NO_COLOR` removes the color. It is a read (T-04):
// a dead job shows as dead, and the seat sweep finalizes it.
import { limenRoot } from "../project/git.ts";
import { renderJobDirectory } from "./listing.ts";
import { type JobReference, resolveJob } from "./reference.ts";
import { colorWanted, humanDetail, paintWhen } from "./view.ts";

/** The detail of the job `query` names, as text for this terminal. */
export async function jobDetail(cwd: string, query: JobReference): Promise<string> {
	const human = process.stdout.isTTY === true;
	const paint = paintWhen(colorWanted(human, process.env.NO_COLOR, process.env.TERM));
	const root = limenRoot(cwd);
	const jobsRoot = `${root}/.limen/jobs`;
	const { id } = await resolveJob(cwd, query, "read");
	const loaded = await renderJobDirectory(root, jobsRoot, id, "detail");
	return human ? humanDetail(loaded.record, paint) : loaded.compact;
}
