import { closeFeatureTabs } from "../integrations/herdr.ts";
import type { Parsed } from "../parser.ts";
import { limenRoot } from "../project/git.ts";

/** `limen close`: closes the Herdr tabs of a ticket's jobs. */
export async function closeCommand(values: Parsed, cwd: string): Promise<undefined> {
	console.log(await closeFeatureTabs({ root: limenRoot(cwd), feature: values.get("ticket") ?? "" }));
}
