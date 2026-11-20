import { join } from "node:path";
import { type BadData, duration, eachField, numberIn, object, parseJson } from "../boundary.ts";
import { transport } from "../config.ts";
import { LimenError } from "../outcome.ts";
import { readOptional } from "./inherit.ts";

// A plant whose tools wait on shared work, such as a cargo plant behind a Mac-wide build queue, raises these limits
// in its tracked file. Limen reads the file in the project root at each use, so an edit applies to running jobs too.
// The file is the only source: no environment variable overrides it (T-03, R-015).
export const PLANT_LIMITS = ".agents/limen/limits.json";
/** Each limit and its validator: `prepare` and `toolStall` in the `--timeout` form as milliseconds, `toolCalls` a count. */
const LIMITS = { prepare: duration, toolStall: duration, toolCalls: numberIn({ integer: true, min: 1 }) };
type Duration = "prepare" | "toolStall";
type Count = "toolCalls";
type Limits = Partial<Record<keyof typeof LIMITS, number>>;

/** Milliseconds for one limit: the project's file, else `fallback`. */
export function limitMs(limit: Duration, fallback: number, root = transport("LIMEN_CONTEXT_ROOT")): number {
	return (root ? plantLimits(root).limits[limit] : undefined) ?? fallback;
}

/** A count for one limit, such as the tool-start cap of a job: the project's file, else `fallback`. */
export function limitCount(limit: Count, fallback: number, root = transport("LIMEN_CONTEXT_ROOT")): number {
	return (root ? plantLimits(root).limits[limit] : undefined) ?? fallback;
}

/**
 * The limits the plant's file sets, and the typed error of each entry Limen ignores (T-27 (2)): an invalid or unknown
 * entry is ignored on its own, and a file that is not a JSON object as a whole. No file sets nothing.
 */
export function plantLimits(root: string): { readonly limits: Limits; readonly ignored: readonly BadData[] } {
	const text = readOptional(join(root, PLANT_LIMITS));
	if (text === undefined) {
		return { limits: {}, ignored: [] };
	}
	const fields = parseJson(PLANT_LIMITS, text, object());
	if (fields instanceof LimenError) {
		return { limits: {}, ignored: [fields] };
	}
	const { values, ignored } = eachField(PLANT_LIMITS, fields, LIMITS);
	return { limits: values, ignored };
}
