import { readFile } from "node:fs/promises";
import { openJobPlace } from "../integrations/herdr.ts";
import { resolveJob } from "../job/lookup.ts";
import type { Parsed } from "../parser.ts";
import { limenRoot } from "../project/git.ts";

/** `limen open`: opens the job's log tab in Herdr. */
export async function openCommand(values: Parsed, cwd: string): Promise<undefined> {
	const { jobDir } = await resolveJob(cwd, values.get("job") ?? "", "read");
	console.log(
		await openJobPlace({ jobDir, cwd: limenRoot(cwd), running: (await text(`${jobDir}/state`)) === "running" }),
	);
}

function text(path: string): Promise<string> {
	return readFile(path, "utf8").then(
		(value) => value.trim(),
		() => "",
	);
}
