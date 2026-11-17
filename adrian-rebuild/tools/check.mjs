/* PL: Walidator plików przebudowy (Node, bez zależności). Dziś sprawdza audit.md: że każda referencja `plik:linia`
   istnieje przy tagu rebuild-base, że każde znalezisko A-NNN ma wymagane pola z dozwolonymi wartościami (od bramki 2
   także decyzję Adriana) i że decyzja „fix (via X)” wskazuje istniejące znalezisko z decyzją fix albo pozycję z sekcji
   Gate 2: decisions. W etapie 4 dojdzie sprawdzenie planu, a w etapie 6 struktury folderów ticketów i streszczeń PL.
   Stan: działa dla audytu; kończy się kodem 1 i listą błędów, gdy coś się nie zgadza. */
// Usage: node adrian-rebuild/tools/check.mjs   (run from the repository root)
import { spawnSync } from "node:child_process";
import { readFileSync } from "node:fs";

const BASE = "rebuild-base";
const AUDIT = "adrian-rebuild/audit.md";

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

const summary = [checkAudit()];
for (const error of errors) {
	console.error(error);
}
console.log(`${summary.join("; ")}; ${errors.length} errors`);
process.exitCode = errors.length === 0 ? 0 : 1;
