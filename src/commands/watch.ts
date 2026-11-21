import { jobArgument } from "../job/reference.ts";
import { changeSubscriptions } from "../job/watching.ts";
import type { CommandText } from "../outcome.ts";
import type { Parsed } from "../parser.ts";

/** `limen watch`: this coordinator gets the job's wake, or the wakes of every job running now with `--running`. */
export async function watchCommand(values: Parsed, cwd: string, out: CommandText): Promise<undefined> {
	await changeSubscriptions(values.has("running") ? undefined : jobArgument(values), cwd, true, out);
}
/** `limen unwatch`: this coordinator stops getting the job's wake, or every job's with `--all`. */
export async function unwatchCommand(values: Parsed, cwd: string, out: CommandText): Promise<undefined> {
	await changeSubscriptions(values.has("all") ? undefined : jobArgument(values), cwd, false, out);
}
