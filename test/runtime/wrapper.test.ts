// src/runtime/wrapper.ts: a queued job's wrapper whose job folder is removed ends before its setup and its engine run,
// a queued job whose wait passes the gate file's failAfter ends failed, a wrapper outside its job's systemd user scope
// ends the job before it runs anything, an exhaustion whose scope cannot be ended still kills its process group, a
// TERM or a signal without a stop request ends a job failed, and a TERM after the engine ended changes nothing.
import assert from "node:assert/strict";
import { existsSync, writeFileSync } from "node:fs";
import { rm } from "node:fs/promises";
import { join } from "node:path";
import { test } from "node:test";
import { setTimeout as delay } from "node:timers/promises";
import { isTerminal } from "../../src/job/job.ts";
import type { Identity } from "../../src/job/record.ts";
import { platform } from "../../src/platform/platform.ts";
import { ownerState } from "../../src/runtime/reap.ts";
import {
	engineEvents,
	jobDir,
	jobFile,
	jobRecord,
	jobState,
	limen,
	type Plant,
	pathWithFailingScopeEnd,
	pathWithUnscopedRun,
	plant,
	release,
	routed,
	spawnJob,
	startedJob,
	until,
	waitJob,
	within,
} from "../plant.ts";

/**
 * How long the test waits for the wrapper and its process group to end. A passing wrapper exits at its next poll
 * (50 ms in a plant); the bound only ends the wait for one that never exits, so it is far above any poll on a loaded
 * machine.
 */
const EXIT_BOUND_MS = 10_000;
/** How often the test reads the wrapper's process again: an exit raises no file event. */
const EXIT_CHECK_MS = 20;
/** The group's grace here: the test knob LIMEN_STOP_GRACE_MS shortens the 10 s, so no test waits it (T-31 (4)). */
const GRACE_MS = "200";
/** How long an exhausted job's wrapper and group may take to end: the group's grace, and far above it for load. */
const GRACE_BOUND_MS = 20_000;
/**
 * How long a test waits for a job to end after a signal: the engine's exit takes milliseconds and the grace here 200 ms,
 * so the bound only ends the wait for a job that never ends, before the suite's timeout does.
 */
const END_BOUND_MS = 20_000;

/** Whether the job `id` of `p` ends within `END_BOUND_MS`. */
function endsWithin(p: Plant, id: string): Promise<boolean> {
	return within(jobDir(p, id), () => isTerminal(jobState(p, id)), END_BOUND_MS);
}

/** Sends `signal` to the job's wrapper alone, by the pid its record names, as a manual `kill <pid>` does (A-020). */
function signalWrapper(p: Plant, id: string, signal: NodeJS.Signals): void {
	const pid = jobRecord(p, id)?.identity?.pid;
	assert.ok(pid, "the record names the job's wrapper");
	assert.equal(platform.signalProcess(pid, signal), "sent");
}

/** The job `id` of `p` once its engine waits at its first `block`. */
async function blocked(p: Plant, id: string): Promise<void> {
	await until(jobDir(p, id), () => existsSync(join(jobDir(p, id), "fake-blocked-1")));
}

/** The SIGTERM events the job's engine recorded: `sigterm` as it ended on one, `sigterm ignored` once it was deaf. */
function sigtermEvents(p: Plant, id: string): string[] {
	return engineEvents(jobDir(p, id))
		.map(({ event }) => event)
		.filter((event) => event.startsWith("sigterm"));
}

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

// A-036: a wait in the start queue had no limit, so a job the gate held never ended. The gate file's failAfter is 2 ms
// here, so the wait passes it at its first decision or its next one, by the order of events, not by time (T-31 (4)).
test("a queued job whose wait passes the gate file's failAfter ends failed, kind queue, keeps its wait in queueWait and starts no engine", async (t) => {
	const p = await plant();
	t.after(() => p.cleanup());
	writeFileSync(
		join(p.parent, ".limen", "start-gate.json"),
		'{"settle":"1ms","diagnoseAfter":"1ms","failAfter":"2ms"}\n',
	);
	// Below the start gate's 25% CPU idle, so the job waits in the queue and starts no engine.
	writeFileSync(join(p.parent, "start-reading.json"), '{"cpuIdle":10,"memoryFree":80}');
	const id = spawnJob(p, "say queued");
	assert.equal(await endsWithin(p, id), true, "the job ends once its wait passes failAfter");
	const record = jobRecord(p, id);
	assert.deepEqual(
		{
			state: record?.state,
			kind: record?.failure?.kind,
			detail: /^queued for \d+s without a start: CPU 10% idle \(gate 25%\)/.test(record?.failure?.detail ?? ""),
			queued: record?.queued,
			since: typeof record?.queueWait?.since,
			left: typeof record?.queueWait?.leftAt,
			engine: jobFile(p, id, "fake-argv.json"),
		},
		{ state: "failed", kind: "queue", detail: true, queued: null, since: "string", left: "string", engine: "" },
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

// A-020: a TERM to the wrapper's pid alone, as a manual `kill <pid>` sends it, reached only the wrapper, and the engine
// ran on with no limit armed. With no stop request in the record it is a failure (A-052); Pi exits 143 on it (E-17),
// and the log names that exit before the job's last line, as seat step 3.8 reads it. The forwarded TERM leaves its
// result in the log (T-01).
test("a TERM to the job's wrapper alone reaches its engine and ends the job failed, kind signal, killed by SIGTERM", async (t) => {
	const p = await plant();
	t.after(() => p.cleanup());
	const id = spawnJob(p, "block");
	await blocked(p, id);
	const wrapper = jobRecord(p, id)?.identity?.pid;
	signalWrapper(p, id, "SIGTERM");
	assert.equal(await endsWithin(p, id), true, "the job ends after the TERM");
	const log = jobFile(p, id, "log");
	const [exited, last] = [log.indexOf("engine exited with code 143"), log.indexOf("] failed: killed by SIGTERM")];
	// The engine ends on the TERM itself, within the grace, so the wrapper sends no KILL.
	assert.deepEqual(
		[
			jobRecord(p, id)?.state,
			jobRecord(p, id)?.failure,
			sigtermEvents(p, id),
			log.includes(`SIGTERM received; TERM sent to process group ${wrapper}`),
			/TERM grace elapsed/.test(log),
			exited >= 0 && exited < last,
		],
		["failed", { kind: "signal", detail: "killed by SIGTERM", resetAt: null }, ["sigterm"], true, false, true],
	);
});

// A-019, A-052: whether the wrapper got a TERM is taken as its engine's outcome resolves, so a TERM that comes after the
// engine ended reached no engine and changes nothing: the engine's exit decides the end. The test gate LIMEN_END_GATE
// (D-029) holds the wrapper between its engine's end and its read of the record, so the TERM lands there by the order
// of events, not by time (z. 17, T-31 (4)).
test("a TERM to the job's wrapper after its engine exited 0 changes nothing: the job ends done with the engine's result", async (t) => {
	const p = await plant();
	t.after(() => p.cleanup());
	const gate = join(p.parent, "end-gate");
	const id = spawnJob(p, "say all done", [], { env: { LIMEN_END_GATE: gate } });
	const logged = (line: string) => within(jobDir(p, id), () => jobFile(p, id, "log").includes(line), END_BOUND_MS);
	assert.equal(await logged("engine ended; waiting for the test gate"), true, "the wrapper waits at the gate");
	signalWrapper(p, id, "SIGTERM");
	assert.equal(await logged("SIGTERM received"), true, "the wrapper handled the TERM at the gate");
	writeFileSync(gate, "");
	assert.deepEqual([waitJob(p, id), jobRecord(p, id)?.failure, jobFile(p, id, "result")], ["done", null, "all done"]);
});

// A-020, R-026 Deviation 1: the KILL after the grace goes to the engine's pid, not to the group the wrapper leads, so the
// wrapper lives on to record the end; the KILL leaves its result in the log (T-01).
test("an engine that ignores the TERM its wrapper forwards is killed after the grace, and its job ends failed, killed by SIGTERM", async (t) => {
	const p = await plant();
	t.after(() => p.cleanup());
	const id = spawnJob(p, "deaf\nblock", [], { env: { LIMEN_STOP_GRACE_MS: GRACE_MS } });
	await blocked(p, id);
	const engine = engineEvents(jobDir(p, id)).find(({ event }) => event === "pid")?.pid;
	signalWrapper(p, id, "SIGTERM");
	assert.equal(await endsWithin(p, id), true, "the job ends after the grace");
	assert.deepEqual(
		[
			jobRecord(p, id)?.failure?.detail,
			sigtermEvents(p, id),
			jobFile(p, id, "log").includes(`TERM grace elapsed; KILL sent to engine ${engine}`),
		],
		["killed by SIGTERM", ["sigterm ignored"], true],
	);
});

// A-020: no TERM disarms a limit, so a limit reached during the TERM's grace ends the job with its own failure; the
// first finisher wins (A-019). The engine starts the tools that reach the cap only on the TERM its wrapper forwards, so
// the TERM comes first by the order of events, not by time (z. 17, T-31 (4)); the grace outlasts the test, and the
// engine ends on the exhaustion's TERM.
test("a TERM to the job's wrapper disarms no limit: a tool cap reached during its grace ends the job failed, kind tool-cap", async (t) => {
	const p = await plant();
	t.after(() => p.cleanup());
	writeFileSync(join(p.root, ".agents/limen/limits.json"), '{"toolCalls":2}\n');
	const id = spawnJob(p, "tools-on-term 2\nblock", [], { env: { LIMEN_STOP_GRACE_MS: "60000" } });
	await blocked(p, id);
	signalWrapper(p, id, "SIGTERM");
	assert.equal(await endsWithin(p, id), true, "the tool cap ends the job");
	const log = jobFile(p, id, "log");
	const [termed, limit] = [log.indexOf("SIGTERM received"), log.indexOf("tool-call cap reached after 2 calls")];
	assert.deepEqual(
		[jobRecord(p, id)?.failure?.kind, termed >= 0 && termed < limit],
		["tool-cap", true],
		"the TERM came first, then the tool cap ended the job",
	);
});

// A-052: an engine that a signal ends, with no stop request in the record, fails with the signal's name; before, a
// SIGKILL read as a stop and any other signal lost its name ("worker exited with code unknown").
test("an engine that dies by SIGKILL or SIGSEGV with no stop request ends its job failed, kind signal, with the signal's name", async (t) => {
	const p = await plant();
	t.after(() => p.cleanup());
	const signals = ["SIGKILL", "SIGSEGV"];
	const ids = signals.map((signal) => spawnJob(p, `die ${signal}`));
	const failed = (signal: string) => ({ kind: "signal", detail: `killed by ${signal}`, resetAt: null });
	assert.deepEqual(
		ids.map((id) => [waitJob(p, id), jobRecord(p, id)?.failure]),
		signals.map((signal) => ["failed", failed(signal)]),
	);
});

// A-052: the kernel's OOM killer ends a process by SIGKILL, and the job scope's memory.events counts it (R-026).
test("an engine killed by SIGKILL in a scope whose memory.events counts an OOM kill ends its job failed, kind oom", async (t) => {
	const p = await plant();
	t.after(() => p.cleanup());
	const id = spawnJob(p, "block\ndie SIGKILL");
	await blocked(p, id);
	const cgroup = jobRecord(p, id)?.scope?.cgroup;
	assert.ok(cgroup, "the record names the job's scope");
	const events = join(p.env.LIMEN_CGROUP_ROOT ?? "", cgroup, "memory.events");
	writeFileSync(events, "low 0\nhigh 0\nmax 0\noom 1\noom_kill 1\n");
	await release(jobDir(p, id));
	assert.equal(waitJob(p, id), "failed");
	assert.deepEqual(
		[jobRecord(p, id)?.failure, jobRecord(p, id)?.scope?.oomKills],
		[{ kind: "oom", detail: "killed by SIGKILL", resetAt: null }, 1],
	);
});

// A-052: only a stop request in the record makes a stop, also before the engine starts; a TERM without one fails the job.
test("a TERM to a queued job's wrapper with no stop request ends the job failed, killed by SIGTERM while queued, and starts no engine", async (t) => {
	const p = await plant();
	t.after(() => p.cleanup());
	// Below the start gate's 25% CPU idle, so the job waits in the queue and starts no engine.
	writeFileSync(join(p.parent, "start-reading.json"), '{"cpuIdle":10,"memoryFree":80}');
	const id = spawnJob(p, "say queued");
	await until(jobDir(p, id), () => jobFile(p, id, "log").includes("] queued: CPU 10% idle"));
	signalWrapper(p, id, "SIGTERM");
	assert.equal(await endsWithin(p, id), true, "the job ends after the TERM");
	assert.deepEqual(
		[jobRecord(p, id)?.failure, jobFile(p, id, "fake-argv.json")],
		[{ kind: "signal", detail: "killed by SIGTERM while queued", resetAt: null }, ""],
	);
});

// A-020: the forwarded TERM reaches the --prepare command, which runs in the wrapper's group, and no engine starts after
// the TERM; with no stop request in the record the job fails (A-052).
test("a TERM to the job's wrapper during its setup with no stop request ends the job failed, killed by SIGTERM during setup, and starts no engine", async (t) => {
	const p = await plant();
	t.after(() => p.cleanup());
	const id = spawnJob(p, "say never", ["--prepare", "touch prepare-started; exec sleep 600"]);
	const worktree = jobRecord(p, id)?.worktree ?? "";
	await until(worktree, () => existsSync(join(worktree, "prepare-started")));
	signalWrapper(p, id, "SIGTERM");
	assert.equal(await endsWithin(p, id), true, "the job ends after the TERM");
	assert.deepEqual(
		[jobRecord(p, id)?.failure, jobFile(p, id, "fake-argv.json")],
		[{ kind: "signal", detail: "killed by SIGTERM during setup", resetAt: null }, ""],
	);
});
