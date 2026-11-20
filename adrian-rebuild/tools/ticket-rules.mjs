/* PL: Reguły wierszy `## Tickets` zależne od plików ticket.md (Node, bez zależności), wydzielone z check.mjs, żeby
   dało się je testować na napisach (D-054). Status `ready` wymaga ticket.md albo, gdy zależności nie są `done`,
   wpisu decyzji wskazanego w statusie; ticket pair może mieć `Run` = `night` dopiero z datowanym wpisem w swoim
   `## Decisions`; polecenia kryteriów ticketów `ready` i `active` są dopasowywane do allow-listy Claude Code.
   Stan: działa; test w tools/test-ticket-rules.mjs. */

const PLAN = "adrian-rebuild/plan.md";

// `blocked`: a night run's question waits in `.night/questions.md`; `ready (D-NNN)` names the decisions a ticket whose
// dependencies are not done relies on, so code and not prose links them (D-054 (1)).
export const STATUS = /^(planned|ready( \(D-\d{3}(, D-\d{3})*\))?|active|blocked|done|dropped \(.+\))$/;
const DATED_ENTRY = /^- \d{4}-\d{2}-\d{2} /m;
// The night logs show that a `|` inside single quotes does not split a command, so the split follows the shell's quotes.
const OPERATORS = ["&&", "||", ";", "|", "&", "\n"];
const EXPANSION = "holds a variable or command expansion ($ or `) outside single quotes";

/** The body of the level-2 section `## <name>`, up to the next level-2 heading. */
export function section(text, name) {
	// A `## ` line inside a fenced code block (the ticket.md template, a reply format) is not a heading.
	const lines = text.split("\n");
	let fenced = false;
	let inside = false;
	const body = [];
	for (const line of lines) {
		if (line.startsWith("```")) {
			fenced = !fenced;
		}
		const heading = !fenced && line.startsWith("## ");
		if (heading) {
			inside = line === `## ${name}`;
		} else if (inside) {
			body.push(line);
		}
	}
	return body.length === 0 ? "" : `${body.join("\n")}\n`;
}

/** The tickets a ticket depends on, directly or through others (the ticket itself is included only on a cycle). */
function dependencyClosure(ticket, byId) {
	const closure = new Set();
	const queue = [ticket];
	while (queue.length > 0) {
		for (const id of queue.pop().Depends.split(", ")) {
			const target = byId.get(id);
			if (target !== undefined && !closure.has(target)) {
				closure.add(target);
				queue.push(target);
			}
		}
	}
	return closure;
}

/** D-054 (3): Adrian's answers to a pair ticket's variants sheet are dated entries of its `ticket.md` → `## Decisions`. */
function choicesRecorded(ticket, files) {
	return DATED_ENTRY.test(section(files.get(ticket.ID)?.text ?? "", "Decisions"));
}

/**
 * D-011: no delegated ticket depends on a pair ticket of its stage; `Run` follows from the mode and the dependencies,
 * except that a pair ticket whose `ticket.md` records its choices may run at night (D-054 (3)), and then counts as a
 * night ticket of its stage for the tickets after it.
 */
export function checkRuns(tickets, files) {
	const errors = [];
	const byId = new Map(tickets.map((ticket) => [ticket.ID, ticket]));
	for (const ticket of tickets) {
		const closure = dependencyClosure(ticket, byId);
		if (closure.has(ticket)) {
			errors.push(`${PLAN}: ${ticket.ID}: lies on a cycle of dependencies`);
		}
		const sameStage = [...closure].filter(({ Stage }) => Stage === ticket.Stage);
		const pairs = sameStage.filter(({ Mode }) => Mode === "pair").map(({ ID }) => ID);
		if (ticket.Mode === "delegated" && pairs.length > 0) {
			errors.push(
				`${PLAN}: ${ticket.ID}: delegated, but depends on the pair ticket(s) ${pairs.join(", ")} of its stage`,
			);
		}
		const night = (other) => other.Mode === "delegated" || (other.Run === "night" && choicesRecorded(other, files));
		const run = ticket.Mode === "delegated" ? "night" : sameStage.some(night) ? "day-after" : "day";
		if (ticket.Mode === "pair" && ticket.Run === "night") {
			if (!choicesRecorded(ticket, files)) {
				errors.push(
					`${PLAN}: ${ticket.ID}: Run is "night", but its ticket.md records no choices in ## Decisions (D-054 (3))`,
				);
			}
		} else if (ticket.Run !== run) {
			errors.push(`${PLAN}: ${ticket.ID}: Run is "${ticket.Run}", but its mode and dependencies make it "${run}"`);
		}
	}
	return errors;
}

/** The criteria of `## Acceptance`; a command is a backticked span followed by `→ exit` (D-025). */
export function criteria(ticketText) {
	const found = [];
	let current;
	for (const line of section(ticketText, "Acceptance").split("\n")) {
		// A line without the template's colon still opens a criterion, so its command cannot escape the checks.
		const start = line.match(/^- (AC-\d+)\b(.*)$/);
		if (start) {
			current = { id: start[1], judgment: /^\s*\(judgment\)/.test(start[2]), text: start[2] };
			found.push(current);
		} else if (current && /^\s+\S/.test(line)) {
			current.text += ` ${line.trim()}`;
		} else {
			current = undefined;
		}
	}
	return found.map(({ id, judgment, text }) => ({
		id,
		judgment,
		commands: [...text.matchAll(/`([^`]+)` → exit\b/g)].map(([, command]) => command),
	}));
}

/** A rule's `*` matches any text; a trailing ` *` also matches the bare command, as the night logs show. */
function ruleRegex(pattern) {
	const bareToo = pattern.endsWith(" *");
	const body = bareToo ? pattern.slice(0, -2) : pattern;
	const source = body
		.split("*")
		.map((piece) => piece.replace(/[.+?^${}()|[\]\\]/g, "\\$&"))
		.join(".*");
	return new RegExp(`^${source}${bareToo ? "( .*)?" : ""}$`);
}

/**
 * The `Bash` rules of a Claude Code settings file; a bare `Bash` stands for `Bash(*)`. A night run is in `dontAsk`
 * mode, which refuses what an `ask` rule would ask, so an `ask` rule refuses as a deny rule does.
 */
export function loadPermissions(json) {
	const permissions = JSON.parse(json).permissions ?? {};
	const bash = (name) => {
		const rules = permissions[name] ?? [];
		if (!Array.isArray(rules)) {
			throw new Error(`permissions.${name} must be an array`);
		}
		return rules
			.map((rule) => (typeof rule === "string" ? rule.match(/^Bash(?:\((.*)\))?$/) : null))
			.filter((match) => match !== null)
			.map(([rule, pattern = "*"]) => ({ rule: `${name} rule ${rule}`, regex: ruleRegex(pattern) }));
	};
	return { allow: bash("allow"), deny: [...bash("deny"), ...bash("ask")] };
}

/** The index just after the quote that closes the one at `index`, or -1; a backslash escapes only in double quotes. */
function closingQuote(command, index) {
	const quote = command[index];
	for (let at = index + 1; at < command.length; at += 1) {
		if (quote === '"' && command[at] === "\\") {
			at += 1;
		} else if (command[at] === quote) {
			return at + 1;
		}
	}
	return -1;
}

/** The token at `index`: where it ends, whether it is an operator, or why the command is refused. */
function token(command, index) {
	const char = command[index];
	if (char === "'" || char === '"') {
		const next = closingQuote(command, index);
		if (next < 0) {
			return { reason: "has an unbalanced quote" };
		}
		return char === '"' && /[$`]/.test(command.slice(index, next)) ? { reason: EXPANSION } : { next };
	}
	if (char === "$" || char === "`") {
		return { reason: EXPANSION };
	}
	if (char === ">" || char === "<") {
		return { reason: "holds a redirection (> or <); a tool writes its file with --out <file> (D-016)" };
	}
	if (char === "\\") {
		return { next: index + 2 };
	}
	const operator = OPERATORS.find((candidate) => command.startsWith(candidate, index));
	return operator ? { next: index + operator.length, operator } : { next: index + 1 };
}

/** The parts of a compound command, or the reason it is refused before any rule is read. */
function splitCommand(command) {
	const parts = [""];
	for (let index = 0; index < command.length; ) {
		const { next, operator, reason } = token(command, index);
		if (reason) {
			return { reason };
		}
		if (operator) {
			parts.push("");
		} else {
			parts[parts.length - 1] += command.slice(index, next);
		}
		index = next;
	}
	return { parts: parts.map((part) => part.trim()) };
}

/** Why Claude Code's permissions refuse the command, or `undefined` when every part matches an allow rule. */
export function refusal(command, { allow, deny }) {
	const { parts, reason } = splitCommand(command);
	if (reason) {
		return `\`${command}\` ${reason}`;
	}
	for (const part of parts) {
		const denied = deny.find(({ regex }) => regex.test(part));
		if (denied) {
			return `\`${part}\` matches the ${denied.rule}`;
		}
		if (!allow.some(({ regex }) => regex.test(part))) {
			return `\`${part}\` matches no allow rule of .claude/settings.local.json`;
		}
	}
	return undefined;
}

/** The entry `- YYYY-MM-DD D-NNN …` of `## Decisions` with its indented lines, or `undefined`. */
function decisionEntry(decisions, id) {
	const lines = decisions.split("\n");
	const start = lines.findIndex((line) => new RegExp(`^- \\d{4}-\\d{2}-\\d{2} ${id}\\b`).test(line));
	if (start < 0) {
		return undefined;
	}
	const end = lines.findIndex((line, index) => index > start && !/^\s+\S/.test(line));
	return lines.slice(start, end < 0 ? undefined : end).join("\n");
}

/** D-054 (1): a ready ticket has its `ticket.md`, or, while a dependency is not done, a decision entry it names. */
function readyRecordErrors(ticket, file, done, decisions) {
	const named = [...ticket.Status.matchAll(/D-\d{3}/g)].map(([id]) => id);
	const errors = [];
	for (const id of named) {
		const entry = decisionEntry(decisions, id);
		if (entry === undefined) {
			errors.push(`${PLAN}: ${ticket.ID}: ${id} is no entry of ## Decisions`);
		} else if (!new RegExp(`\\b${ticket.ID}\\b`).test(entry)) {
			errors.push(`${PLAN}: ${ticket.ID}: ${id} does not name ${ticket.ID}`);
		}
	}
	const dependencies = ticket.Depends === "—" ? [] : ticket.Depends.split(", ");
	if (file !== undefined) {
		return errors;
	}
	if (dependencies.every((id) => done.has(id))) {
		errors.push(`${PLAN}: ${ticket.ID}: ready with its dependencies done, but it has no ticket.md (D-054 (1))`);
	} else if (named.length === 0) {
		errors.push(
			`${PLAN}: ${ticket.ID}: ready with no ticket.md and no decision entry named as ready (D-NNN) (D-054 (1))`,
		);
	}
	return errors;
}

/** D-025, D-036: every criterion that is no judgment names a command with its exit code, which the allow-list passes. */
function criterionErrors({ path, text }, permissions) {
	const errors = [];
	for (const { id, judgment, commands } of criteria(text)) {
		if (!judgment && commands.length === 0) {
			errors.push(`${path}: ${id}: no command with its exit code (\`<command>\` → exit N, D-025)`);
		}
		for (const command of permissions === undefined ? [] : commands) {
			const reason = refusal(command, permissions);
			if (reason !== undefined) {
				errors.push(`${path}: ${id}: ${reason} (D-036)`);
			}
		}
	}
	return errors;
}

/**
 * D-054 (1): the record a ready ticket needs, and the criteria of every ready or active ticket. Other statuses are not
 * checked, so a blocked ticket keeps the criterion that blocked it. `permissions` is absent without a settings file.
 */
export function checkReady(tickets, { files, decisions, permissions }) {
	const done = new Set(tickets.filter(({ Status }) => Status === "done").map(({ ID }) => ID));
	const errors = [];
	for (const ticket of tickets) {
		const file = files.get(ticket.ID);
		if (ticket.Status.startsWith("ready")) {
			errors.push(...readyRecordErrors(ticket, file, done, decisions));
		}
		if (file !== undefined && /^(ready|active)\b/.test(ticket.Status)) {
			errors.push(...criterionErrors(file, permissions));
		}
	}
	return errors;
}
