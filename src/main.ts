import { endDueRules } from "./commands/rule.ts";
import { transport } from "./config.ts";
import { commandHelp, generalHelp, groupEntries, groupHelp } from "./help.ts";
import { removedWords } from "./old-names.ts";
import { EXIT_CODES, failureOf, finalLine, LimenError, type Success } from "./outcome.ts";
import { asksHelp, type Parsed, parse } from "./parser.ts";
import { type Entry, lookup, REGISTRY } from "./registry.ts";
import { failInternalJob, runInternalJob } from "./runtime/wrapper.ts";

/**
 * The shared wrapper, the only code in `src/` that sets the exit code (D-028): every command process ends with exactly
 * one final line (`src/outcome.ts`), on stdout after a success and its text line and on stderr after a failure's
 * message, and exits with its class's code. A command another command calls in-process prints no line; the internal
 * job run prints none. `registry` is the command registry; a test gives its own.
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
	let line: string;
	let text: string | undefined;
	try {
		const success: Success = (await runCommand(args, cwd, registry)) ?? { next: null };
		line = finalLine({ class: "ok", code: null, next: success.next, ...(success.ids ? { ids: success.ids } : {}) });
		text = success.text;
	} catch (error) {
		const failure = failureOf(error);
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
	if (text !== undefined) {
		console.log(text);
	}
	console.log(line);
	process.exitCode = EXIT_CODES.ok;
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
 * What `args` ask for, by the rules `main` follows before anything runs: no word, `--help`, `-h` or `help` the general
 * help; a removed name its refusal; a group word its lines for `--help`, else a usage error; an entry its own help for
 * `--help`, else the values the shared parser reads from its words. Every refusal here is a usage error (exit code 2).
 * The tests' reader of the final line runs every `next` through it (D-046 (3)).
 */
export function commandOf(args: readonly string[], registry: readonly Entry[] = REGISTRY): CommandOf {
	const [name] = args;
	if (!name || name === "--help" || name === "-h" || name === "help") {
		return { help: generalHelp(registry) };
	}
	const removed = removedWords(args);
	if (removed) {
		throw removed;
	}
	const found = lookup(args, registry);
	if (!found) {
		return { help: groupOrUnknown(name, args.slice(1), registry) };
	}
	const { entry, rest } = found;
	return asksHelp(entry, rest) ? { help: commandHelp(entry, registry) } : { entry, values: parse(entry, rest) };
}

/**
 * Runs the entry that the first words name, through the shared parser, and holds its success to the `ids` keys the
 * entry declares (D-022): an undeclared key is an internal error, so the declaration is a guarantee.
 */
async function runCommand(
	args: readonly string[],
	cwd: string,
	registry: readonly Entry[],
): Promise<Success | undefined> {
	const command = commandOf(args, registry);
	if ("help" in command) {
		console.log(command.help);
		return undefined;
	}
	const { entry, values } = command;
	// A rule whose timer died still ends once; this only starts a detached timer.
	try {
		endDueRules(entry.name);
	} catch {
		// A rule record is a side channel too.
	}
	const success = await entry.handler(values, cwd);
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
function groupOrUnknown(name: string, rest: readonly string[], registry: readonly Entry[]): string {
	if (!groupEntries(name, registry).length) {
		throw new LimenError({
			class: "usage",
			code: "UNKNOWN_COMMAND",
			message: `unknown command ${JSON.stringify(name)}\n\n${generalHelp(registry)}`,
			next: "limen --help",
		});
	}
	// A group word has no schema, so every word that starts with `--` reads as a switch.
	if (asksHelp({ name, schema: [] }, rest)) {
		return groupHelp(name, registry);
	}
	const [sub] = rest;
	throw new LimenError({
		class: "usage",
		code: sub === undefined ? "BAD_ARGUMENT" : "UNKNOWN_COMMAND",
		message: `limen ${name}: ${sub === undefined ? "name one of its commands" : `unknown command ${JSON.stringify(sub)}`}\n${groupHelp(name, registry)}`,
		next: `limen ${name} --help`,
	});
}
