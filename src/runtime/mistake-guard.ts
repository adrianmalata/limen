// The mistake guard of the coordinator's session (T-34 (1)): Limen wakes the coordinator when a job ends (A-033), so a
// Bash `sleep` of 30 s or more there only holds the conversation. It guards against a mistake and is no boundary: it
// reads a command's text, not what the command runs, so `bash -c "sleep 60"` passes (z. 14). It finds a `sleep` where
// M-05 counts one (`adrian-rebuild/tools/same-task.mjs`), with a copy of that definition, so it refuses what the metric
// counts; a length it cannot read counts as 30 s or more, since a guard fails closed. It is a pure function of the
// text: it starts no process, reads no file and writes nothing, so a refusal leaves no trace (T-38). R-060 adds T-42's
// timers to this module.

/** T-34's sentence, which ends every refusal here; the coordinator manual holds the same words (templates/manual.md). */
export const WAKE_SENTENCE = "Limen wakes you when a job ends; end your turn instead of waiting.";
/** The length, in seconds, from which the coordinator's session refuses a sleep (T-34 (1)). */
const REFUSED_SECONDS = 30;
/**
 * The start of a shell command, as M-05 counts one: after a separator, then any reserved words that open a body or a
 * group (`do`, `then`, `else`, `{`, `!`, `(`), assignments, and the wrappers that run the rest. A word inside quotes
 * follows no separator, so `git commit -m "fix sleep 60"` holds no sleep call.
 */
const COMMAND_START =
	/(?:^|[\n;&|(`]|\$\()\s*(?:(?:do|then|else|\{|!)\s+|\(\s*|(?:[A-Za-z_]\w*=\S*|nohup|time|command|env|timeout\s+\S+)\s+)*/
		.source;
/** A `sleep` call at a command's start, with its arguments up to the separator that ends that command. */
const SLEEP_CALL = new RegExp(`${COMMAND_START}(sleep\\b[^\\n;&|)\`]*)`, "g");
/** One argument of GNU sleep: a decimal number with an optional unit. */
const ARGUMENT = /^(\d+(?:\.\d*)?|\.\d+)([smhd]?)$/;
/** The seconds of each unit of GNU sleep; a number with no unit is seconds. */
const UNIT_SECONDS: Readonly<Record<string, number>> = { "": 1, s: 1, m: 60, h: 3_600, d: 86_400 };

/**
 * The reason the coordinator's session refuses the Bash command `command`: its first `sleep` call at a command's start
 * whose arguments add up to 30 s or more, or whose length it cannot read; undefined when it holds no such call. The
 * reason names the call as written and the rule, then gives WAKE_SENTENCE, so the model reads what to do instead
 * (z. 12).
 */
export function sleepRefusal(command: string): string | undefined {
	for (const [, call = ""] of command.matchAll(SLEEP_CALL)) {
		const [, ...words] = call.trim().split(/\s+/);
		const total = words.map(argumentSeconds).reduce((sum, seconds) => sum + seconds, 0);
		// A length it cannot read is NaN, which is not below the bound either.
		if (!(total < REFUSED_SECONDS)) {
			return `Refused \`${call.trim()}\`: the coordinator's session runs no sleep of ${REFUSED_SECONDS} s or more, or of a length Limen cannot read. ${WAKE_SENTENCE}`;
		}
	}
	return undefined;
}

/**
 * The seconds one argument of GNU sleep waits, which sums its arguments: Infinity for `infinity`, NaN for a word it
 * cannot read, such as `"$T"` or `$((N*60))`.
 */
function argumentSeconds(word: string): number {
	if (word === "infinity") {
		return Number.POSITIVE_INFINITY;
	}
	const [, amount, unit = ""] = ARGUMENT.exec(word) ?? [];
	return amount === undefined ? Number.NaN : Number(amount) * (UNIT_SECONDS[unit] ?? Number.NaN);
}
