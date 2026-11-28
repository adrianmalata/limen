// U5: the engine's launch argv and JSON stream. A pi-claude route names Pi's bridge. Lines split across chunks still
// parse once; only an assistant stop reason of error or aborted marks a failed turn; a tool's start and end carry the
// call's id.
import assert from "node:assert/strict";
import { mkdir, mkdtemp, realpath, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import test from "node:test";
import { argvFor, ENGINES } from "../src/runtime/engine.ts";
import { createStreamParser, toolCallText } from "../src/runtime/stream.ts";

test("a pi-claude route loads Pi's installed bridge package", async (t) => {
	const home = await realpath(await mkdtemp(`${tmpdir()}/limen-home-`));
	process.env.HOME = home;
	t.after(() => rm(home, { recursive: true }));
	const bridge = `${home}/.pi/agent/npm/node_modules/@fixture/pi-claude-bridge`;
	await mkdir(bridge, { recursive: true });
	const slots = { jobDir: "/j", label: "l", extensions: [], taskFile: "/j/task.md", tools: ["read"], skills: [] };
	const pi = argvFor(ENGINES.pi, { ...slots, provider: "pi-claude", model: "claude-opus-5-5" }).join(" ");
	assert.ok(pi.includes(`--extension ${bridge} --provider pi-claude --model claude-opus-5-5 `), pi);
});

const end = (message: object) => JSON.stringify({ type: "message_end", message });

test("a line split across chunks yields one event when its end arrives, and flush emits a trailing partial line", () => {
	const parser = createStreamParser();
	const line = end({ role: "assistant", content: ["do", "ne"].map((text) => ({ type: "text", text })) });
	const started = parser.push(`{"type":"agent_start"}\r\n${line.slice(0, 20)}`);
	assert.deepEqual(started, [{ kind: "activity", name: "think" }]);
	const tool = '{"type":"tool_execution_start","toolName":"bash","args":{"command":"npm  test"}}';
	assert.deepEqual(parser.push(`${line.slice(20)}\n${tool}`), [{ kind: "assistant", text: "done" }]);
	assert.deepEqual(parser.flush(), [{ kind: "tool", name: "bash", detail: "npm test" }]);
});

test("only an assistant's error or aborted stop reason reaches the result; other lines never pose as a reply", () => {
	const parser = createStreamParser();
	const said = (role: string, stopReason: string, text = "", errorMessage = "") =>
		end({ role, content: text ? [{ type: "text", text }] : [], stopReason, ...(errorMessage ? { errorMessage } : {}) });
	const cut = '{"type":"message_end","message":{"role":"assistant"';
	const rows: ReadonlyArray<readonly [string, unknown]> = [
		[
			said("assistant", "error", "", "usage\n limit"),
			{ kind: "assistant", text: "", stopReason: "error: usage limit" },
		],
		[said("assistant", "aborted"), { kind: "assistant", text: "", stopReason: "aborted" }],
		[said("assistant", "stop", "ok"), { kind: "assistant", text: "ok" }],
		[said("user", "error", "fake reply"), { kind: "activity", name: "think" }],
		[cut, { kind: "log", line: cut }],
		["{}", undefined],
	];
	for (const [line, event] of rows) {
		assert.deepEqual(parser.push(`${line}\n`), event ? [event] : [], line);
	}
});

// E-19, R-108: Pi runs the tools of one message at once and tags each start and end with the call's toolCallId, by
// which the stall rule tells the calls of one message apart.
test("a tool's start and end carry Pi's toolCallId as their id when it is a non-empty string, and no id otherwise", () => {
	const parser = createStreamParser();
	const rows: ReadonlyArray<readonly [object, unknown]> = [
		[
			{ type: "tool_execution_start", toolCallId: "call-1", toolName: "write", args: { path: "note.md" } },
			{ kind: "tool", name: "write", detail: "note.md", id: "call-1" },
		],
		[
			{ type: "tool_execution_end", toolCallId: "call-1", toolName: "write" },
			{ kind: "activity", name: "wait", id: "call-1" },
		],
		[
			{ type: "tool_execution_start", toolCallId: 2, toolName: "bash", args: { command: "sleep 600" } },
			{ kind: "tool", name: "bash", detail: "sleep 600" },
		],
		[
			{ type: "tool_execution_end", toolCallId: "", toolName: "bash" },
			{ kind: "activity", name: "wait" },
		],
		[
			{ type: "tool_execution_end", toolName: "bash" },
			{ kind: "activity", name: "wait" },
		],
	];
	for (const [line, event] of rows) {
		assert.deepEqual(parser.push(`${JSON.stringify(line)}\n`), [event], JSON.stringify(line));
	}
});

// R-108: the job log and the stall's detail name a tool call by this one text (T-25 (2)).
test("a tool call's text is its name and its detail joined by a space, and its name alone when it has no detail", () => {
	assert.equal(toolCallText({ kind: "tool", name: "bash", detail: "sleep 600" }), "bash sleep 600");
	assert.equal(toolCallText({ kind: "tool", name: "write" }), "write");
});
