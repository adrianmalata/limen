// The central git runner of src/project/git.ts: a git that cannot start is an environment failure that names git, and
// any other spawn error goes up as it is.
import assert from "node:assert/strict";
import { mkdtemp, realpath, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { test } from "node:test";
import { LimenError } from "../../src/outcome.ts";
import { commitHasFile, isGitRepository } from "../../src/project/git.ts";

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
