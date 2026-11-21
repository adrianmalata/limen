import { migrateProjectAt } from "../job/migration.ts";
import type { Success } from "../outcome.ts";
import type { Parsed } from "../parser.ts";

/**
 * `limen migrate`: moves the job folders an older Limen wrote into `record.json` (D-057 (1)); `--dry-run` prints the
 * same report and writes nothing.
 */
export function migrateCommand(values: Parsed, cwd: string): Promise<Success> {
	return migrateProjectAt(cwd, values.has("dry-run"));
}
