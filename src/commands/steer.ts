import { jobArgument } from "../job/reference.ts";
import { steerJobs } from "../job/steer-delivery.ts";
import type { CommandText } from "../outcome.ts";
import type { Parsed } from "../parser.ts";

/** `limen steer`: sends a correction to one running job, or to every running job this coordinator watches. */
export async function steerCommand(values: Parsed, cwd: string, out: CommandText): Promise<undefined> {
	await steerJobs(values.has("running") ? undefined : jobArgument(values), values.get("text") ?? "", cwd, out);
}
