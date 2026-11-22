// src/commands/land.ts: `limen land` through the CLI, and the worktree with unlanded work that it keeps (A-001).
import assert from "node:assert/strict";
import { readFile, writeFile } from "node:fs/promises";
import { join } from "node:path";
import test from "node:test";
import { outputText, readOutcome } from "../final-line.ts";
import { git, jobDir, jobRecord, limen, nestedJob, plant, spawnJob, waitJob, writeRecord } from "../plant.ts";

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
