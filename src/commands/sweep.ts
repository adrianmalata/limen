import { operationHandler } from "../operation.ts";
import type { CommandText } from "../outcome.ts";
import type { Parsed } from "../parser.ts";
import { seatSweep } from "../runtime/sweeping.ts";

/**
 * `limen seat sweep`: one run over every registered project, or with one flag the install, removal or status of the
 * user timer that runs it every minute (src/runtime/sweeping.ts), through the runner of T-38.
 */
export const seatSweepCommand = operationHandler(async function seatSweepCommand(
	values: Parsed,
	_cwd: string,
	out: CommandText,
): Promise<undefined> {
	const flags = { install: values.has("install"), uninstall: values.has("uninstall"), status: values.has("status") };
	await seatSweep(flags, out, values.commandLine());
	return undefined;
});
