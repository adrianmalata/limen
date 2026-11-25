// The one reader of Pi's session files (T-25 (1)): a job's transcripts, the `*.jsonl` files Pi writes below the job's
// `session/` (`--session-dir`), and the coordinator's sessions, the files of the folder `limen stats --sessions` names
// (D-098 (3)). It reads each entry a count needs, in the file's order: the assistant messages, with the commands of
// their bash tool calls, the owner's messages and Limen's custom messages, which start a run (E-16), and every entry
// that carries a Pi usage, a compaction included (E-13). A job's tokens are those of the entries written at or after
// its own start, so that a continuation does not count the parent turns it copied (src/job/publication.ts); which
// entries count is this module's policy alone, so it takes the start as the record holds it. Each line goes through
// the validators of src/boundary.ts (T-27 (2)); a line that does not parse is kept as its typed error, which names the
// file and the line, and the other lines still count (z. 10). `limen show` and `limen stats` read it.
import { readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { arrayOf, at, type BadData, isoTime, numberIn, object, optional, parseJson, string } from "../boundary.ts";
import { LimenError } from "../outcome.ts";
import { hasCode } from "../system-error.ts";

/**
 * What session entries recorded, a job's own or the coordinator's: the routes that answered, the assistant turns and
 * the tokens by class.
 */
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
/** The tokens of a Pi usage by class. */
export type Tokens = Readonly<Record<(typeof CLASSES)[number], number>>;
/**
 * One entry of a session file that a count reads: when Pi wrote it, in milliseconds; its kind, `assistant` or `user`
 * for a message of that role, else the entry's own type, such as `custom_message` or `compaction`; its tokens when it
 * carries a usage, as an assistant message always does; and for an assistant message the route that answered and the
 * command of each of its bash tool calls, in order.
 */
export type SessionEntry = {
	readonly at: number;
	readonly kind: string;
	readonly usage: Tokens | undefined;
	readonly served: string | undefined;
	readonly commands: readonly string[];
};
/** The entries of one session file that a count reads, in the file's order, and each of its lines that did not parse. */
export type SessionFile = { readonly entries: readonly SessionEntry[]; readonly unread: readonly BadData[] };

/** Whether `entry` is a turn: one assistant message, the word `limen show` uses (`docs/commands.md`). */
export function isTurn(entry: SessionEntry): boolean {
	return entry.kind === "assistant";
}
/**
 * Whether `entry` is a message sent into its session, which a count takes as the start of a run: an entry of role
 * `user`, the owner's, or a `custom_message`, as Pi stores a Limen message (E-16). A Limen message that arrives while
 * a run is active joins that run as a follow-up (E-16), and a session file does not tell such a follow-up from the
 * start of a new run, so it is taken as a start too (R-098's outcome, open point 5). A compaction adds tokens and
 * sends nothing.
 */
export function startsRun(entry: SessionEntry): boolean {
	return entry.kind === "user" || entry.kind === CUSTOM_MESSAGE;
}

/**
 * Sums the entries of the job's transcripts that carry a usage and are its own, from `startedAt`, the start its record
 * holds, and keeps each line that did not parse. A job with no `session/` folder has no transcript; any other failure
 * to read one goes on.
 */
export function readSessionUsage(jobDir: string, startedAt: string | null): TranscriptUsage {
	const session = join(jobDir, "session");
	const since = ownFrom(startedAt);
	const unread: BadData[] = [];
	const own: SessionEntry[] = [];
	for (const file of transcriptFiles(session)) {
		const read = readSessionFile(join(session, file));
		unread.push(...read.unread);
		for (const entry of read.entries) {
			if (entry.at >= since) {
				own.push(entry);
			}
		}
	}
	return { usage: usageOf(own), unread };
}

/**
 * What `entries` add up to: the tokens by class of each one that carries a usage, its assistant messages as turns and
 * the routes that answered them; undefined when none carries a usage.
 */
export function usageOf(entries: Iterable<SessionEntry>): SessionUsage | undefined {
	const served = new Set<string>();
	const totals = { turns: 0, input: 0, output: 0, cacheRead: 0, cacheWrite: 0 };
	let counted = 0;
	for (const { usage, served: route } of entries) {
		if (usage === undefined) {
			continue;
		}
		counted += 1;
		for (const key of CLASSES) {
			totals[key] += usage[key];
		}
		if (route !== undefined) {
			totals.turns += 1;
			served.add(route);
		}
	}
	return counted ? { served: [...served], ...totals } : undefined;
}

/** The entries of the session file at `path` that a count reads, in the file's order, and each line that did not parse. */
export function readSessionFile(path: string): SessionFile {
	const entries: SessionEntry[] = [];
	const unread: BadData[] = [];
	for (const [index, line] of readFileSync(path, "utf8").split("\n").entries()) {
		const entry = line.trim() ? parseJson(`${path}:${index + 1}`, line, entryOf) : undefined;
		if (entry instanceof LimenError) {
			unread.push(entry);
		} else if (entry) {
			entries.push(entry);
		}
	}
	return { entries, unread };
}

/**
 * The time from which a job's entries are its own: its recorded start. A record with no start, or with one that names
 * no real time, cannot tell a copied turn from its own, so every entry counts.
 */
function ownFrom(startedAt: string | null): number {
	const start = Date.parse(startedAt ?? "");
	return Number.isNaN(start) ? Number.NEGATIVE_INFINITY : start;
}

/**
 * The transcripts of a job's session folder `session`, by name; none when the job has no such folder (ENOENT), the one
 * expected absence, so that any other failure to list it, as a `session` that is a file, goes on (T-01).
 */
function transcriptFiles(session: string): string[] {
	return jsonlFiles(session, ["ENOENT"]) ?? [];
}
/**
 * The session files directly in the folder `dir` that `limen stats --sessions` names, by name; undefined when no
 * folder is there: nothing at the path (ENOENT), or a file (ENOTDIR), which the command refuses alike.
 */
export function sessionFiles(dir: string): string[] | undefined {
	return jsonlFiles(dir, ["ENOENT", "ENOTDIR"]);
}
/** The `*.jsonl` files directly in the folder `dir`, by name; undefined when listing it fails with a code of `absent`. */
function jsonlFiles(dir: string, absent: readonly string[]): string[] | undefined {
	try {
		return readdirSync(dir)
			.filter((name) => name.endsWith(".jsonl"))
			.sort();
	} catch (error) {
		if (absent.some((code) => hasCode(error, code))) {
			return undefined;
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

// The validators of a session line, after Pi 1.5.1's `SessionEntry` (`core/session-manager.d.ts`), `Usage` and
// `ToolCall` (pi-ai). They read only what the counts need; the other fields and the other entry types stay unread.

/** The entry type of a Limen message in the coordinator's session (`pi.sendMessage`, E-16), which starts a run. */
const CUSTOM_MESSAGE = "custom_message";

/**
 * One line as a session entry: what a count reads of it, or undefined for an entry no count reads. An assistant
 * message carries its usage in its message; a compaction, a branch summary and a usage entry carry it at the top, a
 * compaction only when its summary came from a model call. A Limen custom message carries none.
 */
function entryOf(value: unknown, field: string): SessionEntry | undefined {
	const fields = object()(value, field);
	const kind = string(fields.get("type"), at(field, "type"));
	if (kind === "message") {
		return messageOf(fields, field);
	}
	if (!(fields.has("usage") || kind === CUSTOM_MESSAGE)) {
		return undefined;
	}
	const usage = fields.has("usage") ? tokensOf(fields.get("usage"), at(field, "usage")) : undefined;
	return { at: writtenAt(fields, field), kind, usage, served: undefined, commands: [] };
}

/**
 * A message entry: an assistant message, with its usage, the provider and model that answered and its bash commands,
 * and the owner's message, of role `user`; any other role, such as a tool's result, is no entry a count reads.
 */
function messageOf(fields: ReadonlyMap<string, unknown>, field: string): SessionEntry | undefined {
	const place = at(field, "message");
	const message = object()(fields.get("message"), place);
	const role = string(message.get("role"), at(place, "role"));
	if (role === "user") {
		return { at: writtenAt(fields, field), kind: role, usage: undefined, served: undefined, commands: [] };
	}
	if (role !== "assistant") {
		return undefined;
	}
	const provider = string(message.get("provider"), at(place, "provider"));
	const model = string(message.get("model"), at(place, "model"));
	return {
		at: writtenAt(fields, field),
		kind: role,
		usage: tokensOf(message.get("usage"), at(place, "usage")),
		served: provider ? `${provider}/${model}` : model,
		commands: (optional(arrayOf(bashCommandOf))(message.get("content"), at(place, "content")) ?? []).flat(),
	};
}

/**
 * One part of an assistant message's content: the command of a bash tool call, in the shape src/job/session-commands.ts
 * reads one, a part of type `toolCall` named `bash` whose arguments hold a command as text; none for any other part.
 * Pi checks a call's arguments against its tool's schema before it runs it (pi-agent-core's `prepareToolCall`), so a
 * bash call whose arguments hold no command as text ran nothing.
 */
function bashCommandOf(value: unknown, field: string): string[] {
	const part = object()(value, field);
	if (part.get("type") !== "toolCall" || part.get("name") !== "bash") {
		return [];
	}
	const command = object()(part.get("arguments"), at(field, "arguments")).get("command");
	return typeof command === "string" ? [command] : [];
}

/** The time of a session entry, which Pi writes with `toISOString`. */
function writtenAt(fields: ReadonlyMap<string, unknown>, field: string): number {
	return Date.parse(isoTime(fields.get("timestamp"), at(field, "timestamp")));
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
