/* PL: Jedyny moduł narzędzi przebudowy, który zna tryb RPC Pi (R-011, D-021, R-091). Uruchamia Pi z `--mode rpc`
   i katalogiem sesji w zadanym katalogu i środowisku, wysyła polecenia, oddaje kolejne obsługiwane obiekty ze stdout
   razem z ich surową linią i zatrzymuje proces (zamknięte stdin, po 10 s SIGTERM, po kolejnych 10 s SIGKILL). Tabela
   MARKS oznacza każdy typ, który Pi 1.5.1 wypisuje, według źródeł pakietu, jako obsługiwany albo pomijany; prośba
   rozszerzenia, na którą Pi czeka, typ albo metoda bez oznaczenia, obca odpowiedź, zła dyspozycja, linia spoza JSON
   i prompt bez odpowiedzi w 60 s to PiError z surową linią, a po nim moduł nie oddaje już żadnego obiektu. Krok B.2
   sprawdza prawdziwego Pi na seacie. Stan: działa; test w tools/test-same-task.mjs. */
// Pi 1.5.1's RPC mode as the same-task runner uses it, read from the npm sources of @earendil-works/pi-coding-agent
// and @earendil-works/pi-agent-core 1.5.1 (adrian-rebuild/input/vendor/, plan.md → ## Commands, stage 2 row), as
// data. Step B.2 of plan.md → ## Deployment still checks the real Pi on the seat before any attempt counts;
// fake-pi-rpc.mjs plays the same vocabulary. Paths below are inside pi-coding-agent@1.5.1/ unless named otherwise.
//   Start     <pi> --mode rpc --session-dir <dir> <engine args>: one JSON command per stdin line, one JSON object per
//             LF-ended stdout line (docs/rpc.md#L50-L56); closing stdin ends Pi (docs/rpc.md#L93).
//   Commands  {"type":"prompt","message":"<text>"} and {"type":"abort"}, the only ones the runner sends.
//   Stdout    every type Pi writes, by source; MARKS marks each one:
//     response              {id?, type, command, success: true, data?} or success: false with error
//                           (dist/modes/rpc/rpc-mode.js#L30-L38); for a prompt once, after its preflight, with
//                           data.disposition (#L314-L338, docs/rpc-commands.md#L40); command "parse" for a line Pi
//                           cannot parse (#L628)
//     extension_ui_request  {id, method, …} (dist/modes/rpc/rpc-types.d.ts#L405-L464): select, confirm and input
//                           wait for an extension_ui_response until their optional timeout (rpc-mode.js#L60-L90),
//                           editor with no timeout (#L178-L195); notify, setStatus, setWidget, setTitle and
//                           set_editor_text are fire and forget (#L92-L170)
//     extension_error       {extensionPath, event, error} (rpc-mode.js#L267)
//     agent_start, agent_end (with willRetry), turn_start, turn_end, message_start, message_update, message_end,
//     tool_execution_start, tool_execution_update, tool_execution_end
//                           pi-agent-core@1.5.1/dist/types.d.ts#L461-L501, written by toJsonEvent (rpc-mode.js#L273,
//                           dist/modes/json-event.js)
//     agent_settled (with aborted), queue_update, compaction_start, compaction_end, entry_appended,
//     session_info_changed, thinking_level_changed, auto_retry_start, auto_retry_end, summarization_retry_scheduled,
//     summarization_retry_attempt_start, summarization_retry_finished, bash_execution_update
//                           dist/core/agent-session.d.ts#L49-L111, written by toJsonEvent
//   A run ends at agent_settled: "agent_end marks the end of one low-level agent run, but retries, overflow recovery,
//   compaction, steering, or follow-up work can still follow" (docs/rpc.md#L69, docs/json.md#L48).
import { spawn } from "node:child_process";

/**
 * Pi broke the protocol, could not start or ended on its own: the runner ends with exit 4. `line` is the stdout line
 * the error is about, as Pi wrote it, when there is one.
 */
export class PiError extends Error {
	constructor(message, line) {
		super(message);
		this.line = line;
	}
}

/**
 * Every type of the header, marked `handled` (the runner reads it) or `skipped` (it passes without changing the
 * attempt); an object of any other type ends the attempt (D-046 (4)).
 */
export const MARKS = Object.freeze({
	response: "handled",
	extension_ui_request: "handled",
	extension_error: "handled",
	agent_start: "handled",
	agent_settled: "handled",
	message_end: "handled",
	// One low-level run ended; the run itself ends at agent_settled (docs/rpc.md#L69).
	agent_end: "skipped",
	turn_start: "skipped",
	turn_end: "skipped",
	message_start: "skipped",
	message_update: "skipped",
	tool_execution_start: "skipped",
	tool_execution_update: "skipped",
	tool_execution_end: "skipped",
	queue_update: "skipped",
	compaction_start: "skipped",
	compaction_end: "skipped",
	entry_appended: "skipped",
	session_info_changed: "skipped",
	thinking_level_changed: "skipped",
	auto_retry_start: "skipped",
	auto_retry_end: "skipped",
	summarization_retry_scheduled: "skipped",
	summarization_retry_attempt_start: "skipped",
	summarization_retry_finished: "skipped",
	bash_execution_update: "skipped",
});

/**
 * The methods of `extension_ui_request`. Pi waits for an answer to a `waits` one, so it is never skipped (D-046 (4)),
 * and the runner sends none, since an answer would be a decision the measurement must not take.
 */
const UI_METHODS = Object.freeze({
	select: "waits",
	confirm: "waits",
	input: "waits",
	editor: "waits",
	notify: "skipped",
	setStatus: "skipped",
	setWidget: "skipped",
	setTitle: "skipped",
	set_editor_text: "skipped",
});

/** A response is read only for a command the runner sent; a response to abort changes nothing. */
const RESPONSES = Object.freeze({ prompt: "handled", abort: "skipped" });

/** What Pi did with an accepted prompt (docs/rpc-commands.md#L40). */
const DISPOSITIONS = ["started", "queued", "handled"];

const RESPONSE_MS = 60_000;
const TERM_MS = 10_000;
const KILL_MS = 10_000;
const EXPECTED_RESPONSE =
	'{"type":"response","command":"prompt","success":true,"data":{"disposition":"…"}} or "success":false with "error"';

const own = (table, key) => (typeof key === "string" && Object.hasOwn(table, key) ? table[key] : undefined);

/** The mark of an object Pi wrote: by its type, then by its method or its command; undefined when it has none. */
function markOf(object) {
	if (object?.type === "extension_ui_request") {
		return own(UI_METHODS, object.method);
	}
	if (object?.type === "response") {
		return own(RESPONSES, object.command);
	}
	return own(MARKS, object?.type);
}

/** Why an object with the mark `mark` (`waits` or none) ends the attempt. */
function refusalOf(object, mark) {
	const name = (value) => JSON.stringify(value ?? null);
	if (mark === "waits") {
		return `Pi waits for an answer to an extension's ${object.method} request; the runner sends none, since an answer would be a decision the measurement must not take`;
	}
	if (object?.type === "extension_ui_request") {
		return `Pi wrote an extension request of method ${name(object.method)}, which has no mark in pi-rpc.mjs → UI_METHODS`;
	}
	if (object?.type === "response") {
		return `Pi answered a command the runner did not send (${name(object.command)}); it sends only prompt and abort`;
	}
	return `Pi wrote an object of type ${name(object?.type)}, which has no mark in pi-rpc.mjs → MARKS`;
}

/** A run started: by a prompt, or by a wake that an extension sends. */
export const runStarted = (object) => object?.type === "agent_start";

/** The current run ended, and Pi will not go on by itself (docs/rpc.md#L69). */
export const runEnded = (object) => object?.type === "agent_settled";

/** An extension failed; Pi goes on after it. */
export const isExtensionError = (object) => object?.type === "extension_error";

/**
 * Pi's answer to a prompt: `{ accepted: true, disposition }`, or `{ accepted: false, error }`; undefined for any
 * other object.
 */
export function promptAnswer(object) {
	if (object?.type !== "response" || object.command !== "prompt") {
		return undefined;
	}
	return object.success
		? { accepted: true, disposition: object.data.disposition }
		: { accepted: false, error: String(object.error) };
}

/** The text of an assistant message that ended; undefined for other objects and for a message without text. */
export function assistantReply(object) {
	if (object?.type !== "message_end" || object.message?.role !== "assistant") {
		return undefined;
	}
	const content = Array.isArray(object.message.content) ? object.message.content : [];
	const text = content
		.filter((part) => part?.type === "text" && typeof part.text === "string")
		.map((part) => part.text)
		.join("")
		.trim();
	return text === "" ? undefined : text;
}

/** One Pi process in RPC mode. */
class PiSession {
	#child;
	#responseMs;
	#queue = [];
	#failure;
	#wake;
	#due = [];
	#stopping = false;
	#buffer = "";
	#closed;

	constructor(child, responseMs) {
		this.#child = child;
		this.#responseMs = responseMs;
		this.#closed = new Promise((resolve) => {
			child.once("close", resolve);
			child.once("error", (error) => {
				this.#fail(new PiError(`cannot run Pi (${child.spawnfile}): ${error.message}`));
				if (child.pid === undefined) {
					resolve();
				}
			});
		});
		child.once("exit", (code, signal) => {
			if (!this.#stopping) {
				this.#fail(new PiError(`Pi ended before the attempt did (${code === null ? signal : `exit code ${code}`})`));
			}
		});
		child.stdin.on("error", (error) => this.#fail(new PiError(`cannot write to Pi's stdin: ${error.message}`)));
		child.stdout.setEncoding("utf8");
		child.stdout.on("data", (chunk) => this.#read(chunk));
	}

	#fail(error) {
		this.#failure ??= error;
		this.#wake?.();
	}

	#read(chunk) {
		this.#buffer += chunk;
		const lines = this.#buffer.split("\n");
		this.#buffer = lines.pop() ?? "";
		for (const line of lines.filter((text) => text.trim() !== "")) {
			// After a failure nothing more is passed on: the caller reads what came before it, then the error.
			if (this.#failure !== undefined || !this.#take(line)) {
				break;
			}
		}
		this.#wake?.();
	}

	/**
	 * Queues the line's object when its mark is `handled`, passes over a `skipped` one, and fails on any other line, so
	 * that no object without a mark reaches the caller. Returns false after a failure.
	 */
	#take(line) {
		let object;
		try {
			object = JSON.parse(line);
		} catch (error) {
			if (!(error instanceof SyntaxError)) {
				throw error;
			}
			const shown = line.slice(0, 200);
			this.#fail(new PiError(`Pi wrote a line that is not JSON; expected one JSON object per line: ${shown}`, line));
			return false;
		}
		const mark = markOf(object);
		if (mark !== "handled" && mark !== "skipped") {
			this.#fail(new PiError(refusalOf(object, mark), line));
			return false;
		}
		if (mark === "skipped") {
			return true;
		}
		if (object.type === "response" && !this.#answered(object, line)) {
			return false;
		}
		this.#queue.push({ object, line });
		return true;
	}

	/**
	 * Matches a prompt's response to the oldest prompt that waits for one. A second or unrequested response, one without
	 * a boolean "success", or an accepted one without a known disposition is a protocol error; it is not queued, so the
	 * caller never reads it as an answer.
	 */
	#answered(object, line) {
		if (this.#due.length === 0) {
			this.#fail(new PiError(`Pi answered a prompt that was not sent: ${JSON.stringify(object)}`, line));
			return false;
		}
		if (typeof object.success !== "boolean") {
			this.#fail(new PiError(`Pi's response has no boolean "success"; expected ${EXPECTED_RESPONSE}`, line));
			return false;
		}
		const disposition = object.data?.disposition;
		if (object.success && !DISPOSITIONS.includes(disposition)) {
			const named = JSON.stringify(disposition ?? null);
			const expected = DISPOSITIONS.join(", ");
			this.#fail(new PiError(`Pi accepted a prompt with the disposition ${named}; expected ${expected}`, line));
			return false;
		}
		this.#due.shift();
		return true;
	}

	#send(command) {
		this.#child.stdin.write(`${JSON.stringify(command)}\n`);
	}

	/** Sends a prompt; its response must arrive within the response limit (60 s). */
	prompt(message) {
		this.#due.push(Date.now() + this.#responseMs);
		this.#send({ type: "prompt", message });
	}

	/** Stops the current run. */
	abort() {
		this.#send({ type: "abort" });
	}

	/**
	 * The next handled object from Pi's stdout, in order, as `{ object, line }` with the line as Pi wrote it, or
	 * undefined when none came within `waitMs`. Throws a `PiError` when Pi wrote a line without a handled or skipped
	 * mark, ended on its own, or left a prompt unanswered past the response limit.
	 */
	async next(waitMs) {
		const until = Date.now() + waitMs;
		for (;;) {
			if (this.#queue.length > 0) {
				return this.#queue.shift();
			}
			if (this.#failure !== undefined) {
				throw this.#failure;
			}
			const now = Date.now();
			const due = this.#due[0] ?? Number.POSITIVE_INFINITY;
			if (now >= due) {
				throw new PiError(
					`Pi sent no response to a prompt within ${this.#responseMs / 1000} s; expected ${EXPECTED_RESPONSE}`,
				);
			}
			if (now >= until) {
				return undefined;
			}
			await new Promise((resolve) => {
				const timer = setTimeout(resolve, Math.min(until, due) - now);
				this.#wake = () => {
					clearTimeout(timer);
					resolve();
				};
			});
			this.#wake = undefined;
		}
	}

	async #closedWithin(ms) {
		let timer;
		const late = new Promise((resolve) => {
			timer = setTimeout(() => resolve(false), ms);
		});
		const closed = await Promise.race([this.#closed.then(() => true), late]);
		clearTimeout(timer);
		return closed;
	}

	/** Closes stdin, then sends SIGTERM after `termMs` and SIGKILL after `killMs` more, until Pi has ended. */
	async stop({ termMs = TERM_MS, killMs = KILL_MS } = {}) {
		this.#stopping = true;
		this.#child.stdin.end();
		if (await this.#closedWithin(termMs)) {
			return;
		}
		this.#child.kill("SIGTERM");
		if (await this.#closedWithin(killMs)) {
			return;
		}
		this.#child.kill("SIGKILL");
		await this.#closed;
	}
}

/** Starts `<pi> --mode rpc --session-dir <sessionDir> <args>` in `cwd` with `env`; stderr goes to the caller's stderr. */
export function startPi({ pi, sessionDir, args, cwd, env, responseMs = RESPONSE_MS }) {
	const child = spawn(pi, ["--mode", "rpc", "--session-dir", sessionDir, ...args], {
		cwd,
		env,
		stdio: ["pipe", "pipe", "inherit"],
	});
	return new PiSession(child, responseMs);
}
