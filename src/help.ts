// The help that the command registry generates (T-19): `limen --help`, `limen <name> --help`, the lines of one
// group, and the two generated sections of docs/commands.md. The layout is the draft renderer's
// (`adrian-rebuild/evidence/taste/help-registry.mjs`): each group aligns its own summary column.
import { EXIT_CODES, FINAL_LINE_KEYS } from "./outcome.ts";
import { flagTerm, positionalTerm, usage, usageLines, WIDTH } from "./parser.ts";
import { type Entry, GROUPS, MODULES_HEADER, REGISTRY } from "./registry.ts";

const TAGLINE = "limen: coding jobs, each in its own git worktree";
/** A usage longer than this puts its summary on the next line, so one long usage does not push every summary right. */
const USAGE_CAP = 35;
const SUMMARY_INDENT = 6;
const LIMEN = "  limen ";
/** The space between the widest term of `limen <name> --help` and its descriptions. */
const TERM_GAP = 4;

/** One line: the head and its text on one line; a long head, then a long text, each move the text down. */
function lines(head: string, text: string, column: number): string[] {
	if (column + text.length > WIDTH) {
		return [head, `${" ".repeat(SUMMARY_INDENT)}${text}`];
	}
	return head.length + 2 > column ? [head, " ".repeat(column) + text] : [head.padEnd(column) + text];
}

/** The rows of one group: `limen <usage>` and its summary, aligned in one column for the group. */
function rows(items: ReadonlyArray<readonly [string, string]>): string[] {
	const widest = Math.max(...items.map(([head]) => head.length));
	const column = Math.min(widest, USAGE_CAP) + LIMEN.length + 2;
	return items.flatMap(([head, summary]) => lines(`${LIMEN}${head}`, summary, column));
}

const visible = (registry: readonly Entry[]) => registry.filter((entry) => entry.visibility === "public");

/** A module's one line: its public subcommands joined by `|`, and ` …` when any of them takes a word. */
function moduleRow(registry: readonly Entry[], object: string): string {
	const entries = visible(registry).filter((entry) => entry.object === object);
	const takesWords = entries.some((entry) => entry.schema.some((part) => !("removed" in part)));
	const subcommands = entries.map((entry) => entry.name.split(" ").slice(1).join(" "));
	return `${object} ${subcommands.join("|")}${takesWords ? " …" : ""}`;
}

/**
 * The command lines of the general help: each group with its header, then the modules, one line each, whose summary
 * opens with `[on]` for a module of `on` and `[off]` for every other (T-19 (5), G1.10).
 */
function commandLines(registry: readonly Entry[], on: ReadonlySet<string>): string[] {
	const out: string[] = [];
	const modules: Array<readonly [string, string]> = [];
	for (const group of GROUPS) {
		const entries = visible(registry).filter((entry) => entry.object === group.object);
		if (!entries.length) {
			continue;
		}
		if ("module" in group) {
			modules.push([moduleRow(registry, group.object), `[${on.has(group.object) ? "on" : "off"}] ${group.summary}`]);
			continue;
		}
		out.push(group.header, ...rows(entries.map((entry) => [usage(entry), entry.summary] as const)), "");
	}
	return modules.length ? [...out, MODULES_HEADER, ...rows(modules)] : out.slice(0, -1);
}

/** The exit-code line from `EXIT_CODES` and the line about the final JSON line from its key list (T-02, D-041 (1)). */
function closingLines(): string[] {
	const codes = Object.entries(EXIT_CODES).map(([name, code]) => `${code} ${name}`);
	const keys = FINAL_LINE_KEYS.map(({ key, optional }) => (optional ? `${key}?` : key));
	return [`Exit codes: ${codes.join(" · ")}.`, `The last output line is JSON {${keys.join(", ")}}.`];
}

/**
 * `limen --help`: the public commands by group, the modules with those of `on`, the ones the project's limits file
 * switches on, marked `[on]`, then the exit codes; internal commands stay out (T-19).
 */
export function generalHelp(registry: readonly Entry[] = REGISTRY, on: ReadonlySet<string> = new Set()): string {
	return [TAGLINE, "", ...commandLines(registry, on), "", ...closingLines()].join("\n");
}

/** The words of an example, a quoted text as one word and a flag with its value as one unit. */
function exampleUnits(example: string): string[] {
	const units: string[] = [];
	for (const word of example.match(/"[^"]*"|\S+/g) ?? []) {
		const last = units.at(-1);
		if (last?.startsWith("--") && !last.includes(" ") && !word.startsWith("--")) {
			units[units.length - 1] = `${last} ${word}`;
		} else {
			units.push(word);
		}
	}
	return units;
}

/** `Example: <command>`; a command too wide for one line goes on with a shell continuation, so it still runs. */
function exampleLines(example: string): string[] {
	const out: string[] = [];
	let line = "Example:";
	for (const unit of exampleUnits(example)) {
		if (line.length + 1 + unit.length + 2 > WIDTH && line !== "Example:") {
			out.push(`${line} \\`);
			line = `  ${unit}`;
		} else {
			line = `${line} ${unit}`;
		}
	}
	return [...out, line];
}

/**
 * `limen <name> --help`: the usage line, the summary, the kind, `read` or `change` (T-19 (2); shown since no read
 * command writes, D-041 (6), R-103), one line per positional and flag with its description, and the example.
 */
export function entryHelp(entry: Entry): string {
	const parts = entry.schema.flatMap((part): Array<readonly [string, string]> => {
		if ("positional" in part) {
			return [[positionalTerm(part), part.about]];
		}
		return "flag" in part ? [[flagTerm(part), part.about]] : [];
	});
	const widest = Math.max(0, ...parts.map(([term]) => term.length));
	const column = Math.min(widest, USAGE_CAP) + 2 + TERM_GAP;
	const described = parts.flatMap(([term, about]) => lines(`  ${term}`, about, column));
	return [
		...usageLines(entry, ""),
		entry.summary,
		`kind: ${entry.kind}`,
		...(entry.caller ? [`internal: run by ${entry.caller}`] : []),
		"",
		...(described.length ? [...described, ""] : []),
		...exampleLines(entry.example),
	].join("\n");
}

/** The public entries whose name starts with `word` and a space, the subcommands of a group. */
export function groupEntries(word: string, registry: readonly Entry[] = REGISTRY): readonly Entry[] {
	return visible(registry).filter((entry) => entry.name.startsWith(`${word} `));
}

/** `limen <group> --help`: the group's title and the lines of its public subcommands. */
export function groupHelp(word: string, registry: readonly Entry[] = REGISTRY): string {
	const group = GROUPS.find((candidate) => candidate.object === word);
	const title = !group ? word : "module" in group ? `${word}: ${group.summary}` : group.header;
	return [title, ...rows(groupEntries(word, registry).map((entry) => [usage(entry), entry.summary] as const))].join(
		"\n",
	);
}

/** The internal entries, each with its usage line, its summary and its caller. */
function internalLines(registry: readonly Entry[]): string[] {
	return registry
		.filter((entry) => entry.visibility === "internal")
		.flatMap((entry) => [
			...usageLines(entry, ""),
			`${" ".repeat(SUMMARY_INDENT)}${entry.summary}`,
			`${" ".repeat(SUMMARY_INDENT)}run by ${entry.caller ?? "Limen"}`,
		]);
}

const fenced = (text: readonly string[]) => `\`\`\`text\n${text.join("\n")}\n\`\`\`\n`;

/**
 * The two sections of docs/commands.md that the registry generates (A-084), by the name of their markers: the
 * general help's command lines, with every module off so that the section is the same for every project, and every
 * internal entry.
 */
export function docsSections(registry: readonly Entry[] = REGISTRY): Readonly<Record<"public" | "internal", string>> {
	return { public: fenced(commandLines(registry, new Set())), internal: fenced(internalLines(registry)) };
}
