/* PL: Czytnik plików sesji Pi (JSONL) dla narzędzia same-task (R-011), w formacie, który czytają src/job/usage.ts
   i src/job/session-commands.ts: tokeny według klas (input, cache write, cache read, output) zsumowane po turach
   asystenta, polecenia basha z wywołań narzędzi, tekst każdej odpowiedzi asystenta, tury zakończone błędem limitu
   (`/hit your (?:[\w-]+ )?limit/i` w errorMessage albo w tekście tury błędu, jak w docs/seat/quota-resume.ts)
   i wywołania narzędzi, których argumenty zawierają dany napis (z pominięciem podanych napisów).
   Ucięta ostatnia linia pliku jest pomijana, a każda inna linia spoza JSON jest pomijana i zgłaszana jako
   `plik:linia: powód`, więc jedna uszkodzona linia nie odbiera próbie podsumowania. Stan: działa; test
   w tools/test-same-task.mjs. */
import { readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";

// The seat's quota-limit text, "You've hit your … limit · resets …", as `docs/seat/quota-resume.ts:20` matches it.
const QUOTA_LIMIT = /hit your (?:[\w-]+ )?limit/i;
const CLASSES = ["input", "cacheWrite", "cacheRead", "output"];

/**
 * The messages of every `*.jsonl` file in `dir`, in file-name order, and the lines that could not be read as
 * `file:line: <reason>`; none of either when the directory does not exist.
 */
export function readSession(dir) {
	let names;
	try {
		names = readdirSync(dir).filter((name) => name.endsWith(".jsonl"));
	} catch (error) {
		if (error.code === "ENOENT") {
			return { messages: [], errors: [] };
		}
		throw error;
	}
	const read = names.sort().map((name) => entries(join(dir, name)));
	return { messages: read.flatMap(({ found }) => found), errors: read.flatMap(({ errors }) => errors) };
}

/**
 * The `message` of each entry of one file. A torn last line (a writer stopped mid-line) is no entry; any other line
 * that is not JSON is skipped and reported, so that one damaged line does not cost the summary of a whole attempt.
 */
function entries(file) {
	const lines = readFileSync(file, "utf8").split("\n");
	const found = [];
	const errors = [];
	for (const [index, line] of lines.entries()) {
		if (line.trim() === "") {
			continue;
		}
		let entry;
		try {
			entry = JSON.parse(line);
		} catch (error) {
			if (!(error instanceof SyntaxError)) {
				throw error;
			}
			if (index < lines.length - 1) {
				errors.push(`${file}:${index + 1}: not a JSON session entry (${error.message})`);
			}
			continue;
		}
		if (entry?.type === "message" && entry.message !== null && typeof entry.message === "object") {
			found.push(entry.message);
		}
	}
	return { found, errors };
}

const assistant = (messages) => messages.filter((message) => message.role === "assistant");
const parts = (message) => (Array.isArray(message.content) ? message.content : []);
const toolCalls = (messages) =>
	assistant(messages).flatMap((message) => parts(message).filter((part) => part?.type === "toolCall"));

/** Tokens by class, summed over the assistant turns. */
export function tokens(messages) {
	const sum = Object.fromEntries(CLASSES.map((name) => [name, 0]));
	for (const message of assistant(messages)) {
		for (const name of CLASSES) {
			const value = message.usage?.[name];
			sum[name] += typeof value === "number" ? value : 0;
		}
	}
	return sum;
}

/** The command of every bash tool call, in order. */
export function bashCommands(messages) {
	return toolCalls(messages)
		.filter((call) => call.name === "bash" && typeof call.arguments?.command === "string")
		.map((call) => call.arguments.command);
}

/** The text of every assistant reply that has text, in order. */
export function replies(messages) {
	return assistant(messages)
		.map((message) =>
			parts(message)
				.filter((part) => part?.type === "text" && typeof part.text === "string")
				.map((part) => part.text)
				.join("")
				.trim(),
		)
		.filter((text) => text !== "");
}

/**
 * The texts of the assistant turns that ended on a quota-limit error: a turn with `stopReason` "error" whose
 * `errorMessage` or a text part matches, as `limitError` in `docs/seat/quota-resume.ts:152-156` reads it.
 */
export function quotaLimits(messages) {
	return assistant(messages)
		.filter((message) => message.stopReason === "error")
		.map((message) => [message.errorMessage, ...parts(message).map((part) => part?.text)])
		.map((texts) => texts.find((text) => typeof text === "string" && QUOTA_LIMIT.test(text)))
		.filter((text) => text !== undefined);
}

/**
 * The tool calls whose arguments, as JSON text, contain `needle`; every string of `ignore` is removed from the text
 * first, so that a path which merely starts with the needle (the attempt's own directory) does not count.
 */
export function callsContaining(messages, needle, ignore = []) {
	return toolCalls(messages)
		.map((call) => ({ name: call.name, text: JSON.stringify(call.arguments ?? null) }))
		.filter(({ text }) => ignore.reduce((rest, word) => rest.replaceAll(word, ""), text).includes(needle))
		.map(({ name }) => name);
}
