#!/usr/bin/env node
// The one fake pi. It loads the real hook extensions Limen passes, runs the task text as a script, and records
// what it saw in the record dir (the parent of --session-dir, so a job's own dir). Script lines:
//   commit · fail <code> · error [<text>] (assistant stop reason "error", with <text> as its errorMessage, as the
//   bridge gives a provider's limit text, E-9) · say <text> · tool <command> · block · orphan · finish <handoff, \n ends
//   a line>
//   · idle (a bash tool whose one child waits without CPU) · deaf (ignores SIGTERM from then on)
//   · tools-on-term <n> (ignores the next SIGTERM and starts n bash tools on it, as an engine that works on in a grace)
//   · die <SIGNAL> (ends this process by that signal, as the kernel's OOM killer ends one by SIGKILL)
//   · rate-limit <type> <resetAtMs> (emits the bridge's `kendex:rate-limit` on `pi.events`, E-9)
//   · malformed <event> (sends the hooks <event> with an empty payload, as a Pi of another shape would)
//   · linger (starts a child that holds this engine's stdout and stderr, so the engine exits before its pipes close)
//   · /<command> <args> (runs a command a hook registered, as a user typing it)
// A SIGTERM ends it as Pi's print mode does (E-17): one `sigterm` event, then exit 143; a second one exits 143 at once.
// A hook's handler that throws is reported on stderr as Pi reports an extension error, and the run goes on.
// `block` writes fake-blocked-<n> and waits for one write to the FIFO fake-gate. Records: fake-argv.json, fake-env.json
// (variable names), fake-task.txt, fake-system.txt (system prompt after before_agent_start), fake-context.txt (the hidden
// context messages before_agent_start returned), fake-events.jsonl (its first event the `pid` of this engine process,
// so a test can tell whether the engine still runs), and one transcript line per engine process in --session-dir.
import { execFileSync, spawn } from "node:child_process";
import { appendFileSync, constants, existsSync, mkdirSync, openSync, readFileSync, writeFileSync } from "node:fs";
import { Socket } from "node:net";
import { dirname, join } from "node:path";

const args = process.argv.slice(2);
if (args[0] === "--version") {
	process.exit(console.log("0.0.0-test") ?? 0);
}
const flag = (name) => (args.includes(name) ? args[args.indexOf(name) + 1] : undefined);
const dir = dirname(flag("--session-dir") ?? join(process.cwd(), "session"));
const prompt = args.find((value) => value.startsWith("@"));
const task = prompt ? readFileSync(prompt.slice(1), "utf8") : (flag("--continue") ?? "");
const preamble = flag("--append-system-prompt") ?? "";
mkdirSync(dir, { recursive: true });
writeFileSync(join(dir, "fake-argv.json"), JSON.stringify(args));
const names = Object.keys(process.env).filter((name) => /^(LIMEN|HERDR|PI)_/.test(name));
writeFileSync(join(dir, "fake-env.json"), JSON.stringify(names.sort()));
writeFileSync(join(dir, "fake-task.txt"), task);
if (flag("--session-dir")) {
	mkdirSync(flag("--session-dir"), { recursive: true });
	appendFileSync(join(flag("--session-dir"), "fake.jsonl"), `${JSON.stringify({ task })}\n`);
}
const record = (entry) => appendFileSync(join(dir, "fake-events.jsonl"), `${JSON.stringify(entry)}\n`);
record({ event: "pid", pid: process.pid });
const emit = (event) => console.log(JSON.stringify(event));
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
const queued = [];
let idle = true;
let turns = Promise.resolve();
// The extension whose factory runs now: Pi names it in the error of each handler it registered.
let loading = "";
// Pi's runner catches a handler's error, and its print mode writes `Extension error (<path>): <message>` to stderr;
// the event goes on to the next handler, and the handler's result is dropped (R-017).
const fire = async (event, payload) => {
	const results = [];
	for (const { handler, path } of handlers.get(event) ?? []) {
		try {
			results.push(await handler(payload, context));
		} catch (error) {
			console.error(`Extension error (${path}): ${error instanceof Error ? error.message : String(error)}`);
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
			console.error(`Event handler error (${channel}):`, error instanceof Error ? error.message : String(error));
		}
	}
};
const toast = (method) => (text) => method === "notify" && record({ event: "notify", text });
const ui = new Proxy({}, { get: (_, method) => (method === "then" ? undefined : toast(method)) });
const context = {
	cwd: process.cwd(),
	ui,
	isIdle: () => idle,
	// Pi ends the session after the current turn; the fake ends when its script does.
	shutdown: () => {},
	sessionManager: {
		getSessionId: () => process.env.PI_SESSION_ID ?? "fake",
		getSessionFile: () => join(dir, "session.jsonl"),
		getSessionName: () => "fake",
	},
};
// A steer joins the running turn. Other messages queue; every message queued before a turn starts enters that turn,
// and the turn gets one assistant reply, as Pi does with followUpMode "all". A message queued while a run is busy
// enters that run's next turn, and the run settles once, when none is left: Pi takes follow-ups when the agent would
// stop and emits agent_settled after the run (E-16). A hook's sendMessage enters as role custom.
const deliver = (kind, text, as) => {
	record({ event: as ?? kind, text });
	if (as === "steer") {
		return;
	}
	queued.push({ role: kind === "message" ? "custom" : "user", content: [{ type: "text", text }] });
	if (queued.length === 1) {
		turns = turns.then(() => run(queued.splice(0), "ok"));
	}
};
const api = {
	on: (event, handler) => handlers.set(event, [...(handlers.get(event) ?? []), { handler, path: loading }]),
	registerTool: (tool) => tools.set(tool.name, tool),
	registerCommand: (name, command) => commands.set(name, command),
	sendUserMessage: (text, options) => deliver("user", text, options?.deliverAs),
	sendMessage: (message, options) => deliver("message", message.content, options?.deliverAs),
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
/** One run: a turn for `messages`, then a turn for each batch that queued meanwhile; it settles once none is left. */
async function run(messages, reply, stopReason, errorMessage) {
	// The batch was queued during an earlier run, which took it, so this run has nothing to do.
	if (messages.length === 0) {
		return;
	}
	idle = false;
	await turn(messages, reply, stopReason, errorMessage);
	while (queued.length > 0) {
		await turn(queued.splice(0), "ok");
	}
	idle = true;
	await fire("agent_settled", {});
}
async function turn(messages, reply, stopReason, errorMessage) {
	for (const message of messages) {
		await fire("message_start", { message });
		await fire("message_end", { message });
	}
	await fire("turn_start", {});
	// Pi hands the hooks the turn's messages in a context event before each model call.
	await fire("context", { messages });
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
	await fire("message_end", { message: assistant });
	await fire("turn_end", {});
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

for (let index = args.indexOf("--extension"); index >= 0; index = args.indexOf("--extension", index + 1)) {
	loading = args[index + 1];
	await (await import(loading)).default(api);
}
loading = "";
await fire("session_start", {});
const started = await fire("before_agent_start", { prompt: task, systemPrompt: preamble });
writeFileSync(join(dir, "fake-system.txt"), started.map((result) => result?.systemPrompt ?? "").join("\n"));
writeFileSync(join(dir, "fake-context.txt"), started.map((result) => result?.message?.content ?? "").join("\n"));
emit({ type: "agent_start" });
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
		emit({ type: "tool_execution_start", toolName: "bash", args: { command: value } });
		await fire("tool_execution_start", { toolName: "bash", args: { command: value } });
		emit({ type: "tool_execution_end", toolName: "bash" });
		await fire("tool_execution_end", { toolName: "bash" });
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
	} else if (word === "orphan") {
		const child = spawn(process.execPath, ["-e", "setInterval(() => {}, 1e9)"], { detached: true, stdio: "ignore" });
		child.unref();
		writeFileSync(join(dir, "fake-orphan"), String(child.pid));
	} else if (word === "finish") {
		await tools.get("finish")?.execute("fake", { handoff: value }, undefined, undefined, context);
	} else if (word.startsWith("/")) {
		await commands.get(word.slice(1))?.handler(value, context);
	}
}
turns = turns.then(() =>
	run([{ role: "user", content: [{ type: "text", text: task }] }], reply, stopReason, errorMessage),
);
await turns;
await fire("session_shutdown", {});
record({ event: "exit", code });
process.stdout.write("", () => process.exit(code)); // a stdio pipe takes 8 KiB at once; exit after the rest
