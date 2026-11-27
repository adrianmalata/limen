// hook/communication.ts: the context message it sends, the turn cue it returns, the reminders in a tool result.
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
	const cue = cueText(hook.fire("before_agent_start", PAYLOADS.before_agent_start, { cwd: project }));
	assert.deepEqual([cue.includes("<limen-project-context>"), cue.includes("Last turn")], [true, false]);
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
