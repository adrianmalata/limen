// The table of old names (T-18): a command or an engine value that a cut removed refuses with one line instead of
// reading as unknown, so a caller learns what replaced it. R-085 removes the table at the end of the rebuild.

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
];

/** Every cut ticket that removes a value of `--engine` adds its entry here. */
export const OLD_ENGINES: readonly OldName[] = [
	{ name: "devin", feature: "Devin cloud jobs", ticket: "R-003", instead: "use --engine pi" },
];

/**
 * The table holds removed commands (`OLD_NAMES`) and removed engine values (`OLD_ENGINES`). This is the refusal of a
 * removed command, or `undefined` for a name `OLD_NAMES` does not hold. The caller refuses before anything runs, so a
 * refusal writes nothing (R-013 gives it exit code 2 and `instead` in `next`).
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
