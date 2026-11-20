// hook/group-peer.ts: its tool_call handler reads Pi's payload only inside a group, where it can block a call.
import assert from "node:assert/strict";
import test from "node:test";
import groupPeer from "../../hook/group-peer.ts";
import { LimenError } from "../../src/outcome.ts";
import { withEnvironment } from "../environment.ts";

/** The `tool_call` handler that the hook registers on a fake `pi`. */
function toolCallHandler(): (event: unknown, context: unknown) => unknown {
	const handlers = new Map<string, unknown>();
	groupPeer({ on: (name: string, handler: unknown) => handlers.set(name, handler), sendMessage() {} });
	const handler = handlers.get("tool_call");
	assert.ok(typeof handler === "function", "the hook handles tool_call");
	return (event, context) => handler(event, context);
}

// Pi 1.5.1 rethrows an error of a tool_call handler and blocks the call (`runner.js` `emitToolCall` has no catch,
// `agent-session.js` `_beforeToolCall` rethrows), so a guard there must not run where the hook blocks nothing.
test("the tool_call handler reads no payload outside a group, so a payload of the wrong shape blocks no call", (t) => {
	withEnvironment(t, { LIMEN_GROUP_ID: "" });
	assert.equal(toolCallHandler()({ toolCallId: "1" }, {}), undefined);
});

test("the tool_call handler inside a group refuses a payload of the wrong shape with BAD_DATA", (t) => {
	withEnvironment(t, { LIMEN_GROUP_ID: "group-1" });
	assert.throws(
		() => toolCallHandler()({ toolCallId: "1" }, {}),
		(error) => error instanceof LimenError && error.code === "BAD_DATA" && error.message.includes("toolName"),
	);
});
