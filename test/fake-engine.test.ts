// test/fake-engine.mjs: each Pi 1.5.1 behaviour it reproduces, seen in the model's view it records under the bridge,
// in what its hooks see or in what it writes on Pi's error channel, its Pi-shaped transcript, and the name of every
// variable of its environment.
import assert from "node:assert/strict";
import { execFileSync, spawn } from "node:child_process";
import { closeSync, existsSync, mkdirSync, openSync, readFileSync, writeFileSync } from "node:fs";
import { mkdir, mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { type TestContext, test } from "node:test";
import { fileURLToPath } from "node:url";
import { readSessionFile } from "../src/job/usage.ts";
import type { BridgeView } from "../src/runtime/bridge-view.ts";
import { engineEvents, plant, until, writeRecord } from "./plant.ts";

const FAKE_ENGINE = fileURLToPath(new URL("./fake-engine.mjs", import.meta.url));
/** Pi's agent directory of the fake engine in these tests, below each test's own folder. */
const AGENT_DIR = "agent";
const WAKE_HOOK = fileURLToPath(new URL("../hook/wake.ts", import.meta.url));
const SESSION = "coord";

/**
 * Runs the fake engine on the script `task` in a new folder, with one test extension: `body` is its factory's body with
 * `pi`, and its `note(value)` adds a JSON line to seen.jsonl; `files` are written in the folder first, by their paths
 * in it. Returns the folder, the engine's record dir.
 */
async function fake(t: TestContext, task: string, body: string, files: Record<string, string> = {}): Promise<string> {
	const dir = await mkdtemp(join(tmpdir(), "limen-fake-"));
	t.after(() => rm(dir, { recursive: true, force: true }));
	for (const [name, text] of Object.entries(files)) {
		await mkdir(dirname(join(dir, name)), { recursive: true });
		await writeFile(join(dir, name), text);
	}
	const seen = JSON.stringify(join(dir, "seen.jsonl"));
	const source = `import { appendFileSync } from "node:fs";\nconst note = (value) => appendFileSync(${seen}, \`\${JSON.stringify(value ?? null)}\\n\`);\nexport default function test(pi) {\n${body}\n}\n`;
	await writeFile(join(dir, "test.mjs"), source);
	await writeFile(join(dir, "task.md"), task);
	again(dir, `@${join(dir, "task.md")}`);
	return dir;
}
/**
 * Runs the fake engine once more in the folder `fake` made, on the session folder there, with `prompt`'s arguments.
 * Its home and Pi's agent directory are in that folder, so no file of the account enters a view. Its stderr, where it
 * writes what Pi writes on its extension error channel, is added to stderr.txt there.
 */
function again(dir: string, ...prompt: string[]): void {
	const args = ["--session-dir", join(dir, "session"), "--extension", join(dir, "test.mjs"), ...prompt];
	const errors = openSync(join(dir, "stderr.txt"), "a");
	try {
		execFileSync(process.execPath, [FAKE_ENGINE, ...args], {
			cwd: dir,
			env: { PATH: process.env.PATH ?? "", HOME: dir, PI_CODING_AGENT_DIR: join(dir, AGENT_DIR) },
			stdio: ["ignore", "ignore", errors],
			timeout: 30_000,
		});
	} finally {
		closeSync(errors);
	}
}
/** The JSON lines of the record `name` in `dir`; none when the engine wrote no such record. */
function lines<T>(dir: string, name: string): T[] {
	const path = join(dir, name);
	return existsSync(path) ? JSON.parse(`[${readFileSync(path, "utf8").trim().split("\n").join(",")}]`) : [];
}
/** The view of each model call, in order (fake-view.jsonl). */
const views = (dir: string) => lines<BridgeView>(dir, "fake-view.jsonl");
/** The last record of each call's view: its prompt, or the result its call brought. */
const lastRecords = (dir: string) => views(dir).map((view) => view.messages.at(-1));
/** A user record of `text`. */
const asked = (text: string) => ({ role: "user", text: [text] });
/** A test extension's lines that send `send` once, at the first agent_settled. */
const afterFirstSettle = (send: string) =>
	`let settled = 0;\npi.on("agent_settled", () => { settled += 1; if (settled === 1) { ${send}; } });`;
const WAKE =
	'pi.sendMessage({ customType: "wake", content: "wake", display: false }, { deliverAs: "followUp", triggerTurn: true })';

test("before_agent_start fires once per run, and its message enters that run's call after the run's trigger", async (t) => {
	const dir = await fake(
		t,
		"say done",
		`let n = 0;\npi.on("before_agent_start", (event) => { n += 1; note(event.messageType); return { message: { customType: "cue", content: \`cue \${n}\`, display: false } }; });\n${afterFirstSettle(WAKE)}`,
	);
	assert.deepEqual(
		{ runs: lines(dir, "seen.jsonl"), prompts: lastRecords(dir) },
		{ runs: ["user", "custom"], prompts: [asked("say done\n\ncue 1"), asked("wake\n\ncue 2")] },
	);
});

test("a steer sent while a call runs enters the next call of the same run", async (t) => {
	const dir = await fake(
		t,
		"say done",
		'let sent = false;\npi.on("message_end", (event) => { if (!sent && event.message.role === "assistant") { sent = true; pi.sendUserMessage("steer now", { deliverAs: "steer" }); } });',
	);
	assert.deepEqual(
		views(dir).map((view) => [view.path, view.messages.at(-1)]),
		[
			["fresh", asked("say done")],
			["reuse", asked("steer now")],
		],
	);
});

test("a nextTurn message waits for the next run and enters it after its trigger", async (t) => {
	const dir = await fake(
		t,
		"say done",
		`let ended = 0;\npi.on("turn_end", () => { ended += 1; if (ended === 1) pi.sendMessage({ customType: "later", content: "later", display: false }, { deliverAs: "nextTurn" }); });\n${afterFirstSettle(WAKE)}`,
	);
	assert.deepEqual(lastRecords(dir), [asked("say done"), asked("wake\n\nlater")]);
});

test("a message sent with triggerTurn false while a run is busy is held to the turn's end and starts no run", async (t) => {
	const dir = await fake(
		t,
		"say done",
		`let sent = false;\npi.on("message_start", (event) => { if (!sent && event.message.role === "assistant") { sent = true; pi.sendMessage({ customType: "held", content: "held", display: false }, { deliverAs: "followUp", triggerTurn: false }); } });\n${afterFirstSettle(WAKE)}`,
	);
	assert.deepEqual(lastRecords(dir), [asked("say done"), asked("held\n\nwake")]);
});

test("a message sent with triggerTurn false while idle is appended at once and starts no run", async (t) => {
	const dir = await fake(
		t,
		"say done",
		'pi.on("session_start", () => pi.sendMessage({ customType: "context", content: "context first", display: false }, { triggerTurn: false }));',
	);
	assert.deepEqual(lastRecords(dir), [asked("context first\n\nsay done")]);
});

test("a tool_call handler's block stops the call, and its reason is the result in the next call", async (t) => {
	const dir = await fake(
		t,
		"tool rm -rf x\nsay done",
		'pi.on("tool_call", (event) => ({ block: true, reason: "blocked " + event.input.command }));\npi.on("tool_result", () => note("tool_result"));',
	);
	assert.deepEqual(
		{ results: lines(dir, "seen.jsonl"), last: lastRecords(dir).at(-1) },
		{ results: [], last: { role: "tool", text: ["blocked rm -rf x"], tools: ["mcp__custom-tools__bash"] } },
	);
});

test("a tool_result handler's content replaces the tool's result in the next call", async (t) => {
	const dir = await fake(
		t,
		"tool ls\nsay done",
		'pi.on("tool_result", () => ({ content: [{ type: "text", text: "patched result" }] }));',
	);
	assert.deepEqual(lastRecords(dir), [
		asked("tool ls\nsay done"),
		{ role: "tool", text: ["patched result"], tools: ["mcp__custom-tools__bash"] },
	]);
});

// R-043: the communication hook's reminders ride the results of Pi's edit and write tools, whose input names `path`.
test("edit and write call Pi's edit and write tools with { path }, through tool_call and tool_result, and write the file", async (t) => {
	const dir = await fake(
		t,
		"write notes/a.md\nedit notes/a.md\nsay done",
		'for (const name of ["tool_call", "tool_result"]) pi.on(name, (event) => note([name, event.toolName, event.input]));',
	);
	const path = { path: "notes/a.md" };
	assert.deepEqual(
		{ seen: lines(dir, "seen.jsonl"), file: readFileSync(join(dir, "notes", "a.md"), "utf8") },
		{
			seen: [
				["tool_call", "write", path],
				["tool_result", "write", path],
				["tool_call", "edit", path],
				["tool_result", "edit", path],
			],
			file: "fake write\nfake edit\n",
		},
	);
});

test("a tool_result handler's content replaces an edit's result in the next call, after Pi's write result", async (t) => {
	const dir = await fake(
		t,
		"write notes/a.md\nedit notes/a.md\nsay done",
		'pi.on("tool_result", (event) => (event.toolName === "edit" ? { content: [{ type: "text", text: "patched edit" }] } : undefined));',
	);
	assert.deepEqual(lastRecords(dir).slice(1), [
		{ role: "tool", text: ["Successfully wrote to notes/a.md"], tools: ["mcp__custom-tools__write"] },
		{ role: "tool", text: ["patched edit"], tools: ["mcp__custom-tools__edit"] },
	]);
});

test("a run ends with agent_end, then agent_settled", async (t) => {
	const names = ["agent_start", "agent_end", "agent_settled", "session_shutdown"];
	const dir = await fake(t, "say done", `for (const name of ${JSON.stringify(names)}) pi.on(name, () => note(name));`);
	assert.deepEqual(lines(dir, "seen.jsonl"), names);
});

test("compact writes the compaction entry, rebuilds the context and awaits session_compact before the next call", async (t) => {
	const dir = await fake(
		t,
		"compact overflow retry\nsay done",
		`pi.on("context", () => note("context"));\npi.on("session_compact", (event) => note({ entry: event.compactionEntry.type, reason: event.reason, willRetry: event.willRetry, fromExtension: event.fromExtension }));\n${afterFirstSettle(WAKE)}`,
	);
	const summary =
		"The conversation history before this point was compacted into the following summary:\n\n<summary>\nThe fake engine's summary of 2 messages.\n</summary>";
	assert.deepEqual(
		{ seen: lines(dir, "seen.jsonl"), next: views(dir)[1]?.messages[0] },
		{
			seen: ["context", { entry: "compaction", reason: "overflow", willRetry: true, fromExtension: false }, "context"],
			next: asked(summary),
		},
	);
});

test("compact manual aborts an active run first, which settles aborted and does not go on, then compacts", async (t) => {
	const dir = await fake(
		t,
		"tool ls\ncompact manual\ntool pwd\nsay done",
		'pi.on("agent_settled", (event) => note({ aborted: event.aborted }));\npi.on("session_compact", (event) => note({ compact: event.reason }));\npi.on("tool_execution_start", (event) => note({ tool: event.args.command }));',
	);
	assert.deepEqual(lines(dir, "seen.jsonl"), [{ tool: "ls" }, { aborted: true }, { compact: "manual" }]);
});

test("compact threshold during the task's run compacts in its next call's preparation, before that call's view", async (t) => {
	const task = "tool ls\ncompact threshold\ntool pwd\nsay done";
	const dir = await fake(t, task, "");
	const summary =
		"The conversation history before this point was compacted into the following summary:\n\n<summary>\nThe fake engine's summary of 3 messages.\n</summary>";
	const bash = ["mcp__custom-tools__bash"];
	assert.deepEqual(views(dir)[1] && [views(dir)[1]?.path, views(dir)[1]?.messages], [
		"rebuild",
		[
			asked(summary),
			{ role: "assistant", text: [], tools: bash },
			{ role: "tool", text: ["(no output)"], tools: bash },
			asked(task),
			{ role: "user", text: [], notice: "history replaced" },
		],
	]);
});

test("compact threshold outside the task's run compacts when the next run ends, between agent_end and agent_settled", async (t) => {
	const names = ["agent_end", "session_compact", "agent_settled"];
	const dir = await fake(
		t,
		"compact threshold\nsay done",
		`for (const name of ${JSON.stringify(names)}) pi.on(name, () => note(name));`,
	);
	assert.deepEqual(lines(dir, "seen.jsonl"), names);
});

// R-039: a hook reads which messages the model's context still holds through Pi's `buildContextEntries`
// (`core/session-manager.js:201-229`): the latest compaction, the entries it kept, then every entry after it.
test("the context's buildContextEntries gives Pi's compaction-aware entries: a custom message from before a compact is gone after it, one sent after it is there", async (t) => {
	const kinds =
		"const kinds = (context) => context.sessionManager.buildContextEntries().map((entry) => entry.customType ?? entry.type);";
	const dir = await fake(
		t,
		"compact manual\nsay done",
		[
			kinds,
			'pi.on("session_start", (_event, context) => { pi.sendMessage({ customType: "early", content: "early", display: false }); note(kinds(context)); });',
			'pi.on("session_compact", (_event, context) => { note(kinds(context)); pi.sendMessage({ customType: "late", content: "late", display: false }); });',
			'pi.on("agent_settled", (_event, context) => note(kinds(context)));',
		].join("\n"),
	);
	assert.deepEqual(lines(dir, "seen.jsonl"), [["early"], ["compaction"], ["compaction", "late", "message", "message"]]);
});

test("the AGENTS* file of Pi's agent directory that the test sets enters the view, and none of the account's", async (t) => {
	const dir = await fake(t, "say done", "", { [`${AGENT_DIR}/AGENTS.md`]: "agent-dir-marker\n" });
	assert.deepEqual(views(dir)[0]?.system.append, ["# CLAUDE.md\n\nagent-dir-marker\n"]);
});

test("--continue opens the session file Pi continues: the most recently changed one, so after new the newer session", async (t) => {
	const dir = await fake(t, "new\nsay first", "");
	again(dir, "--continue", "say again");
	assert.deepEqual(views(dir).at(-1)?.messages, [
		asked("new\nsay first"),
		{ role: "assistant", text: ["first"] },
		asked("say again"),
	]);
});

test("a reload while a run is active is refused, as Pi refuses /reload while it streams", async (t) => {
	const dir = await fake(
		t,
		"tool ls\nreload\nsay done",
		'pi.on("session_start", (event) => note({ start: event.reason }));\npi.on("session_shutdown", (event) => note({ shutdown: event.reason }));',
	);
	assert.deepEqual(lines(dir, "seen.jsonl"), [{ start: "startup" }, { shutdown: "quit" }]);
});

test("new while a run is active aborts that run first, so it settles aborted before the new session starts", async (t) => {
	const dir = await fake(
		t,
		"tool ls\nnew\nsay done",
		'pi.on("session_start", (event) => note({ start: event.reason }));\npi.on("agent_settled", (event) => note({ aborted: event.aborted }));',
	);
	assert.deepEqual(lines(dir, "seen.jsonl"), [{ start: "startup" }, { aborted: true }, { start: "new" }]);
});

test("session_start carries Pi's reason: startup at the start, then reload, then new with the previous session file", async (t) => {
	const dir = await fake(
		t,
		"reload\nnew\nsay done",
		'pi.on("session_start", (event) => note({ reason: event.reason, previous: event.previousSessionFile }));',
	);
	assert.deepEqual(lines(dir, "seen.jsonl"), [
		{ reason: "startup" },
		{ reason: "reload" },
		{ reason: "new", previous: join(dir, "session", "fake.jsonl") },
	]);
});

test("the context event holds every message of the call, those of the earlier turns included", async (t) => {
	const dir = await fake(
		t,
		"say done",
		'let sent = false;\npi.on("context", (event) => note(event.messages.map((message) => message.role)));\npi.on("message_end", (event) => { if (!sent && event.message.role === "assistant") { sent = true; pi.sendUserMessage("steer now", { deliverAs: "steer" }); } });',
	);
	assert.deepEqual(lines(dir, "seen.jsonl"), [["user"], ["user", "assistant", "user"]]);
});

// R-096 open point 1: Pi's prompt defers itself while agent_settled is emitted and runs before the settle returns.
test("a message a hook sends during agent_settled gets its run after the first settle, settled once more, before session_shutdown", async (t) => {
	const dir = await fake(
		t,
		"say done",
		`${afterFirstSettle('pi.sendUserMessage("after settle")')}\npi.on("agent_settled", () => note("agent_settled"));\npi.on("session_shutdown", () => note("session_shutdown"));`,
	);
	assert.deepEqual(
		{ seen: lines(dir, "seen.jsonl"), prompts: lastRecords(dir) },
		{
			seen: ["agent_settled", "agent_settled", "session_shutdown"],
			prompts: [asked("say done"), asked("after settle")],
		},
	);
});

/**
 * A test extension's lines: a command `race` that sends two user messages in one stretch and returns once a run that
 * reached its agent_end has settled; it notes each run's start, each user message that enters, each agent_end and each
 * settle, with whether the session read idle there.
 */
const RACE = `let race;
let ended = false;
pi.on("before_agent_start", (event) => note({ start: event.prompt }));
pi.on("message_start", (event) => { if (event.message.role === "user") note({ enter: event.message.content[0].text }); });
pi.on("agent_end", (_event, context) => { ended = true; note({ end: true, idle: context.isIdle() }); });
pi.on("agent_settled", (event, context) => { note({ settled: event.aborted, idle: context.isIdle() }); if (ended) race?.(); });
pi.registerCommand("race", { handler: () => { pi.sendUserMessage("first"); pi.sendUserMessage("second", { deliverAs: "followUp" }); return new Promise((resolve) => (race = resolve)); } });`;

// The fake reserved the session at the send, so there two sends of one stretch joined one run, which they never do in
// Pi (A-090).
test("E-21: two sends made in one stretch while the session is idle start two runs; the second fails with Pi's text and settles inside the first", async (t) => {
	const dir = await fake(t, "/race\nsay done", RACE);
	type Seen = { start?: string; enter?: string; end?: true; settled?: boolean; idle?: boolean };
	const seen = lines<Seen>(dir, "seen.jsonl");
	const [first, end] = [seen.findIndex((one) => one.start === "first"), seen.findIndex((one) => one.end)];
	const busy =
		"Agent is already processing a prompt. Use steer() or followUp() to queue messages, or wait for completion.";
	assert.deepEqual(
		{
			starts: seen.flatMap((one) => (one.start === undefined ? [] : [one.start])),
			entered: seen.flatMap((one) => (one.enter === undefined ? [] : [one.enter])),
			settledInsideFirst: seen.slice(first, end).filter((one) => one.settled !== undefined),
			idleAtFirstEnd: seen[end]?.idle,
			errors: readFileSync(join(dir, "stderr.txt"), "utf8")
				.split("\n")
				.filter((line) => line.includes("already processing")),
		},
		{
			starts: ["/race\nsay done", "first", "second"],
			entered: ["first", "/race\nsay done"],
			settledInsideFirst: [{ settled: false, idle: true }],
			idleAtFirstEnd: true,
			errors: [`Extension error (<runtime>): ${busy}`],
		},
	);
});

// R-024 open point 3: a line that is no Pi entry is one that limen stats names under Not read.
test("the fake's transcript is Pi-shaped: src/job/usage.ts reads every line of it", async (t) => {
	const dir = await fake(
		t,
		"tool ls\ncompact threshold\nsay done",
		'pi.on("before_agent_start", () => ({ message: { customType: "cue", content: "cue", display: false } }));',
	);
	const read = readSessionFile(join(dir, "session", "fake.jsonl"));
	assert.deepEqual(
		{ unread: read.unread, kinds: read.entries.map((entry) => entry.kind) },
		{ unread: [], kinds: ["user", "custom_message", "assistant", "assistant"] },
	);
});

// R-087 (e): a test of a job's environment shows a dropped name of any kind, not only a Limen, Herdr or Pi one.
test("the fake engine records the name of every variable of its environment in fake-env.json, and no value", async (t) => {
	const dir = await mkdtemp(join(tmpdir(), "limen-fake-env-"));
	t.after(() => rm(dir, { recursive: true, force: true }));
	await writeFile(join(dir, "task.md"), "say recorded\n");
	const env = { PATH: process.env.PATH ?? "", DEMO_API_TOKEN: "dummy-not-a-secret", LIMEN_JOB: "1" };
	execFileSync(process.execPath, [FAKE_ENGINE, "--session-dir", join(dir, "session"), `@${join(dir, "task.md")}`], {
		cwd: dir,
		env,
		stdio: "ignore",
	});
	const recorded = readFileSync(join(dir, "fake-env.json"), "utf8");
	assert.deepEqual(
		[JSON.parse(recorded), recorded.includes("dummy-not-a-secret")],
		[["DEMO_API_TOKEN", "LIMEN_JOB", "PATH"], false],
	);
});

/**
 * The source of an extension that holds the session's first turn at its start until one write to the FIFO
 * `hold-gate` in `dir`, and writes `held` there while it holds; later turns are not held.
 */
function holdExtension(dir: string): string {
	const gate = JSON.stringify(join(dir, "hold-gate"));
	const held = JSON.stringify(join(dir, "held"));
	return `import { createReadStream, writeFileSync } from "node:fs";
let first = true;
export default function hold(pi) {
	pi.on("turn_start", async () => {
		if (!first) {
			return;
		}
		first = false;
		const released = new Promise((resolve) => createReadStream(${gate}).once("data", resolve));
		writeFileSync(${held}, "");
		await released;
	});
}
`;
}

/** A done job of the session, written by hand: routable and subscribed first, so its done record wakes the session. */
async function finished(jobs: string, id: string): Promise<void> {
	const job = join(jobs, id);
	await mkdir(join(job, "notify", "subscribers"), { recursive: true });
	await writeFile(join(job, "notify", "ready"), "1\n");
	await writeFile(join(job, "notify", "subscribers", SESSION), `${new Date().toISOString()}\n`);
	await writeRecord(job, { state: "done", label: id, finishedAt: new Date().toISOString() });
}

// A run that settled before the follow-up queued during its turn entered made the wake hook count that wake as
// unconfirmed and send it again: the extra wake of test/s3-finish-wake.test.ts (R-096).
test("a wake sent while a coordinator's turn runs enters the same run before the run settles, so the session hears it once", async (t) => {
	const p = await plant();
	t.after(() => p.cleanup());
	const dir = join(p.parent, SESSION);
	mkdirSync(dir);
	execFileSync("mkfifo", [join(dir, "hold-gate")]);
	writeFileSync(join(dir, "hold.mjs"), holdExtension(dir));
	writeFileSync(join(dir, "task.md"), "block\n");
	const jobs = join(p.root, ".limen", "jobs");
	const [early, late] = ["2026-11-21-early-0001", "2026-11-21-late-0002"];
	await finished(jobs, early);
	const args = ["--session-dir", join(dir, "session"), "--extension", WAKE_HOOK, "--extension", join(dir, "hold.mjs")];
	const options = { cwd: p.root, env: { ...p.env, PI_SESSION_ID: SESSION }, stdio: "ignore" } as const;
	spawn(join(p.bin, "pi"), [...args, `@${join(dir, "task.md")}`], options);
	const wakes = (id: string) =>
		engineEvents(dir).filter((event) => event.text?.startsWith("Limen job") && event.text.includes(id));
	// The early job's wake opens a turn, which holds; the late job ends meanwhile, and the hook sends its wake then.
	await until(dir, () => existsSync(join(dir, "held")));
	await finished(jobs, late);
	await until(dir, () => wakes(late).length > 0);
	await writeFile(join(dir, "hold-gate"), "go\n");
	// A delivered slot, or a claim blocked after two attempts, means every wake of the late job is recorded.
	const notify = (path: string) => join(jobs, late, "notify", path);
	await until(
		jobs,
		() => existsSync(notify(`delivered/${SESSION}`)) || existsSync(notify(`claims/${SESSION}/blocked`)),
	);
	assert.deepEqual(
		{
			wakes: [early, late].map((id) => wakes(id).map((wake) => wake.event)),
			unconfirmed: existsSync(notify("unconfirmed")),
		},
		{ wakes: [["user"], ["followUp"]], unconfirmed: false },
	);
});
