// src/commands/land.ts: `limen land` through the CLI, its steps `merged`, `closed` and `cleaned` in the job's record
// and a run again that goes on from the first one not recorded (A-021, R-103), the worktree with unlanded work that it
// keeps (A-001), the `landed` marker it writes (A-002), the close of its tickets that refuses or fails, and the job's
// Herdr tabs it closes.
import assert from "node:assert/strict";
import { existsSync } from "node:fs";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import { dirname, join } from "node:path";
import test from "node:test";
import { worktreeGuard } from "../../src/job/publication.ts";
import { lockPath, withLock } from "../../src/lock.ts";
import { doneFolder, localDay } from "../../src/project/lanes.ts";
import { outputText, readOutcome } from "../final-line.ts";
import {
	git,
	herdrFake,
	installHook,
	jobDir,
	jobRecord,
	limen,
	nestedJob,
	type Plant,
	plant,
	recordTab,
	spawnJob,
	TICKET,
	waitJob,
	writeRecord,
} from "../plant.ts";
import { type Snapshot, snapshot } from "../snapshot.ts";

const ID = "2026-11-21-land-label-5e6f7a8b";

test("JOB_NOT_EXACT: land with a job's label exits 2, names the command with the token in next and leaves the record byte-identical", async (t) => {
	const p = await plant();
	t.after(p.cleanup);
	const record = join(jobDir(p, ID), "record.json");
	await writeRecord(jobDir(p, ID), { state: "done", label: "F001 demo work", branch: "main", base: "HEAD" });
	const before = await readFile(record);
	const run = limen(p, ["land", "F001 demo work", "--yes"]);
	assert.equal(run.status, 2, run.stderr);
	assert.deepEqual(readOutcome(run), { class: "usage", code: "JOB_NOT_EXACT", next: "limen land 5e6f7a8b --yes" });
	assert.deepEqual(await readFile(record), before);
});

// A-001: before R-030 land deleted the branch and moved this worktree out of reach, the untracked file with it.
test("limen land: a done job lands, and its worktree that holds an untracked file stays with its branch and says why", async (t) => {
	const p = await plant();
	t.after(p.cleanup);
	const id = spawnJob(p, "commit");
	assert.equal(waitJob(p, id), "done");
	const [branch, worktree] = [jobRecord(p, id)?.branch ?? "", jobRecord(p, id)?.worktree ?? ""];
	await writeFile(join(worktree, "notes.txt"), "a note the job left\n");
	const run = limen(p, ["land", id]);
	assert.equal(run.status, 0, run.stderr);
	assert.ok(outputText(run).includes(`kept ${worktree} (job ${id}): unlanded work\n`), run.stdout);
	assert.deepEqual(
		[
			git(p.root, "merge-base", "--is-ancestor", branch, "HEAD"),
			git(p.root, "for-each-ref", "--format=%(refname:short)", `refs/heads/${branch}`),
			await readFile(join(worktree, "notes.txt"), "utf8"),
		],
		["", branch, "a note the job left\n"],
	);
});

// A-002: before R-031 land wrote nothing in the job's record, so retire could only guess the land from the git graph.
test("land writes the landed marker with the commit its merge left on the target and the time of the land", async (t) => {
	const p = await plant();
	t.after(p.cleanup);
	// The label names the plant's ticket, so land's closing commit follows the merge: the marker names the merge's.
	const id = ticketJob(p);
	const before = Date.now();
	const run = limen(p, ["land", id]);
	assert.equal(run.status, 0, run.stderr);
	const landed = jobRecord(p, id)?.landed;
	const at = Date.parse(landed?.at ?? "");
	assert.deepEqual(
		[landed?.sha, at >= before - 1_000 && at <= Date.now(), git(p.root, "log", "-1", "--format=%s")],
		[git(p.root, "rev-parse", "HEAD~1"), true, `Close F001: landed by ${id}`],
		JSON.stringify(landed),
	);
});

// A-021: before R-103 the record held only the merge, so a land that failed after it could not say what was left.
test("land records its closing commit as the closed step and then the cleaned step, each with its time", async (t) => {
	const p = await plant();
	t.after(p.cleanup);
	const id = ticketJob(p);
	const run = limen(p, ["land", id]);
	assert.equal(run.status, 0, run.stderr);
	const land = jobRecord(p, id)?.land;
	assert.deepEqual(
		[
			land?.closed?.sha,
			Number.isFinite(Date.parse(land?.closed?.at ?? "")),
			Number.isFinite(Date.parse(land?.cleaned?.at ?? "")),
		],
		[git(p.root, "rev-parse", "HEAD"), true, true],
		JSON.stringify(land),
	);
});

// R-031, review round 1, F1: a land whose worktree stays leaves its branch for a land run again; before the fix that land
// wrote the target's new HEAD as the marker and exited 5 MARKER_DIFFERS once a commit had moved the target.
test("land run again after a new commit on the target exits 0 and keeps the landed marker of the first land", async (t) => {
	const p = await plant();
	t.after(p.cleanup);
	const id = spawnJob(p, "commit");
	assert.equal(waitJob(p, id), "done");
	await writeFile(join(jobRecord(p, id)?.worktree ?? "", "notes.txt"), "a note the job left\n");
	assert.equal(limen(p, ["land", id]).status, 0);
	const first = jobRecord(p, id)?.landed;
	// R-031, review round 2, G3: without this the test passed when the first land wrote no marker at all.
	assert.equal(first?.sha, git(p.root, "rev-parse", "HEAD"), "the first land wrote its merge as the marker");
	git(p.root, "commit", "-q", "--allow-empty", "-m", "later work on the target");
	const again = limen(p, ["land", id]);
	assert.deepEqual([again.status, jobRecord(p, id)?.landed], [0, first], again.stderr);
});

// T-28 (3), D-096 (3) (e): a land run again after all its steps has nothing left to do.
test("a second land after all its steps prints the steps' line, exits 0 and changes nothing", async (t) => {
	const p = await plant();
	t.after(p.cleanup);
	const id = ticketJob(p);
	assert.equal(limen(p, ["land", id]).status, 0);
	const before = snapshot(p.root);
	const again = limen(p, ["land", id]);
	const [merge, close] = [git(p.root, "rev-parse", "HEAD~1"), git(p.root, "rev-parse", "HEAD")];
	assert.deepEqual(
		[again.status, outputText(again), snapshot(p.root)],
		[0, `job ${id} is landed: merged in ${merge}, closed in ${close}, cleaned\n`, before],
		again.stderr,
	);
});

// T-28 (3), z. 29: land deletes the branch only once its tip is in the target's history.
test("land keeps the merge, the closed ticket and every commit of the job's branch on the target, so the branch it deletes loses nothing", async (t) => {
	const p = await plant();
	t.after(p.cleanup);
	const id = ticketJob(p);
	const [branch, base] = [jobRecord(p, id)?.branch ?? "", jobRecord(p, id)?.base ?? ""];
	const commits = git(p.root, "rev-list", `${base}..${branch}`).split("\n");
	assert.equal(limen(p, ["land", id]).status, 0);
	const done = join(doneFolder(dirname(TICKET), localDay()), "ticket.md");
	assert.deepEqual(
		[
			commits.filter((commit) => git(p.root, "branch", "--contains", commit, "--format=%(refname:short)") !== "main"),
			git(p.root, "for-each-ref", `refs/heads/${branch}`),
			git(p.root, "ls-files", done),
			existsSync(join(p.root, TICKET)),
		],
		[[], "", done, false],
	);
});

// R-030, review round 2, G1: before the fix land removed this clean worktree, and the registered worktree in its ignored
// `.limen/` with the untracked file there.
test("land keeps a landed job's clean worktree that holds a registered worktree with an untracked file, and names it", async (t) => {
	const p = await plant();
	t.after(p.cleanup);
	const id = spawnJob(p, "commit");
	assert.equal(waitJob(p, id), "done");
	const [branch, worktree] = [jobRecord(p, id)?.branch ?? "", jobRecord(p, id)?.worktree ?? ""];
	const inner = join(worktree, ".limen/inner");
	git(p.root, "worktree", "add", "-q", "--detach", inner, "HEAD");
	await writeFile(join(inner, "wip.txt"), "half-done edit\n");
	const run = limen(p, ["land", id]);
	assert.equal(run.status, 0, run.stderr);
	assert.ok(
		outputText(run).includes(`kept ${worktree} (job ${id}): it holds the registered worktree ${inner}\n`),
		run.stdout,
	);
	assert.deepEqual(
		[
			git(p.root, "for-each-ref", "--format=%(refname:short)", `refs/heads/${branch}`),
			await readFile(join(inner, "wip.txt"), "utf8"),
		],
		[branch, "half-done edit\n"],
	);
});

// R-030, review round 4, I1: the job committed a clean nested repository as a gitlink, whose commit lives only in the
// nested `.git`; before the fix land removed the worktree it found clean, and the nested commit with it.
test("land keeps a landed job's clean worktree whose nested repository holds a commit the project lacks, and names it", async (t) => {
	const p = await plant();
	t.after(p.cleanup);
	const { id, worktree, nested, head } = await nestedJob(p, "vendor/lib", {
		committed: true,
		untracked: false,
		done: true,
	});
	const run = limen(p, ["land", id]);
	assert.equal(run.status, 0, run.stderr);
	const cause = "the nested repository vendor/lib holds a commit that the project's repository lacks";
	assert.ok(outputText(run).includes(`kept ${worktree} (job ${id}): ${cause}\n`), run.stdout);
	assert.equal(git(nested, "cat-file", "-t", head), "commit");
});

/** A done job of the plant whose label names its ticket F001, with one commit on its branch. */
function ticketJob(p: Plant): string {
	const id = spawnJob(p, "commit", ["--label", "F001 demo work"]);
	assert.equal(waitJob(p, id), "done");
	return id;
}

/** What a land that merged and closed nothing leaves as it was: every path under `spec/`, and the tree's status. */
function untouched(state: Snapshot): unknown {
	return [Object.entries(state.files).filter(([path]) => path.startsWith("spec/")), state.status];
}

// A-021: before R-037 land merged first and met the uncommitted ticket only at its close, which it then skipped.
// R-037, review round 1, F1: the refusal named `limen ticket done F001`, which would close the ticket with the job
// unmerged.
test("TICKETS_UNCOMMITTED: land of a job whose ticket folder has uncommitted changes exits 1 before its merge, names land again, and leaves the snapshot identical", async (t) => {
	const p = await plant();
	t.after(p.cleanup);
	const id = ticketJob(p);
	await writeFile(join(p.root, dirname(TICKET), "notes.md"), "a note in progress\n");
	const before = snapshot(p.root);
	const run = limen(p, ["land", id]);
	assert.deepEqual(
		[
			run.status,
			readOutcome(run),
			snapshot(p.root),
			outputText(run).includes(`commit them, then run limen land ${id}`),
		],
		[1, { class: "refused", code: "TICKETS_UNCOMMITTED", next: `limen land ${id}` }, before, true],
		run.stderr,
	);
});

// R-037, review round 1, F1: the refusal of a file where the ticket moves named `limen ticket done F001` too.
test("TICKETS_UNCOMMITTED: land of a job whose ticket's destination folder holds a file exits 1 before its merge, names land again, and leaves the snapshot identical", async (t) => {
	const p = await plant();
	t.after(p.cleanup);
	const id = ticketJob(p);
	// R-037, review round 2, G5: the folder comes from the close's own day and destination, for the day now and an
	// hour later, so the land meets a file there even when a month ends between the two.
	for (const at of [new Date(), new Date(Date.now() + 3_600_000)]) {
		const folder = join(p.root, doneFolder(dirname(TICKET), localDay(at)));
		await mkdir(folder, { recursive: true });
		await writeFile(join(folder, "outcome.md"), "another session's draft\n");
	}
	const before = snapshot(p.root);
	const run = limen(p, ["land", id]);
	assert.deepEqual(
		[run.status, readOutcome(run), snapshot(p.root), outputText(run).includes(`move them, then run limen land ${id}`)],
		[1, { class: "refused", code: "TICKETS_UNCOMMITTED", next: `limen land ${id}` }, before, true],
		run.stderr,
	);
});

// A-021: before R-037 a rejected closing commit printed `land: tickets stay active`, exited 0 and left the ticket's
// move and the board staged in the checkout; before R-103 the land had deleted the branch by then and named `limen
// ticket done F001`, so a land run again refused that the job had no commits to land.
test("HOOK_REJECTED: land whose closing commit a pre-commit hook rejects exits 4 with the land in next, records the merge, keeps the branch, and leaves the ticket active with nothing staged", async (t) => {
	const p = await plant();
	t.after(p.cleanup);
	const id = ticketJob(p);
	const branch = jobRecord(p, id)?.branch ?? "";
	const tip = git(p.root, "rev-parse", branch);
	await installHook(p, "pre-commit", "echo 'lint failed'\nexit 1");
	const before = snapshot(p.root);
	const run = limen(p, ["land", id]);
	assert.deepEqual(
		[run.status, readOutcome(run), untouched(snapshot(p.root)), outputText(run).includes("land: tickets stay active")],
		[4, { class: "environment", code: "HOOK_REJECTED", next: `limen land ${id}` }, untouched(before), false],
		run.stderr,
	);
	assert.deepEqual(
		[
			git(p.root, "rev-parse", "HEAD"),
			jobRecord(p, id)?.landed?.sha,
			jobRecord(p, id)?.land,
			git(p.root, "rev-parse", branch),
			existsSync(join(p.root, TICKET)),
		],
		[tip, tip, {}, tip, true],
	);
});

/** A land of a ticket job whose closing commit the pre-commit hook rejected, then that hook made to pass. */
async function rejectedClose(p: Plant): Promise<string> {
	const id = ticketJob(p);
	await installHook(p, "pre-commit", "exit 1");
	assert.equal(limen(p, ["land", id]).status, 4);
	await installHook(p, "pre-commit", "exit 0");
	return id;
}

// D-096 (3) (e): a land run again after its merge never merges again; before R-103 it refused "has no commits to land".
test("a land run again after its close failed closes the ticket in one commit on the merge, cleans up and merges nothing again", async (t) => {
	const p = await plant();
	t.after(p.cleanup);
	const id = await rejectedClose(p);
	const merge = git(p.root, "rev-parse", "HEAD");
	const branch = jobRecord(p, id)?.branch ?? "";
	const again = limen(p, ["land", id]);
	assert.deepEqual(
		[
			again.status,
			git(p.root, "rev-parse", "HEAD~1"),
			git(p.root, "log", "-1", "--format=%s"),
			jobRecord(p, id)?.land?.closed?.sha,
			jobRecord(p, id)?.land?.cleaned !== undefined,
			git(p.root, "for-each-ref", `refs/heads/${branch}`),
			git(p.root, "status", "--porcelain"),
		],
		[0, merge, `Close F001: landed by ${id}`, git(p.root, "rev-parse", "HEAD"), true, "", ""],
		again.stderr,
	);
});

// R-103, review round 1, F1: the close's refusal named `limen ticket done F001`, which, followed, closed the ticket with
// `Close F001: landed`, so the next land recorded no closing commit.
test("a land run again after its merge whose ticket folder has uncommitted changes names the land again in its message and next", async (t) => {
	const p = await plant();
	t.after(p.cleanup);
	const id = await rejectedClose(p);
	await writeFile(join(p.root, dirname(TICKET), "notes.md"), "a note in progress\n");
	const again = limen(p, ["land", id, "--yes"]);
	assert.deepEqual(
		[
			again.status,
			readOutcome(again),
			outputText(again).includes(`commit them, then run limen land ${id} --yes`),
			outputText(again).includes("limen ticket done"),
		],
		[3, { class: "transient", code: "STATE_CHANGED", next: `limen land ${id} --yes` }, true, false],
		again.stderr,
	);
});

// z. 29, D-097 (4) (d): a branch that holds a commit the target lacks is work that only the branch holds.
test("a land run again keeps the job's branch that holds a commit outside the target, names it, and records cleaned", async (t) => {
	const p = await plant();
	t.after(p.cleanup);
	const id = await rejectedClose(p);
	const [branch, worktree] = [jobRecord(p, id)?.branch ?? "", jobRecord(p, id)?.worktree ?? ""];
	await writeFile(join(worktree, "later.txt"), "work after the merge\n");
	git(worktree, "add", "later.txt");
	git(worktree, "commit", "-q", "-m", "a commit after the merge");
	const tip = git(p.root, "rev-parse", branch);
	const again = limen(p, ["land", id]);
	assert.deepEqual(
		[
			again.status,
			outputText(again).includes(`kept branch ${branch}: it holds commits that main does not\n`),
			git(p.root, "rev-parse", branch),
			jobRecord(p, id)?.land?.cleaned !== undefined,
		],
		[0, true, tip, true],
		again.stdout,
	);
});

// R-092, review round 1, finding 12: before R-037 land closed its tickets without the ticket-lanes lock, so a
// `ticket done` that held it did not keep land out.
test("LOCK_TIMEOUT: land while a live process holds the ticket-lanes lock exits 3 with the land in next and closes nothing", async (t) => {
	const p = await plant();
	t.after(p.cleanup);
	const id = ticketJob(p);
	const before = snapshot(p.root);
	const run = await withLock({ file: join(p.root, ".limen", "ticket-lanes") }, async () =>
		limen(p, ["land", id], { env: { LIMEN_LOCK_WAIT_MS: "100" } }),
	);
	assert.deepEqual(
		[run.status, readOutcome(run), untouched(snapshot(p.root))],
		[3, { class: "transient", code: "LOCK_TIMEOUT", next: `limen land ${id}` }, untouched(before)],
		run.stderr,
	);
});

// D-096 (3) (e): the cleaned step's failure leaves the closed step recorded, so a land run again makes no second close.
test("a land run again after its clean-up failed on a held worktree lock cleans up and makes no second closing commit", async (t) => {
	const p = await plant();
	t.after(p.cleanup);
	const id = ticketJob(p);
	const failed = await withLock(worktreeGuard(join(p.root, ".limen", "jobs")), async () =>
		limen(p, ["land", id], { env: { LIMEN_LOCK_WAIT_MS: "100" } }),
	);
	const close = git(p.root, "rev-parse", "HEAD");
	assert.deepEqual(
		[failed.status, readOutcome(failed), jobRecord(p, id)?.land?.closed?.sha, jobRecord(p, id)?.land?.cleaned],
		[3, { class: "transient", code: "LOCK_TIMEOUT", next: `limen land ${id}` }, close, undefined],
		failed.stderr,
	);
	const again = limen(p, ["land", id]);
	assert.deepEqual(
		[again.status, git(p.root, "rev-parse", "HEAD"), jobRecord(p, id)?.land?.cleaned !== undefined],
		[0, close, true],
		again.stderr,
	);
});

// R-037 Risk 3, D-096 (3) (f): a land killed after its closing commit moved the branch and before the checkout followed
// left the checkout behind, which a land run again before R-103 refused as staged changes.
test("a land run again after a stop between the branch's move and the checkout's finishes the checkout and records the closing commit", async (t) => {
	const p = await plant();
	t.after(p.cleanup);
	const id = await rejectedClose(p);
	const close = await closeByHand(p, `Close F001: landed by ${id}`);
	git(p.root, "update-ref", "HEAD", close);
	const again = limen(p, ["land", id]);
	assert.deepEqual(
		[
			again.status,
			git(p.root, "rev-parse", "HEAD"),
			git(p.root, "status", "--porcelain"),
			existsSync(join(p.root, TICKET)),
			jobRecord(p, id)?.land?.closed?.sha,
		],
		[0, close, "", false, close],
		again.stderr,
	);
});

// R-103, review round 1, F4, Decision 6: land's CHECKOUT_BEHIND names the land itself, whose run again finishes the
// checkout and records the commit; `ticket done`'s keeps `next` null (test/project/lanes.test.ts).
test("CHECKOUT_BEHIND: a land run again after a stop past the branch's move, with a file of the close changed in the checkout, exits 4 with the land in next and keeps the file", async (t) => {
	const p = await plant();
	t.after(p.cleanup);
	const id = await rejectedClose(p);
	const parent = git(p.root, "rev-parse", "HEAD");
	const close = await closeByHand(p, `Close F001: landed by ${id}`);
	git(p.root, "update-ref", "HEAD", close);
	const edited = `${await readFile(join(p.root, TICKET), "utf8")}another session's line\n`;
	await writeFile(join(p.root, TICKET), edited);
	const again = limen(p, ["land", id]);
	assert.deepEqual(
		[
			again.status,
			readOutcome(again),
			outputText(again).includes(`git read-tree -m -u ${parent} ${close}`),
			await readFile(join(p.root, TICKET), "utf8"),
			jobRecord(p, id)?.land?.closed,
		],
		[4, { class: "environment", code: "CHECKOUT_BEHIND", next: `limen land ${id}` }, true, edited, undefined],
		again.stderr,
	);
});

/**
 * The commit a close makes of the plant's ticket on HEAD, built in a worktree of its own, with `subject`; the checkout
 * of the plant and its branch stay as they are.
 */
async function closeByHand(p: Plant, subject: string): Promise<string> {
	const scratch = join(p.parent, "close-by-hand");
	git(p.root, "worktree", "add", "-q", "--detach", scratch, "HEAD");
	const to = doneFolder(dirname(TICKET), localDay());
	await mkdir(join(scratch, dirname(to)), { recursive: true });
	git(scratch, "mv", dirname(TICKET), to);
	git(scratch, "commit", "-q", "-m", subject);
	const commit = git(scratch, "rev-parse", "HEAD");
	git(p.root, "worktree", "remove", "--force", scratch);
	return commit;
}

// R-037, review round 1, note 6: a release of the ticket-lanes lock that failed after the closing commit was said to
// have written nothing of the close, and named `limen ticket done F001`, which then refused.
test("a land whose ticket-lanes lock is lost after its closing commit says the commit is on the branch, and a land run again records it", async (t) => {
	const p = await plant();
	t.after(p.cleanup);
	const id = ticketJob(p);
	await installHook(p, "pre-commit", `rm -f '${lockPath({ file: join(p.root, ".limen", "ticket-lanes") })}'`);
	const lost = limen(p, ["land", id]);
	const close = git(p.root, "rev-parse", "HEAD");
	const short = git(p.root, "rev-parse", "--short", "HEAD");
	assert.deepEqual(
		[
			lost.status,
			readOutcome(lost),
			outputText(lost).includes(`its closing commit ${short} is on main, but the land stopped before it recorded`),
			git(p.root, "log", "-1", "--format=%s"),
		],
		[4, { class: "environment", code: "LOCK_LOST", next: `limen land ${id}` }, true, `Close F001: landed by ${id}`],
		lost.stderr,
	);
	const again = limen(p, ["land", id]);
	assert.deepEqual(
		[again.status, git(p.root, "rev-parse", "HEAD"), jobRecord(p, id)?.land?.closed?.sha],
		[0, close, close],
		again.stderr,
	);
});

// D-096 (3) (g), A-021: a land before R-103 that failed in its close had deleted the branch and left the tickets active,
// with the `landed` marker and no `land`.
test("a land of a record an older land marked, whose close failed, closes the ticket from Git and records the steps", async (t) => {
	const p = await plant();
	t.after(p.cleanup);
	const id = ticketJob(p);
	const [branch, worktree] = [jobRecord(p, id)?.branch ?? "", jobRecord(p, id)?.worktree ?? ""];
	git(p.root, "merge", "-q", "--no-edit", branch);
	const merge = git(p.root, "rev-parse", "HEAD");
	git(p.root, "worktree", "remove", "--force", worktree);
	git(p.root, "branch", "-D", branch);
	await writeRecord(jobDir(p, id), { ...jobRecord(p, id), landed: { sha: merge, at: new Date().toISOString() } });
	const run = limen(p, ["land", id]);
	assert.deepEqual(
		[
			run.status,
			git(p.root, "rev-parse", "HEAD~1"),
			git(p.root, "log", "-1", "--format=%s"),
			jobRecord(p, id)?.land?.closed?.sha,
			jobRecord(p, id)?.land?.cleaned !== undefined,
		],
		[0, merge, `Close F001: landed by ${id}`, git(p.root, "rev-parse", "HEAD"), true],
		run.stderr,
	);
});

// D-096 (3) (g): `limen ticket done` marks a job with its closing commit, so that commit is the job's close.
test("a land of a record that limen ticket done marked records its closing commit as closed and deletes the landed branch", async (t) => {
	const p = await plant();
	t.after(p.cleanup);
	const id = ticketJob(p);
	const branch = jobRecord(p, id)?.branch ?? "";
	git(p.root, "merge", "-q", "--no-edit", branch);
	assert.equal(limen(p, ["ticket", "done", "F001", "--on", "2026-11-21"]).status, 0);
	const close = git(p.root, "rev-parse", "HEAD");
	const run = limen(p, ["land", id]);
	assert.deepEqual(
		[
			run.status,
			git(p.root, "rev-parse", "HEAD"),
			jobRecord(p, id)?.land?.closed?.sha,
			git(p.root, "for-each-ref", `refs/heads/${branch}`),
		],
		[0, close, close, ""],
		run.stderr,
	);
});

// R-103, review round 2, G1 (z. 15, T-01): a job's own commit with its land's closing subject was taken as the close,
// so land said it recorded the closing commit while the ticket stayed active.
test("a land of a job whose own commit carries its closing subject closes the ticket and records its own closing commit", async (t) => {
	const p = await plant();
	t.after(p.cleanup);
	const id = ticketJob(p);
	const worktree = jobRecord(p, id)?.worktree ?? "";
	await writeFile(join(worktree, "forged.txt"), "a commit that names the close\n");
	git(worktree, "add", "forged.txt");
	git(worktree, "commit", "-q", "-m", `Close F001: landed by ${id}`);
	const forged = git(worktree, "rev-parse", "HEAD");
	const run = limen(p, ["land", id]);
	assert.deepEqual(
		[
			run.status,
			jobRecord(p, id)?.land?.closed?.sha,
			git(p.root, "rev-parse", "HEAD~1"),
			existsSync(join(p.root, TICKET)),
		],
		[0, git(p.root, "rev-parse", "HEAD"), forged, false],
		run.stdout,
	);
});

// D-096 (3) (g), D-057 (4): the migration marks a job with the closing commit of its land, which names the job.
test("a land of a record the migration marked with its land's closing commit records that commit as closed", async (t) => {
	const p = await plant();
	t.after(p.cleanup);
	const id = ticketJob(p);
	assert.equal(limen(p, ["land", id]).status, 0);
	const close = git(p.root, "rev-parse", "HEAD");
	const { land: _land, ...older } = jobRecord(p, id) ?? {};
	await writeRecord(jobDir(p, id), { ...older, landed: { sha: close, at: "2026-11-21T12:00:00.000Z" } });
	const run = limen(p, ["land", id]);
	assert.deepEqual(
		[run.status, git(p.root, "rev-parse", "HEAD"), jobRecord(p, id)?.land?.closed?.sha],
		[0, close, close],
		run.stderr,
	);
});

// D-096 (3) (i), T-18 (1): before R-103 land closed no Herdr tab of the job, so its log and diff tabs stayed open.
test("land closes the job's recorded log and diff tabs in its cleaned step and names each", async (t) => {
	const p = await plant();
	t.after(p.cleanup);
	const id = ticketJob(p);
	const herdr = await herdrFake(join(p.parent, "herdr"), {
		tabs: { "w1:t1": { label: "F001 demo work · done" }, "w1:t2": { label: "F001 demo work · diff" } },
	});
	await recordTab(jobDir(p, id), "log", "w1:t1");
	await recordTab(jobDir(p, id), "diff", "w1:t2");
	const run = limen(p, ["land", id], { env: { LIMEN_HERDR: herdr.binary } });
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
