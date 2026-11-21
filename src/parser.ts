// The one parser of command words (T-19, T-25): every command declares its positionals and flags in its registry
// entry, and this module alone turns words into values. Every error it finds is a usage error (T-02: exit code 2)
// whose message ends with the command's usage line, built from the same schema as the help.
import { removedFlagRefusal } from "./old-names.ts";
import { LimenError } from "./outcome.ts";

/** A job reference, a ticket number (`FNNN`), free text, a path, a branch, or one word. */
export type PositionalType = "job" | "ticket" | "text" | "path" | "branch" | "word";
/**
 * A positional. `shown` names it in the usage line where its name is not the word to show. A final positional of
 * type `text` takes the remaining words, joined by a space. `replacedBy` names a flag that stands in its place, as
 * `--running` does for `steer <job>`.
 */
export type Positional = {
	readonly positional: string;
	readonly type: PositionalType;
	readonly shown?: string;
	readonly optional?: true;
	readonly repeated?: true;
	readonly replacedBy?: string;
	readonly about: string;
};
/**
 * A flag, without its dashes: a switch, or one that takes a value named `value` or one of `choices`. Only a word that
 * starts with `--` is a flag; its separate value may start with `--` only when `dashValue` allows it (a label).
 */
export type Flag = {
	readonly flag: string;
	readonly value?: string;
	readonly choices?: readonly string[];
	readonly repeatable?: true;
	readonly required?: true;
	readonly dashValue?: true;
	readonly about: string;
};
/** A flag a cut removed (`OLD_FLAGS`): never shown, refused with its line when it stands as a flag. */
export type Removed = { readonly removed: string };
export type Part = Positional | Flag | Removed;
export type Schema = readonly Part[];
/** What the parser needs of a registry entry: its name, its schema, and whether its line drops its optional flags. */
export type Command = { readonly name: string; readonly schema: Schema; readonly abbreviated?: true };

type Value = string | true | readonly string[];

/** The parsed values of one command line, read by the names its schema declares. */
export class Parsed {
	private readonly values: ReadonlyMap<string, Value>;
	private readonly declared: ReadonlySet<string>;
	private readonly command: Command;
	constructor(values: ReadonlyMap<string, Value>, declared: ReadonlySet<string>, command: Command) {
		this.values = values;
		this.declared = declared;
		this.command = command;
	}
	/**
	 * The command line that gives these values with `to` in the place of the value `from` of `name`, built from the
	 * schema, so that it parses to the same values but that one: a refusal's `next` for a job given approximately
	 * (T-20 (3), D-045 (2)).
	 */
	commandWith(name: string, from: string, to: string): string {
		const positionals: string[] = [];
		const flags: string[] = [];
		for (const part of this.command.schema) {
			const key = isPositional(part) ? part.positional : isFlag(part) ? part.flag : undefined;
			const value = key === undefined ? undefined : this.values.get(key);
			if (key === undefined || value === undefined) {
				continue;
			}
			const words = (typeof value === "string" ? [value] : value === true ? [] : value).map((word) =>
				key === name && word === from ? to : word,
			);
			if (isPositional(part)) {
				positionals.push(...words);
			} else {
				flags.push(...(value === true ? [`--${key}`] : words.flatMap((word) => flagWords(key, word))));
			}
		}
		// A positional that starts with `--` reads as a positional only after a lone `--`, so the flags come first then.
		const dashed = positionals.some((word) => word.startsWith("--"));
		const words = dashed ? [...flags, "--", ...positionals] : [...positionals, ...flags];
		return [`limen ${this.command.name}`, ...words.map(shellWord)].join(" ");
	}
	/**
	 * A positional or a flag's value. A text, a repeated positional or a repeatable flag gives its words or values
	 * joined by a space; read a repeatable flag with `list`.
	 */
	get(name: string): string | undefined {
		const value = this.read(name);
		if (typeof value === "string") {
			return value;
		}
		return Array.isArray(value) ? (value.length ? value.join(" ") : undefined) : undefined;
	}
	/** Every word of a repeated positional or a text, or every value of a repeatable flag; empty when none. */
	list(name: string): readonly string[] {
		const value = this.read(name);
		return typeof value === "string" ? [value] : Array.isArray(value) ? value : [];
	}
	/** Whether a flag or a positional was given. */
	has(name: string): boolean {
		return this.read(name) !== undefined;
	}
	private read(name: string): Value | undefined {
		if (!this.declared.has(name)) {
			throw new TypeError(`the schema declares no part ${JSON.stringify(name)}`);
		}
		return this.values.get(name);
	}
}

/** A flag's value as words of a command line: inline when it starts with `--`, which a separate word does not take. */
function flagWords(flag: string, value: string): string[] {
	return value.startsWith("--") ? [`--${flag}=${value}`] : [`--${flag}`, value];
}
/** A word as a POSIX shell reads it back: as it is when it holds no special character, else in single quotes. */
function shellWord(word: string): string {
	return /^[A-Za-z0-9_./:@+=%,-]+$/.test(word) ? word : `'${word.replaceAll("'", `'\\''`)}'`;
}

const isFlag = (part: Part): part is Flag => "flag" in part;
const replacedIn = (part: Positional, flags: ReadonlyMap<string, Value>): boolean =>
	part.replacedBy !== undefined && flags.has(part.replacedBy);
const isPositional = (part: Part): part is Positional => "positional" in part;
const TICKET = /^F\d+$/i;

/** A positional as the usage line shows it: `<job>`, `<FNNN>`, `"task"`, `<branch>`. */
export function positionalTerm(part: Positional): string {
	const name = part.shown ?? part.positional;
	return part.type === "job"
		? "<job>"
		: part.type === "ticket"
			? "<FNNN>"
			: part.type === "text"
				? `"${name}"`
				: `<${name}>`;
}

/** A flag as the usage line shows it: `--yes`, `--onto <branch>`, `--lane planned|active`. */
export function flagTerm(part: Flag): string {
	const value = part.choices ? ` ${part.choices.join("|")}` : part.value ? ` <${part.value}>` : "";
	return `--${part.flag}${value}`;
}

/** T-10: every generated view has lines of at most 100 characters; a parser error lays out its usage line the same way. */
export const WIDTH = 100;
const CONTINUATION = "      ";

/**
 * The terms of the usage line after `limen`, the same in the general help, in `limen <name> --help` and in a parser
 * error. An abbreviated entry shows its positionals and required flags, and ends with ` …` when that hides a flag;
 * every other line shows every flag. A repeated positional ends with ` …`; a repeatable flag says so in its
 * description, so an abbreviated line never ends with two.
 */
function usageTerms(command: Command): string[] {
	const replacing = new Set(command.schema.filter(isPositional).flatMap((part) => part.replacedBy ?? []));
	const terms = command.schema.flatMap((part): string[] => {
		if (isPositional(part)) {
			const base = `${positionalTerm(part)}${part.replacedBy && !command.abbreviated ? `|--${part.replacedBy}` : ""}`;
			const term = part.repeated ? `${base} …` : base;
			return [part.optional ? `[${term}]` : term];
		}
		if (!isFlag(part) || replacing.has(part.flag) || (command.abbreviated && !part.required)) {
			return [];
		}
		const term = flagTerm(part);
		return [part.required ? term : `[${term}]`];
	});
	const hides = command.abbreviated === true && command.schema.some((part) => isFlag(part) && !part.required);
	return [command.name, ...terms, ...(hides ? ["…"] : [])];
}

/** The usage line after `limen`, as one string. */
export function usage(command: Command): string {
	return usageTerms(command).join(" ");
}

/**
 * The usage line after `lead` and `limen`, laid out in lines of at most `WIDTH`: a term that does not fit starts a
 * line indented by 6, so a term is never split.
 */
export function usageLines(command: Command, lead: string): string[] {
	const [name = "", ...terms] = usageTerms(command);
	const lines: string[] = [];
	let line = `${lead}limen ${name}`;
	for (const term of terms) {
		if (line.length + 1 + term.length > WIDTH && line.trim() !== "") {
			lines.push(line);
			line = `${CONTINUATION}${term}`;
		} else {
			line = `${line} ${term}`;
		}
	}
	return [...lines, line];
}

/** A usage error of `command`: what is wrong on the first line, the usage line on the second (D-041 (4)). */
function bad(command: Command, what: string): LimenError {
	return new LimenError({
		class: "usage",
		code: "BAD_ARGUMENT",
		message: [`limen ${command.name}: ${what}`, ...usageLines(command, "usage: ")].join("\n"),
		next: `limen ${command.name} --help`,
	});
}

/** The flags and the positional words of a command line, in their order; an error on the first bad flag. */
type Words = { readonly flags: Map<string, Value>; readonly words: string[] };

function readWords(command: Command, args: readonly string[]): Words {
	const flags = new Map<string, Value>();
	const words: string[] = [];
	let flagsEnd = false;
	for (let index = 0; index < args.length; index += 1) {
		const word = args[index] ?? "";
		if (!flagsEnd && word === "--") {
			flagsEnd = true;
		} else if (!flagsEnd && word.startsWith("--")) {
			index += readFlag(command, args, index, flags);
		} else if (word !== "") {
			// An empty word, such as an unset shell variable, is never a positional.
			words.push(word);
		}
	}
	return { flags, words };
}

/** Reads the flag at `args[index]` into `flags`; returns how many words after it the flag took as its value. */
function readFlag(command: Command, args: readonly string[], index: number, flags: Map<string, Value>): number {
	const word = args[index] ?? "";
	const equals = word.indexOf("=");
	const name = word.slice(2, equals === -1 ? undefined : equals);
	const removed = command.schema.some((part) => "removed" in part && part.removed === name);
	const refusal = removed ? removedFlagRefusal(command.name, `--${name}`) : undefined;
	if (refusal) {
		throw refusal;
	}
	const flag = command.schema.filter(isFlag).find((part) => part.flag === name);
	if (!flag) {
		throw bad(command, `unknown flag --${name}`);
	}
	const inline = equals === -1 ? undefined : word.slice(equals + 1);
	if (!flag.value && !flag.choices) {
		if (inline !== undefined) {
			throw bad(command, `--${name} takes no value`);
		}
		flags.set(name, true);
		return 0;
	}
	const value = inline ?? args[index + 1];
	if (!value || (inline === undefined && value.startsWith("--") && !flag.dashValue)) {
		throw bad(command, `missing the value of --${name}`);
	}
	if (flag.choices && !flag.choices.includes(value)) {
		throw bad(command, `--${name} takes ${flag.choices.join(", ")}, not ${JSON.stringify(value)}`);
	}
	const earlier = flags.get(name);
	if (earlier !== undefined && !flag.repeatable) {
		throw bad(command, `--${name} given twice`);
	}
	flags.set(name, flag.repeatable ? [...(Array.isArray(earlier) ? earlier : []), value] : value);
	return inline === undefined ? 1 : 0;
}

/**
 * Gives each positional its words in order: a required one takes one word, an optional one takes one only when words
 * remain beyond those the required ones after it need, and a repeated one, or a final text, takes the rest. A
 * positional whose flag stands in its place takes no word, except a final text, which then takes the rest if any:
 * `spawn "title" --task-file F` names the job by its words.
 */
function placeWords(command: Command, words: readonly string[], flags: ReadonlyMap<string, Value>) {
	const positionals = command.schema.filter(isPositional);
	const values = new Map<string, Value>();
	const missing: string[] = [];
	let next = 0;
	for (const [index, part] of positionals.entries()) {
		const rest = part.repeated === true || (part.type === "text" && index === positionals.length - 1);
		const replaced = replacedIn(part, flags);
		if (replaced && !rest) {
			continue;
		}
		const optional = part.optional === true || replaced;
		const remaining = words.length - next;
		const later = positionals.slice(index + 1).filter((after) => !after.optional && !replacedIn(after, flags)).length;
		const single = optional ? Number(remaining > later) : Math.min(remaining, 1);
		const take = rest ? Math.max(remaining - later, 0) : single;
		if (take === 0 && !optional) {
			missing.push(positionalTerm(part));
			continue;
		}
		if (take > 0) {
			const taken = words.slice(next, next + take);
			values.set(part.positional, rest ? taken : (taken[0] ?? ""));
			next += take;
		}
	}
	return { values, missing, extra: words.slice(next) };
}

/** A word of a positional of a type the parser can check: a ticket number is `FNNN`. */
function checkTypes(command: Command, values: ReadonlyMap<string, Value>): void {
	for (const part of command.schema.filter(isPositional)) {
		const value = values.get(part.positional);
		const words = typeof value === "string" ? [value] : Array.isArray(value) ? value : [];
		const wrong = part.type === "ticket" ? words.find((word) => !TICKET.test(word)) : undefined;
		if (wrong !== undefined) {
			throw bad(command, `${positionalTerm(part)} takes a ticket number such as F012, not ${JSON.stringify(wrong)}`);
		}
	}
}

/**
 * Whether `args` ask for help: `--help` or `-h` stands as a word of its own, before a lone `--` and not as the value
 * of a flag that takes one, by the rules of `parse`.
 */
export function asksHelp(command: Command, args: readonly string[]): boolean {
	for (let index = 0; index < args.length; index += 1) {
		const word = args[index] ?? "";
		if (word === "--") {
			return false;
		}
		if (word === "--help" || word === "-h") {
			return true;
		}
		const flag =
			word.startsWith("--") && !word.includes("=")
				? command.schema.filter(isFlag).find((part) => part.flag === word.slice(2))
				: undefined;
		const value = args[index + 1];
		if ((flag?.value || flag?.choices) && value !== undefined && (!value.startsWith("--") || flag.dashValue)) {
			index += 1;
		}
	}
	return false;
}

/** The values of `args`, or `undefined` where `parse` refuses them with a usage error. */
export function tryParse(command: Command, args: readonly string[]): Parsed | undefined {
	try {
		return parse(command, args);
	} catch (error) {
		if (error instanceof LimenError && error.class === "usage") {
			return undefined;
		}
		throw error;
	}
}

/**
 * The values of `args` by `command`'s schema. The rules of a word: only a word that starts with `--` is a flag, so
 * `-x` and `-` are positionals; a lone `--` ends the flags; an empty word is dropped.
 */
export function parse(command: Command, args: readonly string[]): Parsed {
	const { flags, words } = readWords(command, args);
	const placed = placeWords(command, words, flags);
	const unflagged = command.schema.filter(isFlag).filter((part) => part.required && !flags.has(part.flag));
	const missing = [...placed.missing, ...unflagged.map((part) => `--${part.flag}`)];
	if (missing.length) {
		throw bad(command, `missing ${missing.join(", ")}`);
	}
	const [extra] = placed.extra;
	if (extra !== undefined) {
		throw bad(command, `unexpected argument ${JSON.stringify(extra)}`);
	}
	checkTypes(command, placed.values);
	const declared = new Set(
		command.schema.flatMap((part) => (isPositional(part) ? [part.positional] : isFlag(part) ? [part.flag] : [])),
	);
	return new Parsed(new Map([...flags, ...placed.values]), declared, command);
}
