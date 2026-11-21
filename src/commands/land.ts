import { landJob } from "../job/landing.ts";
import { jobArgument } from "../job/reference.ts";
import type { CommandText } from "../outcome.ts";
import type { Parsed } from "../parser.ts";

/** `limen land`: merges a done job onto the checked-out branch and closes its active tickets. */
export async function landCommand(values: Parsed, cwd: string, out: CommandText): Promise<undefined> {
	const request = {
		query: jobArgument(values),
		yes: values.has("yes"),
		keepOpen: values.has("keep-open"),
		onto: values.get("onto"),
	};
	await landJob(request, cwd, out);
}
