import { join } from "node:path";
import { transport } from "../config.ts";
import { parseDuration } from "../job/job.ts";
import { readOptional } from "./inherit.ts";

// A plant whose tools wait on shared work, such as a cargo plant behind a Mac-wide build queue, raises these limits
// in its tracked file. Limen reads the file in the project root at each use, so an edit applies to running jobs too.
// The file is the only source: no environment variable overrides it (T-03, R-015).
export const PLANT_LIMITS = ".agents/limen/limits.json";
/** Limits in the `--timeout` form, read as milliseconds. */
const DURATIONS = ["prepare", "toolStall"] as const;
/** Limits that count, read as positive integers. */
const COUNTS = ["toolCalls"] as const;
type Duration = (typeof DURATIONS)[number];
type Count = (typeof COUNTS)[number];
type Limits = Partial<Record<Duration | Count, number>>;

/** Milliseconds for one limit: the project's file, else `fallback`. */
export function limitMs(limit: Duration, fallback: number, root = transport("LIMEN_CONTEXT_ROOT")): number {
	return (root ? plantLimits(root).limits[limit] : undefined) ?? fallback;
}

/** A count for one limit, such as the tool-start cap of a job: the project's file, else `fallback`. */
export function limitCount(limit: Count, fallback: number, root = transport("LIMEN_CONTEXT_ROOT")): number {
	return (root ? plantLimits(root).limits[limit] : undefined) ?? fallback;
}

/** The limits the plant's file sets, and one reason for each entry Limen ignores. No file sets nothing. */
export function plantLimits(root: string): { limits: Limits; ignored: string[] } {
	const text = readOptional(join(root, PLANT_LIMITS));
	if (text === undefined) {
		return { limits: {}, ignored: [] };
	}
	let parsed: unknown;
	try {
		parsed = JSON.parse(text);
	} catch {
		return { limits: {}, ignored: ["the file is not JSON"] };
	}
	if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) {
		return { limits: {}, ignored: ["the file is not a JSON object"] };
	}
	const limits: Limits = {};
	const ignored: string[] = [];
	for (const [key, value] of Object.entries(parsed)) {
		const duration = DURATIONS.find((name) => name === key);
		const count = COUNTS.find((name) => name === key);
		if (duration) {
			try {
				limits[duration] = parseDuration(String(value));
			} catch {
				ignored.push(`${key} ${JSON.stringify(value)} is not a duration such as 90s, 20m or 2h`);
			}
		} else if (count) {
			if (typeof value === "number" && Number.isSafeInteger(value) && value > 0) {
				limits[count] = value;
			} else {
				ignored.push(`${key} ${JSON.stringify(value)} is not a positive integer`);
			}
		} else {
			ignored.push(`${key} is not a limit; use prepare, toolStall or toolCalls`);
		}
	}
	return { limits, ignored };
}
