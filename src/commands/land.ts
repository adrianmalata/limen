import { landJob } from "../job/landing.ts";
import { jobArgument } from "../job/reference.ts";
import { operationHandler } from "../operation.ts";
import type { CommandText } from "../outcome.ts";
import type { Parsed } from "../parser.ts";

/**
 * `limen land`: merges a done job onto the checked-out branch, closes its active tickets and cleans up after it, each a
 * step its record keeps, through the runner of T-38; run again, it goes on from the first step not recorded (R-103).
 */
export const landCommand = operationHandler(async function landCommand(
	values: Parsed,
	cwd: string,
	out: CommandText,
): Promise<undefined> {
	const request = {
		query: jobArgument(values),
		yes: values.has("yes"),
		keepOpen: values.has("keep-open"),
		onto: values.get("onto"),
		again: values.commandLine(),
	};
	await landJob(request, cwd, out);
});
