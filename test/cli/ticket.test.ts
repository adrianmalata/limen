// `limen ticket check`: a branch whose changed ticket fails the land gate is refused through the final line.
import assert from "node:assert/strict";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import { dirname, join } from "node:path";
import { test } from "node:test";
import { outputText, readOutcome } from "../../src/outcome.ts";
import { git, limen, plant, TICKET } from "../plant.ts";

test("TICKET_CHECK_FAILED: ticket check of a branch with a failing ticket exits 1, lists it and names the fix in next", async (t) => {
	const p = await plant();
	t.after(() => p.cleanup());
	// The branch adds a ticket that touches no place of the map.
	const bad = TICKET.replace("F001-demo", "F002-bad");
	git(p.root, "checkout", "-qb", "bad");
	await mkdir(join(p.root, dirname(bad)), { recursive: true });
	const text = await readFile(join(p.root, TICKET), "utf8");
	await writeFile(join(p.root, bad), text.replace("demo.place", "nope").replaceAll("F001", "F002"));
	git(p.root, "add", bad);
	git(p.root, "commit", "-qm", "a ticket that touches no known place");
	git(p.root, "checkout", "-q", "main");
	const run = limen(p, ["ticket", "check", "bad"]);
	assert.equal(run.status, 1, run.stdout);
	assert.deepEqual(readOutcome(run), {
		class: "refused",
		code: "TICKET_CHECK_FAILED",
		next: "fix the tickets listed above, then run limen ticket check bad",
	});
	assert.ok(
		outputText(run)
			.split("\n")
			.some((line) => line.startsWith(`error ${bad}:3: `)),
		run.stderr,
	);
});
