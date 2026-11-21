import { openJob } from "../integrations/herdr.ts";
import { jobArgument } from "../job/reference.ts";
import type { Success } from "../outcome.ts";
import type { Parsed } from "../parser.ts";

/** `limen open`: opens the job's log tab in Herdr. */
export async function openCommand(values: Parsed, cwd: string): Promise<Success> {
	return { next: null, text: await openJob(cwd, jobArgument(values)) };
}
