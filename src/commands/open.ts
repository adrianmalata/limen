import { openJobPlace } from "../integrations/herdr.ts";
import { resolveJob } from "../job/lookup.ts";
import { readRecord } from "../job/record.ts";
import type { Parsed } from "../parser.ts";
import { limenRoot } from "../project/git.ts";

/** `limen open`: opens the job's log tab in Herdr. */
export async function openCommand(values: Parsed, cwd: string): Promise<undefined> {
	const { jobDir } = await resolveJob(cwd, values.get("job") ?? "", "read");
	const running = (await readRecord(jobDir))?.state === "running";
	console.log(await openJobPlace({ jobDir, cwd: limenRoot(cwd), running }));
}
