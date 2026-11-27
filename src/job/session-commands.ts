// The simple commands of one recorded shell call, by which `limen stats` finds the coordinator's lands in its bash
// calls (src/job/statistics.ts). Limen reads the call's text; it never runs or replays it.

// A heredoc body is data, not commands: `<<'EOF'` up to the line that ends it, or to the end of an unfinished one.
// The rest of the opening line stays.
const HEREDOC = /<<-?[ \t]*(['"]?)([A-Za-z_]\w*)\1([^\n]*)\n[\s\S]*?(?:\n[ \t]*\2[ \t]*(?=\n|$)|$)/g;
// Leading assignments, `!` and wrappers that run the rest: `CI=1 timeout 60 npm test` runs `npm test`.
const PREFIX = /^(?:[A-Za-z_]\w*=(?:'[^']*'|"[^"]*"|[^\s'"])*\s+|!\s+|(?:time|nohup|env|command)\s+|timeout\s+\S+\s+)+/;

/**
 * The simple commands of one shell call, each without its leading assignments and wrappers, in order: `cd x && CI=1
 * limen land y` holds `cd x` and `limen land y`. `limen stats` finds the coordinator's lands in its bash calls with it.
 */
export function simpleCommands(command: string): string[] {
	return pieces(command)
		.map((words) => words.replace(PREFIX, ""))
		.filter(Boolean);
}

/** Splits a shell call at its unquoted separators into the words between them. Comments are dropped. */
function pieces(command: string): string[] {
	// A line end right after `&&` or a pipe continues the chain.
	const text = command
		.replace(HEREDOC, "$3")
		.replaceAll("\\\n", " ")
		.replace(/(&&|\|)[ \t]*\n/g, "$1 ")
		.trim();
	const found: string[] = [];
	let current = "";
	let quote = "";
	let escaped = false;
	for (let index = 0; index < text.length; index += 1) {
		// An unquoted `#` that starts a word begins a comment, which runs to the line end.
		if (!(quote || escaped) && text.charAt(index) === "#" && /^$|[\s;&|()]/.test(text.charAt(index - 1))) {
			const end = text.indexOf("\n", index);
			index = (end === -1 ? text.length : end) - 1;
			continue;
		}
		const next = quote || escaped ? "" : separator(text, index);
		if (next) {
			found.push(squash(current));
			current = "";
			index += next.length - 1;
			continue;
		}
		const char = text.charAt(index);
		current += char;
		if (escaped) {
			escaped = false;
		} else if (char === "\\" && quote !== "'") {
			escaped = true;
		} else if (char === quote) {
			quote = "";
		} else if (!quote && (char === "'" || char === '"')) {
			quote = char;
		}
	}
	found.push(squash(current));
	return found;
}

/** The separator at `index`: `&&`, `||`, `|&`, `;`, `&`, `|`, `(`, `)`, a backtick or a line end. `2>&1` redirects. */
function separator(text: string, index: number): string {
	const pair = text.slice(index, index + 2);
	if (pair === "&&" || pair === "||" || pair === "|&") {
		return pair;
	}
	const char = text.charAt(index);
	const redirect = /[<>]/.test(text.charAt(index - 1)) || (char === "&" && text.charAt(index + 1) === ">");
	return !redirect && ";&|()`\n".includes(char) ? char : "";
}

const squash = (text: string): string => text.replace(/\s+/g, " ").trim();
