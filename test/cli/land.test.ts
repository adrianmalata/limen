// src/commands/land.ts: `limen land` through the CLI, the worktree with unlanded work that it keeps (A-001), the
// `landed` marker it writes in the job's record (A-002), and the close of its tickets that refuses or fails (A-021).
import assert from "node:assert/strict";
import { existsSync } from "node:fs";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import { dirname, join } from "node:path";
import test from "node:test";
import { withLock } from "../../src/lock.ts";
import { doneFolder, localDay } from "../../src/project/lanes.ts";
import { outputText, readOutcome } from "../final-line.ts";
import {
	git,
	installHook,
	jobDir,
	jobRecord,
	limen,
	nestedJob,
	type Plant,
	plant,
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
	const id = spawnJob(p, "commit", ["--label", "F001 demo work"]);
	assert.equal(waitJob(p, id), "done");
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

// Review round 1, F1: a land whose worktree stays leaves its branch for a land run again; before the fix that land wrote
// the target's new HEAD as the marker and exited 5 MARKER_DIFFERS once a commit had moved the target.
test("land run again after a new commit on the target exits 0 and keeps the landed marker of the first land", async (t) => {
	const p = await plant();
	t.after(p.cleanup);
	const id = spawnJob(p, "commit");
	assert.equal(waitJob(p, id), "done");
	await writeFile(join(jobRecord(p, id)?.worktree ?? "", "notes.txt"), "a note the job left\n");
	assert.equal(limen(p, ["land", id]).status, 0);
	const first = jobRecord(p, id)?.landed;
	// Review round 2, G3: without this the test passed when the first land wrote no marker at all.
	assert.equal(first?.sha, git(p.root, "rev-parse", "HEAD"), "the first land wrote its merge as the marker");
	git(p.root, "commit", "-q", "--allow-empty", "-m", "later work on the target");
	const again = limen(p, ["land", id]);
	assert.deepEqual([again.status, jobRecord(p, id)?.landed], [0, first], again.stderr);
});

// Review round 2, G1: before the fix land removed this clean worktree, and the registered worktree in its ignored
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

// Review round 4, I1: the job committed a clean nested repository as a gitlink, whose commit lives only in the nested
// `.git`; before the fix land removed the worktree it found clean, and the nested commit with it.
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
// Review round 1, F1: the refusal named `limen ticket done F001`, which would close the ticket with the job unmerged.
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

// Review round 1, F1: the refusal of a file where the ticket moves named `limen ticket done F001` too.
test("TICKETS_UNCOMMITTED: land of a job whose ticket's destination folder holds a file exits 1 before its merge, names land again, and leaves the snapshot identical", async (t) => {
	const p = await plant();
	t.after(p.cleanup);
	const id = ticketJob(p);
	// Review round 2, G5: the folder comes from the close's own day and destination, for the day now and an hour later,
	// so the land meets a file there even when a month ends between the two.
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
// move and the board staged in the checkout.
test("HOOK_REJECTED: land whose closing commit a pre-commit hook rejects exits 4 with limen ticket done F001, keeps the merge and the marker, and leaves the ticket active with nothing staged", async (t) => {
	const p = await plant();
	t.after(p.cleanup);
	const id = ticketJob(p);
	const tip = git(p.root, "rev-parse", jobRecord(p, id)?.branch ?? "");
	await installHook(p, "pre-commit", "echo 'lint failed'\nexit 1");
	const before = snapshot(p.root);
	const run = limen(p, ["land", id]);
	assert.deepEqual(
		[run.status, readOutcome(run), untouched(snapshot(p.root)), outputText(run).includes("land: tickets stay active")],
		[4, { class: "environment", code: "HOOK_REJECTED", next: "limen ticket done F001" }, untouched(before), false],
		run.stderr,
	);
	assert.deepEqual(
		[git(p.root, "rev-parse", "HEAD"), jobRecord(p, id)?.landed?.sha, existsSync(join(p.root, TICKET))],
		[tip, tip, true],
	);
	await installHook(p, "pre-commit", "exit 0");
	const done = limen(p, ["ticket", "done", "F001"]);
	assert.deepEqual([done.status, git(p.root, "status", "--porcelain")], [0, ""], done.stderr);
});

// R-092, review round 1, finding 12: before R-037 land closed its tickets without the ticket-lanes lock, so a
// `ticket done` that held it did not keep land out.
test("LOCK_TIMEOUT: land while a live process holds the ticket-lanes lock exits 3 with limen ticket done F001 and closes nothing", async (t) => {
	const p = await plant();
	t.after(p.cleanup);
	const id = ticketJob(p);
	const before = snapshot(p.root);
	const run = await withLock({ file: join(p.root, ".limen", "ticket-lanes") }, async () =>
		limen(p, ["land", id], { env: { LIMEN_LOCK_WAIT_MS: "100" } }),
	);
	assert.deepEqual(
		[run.status, readOutcome(run), untouched(snapshot(p.root))],
		[3, { class: "transient", code: "LOCK_TIMEOUT", next: "limen ticket done F001" }, untouched(before)],
		run.stderr,
	);
});
