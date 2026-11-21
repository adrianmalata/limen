import { startContinue } from "../job/continuation.ts";
import { jobArgument } from "../job/reference.ts";
import type { CommandText, Success } from "../outcome.ts";
import type { Parsed } from "../parser.ts";

/** `limen continue`: resumes a finished job from the command line. */
export function continueCommand(values: Parsed, cwd: string, out: CommandText): Promise<Success> {
	return startContinue(
		{
			query: jobArgument(values),
			instruction: values.list("instruction"),
			label: values.get("label"),
			engine: values.get("engine"),
			provider: values.get("provider"),
			model: values.get("model"),
			thinking: values.get("thinking"),
			timeout: values.get("timeout"),
			priority: values.get("priority"),
			extensions: values.list("extension"),
		},
		cwd,
		out,
	);
}
