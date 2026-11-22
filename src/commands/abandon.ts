import { abandonJob } from "../job/abandoning.ts";
import { jobArgument } from "../job/reference.ts";
import { operationHandler } from "../operation.ts";
import type { Success } from "../outcome.ts";
import type { Parsed } from "../parser.ts";

/** `limen abandon`: gives up on a finished job and keeps its work on a branch, through the runner of T-38. */
export const abandonCommand = operationHandler(async function abandonCommand(
	values: Parsed,
	cwd: string,
): Promise<Success> {
	return { next: null, text: await abandonJob(jobArgument(values), cwd, values.commandLine()) };
});
