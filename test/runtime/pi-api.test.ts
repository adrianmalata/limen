// src/runtime/pi-api.ts: each guard returns a Pi value of the right shape as it is and refuses a wrong one with BAD_DATA,
// and every hook's handler records a guard's refusal, in a job's record or in a coordinator process's refusal file.
import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { existsSync } from "node:fs";
import { mkdir, mkdtemp, readdir, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join, relative } from "node:path";
import test, { type TestContext } from "node:test";
import { fileURLToPath } from "node:url";
import { readRecordSync } from "../../src/job/record.ts";
import { LimenError } from "../../src/outcome.ts";
import {
	isRecorded,
	type PiSettleEvent,
	piCommandArgs,
	piContext,
	piEvent,
	piRateLimit,
	piSettleEvent,
	piToolInput,
	recorded,
} from "../../src/runtime/pi-api.ts";
import { withEnvironment } from "../environment.ts";
import { knownFilesBelow } from "../known-files.ts";
import { plant, writeRecord } from "../plant.ts";

/** What a refusal names: the place in Pi, the field, and the message that holds both. */
type Refused = { readonly file: string; readonly field: string; readonly message: string };

/** The BAD_DATA error that `guard` throws, class environment; the test fails when the guard accepts the value. */
function refusal(guard: () => unknown): Refused {
	try {
		guard();
	} catch (error) {
		assert.ok(error instanceof LimenError, `not a LimenError: ${String(error)}`);
		assert.deepEqual([error.class, error.code], ["environment", "BAD_DATA"]);
		assert.ok("file" in error && typeof error.file === "string", "the error names the place");
		assert.ok("field" in error && typeof error.field === "string", "the error names the field");
		return { file: error.file, field: error.field, message: error.message };
	}
	assert.fail("the guard accepted the value");
}

/** The place in Pi and the field a refusal names. */
function where(error: Refused): readonly string[] {
	return [error.file, error.field];
}

/** `value` as Pi's runtime hands it over, whatever its declared type says: a copy through JSON, which is `any`. */
function asHandedOver(value: object): PiSettleEvent<unknown> {
	return JSON.parse(JSON.stringify(value));
}

const message = { role: "assistant", content: [{ type: "text", text: "done" }], stopReason: "stop" };

test("piEvent returns a before_agent_start of a prompt or of a custom message, and refuses one without systemPrompt", () => {
	const prompted = { type: "before_agent_start", prompt: "Hello.", systemPrompt: "Base." };
	const custom = { type: "before_agent_start", systemPrompt: "Base.", message: { customType: "limen-wake" } };
	assert.equal(piEvent("before_agent_start", prompted), prompted);
	assert.equal(piEvent("before_agent_start", custom), custom);
	const error = refusal(() => piEvent("before_agent_start", { prompt: "Hello." }));
	assert.deepEqual(where(error), ["Pi event before_agent_start", "systemPrompt"]);
	assert.equal(error.message, "Pi event before_agent_start: systemPrompt: expected a string, got nothing");
});

test("piEvent returns a message_start with a string or a list of parts, and refuses a message without a role", () => {
	const user = { message: { role: "user", content: "Hello." } };
	assert.equal(piEvent("message_start", user), user);
	assert.equal(piEvent("message_start", { message }).message, message);
	assert.deepEqual(where(refusal(() => piEvent("message_start", { message: { content: "x" } }))), [
		"Pi event message_start",
		"message.role",
	]);
});

test("piEvent returns a message_end and refuses a part whose text is not a string, naming the part", () => {
	assert.equal(piEvent("message_end", { message }).message, message);
	const broken = {
		message: {
			role: "assistant",
			content: [
				{ type: "text", text: "a" },
				{ type: "text", text: 7 },
			],
		},
	};
	assert.deepEqual(where(refusal(() => piEvent("message_end", broken))), [
		"Pi event message_end",
		"message.content.1.text",
	]);
});

test("piEvent refuses a message whose content is neither a string nor a list", () => {
	const bare = { message: { role: "custom", content: { text: "x" } } };
	assert.equal(refusal(() => piEvent("message_end", bare)).field, "message.content");
});

test("piEvent refuses a message part of type text that carries no text", () => {
	const bare = { message: { role: "assistant", content: [{ type: "thinking" }, { type: "text" }] } };
	assert.equal(refusal(() => piEvent("message_end", bare)).field, "message.content.1.text");
});

test("piEvent returns a context event and refuses one whose messages are not a list", () => {
	const event = { type: "context", messages: [message, { role: "toolResult", content: [] }] };
	assert.equal(piEvent("context", event), event);
	assert.deepEqual(where(refusal(() => piEvent("context", { messages: message }))), ["Pi event context", "messages"]);
});

test("piEvent refuses a context event with a message that has no role, naming the message by its index", () => {
	assert.equal(refusal(() => piEvent("context", { messages: [message, {}] })).field, "messages.1.role");
});

test("piEvent returns a tool_call and refuses one whose toolName is not a string", () => {
	const event = { type: "tool_call", toolCallId: "1", toolName: "bash", input: { command: "ls" } };
	assert.equal(piEvent("tool_call", event), event);
	assert.deepEqual(where(refusal(() => piEvent("tool_call", { toolName: 3 }))), ["Pi event tool_call", "toolName"]);
});

/** A tool result with a text and an image part, as Pi gives it to the handlers. */
const toolResult = {
	toolName: "read",
	input: { path: "a.md" },
	content: [
		{ type: "text", text: "a" },
		{ type: "image", data: "aGk=", mimeType: "image/png" },
	],
	isError: false,
};

test("piEvent returns a tool_result of text and image parts and refuses an image without its mime type", () => {
	assert.equal(piEvent("tool_result", toolResult), toolResult);
	const broken = { ...toolResult, content: [{ type: "image", data: "aGk=" }] };
	assert.deepEqual(where(refusal(() => piEvent("tool_result", broken))), [
		"Pi event tool_result",
		"content.0.mimeType",
	]);
});

test("piEvent refuses a tool_result whose isError is not a boolean", () => {
	assert.equal(refusal(() => piEvent("tool_result", { ...toolResult, isError: "no" })).field, "isError");
});

test("piEvent refuses a tool_result part whose type is neither text nor image", () => {
	const audio = { ...toolResult, content: [{ type: "audio" }] };
	assert.equal(refusal(() => piEvent("tool_result", audio)).field, "content.0.type");
});

test("piEvent refuses a tool_result whose input is not an object", () => {
	assert.equal(refusal(() => piEvent("tool_result", { ...toolResult, input: "a.md" })).field, "input");
});

test("piEvent refuses an event that is not an object", () => {
	const error = refusal(() => piEvent("tool_call", "bash"));
	assert.deepEqual(where(error), ["Pi event tool_call", ""]);
	assert.equal(error.message, 'Pi event tool_call: expected an object, got "bash"');
});

test("piSettleEvent returns an agent_before_settle with Pi's own entries and refuses an unknown outcome", () => {
	const entry = { type: "custom", customType: "other", data: 1 };
	const event = { outcome: "completed" as const, entries: [entry] };
	assert.equal(piSettleEvent(event).entries[0], entry);
	const error = refusal(() => piSettleEvent(asHandedOver({ outcome: "finished", entries: [] })));
	assert.deepEqual(where(error), ["Pi event agent_before_settle", "outcome"]);
	assert.match(error.message, /expected one of "completed", "aborted" or "error", got "finished"$/);
});

test("piSettleEvent refuses an agent_before_settle whose entries are not a list", () => {
	assert.equal(refusal(() => piSettleEvent(asHandedOver({ outcome: "error", entries: {} }))).field, "entries");
});

test("piContext returns the context itself, so a method keeps its owner, and checks only the fields it is given", () => {
	class Session {
		readonly id = "s-1";
		getSessionId(): string {
			return this.id;
		}
	}
	const context = { cwd: "/project", sessionManager: new Session() };
	const checked = piContext("session_start", context, ["cwd", "sessionManager"]);
	assert.equal(checked, context);
	assert.equal(checked.sessionManager.getSessionId(), "s-1");
	assert.equal(piContext("tool_result", { cwd: "/project" }, ["cwd"]).cwd, "/project");
});

test("piContext refuses a context whose cwd is not a string", () => {
	const error = refusal(() => piContext("before_agent_start", { cwd: 1 }, ["cwd"]));
	assert.deepEqual(where(error), ["Pi event before_agent_start", "context.cwd"]);
});

test("piContext refuses a context whose isIdle is not a function", () => {
	assert.equal(refusal(() => piContext("session_start", { isIdle: true }, ["isIdle"])).field, "context.isIdle");
});

test("piContext refuses a session manager without getSessionId", () => {
	const error = refusal(() => piContext("session_start", { sessionManager: {} }, ["sessionManager"]));
	assert.equal(error.field, "context.sessionManager.getSessionId");
});

test("piContext refuses a ui without setStatus, also in the context of a command", () => {
	const error = refusal(() => piContext("command limen", { ui: { notify() {} } }, ["ui"]));
	assert.deepEqual(where(error), ["Pi command limen", "context.ui.setStatus"]);
});

test("piContext refuses a tool context without shutdown", () => {
	const error = refusal(() => piContext("tool finish", {}, ["shutdown"]));
	assert.deepEqual(where(error), ["Pi tool finish", "context.shutdown"]);
	assert.equal(error.message, "Pi tool finish: context.shutdown: expected a function, got nothing");
});

test("piContext refuses a context that is not an object", () => {
	assert.equal(refusal(() => piContext("session_start", undefined, ["cwd"])).field, "context");
});

test("piToolInput returns a tool's parameters and refuses parameters that are not an object", () => {
	const input = { handoff: "Done." };
	assert.equal(piToolInput("finish", input), input);
	assert.deepEqual(where(refusal(() => piToolInput("finish", ["Done."]))), ["Pi tool finish", "params"]);
});

test("piCommandArgs returns a command's arguments and refuses arguments that are not a string", () => {
	assert.equal(piCommandArgs("limen", "off"), "off");
	const error = refusal(() => piCommandArgs("limen", ["off"]));
	assert.deepEqual(where(error), ["Pi command limen", "args"]);
	assert.equal(error.message, 'Pi command limen: args: expected a string, got ["off"]');
});

// E-9: the bridge emits the rate-limit event on Pi's event bus, with the limit's type and its reset in epoch ms.
test("piRateLimit returns the bridge's rate-limit event and refuses one whose resetAtMs is not a number", () => {
	const event = {
		rateLimitType: "five_hour",
		resetAt: 1_795_000_000,
		resetAtMs: 1_795_000_000_000,
		status: "rejected",
	};
	assert.equal(piRateLimit(event), event);
	assert.deepEqual(piRateLimit({ status: "rejected" }), { status: "rejected" });
	const error = refusal(() => piRateLimit({ rateLimitType: "five_hour", resetAtMs: "soon" }));
	assert.deepEqual(where(error), ["Pi event kendex:rate-limit", "resetAtMs"]);
});

/** A running job of a project in the OS temporary folder, removed after the test, with the job's transport names set. */
async function runningJob(t: TestContext): Promise<string> {
	const root = await mkdtemp(join(tmpdir(), "limen-refusal-"));
	t.after(() => rm(root, { recursive: true, force: true }));
	const id = "2026-11-24-refusal-1a2b3c4d";
	const job = join(root, ".limen", "jobs", id);
	await writeRecord(job, { state: "running", identity: { pid: 4242, born: "123", bootId: null } });
	withEnvironment(t, { LIMEN_JOB: "1", LIMEN_CONTEXT_ROOT: root, LIMEN_JOB_ID: id });
	return job;
}

// T-32 (4): Pi reports a handler's error and goes on, or turns it into an error tool result that only the model sees,
// so the adapter writes a guard's refusal into the job's record before the handler's error reaches Pi.
test("a recorded handler whose guard refuses Pi's payload in a job writes the refusal into the job's record before it rejects", async (t) => {
	const job = await runningJob(t);
	const handler = recorded((raw: unknown) => piEvent("message_end", raw).message.role);
	const rejected = handler({ message: { content: "x" } });
	assert.ok(rejected instanceof Promise, "a refusal gives Pi a promise that rejects once the refusal is written");
	await assert.rejects(rejected, (error) => error instanceof LimenError && error.code === "BAD_DATA");
	const refusal = readRecordSync(job)?.refusal;
	assert.deepEqual(
		[refusal?.event, refusal?.field, refusal?.message],
		["message_end", "message.role", "Pi event message_end: message.role: expected a string, got nothing"],
	);
});

test("a recorded handler returns what its handler returns, and records no error that is not a guard's refusal", async (t) => {
	const job = await runningJob(t);
	const role = recorded((raw: unknown) => piEvent("message_end", raw).message.role);
	const failing = recorded(async () => {
		throw new Error("the hook's own failure");
	});
	assert.equal(role({ message }), "assistant");
	await assert.rejects(failing(), /the hook's own failure/);
	assert.equal(readRecordSync(job)?.refusal, undefined);
});

/**
 * The handlers, tools, commands and event-bus listeners that each hook of `files` registers on a fake `pi`, keyed by
 * the hook's file and their place.
 */
async function registeredHandlers(files: readonly string[]): Promise<Map<string, unknown>> {
	const found = new Map<string, unknown>();
	for (const file of files) {
		const name = relative(REPO, file);
		const pi = {
			on: (event: string, handler: unknown) => found.set(`${name} on ${event} ${found.size}`, handler),
			registerTool: (tool: { name: string; execute: unknown }) => found.set(`${name} tool ${tool.name}`, tool.execute),
			registerCommand: (command: string, entry: { handler: unknown }) =>
				found.set(`${name} command ${command}`, entry.handler),
			sendMessage() {},
			sendUserMessage() {},
			events: {
				on: (channel: string, listener: unknown) => {
					found.set(`${name} bus ${channel}`, listener);
					return () => {};
				},
			},
		};
		const hook: unknown = (await import(file)).default;
		assert.ok(typeof hook === "function", `${name} exports its factory`);
		hook(pi);
	}
	return found;
}

const REPO = fileURLToPath(new URL("../..", import.meta.url));
const HOOK_FOLDER = join(REPO, "hook");

/** Every hook file of the repository: each TypeScript file git knows in `hook/`, so a new one is checked too. */
async function hookFiles(): Promise<string[]> {
	return (await knownFilesBelow(REPO, ["hook"])).filter((file) => file.endsWith(".ts"));
}

// T-32 (4), z. 14: a handler registered around the adapter would let a refusal pass with no record, so every handler,
// tool and command of every hook goes through `recorded`, in a job and in a coordinator's session.
test("T-32: every handler, tool, command and event-bus listener a hook registers goes through recorded, in a job and in a coordinator", async (t) => {
	const files = await hookFiles();
	await runningJob(t);
	withEnvironment(t, { LIMEN_GROUP_ID: "group-1" });
	const inJob = await registeredHandlers(files);
	withEnvironment(t, { LIMEN_JOB: "", LIMEN_GROUP_ID: "" });
	const inCoordinator = await registeredHandlers(files);
	const unrecorded = [...inJob, ...inCoordinator].filter(([, handler]) => !isRecorded(handler)).map(([key]) => key);
	assert.ok(
		inJob.has("hook/rate-limit.ts bus kendex:rate-limit") &&
			inJob.has("hook/finish.ts tool finish") &&
			inCoordinator.has("hook/wake.ts command limen"),
		[...inJob.keys(), ...inCoordinator.keys()].join("\n"),
	);
	assert.deepEqual(unrecorded, []);
});

const SESSION = "coord-refusal";

// T-32 (4), D-055 (2): in a coordinator's session Pi shows a hook's error in the chat and writes nothing, so the hook
// writes the newest refusal into the file of its own process, which `limen status` reads. R-102: the session needs no
// registration, which went with the seat rules, so a session with neither LIMEN_COORDINATOR nor a Herdr pane gets it too.
test("a hook's refusal of a malformed Pi event in a coordinator's session lands in .limen/refusals/, with no registration folder", async (t) => {
	const p = await plant();
	t.after(() => p.cleanup());
	const dir = join(p.parent, SESSION);
	await mkdir(dir);
	await writeFile(join(dir, "task.md"), "malformed message_end\n");
	const args = ["--session-dir", join(dir, "session"), "--extension", join(HOOK_FOLDER, "wake.ts")];
	const env = { ...p.env, PI_SESSION_ID: SESSION };
	const run = spawnSync(join(p.bin, "pi"), [...args, `@${join(dir, "task.md")}`], {
		cwd: p.root,
		env,
		encoding: "utf8",
	});
	assert.equal(run.status, 0, run.stderr);
	const folder = join(p.root, ".limen", "refusals");
	const names = existsSync(folder) ? await readdir(folder) : [];
	// The fake engine runs the hook in its own process, whose pid names the file with the process's start time.
	const ownFile = new RegExp(`^${run.pid}-\\d+\\.json$`);
	const written = names.length === 1 ? JSON.parse(await readFile(join(folder, names[0] ?? ""), "utf8")) : {};
	assert.deepEqual(
		[
			names.map((name) => ownFile.test(name)),
			[written.event, written.field, written.message],
			existsSync(join(p.root, ".limen", "coordinators")),
			run.stderr.includes("Pi event message_end: message:"),
		],
		[[true], ["message_end", "message", "Pi event message_end: message: expected an object, got nothing"], false, true],
	);
});
