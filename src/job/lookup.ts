import { transport } from "../config.ts";
import { limenRoot } from "../project/git.ts";
import { resolveJobId } from "./job.ts";
import { jobFolders, readRecord } from "./record.ts";
/** "control" refuses a group member another team's job; "read" resolves any job. */
export async function resolveJob(
	cwd: string,
	query: string,
	access: "read" | "control",
): Promise<{ readonly id: string; readonly jobDir: string }> {
	const jobsRoot = `${limenRoot(cwd)}/.limen/jobs`;
	const ids = await jobFolders(jobsRoot);
	const labels: Record<string, string> = {};
	for (const id of ids) {
		labels[id] = (await readRecord(`${jobsRoot}/${id}`))?.label ?? "";
	}
	const id = resolveJobId(query, ids, labels);
	if (access === "control" && transport("LIMEN_GROUP_ID")) {
		const record = await readRecord(`${jobsRoot}/${id}`);
		if (record?.group !== transport("LIMEN_GROUP_ID") || record?.team !== transport("LIMEN_TEAM_ID")) {
			throw new Error("group members cannot stop, steer, continue, watch, or land another team's job");
		}
	}
	return { id, jobDir: `${jobsRoot}/${id}` };
}
