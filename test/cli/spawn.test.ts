// `limen spawn`: the job it starts takes its time limit from the spawn, never from the spawner's environment, and its
// task from the words after the flags; each refusal of its worktree and its group slot leaves the shared snapshot
// identical (T-38 (4)); a job whose systemd user scope cannot start never runs.
import assert from "node:assert/strict";
import { spawn } from "node:child_process";
import { readdirSync } from "node:fs";
import { mkdir, writeFile } from "node:fs/promises";
import { dirname, join } from "node:path";
import { test } from "node:test";
import { isTerminal } from "../../src/job/job.ts";
import { platform } from "../../src/platform/platform.ts";
import { readOutcome } from "../final-line.ts";
import {
	git,
	jobDir,
	jobFile,
	jobState,
	limen,
	type Plant,
	pathWithFailingScope,
	plant,
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

/** Spawns with `flags` and the test route in a plant that has no job yet, and returns the run and both snapshots. */
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
