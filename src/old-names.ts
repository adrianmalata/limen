// The table of old names (T-18): a command, an engine value, a flag or a role that a cut removed refuses with one line
// instead of reading as unknown, so a caller learns what replaced it. R-085 removes the table at the end of the rebuild.
import { LimenError } from "./outcome.ts";
import { type Schema, tryParse } from "./parser.ts";

/**
 * A removed name: the name, the feature it was removed with, the ticket that removed it, and what to use instead.
 * The refusal's `next` is `instead`, or, for a name with two new forms, what `next` makes of the words after the
 * name as the shared parser reads them by `next.words` (`undefined` when they do not parse).
 */
export type OldName = {
	readonly name: string;
	readonly feature: string;
	readonly ticket: string;
	readonly instead: string;
	/**
	 * What happened to a name that was renamed or split, not removed; its refusal line says this instead of "was
	 * removed with": `limen <name> <happened> (<ticket>)`.
	 */
	readonly happened?: string;
	readonly next?: { readonly words: Schema; readonly of: (job: string | undefined) => string };
};
/**
 * Where a removed name came from: a caller gave it on the command line (a usage error, exit code 2), or Limen read it
 * from a job record that an older version wrote (a refusal, exit code 1).
 */
export type NameSource = "argument" | "record";

/** Every cut ticket that removes a command adds its entry here. */
export const OLD_NAMES: readonly OldName[] = [
	{
		name: "webhook",
		feature: "finish webhooks",
		ticket: "R-002",
		instead: "the coordinator gets a wake when a job ends",
	},
	{
		name: "linear",
		feature: "the Linear mirror",
		ticket: "R-003",
		instead: "spec/features/ is the only record of ticket state",
	},
	{
		name: "planning",
		feature: "private planning",
		ticket: "R-006",
		instead: "planning files are committed to Git",
	},
	{
		name: "highlight",
		feature: "the Herdr highlight",
		ticket: "R-006",
		instead: "Herdr shows Limen's tabs without a mark",
	},
	{
		name: "ticket-author",
		feature: "ticket authorship",
		ticket: "R-006",
		instead: "git log --diff-filter=A --follow -- <ticket path>",
	},
	{
		name: "wait",
		feature: "waiting on a job",
		ticket: "R-006",
		instead: "the coordinator gets a wake when a job ends",
	},
	// A subcommand: `main` refuses it before it looks for a registered one.
	{
		name: "ticket series",
		feature: "ticket series",
		ticket: "R-006",
		instead: "each project numbers its own tickets",
	},
	// Subcommands too, whatever words follow.
	{
		name: "picture tick",
		feature: "the map jobs",
		ticket: "R-007",
		instead: "no job refreshes the map; limen picture build checks it",
	},
	{
		name: "picture watch",
		feature: "the map watch",
		ticket: "R-007",
		instead: "limen status lists a leftover watch hook and limen init --drop-leftovers removes it",
	},
	// D-038: one job's record moved to `show`, and the list of every job to `status --all`.
	{
		name: "jobs",
		feature: "the split of the job list into status --all and show",
		ticket: "R-014",
		instead: "limen status --all lists every job and limen show <job> shows one",
		happened: "was split into limen status --all, which lists every job, and limen show <job>, which shows one",
		next: {
			// The old words: `[--running|--active|--all|--label <prefix>|<job>]`.
			words: [
				{ positional: "job", type: "word", optional: true, about: "one job" },
				{ flag: "running", about: "the running jobs" },
				{ flag: "active", about: "the running jobs" },
				{ flag: "all", about: "every job" },
				{ flag: "label", value: "prefix", about: "the jobs whose label starts with it" },
			],
			of: (job) => (job ? `limen show ${job}` : "limen status --all"),
		},
	},
	{
		name: "queue",
		feature: "the seat group",
		ticket: "R-014",
		instead: "limen seat queue",
		happened: "was renamed to limen seat queue",
	},
];

/** Every cut ticket that removes a value of `--engine` adds its entry here. */
export const OLD_ENGINES: readonly OldName[] = [
	{ name: "devin", feature: "Devin cloud jobs", ticket: "R-003", instead: "use --engine pi" },
	{ name: "omp", feature: "the OMP engine", ticket: "R-004", instead: "use --engine pi" },
];

/** A removed flag: the command that took it, the flag with its dashes, and the fields of `OldName`. */
export type OldFlag = OldName & { readonly command: string };

/** The one removal of `--tab`, on each command that took it. */
const TAB = {
	name: "--tab",
	feature: "hosted jobs",
	ticket: "R-005",
	instead: "jobs run detached with a Herdr log tab; correct one with limen steer",
} as const;
/**
 * Every cut ticket that removes a flag adds its entry here, and the command's registry entry keeps the flag as a
 * removed part of its schema (`src/parser.ts`), so a flag value that looks like it, as in `--label --tab`, still reads
 * as a value.
 */
export const OLD_FLAGS: readonly OldFlag[] = [
	{ ...TAB, command: "spawn" },
	{ ...TAB, command: "continue" },
	{ ...TAB, command: "group start" },
	{
		command: "continue",
		name: "--review",
		feature: "reviews in a continued session",
		ticket: "R-006",
		instead: "a re-review is a new review job: limen spawn --review",
	},
	{
		command: "group status",
		name: "--json",
		feature: "the JSON group status",
		ticket: "R-006",
		instead: "limen group status shows the run",
	},
	{
		command: "picture build",
		name: "--out",
		feature: "the Picture viewer",
		ticket: "R-007",
		instead: "picture build writes no page; --json F writes the model",
	},
	{
		command: "picture serve",
		name: "--dir",
		feature: "the Picture viewer",
		ticket: "R-007",
		instead: "picture serve serves the jobs of the project it runs in, at /activity.json and /events",
	},
];

/**
 * Every cut ticket that removes a role adds its entry here. A project that writes its own `.agents/limen/<role>.md`
 * keeps a role of that name, so the table is read only when no preamble for the role exists.
 */
export const OLD_ROLES: readonly OldName[] = [
	{ name: "picture", feature: "the map jobs", ticket: "R-007", instead: "no role maintains the map" },
	{
		name: "scout",
		feature: "the scout role",
		ticket: "R-009",
		instead:
			"the coordinator answers a short question itself; a long one is a survey job, whose deliverable is a notes file",
	},
];

/** The typed refusal of a removed name with its line, by where the name came from (T-02, T-18). */
function removal(message: string, next: string, source: NameSource): LimenError {
	return new LimenError({ class: source === "argument" ? "usage" : "refused", code: "REMOVED", message, next });
}

/**
 * The table holds removed commands (`OLD_NAMES`), removed engine values (`OLD_ENGINES`), removed flags
 * (`OLD_FLAGS`) and removed roles (`OLD_ROLES`). This is the line of a removed command, or `undefined` for a name
 * `OLD_NAMES` does not hold; a subcommand is named with its command, as `ticket series`. The wake hook shows it for
 * a removed `/limen` word.
 */
export function removedCommand(name: string): string | undefined {
	const old = OLD_NAMES.find((entry) => entry.name === name);
	if (!old) {
		return undefined;
	}
	return old.happened
		? `limen ${old.name} ${old.happened} (${old.ticket})`
		: `limen ${old.name} was removed with ${old.feature} (${old.ticket}); ${old.instead}`;
}

/**
 * The refusal of the removed command that the first words of a command line name, the longest one when a removed
 * subcommand and its command both are, or `undefined`. `main` checks it before anything runs, so it writes nothing.
 */
export function removedWords(words: readonly string[]): LimenError | undefined {
	const named = OLD_NAMES.filter((old) => old.name.split(" ").every((word, index) => words[index] === word));
	const old = named.sort((left, right) => right.name.length - left.name.length)[0];
	if (!old) {
		return undefined;
	}
	const rest = words.slice(old.name.split(" ").length);
	const next = old.next?.of(tryParse({ name: old.name, schema: old.next.words }, rest)?.get("job"));
	return removal(removedCommand(old.name) ?? old.name, next ?? old.instead, "argument");
}

/**
 * The line of a removed engine value, or `undefined` for a value `OLD_ENGINES` does not hold. The engine readers
 * refuse with it before their own error, so a spawn and a job record that name the engine both get this line.
 */
export function removedEngine(name: string): string | undefined {
	const old = OLD_ENGINES.find((entry) => entry.name === name);
	return old && `engine ${old.name} was removed with ${old.feature} (${old.ticket}); ${old.instead}`;
}

/** Throws the refusal of a removed engine value; a value `OLD_ENGINES` does not hold passes. */
export function refuseRemovedEngine(name: string, source: NameSource): void {
	const old = OLD_ENGINES.find((entry) => entry.name === name);
	if (old) {
		throw removal(removedEngine(name) ?? name, old.instead, source);
	}
}

/**
 * The line of a removed role, or `undefined` for a role `OLD_ROLES` does not hold. Spawn and continue resolve the
 * role's preamble before the job id and the job folder, so a refused role writes nothing.
 */
export function removedRole(name: string): string | undefined {
	const old = OLD_ROLES.find((entry) => entry.name === name);
	return old && `role ${old.name} was removed with ${old.feature} (${old.ticket}); ${old.instead}`;
}

/** Throws the refusal of a removed role; a role `OLD_ROLES` does not hold passes. */
export function refuseRemovedRole(name: string, source: NameSource): void {
	const old = OLD_ROLES.find((entry) => entry.name === name);
	if (old) {
		throw removal(removedRole(name) ?? name, old.instead, source);
	}
}

/** The line of a removed flag of a command, or `undefined` for a flag `OLD_FLAGS` does not hold for that command. */
export function removedFlag(command: string, flag: string): string | undefined {
	const old = OLD_FLAGS.find((entry) => entry.command === command && entry.name === flag);
	return old && `limen ${old.command} ${old.name} was removed with ${old.feature} (${old.ticket}); ${old.instead}`;
}

/**
 * The refusal of a removed flag of a command, or `undefined`. The shared parser refuses with it when the flag stands
 * as a flag, so a value that looks like it, as in `--label --tab`, still reads as a value.
 */
export function removedFlagRefusal(command: string, flag: string): LimenError | undefined {
	const old = OLD_FLAGS.find((entry) => entry.command === command && entry.name === flag);
	return old && removal(removedFlag(command, flag) ?? flag, old.instead, "argument");
}
