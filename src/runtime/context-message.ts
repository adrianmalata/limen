// Builds a role's Limen context message in one place, because under the bridge Pi's system prompt never reaches the
// model, so Limen's standing text rides this message instead (A-086, D-114). Every Limen text comes from the package,
// never from a project copy (A-039, A-042), and a missing one is a broken install, so its read throws (T-01). It reads
// files only and starts no process, so the same files give the same bytes on any host (T-36). A module's text for a
// part is the package file `templates/modules/<module>/<the part's file name>`, a part of its own right after that
// part, only while the module is on in the project (G1.10, A-040): the file's existence is its declaration (R-044).
// The message is frozen for its session, so the same parts, built again, name the files that changed since (A-037).
import { existsSync, readFileSync } from "node:fs";
import { basename, join } from "node:path";
import { packageRoot, readOptional } from "../project/inherit.ts";
import { MODULES, type Module, modulesOn, moduleTitle } from "../project/modules.ts";

/** The file of a job's folder that holds the context message its session opens with (A-079). */
export const CONTEXT_FILE = "context.md";
/** The line bound of each part, with a notice of how much was left out and where the whole is (T-10). */
export const MAX_CONTEXT_LINES = 1000;
/** The project's styleguide, which every role gets. */
export const STYLE_FILE = ".agents/limen/styleguide.md";
/** The project's vision, which the coordinator gets whole and a job as `VISION_LINE`, a line that points at it. */
export const VISION_FILE = "spec/vision.md";
/**
 * A job's part in the vision's place while the project holds a vision. The line does not change within a session, so
 * it rides the frozen message, the session's stable prefix, instead of every turn's cue (D-134 (3), z. 3).
 */
const VISION_LINE = "Vision (read-only): `spec/vision.md` — durable intent. Load it before choosing or starting work.";
/** The project's own context, which a job gets only while its bridge runs isolated and so forwards none (E-15). */
export const AGENTS_FILE = "AGENTS.md";
/** The specs register: how tickets are written, for the roles that write them; a reminder appends its section. */
export const SPECS_REGISTER = "templates/registers/specs.md";
const CAPABILITY_FILE = "templates/capability.md";
const MANUAL_FILE = "templates/manual.md";
/** The owner register: how the coordinator speaks to the owner, the one role that does (A-038). */
const OWNER_REGISTER = "templates/registers/owner.md";
/** The agent register: how every role writes for the agent that reads its work next (A-038). */
const AGENT_REGISTER = "templates/registers/agent.md";
/** The job roles that write tickets beside the coordinator, so they get the specs register too (A-038). */
const SPECS_ROLES: readonly string[] = ["keeper"];
/**
 * The marker's role name of the coordinator's session: a job of the role `coordinator` is a group's team
 * (`templates/coordinator.md`), so the owner's coordinator is named apart from it. R-046 sets the marker's words.
 */
const OWNER_FACING = "owner-facing coordinator";

/**
 * Whose session a message opens: the owner-facing coordinator's, or a job's of `role`, whose preamble is the file
 * `preamble` of the role's template, and whose bridge runs isolated when `bridgeIsolated`, as `jobAudience`
 * (src/runtime/roles.ts) builds it for spawn, continue and the communication hook.
 */
export type ContextAudience =
	| { readonly session: "coordinator" }
	| { readonly session: "job"; readonly role: string; readonly preamble: string; readonly bridgeIsolated: boolean };
/** Of a session's audience, what decides whether its message holds the specs register: the session, a job's role. */
export type SpecsAudience = { readonly session: "coordinator" } | { readonly session: "job"; readonly role: string };

/**
 * Whether the context message of `audience` holds the specs register: the coordinator's, and that of a job role that
 * writes tickets (A-038). The communication hook appends the register's section after an edit under spec/ only there.
 */
export function holdsSpecs(audience: SpecsAudience): boolean {
	return audience.session === "coordinator" || SPECS_ROLES.includes(audience.role);
}

/** The tag that closes every message, after the last part. */
const CLOSING_TAG = "</limen-context>";

/**
 * One part a message can hold: the line that heads it, which this module writes (`## <label> (<path>)`, or a job's
 * vision line, which is a part and its own heading), the path that names its file as the heading does, and its text
 * now, the heading included; "" when the role gets no such part now.
 */
type Part = { readonly heading: string; readonly path: string; readonly text: string };

/**
 * The context message of `audience` in the project `root`: a neutral marker that names the role (D-114 (3)), so it
 * never starts with `/` (E-14), then each part that has text, apart by a blank line, then the closing tag.
 */
export function contextMessage(root: string, audience: ContextAudience): string {
	const texts = messageParts(root, audience).flatMap(({ text }) => (text ? [text] : []));
	const role = audience.session === "coordinator" ? OWNER_FACING : audience.role;
	return [`<limen-context role="${role}">`, ...texts, CLOSING_TAG].join("\n\n");
}

/**
 * The paths of the parts of `audience`'s message in the project `root` that changed since `frozen`, a message built for
 * the same audience, was built, in the message's order (A-037, A-079): a part whose text now is not the text `frozen`
 * holds under its heading, a part with text now whose heading `frozen` lacks (a new file, a module switched on), and a
 * part `frozen` holds that has no text now (a removed file, a module switched off). It finds the parts of `frozen` by
 * the headings this module writes, and parses no other text, so an edit outside every part, such as the capability
 * file's `## Cue`, names nothing. It reads files only (T-36).
 */
export function changedSince(frozen: string, root: string, audience: ContextAudience): string[] {
	const parts = messageParts(root, audience);
	const held = heldTexts(frozen, parts);
	return parts.flatMap((part, index) => ((held[index] ?? "") === part.text ? [] : [part.path]));
}

/**
 * Every part a message of `audience` can hold, in its order, each with its text in the project `root` now. The parts
 * that never change come first and the project's files last (z. 3): the frame, the manual or the role's preamble, the
 * registers of the role's audience, then the vision (the coordinator's whole, a job's as one line that points at it),
 * the styleguide and, for a job whose bridge forwards none, the project's AGENTS.md. Right after each part come the
 * parts of every module that has a file for it, in the order of the modules (`moduleFiles`), with text only while the
 * module is on and the part they follow has text.
 */
function messageParts(root: string, audience: ContextAudience): Part[] {
	const coordinator = audience.session === "coordinator";
	const agents = !coordinator && audience.bridgeIsolated;
	// Each part with the file it comes from, whose name names the module files that follow it.
	const parts: ReadonlyArray<readonly [Part, string]> = [
		[boundPart(capabilitySection("Frame"), packageName(CAPABILITY_FILE), "Capability"), CAPABILITY_FILE],
		coordinator
			? [packagePart(MANUAL_FILE, "Coordinator manual"), MANUAL_FILE]
			: [rolePreamble(audience.preamble), audience.preamble],
		[packagePart(AGENT_REGISTER, "Agent register"), AGENT_REGISTER],
		...(holdsSpecs(audience) ? [[packagePart(SPECS_REGISTER, "Specs register"), SPECS_REGISTER] as const] : []),
		...(coordinator ? [[packagePart(OWNER_REGISTER, "Owner register"), OWNER_REGISTER] as const] : []),
		[coordinator ? projectPart(root, VISION_FILE, "Vision") : visionPart(root), VISION_FILE],
		[projectPart(root, STYLE_FILE, "Styleguide"), STYLE_FILE],
		...(agents ? [[projectPart(root, AGENTS_FILE, "Project context"), AGENTS_FILE] as const] : []),
	];
	const on = enabledModules(root);
	return parts.flatMap(([part, file]) => [part, ...moduleParts(basename(file), part, on)]);
}

/** The parts of the modules that have a file named `file`, each with text only while it is on and `after` has text. */
function moduleParts(file: string, after: Part, on: readonly Module[]): Part[] {
	return moduleFiles(file, MODULES).map(({ module, path }) => {
		const name = packageName(path);
		const title = moduleTitle(module);
		const text = after.text && on.includes(module) ? boundText(packageText(path), name, title) : "";
		return { heading: headingOf(title, name), path: name, text };
	});
}

/**
 * The text `frozen` holds for each of `parts`, by index; undefined for a part whose heading it lacks. The parts of a
 * message keep the order of `parts`, so each heading is looked for after the one before it, at the start of a part; a
 * part runs to the next part found or to the closing tag.
 */
function heldTexts(frozen: string, parts: readonly Part[]): (string | undefined)[] {
	const starts: number[] = [];
	let from = 0;
	for (const { heading } of parts) {
		const at = frozen.indexOf(`\n\n${heading}\n`, from);
		starts.push(at < 0 ? -1 : at + 2);
		from = at < 0 ? from : at + 2;
	}
	const closing = frozen.lastIndexOf(`\n\n${CLOSING_TAG}`);
	const end = closing < 0 ? frozen.length : closing;
	return starts.map((start, index) => {
		if (start < 0) {
			return undefined;
		}
		const next = starts.slice(index + 1).find((later) => later > start);
		return frozen.slice(start, next === undefined ? end : next - 2);
	});
}

/** The modules on in the project at `root`, in the order of the modules (src/project/modules.ts). */
export function enabledModules(root: string): readonly Module[] {
	const on = modulesOn(root);
	return MODULES.filter((module) => on.has(module));
}

/**
 * The package files of `modules` that follow a part from a file named `file`: for each module, in its order, the file
 * `templates/modules/<module>/<file>` when it exists, which the message heads "<Title> module" (A-040, R-044). A module
 * with no such file adds nothing to that part. The communication hook's specs reminder appends the same files after
 * the register's section (R-044 Decision 19 F2).
 */
export function moduleFiles(
	file: string,
	modules: readonly Module[],
): ReadonlyArray<{ readonly module: Module; readonly path: string }> {
	return modules.flatMap((module) => {
		const path = `templates/modules/${module}/${file}`;
		return existsSync(join(packageRoot(), path)) ? [{ module, path }] : [];
	});
}

/** The text of the package file at `path`; a missing one is a broken install, so the read throws (T-01). */
export function packageText(path: string): string {
	return readFileSync(join(packageRoot(), path), "utf8");
}

/** How a message names the package file at `path`: by its path in the package, so no absolute path enters it. */
export function packageName(path: string): string {
	return `limen/${path}`;
}

/** The text of the project's file at `path` below `root`; undefined when the project holds none, which adds no part. */
export function projectText(root: string, path: string): string | undefined {
	return readOptional(join(root, path));
}

/**
 * `lines` joined, cut to MAX_CONTEXT_LINES, with a notice of how many there were and that the file `path` holds the
 * rest when the bound cut them (T-10).
 */
export function boundLines(lines: readonly string[], path: string): string {
	const content = lines.slice(0, MAX_CONTEXT_LINES).join("\n");
	return lines.length > MAX_CONTEXT_LINES
		? `${content}\n\n[${path} truncated to ${MAX_CONTEXT_LINES} of ${lines.length} lines; read the file for remaining context.]`
		: content;
}

/** The capability frame's section under `heading`: the frame describes Limen itself, so it is the package's. */
export function capabilitySection(heading: string): string {
	return markdownSection(packageText(CAPABILITY_FILE), heading).split("\n").slice(1).join("\n").trim();
}

/** The section of `text` under the level-two heading `heading`, up to the next one; "" when there is none. */
export function markdownSection(text: string, heading: string): string {
	const lines = text.replaceAll("\r\n", "\n").split("\n");
	const start = lines.findIndex((line) => /^##\s+/.test(line) && line.replace(/^##\s+/, "").trim() === heading);
	if (start < 0) {
		return "";
	}
	let end = lines.length;
	for (let index = start + 1; index < lines.length; index++) {
		if (/^##\s+/.test(lines[index] ?? "")) {
			end = index;
			break;
		}
	}
	return lines.slice(start, end).join("\n").trim();
}

/** The lines of `text` without the blank lines before the first and after the last. */
export function trimmedLines(text: string): readonly string[] {
	const lines = text.replaceAll("\r\n", "\n").split("\n");
	while (lines[0]?.trim() === "") {
		lines.shift();
	}
	while (lines.at(-1)?.trim() === "") {
		lines.pop();
	}
	return lines;
}

/**
 * `text` under the heading `## <label> (<path>)`, cut to the line bound with its notice (`boundLines`); "" when `text`
 * has no line. The board digest of the communication hook has the same shape (A-037).
 */
export function boundText(text: string, path: string, label: string): string {
	const lines = trimmedLines(text);
	if (!lines.length) {
		return "";
	}
	return `${headingOf(label, path)}\n${boundLines(lines, path)}`;
}

/** The package file at `path` as a part headed `label`, named by its path in the package. */
function packagePart(path: string, label: string): Part {
	return boundPart(packageText(path), packageName(path), label);
}

/**
 * The job role's preamble, the package's template, named by its path in the package so no absolute path enters the
 * message. The spawn has just resolved the file, so a read that fails is an error.
 */
function rolePreamble(preamble: string): Part {
	return boundPart(readFileSync(preamble, "utf8"), packageName(`templates/${basename(preamble)}`), "Role");
}

/** A job's vision part, `VISION_LINE`, which is its own heading, with text while the project at `root` holds a vision. */
function visionPart(root: string): Part {
	const text = projectText(root, VISION_FILE) === undefined ? "" : VISION_LINE;
	return { heading: VISION_LINE, path: VISION_FILE, text };
}

/** The project's file at `path` below `root` as a part headed `label`; with no text while the project holds none. */
function projectPart(root: string, path: string, label: string): Part {
	return boundPart(projectText(root, path) ?? "", path, label);
}

/** `text` as the part headed `label` that names `path` (`boundText`). */
function boundPart(text: string, path: string, label: string): Part {
	return { heading: headingOf(label, path), path, text: boundText(text, path, label) };
}

/** The heading of a part: its label, then the path that names its file. */
function headingOf(label: string, path: string): string {
	return `## ${label} (${path})`;
}
