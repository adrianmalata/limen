// src/job/read-only.ts: what a read-only role's job changed since its start state, in its worktree and its own branch
// (A-081): HEAD, the branch's tip and the paths `git status` lists with their content, ignored files left out; a state
// it cannot read is unproven.
import assert from "node:assert/strict";
import { chmod, mkdir, mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test, { type TestContext } from "node:test";
import { difference, readOnlyEffect, recordStartState, startState } from "../../src/job/read-only.ts";
import { git, repository } from "../plant.ts";

/** A repository with one commit, a `.gitignore` that ignores `node_modules/`, and `own` at HEAD; removed after `t`. */
async function worktree(t: TestContext): Promise<string> {
	const root = await mkdtemp(join(tmpdir(), "limen-read-only-"));
	t.after(() => rm(root, { recursive: true, force: true }));
	await repository(root);
	await writeFile(join(root, ".gitignore"), "node_modules/\n");
	git(root, "add", ".gitignore");
	git(root, "commit", "-q", "-m", "ignore node_modules");
	git(root, "checkout", "-q", "-b", "own");
	return root;
}

/** The first 12 hex digits of `ref`'s commit in `root`. */
const short = (root: string, ref: string) => git(root, "rev-parse", ref).slice(0, 12);

test("difference names HEAD's move and the own branch's move after a commit in the worktree", async (t) => {
	const root = await worktree(t);
	const before = short(root, "HEAD");
	const start = startState(root, "own");
	git(root, "commit", "-q", "--allow-empty", "-m", "a write");
	const after = short(root, "HEAD");
	assert.equal(
		difference(start, startState(root, "own")),
		`HEAD moved ${before}..${after}; branch own moved ${before}..${after}`,
	);
});

// A reviewer's worktree is detached at its candidate, so its HEAD stands for it; the own branch of a judge or a
// researcher can move without its HEAD, from another checkout (R-045 Decision 11).
test("difference names the own branch's move when the branch moved and HEAD did not", async (t) => {
	const root = await worktree(t);
	const before = short(root, "HEAD");
	git(root, "checkout", "-q", "--detach");
	const start = startState(root, "own");
	const moved = git(root, "commit-tree", "-p", "HEAD", "-m", "elsewhere", `${git(root, "rev-parse", "HEAD")}^{tree}`);
	git(root, "update-ref", "refs/heads/own", moved);
	assert.equal(difference(start, startState(root, "own")), `branch own moved ${before}..${moved.slice(0, 12)}`);
});

test("difference names an untracked file the job left", async (t) => {
	const root = await worktree(t);
	const start = startState(root, undefined);
	await writeFile(join(root, "notes.txt"), "a write through bash\n");
	assert.equal(difference(start, startState(root, undefined)), "1 path changed: notes.txt");
});

test("difference names a tracked file the job changed", async (t) => {
	const root = await worktree(t);
	const start = startState(root, undefined);
	await writeFile(join(root, "README.md"), "changed\n");
	assert.equal(difference(start, startState(root, undefined)), "1 path changed: README.md");
});

// R-045 Decision 7: an install from the lockfile writes ignored files, which are no write of the job.
test("difference is null for a file that .gitignore ignores", async (t) => {
	const root = await worktree(t);
	const start = startState(root, "own");
	await mkdir(join(root, "node_modules", "pkg"), { recursive: true });
	await writeFile(join(root, "node_modules", "pkg", "index.js"), "installed\n");
	assert.equal(difference(start, startState(root, "own")), null);
});

// R-045 Decision 7: the start state is taken after setup, so a file `--prepare` left is part of it.
test("difference is null for an untracked file that was there when the start state was taken", async (t) => {
	const root = await worktree(t);
	await writeFile(join(root, "prepared.txt"), "left by --prepare\n");
	const start = startState(root, "own");
	assert.equal(difference(start, startState(root, "own")), null);
});

// R-045 Decision 17 F3: a path already dirty at the start keeps its status entry when the job writes it again, so the
// start state holds each listed path's content, and a second write is a difference.
test("difference names a tracked file --prepare left modified that the job writes again, and none while it is left alone", async (t) => {
	const root = await worktree(t);
	await writeFile(join(root, "README.md"), "changed by --prepare\n");
	const start = startState(root, "own");
	const alone = difference(start, startState(root, "own"));
	await writeFile(join(root, "README.md"), "changed again by the job\n");
	assert.deepEqual([alone, difference(start, startState(root, "own"))], [null, "1 path changed: README.md"]);
});

// The detail goes into the job's log and its wake, so at most five paths are named, and all of them are counted.
test("difference counts every changed path and names the first five", async (t) => {
	const root = await worktree(t);
	const start = startState(root, undefined);
	for (const name of ["a", "b", "c", "d", "e", "f"]) {
		await writeFile(join(root, name), "x\n");
	}
	assert.equal(difference(start, startState(root, undefined)), "6 paths changed: a, b, c, d, e");
});

// A path the job chose is escaped as the log escapes text (`shownField`), so it cannot add a line to what the
// coordinator reads.
test("difference escapes a newline in a path it names", async (t) => {
	const root = await worktree(t);
	const start = startState(root, undefined);
	await writeFile(join(root, "line\nbreak"), "x\n");
	assert.equal(difference(start, startState(root, undefined)), "1 path changed: line\\nbreak");
});

// R-045 Decision 17 F4, Decision 12: an error while the end state is read is no reason to reject the job's end; the
// effect is `unproven`, so the end fails closed. The file the job cannot read stands for any such error.
test("readOnlyEffect gives unproven, and does not reject, when a file of the worktree cannot be read at the end", async (t) => {
	if (process.getuid?.() === 0) {
		t.skip("root reads a file whatever its mode");
		return;
	}
	const root = await worktree(t);
	const jobDir = await mkdtemp(join(tmpdir(), "limen-read-only-job-"));
	t.after(() => rm(jobDir, { recursive: true, force: true }));
	const job = { role: "reviewer", worktree: root, branch: "own" };
	await writeFile(join(root, "notes.txt"), "left by --prepare\n");
	assert.equal(await recordStartState(jobDir, job), undefined);
	await chmod(join(root, "notes.txt"), 0o000);
	const effect = await readOnlyEffect(jobDir, job);
	await chmod(join(root, "notes.txt"), 0o644);
	assert.deepEqual(
		{ kind: effect?.kind, detail: effect?.kind === "same" ? "" : /^unproven: .*EACCES/.test(effect?.detail ?? "") },
		{ kind: "unproven", detail: true },
	);
});

// R-045 Decision 18 G1: an error's words can hold a path the job chose, and the detail reaches the job's failure, its
// log and the `limen stop` line, so it is escaped as the log escapes text (`shownField`), as a difference's paths are.
test("readOnlyEffect escapes a newline in the name of a file it cannot read at the end in its unproven detail", async (t) => {
	if (process.getuid?.() === 0) {
		t.skip("root reads a file whatever its mode");
		return;
	}
	const root = await worktree(t);
	const jobDir = await mkdtemp(join(tmpdir(), "limen-read-only-job-"));
	t.after(() => rm(jobDir, { recursive: true, force: true }));
	const job = { role: "reviewer", worktree: root, branch: "own" };
	const name = join(root, "line\nbreak");
	await writeFile(name, "left by --prepare\n");
	assert.equal(await recordStartState(jobDir, job), undefined);
	await chmod(name, 0o000);
	const effect = await readOnlyEffect(jobDir, job);
	await chmod(name, 0o644);
	const detail = effect?.kind === "same" ? "" : (effect?.detail ?? "");
	assert.deepEqual(
		{ kind: effect?.kind, lines: detail.split("\n").length, escaped: detail.includes("line\\nbreak") },
		{ kind: "unproven", lines: 1, escaped: true },
	);
});
