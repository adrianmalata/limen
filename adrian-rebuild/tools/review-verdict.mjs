/* PL: Parser odpowiedzi recenzenta z etapu 5 (D-015, AU-126): sprawdza kształt odpowiedzi rebuild-reviewer (werdykt
   w pierwszej linii, sekcje Criteria, Findings i Taste questions, format linii znalezisk z T-08) i jej spójność: PASS
   tylko przy wszystkich kryteriach met i bez znaleziska blocking, FAIL tylko z co najmniej jednym blocking, blocking
   zawsze proven, kryteria w kolejności AC-N z ticket.md. Kod 1 oznacza odpowiedź odrzuconą; sesja główna ponawia
   recenzję. Stan: działa; test w tools/test-review-verdict.mjs. */
// Usage: node adrian-rebuild/tools/review-verdict.mjs <reply file> <ticket.md>
import { readFileSync } from "node:fs";
import { criteria } from "./ticket-rules.mjs";

const SECTIONS = ["Criteria", "Findings", "Taste questions"];
const CRITERION = /^(AC-\d+): (met|not met|unknown): \S/;
const FINDING = /^(blocking|note) · (proven|observed|guessed) · \S.* · \S.*$/;

/** The criterion IDs of a ticket, in the order of its `## Acceptance`. */
export function acceptanceIds(ticket) {
	return criteria(ticket).map(({ id }) => id);
}

/** The lines of each `## <name>` section of the reply. */
function sections(reply) {
	const found = new Map();
	for (const block of reply.split(/^## /m).slice(1)) {
		const name = block.slice(0, block.indexOf("\n")).trim();
		found.set(
			name,
			block
				.split("\n")
				.slice(1)
				.filter((line) => line.trim() !== ""),
		);
	}
	return found;
}

/** Errors of a reviewer reply; empty when its shape and its verdict are consistent. */
export function checkReply(reply, ticket) {
	const errors = [];
	const verdict = reply.split("\n")[0].trim();
	if (verdict !== "PASS" && verdict !== "FAIL") {
		errors.push(`line 1 is "${verdict}", not PASS or FAIL`);
	}
	const found = sections(reply);
	const names = [...found.keys()];
	if (names.join("|") !== SECTIONS.join("|")) {
		errors.push(`sections are ${names.join(", ") || "none"}; expected ${SECTIONS.join(", ")}, in this order`);
	}
	const criteria = (found.get("Criteria") ?? []).map((line) => line.match(CRITERION));
	criteria.forEach((match, index) => {
		if (!match) {
			errors.push(`criterion line ${index + 1} is not "<AC-N>: met | not met | unknown: <evidence>"`);
		}
	});
	const ids = criteria.filter(Boolean).map((match) => match[1]);
	const expected = acceptanceIds(ticket);
	if (ids.join(",") !== expected.join(",")) {
		errors.push(`criteria are ${ids.join(", ") || "none"}; ticket.md has ${expected.join(", ") || "none"}`);
	}
	const findingLines = found.get("Findings") ?? [];
	const findings = findingLines.length === 1 && findingLines[0].trim() === "none" ? [] : findingLines;
	const blocking = [];
	for (const line of findings) {
		const match = line.match(FINDING);
		if (!match) {
			errors.push(`finding "${line}" is not "blocking|note · proven|observed|guessed · <finding> · <evidence>"`);
		} else if (match[1] === "blocking") {
			blocking.push(line);
			if (match[2] !== "proven") {
				errors.push(`blocking finding is ${match[2]}, not proven: "${line}"`);
			}
		}
	}
	const unmet = criteria.filter((match) => match && match[2] !== "met").map((match) => match[1]);
	if (verdict === "PASS" && (unmet.length > 0 || blocking.length > 0)) {
		errors.push(`PASS with ${unmet.length} criteria not met or unknown and ${blocking.length} blocking findings`);
	}
	if (verdict === "FAIL" && blocking.length === 0) {
		errors.push("FAIL without a blocking finding");
	}
	return errors;
}

if (import.meta.main) {
	const [replyFile, ticketFile] = process.argv.slice(2);
	if (!replyFile || !ticketFile) {
		console.error("usage: review-verdict.mjs <reply file> <ticket.md>");
		process.exit(2);
	}
	const errors = checkReply(readFileSync(replyFile, "utf8"), readFileSync(ticketFile, "utf8"));
	for (const error of errors) {
		console.error(`review-verdict: ${error}`);
	}
	console.log(errors.length === 0 ? "review-verdict: consistent" : "review-verdict: rejected; run the review again");
	process.exitCode = errors.length === 0 ? 0 : 1;
}
