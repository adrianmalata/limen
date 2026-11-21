// hook/wake.ts: the guard on the `limen` command's arguments, nothing done before `limen migrate`, and damaged records
// and progress files, which stop no wake and no status line, are named once, and are forgotten at a session start.
import assert from "node:assert/strict";
import { mkdir, mkdtemp, readdir, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test, { type TestContext } from "node:test";
import limenWake from "../../hook/wake.ts";
import { emptyRecord, serialized } from "../../src/job/record.ts";
import { LimenError } from "../../src/outcome.ts";
import { processIdentity } from "../../src/runtime/reap.ts";
import { withEnvironment } from "../environment.ts";
import { writeRecord } from "../plant.ts";

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

test("the limen command refuses arguments that are not a string with BAD_DATA naming them", async (t) => {
	withEnvironment(t, { LIMEN_JOB: "" });
	const context = { ui: { notify() {}, setStatus() {} } };
	await assert.rejects(
		commandHandler()(["on"], context),
		(error) =>
			error instanceof LimenError && error.code === "BAD_DATA" && /: args: expected a string/.test(error.message),
	);
});

// D-057 (6): until `limen migrate` ran, the hook neither registers the coordinator nor reads a job; it says why once.
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
	start(
		{},
		{
			cwd: root,
			isIdle: () => true,
			sessionManager: { getSessionId: () => session },
			ui: {
				notify: (text: string) => notes.push(text),
				setStatus: (_key: string, value: string | undefined) => statuses.push(value),
			},
		},
	);
	return { notes, statuses, wakes, shutdown: () => shutdown({}, {}) };
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
