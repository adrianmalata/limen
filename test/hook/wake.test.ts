// hook/wake.ts: the guard on the `limen` command's arguments, nothing done before `limen migrate`, damaged records
// and progress files, which stop no wake and no status line, are named once, and are forgotten at a session start,
// a tick that ends no dead job (T-04), a wake the subscription limit kept from a coordinator's turn, owed until the
// sweep releases it (A-016 (2)), one advisory wake per source and session (the D-092 note), a wake settled only by
// the run it entered (A-089), one wake that starts a run per idle sweep, the others its follow-ups (A-090), the
// count of a wake that entered no run, a stop that ends once the hook's registration of its project is
// written (A-092), and the coordinator's bash sleep of 30 s or more that its tool_call handler blocks (T-34).
import assert from "node:assert/strict";
import { execFileSync, spawn, spawnSync } from "node:child_process";
import { existsSync, mkdirSync, readdirSync, readFileSync, writeFileSync } from "node:fs";
import { mkdir, mkdtemp, readdir, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test, { type TestContext } from "node:test";
import { fileURLToPath } from "node:url";
import limenWake, { notMigratedNotice } from "../../hook/wake.ts";
import { emptyRecord, type JobRecord, readRecordSync, serialized } from "../../src/job/record.ts";
import { CLAIM_STALE_MS } from "../../src/job/wake-delivery.ts";
import { LimenError } from "../../src/outcome.ts";
import { platform } from "../../src/platform/platform.ts";
import { sleepRefusal, WAKE_SENTENCE } from "../../src/runtime/mistake-guard.ts";
import { processIdentity } from "../../src/runtime/reap.ts";
import { inTemporaryProject, withEnvironment } from "../environment.ts";
import {
	editRecord,
	engineEvents,
	engineViews,
	fakeSystemd,
	type Plant,
	plant,
	within,
	writeRecord,
} from "../plant.ts";

/** The handler of the `limen` command that the hook registers on a fake `pi`. */
function commandHandler(): (args: unknown, context: unknown) => Promise<void> {
	const commands = new Map<string, unknown>();
	limenWake({
		on() {},
		sendUserMessage() {},
		registerCommand: (name: string, command: unknown) => commands.set(name, command),
	});
	const command = commands.get("limen");
	const handler = typeof command === "object" && command !== null ? Reflect.get(command, "handler") : undefined;
	assert.ok(typeof handler === "function", "the hook registers the limen command");
	return async (args, context) => {
		await handler(args, context);
	};
}

// Outside a job the hook keeps its refusal in the project of the working directory (src/runtime/pi-api.ts), so each
// test that makes the command refuse runs in a project of its own: from the checkout they wrote into the checkout's
// `.limen/refusals/` (R-102 review round 1, finding 1).
test("the limen command refuses arguments that are not a string with BAD_DATA naming them", async (t) => {
	withEnvironment(t, { LIMEN_JOB: "" });
	await inTemporaryProject(t, "limen-wake-guard-");
	const context = { ui: { notify() {}, setStatus() {} } };
	await assert.rejects(
		commandHandler()(["on"], context),
		(error) =>
			error instanceof LimenError && error.code === "BAD_DATA" && /: args: expected a string/.test(error.message),
	);
});

test("outside a job the limen command keeps its refusal in this process's refusal file in its project", async (t) => {
	withEnvironment(t, { LIMEN_JOB: "" });
	const root = await inTemporaryProject(t, "limen-wake-refusal-");
	await assert.rejects(commandHandler()(["on"], { ui: { notify() {}, setStatus() {} } }));
	const folder = join(root, ".limen", "refusals");
	const names = existsSync(folder) ? await readdir(folder) : [];
	const kept = names.length === 1 ? JSON.parse(readFileSync(join(folder, names[0] ?? ""), "utf8")) : {};
	assert.deepEqual(
		[names.map((name) => new RegExp(`^${process.pid}-\\d+\\.json$`).test(name)), [kept.event, kept.field]],
		[[true], ["command limen", "args"]],
	);
});

// D-057 (6): until `limen migrate` ran, the hook reads no job and writes nothing at session start; it says why once.
test("in a project whose job folder holds an older state file, session start does nothing and names the migration once", async (t) => {
	const root = await mkdtemp(join(tmpdir(), "limen-wake-old-"));
	t.after(() => rm(root, { recursive: true, force: true }));
	// The seat's registry of projects lives in the home folder; a hook that registered the project would write there.
	const home = join(root, "home");
	withEnvironment(t, { LIMEN_JOB: "", LIMEN_HOME: home, HOME: home });
	await mkdir(join(root, ".agents", "limen"), { recursive: true });
	const old = join(root, ".limen", "jobs", "2026-11-01-old-1a2b");
	await mkdir(old, { recursive: true });
	await writeFile(join(old, "state"), "done\n");
	const handlers = new Map<unknown, unknown>();
	limenWake({
		on(...args: unknown[]) {
			handlers.set(args[0], args[1]);
		},
		sendUserMessage() {},
		registerCommand() {},
	});
	const start = handlers.get("session_start");
	assert.ok(typeof start === "function", "the hook handles session_start");
	const notes: string[] = [];
	const context = {
		cwd: root,
		isIdle: () => true,
		sessionManager: { getSessionId: () => "wake-old-session", buildContextEntries: () => [] },
		ui: { notify: (text: string) => notes.push(text), setStatus() {} },
	};
	start({}, context);
	assert.equal(notes.length, 1, notes.join("\n"));
	assert.match(
		notes[0] ?? "",
		/older Limen .*; run limen migrate --dry-run, then limen migrate, then reload this coordinator session \(\/reload\): the hook checks only at session start$/,
	);
	assert.deepEqual((await readdir(join(root, ".limen"))).sort(), ["jobs"], "nothing registered or written");
	assert.deepEqual(await readdir(old), ["state"]);
	assert.deepEqual((await readdir(root)).sort(), [".agents", ".limen"], "no seat registry made");
});

// D-045 (2): a refusal's `next` may be null, so the note names a command to run first only when there is one.
test("NOT_MIGRATED: the hook's note with a null next asks to run only limen migrate, never null", () => {
	const error = new LimenError({ class: "environment", code: "NOT_MIGRATED", message: "older records", next: null });
	assert.equal(
		notMigratedNotice(error),
		"limen: wakes are off in this project: older records; run limen migrate, then reload this coordinator session (/reload): the hook checks only at session start",
	);
});

/** The handlers that the hook registers on a fake `pi` in this process's environment, by the event's name. */
function hookHandlers(): Map<unknown, unknown> {
	const handlers = new Map<unknown, unknown>();
	limenWake({
		on(...args: unknown[]) {
			handlers.set(args[0], args[1]);
		},
		sendUserMessage() {},
		registerCommand() {},
	});
	return handlers;
}

/** The `tool_call` handler that the hook registers in a coordinator's session. */
function toolCallHandler(t: TestContext): (event: unknown) => unknown {
	withEnvironment(t, { LIMEN_JOB: "" });
	const handler = hookHandlers().get("tool_call");
	assert.ok(typeof handler === "function", "the hook handles tool_call in a coordinator's session");
	return (event) => handler(event, {});
}

/** Pi's `tool_call` payload of a call of its bash tool that runs `command`. */
function bashCall(command: string) {
	return { type: "tool_call", toolCallId: "1", toolName: "bash", input: { command } };
}

// T-34 (1), z. 12: Pi runs no blocked call and writes the reason as the call's error result, which the model reads in
// the same run; with no `terminate`, the run goes on to that read.
test("T-34: in a coordinator's session the hook's tool_call handler blocks a bash sleep 240 with the guard's reason", (t) => {
	assert.deepEqual(toolCallHandler(t)(bashCall("sleep 240")), { block: true, reason: sleepRefusal("sleep 240") });
});

test("T-34: in a coordinator's session the hook's tool_call handler returns nothing for a bash sleep 5 and for a read", (t) => {
	const handler = toolCallHandler(t);
	const read = { type: "tool_call", toolCallId: "2", toolName: "read", input: { path: "sleep 240" } };
	assert.deepEqual([handler(bashCall("sleep 5")), handler(read)], [undefined, undefined]);
});

// T-34 (1): the guard is the coordinator's; a job's model may sleep (seat steps 3.8 and 4.12, R-060 for timers).
test("T-34: the hook registers its tool_call handler in a coordinator's session and none in a job's", (t) => {
	withEnvironment(t, { LIMEN_JOB: "" });
	const coordinator = hookHandlers().has("tool_call");
	// withEnvironment gives the variable its earlier value back after the test, so this change ends with it too.
	process.env.LIMEN_JOB = "1";
	const job = hookHandlers().has("tool_call");
	assert.deepEqual({ coordinator, job }, { coordinator: true, job: false });
});

/** Waits until `check` holds, failing after `limit` milliseconds. */
async function until(check: () => boolean, limit = 10_000): Promise<void> {
	const end = Date.now() + limit;
	while (!check()) {
		assert.ok(Date.now() < end, "the condition did not hold in time");
		await new Promise((resolve) => setTimeout(resolve, 50));
	}
}

/** What a coordinator's hook showed and sent: its notes, every status line it set, and its wakes. */
type Coordinator = {
	readonly notes: string[];
	readonly statuses: Array<string | undefined>;
	readonly wakes: string[];
	/** Calls the hook's handler of the Pi event `event` with `payload`, as Pi does. */
	fire(event: string, payload: unknown): void;
	/** Starts the session `session` in the same hook, as Pi's `session_start` of another session does. */
	newSession(session: string): void;
	/** Calls the hook's `session_shutdown` handler; Pi awaits the promise it returns before a session ends (E-22). */
	shutdown(): Promise<void>;
};

/** A project of `hookProject`: its root, its jobs folder, and how a test starts a coordinator's hook in it. */
type HookProject = {
	readonly root: string;
	readonly jobs: string;
	/** A new instance of the hook on a fake `pi`, started for the session `session` in the project. */
	startCoordinator(session: string): Coordinator;
};

/**
 * A project in a new folder in the OS temporary folder, in the environment of a coordinator outside Herdr. After the
 * test, every coordinator started in it stops, each shutdown awaited, before the folder goes, and the environment
 * comes back last: a hook that still runs writes below the folder, in the seat folder of the test's home (A-092).
 */
async function hookProject(t: TestContext, prefix: string): Promise<HookProject> {
	const root = await mkdtemp(join(tmpdir(), prefix));
	const started: Coordinator[] = [];
	t.after(async () => {
		for (const coordinator of started) {
			await coordinator.shutdown();
		}
		await rm(root, { recursive: true, force: true });
	});
	const home = join(root, "home");
	withEnvironment(t, { LIMEN_JOB: "", LIMEN_HOME: home, HOME: home, HERDR_TAB_ID: "", HERDR_PANE_ID: "" });
	await mkdir(join(root, ".agents", "limen"), { recursive: true });
	const startCoordinator = (session: string) => {
		const coordinator = newCoordinator(root, session);
		started.push(coordinator);
		return coordinator;
	};
	return { root, jobs: join(root, ".limen", "jobs"), startCoordinator };
}

/** A new instance of the hook on a fake `pi`, started for the session `session` in `root`. */
function newCoordinator(root: string, session: string): Coordinator {
	const handlers = new Map<unknown, unknown>();
	const notes: string[] = [];
	const statuses: Array<string | undefined> = [];
	const wakes: string[] = [];
	limenWake({
		on(...args: unknown[]) {
			handlers.set(args[0], args[1]);
		},
		sendUserMessage(message: string) {
			wakes.push(message);
		},
		registerCommand() {},
	});
	const start = handlers.get("session_start");
	const shutdown = handlers.get("session_shutdown");
	assert.ok(
		typeof start === "function" && typeof shutdown === "function",
		"the hook handles the session's start and end",
	);
	const newSession = (id: string) =>
		start(
			{},
			{
				cwd: root,
				isIdle: () => true,
				sessionManager: { getSessionId: () => id, buildContextEntries: () => [] },
				ui: {
					notify: (text: string) => notes.push(text),
					setStatus: (_key: string, value: string | undefined) => statuses.push(value),
				},
			},
		);
	newSession(session);
	const fire = (event: string, payload: unknown) => {
		const handler = handlers.get(event);
		assert.ok(typeof handler === "function", `the hook handles ${event}`);
		handler(payload, {});
	};
	return { notes, statuses, wakes, fire, newSession, shutdown: () => shutdown({}, {}) };
}

/** The notes that name a damaged file of a job. */
function damageNotes(coordinator: Coordinator): string[] {
	return coordinator.notes.filter((note) => note.includes("is damaged"));
}

/** Waits for `ticks` more sweeps of the hook: each sweep sets the status line, to a value or to none. */
async function sweeps(coordinator: Coordinator, ticks: number): Promise<void> {
	const seen = coordinator.statuses.length;
	await until(() => coordinator.statuses.length >= seen + ticks);
}

// The hook's session start registered its project in the seat folder without waiting, and its shutdown returned before
// that write ended, so a test that removed its folder next met the files the write still made (D-136).
test("A-092: once the hook's shutdown has settled, the seat folder holds only the registry, which lists the project once", async (t) => {
	const { root, startCoordinator } = await hookProject(t, "limen-wake-registered-");
	await startCoordinator("wake-registered-session").shutdown();
	// Read at once, with no turn of the event loop that would let a write still running end first.
	const seat = join(root, "home", ".limen");
	const names = existsSync(seat) ? readdirSync(seat) : [];
	const projects = names.includes("projects") ? readFileSync(join(seat, "projects"), "utf8") : "";
	assert.deepEqual({ names, projects }, { names: ["projects"], projects: `${root}\n` });
});

// T-01: a damaged record is reported, once per session; the sweep goes on to the other jobs.
test("a damaged record before a finished job: the finished job's wake still comes, and the hook names the damage once", async (t) => {
	const { jobs, startCoordinator } = await hookProject(t, "limen-wake-damaged-");
	const session = "wake-damaged-session";
	const damaged = "2026-11-21-damaged-0001";
	const finished = "2026-11-21-finished-0002";
	await mkdir(join(jobs, damaged, "notify", "subscribers"), { recursive: true });
	await writeFile(join(jobs, damaged, "record.json"), '{"version": 1, "state": 7}\n');
	await mkdir(join(jobs, finished, "notify", "subscribers"), { recursive: true });
	await writeFile(
		join(jobs, finished, "record.json"),
		serialized({ ...emptyRecord(finished), state: "done", label: "finished", finishedAt: new Date().toISOString() }),
	);
	for (const id of [damaged, finished]) {
		await writeFile(join(jobs, id, "notify", "ready"), "1\n");
		await writeFile(join(jobs, id, "notify", "subscribers", session), `${new Date().toISOString()}\n`);
	}
	const coordinator = startCoordinator(session);
	await until(() => coordinator.wakes.some((wake) => wake.includes(finished)));
	// Two more sweeps read the damaged record again; it is still named once.
	await sweeps(coordinator, 2);
	const damage = damageNotes(coordinator);
	assert.equal(damage.length, 1, coordinator.notes.join("\n"));
	assert.match(damage[0] ?? "", new RegExp(`a file of job ${damaged} is damaged: .*${damaged}/record\\.json: `));
});

// T-01: what the hook found damaged belongs to one session; a new session reads every file again and names only what
// is still damaged.
test("a record repaired after the hook named its damage is not named again after a new session start", async (t) => {
	const { jobs, startCoordinator } = await hookProject(t, "limen-wake-repaired-");
	const id = "2026-11-21-repaired-0003";
	await mkdir(join(jobs, id), { recursive: true });
	await writeFile(join(jobs, id, "record.json"), '{"version": 1, "state": 7}\n');
	const first = startCoordinator("wake-repaired-session-1");
	await until(() => damageNotes(first).some((note) => note.includes(id)));
	await writeRecord(join(jobs, id), { state: "done", label: "repaired", finishedAt: new Date().toISOString() });
	await first.shutdown();
	const second = startCoordinator("wake-repaired-session-2");
	await sweeps(second, 3);
	assert.deepEqual(damageNotes(second), []);
});

/** A running job of the test process, labelled `label`, whose progress file holds `progress`. */
async function runningJob(jobs: string, id: string, label: string, progress: string): Promise<void> {
	const at = new Date().toISOString();
	await writeRecord(join(jobs, id), { state: "running", label, identity: await processIdentity(), startedAt: at });
	await writeFile(join(jobs, id, "progress.json"), progress);
}

// T-01: the status line reads each running job's progress on every tick; a damaged one counts as none.
test("a damaged progress.json: the status line still shows every running job, and the hook names the damage once", async (t) => {
	const { jobs, startCoordinator } = await hookProject(t, "limen-wake-progress-");
	const damaged = "2026-11-21-alpha-0004";
	await runningJob(jobs, damaged, "alpha", "{ not json\n");
	await runningJob(jobs, "2026-11-21-beta-0005", "beta", '{"activity":"tool","lastTool":"bash","toolCalls":3}\n');
	const coordinator = startCoordinator("wake-progress-session");
	await until(() => coordinator.statuses.some((status) => status?.startsWith("limen 2 · ")));
	await sweeps(coordinator, 2);
	const status = coordinator.statuses.findLast((line) => line !== undefined) ?? "";
	assert.match(status, /^limen 2 · alpha think \(unwatched\) beta tool:bash \(unwatched\)$/);
	const damage = damageNotes(coordinator);
	assert.equal(damage.length, 1, coordinator.notes.join("\n"));
	assert.match(damage[0] ?? "", new RegExp(`a file of job ${damaged} is damaged: .*${damaged}/progress\\.json: `));
});

// T-01: a job's progress tells the completion wake only whether the job produced nothing; a damaged one holds no wake.
test("a finished job whose progress.json is damaged still gets its completion wake, and the hook names the damage once", async (t) => {
	const { jobs, startCoordinator } = await hookProject(t, "limen-wake-finished-progress-");
	const session = "wake-finished-progress-session";
	const id = "2026-11-21-finished-0006";
	const job = join(jobs, id);
	await writeRecord(job, { state: "done", label: "finished", finishedAt: new Date().toISOString() });
	await writeFile(join(job, "progress.json"), "{ not json\n");
	await mkdir(join(job, "notify", "subscribers"), { recursive: true });
	await writeFile(join(job, "notify", "ready"), "1\n");
	await writeFile(join(job, "notify", "subscribers", session), `${new Date().toISOString()}\n`);
	const coordinator = startCoordinator(session);
	await until(() => coordinator.wakes.some((wake) => wake.includes(id)));
	await sweeps(coordinator, 2);
	const damage = damageNotes(coordinator);
	assert.equal(damage.length, 1, coordinator.notes.join("\n"));
	assert.match(damage[0] ?? "", new RegExp(`a file of job ${id} is damaged: .*${id}/progress\\.json: `));
});

// T-04, D-094 (1): the tick ran the reaper inside the coordinator's Pi process; only the seat sweep finalizes a job
// now.
test("the hook's tick does not end a running job whose wrapper is dead, however many ticks pass", async (t) => {
	const { root, jobs, startCoordinator } = await hookProject(t, "limen-wake-dead-");
	withEnvironment(t, { ...(await fakeSystemd(root)), LIMEN_REAP_CONFIRM_MS: "1" });
	const id = "2026-11-24-dead-0007";
	const identity = { pid: 2_147_483_646, born: "1", bootId: platform.bootId() ?? null };
	await writeRecord(join(jobs, id), { state: "running", label: "dead", identity, startedAt: new Date().toISOString() });
	const coordinator = startCoordinator("wake-dead-session");
	await sweeps(coordinator, 4);
	assert.equal(readRecordSync(join(jobs, id))?.state, "running");
});

/** The provider's text of the 5-hour limit, as a coordinator's turn gets it in `errorMessage` (E-9). */
const LIMIT_TEXT = "You've hit your session limit · resets 3pm (UTC)";

/**
 * A job of `jobs` whose wakes the session `session` waits for: finished, unless `fields` says otherwise. The fields
 * are planted through the record's JSON, so a field this Limen reads and an older one refuses reaches both alike.
 */
async function jobFor(jobs: string, id: string, session: string, fields: Partial<JobRecord> = {}): Promise<string> {
	const job = join(jobs, id);
	await writeRecord(job, { state: "done", label: "finished", finishedAt: "2026-11-24T14:00:00.000Z", ...fields });
	await mkdir(join(job, "notify", "subscribers"), { recursive: true });
	// Subscribed before it is routable: a sweep of a running hook between the two writes would otherwise find a routable
	// job of no session, past its fallback grace, and send its wake as a fallback, which no subscriber's receipt records.
	await writeFile(join(job, "notify", "subscribers", session), `${new Date().toISOString()}\n`);
	await writeFile(join(job, "notify", "ready"), "1\n");
	return job;
}

// A-044: the task note is cut, so the items an older record holds in openChecks no longer make a done job's toast ask
// for a decision (R-042 Decision 2).
test("the toast of a done job whose older record holds open checks is the plain done toast", async (t) => {
	const { jobs, startCoordinator } = await hookProject(t, "limen-wake-open-checks-");
	const session = "wake-open-checks-session";
	const id = "2026-11-27-checked-0008";
	await jobFor(jobs, id, session, { openChecks: ["Tests: not proven. No run."] });
	const coordinator = startCoordinator(session);
	await until(() => coordinator.wakes.some((wake) => wake.includes(id)));
	assert.deepEqual(
		coordinator.notes.filter((note) => note.includes(`(${id})`)),
		[`limen: finished done; next step: land it, or name the check that blocks landing (${id})`],
	);
});

/** One coordinator turn on `wake`, as Pi runs it: the wake enters, the reply ends with `ending`, and the run settles. */
function turn(
	coordinator: Coordinator,
	wake: string,
	ending: { readonly stopReason?: string; readonly errorMessage?: string },
) {
	coordinator.fire("message_start", { message: { role: "user", content: [{ type: "text", text: wake }] } });
	coordinator.fire("message_end", { message: { role: "assistant", content: [], ...ending } });
	coordinator.fire("agent_settled", {});
}

/**
 * The owed wake that the limit turn on the claim `slot` of `job` left, once the claim is gone, with whether it named
 * the reset of `LIMIT_TEXT` (the first 3pm UTC after the turn) and the turn's time, and whether an attempt was counted.
 */
async function owedAfterLimitTurn(coordinator: Coordinator, job: string, slot: string) {
	await until(() => coordinator.wakes.length === 1);
	await until(() => existsSync(join(job, "notify", "claims", slot, "accepted")));
	const said = Date.now();
	turn(coordinator, coordinator.wakes[0] ?? "", { stopReason: "error", errorMessage: LIMIT_TEXT });
	await until(() => !existsSync(join(job, "notify", "claims", slot)));
	const owed = readRecordSync(job)?.owedWake;
	return {
		reset: Boolean(owed?.resetAt?.endsWith("T15:00:00.000Z")) && Date.parse(owed?.resetAt ?? "") > said,
		since: Math.abs(Date.parse(owed?.since ?? "") - said) < 60_000,
		attempts: existsSync(join(job, "notify", "unconfirmed")),
	};
}

/** An owed wake as the hook writes it, whose reset has not come. */
const OWED = { since: "2026-11-24T14:10:00.000Z", resetAt: "2099-01-01T15:00:00.000Z" } as const;

// A-016 (2), D-097 (5) (h): a turn that errored spent one of the two attempts, so two turns inside one limit stopped
// the wake for good.
test("a completion wake whose turn ends on the subscription limit spends no attempt and is owed on its job with the reset the turn named", async (t) => {
	const { jobs, startCoordinator } = await hookProject(t, "limen-wake-owed-");
	const session = "wake-owed-session";
	const job = await jobFor(jobs, "2026-11-24-owed-0008", session);
	const coordinator = startCoordinator(session);
	assert.deepEqual(await owedAfterLimitTurn(coordinator, job, session), { reset: true, since: true, attempts: false });
});

// D-097 (5) (h), review round 1, F7: every wake's claim lies in its job's folder, so an advisory is owed the same way.
test("an advisory wake whose turn ends on the subscription limit spends no attempt and is owed on its running job", async (t) => {
	const { jobs, startCoordinator } = await hookProject(t, "limen-wake-owed-advisory-");
	const session = "wake-owed-advisory-session";
	const at = new Date().toISOString();
	const job = await jobFor(jobs, "2026-11-24-advised-0010", session, {
		state: "running",
		finishedAt: null,
		identity: await processIdentity(),
		startedAt: at,
		advisory: { text: "tool stall observation uncertain: CPU or process identity unavailable", at },
	});
	const coordinator = startCoordinator(session);
	// A record without a source holds the wrapper's note, whose receipt is the stall's (D-092 note).
	const owed = await owedAfterLimitTurn(coordinator, job, `_advisory.stall.${session}`);
	assert.deepEqual([owed, readRecordSync(job)?.state], [{ reset: true, since: true, attempts: false }, "running"]);
});

// The D-092 note (Q-43): the receipt was one per job and session, so a job whose queue diagnosis a session heard got
// no stall note after it in that session.
test("a stall advisory reaches a session that already heard the same job's queue diagnosis", async (t) => {
	const { jobs, startCoordinator } = await hookProject(t, "limen-wake-sources-");
	const session = "wake-sources-session";
	const at = new Date().toISOString();
	const queue = { text: "queued for 31m without a start: CPU 10% idle (gate 25%)", at, source: "queue" } as const;
	const job = await jobFor(jobs, "2026-11-24-sources-0014", session, {
		state: "running",
		finishedAt: null,
		identity: await processIdentity(),
		startedAt: at,
		advisory: queue,
	});
	const coordinator = startCoordinator(session);
	await until(() => coordinator.wakes.length === 1);
	await until(() => existsSync(join(job, "notify", "claims", `_advisory.queue.${session}`, "accepted")));
	turn(coordinator, coordinator.wakes[0] ?? "", {});
	await until(() => existsSync(join(job, "notify", "delivered", `_advisory.queue.${session}`)));
	const stall = "tool stall observation uncertain: scope CPU unavailable: cpu.stat is missing";
	await editRecord(job, () => ({ advisory: { text: stall, at: new Date().toISOString(), source: "stall" } }));
	await until(() => coordinator.wakes.length === 2);
	assert.deepEqual(
		[coordinator.wakes[0]?.includes("queued for 31m"), coordinator.wakes[1]?.includes(stall)],
		[true, true],
	);
});

// A-016 (2): the wake waits on the record, not in the coordinator's session, until the seat sweep releases it.
test("a wake of a job whose record owes one is held", async (t) => {
	const { jobs, startCoordinator } = await hookProject(t, "limen-wake-held-");
	const session = "wake-held-session";
	await jobFor(jobs, "2026-11-24-held-0011", session, { owedWake: OWED });
	const coordinator = startCoordinator(session);
	await sweeps(coordinator, 4);
	assert.deepEqual([coordinator.wakes, damageNotes(coordinator)], [[], []]);
});

// A-016 (2), (3): the sweep's release removes the field (test/runtime/resuming.test.ts); the hook then delivers.
test("a held wake is delivered once its job's record no longer owes it, as the sweep's release leaves the record", async (t) => {
	const { jobs, startCoordinator } = await hookProject(t, "limen-wake-released-");
	const session = "wake-released-session";
	const id = "2026-11-24-released-0012";
	const job = await jobFor(jobs, id, session, { owedWake: OWED });
	const coordinator = startCoordinator(session);
	await sweeps(coordinator, 2);
	const held = coordinator.wakes.length;
	await writeRecord(job, { state: "done", label: "finished", finishedAt: "2026-11-24T14:00:00.000Z" });
	await until(() => coordinator.wakes.length === 1);
	assert.deepEqual([held, coordinator.wakes[0]?.includes(id), damageNotes(coordinator)], [0, true, []]);
});

// D-097 (5) (h), review round 2, G3: the limit mark of a run was cleared only when the run settled, so a session that
// ended between a limit's message_end and its settle left the mark to the next session's first run.
test("a limit end of an earlier session owes nothing in the next one: an errored turn there spends its attempt, and a limit turn there owes the wake", async (t) => {
	const { jobs, startCoordinator } = await hookProject(t, "limen-wake-stale-limit-");
	const [earlier, later] = ["wake-stale-limit-session-1", "wake-stale-limit-session-2"];
	const job = await jobFor(jobs, "2026-11-24-stale-0013", later);
	const coordinator = startCoordinator(earlier);
	await sweeps(coordinator, 1);
	coordinator.fire("message_end", {
		message: { role: "assistant", content: [], stopReason: "error", errorMessage: LIMIT_TEXT },
	});
	coordinator.newSession(later);
	const claim = join(job, "notify", "claims", later);
	await until(() => coordinator.wakes.length === 1 && existsSync(join(claim, "accepted")));
	turn(coordinator, coordinator.wakes[0] ?? "", { stopReason: "error", errorMessage: "Internal server error" });
	await until(() => coordinator.wakes.length === 2 && existsSync(join(claim, "accepted")));
	turn(coordinator, coordinator.wakes[1] ?? "", { stopReason: "error", errorMessage: LIMIT_TEXT });
	await until(() => !existsSync(claim));
	assert.deepEqual(
		{
			attempts: readFileSync(join(job, "notify", "unconfirmed", "_completion"), "utf8"),
			owed: readRecordSync(job)?.owedWake !== undefined,
		},
		{ attempts: "1\n", owed: true },
	);
});

// A-068: the seat's extension sent the coordinator a turn after its own limit; nothing in Limen replaces it.
test("a coordinator's own turn that ends on the subscription limit, with no wake in it, writes no owed wake and wakes nothing", async (t) => {
	const { jobs, startCoordinator } = await hookProject(t, "limen-wake-own-limit-");
	const id = "2026-11-24-quiet-0009";
	await writeRecord(join(jobs, id), { state: "done", label: "quiet", finishedAt: new Date().toISOString() });
	const coordinator = startCoordinator("wake-own-limit-session");
	await sweeps(coordinator, 1);
	turn(coordinator, "the owner's message", { stopReason: "error", errorMessage: LIMIT_TEXT });
	await sweeps(coordinator, 4);
	assert.deepEqual([coordinator.wakes, readRecordSync(join(jobs, id))?.owedWake], [[], undefined]);
});

const WAKE_HOOK = fileURLToPath(new URL("../../hook/wake.ts", import.meta.url));
const COORDINATOR = "coord";
/** The longest wait on the fake coordinator, far above the few seconds each test takes under the gate's load. */
const WAIT_MS = 60_000;

/** Waits until `check` holds, read again on each file event below `dir` and every second; fails naming `what`. */
async function waitFor(dir: string, what: string, check: () => boolean): Promise<void> {
	assert.ok(await within(dir, check, WAIT_MS), `${what}: not within ${WAIT_MS / 1_000} s`);
}

/**
 * Starts a coordinator session in the folder `dir` of the plant `p`: the fake engine (`p.bin/pi`) with the real hook,
 * then the test extension of source `extension`, as the project stub loads the hook before others
 * (templates/limen-extension.ts), on a task that waits at its `block`, so the session stays idle but for wakes.
 */
function fakeCoordinator(p: Plant, dir: string, extension: string): void {
	writeFileSync(join(dir, "test.mjs"), extension);
	writeFileSync(join(dir, "task.md"), "block\n");
	const args = ["--session-dir", join(dir, "session"), "--extension", WAKE_HOOK, "--extension", join(dir, "test.mjs")];
	const env = { ...p.env, PI_SESSION_ID: COORDINATOR };
	spawn(join(p.bin, "pi"), [...args, `@${join(dir, "task.md")}`], { cwd: p.root, env, stdio: "ignore" });
}

/** The wakes the fake coordinator in `dir` received for the job `id`, with how each was sent. */
function wakesOf(dir: string, id: string) {
	return engineEvents(dir).filter((event) => event.text?.startsWith("Limen job") && event.text.includes(id));
}

/**
 * Whether every wake of the job `id` for the coordinator is recorded: its claim delivered, blocked after two
 * attempts, or one attempt counted unconfirmed, after which the assertions fail whatever comes next.
 */
function heard(jobs: string, id: string): boolean {
	const notify = (path: string) => existsSync(join(jobs, id, "notify", path));
	return notify(`delivered/${COORDINATOR}`) || notify(`claims/${COORDINATOR}/blocked`) || notify("unconfirmed");
}

/** The jobs of `ids` with an unconfirmed wake attempt. */
function unconfirmed(jobs: string, ids: readonly string[]): string[] {
	return ids.filter((id) => existsSync(join(jobs, id, "notify", "unconfirmed")));
}

/**
 * The source of a test extension that writes, as JSON lines of seen.jsonl in `dir`, each run's starting prompt, each
 * user message that enters and each settle. With `hold`, it then holds the session's first agent_settled until one
 * write to the FIFO `hold-gate` in `dir`, and writes `held` there while it holds; loaded after the hook, it holds the
 * settle once the hook's handler has run, as another extension's awaiting handler holds Pi's (E-20).
 */
function notesExtension(dir: string, hold: boolean): string {
	const [seen, gate, held] = ["seen.jsonl", "hold-gate", "held"].map((name) => JSON.stringify(join(dir, name)));
	return `import { appendFileSync, createReadStream, writeFileSync } from "node:fs";
const note = (value) => appendFileSync(${seen}, \`\${JSON.stringify(value)}\\n\`);
let holding = ${hold};
export default function notes(pi) {
	pi.on("before_agent_start", (event) => note({ start: event.prompt }));
	pi.on("message_start", (event) => {
		if (event.message.role === "user") {
			note({ enter: event.message.content[0].text });
		}
	});
	pi.on("agent_settled", async () => {
		note({ settled: true });
		if (!holding) {
			return;
		}
		holding = false;
		const released = new Promise((resolve) => createReadStream(${gate}).once("data", resolve));
		writeFileSync(${held}, "");
		await released;
	});
}
`;
}

/**
 * The runs the notes extension in `dir` saw, as steps: `start <name>` and `enter <name>` for a run's start and a user
 * message that names a job of `names` (its id, its name), `settled` for each settle; the task's own start, while it
 * waits at `block`, names no job and is left out.
 */
function runSteps(dir: string, names: Readonly<Record<string, string>>): string[] {
	const path = join(dir, "seen.jsonl");
	const seen: Array<{ start?: string; enter?: string; settled?: true }> = existsSync(path)
		? JSON.parse(`[${readFileSync(path, "utf8").trim().split("\n").join(",")}]`)
		: [];
	return seen.flatMap((note) => {
		if (note.settled) {
			return ["settled"];
		}
		const text = note.start ?? note.enter ?? "";
		const name = Object.entries(names).find(([id]) => text.includes(id))?.[1];
		return name === undefined ? [] : [`${note.start === undefined ? "enter" : "start"} ${name}`];
	});
}

/**
 * Whether every run the notes extension in `dir` saw start for a job of `names` has settled: the hook records a
 * delivery in its settle handler, before the notes extension, loaded after it, notes that settle.
 */
function runsSettled(dir: string, names: Readonly<Record<string, string>>): boolean {
	const steps = runSteps(dir, names);
	return steps.filter((step) => step === "settled").length >= steps.filter((step) => step.startsWith("start ")).length;
}

// The hook's settle handler marked every pending wake settled, so a wake Pi deferred behind another one was counted
// unconfirmed at that one's settle and sent again, and its second count stopped its delivery (D-128).
test("A-089: wakes sent while a settle is held each enter their own run, settled by it, and wake the session once", async (t) => {
	const p = await plant();
	t.after(() => p.cleanup());
	const jobs = join(p.root, ".limen", "jobs");
	const dir = join(p.parent, COORDINATOR);
	mkdirSync(dir);
	execFileSync("mkfifo", [join(dir, "hold-gate")]);
	const names = {
		"2026-11-26-early-0001": "early",
		"2026-11-26-a-0002": "a",
		"2026-11-26-b-0003": "b",
		"2026-11-26-c-0004": "c",
	} as const;
	const [early = "", ...ids] = Object.keys(names);
	await jobFor(jobs, early, COORDINATOR);
	fakeCoordinator(p, dir, notesExtension(dir, true));
	// The early job's wake opens a run whose settle holds; three jobs end meanwhile, and the hook's sweeps send their
	// wakes inside that settle, so the engine runs each after it, in a run of its own.
	await waitFor(dir, "the early job's run holds its settle", () => existsSync(join(dir, "held")));
	for (const id of ids) {
		await jobFor(jobs, id, COORDINATOR);
	}
	await waitFor(dir, "a wake sent for each of a, b and c", () => ids.every((id) => wakesOf(dir, id).length > 0));
	await writeFile(join(dir, "hold-gate"), "go\n");
	const recorded = () => ids.every((id) => heard(jobs, id)) && runsSettled(dir, names);
	await waitFor(dir, "every wake of a, b and c recorded, and every run settled", recorded);
	assert.deepEqual(
		{
			runs: runSteps(dir, names),
			wakes: ids.map((id) => wakesOf(dir, id).length),
			unconfirmed: unconfirmed(jobs, ids),
		},
		{
			runs: [
				...["start early", "enter early", "settled"],
				...["start a", "enter a", "settled", "start b", "enter b", "settled", "start c", "enter c", "settled"],
			],
			wakes: [1, 1, 1],
			unconfirmed: [],
		},
	);
});

// The hook sent every due wake of an idle sweep at once; the engine started a run for each, dropped the second and
// settled it inside the first, so both wakes were counted unconfirmed (E-21).
test("A-090: two wakes due in one sweep while the coordinator is idle enter one run, the second as a follow-up, each once", async (t) => {
	const p = await plant();
	t.after(() => p.cleanup());
	const jobs = join(p.root, ".limen", "jobs");
	const names = { "2026-11-26-one-0005": "one", "2026-11-26-two-0006": "two" } as const;
	const ids = Object.keys(names);
	for (const id of ids) {
		await jobFor(jobs, id, COORDINATOR);
	}
	const dir = join(p.parent, COORDINATOR);
	mkdirSync(dir);
	// Both jobs are done before the session starts, so its first sweep finds both due.
	fakeCoordinator(p, dir, notesExtension(dir, false));
	const recorded = () => ids.every((id) => heard(jobs, id)) && runsSettled(dir, names);
	await waitFor(dir, "every wake of one and two recorded, and every run settled", recorded);
	assert.deepEqual(
		{
			run: runSteps(dir, names),
			wakes: ids.map((id) => wakesOf(dir, id).map((wake) => wake.event)),
			unconfirmed: unconfirmed(jobs, ids),
		},
		{ run: ["start one", "enter one", "enter two", "settled"], wakes: [["user"], ["followUp"]], unconfirmed: [] },
	);
});

/** Yields to the event loop with no timer, mocked or real, until `check` holds; fails after 1,000 turns. */
async function turnsUntil(check: () => boolean): Promise<void> {
	for (let turn = 0; !check(); turn += 1) {
		assert.ok(turn < 1_000, "the condition did not hold in 1,000 turns of the event loop");
		await new Promise((resolve) => setImmediate(resolve));
	}
}

/**
 * Mocks the clock and the timers of `t`, the clock two stale ages behind the real one: the claim recovery of
 * src/job/wake-delivery.ts compares it with file times, so while the clock stays behind the real one through the
 * test's jumps no claim looks old by its files, and only the hook's own times move.
 */
function mockClock(t: TestContext): void {
	t.mock.timers.enable({ apis: ["Date", "setInterval", "setTimeout"], now: Date.now() - 2 * CLAIM_STALE_MS });
}

/** A check that holds once the hook has swept after this call: each sweep sets the status line. */
function nextSweep(coordinator: Coordinator): () => boolean {
	const seen = coordinator.statuses.length;
	return () => coordinator.statuses.length > seen;
}

/** Each line of the log of the job folder `job`, without its time stamp. */
function logLines(job: string): string[] {
	const log = existsSync(join(job, "log")) ? readFileSync(join(job, "log"), "utf8") : "";
	return log.split("\n").flatMap((line) => (line ? [line.replace(/^\[limen [^\]]+\] /, "")] : []));
}

/** The job log's line of a wake counted because it entered no run. */
const LOST = "wake entered no run while the session stayed idle for 30 s; unsuccessful wake attempt 1/2";

// T-01: a wake the engine dropped (the second of two sends in one stretch, E-21) entered no run, so no settle counted
// it, and it waited unseen until the session ended.
test("a wake that enters no run is counted unconfirmed, with its reason in the job's log, once the session has been quiet for 30 s", async (t) => {
	mockClock(t);
	const { jobs, startCoordinator } = await hookProject(t, "limen-wake-lost-");
	const session = "wake-lost-session";
	const job = await jobFor(jobs, "2026-11-26-lost-0015", session);
	const coordinator = startCoordinator(session);
	await turnsUntil(() => existsSync(join(job, "notify", "claims", session, "accepted")));
	// The session reads idle throughout, and no run starts: the wake never enters.
	const beforeBound = nextSweep(coordinator);
	t.mock.timers.tick(CLAIM_STALE_MS - 1);
	await turnsUntil(beforeBound);
	const early = logLines(job);
	const atBound = nextSweep(coordinator);
	t.mock.timers.tick(1);
	await turnsUntil(atBound);
	assert.deepEqual({ early, log: logLines(job) }, { early: [], log: [LOST] });
});

// While runs go on, a wake Pi deferred behind them is late, not lost (E-20), so the quiet the count waits for starts at
// the last run's start or settle, not only at the send.
test("a wake that enters no run is not counted while a run settled less than 30 s ago, and is counted once that settle is 30 s old", async (t) => {
	mockClock(t);
	const { jobs, startCoordinator } = await hookProject(t, "limen-wake-lost-run-");
	const session = "wake-lost-run-session";
	const job = await jobFor(jobs, "2026-11-26-late-0016", session);
	const coordinator = startCoordinator(session);
	await turnsUntil(() => existsSync(join(job, "notify", "claims", session, "accepted")));
	// Another run, which the wake did not enter, settles 15 s after the send.
	const settled = nextSweep(coordinator);
	t.mock.timers.tick(15_000);
	coordinator.fire("agent_settled", {});
	await turnsUntil(settled);
	// Then the wake is 45 s old, beyond the bound, while that settle is just under it, then at it.
	const beforeBound = nextSweep(coordinator);
	t.mock.timers.tick(CLAIM_STALE_MS - 1);
	await turnsUntil(beforeBound);
	const early = logLines(job);
	const atBound = nextSweep(coordinator);
	t.mock.timers.tick(1);
	await turnsUntil(atBound);
	assert.deepEqual({ early, log: logLines(job) }, { early: [], log: [LOST] });
});

/**
 * Runs a coordinator's session named `name` of the plant `p` on the fake engine with the real hook, on `script`, which
 * makes one bash call, to its end. Gives whether the model's record of the call's result, in the model call after it,
 * holds the wake sentence, and whether the session's transcript marks that result as an error.
 */
function sleptOnce(p: Plant, name: string, script: string): { readonly sentence: boolean; readonly isError: unknown } {
	const dir = join(p.parent, name);
	mkdirSync(dir);
	writeFileSync(join(dir, "task.md"), script);
	const args = ["--session-dir", join(dir, "session"), "--extension", WAKE_HOOK, `@${join(dir, "task.md")}`];
	const env = { ...p.env, PI_SESSION_ID: name };
	const run = spawnSync(join(p.bin, "pi"), args, { cwd: p.root, env, encoding: "utf8", timeout: WAIT_MS });
	assert.equal(run.status, 0, run.stderr);
	const record = engineViews(dir)[1]?.messages.at(-1);
	const entries: Array<{ type?: string; message?: { role?: string; isError?: unknown } }> = readFileSync(
		join(dir, "session", "fake.jsonl"),
		"utf8",
	)
		.trim()
		.split("\n")
		.map((line) => JSON.parse(line));
	const result = entries.find((entry) => entry.type === "message" && entry.message?.role === "toolResult");
	return {
		sentence: record?.role === "tool" && record.text.join("\n").includes(WAKE_SENTENCE),
		isError: result?.message?.isError,
	};
}

// T-34 (1), T-31 (1), E-1: only a tool result reaches the model in a role other than user, so the refusal arrives as the
// result of the very call the model made, in the next call of the same run.
test("T-34: on the fake engine a coordinator's bash sleep 240 comes back as an error result that holds the wake sentence, and a sleep 5 as the tool's own result", async (t) => {
	const p = await plant();
	t.after(() => p.cleanup());
	assert.deepEqual(
		[sleptOnce(p, "coord-long", "tool sleep 240\nsay done"), sleptOnce(p, "coord-short", "tool sleep 5\nsay done")],
		[
			{ sentence: true, isError: true },
			{ sentence: false, isError: false },
		],
	);
});
