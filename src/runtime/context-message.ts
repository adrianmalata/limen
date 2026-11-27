// Builds a role's Limen context message in one place, because under the bridge Pi's system prompt never reaches the
// model, so Limen's standing text rides this message instead (A-086, D-114). Every Limen text comes from the package,
// never from a project copy (A-039, A-042), and a missing one is a broken install, so its read throws (T-01). It reads
// files only and starts no process, so the same files give the same bytes on any host (T-36). A module's text for a
// part is the package file `templates/modules/<module>/<the part's file name>`, a part of its own right after that
// part, only while the module is on in the project (G1.10, A-040): the file's existence is its declaration (R-044).
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
 * `preamble` that the spawn's role resolution chose (`resolvePreamble`, src/job/spawning.ts), and whose bridge runs
 * isolated when `bridgeIsolated` (`runsBridgeIsolated`, src/runtime/engine.ts).
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

/**
 * The context message of `audience` in the project `root`: a neutral marker that names the role (D-114 (3)), so it
 * never starts with `/` (E-14), then each part apart by a blank line, then the closing tag. The parts that never change
 * come first and the project's files last (z. 3): the frame, the manual or the role's preamble, the registers of the
 * role's audience, then the vision (the coordinator's whole, a job's as one line that points at it), the styleguide
 * and, for a job whose bridge forwards none, the project's AGENTS.md. Right after each part come the parts of the
 * modules on in the project, in the order of the modules (`moduleFiles`).
 */
export function contextMessage(root: string, audience: ContextAudience): string {
	const coordinator = audience.session === "coordinator";
	const specs = holdsSpecs(audience);
	const agents = !coordinator && audience.bridgeIsolated;
	const modules = enabledModules(root);
	// Each part with the file it comes from, whose name names the module files that follow it.
	const parts: ReadonlyArray<readonly [string, string]> = [
		[boundText(capabilitySection("Frame"), packageName(CAPABILITY_FILE), "Capability"), CAPABILITY_FILE],
		coordinator
			? [packagePart(MANUAL_FILE, "Coordinator manual"), MANUAL_FILE]
			: [rolePreamble(audience.preamble), audience.preamble],
		[packagePart(AGENT_REGISTER, "Agent register"), AGENT_REGISTER],
		[specs ? packagePart(SPECS_REGISTER, "Specs register") : "", SPECS_REGISTER],
		[coordinator ? packagePart(OWNER_REGISTER, "Owner register") : "", OWNER_REGISTER],
		[coordinator ? boundFile(root, VISION_FILE, "Vision") : visionLine(root), VISION_FILE],
		[boundFile(root, STYLE_FILE, "Styleguide"), STYLE_FILE],
		[agents ? boundFile(root, AGENTS_FILE, "Project context") : "", AGENTS_FILE],
	];
	const texts = parts
		.filter(([text]) => text)
		.flatMap(([text, file]) => [
			text,
			...moduleFiles(basename(file), modules).map(({ module, path }) => packagePart(path, moduleTitle(module))),
		]);
	const role = coordinator ? OWNER_FACING : audience.role;
	return [`<limen-context role="${role}">`, ...texts, "</limen-context>"].join("\n\n");
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

/** The package file at `path` as a part headed `label`, named by its path in the package. */
function packagePart(path: string, label: string): string {
	return boundText(packageText(path), packageName(path), label);
}

/**
 * The job role's preamble, the package's template, named by its path in the package so no absolute path enters the
 * message. The spawn has just resolved the file, so a read that fails is an error.
 */
function rolePreamble(preamble: string): string {
	return boundText(readFileSync(preamble, "utf8"), packageName(`templates/${basename(preamble)}`), "Role");
}

/** `VISION_LINE` while the project at `root` holds a vision file; "" when it holds none, which adds no part. */
function visionLine(root: string): string {
	return projectText(root, VISION_FILE) === undefined ? "" : VISION_LINE;
}

function boundFile(root: string, path: string, label: string): string {
	const text = projectText(root, path);
	return text === undefined ? "" : boundText(text, path, label);
}

function boundText(text: string, path: string, label: string): string {
	const lines = trimmedLines(text);
	if (!lines.length) {
		return "";
	}
	return `## ${label} (${path})\n${boundLines(lines, path)}`;
}
