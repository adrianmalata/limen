// src/runtime/wrapper.ts: a queued job's wrapper whose job folder is removed ends before its setup and its engine run,
// a queued job whose wait passes the gate file's failAfter ends failed, a queued job's timeout counts from its engine's
// start, a wrapper outside its job's systemd user scope ends the job before it runs anything, each end has the kind its
// detector sets (A-016 (1)), the stall rule over the scope's CPU time and its uncertainty note, the peak CPU share of
// the scope, an exhaustion whose scope cannot be ended still kills its process group, a TERM or a signal without a
// stop request ends a job failed, a TERM after the engine ended changes nothing, and the tests' end gate holds a
// wrapper only in test mode.
import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { existsSync, mkdirSync, mkdtempSync, readFileSync, renameSync, rmSync, writeFileSync } from "node:fs";
import { rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { test } from "node:test";
import { setTimeout as delay } from "node:timers/promises";
import { isTerminal } from "../../src/job/job.ts";
import { type Identity, readRecordSync, transition } from "../../src/job/record.ts";
import { platform } from "../../src/platform/platform.ts";
import { ownerState } from "../../src/runtime/reap.ts";
import { endGate, failInternalJob } from "../../src/runtime/wrapper.ts";
import { withEnvironment } from "../environment.ts";
import {
	engineEvents,
	fakeSystemd,
	jobDir,
	jobFile,
	jobRecord,
	jobState,
	limen,
	loggedAt,
	type Plant,
	pathWithFailingScopeEnd,
	pathWithUnscopedRun,
	plant,
	release,
	routed,
	SCOPE_READINGS,
	spawnJob,
	start,
	startedJob,
	until,
	waitJob,
	within,
	writeRecord,
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
// the steps after the queue from running: setup, which runs the spawn's --prepare (src/runtime/job-setup.ts), and the
// engine, which runs in the wrapper's process group and writes its records into the job folder. Before R-101 the setup
// also pruned finished worktrees, which this test read instead of the --prepare's mark.
test("a queued wrapper whose job folder is removed exits without running its setup or its engine and recreates no folder", async (t) => {
	const p = await plant();
	t.after(() => p.cleanup());
	const prepared = join(p.parent, "prepared");
	// Below the start gate's 25% CPU idle, so the job waits in the queue and starts no engine.
	writeFileSync(join(p.parent, "start-reading.json"), '{"cpuIdle":10,"memoryFree":80}');
	const queued = spawnJob(p, "say queued", ["--prepare", `touch ${prepared}`]);
	const dir = jobDir(p, queued);
	// The log line follows the record's change, so the job's lock is released and the wrapper sleeps to its next poll.
	await until(dir, () => jobFile(p, queued, "log").includes("] queued: CPU 10% idle"));
	const identity = jobRecord(p, queued)?.identity;
	assert.ok(identity?.pid && identity.born, "the record names the queued job's wrapper");
	await rm(dir, { recursive: true });
	const exited = await ended(identity, EXIT_BOUND_MS);
	assert.deepEqual(
		{ exited, folder: existsSync(dir), prepared: existsSync(prepared) },
		{ exited: true, folder: false, prepared: false },
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

/**
 * The timeout of the queued job of the test below. It waits in the queue for longer than this, and then its engine
 * blocks until the timeout ends it, so a timeout counted from the queue would end it as soon as it starts. A loaded
 * machine can only lengthen both intervals, so nothing here rests on how fast an engine runs (D-063 (3)).
 */
const QUEUED_TIMEOUT_MS = 2_000;

// The wait in the start queue is no part of the job's run, so the wrapper counts the timeout from its engine's start.
test("a queued job's timeout counts from its engine's start, so a job that waited longer than it in the queue runs for the whole timeout", async (t) => {
	const p = await plant();
	t.after(() => p.cleanup());
	const reading = join(p.parent, "start-reading.json");
	// Below the start gate's 25% CPU idle, so the job waits in the queue and starts no engine yet.
	writeFileSync(reading, '{"cpuIdle":10,"memoryFree":80}');
	const id = spawnJob(p, "block", ["--timeout", `${QUEUED_TIMEOUT_MS / 1_000}s`]);
	await until(jobDir(p, id), () => Date.now() - loggedAt(p, id, "queued: ") > QUEUED_TIMEOUT_MS);
	writeFileSync(reading, '{"cpuIdle":90,"memoryFree":80}');
	assert.equal(waitJob(p, id), "failed");
	const queuedMs = loggedAt(p, id, "start queue: started") - loggedAt(p, id, "queued: ");
	const ranMs = Date.parse(jobRecord(p, id)?.finishedAt ?? "") - loggedAt(p, id, "worker started");
	assert.deepEqual(
		{ failure: jobRecord(p, id)?.failure?.kind, queued: queuedMs > QUEUED_TIMEOUT_MS, ran: ranMs >= QUEUED_TIMEOUT_MS },
		{ failure: "timeout", queued: true, ran: true },
		`queued ${queuedMs} ms, ran ${ranMs} ms`,
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
		[
			jobRecord(p, id)?.failure?.kind,
			jobRecord(p, id)?.failure?.detail.startsWith("not in its scope: "),
			jobFile(p, id, "fake-argv.json"),
		],
		["launch", true, ""],
	);
});

// D-095: an error the wrapper itself throws had no kind, so the alert said `failed:unknown`.
test("an error the job's wrapper throws ends its job failed, kind internal, with the error's message", async (t) => {
	const folder = mkdtempSync(join(tmpdir(), "limen-wrapper-"));
	t.after(() => rmSync(folder, { recursive: true, force: true }));
	const job = join(folder, "2026-11-24-internal-1a2b3c4d");
	withEnvironment(t, { ...(await fakeSystemd(folder)), LIMEN_JOB_DIR: job });
	await writeRecord(job, { state: "running", identity: { pid: 4242, born: "123", bootId: null } });
	await failInternalJob(new Error("internal job wrapper is missing LIMEN_PREAMBLE"));
	assert.deepEqual(readRecordSync(job)?.failure, {
		kind: "internal",
		detail: "internal job wrapper is missing LIMEN_PREAMBLE",
		resetAt: null,
	});
});

/** The 5-hour limit's text as the provider gives it: a synthetic copy of the format of audit.md, gate 2 §1, Q1. */
const SESSION_LIMIT = "You've hit your session limit · resets 3pm (UTC)";
const DAY_MS = 24 * 60 * 60 * 1000;

// A-016 (1), E-9: without a rate-limit event the reset time comes from the provider's errorMessage, the first 3pm UTC
// after the error; a reset time that stayed null left the resume of R-034 nothing to wait for.
test("an engine that stops on the provider's limit text ends its job failed, kind quota, with the reset time the text names", async (t) => {
	const p = await plant();
	t.after(() => p.cleanup());
	const id = spawnJob(p, `error ${SESSION_LIMIT}`);
	assert.equal(waitJob(p, id), "failed");
	const record = jobRecord(p, id);
	const reset = Date.parse(record?.failure?.resetAt ?? "");
	const started = Date.parse(record?.startedAt ?? "");
	assert.deepEqual(
		[
			record?.failure?.kind,
			record?.failure?.detail,
			record?.failure?.resetAt?.endsWith("T15:00:00.000Z"),
			reset > started && reset - started <= DAY_MS + 60_000,
		],
		["quota", `error: ${SESSION_LIMIT}`, true, true],
	);
});

// E-9: the bridge gives the structured reset time only on Pi's event bus, so it wins over the text; seat step 3.4 reads
// the log line.
test("a kendex:rate-limit event before the limit's text gives the job's quota failure the event's reset time and a log line", async (t) => {
	const p = await plant();
	t.after(() => p.cleanup());
	const resetAtMs = Date.parse("2026-11-24T17:40:00.000Z");
	const id = spawnJob(p, `rate-limit five_hour ${resetAtMs}\nerror ${SESSION_LIMIT}`);
	assert.equal(waitJob(p, id), "failed");
	const record = jobRecord(p, id);
	assert.deepEqual(
		[
			record?.failure?.kind,
			record?.failure?.resetAt,
			record?.rateLimit?.type,
			record?.rateLimit?.resetAt,
			jobFile(p, id, "log").includes("] rate-limit event: five_hour, resets 2026-11-24T17:40:00.000Z\n"),
		],
		["quota", "2026-11-24T17:40:00.000Z", "five_hour", "2026-11-24T17:40:00.000Z", true],
	);
});

// T-32 (4), D-055 (2): Pi reports a hook's error and goes on, so a job whose hook refused a malformed event ended done.
test("a hook's refusal of a malformed Pi event in a job ends the job failed, kind engine-error, naming the event and the field", async (t) => {
	const p = await plant();
	t.after(() => p.cleanup());
	const id = spawnJob(p, "malformed message_end\nsay done");
	assert.equal(waitJob(p, id), "failed");
	const record = jobRecord(p, id);
	assert.deepEqual(
		[record?.failure, record?.refusal?.event, record?.refusal?.field],
		[
			{
				kind: "engine-error",
				detail: "a Limen hook refused Pi event message_end: message: expected an object, got nothing",
				resetAt: null,
			},
			"message_end",
			"message",
		],
	);
});

// A-019: the first cause stays, so a refusal recorded before a limit ends the job leaves the limit's kind. The refusal
// is written into the record while the job's --prepare waits on a FIFO, before its engine and its time limit start, so
// the order is fixed by the test, not by how fast the engine starts (z. 17, T-31 (4)); the record's one writer writes
// it, as the adapter's `recorded` does.
test("a hook's refusal recorded before the job's timeout leaves the job failed, kind timeout", async (t) => {
	const p = await plant();
	t.after(() => p.cleanup());
	const [marker, gate] = [join(p.parent, "prepare-started"), join(p.parent, "prepare-gate")];
	execFileSync("mkfifo", [gate]);
	const prepare = `touch ${JSON.stringify(marker)}; cat ${JSON.stringify(gate)} > /dev/null`;
	const id = spawnJob(p, "block", ["--timeout", "1s", "--prepare", prepare]);
	await until(p.parent, () => existsSync(marker));
	const refusal = {
		event: "message_end",
		field: "message",
		message: "Pi event message_end: message: expected an object, got nothing",
		at: new Date().toISOString(),
	};
	assert.ok(await transition(jobDir(p, id), { from: ["running"], set: { refusal } }), "the running record takes it");
	writeFileSync(gate, "go\n");
	assert.equal(waitJob(p, id), "failed");
	const record = jobRecord(p, id);
	assert.deepEqual([record?.failure?.kind, record?.refusal?.event], ["timeout", "message_end"]);
});

// T-01, the D-092 note: the exhaustion's TERM dropped its result and logged only that it would send one.
test("a timeout's TERM to the job's process group leaves its result in the log after the call", async (t) => {
	const p = await plant();
	t.after(() => p.cleanup());
	const id = spawnJob(p, "block", ["--timeout", "1s"]);
	assert.equal(waitJob(p, id), "failed");
	const wrapper = jobRecord(p, id)?.identity?.pid;
	assert.equal(
		jobFile(p, id, "log").includes(`] timeout after 1000ms; TERM sent to process group ${wrapper}\n`),
		true,
		jobFile(p, id, "log"),
	);
});

// The D-092 note (R-028 review, round 2): the TERM's flag was taken at the engine's `close`, which waits for every
// holder of its pipes, so a TERM after the engine exited still made the job a signal death. The engine's child holds
// the pipes, and the test sends the TERM once the wrapper has reaped the engine, by the order of events (T-31 (4)).
test("a TERM to the job's wrapper after its engine exited, while a child still holds the engine's pipes, ends the job done", async (t) => {
	const p = await plant();
	t.after(() => p.cleanup());
	const id = spawnJob(p, "linger\nsay all done");
	await until(jobDir(p, id), () => engineEvents(jobDir(p, id)).some(({ event }) => event === "exit"));
	const engine = engineEvents(jobDir(p, id)).find(({ event }) => event === "pid")?.pid;
	assert.ok(engine, "the engine recorded its pid");
	assert.equal(await within(jobDir(p, id), () => !platform.processAlive(engine), END_BOUND_MS), true);
	signalWrapper(p, id, "SIGTERM");
	assert.deepEqual([waitJob(p, id), jobRecord(p, id)?.failure, jobFile(p, id, "result")], ["done", null, "all done"]);
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

// T-03, R-087 (b): the test gate has no bound of its own, so a spawner's environment on the seat that held the knob
// would hold every job's end until `limen stop` (the R-087 note of `plan.md`). The gate file exists, so a gate that is
// read logs its wait and opens at once; outside test mode the knob is not read and nothing is logged.
test("the end gate of LIMEN_END_GATE holds a wrapper's end only in test mode", async (t) => {
	const folder = mkdtempSync(join(tmpdir(), "limen-end-gate-"));
	t.after(() => rmSync(folder, { recursive: true, force: true }));
	const [gate, outside, inside] = [join(folder, "gate"), join(folder, "outside"), join(folder, "inside")] as const;
	writeFileSync(gate, "");
	mkdirSync(outside);
	mkdirSync(inside);
	withEnvironment(t, { LIMEN_END_GATE: gate, LIMEN_TEST_MODE: "0" });
	await endGate(outside);
	process.env.LIMEN_TEST_MODE = "1";
	await endGate(inside);
	const log = (dir: string) => (existsSync(join(dir, "log")) ? readFileSync(join(dir, "log"), "utf8") : "");
	assert.deepEqual([log(outside), log(inside).includes(`engine ended; waiting for the test gate ${gate}`)], ["", true]);
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

/** The cpu.stat of the job `id`'s scope in the tests' systemd (test/plant.ts), which its systemd-run wrote. */
function cpuStat(p: Plant, id: string): string {
	const cgroup = jobRecord(p, id)?.scope?.cgroup;
	assert.ok(cgroup, "the record names the job's scope");
	return join(p.env.LIMEN_CGROUP_ROOT ?? "", cgroup, "cpu.stat");
}

/** Writes `usage` microseconds as the CPU time of the cpu.stat at `path` whole, as the kernel's never reads half. */
function writeUsage(path: string, usage: number): void {
	writeFileSync(`${path}.next`, `usage_usec ${usage}\nuser_usec 0\nsystem_usec 0\n`);
	renameSync(`${path}.next`, path);
}

/** The job `id` of `p` once its engine runs the tool of `idle`: the wrapper logs the tool's line as it starts. */
async function toolPending(p: Plant, id: string): Promise<void> {
	await until(jobDir(p, id), () => jobFile(p, id, "log").split("\n").includes("bash sleep 600"));
}

// A-059: the stall rule read the engine's process tree with ps, so what the tool waited on outside that tree did not
// count; it reads the whole scope now.
test("a job whose tool waits while its scope's CPU time stands still ends failed, kind stall, after the window", async (t) => {
	const p = await plant();
	t.after(() => p.cleanup());
	writeFileSync(join(p.root, ".agents/limen/limits.json"), '{"toolStall":"1s"}\n');
	const id = spawnJob(p, "idle");
	assert.equal(waitJob(p, id), "failed");
	assert.deepEqual(jobRecord(p, id)?.failure, {
		kind: "stall",
		detail: "stalled tool bash sleep 600: scope CPU idle and no tool progress for 1s",
		resetAt: null,
	});
});

// A-059: a tool that waits on a build that works in the job's scope, detached from the tool or not, keeps the job. The
// idle job is the clock: its tool starts after the busy job's, so its stall shows that the window passed for both, by
// the order of events, not by time (T-31 (4)). The test's own process raises the busy scope's CPU time, so nothing
// blocks its event loop meanwhile: the idle job is spawned and awaited without a synchronous wait.
test("a job whose scope's CPU time grows while its tool waits, as a background build's does, is not ended by the stall rule", async (t) => {
	const p = await plant();
	t.after(() => p.cleanup());
	writeFileSync(join(p.root, ".agents/limen/limits.json"), '{"toolStall":"1s"}\n');
	const busy = spawnJob(p, "idle");
	await toolPending(p, busy);
	const stat = cpuStat(p, busy);
	let usage = SCOPE_READINGS.cpuMicroseconds;
	// A write that fails stops the build: the scope's folder goes with its job's end.
	let stopped: unknown;
	const build = setInterval(() => {
		usage += 100_000;
		try {
			writeUsage(stat, usage);
		} catch (error) {
			stopped = error;
			clearInterval(build);
		}
	}, 50);
	let idle = "";
	let busyState = "";
	try {
		idle = startedJob(await start(p, ["spawn", ...routed([]), "idle"]).done);
		await until(jobDir(p, idle), () => isTerminal(jobState(p, idle)));
		busyState = jobState(p, busy);
	} finally {
		clearInterval(build);
	}
	assert.deepEqual(
		[jobRecord(p, idle)?.failure?.kind, busyState, jobFile(p, busy, "log").includes("stalled tool"), stopped],
		["stall", "running", false, undefined],
	);
});

// M-09: the wrapper samples its scope's CPU time at every tick from the engine's start, also while no tool runs, and
// writes the largest rate at its end; until then the record holds null, as a job another process ends keeps it. A rate
// counts only over half a tick or more (review round 2, G1), so the test takes `cpu.stat` away until a tick has logged
// its failed read: the first read of the raised value then lies at least a tick after the last read before, by the
// order of events (T-31 (4)).
test("a job's record holds the peak CPU share of its scope: null while it runs, and at its end the whole machine for more CPU time than the machine has", async (t) => {
	const p = await plant();
	t.after(() => p.cleanup());
	const id = spawnJob(p, "block");
	await blocked(p, id);
	const running = jobRecord(p, id)?.scope?.cpuPeakPercent;
	const stat = cpuStat(p, id);
	rmSync(stat);
	const unread = `scope CPU unavailable: ${stat} is missing`;
	assert.equal(await within(jobDir(p, id), () => jobFile(p, id, "log").includes(unread), END_BOUND_MS), true);
	// A million CPU seconds within the job's run is more than any machine gives in it, so the rate is all of it.
	writeUsage(stat, 10 ** 12);
	await release(jobDir(p, id));
	assert.equal(waitJob(p, id), "done");
	assert.deepEqual([running, jobRecord(p, id)?.scope?.cpuPeakPercent], [null, 100]);
});

// R-036 review round 2, G1: a pair of samples closer than half a tick gives no rate, so the samples at the start and at
// the end of an engine run shorter than that leave the peak null. A tick of ten minutes makes the run shorter.
test("a job whose engine runs for less than half a tick keeps a null peak CPU share", async (t) => {
	const p = await plant();
	t.after(() => p.cleanup());
	const id = spawnJob(p, "say done", [], { env: { LIMEN_STALL_TICK_MS: String(10 * 60_000) } });
	assert.equal(waitJob(p, id), "done");
	assert.equal(jobRecord(p, id)?.scope?.cpuPeakPercent, null);
});

// T-01, (d) of R-036: a read of the scope's CPU time that fails ends no job and is never silent.
test("a job whose scope's cpu.stat is gone while its tool waits gets the stall's uncertainty note, which clears once the file reads again", async (t) => {
	const p = await plant();
	t.after(() => p.cleanup());
	const id = spawnJob(p, "idle");
	await toolPending(p, id);
	const stat = cpuStat(p, id);
	const kept = readFileSync(stat, "utf8");
	rmSync(stat);
	const text = `tool stall observation uncertain: scope CPU unavailable: ${stat} is missing`;
	const noted = await within(jobDir(p, id), () => jobRecord(p, id)?.advisory?.text === text, END_BOUND_MS);
	const source = jobRecord(p, id)?.advisory?.source;
	writeFileSync(stat, kept);
	const cleared = await within(jobDir(p, id), () => jobRecord(p, id)?.advisory === null, END_BOUND_MS);
	assert.deepEqual([noted, source, cleared, jobState(p, id)], [true, "stall", true, "running"]);
});

// T-01, R-036 review round 1, F1: the sample at the engine's end dropped a failed read. The test gate LIMEN_END_GATE
// (D-029) holds the wrapper after its engine ended and its ticks stopped, so the file is gone only for that sample, by
// the order of events (T-31 (4)).
test("a read of the scope's CPU time that fails at the engine's end is logged once with the stall's words, and sets no note", async (t) => {
	const p = await plant();
	t.after(() => p.cleanup());
	const gate = join(p.parent, "end-gate");
	const id = spawnJob(p, "say all done", [], { env: { LIMEN_END_GATE: gate } });
	const waiting = "engine ended; waiting for the test gate";
	assert.equal(await within(jobDir(p, id), () => jobFile(p, id, "log").includes(waiting), END_BOUND_MS), true);
	const stat = cpuStat(p, id);
	rmSync(stat);
	writeFileSync(gate, "");
	assert.equal(waitJob(p, id), "done");
	const line = `tool stall observation uncertain: scope CPU unavailable: ${stat} is missing`;
	const lines = jobFile(p, id, "log").split("\n");
	assert.deepEqual([lines.filter((each) => each.endsWith(`] ${line}`)).length, jobRecord(p, id)?.advisory], [1, null]);
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
