// src/runtime/pruning.ts on a plant: the prune of the seat sweep's daily steps moves what Git does not hold elsewhere
// into the job archive, byte for byte and once, skips a folder gone since its listing, and names what it moved on one
// line; a finished job's live scope keeps its worktree; and the gitlink rule.
import assert from "node:assert/strict";
import fs, { existsSync, readdirSync, readFileSync, renameSync } from "node:fs";
import { mkdir, mkdtemp, rename, rm, writeFile } from "node:fs/promises";
import { syncBuiltinESMExports } from "node:module";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { type TestContext, test } from "node:test";
import { worktreeGuard } from "../../src/job/publication.ts";
import { withLock } from "../../src/lock.ts";
import { LimenError } from "../../src/outcome.ts";
import { pruneFinishedWorktrees, pruneLine } from "../../src/runtime/pruning.ts";
import { withEnvironment } from "../environment.ts";
import { git, jobDir, jobRecord, nestedJob, type Plant, plant, spawnJob, waitJob, writeRecord } from "../plant.ts";

/** A fresh plant, removed after the test. */
async function fresh(t: TestContext): Promise<Plant> {
	const p = await plant();
	t.after(() => p.cleanup());
	return p;
}

/** Every file below `dir` with its bytes in base64, by its path below `dir`; none when `dir` does not exist. */
function tree(dir: string): Record<string, string> {
	const files: Record<string, string> = {};
	if (!existsSync(dir)) {
		return files;
	}
	for (const entry of readdirSync(dir, { recursive: true, withFileTypes: true })) {
		if (entry.isFile()) {
			const path = join(entry.parentPath, entry.name);
			files[path.slice(dir.length + 1)] = readFileSync(path).toString("base64");
		}
	}
	return files;
}

/** The folder beside the plant's repository that Limen makes its job worktrees in. */
const worktreeRoot = (p: Plant) => join(p.parent, ".repo-limen-worktrees");

/** The month folder of the job archive for the UTC month of `at`. */
const archiveOf = (p: Plant, at: string) => join(p.root, ".limen", "archive", at.slice(0, 7));

/** The folder of the project's archive that takes the folders of the worktree root Git does not register. */
const unregisteredOf = (p: Plant) => join(p.root, ".limen", "archive", "unregistered");

/** The one reason of every folder of the worktree root that Git does not register (R-104 Decision 2). */
const UNREGISTERED = "the directory is not a registered Git worktree";

/** The lock wait of the tests of a held lock: 200 ms instead of 60 s, so a prune that still waits fails at once. */
const SHORT_WAIT = { LIMEN_LOCK_WAIT_MS: "200" };

// D-097 (4) (d), z. 29 (R-031 open point 1): before R-101 prune deleted the folder of such a record with all it held.
test("prune moves a record that never started, its spawner gone, to the job archive of its start's month, every file byte for byte, and a second prune moves nothing", async (t) => {
	const p = await fresh(t);
	const id = "2026-10-01-stale-1a2b3c4d";
	const dir = jobDir(p, id);
	await writeRecord(dir, { state: "starting", startedAt: "2026-10-01T00:00:00.000Z", spawnerPid: null });
	await writeFile(join(dir, "task.md"), "the task, which nothing else holds\n");
	await writeFile(join(dir, "log"), Buffer.from([0, 1, 2, 255]));
	const before = tree(dir);
	const target = join(archiveOf(p, "2026-10-01"), id);
	const first = await pruneFinishedWorktrees(p.root);
	const second = await pruneFinishedWorktrees(p.root);
	assert.deepEqual(
		{ left: existsSync(dir), archived: tree(target), lines: first.removed.map(pruneLine), again: second.removed },
		{
			left: false,
			archived: before,
			lines: [`archived ${dir} to ${target} (job ${id}): its record never started and its spawner is gone`],
			again: [],
		},
	);
});

test("prune moves a folder of .limen/jobs/ with no record to the job archive of the month of the move, every file byte for byte, and a second prune moves nothing", async (t) => {
	const p = await fresh(t);
	const id = "2026-11-24-norecord-1a2b3c4d";
	const dir = jobDir(p, id);
	await mkdir(join(dir, "session"), { recursive: true });
	await writeFile(join(dir, "session", "2026-11-24T00-00-00-000Z_a.jsonl"), '{"type":"session"}\n');
	const before = tree(dir);
	const month = new Date().toISOString();
	const first = await pruneFinishedWorktrees(p.root);
	const second = await pruneFinishedWorktrees(p.root);
	const target = join(archiveOf(p, month), id);
	assert.deepEqual(
		[existsSync(dir), tree(target), first.removed.map(pruneLine), second.removed],
		[false, before, [`archived ${dir} to ${target} (job ${id}): the folder holds no record`], []],
	);
});

// D-080 (R-099 open point 8): a crash before publication's rename left `.limen/.publishing-<id>`, which nothing removed.
test("prune moves a publication's folder past its grace, its spawner gone, to the job archive once and leaves one within its grace", async (t) => {
	const p = await fresh(t);
	const [old, young] = ["2026-10-02-left-1a2b3c4d", "2026-11-24-young-5e6f7a8b"];
	const recent = new Date().toISOString();
	for (const [id, startedAt] of [
		[old, "2026-10-02T00:00:00.000Z"],
		[young, recent],
	] as const) {
		await writeRecord(jobDir(p, id), { state: "starting", startedAt, spawnerPid: null });
		await writeFile(join(jobDir(p, id), "task.md"), `the task of ${id}\n`);
		await rename(jobDir(p, id), join(p.root, ".limen", `.publishing-${id}`));
	}
	const publishing = join(p.root, ".limen", `.publishing-${old}`);
	const before = tree(publishing);
	const { removed } = await pruneFinishedWorktrees(p.root);
	const second = await pruneFinishedWorktrees(p.root);
	const target = join(archiveOf(p, "2026-10-02"), old);
	assert.deepEqual(
		{
			archived: tree(target),
			old: existsSync(publishing),
			young: existsSync(join(p.root, ".limen", `.publishing-${young}`)),
			lines: removed.map(pruneLine),
			again: second.removed,
		},
		{
			archived: before,
			old: false,
			young: true,
			lines: [
				`archived ${publishing} to ${target} (job ${old}): its publication never finished and its spawner is gone`,
			],
			again: [],
		},
	);
});

// R-101 review round 1, F4: a spawn renames its `.limen/.publishing-<id>` into `.limen/jobs/` under the worktree lock,
// which prune does not hold while it lists those folders, so one can go between the listing and its stat; before the
// fix that stat's ENOENT failed the daily prune. The rename runs inside the stat of that folder, so it falls there.
test("prune skips a publication's folder that its spawn renamed into .limen/jobs/ between the listing and its stat", async (t) => {
	const p = await fresh(t);
	const id = "2026-11-24-renamed-1a2b3c4d";
	await writeRecord(jobDir(p, id), { state: "starting", startedAt: new Date().toISOString(), spawnerPid: process.pid });
	const publishing = join(p.root, ".limen", `.publishing-${id}`);
	await rename(jobDir(p, id), publishing);
	const original = fs.statSync;
	const stat = t.mock.method(fs, "statSync", (path: fs.PathLike, options?: fs.StatSyncOptions) => {
		if (String(path) === publishing && existsSync(publishing)) {
			renameSync(publishing, jobDir(p, id));
		}
		return original(path, options);
	});
	syncBuiltinESMExports();
	let pruned: Awaited<ReturnType<typeof pruneFinishedWorktrees>>;
	try {
		pruned = await pruneFinishedWorktrees(p.root);
	} finally {
		stat.mock.restore();
		syncBuiltinESMExports();
	}
	assert.deepEqual([pruned.removed, existsSync(join(jobDir(p, id), "record.json"))], [[], true]);
});

// D-097 (4) (d): before R-101 prune deleted such a folder with all it held, since `git status` reads nothing there.
test("prune moves a folder of the worktree root that Git does not register and that holds no .git into the project's archive, under a name that is no month, once", async (t) => {
	const p = await fresh(t);
	const leftover = join(worktreeRoot(p), "leftover");
	await mkdir(join(leftover, "sub"), { recursive: true });
	await writeFile(join(leftover, "notes.txt"), "a note in no checkout\n");
	await writeFile(join(leftover, "sub", "data.bin"), Buffer.from([9, 8, 7]));
	const before = tree(leftover);
	const first = await pruneFinishedWorktrees(p.root);
	const second = await pruneFinishedWorktrees(p.root);
	const unregistered = join(p.root, ".limen", "archive", "unregistered");
	const [name = ""] = existsSync(unregistered) ? readdirSync(unregistered) : [];
	assert.match(name, /^leftover-\d{4}-\d\d-\d\dT\d\d-\d\d-\d\d-\d{3}Z$/);
	assert.deepEqual(
		[existsSync(leftover), tree(join(unregistered, name)), first.removed.map(pruneLine), second.removed],
		[false, before, [`archived ${leftover} to ${join(unregistered, name)} (job none): ${UNREGISTERED}`], []],
	);
});

// R-101 review round 1, F3 (z. 15): a job can name a folder of the worktree root, and the sweep's lines reach the
// coordinator's model, so a name with a newline could add a line of its own to them; before the fix it did.
test("the line of a folder prune moves names the folder and its archive folder escaped, on one line", async (t) => {
	const p = await fresh(t);
	const name = "leftover\nretired 2026-11-24-fake-1a2b3c4d";
	await mkdir(join(worktreeRoot(p), name), { recursive: true });
	const { removed } = await pruneFinishedWorktrees(p.root);
	const [to = ""] = removed.map((removal) => removal.to ?? "");
	const escaped = (path: string) => path.replaceAll("\n", "\\n");
	assert.deepEqual(removed.map(pruneLine), [
		`archived ${escaped(join(worktreeRoot(p), name))} to ${escaped(to)} (job none): ${UNREGISTERED}`,
	]);
});

/**
 * Two prunes of the plant `p` and what they show of the folder `path` of its worktree root, which Git does not
 * register: where the first moved it (`to`), whether it is still there, the folder that took it and what that holds,
 * the first's lines, and what the second removed.
 */
async function prunedTwice(p: Plant, path: string) {
	const first = await pruneFinishedWorktrees(p.root);
	const second = await pruneFinishedWorktrees(p.root);
	const [to = ""] = first.removed.map((removal) => removal.to ?? "");
	const lines = first.removed.map(pruneLine);
	return { to, shown: { left: existsSync(path), into: dirname(to), archived: tree(to), lines, again: second.removed } };
}

// D-107 (4), R-101 open point 3 (z. 29): before R-104 prune deleted a clean clone that Git does not register, and with
// it the commit that only the clone's own `.git` held.
test("prune moves a clean clone in the worktree root that Git does not register, its .git with it, into the project's archive, every file byte for byte, once", async (t) => {
	const p = await fresh(t);
	const clone = join(worktreeRoot(p), "clone");
	await mkdir(worktreeRoot(p), { recursive: true });
	git(p.parent, "clone", "-q", p.root, clone);
	const identity = ["-c", "user.name=Limen Test", "-c", "user.email=limen@example.test"];
	git(clone, ...identity, "commit", "-q", "--allow-empty", "-m", "a commit only the clone holds");
	assert.equal(git(clone, "status", "--porcelain"), "", "the clone is clean");
	const before = tree(clone);
	const { to, shown } = await prunedTwice(p, clone);
	assert.deepEqual(shown, {
		left: false,
		into: unregisteredOf(p),
		archived: before,
		lines: [`archived ${clone} to ${to} (job none): ${UNREGISTERED}`],
		again: [],
	});
});

// R-104 Decision 9 (z. 29): Git 2.56.1 reads such a `.git` as a failure, `gitfile does not point to a valid
// repository`, not as no checkout, so the held checks, which come first (Decision 1), stop the prune before anything
// moves; this guard keeps that stop from turning into a deletion of what the folder holds.
test("a folder of the worktree root whose .git names a gitdir that is gone fails the prune with GIT_FAILED, the message names the folder, and the folder stays byte for byte", async (t) => {
	const p = await fresh(t);
	const stale = join(worktreeRoot(p), "stale");
	await mkdir(stale, { recursive: true });
	await writeFile(join(stale, ".git"), `gitdir: ${join(p.root, ".git", "worktrees", "gone")}\n`);
	await writeFile(join(stale, "notes.txt"), "a note that no branch holds\n");
	const before = tree(stale);
	await assert.rejects(
		pruneFinishedWorktrees(p.root),
		(error: unknown) => error instanceof LimenError && error.code === "GIT_FAILED" && error.message.includes(stale),
	);
	assert.deepEqual(tree(stale), before);
});

// R-104, R-101 open point 6: prune waited up to 60 s for a folder's own lock while it held the jobs lock, which every
// spawn's token draw takes, and a lock held past the wait failed the daily prune with LOCK_TIMEOUT.
test("prune keeps a record that never started while another process holds its lock, names it as held, and moves it at the next prune", async (t) => {
	const p = await fresh(t);
	withEnvironment(t, SHORT_WAIT);
	const id = "2026-10-03-locked-1a2b3c4d";
	const dir = jobDir(p, id);
	await writeRecord(dir, { state: "starting", startedAt: "2026-10-03T00:00:00.000Z", spawnerPid: null });
	const whileHeld = await withLock({ folder: dir }, () => pruneFinishedWorktrees(p.root));
	const next = await pruneFinishedWorktrees(p.root);
	const target = join(archiveOf(p, "2026-10-03"), id);
	assert.deepEqual(
		{
			held: whileHeld.held,
			removed: whileHeld.removed,
			moved: next.removed.map((removal) => removal.to),
			record: existsSync(join(target, "record.json")),
		},
		{ held: [id], removed: [], moved: [target], record: true },
	);
});

/** Plants a publication's folder `.limen/.publishing-<id>` below `root` that a spawn left in October 2026; its path. */
async function leftPublication(root: string, id: string): Promise<string> {
	const jobs = join(root, ".limen", "jobs");
	await writeRecord(join(jobs, id), { state: "starting", startedAt: "2026-10-04T00:00:00.000Z", spawnerPid: null });
	const publishing = join(root, ".limen", `.publishing-${id}`);
	await rename(join(jobs, id), publishing);
	return publishing;
}

// R-104: the move of a publication's folder took the folder's own lock with a wait, under the jobs lock.
test("prune keeps a publication's left folder while another process holds its lock, names it as held, and moves it at the next prune", async (t) => {
	const p = await fresh(t);
	withEnvironment(t, SHORT_WAIT);
	const id = "2026-10-04-locked-5e6f7a8b";
	const publishing = await leftPublication(p.root, id);
	const whileHeld = await withLock({ folder: publishing }, () => pruneFinishedWorktrees(p.root));
	const next = await pruneFinishedWorktrees(p.root);
	const target = join(archiveOf(p, "2026-10-04"), id);
	assert.deepEqual(
		{ held: whileHeld.held, removed: whileHeld.removed, moved: next.removed.map((removal) => removal.to) },
		{ held: [id], removed: [], moved: [target] },
	);
});

// R-104 Decision 3: the worktree lock, which a publication's move takes under the jobs lock, was taken with a wait too.
// A project with no Git repository has no worktree pass, which takes that lock with a wait outside the jobs lock.
test("prune keeps a publication's left folder while another process holds the worktree lock, in a project with no Git repository, and moves it at the next prune", async (t) => {
	const root = await mkdtemp(join(tmpdir(), "limen-prune-"));
	t.after(() => rm(root, { recursive: true, force: true }));
	withEnvironment(t, SHORT_WAIT);
	const id = "2026-10-04-waiting-9a8b7c6d";
	const publishing = await leftPublication(root, id);
	const lock = worktreeGuard(join(root, ".limen", "jobs"));
	const whileHeld = await withLock(lock, () => pruneFinishedWorktrees(root));
	const left = existsSync(publishing);
	const next = await pruneFinishedWorktrees(root);
	assert.deepEqual(
		{ held: whileHeld.held, removed: whileHeld.removed, left, moved: next.removed.map((removal) => removal.to) },
		{ held: [id], removed: [], left: true, moved: [join(root, ".limen", "archive", "2026-10", id)] },
	);
});

// R-027 Out of scope, D-097 (4) (e): a terminal job whose scope end failed may still run processes in its worktree.
test("prune keeps the clean worktree of a finished job while its scope holds processes, and removes one whose scope is empty", async (t) => {
	const p = await fresh(t);
	const [live, ended] = [spawnJob(p, "say live"), spawnJob(p, "say ended")];
	assert.deepEqual([waitJob(p, live), waitJob(p, ended)], ["done", "done"]);
	const cgroup = jobRecord(p, live)?.scope?.cgroup ?? "";
	const root = p.env.LIMEN_CGROUP_ROOT ?? "";
	await mkdir(join(root, cgroup), { recursive: true });
	await writeFile(join(root, cgroup, "cgroup.events"), "populated 1\nfrozen 0\n");
	withEnvironment(t, { LIMEN_CGROUP_ROOT: root });
	await pruneFinishedWorktrees(p.root);
	assert.deepEqual(
		[existsSync(jobRecord(p, live)?.worktree ?? ""), existsSync(jobRecord(p, ended)?.worktree ?? "")],
		[true, false],
	);
});

// D-088 (R-030 review round 5, note 2): a gitlink that no nested `.git` backs names a commit this worktree does not
// hold, so removing the worktree loses nothing; before R-101 such a gitlink on main kept every worktree for ever.
test("prune removes a finished job's clean worktree whose gitlink to a commit the project lacks has no nested .git", async (t) => {
	const p = await fresh(t);
	git(p.root, "update-index", "--add", "--cacheinfo", `160000,${"1".repeat(40)},vendor/lib`);
	git(p.root, "commit", "-q", "-m", "record a submodule that is not checked out");
	const id = spawnJob(p, "say clean");
	assert.equal(waitJob(p, id), "done");
	const worktree = jobRecord(p, id)?.worktree ?? "";
	assert.equal(git(worktree, "status", "--porcelain"), "", "the worktree is clean");
	const { removed, kept } = await pruneFinishedWorktrees(p.root);
	assert.deepEqual([existsSync(worktree), kept, removed.map((removal) => removal.path)], [false, [], [worktree]]);
});

// D-088 (R-030 review round 5, note 3): before R-101 the failure gave Git's words only, so nobody knew which worktree.
test("a clean candidate whose HEAD has no commit fails the prune with GIT_FAILED, and the message names the worktree", async (t) => {
	const p = await fresh(t);
	const orphan = join(worktreeRoot(p), "orphan");
	git(p.root, "worktree", "add", "-q", "--orphan", "-b", "orphan", orphan);
	await assert.rejects(
		pruneFinishedWorktrees(p.root),
		(error: unknown) => error instanceof LimenError && error.code === "GIT_FAILED" && error.message.includes(orphan),
	);
	assert.ok(existsSync(orphan), "the worktree stays");
});

// D-088 (R-030 review round 5, note 4): a `-z` entry was split at every tab, so a gitlink path with a tab was cut there.
test("prune names a nested repository whose path holds a tab whole in the kept line of its worktree", async (t) => {
	const p = await fresh(t);
	const job = await nestedJob(p, "vendor/a\tb", { committed: true, untracked: false, done: true });
	git(p.root, "merge", "-q", "--no-edit", jobRecord(p, job.id)?.branch ?? "");
	const { kept } = await pruneFinishedWorktrees(p.root);
	assert.deepEqual(kept, [
		{
			path: job.worktree,
			job: job.id,
			reason: "the nested repository vendor/a\\tb holds a commit that the project's repository lacks",
		},
	]);
});
