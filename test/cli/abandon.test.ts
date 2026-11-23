// `limen abandon`: a finished job's work goes on limen/abandon/<id>, then its worktree and its Herdr tab go (A-001).
import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { existsSync, readFileSync } from "node:fs";
import { mkdir, readFile, rm, writeFile } from "node:fs/promises";
import { basename, dirname, join } from "node:path";
import { test } from "node:test";
import { outputText, readOutcome } from "../final-line.ts";
import {
	git,
	jobDir,
	jobRecord,
	limen,
	nestedJob,
	type Plant,
	plant,
	routed,
	spawnJob,
	TICKET,
	until,
	waitJob,
	writeRecord,
} from "../plant.ts";
import { snapshot } from "../snapshot.ts";

/** The cause of a kept worktree whose nested repository `vendor/lib` holds a commit the project's repository lacks. */
const UNSAVED = "the nested repository vendor/lib holds a commit that the project's repository lacks";

/** A done job of the plant whose branch holds one commit outside HEAD: its id, branch, worktree and tip. */
function doneJob(p: Plant): { id: string; branch: string; worktree: string; tip: string } {
	const id = spawnJob(p, "commit");
	assert.equal(waitJob(p, id), "done");
	const [branch, worktree] = [jobRecord(p, id)?.branch ?? "", jobRecord(p, id)?.worktree ?? ""];
	return { id, branch, worktree, tip: git(p.root, "rev-parse", branch) };
}

/**
 * Changes the worktree as a job that stopped half way leaves it: an edit of a tracked file, a deleted tracked file, an
 * untracked file in a new folder, and an ignored file (the plant ignores `.limen/`).
 */
async function leaveWork(worktree: string): Promise<void> {
	await writeFile(join(worktree, "README.md"), "plant, edited\n");
	await rm(join(worktree, TICKET));
	await mkdir(join(worktree, "new"));
	await writeFile(join(worktree, "new/notes.txt"), "a note the job left\n");
	await mkdir(join(worktree, ".limen"));
	await writeFile(join(worktree, ".limen/ignored.txt"), "ignored\n");
}

/** The text of `path` in the commit `ref`, or undefined when its tree holds no such file. */
function shown(root: string, ref: string, path: string): string | undefined {
	const listed = git(root, "ls-tree", "--name-only", ref, "--", path);
	return listed ? execFileSync("git", ["show", `${ref}:${path}`], { cwd: root, encoding: "utf8" }) : undefined;
}

test("limen abandon: a done job's work goes on limen/abandon/<id> above its worktree's HEAD, its branch stays and its worktree goes", async (t) => {
	const p = await plant();
	t.after(() => p.cleanup());
	const job = doneJob(p);
	await leaveWork(job.worktree);
	const run = limen(p, ["abandon", job.id]);
	assert.equal(run.status, 0, run.stderr);
	const saved = `limen/abandon/${job.id}`;
	const commit = git(p.root, "rev-parse", saved);
	assert.deepEqual(readOutcome(run), { class: "ok", code: null, next: null });
	assert.deepEqual(outputText(run).split("\n"), [
		`saved job ${job.id} on ${saved} at ${commit}`,
		`removed its worktree ${job.worktree}`,
		"",
	]);
	assert.deepEqual(
		[
			git(p.root, "log", "-1", "--format=%P %s", saved),
			git(p.root, "rev-parse", job.branch),
			existsSync(job.worktree),
			git(p.root, "worktree", "list").includes(job.worktree),
		],
		[`${job.tip} limen abandon ${job.id}`, job.tip, false, false],
	);
});

// A-002: before R-031 only the branch's existence said that a job was abandoned; the record now holds what was saved.
test("abandon writes the abandoned marker with its branch, its commit and the time once it removed the worktree", async (t) => {
	const p = await plant();
	t.after(() => p.cleanup());
	const job = doneJob(p);
	await leaveWork(job.worktree);
	const before = Date.now();
	assert.equal(limen(p, ["abandon", job.id]).status, 0);
	const saved = `limen/abandon/${job.id}`;
	const { at = "", ...marker } = jobRecord(p, job.id)?.abandoned ?? {};
	assert.deepEqual(
		[marker, Date.parse(at) >= before - 1_000 && Date.parse(at) <= Date.now()],
		[{ branch: saved, commit: git(p.root, "rev-parse", saved) }, true],
		at,
	);
});

/** The lines of the section of `limen status` that lists unlanded work, without its header. */
function unlandedLines(p: Plant): string[] {
	const run = limen(p, ["status"]);
	assert.equal(run.status, 0, run.stderr);
	const lines = run.stdout.split("\n");
	const at = lines.indexOf("Unlanded work (spawn refuses until each is continued or abandoned):");
	return at < 0 ? [] : lines.slice(at + 1, at + 4);
}

// D-088: the marker says that the branch holds the whole worktree, so a worktree abandon keeps leaves the job open.
test("abandon writes no abandoned marker when it keeps the worktree, so the job's unlanded work stays listed", async (t) => {
	const p = await plant();
	t.after(() => p.cleanup());
	const job = doneJob(p);
	git(p.root, "worktree", "lock", job.worktree);
	assert.equal(limen(p, ["abandon", job.id]).status, 0);
	assert.deepEqual(
		[jobRecord(p, job.id)?.abandoned, unlandedLines(p)[0]],
		[undefined, `  ${job.id} · done · 0 changed files, 1 unlanded commit`],
	);
});

// R-030, Decision 2: R-031 replaces the branch test with the record's marker, so a branch of that name made by hand
// resolves nothing; before R-031 its existence alone took the job off the list and let a worker spawn.
test("a limen/abandon/<id> branch without the record's abandoned marker resolves no job, which status still lists", async (t) => {
	const p = await plant();
	t.after(() => p.cleanup());
	const job = doneJob(p);
	git(p.root, "worktree", "remove", job.worktree);
	git(p.root, "branch", `limen/abandon/${job.id}`, job.tip);
	assert.deepEqual(unlandedLines(p), [
		`  ${job.id} · done · 0 changed files, 1 unlanded commit`,
		`    limen continue ${job.id} "instruction"`,
		`    limen abandon ${job.id}`,
	]);
});

// T-28 (3): the worktree holds every kind of change; what Git does not ignore is on the branch byte for byte.
test("abandon keeps every changed, deleted and untracked file of the worktree on its branch byte for byte, and no ignored one", async (t) => {
	const p = await plant();
	t.after(() => p.cleanup());
	const job = doneJob(p);
	await leaveWork(job.worktree);
	const kept = git(job.worktree, "ls-files", "--cached", "--others", "--exclude-standard", "--deduplicate")
		.split("\n")
		.filter((path) => existsSync(join(job.worktree, path)))
		.sort();
	const contents = await Promise.all(kept.map((path) => readFile(join(job.worktree, path), "utf8")));
	assert.equal(limen(p, ["abandon", job.id]).status, 0);
	const saved = `limen/abandon/${job.id}`;
	assert.deepEqual(
		[
			git(p.root, "ls-tree", "-r", "--name-only", saved).split("\n").sort(),
			kept.map((path) => shown(p.root, saved, path)),
			[TICKET, ".limen/ignored.txt"].map((path) => shown(p.root, saved, path)),
		],
		[kept, contents, [undefined, undefined]],
	);
	assert.ok(kept.includes("new/notes.txt") && !kept.includes(TICKET), kept.join(", "));
});

test("a second abandon after all its steps prints the branch, exits 0 and changes nothing", async (t) => {
	const p = await plant();
	t.after(() => p.cleanup());
	const job = doneJob(p);
	await leaveWork(job.worktree);
	assert.equal(limen(p, ["abandon", job.id]).status, 0);
	const before = snapshot(p.root);
	const again = limen(p, ["abandon", job.id]);
	const saved = `limen/abandon/${job.id}`;
	assert.deepEqual(
		[again.status, outputText(again), snapshot(p.root)],
		[0, `job ${job.id} is abandoned: its work is on ${saved} at ${git(p.root, "rev-parse", saved)}\n`, before],
		again.stderr,
	);
});

// Review round 1, F7 (T-28 (3)): the record's marker says the job is abandoned; before the fix a run again after a
// person deleted the branch made it again at the job's tip and exited 5 MARKER_DIFFERS.
test("abandon run again after a person deleted limen/abandon/<id> says that the branch is gone, makes none and exits 0", async (t) => {
	const p = await plant();
	t.after(() => p.cleanup());
	const job = doneJob(p);
	await leaveWork(job.worktree);
	assert.equal(limen(p, ["abandon", job.id]).status, 0);
	const saved = `limen/abandon/${job.id}`;
	const commit = git(p.root, "rev-parse", saved);
	git(p.root, "branch", "-D", saved);
	const before = snapshot(p.root);
	const again = limen(p, ["abandon", job.id]);
	assert.deepEqual(
		[again.status, outputText(again), snapshot(p.root)],
		[0, `job ${job.id} is abandoned: its work was on ${saved} at ${commit}; that branch is gone\n`, before],
		again.stderr,
	);
});

// A stop between the steps leaves the branch made and the worktree in place; the branch here is made as step (1) makes it
// for a clean worktree: its state is the tree of the job's tip.
test("an abandon that stopped after its save removes the worktree whose state its branch holds when it runs again", async (t) => {
	const p = await plant();
	t.after(() => p.cleanup());
	const job = doneJob(p);
	const saved = `limen/abandon/${job.id}`;
	git(p.root, "branch", saved, job.tip);
	const run = limen(p, ["abandon", job.id]);
	assert.equal(run.status, 0, run.stderr);
	assert.deepEqual(
		[outputText(run), existsSync(job.worktree), git(p.root, "rev-parse", saved)],
		[`job ${job.id} is saved on ${saved} at ${job.tip}\nremoved its worktree ${job.worktree}\n`, false, job.tip],
	);
});

test("an abandon run again keeps and names a worktree that changed after its save", async (t) => {
	const p = await plant();
	t.after(() => p.cleanup());
	const job = doneJob(p);
	const saved = `limen/abandon/${job.id}`;
	git(p.root, "branch", saved, job.tip);
	await writeFile(join(job.worktree, "later.txt"), "written after the save\n");
	const run = limen(p, ["abandon", job.id]);
	assert.equal(run.status, 0, run.stderr);
	assert.deepEqual(
		[outputText(run).split("\n")[1], await readFile(join(job.worktree, "later.txt"), "utf8")],
		[
			`kept ${job.worktree} (job ${job.id}): it changed after the save, so ${saved} does not hold its state`,
			"written after the save\n",
		],
	);
});

// Review round 1, F1: `add -A` saves a nested repository only as a gitlink to its checked-out commit, so before the fix
// abandon removed the worktree with the nested repository's own commit and its untracked file.
test("abandon keeps and names a worktree whose nested repository holds a commit and an untracked file the save does not", async (t) => {
	const p = await plant();
	t.after(() => p.cleanup());
	const { id, worktree, nested } = await nestedJob(p, "vendor/lib", { committed: false, untracked: true });
	const run = limen(p, ["abandon", id]);
	assert.equal(run.status, 0, run.stderr);
	const saved = `limen/abandon/${id}`;
	assert.deepEqual(
		[
			outputText(run).split("\n")[1],
			await readFile(join(nested, "wip.txt"), "utf8"),
			git(p.root, "for-each-ref", "--format=%(refname:short)", `refs/heads/${saved}`),
		],
		[
			`kept ${worktree} (job ${id}): the nested repository vendor/lib holds commits that ${saved} does not`,
			"half-done edit\n",
			saved,
		],
	);
});

// Review round 2, G4: F1's second cause; HEAD records the nested repository at its commit, which the project's object
// store holds too (the nested repository is a clone of the project), so only its own untracked file is outside the save.
test("abandon keeps and names a worktree whose nested repository, at the commit HEAD records, holds changes of its own", async (t) => {
	const p = await plant();
	t.after(() => p.cleanup());
	const how = { committed: true, known: true, untracked: true } as const;
	const { id, worktree, nested } = await nestedJob(p, "vendor/lib", how);
	const run = limen(p, ["abandon", id]);
	assert.equal(run.status, 0, run.stderr);
	assert.deepEqual(
		[outputText(run).split("\n")[1], await readFile(join(nested, "wip.txt"), "utf8")],
		[
			`kept ${worktree} (job ${id}): the nested repository vendor/lib holds changes that limen/abandon/${id} does not`,
			"half-done edit\n",
		],
	);
});

// Review round 3, H1: the job committed the gitlink itself, so HEAD records it at the same commit, and the nested
// repository is clean; that commit lives only in the nested `.git`, and before the fix abandon removed it with the
// worktree.
test("abandon keeps and names a worktree whose nested repository's commit, recorded at HEAD, the project's object store lacks", async (t) => {
	const p = await plant();
	t.after(() => p.cleanup());
	const { id, worktree, nested, head } = await nestedJob(p, "vendor/lib", { committed: true, untracked: false });
	assert.equal(git(p.root, "ls-tree", `limen/${id}`, "vendor/lib"), `160000 commit ${head}\tvendor/lib`);
	const run = limen(p, ["abandon", id]);
	assert.equal(run.status, 0, run.stderr);
	const saved = `limen/abandon/${id}`;
	assert.equal(outputText(run).split("\n")[1], `kept ${worktree} (job ${id}): ${UNSAVED}`);
	// The worktree stays, so the nested commit is still in its own `.git`, and the branch was written all the same.
	assert.deepEqual(
		[
			git(nested, "cat-file", "-t", head),
			git(p.root, "for-each-ref", "--format=%(refname:short)", `refs/heads/${saved}`),
		],
		["commit", saved],
	);
});

/** The cause of a kept worktree whose nested repository `vendor/lib` names a commit the project lacks outside its checkout. */
const NESTED_REF =
	"the nested repository vendor/lib holds a branch, tag, stash or reflog entry at a commit that the project's repository lacks";

/** Git in the nested repository `nested` with an identity, which the plant's clone of the project has none of. */
function nestedGit(nested: string, ...args: readonly string[]): string {
	return git(nested, "-c", "user.name=Nested", "-c", "user.email=nested@example.test", ...args);
}

/**
 * A finished job whose HEAD records a clone of the project as the nested repository `vendor/lib`, clean and at a commit
 * the project's object store holds, after `make` gave the clone a commit only it holds outside its checkout; and the
 * abandon of the job that follows.
 */
async function abandonWithNestedRef(p: Plant, make: (nested: string) => Promise<void>) {
	const job = await nestedJob(p, "vendor/lib", { committed: true, known: true, untracked: false });
	await make(job.nested);
	assert.equal(git(job.nested, "status", "--porcelain"), "");
	return { ...job, run: limen(p, ["abandon", job.id]) };
}

// D-088 (R-030 review round 4, note 2): before R-031 abandon read only the gitlink's commit and the nested status, so
// it removed the worktree and the commits the nested repository held elsewhere with it.
test("abandon keeps a worktree whose nested repository has a branch at a commit the project lacks, and writes no marker", async (t) => {
	const p = await plant();
	t.after(() => p.cleanup());
	const { id, worktree, run } = await abandonWithNestedRef(p, async (nested) => {
		const commit = nestedGit(
			nested,
			"commit-tree",
			git(nested, "rev-parse", "HEAD^{tree}"),
			"-p",
			"HEAD",
			"-m",
			"aside",
		);
		git(nested, "-c", "core.logAllRefUpdates=false", "update-ref", "refs/heads/aside", commit);
	});
	assert.equal(run.status, 0, run.stderr);
	assert.deepEqual(
		[outputText(run).split("\n")[1], jobRecord(p, id)?.abandoned, existsSync(worktree)],
		[`kept ${worktree} (job ${id}): ${NESTED_REF}`, undefined, true],
	);
});

test("abandon keeps a worktree whose nested repository has a stash the project lacks, and writes no marker", async (t) => {
	const p = await plant();
	t.after(() => p.cleanup());
	const { id, worktree, run } = await abandonWithNestedRef(p, async (nested) => {
		await writeFile(join(nested, "README.md"), "plant, edited in the nested repository\n");
		nestedGit(nested, "stash", "-q");
	});
	assert.equal(run.status, 0, run.stderr);
	assert.deepEqual(
		[outputText(run).split("\n")[1], jobRecord(p, id)?.abandoned, existsSync(worktree)],
		[`kept ${worktree} (job ${id}): ${NESTED_REF}`, undefined, true],
	);
});

test("abandon keeps a worktree whose nested repository has a reflog entry at a commit the project lacks, and writes no marker", async (t) => {
	const p = await plant();
	t.after(() => p.cleanup());
	const { id, worktree, run } = await abandonWithNestedRef(p, async (nested) => {
		await writeFile(join(nested, "later.txt"), "a commit that a reset left only in the reflog\n");
		nestedGit(nested, "add", "later.txt");
		nestedGit(nested, "commit", "-q", "-m", "later");
		nestedGit(nested, "reset", "-q", "--hard", "HEAD~1");
	});
	assert.equal(run.status, 0, run.stderr);
	assert.deepEqual(
		[outputText(run).split("\n")[1], jobRecord(p, id)?.abandoned, existsSync(worktree)],
		[`kept ${worktree} (job ${id}): ${NESTED_REF}`, undefined, true],
	);
});

// Review round 4, I1: before that fix the written branch resolved the job and its worktree looked clean, so the next
// prune removed the worktree H1 kept, and the nested commit with it. Since R-031 an abandon that keeps the worktree
// writes no `abandoned` marker, so the job's work stays unresolved and prune keeps the worktree for it, as for any
// unlanded work; before R-031 the line named the nested commit instead.
test("a worktree abandon kept for a nested commit the project lacks survives the next prune, which names it", async (t) => {
	const p = await plant();
	t.after(() => p.cleanup());
	const { id, worktree, nested, head } = await nestedJob(p, "vendor/lib", { committed: true, untracked: false });
	assert.equal(limen(p, ["abandon", id]).status, 0);
	const pruned = limen(p, ["prune"]);
	assert.equal(pruned.status, 0, pruned.stderr);
	assert.ok(pruned.stdout.includes(`kept ${worktree} (job ${id}): unlanded work\n`), pruned.stdout);
	assert.equal(git(nested, "cat-file", "-t", head), "commit");
});

// Review round 2, G6 (z. 15): a job names its own folders, so a newline in one must not add a line to what the
// coordinator reads; before the fix the kept line broke in two.
test("abandon escapes a control character in the nested repository's path, so its kept line stays one line", async (t) => {
	const p = await plant();
	t.after(() => p.cleanup());
	const { id, worktree } = await nestedJob(p, "vendor/li\nb", { committed: false, untracked: true });
	const run = limen(p, ["abandon", id]);
	assert.equal(run.status, 0, run.stderr);
	assert.deepEqual(outputText(run).split("\n").slice(1), [
		`kept ${worktree} (job ${id}): the nested repository vendor/li\\nb holds commits that limen/abandon/${id} does not`,
		"",
	]);
});

// Review round 1, F2: removing the worktree would take the registered worktree inside it, which its ignored `.limen/`
// hides from its own `git status`.
test("abandon keeps and names a worktree that holds another registered worktree", async (t) => {
	const p = await plant();
	t.after(() => p.cleanup());
	const job = doneJob(p);
	const inner = join(job.worktree, ".limen/inner");
	git(p.root, "worktree", "add", "-q", "--detach", inner, "HEAD");
	const run = limen(p, ["abandon", job.id]);
	assert.equal(run.status, 0, run.stderr);
	assert.deepEqual(
		[outputText(run).split("\n")[1], existsSync(join(inner, "README.md"))],
		[`kept ${job.worktree} (job ${job.id}): it holds the registered worktree ${inner}`, true],
	);
});

// Review round 1, F4: abandon removes only what prune could remove, and prune leaves a Git-locked worktree alone.
test("abandon keeps and names a Git-locked worktree, and still writes its branch", async (t) => {
	const p = await plant();
	t.after(() => p.cleanup());
	const job = doneJob(p);
	git(p.root, "worktree", "lock", job.worktree);
	const run = limen(p, ["abandon", job.id]);
	assert.equal(run.status, 0, run.stderr);
	const saved = `limen/abandon/${job.id}`;
	assert.deepEqual(
		[outputText(run).split("\n")[1], existsSync(job.worktree), git(p.root, "log", "-1", "--format=%P", saved)],
		[`kept ${job.worktree} (job ${job.id}): Git locks it`, true, job.tip],
	);
});

// T-18: closing the job's Herdr tab is part of abandon's cleaned step. The tests' Herdr logs its words and refuses
// nothing; the place is the one a job's start records when Herdr runs.
test("abandon closes the job's Herdr tab through the tab closer, which logs the close in the job's log", async (t) => {
	const p = await plant();
	t.after(() => p.cleanup());
	const job = doneJob(p);
	const herdr = join(p.parent, "herdr-fake");
	await mkdir(herdr);
	await writeFile(join(herdr, "herdr"), '#!/bin/sh\nprintf \'%s\\n\' "$*" >> "$(dirname "$0")/calls.log"\n', {
		mode: 0o755,
	});
	const place = { workspace: "w1", tab: "w1:t7", pane: "w1:p7", mode: "watch" };
	await mkdir(join(jobDir(p, job.id), "herdr"));
	for (const [name, value] of Object.entries(place)) {
		await writeFile(join(jobDir(p, job.id), "herdr", name), `${value}\n`);
	}
	const run = limen(p, ["abandon", job.id], { env: { LIMEN_HERDR: join(herdr, "herdr") } });
	assert.equal(run.status, 0, run.stderr);
	const log = join(jobDir(p, job.id), "log");
	await until(jobDir(p, job.id), () => readFileSync(log, "utf8").includes(`herdr tab close ${place.tab}: closed`));
	assert.equal(readFileSync(join(herdr, "calls.log"), "utf8"), `tab close ${place.tab}\n`);
});

/** Abandons `id` and returns the run with the snapshots before and after it. */
function refusedAbandon(p: Plant, id: string) {
	const before = snapshot(p.root);
	const run = limen(p, ["abandon", id]);
	return { run, before, after: snapshot(p.root) };
}

test("JOB_NOT_FINISHED: abandon of a running job exits 1, names limen stop with its id and leaves the snapshot identical", async (t) => {
	const p = await plant();
	t.after(() => p.cleanup());
	const id = "2026-11-22-running-1a2b3c4d";
	// No process owns the record, so nothing writes in the plant beside the command under test.
	await writeRecord(jobDir(p, id), { state: "running", branch: `limen/${id}` });
	const { run, before, after } = refusedAbandon(p, id);
	assert.deepEqual(
		[run.status, readOutcome(run), after],
		[1, { class: "refused", code: "JOB_NOT_FINISHED", next: `limen stop ${id}` }, before],
		run.stderr,
	);
});

test("JOB_IN_GROUP: abandon of a finished member of an open group exits 1, names the group and leaves the snapshot identical", async (t) => {
	const p = await plant();
	t.after(() => p.cleanup());
	const id = "2026-11-22-f001-worker-5e6f7a8b";
	const now = Date.now();
	const run = {
		id: "open-group",
		root: p.root,
		feature: dirname(TICKET),
		lead: "the-lead",
		startedAt: now,
		teams: ["team-1"],
		routes: { "team-1": { engine: "pi", provider: "p", model: "m", thinking: "high" } },
		workersPerTeam: 1,
		rounds: ["draft"],
		round: 0,
		deadline: now + 60 * 60_000,
		reserveMs: 60_000,
		stopped: false,
		closed: false,
		members: [{ id, team: "team-1", role: "worker", deadline: now + 60 * 60_000 }],
	};
	await mkdir(join(p.root, ".limen/groups", run.id), { recursive: true });
	await writeFile(join(p.root, ".limen/groups", run.id, "run.json"), `${JSON.stringify(run)}\n`);
	await writeRecord(jobDir(p, id), { state: "done", branch: `limen/${id}`, group: run.id, team: "team-1" });
	const refused = refusedAbandon(p, id);
	assert.deepEqual(
		[refused.run.status, readOutcome(refused.run), refused.after],
		[1, { class: "refused", code: "JOB_IN_GROUP", next: null }, refused.before],
		refused.run.stderr,
	);
	assert.ok(outputText(refused.run).includes(`the open group ${run.feature} (${run.id})`), refused.run.stderr);
});

test("JOB_CONTINUED: abandon of a job whose worktree a newer job holds exits 1, names that job's abandon and leaves the snapshot identical", async (t) => {
	const p = await plant();
	t.after(() => p.cleanup());
	const [parent, child] = ["2026-11-22-first-1a2b3c4d", "2026-11-22-first-continue-5e6f7a8b"];
	const shared = { state: "failed" as const, branch: `limen/${parent}`, worktree: join(p.parent, "tree") };
	await writeRecord(jobDir(p, parent), { ...shared, startedAt: "2026-11-22T08:00:00.000Z" });
	await writeRecord(jobDir(p, child), { ...shared, parent, startedAt: "2026-11-22T09:00:00.000Z" });
	const { run, before, after } = refusedAbandon(p, parent);
	assert.deepEqual(
		[run.status, readOutcome(run), after],
		[1, { class: "refused", code: "JOB_CONTINUED", next: `limen abandon ${child}` }, before],
		run.stderr,
	);
});

// Review round 1, F3: a marker never hides work (R-031, Decision 3); before the fix abandon took a limen/abandon/<id>
// made elsewhere as the job's save and marked the job, whose own commit the branch does not hold.
test("ABANDON_BRANCH_LACKS_WORK: abandon of a job with no worktree whose limen/abandon/<id> lacks its branch's tip exits 1 and leaves the snapshot identical", async (t) => {
	const p = await plant();
	t.after(() => p.cleanup());
	const job = doneJob(p);
	git(p.root, "worktree", "remove", job.worktree);
	git(p.root, "branch", `limen/abandon/${job.id}`, "HEAD");
	const { run, before, after } = refusedAbandon(p, job.id);
	assert.deepEqual(
		[run.status, readOutcome(run), after, jobRecord(p, job.id)?.abandoned],
		[1, { class: "refused", code: "ABANDON_BRANCH_LACKS_WORK", next: null }, before, undefined],
		run.stderr,
	);
});

test("NO_UNLANDED_WORK: abandon of a done job with a clean worktree and no commit exits 1, names limen prune and leaves the snapshot identical", async (t) => {
	const p = await plant();
	t.after(() => p.cleanup());
	const id = spawnJob(p, "say nothing to keep");
	assert.equal(waitJob(p, id), "done");
	const { run, before, after } = refusedAbandon(p, id);
	assert.deepEqual(
		[run.status, readOutcome(run), after],
		[1, { class: "refused", code: "NO_UNLANDED_WORK", next: "limen prune" }, before],
		run.stderr,
	);
});

/**
 * The plant's folder of job worktrees, beside its root, and a migrated record there, finished a month ago: older
 * records reach the summary only through its section of unlanded work.
 */
function migratedRecord(p: Plant, id: string, state: "failed" | "stopped") {
	const ended = new Date(Date.now() - 30 * 86_400_000).toISOString();
	const worktree = join(dirname(p.root), `.${basename(p.root)}-limen-worktrees`, id);
	const record = {
		state,
		branch: `limen/${id}`,
		worktree,
		startedAt: ended,
		finishedAt: ended,
		migrated: { at: ended },
	};
	return { worktree, record };
}

// The migration of R-030: records an older Limen left, with work it would have pruned, block worker spawns until each
// is resolved.
test("migrated finished jobs with unlanded work are listed, block a worker spawn, and limen abandon resolves each", async (t) => {
	const p = await plant();
	t.after(() => p.cleanup());
	const [failed, stopped] = ["2026-10-20-old-failed-1a2b3c4d", "2026-10-21-old-stopped-5e6f7a8b"];
	// The failed job's worktree holds an untracked file.
	const dirty = migratedRecord(p, failed, "failed");
	git(p.root, "worktree", "add", "-q", "-b", dirty.record.branch, dirty.worktree, "HEAD");
	await writeFile(join(dirty.worktree, "wip.txt"), "half-done edit\n");
	await writeRecord(jobDir(p, failed), dirty.record);
	// The stopped job's worktree is gone, and its branch holds a commit.
	const gone = migratedRecord(p, stopped, "stopped");
	git(p.root, "worktree", "add", "-q", "-b", gone.record.branch, gone.worktree, "HEAD");
	await writeFile(join(gone.worktree, "kept.txt"), "committed work\n");
	git(gone.worktree, "add", "kept.txt");
	git(gone.worktree, "commit", "-q", "-m", "committed work");
	git(p.root, "worktree", "remove", gone.worktree);
	await writeRecord(jobDir(p, stopped), gone.record);

	const status = limen(p, ["status"]);
	assert.equal(status.status, 0, status.stderr);
	const lines = status.stdout.split("\n");
	const at = lines.indexOf("Unlanded work (spawn refuses until each is continued or abandoned):");
	assert.deepEqual(lines.slice(at + 1, at + 7), [
		`  ${failed} · failed · 1 changed file, 0 unlanded commits`,
		`    limen continue ${failed} "instruction"`,
		`    limen abandon ${failed}`,
		`  ${stopped} · stopped · 0 changed files, 1 unlanded commit`,
		`    limen continue ${stopped} "instruction"`,
		`    limen abandon ${stopped}`,
	]);
	const refused = limen(p, ["spawn", ...routed([]), "say hi"]);
	assert.deepEqual([refused.status, readOutcome(refused).code], [1, "UNLANDED_WORK"], refused.stderr);
	for (const id of [failed, stopped]) {
		const abandoned = limen(p, ["abandon", id]);
		assert.equal(abandoned.status, 0, abandoned.stderr);
	}
	assert.deepEqual(
		[shown(p.root, `limen/abandon/${failed}`, "wip.txt"), shown(p.root, `limen/abandon/${stopped}`, "kept.txt")],
		["half-done edit\n", "committed work\n"],
	);
	const id = spawnJob(p, "say hi");
	assert.equal(waitJob(p, id), "done");
});
