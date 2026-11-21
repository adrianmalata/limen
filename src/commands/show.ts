import { jobDetail } from "../job/detail.ts";
import { jobArgument } from "../job/reference.ts";
import type { Success } from "../outcome.ts";
import type { Parsed } from "../parser.ts";

/** `limen show`: one job's record, for people in a terminal and compact through a pipe. */
export async function showCommand(values: Parsed, cwd: string): Promise<Success> {
	return { next: null, text: await jobDetail(cwd, jobArgument(values)) };
}
