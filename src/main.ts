import { resolve } from "node:path";
import { transport } from "./config.ts";
import { entryHelp, generalHelp, groupEntries, groupHelp } from "./help.ts";
import { type CommandText, EXIT_CODES, failureOf, finalLine, LimenError, type Success } from "./outcome.ts";
import { type Parsed, parse, readCommandLine } from "./parser.ts";
import { projectRootAt } from "./project/git.ts";
import { isModule, modulesOn, requireModule } from "./project/modules.ts";
import { type Entry, REGISTRY } from "./registry.ts";
import { failInternalJob, runInternalJob } from "./runtime/wrapper.ts";

/**
 * The shared wrapper, the only code in `src/` that sets the exit code (D-028) and prints a command's text (D-061 (3)):
 * every command process ends with exactly one final line (`src/outcome.ts`), on stdout after a success and its text
 * and on stderr after a failure's message, and exits with its class's code. The text a command reports as it goes is
 * held and printed when the command ends, before the result's text or the failure's message. The internal job run
 * prints no final line. `registry` is the command registry; a test gives its own.
 */
export async function main(
	args: readonly string[],
	cwd = process.cwd(),
	registry: readonly Entry[] = REGISTRY,
): Promise<void> {
	if (transport("LIMEN_INTERNAL_RUN") === "1") {
		await internalRun();
		return;
	}
	const held = heldText();
	let line: string;
	let text: string | undefined;
	try {
		const success: Success = (await runCommand(args, cwd, registry, held.text)) ?? { next: null };
		line = finalLine({ class: "ok", code: null, next: success.next, ...(success.ids ? { ids: success.ids } : {}) });
		text = success.text;
	} catch (error) {
		const failure = failureOf(error);
		held.print();
		console.error(failure.message);
		if (failure.class === "internal") {
			// T-02: an unexpected exception keeps its stack, from the value that was thrown.
			const origin = failure.cause === undefined ? failure : failure.cause;
			if (origin instanceof Error && origin.stack) {
				console.error(origin.stack);
			}
		}
		console.error(finalLine({ class: failure.class, code: failure.code, next: failure.next }));
		process.exitCode = EXIT_CODES[failure.class];
		return;
	}
	held.print();
	if (text !== undefined) {
		console.log(text);
	}
	console.log(line);
	process.exitCode = EXIT_CODES.ok;
}

/** The text a command reports while it runs, held in its order with its stream until `print` at the command's end. */
function heldText(): { readonly text: CommandText; readonly print: () => void } {
	const lines: Array<{ readonly diagnostic: boolean; readonly text: string }> = [];
	return {
		text: {
			line: (text) => lines.push({ diagnostic: false, text }),
			diagnostic: (text) => lines.push({ diagnostic: true, text }),
		},
		print: () => {
			for (const { diagnostic, text } of lines.splice(0)) {
				(diagnostic ? console.error : console.log)(text);
			}
		},
	};
}

/** The job wrapper's own run: not a command, so no final line, and a failure exits 1 as before R-013. */
async function internalRun(): Promise<void> {
	try {
		await runInternalJob();
	} catch (error) {
		await failInternalJob(error);
		console.error(error instanceof Error ? error.message : String(error));
		process.exitCode = 1;
	}
}

/** What a command line asks for: a help text to print, or a registry entry with the values the shared parser read. */
export type CommandOf = { readonly help: string } | { readonly entry: Entry; readonly values: Parsed };

/**
 * What `args` ask for, by the rules `main` follows before anything runs, as the shared parser reads them: the general
 * help, with the module switches of the project at `cwd` when it is given (`switchesAt`); a removed name its refusal;
 * a group word its lines for `--help`, else a usage error; an entry its own help for `--help`, else the values the
 * shared parser reads from its words. Every refusal here is a usage error (exit code 2). The tests' reader of the final
 * line runs every `next` through it (D-046 (3)).
 */
export function commandOf(args: readonly string[], registry: readonly Entry[] = REGISTRY, cwd?: string): CommandOf {
	const read = readCommandLine(args, registry);
	if (read.kind === "general-help") {
		return { help: generalHelp(registry, switchesAt(cwd)) };
	}
	if (read.kind === "other") {
		return { help: groupOrUnknown(read, registry, cwd) };
	}
	const { command: entry, rest } = read;
	return read.help ? { help: entryHelp(entry) } : { entry, values: parse(entry, rest) };
}

/**
 * The modules switched on in the project at `cwd`, which the general help marks `[on]` (T-19 (5)); none without a
 * working directory or outside every project, where no file switches one on (G1.10).
 */
function switchesAt(cwd: string | undefined): ReadonlySet<string> {
	return cwd === undefined ? new Set() : modulesOn(projectRootAt(cwd));
}

/**
 * The shared step of a module's command, after its help and before its handler (R-044 Decision 4, T-38): it refuses
 * MODULE_OFF, before anything is written, while its module is off in the project it acts on, the one its `root`
 * positional names when its schema declares one and it is given, else the one at the cwd (R-044 Decision 17). An
 * entry that acts on every registered project (`eachProject`) checks each project's switch itself.
 */
function requireEntryModule(entry: Entry, values: Parsed, cwd: string): void {
	if (!isModule(entry.object) || entry.eachProject) {
		return;
	}
	const named = entry.schema.some((part) => "positional" in part && part.positional === "root")
		? values.get("root")
		: undefined;
	requireModule(named === undefined ? projectRootAt(cwd) : resolve(cwd, named), entry.object);
}

/**
 * Runs the entry that the first words name, through the shared parser, and holds its success to the `ids` keys the
 * entry declares (D-022): an undeclared key is an internal error, so the declaration is a guarantee.
 */
async function runCommand(
	args: readonly string[],
	cwd: string,
	registry: readonly Entry[],
	out: CommandText,
): Promise<Success | undefined> {
	const command = commandOf(args, registry, cwd);
	if ("help" in command) {
		return { next: null, text: command.help };
	}
	const { entry, values } = command;
	requireEntryModule(entry, values, cwd);
	const success = await entry.handler(values, cwd, out);
	const undeclared = Object.keys(success?.ids ?? {}).filter((key) => !entry.ids.some((declared) => declared === key));
	if (undeclared.length) {
		throw new LimenError({
			class: "internal",
			code: "UNDECLARED_IDS",
			message: `limen ${entry.name} returned ids.${undeclared.join(", ids.")}, which its registry entry does not declare`,
			next: null,
		});
	}
	return success;
}

/**
 * A group word (`limen ticket`) gives its lines for `--help` and refuses otherwise with them in the message; any other
 * word is an unknown command.
 */
function groupOrUnknown(
	{ word, sub, help }: { readonly word: string; readonly sub: string | undefined; readonly help: boolean },
	registry: readonly Entry[],
	cwd: string | undefined,
): string {
	if (!groupEntries(word, registry).length) {
		throw new LimenError({
			class: "usage",
			code: "UNKNOWN_COMMAND",
			message: `unknown command ${JSON.stringify(word)}\n\n${generalHelp(registry, switchesAt(cwd))}`,
			next: "limen --help",
		});
	}
	if (help) {
		return groupHelp(word, registry);
	}
	throw new LimenError({
		class: "usage",
		code: sub === undefined ? "BAD_ARGUMENT" : "UNKNOWN_COMMAND",
		message: `limen ${word}: ${sub === undefined ? "name one of its commands" : `unknown command ${JSON.stringify(sub)}`}\n${groupHelp(word, registry)}`,
		next: `limen ${word} --help`,
	});
}
