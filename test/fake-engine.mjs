#!/usr/bin/env node
// The one fake pi. It loads the real hook extensions Limen passes, runs the task text as a script, and records what it
// saw in the record dir (the parent of --session-dir, so a job's own dir). Script lines:
//   commit · fail <code> · error [<text>] (assistant stop reason "error", with <text> as its errorMessage, as the
//   bridge gives a provider's limit text, E-9) · say <text> · tool <command> · block · orphan · finish <handoff, \n ends
//   a line>
//   · edit <path> · write <path> (a call of Pi's edit or write tool with `{ path }`, which appends a line to the file
//     or writes it, its folders made, and gives Pi's success text as its result)
//   · untracked <path> (a bash call that writes the file <path> in the cwd, its folders made, as a write through bash
//     does, which no tool list stops; the file is untracked unless the repository ignores it)
//   · idle (a bash tool whose one child waits without CPU) · deaf (ignores SIGTERM from then on)
//   · tools-on-term <n> (ignores the next SIGTERM and starts n bash tools on it, as an engine that works on in a grace)
//   · die <SIGNAL> (ends this process by that signal, as the kernel's OOM killer ends one by SIGKILL)
//   · rate-limit <type> <resetAtMs> (emits the bridge's `kendex:rate-limit` on `pi.events`, E-9)
//   · malformed <event> (sends the hooks <event> with an empty payload, as a Pi of another shape would)
//   · linger (starts a child that holds this engine's stdout and stderr, so the engine exits before its pipes close)
//   · credential (runs `git credential fill` for https://github.com in its worktree, as a tool of the engine would,
//     and writes its exit code, stdout and stderr to fake-credential.json)
//   · compact <manual|threshold|overflow> [retry] (a Pi compaction: its entry, the context rebuilt, `session_compact`)
//   · reload · new (Pi's /reload and /new: `session_shutdown`, the extensions loaded again, `session_start`; a reload
//     while a run is active is refused, and a new aborts that run first)
//   · /<command> <args> (runs a command a hook registered, as a user typing it)
// The task's run is Pi's first prompt: it is prepared at the start (`before_agent_start`), as Pi's prompt prepares it,
// and makes its first model call at the first `tool`, `edit`, `write` or `untracked` word, each such word one call
// that ends in that tool call, or after the last word. Until that call the session is idle, so the words before it stand for what happens
// while a session waits: a wake, a command, a `block`. Every other run starts from a message a hook sends, as Pi 1.5.1
// runs it: a user message sent while the session is idle marks it busy only after Pi's awaits before `_startRun`, so
// two sent in one stretch both start a run, and the second fails with Pi's error and settles inside the first (E-21); a
// custom message starts its run at the send.
// For every model call the fake builds Pi's context and appends what the model receives under the bridge, from
// src/runtime/bridge-view.ts, as one line of fake-view.jsonl (T-31 (1)); the fake applies no mapping of its own.
// A SIGTERM ends it as Pi's print mode does (E-17): one `sigterm` event, then exit 143; a second one exits 143 at once.
// A hook's handler that throws is reported on stderr as Pi reports an extension error, and the run goes on.
// `block` writes fake-blocked-<n> and waits for one write to the FIFO fake-gate. Records: fake-argv.json, fake-env.json
// (the name of every variable of its environment, never a value), fake-task.txt, fake-system.txt (the system prompt
// the task's before_agent_start returned, Pi's side), fake-context.txt (the hidden context messages it returned),
// fake-events.jsonl (its first event the `pid` of this engine process, so a test can tell whether the engine still
// runs), fake-view.jsonl, and the Pi-shaped transcript in --session-dir (test/fake-session.mjs).
import { execFileSync, spawn, spawnSync } from "node:child_process";
import { randomUUID } from "node:crypto";
import {
	appendFileSync,
	constants,
	existsSync,
	mkdirSync,
	openSync,
	readdirSync,
	readFileSync,
	statSync,
	writeFileSync,
} from "node:fs";
import { Socket } from "node:net";
import { homedir } from "node:os";
import { dirname, join, resolve } from "node:path";
import { agentsPath, answered, bridgeView, historyReplaced } from "../src/runtime/bridge-view.ts";
import { FakeSession } from "./fake-session.mjs";

const args = process.argv.slice(2);
if (args[0] === "--version") {
	process.exit(console.log("0.0.0-test") ?? 0);
}
const flag = (name) => (args.includes(name) ? args[args.indexOf(name) + 1] : undefined);
const sessionDir = flag("--session-dir");
const dir = dirname(sessionDir ?? join(process.cwd(), "session"));
const prompt = args.find((value) => value.startsWith("@"));
const task = prompt ? readFileSync(prompt.slice(1), "utf8") : (flag("--continue") ?? "");
const preamble = flag("--append-system-prompt") ?? "";
mkdirSync(dir, { recursive: true });
writeFileSync(join(dir, "fake-argv.json"), JSON.stringify(args));
// Every name, so a test sees what the job's environment drops (R-087); a value never leaves the process.
writeFileSync(join(dir, "fake-env.json"), JSON.stringify(Object.keys(process.env).sort()));
writeFileSync(join(dir, "fake-task.txt"), task);
const record = (entry) => appendFileSync(join(dir, "fake-events.jsonl"), `${JSON.stringify(entry)}\n`);
record({ event: "pid", pid: process.pid });
const emit = (event) => console.log(JSON.stringify(event));

// The route the transcript's assistant messages name: `--provider` and `--model`, or a `provider/model` id.
const model = flag("--model") ?? "fake";
const split = !flag("--provider") && model.includes("/");
const route = {
	provider: flag("--provider") ?? (split ? model.slice(0, model.indexOf("/")) : "fake"),
	model: split ? model.slice(model.indexOf("/") + 1) : model,
};
/**
 * The session's transcript. On `--continue`, the file Pi 1.5.1 continues: the most recently changed `*.jsonl` of the
 * session folder whose header names this cwd (`core/session-manager.js:446-466`, `:1366-1373`). With none, and
 * without `--continue`, a new `fake.jsonl`, or `fake-<n>.jsonl` after `new`.
 */
function transcript(continued, count) {
	if (!sessionDir) {
		return undefined;
	}
	mkdirSync(sessionDir, { recursive: true });
	const recent = continued
		? readdirSync(sessionDir)
				.filter((name) => name.endsWith(".jsonl"))
				.map((name) => join(sessionDir, name))
				.sort((one, other) => statSync(other).mtimeMs - statSync(one).mtimeMs)
				.find((file) => headerCwd(file) === resolve(cwd))
		: undefined;
	return recent ?? join(sessionDir, count === 1 ? "fake.jsonl" : `fake-${count}.jsonl`);
}
/** The cwd a session file's header names, resolved; undefined for a file with no session header. */
function headerCwd(file) {
	const [first = ""] = readFileSync(file, "utf8").split("\n", 1);
	const header = first.startsWith("{") ? JSON.parse(first) : undefined;
	return header?.type === "session" && typeof header.cwd === "string" ? resolve(header.cwd) : undefined;
}
let sessions = 1;
let sessionId = process.env.PI_SESSION_ID ?? "fake";
const cwd = process.cwd();
let session = new FakeSession({
	file: transcript(args.includes("--continue"), sessions),
	id: sessionId,
	cwd,
	...route,
});

// Pi's print mode, which Limen runs (`--mode json`), exits 143 on SIGTERM and does not die by the signal (E-17).
let deaf = false;
// The tool starts of `tools-on-term`, still owed to the next SIGTERM.
let toolsOnTerm = 0;
let terminating = false;
process.on("SIGTERM", () => {
	if (deaf) {
		record({ event: "sigterm ignored" });
		return;
	}
	if (toolsOnTerm > 0) {
		record({ event: "sigterm ignored" });
		for (let n = 1; n <= toolsOnTerm; n += 1) {
			emit({ type: "tool_execution_start", toolName: "bash", args: { command: `true ${n}` } });
			emit({ type: "tool_execution_end", toolName: "bash" });
		}
		toolsOnTerm = 0;
		return;
	}
	if (terminating) {
		process.exit(143);
	}
	terminating = true;
	record({ event: "sigterm" });
	process.stdout.write("", () => process.exit(143));
});

const handlers = new Map();
const tools = new Map();
const commands = new Map();
const listeners = new Map();
// The extension whose factory runs now: Pi names it in the error of each handler it registered.
let loading = "";
/** What a handler's error says. */
const said = (error) => (error instanceof Error ? error.message : String(error));
/** Each handler of `event` in order with `payload`: Pi's runner reports a handler's error and goes on (R-017). */
const fire = async (event, payload) => {
	const results = [];
	for (const { handler, path } of handlers.get(event) ?? []) {
		try {
			results.push(await handler(payload, context));
		} catch (error) {
			console.error(`Extension error (${path}): ${said(error)}`);
			results.push(undefined);
		}
	}
	return results;
};
// Pi's event bus catches a listener's error and writes `Event handler error (<channel>):` to stderr. The bridge emits
// without waiting; the fake waits for each listener, so what a listener writes is there before the next word runs.
const emitBus = async (channel, data) => {
	for (const listener of listeners.get(channel) ?? []) {
		try {
			await listener(data);
		} catch (error) {
			console.error(`Event handler error (${channel}):`, said(error));
		}
	}
};
const toast = (method) => (text) => method === "notify" && record({ event: "notify", text });
const ui = new Proxy({}, { get: (_, method) => (method === "then" ? undefined : toast(method)) });
const context = {
	cwd,
	ui,
	isIdle: () => !reserved,
	// Pi ends the session after the current turn; the fake ends when its script does.
	shutdown: () => {},
	sessionManager: {
		getSessionId: () => sessionId,
		getSessionFile: () => session.file ?? join(dir, "session.jsonl"),
		getSessionName: () => "fake",
		// Pi's `ReadonlySessionManager.buildContextEntries` (`core/session-manager.d.ts:323`), of the session open now.
		buildContextEntries: () => session.buildContextEntries(),
	},
};

// Pi's run state (`core/agent-session.js`): a run reserved or active makes the session busy, as `isStreaming` does;
// steers and follow-ups wait in queues that hand out one message at a time, Pi's default (`settings-defaults.js:6-7`).
let reserved = false;
/**
 * The runs started and not yet past their loops: pi-agent-core's `activeRun` (`agent.js:345-354`), which makes the
 * `agent.prompt` of a run started meanwhile throw (`agent.js:246-248`; `secondStart`).
 */
let holders = 0;
let emittingSettled = false;
const deferredSettled = [];
const steering = [];
const followUp = [];
const pendingCustom = [];
const nextTurn = [];
let runs = Promise.resolve();
/** Whether the task's run has started and not yet settled: between its calls, the script's words run inside it. */
let taskActive = false;
/** Whether an abort is under way (`core/agent-session.js:2073-2084`): every call that waits for its answer ends aborted. */
let aborting = false;
/** The compaction the next turn of the active run makes before its call, from `compact threshold` during the task's run. */
let beforeTurn;
/** The compaction the next run makes when it ends, from `compact threshold` or `overflow` outside the task's run. */
let afterRun;
/** The answer of a call that an abort ends, as Pi records it (`stopReason` `aborted`, bridge-5.0.3.md §6). */
const ABORTED = { reply: "", stopReason: "aborted", errorMessage: "Operation aborted" };
/** What the bridge holds after the last call (src/runtime/bridge-view.ts). */
let cursor;

const userMessage = (text) => ({ role: "user", content: [{ type: "text", text }], timestamp: Date.now() });
const customMessage = ({ customType, content, display, details }) => ({
	role: "custom",
	customType,
	content: content ?? [],
	display,
	details,
	timestamp: Date.now(),
});

/**
 * Pi's `prompt` from `sendUserMessage` (`core/agent-session.js:1695-1727`, `:2012-2039`): deferred while agent_settled
 * is emitted (`:1696-1699`), else it awaits `_preparePrompt` (`:1720`) and starts a run with the trigger it returns
 * (`:1726`). Pi's runtime gives a send's error only to the extension error channel (`:2870-2877`).
 */
async function promptMessage(text, behavior, inline = false) {
	if (emittingSettled) {
		deferredSettled.push(() => promptMessage(text, behavior, true));
		return;
	}
	let trigger;
	try {
		trigger = await preparePrompt(text, behavior);
	} catch (error) {
		console.error(`Extension error (<runtime>): ${said(error)}`);
		return;
	}
	if (trigger) {
		await startRun(trigger, inline);
	}
}
/**
 * Pi's `_preparePrompt` (`core/agent-session.js:1732-1778`): it awaits the input handlers first (`:1736`), and only then
 * reads `isStreaming` (`:1749`), which only `_startRun` sets (`:1488`), so a send made in the same stretch reads the
 * session idle too (E-21). Busy, a follow-up or a steer is queued and a send with no `deliverAs` throws (`:1749-1760`);
 * idle, it returns the run's trigger.
 */
async function preparePrompt(text, behavior) {
	await inputHandlers();
	if (!reserved) {
		return { messageType: "user", prompt: text };
	}
	if (behavior === "followUp" || behavior === "steer") {
		(behavior === "followUp" ? followUp : steering).push(userMessage(text));
		return undefined;
	}
	throw new Error(
		"Agent is already processing. Specify streamingBehavior ('steer' or 'followUp') to queue the message.",
	);
}
/** Pi's `_runInputHandlers` with no `input` handler, as in Limen's sessions: it returns at once (`:1654-1657`). */
async function inputHandlers() {}
/**
 * Pi's `sendCustomMessage` (`core/agent-session.js:1946-1984`). Idle with `triggerTurn`, it calls `_startRun` with no
 * await before it (`:1972`), so a custom message marks the session busy at the send.
 */
function sendCustom(message, options, inline = false) {
	if (options?.deliverAs === "nextTurn") {
		nextTurn.push(customMessage(message));
	} else if (reserved && options?.triggerTurn !== false) {
		(options?.deliverAs === "followUp" ? followUp : steering).push(customMessage(message));
	} else if (options?.triggerTurn) {
		if (emittingSettled) {
			deferredSettled.push(() => sendCustom(message, options, true));
			return;
		}
		return startRun({ messageType: "custom", message: customMessage(message) }, inline);
	} else if (reserved) {
		// Held to the end of the current turn, so that it never splits a tool call from its result.
		pendingCustom.push(customMessage(message));
	} else {
		// Appended at once, with no run; Pi emits no extension event for it.
		session.append(customMessage(message));
	}
}
/**
 * A run of `trigger`; one that a hook asked for while agent_settled was emitted runs inside that settle. Pi's
 * `_startRun` marks the session busy first (`core/agent-session.js:1488`); a run started while another one holds the
 * agent fails (`secondStart`), and the runs it chains wait for it too.
 */
function startRun(trigger, inline) {
	reserved = true;
	if (holders > 0) {
		// Each of Pi's two starts emits its before_agent_start in the order they started; the first one here begins a
		// microtask after its start, through `runs`, so the second waits one microtask as well.
		const failed = Promise.resolve().then(() => secondStart(trigger));
		runs = Promise.all([runs, failed]);
		return failed;
	}
	holders += 1;
	if (inline) {
		return execute(prepare(trigger));
	}
	runs = runs.then(() => execute(prepare(trigger)));
	return runs;
}
/**
 * A run started while another one holds the agent (E-21): `_startRun` marks the session busy (`core/agent-session.js:1488`)
 * and emits before_agent_start (`:1552`); pi-agent-core's `agent.prompt` throws before any `message_start`
 * (`agent.js:246-248`); `_startRun`'s `finally` settles it, idle first, while the other run goes on (`:1528-1536`,
 * `:740`); then the error reaches the extension error channel (`:2870-2877`). Its message enters no run.
 */
async function secondStart(trigger) {
	reserved = true;
	await prepare(trigger);
	flushPendingCustom();
	await settle(false);
	console.error(
		"Extension error (<runtime>): Agent is already processing a prompt. Use steer() or followUp() to queue messages, or wait for completion.",
	);
}
/** Appends the custom messages held while the session was busy (`core/agent-session.js:1999-2007`). */
function flushPendingCustom() {
	for (const message of pendingCustom.splice(0)) {
		session.append(message);
	}
}

const api = {
	on: (event, handler) => handlers.set(event, [...(handlers.get(event) ?? []), { handler, path: loading }]),
	registerTool: (tool) => tools.set(tool.name, tool),
	registerCommand: (name, command) => commands.set(name, command),
	sendUserMessage: (text, options) => {
		record({ event: options?.deliverAs ?? "user", text });
		void promptMessage(text, options?.deliverAs);
	},
	sendMessage: (message, options) => {
		record({ event: options?.deliverAs ?? "message", text: message.content });
		void sendCustom(message, options);
	},
	events: {
		on: (channel, listener) => {
			listeners.set(channel, [...(listeners.get(channel) ?? []), listener]);
			return () =>
				listeners.set(
					channel,
					(listeners.get(channel) ?? []).filter((one) => one !== listener),
				);
		},
		emit: (channel, data) => void emitBus(channel, data),
	},
};

/**
 * Pi's `_prepareRun` (`core/agent-session.js:1560-1594`): `before_agent_start` once per run, each handler seeing the
 * system prompt the one before it returned; the run's messages are its trigger, the pending `nextTurn` messages, then
 * each handler's message as role `custom`. The returned system prompt applies to this run only (E-11).
 */
async function prepare(trigger) {
	let systemPrompt = preamble;
	const results = [];
	for (const { handler, path } of handlers.get("before_agent_start") ?? []) {
		try {
			const result = await handler({ ...trigger, type: "before_agent_start", systemPrompt }, context);
			results.push(result);
			systemPrompt = result?.systemPrompt ?? systemPrompt;
		} catch (error) {
			console.error(`Extension error (${path}): ${said(error)}`);
			results.push(undefined);
		}
	}
	const messages = [trigger.messageType === "custom" ? trigger.message : userMessage(trigger.prompt)];
	messages.push(...nextTurn.splice(0));
	messages.push(...results.flatMap((result) => (result?.message ? [customMessage(result.message)] : [])));
	return { systemPrompt, messages, results, decide: async () => ({ reply: "ok" }) };
}
/** One run (`core/agent-session.js:1487-1535`): its loops, then one `agent_settled`, every run deferred during it after. */
async function execute(preparing) {
	reserved = true;
	let run;
	try {
		run = await preparing;
	} catch (error) {
		// Pi's `_startRun` leaves the session idle when the run cannot start, and settles nothing.
		reserved = false;
		holders -= 1;
		console.error(`fake engine: the run did not start: ${said(error)}`);
		return;
	}
	flushPendingCustom();
	try {
		let starting = run.messages;
		let poll = true;
		// An abort ends the run's loops (`core/agent-session.js:1514`).
		while (starting.length > 0 && !aborting) {
			await agentLoop(run, starting, poll);
			// Between agent_end and agent_settled (`core/agent-session.js:1623`): a threshold or overflow compaction.
			await compactAfterRun();
			// The agent continues from its assistant tail with a queued steer, else a follow-up (pi-agent-core's
			// `agent.js:262-273`), as Pi continues after a compaction while messages wait (`core/agent-session.js:2706-2710`).
			const steer = steering.splice(0, 1);
			starting = steer.length > 0 ? steer : followUp.splice(0, 1);
			poll = steer.length === 0;
		}
	} catch (error) {
		console.error(`fake engine: the run failed: ${said(error)}`);
	} finally {
		// pi-agent-core's run ends with its loops (`agent.js:345-354`), before Pi settles the session.
		holders -= 1;
		flushPendingCustom();
		await settle(aborting);
	}
}
/** Pi's `_emitAgentSettled` (`core/agent-session.js:738-760`): idle first, then the event, then every deferred action. */
async function settle(aborted) {
	reserved = false;
	emittingSettled = true;
	try {
		await fire("agent_settled", { aborted });
	} finally {
		emittingSettled = false;
	}
	for (const action of deferredSettled.splice(0)) {
		await action();
	}
}
/**
 * pi-agent-core's `prepareNextTurn` step of a turn after the first (`agent-loop.js:97-118`): Pi's compaction before the
 * next assistant response (`core/agent-session.js:477-486`, `:594-595`), then the steering queued meanwhile when
 * `pending` holds none, then `turn_start`; the messages the turn enters.
 */
async function prepareTurn(pending) {
	await compactBeforeTurn();
	const entering = pending.length > 0 ? pending : steering.splice(0, 1);
	await fire("turn_start", {});
	return entering;
}
/**
 * pi-agent-core's `runAgentLoop` (`agent-loop.js:48-212`): the starting messages, then a model call for each turn
 * while a tool call or a steer asks for one, then the follow-ups one at a time; `agent_end` before the settle.
 */
async function agentLoop(run, starting, poll) {
	const added = [];
	const enter = async (message) => {
		await fire("message_start", { message });
		await fire("message_end", { message });
		session.append(message);
		added.push(message);
	};
	await fire("agent_start", {});
	await fire("turn_start", {});
	for (const message of starting) {
		await enter(message);
	}
	let pending = poll ? steering.splice(0, 1) : [];
	let calls = true;
	for (let first = true; ; first = false) {
		if (!first) {
			const next = pending.length > 0 || calls ? pending : followUp.splice(0, 1);
			if (next.length === 0 && !calls) {
				break;
			}
			pending = next;
		}
		// The run's answer comes first: the task's run waits here for the script's next `tool` word or its end.
		const decision = aborting ? ABORTED : await run.decide();
		if (!first) {
			pending = await prepareTurn(pending);
		}
		for (const message of pending.splice(0)) {
			await enter(message);
		}
		const assistant = await modelCall(run, decision);
		added.push(assistant);
		const ended = assistant.stopReason === "error" || assistant.stopReason === "aborted";
		const results = ended ? [] : await runTools(assistant, enter);
		await fire("turn_end", { message: assistant, toolResults: results });
		flushPendingCustom();
		if (ended) {
			break;
		}
		calls = results.length > 0;
		pending = steering.splice(0, 1);
		run.toolsDone?.();
	}
	await fire("agent_end", { messages: added });
}
/** Appends what the model receives under the bridge for a call of `messages` in `run` (src/runtime/bridge-view.ts). */
function writeView(run, messages) {
	// Pi's agent directory (`config.js:510-516`), where the bridge looks when no folder above the cwd holds the file.
	const agentDir = process.env.PI_CODING_AGENT_DIR ?? join(homedir(), ".pi", "agent");
	const file = agentsPath(cwd, agentDir, existsSync);
	const call = {
		systemPrompt: run.systemPrompt,
		messages,
		agents: file === undefined ? undefined : readFileSync(file, "utf8"),
		isolated: process.env.CLAUDE_BRIDGE_ISOLATED === "1",
		tools: activeTools(),
	};
	const served = bridgeView(call, cursor);
	cursor = served.cursor;
	appendFileSync(join(dir, "fake-view.jsonl"), `${JSON.stringify(served.view)}\n`);
}
/**
 * One model call: the `context` event with every message but Pi's `system` ones (`core/extensions/runner.js:1014-1022`),
 * the call's view under the bridge in fake-view.jsonl, then the model's answer, `decision`, which the run gave first.
 * A call that an abort ends before its request has no view: no answer comes from the model.
 */
async function modelCall(run, decision) {
	const messages = session.messages();
	await fire("context", { type: "context", messages: messages.filter((message) => message.role !== "system") });
	if (decision !== ABORTED) {
		writeView(run, messages);
	}
	const assistant =
		decision.tool === undefined
			? session.assistant(
					[{ type: "text", text: decision.reply }],
					decision.stopReason ?? "stop",
					decision.errorMessage,
				)
			: session.assistant(
					[
						{
							type: "toolCall",
							id: `call-${randomUUID().slice(0, 8)}`,
							name: decision.tool.name,
							arguments: decision.tool.input,
						},
					],
					"toolUse",
				);
	await fire("message_start", { message: assistant });
	if (decision.tool === undefined) {
		await printReply(decision);
	}
	await fire("message_end", { message: assistant });
	session.append(assistant);
	cursor = cursor && answered(cursor, assistant);
	return assistant;
}
/** The reply's message_end on stdout, as the fake has always printed it: cut inside multi-byte letters. */
async function printReply({ reply, stopReason, errorMessage }) {
	const assistant = {
		role: "assistant",
		content: [{ type: "text", text: reply }],
		...(stopReason && { stopReason }),
		...(errorMessage && { errorMessage }),
	};
	// A pipe can cut a line anywhere: cut it inside its first letter of two, three and four bytes; let each piece be read.
	const line = Buffer.from(`${JSON.stringify({ type: "message_end", message: assistant })}\n`);
	const cuts = [0b110, 0b1110, 0b11110].map((lead, n) => line.findIndex((byte) => byte >> (5 - n) === lead) + 1);
	let start = 0;
	for (const end of [...cuts.filter((cut) => cut > 0).sort((a, b) => a - b), line.length]) {
		await new Promise((resolve) => process.stdout.write(line.subarray(start, end), () => setTimeout(resolve, 20)));
		start = end;
	}
}
/**
 * The tool calls of `assistant`, in pi-agent-core's order (`agent-loop.js:380-415`): `tool_execution_start`, the
 * `tool_call` handlers, whose block stops the call, the tool itself, the `tool_result` handlers, whose content replaces
 * the result's, `tool_execution_end`, then the result message.
 */
async function runTools(assistant, enter) {
	const results = [];
	for (const call of assistant.content.filter((part) => part.type === "toolCall")) {
		const { id, name, arguments: input } = call;
		emit({ type: "tool_execution_start", toolName: name, args: input });
		await fire("tool_execution_start", { toolName: name, args: input });
		const blocked = await toolCall({ type: "tool_call", toolCallId: id, toolName: name, input });
		const result =
			blocked === undefined
				? await toolResult({ type: "tool_result", toolCallId: id, toolName: name, input, ...runTool(name, input) })
				: { content: [{ type: "text", text: blocked }], isError: true };
		emit({ type: "tool_execution_end", toolName: name });
		await fire("tool_execution_end", { toolName: name });
		const message = { role: "toolResult", toolCallId: id, toolName: name, ...result, timestamp: Date.now() };
		await enter(message);
		results.push(message);
	}
	return results;
}
/**
 * The tool's own result. The fake runs no command, so bash gives Pi's empty output; edit appends a line to its file and
 * write writes its file, each with Pi's success text (`core/tools/edit.js:133`, `core/tools/write.js:50`).
 */
function runTool(name, input) {
	const done = (text) => ({ content: [{ type: "text", text }], isError: false });
	if (name !== "edit" && name !== "write") {
		return done("(no output)");
	}
	const file = resolve(cwd, input.path);
	mkdirSync(dirname(file), { recursive: true });
	if (name === "edit") {
		appendFileSync(file, "fake edit\n");
		return done(`Successfully replaced 1 block(s) in ${input.path}.`);
	}
	writeFileSync(file, "fake write\n");
	return done(`Successfully wrote to ${input.path}`);
}
/** Pi's `emitToolCall` (`core/extensions/runner.js:965-980`): the first block wins; a handler's error blocks the call. */
async function toolCall(event) {
	for (const { handler } of handlers.get("tool_call") ?? []) {
		try {
			const result = await handler(event, context);
			if (result?.block) {
				return result.reason ?? "Tool execution was blocked";
			}
		} catch (error) {
			return said(error);
		}
	}
	return undefined;
}
/** Pi's `emitToolResult` (`core/extensions/runner.js:908-960`): each handler sees the content the one before it set. */
async function toolResult(event) {
	const current = { ...event };
	for (const { handler, path } of handlers.get("tool_result") ?? []) {
		try {
			const result = await handler(current, context);
			current.content = result?.content ?? current.content;
			current.isError = result?.isError ?? current.isError;
		} catch (error) {
			console.error(`Extension error (${path}): ${said(error)}`);
		}
	}
	return { content: current.content, isError: current.isError };
}
/** Pi 1.5.1's built-in tools (`core/tools/index.js:19-28`), its defaults first (`core/settings-manager.js:35`). */
const BUILT_IN = ["read", "bash", "edit", "write", "powershell", "grep", "find", "ls"];
/**
 * Pi 1.5.1's active tools: none with `--no-tools`; without `--tools`, its defaults and every tool a hook registers;
 * with it, each name it lists that is a built-in or a registered tool, since the allowlist also filters registered
 * tools (`core/sdk.js:148-157`, `core/agent-session.js:1197-1203`). Limen's lists hold plain names, so no pattern is
 * read.
 */
function activeTools() {
	if (args.includes("--no-tools")) {
		return [];
	}
	const listed = flag("--tools");
	if (!listed) {
		return [...BUILT_IN.slice(0, 4), ...tools.keys()];
	}
	return listed.split(",").filter((name) => BUILT_IN.includes(name) || tools.has(name));
}

let blocks = 0;
async function block() {
	const gate = join(dir, "fake-gate");
	if (!existsSync(gate)) {
		execFileSync("mkfifo", [gate]);
	}
	blocks += 1;
	// Opened to read and write, the FIFO opens at once and no writer's close ends the read; a pipe handle reads it in the
	// event loop. A read stream would wait in a thread of Node's pool, and an exit on SIGTERM waits for that thread.
	const fifo = new Socket({ fd: openSync(gate, constants.O_RDWR | constants.O_NONBLOCK), readable: true });
	const released = new Promise((resolve) => fifo.once("data", resolve));
	writeFileSync(join(dir, `fake-blocked-${blocks}`), "");
	await released;
	fifo.destroy();
}

/** Loads every `--extension` in argv order and calls its default export with the fake `api`, as Pi does at a start. */
async function loadExtensions() {
	for (const map of [handlers, tools, commands, listeners]) {
		map.clear();
	}
	for (let index = args.indexOf("--extension"); index >= 0; index = args.indexOf("--extension", index + 1)) {
		loading = args[index + 1];
		await (await import(loading)).default(api);
	}
	loading = "";
}
/** Waits until no run is reserved, so that one more can start. */
async function idle() {
	while (reserved) {
		await runs;
	}
}

await loadExtensions();
await fire("session_start", { type: "session_start", reason: "startup" });
// The task's run as Pi's first prompt prepares it; its model calls follow the script's words.
const taskRun = await prepare({ messageType: "user", prompt: task });
writeFileSync(join(dir, "fake-system.txt"), taskRun.results.map((result) => result?.systemPrompt ?? "").join("\n"));
writeFileSync(
	join(dir, "fake-context.txt"),
	taskRun.results.map((result) => result?.message?.content ?? "").join("\n"),
);
emit({ type: "agent_start" });
const decisions = [];
let decided;
let toolDone;
let finalTaken = false;
taskRun.decide = async () => {
	if (finalTaken) {
		return { reply: "ok" };
	}
	while (decisions.length === 0 && !aborting) {
		await new Promise((resolve) => (decided = resolve));
	}
	const decision = aborting ? ABORTED : decisions.shift();
	finalTaken = decision.tool === undefined;
	return decision;
};
taskRun.toolsDone = () => toolDone?.();
let taskStarted = false;
/** The task's run starts, after every run before it: it makes its first model call at once. */
async function startTask() {
	if (taskStarted) {
		return;
	}
	taskStarted = true;
	await idle();
	reserved = true;
	holders += 1;
	taskActive = true;
	runs = runs.then(async () => {
		await execute(taskRun);
		taskActive = false;
	});
}
/** Gives the task's run its next answer; a tool call returns once that call and its result are done. */
async function answer(decision) {
	await startTask();
	// A run that an abort ended takes no more answers: its later tool calls never happen.
	if (!taskActive) {
		return;
	}
	const done = decision.tool === undefined ? undefined : new Promise((resolve) => (toolDone = resolve));
	decisions.push(decision);
	decided?.();
	await done;
}

let reply = "fake engine done";
let stopReason;
let errorMessage;
let code = 0;
for (const line of task.split("\n")) {
	const [word = "", ...rest] = line.trim().split(" ");
	const value = rest.join(" ").replaceAll("\\n", "\n"); // a `\n` in say or finish text is a line break
	if (word === "commit") {
		writeFileSync(`fake-${process.pid}-${blocks}-${Date.now()}.txt`, `${task}\n`);
		execFileSync("git", ["add", "."]);
		execFileSync("git", ["commit", "-q", "-m", "fake commit"]);
	} else if (word === "fail") {
		code = Number(value) || 1;
	} else if (word === "error") {
		stopReason = "error";
		errorMessage = value || undefined;
	} else if (word === "say") {
		reply = value;
	} else if (word === "tool") {
		await answer({ tool: { name: "bash", input: { command: value } } });
	} else if (word === "edit" || word === "write") {
		await answer({ tool: { name: word, input: { path: value } } });
	} else if (word === "untracked") {
		await answer({ tool: { name: "bash", input: { command: `printf 'a write through bash\\n' > ${value}` } } });
		mkdirSync(dirname(resolve(cwd, value)), { recursive: true });
		writeFileSync(resolve(cwd, value), "a write through bash\n");
	} else if (word === "block") {
		await block();
	} else if (word === "idle") {
		emit({ type: "tool_execution_start", toolName: "bash", args: { command: "sleep 600" } });
		await new Promise((resolve) => spawn("sleep", ["600"], { stdio: "ignore" }).once("exit", resolve));
	} else if (word === "deaf") {
		deaf = true;
	} else if (word === "tools-on-term") {
		toolsOnTerm = Number(value) || 1;
	} else if (word === "die") {
		process.kill(process.pid, value);
		// The signal may reach another thread of this process first; nothing after this word runs.
		await new Promise(() => setInterval(() => {}, 1 << 30));
	} else if (word === "rate-limit") {
		const resetAtMs = Number(rest[1]);
		await emitBus("kendex:rate-limit", {
			model: "fake",
			provider: "fake",
			rateLimitType: rest[0],
			reason: `${rest[0]} rate limit`,
			resetAt: Math.round(resetAtMs / 1000),
			...(Number.isFinite(resetAtMs) ? { resetAtMs } : {}),
			source: "claude-bridge",
			status: "rejected",
		});
	} else if (word === "malformed") {
		await fire(value, {});
	} else if (word === "linger") {
		const child = spawn("sleep", ["600"], { stdio: ["ignore", "inherit", "inherit"] });
		child.unref();
		writeFileSync(join(dir, "fake-linger"), String(child.pid));
	} else if (word === "credential") {
		// The bound only ends a git that asks on a terminal, which a job's environment rules out (R-087).
		const fill = spawnSync("git", ["credential", "fill"], {
			input: "protocol=https\nhost=github.com\n\n",
			encoding: "utf8",
			timeout: 10_000,
		});
		const { status, signal, stdout, stderr } = fill;
		writeFileSync(join(dir, "fake-credential.json"), JSON.stringify({ status, signal, stdout, stderr }));
	} else if (word === "orphan") {
		const child = spawn(process.execPath, ["-e", "setInterval(() => {}, 1e9)"], { detached: true, stdio: "ignore" });
		child.unref();
		writeFileSync(join(dir, "fake-orphan"), String(child.pid));
	} else if (word === "finish") {
		await tools.get("finish")?.execute("fake", { handoff: value }, undefined, undefined, context);
	} else if (word === "compact") {
		await compact(rest[0] ?? "manual", rest[1] === "retry");
	} else if (word === "reload") {
		await reload();
	} else if (word === "new") {
		await newSession();
	} else if (word.startsWith("/")) {
		await commands.get(word.slice(1))?.handler(value, context);
	}
}
await answer({ reply, stopReason, errorMessage });
// Every run chained before the end, one that a hook started while agent_settled was emitted included, as Pi's
// `_startRun` awaits the settle and every run it deferred (`core/agent-session.js:738-760`, `:1528-1535`).
for (let last; last !== runs || reserved; ) {
	last = runs;
	await runs;
}
await fire("session_shutdown", { type: "session_shutdown", reason: "quit" });
record({ event: "exit", code });
process.stdout.write("", () => process.exit(code)); // a stdio pipe takes 8 KiB at once; exit after the rest

/**
 * The `compact` word, at the point where Pi 1.5.1 compacts for its reason. `manual` is Pi's `compact`: it aborts an
 * active run first, which ends aborted and does not go on, then compacts (`core/agent-session.js:2321-2327`,
 * `:2073-2084`). `threshold` during the task's run compacts before its next assistant response, in that call's
 * preparation (`:477-486`, `:594-595`); otherwise `threshold` and `overflow` compact when the next run ends, between
 * its `agent_end` and `agent_settled` (`:1623`); `retry` gives an `overflow` Pi's `willRetry: true`. The fake's answers
 * never fail, so the turn that Pi retries after an overflow error (`:2558-2568`) is not modelled.
 */
async function compact(reason, retry) {
	if (reason === "manual") {
		await abort();
		await compacted({ reason, willRetry: false });
	} else if (reason === "threshold" && taskActive) {
		beforeTurn = { reason, willRetry: false };
	} else {
		afterRun = { reason, willRetry: reason === "overflow" && retry };
	}
}
async function compactBeforeTurn() {
	const asked = beforeTurn;
	beforeTurn = undefined;
	if (asked !== undefined) {
		await compacted(asked);
	}
}
/** The compaction a run makes between its `agent_end` and `agent_settled`, when one was asked for. */
async function compactAfterRun() {
	const asked = afterRun;
	afterRun = undefined;
	if (asked !== undefined && !aborting) {
		await compacted(asked);
	}
}
/**
 * One Pi compaction (`core/agent-session.js:2682-2705`): the compaction entry, the context rebuilt from it, then
 * `session_compact` with Pi's payload, before the next model call. The bridge marks its session for a rebuild, and a
 * query that waits on a tool result restarts (E-13, src/runtime/bridge-view.ts).
 */
async function compacted({ reason, willRetry }) {
	const compactionEntry = session.compact(`The fake engine's summary of ${session.messages().length} messages.`);
	cursor = historyReplaced(cursor);
	await fire("session_compact", { type: "session_compact", compactionEntry, fromExtension: false, reason, willRetry });
}
/**
 * Pi's `/reload` (`core/agent-session.js:3094-3134`): the session and its history stay; the extensions load again. A
 * reload while a run is active is refused, as Pi refuses it while streaming (`:3095-3097`).
 */
async function reload() {
	if (reserved) {
		console.error("Wait for the current response to finish before reloading.");
		return;
	}
	await fire("session_shutdown", { type: "session_shutdown", reason: "reload" });
	await loadExtensions();
	await fire("session_start", { type: "session_start", reason: "reload" });
}
/**
 * Pi's `/new` (`core/agent-session-runtime.js:147-166`): a new session file and id, no history, the extensions again.
 * An active run is aborted first, so that its aborted turn stays in the session it ends (`:102-113`).
 */
async function newSession() {
	await abort();
	const previousSessionFile = context.sessionManager.getSessionFile();
	sessions += 1;
	const file = transcript(false, sessions);
	await fire("session_shutdown", { type: "session_shutdown", reason: "new", targetSessionFile: file });
	sessionId = randomUUID();
	session = new FakeSession({ file, id: sessionId, cwd, ...route });
	cursor = undefined;
	await loadExtensions();
	await fire("session_start", { type: "session_start", reason: "new", previousSessionFile });
}
/**
 * Pi's `abort` (`core/agent-session.js:2073-2084`): every call that waits for its answer ends aborted, the active run
 * stops, and the session is idle again before it returns.
 */
async function abort() {
	if (!reserved) {
		return;
	}
	aborting = true;
	decided?.();
	await idle();
	aborting = false;
}
