// The one declaration of the Pi API that Limen's hooks use (T-32 (1)): the members of `pi` they call, the payload of
// each event whose fields they read, and the fields of the context. A handler gets Pi's payload and context unchecked
// and reads them only through a guard here, which returns the value itself or throws BAD_DATA naming the event and
// the field (T-27 (2), D-055 (2)). Pi reports a handler's error as an extension error, except at `tool_call`, where it
// rethrows the error and blocks the tool call, so a `tool_call` handler guards only where it may block. The contract of
// test/runtime/pi-contract.test.ts compiles these declarations against Pi 1.5.1's own types (D-055 (1)), so that
// they cannot drift from Pi unseen.
import { at, refusedValue } from "../boundary.ts";

/** A text part of a tool result. */
export type PiText = { readonly type: "text"; readonly text: string };
/** An image part of a tool result. */
export type PiImage = { readonly type: "image"; readonly data: string; readonly mimeType: string };
/** A part of a tool result: Pi's tool content is text and images only. */
export type PiPart = PiText | PiImage;
/** A part of a message: text, an image, thinking or a tool call, of which only text carries `text`, always. */
export type PiMessagePart = { readonly type: string; readonly text?: string };
/** A message of the session: the owner's, the model's, a tool result, or a custom message such as a wake. */
export type PiMessage = {
	readonly role: string;
	readonly content?: string | readonly PiMessagePart[];
	readonly stopReason?: string;
	readonly errorMessage?: string;
};

/** `before_agent_start`: a run starts from a prompt, which has `prompt`, or from a custom message, which has none. */
export type PiStartEvent = { readonly prompt?: string; readonly systemPrompt: string };
/** `message_start` and `message_end`. */
export type PiMessageEvent = { readonly message: PiMessage };
/** `context`: the messages of the next model call. */
export type PiContextEvent = { readonly messages: readonly PiMessage[] };
/** `tool_call`: a tool call before it runs. */
export type PiToolCallEvent = { readonly toolName: string };
/** `tool_result`: a tool call after it ran. */
export type PiToolResultEvent = {
	readonly toolName: string;
	readonly input: Readonly<Record<string, unknown>>;
	readonly content: readonly PiPart[];
	readonly isError: boolean;
};
const PI_OUTCOMES = ["completed", "aborted", "error"] as const;
/** How a run ended. */
export type PiOutcome = (typeof PI_OUTCOMES)[number];
/**
 * `agent_before_settle`: the run's outcome and the entries proposed so far. The entries are Pi's own, of a type Limen
 * does not name; a handler passes them back unread, with its own entry after them.
 */
export type PiSettleEvent<Entry> = { readonly outcome: PiOutcome; readonly entries: readonly Entry[] };

/** The payload of each event whose fields a hook reads, by the event's name. */
export type PiEvents = {
	readonly before_agent_start: PiStartEvent;
	readonly message_start: PiMessageEvent;
	readonly message_end: PiMessageEvent;
	readonly context: PiContextEvent;
	readonly tool_call: PiToolCallEvent;
	readonly tool_result: PiToolResultEvent;
	readonly agent_before_settle: PiSettleEvent<unknown>;
};

/** The events a hook handles, those whose payload it does not read included. */
export type PiEventName = keyof PiEvents | "session_start" | "session_shutdown" | "session_compact" | "agent_settled";

/** A custom message that a hook sends or returns: the turn cue, a group's progress. */
export type PiCustomMessage = { readonly customType: string; readonly content: string; readonly display: boolean };
/** What a `before_agent_start` handler returns: a message for this run, and a system prompt in place of Pi's. */
export type PiStartResult = { readonly message: PiCustomMessage; readonly systemPrompt?: string };
/** What a `tool_call` handler returns to block the call. */
export type PiBlock = { readonly block: boolean; readonly reason: string };
/** What a `tool_result` handler returns to change the result's content. */
export type PiToolResultPatch = { readonly content: PiPart[] };
/** An entry a hook adds at `agent_before_settle`: a custom message. */
export type PiMessageDraft = { readonly type: "custom_message" } & PiCustomMessage;
/** What an `agent_before_settle` handler returns: Pi's entries with the hook's own after them, and one more turn. */
export type PiSettleResult<Entry> = { readonly entries: (Entry | PiMessageDraft)[]; readonly continue: boolean };

/** The context's UI. */
export type PiUi = {
	notify(message: string, level: "info" | "warning"): void;
	setStatus(key: string, text: string | undefined): void;
};
/** The fields of the context that a hook reads, in a handler, a command or a tool. */
export type PiContext = {
	readonly cwd: string;
	isIdle(): boolean;
	readonly sessionManager: { getSessionId(): string };
	readonly ui: PiUi;
	shutdown(): void;
};

/** One completion of a command's argument. */
export type PiCompletion = { readonly value: string; readonly label: string };
/** A command a hook registers; its handler gets the arguments and the context unchecked. */
export type PiCommand = {
	readonly description: string;
	getArgumentCompletions(prefix: string): PiCompletion[] | null;
	handler(args: unknown, context: unknown): Promise<void>;
};
/** What a tool returns. */
export type PiToolOutput = { readonly content: PiPart[]; readonly details: object };
/** A tool a hook registers; `execute` gets its parameters and the context unchecked. */
export type PiTool = {
	readonly name: string;
	readonly label: string;
	readonly description: string;
	readonly parameters: object;
	execute(
		toolCallId: string,
		params: unknown,
		signal: unknown,
		onUpdate: unknown,
		context: unknown,
	): Promise<PiToolOutput>;
};

/** A handler of `pi.on`: Pi's payload and context arrive unchecked, so the handler reads them only through a guard. */
export type PiHandler<Result = void> = (event: unknown, context: unknown) => Result | Promise<Result>;

/** The members of Pi's extension API that Limen's hooks use, each event its own overload, as Pi declares them. */
export interface PiApi {
	on(event: "session_start", handler: PiHandler): void;
	on(event: "session_shutdown", handler: PiHandler): void;
	on(event: "session_compact", handler: PiHandler): void;
	on(event: "before_agent_start", handler: PiHandler<PiStartResult | undefined>): void;
	on(event: "message_start", handler: PiHandler): void;
	on(event: "message_end", handler: PiHandler): void;
	on(event: "context", handler: PiHandler): void;
	on(event: "tool_call", handler: PiHandler<PiBlock | undefined>): void;
	on(event: "tool_result", handler: PiHandler<PiToolResultPatch | undefined>): void;
	// Generic in Pi's entry type, so that the handler can pass Pi's entries back and cannot make one up.
	on(
		event: "agent_before_settle",
		handler: <Entry>(event: PiSettleEvent<Entry>, context: unknown) => PiSettleResult<Entry> | undefined,
	): void;
	on(event: "agent_settled", handler: PiHandler): void;
	sendMessage(
		message: PiCustomMessage,
		options: { readonly deliverAs: "followUp"; readonly triggerTurn: boolean },
	): void;
	sendUserMessage(content: string, options?: { readonly deliverAs: "steer" | "followUp" }): void;
	registerTool(tool: PiTool): void;
	registerCommand(name: string, command: PiCommand): void;
}

/** Where a guarded value comes from: an event, or the call of a command or a tool that a hook registered. */
export type PiPlace = PiEventName | `command ${string}` | `tool ${string}`;

/** The first part of a value that is wrong: where it is, what was expected there, and what was found. */
type Refusal = { readonly field: string; readonly expected: string; readonly got: unknown };
/** A check of the value at `field`: its first wrong part, or `undefined` when it has the shape. */
type Check = (value: unknown, field: string) => Refusal | undefined;

function refusal(field: string, expected: string, got: unknown): Refusal {
	return { field, expected, got };
}

/** An object that is not an array: a payload, a context, a part. */
function isObject(value: unknown): value is object {
	return typeof value === "object" && value !== null && !Array.isArray(value);
}

const text: Check = (value, field) => (typeof value === "string" ? undefined : refusal(field, "a string", value));
const flag: Check = (value, field) => (typeof value === "boolean" ? undefined : refusal(field, "a boolean", value));
const callable: Check = (value, field) =>
	typeof value === "function" ? undefined : refusal(field, "a function", value);
const record: Check = (value, field) => (isObject(value) ? undefined : refusal(field, "an object", value));
/** Pi's own value, which a hook passes back unread. */
const passed: Check = () => undefined;

/** One of `values`. */
function literal(values: readonly string[]): Check {
	const listed = values.map((value) => JSON.stringify(value));
	const expected = `one of ${listed.slice(0, -1).join(", ")} or ${listed.at(-1)}`;
	return (value, field) =>
		typeof value === "string" && values.includes(value) ? undefined : refusal(field, expected, value);
}

/** A field that may be absent. */
function maybe(check: Check): Check {
	return (value, field) => (value === undefined ? undefined : check(value, field));
}

/** A list whose every item `check` accepts; a wrong item is named by its index. */
function listOf(check: Check): Check {
	return (value, field) => {
		if (!Array.isArray(value)) {
			return refusal(field, "a list", value);
		}
		const items: readonly unknown[] = value;
		for (const [index, item] of items.entries()) {
			const refused = check(item, at(field, String(index)));
			if (refused) {
				return refused;
			}
		}
		return undefined;
	};
}

/**
 * An object whose fields of `T` each pass their check; other fields are Pi's and stay unchecked. A field is read as
 * a property, so a method on a class instance counts. The checks name every field of `T`.
 */
function shape<T>(fields: { readonly [K in keyof T]-?: Check }): Check {
	const checks = Object.entries<Check>(fields);
	return (value, field) => {
		if (!isObject(value)) {
			return refusal(field, "an object", value);
		}
		for (const [key, check] of checks) {
			const refused = check(Reflect.get(value, key), at(field, key));
			if (refused) {
				return refused;
			}
		}
		return undefined;
	};
}

/** A string, or a list whose every item `check` accepts. */
function textOrList(check: Check): Check {
	const list = listOf(check);
	return (value, field) => {
		if (typeof value === "string") {
			return undefined;
		}
		return Array.isArray(value) ? list(value, field) : refusal(field, "a string or a list", value);
	};
}

/** The `type` of a part, when the part is an object. */
function partType(value: unknown): unknown {
	return isObject(value) ? Reflect.get(value, "type") : undefined;
}

const textPart = shape<PiText>({ type: literal(["text"]), text });
const imagePart = shape<PiImage>({ type: literal(["image"]), data: text, mimeType: text });

/** A part of a tool result, by its `type`. */
const part: Check = (value, field) => {
	const kind = partType(value);
	if (kind === "text") {
		return textPart(value, field);
	}
	if (kind === "image") {
		return imagePart(value, field);
	}
	return isObject(value) ? refusal(at(field, "type"), 'one of "text" or "image"', kind) : record(value, field);
};

/** A part of a message: a text part carries its text, as Pi's `TextContent` does; another part may have none. */
const messagePart: Check = (value, field) =>
	(partType(value) === "text" ? textPart : shape<PiMessagePart>({ type: text, text: maybe(text) }))(value, field);
const message = shape<PiMessage>({
	role: text,
	content: maybe(textOrList(messagePart)),
	stopReason: maybe(text),
	errorMessage: maybe(text),
});

/** The check of each event's payload. */
const EVENTS: { readonly [K in keyof PiEvents]: Check } = {
	before_agent_start: shape<PiStartEvent>({ prompt: maybe(text), systemPrompt: text }),
	message_start: shape<PiMessageEvent>({ message }),
	message_end: shape<PiMessageEvent>({ message }),
	context: shape<PiContextEvent>({ messages: listOf(message) }),
	tool_call: shape<PiToolCallEvent>({ toolName: text }),
	tool_result: shape<PiToolResultEvent>({ toolName: text, input: record, content: listOf(part), isError: flag }),
	agent_before_settle: shape<PiSettleEvent<unknown>>({ outcome: literal(PI_OUTCOMES), entries: listOf(passed) }),
};

/** The check of each context field. */
const CONTEXT: { readonly [K in keyof PiContext]-?: Check } = {
	cwd: text,
	isIdle: callable,
	sessionManager: shape<PiContext["sessionManager"]>({ getSessionId: callable }),
	ui: shape<PiUi>({ notify: callable, setStatus: callable }),
	shutdown: callable,
};

/** What a BAD_DATA error names as its file: "Pi event <name>", "Pi command <name>" or "Pi tool <name>". */
function placeName(place: PiPlace): string {
	return place.includes(" ") ? `Pi ${place}` : `Pi event ${place}`;
}

/** Throws the BAD_DATA error of `refused`, when there is one, through src/boundary.ts. */
function refuse(place: PiPlace, refused: Refusal | undefined): void {
	if (refused) {
		throw refusedValue(placeName(place), refused);
	}
}

function assertEvent<K extends keyof PiEvents>(name: K, value: unknown): asserts value is PiEvents[K] {
	refuse(name, EVENTS[name](value, ""));
}

function assertContext<K extends keyof PiContext>(
	place: PiPlace,
	value: unknown,
	fields: readonly K[],
): asserts value is Pick<PiContext, K> {
	if (!isObject(value)) {
		throw refusedValue(placeName(place), refusal("context", "an object", value));
	}
	for (const name of fields) {
		refuse(place, CONTEXT[name](Reflect.get(value, name), at("context", name)));
	}
}

function assertParams(tool: string, value: unknown): asserts value is Readonly<Record<string, unknown>> {
	refuse(`tool ${tool}`, record(value, "params"));
}

function assertArgs(command: string, value: unknown): asserts value is string {
	refuse(`command ${command}`, text(value, "args"));
}

/** The payload of event `name` itself, when it has the shape of `PiEvents`; otherwise BAD_DATA names the field. */
export function piEvent<K extends Exclude<keyof PiEvents, "agent_before_settle">>(
	name: K,
	value: unknown,
): PiEvents[K] {
	assertEvent(name, value);
	return value;
}

/**
 * The payload of `agent_before_settle` itself, when it has its shape; otherwise BAD_DATA names the field. Its handler
 * gets the payload typed by Pi's entries (`PiApi.on`), and the guard checks it as it arrives.
 */
export function piSettleEvent<Entry>(event: PiSettleEvent<Entry>): PiSettleEvent<Entry> {
	refuse("agent_before_settle", EVENTS.agent_before_settle(event, ""));
	return event;
}

/**
 * The context itself, so that its getters and methods keep working, when each field of `fields` has its shape;
 * otherwise BAD_DATA names the field. A hook asks only for the fields it reads.
 */
export function piContext<const K extends keyof PiContext>(
	place: PiPlace,
	value: unknown,
	fields: readonly K[],
): Pick<PiContext, K> {
	assertContext(place, value, fields);
	return value;
}

/** The parameters of a call of the tool `tool` itself, when they are an object; otherwise BAD_DATA. */
export function piToolInput(tool: string, value: unknown): Readonly<Record<string, unknown>> {
	assertParams(tool, value);
	return value;
}

/** The arguments of a call of the command `command`, the text after its name, when they are a string; otherwise BAD_DATA. */
export function piCommandArgs(command: string, value: unknown): string {
	assertArgs(command, value);
	return value;
}
