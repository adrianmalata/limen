// `limen group wait`: only a team member waits, and its time limit and its cap end the wait with one typed failure.
import assert from "node:assert/strict";
import { mkdir, writeFile } from "node:fs/promises";
import { dirname, join } from "node:path";
import { test } from "node:test";
import { waitCapped } from "../../src/commands/group.ts";
import { LimenError, outputText, readOutcome } from "../../src/outcome.ts";
import { limen, type Plant, plant, TICKET } from "../plant.ts";

const MEMBER = "2026-11-19-f001-team-1-worker-1a2b3c4d";

/** A running group with one worker of team-1 and no events, as a lead's group start and a team's spawn leave it. */
async function runningGroup(p: Plant) {
	const now = Date.now();
	const run = {
		id: "wait-group",
		root: p.root,
		feature: dirname(TICKET),
		planningSource: "committed",
		lead: "wait-lead",
		startedAt: now,
		teams: ["team-1"],
		routes: { "team-1": { engine: "pi", provider: "p", model: "m", thinking: "high" } },
		workersPerTeam: 1,
		rounds: ["draft"],
		round: 0,
		deadline: now + 60 * 60_000,
		reserveMs: 60_000,
		stopped: false,
		closed: false,
		members: [{ id: MEMBER, team: "team-1", role: "worker", deadline: now + 60 * 60_000 }],
	};
	await mkdir(join(p.root, ".limen/groups", run.id), { recursive: true });
	await writeFile(join(p.root, ".limen/groups", run.id, "run.json"), `${JSON.stringify(run)}\n`);
	return run;
}

test("GROUP_WAIT_MEMBERS_ONLY: the lead's group wait exits 1, says the lead gets the result once and names group status", async (t) => {
	const p = await plant();
	t.after(() => p.cleanup());
	const run = await runningGroup(p);
	const waited = limen(p, ["group", "wait", run.id, "--timeout", "500ms"], { env: { PI_SESSION_ID: run.lead } });
	assert.equal(waited.status, 1, waited.stderr);
	assert.deepEqual(readOutcome(waited), {
		class: "refused",
		code: "GROUP_WAIT_MEMBERS_ONLY",
		next: `limen group status ${run.id}`,
	});
	assert.equal(
		outputText(waited),
		"group wait is for team members, which keep their turn open while their workers run; the lead gets the group's result once, when the group ends\n",
	);
});

test("GROUP_WAIT_TIMEOUT: a member's group wait past its --timeout exits 3 with exactly one final line", async (t) => {
	const p = await plant();
	t.after(() => p.cleanup());
	const run = await runningGroup(p);
	const member = { LIMEN_GROUP_ID: run.id, LIMEN_CONTEXT_ROOT: p.root, LIMEN_JOB_ID: MEMBER, LIMEN_TEAM_ID: "team-1" };
	const waited = limen(p, ["group", "wait", "--timeout", "500ms"], { env: member });
	assert.equal(waited.status, 3, waited.stderr);
	assert.deepEqual(readOutcome(waited), { class: "transient", code: "GROUP_WAIT_TIMEOUT", next: "limen group status" });
	const finals = `${waited.stdout}${waited.stderr}`.split("\n").filter((line) => line.startsWith('{"class"'));
	assert.equal(finals.length, 1, `${waited.stdout}${waited.stderr}`);
});

test("BAD_ARGUMENT: group start without --team exits 2, names the missing flag and shows the usage line", async (t) => {
	const p = await plant();
	t.after(() => p.cleanup());
	const run = limen(p, ["group", "start", dirname(TICKET)]);
	assert.equal(run.status, 2, run.stderr);
	assert.deepEqual(readOutcome(run), { class: "usage", code: "BAD_ARGUMENT", next: "limen group start --help" });
	assert.deepEqual(outputText(run).split("\n").slice(0, 2), [
		"limen group start: missing --team",
		"usage: limen group start <folder> --team <route> …",
	]);
});

test("GROUP_WAIT_TIMEOUT: the wait cap rejects a stalled operation after its bound and aborts the operation's signal", async () => {
	let signal: AbortSignal | undefined;
	const stalled = waitCapped(20, "limen group status g1", (given) => {
		signal = given;
		return new Promise<never>(() => {});
	});
	await assert.rejects(stalled, (error: unknown) => {
		assert.ok(error instanceof LimenError, String(error));
		assert.deepEqual(
			[error.class, error.code, error.next],
			["transient", "GROUP_WAIT_TIMEOUT", "limen group status g1"],
		);
		return true;
	});
	assert.equal(signal?.aborted, true);
});
