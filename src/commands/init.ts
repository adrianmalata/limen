import type { CommandText } from "../outcome.ts";
import type { Parsed } from "../parser.ts";
import { initProject, initWorkspace } from "../project/setup.ts";

/** `limen init`: sets up a project, or with `--drop-leftovers` removes the files Limen no longer reads. */
export async function initCommand(values: Parsed, cwd: string, out: CommandText): Promise<undefined> {
	await initProject(cwd, values.has("drop-leftovers"), out);
}
/** `limen workspace init`: sets up a folder outside Git whose child repositories its jobs work in. */
export async function workspaceInitCommand(_values: Parsed, cwd: string, out: CommandText): Promise<undefined> {
	await initWorkspace(cwd, out);
}
