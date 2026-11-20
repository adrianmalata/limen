// src/runtime/pi-api.ts: each guard returns a Pi value of the right shape as it is and refuses a wrong one with BAD_DATA.
import assert from "node:assert/strict";
import test from "node:test";
import { LimenError } from "../../src/outcome.ts";
import {
	type PiSettleEvent,
	piCommandArgs,
	piContext,
	piEvent,
	piSettleEvent,
	piToolInput,
} from "../../src/runtime/pi-api.ts";

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
