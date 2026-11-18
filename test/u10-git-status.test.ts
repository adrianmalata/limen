// U10 · The status read of a worker's tree. It must not refresh that tree's index: on stale stat data plain
// `git status` takes index.lock and races the worker's own commit.
import assert from "node:assert/strict";
import { mkdtemp, readFile, rm, utimes, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";
import { worktreeState } from "../src/project/git.ts";
import { repository } from "./plant.ts";

// regression: 43c01cf
test("worktreeState reads a tree with stale stat data without rewriting its index", async (context) => {
	const root = await mkdtemp(join(tmpdir(), "limen-u10-"));
	context.after(() => rm(root, { recursive: true, force: true }));
	await repository(root);
	const index = join(root, ".git/index");
	const before = await readFile(index);
	await utimes(join(root, "README.md"), new Date(0), new Date(0));
	assert.deepEqual([worktreeState(root), await readFile(index)], ["clean", before]);
	await writeFile(join(root, "README.md"), "changed\n");
	assert.deepEqual([worktreeState(root), await readFile(index)], ["dirty", before]);
});
