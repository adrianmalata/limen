// The one declaration of the Pi API that Limen's hooks use (T-32 (1)): the members of `pi` they call, the payload of
// each event whose fields they read, and the fields of the context. A handler gets Pi's payload and context unchecked
// and reads them only through a guard here, which returns the value itself or throws BAD_DATA naming the event and
// the field (T-27 (2), D-055 (2)). Pi reports a handler's error as an extension error, except at `tool_call`, where it
// rethrows the error and blocks the tool call, and in a tool, whose error becomes an error tool result; both reach only
// the model. So every hook registers each handler, tool and command through `recorded`, which writes a guard's refusal
// where Limen reads it before the error reaches Pi (T-32 (4)): in a job, its record, whose end it makes `failed`, kind
// `engine-error`; in a coordinator's session, the session's folder, which `limen status` names. The contract of
// test/runtime/pi-contract.test.ts compiles these declarations against Pi 1.5.1's own types (D-055 (1)), so that
// they cannot drift from Pi unseen.
import { join } from "node:path";
import { at, refusedValue } from "../boundary.ts";
import { transport } from "../config.ts";
import { writeCoordinatorRefusal } from "../integrations/coordinator-registration.ts";
import { type Refusal as RecordedRefusal, recordRefusal } from "../job/record.ts";
import { LimenError } from "../outcome.ts";

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

/** The channel of Pi's event bus on which the bridge reports a rate limit that rejected a request (E-9). */
export const RATE_LIMIT_EVENT = "kendex:rate-limit";
/** The fields of the bridge's rate-limit event that a hook reads: the limit's type and its reset in epoch milliseconds. */
export type PiRateLimit = { readonly rateLimitType?: string; readonly resetAtMs?: number };
/** Pi's event bus between extensions; a listener gets the payload unchecked, so it reads it only through a guard. */
export type PiEventBus = { on(channel: string, handler: (data: unknown) => void): () => void };

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
		handler: <Entry>(
			event: PiSettleEvent<Entry>,
			context: unknown,
		) => PiSettleResult<Entry> | undefined | Promise<PiSettleResult<Entry> | undefined>,
	): void;
	on(event: "agent_settled", handler: PiHandler): void;
	sendMessage(
		message: PiCustomMessage,
		options: { readonly deliverAs: "followUp"; readonly triggerTurn: boolean },
	): void;
	sendUserMessage(content: string, options?: { readonly deliverAs: "steer" | "followUp" }): void;
	registerTool(tool: PiTool): void;
	registerCommand(name: string, command: PiCommand): void;
	readonly events: PiEventBus;
}

/**
 * Where a guarded value comes from: an event, a channel of the event bus, or the call of a command or a tool that a
 * hook registered.
 */
export type PiPlace = PiEventName | typeof RATE_LIMIT_EVENT | `command ${string}` | `tool ${string}`;

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
/** The largest distance from the epoch, in milliseconds, of a time that a Date holds. */
const MAX_EPOCH_MS = 8.64e15;
const epochTime: Check = (value, field) =>
	typeof value === "number" && Math.abs(value) <= MAX_EPOCH_MS
		? undefined
		: refusal(field, "a time in milliseconds since the epoch", value);
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

/** The check of the bridge's rate-limit event (E-9): the fields a hook reads, each of them optional. */
const RATE_LIMIT = shape<PiRateLimit>({ rateLimitType: maybe(text), resetAtMs: maybe(epochTime) });

/** What a BAD_DATA error names as its file: "Pi event <name>", "Pi command <name>" or "Pi tool <name>". */
function placeName(place: PiPlace): string {
	return place.includes(" ") ? `Pi ${place}` : `Pi event ${place}`;
}

/**
 * Throws the BAD_DATA error of `refused`, when there is one, through src/boundary.ts, with the place it came from, by
 * which `recorded` tells a guard's refusal from any other error.
 */
function refuse(place: PiPlace, refused: Refusal | undefined): void {
	if (refused) {
		throw Object.assign(refusedValue(placeName(place), refused), { place });
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
		refuse(place, refusal("context", "an object", value));
		return;
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

function assertRateLimit(value: unknown): asserts value is PiRateLimit {
	refuse(RATE_LIMIT_EVENT, RATE_LIMIT(value, ""));
}

/** The payload of the bridge's rate-limit event itself, when it has the fields a hook reads; otherwise BAD_DATA. */
export function piRateLimit(value: unknown): PiRateLimit {
	assertRateLimit(value);
	return value;
}

/** The functions `recorded` made, so a test can tell that a hook registered each handler through it (T-32 (4)). */
const RECORDED = new WeakSet<object>();

/**
 * `handler` as a hook registers it with Pi (T-32 (4)): what it returns, as it returns it, so a handler that returns at
 * once still does; a guard's refusal it throws or rejects with is written first, in a job's record or in the
 * coordinator session's folder, and only then reaches Pi as a rejection. Any other error passes through unchanged.
 */
export function recorded<A extends unknown[], R>(handler: (...args: A) => Promise<R>): (...args: A) => Promise<R>;
export function recorded<A extends unknown[], R>(handler: (...args: A) => R): (...args: A) => R | Promise<never>;
export function recorded(handler: (...args: unknown[]) => unknown): (...args: unknown[]) => unknown {
	const wrapped = (...args: unknown[]): unknown => {
		let result: unknown;
		try {
			result = handler(...args);
		} catch (error) {
			return afterRefusal(error);
		}
		return result instanceof Promise ? result.catch(afterRefusal) : result;
	};
	RECORDED.add(wrapped);
	return wrapped;
}

/** Whether `handler` came from `recorded`. */
export function isRecorded(handler: unknown): boolean {
	return typeof handler === "function" && RECORDED.has(handler);
}

/**
 * Writes `error` where Limen reads it when it is a guard's refusal, then throws it on; a refusal that could not be
 * written goes on with the reason in its message, so neither is lost (T-01).
 */
async function afterRefusal(error: unknown): Promise<never> {
	const refusal = thrownRefusal(error);
	if (refusal) {
		await keepRefusal(refusal).catch((cause: unknown) => {
			const reason = cause instanceof Error ? cause.message : String(cause);
			const message = `${refusal.message}; the refusal could not be written: ${reason}`;
			throw new LimenError({ class: "environment", code: "BAD_DATA", message, next: null, cause });
		});
	}
	throw error;
}

/** The refusal `error` holds when a guard here threw it: the place it came from, its field, its message and now. */
function thrownRefusal(error: unknown): RecordedRefusal | undefined {
	if (!(error instanceof Error)) {
		return undefined;
	}
	const [event, field] = [Reflect.get(error, "place"), Reflect.get(error, "field")];
	if (typeof event !== "string" || typeof field !== "string") {
		return undefined;
	}
	return { event, field, message: error.message, at: new Date().toISOString() };
}

/**
 * Writes `refusal` where Limen reads it: in a job, the job's record, whose end it decides (src/runtime/wrapper.ts); in
 * a coordinator's session, the folder of the session this process registered
 * (src/integrations/coordinator-registration.ts).
 */
async function keepRefusal(refusal: RecordedRefusal): Promise<void> {
	if (transport("LIMEN_JOB") !== "1") {
		await writeCoordinatorRefusal(process.cwd(), refusal);
		return;
	}
	const [root, id] = [transport("LIMEN_CONTEXT_ROOT"), transport("LIMEN_JOB_ID")];
	if (root && id) {
		await recordRefusal(join(root, ".limen", "jobs", id), refusal);
	}
}
