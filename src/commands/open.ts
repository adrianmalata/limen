import { openJob } from "../integrations/herdr.ts";
import { jobArgument } from "../job/reference.ts";
import { operationHandler } from "../operation.ts";
import type { Success } from "../outcome.ts";
import type { Parsed } from "../parser.ts";

/**
 * `limen open`: opens the job's log tab in Herdr, through the runner of T-38, since it records the tab's place so that a
 * close finds it (D-096 (2)).
 */
export const openCommand = operationHandler(async function openCommand(values: Parsed, cwd: string): Promise<Success> {
	return { next: null, text: await openJob(cwd, jobArgument(values)) };
});
