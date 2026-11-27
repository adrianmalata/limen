// The failure of a group stop that could not confirm every member stopped (src/job/group-control.ts): its class and
// exit code (T-02).
import assert from "node:assert/strict";
import { mkdtemp, realpath, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { type TestContext, test } from "node:test";
import type { GroupMember } from "../../src/job/group-cabinet.ts";
import { incompleteStop, stopMemberJob } from "../../src/job/group-control.ts";
import { main } from "../../src/main.ts";
import { type CommandText, LimenError, type Outcome, usageError } from "../../src/outcome.ts";
import { REGISTRY } from "../../src/registry.ts";
import { withEnvironment } from "../environment.ts";
import { readOutcome } from "../final-line.ts";
import { switchModules, writeRecord } from "../plant.ts";

const RUN = { id: "stop-group", feature: "spec/features/active/F001-demo" };

// A member whose process outlived the stop's wait can still end, and the same stop run again stops or checks it again,
// so a timer that retries exit 3 is right to retry it.
test("GROUP_STOP_INCOMPLETE: a stop whose every member a rerun can still stop is transient and names the same stop", () => {
	const failure = incompleteStop(RUN, [
		{ line: "team-1 coordinator (m1): not confirmed stopped (its state is running)", class: "transient" },
	]);
	assert.deepEqual(
		[failure.class, failure.code, failure.next],
		["transient", "GROUP_STOP_INCOMPLETE", "limen group stop stop-group"],
	);
});

// A failure the file system gives does not go away by itself, so the stop rings at once instead of a retry (T-02), and
// the same stop is what the owner runs once the cause is fixed.
test("GROUP_STOP_INCOMPLETE: a member whose stop failed in the environment gives the stop that class, after a member a rerun can stop", () => {
	const failure = incompleteStop(RUN, [
		{ line: "team-1 coordinator (m1): not confirmed stopped (its state is running)", class: "transient" },
		{ line: "team-2 coordinator (m2): EACCES: permission denied", class: "environment" },
	]);
	assert.deepEqual(
		[failure.class, failure.code, failure.next],
		["environment", "GROUP_STOP_INCOMPLETE", "limen group stop stop-group"],
	);
});

const QUIET: CommandText = { line: () => {}, diagnostic: () => {} };

/** A project folder whose one group member runs, as `memberLive` reads its record, and that member. */
async function runningMember(t: TestContext): Promise<{ readonly root: string; readonly member: GroupMember }> {
	const root = await realpath(await mkdtemp(join(tmpdir(), "limen-member-stop-")));
	t.after(() => rm(root, { recursive: true, force: true }));
	const member: GroupMember = {
		id: "2026-11-22-f001-team-1-1a2b3c4d",
		team: "team-1",
		role: "coordinator",
		deadline: 0,
	};
	await writeRecord(join(root, ".limen/jobs", member.id), { state: "running", group: RUN.id, team: member.team });
	return { root, member };
}

// The member's stop is injected here: the real stop (src/job/stopping.ts) ends transiently only on the job's lock held
// by another process or on a record that changes under it, and in a group stop the member's slot step takes that lock
// first, so no state of the files reaches this rule through it.
test("a member whose stop fails with a typed transient failure stays transient, with no remedy for the owner", async (t) => {
	const { root, member } = await runningMember(t);
	const held = new LimenError({
		class: "transient",
		code: "LOCK_TIMEOUT",
		message: "the job's lock is held",
		next: null,
	});
	const failure = await stopMemberJob({ root }, member, QUIET, async () => {
		throw held;
	});
	assert.deepEqual([failure?.class, failure?.remedy], ["transient", undefined]);
});

// A plain `Error` is what Node's file system and child processes give: the environment's failure (T-02), which rings at
// once, as `stepFailure` (src/operation.ts) makes it for every step after a first write.
test("a member whose stop fails with a plain Error is the environment's failure, with no remedy for the owner", async (t) => {
	const { root, member } = await runningMember(t);
	const failure = await stopMemberJob({ root }, member, QUIET, async () => {
		throw new Error("EACCES: permission denied, open 'log'");
	});
	assert.deepEqual([failure?.class, failure?.remedy], ["environment", undefined]);
});

/**
 * The exit code and the final line that the shared wrapper (src/main.ts) gives `limen group stop` of `RUN`, run in the
 * project `root` with its group module on, when the stop fails with `failure`: the registry's entry, whose handler
 * throws it.
 */
async function stopExit(
	t: TestContext,
	root: string,
	failure: LimenError,
): Promise<{ status: number | null; outcome: Outcome }> {
	// LIMEN_HERDR 0: this in-process run reaches no Herdr of the machine.
	withEnvironment(t, { LIMEN_HERDR: "0" });
	await switchModules(root, ["group"]);
	const registry = REGISTRY.map((entry) =>
		entry.name === "group stop"
			? {
					...entry,
					handler: async () => {
						throw failure;
					},
				}
			: entry,
	);
	const stderr: string[] = [];
	t.mock.method(console, "log", () => {});
	t.mock.method(console, "error", (line: unknown) => stderr.push(`${String(line)}\n`));
	await main(["group", "stop", RUN.id], root, registry);
	const status = process.exitCode === undefined ? null : Number(process.exitCode);
	process.exitCode = 0;
	return { status, outcome: readOutcome({ status, stdout: "", stderr: stderr.join("") }) };
}

// A refusal is what a stop's own checks give, and the group stop's checks came before them, so a member's stop that
// refuses is a defect of their order, the internal REFUSED_AFTER_VALIDATE of `stepFailure`, which rings at once
// (T-02). Only JOB_NO_PID, a state of the seat, has a rule of its own.
test("GROUP_STOP_INCOMPLETE: a member whose stop refuses after the group stop's checks makes the stop exit 5", async (t) => {
	const { root, member } = await runningMember(t);
	const failure = await stopMemberJob({ root }, member, QUIET, async (id) => {
		throw usageError("JOB_NOT_FOUND", `no job ${id} in this project`);
	});
	assert.ok(failure, "the member's stop failed");
	const exit = await stopExit(t, root, incompleteStop(RUN, [failure]));
	assert.deepEqual(
		[failure.class, exit.status, exit.outcome],
		["internal", 5, { class: "internal", code: "GROUP_STOP_INCOMPLETE", next: "limen group stop stop-group" }],
	);
});
