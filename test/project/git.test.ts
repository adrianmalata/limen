// src/project/git.ts: the central git runner (a git that cannot start is an environment failure that names git, any
// other spawn error goes up as it is), and the primitives of the closing commit: the branch's compare-and-swap, the
// checkout's two-way read-tree and the hook run (R-037).
import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { chmod, mkdir, mkdtemp, readFile, realpath, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { type TestContext, test } from "node:test";
import { LimenError } from "../../src/outcome.ts";
import { commitHasFile, followCommit, headCommit, isGitRepository, moveHead, runHook } from "../../src/project/git.ts";
import { git, repository } from "../plant.ts";

// The primitives run git in this process: neither the user's nor the system's configuration may name hooks.
process.env.GIT_CONFIG_GLOBAL = "/dev/null";
process.env.GIT_CONFIG_NOSYSTEM = "1";

/** A repository with one commit in a folder of its own, removed after the test. */
async function project(t: TestContext): Promise<string> {
	const folder = await realpath(await mkdtemp(join(tmpdir(), "limen-git-")));
	t.after(() => rm(folder, { recursive: true, force: true }));
	await repository(folder);
	return folder;
}

/** A commit on top of HEAD that changes `README.md` to `text`, made without moving HEAD or touching the checkout. */
function nextCommit(root: string, text: string): string {
	const blob = execGit(root, ["hash-object", "-w", "--stdin"], text);
	const tree = execGit(root, ["mktree"], `100644 blob ${blob}\tREADME.md\n`);
	return git(root, "commit-tree", tree, "-p", "HEAD", "-m", "next");
}

/** The stdout of `git <args>` in `root` with `input` on stdin, trimmed. */
function execGit(root: string, args: readonly string[], input: string): string {
	return execFileSync("git", args, {
		cwd: root,
		input,
		encoding: "utf8",
		env: { ...process.env, GIT_CONFIG_GLOBAL: "/dev/null", GIT_CONFIG_NOSYSTEM: "1" },
	}).trim();
}

test("the compare-and-swap of HEAD leaves a branch that moved where it is and moves one still at the expected commit", async (t) => {
	const root = await project(t);
	const head = headCommit(root);
	const next = nextCommit(root, "next\n");
	const moved = nextCommit(root, "another session\n");
	git(root, "update-ref", "HEAD", moved);
	const refused = moveHead(root, head, next, "commit: next");
	const kept = headCommit(root);
	git(root, "update-ref", "HEAD", head);
	assert.deepEqual(
		[refused, kept, moveHead(root, head, next, "commit: next"), headCommit(root), git(root, "symbolic-ref", "HEAD")],
		[false, moved, true, next, "refs/heads/main"],
	);
});

test("the two-way read-tree of a new commit keeps an unrelated uncommitted file and brings the commit's paths", async (t) => {
	const root = await project(t);
	const head = headCommit(root);
	const next = nextCommit(root, "next\n");
	await writeFile(join(root, "notes.txt"), "another session's file\n");
	git(root, "update-ref", "HEAD", next, head);
	followCommit(root, head, next);
	assert.deepEqual(
		[
			await readFile(join(root, "README.md"), "utf8"),
			await readFile(join(root, "notes.txt"), "utf8"),
			git(root, "status", "--porcelain"),
		],
		["next\n", "another session's file\n", "?? notes.txt"],
	);
});

test("GIT_FAILED: the two-way read-tree refuses to overwrite a file of the new commit that changed, and changes nothing", async (t) => {
	const root = await project(t);
	const head = headCommit(root);
	const next = nextCommit(root, "next\n");
	await writeFile(join(root, "README.md"), "another session's edit\n");
	git(root, "update-ref", "HEAD", next, head);
	assert.throws(
		() => followCommit(root, head, next),
		(error: unknown) => error instanceof LimenError && error.class === "environment" && error.code === "GIT_FAILED",
	);
	assert.deepEqual(
		[await readFile(join(root, "README.md"), "utf8"), git(root, "diff", "--cached", "--name-only", head)],
		["another session's edit\n", ""],
	);
});

test("the hook run gives a hook's exit status and its output, and a hook that is missing passes", async (t) => {
	const root = await project(t);
	await mkdir(join(root, ".git/hooks"), { recursive: true });
	await writeFile(
		join(root, ".git/hooks/pre-commit"),
		'#!/bin/sh\necho "on stdout $1"\necho "on stderr" >&2\nexit 3\n',
	);
	await chmod(join(root, ".git/hooks/pre-commit"), 0o755);
	assert.deepEqual(
		[runHook(root, "pre-commit", ["one"], process.env), runHook(root, "commit-msg", ["file"], process.env)],
		[
			{ status: 3, output: "on stdout one\non stderr\n" },
			{ status: 0, output: "" },
		],
	);
});

test("MISSING_TOOL: a git on PATH that cannot start makes the central git runner throw an environment error naming git", async (t) => {
	const folder = await realpath(await mkdtemp(join(tmpdir(), "limen-git-")));
	t.after(() => rm(folder, { recursive: true, force: true }));
	// A file without the execute bit: starting it fails with EACCES, and no other git on this PATH stands in.
	await writeFile(join(folder, "git"), "#!/bin/sh\n", { mode: 0o644 });
	const path = process.env.PATH;
	process.env.PATH = folder;
	t.after(() => {
		process.env.PATH = path;
	});
	assert.throws(
		() => isGitRepository(folder),
		(error: unknown) =>
			error instanceof LimenError &&
			error.class === "environment" &&
			error.code === "MISSING_TOOL" &&
			/^git cannot start/.test(error.message),
	);
});

// One argument longer than the kernel takes (128 KiB) makes the spawn fail with E2BIG: git is there, but this call
// cannot run, which no missing tool explains.
test("a spawn error of the central git runner other than ENOENT or EACCES goes up as it is, not as a missing tool", async (t) => {
	const folder = await realpath(await mkdtemp(join(tmpdir(), "limen-git-")));
	t.after(() => rm(folder, { recursive: true, force: true }));
	assert.throws(
		() => commitHasFile(folder, "HEAD", "x".repeat(200_000)),
		(error: unknown) =>
			!(error instanceof LimenError) && error instanceof Error && "code" in error && error.code === "E2BIG",
	);
});

// T-02: a git failure is the environment's (exit 4); before R-092 a failed git call was a plain Error, which ended a
// command UNTYPED with exit 1.
test("GIT_FAILED: a git call that must succeed and fails throws an environment error with git's words", async (t) => {
	const folder = await realpath(await mkdtemp(join(tmpdir(), "limen-git-")));
	t.after(() => rm(folder, { recursive: true, force: true }));
	assert.throws(
		() => headCommit(folder),
		(error: unknown) =>
			error instanceof LimenError &&
			error.class === "environment" &&
			error.code === "GIT_FAILED" &&
			/not a git repository/.test(error.message),
	);
});
