import type { Success } from "../outcome.ts";
import type { Parsed } from "../parser.ts";
import { projectStatus } from "../project/summary.ts";

/**
 * `limen status`: what runs, what landed, what waits for a decision, in the last 7 days. With `--all` it reports every
 * record, and under the summary one row for each job of the project (D-038).
 */
export async function statusCommand(values: Parsed, cwd: string): Promise<Success> {
	return { next: null, text: await projectStatus(cwd, values.has("all")) };
}
