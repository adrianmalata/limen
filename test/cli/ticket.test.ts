// `limen ticket`: check refuses a failing ticket through the final line, and new takes its number under the lock.
import assert from "node:assert/strict";
import { existsSync } from "node:fs";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import { dirname, join } from "node:path";
import { test } from "node:test";
import { lockPath, withLock } from "../../src/lock.ts";
import { outputText, readOutcome } from "../final-line.ts";
import { git, limen, type Plant, plant, TICKET } from "../plant.ts";

const BAD = TICKET.replace("F001-demo", "F002-bad");

/** Commits on the branch `bad` a ticket that touches no place of the map, and returns to `main`. */
async function badBranch(p: Plant): Promise<void> {
	git(p.root, "checkout", "-qb", "bad");
	await mkdir(join(p.root, dirname(BAD)), { recursive: true });
	const text = await readFile(join(p.root, TICKET), "utf8");
	await writeFile(join(p.root, BAD), text.replace("demo.place", "nope").replaceAll("F001", "F002"));
	git(p.root, "add", BAD);
	git(p.root, "commit", "-qm", "a ticket that touches no known place");
	git(p.root, "checkout", "-q", "main");
}

test("TICKET_CHECK_FAILED: ticket check of a branch with a failing ticket exits 1, lists it and names the check again in next", async (t) => {
	const p = await plant();
	t.after(() => p.cleanup());
	await badBranch(p);
	const run = limen(p, ["ticket", "check", "bad"]);
	assert.equal(run.status, 1, run.stdout);
	assert.deepEqual(readOutcome(run), {
		class: "refused",
		code: "TICKET_CHECK_FAILED",
		next: "limen ticket check bad",
	});
	assert.ok(
		outputText(run)
			.split("\n")
			.some((line) => line.startsWith(`error ${BAD}:3: `)),
		run.stderr,
	);
});

// D-045 (5.1): the fix is prose, so it leaves `next` for the stderr line after the refusal's own.
test("TICKET_CHECK_FAILED: ticket check of a failing ticket says on stderr to fix the tickets listed above", async (t) => {
	const p = await plant();
	t.after(() => p.cleanup());
	await badBranch(p);
	const run = limen(p, ["ticket", "check", "bad"]);
	assert.deepEqual(outputText(run).trimEnd().split("\n").slice(-2), [
		"ticket check: changed tickets on bad fail against main",
		"fix the tickets listed above",
	]);
});

// A-055: two `ticket new` runs at once took one number, since the number was read with no lock.
test("LOCK_TIMEOUT: ticket new exits 3 and writes no ticket while the ticket-number lock is held, then takes the next number", async (t) => {
	const p = await plant();
	t.after(() => p.cleanup());
	const numbers = { file: join(p.root, ".limen", "ticket-number") };
	const env = { LIMEN_LOCK_WAIT_MS: "100" };
	const title = "Two tickets never share a number";
	const folder = join(p.root, "spec/features/planned/F002-two-tickets-never-share-a-number");
	const held = await withLock(numbers, async () => limen(p, ["ticket", "new", title], { env }));
	assert.equal(held.status, 3, held.stderr);
	assert.deepEqual(readOutcome(held), { class: "transient", code: "LOCK_TIMEOUT", next: null });
	assert.ok(outputText(held).includes(lockPath(numbers)), held.stderr);
	assert.equal(existsSync(folder), false);
	const free = limen(p, ["ticket", "new", title], { env });
	assert.equal(free.status, 0, free.stderr);
	assert.deepEqual([readOutcome(free).ids, existsSync(folder)], [{ ticket: "F002" }, true]);
});
