// hook/wake.ts: the guard on the `limen` command's arguments, nothing done before `limen migrate`, damaged records
// and progress files, which stop no wake and no status line, are named once, and are forgotten at a session start,
// a tick that ends no dead job (T-04), a wake the subscription limit kept from a coordinator's turn, owed until the
// sweep releases it (A-016 (2)), and one advisory wake per source and session (the D-092 note).
import assert from "node:assert/strict";
import { existsSync, readFileSync } from "node:fs";
import { mkdir, mkdtemp, readdir, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test, { type TestContext } from "node:test";
import limenWake, { notMigratedNotice } from "../../hook/wake.ts";
import { emptyRecord, type JobRecord, readRecordSync, serialized } from "../../src/job/record.ts";
import { LimenError } from "../../src/outcome.ts";
import { platform } from "../../src/platform/platform.ts";
import { processIdentity } from "../../src/runtime/reap.ts";
import { inTemporaryProject, withEnvironment } from "../environment.ts";
import { editRecord, fakeSystemd, writeRecord } from "../plant.ts";

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
		sessionManager: { getSessionId: () => "wake-old-session" },
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

/** Waits until `check` holds, failing after `limit` milliseconds. */
async function until(check: () => boolean, limit = 10_000): Promise<void> {
	const end = Date.now() + limit;
	while (!check()) {
		assert.ok(Date.now() < end, "the condition did not hold in time");
		await new Promise((resolve) => setTimeout(resolve, 50));
	}
}

/** A project in a new folder in the OS temporary folder, in the environment of a coordinator outside Herdr. */
async function hookProject(t: TestContext, prefix: string): Promise<{ readonly root: string; readonly jobs: string }> {
	const root = await mkdtemp(join(tmpdir(), prefix));
	t.after(() => rm(root, { recursive: true, force: true }));
	const home = join(root, "home");
	withEnvironment(t, { LIMEN_JOB: "", LIMEN_HOME: home, HOME: home, HERDR_TAB_ID: "", HERDR_PANE_ID: "" });
	await mkdir(join(root, ".agents", "limen"), { recursive: true });
	return { root, jobs: join(root, ".limen", "jobs") };
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
	shutdown(): void;
};

/** A new instance of the hook on a fake `pi`, started for the session `session` in `root`; it ends after `t`. */
function startCoordinator(t: TestContext, root: string, session: string): Coordinator {
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
	t.after(() => shutdown({}, {}));
	const newSession = (id: string) =>
		start(
			{},
			{
				cwd: root,
				isIdle: () => true,
				sessionManager: { getSessionId: () => id },
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

// T-01: a damaged record is reported, once per session; the sweep goes on to the other jobs.
test("a damaged record before a finished job: the finished job's wake still comes, and the hook names the damage once", async (t) => {
	const { root, jobs } = await hookProject(t, "limen-wake-damaged-");
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
	const coordinator = startCoordinator(t, root, session);
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
	const { root, jobs } = await hookProject(t, "limen-wake-repaired-");
	const id = "2026-11-21-repaired-0003";
	await mkdir(join(jobs, id), { recursive: true });
	await writeFile(join(jobs, id, "record.json"), '{"version": 1, "state": 7}\n');
	const first = startCoordinator(t, root, "wake-repaired-session-1");
	await until(() => damageNotes(first).some((note) => note.includes(id)));
	await writeRecord(join(jobs, id), { state: "done", label: "repaired", finishedAt: new Date().toISOString() });
	first.shutdown();
	const second = startCoordinator(t, root, "wake-repaired-session-2");
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
	const { root, jobs } = await hookProject(t, "limen-wake-progress-");
	const damaged = "2026-11-21-alpha-0004";
	await runningJob(jobs, damaged, "alpha", "{ not json\n");
	await runningJob(jobs, "2026-11-21-beta-0005", "beta", '{"activity":"tool","lastTool":"bash","toolCalls":3}\n');
	const coordinator = startCoordinator(t, root, "wake-progress-session");
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
	const { root, jobs } = await hookProject(t, "limen-wake-finished-progress-");
	const session = "wake-finished-progress-session";
	const id = "2026-11-21-finished-0006";
	const job = join(jobs, id);
	await writeRecord(job, { state: "done", label: "finished", finishedAt: new Date().toISOString() });
	await writeFile(join(job, "progress.json"), "{ not json\n");
	await mkdir(join(job, "notify", "subscribers"), { recursive: true });
	await writeFile(join(job, "notify", "ready"), "1\n");
	await writeFile(join(job, "notify", "subscribers", session), `${new Date().toISOString()}\n`);
	const coordinator = startCoordinator(t, root, session);
	await until(() => coordinator.wakes.some((wake) => wake.includes(id)));
	await sweeps(coordinator, 2);
	const damage = damageNotes(coordinator);
	assert.equal(damage.length, 1, coordinator.notes.join("\n"));
	assert.match(damage[0] ?? "", new RegExp(`a file of job ${id} is damaged: .*${id}/progress\\.json: `));
});

// T-04, D-094 (1): the tick ran the reaper inside the coordinator's Pi process; only the seat sweep finalizes a job
// now.
test("the hook's tick does not end a running job whose wrapper is dead, however many ticks pass", async (t) => {
	const { root, jobs } = await hookProject(t, "limen-wake-dead-");
	withEnvironment(t, { ...(await fakeSystemd(root)), LIMEN_REAP_CONFIRM_MS: "1" });
	const id = "2026-11-24-dead-0007";
	const identity = { pid: 2_147_483_646, born: "1", bootId: platform.bootId() ?? null };
	await writeRecord(join(jobs, id), { state: "running", label: "dead", identity, startedAt: new Date().toISOString() });
	const coordinator = startCoordinator(t, root, "wake-dead-session");
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
	await writeFile(join(job, "notify", "ready"), "1\n");
	await writeFile(join(job, "notify", "subscribers", session), `${new Date().toISOString()}\n`);
	return job;
}

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
	const { root, jobs } = await hookProject(t, "limen-wake-owed-");
	const session = "wake-owed-session";
	const job = await jobFor(jobs, "2026-11-24-owed-0008", session);
	const coordinator = startCoordinator(t, root, session);
	assert.deepEqual(await owedAfterLimitTurn(coordinator, job, session), { reset: true, since: true, attempts: false });
});

// D-097 (5) (h), review round 1, F7: every wake's claim lies in its job's folder, so an advisory is owed the same way.
test("an advisory wake whose turn ends on the subscription limit spends no attempt and is owed on its running job", async (t) => {
	const { root, jobs } = await hookProject(t, "limen-wake-owed-advisory-");
	const session = "wake-owed-advisory-session";
	const at = new Date().toISOString();
	const job = await jobFor(jobs, "2026-11-24-advised-0010", session, {
		state: "running",
		finishedAt: null,
		identity: await processIdentity(),
		startedAt: at,
		advisory: { text: "tool stall observation uncertain: CPU or process identity unavailable", at },
	});
	const coordinator = startCoordinator(t, root, session);
	// A record without a source holds the wrapper's note, whose receipt is the stall's (D-092 note).
	const owed = await owedAfterLimitTurn(coordinator, job, `_advisory.stall.${session}`);
	assert.deepEqual([owed, readRecordSync(job)?.state], [{ reset: true, since: true, attempts: false }, "running"]);
});

// The D-092 note (Q-43): the receipt was one per job and session, so a job whose queue diagnosis a session heard got
// no stall note after it in that session.
test("a stall advisory reaches a session that already heard the same job's queue diagnosis", async (t) => {
	const { root, jobs } = await hookProject(t, "limen-wake-sources-");
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
	const coordinator = startCoordinator(t, root, session);
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
	const { root, jobs } = await hookProject(t, "limen-wake-held-");
	const session = "wake-held-session";
	await jobFor(jobs, "2026-11-24-held-0011", session, { owedWake: OWED });
	const coordinator = startCoordinator(t, root, session);
	await sweeps(coordinator, 4);
	assert.deepEqual([coordinator.wakes, damageNotes(coordinator)], [[], []]);
});

// A-016 (2), (3): the sweep's release removes the field (test/runtime/resuming.test.ts); the hook then delivers.
test("a held wake is delivered once its job's record no longer owes it, as the sweep's release leaves the record", async (t) => {
	const { root, jobs } = await hookProject(t, "limen-wake-released-");
	const session = "wake-released-session";
	const id = "2026-11-24-released-0012";
	const job = await jobFor(jobs, id, session, { owedWake: OWED });
	const coordinator = startCoordinator(t, root, session);
	await sweeps(coordinator, 2);
	const held = coordinator.wakes.length;
	await writeRecord(job, { state: "done", label: "finished", finishedAt: "2026-11-24T14:00:00.000Z" });
	await until(() => coordinator.wakes.length === 1);
	assert.deepEqual([held, coordinator.wakes[0]?.includes(id), damageNotes(coordinator)], [0, true, []]);
});

// D-097 (5) (h), review round 2, G3: the limit mark of a run was cleared only when the run settled, so a session that
// ended between a limit's message_end and its settle left the mark to the next session's first run.
test("a limit end of an earlier session owes nothing in the next one: an errored turn there spends its attempt, and a limit turn there owes the wake", async (t) => {
	const { root, jobs } = await hookProject(t, "limen-wake-stale-limit-");
	const [earlier, later] = ["wake-stale-limit-session-1", "wake-stale-limit-session-2"];
	const job = await jobFor(jobs, "2026-11-24-stale-0013", later);
	const coordinator = startCoordinator(t, root, earlier);
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
	const { root, jobs } = await hookProject(t, "limen-wake-own-limit-");
	const id = "2026-11-24-quiet-0009";
	await writeRecord(join(jobs, id), { state: "done", label: "quiet", finishedAt: new Date().toISOString() });
	const coordinator = startCoordinator(t, root, "wake-own-limit-session");
	await sweeps(coordinator, 1);
	turn(coordinator, "the owner's message", { stopReason: "error", errorMessage: LIMIT_TEXT });
	await sweeps(coordinator, 4);
	assert.deepEqual([coordinator.wakes, readRecordSync(join(jobs, id))?.owedWake], [[], undefined]);
});
