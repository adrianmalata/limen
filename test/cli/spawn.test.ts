// `limen spawn`: the job it starts, each refusal with the snapshot unchanged, the context message it publishes, and
// what the job's model gets (A-086).
import assert from "node:assert/strict";
import { spawn } from "node:child_process";
import { existsSync, readdirSync, readFileSync } from "node:fs";
import { mkdir, writeFile } from "node:fs/promises";
import { basename, dirname, join } from "node:path";
import { test } from "node:test";
import { fileURLToPath } from "node:url";
import { isTerminal } from "../../src/job/job.ts";
import { platform } from "../../src/platform/platform.ts";
import { type BridgeView, SUMMARY_PREFIX } from "../../src/runtime/bridge-view.ts";
import { outputText, readOutcome } from "../final-line.ts";
import {
	engineViews,
	git,
	jobDir,
	jobFile,
	jobRecord,
	jobState,
	limen,
	type Plant,
	pathWithFailingScope,
	plant,
	release,
	routed,
	spawnJob,
	startedJob,
	TICKET,
	until,
	waitJob,
	writeRecord,
} from "../plant.ts";
import { snapshot } from "../snapshot.ts";

/** How long the job runs past its engine's start before the test looks: well past the 1 s the variable would give. */
const PAST_LEAK_MS = 2_500;

test("a spawn without --timeout from an environment that holds LIMEN_TIMEOUT_MS=1000 starts a job that outlives 1 s", async (t) => {
	const p = await plant();
	t.after(() => p.cleanup());
	const id = spawnJob(p, "block", ["--label", "leak"], { env: { LIMEN_TIMEOUT_MS: "1000" } });
	const dir = jobDir(p, id);
	// The wrapper logs "worker started" just before it sets its timeout; a job that times out ends the wait as well.
	const started = () => Date.parse(/\[limen (\S+)\] worker started/.exec(jobFile(p, id, "log"))?.[1] ?? "");
	await until(dir, () => isTerminal(jobState(p, id)) || Date.now() - started() > PAST_LEAK_MS);
	const log = jobFile(p, id, "log");
	assert.deepEqual(
		[jobState(p, id), log.match(/timeout after \d+ms/)?.[0], log.match(/worker started, time limit (\S+)/)?.[1]],
		["running", undefined, "1h30m"],
	);
	assert.equal(limen(p, ["stop", id, "test stop"]).status, 0);
	assert.equal(waitJob(p, id), "stopped");
});

// The first lone `--` ends the flags; the shared parser drops every later one from spawn's task (`dropsDashes` of the
// task in src/registry.ts), as spawn's own filter did before the parser read its words.
test("a spawn drops each lone -- from its task words, so the job's task holds the other words alone", async (t) => {
	const p = await plant();
	t.after(() => p.cleanup());
	const run = limen(p, ["spawn", ...routed(["--label", "dashes"]), "--", "say", "--", "kept", "--"]);
	assert.equal(run.status, 0, run.stderr);
	const id = startedJob(run);
	assert.equal(waitJob(p, id), "done");
	assert.equal(jobFile(p, id, "task.md"), "say kept");
});

/** A branch `feature` one commit past main, and back on main. */
function featureBranch(p: Plant): void {
	git(p.root, "checkout", "-qb", "feature");
	git(p.root, "commit", "-q", "--allow-empty", "-m", "feature work");
	git(p.root, "checkout", "-q", "main");
}

/** Spawns with `flags` and the test route in a plant where no job runs, and returns the run and both snapshots. */
function refusedSpawn(p: Plant, flags: readonly string[]) {
	const before = snapshot(p.root);
	const run = limen(p, ["spawn", ...routed(flags), "work"]);
	return { run, before, after: snapshot(p.root) };
}

// Before R-092 these refusals came after spawn had made the folder of job worktrees.
test("REVIEW_HEAD_MOVED: a review pinned to a head its branch has left exits 1 and leaves the snapshot identical", async (t) => {
	const p = await plant();
	t.after(() => p.cleanup());
	featureBranch(p);
	const { run, before, after } = refusedSpawn(p, [
		"--review",
		"--branch",
		"feature",
		"--head",
		git(p.root, "rev-parse", "main"),
	]);
	assert.deepEqual([run.status, readOutcome(run).code, after], [1, "REVIEW_HEAD_MOVED", before], run.stderr);
});

test("REVIEW_NEEDS_BRANCH: a review without --branch exits 2 and leaves the snapshot identical", async (t) => {
	const p = await plant();
	t.after(() => p.cleanup());
	const { run, before, after } = refusedSpawn(p, ["--review"]);
	assert.deepEqual([run.status, readOutcome(run).code, after], [2, "REVIEW_NEEDS_BRANCH", before], run.stderr);
});

test("BRANCH_MISSING: a review of a branch that does not exist exits 1 and leaves the snapshot identical", async (t) => {
	const p = await plant();
	t.after(() => p.cleanup());
	const { run, before, after } = refusedSpawn(p, ["--review", "--branch", "nope"]);
	assert.deepEqual([run.status, readOutcome(run).code, after], [1, "BRANCH_MISSING", before], run.stderr);
});

test("BRANCH_IN_PRIMARY: a spawn on the branch the primary worktree holds exits 1 and leaves the snapshot identical", async (t) => {
	const p = await plant();
	t.after(() => p.cleanup());
	const { run, before, after } = refusedSpawn(p, ["--branch", "main"]);
	assert.deepEqual([run.status, readOutcome(run).code, after], [1, "BRANCH_IN_PRIMARY", before], run.stderr);
});

// The running job is a record whose owner is a sleeping process of the test, not a wrapper: a wrapper writes its log
// and progress while it runs, so the snapshot would race it (test/snapshot.ts). Nothing writes in the plant but the
// refused spawn, which runs between the two snapshots.
test("BRANCH_LIVE_JOB: a spawn on a branch a running job works on exits 1 and leaves the snapshot identical", async (t) => {
	const p = await plant();
	t.after(() => p.cleanup());
	featureBranch(p);
	const owner = spawn(process.execPath, ["-e", "Atomics.wait(new Int32Array(new SharedArrayBuffer(4)), 0, 0)"], {
		stdio: "ignore",
	});
	t.after(() => owner.kill("SIGKILL"));
	const info = await platform.processInfo(owner.pid ?? 0);
	assert.ok(info.kind === "present", "the owner of the running job is present");
	const identity = { pid: info.process.pid, born: info.process.born, bootId: platform.bootId() ?? null };
	await writeRecord(jobDir(p, "2026-11-21-live-1a2b3c4d"), { state: "running", branch: "feature", identity });
	const { run, before, after } = refusedSpawn(p, ["--branch", "feature"]);
	assert.deepEqual([run.status, readOutcome(run).code, after], [1, "BRANCH_LIVE_JOB", before], run.stderr);
});

/**
 * A run of one team on the test route, written as group start writes it, with a team coordinator; the environment of
 * the member `as` names. No process owns its jobs, so nothing writes in the plant beside the command under test.
 */
async function teamRun(p: Plant, as: "coordinator" | "worker", fields: Record<string, unknown> = {}) {
	const coordinator = "2026-11-21-f001-team-1-1a2b3c4d";
	const worker = "2026-11-21-f001-worker-5e6f7a8b";
	const now = Date.now();
	const run = {
		id: "slot-group",
		root: p.root,
		feature: dirname(TICKET),
		lead: "slot-lead",
		startedAt: now,
		teams: ["team-1"],
		routes: { "team-1": { engine: "pi", provider: "p", model: "m", thinking: "high" } },
		workersPerTeam: 0,
		rounds: ["draft"],
		round: 0,
		deadline: now + 60 * 60_000,
		reserveMs: 60_000,
		stopped: false,
		closed: false,
		members: [
			{ id: coordinator, team: "team-1", role: "coordinator", deadline: now + 60 * 60_000, round: 0 },
			...(as === "worker" ? [{ id: worker, team: "team-1", role: "worker", deadline: now + 60 * 60_000 }] : []),
		],
		...fields,
	};
	await mkdir(join(p.root, ".limen/groups", run.id), { recursive: true });
	await writeFile(join(p.root, ".limen/groups", run.id, "run.json"), `${JSON.stringify(run)}\n`);
	return {
		LIMEN_JOB: "1",
		LIMEN_JOB_ID: as === "worker" ? worker : coordinator,
		LIMEN_CONTEXT_ROOT: p.root,
		LIMEN_GROUP_ID: run.id,
		LIMEN_TEAM_ID: "team-1",
	};
}

// Before R-092 the slot was claimed after the group's launch lock (a folder that stays) and the folder of job worktrees.
test("GROUP_ALLOWANCE: a team coordinator's spawn past its team's worker allowance exits 1 and leaves the snapshot identical", async (t) => {
	const p = await plant();
	t.after(() => p.cleanup());
	const env = await teamRun(p, "coordinator");
	const before = snapshot(p.root);
	const spawn = limen(p, ["spawn", ...routed([]), "say worker"], { env });
	assert.deepEqual(
		[spawn.status, readOutcome(spawn).code, snapshot(p.root)],
		[1, "GROUP_ALLOWANCE", before],
		spawn.stderr,
	);
});

// Before R-092 the review's team check came after the group's launch lock, a folder that stays.
test("GROUP_REVIEW_BRANCH: a team coordinator's review of a branch its team does not own exits 1 and leaves the snapshot identical", async (t) => {
	const p = await plant();
	t.after(() => p.cleanup());
	const env = await teamRun(p, "coordinator", { workersPerTeam: 1 });
	const before = snapshot(p.root);
	const spawn = limen(p, ["spawn", ...routed(["--review", "--branch", "main"]), "review it"], { env });
	assert.deepEqual(
		[spawn.status, readOutcome(spawn).code, snapshot(p.root)],
		[1, "GROUP_REVIEW_BRANCH", before],
		spawn.stderr,
	);
});

test("GROUP_WORKER_SPAWN: a group worker's spawn exits 1 and leaves the snapshot identical", async (t) => {
	const p = await plant();
	t.after(() => p.cleanup());
	const env = await teamRun(p, "worker", { workersPerTeam: 1 });
	const before = snapshot(p.root);
	const spawn = limen(p, ["spawn", ...routed([]), "say nested"], { env });
	assert.deepEqual(
		[spawn.status, readOutcome(spawn).code, snapshot(p.root)],
		[1, "GROUP_WORKER_SPAWN", before],
		spawn.stderr,
	);
});

// Before R-092 a name git refuses passed the checks, and the job failed at its worktree after its record existed.
test("BAD_BRANCH: a spawn on a --branch that is no branch name exits 2 and leaves the snapshot identical", async (t) => {
	const p = await plant();
	t.after(() => p.cleanup());
	const { run, before, after } = refusedSpawn(p, ["--branch", "a..b"]);
	assert.deepEqual([run.status, readOutcome(run).code, after], [2, "BAD_BRANCH", before], run.stderr);
});

test("BAD_TASK_FILE: a spawn whose --task-file names a folder exits 2 and leaves the snapshot identical", async (t) => {
	const p = await plant();
	t.after(() => p.cleanup());
	const { run, before, after } = refusedSpawn(p, ["--task-file", p.parent]);
	assert.deepEqual([run.status, readOutcome(run).code, after], [2, "BAD_TASK_FILE", before], run.stderr);
});

test("TASK_FILE_UNREADABLE: a spawn whose --task-file cannot be read exits 4 and leaves the snapshot identical", async (t) => {
	const p = await plant();
	t.after(() => p.cleanup());
	const file = join(p.parent, "task.md");
	await writeFile(file, "say hidden\n", { mode: 0o000 });
	const { run, before, after } = refusedSpawn(p, ["--task-file", file]);
	assert.deepEqual([run.status, readOutcome(run).code, after], [4, "TASK_FILE_UNREADABLE", before], run.stderr);
});

// T-02: Pi and Herdr set these, so an unsafe value is the environment's failure; before R-092 a plain Error, UNTYPED.
test("UNSAFE_PI_SESSION_ID: a spawn whose PI_SESSION_ID is not safe to route by exits 4 and leaves the snapshot identical", async (t) => {
	const p = await plant();
	t.after(() => p.cleanup());
	const before = snapshot(p.root);
	const run = limen(p, ["spawn", ...routed([]), "work"], { env: { PI_SESSION_ID: "no good/../id" } });
	assert.deepEqual(
		[run.status, readOutcome(run).code, snapshot(p.root)],
		[4, "UNSAFE_PI_SESSION_ID", before],
		run.stderr,
	);
});

test("UNSAFE_HERDR_PANE_ID: a spawn whose HERDR_PANE_ID is not safe to route by exits 4 and leaves the snapshot identical", async (t) => {
	const p = await plant();
	t.after(() => p.cleanup());
	const before = snapshot(p.root);
	const run = limen(p, ["spawn", ...routed([]), "work"], { env: { HERDR_ENV: "1", HERDR_PANE_ID: "pane; rm -rf" } });
	assert.deepEqual(
		[run.status, readOutcome(run).code, snapshot(p.root)],
		[4, "UNSAFE_HERDR_PANE_ID", before],
		run.stderr,
	);
});

// A-029: no job runs outside its own systemd user scope, so a scope that does not start ends the spawn and its job.
test("SCOPE_FAILED: a spawn whose systemd user scope cannot start exits 4, and its job ends failed with no engine run", async (t) => {
	const p = await plant();
	t.after(() => p.cleanup());
	const run = limen(p, ["spawn", ...routed(["--label", "unscoped"]), "say never"], {
		env: { PATH: await pathWithFailingScope(p) },
	});
	const [id = ""] = readdirSync(join(p.root, ".limen", "jobs"));
	assert.deepEqual(
		[run.status, readOutcome(run).class, readOutcome(run).code, jobState(p, id)],
		[4, "environment", "SCOPE_FAILED", "failed"],
		run.stderr,
	);
	const ended = /\] failed: failed to launch wrapper: the job's systemd user scope did not start: .+: it ended with /;
	assert.deepEqual([jobFile(p, id, "fake-argv.json"), ended.test(jobFile(p, id, "log"))], ["", true]);
});

/** A job of the plant on the test route that ran the script `task` and ended `state`, its wrapper gone. */
function finishedJob(p: Plant, task: string, state: string): string {
	const id = spawnJob(p, task);
	assert.equal(waitJob(p, id), state);
	return id;
}

// A-001: before R-030 the next spawn's setup pruned this worktree, and the untracked file went with it.
test("UNLANDED_WORK: a worker spawn beside a failed job whose worktree holds an untracked file exits 1 and leaves the snapshot identical", async (t) => {
	const p = await plant();
	t.after(() => p.cleanup());
	const failed = finishedJob(p, "fail 3", "failed");
	await writeFile(join(jobRecord(p, failed)?.worktree ?? "", "wip.txt"), "half-done edit\n");
	const { run, before, after } = refusedSpawn(p, []);
	assert.deepEqual(
		[run.status, readOutcome(run), after],
		[1, { class: "refused", code: "UNLANDED_WORK", next: "limen status" }, before],
		run.stderr,
	);
	assert.deepEqual(outputText(run).split("\n").slice(0, 3), [
		"a finished job holds unlanded work; a worker spawn refuses until each is continued or abandoned:",
		`  ${failed} (failed): 1 changed file, 0 unlanded commits`,
		`    limen continue ${failed} "instruction", or limen abandon ${failed}`,
	]);
});

test("UNLANDED_WORK: a worker spawn beside a done job whose branch holds an unlanded commit exits 1 and leaves the snapshot identical", async (t) => {
	const p = await plant();
	t.after(() => p.cleanup());
	const done = finishedJob(p, "commit", "done");
	const { run, before, after } = refusedSpawn(p, ["--branch", "feature"]);
	assert.deepEqual([run.status, readOutcome(run).code, after], [1, "UNLANDED_WORK", before], run.stderr);
	assert.ok(outputText(run).includes(`  ${done} (done): 0 changed files, 1 unlanded commit\n`), run.stderr);
});

// Review round 1, F3: the repair loop of the coordinator's manual (A-015, A-035) spawns on the candidate's own branch,
// which takes over the candidate's worktree and work; before the fix the candidate's commit refused it.
test("a repair spawn on a reviewed candidate's own branch starts and takes over the candidate's worktree", async (t) => {
	const p = await plant();
	t.after(() => p.cleanup());
	const candidate = finishedJob(p, "commit", "done");
	const [branch, worktree] = [jobRecord(p, candidate)?.branch ?? "", jobRecord(p, candidate)?.worktree ?? ""];
	const review = spawnJob(p, "say reviewed", ["--review", "--branch", branch]);
	assert.equal(waitJob(p, review), "done");
	const repair = spawnJob(p, "say repaired", ["--branch", branch]);
	assert.deepEqual([waitJob(p, repair), jobRecord(p, repair)?.worktree], ["done", worktree]);
});

test("UNLANDED_WORK: a repair spawn on a candidate's own branch beside another job with unlanded work exits 1, names only that job and leaves the snapshot identical", async (t) => {
	const p = await plant();
	t.after(() => p.cleanup());
	// The other job commits only once the candidate has spawned: a finished job with unlanded work refuses a worker spawn.
	const other = spawnJob(p, "block\ncommit");
	const candidate = finishedJob(p, "commit", "done");
	await release(jobDir(p, other));
	assert.equal(waitJob(p, other), "done");
	const { run, before, after } = refusedSpawn(p, ["--branch", jobRecord(p, candidate)?.branch ?? ""]);
	assert.deepEqual([run.status, readOutcome(run).code, after], [1, "UNLANDED_WORK", before], run.stderr);
	const text = outputText(run);
	assert.deepEqual([text.includes(`  ${other} (done): `), text.includes(candidate)], [true, false], text);
});

// Review round 2, G5: a spawn on the branch takes over a job's work only through its worktree; before the fix it took
// it over by the branch alone, and the job's own worktree, detached from the branch, would have stayed with the job.
test("UNLANDED_WORK: a spawn on the own branch of a job whose dirty worktree has the branch no longer checked out exits 1 and leaves the snapshot identical", async (t) => {
	const p = await plant();
	t.after(() => p.cleanup());
	const failed = finishedJob(p, "fail 3", "failed");
	const [branch, worktree] = [jobRecord(p, failed)?.branch ?? "", jobRecord(p, failed)?.worktree ?? ""];
	git(worktree, "checkout", "-q", "--detach");
	await writeFile(join(worktree, "wip.txt"), "half-done edit\n");
	const { run, before, after } = refusedSpawn(p, ["--branch", branch]);
	assert.deepEqual([run.status, readOutcome(run).code, after], [1, "UNLANDED_WORK", before], run.stderr);
	assert.ok(outputText(run).includes(`  ${failed} (failed): 1 changed file, 0 unlanded commits\n`), run.stderr);
});

// A reviewer works on a candidate, so the candidate's own unlanded commits are what it reads.
test("a reviewer spawn beside a done job whose branch holds an unlanded commit starts", async (t) => {
	const p = await plant();
	t.after(() => p.cleanup());
	const done = finishedJob(p, "commit", "done");
	const branch = jobRecord(p, done)?.branch ?? "";
	const review = spawnJob(p, "say reviewed", ["--review", "--branch", branch]);
	assert.equal(waitJob(p, review), "done");
});

/** The reference of the worker's context message for a project as `limen init` leaves it, as the plant's is (A-051). */
const WORKER_CONTEXT = fileURLToPath(new URL("../runtime/context-message/worker.md", import.meta.url));

// A-079: the job's session opens with the message its publication saved, not one built again later.
test("a spawn publishes the job's context.md, the reference context message of its role for a project as limen init leaves it", async (t) => {
	const p = await plant();
	t.after(() => p.cleanup());
	const id = spawnJob(p, "say done");
	assert.equal(waitJob(p, id), "done");
	assert.equal(readFileSync(join(jobDir(p, id), "context.md"), "utf8"), readFileSync(WORKER_CONTEXT, "utf8"));
});

/** The files named `context.md` below the plant's `.limen/`, by their path there. */
const contextFiles = (p: Plant) =>
	readdirSync(join(p.root, ".limen"), { recursive: true }).filter((path) => basename(String(path)) === "context.md");

// T-38: spawn builds the message in its validate, so a check after it that refuses leaves no copy of it behind.
test("T-38: a spawn refused after its context message was built leaves no context.md", async (t) => {
	const p = await plant();
	t.after(() => p.cleanup());
	const { run } = refusedSpawn(p, ["--review", "--branch", "missing-candidate"]);
	assert.deepEqual([readOutcome(run).code, contextFiles(p)], ["BRANCH_MISSING", []]);
});

// A-086, E-14: the bridge drops Pi's system prompt, so Limen's text reaches the model as the first user message.
test("A-086: a spawned worker's first model call holds its context message whole and first, then its task and the cue, as one prompt", async (t) => {
	const p = await plant();
	t.after(() => p.cleanup());
	const id = spawnJob(p, "say viewed");
	assert.equal(waitJob(p, id), "done");
	const dir = jobDir(p, id);
	const [context, task, cue] = ["context.md", "fake-task.txt", "fake-context.txt"].map((name) =>
		readFileSync(join(dir, name), "utf8"),
	);
	const [first] = engineViews(dir);
	assert.deepEqual(
		{ prompt: first?.messages, path: first?.path },
		{ prompt: [{ role: "user", text: [`${context}\n\n${task}\n\n${cue}`] }], path: "fresh" },
	);
});

/** How many times the text of `view`'s records holds `text`. */
function held(view: BridgeView | undefined, text: string): number {
	return (
		(view?.messages ?? [])
			.flatMap((record) => record.text)
			.join("\n")
			.split(text).length - 1
	);
}

/**
 * A worker of `p` on `script`, which starts with `block`, steered while it waits, so its session has two runs: the
 * steer's, while the job's task waits, then the task's, once the test releases it.
 */
async function twoRuns(p: Plant, script: string): Promise<string> {
	const id = spawnJob(p, script);
	const dir = jobDir(p, id);
	await until(dir, () => existsSync(join(dir, "fake-blocked-1")));
	assert.equal(limen(p, ["steer", id, "steered"]).status, 0);
	await until(dir, () => engineViews(dir).length === 1);
	await release(dir);
	assert.equal(waitJob(p, id), "done");
	return dir;
}

// A-051, z. 3: the message is the session's frozen prefix, so a later run's call holds the same bytes, and only once.
test("A-051: each model call of a job's two runs holds its context message once, the bytes of its context.md", async (t) => {
	const p = await plant();
	t.after(() => p.cleanup());
	const dir = await twoRuns(p, "block\nsay done");
	const context = readFileSync(join(dir, "context.md"), "utf8");
	assert.deepEqual(
		engineViews(dir).map((view) => held(view, context)),
		[1, 1],
	);
});

// z. 4, E-13: a compaction summarises the message the session started with, so the hook sends it again.
test("after compact manual the job's next model call holds its context message again, once, after the summary", async (t) => {
	const p = await plant();
	t.after(() => p.cleanup());
	const dir = await twoRuns(p, "block\ncompact manual\nsay done");
	const context = readFileSync(join(dir, "context.md"), "utf8");
	const after = engineViews(dir)[1];
	assert.deepEqual(
		{ summary: after?.messages[0]?.text[0]?.startsWith(SUMMARY_PREFIX), held: held(after, context) },
		{ summary: true, held: 1 },
	);
});
