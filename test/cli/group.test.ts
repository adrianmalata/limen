// `limen group wait`: only a team member waits, and its time limit and its cap end the wait with a success that names
// the same wait.
import assert from "node:assert/strict";
import { mkdir, writeFile } from "node:fs/promises";
import { dirname, join } from "node:path";
import { test } from "node:test";
import { groupWaitCommand, waitCapped } from "../../src/commands/group-wait.ts";
import { main } from "../../src/main.ts";
import type { Parsed } from "../../src/parser.ts";
import { REGISTRY } from "../../src/registry.ts";
import { withEnvironment } from "../environment.ts";
import { outputText, readOutcome } from "../final-line.ts";
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

test("GROUP_WAIT_MEMBERS_ONLY: a group wait outside a team that gives no group id names group status without one", async (t) => {
	const p = await plant();
	t.after(() => p.cleanup());
	const run = await runningGroup(p);
	const waited = limen(p, ["group", "wait", "--timeout", "500ms"], { env: { PI_SESSION_ID: run.lead } });
	assert.equal(waited.status, 1, waited.stderr);
	assert.deepEqual(readOutcome(waited), {
		class: "refused",
		code: "GROUP_WAIT_MEMBERS_ONLY",
		next: "limen group status",
	});
});

// D-046 (5): a member waits again while its work is live, so its time limit is a success that names the same call.
test("a member's group wait past its --timeout exits 0, says so and names the same wait in its one final line", async (t) => {
	const p = await plant();
	t.after(() => p.cleanup());
	const run = await runningGroup(p);
	const member = { LIMEN_GROUP_ID: run.id, LIMEN_CONTEXT_ROOT: p.root, LIMEN_JOB_ID: MEMBER, LIMEN_TEAM_ID: "team-1" };
	const waited = limen(p, ["group", "wait", "--timeout", "500ms"], { env: member });
	assert.equal(waited.status, 0, waited.stderr);
	assert.deepEqual(
		[outputText(waited), readOutcome(waited)],
		[
			"group wait timed out; re-enter bounded wait while your collaboration or children remain live\n",
			{ class: "ok", code: null, next: "limen group wait --timeout 500ms" },
		],
	);
	const finals = `${waited.stdout}${waited.stderr}`.split("\n").filter((line) => line.startsWith('{"class"'));
	assert.equal(finals.length, 1, `${waited.stdout}${waited.stderr}`);
});

// D-046 (5): the CLI cap ends a wait as its --timeout does. The test runs `main` in-process with the cap of `group wait`
// set to 50 ms, below the --timeout given, so it need not wait the 20 s of the real cap.
test("a member's group wait past the CLI cap exits 0, says so and names the same wait in its one final line", async (t) => {
	const p = await plant();
	t.after(() => p.cleanup());
	const run = await runningGroup(p);
	// LIMEN_HERDR 0: no rule timer starts from this in-process run (src/commands/rule.ts, endDueRules).
	const member = { LIMEN_GROUP_ID: run.id, LIMEN_CONTEXT_ROOT: p.root, LIMEN_JOB_ID: MEMBER, LIMEN_TEAM_ID: "team-1" };
	withEnvironment(t, { ...member, LIMEN_HERDR: "0" });
	const capped = REGISTRY.map((entry) =>
		entry.name === "group wait"
			? { ...entry, handler: (values: Parsed, cwd: string) => groupWaitCommand(values, cwd, undefined, 50) }
			: entry,
	);
	const stdout: string[] = [];
	const stderr: string[] = [];
	t.mock.method(console, "log", (line: unknown) => stdout.push(`${String(line)}\n`));
	t.mock.method(console, "error", (line: unknown) => stderr.push(`${String(line)}\n`));
	await main(["group", "wait", "--timeout", "10s"], p.root, capped);
	const status = process.exitCode === undefined ? null : Number(process.exitCode);
	process.exitCode = 0;
	const waited = { status, stdout: stdout.join(""), stderr: stderr.join("") };
	assert.equal(waited.status, 0, waited.stderr);
	assert.deepEqual(
		[outputText(waited), readOutcome(waited)],
		[
			"group wait timed out after the 0.05-second CLI cap; inspect any uncertain delivery receipt before retrying\n",
			{ class: "ok", code: null, next: "limen group wait --timeout 10s" },
		],
	);
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

test("the wait cap ends a stalled operation after its bound with the sentence that the limit passed and aborts its signal", async () => {
	let signal: AbortSignal | undefined;
	const ended = await waitCapped(20, (given) => {
		signal = given;
		return new Promise<never>(() => {});
	});
	const limitPassed =
		"group wait timed out after the 0.02-second CLI cap; inspect any uncertain delivery receipt before retrying";
	assert.deepEqual([ended, signal?.aborted], [{ limitPassed }, true]);
});
