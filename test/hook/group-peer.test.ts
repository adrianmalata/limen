// hook/group-peer.ts: it loads in a coordinator only with the group module on, and its tool_call handler reads Pi's
// payload only inside a group, where it can block a call.
import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { existsSync } from "node:fs";
import { join } from "node:path";
import test, { type TestContext } from "node:test";
import groupPeer from "../../hook/group-peer.ts";
import { LimenError } from "../../src/outcome.ts";
import { inTemporaryProject, withEnvironment } from "../environment.ts";
import { switchModules } from "../plant.ts";

/** The handlers that the hook registers on a fake `pi`, by the event's name. */
function registered(): Map<string, unknown> {
	const handlers = new Map<string, unknown>();
	groupPeer({ on: (name: string, handler: unknown) => handlers.set(name, handler), sendMessage() {} });
	return handlers;
}

/** The `tool_call` handler that the hook registers on a fake `pi`. */
function toolCallHandler(): (event: unknown, context: unknown) => unknown {
	const handler = registered().get("tool_call");
	assert.ok(typeof handler === "function", "the hook handles tool_call");
	return (event, context) => handler(event, context);
}

/**
 * A coordinator's session in a new Git repository of its own, made the working directory, with the group module
 * switched on when `group`; its root.
 */
async function coordinatorProject(t: TestContext, group: boolean): Promise<string> {
	withEnvironment(t, { LIMEN_JOB: "", LIMEN_GROUP_ID: "", LIMEN_CONTEXT_ROOT: "" });
	const root = await inTemporaryProject(t, "limen-group-peer-");
	execFileSync("git", ["init", "-q", root]);
	await switchModules(root, group ? ["group"] : []);
	return root;
}

/** A Pi context of a coordinator's session in `root`, as the session_start handler reads it. */
function sessionContext(root: string) {
	return {
		cwd: root,
		sessionManager: { getSessionId: () => "lead-session", buildContextEntries: () => [] },
		ui: { notify() {}, setStatus() {} },
	};
}

/**
 * Runs a session's start and then its end through the handlers the hook registered in `root`, if it registered them,
 * and gives whether the lead file was there between the two and how many timers of `delay` the hook started.
 */
async function startAndEnd(t: TestContext, root: string, delay: number) {
	const intervals = t.mock.method(globalThis, "setInterval");
	const handlers = registered();
	const [start, end] = [handlers.get("session_start"), handlers.get("session_shutdown")];
	if (typeof start === "function") {
		await start({ type: "session_start" }, sessionContext(root));
	}
	const lead = existsSync(join(root, ".limen/group-leads/lead-session"));
	if (typeof end === "function") {
		await end({ type: "session_shutdown" }, sessionContext(root));
	}
	const timers = intervals.mock.calls.filter((call) => call.arguments[1] === delay).length;
	return { handlers: [...handlers.keys()], lead, timers };
}

// A-082, seat step 4.7: with every module off the coordinator loads no group hook: no handler, no lead file, no timer.
test("in a coordinator's session with the group module off the hook registers no handler, so it writes no lead file and starts no timer", async (t) => {
	const root = await coordinatorProject(t, false);
	assert.deepEqual(await startAndEnd(t, root, 1_000), { handlers: [], lead: false, timers: 0 });
});

test("in a coordinator's session with the group module on the hook registers the session as a lead and starts its timer", async (t) => {
	const root = await coordinatorProject(t, true);
	const run = await startAndEnd(t, root, 1_000);
	assert.deepEqual(
		[
			run.handlers.includes("session_start"),
			run.lead,
			run.timers,
			existsSync(join(root, ".limen/group-leads/lead-session")),
		],
		[true, true, 1, false],
	);
});

// Pi 1.5.1 rethrows an error of a tool_call handler and blocks the call (`runner.js` `emitToolCall` has no catch,
// `agent-session.js` `_beforeToolCall` rethrows), so a guard there must not run where the hook blocks nothing.
test("the tool_call handler reads no payload outside a group, so a payload of the wrong shape blocks no call", async (t) => {
	await coordinatorProject(t, true);
	assert.equal(toolCallHandler()({ toolCallId: "1" }, {}), undefined);
});

// A handler goes through the adapter's `recorded` (src/runtime/pi-api.ts), which gives Pi a refusal once it is written,
// so the refusal arrives as a rejection. Only a group's member job is inside a group; this one names no job folder, so
// the refusal is written nowhere, and the test runs in a project of its own, never in the checkout (R-102 review round
// 1, finding 1).
test("the tool_call handler inside a group refuses a payload of the wrong shape with BAD_DATA", async (t) => {
	await inTemporaryProject(t, "limen-group-peer-");
	withEnvironment(t, { LIMEN_JOB: "1", LIMEN_GROUP_ID: "group-1", LIMEN_CONTEXT_ROOT: "", LIMEN_JOB_ID: "" });
	await assert.rejects(
		async () => toolCallHandler()({ toolCallId: "1" }, {}),
		(error) => error instanceof LimenError && error.code === "BAD_DATA" && error.message.includes("toolName"),
	);
});
