// S8 · Groups: one lead, one cabinet, fixed slots. One plant, a lead session that runs the real hook/group-peer.ts, real bin/limen.
import assert from "node:assert/strict";
import { type ChildProcess, execFileSync, spawn } from "node:child_process";
import { once } from "node:events";
import { existsSync, mkdirSync, readdirSync, readFileSync, writeFileSync } from "node:fs";
import { mkdir, rm, utimes, writeFile } from "node:fs/promises";
import { dirname, join } from "node:path";
import { after, before, test } from "node:test";
import { setTimeout as delay } from "node:timers/promises";
import { fileURLToPath } from "node:url";
import { readOutcome } from "./final-line.ts";
import {
	engineEvents,
	FINAL,
	git,
	jobDir,
	jobFile,
	jobRecord,
	limen,
	type Plant,
	plant,
	release,
	start,
	startedJob,
	TICKET,
	until,
	waitJob,
} from "./plant.ts";
import { snapshot } from "./snapshot.ts";

const PEER = fileURLToPath(new URL("../hook/group-peer.ts", import.meta.url));
const FEATURE = dirname(TICKET);
const LEAD = { PI_SESSION_ID: "s8-lead" };
const ROUTE = ["--engine", "pi", "--provider", "fake", "--model", "fake-1", "--thinking", "high", "--detached"];
const TEAM = "pi:fake/fake-1:high";
const SETTINGS = ["--team", TEAM, "--team", TEAM, "--workers", "1", "--timeout", "30m", "--detached"];
const ROUNDS = join(dirname(FEATURE), "F002-rounds");
let p: Plant;
let lead: string;
let session: ChildProcess;
let group = "";
const roster = { coordinator1: "", coordinator2: "", worker1: "", worker2: "" };

before(async () => {
	p = await plant();
	for (const name of ["brief", "teams/team-1", "teams/team-2"]) {
		await mkdir(dirname(join(p.root, FEATURE, "group", `${name}.md`)), { recursive: true });
		await writeFile(join(p.root, FEATURE, "group", `${name}.md`), `# ${name}\n`);
	}
	await writeFile(join(p.root, FEATURE, "group/teams/team-1.md"), `say ${FINAL.line}\n`); // team 1's draft result
	await mkdir(join(p.root, ROUNDS));
	await writeFile(join(p.root, ROUNDS, "ticket.md"), "# F002 · rounds\n");
	git(p.root, "add", "-A");
	git(p.root, "commit", "-q", "-m", "group packet");
	// The owner-facing lead: an interactive session with the group hook, held open on a FIFO until the story ends.
	lead = join(p.parent, "lead");
	await mkdir(lead);
	await writeFile(join(lead, "task.md"), "block\n");
	session = spawn(
		join(p.bin, "pi"),
		["--extension", PEER, "--session-dir", join(lead, "session"), `@${join(lead, "task.md")}`],
		{ cwd: p.root, env: { ...p.env, ...LEAD, LIMEN_COORDINATOR: "1" }, stdio: "ignore" },
	);
	await until(lead, () => existsSync(join(lead, "fake-blocked-1")));
});
after(() => p.cleanup());

const run = (args: readonly string[], env: Record<string, string> = {}) => start(p, args, { env }).done;
/** The ids of the groups recorded for `feature`: the final line carries no group id (D-022), the records do. */
const groupsOn = (feature: string) =>
	readdirSync(join(p.root, ".limen/groups")).filter(
		(id) => JSON.parse(readFileSync(join(p.root, ".limen/groups", id, "run.json"), "utf8")).feature === feature,
	);
const cabinet = () => join(p.root, ".limen/groups", group);
const members = (): Array<{ id: string; team: string; role: string }> =>
	JSON.parse(readFileSync(join(cabinet(), "run.json"), "utf8")).members;
const roles = () => members().map((member) => `${member.team} ${member.role}`);
const as = (id: string, team: string) => ({
	LIMEN_JOB: "1",
	LIMEN_JOB_ID: id,
	LIMEN_CONTEXT_ROOT: p.root,
	LIMEN_GROUP_ID: group,
	LIMEN_TEAM_ID: team,
});
const delivered = () => engineEvents(lead).filter((entry) => entry.text?.startsWith("[limen-group-delivery:"));

test("a stale lead registration starts nothing; two concurrent activations by the lead start one roster in one cabinet; the lead hears every last-round result whole", async () => {
	// A registration no running hook refreshes is not a lead: no update would reach it.
	await writeFile(join(p.root, ".limen/group-leads/stale-pane"), `${process.pid}\n`);
	await utimes(join(p.root, ".limen/group-leads/stale-pane"), new Date(0), new Date(0));
	// No job runs yet; the lead's hook only touches its registration's time, which the snapshot does not hold.
	const quiet = snapshot(p.root);
	const stale = limen(p, ["group", "start", FEATURE, ...SETTINGS], { env: { PI_SESSION_ID: "stale-pane" } });
	assert.deepEqual([stale.status, readOutcome(stale).code, snapshot(p.root)], [1, "GROUP_LEAD_HOOK", quiet]);
	assert.ok(!existsSync(join(p.root, ".limen/groups")));
	const started = await Promise.all([
		run(["group", "start", FEATURE, ...SETTINGS], LEAD),
		run(["group", "start", FEATURE, ...SETTINGS], LEAD),
	]);
	// T-38 (2): a start that found no run, while the other wrote one first, writes nothing and exits 3; a start that
	// found the run goes on with it. Either way one start succeeded, and the groups folder holds one group.
	const outcomes = started.map((result) => (result.status === 0 ? "ok" : readOutcome(result).code));
	assert.ok(
		outcomes.includes("ok") && outcomes.every((code) => code === "ok" || code === "STATE_CHANGED"),
		outcomes.join(", "),
	);
	const groups = readdirSync(join(p.root, ".limen/groups"));
	assert.deepEqual(groupsOn(FEATURE), groups);
	assert.equal(groups.length, 1, groups.join(", "));
	group = groups[0] ?? "";
	assert.deepEqual(roles(), ["team-1 coordinator", "team-2 coordinator"]);
	[roster.coordinator1 = "", roster.coordinator2 = ""] = members().map((member) => member.id);
	for (const id of [roster.coordinator1, roster.coordinator2]) {
		assert.equal(waitJob(p, id), "done");
	}
	await until(lead, () => delivered().some((entry) => entry.text?.includes(`/team-1.md\n${FINAL.text}\n`)));
});

test("launches queued behind a slow sibling wait past the old 10-second lock deadline, and one slot makes one member", async () => {
	// A Git hook holds the first worker's checkout, and with it the group launch lock, until one FIFO write.
	const hooks = join(p.parent, "hooks"),
		gate = join(p.parent, "checkout-gate"),
		entered = join(p.parent, "checkout-entered");
	await mkdir(hooks);
	execFileSync("mkfifo", [gate]);
	// mkdir marks the first checkout atomically; dash exits on a failed `: >` under set -C instead of running `|| exit 0`.
	await writeFile(
		join(hooks, "post-checkout"),
		`#!/bin/sh\nmkdir '${entered}' 2>/dev/null || exit 0\ncat '${gate}' > /dev/null\n`,
		{ mode: 0o755 },
	);
	git(p.root, "config", "core.hooksPath", hooks);
	const slow = run(["spawn", ...ROUTE, "block"], as(roster.coordinator1, "team-1"));
	await until(p.parent, () => existsSync(entered));
	// Team 2 has one worker slot and asks for it twice at once.
	const racing = [0, 1].map(() => run(["spawn", ...ROUTE, "say team two"], as(roster.coordinator2, "team-2")));
	// The one real hold: past the 10 seconds after which a queued launch used to fail.
	// regression: b62b837
	await delay(12_000);
	await writeFile(gate, "go\n");
	const first = await slow;
	const raced = await Promise.all(racing);
	assert.equal(first.status, 0, first.stderr);
	// Both found the slot free in their validate; the one that reached its apply second found it taken (T-38 (2)).
	const outcomes = raced.map((r) => (r.status === 0 ? "ok" : readOutcome(r).code)).sort();
	assert.deepEqual(outcomes, ["STATE_CHANGED", "ok"], raced.map((r) => r.stdout + r.stderr).join("\n"));
	const [winner] = raced.filter((result) => result.status === 0);
	assert.ok(winner);
	roster.worker1 = startedJob(first);
	roster.worker2 = startedJob(winner);
	// No half-claimed slot: the roster and the job records are the same four jobs.
	assert.deepEqual(roles(), ["team-1 coordinator", "team-2 coordinator", "team-1 worker", "team-2 worker"]);
	assert.deepEqual(new Set(readdirSync(join(p.root, ".limen/jobs"))), new Set(members().map((member) => member.id)));
	assert.equal(waitJob(p, roster.worker2), "done");
	// A worker's own launch refusal (GROUP_WORKER_SPAWN) is tested on a written run in test/cli/spawn.test.ts: here
	// worker1's wrapper still writes in .limen/, so a snapshot would race it.
});

test("a member's finish completes while another process holds the cabinet; its lifecycle event follows once the lock frees", async () => {
	// A live owner (this test process) holds the cabinet lock; a live owner is never evicted.
	const lock = join(cabinet(), ".lock");
	await until(cabinet(), () => {
		try {
			mkdirSync(lock);
		} catch {
			return false;
		}
		writeFileSync(join(lock, "owner"), `${process.pid}\n`);
		return true;
	});
	await release(jobDir(p, roster.worker1));
	// `waitJob` returns once the wrapper the record names has exited, after its lifecycle step: the step skipped the held
	// cabinet.
	assert.equal(waitJob(p, roster.worker1), "done");
	await rm(lock, { recursive: true });
	// `group status` publishes lifecycle only when it gets the cabinet, and live member hooks take it for a moment, so read
	// until the event is there; one more read must still show exactly one. Each event is one JSON file in the cabinet.
	const doneEvents = () => {
		const status = limen(p, ["group", "status", group], { env: LEAD });
		assert.equal(status.status, 0, status.stderr);
		const dir = join(cabinet(), "events");
		const names = existsSync(dir) ? readdirSync(dir).filter((name) => name.endsWith(".json")) : [];
		const events: Array<{ author: string; text: string }> = names.map((name) =>
			JSON.parse(readFileSync(join(dir, name), "utf8")),
		);
		return events.filter((event) => event.author === roster.worker1 && event.text.endsWith(": state done")).length;
	};
	let seen = 0;
	while (seen === 0) {
		seen = doneEvents();
	}
	assert.deepEqual([seen, doneEvents()], [1, 1]);
});

test("each recipient reads a finding once, and the lead hears it as a followUp", async () => {
	const author = as(roster.coordinator2, "team-2"),
		reader = as(roster.coordinator1, "team-1");
	assert.equal(limen(p, ["group", "publish", "s8 first finding"], { env: author }).status, 0);
	let read = "";
	while (!read.includes("s8 first finding")) {
		read += limen(p, ["group", "wait"], { env: reader }).stdout;
	}
	// A later finding orders the counts: a repeat of the first would have arrived before it.
	assert.equal(limen(p, ["group", "publish", "s8 later finding"], { env: author }).status, 0);
	const later = limen(p, ["group", "wait"], { env: reader }).stdout;
	assert.match(later, /s8 later finding/);
	assert.doesNotMatch(later, /s8 first finding/);
	await until(lead, () => delivered().some((entry) => entry.text?.includes("s8 later finding")));
	assert.equal(delivered().filter((entry) => entry.text?.includes("s8 first finding")).length, 1);
	// A group update wakes an idle lead without interrupting a busy one: only followUp does both.
	assert.deepEqual([...new Set(delivered().map((entry) => entry.event))], ["followUp"]);
});

test("a second group runs two routes through draft, critique and final, and the lead hears its result once", async () => {
	const teams = ["--team", TEAM, "--team", "pi:fake/fake-2:low", "--rounds", "draft,critique,final"];
	const started = await run(["group", "start", ROUNDS, ...teams], LEAD);
	assert.equal(started.status, 0, started.stderr);
	const [second = ""] = groupsOn(ROUNDS);
	const finished = `Group ${ROUNDS} (${second}) finished`;
	await until(lead, () => delivered().some((entry) => entry.text?.includes(finished)));
	const runFile = readFileSync(join(p.root, ".limen/groups", second, "run.json"), "utf8");
	const jobs: Array<{ id: string; team: string; round: number; parent?: string }> = JSON.parse(runFile).members;
	// Every team continues in its own session into the critique; the final round is the first team's alone.
	const chain = jobs.map((job) => `${job.team} ${job.round} ${jobs.findIndex((other) => other.id === job.parent)}`);
	assert.deepEqual(chain, ["team-1 0 -1", "team-2 0 -1", "team-1 1 0", "team-2 1 1", "team-1 2 2"]);
	const argv: string[] = JSON.parse(jobFile(p, jobs[3]?.id ?? "", "fake-argv.json"));
	assert.deepEqual([argv[argv.indexOf("--model") + 1], argv[argv.indexOf("--thinking") + 1]], ["fake-2", "low"]);
	const finalTask = readFileSync(join(jobDir(p, jobs[4]?.id ?? ""), "task.md"), "utf8");
	assert.match(finalTask, /rounds\/1-draft\/team-2\.md[\s\S]*rounds\/2-critique\/team-2\.md/);
	assert.equal(delivered().filter((entry) => entry.text?.includes(finished)).length, 1);
	// Five team jobs start and end here; the lead hears none of it.
	assert.ok(!delivered().some((entry) => entry.text?.includes("| lifecycle |")));
});

test("close refuses a member with uncommitted work until it is clean", async () => {
	assert.equal(limen(p, ["group", "stop", group], { env: LEAD }).status, 0);
	const dirty = join(jobRecord(p, roster.coordinator2)?.worktree ?? "", "recovery.txt");
	await writeFile(dirty, "keep me\n");
	assert.equal(limen(p, ["group", "close", group], { env: LEAD }).status, 1);
	assert.equal(JSON.parse(readFileSync(join(cabinet(), "run.json"), "utf8")).closed, false);
	await rm(dirty);
	await rm(join(jobRecord(p, roster.worker2)?.worktree ?? "", ".git")); // a folder a prune race left: no Git work in it
	limen(p, ["group", "close", group], { env: LEAD });
	assert.equal(JSON.parse(readFileSync(join(cabinet(), "run.json"), "utf8")).closed, true);
	// The story ends here: the lead's last turn ends its session, which the gate held open since the start.
	await release(lead);
	await once(session, "exit");
});
