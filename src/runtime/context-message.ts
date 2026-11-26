// Builds a role's Limen context message in one place, because under the bridge Pi's system prompt never reaches the
// model, so Limen's standing text rides this message instead (A-086, D-114). It reads files only and starts no
// process, so the same files give the same bytes on any host (T-36).
import { readFileSync } from "node:fs";
import { basename, join, relative, sep } from "node:path";
import { inheritFile, packageRoot, readOptional } from "../project/inherit.ts";

/** The file of a job's folder that holds the context message its session opens with (A-079). */
export const CONTEXT_FILE = "context.md";
/** The line bound of each part, with a notice of how much was left out and where the whole is (T-10). */
export const MAX_CONTEXT_LINES = 1000;
/** The project's styleguide, which every role gets. */
export const STYLE_FILE = ".agents/limen/styleguide.md";
/** The project's vision, which the coordinator gets whole and a job by a pointer in its cue. */
export const VISION_FILE = "spec/vision.md";
/** The project's register, which replaces the package's (A-039 cuts it, R-040). */
export const REGISTER_FILE = ".agents/limen/communication.md";
/** The package's register. */
export const PACKAGED_REGISTER = "templates/communication.md";
const CAPABILITY_FILE = "templates/capability.md";
const MANUAL_FILE = "templates/agents.md";
/**
 * The marker's role name of the coordinator's session: a job of the role `coordinator` is a group's team
 * (`templates/coordinator.md`), so the owner's coordinator is named apart from it. R-046 sets the marker's words.
 */
const OWNER_FACING = "owner-facing coordinator";

/**
 * Whose session a message opens: the owner-facing coordinator's, or a job's of `role`, whose preamble is the file
 * `preamble` that the spawn's role resolution chose (`resolvePreamble`, src/job/spawning.ts).
 */
export type ContextAudience =
	| { readonly session: "coordinator" }
	| { readonly session: "job"; readonly role: string; readonly preamble: string };

/**
 * The context message of `audience` in the project `root`: a neutral marker that names the role (D-114 (3)), so it
 * never starts with `/` (E-14), then each part apart by a blank line, then the closing tag.
 */
export function contextMessage(root: string, audience: ContextAudience): string {
	const coordinator = audience.session === "coordinator";
	const parts = [
		boundText(capabilitySection("Frame"), `limen/${CAPABILITY_FILE}`, "Capability"),
		coordinator ? shopManual(root) : rolePreamble(root, audience.preamble),
		registerText(root),
		coordinator ? boundFile(root, VISION_FILE, "Vision") : "",
		boundFile(root, STYLE_FILE, "Styleguide"),
	].filter(Boolean);
	const role = coordinator ? OWNER_FACING : audience.role;
	return [`<limen-context role="${role}">`, ...parts, "</limen-context>"].join("\n\n");
}

/** The capability frame describes Limen itself, not project speech, so a project register never replaces it. */
export function capabilitySection(heading: string): string {
	const text = readOptional(join(packageRoot(), CAPABILITY_FILE)) ?? "";
	return markdownSection(text, heading).split("\n").slice(1).join("\n").trim();
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
 * The project's `AGENTS.md` reaches the coordinator's model through the bridge itself (E-1), so the package's manual
 * comes only without one.
 */
function shopManual(root: string): string {
	if (readOptional(join(root, "AGENTS.md")) !== undefined) {
		return "";
	}
	const inherited = inheritFile(root, "AGENTS.md", MANUAL_FILE);
	return inherited ? boundText(inherited.text, inherited.path, "Shop manual") : "";
}

/**
 * The job role's preamble, named by its path in the project, or in the package for the package's template, so no
 * absolute path enters the message. The spawn has just resolved the file, so a read that fails is an error.
 */
function rolePreamble(root: string, preamble: string): string {
	const label = preamble.startsWith(`${root}${sep}`)
		? relative(root, preamble)
		: `limen/templates/${basename(preamble)}`;
	return boundText(readFileSync(preamble, "utf8"), label, "Role");
}

/** The register's text above its first `## Cue:`; the cue sections ride each run's cue (hook/communication.ts). */
function registerText(root: string): string {
	const inherited = inheritFile(root, REGISTER_FILE, PACKAGED_REGISTER);
	if (!inherited) {
		return "";
	}
	const cueStart = inherited.text.search(/^## Cue: /m);
	const text = cueStart < 0 ? inherited.text : inherited.text.slice(0, cueStart);
	return boundText(text, inherited.path, "Communication");
}

function boundFile(root: string, path: string, label: string): string {
	const text = readOptional(join(root, path));
	return text === undefined ? "" : boundText(text, path, label);
}

function boundText(text: string, path: string, label: string): string {
	const lines = trimmedLines(text);
	if (!lines.length) {
		return "";
	}
	const content = lines.slice(0, MAX_CONTEXT_LINES).join("\n");
	const notice =
		lines.length > MAX_CONTEXT_LINES
			? `\n\n[${path} truncated to ${MAX_CONTEXT_LINES} of ${lines.length} lines; read the file for remaining context.]`
			: "";
	return `## ${label} (${path})\n${content}${notice}`;
}
