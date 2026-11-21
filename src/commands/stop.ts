import { jobArgument } from "../job/reference.ts";
import { stopJob } from "../job/stopping.ts";
import { operationHandler } from "../operation.ts";
import type { Success } from "../outcome.ts";
import type { Parsed } from "../parser.ts";

/** `limen stop`: stops a running job with the reason given, or "stopped by request", through the runner of T-38. */
export const stopCommand = operationHandler(async function stopCommand(values: Parsed, cwd: string): Promise<Success> {
	const text = await stopJob(jobArgument(values), values.get("reason") ?? "", cwd, {}, values.commandLine());
	return { next: null, text };
});
