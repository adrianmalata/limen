import { jobArgument } from "../job/reference.ts";
import { stopJob } from "../job/stopping.ts";
import type { Success } from "../outcome.ts";
import type { Parsed } from "../parser.ts";

/** `limen stop`: stops a running job with the reason given, or "stopped by request". */
export async function stopCommand(values: Parsed, cwd: string): Promise<Success> {
	return { next: null, text: await stopJob(jobArgument(values), values.get("reason") ?? "", cwd) };
}
