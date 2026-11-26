import { existsSync, readFileSync } from "node:fs";
import { isAbsolute, join, relative, resolve } from "node:path";
import { transport } from "../src/config.ts";
import { noteStart, recordNote } from "../src/job/task-note.ts";
import { formatDrift, inheritFile, listDrift, packageRoot, readOptional } from "../src/project/inherit.ts";
import { ticketPointers } from "../src/project/planning.ts";
import {
	CONTEXT_FILE,
	capabilitySection,
	contextMessage,
	MAX_CONTEXT_LINES,
	markdownSection,
	PACKAGED_REGISTER,
	REGISTER_FILE,
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
type Ask = { readonly kind: ReminderKind; readonly paths: readonly string[] };
type Section = { readonly title: string; readonly level: number; readonly start: number; readonly end: number };
type LineRange = readonly [number, number];
/** What the context holds: guidance lines the agent read, and sections a reminder already named. Compaction drops both. */
type Recall = { readonly read: Map<ReminderKind, LineRange[]>; readonly named: Set<string> };

const REMINDER_KINDS = ["style", "vision", "specs"] as const;
// Each reminder asks for one project file; `pattern` also finds that file, or the packaged register, in a read.
const GUIDANCE: Readonly<Record<ReminderKind, { readonly file: string; readonly pattern: RegExp }>> = {
	style: { file: STYLE_FILE, pattern: /\.agents\/limen\/styleguide\.md\b/ },
	vision: { file: VISION_FILE, pattern: /\bspec\/vision\.md\b/ },
	specs: { file: REGISTER_FILE, pattern: /(?:\.agents\/limen|\btemplates)\/communication\.md\b/ },
};

/**
 * Limen's standing text is the session's context message (A-086), which Pi's system prompt cannot carry under the
 * bridge (E-1): the hook sends it once, at the session's start, and again only after a compaction removed it from the
 * model's context, always the bytes the session holds (A-037). The per-turn note is a short cue. After an edit, a spawn
 * or a merge, the tool result asks the agent to read the guidance lines that apply, once per context, until it has
 * read them.
 */
export default function limenCommunication(pi: Pick<PiApi, "on" | "sendMessage">): void {
	let lastTouch: string | undefined;
	let lastFailure: string | undefined;
	// The job folder once the first prompt showed the task note, and the note text this hook saw last.
	let noteDir: string | undefined;
	let noteSeen: string | undefined;
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
			const firstNote = job && !noteDir ? jobFolder(root) : undefined;
			if (firstNote) {
				noteDir = firstNote;
				noteSeen = readOptional(join(firstNote, "note.md"));
			}
			const content = firstNote ? `${cue}\n\n${noteStart(firstNote)}` : cue;
			return { message: { customType: CUE_TYPE, content, display: false } };
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
	const recall: Recall = { read: new Map(), named: new Set() };
	// A session's start and a compaction give a new context, so the reminders start over with it.
	deliverContext(pi, () => {
		recall.read.clear();
		recall.named.clear();
	});
	pi.on(
		"tool_result",
		recorded((raw: unknown, rawContext: unknown) => {
			const event = piEvent("tool_result", raw);
			const context = piContext("tool_result", rawContext, ["cwd"]);
			if (noteDir) {
				noteSeen = recordNote(noteDir, noteSeen);
			}
			if (event.isError) {
				return;
			}
			noteRead(recall, event);
			const asks = guidanceAsks(event, transport("LIMEN_JOB") === "1");
			if (!asks.length) {
				return;
			}
			lastTouch = touchLine(event, asks);
			const root = transport("LIMEN_CONTEXT_ROOT") ?? context.cwd;
			const reminders = asks.map((ask) => recallReminder(recall, ask, root, context.cwd)).filter(Boolean);
			if (!reminders.length) {
				return;
			}
			return { content: appendText(event.content, reminders.join("\n\n")) };
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

function jobFolder(root: string): string | undefined {
	const dir = join(root, ".limen", "jobs", transport("LIMEN_JOB_ID") ?? "");
	return transport("LIMEN_JOB_ID") && existsSync(dir) ? dir : undefined;
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
	const lines = [
		capabilitySection("Cue"),
		registerCue(cwd, "Shared"),
		registerCue(cwd, job ? "Agent" : "Human"),
	].filter(Boolean);
	if (failed) {
		lines.push(registerCue(cwd, "Failure").replaceAll("{{failure}}", failed));
	}
	if (wake) {
		lines.push(registerCue(cwd, "Wake"));
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
		const drift = formatDrift(listDrift(cwd));
		if (drift) {
			lines.push(drift);
		}
		const board = boardAdvisory(cwd);
		if (board) {
			lines.push(board);
		}
	}
	return ["<limen-project-context>", ...lines, "</limen-project-context>"].join("\n\n");
}

/** Cue sections belong to the selected register; absent sections have no package fallback. */
function registerCue(cwd: string, heading: string): string {
	const inherited = inheritFile(cwd, REGISTER_FILE, PACKAGED_REGISTER);
	if (!inherited) {
		return "";
	}
	const section = markdownSection(
		trimmedLines(inherited.text).slice(0, MAX_CONTEXT_LINES).join("\n"),
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

/** A write or an edit names one file, which `toolPath` reads. */
function guidanceAsks(event: PiToolResultEvent, job: boolean): readonly Ask[] {
	const name = event.toolName;
	if (name === "write" || name === "edit") {
		const paths = [toolPath(event)];
		const asks: Ask[] = [
			{ kind: "specs", paths: paths.filter(isSpecPath) },
			{ kind: "style", paths: paths.filter((path) => !isSpecPath(path) && isCodePath(path)) },
		];
		return asks.filter((ask) => ask.paths.length);
	}
	if ((name === "bash" || name === "powershell") && isVisionCommand(stringField(event.input, "command"), job)) {
		return [{ kind: "vision", paths: [] }];
	}
	return [];
}

function touchLine(event: PiToolResultEvent, asks: readonly Ask[]): string {
	const paths = asks.flatMap((ask) => ask.paths);
	if (!paths.length) {
		return "Last turn started or merged work.";
	}
	return `Last turn ${event.toolName === "edit" ? "edited" : "wrote"} ${paths.join(", ")}.`;
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

function isCodePath(path: string): boolean {
	if (!path || /^[a-z][\w+.-]*:\/\//i.test(path)) {
		return false;
	}
	return !/\.md$/i.test(posixPath(path));
}

/** A worker merges main into its own branch to stay current; that starts no new work. */
function isVisionCommand(command: string, job: boolean): boolean {
	if (/\blimen\s+spawn\b/.test(command)) {
		return true;
	}
	if (/\bgit\s+merge\b/.test(command)) {
		return !job;
	}
	return /\b(?:mkdir|cp|mv|touch|install)\b/.test(command) && /spec\/features\/planned\//.test(command);
}

/** A read tool covers the lines it showed; `cat` covers the whole file, while `head` or `sed` may show only a slice. */
function noteRead(recall: Recall, event: PiToolResultEvent): void {
	const name = event.toolName;
	if (name === "read") {
		const [file = ""] = /^.*\.md$/i.exec(posixPath(toolPath(event))) ?? [];
		const kind = REMINDER_KINDS.find((candidate) => GUIDANCE[candidate].pattern.test(file));
		if (kind) {
			recall.read.set(kind, [...(recall.read.get(kind) ?? []), ...readRanges(event)]);
		}
		return;
	}
	const command = posixPath(stringField(event.input, "command"));
	if ((name !== "bash" && name !== "powershell") || !/\b(?:cat|bat|Get-Content)\b/.test(command)) {
		return;
	}
	for (const kind of REMINDER_KINDS) {
		if (GUIDANCE[kind].pattern.test(command)) {
			recall.read.set(kind, [...(recall.read.get(kind) ?? []), [1, Number.POSITIVE_INFINITY]]);
		}
	}
}

/**
 * A truncated read says `[Showing lines 1-300 of 429`. Otherwise Pi takes offset and limit; a read without either
 * shows the whole file.
 */
function readRanges(event: PiToolResultEvent): LineRange[] {
	const text = event.content.map((part) => (part.type === "text" ? part.text : "")).join("\n");
	const shown = /\[Showing lines (\d+)-(\d+) of \d+/.exec(text);
	if (shown) {
		return [[Number(shown[1]), Number(shown[2])]];
	}
	const offset = event.input.offset;
	const limit = event.input.limit;
	if (typeof offset === "number" || typeof limit === "number") {
		const start = typeof offset === "number" ? Math.max(1, offset) : 1;
		return [[start, typeof limit === "number" ? start + limit - 1 : Number.POSITIVE_INFINITY]];
	}
	return [[1, Number.POSITIVE_INFINITY]];
}

/** Names the guidance lines that apply and are still unread, once until compaction; quiet when nothing new applies. */
function recallReminder(recall: Recall, ask: Ask, root: string, cwd: string): string {
	const guide = guidance(ask.kind, root, cwd);
	const inside = ask.paths.map((path) => projectPath(cwd, path));
	const files = ask.kind === "style" ? inside.filter(Boolean) : ask.paths.map((path, index) => inside[index] || path);
	if (!guide || (ask.kind !== "vision" && !files.length)) {
		return "";
	}
	const read = recall.read.get(ask.kind) ?? [];
	const unread = applicableSections(ask.kind, guide.sections, files).filter((section) => !isRead(section, read));
	const keys = unread.map((section) => `${ask.kind}:${section.start}:${section.title}`);
	if (keys.every((key) => recall.named.has(key))) {
		return "";
	}
	for (const key of keys) {
		recall.named.add(key);
	}
	return reminderText(ask.kind, guide.shown, unread, files);
}

/** The path from the project root, or "" for a file outside it. */
function projectPath(cwd: string, path: string): string {
	const file = posixPath(relative(cwd, resolve(cwd, path)));
	return file.startsWith("../") || isAbsolute(file) ? "" : file;
}

/** The copy in the agent's worktree wins, shown by its short path; the register falls back to the package. */
function guidance(
	kind: ReminderKind,
	root: string,
	cwd: string,
): { readonly shown: string; readonly sections: readonly Section[] } | undefined {
	const paths = [join(cwd, GUIDANCE[kind].file), join(root, GUIDANCE[kind].file)];
	if (kind === "specs") {
		paths.push(join(packageRoot(), PACKAGED_REGISTER));
	}
	for (const path of paths) {
		const text = readOptional(path);
		if (text !== undefined) {
			return { shown: projectPath(cwd, path) || path, sections: markdownSections(text) };
		}
	}
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

function isRead(section: Section, read: readonly LineRange[]): boolean {
	for (let line = section.start; line <= section.end; line++) {
		if (!read.some(([start, end]) => start <= line && line <= end)) {
			return false;
		}
	}
	return true;
}

function reminderText(
	kind: ReminderKind,
	shown: string,
	sections: readonly Section[],
	files: readonly string[],
): string {
	const ask = `make your next tool call a read of ${shown} lines ${lineList(sections)}`;
	const again = "even if an earlier copy is in your context";
	if (kind === "vision") {
		return `[limen] Vision: ${ask}. Read it ${again}, then check this step against it.`;
	}
	const scoped = sections
		.filter((section) => files.some((file) => sectionScope(section.title, file)))
		.map((section) => section.title);
	const named = scoped.length ? `, including the sections ${scoped.join(", ")}` : "";
	const label = kind === "specs" ? "Specs" : "Styleguide";
	return `[limen] ${label}: ${ask}. They hold the rules for ${files.join(", ")}${named}. Read them ${again}, then check this edit against them.`;
}

/** `1-59, 85-125`: sections that touch share one range. */
function lineList(sections: readonly Section[]): string {
	const ranges: [number, number][] = [];
	for (const { start, end } of sections) {
		const last = ranges.at(-1);
		if (last && last[1] + 1 >= start) {
			last[1] = Math.max(last[1], end);
		} else {
			ranges.push([start, end]);
		}
	}
	return ranges.map(([start, end]) => (start === end ? `${start}` : `${start}-${end}`)).join(", ");
}

/** Each heading starts a section that runs to the next heading; text above the first heading is a section too. */
function markdownSections(text: string): readonly Section[] {
	const lines = text.replaceAll("\r\n", "\n").trimEnd().split("\n");
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
