// The one declaration of how the Claude bridge 5.0.3 maps Pi's side of one model call to what the model receives
// (T-25 (1), T-31 (1), D-115 (1)): a pure function from Pi's system prompt, the call's messages in Pi's form, the cwd's
// `AGENTS*` text, the isolation switch and the bridge's cursor after the previous call, to the call's view: the system
// prompt, the path the bridge takes, the whole conversation the model sees and its tools. test/fake-engine.mjs writes
// the view of every call it makes, and seat/bridge-contract.ts compares a new session's first prompt with the Claude
// Code session file on the seat (D-119). The rules come from `evidence/engine-sources/bridge-5.0.3.md`, read from the
// bridge's sources on 2026-11-17, and not from those sources, which the repository does not hold (D-115 (2)); each rule
// names its engine fact (`plan.md` → `## Engine facts`) and its source lines there.
import { dirname, join } from "node:path";
import { environmentError, type LimenError } from "../outcome.ts";

/**
 * The Claude Code preset the bridge's system prompt starts from; the bridge never replaces it (E-1,
 * `bridge@5.0.3/src/query-options.ts#L167-L170`).
 */
export const PRESET = "claude_code" as const;
/** The prefix of every Pi tool under the bridge (E-5, `bridge@5.0.3/src/index.ts#L316-L343`, `src/skills.ts#L4-L5`). */
export const TOOL_PREFIX = "mcp__custom-tools__";
/** The names of the `AGENTS*` file the bridge looks for, nearest first (E-1, `bridge@5.0.3/src/agents-md.ts#L41`). */
export const AGENTS_FILES = ["AGENTS.override.md", "AGENTS.md", "AGENTS.MD"] as const;
/**
 * Claude Code's own tools, which come back when Pi declares none: the bridge then drops `tools: []` and the denial of
 * these substituted built-ins and keeps only its always-denied list (E-5, `bridge@5.0.3/src/connectors.ts#L18-L46`,
 * `#L675-L677`, `src/query-options.ts#L93-L98`). The evidence lists these; Claude Code may hold others it does not name.
 */
export const CLAUDE_CODE_TOOLS = [
	"Read",
	"Write",
	"Edit",
	"MultiEdit",
	"Glob",
	"Grep",
	"Bash",
	"NotebookEdit",
	"WebFetch",
	"WebSearch",
] as const;
/**
 * Pi's text around a compaction summary, which the bridge passes on as it is (E-13, E-14;
 * `pi-coding-agent@1.5.1/dist/core/messages.js#L7-L12`).
 */
export const SUMMARY_PREFIX =
	"The conversation history before this point was compacted into the following summary:\n\n<summary>\n";
export const SUMMARY_SUFFIX = "\n</summary>";
/** The prompt the bridge sends for a run with no text (E-14, `bridge@5.0.3/src/index.ts#L1138-L1156`). */
export const EMPTY_PROMPT = "[continue]";
/**
 * The mark of the bridge's own notice after a replaced history, `HISTORY_REPLACED_PROMPT`, whose text the repository
 * does not hold (E-13, `bridge@5.0.3/src/index.ts#L590`).
 */
export const HISTORY_REPLACED = "history replaced";

/** A part of a Pi message: text, an image, thinking, or a tool call with its id and the tool's name. */
export type PiCallPart = {
	readonly type: string;
	readonly text?: string;
	readonly id?: string;
	readonly name?: string;
};
/**
 * One message of a model call in Pi's form (`AgentMessage`): `system`, `user`, `custom`, `compactionSummary`,
 * `assistant` or `toolResult`, with its content, a summary's text, and a tool result's call id and tool.
 */
export type PiCallMessage = {
	readonly role: string;
	readonly content?: string | readonly PiCallPart[];
	readonly summary?: string;
	readonly toolCallId?: string;
	readonly toolName?: string;
};
/**
 * Pi's side of one model call: Pi's system prompt for the run, every message of the call, the text of the nearest
 * `AGENTS*` file above the cwd (undefined for none), whether the bridge runs with `CLAUDE_BRIDGE_ISOLATED=1`, and the
 * names of Pi's active tools.
 */
export type PiCall = {
	readonly systemPrompt: string;
	readonly messages: readonly PiCallMessage[];
	readonly agents: string | undefined;
	readonly isolated: boolean;
	readonly tools: readonly string[];
};

/**
 * One record the model sees: its role, its text blocks in order, the tools an assistant record calls or a tool
 * record answers, by their names under the bridge, and the mark of the bridge's notice, which has no text here.
 */
export type ViewRecord = {
	readonly role: "user" | "assistant" | "tool";
	readonly text: readonly string[];
	readonly tools?: readonly string[];
	readonly notice?: typeof HISTORY_REPLACED;
};
/**
 * How the bridge prepared the Claude Code session of the query that serves a call (E-14): `fresh`, a new session with
 * no history; `reuse`, the session resumed with only the trailing run of user messages sent; `rebuild`, the session
 * rewritten from Pi's history. A call that brings tool results continues the query of the call before it (E-5), so it
 * keeps that query's path.
 */
export type BridgePath = "fresh" | "reuse" | "rebuild";
/** What the model receives in one call. */
export type BridgeView = {
	readonly system: { readonly preset: typeof PRESET; readonly append: readonly string[] };
	readonly path: BridgePath;
	readonly messages: readonly ViewRecord[];
	readonly tools: readonly string[];
};
/**
 * What the bridge keeps after a call: how many of the call's Pi messages the Claude Code session holds, the path and
 * the trailing run of the query that served it, the records of that session, whether that query still runs because
 * its answer ended in tool calls (`answered`), and whether a Pi compaction replaced the history since, with the query
 * still running (`restart`) or not (`rebuild`).
 */
export type BridgeCursor = {
	readonly held: number;
	readonly path: BridgePath;
	readonly prompt: readonly PiCallMessage[];
	readonly session: readonly ViewRecord[];
	readonly waits: boolean;
	readonly replaced: "no" | "rebuild" | "restart";
};

/**
 * The view of one call and the bridge's cursor after it, from the cursor after the call before it, which is undefined
 * for the first call of the bridge in a Pi session.
 */
export function bridgeView(
	call: PiCall,
	cursor: BridgeCursor | undefined,
): { readonly view: BridgeView; readonly cursor: BridgeCursor } {
	const system = { preset: PRESET, append: systemAppend(call) };
	const served = serve(call.messages, cursor);
	const view: BridgeView = { system, path: served.path, messages: served.records, tools: toolNames(call.tools) };
	const next: BridgeCursor = {
		held: call.messages.length,
		path: served.path,
		prompt: served.prompt,
		session: served.records,
		// The call's answer is not known here; `answered` records it.
		waits: false,
		replaced: "no",
	};
	return { view, cursor: next };
}

/**
 * The cursor after the model answered a call with `answer`, Pi's assistant message: an answer with tool calls leaves
 * the query running, its MCP handlers waiting on the results (E-5, `bridge@5.0.3/src/index.ts#L442-L452`); an answer
 * of text ends the Claude Code turn and the query (`bridge@5.0.3/src/index.ts#L1612-L1613`).
 */
export function answered(cursor: BridgeCursor, answer: PiCallMessage): BridgeCursor {
	return { ...cursor, waits: toolCalls(answer).length > 0 };
}

/**
 * The cursor after a Pi compaction replaced the history (E-13, `bridge@5.0.3/src/index.ts#L645-L661`): the next query
 * rebuilds the Claude Code session; while a query runs, between turns of a run, the bridge also kills it and restarts
 * it under a new session id with its request and a notice. Before the first call there is nothing to replace.
 */
export function historyReplaced(cursor: BridgeCursor | undefined): BridgeCursor | undefined {
	return cursor && { ...cursor, replaced: cursor.waits ? "restart" : "rebuild" };
}

/**
 * The path of the `AGENTS*` file the bridge appends for `cwd` (E-1): the first of `AGENTS_FILES` that `exists` finds in
 * `cwd`, then in each folder above it up to the filesystem root, where the bridge's walk stops
 * (`bridge@5.0.3/src/agents-md.ts#L74-L92`); with none there, the one in Pi's agent directory `agentDir`, which the
 * bridge skips only when its `settingSources` name `user`, and it passes none by default (`#L74-L80`,
 * `src/connectors.ts#L86-L95`); undefined for none. Isolated, the bridge reads none, which `systemAppend` applies (E-15).
 */
export function agentsPath(cwd: string, agentDir: string, exists: (path: string) => boolean): string | undefined {
	const found = (folder: string) => AGENTS_FILES.map((name) => join(folder, name)).find(exists);
	for (let folder = cwd; ; folder = dirname(folder)) {
		const path = found(folder);
		if (path !== undefined) {
			return path;
		}
		if (dirname(folder) === folder) {
			return found(agentDir);
		}
	}
}

/**
 * The tools the model gets: Pi's under the bridge's prefix (E-5, `bridge@5.0.3/src/index.ts#L316-L343`), or Claude
 * Code's own when Pi declares none (`CLAUDE_CODE_TOOLS`).
 */
function toolNames(tools: readonly string[]): readonly string[] {
	return tools.length === 0 ? CLAUDE_CODE_TOOLS : tools.map((name) => `${TOOL_PREFIX}${name}`);
}

/**
 * The append to the preset: the `AGENTS*` text, then Pi's skills block, never Pi's own prompt (E-1,
 * `bridge@5.0.3/src/query-options.ts#L109-L113`, `#L167-L170`). The four opt-in blocks are off by default
 * (`bridge@5.0.3/README.md#L64`) and Limen turns none on, so none is here.
 */
function systemAppend(call: PiCall): string[] {
	// E-15: isolated, the bridge forwards no `AGENTS*` file at all (`bridge@5.0.3/src/agents-md.ts#L75`).
	const agents = call.isolated || call.agents === undefined ? [] : [agentsText(call.agents)];
	const skills = skillsBlock(call.systemPrompt);
	return [...agents, ...(skills === undefined ? [] : [skills])];
}

/**
 * The `AGENTS*` text as the bridge appends it: under the heading `# CLAUDE.md`, the word `pi` as `environment` (E-1,
 * `bridge@5.0.3/src/agents-md.ts#L94-L101`, `#L110-L117`). `bridge-5.0.3.md` §10 also names a `.pi` to `.claude`
 * rewrite of the same lines without its order against this one, so this declaration leaves it to the bridge's sources.
 */
function agentsText(text: string): string {
	return `# CLAUDE.md\n\n${text.replace(/\bpi\b/g, "environment")}`;
}

const SKILLS_START = "The following skills provide specialized instructions";
const SKILLS_END = "</available_skills>";
/**
 * Pi's skills block, the only part of Pi's prompt the bridge reads: from its first sentence to `</available_skills>`,
 * with the read tool of its hint under the bridge's name (E-1, `bridge@5.0.3/src/skills.ts#L8-L24`); undefined when
 * Pi's prompt holds none. The evidence names the hint's rewrite, not its exact text, so the hint's tool name is what
 * changes here.
 */
function skillsBlock(prompt: string): string | undefined {
	const start = prompt.indexOf(SKILLS_START);
	const end = start < 0 ? -1 : prompt.indexOf(SKILLS_END, start);
	if (end < 0) {
		return undefined;
	}
	return prompt.slice(start, end + SKILLS_END.length).replace("Use the read tool", `Use the ${TOOL_PREFIX}read tool`);
}

type Served = {
	readonly path: BridgePath;
	readonly records: readonly ViewRecord[];
	readonly prompt: readonly PiCallMessage[];
};

/** How the bridge serves the call's messages after `cursor`: the path, the records the model sees, and the prompt. */
function serve(messages: readonly PiCallMessage[], cursor: BridgeCursor | undefined): Served {
	if (cursor === undefined) {
		// E-14: a first turn arrives as [system, user] with its system entries dropped
		// (`bridge@5.0.3/src/session-persistence.ts#L646-L653`); a first turn with history takes REBUILD (`#L519-L552`).
		const run = trailingRun(messages);
		return history(messages, run).length === 0 ? fresh(run) : rebuild(messages, run);
	}
	if (cursor.replaced === "restart") {
		return restart(messages, cursor);
	}
	if (cursor.replaced === "rebuild") {
		// E-13: a compaction with no query running marks the session for a rebuild in place
		// (`bridge@5.0.3/src/index.ts#L645-L661`, `src/session-persistence.ts#L670`).
		return rebuild(messages, trailingRun(messages));
	}
	const tail = messages.slice(cursor.held);
	const continued = toolResultsOf(tail);
	if (continued !== undefined) {
		return proceed(cursor, tail, continued);
	}
	// E-14: REUSE needs the tail after the cursor, past one assistant message, to be all user
	// (`bridge@5.0.3/src/session-persistence.ts#L447-L457`); any other entry, a Pi `system` one included, takes REBUILD.
	const [first, ...rest] = tail;
	const reply = first?.role === "assistant" ? [first] : [];
	const asked = reply.length > 0 ? rest : tail;
	if (asked.every(isUserTurn)) {
		const records = [...cursor.session, ...reply.map(assistantRecord), promptRecord(asked)];
		return { path: "reuse", records, prompt: asked };
	}
	return rebuild(messages, trailingRun(messages));
}

/**
 * A new session: the trailing run is the whole conversation, sent as one prompt (E-14, the prompt
 * `bridge@5.0.3/src/index.ts#L1123-L1125`, a first turn's `system` entries dropped
 * `src/session-persistence.ts#L646-L653`).
 */
function fresh(run: PiCallMessage[]): Served {
	return { path: "fresh", records: [promptRecord(run)], prompt: run };
}

/**
 * The session rewritten from Pi's history (E-14, `bridge@5.0.3/src/session-persistence.ts#L671-L683`): one record per
 * message before the trailing run (`bridge@5.0.3/src/convert.ts#L143-L148`), then the run as the query's prompt.
 */
function rebuild(messages: readonly PiCallMessage[], run: PiCallMessage[]): Served {
	return { path: "rebuild", records: [...historyRecords(history(messages, run)), promptRecord(run)], prompt: run };
}

/**
 * A compaction between turns of a run (E-13, `bridge@5.0.3/src/index.ts#L612-L625`): the bridge kills the query and
 * sends Pi's messages before the trailing run, the request the killed query answered unless the trailing run holds
 * it, the trailing run, and its notice of a replaced history, which the view marks without text, through REBUILD.
 */
function restart(messages: readonly PiCallMessage[], cursor: BridgeCursor): Served {
	const run = trailingRun(messages);
	const request = cursor.prompt.filter((asked) => !run.some((message) => sameMessage(message, asked)));
	const prompt = [...request, ...run];
	const sent = prompt.length > 0 ? [promptRecord(prompt)] : [];
	const notice: ViewRecord = { role: "user", text: [], notice: HISTORY_REPLACED };
	return { path: "rebuild", records: [...historyRecords(history(messages, run)), ...sent, notice], prompt };
}

/**
 * A call that brings the results of the tool calls the call before it ended in: they resolve the MCP handlers the
 * running query waits on, so the same Claude Code turn goes on (E-5, `bridge@5.0.3/src/index.ts#L800-L808`). A user
 * message Pi put after the results follows them here; the bridge holds such a message until the Claude Code turn ends
 * and sends it then (`bridge@5.0.3/src/index.ts#L874-L879`), with the model's reply to the results before it.
 */
function proceed(cursor: BridgeCursor, tail: readonly PiCallMessage[], results: number): Served {
	const [call, ...rest] = tail;
	const answered = rest.slice(0, results).map(toolRecord);
	const after = rest.slice(results);
	const records = [
		...cursor.session,
		...(call ? [assistantRecord(call)] : []),
		...answered,
		...(after.length > 0 ? [promptRecord(after)] : []),
	];
	return { path: cursor.path, records, prompt: cursor.prompt };
}

/**
 * How many tool results follow `tail`'s first message, an assistant message with tool calls; undefined when it is no
 * such message or no result follows it (E-5, `bridge@5.0.3/src/index.ts#L800-L808`).
 */
function toolResultsOf(tail: readonly PiCallMessage[]): number | undefined {
	const [first, ...rest] = tail;
	if (first?.role !== "assistant" || toolCalls(first).length === 0) {
		return undefined;
	}
	const results = rest.findIndex((message) => message.role !== "toolResult");
	const count = results < 0 ? rest.length : results;
	return count > 0 ? count : undefined;
}

/**
 * Whether `message` reaches the model as a user message (E-1, `bridge@5.0.3/src/query-options.ts#L109-L113` for what
 * the bridge forwards): Pi's own, a custom message, or a summary, which Pi hands the bridge as user messages
 * (`pi-coding-agent@1.5.1/dist/core/messages.js#L89-L110`).
 */
function isUserTurn(message: PiCallMessage): boolean {
	return message.role === "user" || message.role === "custom" || message.role === "compactionSummary";
}

/** The trailing run of user messages, which the query sends as its prompt (E-14, `bridge@5.0.3/src/index.ts#L1123-L1125`). */
function trailingRun(messages: readonly PiCallMessage[]): PiCallMessage[] {
	const visible = messages.filter((message) => message.role !== "system");
	let start = visible.length;
	while (start > 0 && visible.slice(start - 1, start).every(isUserTurn)) {
		start -= 1;
	}
	return visible.slice(start);
}

/**
 * The messages before the trailing run `run`, without Pi's `system` entries, which the bridge drops (E-1,
 * `bridge@5.0.3/src/convert.ts#L141-L202`).
 */
function history(messages: readonly PiCallMessage[], run: readonly PiCallMessage[]): PiCallMessage[] {
	const visible = messages.filter((message) => message.role !== "system");
	return visible.slice(0, visible.length - run.length);
}

/**
 * The trailing run as the one prompt of a query (E-14): each message flattened, joined in Pi's order with a blank
 * line (`bridge@5.0.3/src/index.ts#L202-L207`), and `[continue]` for a run with no text (`#L1138-L1156`).
 */
function promptRecord(run: readonly PiCallMessage[]): ViewRecord {
	const text = run.map(flattened).join("\n\n");
	return { role: "user", text: [text.trim() === "" ? EMPTY_PROMPT : text] };
}

/**
 * One message of a prompt as text (E-14, `bridge@5.0.3/src/convert.ts#L47-L59`): a string as it is, else its text
 * blocks joined with a newline, any other block as `[type]`, and nothing for a message with no text block. A summary
 * is Pi's user message with its prefix (`pi-coding-agent@1.5.1/dist/core/messages.js#L103-L110`). A run with an image
 * takes the bridge's block path (`bridge@5.0.3/src/index.ts#L212-L247`), which this declaration does not hold.
 */
function flattened(message: PiCallMessage): string {
	if (message.role === "compactionSummary") {
		return summaryText(message);
	}
	const content = handedContent(message);
	if (typeof content === "string") {
		return content;
	}
	const parts = content ?? [];
	if (parts.some((part) => part.type === "image")) {
		throw unmapped("a prompt run with an image takes the bridge's block path, which the view does not declare");
	}
	const texts = parts.filter((part) => part.type === "text");
	return texts.length === 0
		? ""
		: parts.map((part) => (part.type === "text" ? (part.text ?? "") : `[${part.type}]`)).join("\n");
}

/**
 * The records of a rewritten session (E-14): one per message, Pi's `system` entries dropped (E-1,
 * `bridge@5.0.3/src/convert.ts#L141-L202`), and each tool result right after the assistant record that called it
 * (`bridge@5.0.3/src/convert.ts#L176-L191`).
 */
function historyRecords(messages: readonly PiCallMessage[]): ViewRecord[] {
	const results = messages.filter((message) => message.role === "toolResult");
	const placed = new Set<PiCallMessage>();
	const records: ViewRecord[] = [];
	for (const message of messages) {
		if (message.role === "toolResult") {
			if (!placed.has(message)) {
				records.push(toolRecord(message));
			}
			continue;
		}
		records.push(historyRecord(message));
		const calls = message.role === "assistant" ? toolCalls(message).map((part) => part.id) : [];
		for (const result of results.filter((each) => calls.includes(each.toolCallId) && !placed.has(each))) {
			placed.add(result);
			records.push(toolRecord(result));
		}
	}
	return records;
}

/** One message of a rewritten session that is no tool result. */
function historyRecord(message: PiCallMessage): ViewRecord {
	if (message.role === "assistant") {
		return assistantRecord(message);
	}
	if (message.role === "compactionSummary") {
		// E-13: the rewritten session holds Pi's summary as one user record, as each Pi user message is its own record
		// (`bridge@5.0.3/src/convert.ts#L143-L148`), with Pi's prefix (`pi-coding-agent@1.5.1/dist/core/messages.js#L103-L110`).
		return { role: "user", text: [summaryText(message)] };
	}
	if (!isUserTurn(message)) {
		throw unmapped(`a Pi message of role ${JSON.stringify(message.role)} has no mapping`);
	}
	// E-1: a custom message reaches the model as a user message (`pi-coding-agent@1.5.1/dist/core/messages.js#L89-L96`).
	return { role: "user", text: storedText(handedContent(message)) };
}

/**
 * A user message's text as its own record (E-14, `bridge@5.0.3/src/convert.ts#L97-L109`): a string as it is, or
 * `[empty]`; else its non-empty text blocks, unjoined, or `[image]` when none remains.
 */
function storedText(content: PiCallMessage["content"]): string[] {
	if (typeof content === "string") {
		return [content === "" ? "[empty]" : content];
	}
	const texts = (content ?? []).flatMap((part) => (part.type === "text" && part.text ? [part.text] : []));
	return texts.length > 0 ? texts : ["[image]"];
}

/**
 * An assistant message as the bridge keeps it: its text blocks and its tool calls under the bridge's names (E-5,
 * `bridge@5.0.3/src/convert.ts#L149-L169`). Thinking stays only with a signature from the bridge's own route, which
 * Limen's sessions never record, and another provider's turn gets a prefix (`#L87-L95`), which the seat's one route
 * never needs.
 */
function assistantRecord(message: PiCallMessage): ViewRecord {
	const parts =
		typeof message.content === "string" ? [{ type: "text", text: message.content }] : (message.content ?? []);
	const text = parts.flatMap((part) => (part.type === "text" && part.text ? [part.text] : []));
	const tools = toolCalls(message).map((part) => `${TOOL_PREFIX}${part.name ?? ""}`);
	return { role: "assistant", text, ...(tools.length > 0 ? { tools } : {}) };
}

/**
 * A tool result: the one record of another role than user and assistant (T-31 (1), E-5): it resolves the MCP handler
 * of its tool, named under the bridge's prefix (`bridge@5.0.3/src/index.ts#L800-L808`, `#L316-L343`), and a rewritten
 * session keeps it right after its tool use (`src/convert.ts#L176-L191`).
 */
function toolRecord(message: PiCallMessage): ViewRecord {
	const parts =
		typeof message.content === "string" ? [{ type: "text", text: message.content }] : (message.content ?? []);
	const text = parts.flatMap((part) => (part.type === "text" && part.text !== undefined ? [part.text] : []));
	return { role: "tool", text, tools: [`${TOOL_PREFIX}${message.toolName ?? ""}`] };
}

/** The tool calls of an assistant message, the bridge's tool uses (E-5, `bridge@5.0.3/src/convert.ts#L149-L169`). */
function toolCalls(message: PiCallMessage): PiCallPart[] {
	return typeof message.content === "string" ? [] : (message.content ?? []).filter((part) => part.type === "toolCall");
}

/**
 * A message's content as Pi hands it to the bridge: a custom message's string as one text block (E-1,
 * `pi-coding-agent@1.5.1/dist/core/messages.js#L89-L96`), any other content as the message holds it.
 */
function handedContent(message: PiCallMessage): PiCallMessage["content"] {
	return message.role === "custom" && typeof message.content === "string"
		? [{ type: "text", text: message.content }]
		: message.content;
}

/** Pi's text of a compaction summary (E-13, `pi-coding-agent@1.5.1/dist/core/messages.js#L103-L110`). */
function summaryText(message: PiCallMessage): string {
	return `${SUMMARY_PREFIX}${message.summary ?? ""}${SUMMARY_SUFFIX}`;
}

/**
 * Whether two messages of a prompt are the same message, the same role and the same content, as the restart re-sends
 * a request only when the trailing run does not hold it (E-13, `bridge@5.0.3/src/index.ts#L612-L625`).
 */
function sameMessage(one: PiCallMessage, other: PiCallMessage): boolean {
	return one === other || (one.role === other.role && JSON.stringify(one.content) === JSON.stringify(other.content));
}

/** A Pi message the declaration has no rule for; class `environment`, as data from outside Limen of an unknown shape. */
function unmapped(message: string): LimenError {
	return environmentError("BRIDGE_UNMAPPED", `the bridge view: ${message}`);
}
