// hook/communication.ts: the context message it sends, the turn cue it returns, the reminders in a tool result.
import assert from "node:assert/strict";
import childProcess from "node:child_process";
import { existsSync } from "node:fs";
import { appendFile, mkdir, mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { syncBuiltinESMExports } from "node:module";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test, { type TestContext } from "node:test";
import { fileURLToPath } from "node:url";
import limenCommunication from "../../hook/communication.ts";
import { LimenError } from "../../src/outcome.ts";
import { contextMessage, markdownSection } from "../../src/runtime/context-message.ts";
import { resolvePreamble } from "../../src/runtime/roles.ts";
import { inTemporaryProject } from "../environment.ts";
import { writeRecord } from "../plant.ts";

const JOB_ID = "2026-11-19-context-tools-1a2b3c4d";
const PACKAGE = fileURLToPath(new URL("../..", import.meta.url));

type Env = Readonly<Record<string, string | undefined>>;

/** Sets each variable, or removes it when its value is undefined. */
function assign(values: Env): void {
	for (const [name, value] of Object.entries(values)) {
		if (value === undefined) {
			delete process.env[name];
		} else {
			process.env[name] = value;
		}
	}
}

/** Sets or removes each variable of `values` for the test `t`, and gives each its earlier value after it. */
function environment(t: TestContext, values: Env): void {
	const old: Env = Object.fromEntries(Object.keys(values).map((name) => [name, process.env[name]]));
	t.after(() => assign(old));
	assign(values);
}

/** The variables of a coordinator's session: no job, in test mode, with the seat folder at `home`. */
const coordinatorSession = (home: string): Env => ({
	LIMEN_JOB: undefined,
	LIMEN_JOB_ID: undefined,
	LIMEN_CONTEXT_ROOT: undefined,
	LIMEN_TEST_MODE: "1",
	LIMEN_HOME: home,
});

/** The variables of the session of the job `JOB_ID` of the project `project`. */
const jobSession = (project: string, home: string): Env => ({
	LIMEN_JOB: "1",
	LIMEN_JOB_ID: JOB_ID,
	LIMEN_CONTEXT_ROOT: project,
	LIMEN_TEST_MODE: "1",
	LIMEN_HOME: home,
});

/**
 * A temporary project with one job folder, an empty home, and a folder that holds a `jg` which names itself Jevgrep,
 * exits 0 and writes a marker file each time it runs.
 */
async function fixture(t: TestContext) {
	const dir = await mkdtemp(join(tmpdir(), "limen-context-tools-"));
	t.after(() => rm(dir, { recursive: true, force: true }));
	const project = join(dir, "project");
	const bin = join(dir, "bin");
	const home = join(dir, "home");
	const marker = join(dir, "jg-ran");
	const job = join(project, ".limen/jobs", JOB_ID);
	await Promise.all([mkdir(job, { recursive: true }), mkdir(bin), mkdir(home)]);
	await writeFile(join(job, "task.md"), "Implement the ticket.\n");
	const jg = `#!/bin/sh\n: > ${JSON.stringify(marker)}\necho "Jevgrep: search source by question"\nexit 0\n`;
	await writeFile(join(bin, "jg"), jg, { mode: 0o755 });
	return { project, bin, home, marker, job };
}

/** A custom message the hook sent or a handler returned: its type, its content and whether the chat shows it. */
type Message = { readonly customType: string; readonly content: string; readonly display: boolean };
/** One message the hook sent, with the options of its send. */
type Sent = Message & { readonly options: unknown };

/** The payload of a run's start from a prompt, as Pi gives it to `before_agent_start`. */
const PROMPT = { type: "before_agent_start", prompt: "Hello.", systemPrompt: "Base prompt." };

/**
 * A fresh copy of the hook on a fake `pi`: the messages it sent, its handlers of each event in the order it registered
 * them, a call of the one handler of an event, and a run's start, which calls every `before_agent_start` handler in
 * that order and gives what each returned, as Pi collects them (core/extensions/runner.js:1137-1153).
 */
function loadHook() {
	const handlers = new Map<string, unknown[]>();
	const sent: Sent[] = [];
	limenCommunication({
		on: (name: string, handler: unknown) => handlers.set(name, [...(handlers.get(name) ?? []), handler]),
		sendMessage: (message, options) => {
			sent.push({ ...message, options });
		},
	});
	const fire = (name: string, event: unknown, context: unknown): unknown => {
		const [handler, ...more] = handlers.get(name) ?? [];
		assert.ok(typeof handler === "function", `the hook handles ${name}`);
		assert.equal(more.length, 0, `the hook handles ${name} once`);
		return handler(event, context);
	};
	const fireEach = (name: string, event: unknown, context: unknown): Promise<unknown[]> =>
		Promise.all(
			(handlers.get(name) ?? []).map((handler) => {
				assert.ok(typeof handler === "function", `a handler of ${name}`);
				return handler(event, context);
			}),
		);
	const start = (context: unknown, event: unknown = PROMPT): Promise<unknown[]> =>
		fireEach("before_agent_start", event, context);
	return { handlers, sent, fire, fireEach, start };
}

/** The messages a run's `before_agent_start` handlers returned, in their order: each result's `message`. */
function messagesOf(results: readonly unknown[]): Message[] {
	return results.flatMap((result) => {
		const message = typeof result === "object" && result !== null ? Reflect.get(result, "message") : undefined;
		if (typeof message !== "object" || message === null) {
			return [];
		}
		const [customType, content, display] = ["customType", "content", "display"].map((name) =>
			Reflect.get(message, name),
		);
		return [{ customType: String(customType), content: String(content), display: display === true }];
	});
}

/** A session's context in `cwd` whose compaction-aware entries are those `entries` holds when Pi asks. */
function sessionContext(cwd: string, entries: () => readonly object[]) {
	return { cwd, sessionManager: { getSessionId: () => "session-1", buildContextEntries: entries } };
}

/** The entry of a context message as Pi's session holds it (E-16). */
const held = (content: string) => ({ type: "custom_message", customType: "limen-context", content, display: false });
/** The entry that replaced the summarised part of a session in its compaction-aware context. */
const COMPACTION = { type: "compaction", summary: "The summary.", firstKeptEntryId: "a1", tokensBefore: 0 };
const START = { type: "session_start", reason: "startup" };
/** A compaction's payload; `willRetry` true only for an overflow whose turn Pi retries. */
const compact = (reason: string, willRetry = false) => ({
	type: "session_compact",
	compactionEntry: COMPACTION,
	fromExtension: false,
	reason,
	willRetry,
});

// D-114 (1): appended while the session is idle, before its first prompt, the message starts no turn.
test("D-114 (1): a coordinator's session_start sends one hidden limen-context message, its context message, with no options", async (t) => {
	const { project, home } = await fixture(t);
	environment(t, coordinatorSession(home));
	const hook = loadHook();
	hook.fire(
		"session_start",
		START,
		sessionContext(project, () => []),
	);
	assert.deepEqual(hook.sent, [
		{
			customType: "limen-context",
			content: contextMessage(project, { session: "coordinator" }),
			display: false,
			options: undefined,
		},
	]);
});

// A-079: a job's message is the one its publication saved, not one built again from files that may have changed.
test("a job's session_start sends the context.md of its folder byte for byte", async (t) => {
	const { project, home, job } = await fixture(t);
	environment(t, jobSession(project, home));
	await writeFile(join(job, "context.md"), '<limen-context role="worker">\n\nsaved bytes\n\n</limen-context>');
	const hook = loadHook();
	hook.fire(
		"session_start",
		START,
		sessionContext(project, () => []),
	);
	assert.deepEqual(
		hook.sent.map(({ content, options }) => [content, options]),
		[['<limen-context role="worker">\n\nsaved bytes\n\n</limen-context>', undefined]],
	);
});

/** A payload of each event the hook handles, as Pi gives it. */
const PAYLOADS: Readonly<Record<string, unknown>> = {
	before_agent_start: PROMPT,
	message_end: { type: "message_end", message: { role: "assistant", content: [], stopReason: "stop" } },
	session_start: START,
	session_compact: compact("manual"),
	tool_result: { type: "tool_result", toolName: "read", input: {}, content: [], isError: false },
	agent_start: { type: "agent_start" },
	agent_end: { type: "agent_end", messages: [] },
	agent_settled: { type: "agent_settled", aborted: false },
};

// A-086, E-1: the bridge drops Pi's system prompt, so a text the hook put there would reach no model.
test("A-086: no handler of the hook returns a systemPrompt", async (t) => {
	const { project, home } = await fixture(t);
	environment(t, coordinatorSession(home));
	const hook = loadHook();
	const context = sessionContext(project, () => []);
	const results = await Promise.all(
		[...hook.handlers.keys()].map(async (name) => {
			assert.ok(Object.hasOwn(PAYLOADS, name), `a payload of ${name}`);
			return (await hook.fireEach(name, PAYLOADS[name], context)).map((result) => [name, result] as const);
		}),
	);
	assert.deepEqual(
		results.flat().filter(([, result]) => typeof result === "object" && result !== null && "systemPrompt" in result),
		[],
	);
});

// Step 0.3's /reload and a continued job: the session holds its message already, and those are its frozen bytes.
test("a session_start whose context holds a context message sends none, and a compaction later sends that message's bytes", async (t) => {
	const { project, home } = await fixture(t);
	environment(t, coordinatorSession(home));
	const hook = loadHook();
	let entries: readonly object[] = [held("held bytes"), { type: "message" }];
	const context = sessionContext(project, () => entries);
	hook.fire("session_start", { type: "session_start", reason: "reload" }, context);
	const atStart = hook.sent.length;
	entries = [COMPACTION, { type: "message" }];
	hook.fire("session_compact", compact("manual"), context);
	assert.deepEqual([atStart, hook.sent.map(({ content }) => content)], [0, ["held bytes"]]);
});

/** A coordinator's hook that sent its context message at its start, and whose next compaction summarises it. */
async function startedHook(t: TestContext) {
	const { project, home } = await fixture(t);
	environment(t, coordinatorSession(home));
	const hook = loadHook();
	let entries: readonly object[] = [];
	const context = sessionContext(project, () => entries);
	hook.fire("session_start", START, context);
	const [sent] = hook.sent.splice(0);
	entries = [COMPACTION, { type: "message" }];
	return { hook, context, bytes: sent?.content, keep: (more: readonly object[]) => (entries = more) };
}

// E-13: after a run's agent_end Pi's default steer starts an extra turn; triggerTurn false holds it to the run's end.
test("E-13: a session_compact between agent_end and agent_settled that summarised the message sends it again with triggerTurn false", async (t) => {
	const { hook, context, bytes } = await startedHook(t);
	hook.fire("agent_start", PAYLOADS.agent_start, context);
	hook.fire("agent_end", PAYLOADS.agent_end, context);
	hook.fire("session_compact", compact("threshold"), context);
	assert.deepEqual(
		hook.sent.map(({ content, options }) => [content, options]),
		[[bytes, { triggerTurn: false }]],
	);
});

// E-13: outside a run's end, the default steer lands in the next request, and while idle Pi appends it at once.
test("E-13: a session_compact after the run settled, as a manual /compact, sends the message again with no options", async (t) => {
	const { hook, context, bytes } = await startedHook(t);
	hook.fire("agent_start", PAYLOADS.agent_start, context);
	hook.fire("agent_end", PAYLOADS.agent_end, context);
	hook.fire("agent_settled", PAYLOADS.agent_settled, context);
	hook.fire("session_compact", compact("manual"), context);
	assert.deepEqual(
		hook.sent.map(({ content, options }) => [content, options]),
		[[bytes, undefined]],
	);
});

// E-13, bridge-5.0.3.md §9: Pi retries the turn an overflow ended, so the default steer joins that retried request.
test("E-13: a session_compact after agent_end that Pi retries sends the message again with no options", async (t) => {
	const { hook, context, bytes } = await startedHook(t);
	hook.fire("agent_start", PAYLOADS.agent_start, context);
	hook.fire("agent_end", PAYLOADS.agent_end, context);
	hook.fire("session_compact", compact("overflow", true), context);
	assert.deepEqual(
		hook.sent.map(({ content, options }) => [content, options]),
		[[bytes, undefined]],
	);
});

// Pi continues a run with its queued messages in a new agent loop (core/agent-session.js `_startRun`), whose own
// compaction before a turn lands its steer in that turn's request.
test("E-13: a session_compact in a later agent loop of the run, after its agent_start, sends the message again with no options", async (t) => {
	const { hook, context, bytes } = await startedHook(t);
	hook.fire("agent_start", PAYLOADS.agent_start, context);
	hook.fire("agent_end", PAYLOADS.agent_end, context);
	hook.fire("agent_start", PAYLOADS.agent_start, context);
	hook.fire("session_compact", compact("threshold"), context);
	assert.deepEqual(
		hook.sent.map(({ content, options }) => [content, options]),
		[[bytes, undefined]],
	);
});

// Pi keeps the entries after the cut, so a message sent again after an earlier compaction can still be in the context.
test("a session_compact whose compacted context still holds the context message sends none", async (t) => {
	const { hook, context, bytes, keep } = await startedHook(t);
	keep([COMPACTION, held(bytes ?? ""), { type: "message" }]);
	hook.fire("session_compact", compact("threshold"), context);
	assert.deepEqual(
		{ startedWith: typeof bytes, afterCompaction: hook.sent },
		{ startedWith: "string", afterCompaction: [] },
	);
});

// T-32 (4): a guard refuses a payload of the wrong shape instead of skipping it, also while the hook has no message to
// send yet. Outside a job the refusal is kept in the working directory's project, so the test runs in one of its own.
test("BAD_DATA: a session_compact without willRetry before any session_start is refused, naming the field", async (t) => {
	const { home } = await fixture(t);
	environment(t, coordinatorSession(home));
	const project = await inTemporaryProject(t, "limen-context-compact-");
	const hook = loadHook();
	const payload = { type: "session_compact", compactionEntry: COMPACTION, fromExtension: false, reason: "manual" };
	const context = sessionContext(project, () => []);
	await assert.rejects(
		async () => hook.fire("session_compact", payload, context),
		(error) => error instanceof LimenError && error.code === "BAD_DATA" && error.message.includes("willRetry"),
	);
});

/** The `before_agent_start` results of a fresh copy of the hook, whose session holds no entry yet. */
function sessionStart(project: string): Promise<unknown[]> {
	return loadHook().start(sessionContext(project, () => []));
}

/**
 * The session start with PATH unchanged and with the `jg` folder first on PATH, and whether that `jg` ran. Every
 * variable the hook reads for the session's kind is set or cleared, and all of them are restored after the test.
 */
async function startWithAndWithoutJg(t: TestContext, job: boolean) {
	const { project, bin, home, marker } = await fixture(t);
	environment(t, { ...(job ? jobSession(project, home) : coordinatorSession(home)), PATH: process.env.PATH });
	const plain = await sessionStart(project);
	process.env.PATH = `${bin}:${process.env.PATH ?? ""}`;
	const withJg = await sessionStart(project);
	return { plain, withJg, ran: existsSync(marker) };
}

test("T-36: a coordinator session starts with the same context with and without a jg on PATH, and the hook never runs it", async (t) => {
	const { plain, withJg, ran } = await startWithAndWithoutJg(t, false);
	assert.deepEqual([withJg, ran], [plain, false]);
});

test("T-36: a job session starts with the same context with and without a jg on PATH, and the hook never runs it", async (t) => {
	const { plain, withJg, ran } = await startWithAndWithoutJg(t, true);
	assert.deepEqual([withJg, ran], [plain, false]);
});

/** The text of the turn cue among a run's `before_agent_start` results; "" when none returned one. */
function cueText(results: readonly unknown[]): string {
	return messagesOf(results).find(({ customType }) => customType === "limen-turn-cue")?.content ?? "";
}

/** A project register of the kind R-040 stops reading, with its own Specs and cue sections. */
const PROJECT_REGISTER = [
	"# Communication",
	"",
	"## Specs",
	"",
	"project-specs-marker",
	"",
	"## Cue: Shared",
	"",
	"project-cue-marker",
	"",
].join("\n");

// A-042: drift tracking is cut, so a project's copy of a Limen text adds no advisory to any turn.
test("a coordinator's turn cue holds no Guidance drift block when the project holds a changed register", async (t) => {
	const { project, home } = await fixture(t);
	await mkdir(join(project, ".agents/limen"), { recursive: true });
	await writeFile(join(project, ".agents/limen/communication.md"), PROJECT_REGISTER);
	environment(t, coordinatorSession(home));
	const cue = cueText(await sessionStart(project));
	assert.deepEqual([cue.includes("<limen-turn-cue>"), cue.includes("Guidance drift")], [true, false]);
});

// A-039: the cue's lines are the hook's and the package's, which no project file replaces.
test("A-039: a register the project holds leaves the coordinator's turn cue unchanged", async (t) => {
	const { project, home } = await fixture(t);
	environment(t, coordinatorSession(home));
	const plain = cueText(await sessionStart(project));
	await mkdir(join(project, ".agents/limen"), { recursive: true });
	await writeFile(join(project, ".agents/limen/communication.md"), PROJECT_REGISTER);
	assert.equal(cueText(await sessionStart(project)), plain);
});

/** The capability frame's one-sentence anchor, the turn cue's last line (A-043). */
async function anchor(): Promise<string> {
	const section = markdownSection(await readFile(join(PACKAGE, "templates/capability.md"), "utf8"), "Cue");
	return section.split("\n").slice(1).join("\n").trim();
}

/** The coordinator's audience line and a job's, which carry the language of the reply (T-13). */
const OWNER_AUDIENCE = "Audience: owner. Answer in the language of the owner's last message.";
const AGENT_AUDIENCE = "Audience: agent. Plain technical English.";
/** The ticket a job's task names, which its cue repeats. */
const TICKET = "spec/features/active/F001-demo/ticket.md";

/** The turn cue that holds `lines` and then the anchor, in its tag pair, one line each. */
async function expectedCue(lines: readonly string[]): Promise<string> {
	return ["<limen-turn-cue>", ...lines, await anchor(), "</limen-turn-cue>"].join("\n");
}

// A-077: the standing text is in the context message, so a cue with nothing new is the audience line and the anchor.
test("A-077: a coordinator's turn cue with no variable line is its audience line and the frame's anchor", async (t) => {
	const { project, home } = await fixture(t);
	environment(t, coordinatorSession(home));
	assert.equal(cueText(await sessionStart(project)), await expectedCue([OWNER_AUDIENCE]));
});

test("A-077: a job's turn cue is its audience line, the ticket line of its task and the frame's anchor", async (t) => {
	const { project, home, job } = await fixture(t);
	await writeFile(join(job, "task.md"), `Implement the ticket.\n\nTicket: ${TICKET}\n`);
	environment(t, jobSession(project, home));
	assert.equal(cueText(await sessionStart(project)), await expectedCue([AGENT_AUDIENCE, `Ticket: ${TICKET}`]));
});

// D-134 (2): the line states the fact alone; what to do after a failed turn is the owner register's.
test("D-134: the cue after a turn that ended in error says it failed with its reason, and the cue after that does not", async (t) => {
	const { project, home } = await fixture(t);
	environment(t, coordinatorSession(home));
	const hook = loadHook();
	const failed = { role: "assistant", content: [], stopReason: "error", errorMessage: "provider overloaded" };
	hook.fire("message_end", { type: "message_end", message: failed }, { cwd: project });
	const context = sessionContext(project, () => []);
	const cues = [cueText(await hook.start(context)), cueText(await hook.start(context))];
	assert.deepEqual(cues, [
		await expectedCue([OWNER_AUDIENCE, "Last turn failed (error: provider overloaded)."]),
		await expectedCue([OWNER_AUDIENCE]),
	]);
});

// A-077: the wake's section of the cue went; a wake is told apart by its own text (R-051), not by the cue.
test("A-077: a wake prompt gets the same turn cue as an owner prompt", async (t) => {
	const { project, home } = await fixture(t);
	environment(t, coordinatorSession(home));
	const wake = { type: "before_agent_start", prompt: "Limen job 2026-11-19-x-1a2b3c4d ended.", systemPrompt: "Base." };
	const context = sessionContext(project, () => []);
	assert.equal(cueText(await loadHook().start(context, wake)), cueText(await sessionStart(project)));
});

// T-13: the coordinator answers in the owner's language, so its cue names no fixed language; agents write English.
test('T-13: the coordinator\'s turn cue holds no "English", and a job\'s holds "Plain technical English."', async (t) => {
	const { project, home } = await fixture(t);
	environment(t, coordinatorSession(home));
	const owner = cueText(await sessionStart(project));
	// The job's variables name the same variables as the coordinator's, which the test gives back after it.
	assign(jobSession(project, home));
	const agent = cueText(await sessionStart(project));
	assert.deepEqual([owner.includes("English"), agent.includes("Plain technical English.")], [false, true]);
});

test("D-134: the turn cue is a hidden custom message of type limen-turn-cue", async (t) => {
	const { project, home } = await fixture(t);
	environment(t, coordinatorSession(home));
	const [cue] = messagesOf(await sessionStart(project));
	assert.deepEqual([cue?.customType, cue?.display], ["limen-turn-cue", false]);
});

// D-134 (3): a job's message points at the vision, and every job role's text forbids board edits.
test("D-134: a job's turn cue names neither the vision nor the board of a project that holds both", async (t) => {
	const { project, home } = await fixture(t);
	await vision(project);
	await writeFile(join(project, "spec", "build.md"), "# Build\n");
	environment(t, jobSession(project, home));
	const cue = cueText(await sessionStart(project));
	assert.deepEqual([cue.includes("spec/vision.md"), cue.includes("spec/build.md")], [false, false]);
});

/** A tool result as Pi gives it to the handlers: of the tool `toolName` called with `input`, with `fields` over it. */
const toolResult = (toolName: string, input: object, fields: object = {}) => ({
	type: "tool_result",
	toolCallId: "call-1",
	toolName,
	input,
	content: [{ type: "text", text: "Done." }],
	isError: false,
	...fields,
});

/** The text parts of a tool_result handler's result, joined; "" when the hook left the result as it was. */
function resultText(result: unknown): string {
	const content = typeof result === "object" && result !== null ? Reflect.get(result, "content") : undefined;
	const parts: readonly unknown[] = Array.isArray(content) ? content : [];
	return parts
		.map((part) => (typeof part === "object" && part !== null ? Reflect.get(part, "text") : undefined))
		.filter((text) => typeof text === "string")
		.join("\n");
}

/** The package's specs register as the reminder appends it: the `## Specs` section. */
async function specsSection(): Promise<string> {
	return markdownSection(await readFile(join(PACKAGE, "templates/registers/specs.md"), "utf8"), "Specs");
}

// A-039: the specs reminder holds the package's specs register, the text every role's message holds, never a project's.
test("A-039: after a write under spec/ the reminder holds the package's Specs section, not the project register's", async (t) => {
	const { project, home } = await fixture(t);
	await mkdir(join(project, ".agents/limen"), { recursive: true });
	await writeFile(join(project, ".agents/limen/communication.md"), PROJECT_REGISTER);
	environment(t, coordinatorSession(home));
	const write = toolResult("write", { path: "spec/features/planned/F001-demo/ticket.md" });
	const text = resultText(loadHook().fire("tool_result", write, { cwd: project }));
	assert.deepEqual([text.includes(await specsSection()), text.includes("project-specs-marker")], [true, false]);
});

/** A planned ticket, whose edit brings the vision (H-12). */
const PLANNED = "spec/features/planned/F001-x/ticket.md";
const VISION_MARKER = "vision-marker";
/** The vision reminder of the vision `vision` writes: its header line, then the file's text. */
const VISION_REMINDER = `[limen] Vision (spec/vision.md lines 1-3): check this edit against it.\n# Vision\n\n${VISION_MARKER}`;

/** Writes the project's vision: `# Vision`, a blank line, then `lines`, or the marker line alone. */
async function vision(project: string, lines: readonly string[] = [VISION_MARKER]): Promise<void> {
	await mkdir(join(project, "spec"), { recursive: true });
	await writeFile(join(project, "spec", "vision.md"), ["# Vision", "", ...lines, ""].join("\n"));
}

/** A coordinator's hook in a project that holds a vision: its tool_result handler on a result of `toolName`. */
async function coordinatorWithVision(t: TestContext) {
	const { project, home } = await fixture(t);
	await vision(project);
	environment(t, coordinatorSession(home));
	const hook = loadHook();
	const tool = (toolName: string, input: object, fields: object = {}) =>
		hook.fire("tool_result", toolResult(toolName, input, fields), { cwd: project });
	return { hook, project, tool };
}

// A-041, H-12: the vision comes where a ticket is written, as its text with no read to make, not after the job started.
test("H-12: an edit and a write of a planned ticket in a coordinator each append the vision's text after its header", async (t) => {
	const edited = await coordinatorWithVision(t);
	const written = await coordinatorWithVision(t);
	assert.deepEqual(
		[edited.tool("edit", { path: PLANNED }), written.tool("write", { path: PLANNED })].map((result) =>
			resultText(result).endsWith(`\n\n${VISION_REMINDER}`),
		),
		[true, true],
	);
});

// A-041: both sessions get it; a job reads the vision where its context message reads the project's files, the root.
test("H-12: a job's edit of a planned ticket appends the vision of its project root, not of its worktree", async (t) => {
	const { project, home } = await fixture(t);
	await vision(project);
	const worktree = join(project, ".limen", "worktrees", "job");
	await vision(worktree, ["worktree-vision-marker"]);
	environment(t, jobSession(project, home));
	const text = resultText(loadHook().fire("tool_result", toolResult("edit", { path: PLANNED }), { cwd: worktree }));
	assert.deepEqual([text.endsWith(`\n\n${VISION_REMINDER}`), text.includes("worktree-vision-marker")], [true, false]);
});

// H-12: a job that writes a planned ticket whole gets the vision as one that edits it does.
test("H-12: a job's write of a planned ticket appends the vision's text after its header", async (t) => {
	const { project, home } = await fixture(t);
	await vision(project);
	environment(t, jobSession(project, home));
	const text = resultText(loadHook().fire("tool_result", toolResult("write", { path: PLANNED }), { cwd: project }));
	assert.equal(text.endsWith(`\n\n${VISION_REMINDER}`), true, text);
});

// H-12: `limen ticket new` writes spec/features/planned/FNNN-…/ticket.md unless the ticket starts active.
test("H-12: a Bash limen ticket new appends the vision, and one with --lane active appends none", async (t) => {
	const planned = await coordinatorWithVision(t);
	const active = await coordinatorWithVision(t);
	const command = (lane: string) => ({ command: `limen ticket new "Spawn names every missing route"${lane}` });
	assert.deepEqual(
		[resultText(planned.tool("bash", command(""))), active.tool("bash", command(" --lane active"))],
		[`Done.\n\n${VISION_REMINDER}`, undefined],
	);
});

// H-12: after a spawn the job has its task already, so the vision came too late to shape it.
test("H-12: the results of a Bash limen spawn and of a git merge in a coordinator get no vision", async (t) => {
	const { tool } = await coordinatorWithVision(t);
	assert.deepEqual(
		[tool("bash", { command: "limen spawn worker F001" }), tool("bash", { command: "git merge --ff-only main" })],
		[undefined, undefined],
	);
});

// AC-13: a limen command brings the vision only when it writes a ticket, whatever words its arguments hold.
test("H-12: a Bash limen spawn whose note names touch and a planned path gets no vision", async (t) => {
	const { tool } = await coordinatorWithVision(t);
	const command = 'limen spawn worker F001 --note "touch spec/features/planned/F001-x/ticket.md first"';
	assert.equal(tool("bash", { command }), undefined);
});

// H-12: only `limen` in command position runs Limen, so a path that ends in a folder named limen is no limen command.
test("H-12: a Bash git mv into a planned ticket with a -C path ending in limen appends the vision", async (t) => {
	const { tool } = await coordinatorWithVision(t);
	const command = "git -C /home/u/limen mv a.md spec/features/planned/F1-x/ticket.md";
	assert.equal(resultText(tool("bash", { command })), `Done.\n\n${VISION_REMINDER}`);
});

// A-041, z. 4: the appended text stays in the context until a compaction summarises it, so it comes once until then.
test("A-041: the vision comes once per context: a second planned ticket gets none until a compaction, then it comes again", async (t) => {
	const { hook, tool } = await coordinatorWithVision(t);
	const first = resultText(tool("edit", { path: PLANNED }));
	const second = tool("edit", { path: "spec/features/planned/F002-y/ticket.md" });
	hook.fire("session_compact", compact("manual"), {});
	const again = resultText(tool("edit", { path: "spec/features/planned/F002-y/ticket.md" }));
	assert.deepEqual([first.endsWith(VISION_REMINDER), second, again.endsWith(VISION_REMINDER)], [true, undefined, true]);
});

/** A styleguide with sections scoped by two folders and a language, under one that applies to every file. */
const STYLEGUIDE = "# S\n\n## `core/`\n\n1\n\n## `web/`\n\n2\n\n## Rust\n\n3\n";

/** A coordinator's hook in a project that holds `STYLEGUIDE`: the text its tool_result handler appends to an edit. */
async function styledEdits(t: TestContext) {
	const { project, home } = await fixture(t);
	await mkdir(join(project, ".agents/limen"), { recursive: true });
	await writeFile(join(project, ".agents/limen/styleguide.md"), STYLEGUIDE);
	environment(t, coordinatorSession(home));
	const hook = loadHook();
	return (path: string) => resultText(hook.fire("tool_result", toolResult("edit", { path }), { cwd: project }));
}

// A-041: the rules come as their text, so the model checks the edit against them with no read of its own.
test("A-041: a code edit appends the text of the styleguide sections that apply to its path and language, and asks for no read", async (t) => {
	const edit = await styledEdits(t);
	const header =
		"[limen] Styleguide (.agents/limen/styleguide.md lines 1-6, 11-13): check this edit against these rules.";
	assert.equal(edit("core/a.rs"), `Done.\n\n${header}\n# S\n\n## \`core/\`\n\n1\n\n## Rust\n\n3`);
});

// A-041: once per area is once per section, since a section's text stays in the context after it came once.
test("A-041: a later edit appends only the styleguide sections not yet appended, and none when every one was", async (t) => {
	const edit = await styledEdits(t);
	edit("core/a.rs");
	const header = "[limen] Styleguide (.agents/limen/styleguide.md lines 7-10): check this edit against these rules.";
	assert.deepEqual([edit("core/b.rs"), edit("web/x.ts")], ["", `Done.\n\n${header}\n## \`web/\`\n\n2`]);
});

/** The text a fresh hook appends to a write under spec/ in the project `project`, in the session the variables name. */
function specsWrite(project: string): string {
	const write = toolResult("write", { path: "spec/notes.md" });
	return resultText(loadHook().fire("tool_result", write, { cwd: project }));
}

// A-041: the register comes as its text, named as the context message names it (T-18).
test("A-041: the specs reminder holds the package's Specs section after its header line", async (t) => {
	const { project, home } = await fixture(t);
	environment(t, coordinatorSession(home));
	const text = specsWrite(project);
	const header = "Done.\n\n[limen] Specs (limen/templates/registers/specs.md lines 1-";
	const end = `): check this edit against these rules.\n${await specsSection()}`;
	assert.deepEqual([text.startsWith(header), text.endsWith(end)], [true, true], text);
});

/** The reminder of the picture module's specs file: its header line, then its text (R-044 Decision 19 F2). */
async function pictureSpecsReminder(): Promise<string> {
	const text = (await readFile(join(PACKAGE, "templates/modules/picture/specs.md"), "utf8")).trim();
	const header = `[limen] Picture module (limen/templates/modules/picture/specs.md lines 1-${text.split("\n").length})`;
	return `${header}: check this edit against these rules.\n${text}`;
}

// A-040, A-041: the context message holds an enabled module's specs file right after the register, so the reminder
// does too, once per context like the section; with the module off, as limen init leaves it, none.
test("A-041: with the picture module on the specs reminder appends its specs file after the Specs section, once per context, and with it off none", async (t) => {
	const { project, home } = await fixture(t);
	environment(t, coordinatorSession(home));
	const off = specsWrite(project);
	await mkdir(join(project, ".agents/limen"), { recursive: true });
	await writeFile(join(project, ".agents/limen/limits.json"), '{ "modules": { "picture": true } }\n');
	const hook = loadHook();
	const write = (path: string) => resultText(hook.fire("tool_result", toolResult("write", { path }), { cwd: project }));
	const [first, second] = [write("spec/notes.md"), write("spec/other.md")];
	const reminder = await pictureSpecsReminder();
	assert.deepEqual(
		[off.includes(reminder), first.endsWith(`${await specsSection()}\n\n${reminder}`), second.includes(reminder)],
		[false, true, false],
		first,
	);
});

// A-038: only the roles that write tickets hold the specs register in their message, so only they get it again.
test("A-038: the specs reminder reaches a coordinator and a keeper, whose context message holds the register, and no worker", async (t) => {
	const { project, home, job } = await fixture(t);
	environment(t, coordinatorSession(home));
	const coordinator = specsWrite(project);
	// The job's variables name the same variables as the coordinator's, which the test gives back after it.
	assign(jobSession(project, home));
	await writeRecord(job, { role: "keeper" });
	const keeper = specsWrite(project);
	await writeRecord(job, { role: "worker" });
	const worker = specsWrite(project);
	assert.deepEqual([coordinator.includes("[limen] Specs"), keeper.includes("[limen] Specs"), worker], [true, true, ""]);
});

// An error result changed nothing in the file, so the hook appends nothing, and the rules have not come yet.
test("an isError result gets nothing and leaves the vision to come, so the next successful edit gets it", async (t) => {
	const { tool } = await coordinatorWithVision(t);
	const failed = tool("edit", { path: PLANNED }, { isError: true });
	assert.deepEqual([failed, resultText(tool("edit", { path: PLANNED })).endsWith(VISION_REMINDER)], [undefined, true]);
});

// T-10: the appended text is bounded where it is made; its notice says how much was left out and where the whole is.
test("T-10: a vision over 1000 lines comes cut to 1000 lines, with the notice that names the file and its length", async (t) => {
	const { project, home } = await fixture(t);
	await vision(
		project,
		Array.from({ length: 1003 }, (_, index) => `line-${index + 3}`),
	);
	environment(t, coordinatorSession(home));
	const text = resultText(loadHook().fire("tool_result", toolResult("edit", { path: PLANNED }), { cwd: project }));
	const notice = "[spec/vision.md truncated to 1000 of 1005 lines; read the file for remaining context.]";
	assert.deepEqual(
		[text.includes("lines 1-1005): check"), text.endsWith(`line-1000\n\n${notice}`), text.includes("line-1001")],
		[true, true, false],
	);
});

// Pi drops a result's structured content when a handler replaces the content alone (Pi 1.5.1's
// core/extensions/types.d.ts:1129-1140).
test("a Bash result that brings the vision keeps its structuredContent", async (t) => {
	const { tool } = await coordinatorWithVision(t);
	const structured = { output: "", truncated: false, exit_code: 0, wall_time_seconds: 0 };
	const result = tool("bash", { command: "mkdir -p spec/features/planned/F002-y" }, { structuredContent: structured });
	const kept = typeof result === "object" && result !== null ? Reflect.get(result, "structuredContent") : undefined;
	assert.deepEqual(kept, structured);
});

// Change 2: the touch line "Last turn started or merged work." went with the spawn and merge trigger.
test("a Bash command that creates a planned ticket leaves no touch line in the next turn cue", async (t) => {
	const { hook, project } = await coordinatorWithVision(t);
	hook.fire("tool_result", toolResult("bash", { command: "mkdir -p spec/features/planned/F002-y" }), { cwd: project });
	const cue = cueText(await hook.start(sessionContext(project, () => [])));
	assert.deepEqual([cue.includes("<limen-turn-cue>"), cue.includes("Last turn")], [true, false]);
});

// A-010, R-102: a text that any process could set reached every coordinator's turn as an instruction, so the cue reads
// nothing of the seat folder's old `rules/`, which no code writes any more.
test("a coordinator's turn cue holds no seat-rules block when the seat folder holds a rules/ folder", async (t) => {
	const { project, home } = await fixture(t);
	const rule = {
		name: "week",
		text: "seat-rule-marker",
		until: "2999-01-01T00:00:00.000Z",
		setBy: "a job",
		setAt: "2026-11-24T14:10:00.000Z",
		version: "1",
	};
	await mkdir(join(home, ".limen", "rules", rule.name), { recursive: true });
	await writeFile(join(home, ".limen", "rules", rule.name, "rule.json"), JSON.stringify(rule));
	environment(t, coordinatorSession(home));
	const cue = JSON.stringify(messagesOf(await sessionStart(project)));
	assert.deepEqual(
		[cue.includes("<limen-turn-cue>"), cue.includes("Seat-wide rules"), cue.includes(rule.text)],
		[true, false, false],
	);
});

// A-044: a job's first prompt asked it to read or write its task note, which nothing measured.
test("a job's first before_agent_start message is the turn cue alone, the same as its next prompt's", async (t) => {
	const { project, home } = await fixture(t);
	environment(t, jobSession(project, home));
	const hook = loadHook();
	const context = sessionContext(project, () => [held(workerMessage(project))]);
	const [first, next] = [messagesOf(await hook.start(context)), messagesOf(await hook.start(context))];
	assert.deepEqual([first, first.map(({ content }) => content.endsWith("</limen-turn-cue>"))], [next, [true]]);
});

// A-044: the hook kept a job's first note as note.first.md and logged each change of note.md.
test("a job's tool_result after a write of note.md leaves no note.first.md and no note changed line", async (t) => {
	const { project, home, job } = await fixture(t);
	environment(t, jobSession(project, home));
	await writeFile(join(job, "log"), "");
	const hook = loadHook();
	await hook.start(sessionContext(project, () => []));
	await writeFile(join(job, "note.md"), "- Done means: tests pass.\n");
	hook.fire("tool_result", PAYLOADS.tool_result, { cwd: project });
	assert.deepEqual([existsSync(join(job, "note.first.md")), await readFile(join(job, "log"), "utf8")], [false, ""]);
});

/** The context message of a worker in `project`, as the spawn of the fixture's job, which has no record, builds it. */
function workerMessage(project: string): string {
	const preamble = resolvePreamble(project, "worker");
	return contextMessage(project, { session: "job", role: "worker", preamble, bridgeIsolated: false });
}

/**
 * One run of `hook` in `project` whose session's compaction-aware context holds `entries`: the messages its handlers
 * returned, in their order, which the context holds after it as custom message entries, as Pi enters them with the
 * run's prompt (E-11, E-16).
 */
async function runIn(hook: ReturnType<typeof loadHook>, project: string, entries: object[]): Promise<Message[]> {
	const messages = messagesOf(await hook.start(sessionContext(project, () => entries)));
	entries.push(...messages.map((message) => ({ type: "custom_message", ...message })));
	return messages;
}

/** The type of each message, in order. */
const typesOf = (messages: readonly Message[]) => messages.map(({ customType }) => customType);

/** Writes the project's board with the line `now` under `## NOW` and one ticket under `## NEXT`. */
async function board(project: string, now: string): Promise<void> {
	await mkdir(join(project, "spec"), { recursive: true });
	await writeFile(join(project, "spec", "build.md"), `# Build\n\n## NOW\n\n- ${now}\n\n## NEXT\n\n- F002 next\n`);
}

/** The board digest of the board `board` writes with `now`: its NOW and NEXT under one heading, in its tag pair. */
function digest(now: string): string {
	const sections = ["## NOW", "", `- ${now}`, "", "## NEXT", "", "- F002 next"];
	return ["<limen-board>", "## Board digest (spec/build.md)", ...sections, "</limen-board>"].join("\n");
}

/** The coordinator's context message in `project`. */
const coordinatorMessage = (project: string) => contextMessage(project, { session: "coordinator" });

/**
 * A coordinator's hook in a project with a board, and its session's context, which holds the context message of the
 * bytes `bytes`, built now.
 */
async function coordinatorWithBoard(t: TestContext) {
	const { project, home } = await fixture(t);
	await board(project, "F001 now");
	environment(t, coordinatorSession(home));
	const bytes = coordinatorMessage(project);
	const entries: object[] = [held(bytes)];
	return { hook: loadHook(), project, bytes, entries };
}

// A-037, D-120: the digest rides the run as the cue does, so it ends the run's prompt and adds no request.
test("A-037: a coordinator's first run returns the board digest as a hidden limen-board message, last, after the cue", async (t) => {
	const { hook, project, entries } = await coordinatorWithBoard(t);
	const messages = await runIn(hook, project, entries);
	assert.deepEqual(
		[messages.map(({ customType, display }) => [customType, display]), messages.at(-1)?.content],
		[
			[
				["limen-turn-cue", false],
				["limen-board", false],
			],
			digest("F001 now"),
		],
	);
});

// T-15, A-037: the digest is compared as text with the last one the context holds, so an unchanged board sends none.
test("A-037: a coordinator's second run with the same board returns no digest", async (t) => {
	const { hook, project, entries } = await coordinatorWithBoard(t);
	const first = await runIn(hook, project, entries);
	const second = await runIn(hook, project, entries);
	assert.deepEqual([first.at(-1)?.content, typesOf(second)], [digest("F001 now"), ["limen-turn-cue"]]);
});

test("A-037: after a change of the board's NOW the coordinator's next run returns the new digest", async (t) => {
	const { hook, project, entries } = await coordinatorWithBoard(t);
	await runIn(hook, project, entries);
	await board(project, "F003 now");
	const messages = await runIn(hook, project, entries);
	assert.deepEqual(
		[typesOf(messages), messages.at(-1)?.content],
		[["limen-turn-cue", "limen-board"], digest("F003 now")],
	);
});

// A-051, z. 4: what a compaction summarised is gone from the context the model holds, so the digest comes again.
test("A-037: after a compaction that summarised the digest the coordinator's next run returns it again", async (t) => {
	const { hook, project, bytes, entries } = await coordinatorWithBoard(t);
	await runIn(hook, project, entries);
	entries.splice(0, entries.length, COMPACTION, held(bytes));
	const again = await runIn(hook, project, entries);
	assert.deepEqual([typesOf(again), again.at(-1)?.content], [["limen-turn-cue", "limen-board"], digest("F001 now")]);
});

// T-23: the board digest is the coordinator's; a job works on one ticket and never edits the board.
test("T-23: a job's run in a project with a board returns no board digest", async (t) => {
	const { project, home } = await fixture(t);
	await board(project, "F001 now");
	environment(t, jobSession(project, home));
	assert.deepEqual(typesOf(await runIn(loadHook(), project, [held(workerMessage(project))])), ["limen-turn-cue"]);
});

/** The project's styleguide, a part of every role's context message. */
const STYLE = ".agents/limen/styleguide.md";
/** The notice of a changed styleguide (A-037's words), in its tag pair. */
const STYLE_NOTICE = `<limen-notice>\nchanged ${STYLE}, new text from the next session\n</limen-notice>`;

/** Writes the fixture's styleguide, one rule under its heading. */
async function styleguide(project: string): Promise<void> {
	await mkdir(join(project, ".agents/limen"), { recursive: true });
	await writeFile(join(project, STYLE), "# Styleguide\n\nThe first rule.\n");
}

/** Adds a rule to the fixture's styleguide, as an edit during a session does. */
function editStyleguide(project: string): Promise<void> {
	return appendFile(join(project, STYLE), "\nA rule added in the session.\n");
}

/**
 * A hook in the session the variables `session` gives name, and its session's context, which holds the context message
 * of the bytes `bytes` that `message` built before the project's styleguide changed.
 */
async function changedStyleguide(
	t: TestContext,
	session: (project: string, home: string) => Env,
	message: (project: string) => string,
) {
	const { project, home } = await fixture(t);
	await styleguide(project);
	environment(t, session(project, home));
	const bytes = message(project);
	const entries: object[] = [held(bytes)];
	await editStyleguide(project);
	return { hook: loadHook(), project, home, bytes, entries };
}

/** The variables of a coordinator's session, in the shape `changedStyleguide` takes. */
const coordinatorOf = (_project: string, home: string) => coordinatorSession(home);

/** The styleguide's notice as a run returns it: a hidden custom message of type limen-notice. */
const NOTICE_MESSAGE: Message = { customType: "limen-notice", content: STYLE_NOTICE, display: false };

// A-037 "(coordinator and jobs)": a change during the session is named, and its text waits for the next session.
test("A-037: in the coordinator a run after the styleguide changed returns one hidden limen-notice that names it, after the cue", async (t) => {
	const { hook, project, entries } = await changedStyleguide(t, coordinatorOf, coordinatorMessage);
	const messages = await runIn(hook, project, entries);
	assert.deepEqual([typesOf(messages), messages.at(-1)], [["limen-turn-cue", "limen-notice"], NOTICE_MESSAGE]);
});

test("A-037: in a job a run after the styleguide changed returns one hidden limen-notice that names it, after the cue", async (t) => {
	const { hook, project, entries } = await changedStyleguide(t, jobSession, workerMessage);
	const messages = await runIn(hook, project, entries);
	assert.deepEqual([typesOf(messages), messages.at(-1)], [["limen-turn-cue", "limen-notice"], NOTICE_MESSAGE]);
});

// A-037: the notice stays in the context, so a path comes once per context, also when its file changes again.
test("A-037: a path comes in one notice per context: the next run, and one after a second change of the file, return none", async (t) => {
	const { hook, project, entries } = await changedStyleguide(t, jobSession, workerMessage);
	const first = await runIn(hook, project, entries);
	const next = await runIn(hook, project, entries);
	await appendFile(join(project, STYLE), "\nA second rule added in the session.\n");
	const after = await runIn(hook, project, entries);
	assert.deepEqual(
		[first.at(-1), typesOf(next), typesOf(after)],
		[NOTICE_MESSAGE, ["limen-turn-cue"], ["limen-turn-cue"]],
	);
});

// z. 4: the context the model holds after a compaction lacks the notice the compaction summarised.
test("A-037: after a compaction removed the notice the next run names the changed path again", async (t) => {
	const { hook, project, bytes, entries } = await changedStyleguide(t, jobSession, workerMessage);
	await runIn(hook, project, entries);
	entries.splice(0, entries.length, COMPACTION, held(bytes));
	assert.deepEqual((await runIn(hook, project, entries)).at(-1)?.content, STYLE_NOTICE);
});

// z. 3: the notice and the digest are appended after the history; the frozen message, the session's prefix, stays.
test("D-114 (1): runs that return notices and digests send no context message and leave the limen-context entry's bytes", async (t) => {
	const { hook, project, bytes, entries } = await changedStyleguide(t, coordinatorOf, coordinatorMessage);
	await board(project, "F001 now");
	const first = await runIn(hook, project, entries);
	const returned = [...first, ...(await runIn(hook, project, entries))];
	await board(project, "F003 now");
	returned.push(...(await runIn(hook, project, entries)));
	assert.deepEqual(
		[typesOf(first), hook.sent, typesOf(returned).filter((type) => type === "limen-context"), entries[0]],
		[["limen-turn-cue", "limen-notice", "limen-board"], [], [], held(bytes)],
	);
});

/** The `child_process` functions that start a process, each counting its calls for the test `t`. */
function countedStarts(t: TestContext) {
	const names = ["spawn", "spawnSync", "exec", "execSync", "execFile", "execFileSync", "fork"] as const;
	const started = names.map((name) => t.mock.method(childProcess, name));
	// The modules that import these names by name see the counting ones only after the named exports are synced.
	syncBuiltinESMExports();
	t.after(() => {
		for (const method of started) {
			method.mock.restore();
		}
		syncBuiltinESMExports();
	});
	return () => started.map((method) => method.mock.callCount());
}

// T-36: the notice rebuilds the parts of the context message on every run, which reads files only.
test("T-36: a coordinator's run that returns a notice and a digest, and a job's that returns a notice, start no process", async (t) => {
	const { project, home } = await fixture(t);
	await styleguide(project);
	await board(project, "F001 now");
	environment(t, coordinatorSession(home));
	const frozen = [coordinatorMessage(project), workerMessage(project)];
	await editStyleguide(project);
	const calls = countedStarts(t);
	const coordinator = typesOf(await runIn(loadHook(), project, [held(frozen[0] ?? "")]));
	// The job's variables name the same variables as the coordinator's, which the test gives back after it.
	assign(jobSession(project, home));
	const job = typesOf(await runIn(loadHook(), project, [held(frozen[1] ?? "")]));
	assert.deepEqual(
		[coordinator, job, calls()],
		[
			["limen-turn-cue", "limen-notice", "limen-board"],
			["limen-turn-cue", "limen-notice"],
			[0, 0, 0, 0, 0, 0, 0],
		],
	);
});
