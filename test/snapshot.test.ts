// The shared state snapshot of the refusal tests (test/snapshot.ts): it stays equal while nothing changes, and each
// kind of trace a half-made change leaves makes it differ.
import assert from "node:assert/strict";
import { mkdir, mkdtemp, realpath, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { type TestContext, test } from "node:test";
import { git, repository } from "./plant.ts";
import { snapshot } from "./snapshot.ts";

/** A repository with a committed `spec/` and an ignored `.limen/`, as `limen init` leaves a project. */
async function project(t: TestContext): Promise<string> {
	const parent = await realpath(await mkdtemp(join(tmpdir(), "limen-snapshot-")));
	t.after(() => rm(parent, { recursive: true, force: true }));
	const root = join(parent, "repo");
	await repository(root);
	await mkdir(join(root, ".limen/jobs"), { recursive: true });
	await mkdir(join(root, "spec/features/active"), { recursive: true });
	await writeFile(join(root, ".gitignore"), ".limen/\n");
	await writeFile(join(root, "spec/build.md"), "# Board\n");
	git(root, "add", "-A");
	git(root, "commit", "-qm", "project");
	return root;
}

test("two snapshots of a project nothing changed between are equal", async (t) => {
	const root = await project(t);
	assert.deepEqual(snapshot(root), snapshot(root));
});

test("a new branch makes the snapshot differ in its refs", async (t) => {
	const root = await project(t);
	const before = snapshot(root);
	git(root, "branch", "other");
	assert.notDeepEqual(snapshot(root).refs, before.refs);
});

test("a moved HEAD makes the snapshot differ in its refs", async (t) => {
	const root = await project(t);
	const before = snapshot(root);
	git(root, "commit", "-q", "--allow-empty", "-m", "moved");
	assert.notDeepEqual(snapshot(root).refs, before.refs);
});

test("a new worktree makes the snapshot differ in its worktree list", async (t) => {
	const root = await project(t);
	const before = snapshot(root);
	git(root, "worktree", "add", "-q", "--detach", join(root, "..", "tree"));
	assert.notDeepEqual(snapshot(root).worktrees, before.worktrees);
});

test("an empty folder for job worktrees beside the repository makes the snapshot differ", async (t) => {
	const root = await project(t);
	const before = snapshot(root);
	await mkdir(join(root, "..", ".repo-limen-worktrees"));
	assert.deepEqual([before.worktreeFolder, snapshot(root).worktreeFolder], [null, []]);
});

test("a new empty folder in the project outside .limen/ and spec/ makes the snapshot differ in its folders", async (t) => {
	const root = await project(t);
	const before = snapshot(root);
	await mkdir(join(root, "x.html"));
	assert.deepEqual([before.folders.includes("x.html"), snapshot(root).folders.includes("x.html")], [false, true]);
});

test("an untracked file outside the digested folders makes the snapshot differ in its status", async (t) => {
	const root = await project(t);
	const before = snapshot(root);
	await writeFile(join(root, "model.json"), "{}\n");
	assert.notDeepEqual(snapshot(root).status, before.status);
});

test("a changed file, a new file and a new empty folder under .limen/ make the snapshot differ in its digest", async (t) => {
	const root = await project(t);
	const changes = [
		() => writeFile(join(root, ".limen/jobs/log"), "one\n"),
		() => writeFile(join(root, ".limen/jobs/log"), "two\n"),
		() => mkdir(join(root, ".limen/groups")),
	];
	for (const change of changes) {
		const before = snapshot(root);
		await change();
		assert.notDeepEqual(snapshot(root).files, before.files);
	}
});

test("a changed file under spec/ makes the snapshot differ in its digest", async (t) => {
	const root = await project(t);
	const before = snapshot(root);
	await writeFile(join(root, "spec/build.md"), "# Board, changed\n");
	assert.notDeepEqual(snapshot(root).files, before.files);
});

test("a folder named in also is digested too", async (t) => {
	const root = await project(t);
	await mkdir(join(root, ".git/hooks"), { recursive: true });
	const before = snapshot(root, [".git/hooks"]);
	await writeFile(join(root, ".git/hooks/post-commit"), "#!/bin/sh\n");
	assert.notDeepEqual(snapshot(root, [".git/hooks"]).files, before.files);
});

// The read test of test/registry.test.ts digests a test project's seat this way (D-045 (6.3)).
test("the seat's folder beside the root, named in also as ../.limen, is digested too", async (t) => {
	const root = await project(t);
	await mkdir(join(root, "../.limen"), { recursive: true });
	const before = snapshot(root, ["../.limen"]);
	await writeFile(join(root, "../.limen/start-reading.json"), "{}\n");
	assert.notDeepEqual(snapshot(root, ["../.limen"]).files, before.files);
});

// `symbolic-ref -q HEAD` fails by design on a detached HEAD, which has no branch name; the snapshot reads that as empty.
test("a detached HEAD, which names no branch, makes the snapshot differ in its refs", async (t) => {
	const root = await project(t);
	const before = snapshot(root);
	git(root, "checkout", "-q", "--detach");
	assert.notDeepEqual(snapshot(root).refs, before.refs);
});

// Before R-099 every git part read as "" when git failed, so two snapshots where git cannot run were equal, and a
// refusal test there missed a new branch or worktree. A `.git` file that names no repository makes git fail there.
test("a snapshot where git cannot run fails and names the git call", async (t) => {
	const root = await project(t);
	await rm(join(root, ".git"), { recursive: true, force: true });
	await writeFile(join(root, ".git"), `gitdir: ${join(root, "..", "no-repository")}\n`);
	assert.throws(() => snapshot(root), /git for-each-ref/);
});
