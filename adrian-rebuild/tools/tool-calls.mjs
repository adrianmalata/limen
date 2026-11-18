/* PL: Jedyny moduł czytający wyjście stream-json Claude Code (D-026): liczy wywołania narzędzi sesji głównej
   (zdarzenia bez parent_tool_use_id) i dzieli je na odcinki zakończone udanym `git commit`, z tematem z pierwszej
   linii heredoc albo z pierwszego -m (także w grupie flag, np. -am). Linie spoza JSON (stderr, linie runnera) pomija,
   więc liczba może być tylko zaniżona. Używa go night.mjs po
   każdym przebiegu. Stan: działa; test w tools/test-tool-calls.mjs; format strumienia potwierdza pierwsza noc. */

// `git commit` as a command of its own: at the start, or after `&&`, `;` or `|` (D-016 allows compound commands).
const COMMIT = /(?:^|&&|;|\|)\s*git\s+commit\b/;
// -m alone or at the end of a group of short flags (`-am`), so that each form a session writes names its subject.
const MESSAGE = String.raw`\s-[a-zA-Z]*m\s+`;
// A heredoc message, the form Claude Code's own commits use: the subject is the first line inside it.
const HEREDOC = new RegExp(`${MESSAGE}"\\$\\(cat\\s+<<-?\\s*['"]?\\w+['"]?\\s*\\n([^\\n]*)`);
// The first message argument in double quotes (with escapes) or single quotes.
const SUBJECT = new RegExp(`${MESSAGE}(?:"((?:[^"\\\\]|\\\\.)*)"|'([^']*)')`);

/** The JSON value on a line when it is an object, or undefined (stderr, the runner's own lines, a torn line). */
function event(line) {
	try {
		const value = JSON.parse(line);
		return value !== null && typeof value === "object" ? value : undefined;
	} catch (error) {
		if (error instanceof SyntaxError) {
			return undefined;
		}
		throw error;
	}
}

const blocks = (value) => (Array.isArray(value?.message?.content) ? value.message.content : []);

/** The subject of a `git commit` command: the first line of a heredoc message, else the first -m, else null. */
function subject(command) {
	const heredoc = HEREDOC.exec(command);
	if (heredoc !== null) {
		return heredoc[1].trim();
	}
	const match = SUBJECT.exec(command);
	if (match === null) {
		return null;
	}
	// The shell removes escapes only inside double quotes; single quotes keep every character.
	return match[1] === undefined ? match[2] : match[1].replace(/\\(.)/g, "$1");
}

/**
 * The main session's tool calls in a `stream-json` text, split at every `git commit` whose result is not an error:
 * `[{ calls, commit }]`, where `commit` is the subject (or null without -m), and the last segment, after the last
 * commit, has `commit` undefined. A subagent's events carry `parent_tool_use_id` and do not count.
 */
export function countToolCalls(text) {
	const segments = [];
	const state = { seen: new Set(), commits: new Map(), calls: 0 };
	for (const line of text.split("\n")) {
		const value = event(line);
		if (value === undefined || (value.parent_tool_use_id ?? null) !== null) {
			continue;
		}
		if (value.type === "assistant") {
			countCalls(value, state);
		} else if (value.type === "user") {
			for (const commit of commitsDone(value, state)) {
				segments.push({ calls: state.calls, commit });
				state.calls = 0;
			}
		}
	}
	segments.push({ calls: state.calls, commit: undefined });
	return segments;
}

/** Counts the new `tool_use` blocks of an `assistant` event and remembers the `git commit` calls among them. */
function countCalls(value, state) {
	for (const block of blocks(value).filter((item) => item?.type === "tool_use" && !state.seen.has(item.id))) {
		state.seen.add(block.id);
		state.calls += 1;
		const command = block.name === "Bash" ? block.input?.command : undefined;
		if (typeof command === "string" && COMMIT.test(command)) {
			state.commits.set(block.id, subject(command));
		}
	}
}

/** The subjects of the remembered commits whose result in this `user` event is not an error. */
function commitsDone(value, state) {
	const done = [];
	for (const block of blocks(value).filter((item) => item?.type === "tool_result")) {
		if (state.commits.has(block.tool_use_id) && block.is_error !== true) {
			done.push(state.commits.get(block.tool_use_id));
		}
		state.commits.delete(block.tool_use_id);
	}
	return done;
}
