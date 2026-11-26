// src/runtime/bridge-view.ts: what the model receives under bridge 5.0.3 for one call, rule by rule.
import assert from "node:assert/strict";
import { test } from "node:test";
import {
	agentsPath,
	answered,
	type BridgeCursor,
	bridgeView,
	CLAUDE_CODE_TOOLS,
	EMPTY_PROMPT,
	historyReplaced,
	type PiCall,
	type PiCallMessage,
	SUMMARY_PREFIX,
	SUMMARY_SUFFIX,
} from "../../src/runtime/bridge-view.ts";

const user = (text: string): PiCallMessage => ({ role: "user", content: [{ type: "text", text }] });
const custom = (text: string): PiCallMessage => ({ role: "custom", content: text });
const reply = (text: string): PiCallMessage => ({ role: "assistant", content: [{ type: "text", text }] });
const toolUse = (id: string): PiCallMessage => ({
	role: "assistant",
	content: [{ type: "toolCall", id, name: "bash" }],
});
const result = (id: string, text: string): PiCallMessage => ({
	role: "toolResult",
	toolCallId: id,
	toolName: "bash",
	content: [{ type: "text", text }],
});

/** Pi's agent directory in these tests. */
const AGENT_DIR = "/home/u/.pi/agent";

/** A call of `messages` with no system prompt, no `AGENTS*` file and no tools, unless `call` says otherwise. */
function piCall(messages: readonly PiCallMessage[], call: Partial<PiCall> = {}): PiCall {
	return { systemPrompt: "", messages, agents: undefined, isolated: false, tools: [], ...call };
}

/** The views of calls made one after the other, each with the cursor the one before it left. */
function views(...calls: readonly PiCall[]) {
	let cursor: BridgeCursor | undefined;
	return calls.map((call) => {
		const served = bridgeView(call, cursor);
		cursor = served.cursor;
		return served.view;
	});
}

test("T-31: a marker only in Pi's system prompt is in no part of the model's view", () => {
	const marker = "limen-system-only-marker";
	const call = piCall([user("task"), custom("cue")], {
		systemPrompt: `You are a worker.\n\n${marker}`,
		agents: "# Project\n",
		tools: ["read"],
	});
	assert.equal(JSON.stringify(bridgeView(call, undefined).view).includes(marker), false);
});

test("the nearest AGENTS* text joins the preset's append under # CLAUDE.md, with the word pi as environment", () => {
	const view = bridgeView(piCall([user("task")], { agents: "Run pi here; spinach stays." }), undefined).view;
	assert.deepEqual(view.system, {
		preset: "claude_code",
		append: ["# CLAUDE.md\n\nRun environment here; spinach stays."],
	});
});

test("E-15: with CLAUDE_BRIDGE_ISOLATED=1 the append holds no AGENTS* text", () => {
	const view = bridgeView(piCall([user("task")], { agents: "# Project\n", isolated: true }), undefined).view;
	assert.deepEqual(view.system.append, []);
});

test("the bridge takes the first AGENTS* file in the cwd or the nearest folder above it", () => {
	const files = new Set(["/work/AGENTS.md", "/work/repo/AGENTS.MD", "/work/repo/AGENTS.override.md"]);
	const exists = (path: string) => files.has(path);
	assert.deepEqual(
		[
			agentsPath("/work/other", AGENT_DIR, exists),
			agentsPath("/work/repo/sub", AGENT_DIR, exists),
			agentsPath("/elsewhere", AGENT_DIR, exists),
		],
		["/work/AGENTS.md", "/work/repo/AGENTS.override.md", undefined],
	);
});

test("with no AGENTS* file from the cwd up to the root the bridge takes the one in Pi's agent directory", () => {
	const files = new Set([`${AGENT_DIR}/AGENTS.md`, "/work/AGENTS.md"]);
	const exists = (path: string) => files.has(path);
	assert.deepEqual(
		[agentsPath("/elsewhere/repo", AGENT_DIR, exists), agentsPath("/work/repo", AGENT_DIR, exists)],
		[`${AGENT_DIR}/AGENTS.md`, "/work/AGENTS.md"],
	);
});

test("Pi's skills block is the one part of Pi's prompt in the append, with its read tool under the bridge's name", () => {
	const skills = [
		"The following skills provide specialized instructions for specific tasks.",
		"Use the read tool to load a skill's file when the task matches its description.",
		"<available_skills>",
		"  <skill><name>s</name></skill>",
		"</available_skills>",
	];
	const prompt = `Pi's own prompt.\n\n${skills.join("\n")}\nMore of Pi's prompt.`;
	const view = bridgeView(piCall([user("task")], { systemPrompt: prompt }), undefined).view;
	const renamed = skills.with(1, skills[1]?.replace("the read tool", "the mcp__custom-tools__read tool") ?? "");
	assert.deepEqual(view.system.append, [renamed.join("\n")]);
});

test("a custom message reaches the model as a user message", () => {
	const [, second] = views(piCall([user("task")]), piCall([user("task"), reply("ok"), custom("wake")]));
	assert.deepEqual(second?.messages.at(-1), { role: "user", text: ["wake"] });
});

test("a Pi system entry is dropped, and a call after one in the new messages rebuilds the session", () => {
	const system: PiCallMessage = { role: "system", content: "" };
	const [first, second] = views(
		piCall([system, user("task")]),
		piCall([system, user("task"), reply("ok"), system, user("next")]),
	);
	assert.deepEqual(
		[first?.path, first?.messages, second?.path, second?.messages],
		[
			"fresh",
			[{ role: "user", text: ["task"] }],
			"rebuild",
			[
				{ role: "user", text: ["task"] },
				{ role: "assistant", text: ["ok"] },
				{ role: "user", text: ["next"] },
			],
		],
	);
});

test("E-14: a reused session gets the trailing user run as one prompt, messages apart by a blank line, blocks by a newline", () => {
	const twoBlocks: PiCallMessage = {
		role: "user",
		content: [
			{ type: "text", text: "a" },
			{ type: "text", text: "b" },
		],
	};
	const [, second] = views(
		piCall([user("task")]),
		piCall([user("task"), reply("ok"), custom("wake"), twoBlocks, custom("cue")]),
	);
	assert.deepEqual(second && [second.path, second.messages], [
		"reuse",
		[
			{ role: "user", text: ["task"] },
			{ role: "assistant", text: ["ok"] },
			{ role: "user", text: ["wake\n\na\nb\n\ncue"] },
		],
	]);
});

test("E-14: a prompt run with no text reaches the model as [continue]", () => {
	const [, second] = views(piCall([user("task")]), piCall([user("task"), reply("ok"), custom("")]));
	assert.deepEqual(second?.messages.at(-1), { role: "user", text: [EMPTY_PROMPT] });
});

test("a first call with history rebuilds the session: each message its own record, a tool result after its tool use", () => {
	const messages = [user("old task"), toolUse("c1"), custom("aside"), result("c1", "out"), reply("done"), user("next")];
	const view = bridgeView(piCall(messages), undefined).view;
	assert.deepEqual(view.path, "rebuild");
	assert.deepEqual(view.messages, [
		{ role: "user", text: ["old task"] },
		{ role: "assistant", text: [], tools: ["mcp__custom-tools__bash"] },
		{ role: "tool", text: ["out"], tools: ["mcp__custom-tools__bash"] },
		{ role: "user", text: ["aside"] },
		{ role: "assistant", text: ["done"] },
		{ role: "user", text: ["next"] },
	]);
});

test("E-13: after a compaction the session is rebuilt with Pi's summary as one user record with Pi's prefix", () => {
	const summary: PiCallMessage = { role: "compactionSummary", summary: "what happened" };
	const cursor = historyReplaced(answered(bridgeView(piCall([user("task")]), undefined).cursor, reply("ok")));
	const after = bridgeView(piCall([summary, user("task"), reply("ok"), user("next")]), cursor).view;
	assert.deepEqual(
		[after.path, after.messages[0]],
		["rebuild", { role: "user", text: [`${SUMMARY_PREFIX}what happened${SUMMARY_SUFFIX}`] }],
	);
});

test("E-13: a compaction while a query runs restarts it with its request and the bridge's notice, marked without text", () => {
	const summary: PiCallMessage = { role: "compactionSummary", summary: "s" };
	const started = bridgeView(piCall([user("task"), custom("cue")]), undefined).cursor;
	const replaced = historyReplaced(answered(started, toolUse("c1")));
	const view = bridgeView(piCall([summary, toolUse("c1"), result("c1", "out")]), replaced).view;
	assert.deepEqual(view.messages.slice(-2), [
		{ role: "user", text: ["task\n\ncue"] },
		{ role: "user", text: [], notice: "history replaced" },
	]);
});

test("E-5: the tool results of a call continue the running query, so the call keeps its path", () => {
	const [, second] = views(piCall([user("task")]), piCall([user("task"), toolUse("c1"), result("c1", "out")]));
	assert.deepEqual(second && [second.path, second.messages], [
		"fresh",
		[
			{ role: "user", text: ["task"] },
			{ role: "assistant", text: [], tools: ["mcp__custom-tools__bash"] },
			{ role: "tool", text: ["out"], tools: ["mcp__custom-tools__bash"] },
		],
	]);
});

test("E-13: a compaction restarts the query only when the call's answer left it waiting on tool results", () => {
	const cursor = bridgeView(piCall([user("task")]), undefined).cursor;
	assert.deepEqual(
		[
			historyReplaced(answered(cursor, toolUse("c1")))?.replaced,
			historyReplaced(answered(cursor, reply("ok")))?.replaced,
		],
		["restart", "rebuild"],
	);
});

test("an empty custom message reaches a rewritten session as Pi's empty text block, which the array rule gives [image]", () => {
	const view = bridgeView(piCall([custom(""), reply("ok"), user("next")]), undefined).view;
	assert.deepEqual(view.messages[0], { role: "user", text: ["[image]"] });
});

test("E-5: with no Pi tool the model gets Claude Code's own tools back", () => {
	const view = bridgeView(piCall([user("task")], { tools: [] }), undefined).view;
	assert.deepEqual(view.tools, [...CLAUDE_CODE_TOOLS]);
});

test("E-5: Pi's tools reach the model as mcp__custom-tools__<name>", () => {
	const view = bridgeView(piCall([user("task")], { tools: ["read", "bash", "finish"] }), undefined).view;
	assert.deepEqual(view.tools, ["mcp__custom-tools__read", "mcp__custom-tools__bash", "mcp__custom-tools__finish"]);
});
