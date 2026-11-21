import { showJobDiff } from "../integrations/hunk.ts";
import { jobArgument } from "../job/reference.ts";
import type { Success } from "../outcome.ts";
import type { Parsed } from "../parser.ts";

/** `limen diff`: the change a job made against its base, in Hunk or as the git command that shows it. */
export async function diffCommand(values: Parsed, cwd: string): Promise<Success> {
	const line = await showJobDiff(cwd, jobArgument(values));
	return line === undefined ? { next: null } : { next: null, text: line };
}
