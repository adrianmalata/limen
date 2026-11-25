// hook/group-peer.ts: its tool_call handler reads Pi's payload only inside a group, where it can block a call.
import assert from "node:assert/strict";
import test from "node:test";
import groupPeer from "../../hook/group-peer.ts";
import { LimenError } from "../../src/outcome.ts";
import { inTemporaryProject, withEnvironment } from "../environment.ts";

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

// A handler goes through the adapter's `recorded` (src/runtime/pi-api.ts), which gives Pi a refusal once it is written,
// so the refusal arrives as a rejection. Outside a job it writes into the project of the working directory, so the
// test runs in a project of its own, never in the checkout (R-102 review round 1, finding 1).
test("the tool_call handler inside a group refuses a payload of the wrong shape with BAD_DATA", async (t) => {
	withEnvironment(t, { LIMEN_GROUP_ID: "group-1", LIMEN_JOB: "" });
	await inTemporaryProject(t, "limen-group-peer-");
	await assert.rejects(
		async () => toolCallHandler()({ toolCallId: "1" }, {}),
		(error) => error instanceof LimenError && error.code === "BAD_DATA" && error.message.includes("toolName"),
	);
});
