import { resolve } from "node:path";
import { projectStatistics } from "../job/statistics.ts";
import type { Success } from "../outcome.ts";
import type { Parsed } from "../parser.ts";

/**
 * `limen stats`: this project's jobs by route and role, its lands, with `--sessions <dir>` the coordinator's sessions
 * of that folder, from the caller's folder, then the failures by kind and what was not read (D-073, D-098).
 */
export async function statsCommand(values: Parsed, cwd: string): Promise<Success> {
	const sessions = values.get("sessions");
	return {
		next: null,
		text: await projectStatistics(cwd, sessions === undefined ? undefined : resolve(cwd, sessions)),
	};
}
