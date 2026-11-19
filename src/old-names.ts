// The table of old names (T-18): a command, an engine value, a flag or a role that a cut removed refuses with one line
// instead of reading as unknown, so a caller learns what replaced it. R-085 removes the table at the end of the rebuild.

/** A removed name: the name, the feature it was removed with, the ticket that removed it, and what to use instead. */
export type OldName = {
	readonly name: string;
	readonly feature: string;
	readonly ticket: string;
	readonly instead: string;
};

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
	// A subcommand: `ticket` refuses it itself, because `ticket` is a registered command.
	{
		name: "ticket series",
		feature: "ticket series",
		ticket: "R-006",
		instead: "each project numbers its own tickets",
	},
	// Subcommands too: `picture` refuses them itself, whatever words follow.
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
 * Every cut ticket that removes a flag adds its entry here. A command keeps a removed flag in its parse table and
 * refuses it after parsing, so a flag value that looks like it, as in `--label --tab`, still reads as a value.
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
	// `group status` reads its words by hand, so it refuses this flag with `refuseRemovedWords`, before any word is read.
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

/**
 * The table holds removed commands (`OLD_NAMES`), removed engine values (`OLD_ENGINES`), removed flags
 * (`OLD_FLAGS`) and removed roles (`OLD_ROLES`). This is the refusal of a removed command, or `undefined` for a name
 * `OLD_NAMES` does not hold; a subcommand is named with its command, as `ticket series`. The caller refuses before
 * anything runs, so a refusal writes nothing. The caller throws it as a plain `Error`, so `main` ends it as an untyped
 * refusal (exit code 1, code `UNTYPED`): T-18's exit code 2 with `instead` in `next` needs a refusal that its
 * command's registry entry declares (T-28 (1)), which the command registry brings (R-014).
 */
export function removedCommand(name: string): string | undefined {
	const old = OLD_NAMES.find((entry) => entry.name === name);
	return old && `limen ${old.name} was removed with ${old.feature} (${old.ticket}); ${old.instead}`;
}

/**
 * The refusal of a removed engine value, or `undefined` for a value `OLD_ENGINES` does not hold. The engine readers
 * throw it before their own error, so a spawn and a job record that name the engine both get this line.
 */
export function removedEngine(name: string): string | undefined {
	const old = OLD_ENGINES.find((entry) => entry.name === name);
	return old && `engine ${old.name} was removed with ${old.feature} (${old.ticket}); ${old.instead}`;
}

/**
 * The refusal of a removed role, or `undefined` for a role `OLD_ROLES` does not hold. Spawn and continue resolve the
 * role's preamble before the job id and the job folder, so a refused role writes nothing.
 */
export function removedRole(name: string): string | undefined {
	const old = OLD_ROLES.find((entry) => entry.name === name);
	return old && `role ${old.name} was removed with ${old.feature} (${old.ticket}); ${old.instead}`;
}

/** The refusal of a removed flag of a command, or `undefined` for a flag `OLD_FLAGS` does not hold for that command. */
export function removedFlag(command: string, flag: string): string | undefined {
	const old = OLD_FLAGS.find((entry) => entry.command === command && entry.name === flag);
	return old && `limen ${old.command} ${old.name} was removed with ${old.feature} (${old.ticket}); ${old.instead}`;
}

/**
 * Throws the refusal of the first removed flag of `command` that `values`, the command's parsed flags keyed by name
 * without dashes, hold. A command calls it right after parsing, before it writes anything.
 */
export function refuseRemovedFlags(command: string, values: Readonly<Record<string, unknown>>): void {
	for (const old of OLD_FLAGS) {
		if (old.command === command && values[old.name.slice(2)] !== undefined) {
			throw new Error(removedFlag(command, old.name));
		}
	}
}

/**
 * Throws the refusal of the first removed flag of `command` that `words`, the command's unparsed words, hold. A
 * command that reads its words by hand calls it before it reads any of them, so the flag is never read as a value.
 */
export function refuseRemovedWords(command: string, words: readonly string[]): void {
	for (const old of OLD_FLAGS) {
		if (old.command === command && words.includes(old.name)) {
			throw new Error(removedFlag(command, old.name));
		}
	}
}
