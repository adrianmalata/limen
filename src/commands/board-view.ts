import type { Success } from "../outcome.ts";
import type { Parsed } from "../parser.ts";
import { projectBoard } from "../project/board-jobs.ts";

/** `limen board`: prints the board with each active ticket's jobs; `--write` rewrites NOW and PROVEN in the file. */
export async function boardCommand(values: Parsed, cwd: string): Promise<Success> {
	return { next: null, text: await projectBoard(cwd, values.has("write")) };
}
