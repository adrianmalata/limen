// `limen ticket`: check refuses a failing ticket through the final line, new takes its number under the lock, and done
// closes a ticket with its board in one commit, marks its landed jobs and closes their Herdr tabs, or refuses before
// anything moves (T-38), and run again goes on with the markers an earlier close owes.
import assert from "node:assert/strict";
import { existsSync } from "node:fs";
import { appendFile, mkdir, readFile, writeFile } from "node:fs/promises";
import { dirname, join } from "node:path";
import { test } from "node:test";
import { dayOnlyTime } from "../../src/job/landing.ts";
import { lockPath, withLock } from "../../src/lock.ts";
import { outputText, readOutcome } from "../final-line.ts";
import {
	git,
	herdrFake,
	installHook,
	jobDir,
	jobRecord,
	limen,
	type Plant,
	plant,
	recordTab,
	spawnJob,
	TICKET,
	waitJob,
} from "../plant.ts";
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

// R-103: land's strict ticket check refuses with this code too, so its tests compare the shared snapshot (T-38 (4)).
test("TICKET_CHECK_FAILED: ticket check of a branch with a failing ticket exits 1, lists it, names the check again in next and leaves the snapshot identical", async (t) => {
	const p = await plant();
	t.after(() => p.cleanup());
	await badBranch(p);
	const before = snapshot(p.root);
	const run = limen(p, ["ticket", "check", "bad"]);
	assert.equal(run.status, 1, run.stdout);
	assert.deepEqual(
		[readOutcome(run), snapshot(p.root)],
		[{ class: "refused", code: "TICKET_CHECK_FAILED", next: "limen ticket check bad" }, before],
	);
	assert.ok(
		outputText(run)
			.split("\n")
			.some((line) => line.startsWith(`error ${BAD}:3: `)),
		run.stderr,
	);
});

// D-045 (5.1): the fix is prose, so it leaves `next` for the stderr line after the refusal's own.
test("TICKET_CHECK_FAILED: ticket check of a failing ticket says on stderr to fix the tickets listed above, and leaves the snapshot identical", async (t) => {
	const p = await plant();
	t.after(() => p.cleanup());
	await badBranch(p);
	const before = snapshot(p.root);
	const run = limen(p, ["ticket", "check", "bad"]);
	assert.deepEqual(
		[outputText(run).trimEnd().split("\n").slice(-2), snapshot(p.root)],
		[["ticket check: changed tickets on bad fail against main", "fix the tickets listed above"], before],
	);
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
test("limen ticket done: moves the ticket to its month with its landed date and commits it with a board whose NOW and PROVEN follow", async (t) => {
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

/** A done job of the plant whose label names its ticket F001, with one commit on its branch. */
function ticketJob(p: Plant): string {
	const id = spawnJob(p, "commit", ["--label", "F001 demo work"]);
	assert.equal(waitJob(p, id), "done");
	return id;
}

// A-002: before R-031 ticket done touched no job record, so a job whose ticket it closed never got a `landed` marker.
test("ticket done writes landed with its closing commit and its date on a finished job of the ticket that holds no unlanded work", async (t) => {
	const p = await plant();
	t.after(() => p.cleanup());
	const id = ticketJob(p);
	git(p.root, "merge", "-q", "--no-edit", jobRecord(p, id)?.branch ?? "");
	const run = limen(p, ["ticket", "done", "F001", "--on", "2026-11-21"]);
	assert.equal(run.status, 0, run.stderr);
	assert.deepEqual(jobRecord(p, id)?.landed, { sha: git(p.root, "rev-parse", "HEAD"), at: "2026-11-21T00:00:00.000Z" });
});

// A-001: a marker never hides work, so a job of the ticket whose commit is not on HEAD stays unmarked, and the close says so.
test("ticket done leaves a job of the ticket that holds unlanded work without a marker, and names it", async (t) => {
	const p = await plant();
	t.after(() => p.cleanup());
	const id = ticketJob(p);
	const run = limen(p, ["ticket", "done", "F001"]);
	assert.equal(run.status, 0, run.stderr);
	assert.deepEqual(
		[jobRecord(p, id)?.landed, outputText(run).split("\n").slice(1, 2)],
		[undefined, [`job ${id} stays without a landed marker: it holds unlanded work (limen status)`]],
	);
});

// R-031, open point 2, R-103: ticket done wrote its markers after its commit, outside its operation, so a marker write
// that failed left the job unmarked, and a run again refused NO_ACTIVE_TICKET.
test("ticket done run again after its marker write failed marks the job with the earlier closing commit and exits 0", async (t) => {
	const p = await plant();
	t.after(() => p.cleanup());
	const id = ticketJob(p);
	git(p.root, "merge", "-q", "--no-edit", jobRecord(p, id)?.branch ?? "");
	const failed = await withLock({ folder: jobDir(p, id) }, async () =>
		limen(p, ["ticket", "done", "F001", "--on", "2026-11-21"], { env: { LIMEN_LOCK_WAIT_MS: "100" } }),
	);
	const close = git(p.root, "rev-parse", "HEAD");
	assert.deepEqual(
		[failed.status, readOutcome(failed), jobRecord(p, id)?.landed],
		[3, { class: "transient", code: "LOCK_TIMEOUT", next: "limen ticket done F001 --on 2026-11-21" }, undefined],
		failed.stderr,
	);
	const again = limen(p, ["ticket", "done", "F001", "--on", "2026-11-21"]);
	assert.deepEqual(
		[again.status, jobRecord(p, id)?.landed, git(p.root, "rev-parse", "HEAD")],
		[0, { sha: close, at: dayOnlyTime("2026-11-21") }, close],
		again.stderr,
	);
});

// D-096 (3) (j), T-02: nothing is left to do, which is a success.
test("ticket done run again on a ticket its own close closed, with no job left to mark, says so, exits 0 and changes nothing", async (t) => {
	const p = await plant();
	t.after(() => p.cleanup());
	assert.equal(limen(p, ["ticket", "done", "F001"]).status, 0);
	const before = snapshot(p.root);
	const again = limen(p, ["ticket", "done", "F001"]);
	const short = git(p.root, "rev-parse", "--short", "HEAD");
	assert.deepEqual(
		[again.status, outputText(again), snapshot(p.root)],
		[0, `F001 was closed in ${short} already; no job of it was left to mark\n`, before],
		again.stderr,
	);
});

// D-096 (3) (i), T-18 (1): before R-103 ticket done closed no Herdr tab of the jobs of the ticket it closed.
test("ticket done closes the recorded tabs of the finished jobs of the ticket it closed and names each", async (t) => {
	const p = await plant();
	t.after(() => p.cleanup());
	const id = ticketJob(p);
	const herdr = await herdrFake(join(p.parent, "herdr"), {
		tabs: { "w1:t1": { label: "F001 demo work · done" }, "w1:t2": { label: "F001 demo work · diff" } },
	});
	await recordTab(jobDir(p, id), "log", "w1:t1");
	await recordTab(jobDir(p, id), "diff", "w1:t2");
	const run = limen(p, ["ticket", "done", "F001"], { env: { LIMEN_HERDR: herdr.binary } });
	assert.equal(run.status, 0, run.stderr);
	assert.deepEqual(
		[
			outputText(run).includes(`closed the Herdr tab w1:t1 of job ${id}\nclosed the Herdr tab w1:t2 of job ${id}\n`),
			herdr.closes(),
		],
		[true, ["w1:t1", "w1:t2"]],
		run.stdout,
	);
});

// R-031, review round 2, G4: before the fix ticket done committed its close and then refused NOT_MIGRATED while it read
// the jobs to mark, so they stayed unmarked and a rerun refused NO_ACTIVE_TICKET.
test("NOT_MIGRATED: ticket done in a project with a job folder of an older Limen exits 4 and moves nothing", async (t) => {
	const p = await plant();
	t.after(() => p.cleanup());
	await mkdir(join(p.root, ".limen/jobs/2026-01-01-old-1a2b3c4d"), { recursive: true });
	await writeFile(join(p.root, ".limen/jobs/2026-01-01-old-1a2b3c4d/state"), "done\n");
	const before = snapshot(p.root);
	const run = limen(p, ["ticket", "done", "F001"]);
	assert.deepEqual(
		[run.status, readOutcome(run), snapshot(p.root)],
		[4, { class: "environment", code: "NOT_MIGRATED", next: "limen migrate --dry-run" }, before],
		run.stderr,
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

// A-021, T-28 (3): before R-037 a rejected closing commit left the ticket's move and the board staged in the checkout,
// so the run again refused NO_ACTIVE_TICKET.
test("HOOK_REJECTED: ticket done whose pre-commit hook rejects exits 4 with the snapshot identical, and run again once the hook passes closes the ticket in one commit", async (t) => {
	const p = await plant();
	t.after(() => p.cleanup());
	const head = git(p.root, "rev-parse", "HEAD");
	await installHook(p, "pre-commit", "echo 'lint: the board is not formatted'\nexit 1");
	const before = snapshot(p.root);
	const rejected = limen(p, ["ticket", "done", "F001", "--on", "2026-11-21"]);
	assert.deepEqual(
		[rejected.status, readOutcome(rejected), snapshot(p.root)],
		[4, { class: "environment", code: "HOOK_REJECTED", next: "limen ticket done F001 --on 2026-11-21" }, before],
		rejected.stderr,
	);
	await installHook(p, "pre-commit", "exit 0");
	const again = limen(p, ["ticket", "done", "F001", "--on", "2026-11-21"]);
	assert.deepEqual(
		[
			again.status,
			git(p.root, "rev-parse", "HEAD~1"),
			git(p.root, "log", "-1", "--format=%s"),
			git(p.root, "status", "--porcelain"),
			git(p.root, "ls-files", "spec/features/done/2026-11"),
		],
		[0, head, "Close F001: landed 2026-11-21", "", "spec/features/done/2026-11/F001-demo/ticket.md"],
		again.stderr,
	);
});

// R-037, Decision 19: the two-way read-tree moves only what git tracks, so a file git ignores stays where it was.
test("ticket done leaves a file git ignores in the ticket's old folder, which it names, and moves the ticket", async (t) => {
	const p = await plant();
	t.after(() => p.cleanup());
	const swap = join(p.root, dirname(TICKET), ".ticket.md.swp");
	await appendFile(join(p.root, ".git/info/exclude"), "*.swp\n");
	await writeFile(swap, "an editor's state\n");
	const run = limen(p, ["ticket", "done", "F001"]);
	assert.equal(run.status, 0, run.stderr);
	assert.deepEqual(
		[
			outputText(run).includes(`kept ${dirname(TICKET)}: it holds files git does not track, which stay there\n`),
			await readFile(swap, "utf8"),
			existsSync(join(p.root, TICKET)),
			git(p.root, "status", "--porcelain"),
		],
		[true, "an editor's state\n", false, ""],
		run.stdout,
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
