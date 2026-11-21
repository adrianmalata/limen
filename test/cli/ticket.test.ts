// `limen ticket`: check refuses a failing ticket through the final line, new takes its number under the lock, and done
// closes a ticket with its board in one commit or refuses before anything moves (T-38).
import assert from "node:assert/strict";
import { existsSync } from "node:fs";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import { dirname, join } from "node:path";
import { test } from "node:test";
import { lockPath, withLock } from "../../src/lock.ts";
import { outputText, readOutcome } from "../final-line.ts";
import { git, limen, type Plant, plant, TICKET } from "../plant.ts";
import { snapshot } from "../snapshot.ts";

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

/** The lines of the board section `heading`, without the heading itself, up to the next section. */
function section(board: string, heading: string): string[] {
	const lines = board.split("\n");
	const start = lines.indexOf(`## ${heading}`);
	const end = lines.findIndex((line, index) => index > start && line.startsWith("## "));
	return lines.slice(start + 1, end < 0 ? undefined : end).filter((line) => line.trim() !== "");
}

// Gate 2 §6: a close leaves the board true. NOW drops the ticket and PROVEN names it with its date and its month.
test("ticket done moves the ticket to its month with its landed date and commits it with a board whose NOW and PROVEN follow", async (t) => {
	const p = await plant();
	t.after(() => p.cleanup());
	const board = join(p.root, "spec/build.md");
	const run = limen(p, ["ticket", "done", "F001", "--on", "2026-11-21"]);
	assert.equal(run.status, 0, run.stderr);
	const done = "spec/features/done/2026-11/F001-demo/ticket.md";
	const text = await readFile(board, "utf8");
	assert.deepEqual(
		[section(text, "NOW").some((line) => line.includes("F001")), section(text, "PROVEN").slice(1)],
		[
			false,
			[
				"- `F001-demo` (🟢 PROVEN): The demo plant has one ticket; landed 2026-11-21",
				"- 2026-11: 1 landed. spec/features/done/2026-11/",
			],
		],
	);
	assert.match(await readFile(join(p.root, done), "utf8"), /^---\n[\s\S]*\nlanded: 2026-11-21\n---\n/);
	assert.deepEqual(
		[git(p.root, "log", "-1", "--format=%s"), git(p.root, "status", "--porcelain"), existsSync(join(p.root, TICKET))],
		["Close F001: landed 2026-11-21", "", false],
	);
});

// Before R-092 ticket done moved and committed the tickets it found before it refused the number with none (D-061).
test("NO_ACTIVE_TICKET: ticket done of an active ticket and a number with none exits 1 and moves nothing", async (t) => {
	const p = await plant();
	t.after(() => p.cleanup());
	const before = snapshot(p.root);
	const run = limen(p, ["ticket", "done", "F001", "F999"]);
	assert.deepEqual(
		[run.status, readOutcome(run), snapshot(p.root)],
		[1, { class: "refused", code: "NO_ACTIVE_TICKET", next: null }, before],
		run.stderr,
	);
	assert.match(outputText(run), /no active ticket for F999/);
});

test("TICKETS_UNCOMMITTED: ticket done of a ticket whose folder has uncommitted changes exits 1 and moves nothing", async (t) => {
	const p = await plant();
	t.after(() => p.cleanup());
	await writeFile(join(p.root, dirname(TICKET), "notes.md"), "a note in progress\n");
	const before = snapshot(p.root);
	const run = limen(p, ["ticket", "done", "F001"]);
	assert.deepEqual(
		[run.status, readOutcome(run), snapshot(p.root)],
		[1, { class: "refused", code: "TICKETS_UNCOMMITTED", next: "limen ticket done F001" }, before],
		run.stderr,
	);
});

test("BAD_DATE: ticket done with --on not in the form YYYY-MM-DD exits 2 and moves nothing", async (t) => {
	const p = await plant();
	t.after(() => p.cleanup());
	const before = snapshot(p.root);
	const run = limen(p, ["ticket", "done", "F001", "--on", "21.11.2026"]);
	assert.deepEqual(
		[run.status, readOutcome(run), snapshot(p.root)],
		[2, { class: "usage", code: "BAD_DATE", next: null }, before],
		run.stderr,
	);
});
