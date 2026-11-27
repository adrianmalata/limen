import { readFileSync } from "node:fs";
import { join } from "node:path";
import { type BadData, boolean, duration, eachField, numberIn, object, parseJson } from "../boundary.ts";
import { transport } from "../config.ts";
import { environmentError, LimenError } from "../outcome.ts";
import { hasCode } from "../system-error.ts";
// src/project/modules.ts reads the switches through this module, and this module takes the module names from it. So
// that either of the two can load first, neither uses the other's exports while it loads: here `MODULES` appears only
// inside a function, as src/boundary.ts and src/outcome.ts do.
import { MODULES, type Module } from "./modules.ts";

// A plant whose tools wait on shared work, such as a cargo plant behind a Mac-wide build queue, raises these limits
// in its tracked file. Limen reads the file in the project root at each use, so an edit applies to running jobs too.
// The file is the only source: no environment variable overrides it (T-03, R-015). It also holds the module switches
// (G1.10, R-044), one boolean per module under `modules`.
export const PLANT_LIMITS = ".agents/limen/limits.json";
/** Each limit and its validator: `prepare` and `toolStall` in the `--timeout` form as milliseconds, `toolCalls` a count. */
const LIMITS = { prepare: duration, toolStall: duration, toolCalls: numberIn({ integer: true, min: 1 }) };
type Duration = "prepare" | "toolStall";
type Count = "toolCalls";
type Limits = Partial<Record<keyof typeof LIMITS, number>>;
/** What the file sets: its limits, the modules it switches on, and the typed error of each entry Limen ignores. */
type PlantLimits = {
	readonly limits: Limits;
	readonly modules: ReadonlySet<Module>;
	readonly ignored: readonly BadData[];
};

/** Milliseconds for one limit: the project's file, else `fallback`. */
export function limitMs(limit: Duration, fallback: number, root = transport("LIMEN_CONTEXT_ROOT")): number {
	return (root ? plantLimits(root).limits[limit] : undefined) ?? fallback;
}

/** A count for one limit, such as the tool-start cap of a job: the project's file, else `fallback`. */
export function limitCount(limit: Count, fallback: number, root = transport("LIMEN_CONTEXT_ROOT")): number {
	return (root ? plantLimits(root).limits[limit] : undefined) ?? fallback;
}

/**
 * The limits and the module switches the plant's file sets, and the typed error of each entry Limen ignores (T-27
 * (2)): an invalid or unknown entry is ignored on its own, a switch of the `modules` object too (`modules.group`), and
 * a file that is not a JSON object as a whole. No file sets nothing, and a module no valid switch sets true is off; a
 * file that cannot be read fails (`limitsText`).
 */
export function plantLimits(root: string): PlantLimits {
	const text = limitsText(root);
	if (text === undefined) {
		return { limits: {}, modules: new Set(), ignored: [] };
	}
	const fields = parseJson(PLANT_LIMITS, text, object());
	if (fields instanceof LimenError) {
		return { limits: {}, modules: new Set(), ignored: [fields] };
	}
	const { values, ignored } = eachField(PLANT_LIMITS, fields, { ...LIMITS, modules: object() });
	const { modules, ...limits } = values;
	if (modules === undefined) {
		return { limits, modules: new Set(), ignored };
	}
	const readers = Object.fromEntries(MODULES.map((name) => [name, boolean]));
	const switches = eachField(PLANT_LIMITS, modules, readers, "modules");
	const on = new Set(MODULES.filter((name) => switches.values[name] === true));
	return { limits, modules: on, ignored: [...ignored, ...switches.ignored] };
}

/**
 * The text of the limits file of the project at `root`; undefined only when nothing is at its path (ENOENT) or a folder
 * of the path is a file (ENOTDIR), the one expected absence (T-01). Any other failure, such as a folder at the path or
 * no right to read it, is the environment's, LIMITS_UNREADABLE, named with the file: a file Limen cannot read is no
 * file that switches every module off (R-044 Decision 19 F1).
 */
function limitsText(root: string): string | undefined {
	try {
		return readFileSync(join(root, PLANT_LIMITS), "utf8");
	} catch (error) {
		if (hasCode(error, "ENOENT") || hasCode(error, "ENOTDIR")) {
			return undefined;
		}
		const reason = error instanceof Error ? error.message : String(error);
		throw environmentError("LIMITS_UNREADABLE", `${PLANT_LIMITS} cannot be read: ${reason}`);
	}
}
