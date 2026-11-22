/* PL: Hook PreToolUse Claude Code (D-083). Pytanie o decyzję to push z identyfikatorem `Q-NN` albo Write lub Edit
   pliku `adrian-rebuild/.night/questions.md`; hook przepuszcza je (exit 0) tylko wtedy, gdy sesja główna od poprzedniego
   zadanego pytania przeczytała (Read) albo przeszukała (Grep, Bash grep, sed -n, cat z jego ścieżką) każde z czterech
   źródeł: gate-2-decisions.md, taste.md, zasady-budowy-harnessu.md i plan.md. Inaczej exit 2 i lista brakujących
   źródeł. Dowodzi szukania, nie jego użycia. Stan: działa; test w tools/test-decision-guard.mjs. */
// Usage: a PreToolUse hook of `.claude/settings.local.json` (D-016), the hook input as JSON on stdin:
//   node adrian-rebuild/tools/decision-guard.mjs
// Exit 0 runs the tool call; exit 2 blocks it and gives stderr to the session. Claude Code runs the call on any other
// exit code, so every failure of the guard on a decision question is exit 2 too: the guard fails closed.
import { readFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

// The repository root, from this file's place in `adrian-rebuild/tools/`, so that no hook input or variable moves it.
const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "../..");
const SOURCES = [
	"adrian-rebuild/input/gate-2-decisions.md",
	"adrian-rebuild/taste.md",
	"adrian-rebuild/input/zasady-budowy-harnessu.md",
	"adrian-rebuild/plan.md",
];
const QUESTIONS = "adrian-rebuild/.night/questions.md";
const QUESTION_ID = /\bQ-\d+\b/;
// Outside quotes these characters start a new simple command (lists, pipes, subshells, lines), so a search after
// one of them is read with its own program name.
const SEPARATORS = new Set([";", "|", "&", "(", ")", "\n"]);
// The short options of grep (git grep too) and sed whose argument may be the next word, so that word is no file.
const ARGUMENT_OPTIONS = { grep: "efmABCdD", sed: "efl" };
// The options that give the pattern or script themselves; with one of them no positional word is a pattern.
const PATTERN_OPTIONS = "ef";
const LONG_PATTERN = /^--(?:regexp|file|expression)(=|$)/;

const names = (path, source) =>
	typeof path === "string" && path !== "" && resolve(ROOT, path) === resolve(ROOT, source);

/** Whether a tool call asks a decision question: a push naming a question id, or a write of `questions.md`. */
function isQuestion(name, input) {
	if (name === "PushNotification") {
		return typeof input?.message === "string" && QUESTION_ID.test(input.message);
	}
	return (name === "Write" || name === "Edit") && names(input?.file_path, QUESTIONS);
}

/**
 * A shell command as its simple commands, each a list of words with quotes removed and output redirection targets
 * left out, so that a quoted `;` or `|` in a pattern does not split a command. It reads the shell of the commands a
 * session runs (D-016); it is no full parser.
 */
function simpleCommands(command) {
	const state = { commands: [[]], word: undefined, quote: "", target: false, heredoc: false };
	for (let index = 0; index < command.length; index += 1) {
		index = state.quote === "" ? plain(state, command, index) : quoted(state, command, index);
	}
	endWord(state);
	return state.commands.filter((words) => words.length > 0);
}

/** Ends the current word; the word right after `>` or `>>` is a target the command writes, so it is dropped. */
function endWord(state) {
	if (state.word === undefined) {
		return;
	}
	if (!state.target) {
		state.commands.at(-1).push(state.word);
	}
	state.word = undefined;
	state.target = false;
}

/** Reads one character outside quotes; returns the index of the last character it used. */
function plain(state, command, index) {
	const char = command[index];
	if (char === "'" || char === '"') {
		state.quote = char;
		state.word ??= "";
	} else if (char === "\\") {
		state.word = (state.word ?? "") + (command[index + 1] === "\n" ? "" : (command[index + 1] ?? ""));
		return index + 1;
	} else if (char === ">") {
		endWord(state);
		state.target = true;
	} else if (char === "\n" && state.heredoc) {
		// The lines after a `<<` are a command's input, not commands; the lexer stops, so it can only miss a search.
		return command.length;
	} else if (SEPARATORS.has(char)) {
		endWord(state);
		state.target = false;
		state.commands.push([]);
	} else if (char === "<") {
		state.heredoc ||= command[index + 1] === "<";
		endWord(state);
	} else if (/\s/.test(char)) {
		endWord(state);
	} else {
		state.word = (state.word ?? "") + char;
	}
	return index;
}

/** Reads one character inside quotes; in double quotes `\"` and `\\` are escapes. */
function quoted(state, command, index) {
	const char = command[index];
	const next = command[index + 1];
	if (char === state.quote) {
		state.quote = "";
		return index;
	}
	if (char === "\\" && state.quote === '"' && (next === '"' || next === "\\")) {
		state.word += next;
		return index + 1;
	}
	state.word += char;
	return index;
}

/** Whether sed only prints: a flag group with `n`, none with `i` and no `--in-place`, since those write the files. */
function sedPrints(words) {
	const flags = words.filter((word) => /^-[a-zA-Z]/.test(word));
	return (
		flags.some((flag) => flag.includes("n")) &&
		!flags.some((flag) => flag.includes("i")) &&
		!words.some((word) => word.startsWith("--in-place"))
	);
}

/** Whether a simple command searches files: grep or git grep, sed -n, cat. */
function isSearch(words) {
	const [program, first] = words;
	return (
		program === "grep" ||
		program === "cat" ||
		(program === "git" && first === "grep") ||
		(program === "sed" && sedPrints(words))
	);
}

/** What an option word does: whether the next word is its argument, and whether it gives the pattern or script. */
function option(word, letters) {
	const long = LONG_PATTERN.exec(word);
	if (long !== null) {
		return { next: long[1] === "", pattern: true };
	}
	if (word.startsWith("--")) {
		// Any long option without `=` may take the next word (`--include '*.mjs'`); reading it so can only miss a
		// search, never count one that did not happen.
		return { next: !word.includes("="), pattern: false };
	}
	for (let index = 1; index < word.length; index += 1) {
		if (letters.includes(word[index])) {
			// The rest of the group is the argument (`-C3`); only an option that ends the group takes the next word.
			return { next: index === word.length - 1, pattern: PATTERN_OPTIONS.includes(word[index]) };
		}
	}
	return { next: false, pattern: false };
}

/**
 * The words a search command reads as files: every word of `cat`; for grep and sed the words left after options,
 * their arguments and the pattern or script, which is the first positional word unless an option gave it.
 */
function fileWords(words) {
	const git = words[0] === "git";
	const args = words.slice(git ? 2 : 1);
	if (words[0] === "cat") {
		return args;
	}
	const letters = ARGUMENT_OPTIONS[git ? "grep" : words[0]];
	const files = [];
	let pattern = false;
	let options = true;
	for (let index = 0; index < args.length; index += 1) {
		const word = args[index];
		if (options && word === "--") {
			options = false;
		} else if (options && word.length > 1 && word.startsWith("-")) {
			const found = option(word, letters);
			pattern ||= found.pattern;
			index += found.next ? 1 : 0;
		} else if (pattern) {
			files.push(word);
		} else {
			pattern = true;
		}
	}
	return files;
}

/** Whether a shell command has a grep, sed -n or cat command that reads the source. */
function shellSearches(command, source) {
	return simpleCommands(command).some(
		(words) => isSearch(words) && fileWords(words).some((word) => names(word, source)),
	);
}

/** Whether a tool call read or searched the source. */
function searches({ name, input }, source) {
	if (name === "Read") {
		return names(input?.file_path, source);
	}
	if (name === "Grep") {
		return names(input?.path, source);
	}
	return name === "Bash" && typeof input?.command === "string" && shellSearches(input.command, source);
}

/** The JSON object on a transcript line, or undefined when the line is not a JSON object (an array is not). */
function entry(line) {
	try {
		const value = JSON.parse(line);
		return value !== null && typeof value === "object" && !Array.isArray(value) ? value : undefined;
	} catch (error) {
		if (error instanceof SyntaxError) {
			return undefined;
		}
		throw error;
	}
}

/**
 * The main session's completed tool calls in transcript order: the `tool_use` blocks of `assistant` entries outside
 * a sidechain whose `tool_result` is in and is not an error. Other entries (`api-request-blob` among them) repeat
 * blocks and are not the conversation. The last line, after the final newline, may still be being written and is
 * left out; any other line that is not blank and not a JSON object might have held a question, so it is a boundary
 * like one.
 */
function completedCalls(text) {
	const calls = new Map();
	const lines = text.split("\n").slice(0, -1);
	for (const [number, line] of lines.entries()) {
		const value = entry(line);
		if (value === undefined && line.trim() !== "") {
			calls.set(`line ${number}`, { boundary: true, ok: true });
		} else if (value !== undefined && value.isSidechain !== true && Array.isArray(value.message?.content)) {
			addBlocks(calls, value);
		}
	}
	return [...calls.values()].filter((call) => call.ok);
}

/** Adds an entry's new `tool_use` blocks to the calls and marks the calls its `tool_result` blocks complete. */
function addBlocks(calls, value) {
	for (const block of value.message.content) {
		if (value.type === "assistant" && block?.type === "tool_use" && !calls.has(block.id)) {
			calls.set(block.id, { name: block.name, input: block.input, ok: false });
		} else if (value.type === "user" && block?.type === "tool_result" && calls.has(block.tool_use_id)) {
			calls.get(block.tool_use_id).ok = block.is_error !== true;
		}
	}
}

/** The sources no completed call searched after the session's previous completed decision question. */
function missingSources(text) {
	const calls = completedCalls(text);
	const previous = calls.findLastIndex((call) => call.boundary === true || isQuestion(call.name, call.input));
	const since = calls.slice(previous + 1);
	return SOURCES.filter((source) => !since.some((call) => searches(call, source)));
}

/** The exit code for one hook input; a reason to block goes to stderr. */
function decide(raw) {
	let input;
	try {
		input = JSON.parse(raw);
	} catch (error) {
		if (error instanceof SyntaxError) {
			return block("cannot read the hook input: it is not JSON");
		}
		throw error;
	}
	// Without these fields every call would look like no question, so a changed input format would turn the guard off.
	if (typeof input?.tool_name !== "string" || typeof input.tool_input !== "object" || input.tool_input === null) {
		return block("cannot read the hook input: no tool_name and tool_input; the hook input format changed");
	}
	if (!isQuestion(input.tool_name, input.tool_input)) {
		return 0;
	}
	let text;
	try {
		text = readFileSync(input.transcript_path, "utf8");
	} catch (error) {
		// The code only: the message holds the path, a home path the session could copy into a tracked file.
		return block(`cannot read the transcript (transcript_path): ${error.code ?? error.name}`);
	}
	const missing = missingSources(text);
	if (missing.length === 0) {
		return 0;
	}
	return block(
		`a decision question needs a search of each source since the previous question (D-083); not searched: ${missing.join(", ")}. A search is a Read of the file, a Grep with the file as its path, or a Bash grep, sed -n or cat with the file as an argument.`,
	);
}

function block(reason) {
	process.stderr.write(`decision-guard: ${reason}\n`);
	return 2;
}

try {
	process.exitCode = decide(readFileSync(0, "utf8"));
} catch (error) {
	process.exitCode = block(`internal error: ${error instanceof Error ? error.message : String(error)}`);
}
