// S3 · finish and wake. Every way a job ends records one terminal state, and the coordinator session that should hear
// it is woken exactly once. The coordinator is the fake engine running the real hook/wake.ts under PI_SESSION_ID; its
// fake-events.jsonl holds every wake it received. Absence is proved by order, never by waiting: a session confirms a
// wake by moving its claim to notify/delivered/<session>, and no listener injects that wake again afterwards, so once
// the delivered record exists every wake the job will cause for that session is already recorded.
import assert from "node:assert/strict";
import { type ChildProcess, spawn } from "node:child_process";
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { after, before, test } from "node:test";
import { fileURLToPath } from "node:url";
import { outputText } from "./final-line.ts";
import {
	engineEvents,
	FINAL,
	git,
	jobDir,
	jobFile,
	jobRecord,
	jobState,
	limen,
	loggedAt,
	type Plant,
	plant,
	release,
	spawnJob,
	startedJob,
	until,
	waitJob,
} from "./plant.ts";

const WAKE_HOOK = fileURLToPath(new URL("../hook/wake.ts", import.meta.url));
const ROUTE = ["--engine", "pi", "--provider", "p", "--model", "m", "--thinking", "high", "--detached"];
let p: Plant;
let coord = "";
const sessions: ChildProcess[] = [];

/** A coordinator session: the fake engine with the real wake hook, running `script` as PI_SESSION_ID `session`. */
function coordinator(name: string, session: string, script: string, env: Record<string, string> = {}): string {
	const dir = join(p.parent, name);
	mkdirSync(dir);
	writeFileSync(join(dir, "task.md"), script);
	const args = ["--session-dir", join(dir, "session"), "--extension", WAKE_HOOK, `@${join(dir, "task.md")}`];
	const options = { cwd: p.root, env: { ...p.env, ...env, PI_SESSION_ID: session }, stdio: "ignore" } as const;
	sessions.push(spawn(join(p.bin, "pi"), args, options));
	return dir;
}
/** A detached job running the fake-engine `script`, spawned from the `coord` session unless `env` says otherwise. */
function job(
	script: string,
	label: string,
	flags: readonly string[] = [],
	env: Record<string, string> = { PI_SESSION_ID: "coord" },
): string {
	return spawnJob(p, script, [...ROUTE, "--label", label, ...flags], { env });
}
/** The wakes a session received for job `id`, with their position in its event record. */
function wakes(dir: string, id: string) {
	return engineEvents(dir).flatMap((event, index) =>
		event.text?.startsWith("Limen job") && event.text.includes(id) ? [{ ...event, index }] : [],
	);
}
const delivered = (ids: readonly string[], session = "coord") =>
	until(join(p.root, ".limen", "jobs"), () =>
		ids.every((id) => existsSync(join(jobDir(p, id), "notify", "delivered", session))),
	);
/** Each job woke the listeners of its session exactly once, and its wake names the job's label and recorded state. */
function wokeOnce(ids: Readonly<Record<string, string>>, listeners: readonly string[]): void {
	for (const [name, id] of Object.entries(ids)) {
		const [wake, ...extra] = listeners.flatMap((dir) => wakes(dir, id));
		assert.equal(extra.length, 0, `${name} woke its session once`);
		const named = wake?.text?.includes(jobRecord(p, id)?.label ?? "?") && wake.text.includes(jobState(p, id));
		assert.ok(named, `${name} wake names its label and state`);
	}
}

before(async () => {
	p = await plant();
	coord = coordinator("coord", "coord", "block\n/limen off\nblock\n/limen on\nblock\n");
});
after(async () => {
	for (const session of sessions) {
		session.kill();
	}
	await p.cleanup();
});

test("a job that ends done, failed or on a provider error wakes its session once, with two listeners on that session", async () => {
	const second = coordinator("second", "coord", "block\n");
	const handoff = `${FINAL.line.replace("Note check:", "Report:")}\\n## Note check\\n- Hold: not proven. No run.\\n- Cap: proven. \`npm test\``;
	// The jobs that commit wait for their release until the last spawn: a finished job with unlanded work refuses a worker
	// spawn (A-001).
	const ids = {
		done: job(`block\ncommit\nfinish ${handoff}`, "a done"),
		failed: job("fail 7", "a failed"),
		provider: job(`block\nsay ${FINAL.line}\ncommit\nerror`, "a provider error"),
	};
	await Promise.all([release(jobDir(p, ids.done)), release(jobDir(p, ids.provider))]);
	const states = Object.fromEntries(Object.entries(ids).map(([name, id]) => [name, waitJob(p, id)]));
	await delivered(Object.values(ids));
	// Every wake is recorded now. The second listener ends, so only the coord session hears the next jobs.
	await release(second);
	await until(second, () => engineEvents(second).some((event) => event.event === "exit"));
	assert.deepEqual(states, { done: "done", failed: "failed", provider: "failed" });
	// T-31 (3): each end has the kind its detector set (A-016 (1)): a nonzero exit, and an engine error with no limit.
	assert.deepEqual(
		[jobRecord(p, ids.failed)?.failure?.kind, jobRecord(p, ids.provider)?.failure?.kind],
		["exit", "engine-error"],
	);
	// The first finish ends the job with its handoff; no check before it is sent (A-044).
	assert.equal(jobFile(p, ids.done, "log").includes("note check sent"), false);
	// A provider error after a commit fails the job (967ab4b recorded it as done) and keeps the commit on its branch.
	assert.equal(git(p.root, "rev-list", "--count", `main..${jobRecord(p, ids.provider)?.branch}`), "1");
	wokeOnce(ids, [coord, second]);
	const [failed = "", done = "", provider = ""] = [ids.failed, ids.done, ids.provider].map(
		(id) => [coord, second].flatMap((dir) => wakes(dir, id))[0]?.text,
	);
	assert.match(failed, /produced nothing/);
	assert.doesNotMatch(done, /produced nothing/);
	assert.ok(done.includes(`Final message:\n${handoff.replaceAll("\\n", "\n")}\n\n`));
	assert.equal(jobFile(p, ids.provider, "result"), FINAL.text); // stdout cut it inside letters of 2, 3 and 4 bytes
	assert.ok(provider.includes(`Final message:\n${FINAL.text}\n\n`));
	// The task note is cut (A-044): a "Note check" in the final message is its text, so the wake is a plain done.
	assert.deepEqual(
		[/\nis done \(/.test(done), done.includes("\n\nJob done. Next step: land it, "), /open checks/i.test(done)],
		[true, true, false],
	);
	// The next tests of this plant spawn workers, which these two commits would refuse.
	for (const id of [ids.done, ids.provider]) {
		const abandoned = limen(p, ["abandon", id]);
		assert.equal(abandoned.status, 0, abandoned.stderr);
	}
});

test("stop, timeout and a stalled tool each end a job once and wake its session once; 80% of a timeout steers once", async () => {
	writeFileSync(join(p.root, ".agents/limen/limits.json"), '{"prepare":"1s","toolStall":"2s","timeout":"2h"}\n');
	const ids = {
		stopped: job("block", "b stopped"),
		timeout: job("block", "b timeout", ["--role", "reviewer", "--timeout", "3s"]),
		stall: job("idle", "b stall", ["--prepare", "sleep 30"]),
	};
	await until(jobDir(p, ids.stopped), () => existsSync(join(jobDir(p, ids.stopped), "fake-blocked-1")));
	assert.equal(limen(p, ["stop", ids.stopped, "test stop"]).status, 0);
	const states = Object.fromEntries(Object.entries(ids).map(([name, id]) => [name, waitJob(p, id)]));
	assert.deepEqual(states, { stopped: "stopped", timeout: "failed", stall: "failed" });
	// T-31 (3): each end has the kind its detector set (A-016 (1)).
	assert.deepEqual(
		[jobRecord(p, ids.timeout)?.failure?.kind, jobRecord(p, ids.stall)?.failure?.kind],
		["timeout", "stall"],
	);
	// D-121: the wrapper takes the steer's text from the job's record.role; a reviewer's differs from the commit text of
	// a record with no role, so a wrapper that dropped the role fails here.
	assert.equal(
		jobFile(p, ids.timeout, "log").match(/steered: 1 min left before the timeout: write your verdict now\.\n/g)?.length,
		1,
	);
	assert.match(
		jobFile(p, ids.stall, "log"),
		/limits: ignored \.agents\/limen\/limits\.json: timeout: expected one of the fields prepare, toolStall, toolCalls or modules, got "2h"\n.*timed out after 1 s.*stalled tool bash sleep 600: scope CPU idle and no tool progress for 2s/s,
	);
	// One terminal line each; a stop logs two until F928 lands (stop.ts's 25 ms grace races the finalize).
	for (const id of [ids.timeout, ids.stall]) {
		assert.equal(jobFile(p, id, "log").match(/\] (?:done|failed|stopped):/g)?.length, 1, id);
	}
	await delivered(Object.values(ids));
	wokeOnce(ids, [coord]);
});

test("the tool cap of the project's limits file ends a job once and wakes its session once", async (t) => {
	// The later tests of this file run with the earlier limits, so a cap of one tool start ends with this test.
	const limits = join(p.root, ".agents/limen/limits.json");
	const earlier = readFileSync(limits, "utf8");
	t.after(() => writeFileSync(limits, earlier));
	writeFileSync(limits, '{"toolCalls":1}\n');
	// The wrapper counts the tool start before the engine's exit, so the cap decides even when the engine ends first.
	const ids = { cap: job("tool ls\nsay capped", "b tool cap") };
	const state = waitJob(p, ids.cap);
	// Every wake is in before the first assertion, so a failure here leaves the coord session idle for the next test.
	await delivered(Object.values(ids));
	const log = jobFile(p, ids.cap, "log");
	assert.deepEqual(
		[state, log.match(/\] failed: (tool-call cap reached after \d+ calls)/)?.[1], jobRecord(p, ids.cap)?.failure?.kind],
		["failed", "tool-call cap reached after 1 calls", "tool-cap"],
	);
	assert.equal(log.match(/\] (?:done|failed|stopped):/g)?.length, 1);
	wokeOnce(ids, [coord]);
});

test("wakes of jobs that end while muted arrive after /limen on, in one turn, each exactly once (F042)", async () => {
	await release(coord, 1);
	await until(coord, () => existsSync(join(coord, "fake-blocked-2")));
	const muted = [job("say one", "m one"), job("say two", "m two")];
	for (const id of muted) {
		assert.equal(waitJob(p, id), "done");
	}
	await release(coord, 2);
	await delivered(muted);
	const on = engineEvents(coord).findIndex(
		(event) => event.event === "notify" && event.text?.startsWith("limen wake on"),
	);
	assert.ok(on >= 0, "the session saw /limen on");
	const heard = muted.map((id) => wakes(coord, id));
	// Before 7e43d23 the batched turn confirmed only its last wake, and the first was injected again.
	assert.equal(heard.map((list) => list.length).join(), "1,1");
	const afterOn = heard.every(([wake]) => (wake?.index ?? -1) > on);
	assert.ok(afterOn, "muted wakes arrive only after /limen on");
	// The first idle inject opens a turn; the second joins it as a follow-up, so both enter one turn.
	assert.equal(heard.map(([wake]) => wake?.event).join(), "user,followUp");
});

test("limen watch: watch and unwatch move a job's wake to another session", async () => {
	const other = coordinator("other", "other", "block\n");
	const moved = job("block", "w moved");
	assert.equal(limen(p, ["watch", moved]).status, 1, "watch needs a session to route the wake to");
	assert.equal(limen(p, ["watch", moved], { env: { PI_SESSION_ID: "other" } }).status, 0);
	assert.equal(limen(p, ["unwatch", moved], { env: { PI_SESSION_ID: "coord" } }).status, 0);
	await release(jobDir(p, moved));
	assert.equal(waitJob(p, moved), "done");
	await delivered([moved], "other");
	// The coord session visits jobs in id order in one sweep; a misrouted wake for `moved` lands before the barrier's.
	const barrier = job("say ok", "y barrier");
	await delivered([barrier]);
	assert.deepEqual([wakes(other, moved).length, wakes(coord, moved).length], [1, 0]);
});

/** The seat's start reading of the plant, which holds the gate at 10% CPU idle and opens it at 90%. */
const startReading = () => join(p.parent, "start-reading.json");
const HELD = '{"cpuIdle":10,"memoryFree":80}';
const OPEN = '{"cpuIdle":90,"memoryFree":80}';

test("a held gate starts its queued jobs by priority, then by queue time, and a dead wrapper or a stopped job ahead holds none", async () => {
	writeFileSync(startReading(), HELD);
	const [dead = "", stopped = ""] = ["q dead", "q stopped"].map((label) => job("say no", label, ["--priority", "1"]));
	const early = job("say early", "q early");
	const run = limen(p, ["spawn", ...ROUTE, "--label", "late", "say late"], { env: { PI_SESSION_ID: "coord" } });
	assert.match(
		outputText(run),
		/\nqueued late: CPU 10% idle \(gate 25%\), memory 80% free \(gate 20%\), 3 ahead\n\S+\nEnd your turn; Limen wakes you when the job ends\.\n$/,
	);
	const later = startedJob(run);
	const urgent = job("say urgent", "q urgent", ["--priority", "1"]);
	process.kill(jobRecord(p, dead)?.identity?.pid ?? 0, "SIGKILL");
	const stop = limen(p, ["stop", stopped, "not needed"]);
	assert.equal(stop.status, 0, stop.stderr);
	// The gate opens: urgent, the head by priority, starts first, then early and late by their time in the queue.
	writeFileSync(startReading(), OPEN);
	assert.equal([urgent, early, later].map((id) => waitJob(p, id)).join(), "done,done,done");
	const started = (id: string) => loggedAt(p, id, "start queue: started");
	assert.ok(started(urgent) < started(early) && started(early) < started(later), "priority, then queue time");
	// Every wake is in before the next test, so the coord session is idle for it.
	await delivered([urgent, early, later]);
});

test("a queued job tells its session once that it started, and then its finish wakes the session once", async () => {
	writeFileSync(startReading(), HELD);
	const heard = job("block", "n heard");
	writeFileSync(startReading(), OPEN);
	await until(jobDir(p, heard), () => existsSync(join(jobDir(p, heard), "notify/delivered/_start.coord")));
	await release(jobDir(p, heard));
	assert.equal(waitJob(p, heard), "done");
	await delivered([heard]);
	const wokeWith = wakes(coord, heard).map((wake) => wake.text?.includes(") started after "));
	assert.deepEqual(wokeWith, [true, false]);
});

// The start notice is its own receipt and comes first; a job that ended before its session heard it carries the
// notice's line in its finish wake instead.
test("a queued job that ends before its session hears that it started carries the start in its one finish wake", async () => {
	sessions[0]?.kill("SIGSTOP"); // the coord session sleeps until the job has ended
	writeFileSync(startReading(), HELD);
	const ended = job("say ended", "n ended");
	writeFileSync(startReading(), OPEN);
	const state = waitJob(p, ended);
	sessions[0]?.kill("SIGCONT");
	assert.equal(state, "done");
	await delivered([ended]);
	const wokeWith = wakes(coord, ended).map((wake) => wake.text?.includes(") started after "));
	assert.deepEqual(wokeWith, [true]);
});

test("an idle owner hears a job whose session is gone through one fallback wake once its grace passes", async () => {
	const owner = coordinator("owner", "owner", "block\n", { LIMEN_WAKE_FALLBACK_MS: "1500" });
	await delivered([job("say mine", "f owned", [], { PI_SESSION_ID: "owner" })], "owner");
	const orphan = job("say gone", "f orphan", [], { PI_SESSION_ID: "gone" });
	await delivered([orphan], "_fallback");
	wokeOnce({ orphan }, [owner]);
});
