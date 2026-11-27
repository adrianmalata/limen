// src/runtime/hook-set.ts: the hooks of each kind of session, by its role and the group module (A-082, G1.10), and the
// one root whose switches a coordinator's hooks and its context message read.
import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { mkdir, mkdtemp, realpath, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test, { type TestContext } from "node:test";
import limenCommunication from "../../hook/communication.ts";
import groupPeer from "../../hook/group-peer.ts";
import { hookSet } from "../../src/runtime/hook-set.ts";
import { withEnvironment } from "../environment.ts";
import { switchModules } from "../plant.ts";

// A-082: a coordinator gets the group hook, with its lead file and its timer, only with the group module on, and
// steering, which only acts in a job, never.
test("a coordinator's session gets wake and communication, and group-peer only with the group module on", () => {
	assert.deepEqual(
		[hookSet({ session: "coordinator", group: false }), hookSet({ session: "coordinator", group: true })],
		[
			["wake", "communication"],
			["wake", "communication", "group-peer"],
		],
	);
});

// A group member keeps its hooks whatever the switch says once its group runs (R-044 → Out of scope).
test("a job gets finish, steering, communication and rate-limit, and group-peer only as a group's member", () => {
	assert.deepEqual(
		[hookSet({ session: "job", member: false }), hookSet({ session: "job", member: true })],
		[
			["finish", "steering", "communication", "rate-limit"],
			["finish", "steering", "communication", "rate-limit", "group-peer"],
		],
	);
});

/**
 * A coordinator's session whose working directory is a folder below the top of a Git repository, with the group module
 * on in that folder's limits file and in none of the repository's top; the folder, removed after `t`.
 */
async function sessionBelowTop(t: TestContext): Promise<string> {
	const top = await realpath(await mkdtemp(join(tmpdir(), "limen-hook-root-")));
	const earlier = process.cwd();
	t.after(async () => {
		process.chdir(earlier);
		await rm(top, { recursive: true, force: true });
	});
	execFileSync("git", ["init", "-q", top]);
	const folder = join(top, "session");
	await mkdir(folder);
	await switchModules(folder, ["group"]);
	withEnvironment(t, { LIMEN_JOB: "", LIMEN_GROUP_ID: "", LIMEN_CONTEXT_ROOT: "" });
	process.chdir(folder);
	return folder;
}

// R-044 Decision 19 F3: the hooks read the switches where the context message does, so the two never disagree.
test("a coordinator whose working directory holds the group module on loads group-peer and gets the Group module text, both from that folder", async (t) => {
	const folder = await sessionBelowTop(t);
	const handlers: string[] = [];
	groupPeer({ on: (name: string) => handlers.push(name), sendMessage() {} });
	const sent: string[] = [];
	const communication = new Map<string, unknown>();
	limenCommunication({
		on: (name: string, handler: unknown) => communication.set(name, handler),
		sendMessage: (message) => sent.push(message.content),
	});
	const start = communication.get("session_start");
	assert.ok(typeof start === "function");
	start(
		{ type: "session_start", reason: "startup" },
		{ cwd: folder, sessionManager: { getSessionId: () => "session-1", buildContextEntries: () => [] } },
	);
	assert.deepEqual(
		[
			handlers.includes("session_start"),
			sent.length,
			sent[0]?.includes("\n## Group module (limen/templates/modules/group/"),
		],
		[true, 1, true],
	);
});
