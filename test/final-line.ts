// The tests' reader of the final line (D-046 (3)). src/outcome.ts reads and checks the line; then each `next` that is
// not null is read back into words, as a shell reads it, and goes through `commandOf` (src/main.ts), the rules `main`
// follows before a command runs. So a `next` that is prose, a placeholder or a usage error fails the test that reads
// it, with no list of the commands to cover. test/final-line.test.ts holds every test file to this reader.
import assert from "node:assert/strict";
import { commandOf } from "../src/main.ts";
import { type Outcome, type Output, readOutcome as outcomeOf, outputText as textOf } from "../src/outcome.ts";

/**
 * One part of a command line: a single-quoted part, a backslash and the character after it, a run of the characters
 * a shell reads as they are (`shellWord` in src/parser.ts writes the same set bare), a run of spaces, or any other
 * character, which a shell would read specially.
 */
const PART = /'([^']*)'|\\([\s\S])|([A-Za-z0-9_./:@+=%,-]+)|(\s+)|([\s\S])/g;

/**
 * The words a POSIX shell reads from `line`, in the forms Limen writes: bare characters, single-quoted parts and a
 * backslash before one character, joined into one word while no space separates them. Any other character that a
 * shell reads specially, such as `<`, `;` or an unclosed quote, fails, because the line would not run as written.
 */
export function shellWords(line: string): string[] {
	const words: string[] = [];
	let word: string | undefined;
	for (const [, quoted, escaped, bare, space, special] of line.matchAll(PART)) {
		if (special !== undefined) {
			assert.fail(`${JSON.stringify(line)}: a shell reads ${JSON.stringify(special)} as a special character`);
		}
		if (space === undefined) {
			word = `${word ?? ""}${quoted ?? escaped ?? bare ?? ""}`;
		} else if (word !== undefined) {
			words.push(word);
			word = undefined;
		}
	}
	return word === undefined ? words : [...words, word];
}

/** Fails unless `next` is null, or a Limen command that `commandOf` reads with no usage error, as `main` would. */
export function checkNext(next: string | null): void {
	if (next === null) {
		return;
	}
	const [limen, ...args] = shellWords(next);
	assert.equal(limen, "limen", `${JSON.stringify(next)} is not a Limen command`);
	try {
		commandOf(args);
	} catch (error) {
		const reason = error instanceof Error ? error.message : String(error);
		assert.fail(`${JSON.stringify(next)} is not a command that main runs: ${reason}`);
	}
}

/** The final line of `output`, read by the client function of src/outcome.ts, with its `next` checked. */
export function readOutcome(output: Output): Outcome {
	const outcome = outcomeOf(output);
	checkNext(outcome.next);
	return outcome;
}

/** The text for people before the final line, which is read and checked as `readOutcome` does. */
export function outputText(output: Output): string {
	readOutcome(output);
	return textOf(output);
}
