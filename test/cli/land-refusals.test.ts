// `limen land`'s refusals before its merge, each a code of its own that leaves the project's snapshot as it was
// (T-38 (1), (4), R-103); a merge git stops, which is git's failure; and the lands that pass by fast-forward and by
// merge beside another session's uncommitted file.
import assert from "node:assert/strict";
import { appendFile, mkdir, readFile, writeFile } from "node:fs/promises";
import { dirname, join } from "node:path";
import { type TestContext, test } from "node:test";
import { outputText, readOutcome } from "../final-line.ts";
import {
	git,
	jobDir,
	jobRecord,
	limen,
	type Plant,
	plant,
	type RunOptions,
	release,
	spawnJob,
	TICKET,
	waitJob,
	writeRecord,
} from "../plant.ts";
import { snapshot } from "../snapshot.ts";

/** A fresh plant, removed after the test. */
async function fresh(t: TestContext): Promise<Plant> {
	const p = await plant();
	t.after(() => p.cleanup());
	return p;
}

/** A done job of the plant that ran `task`. */
function done(p: Plant, task = "commit", flags: readonly string[] = []): string {
	const id = spawnJob(p, task, flags);
	assert.equal(waitJob(p, id), "done");
	return id;
}

/** Commits `files` on the branch of the done job `id`, in its worktree, which its unlanded commit keeps (A-001). */
async function amend(p: Plant, id: string, files: Readonly<Record<string, string>>): Promise<void> {
	const worktree = jobRecord(p, id)?.worktree ?? "";
	for (const [path, text] of Object.entries(files)) {
		await mkdir(dirname(join(worktree, path)), { recursive: true });
		await writeFile(join(worktree, path), text);
	}
	git(worktree, "add", "-A");
	git(worktree, "commit", "-q", "-m", "candidate");
}

/** Lands with `args` and returns the run with the snapshots before and after it. */
function refusedLand(p: Plant, args: readonly string[], options: RunOptions = {}) {
	const before = snapshot(p.root);
	const run = limen(p, ["land", ...args], options);
	return { run, before, after: snapshot(p.root) };
}

/** A done job's record written by hand with `fields`, whose branch and base are the plant's main. */
async function handJob(p: Plant, id: string, fields: Parameters<typeof writeRecord>[1]): Promise<string> {
	const head = git(p.root, "rev-parse", "HEAD");
	await writeRecord(jobDir(p, id), { state: "done", label: "hand", branch: "limen/hand", base: head, ...fields });
	return id;
}

const HAND = "2026-11-25-hand-1a2b3c4d";

// A-012: a member of a group lands nothing; the lead owns the land (before R-103 an untyped refusal).
test("LAND_IN_GROUP: land from a group member exits 1 before it resolves the job and leaves the snapshot identical", async (t) => {
	const p = await fresh(t);
	const { run, before, after } = refusedLand(p, ["2026-11-25-none-1a2b3c4d"], { env: { LIMEN_GROUP_ID: "g1" } });
	assert.deepEqual(
		[run.status, readOutcome(run), after],
		[1, { class: "refused", code: "LAND_IN_GROUP", next: null }, before],
		run.stderr,
	);
});

test("JOB_NOT_DONE: land of a failed job exits 1 and leaves the snapshot identical", async (t) => {
	const p = await fresh(t);
	await handJob(p, HAND, { state: "failed" });
	const { run, before, after } = refusedLand(p, [HAND]);
	assert.deepEqual(
		[run.status, readOutcome(run), after, outputText(run).includes(`job ${HAND} is failed; land requires a done job`)],
		[1, { class: "refused", code: "JOB_NOT_DONE", next: null }, before, true],
		run.stderr,
	);
});

test("JOB_NO_BRANCH: land of a done job whose record names no branch exits 1 and leaves the snapshot identical", async (t) => {
	const p = await fresh(t);
	await handJob(p, HAND, { branch: null });
	const { run, before, after } = refusedLand(p, [HAND]);
	assert.deepEqual(
		[run.status, readOutcome(run), after],
		[1, { class: "refused", code: "JOB_NO_BRANCH", next: null }, before],
		run.stderr,
	);
});

test("JOB_NO_BASE: land of a done job whose record names no base exits 1 and leaves the snapshot identical", async (t) => {
	const p = await fresh(t);
	await handJob(p, HAND, { base: null });
	const { run, before, after } = refusedLand(p, [HAND]);
	assert.deepEqual(
		[run.status, readOutcome(run), after],
		[1, { class: "refused", code: "JOB_NO_BASE", next: null }, before],
		run.stderr,
	);
});

test("TARGET_NOT_CHECKED_OUT: land with --onto a branch that is not checked out exits 1, names the land again and leaves the snapshot identical", async (t) => {
	const p = await fresh(t);
	const id = done(p);
	git(p.root, "branch", "other");
	const { run, before, after } = refusedLand(p, [id, "--onto", "other", "--yes"]);
	assert.deepEqual(
		[run.status, readOutcome(run), after],
		[1, { class: "refused", code: "TARGET_NOT_CHECKED_OUT", next: `limen land ${id} --onto other --yes` }, before],
		run.stderr,
	);
});

test("ON_JOB_BRANCH: land of a job whose branch is the checked-out one exits 1 and leaves the snapshot identical", async (t) => {
	const p = await fresh(t);
	await handJob(p, HAND, { branch: "main" });
	const { run, before, after } = refusedLand(p, [HAND]);
	assert.deepEqual(
		[run.status, readOutcome(run), after],
		[1, { class: "refused", code: "ON_JOB_BRANCH", next: `limen land ${HAND}` }, before],
		run.stderr,
	);
});

test("TARGET_STAGED: land into a checkout with a staged file exits 1, names the file and leaves the snapshot identical", async (t) => {
	const p = await fresh(t);
	const id = done(p);
	await writeFile(join(p.root, "staged.txt"), "staged\n");
	git(p.root, "add", "staged.txt");
	const { run, before, after } = refusedLand(p, [id]);
	assert.deepEqual(
		[run.status, readOutcome(run), after, outputText(run).includes("staged.txt")],
		[1, { class: "refused", code: "TARGET_STAGED", next: `limen land ${id}` }, before, true],
		run.stderr,
	);
});

test("NOTHING_TO_LAND: land of a done job with no commit exits 1 and leaves the snapshot identical", async (t) => {
	const p = await fresh(t);
	const id = done(p, "say nothing to commit");
	const { run, before, after } = refusedLand(p, [id]);
	assert.deepEqual(
		[run.status, readOutcome(run), after],
		[1, { class: "refused", code: "NOTHING_TO_LAND", next: null }, before],
		run.stderr,
	);
});

// Another session may edit the checkout: land merges beside its files and never over them.
test("UNCOMMITTED_OVERLAP: land whose merge would change a file with uncommitted edits exits 1, keeps the edit and leaves the snapshot identical", async (t) => {
	const p = await fresh(t);
	const id = done(p);
	const [file = ""] = git(p.root, "diff", "--name-only", `main...${jobRecord(p, id)?.branch ?? ""}`).split("\n");
	await writeFile(join(p.root, file), "another session\n");
	const { run, before, after } = refusedLand(p, [id]);
	assert.deepEqual(
		[run.status, readOutcome(run), after, await readFile(join(p.root, file), "utf8")],
		[1, { class: "refused", code: "UNCOMMITTED_OVERLAP", next: `limen land ${id}` }, before, "another session\n"],
		run.stderr,
	);
});

test("TICKET_CHECK_FAILED: land of a branch whose ticket fails the strict check exits 1 with the keeper command and leaves the snapshot identical", async (t) => {
	const p = await fresh(t);
	const id = done(p);
	// The job files a ticket that touches no known place.
	const ticket = TICKET.replace("F001-demo", "F002-bad");
	const text = (await readFile(join(p.root, TICKET), "utf8")).replace("demo.place", "nope").replaceAll("F001", "F002");
	await amend(p, id, { [ticket]: text });
	const { run, before, after } = refusedLand(p, [id]);
	assert.deepEqual(
		[
			run.status,
			readOutcome(run),
			after,
			outputText(run).includes(`${ticket}:3`),
			outputText(run).includes(`limen keeper ${ticket} --job ${id}`),
		],
		[1, { class: "refused", code: "TICKET_CHECK_FAILED", next: `limen land ${id}` }, before, true, true],
		run.stderr,
	);
});

test("TEST_LINE_CAP: land of a branch that adds test lines past the cap exits 1, names the numbers and leaves the snapshot identical", async (t) => {
	const p = await fresh(t);
	await appendFile(join(p.root, "spec/vision.md"), "\n`test/` holds at most 5 lines.\n");
	await mkdir(join(p.root, "test"));
	await writeFile(join(p.root, "test/old.test.ts"), "x\n".repeat(8));
	git(p.root, "add", "-A");
	git(p.root, "commit", "-q", "-m", "main is over its test cap");
	const id = done(p);
	await amend(p, id, { "test/new.test.ts": "x\n" });
	const { run, before, after } = refusedLand(p, [id]);
	// main holds 8 lines, the cap is 5, the branch adds 1: 9 lines, 1 to remove.
	assert.deepEqual(
		[run.status, readOutcome(run), after, /\b9\b[^\n]*\b5\b[^\n]*\b1\b/.test(outputText(run))],
		[1, { class: "refused", code: "TEST_LINE_CAP", next: `limen land ${id}` }, before, true],
		run.stderr,
	);
});

// T-38 (1), (3): a merge git stops is land's first write, which no check before it decides, so it is git's failure.
test("MERGE_FAILED: a land that conflicts beside an uncommitted file exits 4 with the land in next, aborts the merge and leaves the checkout as it was", async (t) => {
	const p = await fresh(t);
	const id = done(p, "say nothing to commit");
	await amend(p, id, { "README.md": "the job's readme\n" });
	await writeFile(join(p.root, "README.md"), "main's readme\n");
	git(p.root, "commit", "-q", "-am", "main edits the readme");
	await writeFile(join(p.root, "draft.txt"), "another session drafts\n");
	const [head, status] = [git(p.root, "rev-parse", "HEAD"), git(p.root, "status", "--porcelain")];
	const run = limen(p, ["land", id]);
	assert.deepEqual(
		[
			run.status,
			readOutcome(run),
			git(p.root, "rev-parse", "HEAD"),
			git(p.root, "status", "--porcelain"),
			await readFile(join(p.root, "README.md"), "utf8"),
			jobRecord(p, id)?.landed,
		],
		[
			4,
			{ class: "environment", code: "MERGE_FAILED", next: `limen land ${id}` },
			head,
			status,
			"main's readme\n",
			undefined,
		],
		run.stderr,
	);
});

test("limen land: a done job fast-forwards without --yes off a TTY, a landed branch is deleted, and a merge lands beside an uncommitted file and closes its ticket", async (t) => {
	const p = await fresh(t);
	// A worker spawn refuses while a finished job holds unlanded work (A-001), so both start before either commits.
	const a = spawnJob(p, "block\ncommit");
	const b = spawnJob(p, "block\ncommit", ["--label", "demo · F001"]);
	for (const id of [a, b]) {
		await release(jobDir(p, id));
	}
	assert.deepEqual([waitJob(p, a), waitJob(p, b)], ["done", "done"]);
	const [branchA, branchB] = [jobRecord(p, a)?.branch ?? "", jobRecord(p, b)?.branch ?? ""];
	const tipA = git(p.root, "rev-parse", branchA);
	assert.equal(limen(p, ["land", a]).status, 0);
	assert.equal(git(p.root, "rev-parse", "main"), tipA);
	await writeFile(join(p.root, "draft.txt"), "another session drafts\n");
	const status = git(p.root, "status", "--porcelain");
	const tipB = git(p.root, "rev-parse", branchB);
	const run = limen(p, ["land", b, "--yes"]);
	assert.equal(run.status, 0, run.stderr);
	assert.deepEqual(
		[
			git(p.root, "branch", "--list", branchA, branchB),
			git(p.root, "log", "-1", "--format=%P", "main^").split(" "),
			git(p.root, "status", "--porcelain"),
		],
		["", [tipA, tipB], status],
	);
	const board = git(p.root, "show", "main:spec/build.md");
	assert.match(board, /Current[^#]*## NOW\n\n<!--.*-->\n\n## [\s\S]*`F001-demo` \(🟢 PROVEN\).*landed \d/);
});
