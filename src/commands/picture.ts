import type { CommandText, Success } from "../outcome.ts";
import type { Parsed } from "../parser.ts";
import { checkPicture } from "../picture/picture-check.ts";
import { serveActivity } from "../picture/picture-serve.ts";

/** `limen picture build`: the offline check of the map with its tickets and board. */
export async function pictureBuildCommand(values: Parsed, cwd: string, out: CommandText): Promise<undefined> {
	const check = { dir: values.get("dir"), json: values.get("json"), strict: values.has("strict") };
	await checkPicture(cwd, check, values.commandLine(["dir", "strict"]), out);
}
/** `limen picture serve`: this project's job activity on 127.0.0.1, until it is stopped. */
export async function pictureServeCommand(values: Parsed, cwd: string): Promise<Success> {
	return { next: null, text: await serveActivity(cwd, values.get("port")) };
}
