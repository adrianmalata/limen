import { readFileSync } from "node:fs";
import { basename, isAbsolute, join, relative, resolve } from "node:path";
import { transport } from "../src/config.ts";
import { type JobRecord, readRecordSync } from "../src/job/record.ts";
import { readOptional } from "../src/project/inherit.ts";
import { moduleTitle } from "../src/project/modules.ts";
import { ticketPointers } from "../src/project/planning.ts";
import {
	boundLines,
	boundText,
	CONTEXT_FILE,
	type ContextAudience,
	capabilitySection,
	changedSince,
	contextMessage,
	enabledModules,
	holdsSpecs,
	markdownSection,
	moduleFiles,
	packageName,
	packageText,
	projectText,
	SPECS_REGISTER,
	STYLE_FILE,
	trimmedLines,
	VISION_FILE,
} from "../src/runtime/context-message.ts";
import { sessionRoot } from "../src/runtime/hook-set.ts";
import {
	type PiApi,
	type PiContext,
	type PiContextEntry,
	type PiCustomMessage,
	type PiPart,
	type PiStartResult,
	type PiToolResultEvent,
	piContext,
	piContextEntries,
	piEvent,
	recorded,
} from "../src/runtime/pi-api.ts";
import { jobAudience } from "../src/runtime/roles.ts";
import { assistantStopReason } from "../src/runtime/stream.ts";

/** The custom type of the context message (D-114 (1), T-16): a `limen-*` custom message, never a user message. */
const CONTEXT_TYPE = "limen-context";
/** The custom type of the turn cue and the name of its tag pair (D-134 (1)), a `limen-*` custom message as well. */
const CUE_TYPE = "limen-turn-cue";
/** The custom type and tag pair of the notice of the files changed since the context message was built (A-037). */
const NOTICE_TYPE = "limen-notice";
/** The custom type and tag pair of the coordinator's board digest (A-037, T-23). */
const BOARD_TYPE = "limen-board";
/** The end of a notice's line after `changed <path>`, A-037's words; R-046 sets the final ones. */
const NOTICE_END = ", new text from the next session";
/** The notice's line of one path starts with this word. */
const NOTICE_START = "changed ";
/** The board, whose NOW and NEXT the digest holds. */
const BOARD_FILE = "spec/build.md";
/** The audience line of the coordinator's cue: it answers the owner in the owner's language (T-13). */
const OWNER_AUDIENCE = "Audience: owner. Answer in the language of the owner's last message.";
/** The audience line of a job's cue: every job writes for agents and records, in English (T-13). */
const AGENT_AUDIENCE = "Audience: agent. Plain technical English.";
const BOARD_ADVISORY_LINES = 120;
// A styleguide heading that names one of these words applies only to files with the listed extensions.
const LANGUAGES: Readonly<Record<string, readonly string[]>> = {
	rust: ["rs"],
	typescript: ["ts", "tsx", "mts", "cts"],
	javascript: ["js", "jsx", "mjs", "cjs"],
	frontend: ["ts", "tsx", "js", "jsx", "css", "html", "svelte", "vue"],
	css: ["css", "scss"],
	swift: ["swift"],
	python: ["py"],
};

type ReminderKind = "specs" | "style" | "vision";
/** A reminder a tool result asks for: its kind, and the written file whose path picks the styleguide's sections. */
type Ask = { readonly kind: ReminderKind; readonly paths: readonly string[] };
type Section = { readonly title: string; readonly level: number; readonly start: number; readonly end: number };
/** A guidance file as a reminder appends it: the name its header gives the file, and the file's lines. */
type Guide = { readonly shown: string; readonly lines: readonly string[] };

/** The header's name of each kind of guidance. */
const LABELS: Readonly<Record<ReminderKind, string>> = { specs: "Specs", style: "Styleguide", vision: "Vision" };
/** The vision is one section, which no path scopes. */
const VISION_ASK: Ask = { kind: "vision", paths: [] };

/**
 * Limen's standing text is the session's context message (A-086), which Pi's system prompt cannot carry under the
 * bridge (E-1): the hook sends it once, at the session's start, and again only after a compaction removed it from the
 * model's context, always the bytes the session holds (A-037). The per-turn note is a short cue that repeats no
 * register section: its audience line carries the language that the registers' rule names (T-13), then come the lines
 * that apply and the frame's anchor (A-077). After the cue a run gets the notice of the files changed since the
 * context message was built, and in the coordinator the board digest last, each only when the context the model holds
 * lacks it (A-037, D-120). A tool result, the one message of a role of its own (E-1), carries the text of the guidance
 * that applies to what the call wrote, each section once until a compaction or a new session start (A-041): the
 * styleguide after a code edit, the specs register after an edit under spec/, with the specs file of each module that
 * is on, and the vision once a planned ticket is written (H-12).
 */
export default function limenCommunication(pi: Pick<PiApi, "on" | "sendMessage">): void {
	let lastTouch: string | undefined;
	let lastFailure: string | undefined;
	pi.on(
		"before_agent_start",
		recorded((raw: unknown, rawContext: unknown) => {
			piEvent("before_agent_start", raw);
			const context = piContext("before_agent_start", rawContext, ["cwd"]);
			const root = sessionRoot(context.cwd);
			const job = transport("LIMEN_JOB") === "1";
			const touched = lastTouch;
			const failed = lastFailure;
			lastTouch = undefined;
			lastFailure = undefined;
			const cue = turnCue(root, job, touched, failed);
			return { message: { customType: CUE_TYPE, content: cue, display: false } };
		}),
	);
	// Pi collects each handler's message in the order the handlers were registered, after the run's prompt, so the
	// prompt ends with the cue, then the notice, then the digest (D-120). Neither keeps state of its own: what the model
	// was told is what the session's compaction-aware context holds, so a `/reload` repeats nothing and a compaction
	// repeats what it summarised.
	pi.on(
		"before_agent_start",
		recorded((raw: unknown, rawContext: unknown) => {
			piEvent("before_agent_start", raw);
			return changeNotice(piContext("before_agent_start", rawContext, ["cwd", "sessionManager"]));
		}),
	);
	pi.on(
		"before_agent_start",
		recorded((raw: unknown, rawContext: unknown) => {
			piEvent("before_agent_start", raw);
			return boardDigest(piContext("before_agent_start", rawContext, ["cwd", "sessionManager"]));
		}),
	);
	pi.on(
		"message_end",
		recorded((raw: unknown) => {
			const { message } = piEvent("message_end", raw);
			if (message.role !== "assistant") {
				return;
			}
			lastFailure = assistantStopReason(message) || undefined;
		}),
	);
	/** The sections the reminders appended in this context, by `sectionKey`; a compaction summarises them away. */
	const shown = new Set<string>();
	// A session's start and a compaction give a new context, so the reminders start over with it.
	deliverContext(pi, () => shown.clear());
	pi.on(
		"tool_result",
		recorded((raw: unknown, rawContext: unknown) => {
			const event = piEvent("tool_result", raw);
			const context = piContext("tool_result", rawContext, ["cwd"]);
			if (event.isError) {
				return;
			}
			const asks = guidanceAsks(event);
			lastTouch = touchLine(event, asks) ?? lastTouch;
			const root = sessionRoot(context.cwd);
			const reminders = asks
				.filter((ask) => ask.kind !== "specs" || sessionHoldsSpecs(root))
				.flatMap((ask) => [
					reminder(shown, ask, root, context.cwd),
					...(ask.kind === "specs" ? moduleSpecsReminders(shown, root) : []),
				])
				.filter(Boolean);
			if (!reminders.length) {
				return;
			}
			// Pi drops the structured content of a result whose content a handler replaced alone (Pi 1.5.1's
			// core/extensions/types.d.ts:1129-1140), so the handler returns it beside the new content (R-043 Decision 10).
			const content = appendText(event.content, reminders.join("\n\n"));
			const { structuredContent } = event;
			return structuredContent === undefined ? { content } : { content, structuredContent };
		}),
	);
}

/**
 * The model keeps Limen's standing text only while the session's context holds the context message, so the hook sends
 * the bytes the session holds once at its start and again after a compaction removed them, with no turn of its own; the
 * options of each send follow D-114 (1) and E-13. Each handler calls `forget` first.
 */
function deliverContext(pi: Pick<PiApi, "on" | "sendMessage">, forget: () => void): void {
	// The context message this session holds.
	let frozen: PiCustomMessage | undefined;
	// Between a run's agent_end and its agent_settled.
	let ending = false;
	pi.on(
		"session_start",
		recorded((raw: unknown, rawContext: unknown) => {
			forget();
			piEvent("session_start", raw);
			const context = piContext("session_start", rawContext, ["cwd", "sessionManager"]);
			const held = heldContext(piContextEntries("session_start", context));
			if (held !== undefined) {
				frozen = contextOf(held);
				return;
			}
			frozen = contextOf(startingContext(context));
			pi.sendMessage(frozen);
		}),
	);
	pi.on(
		"session_compact",
		recorded((raw: unknown, rawContext: unknown) => {
			forget();
			const { willRetry } = piEvent("session_compact", raw);
			if (frozen === undefined) {
				return;
			}
			const context = piContext("session_compact", rawContext, ["sessionManager"]);
			if (heldContext(piContextEntries("session_compact", context)) !== undefined) {
				return;
			}
			if (ending && !willRetry) {
				pi.sendMessage(frozen, { triggerTurn: false });
			} else {
				pi.sendMessage(frozen);
			}
		}),
	);
	// Pi continues a run with its queued messages in a new agent loop, so a loop's start ends the window of its agent_end.
	pi.on(
		"agent_start",
		recorded(() => {
			ending = false;
		}),
	);
	pi.on(
		"agent_end",
		recorded(() => {
			ending = true;
		}),
	);
	pi.on(
		"agent_settled",
		recorded(() => {
			ending = false;
		}),
	);
}

/** The context message as the hook sends it: hidden from the owner's chat, which the model still gets (E-11). */
function contextOf(content: string): PiCustomMessage {
	return { customType: CONTEXT_TYPE, content, display: false };
}

/** The content of the context message the session's compaction-aware context holds; undefined when it holds none. */
function heldContext(entries: readonly PiContextEntry[]): string | undefined {
	const entry = entries.find((one) => isCustom(one, CONTEXT_TYPE));
	return entry === undefined ? undefined : contentText(entry);
}

/** Whether `entry` is a custom message of the type `customType`, one a hook sent or returned. */
function isCustom(entry: PiContextEntry, customType: string): boolean {
	return entry.type === "custom_message" && entry.customType === customType;
}

/** The text of a custom message entry: its string, or its text parts joined by a line break. */
function contentText(entry: PiContextEntry): string {
	const content = entry.content ?? "";
	return typeof content === "string"
		? content
		: content.flatMap((part) => (part.type === "text" ? [part.text ?? ""] : [])).join("\n");
}

/** `lines` between the opening and the closing tag of `type`, one per line, as the cue's (D-114 (3)). */
function tagPair(type: string, lines: readonly string[]): string {
	return [`<${type}>`, ...lines, `</${type}>`].join("\n");
}

/** A hidden custom message of `customType` that a `before_agent_start` handler returns with the run (D-120, E-11). */
function withRun(customType: string, content: string): PiStartResult {
	return { message: { customType, content, display: false } };
}

/**
 * The run's notice of the files changed since the session's context message was built (A-037, A-079), in the
 * coordinator's session and in a job's: the paths whose part of the message the context holds differs from the
 * part built now, less every path a notice in that context already names, one line each; none when the context holds
 * no message or no path is left. A continuation's context holds its parent's message, so its first run names every
 * file changed since the parent's publication, and the parent's notices, which its copied context holds, not again.
 */
function changeNotice(context: Pick<PiContext, "cwd" | "sessionManager">): PiStartResult | undefined {
	const entries = piContextEntries("before_agent_start", context);
	const frozen = heldContext(entries);
	if (frozen === undefined) {
		return undefined;
	}
	const root = sessionRoot(context.cwd);
	const named = new Set(entries.flatMap(noticedPaths));
	const paths = changedSince(frozen, root, sessionAudience(root)).filter((path) => !named.has(path));
	if (!paths.length) {
		return undefined;
	}
	const lines = paths.map((path) => `${NOTICE_START}${path}${NOTICE_END}`);
	return withRun(NOTICE_TYPE, tagPair(NOTICE_TYPE, lines));
}

/** The paths a notice entry names, one per line of `changeNotice`'s form; none for any other entry. */
function noticedPaths(entry: PiContextEntry): string[] {
	if (!isCustom(entry, NOTICE_TYPE)) {
		return [];
	}
	return contentText(entry)
		.split("\n")
		.filter((line) => line.startsWith(NOTICE_START) && line.endsWith(NOTICE_END))
		.map((line) => line.slice(NOTICE_START.length, -NOTICE_END.length));
}

/**
 * The audience whose message this session holds: the coordinator, or a job, built from its record by the function its
 * publication used (`jobAudience`, src/runtime/roles.ts).
 */
function sessionAudience(root: string): ContextAudience {
	if (transport("LIMEN_JOB") !== "1") {
		return { session: "coordinator" };
	}
	const record = sessionRecord(root);
	const job = { role: record?.role, provider: record?.route.provider, model: record?.route.model };
	return jobAudience(root, job, "record");
}

/** The record of this job session's job in the project at `root`; undefined when its folder holds none. */
function sessionRecord(root: string): JobRecord | undefined {
	return readRecordSync(join(root, ".limen", "jobs", transport("LIMEN_JOB_ID") ?? ""));
}

/**
 * The coordinator's board digest (A-037, T-23): the NOW and NEXT of the board in their tag pair, returned with the run
 * when the context holds no digest or its last one has another text (T-15's text comparison), so a session's first run
 * gets it, an unchanged board sends nothing, and after a compaction that summarised it, it comes again. None in a job,
 * and none for a project whose board holds neither section. Its text is today's, until R-073 gives it `limen status`'s
 * function (T-37 (3)).
 */
function boardDigest(context: Pick<PiContext, "cwd" | "sessionManager">): PiStartResult | undefined {
	if (transport("LIMEN_JOB") === "1") {
		return undefined;
	}
	const text = digestText(sessionRoot(context.cwd));
	if (!text) {
		return undefined;
	}
	const content = tagPair(BOARD_TYPE, [text]);
	const last = piContextEntries("before_agent_start", context).findLast((entry) => isCustom(entry, BOARD_TYPE));
	return last !== undefined && contentText(last) === content ? undefined : withRun(BOARD_TYPE, content);
}

/** The board's `## NOW` and `## NEXT` sections under one heading, within the line bound; "" with neither. */
function digestText(root: string): string {
	const board = readOptional(join(root, BOARD_FILE));
	if (board === undefined) {
		return "";
	}
	const body = ["NOW", "NEXT"]
		.map((heading) => markdownSection(board, heading))
		.filter(Boolean)
		.join("\n\n");
	return boundText(body, BOARD_FILE, "Board digest");
}

/**
 * The message a session without one starts with: the coordinator's, built from the package and the project's files,
 * or a job's, which its publication saved in the job's folder (A-079); the wrapper starts no engine without that file.
 */
function startingContext(context: Pick<PiContext, "cwd">): string {
	const root = sessionRoot(context.cwd);
	if (transport("LIMEN_JOB") !== "1") {
		return contextMessage(root, { session: "coordinator" });
	}
	return readFileSync(join(root, ".limen", "jobs", transport("LIMEN_JOB_ID") ?? "", CONTEXT_FILE), "utf8");
}

/**
 * The run's cue (A-077): the context message holds the standing text, so the cue holds the audience line, which names
 * the reply's language (T-13), then each line that applies (the last turn's failure, a job's ticket, the file the last
 * turn touched, an over-long board in the coordinator), then the capability frame's anchor (A-043), one line each.
 */
function turnCue(root: string, job: boolean, lastTouch: string | undefined, failed: string | undefined): string {
	const lines = [
		job ? AGENT_AUDIENCE : OWNER_AUDIENCE,
		failed ? `Last turn failed (${failed}).` : "",
		job ? ticketLine(root) : "",
		lastTouch ?? "",
		job ? "" : boardAdvisory(root),
		capabilitySection("Cue"),
	].filter(Boolean);
	return tagPair(CUE_TYPE, lines);
}

/** The cue's line on the ticket the job's task names; "" when it names none. */
function ticketLine(root: string): string {
	const ticket = jobTicket(root);
	return ticket ? `Ticket: ${ticket}` : "";
}

function boardAdvisory(cwd: string): string {
	const board = readOptional(join(cwd, BOARD_FILE));
	if (board === undefined) {
		return "";
	}
	const count = trimmedLines(board).length;
	if (count <= BOARD_ADVISORY_LINES) {
		return "";
	}
	return `spec/build.md is ${count} lines; trim TRACK and NEXT, and close landed tickets (limen board lists them).`;
}

function jobTicket(cwd: string): string {
	const id = transport("LIMEN_JOB_ID")?.trim();
	if (!id) {
		return "";
	}
	const task = readOptional(join(cwd, ".limen/jobs", id, "task.md"));
	if (task === undefined) {
		return "";
	}
	return ticketPointers(task)[0]?.path ?? "";
}

/**
 * The reminders a tool result asks for. A write or an edit names one file, which `toolPath` reads: under spec/ it asks
 * for the specs register, as code for the styleguide, and in spec/features/planned/ for the vision too. A Bash command
 * asks for the vision when it creates a planned ticket (H-12).
 */
function guidanceAsks(event: PiToolResultEvent): readonly Ask[] {
	const name = event.toolName;
	if (name === "write" || name === "edit") {
		const path = toolPath(event);
		const asks: Ask[] = [
			{ kind: "specs", paths: isSpecPath(path) ? [path] : [] },
			{ kind: "style", paths: !isSpecPath(path) && isCodePath(path) ? [path] : [] },
		];
		return [...asks.filter((ask) => ask.paths.length), ...(isPlannedPath(path) ? [VISION_ASK] : [])];
	}
	if ((name === "bash" || name === "powershell") && createsPlannedTicket(stringField(event.input, "command"))) {
		return [VISION_ASK];
	}
	return [];
}

/** The cue's line on the file the last write or edit touched under spec/ or in code; undefined for any other call. */
function touchLine(event: PiToolResultEvent, asks: readonly Ask[]): string | undefined {
	const paths = asks.flatMap((ask) => ask.paths);
	return paths.length ? `Last turn ${event.toolName === "edit" ? "edited" : "wrote"} ${paths.join(", ")}.` : undefined;
}

function toolPath(event: PiToolResultEvent): string {
	return stringField(event.input, "path") || stringField(event.input, "file_path");
}

function stringField(input: Readonly<Record<string, unknown>>, key: string): string {
	const value = input[key];
	return typeof value === "string" ? value : "";
}

function posixPath(path: string): string {
	return path.replaceAll("\\", "/");
}

function isSpecPath(path: string): boolean {
	return /(?:^|\/)spec\//.test(posixPath(path));
}

function isPlannedPath(path: string): boolean {
	return /(?:^|\/)spec\/features\/planned\//.test(posixPath(path));
}

function isCodePath(path: string): boolean {
	if (!path || /^[a-z][\w+.-]*:\/\//i.test(path)) {
		return false;
	}
	return !/\.md$/i.test(posixPath(path));
}

/**
 * `limen ticket new` writes spec/features/planned/FNNN-…/ticket.md unless the ticket starts active
 * (src/project/ticket-folders.ts); a command that makes, copies or moves a file names that folder itself. A command
 * that runs another `limen` command writes no ticket, whatever its arguments name (a spawn's note, H-12). `limen`
 * runs only in command position, at the start or after `;`, `&`, `|` or `(`, by its name or a path ending in it, so a
 * folder named limen in an argument is no limen command.
 */
function createsPlannedTicket(command: string): boolean {
	if (/(?:^|[;&|(])\s*(?:\S*\/)?limen\s+[a-z]/.test(command)) {
		return /\blimen\s+ticket\s+new\b/.test(command) && !/--lane(?:\s+|=)["']?active\b/.test(command);
	}
	return /\b(?:mkdir|cp|mv|touch|install)\b/.test(command) && /spec\/features\/planned\//.test(command);
}

/**
 * Whether this session's context message holds the specs register (A-038): a coordinator's, or a job's by the role its
 * record holds, the one its spawn built the message for and a continuation builds it again from (src/job/spawning.ts,
 * src/job/continuation.ts, which reads a record with none as a worker's).
 */
function sessionHoldsSpecs(root: string): boolean {
	if (transport("LIMEN_JOB") !== "1") {
		return holdsSpecs({ session: "coordinator" });
	}
	return holdsSpecs({ session: "job", role: sessionRecord(root)?.role || "worker" });
}

/**
 * The reminder of `ask`: the sections of its guidance that apply and that no reminder appended in this context yet,
 * which it marks as appended; "" when none is left, or when the project holds no such guidance file.
 */
function reminder(shown: Set<string>, ask: Ask, root: string, cwd: string): string {
	const guide = guidance(ask.kind, root);
	const files = ask.paths.map((path) => projectPath(cwd, path)).filter(Boolean);
	if (!guide || (ask.kind === "style" && !files.length)) {
		return "";
	}
	const sections = applicableSections(ask.kind, markdownSections(guide.lines), files);
	const fresh = sections.filter((section) => !shown.has(sectionKey(ask.kind, section)));
	for (const section of fresh) {
		shown.add(sectionKey(ask.kind, section));
	}
	return fresh.length ? reminderText(ask.kind, guide, fresh) : "";
}

/**
 * The specs files of the modules on in the project at `root` that no reminder appended in this context yet, each after
 * its header line, which it marks as appended: the files the context message holds right after the specs register
 * (src/runtime/context-message.ts), so the reminder after an edit under spec/ is whole too (R-044 Decision 19 F2).
 */
function moduleSpecsReminders(shown: Set<string>, root: string): string[] {
	return moduleFiles(basename(SPECS_REGISTER), enabledModules(root)).flatMap(({ module, path }) => {
		const guide = guideOf(packageName(path), packageText(path));
		const key = `specs:${path}`;
		if (!guide || shown.has(key)) {
			return [];
		}
		shown.add(key);
		const lines = trimmedLines(guide.lines.join("\n"));
		const header = `[limen] ${moduleTitle(module)} (${guide.shown} lines 1-${lines.length}): check this edit against these rules.`;
		return [`${header}\n${boundLines(lines, guide.shown)}`];
	});
}

/** A section by its guidance, its first line and its title: what one reminder appended. */
function sectionKey(kind: ReminderKind, section: Section): string {
	return `${kind}:${section.start}:${section.title}`;
}

/** The path from the project root, or "" for a file outside it. */
function projectPath(cwd: string, path: string): string {
	const file = posixPath(relative(cwd, resolve(cwd, path)));
	return file.startsWith("../") || isAbsolute(file) ? "" : file;
}

/**
 * The guidance file of `kind`, read when the tool result is built through the readers each role's context message reads
 * it with (T-25 (1)): the package's specs register (A-039), or the project root's styleguide or vision, each named as
 * the message names it; undefined for a project file that is missing or holds no text, which the message leaves out.
 */
function guidance(kind: ReminderKind, root: string): Guide | undefined {
	if (kind === "specs") {
		return guideOf(packageName(SPECS_REGISTER), packageText(SPECS_REGISTER));
	}
	const path = kind === "style" ? STYLE_FILE : VISION_FILE;
	const text = projectText(root, path);
	return text === undefined ? undefined : guideOf(path, text);
}

function guideOf(shown: string, text: string): Guide | undefined {
	return trimmedLines(text).length ? { shown, lines: text.replaceAll("\r\n", "\n").trimEnd().split("\n") } : undefined;
}

function applicableSections(
	kind: ReminderKind,
	sections: readonly Section[],
	files: readonly string[],
): readonly Section[] {
	if (kind === "style") {
		const each = files.map((file) => styleSections(sections, file));
		return sections.filter((section) => each.some((applies) => applies.includes(section)));
	}
	if (kind === "specs") {
		const index = sections.findIndex((section) => section.level === 2 && section.title === "Specs");
		const head = sections[index];
		const next = sections.slice(index + 1).find((section) => section.level <= 2);
		return head ? [{ ...head, end: next ? next.start - 1 : (sections.at(-1)?.end ?? head.end) }] : [];
	}
	return [{ title: "Vision", level: 1, start: 1, end: sections.at(-1)?.end ?? 1 }];
}

/** A heading that names a path or a language scopes its section and the sections below it; others apply to every file. */
function styleSections(sections: readonly Section[], file: string): readonly Section[] {
	const scopes: (boolean | undefined)[] = [];
	return sections.filter((section) => {
		scopes.length = section.level;
		const applies = sectionScope(section.title, file) ?? scopes.findLast((scope) => scope !== undefined);
		scopes[section.level] = applies;
		return applies !== false;
	});
}

/** `crates/alice` matches files below it, `convex/http.ts` itself, and Rust matches `.rs` files. */
function sectionScope(title: string, file: string): boolean | undefined {
	const paths = [...title.matchAll(/`([^`]+)`/g)].map((match) => match[1] ?? "").filter((token) => /[/.]/.test(token));
	if (paths.length) {
		return paths.some((path) => file === path.replace(/\/$/, "") || file.startsWith(path.replace(/\/?$/, "/")));
	}
	const extension = /\.([^./]+)$/.exec(file)?.[1]?.toLowerCase() ?? "";
	const languages = (title.toLowerCase().match(/[a-z]+/g) ?? []).filter((word) => Object.hasOwn(LANGUAGES, word));
	return languages.length ? languages.some((word) => LANGUAGES[word]?.includes(extension)) : undefined;
}

/**
 * One header line that names the file, the lines and what to check (A-041), then the text of those lines, within the
 * bound of each part of the context message and with its notice when it cuts them (T-10).
 */
function reminderText(kind: ReminderKind, guide: Guide, sections: readonly Section[]): string {
	const rules = kind === "vision" ? "it" : "these rules";
	const header = `[limen] ${LABELS[kind]} (${guide.shown} lines ${lineList(sections)}): check this edit against ${rules}.`;
	const lines = lineRanges(sections).flatMap(([start, end]) => guide.lines.slice(start - 1, end));
	return `${header}\n${boundLines(trimmedLines(lines.join("\n")), guide.shown)}`;
}

/** The lines of `sections` as ranges; sections that touch share one range. */
function lineRanges(sections: readonly Section[]): readonly (readonly [number, number])[] {
	const ranges: [number, number][] = [];
	for (const { start, end } of sections) {
		const last = ranges.at(-1);
		if (last && last[1] + 1 >= start) {
			last[1] = Math.max(last[1], end);
		} else {
			ranges.push([start, end]);
		}
	}
	return ranges;
}

/** `1-59, 85-125`. */
function lineList(sections: readonly Section[]): string {
	return lineRanges(sections)
		.map(([start, end]) => (start === end ? `${start}` : `${start}-${end}`))
		.join(", ");
}

/** Each heading starts a section that runs to the next heading; text above the first heading is a section too. */
function markdownSections(lines: readonly string[]): readonly Section[] {
	const starts: Omit<Section, "end">[] = [];
	let fenced = false;
	for (const [index, line] of lines.entries()) {
		if (/^\s*(?:```|~~~)/.test(line)) {
			fenced = !fenced;
		}
		const match = fenced ? null : /^(#{1,6})\s+(\S.*?)(?:\s+#+)?\s*$/.exec(line);
		if (match) {
			starts.push({ title: match[2] ?? "", level: match[1]?.length ?? 1, start: index + 1 });
		}
	}
	if (starts[0]?.start !== 1) {
		starts.unshift({ title: "", level: 1, start: 1 });
	}
	return starts.map((section, index) => ({ ...section, end: (starts[index + 1]?.start ?? lines.length + 1) - 1 }));
}

function appendText(content: readonly PiPart[], text: string): PiPart[] {
	const parts: PiPart[] = content.map((part) => ({ ...part }));
	const last = parts.at(-1);
	if (last?.type === "text") {
		parts[parts.length - 1] = { type: "text", text: `${last.text}\n\n${text}` };
		return parts;
	}
	parts.push({ type: "text", text });
	return parts;
}
