// hook/wake.ts: the `limen` command reads its arguments from Pi only through a guard, the hook does nothing in a
// project whose job records an older Limen wrote, and a damaged record does not stop the wakes of the other jobs.
import assert from "node:assert/strict";
import { mkdir, mkdtemp, readdir, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";
import limenWake from "../../hook/wake.ts";
import { emptyRecord, serialized } from "../../src/job/record.ts";
import { LimenError } from "../../src/outcome.ts";
import { withEnvironment } from "../environment.ts";

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

// T-01: a damaged record is reported, once per session; the sweep goes on to the other jobs.
test("a damaged record before a finished job: the finished job's wake still comes, and the hook names the damage once", async (t) => {
	const root = await mkdtemp(join(tmpdir(), "limen-wake-damaged-"));
	t.after(() => rm(root, { recursive: true, force: true }));
	const home = join(root, "home");
	withEnvironment(t, { LIMEN_JOB: "", LIMEN_HOME: home, HOME: home, HERDR_TAB_ID: "", HERDR_PANE_ID: "" });
	await mkdir(join(root, ".agents", "limen"), { recursive: true });
	const jobs = join(root, ".limen", "jobs");
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
	const handlers = new Map<unknown, unknown>();
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
	const notes: string[] = [];
	start(
		{},
		{
			cwd: root,
			isIdle: () => true,
			sessionManager: { getSessionId: () => session },
			ui: { notify: (text: string) => notes.push(text), setStatus() {} },
		},
	);
	await until(() => wakes.some((wake) => wake.includes(finished)));
	// Two more ticks of the sweep read the damaged record again; it is still named once.
	await new Promise((resolve) => setTimeout(resolve, 1_200));
	const damage = notes.filter((note) => note.includes("is damaged"));
	assert.equal(damage.length, 1, notes.join("\n"));
	assert.match(damage[0] ?? "", new RegExp(`the record of job ${damaged} is damaged: .*${damaged}/record\\.json: `));
});
