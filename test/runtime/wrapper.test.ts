// src/runtime/wrapper.ts: a queued job's wrapper whose job folder is removed ends before its setup and its engine run,
// a wrapper outside its job's systemd user scope ends the job before it runs anything, and an exhaustion whose scope
// cannot be ended still kills its process group.
import assert from "node:assert/strict";
import { existsSync, writeFileSync } from "node:fs";
import { rm } from "node:fs/promises";
import { join } from "node:path";
import { test } from "node:test";
import { setTimeout as delay } from "node:timers/promises";
import type { Identity } from "../../src/job/record.ts";
import { platform } from "../../src/platform/platform.ts";
import { ownerState } from "../../src/runtime/reap.ts";
import {
	jobDir,
	jobFile,
	jobRecord,
	limen,
	pathWithFailingScopeEnd,
	pathWithUnscopedRun,
	plant,
	routed,
	spawnJob,
	startedJob,
	until,
	waitJob,
} from "../plant.ts";

/**
 * How long the test waits for the wrapper and its process group to end. A passing wrapper exits at its next poll
 * (50 ms in a plant); the bound only ends the wait for one that never exits, so it is far above any poll on a loaded
 * machine.
 */
const EXIT_BOUND_MS = 10_000;
/** How often the test reads the wrapper's process again: an exit raises no file event. */
const EXIT_CHECK_MS = 20;
/** The group's grace here: the test knob LIMEN_STOP_GRACE_MS shortens the 5 s, so no test waits it (T-31 (4)). */
const GRACE_MS = "200";
/** How long an exhausted job's wrapper and group may take to end: the group's grace, and far above it for load. */
const GRACE_BOUND_MS = 20_000;

/**
 * Whether the wrapper `identity` names and every process of its group ended within `boundMs`. The wrapper leads its
 * own group, which holds the engine and the setup's commands it starts; an exited wrapper stays in the group until it
 * is reaped, so the group is read until it is empty. The identity is the record's, so a reused pid is not the wrapper.
 */
async function ended(identity: Identity, boundMs: number): Promise<boolean> {
	const deadline = Date.now() + boundMs;
	while ((await ownerState(identity)) !== "dead" || (identity.pid && platform.processGroupAlive(identity.pid))) {
		if (Date.now() >= deadline) {
			return false;
		}
		await delay(EXIT_CHECK_MS);
	}
	return true;
}

// D-063 (3): a wrapper whose plant was removed polled the start queue until it was killed. Its own "gone" branch keeps
// the steps after the queue from running: setup, whose first step prunes finished worktrees (src/runtime/job-setup.ts),
// and the engine, which runs in the wrapper's process group and writes its records into the job folder.
test("a queued wrapper whose job folder is removed exits without running its setup or its engine and recreates no folder", async (t) => {
	const p = await plant();
	t.after(() => p.cleanup());
	const finished = spawnJob(p, "say done");
	assert.equal(waitJob(p, finished), "done");
	const worktree = jobRecord(p, finished)?.worktree ?? "";
	assert.ok(existsSync(worktree), "the finished job keeps its worktree until a setup prunes it");
	// Below the start gate's 25% CPU idle, so the next job waits in the queue and starts no engine.
	writeFileSync(join(p.parent, "start-reading.json"), '{"cpuIdle":10,"memoryFree":80}');
	const queued = spawnJob(p, "say queued");
	const dir = jobDir(p, queued);
	// The log line follows the record's change, so the job's lock is released and the wrapper sleeps to its next poll.
	await until(dir, () => jobFile(p, queued, "log").includes("] queued: CPU 10% idle"));
	const identity = jobRecord(p, queued)?.identity;
	assert.ok(identity?.pid && identity.born, "the record names the queued job's wrapper");
	await rm(dir, { recursive: true });
	const exited = await ended(identity, EXIT_BOUND_MS);
	assert.deepEqual(
		{ exited, folder: existsSync(dir), prunedWorktree: !existsSync(worktree) },
		{ exited: true, folder: false, prunedWorktree: false },
	);
});

// A-029: outside its scope the job's end could not reach what the engine detaches, so the wrapper runs nothing.
test("a wrapper that does not run in its job's systemd user scope ends the job failed and starts no engine", async (t) => {
	const p = await plant();
	t.after(() => p.cleanup());
	const run = limen(p, ["spawn", ...routed(["--label", "outside"]), "say never"], {
		env: { PATH: await pathWithUnscopedRun(p) },
	});
	assert.equal(run.status, 0, run.stderr);
	const id = startedJob(run);
	assert.equal(waitJob(p, id), "failed");
	assert.deepEqual(
		[jobRecord(p, id)?.failure?.detail.startsWith("not in its scope: "), jobFile(p, id, "fake-argv.json")],
		[true, ""],
	);
});

// A-029, R-026 Deviation 1: an exhaustion ends the job's scope after the group's grace instead of killing its own group,
// which the wrapper leads; when that end fails, the group's KILL still ends an engine that ignores TERM, and the wrapper.
test("an exhausted job whose scope cannot be ended kills its process group after the grace, an engine that ignores TERM included", async (t) => {
	const p = await plant();
	t.after(() => p.cleanup());
	const run = limen(p, ["spawn", ...routed(["--label", "deaf", "--timeout", "1s"]), "deaf\nblock"], {
		env: { PATH: await pathWithFailingScopeEnd(p), LIMEN_STOP_GRACE_MS: GRACE_MS },
	});
	assert.equal(run.status, 0, run.stderr);
	const id = startedJob(run);
	await until(jobDir(p, id), () => jobRecord(p, id)?.state === "failed");
	const identity = jobRecord(p, id)?.identity;
	assert.ok(identity?.pid && identity.born, "the record names the job's wrapper");
	const gone = await ended(identity, GRACE_BOUND_MS);
	assert.deepEqual([gone, / was not ended: Failed to connect to bus/.test(jobFile(p, id, "log"))], [true, true]);
});
