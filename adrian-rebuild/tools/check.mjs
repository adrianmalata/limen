/* PL: Walidator plików przebudowy (Node, bez zależności). Dziś sprawdza audit.md: że każda referencja `plik:linia`
   istnieje przy tagu rebuild-base oraz że każde znalezisko A-NNN ma wymagane pola z dozwolonymi wartościami.
   W etapie 4 dojdzie sprawdzenie planu, a w etapie 6 struktury folderów ticketów i streszczeń PL.
   Stan: działa dla audytu; kończy się kodem 1 i listą błędów, gdy coś się nie zgadza. */
// Usage: node adrian-rebuild/tools/check.mjs   (run from the repository root)
import { spawnSync } from "node:child_process";
import { readFileSync } from "node:fs";

const BASE = "rebuild-base";
const AUDIT = "adrian-rebuild/audit.md";

const FIELDS = {
	Area: /^(reliability|determinism|autonomy|cost|cross-cutting)$/,
	Severity: /^(critical|high|medium|low)$/,
	Location: /`[^`]+:\d+(-\d+)?`/,
	Evidence: /\S/,
	Rule: /^(z\. \d+(, z\. \d+)*|none)$/,
	Verdict: /^(compliant|partial|non-compliant|n\/a)$/,
	Direction: /\S/,
};
// Fields added by later passes; checked only when present.
const OPTIONAL = {
	Status: /^(new|known \(.+\))$/,
	Decision: /^(fix|accepted-risk \(.+\)|rejected \(.+\))$/,
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
			const fields = new Map();
			for (const match of block.matchAll(/^- (\w+): (.*)$/gm)) {
				fields.set(match[1], match[2].trim());
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
	return `audit: ${list.length} findings, ${references} references`;
}

const summary = [checkAudit()];
for (const error of errors) {
	console.error(error);
}
console.log(`${summary.join("; ")}; ${errors.length} errors`);
process.exitCode = errors.length === 0 ? 0 : 1;
