// The communication hook: the context message it sends at a session's start and after a compaction, which bytes it
// holds, the options of each send (D-114 (1), E-13), a compaction's payload of the wrong shape refused (T-32 (4)), no
// system prompt from any handler (A-086), a session's start built from declarations only: a `jg` on PATH changes
// nothing (T-36), a turn cue and a specs reminder from the package's files alone, with no drift block (A-039, A-042),
// and a job's first prompt and tool results with nothing of the cut task note (A-044).
import assert from "node:assert/strict";
import { existsSync } from "node:fs";
import { mkdir, mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test, { type TestContext } from "node:test";
import { fileURLToPath } from "node:url";
import limenCommunication from "../../hook/communication.ts";
import { LimenError } from "../../src/outcome.ts";
import { contextMessage, markdownSection } from "../../src/runtime/context-message.ts";
import { inTemporaryProject } from "../environment.ts";

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

/** One message the hook sent, with the options of its send. */
type Sent = {
	readonly customType: string;
	readonly content: string;
	readonly display: boolean;
	readonly options: unknown;
};

/** A fresh copy of the hook on a fake `pi`: the messages it sent, and a call of its handler of an event, as Pi's. */
function loadHook() {
	const handlers = new Map<string, unknown>();
	const sent: Sent[] = [];
	limenCommunication({
		on: (name: string, handler: unknown) => handlers.set(name, handler),
		sendMessage: (message, options) => {
			sent.push({ ...message, options });
		},
	});
	const fire = (name: string, event: unknown, context: unknown): unknown => {
		const handler = handlers.get(name);
		assert.ok(typeof handler === "function", `the hook handles ${name}`);
		return handler(event, context);
	};
	return { handlers, sent, fire };
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
	before_agent_start: { type: "before_agent_start", prompt: "Hello.", systemPrompt: "Base prompt." },
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
			return [name, await hook.fire(name, PAYLOADS[name], context)] as const;
		}),
	);
	assert.deepEqual(
		results.filter(([, result]) => typeof result === "object" && result !== null && "systemPrompt" in result),
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

/** The `before_agent_start` result of a fresh copy of the hook: what a new session's first prompt gets. */
function sessionStart(project: string): unknown {
	return loadHook().fire("before_agent_start", PAYLOADS.before_agent_start, { cwd: project });
}

/**
 * The session start with PATH unchanged and with the `jg` folder first on PATH, and whether that `jg` ran. Every
 * variable the hook reads for the session's kind is set or cleared, and all of them are restored after the test.
 */
async function startWithAndWithoutJg(t: TestContext, job: boolean) {
	const { project, bin, home, marker } = await fixture(t);
	environment(t, { ...(job ? jobSession(project, home) : coordinatorSession(home)), PATH: process.env.PATH });
	const plain = sessionStart(project);
	process.env.PATH = `${bin}:${process.env.PATH ?? ""}`;
	const withJg = sessionStart(project);
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

/** The text of the turn cue in a `before_agent_start` result; "" for a result without one. */
function cueText(start: unknown): string {
	const message = typeof start === "object" && start !== null ? Reflect.get(start, "message") : undefined;
	const content = typeof message === "object" && message !== null ? Reflect.get(message, "content") : undefined;
	return typeof content === "string" ? content : "";
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
	const cue = cueText(sessionStart(project));
	assert.deepEqual([cue.includes("<limen-project-context>"), cue.includes("Guidance drift")], [true, false]);
});

// A-039: the cue's register lines come from the package, which no project file replaces.
test("A-039: the turn cue holds the package's shared cue and not the one of a register the project holds", async (t) => {
	const { project, home } = await fixture(t);
	await mkdir(join(project, ".agents/limen"), { recursive: true });
	await writeFile(join(project, ".agents/limen/communication.md"), PROJECT_REGISTER);
	environment(t, coordinatorSession(home));
	const cue = cueText(sessionStart(project));
	const shared = markdownSection(await readFile(join(PACKAGE, "templates/communication.md"), "utf8"), "Cue: Shared");
	const body = shared.split("\n").slice(1).join("\n").trim();
	assert.deepEqual([body.length > 0, cue.includes(body), cue.includes("project-cue-marker")], [true, true, false]);
});

// A-039: the specs reminder names the lines of the package's specs register, the text every role's message holds.
test("A-039: after a write under spec/ the reminder names the package's specs register, not the project's register", async (t) => {
	const { project, home } = await fixture(t);
	await mkdir(join(project, ".agents/limen"), { recursive: true });
	await writeFile(join(project, ".agents/limen/communication.md"), PROJECT_REGISTER);
	environment(t, coordinatorSession(home));
	const write = {
		type: "tool_result",
		toolName: "write",
		input: { path: "spec/features/planned/F001-demo/ticket.md" },
		content: [{ type: "text", text: "Wrote the ticket." }],
		isError: false,
	};
	const result = loadHook().fire("tool_result", write, { cwd: project });
	const text = JSON.stringify(result);
	assert.deepEqual(
		[text.includes(`${join(PACKAGE, "templates/registers/specs.md")} lines 1-`), text.includes("communication.md")],
		[true, false],
	);
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
	const start = sessionStart(project);
	const cue = typeof start === "object" && start !== null ? JSON.stringify(Reflect.get(start, "message")) : "";
	assert.deepEqual(
		[cue.includes("<limen-project-context>"), cue.includes("Seat-wide rules"), cue.includes(rule.text)],
		[true, false, false],
	);
});

// A-044: a job's first prompt asked it to read or write its task note, which nothing measured.
test("a job's first before_agent_start message is the turn cue alone, the same as its next prompt's", async (t) => {
	const { project, home } = await fixture(t);
	environment(t, jobSession(project, home));
	const hook = loadHook();
	const [first, next] = [1, 2].map(() =>
		cueText(hook.fire("before_agent_start", PAYLOADS.before_agent_start, { cwd: project })),
	);
	assert.deepEqual([first, first?.endsWith("</limen-project-context>")], [next, true]);
});

// A-044: the hook kept a job's first note as note.first.md and logged each change of note.md.
test("a job's tool_result after a write of note.md leaves no note.first.md and no note changed line", async (t) => {
	const { project, home, job } = await fixture(t);
	environment(t, jobSession(project, home));
	await writeFile(join(job, "log"), "");
	const hook = loadHook();
	hook.fire("before_agent_start", PAYLOADS.before_agent_start, { cwd: project });
	await writeFile(join(job, "note.md"), "- Done means: tests pass.\n");
	hook.fire("tool_result", PAYLOADS.tool_result, { cwd: project });
	assert.deepEqual([existsSync(join(job, "note.first.md")), await readFile(join(job, "log"), "utf8")], [false, ""]);
});
