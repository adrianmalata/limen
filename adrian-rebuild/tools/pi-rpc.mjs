/* PL: Jedyny moduł narzędzi przebudowy, który zna tryb RPC Pi (R-011, D-021). Uruchamia Pi z `--mode rpc` i katalogiem
   sesji w zadanym katalogu i środowisku, wysyła polecenia, oddaje kolejne obiekty JSON ze stdout i zatrzymuje proces
   (zamknięte stdin, po 10 s SIGTERM, po kolejnych 10 s SIGKILL). Protokołu nie ma w źródłach repo, więc nagłówek
   deklaruje używany podzbiór, fake-pi-rpc.mjs implementuje dokładnie go, a krok B.2 na seacie go sprawdza. Linia
   spoza JSON, prompt bez odpowiedzi w 60 s oraz druga albo niezamówiona odpowiedź to błąd z nazwą oczekiwanego
   obiektu, a po błędzie moduł nie oddaje już żadnego obiektu. Stan: działa; test w tools/test-same-task.mjs. */
// The subset of Pi's RPC mode the same-task runner relies on. Pi's sources are not in this repository (the tarballs
// are fetched only in stage 2, plan.md → ## Commands), so the subset is declared here, not read from them; step B.2 of
// plan.md → ## Deployment confirms it on the seat before any attempt counts, and fake-pi-rpc.mjs plays exactly it.
//   Start     <pi> --mode rpc --session-dir <dir> <engine args>: one JSON command per stdin line, one JSON object per
//             stdout line; closing stdin ends Pi.
//   Commands  {"type":"prompt","message":"<text>"}  starts a run with the text as a user message;
//             {"type":"abort"}                      stops the current run.
//   Response  {"type":"response","command":"prompt","success":true}, or "success":false with "error" (e.g. a run is
//             already active), once per prompt.
//   Events    {"type":"agent_start"}                a run started (a prompt, or a wake an extension sends);
//             {"type":"message_end","message":{"role":"assistant","content":[{"type":"text","text":"…"}, …]}};
//             {"type":"agent_end", …}               the run ended.
//   Every other object (the rest of JSON mode's events, a response to abort) is passed on and not interpreted.
import { spawn } from "node:child_process";

/** Pi broke the declared protocol, could not start or ended on its own: the runner ends with exit 4. */
export class PiError extends Error {}

const RESPONSE_MS = 60_000;
const TERM_MS = 10_000;
const KILL_MS = 10_000;
const EXPECTED_RESPONSE = '{"type":"response","command":"prompt","success":true} or "success":false with "error"';

const isPromptResponse = (object) => object?.type === "response" && object.command === "prompt";

/** A run started: by a prompt, or by a wake that an extension sends. */
export const runStarted = (object) => object?.type === "agent_start";

/** The current run ended. */
export const runEnded = (object) => object?.type === "agent_end";

/** Pi's answer to a prompt: `{ accepted }` with the refusal's `error`; undefined for any other object. */
export function promptAnswer(object) {
	if (!isPromptResponse(object)) {
		return undefined;
	}
	return object.success ? { accepted: true } : { accepted: false, error: String(object.error) };
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
			if (this.#failure !== undefined) {
				break;
			}
			let object;
			try {
				object = JSON.parse(line);
			} catch (error) {
				if (!(error instanceof SyntaxError)) {
					throw error;
				}
				this.#fail(
					new PiError(`Pi wrote a line that is not JSON; expected one JSON object per line: ${line.slice(0, 200)}`),
				);
				return;
			}
			if (isPromptResponse(object) && !this.#answered(object)) {
				return;
			}
			this.#queue.push(object);
		}
		this.#wake?.();
	}

	/**
	 * Matches a response to the oldest prompt that waits for one. A second or unrequested response, or one without a
	 * boolean "success", is a protocol error; it is not queued, so the caller never reads it as an answer.
	 */
	#answered(object) {
		if (this.#due.length === 0) {
			this.#fail(new PiError(`Pi answered a prompt that was not sent: ${JSON.stringify(object)}`));
			return false;
		}
		if (typeof object.success !== "boolean") {
			this.#fail(new PiError(`Pi's response has no boolean "success"; expected ${EXPECTED_RESPONSE}`));
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
	 * The next object from Pi's stdout, in order, or undefined when none came within `waitMs`. Throws a `PiError` when
	 * Pi wrote a line that is not JSON, ended on its own, or left a prompt unanswered past the response limit.
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
