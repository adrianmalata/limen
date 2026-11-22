// The one reader of a job's transcripts, the `*.jsonl` files Pi writes below the job's `session/` (`--session-dir`):
// the tokens by class of every entry that carries a Pi usage, an assistant message and a compaction alike (E-13),
// written at or after the job's own start, so that a continuation does not count the parent turns it copied
// (src/job/publication.ts). Which entries count is its policy alone (T-25 (1)), so it takes the start as the record
// holds it. Each line goes through the validators of src/boundary.ts (T-27 (2)); a line that does not parse is kept as
// its typed error, which names the file and the line, and the other lines still count (z. 10). `limen show` and
// `limen stats` read it.
import { readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { at, type BadData, matching, numberIn, object, parseJson, string } from "../boundary.ts";
import { LimenError } from "../outcome.ts";
import { hasCode } from "../system-error.ts";

/** What a job's own entries recorded: the routes that answered, its assistant turns and the tokens by class. */
export type SessionUsage = {
	readonly served: readonly string[];
	readonly turns: number;
	readonly input: number;
	readonly output: number;
	readonly cacheRead: number;
	readonly cacheWrite: number;
};
/** A job's usage, undefined until one of its entries carries one, and each line of its transcripts that did not parse. */
export type TranscriptUsage = { readonly usage: SessionUsage | undefined; readonly unread: readonly BadData[] };

const CLASSES = ["input", "output", "cacheRead", "cacheWrite"] as const;
type Tokens = Readonly<Record<(typeof CLASSES)[number], number>>;
/** An entry that carries a Pi usage: when Pi wrote it, its tokens, and for an assistant message the route that answered. */
type Counted = { readonly at: number; readonly tokens: Tokens; readonly served?: string };

/** The time of a session entry, as Pi writes it with `toISOString`. */
const ISO_TIME = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z$/;

/**
 * Sums the entries of the job's transcripts that carry a usage and are its own, from `startedAt`, the start its record
 * holds, and keeps each line that did not parse. A job with no `session/` folder has no transcript; any other failure
 * to read one goes on.
 */
export function readSessionUsage(jobDir: string, startedAt: string | null): TranscriptUsage {
	const session = join(jobDir, "session");
	const since = ownFrom(startedAt);
	const unread: BadData[] = [];
	const served = new Set<string>();
	const totals = { turns: 0, input: 0, output: 0, cacheRead: 0, cacheWrite: 0 };
	let counted = 0;
	for (const file of transcriptFiles(session)) {
		const path = join(session, file);
		for (const [index, line] of readFileSync(path, "utf8").split("\n").entries()) {
			const entry = line.trim() ? parseJson(`${path}:${index + 1}`, line, entryOf) : undefined;
			if (entry instanceof LimenError) {
				unread.push(entry);
			} else if (entry && entry.at >= since) {
				counted += 1;
				for (const key of CLASSES) {
					totals[key] += entry.tokens[key];
				}
				if (entry.served !== undefined) {
					totals.turns += 1;
					served.add(entry.served);
				}
			}
		}
	}
	return { usage: counted ? { served: [...served], ...totals } : undefined, unread };
}

/**
 * The time from which a job's entries are its own: its recorded start. A record with no start, or with one that names
 * no real time, cannot tell a copied turn from its own, so every entry counts.
 */
function ownFrom(startedAt: string | null): number {
	const start = Date.parse(startedAt ?? "");
	return Number.isNaN(start) ? Number.NEGATIVE_INFINITY : start;
}

/** The transcripts of the session folder `session`, by name; none when the job has no such folder. */
function transcriptFiles(session: string): string[] {
	try {
		return readdirSync(session)
			.filter((name) => name.endsWith(".jsonl"))
			.sort();
	} catch (error) {
		if (hasCode(error, "ENOENT")) {
			return [];
		}
		throw error;
	}
}

/**
 * The served route, with the requested model beside it when a turn ran another one. A bare requested id matches any
 * provider prefix. While no assistant turn served a model, only the requested one is known: a compaction or another
 * entry with a usage counts tokens but names no model. This informs; it never blocks.
 */
export function modelLine(requested: string, usage: SessionUsage | undefined): string {
	if (usage === undefined || usage.served.length === 0) {
		return requested ? `requested ${requested}; no turn yet` : "";
	}
	const served = usage.served.join(" + ");
	if (!requested || usage.served.every((route) => route === requested || route.endsWith(`/${requested}`))) {
		return served;
	}
	return `served ${served} · requested ${requested}`;
}

export function tokenLine(usage: SessionUsage): string {
	const count = (value: number) => value.toLocaleString("en-US");
	return [
		`${usage.turns} turns`,
		`input ${count(usage.input)}`,
		`output ${count(usage.output)}`,
		`cache read ${count(usage.cacheRead)}`,
		`cache write ${count(usage.cacheWrite)}`,
	].join(" · ");
}

// The validators of a transcript line, after Pi 1.5.1's `SessionEntry` (`core/session-manager.d.ts`) and `Usage`
// (pi-ai). They read only what the count needs; the other fields and the other entry types stay unread.

/**
 * One line as a session entry: what it counts, or undefined for an entry that carries no usage. An assistant message
 * carries it in its message; a compaction, a branch summary and a usage entry carry it at the top, a compaction only
 * when its summary came from a model call.
 */
function entryOf(value: unknown, field: string): Counted | undefined {
	const fields = object()(value, field);
	if (string(fields.get("type"), at(field, "type")) === "message") {
		return assistantOf(fields, field);
	}
	if (!fields.has("usage")) {
		return undefined;
	}
	return { at: writtenAt(fields, field), tokens: tokensOf(fields.get("usage"), at(field, "usage")) };
}

/** A message entry: an assistant message counts, with the provider and model that answered; any other role does not. */
function assistantOf(fields: ReadonlyMap<string, unknown>, field: string): Counted | undefined {
	const place = at(field, "message");
	const message = object()(fields.get("message"), place);
	if (string(message.get("role"), at(place, "role")) !== "assistant") {
		return undefined;
	}
	const provider = string(message.get("provider"), at(place, "provider"));
	const model = string(message.get("model"), at(place, "model"));
	return {
		at: writtenAt(fields, field),
		tokens: tokensOf(message.get("usage"), at(place, "usage")),
		served: provider ? `${provider}/${model}` : model,
	};
}

function writtenAt(fields: ReadonlyMap<string, unknown>, field: string): number {
	return Date.parse(matching(ISO_TIME, "an ISO time")(fields.get("timestamp"), at(field, "timestamp")));
}

/** A Pi `Usage`: its four classes, each a count of tokens. */
function tokensOf(value: unknown, field: string): Tokens {
	const fields = object()(value, field);
	const count = (key: (typeof CLASSES)[number]) => numberIn({ integer: true, min: 0 })(fields.get(key), at(field, key));
	return {
		input: count("input"),
		output: count("output"),
		cacheRead: count("cacheRead"),
		cacheWrite: count("cacheWrite"),
	};
}
