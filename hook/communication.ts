import { readFileSync } from "node:fs";
import { isAbsolute, join, relative, resolve } from "node:path";
import { transport } from "../src/config.ts";
import { readRecordSync } from "../src/job/record.ts";
import { readOptional } from "../src/project/inherit.ts";
import { ticketPointers } from "../src/project/planning.ts";
import {
	boundLines,
	CONTEXT_FILE,
	CUE_FILE,
	capabilitySection,
	contextMessage,
	holdsSpecs,
	MAX_CONTEXT_LINES,
	markdownSection,
	packageName,
	packageText,
	projectText,
	SPECS_REGISTER,
	STYLE_FILE,
	trimmedLines,
	VISION_FILE,
} from "../src/runtime/context-message.ts";
import {
	type PiApi,
	type PiContext,
	type PiContextEntry,
	type PiCustomMessage,
	type PiPart,
	type PiToolResultEvent,
	piContext,
	piContextEntries,
	piEvent,
	recorded,
} from "../src/runtime/pi-api.ts";
import { assistantStopReason } from "../src/runtime/stream.ts";

/** The custom type of the context message (D-114 (1), T-16): a `limen-*` custom message, never a user message. */
const CONTEXT_TYPE = "limen-context";
/** The custom type of the turn cue, which R-041 changes. */
const CUE_TYPE = "limen-project-context";
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
 * model's context, always the bytes the session holds (A-037). The per-turn note is a short cue. A tool result, the one
 * message of a role of its own (E-1), carries the text of the guidance that applies to what the call wrote, each
 * section once until a compaction or a new session start (A-041): the styleguide after a code edit, the specs register
 * after an edit under spec/, and the vision once a planned ticket is written (H-12).
 */
export default function limenCommunication(pi: Pick<PiApi, "on" | "sendMessage">): void {
	let lastTouch: string | undefined;
	let lastFailure: string | undefined;
	pi.on(
		"before_agent_start",
		recorded((raw: unknown, rawContext: unknown) => {
			const event = piEvent("before_agent_start", raw);
			const context = piContext("before_agent_start", rawContext, ["cwd"]);
			const root = transport("LIMEN_CONTEXT_ROOT") ?? context.cwd;
			const job = transport("LIMEN_JOB") === "1";
			const touched = lastTouch;
			const failed = lastFailure;
			lastTouch = undefined;
			lastFailure = undefined;
			const cue = turnCue(root, job, isWakePrompt(event.prompt), touched, failed);
			return { message: { customType: CUE_TYPE, content: cue, display: false } };
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
			const root = transport("LIMEN_CONTEXT_ROOT") ?? context.cwd;
			const reminders = asks
				.filter((ask) => ask.kind !== "specs" || sessionHoldsSpecs(root))
				.map((ask) => reminder(shown, ask, root, context.cwd))
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

function isWakePrompt(prompt: string | undefined): boolean {
	return typeof prompt === "string" && prompt.startsWith("Limen job ");
}

/** The context message as the hook sends it: hidden from the owner's chat, which the model still gets (E-11). */
function contextOf(content: string): PiCustomMessage {
	return { customType: CONTEXT_TYPE, content, display: false };
}

/** The content of the context message the session's compaction-aware context holds; undefined when it holds none. */
function heldContext(entries: readonly PiContextEntry[]): string | undefined {
	const entry = entries.find((one) => one.type === "custom_message" && one.customType === CONTEXT_TYPE);
	if (entry === undefined) {
		return undefined;
	}
	const content = entry.content ?? "";
	return typeof content === "string"
		? content
		: content.flatMap((part) => (part.type === "text" ? [part.text ?? ""] : [])).join("\n");
}

/**
 * The message a session without one starts with: the coordinator's, built from the package and the project's files,
 * or a job's, which its publication saved in the job's folder (A-079); the wrapper starts no engine without that file.
 */
function startingContext(context: Pick<PiContext, "cwd">): string {
	const root = transport("LIMEN_CONTEXT_ROOT") ?? context.cwd;
	if (transport("LIMEN_JOB") !== "1") {
		return contextMessage(root, { session: "coordinator" });
	}
	return readFileSync(join(root, ".limen", "jobs", transport("LIMEN_JOB_ID") ?? "", CONTEXT_FILE), "utf8");
}

function turnCue(
	cwd: string,
	job: boolean,
	wake: boolean,
	lastTouch: string | undefined,
	failed: string | undefined,
): string {
	const lines = [capabilitySection("Cue"), registerCue("Shared"), registerCue(job ? "Agent" : "Human")].filter(Boolean);
	if (failed) {
		lines.push(registerCue("Failure").replaceAll("{{failure}}", failed));
	}
	if (wake) {
		lines.push(registerCue("Wake"));
	}
	if (job) {
		const ticket = jobTicket(cwd);
		if (ticket) {
			lines.push(`Ticket: ${ticket}`);
		}
		if (readOptional(join(cwd, VISION_FILE)) !== undefined) {
			lines.push("Vision (read-only): `spec/vision.md` — durable intent. Load it before choosing or starting work.");
		}
		if (readOptional(join(cwd, "spec/build.md")) !== undefined) {
			lines.push("Board (read-only): `spec/build.md` — consult before reporting work; do not edit.");
		}
	}
	if (lastTouch) {
		lines.push(lastTouch);
	}
	if (!job) {
		const board = boardAdvisory(cwd);
		if (board) {
			lines.push(board);
		}
	}
	return ["<limen-project-context>", ...lines, "</limen-project-context>"].join("\n\n");
}

/** A cue section of the package's cue file, which no project file replaces (A-039); a section it lacks adds no line. */
function registerCue(heading: string): string {
	const section = markdownSection(
		trimmedLines(packageText(CUE_FILE)).slice(0, MAX_CONTEXT_LINES).join("\n"),
		`Cue: ${heading}`,
	);
	return section.split("\n").slice(1).join("\n").trim();
}

function boardAdvisory(cwd: string): string {
	const board = readOptional(join(cwd, "spec/build.md"));
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
	const record = readRecordSync(join(root, ".limen", "jobs", transport("LIMEN_JOB_ID") ?? ""));
	return holdsSpecs({ session: "job", role: record?.role || "worker" });
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
