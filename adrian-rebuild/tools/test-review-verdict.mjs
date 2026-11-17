/* PL: Test parsera odpowiedzi recenzenta review-verdict.mjs (D-015, AU-126): spójne PASS i FAIL przechodzą; PASS przy
   kryterium not met albo unknown, PASS ze znaleziskiem blocking, FAIL bez znaleziska blocking, blocking bez proven,
   kryteria niezgodne z ticket.md i zła pierwsza linia są odrzucane. Stan: działa. */
// Usage: node --test adrian-rebuild/tools/test-review-verdict.mjs
import assert from "node:assert/strict";
import { test } from "node:test";
import { checkReply } from "./review-verdict.mjs";

const ticket =
	"# R-001 Cut\n## Acceptance\n- AC-1: `npm run check` → exit 0\n- AC-2 (judgment): docs match\n## Migration\n";
const reply = (verdict, criteria, findings) =>
	`${verdict}\n## Criteria\n${criteria.join("\n")}\n## Findings\n${findings.join("\n")}\n## Taste questions\nT-30: yes\n`;
const met = ["AC-1: met: npm run check → exit 0", "AC-2: met: docs/jobs.md:44 matches"];
const blocking = "blocking · proven · the board is stale · node bin/limen board → exit 1";

test("a consistent PASS passes", () => {
	assert.deepEqual(checkReply(reply("PASS", met, ["none"]), ticket), []);
});

test("a consistent FAIL passes", () => {
	const criteria = ["AC-1: not met: npm run check → exit 1", met[1]];
	assert.deepEqual(checkReply(reply("FAIL", criteria, [blocking]), ticket), []);
});

test("AU-126: PASS with a criterion not met is rejected", () => {
	const criteria = ["AC-1: not met: npm run check → exit 1", met[1]];
	assert.match(checkReply(reply("PASS", criteria, ["none"]), ticket).join("\n"), /PASS with 1 criteria not met/);
});

test("AU-126: PASS with an unknown criterion is rejected", () => {
	const criteria = [met[0], "AC-2: unknown: no docs change in the diff"];
	assert.match(checkReply(reply("PASS", criteria, ["none"]), ticket).join("\n"), /PASS with 1 criteria/);
});

test("AU-126: PASS with a blocking finding is rejected", () => {
	assert.match(checkReply(reply("PASS", met, [blocking]), ticket).join("\n"), /1 blocking findings/);
});

test("AU-126: FAIL without a blocking finding is rejected", () => {
	const note = "note · observed · naming could be shorter · src/x.ts:3";
	assert.match(checkReply(reply("FAIL", met, [note]), ticket).join("\n"), /FAIL without a blocking finding/);
});

test("a blocking finding that is not proven is rejected", () => {
	const guessed = "blocking · guessed · a race on the lock · src/lock.ts:10";
	assert.match(checkReply(reply("FAIL", met, [guessed]), ticket).join("\n"), /not proven/);
});

test("criteria that differ from the ticket's are rejected", () => {
	assert.match(checkReply(reply("PASS", [met[0]], ["none"]), ticket).join("\n"), /ticket\.md has AC-1, AC-2/);
});

test("a first line other than PASS or FAIL is rejected", () => {
	assert.match(checkReply(reply("LGTM", met, ["none"]), ticket).join("\n"), /not PASS or FAIL/);
});
