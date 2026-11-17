/* PL: Walidator plików przebudowy (Node, bez zależności). Sprawdza, że każda referencja `plik:linia` w audit.md
   i taste.md istnieje przy tagu rebuild-base, że każde znalezisko A-NNN ma wymagane pola z dozwolonymi wartościami
   (od bramki 2 także decyzję Adriana), że decyzja „fix (via X)” wskazuje znalezisko z decyzją fix albo pozycję
   sekcji Gate 2: decisions, że każda reguła T-NN w taste.md ma pola Rule, Why, Check i Source, oraz (T-17), że
   taste.md i plan.md nie mają słów-zapchajdziur ani pustego pola „Revisit when:”. W etapie 4 dojdzie sprawdzenie
   planu, a w etapie 6 struktury folderów ticketów i streszczeń PL. Stan: działa; kończy się kodem 1 i listą błędów,
   gdy coś się nie zgadza. */
// Usage: node adrian-rebuild/tools/check.mjs   (run from the repository root)
import { spawnSync } from "node:child_process";
import { readFileSync } from "node:fs";

const BASE = "rebuild-base";
const AUDIT = "adrian-rebuild/audit.md";
const TASTE = "adrian-rebuild/taste.md";
const PLAN = "adrian-rebuild/plan.md";
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

const errors = [];
const lineCache = new Map();

/** Number of lines of `path` at the base tag, or undefined when the file does not exist there. */
function linesAtBase(path) {
	if (!lineCache.has(path)) {
		const result = spawnSync("git", ["cat-file", "blob", `${BASE}:${path}`], { maxBuffer: 1 << 28 });
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
	const gate = text.match(/^## Gate 2: decisions\n([\s\S]*?)^## /m)?.[1] ?? "";
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

function checkAudit() {
	const text = readFileSync(AUDIT, "utf8");
	const references = checkReferences(text, AUDIT);
	const list = findings(text);
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

/** Every taste rule `### T-NN` has the fields Rule, Why, Check and Source; IDs are unique (stage 3 rubric). */
function checkTasteRules() {
	const text = readFileSync(TASTE, "utf8");
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
	return rules.length;
}

const summary = [
	checkAudit(),
	`taste rules: ${checkTasteRules()}`,
	`taste: ${checkReferences(readFileSync(TASTE, "utf8"), TASTE)} references, ${checkWording(TASTE)} revisit signals`,
	`plan: ${checkWording(PLAN)} revisit signals`,
];
for (const error of errors) {
	console.error(error);
}
console.log(`${summary.join("; ")}; ${errors.length} errors`);
process.exitCode = errors.length === 0 ? 0 : 1;
