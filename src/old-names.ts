// The table of old command names (T-18): a command that a cut removed refuses with one line instead of reading as an
// unknown command, so a caller learns what replaced it. R-085 removes the table at the end of the rebuild.

/** A removed command: its name, the feature it was removed with, the ticket that removed it, and what to use instead. */
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
];

/**
 * The refusal of a removed command, or `undefined` for a name the table does not hold. The caller refuses before
 * anything runs, so a refusal writes nothing (R-013 gives it exit code 2 and `instead` in `next`).
 */
export function removedCommand(name: string): string | undefined {
	const old = OLD_NAMES.find((entry) => entry.name === name);
	return old && `limen ${old.name} was removed with ${old.feature} (${old.ticket}); ${old.instead}`;
}
