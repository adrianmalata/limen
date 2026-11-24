// test/runtime/pi-contract.ts: Pi's types that fit the adapter pass; a wrong member or a missing package fails, named.
import assert from "node:assert/strict";
import { existsSync } from "node:fs";
import { mkdir, mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import test, { type TestContext } from "node:test";
import { fileURLToPath } from "node:url";
import { PI_PACKAGES, piContract } from "./pi-contract.ts";

/** The vendor copy of Pi 1.5.1 (D-055): local and untracked, so a fresh clone has none. */
const VENDOR = fileURLToPath(new URL("../../adrian-rebuild/input/vendor", import.meta.url));

/** A package's manifest: an ES module whose types are `types.d.ts`. */
function manifest(name: string): string {
	return `${JSON.stringify({ name: `@earendil-works/${name}`, type: "module", types: "./types.d.ts" })}\n`;
}

const PI_AI = `export interface TextContent { type: "text"; text: string; textSignature?: string }
export interface ImageContent { type: "image"; data: string; mimeType: string }
export interface UserMessage { role: "user"; content: string | (TextContent | ImageContent)[] }
export interface AssistantMessage {
	role: "assistant";
	content: TextContent[];
	stopReason: "stop" | "error" | "aborted";
	errorMessage?: string;
}
export interface ToolResultMessage { role: "toolResult"; content: (TextContent | ImageContent)[]; isError: boolean }
export type Message = UserMessage | AssistantMessage | ToolResultMessage;
`;

const PI_AGENT_CORE = `import type { Message } from "@earendil-works/pi-ai";
export interface CustomAgentMessages {}
export type AgentMessage = Message | CustomAgentMessages[keyof CustomAgentMessages];
`;

/** Pi's extension API in the shape of Pi 1.5.1, reduced to the members, events and fields that the adapter declares. */
const PI_CODING_AGENT = `import type { AgentMessage } from "@earendil-works/pi-agent-core";
import type { ImageContent, TextContent } from "@earendil-works/pi-ai";
export interface SessionStartEvent { type: "session_start"; reason: "startup" | "reload" }
export interface SessionShutdownEvent { type: "session_shutdown"; reason: "quit" | "reload" }
export interface SessionCompactEvent { type: "session_compact"; willRetry: boolean }
export interface BeforeAgentStartUserEvent { type: "before_agent_start"; systemPrompt: string; prompt: string }
export interface BeforeAgentStartCustomEvent { type: "before_agent_start"; systemPrompt: string; message: { customType: string } }
export interface MessageStartEvent { type: "message_start"; message: AgentMessage }
export interface MessageEndEvent { type: "message_end"; message: AgentMessage }
export interface ContextEvent { type: "context"; messages: AgentMessage[] }
export interface ToolCallEvent { type: "tool_call"; toolCallId: string; toolName: string; input: Record<string, unknown> }
export interface ToolResultEvent {
	type: "tool_result";
	toolCallId: string;
	toolName: string;
	input: Record<string, unknown>;
	content: (TextContent | ImageContent)[];
	isError: boolean;
}
export interface CustomEntryDraft { type: "custom"; customType: string; data?: unknown }
export interface CustomMessageEntryDraft {
	type: "custom_message";
	customType: string;
	content: string | (TextContent | ImageContent)[];
	display: boolean;
	details?: unknown;
}
export type SessionBoundaryDraft = CustomEntryDraft | CustomMessageEntryDraft;
export interface AgentBeforeSettleEvent {
	type: "agent_before_settle";
	entries: SessionBoundaryDraft[];
	continue: boolean;
	outcome: "completed" | "aborted" | "error";
}
export interface AgentSettledEvent { type: "agent_settled"; aborted: boolean }
export type ExtensionEvent = SessionStartEvent | SessionShutdownEvent | SessionCompactEvent | BeforeAgentStartUserEvent
	| BeforeAgentStartCustomEvent | MessageStartEvent | MessageEndEvent | ContextEvent | ToolCallEvent | ToolResultEvent
	| AgentBeforeSettleEvent | AgentSettledEvent;
export interface ExtensionUIContext {
	notify(message: string, type?: "info" | "warning" | "error"): void;
	setStatus(key: string, text: string | undefined): void;
}
export interface ExtensionContext {
	ui: ExtensionUIContext;
	cwd: string;
	sessionManager: { getSessionId(): string; getSessionFile(): string | undefined };
	isIdle(): boolean;
	shutdown(): void;
	abort(): void;
}
export type ExtensionHandler<E, R = undefined> = (event: E, ctx: ExtensionContext) => Promise<R | void> | R | void;
export interface CustomMessage { customType: string; content: string | (TextContent | ImageContent)[]; display: boolean; details?: unknown }
export interface EventBus {
	emit(channel: string, data: unknown): void;
	on(channel: string, handler: (data: unknown) => void): () => void;
}
export interface ExtensionAPI {
	on(event: "session_start", handler: ExtensionHandler<SessionStartEvent>): () => void;
	on(event: "session_shutdown", handler: ExtensionHandler<SessionShutdownEvent>): () => void;
	on(event: "session_compact", handler: ExtensionHandler<SessionCompactEvent>): () => void;
	on(event: "before_agent_start", handler: ExtensionHandler<BeforeAgentStartUserEvent | BeforeAgentStartCustomEvent, { message?: CustomMessage; systemPrompt?: string }>): () => void;
	on(event: "message_start", handler: ExtensionHandler<MessageStartEvent>): () => void;
	on(event: "message_end", handler: ExtensionHandler<MessageEndEvent, { message?: AgentMessage }>): () => void;
	on(event: "context", handler: ExtensionHandler<ContextEvent, { messages?: AgentMessage[] }>): () => void;
	on(event: "tool_call", handler: ExtensionHandler<ToolCallEvent, { block?: boolean; reason?: string }>): () => void;
	on(event: "tool_result", handler: ExtensionHandler<ToolResultEvent, { content?: (TextContent | ImageContent)[]; isError?: boolean }>): () => void;
	on(event: "agent_before_settle", handler: ExtensionHandler<AgentBeforeSettleEvent, { entries?: SessionBoundaryDraft[]; continue?: boolean }>): () => void;
	on(event: "agent_settled", handler: ExtensionHandler<AgentSettledEvent>): () => void;
	registerTool(tool: {
		name: string;
		label: string;
		description: string;
		parameters: object;
		execute(toolCallId: string, params: unknown, signal: unknown, onUpdate: unknown, ctx: ExtensionContext): Promise<{ content: (TextContent | ImageContent)[]; details: unknown }>;
	}): void;
	registerCommand(name: string, options: {
		description?: string;
		getArgumentCompletions?: (prefix: string) => { value: string; label: string }[] | null;
		handler: (args: string, ctx: ExtensionContext) => Promise<void>;
	}): void;
	sendMessage(message: Pick<CustomMessage, "customType" | "content" | "display" | "details">, options?: { triggerTurn?: boolean; deliverAs?: "steer" | "followUp" | "nextTurn" }): void;
	sendUserMessage(content: string | (TextContent | ImageContent)[], options?: { deliverAs?: "steer" | "followUp" }): void;
	events: EventBus;
}
`;

/** The files of the fixture, by their path below its root: Pi's three packages in the layout of the vendor copy. */
const FIXTURE: Readonly<Record<string, string>> = {
	"pi-ai/package/package.json": manifest("pi-ai"),
	"pi-ai/package/types.d.ts": PI_AI,
	"pi-agent-core/package/package.json": manifest("pi-agent-core"),
	"pi-agent-core/package/types.d.ts": PI_AGENT_CORE,
	"pi-coding-agent/package/package.json": manifest("pi-coding-agent"),
	"pi-coding-agent/package/types.d.ts": PI_CODING_AGENT,
};

/** The fixture written to a temporary folder, with `change` applied to each file's text and `without` left out. */
async function fixture(
	t: TestContext,
	options: { readonly change?: (text: string) => string; readonly without?: string } = {},
): Promise<string> {
	const root = await mkdtemp(join(tmpdir(), "limen-pi-types-"));
	t.after(() => rm(root, { recursive: true, force: true }));
	for (const [path, text] of Object.entries(FIXTURE)) {
		if (options.without === undefined || !path.startsWith(`${options.without}/`)) {
			await mkdir(dirname(join(root, path)), { recursive: true });
			await writeFile(join(root, path), options.change ? options.change(text) : text);
		}
	}
	return root;
}

test("the contract passes Pi types that fit the adapter", async (t) => {
	assert.deepEqual(await piContract(await fixture(t)), []);
});

test("the contract fails Pi types in which a field the adapter reads has another type, and names the field", async (t) => {
	const types = await fixture(t, {
		change: (text) => text.replace("toolCallId: string; toolName: string;", "toolCallId: string; toolName: number;"),
	});
	const diagnostics = await piContract(types);
	assert.ok(
		diagnostics.some((line) => line.includes("tool_call") && line.includes("toolName")),
		diagnostics.join("\n\n"),
	);
});

test("the contract fails Pi types that lack an event the adapter handles, and names the event", async (t) => {
	const types = await fixture(t, { change: (text) => text.replaceAll('"session_compact"', '"session_compacted"') });
	const diagnostics = await piContract(types);
	assert.ok(
		diagnostics.some((line) => line.includes('"session_compact"')),
		diagnostics.join("\n\n"),
	);
});

test("the contract fails Pi types that lack a context field the adapter reads, and names the field", async (t) => {
	const types = await fixture(t, { change: (text) => text.replace("\tshutdown(): void;\n", "") });
	const diagnostics = await piContract(types);
	assert.ok(
		diagnostics.some((line) => line.includes("ExtensionContext.shutdown checks nothing")),
		diagnostics.join("\n\n"),
	);
});

// E-9, T-32 (1): the rate-limit event reaches a hook only on Pi's event bus, so the adapter declares it too.
test("the contract fails Pi types that lack the event bus the adapter declares, and names it", async (t) => {
	const types = await fixture(t, { change: (text) => text.replace("\tevents: EventBus;\n", "") });
	const diagnostics = await piContract(types);
	assert.ok(
		diagnostics.some((line) => line.includes("ExtensionAPI.events checks nothing")),
		diagnostics.join("\n\n"),
	);
});

test("the contract fails Pi types without the pi-ai package on the assertion that a compared type is not any", async (t) => {
	const diagnostics = await piContract(await fixture(t, { without: "pi-ai" }));
	assert.ok(
		diagnostics.some((line) => line.includes("message_end.message checks nothing")),
		diagnostics.join("\n\n"),
	);
});

test("the contract fails Pi types without the pi-agent-core package on the assertion that a compared type is not any", async (t) => {
	const diagnostics = await piContract(await fixture(t, { without: "pi-agent-core" }));
	assert.ok(
		diagnostics.some((line) => line.includes("context.messages checks nothing")),
		diagnostics.join("\n\n"),
	);
});

test("the contract passes the real types of Pi 1.5.1 in the vendor copy", {
	skip: existsSync(VENDOR) ? false : "no vendor copy of Pi at adrian-rebuild/input/vendor; a fresh clone has none",
}, async () => {
	for (const name of PI_PACKAGES) {
		assert.ok(existsSync(join(VENDOR, name, "package", "package.json")), `${name} in the vendor copy`);
	}
	assert.deepEqual(await piContract(VENDOR), []);
});
