import { projectStatistics } from "../job/statistics.ts";
import type { Success } from "../outcome.ts";
import type { Parsed } from "../parser.ts";

/** `limen stats`: this project's jobs by route and role, the failures by kind and what was not read (D-073). */
export async function statsCommand(_values: Parsed, cwd: string): Promise<Success> {
	return { next: null, text: await projectStatistics(cwd) };
}
