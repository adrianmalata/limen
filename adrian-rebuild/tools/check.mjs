/* PL: Walidator plików przebudowy (Node, bez zależności). Sprawdza referencje `plik:linia` w audit.md, taste.md
   i plan.md przy tagu rebuild-base, pola znalezisk A-NNN (z decyzją Adriana) i reguł T-NN, słowa-zapchajdziury (T-17)
   oraz plan: etapy z tagami, tickety (źródła, zależności, rozmiar, tryb, kroki weryfikacji na seacie), pokrycie
   każdego znaleziska `fix` i każdej reguły T-NN ticketem, zgodność kopii §2 z audit.md, wywołanie skryptu wdrożenia
   w każdym etapie (D-008), brak przekierowań `>` w poleceniach narzędzi (D-018) i definicje pomiarów M-NN. Sprawdza też polskie streszczenia plików w adrian-rebuild/
   i .claude/agents/, a od etapu 5 foldery ticketów (szablon ticket.md, kryteria bez `!` przed poleceniem, D-025)
   i wpisy changes.md według D-009 (changes-entries.mjs); status ticketu może być też `blocked` z trybu nocnego.
   Reguły D-054 bierze z ticket-rules.mjs: status `ready` z ticket.md albo wpisem decyzji, `Run` = `night` ticketu
   pair z zapisanymi wyborami i polecenia kryteriów ticketów `ready` i `active` dopasowane do allow-listy
   `.claude/settings.local.json`, gdy ten plik istnieje, oraz istnienie plików, które testy tych kryteriów i ich
   pathspece `git grep` nazywają (D-105). Stan: działa; kończy się kodem 1 i listą błędów. */
// Usage: node adrian-rebuild/tools/check.mjs   (run from the repository root)
import { spawnSync } from "node:child_process";
import { existsSync, readdirSync, readFileSync } from "node:fs";
import { CHANGES, checkEntries, parseEntries } from "./changes-entries.mjs";
import { checkReady, checkRuns, loadPermissions, STATUS, section } from "./ticket-rules.mjs";

const BASE = "rebuild-base";
const DIR = "adrian-rebuild";
const AUDIT = `${DIR}/audit.md`;
const TASTE = `${DIR}/taste.md`;
const PLAN = `${DIR}/plan.md`;
const AGENTS = ".claude/agents";
// Untracked and Adrian's (D-016); absent in a fresh clone, where the criteria are checked without it.
const SETTINGS = ".claude/settings.local.json";
// T-17: the rebuild parks nothing; "not now" is `rejected` with a non-empty `Revisit when:`.
const FILLER = /\b(backlog|deferred|later|tbd)\b|do ustalenia/i;

const FIELDS = {
	// reliability and security together are priority 1 of the rebuild prompt.
	Area: /^(reliability|security|determinism|autonomy|cost|cross-cutting)$/,
	Severity: /^(critical|high|medium|low)$/,
	Location: /`[^`]+:\d+(-\d+)?`/,
	Evidence: /\S/,
	Rule: /^(z\. \d+(, z\. \d+)*|none)$/,
	Verdict: /^(compliant|partial|non-compliant|n\/a)$/,
	Direction: /\S/,
	// Adrian's gate-2 decision, then " — " and its final content; A-046 is split ("rejected / fix").
	Decision: /^(fix( \((via [^()]+|removal)\))?|rejected \([^()]+\)|accepted-risk \([^()]+\)|rejected \/ fix) — \S/,
};
// Fields added by later passes; checked only when present.
const OPTIONAL = {
	Status: /^(new|known \(.+\))$/,
	Final: /^(fixed \(R-\d{3}(, R-\d{3})*\)|accepted-risk \(.+\)|rejected \(.+\))$/,
};
// Plan tickets (stage 4): one row of `## Tickets` per ticket, columns in this order.
const COLUMNS = ["ID", "Title", "Stage", "Sources", "Depends", "Size", "Mode", "Run", "Mig.", "API", "Seat", "Status"];
const SOURCE = /^(A-\d{3}|T-\d{2}|G1\.\d+|G[2-4]|§\d|S1\+|H-\d{2}|E-\d+|D-\d{3})$/;
const ENGINE_APIS = new Set(["pi", "bridge", "herdr", "systemd"]);
// The template of `ticket.md` in plan.md → `## Agents`.
const TICKET_SECTIONS = [
	"Problem",
	"Change",
	"Out of scope",
	"Acceptance",
	"Migration",
	"Risk",
	"Rollback",
	"Decisions",
];

const errors = [];
const lineCache = new Map();

function git(args) {
	return spawnSync("git", args, { maxBuffer: 1 << 28 });
}

/** Number of lines of `path` at the base tag, or undefined when the file does not exist there. */
function linesAtBase(path) {
	if (!lineCache.has(path)) {
		const result = git(["cat-file", "blob", `${BASE}:${path}`]);
		const text = result.stdout.toString("utf8");
		const lines = result.status === 0 ? text.split("\n").length - (text.endsWith("\n") ? 1 : 0) : undefined;
		lineCache.set(path, lines);
	}
	return lineCache.get(path);
}

/** Every backticked `path:line` or `path:start-end` reference; a path has a slash or a file extension. */
function checkReferences(text, file) {
	const pattern = /`([\w./-]+\.[\w]+|[\w.-]+\/[\w./-]+):(\d+)(?:-(\d+))?`/g;
	let count = 0;
	for (const match of text.matchAll(pattern)) {
		const [reference, path, start, end] = match;
		const lines = linesAtBase(path);
		count += 1;
		if (lines === undefined) {
			errors.push(`${file}: ${reference}: ${path} does not exist at ${BASE}`);
		} else if (Number(end ?? start) > lines || Number(start) < 1 || (end && Number(end) < Number(start))) {
			errors.push(`${file}: ${reference}: ${path} has ${lines} lines at ${BASE}`);
		}
	}
	return count;
}

/** Splits audit.md into findings: a `### A-NNN <title>` heading followed by `- Field: value` lines. */
function findings(text) {
	const blocks = text.split(/^### /m).slice(1);
	return blocks
		.filter((block) => /^A-\d{3}\b/.test(block))
		.map((block) => {
			const id = block.slice(0, 5);
			// A field is `- Name: value`; indented lines below it continue its value (e.g. a bulleted Evidence).
			const fields = new Map();
			let current;
			for (const line of block.split("\n").slice(1)) {
				const match = line.match(/^- (\w+):[ \t]?(.*)$/);
				if (match) {
					current = match[1];
					fields.set(current, match[2].trim());
				} else if (current && /^\s+\S/.test(line)) {
					fields.set(current, `${fields.get(current)} ${line.trim()}`.trim());
				} else {
					current = undefined;
				}
			}
			return { id, fields };
		});
}

function checkFinding({ id, fields }) {
	for (const [name, pattern] of Object.entries(FIELDS)) {
		const value = fields.get(name);
		if (value === undefined) {
			errors.push(`${AUDIT}: ${id}: missing field ${name}`);
		} else if (!pattern.test(value)) {
			errors.push(`${AUDIT}: ${id}: ${name} has a value outside ${pattern}: ${value}`);
		}
	}
	for (const [name, pattern] of Object.entries(OPTIONAL)) {
		const value = fields.get(name);
		if (value !== undefined && !pattern.test(value)) {
			errors.push(`${AUDIT}: ${id}: ${name} has a value outside ${pattern}: ${value}`);
		}
	}
}

/** A `fix (via X)` decision names a finding whose own decision is a fix, or an item of `## Gate 2: decisions`. */
function checkVia(list, text) {
	const decided = new Map(list.map(({ id, fields }) => [id, fields.get("Decision") ?? ""]));
	const gate = section(text, "Gate 2: decisions");
	for (const [id, decision] of decided) {
		const via = decision.match(/^fix \(via ([^()]+)\)/)?.[1];
		if (via === undefined) {
			continue;
		}
		const known = /^A-\d{3}$/.test(via)
			? /^(fix|rejected \/ fix)\b/.test(decided.get(via) ?? "")
			: gate.includes(`| ${via} |`) || gate.includes(`**${via} `);
		if (!known) {
			errors.push(
				`${AUDIT}: ${id}: Decision names ${via}, which is no fixed finding and no item of ## Gate 2: decisions`,
			);
		}
	}
}

function checkAudit(text, list) {
	const references = checkReferences(text, AUDIT);
	const ids = list.map(({ id }) => id);
	for (const id of ids.filter((value, index) => ids.indexOf(value) !== index)) {
		errors.push(`${AUDIT}: ${id} appears more than once`);
	}
	for (const finding of list) {
		checkFinding(finding);
	}
	checkVia(list, text);
	const counts = Object.groupBy(list, ({ fields }) => (fields.get("Decision") ?? "none").split(/ [—(]/)[0]);
	const decisions = Object.entries(counts).map(([name, group]) => `${name} ${group.length}`);
	return `audit: ${list.length} findings (${decisions.join(", ")}), ${references} references`;
}

/** T-17: no filler words and no empty `Revisit when:` field in taste.md and plan.md. */
function checkWording(file) {
	const lines = readFileSync(file, "utf8").split("\n");
	let revisits = 0;
	lines.forEach((line, index) => {
		const filler = line.match(FILLER);
		if (filler) {
			errors.push(`${file}:${index + 1}: filler word "${filler[0]}" (T-17)`);
		}
		const revisit = line.match(/(?<!`)Revisit when:(.*)$/);
		if (revisit) {
			revisits += 1;
			if (!revisit[1].trim()) {
				errors.push(`${file}:${index + 1}: empty Revisit when: (T-17)`);
			}
		}
	});
	return revisits;
}

/** Every taste rule `### T-NN` has the fields Rule, Why, Check and Source; IDs are unique. Returns the IDs. */
function checkTasteRules(text) {
	const rules = text.split(/^### /m).filter((block) => /^T-\d{2}\b/.test(block));
	const ids = rules.map((block) => block.slice(0, 4));
	for (const id of ids.filter((value, index) => ids.indexOf(value) !== index)) {
		errors.push(`${TASTE}: ${id} appears more than once`);
	}
	for (const block of rules) {
		for (const field of ["Rule", "Why", "Check", "Source"]) {
			if (!new RegExp(`^- ${field}: \\S`, "m").test(block)) {
				errors.push(`${TASTE}: ${block.slice(0, 4)}: missing field ${field}`);
			}
		}
	}
	return ids;
}

/** `## Stages`: `### Stage N — <title> (aX.Y.Z)`, numbered 1, 2, … with unique tags. */
function planStages(text) {
	const stages = new Map();
	for (const [, number, tag] of section(text, "Stages").matchAll(/^### Stage (\d+) — .+ \((a\d+\.\d+\.\d+)\)$/gm)) {
		if ([...stages.values()].includes(tag)) {
			errors.push(`${PLAN}: tag ${tag} is used by two stages`);
		}
		stages.set(Number(number), tag);
	}
	[...stages.keys()].forEach((number, index) => {
		if (number !== index + 1) {
			errors.push(`${PLAN}: stage ${number} is out of order (expected ${index + 1})`);
		}
	});
	return stages;
}

/** `## Deployment` steps: `- **N.k** text`, continued by indented lines. */
function planSteps(text) {
	const steps = new Map();
	let current;
	for (const line of section(text, "Deployment").split("\n")) {
		const start = line.match(/^- \*\*([0-9B]+\.\d+)\*\* (.*)$/);
		if (start) {
			current = start[1];
			if (steps.has(current)) {
				errors.push(`${PLAN}: deployment step ${current} appears more than once`);
			}
			steps.set(current, start[2]);
		} else if (current && /^ {2}\S/.test(line)) {
			steps.set(current, `${steps.get(current)} ${line.trim()}`);
		} else {
			current = undefined;
		}
	}
	return steps;
}

/** The rows of `## Tickets` as objects keyed by `COLUMNS`. */
function planTickets(text) {
	return section(text, "Tickets")
		.split("\n")
		.filter((line) => /^\| R-/.test(line))
		.map((line) => {
			const cells = line.split(" | ").map((cell) => cell.replace(/^\| |\s*\|$/g, "").trim());
			if (cells.length !== COLUMNS.length) {
				errors.push(`${PLAN}: ticket row has ${cells.length} cells, expected ${COLUMNS.length}: ${line}`);
			}
			return Object.fromEntries(COLUMNS.map((name, index) => [name, cells[index] ?? ""]));
		});
}

/** Does the gate-2 or plan text define the source token? */
function sourceExists(token, context) {
	const { findingIds, tasteIds, auditText, planText } = context;
	if (token.startsWith("A-")) {
		return findingIds.has(token);
	}
	if (token.startsWith("T-")) {
		return tasteIds.has(token);
	}
	if (token.startsWith("E-")) {
		return section(planText, "Engine facts").includes(`| ${token} |`);
	}
	if (token.startsWith("D-")) {
		return section(planText, "Decisions").includes(` ${token} `);
	}
	if (token.startsWith("§")) {
		return auditText.includes(`### ${token} `);
	}
	return new RegExp(`(^|[^\\w.])${token.replace(/[.+]/g, "\\$&")}([^\\w.]|$)`).test(auditText);
}

function checkTicket(ticket, index, all, context) {
	const { stages, steps } = context;
	const where = `${PLAN}: ${ticket.ID}`;
	if (!/^R-\d{3}$/.test(ticket.ID) || all.findIndex(({ ID }) => ID === ticket.ID) !== index) {
		errors.push(`${where}: the ID is malformed or not unique`);
	}
	if (!stages.has(Number(ticket.Stage))) {
		errors.push(`${where}: stage ${ticket.Stage} is not in ## Stages`);
	}
	const sources = ticket.Sources.split(", ").filter(Boolean);
	if (sources.length === 0) {
		errors.push(`${where}: no source`);
	}
	for (const token of sources) {
		if (!SOURCE.test(token) || !sourceExists(token, context)) {
			errors.push(`${where}: source ${token} is malformed or defined nowhere`);
		}
	}
	for (const dependency of ticket.Depends === "—" ? [] : ticket.Depends.split(", ")) {
		const target = all.find(({ ID }) => ID === dependency);
		if (target === undefined || target === ticket || Number(target.Stage) > Number(ticket.Stage)) {
			errors.push(`${where}: dependency ${dependency} is not a ticket of this or an earlier stage`);
		}
	}
	const formats = {
		Size: /^(S|M|L)$/,
		Mode: /^(delegated|pair)$/,
		Run: /^(night|day|day-after)$/,
		"Mig.": /^(yes|—)$/,
		Status: STATUS,
	};
	for (const [column, pattern] of Object.entries(formats)) {
		if (!pattern.test(ticket[column])) {
			errors.push(`${where}: ${column} "${ticket[column]}" is outside ${pattern}`);
		}
	}
	checkSeatSteps(ticket, steps, where);
}

/** T-28 (5): behaviour that depends on Pi, the bridge, Herdr or systemd has a verification step on the seat. */
function checkSeatSteps(ticket, steps, where) {
	const apis = ticket.API === "—" ? [] : ticket.API.split(", ");
	const seat = ticket.Seat === "—" ? [] : ticket.Seat.split(", ");
	if (apis.some((api) => !ENGINE_APIS.has(api))) {
		errors.push(`${where}: API "${ticket.API}" names something other than ${[...ENGINE_APIS].join(", ")}`);
	}
	if (apis.length > 0 && seat.length === 0) {
		errors.push(`${where}: touches ${ticket.API} but names no step of ## Deployment`);
	}
	for (const step of seat) {
		if (!steps.has(step)) {
			errors.push(`${where}: deployment step ${step} does not exist`);
		} else if (!steps.get(step).includes(ticket.ID)) {
			errors.push(`${where}: deployment step ${step} does not name ${ticket.ID}`);
		}
	}
}

/** Every `fix` finding and every taste rule is a source of a ticket (taste rules may be listed as without one). */
function checkCoverage(tickets, list, tasteIds, ticketsText) {
	const sourced = new Set(tickets.flatMap(({ Sources }) => Sources.split(", ")));
	for (const { id, fields } of list) {
		if (/^(fix|rejected \/ fix)\b/.test(fields.get("Decision") ?? "") && !sourced.has(id)) {
			errors.push(`${PLAN}: finding ${id} is decided "fix" but no ticket names it`);
		}
	}
	const exempt = new Set([...ticketsText.matchAll(/^- (T-\d{2}): \S/gm)].map(([, id]) => id));
	for (const id of tasteIds) {
		if (!sourced.has(id) && !exempt.has(id)) {
			errors.push(`${PLAN}: taste rule ${id} is neither a ticket source nor listed as without a ticket`);
		}
		if (sourced.has(id) && exempt.has(id)) {
			errors.push(`${PLAN}: taste rule ${id} is a ticket source and also listed as without a ticket`);
		}
	}
}

/** D-003: the plan holds a verbatim copy of gate 2 §2 between its markers. */
function checkGateCopy(planText, auditText) {
	const copy = planText.match(/<!-- gate2-s2:begin -->\n([\s\S]*?)\n<!-- gate2-s2:end -->/)?.[1];
	const original = auditText.match(/^### §2 Cross-cutting decisions\n\n([\s\S]*?)\n+### §4 /m)?.[1];
	if (copy === undefined || original === undefined || copy.trim() !== original.trim()) {
		errors.push(`${PLAN}: the copy of gate 2 §2 differs from ${AUDIT} (or a marker is missing)`);
	}
}

/** D-008: every stage's part of `## Deployment` calls the deployment script with a SHA. */
function checkDeployCalls(planText, stages) {
	const parts = section(planText, "Deployment")
		.split(/^### After stage /m)
		.slice(1);
	for (const [number, tag] of stages) {
		const part = parts.find((block) => block.startsWith(`${number} (${tag})\n`));
		if (part === undefined) {
			errors.push(`${PLAN}: ## Deployment has no "### After stage ${number} (${tag})"`);
		} else if (!part.includes("`node /opt/limen/seat/deploy.ts <sha>`")) {
			errors.push(
				`${PLAN}: ## Deployment, stage ${number}: no call of \`node /opt/limen/seat/deploy.ts <sha>\` (D-008)`,
			);
		}
	}
}

/** D-018: no command of a tool in tools/ uses a redirection; the tools write files with `--out <file>`. */
function checkRedirections(planText) {
	const sources = [
		[`${PLAN} → ## Agents`, section(planText, "Agents")],
		[`${PLAN} → ## Commands`, section(planText, "Commands")],
		...readdirSync(AGENTS).map((name) => [`${AGENTS}/${name}`, readFileSync(`${AGENTS}/${name}`, "utf8")]),
	];
	let commands = 0;
	for (const [where, text] of sources) {
		const spans = text.replace(/^```[\s\S]*?^```/gm, "").matchAll(/`([^`]+)`/g);
		for (const [, span] of spans) {
			if (span.includes("adrian-rebuild/tools/")) {
				commands += 1;
				// A redirection starts a token (` > file`, ` 2>file`); a placeholder such as `<file>` ends one.
				if (/(^|\s)\d?>/.test(span)) {
					errors.push(`${where}: \`${span.replace(/\s+/g, " ")}\` uses a redirection; use --out <file> (D-018)`);
				}
			}
		}
	}
	return commands;
}

/** Every M-NN named in the plan is a row of `## Measurement`. */
function checkMeasurements(planText) {
	const defined = new Set([...section(planText, "Measurement").matchAll(/^\| (M-\d{2}) \|/gm)].map(([, id]) => id));
	for (const [id] of planText.matchAll(/\bM-\d{2}\b/g)) {
		if (!defined.has(id)) {
			errors.push(`${PLAN}: ${id} is not defined in ## Measurement`);
		}
	}
	return defined.size;
}

function checkPlan(planText, auditText, list, tasteIds, files) {
	const references = checkReferences(planText, PLAN);
	const stages = planStages(planText);
	const steps = planSteps(planText);
	const tickets = planTickets(planText);
	const context = {
		stages,
		steps,
		findingIds: new Set(list.map(({ id }) => id)),
		tasteIds: new Set(tasteIds),
		auditText,
		planText,
	};
	for (const [index, ticket] of tickets.entries()) {
		checkTicket(ticket, index, tickets, context);
	}
	for (const number of stages.keys()) {
		if (!tickets.some(({ Stage }) => Number(Stage) === number)) {
			errors.push(`${PLAN}: stage ${number} has no ticket`);
		}
	}
	errors.push(...checkRuns(tickets, files));
	const permissions = readPermissions();
	const decisions = section(planText, "Decisions");
	errors.push(...checkReady(tickets, { files, decisions, permissions, exists: existsSync }));
	const ready = tickets.filter(({ Status }) => Status.startsWith("ready")).length;
	checkCoverage(tickets, list, tasteIds, section(planText, "Tickets"));
	checkGateCopy(planText, auditText);
	checkDeployCalls(planText, stages);
	const toolCommands = checkRedirections(planText);
	const metrics = checkMeasurements(planText);
	const allowList = permissions === undefined ? `no ${SETTINGS}` : `criteria against ${SETTINGS}`;
	const summary = `plan: ${stages.size} stages, ${tickets.length} tickets (${ready} ready, ${allowList}), ${steps.size} deployment steps, ${toolCommands} tool commands, ${metrics}`;
	return { tickets, summary: `${summary} metrics, ${references} references, ${checkWording(PLAN)} revisit signals` };
}

/** The allow, deny and ask rules of Claude Code, when the settings file exists (D-054 (1)). */
function readPermissions() {
	if (!existsSync(SETTINGS)) {
		return undefined;
	}
	try {
		return loadPermissions(readFileSync(SETTINGS, "utf8"));
	} catch (error) {
		errors.push(`${SETTINGS}: ${error.message}`);
		return undefined;
	}
}

/** Rebuild prompt: every file in adrian-rebuild/ and .claude/agents/ opens with a Polish summary comment. */
function checkSummaries() {
	const listed = (args) =>
		git(["ls-files", "-z", ...args, "--", DIR, AGENTS])
			.stdout.toString("utf8")
			.split("\0");
	const files = [...new Set([...listed([]), ...listed(["--others", "--exclude-standard"])])].filter(
		(file) => file && existsSync(file) && !file.startsWith(`${DIR}/input/`),
	);
	for (const file of files) {
		if (file.endsWith(".json")) {
			errors.push(`${file}: a JSON file has no comment syntax for the PL summary`);
			continue;
		}
		const lines = readFileSync(file, "utf8").split("\n");
		// A shebang stays first; an agent definition opens with its YAML front matter, so its summary is a YAML comment.
		const skip = lines[0].startsWith("#!") || (file.startsWith(`${AGENTS}/`) && lines[0] === "---") ? 1 : 0;
		const opener =
			/\.md$/.test(file) && !file.startsWith(`${AGENTS}/`)
				? "<!-- PL: "
				: /\.[mc]?[jt]s$/.test(file)
					? "/* PL: "
					: "# PL: ";
		if (!lines[skip].startsWith(opener)) {
			errors.push(`${file}: does not open with the Polish summary "${opener.trim()} …"`);
		}
	}
	return files.length;
}

/** `ticket.md` has the title `# R-NNN …` and every section of the template, in order. */
function checkTicketFile(file, id) {
	if (!existsSync(file)) {
		return;
	}
	const text = readFileSync(file, "utf8");
	if (!new RegExp(`^# ${id} \\S`, "m").test(text)) {
		errors.push(`${file}: no title "# ${id} <title>"`);
	}
	const headings = [...text.matchAll(/^## (.+)$/gm)].map(([, name]) => name);
	const present = TICKET_SECTIONS.filter((name) => headings.includes(name));
	if (
		present.length !== TICKET_SECTIONS.length ||
		present.some((name, index) => headings.indexOf(name) < headings.indexOf(present[index - 1] ?? name))
	) {
		errors.push(`${file}: sections must be ${TICKET_SECTIONS.map((name) => `## ${name}`).join(", ")}, in this order`);
	}
	// D-025: a criterion states its expected result as an exit code, never as a negated command.
	for (const [, id] of text.matchAll(/^- (AC-\d+)[^:\n]*: `!/gm)) {
		errors.push(`${file}: ${id} starts its command with "!"; state the expected exit code instead (D-025)`);
	}
}

/** The ticket folders `adrian-rebuild/R-NNN-<slug>/`. */
function ticketFolders() {
	return readdirSync(DIR, { withFileTypes: true })
		.filter((entry) => entry.isDirectory() && /^R-\d{3}-/.test(entry.name))
		.map((entry) => entry.name);
}

/** Each ticket's `ticket.md` by its ID, for the rules of `ticket-rules.mjs`. */
function ticketFiles(folders) {
	const files = new Map();
	for (const folder of folders) {
		const path = `${DIR}/${folder}/ticket.md`;
		if (existsSync(path)) {
			files.set(folder.slice(0, 5), { path, text: readFileSync(path, "utf8") });
		}
	}
	return files;
}

/** Stage 5 on: every ticket folder has its files, and every done ticket has a folder. */
function checkTicketFolders(tickets, folders) {
	for (const folder of folders) {
		const ticket = tickets.find(({ ID }) => ID === folder.slice(0, 5));
		const needed = ticket?.Status === "done" ? ["ticket.md", "review.md", "outcome.md"] : ["ticket.md"];
		if (ticket === undefined) {
			errors.push(`${DIR}/${folder}: no ticket ${folder.slice(0, 5)} in ${PLAN}`);
		}
		for (const name of needed.filter((file) => !existsSync(`${DIR}/${folder}/${file}`))) {
			errors.push(`${DIR}/${folder}: missing ${name}`);
		}
		checkTicketFile(`${DIR}/${folder}/ticket.md`, folder.slice(0, 5));
	}
	for (const { ID } of tickets.filter(({ Status }) => Status === "done")) {
		if (!folders.some((folder) => folder.startsWith(`${ID}-`))) {
			errors.push(`${PLAN}: ${ID} is done but ${DIR}/${ID}-<slug>/ does not exist`);
		}
	}
	return folders.length;
}

/** Stage 5 on: the changes.md entries by D-009 (`changes-entries.mjs`). */
function checkChanges(tickets) {
	const head = git(["show", `HEAD:${CHANGES}`]);
	const folders = readdirSync(DIR).filter((name) => /^R-\d{3}-/.test(name));
	const text = readFileSync(CHANGES, "utf8");
	errors.push(
		...checkEntries({
			text,
			headText: head.status === 0 ? head.stdout.toString("utf8") : "",
			folders,
			done: new Set(tickets.filter(({ Status }) => Status === "done").map(({ ID }) => ID)),
		}),
	);
	return parseEntries(text).length;
}

const auditText = readFileSync(AUDIT, "utf8");
const tasteText = readFileSync(TASTE, "utf8");
const planText = readFileSync(PLAN, "utf8");
const findingList = findings(auditText);
const tasteIds = checkTasteRules(tasteText);
const folders = ticketFolders();
const plan = checkPlan(planText, auditText, findingList, tasteIds, ticketFiles(folders));
const summary = [
	checkAudit(auditText, findingList),
	`taste rules: ${tasteIds.length}`,
	`taste: ${checkReferences(tasteText, TASTE)} references, ${checkWording(TASTE)} revisit signals`,
	plan.summary,
	`PL summaries: ${checkSummaries()} files`,
	`ticket folders: ${checkTicketFolders(plan.tickets, folders)}`,
	`changes: ${checkChanges(plan.tickets)} entries`,
];
for (const error of errors) {
	console.error(error);
}
console.log(`${summary.join("; ")}; ${errors.length} errors`);
process.exitCode = errors.length === 0 ? 0 : 1;
