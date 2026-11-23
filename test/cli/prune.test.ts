// `limen prune --retire` (A-002): only a finished job with a `landed` or `abandoned` marker and no unlanded work moves,
// whole, to the job archive `.limen/archive/<YYYY-MM>/<id>/`; a job with no marker stays, whatever the git graph says.
import assert from "node:assert/strict";
import { existsSync, readdirSync, readFileSync } from "node:fs";
import { chmod, mkdir, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { test } from "node:test";
import { outputText } from "../final-line.ts";
import { git, jobDir, jobRecord, limen, type Plant, plant, spawnJob, waitJob } from "../plant.ts";
import { snapshot } from "../snapshot.ts";

/** Every file below `dir` with its text, by its path below `dir`. */
function tree(dir: string): Record<string, string> {
	const files: Record<string, string> = {};
	for (const entry of readdirSync(dir, { recursive: true, withFileTypes: true })) {
		if (entry.isFile()) {
			const path = join(entry.parentPath, entry.name);
			files[path.slice(dir.length + 1)] = readFileSync(path, "utf8");
		}
	}
	return files;
}

/** A done job of the plant with one commit on its branch, and a transcript and a result in its folder. */
async function finishedJob(p: Plant): Promise<string> {
	const id = spawnJob(p, "commit");
	assert.equal(waitJob(p, id), "done");
	await mkdir(join(jobDir(p, id), "session"), { recursive: true });
	await writeFile(join(jobDir(p, id), "session", "2026-11-23T00-00-00-000Z_a.jsonl"), '{"type":"session"}\n');
	await writeFile(join(jobDir(p, id), "result"), "the job's result\n");
	return id;
}

/** The folder of the job archive that a job marked at the ISO time `at` moves to. */
function archived(p: Plant, id: string, at: string | undefined): string {
	return join(p.root, ".limen", "archive", (at ?? "").slice(0, 7), id);
}

// A-002: before R-031 retire took a branch still at its base, or gone, for landed, and deleted both records.
test("A-002: prune --retire keeps the record of a failed job with no commit and of a job whose branch a human deleted", async (t) => {
	const p = await plant();
	t.after(() => p.cleanup());
	const failed = spawnJob(p, "fail 3");
	assert.equal(waitJob(p, failed), "failed");
	const gone = spawnJob(p, "commit");
	assert.equal(waitJob(p, gone), "done");
	const record = jobRecord(p, gone);
	git(p.root, "worktree", "remove", "--force", record?.worktree ?? "");
	git(p.root, "branch", "-D", record?.branch ?? "");
	const before = [tree(jobDir(p, failed)), tree(jobDir(p, gone))];
	const run = limen(p, ["prune", "--retire"]);
	assert.equal(run.status, 0, run.stderr);
	assert.deepEqual(
		[outputText(run), [tree(jobDir(p, failed)), tree(jobDir(p, gone))], existsSync(join(p.root, ".limen", "archive"))],
		["no finished jobs to retire\n", before, false],
	);
});

// T-28 (3): retire moves data, so nothing of the folder is lost: the archive holds every file byte for byte.
test("limen prune: --retire moves a landed job's folder to the job archive of its marker's month, every file byte for byte", async (t) => {
	const p = await plant();
	t.after(() => p.cleanup());
	const id = await finishedJob(p);
	const landed = limen(p, ["land", id]);
	assert.equal(landed.status, 0, landed.stderr);
	const before = tree(jobDir(p, id));
	const target = archived(p, id, jobRecord(p, id)?.landed?.at);
	const run = limen(p, ["prune", "--retire"]);
	assert.equal(run.status, 0, run.stderr);
	assert.deepEqual(
		[existsSync(jobDir(p, id)), existsSync(target) && tree(target), outputText(run).split("\n").slice(0, 2)],
		[false, before, [`retired ${id} to .limen/archive/${target.split("/").slice(-2).join("/")}`, "retired 1 job"]],
	);
	assert.ok(before["record.json"] && before.log && before.result && before["session/2026-11-23T00-00-00-000Z_a.jsonl"]);
});

// Review round 1, F5: the run keeps a landed branch whose worktree stays, and the job's record with it; before the fix
// the dry run named that job as one it would retire.
test("prune --retire --dry-run names no job whose landed branch the run keeps with its worktree, and names the worktree", async (t) => {
	const p = await plant();
	t.after(() => p.cleanup());
	const id = await finishedJob(p);
	const worktree = jobRecord(p, id)?.worktree ?? "";
	const inner = join(worktree, ".limen/inner");
	git(p.root, "worktree", "add", "-q", "--detach", inner, "HEAD");
	assert.equal(limen(p, ["land", id]).status, 0);
	const lines = [
		`kept ${worktree} (job ${id}): it holds the registered worktree ${inner}`,
		"no finished jobs to retire",
		"",
	];
	const dry = limen(p, ["prune", "--retire", "--dry-run"]);
	assert.equal(dry.status, 0, dry.stderr);
	const run = limen(p, ["prune", "--retire"]);
	assert.equal(run.status, 0, run.stderr);
	assert.deepEqual(
		[outputText(dry).split("\n"), outputText(run).split("\n"), existsSync(jobDir(p, id))],
		[lines, lines, true],
	);
});

// R-031, review round 2, G5: the move is the one place a record leaves .limen/jobs/, so the month's folder must survive
// a crash before the job goes in; before the fix retire made it with mkdir and never synced .limen/archive/.
test("prune --retire syncs the job archive's folder before the move, so an archive folder it cannot open moves no job", async (t) => {
	if (process.getuid?.() === 0) {
		t.skip("root opens every folder");
		return;
	}
	const p = await plant();
	const archive = join(p.root, ".limen", "archive");
	t.after(async () => {
		if (existsSync(archive)) {
			await chmod(archive, 0o700);
		}
		await p.cleanup();
	});
	const id = await finishedJob(p);
	assert.equal(limen(p, ["land", id]).status, 0);
	const target = archived(p, id, jobRecord(p, id)?.landed?.at);
	// Write and search, but no read: the month's folder and the move are allowed; opening the archive is not.
	await mkdir(archive);
	await chmod(archive, 0o300);
	const run = limen(p, ["prune", "--retire"]);
	assert.deepEqual(
		[
			run.status === 0,
			existsSync(join(jobDir(p, id), "record.json")),
			existsSync(target),
			run.stderr.includes("EACCES"),
		],
		[false, true, false, true],
		run.stderr,
	);
});

test("a second prune --retire after a retire changes nothing and leaves the job in the job archive", async (t) => {
	const p = await plant();
	t.after(() => p.cleanup());
	const id = await finishedJob(p);
	assert.equal(limen(p, ["land", id]).status, 0);
	const target = archived(p, id, jobRecord(p, id)?.landed?.at);
	assert.equal(limen(p, ["prune", "--retire"]).status, 0);
	const after = snapshot(p.root);
	const again = limen(p, ["prune", "--retire"]);
	assert.equal(again.status, 0, again.stderr);
	assert.deepEqual(
		[outputText(again), snapshot(p.root), existsSync(join(target, "record.json"))],
		["no finished jobs to retire\n", after, true],
	);
});

// Before R-031 retire left an abandoned job whose own branch held commits outside HEAD in `.limen/jobs/` for ever.
test("prune --retire moves an abandoned job to the job archive and keeps its limen/abandon/<id> branch and its own branch", async (t) => {
	const p = await plant();
	t.after(() => p.cleanup());
	const id = spawnJob(p, "commit");
	assert.equal(waitJob(p, id), "done");
	const branch = jobRecord(p, id)?.branch ?? "";
	const abandoned = limen(p, ["abandon", id]);
	assert.equal(abandoned.status, 0, abandoned.stderr);
	const target = archived(p, id, jobRecord(p, id)?.abandoned?.at);
	const run = limen(p, ["prune", "--retire"]);
	assert.equal(run.status, 0, run.stderr);
	const refs = git(
		p.root,
		"for-each-ref",
		"--format=%(refname:short)",
		`refs/heads/${branch}`,
		"refs/heads/limen/abandon",
	);
	assert.deepEqual(
		[existsSync(jobDir(p, id)), existsSync(join(target, "record.json")), refs.split("\n").sort()],
		[false, true, [`limen/abandon/${id}`, branch].sort()],
	);
});
