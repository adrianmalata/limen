import { migrateProject, reportLines } from "../job/migration.ts";
import type { Success } from "../outcome.ts";
import type { Parsed } from "../parser.ts";
import { limenRoot } from "../project/git.ts";

/**
 * `limen migrate`: moves the job folders an older Limen wrote into `record.json` (D-057 (1)), from the project's root
 * on the agents' account; `--dry-run` prints the same report and writes nothing. A second run has nothing to do.
 */
export async function migrateCommand(values: Parsed, cwd: string): Promise<Success> {
	const dryRun = values.has("dry-run");
	const report = await migrateProject(limenRoot(cwd), dryRun);
	console.log(reportLines(report).join("\n"));
	const changes = report.steps.some((step) => step.kind !== "current");
	return { next: dryRun && changes ? "limen migrate" : null };
}
