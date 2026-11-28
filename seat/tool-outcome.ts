/**
 * How a seat tool ends (T-02): its failure type, with the exit class and the next command, the read of a file it
 * cannot do without, and its text: counts in words, what a file that must be root's is, and every line made safe for
 * root's terminal and the journal. `seat/deploy.ts`, `seat/alerts.ts` and `seat/main-watch.ts` share it, so their
 * failures and their text follow one rule (T-25); seat code gets Limen's own error type with R-059.
 */
import type { Stats } from "node:fs";
import { readFile } from "node:fs/promises";

/** A refusal or a failure with its exit class (T-02) and the next command. */
export class SeatFailure extends Error {
	readonly exitCode: 1 | 2 | 3 | 4;
	readonly next: string;
	constructor(exitCode: 1 | 2 | 3 | 4, message: string, next: string) {
		super(message);
		this.name = "SeatFailure";
		this.exitCode = exitCode;
		this.next = next;
	}
}

/** A seat tool's exit code and its text; only the tool's entry point sets the code and prints the text. */
export type SeatOutcome = { readonly code: number; readonly stdout: string; readonly stderr: string };

/** What an error says: its message, or the value itself. */
export const reason = (error: unknown) => (error instanceof Error ? error.message : String(error));

/** `1 project`, `2 projects`; `plural` for a noun whose plural is not the noun with an `s`. */
export const counted = (count: number, noun: string, plural = `${noun}s`) => `${count} ${count === 1 ? noun : plural}`;

/** The permission bits of `info` as four octal digits, as `install -m` takes them. */
export const modeOf = (info: Stats) => (info.mode & 0o7777).toString(8).padStart(4, "0");

/**
 * What `info`, not followed through a link, is, for a refusal of a file or a folder that must be root's with a given
 * mode, such as the alerts' topic file and the `main` watcher's entries: its kind, its owner and its mode.
 */
export function shapeOf(info: Stats, rootUid: number): string {
	const kind = info.isSymbolicLink()
		? "a symbolic link"
		: info.isFile()
			? "a file"
			: info.isDirectory()
				? "a folder"
				: "no file or folder";
	const owner = info.uid === rootUid ? "root's" : `uid ${info.uid}'s`;
	return `${kind}, ${owner}, mode ${modeOf(info)}`;
}

/** The text of a file the tool cannot do without, such as the password file; a failed read ends it with exit 4. */
export async function requiredText(path: string, retry: string): Promise<string> {
	try {
		return await readFile(path, "utf8");
	} catch (error) {
		throw new SeatFailure(4, `cannot read ${path}: ${reason(error)}`, `make ${path} readable, then run ${retry}`);
	}
}

/**
 * `text` with each control character (C0, DEL, C1) but tab written as `\xNN`, newlines too unless they are kept as
 * line breaks: job folders, the registries and the password file are written by other accounts, and git prints names
 * and messages from the repository, so none of them may send a control sequence to root's terminal or split a line.
 */
export function printable(text: string, newlines: "keep" | "escape"): string {
	return text.replace(/\p{Cc}/gu, (char) =>
		char === "\t" || (char === "\n" && newlines === "keep")
			? char
			: `\\x${char.charCodeAt(0).toString(16).padStart(2, "0")}`,
	);
}
