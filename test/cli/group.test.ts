// `limen group wait`: only a team member waits, and its time limit and its cap end the wait with a success that names
// the same wait. `limen group start` and `limen group stop` refuse before they write (T-38 (1)); a start's team jobs are
// recorded steps that the same start run again continues, and a stop's failure after its first write is no refusal.
import assert from "node:assert/strict";
import { mkdir, readdir, readFile, writeFile } from "node:fs/promises";
import { dirname, join } from "node:path";
import { test } from "node:test";
import { groupWaitCommand, waitCapped } from "../../src/commands/group-wait.ts";
import { main } from "../../src/main.ts";
import type { Parsed } from "../../src/parser.ts";
import { REGISTRY } from "../../src/registry.ts";
import { withEnvironment } from "../environment.ts";
import { outputText, readOutcome } from "../final-line.ts";
import { git, limen, type Plant, plant, TICKET, writeRecord } from "../plant.ts";
import { snapshot } from "../snapshot.ts";

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

const ROUTE = "pi:p/m:high";
const at = new Date().toISOString();
/** The transitions of a job that ran: started, then ran, then ended. */
const RAN = [
	{ from: null, to: "starting", at },
	{ from: "starting", to: "running", at },
	{ from: "running", to: "done", at },
] as const;
/** The transitions of a job whose launch failed before it ran. */
const NEVER_RAN = [
	{ from: null, to: "starting", at },
	{ from: "starting", to: "failed", at },
] as const;
const LEAD_SESSION = "r092-lead";

/** Registers the lead `LEAD_SESSION` as the group hook does: its file under `.limen/group-leads/` names a live pid. */
async function registeredLead(p: Plant): Promise<Record<string, string>> {
	await mkdir(join(p.root, ".limen/group-leads"), { recursive: true });
	await writeFile(join(p.root, ".limen/group-leads", LEAD_SESSION), `${process.pid}\n`);
	return { PI_SESSION_ID: LEAD_SESSION };
}

/** A run of two teams on `ROUTE` whose start, before R-092, stopped after team-1: team-2 has no job. */
async function partialRun(p: Plant, fields: Record<string, unknown> = {}) {
	const now = Date.now();
	const route = { engine: "pi", provider: "p", model: "m", thinking: "high" };
	const run = {
		id: "partial-group",
		root: p.root,
		feature: dirname(TICKET),
		lead: LEAD_SESSION,
		startedAt: now,
		teams: ["team-1", "team-2"],
		routes: { "team-1": route, "team-2": route },
		workersPerTeam: 0,
		rounds: ["draft"],
		round: 0,
		deadline: now + 60 * 60_000,
		reserveMs: 60_000,
		stopped: false,
		closed: false,
		members: [{ id: MEMBER, team: "team-1", role: "coordinator", deadline: now + 60 * 60_000, round: 0 }],
		...fields,
	};
	await mkdir(join(p.root, ".limen/groups", run.id), { recursive: true });
	await writeFile(join(p.root, ".limen/groups", run.id, "run.json"), `${JSON.stringify(run)}\n`);
	return run;
}

/** The run.json of the group `id` as it is now. */
async function runOf(p: Plant, id: string) {
	return JSON.parse(await readFile(join(p.root, ".limen/groups", id, "run.json"), "utf8"));
}

test("GROUP_NO_LEAD: group start with no registered lead exits 1 and leaves the snapshot identical", async (t) => {
	const p = await plant();
	t.after(() => p.cleanup());
	const before = snapshot(p.root);
	const run = limen(p, ["group", "start", dirname(TICKET), "--team", ROUTE]);
	assert.deepEqual([run.status, readOutcome(run).code, snapshot(p.root)], [1, "GROUP_NO_LEAD", before], run.stderr);
});

// Before R-092 the start wrote run.json, then a team's spawn refused (here: a job folder of an older Limen) and the start
// wrote activation-error.json; now each team's spawn is checked in the start's validate (D-061, NOT_MIGRATED is the
// environment's failure of D-057 (6)).
test("NOT_MIGRATED: group start whose team spawn finds a job folder of an older Limen exits 4 and leaves the snapshot identical", async (t) => {
	const p = await plant();
	t.after(() => p.cleanup());
	const env = await registeredLead(p);
	await mkdir(join(p.root, ".limen/jobs/2026-01-01-old-1a2b3c4d"));
	await writeFile(join(p.root, ".limen/jobs/2026-01-01-old-1a2b3c4d/state"), "done\n");
	const before = snapshot(p.root);
	const run = limen(p, ["group", "start", dirname(TICKET), "--team", ROUTE], { env });
	assert.deepEqual([run.status, readOutcome(run).code, snapshot(p.root)], [4, "NOT_MIGRATED", before], run.stderr);
});

// T-38 (3): the team jobs after run.json are steps that run.json records (each team's member); before R-092 the same
// start run again returned the open run and started no team (`group-control.ts:212-213`).
test("group start run again on a run that has a team with no job starts that team and leaves the started one alone", async (t) => {
	const p = await plant();
	t.after(() => p.cleanup());
	const env = await registeredLead(p);
	const run = await partialRun(p);
	await writeRecord(join(p.root, ".limen/jobs", MEMBER), { state: "done", transitions: RAN });
	const again = limen(p, ["group", "start", dirname(TICKET), "--team", ROUTE, "--team", ROUTE], { env });
	assert.equal(again.status, 0, again.stderr);
	const roles = (await runOf(p, run.id)).members.map((member: { team: string; role: string; id: string }) => [
		member.team,
		member.role,
		member.id === MEMBER,
	]);
	assert.deepEqual(roles, [
		["team-1", "coordinator", true],
		["team-2", "coordinator", false],
	]);
});

// T-38 (3): a team whose launch failed after its member was recorded has a job that never ran; the same start run
// again gives its slot to a new job of that team, as its Start line says, and leaves the started team alone.
test("group start run again on a run whose team's job never ran starts a new job for that team in its place", async (t) => {
	const p = await plant();
	t.after(() => p.cleanup());
	const env = await registeredLead(p);
	const failed = "2026-11-21-f001-team-2-9c8d7e6f";
	const now = Date.now();
	const run = await partialRun(p, {
		members: [
			{ id: MEMBER, team: "team-1", role: "coordinator", deadline: now + 60 * 60_000, round: 0 },
			{ id: failed, team: "team-2", role: "coordinator", deadline: now + 60 * 60_000, round: 0 },
		],
		startFailure: { team: "team-2", message: "the worktree could not be made", at: now },
	});
	await writeRecord(join(p.root, ".limen/jobs", MEMBER), { state: "done", transitions: RAN });
	await writeRecord(join(p.root, ".limen/jobs", failed), { state: "failed", transitions: NEVER_RAN });
	const again = limen(p, ["group", "start", dirname(TICKET), "--team", ROUTE, "--team", ROUTE], { env });
	assert.equal(again.status, 0, again.stderr);
	const rerun = await runOf(p, run.id);
	const team2 = rerun.members.filter((member: { team: string }) => member.team === "team-2");
	assert.deepEqual(
		[rerun.members.length, team2[0]?.id, team2.length, team2[1]?.id === failed, rerun.startFailure],
		[3, failed, 2, false, undefined],
	);
});

// The step record is additive: a run.json written before R-092 has no startFailure and reads as it did.
test("group status of a run written before R-092 shows the lines it showed before, with no Start line", async (t) => {
	const p = await plant();
	t.after(() => p.cleanup());
	const old = await partialRun(p);
	const lines = limen(p, ["group", "status", old.id], { env: { PI_SESSION_ID: LEAD_SESSION } }).stdout.split("\n");
	assert.deepEqual(
		[lines[0], lines[2], lines.some((line) => line.startsWith("Start:"))],
		[`Group ${old.feature} (${old.id})`, "Stopped: no · Closed: no", false],
	);
});

test("group status of a run whose start failed for a team names that team and the rerun on a Start line", async (t) => {
	const p = await plant();
	t.after(() => p.cleanup());
	const run = await partialRun(p, { startFailure: { team: "team-2", message: "the base moved", at: Date.now() } });
	const lines = limen(p, ["group", "status", run.id], { env: { PI_SESSION_ID: LEAD_SESSION } }).stdout.split("\n");
	assert.equal(
		lines[3],
		"Start: team-2 did not start: the base moved; run the same limen group start again to start it",
	);
});

/**
 * A start of two teams whose first team's checkout moves main, so the second team's spawn, checked before run.json,
 * finds its base changed after it (T-38 (3)); returns the start's run and its group id.
 */
async function partialStart(p: Plant) {
	const env = await registeredLead(p);
	const hooks = join(p.parent, "hooks");
	const moved = join(p.parent, "moved");
	await mkdir(hooks);
	const commit = `env -u GIT_DIR -u GIT_WORK_TREE -u GIT_INDEX_FILE git -C '${p.root}' commit -q --allow-empty -m moved`;
	await writeFile(join(hooks, "post-checkout"), `#!/bin/sh\n[ -e '${moved}' ] && exit 0\n: > '${moved}'\n${commit}\n`, {
		mode: 0o755,
	});
	git(p.root, "config", "core.hooksPath", hooks);
	const args = ["group", "start", dirname(TICKET), "--team", ROUTE, "--team", ROUTE];
	const first = limen(p, args, { env });
	const [id = ""] = await readdir(join(p.root, ".limen/groups")).then((names) =>
		names.filter((n) => !n.startsWith(".")),
	);
	return { first, id };
}

test("GROUP_PARTIAL_START: a team whose spawn fails after run.json ends the start in exit 3 and is recorded as its startFailure", async (t) => {
	const p = await plant();
	t.after(() => p.cleanup());
	const { first, id } = await partialStart(p);
	const partial = await runOf(p, id);
	assert.deepEqual(
		[
			first.status,
			readOutcome(first),
			partial.members.map((member: { team: string }) => member.team),
			partial.startFailure?.team,
		],
		[
			3,
			{
				class: "transient",
				code: "GROUP_PARTIAL_START",
				next: `limen group start ${dirname(TICKET)} --team ${ROUTE} --team ${ROUTE}`,
			},
			["team-1"],
			"team-2",
		],
		first.stderr,
	);
});

// The state a GROUP_PARTIAL_START leaves, written: team-1's job ran, team-2 has none, and the run records the step.
test("group start run again after GROUP_PARTIAL_START starts the team it recorded and clears startFailure", async (t) => {
	const p = await plant();
	t.after(() => p.cleanup());
	const env = await registeredLead(p);
	const run = await partialRun(p, { startFailure: { team: "team-2", message: "the base moved", at: Date.now() } });
	await writeRecord(join(p.root, ".limen/jobs", MEMBER), { state: "done", transitions: RAN });
	const again = limen(p, ["group", "start", dirname(TICKET), "--team", ROUTE, "--team", ROUTE], { env });
	const whole = await runOf(p, run.id);
	assert.deepEqual(
		[again.status, whole.members.map((member: { team: string }) => member.team), whole.startFailure],
		[0, ["team-1", "team-2"], undefined],
		again.stderr,
	);
});

// Before R-092 the start read its lead's pane under the cabinet lock, whose folder .limen/groups/ then stayed.
test("UNSAFE_HERDR_PANE_ID: group start from a Herdr pane whose id is not safe to route by exits 4 and leaves the snapshot identical", async (t) => {
	const p = await plant();
	t.after(() => p.cleanup());
	const env = { ...(await registeredLead(p)), HERDR_ENV: "1", HERDR_PANE_ID: "pane; rm -rf" };
	const before = snapshot(p.root);
	const run = limen(p, ["group", "start", dirname(TICKET), "--team", ROUTE], { env });
	assert.deepEqual(
		[run.status, readOutcome(run).code, snapshot(p.root)],
		[4, "UNSAFE_HERDR_PANE_ID", before],
		run.stderr,
	);
});

test("GROUP_LEAD_ONLY: group stop by a team member exits 1 and leaves the snapshot identical", async (t) => {
	const p = await plant();
	t.after(() => p.cleanup());
	const run = await partialRun(p);
	const member = {
		LIMEN_JOB: "1",
		LIMEN_JOB_ID: MEMBER,
		LIMEN_CONTEXT_ROOT: p.root,
		LIMEN_GROUP_ID: run.id,
		LIMEN_TEAM_ID: "team-1",
	};
	const before = snapshot(p.root);
	const stop = limen(p, ["group", "stop"], { env: member });
	assert.deepEqual(
		[stop.status, readOutcome(stop).code, snapshot(p.root)],
		[1, "GROUP_LEAD_ONLY", before],
		stop.stderr,
	);
});

/** A run whose one member job runs with no pid in its record, so its own stop refuses and the group's stop cannot confirm it. */
async function unstoppable(p: Plant) {
	const run = await partialRun(p);
	await writeRecord(join(p.root, ".limen/jobs", MEMBER), {
		state: "running",
		label: "team-1",
		group: run.id,
		team: "team-1",
	});
	const stop = () => limen(p, ["group", "stop", run.id], { env: { PI_SESSION_ID: LEAD_SESSION } });
	const report = async () =>
		JSON.parse(await readFile(join(p.root, ".limen/groups", run.id, "stop-report.json"), "utf8")).failures;
	return { run, stop, report };
}

// Before R-092 a member that could not be stopped was a refusal after the stopped flag, the slots, the member stops and
// stop-report.json; after its first write a stop's failure takes the class T-02 gives it.
test("GROUP_STOP_INCOMPLETE: group stop of a member it cannot stop exits 3, names the same stop in next and reports the member", async (t) => {
	const p = await plant();
	t.after(() => p.cleanup());
	const { run, stop, report } = await unstoppable(p);
	const first = stop();
	assert.deepEqual(
		[first.status, readOutcome(first), (await runOf(p, run.id)).stopped, (await report()).length],
		[3, { class: "transient", code: "GROUP_STOP_INCOMPLETE", next: `limen group stop ${run.id}` }, true, 1],
		first.stderr,
	);
});

test("group stop run again after GROUP_STOP_INCOMPLETE takes the same steps and ends the same way", async (t) => {
	const p = await plant();
	t.after(() => p.cleanup());
	const { stop, report } = await unstoppable(p);
	const first = stop();
	const firstReport = await report();
	const second = stop();
	assert.deepEqual(
		[second.status, readOutcome(second), await report()],
		[first.status, readOutcome(first), firstReport],
		second.stderr,
	);
});
