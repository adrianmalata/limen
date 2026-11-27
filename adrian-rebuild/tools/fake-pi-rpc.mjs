/* PL: Fałszywy Pi dla testów narzędzia same-task (R-011, R-091): mówi słownikiem trybu RPC Pi 1.5.1 z pi-rpc.mjs
   (jeden JSON na linię, odpowiedź na prompt z `data.disposition`, przebieg od `agent_start` przez `agent_end`
   z `willRetry` do `agent_settled`) i odgrywa scenariusz z pliku `--scenario`. Kroki przebiegu zakładają i kończą
   zadania w .limen/jobs/, przesuwają main, dopisują do sesji odpowiedź, wywołanie basha, linię spoza JSON albo błąd
   limitu, a od R-091 piszą dowolny obiekt albo linię na stdout, błąd rozszerzenia i ponowienie z przerwą; prompt
   w trakcie przebiegu dostaje odmowę jak w Pi. Potrafi też pobudkę, odmowę, podwójną albo brak odpowiedzi
   i zapisuje zamknięcie stdin (R-088). Stan: działa. */
// Usage (by the tests, through a small executable wrapper): <wrapper> --mode rpc --session-dir <dir> --scenario <file>
// The scenario is JSON: { "record": "<file>", "runs": [ { "trigger": "prompt" | "wake", … } ] }; see prompt() below.
import { spawnSync } from "node:child_process";
import { appendFileSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { createInterface } from "node:readline";

const IDENTITY = ["-c", "user.name=fake-pi", "-c", "user.email=fake-pi@example.invalid"];
const ZERO = { input: 0, output: 0, cacheRead: 0, cacheWrite: 0 };
// A synthetic copy of the quota-limit text's format (T-31 (3)), with no real reset time.
const LIMIT_TEXT = "You've hit your session limit · resets 3am";
// Pi's refusal of a prompt sent while a run is active (`pi-coding-agent@1.5.1/dist/core/agent-session.js#L1751`).
const BUSY = "Agent is already processing. Specify streamingBehavior ('steer' or 'followUp') to queue the message.";

function option(argv, name) {
	const at = argv.indexOf(name);
	return at < 0 ? undefined : argv[at + 1];
}

const argv = process.argv.slice(2);
if (option(argv, "--mode") !== "rpc" || option(argv, "--session-dir") === undefined) {
	process.stderr.write(`fake-pi-rpc: expected --mode rpc --session-dir <dir>, got ${argv.join(" ")}\n`);
	process.exit(2);
}
const sessionDir = option(argv, "--session-dir");
const scenario = JSON.parse(readFileSync(option(argv, "--scenario"), "utf8"));
const runs = scenario.runs;
let cursor = 0;
let calls = 0;
// From `agent_start` to just before `agent_settled`, as Pi keeps a run active (`agent-session.js#L1487-L1537`,
// `#L738-L741`).
let playing = false;

const record = (entry) => appendFileSync(scenario.record, `${JSON.stringify(entry)}\n`);
const emit = (object) => process.stdout.write(`${JSON.stringify(object)}\n`);
const environment = ["LIMEN_COORDINATOR", "LIMEN_PACKAGE", "PATH", "HERDR_ENV", "HERDR_PANE_ID", "HERDR_TAB_ID"];
record({ argv, cwd: process.cwd(), env: Object.fromEntries(environment.map((name) => [name, process.env[name]])) });

function git(...args) {
	const result = spawnSync("git", [...IDENTITY, ...args], { encoding: "utf8" });
	if (result.status !== 0) {
		throw new Error(`fake-pi-rpc: git ${args.join(" ")}: ${result.stderr}`);
	}
	return result.stdout.trim();
}

const jobDir = (job) => join(".limen", "jobs", job);

/** The session file of the coordinator, or of a job. */
function sessionFile(job) {
	const dir = job === undefined ? sessionDir : join(jobDir(job), "session");
	mkdirSync(dir, { recursive: true });
	return join(dir, "fake.jsonl");
}

/** One session entry, in the shape that `src/job/usage.ts` reads. */
function entry(job, message) {
	appendFileSync(sessionFile(job), `${JSON.stringify({ type: "message", timestamp: new Date(), message })}\n`);
	if (job === undefined && message.role === "assistant") {
		emit({ type: "message_end", message });
	}
}

function assistant(step, content, extra = {}) {
	const usage = { ...ZERO, ...step.usage };
	entry(step.job, { role: "assistant", provider: "fake", model: "fake-model", content, usage, ...extra });
}

const STEPS = {
	spawn(step) {
		mkdirSync(join(jobDir(step.job), "session"), { recursive: true });
		writeFileSync(join(jobDir(step.job), "role"), `${step.role}\n`);
		writeFileSync(join(jobDir(step.job), "started-at"), `${new Date().toISOString()}\n`);
		if (step.state !== null) {
			writeFileSync(join(jobDir(step.job), "state"), "running\n");
		}
		// A set-up job has the pid its wrapper wrote; `pid: null` acts out the window before that write (R-088).
		if (step.state !== null && step.pid !== null) {
			writeFileSync(join(jobDir(step.job), "pid"), "4241\n");
		}
	},
	finish(step) {
		if (step.state === "done") {
			const tip = git("commit-tree", "main^{tree}", "-p", "main", "-m", `job ${step.job}`);
			git("update-ref", `refs/heads/limen/${step.job}`, tip);
			writeFileSync(join(jobDir(step.job), "tip"), `${tip}\n`);
		}
		writeFileSync(join(jobDir(step.job), "finished-at"), `${new Date().toISOString()}\n`);
		writeFileSync(join(jobDir(step.job), "state"), `${step.state}\n`);
	},
	land(step) {
		git("merge", "--ff-only", "-q", `refs/heads/limen/${step.job}`);
	},
	reply(step) {
		assistant(step, [{ type: "text", text: step.text }], { stopReason: "stop" });
	},
	bash(step) {
		calls += 1;
		const id = `call-${calls}`;
		assistant(step, [{ type: "toolCall", id, name: "bash", arguments: { command: step.command } }], {
			stopReason: "toolUse",
		});
		entry(step.job, { role: "toolResult", toolCallId: id, toolName: "bash", isError: false, content: [] });
	},
	// A line that is not JSON; once a later step writes to the same file, it is a middle line, not a torn last one.
	garbage(step) {
		appendFileSync(sessionFile(step.job), "not a JSON line\n");
	},
	// The limit text in `errorMessage`, or with `in: "text"` in a text part of the error turn.
	limit(step) {
		if (step.in === "text") {
			assistant(step, [{ type: "text", text: LIMIT_TEXT }], { stopReason: "error" });
		} else {
			assistant(step, [], { stopReason: "error", errorMessage: LIMIT_TEXT });
		}
	},
	// `line` as given, or `object` as one JSON line, on stdout: an object Pi writes that the runner skips, waits on or
	// has no mark for, or a line that is not JSON.
	write(step) {
		process.stdout.write(`${step.line ?? JSON.stringify(step.object)}\n`);
	},
	// An extension's error, in the shape `pi-coding-agent@1.5.1/dist/modes/rpc/rpc-mode.js#L267` writes; Pi goes on.
	extensionError(step) {
		emit({ type: "extension_error", extensionPath: step.path, event: step.event, error: step.error });
	},
};

/**
 * An automatic retry: the low-level run ends with `willRetry: true`, and after `after` ms the next one starts with
 * its own `agent_start`, while the run stays active (`agent-session.js#L1513-L1527`, `#L3192-L3227`;
 * `pi-agent-core@1.5.1/dist/agent-loop.js#L73`).
 */
async function retry(step) {
	emit({ type: "agent_end", messages: [], willRetry: true });
	await new Promise((resolve) => setTimeout(resolve, step.after));
	emit({ type: "agent_start" });
}

/** The steps in order; only a retry waits, so a run without one is played at once. */
async function act(steps = []) {
	for (const step of steps) {
		if (step.do === "retry") {
			await retry(step);
		} else {
			STEPS[step.do](step);
		}
	}
}

/** The end of a run that will not retry: `agent_end`, then `agent_settled` once the run is no longer active. */
function settle() {
	emit({ type: "agent_end", messages: [], willRetry: false });
	playing = false;
	emit({ type: "agent_settled", aborted: false });
}

/** A run: `agent_start`, the steps in order, its end. */
async function play(steps) {
	playing = true;
	emit({ type: "agent_start" });
	await act(steps);
	settle();
}

/** Pi's answer to a prompt it accepted, queued or handled (`docs/rpc-commands.md#L35-L40`). */
const accepted = (disposition) => ({ type: "response", command: "prompt", success: true, data: { disposition } });

/** The fake fails loudly on its own fault; the runner then sees Pi end before the attempt did. */
function fail(error) {
	process.stderr.write(`fake-pi-rpc: ${error?.stack ?? String(error)}\n`);
	process.exit(1);
}

/** After a run, a wake that follows it starts by itself after its delay. */
function scheduleWake() {
	const next = runs[cursor];
	if (next?.trigger === "wake") {
		cursor += 1;
		setTimeout(() => {
			play(next.steps).then(scheduleWake).catch(fail);
		}, next.after);
	}
}

/**
 * A prompt plays the next run when that run waits for one, with `disposition` in the response (`started` by default;
 * `handled` answers and starts no run). `respond: false` never answers (a protocol error), but plays the run's steps
 * when it has any, so a job can be running when the error comes; `respondTwice: true` answers twice. `refuse: true`
 * acts out a wake that started a run just before the prompt arrived, so the prompt is refused. A prompt that arrives
 * while a run is active (a retry's delay) is refused as Pi refuses it and takes no run of the scenario. A prompt past
 * the scenario's end, or one sent while a wake is due, gets an empty run.
 */
async function prompt() {
	const next = runs[cursor];
	if (playing) {
		emit({ type: "response", command: "prompt", success: false, error: BUSY });
		return;
	}
	if (next?.trigger !== "prompt") {
		emit(accepted("started"));
		await play([]);
		return;
	}
	cursor += 1;
	if (next.respond === false) {
		if (next.steps !== undefined) {
			await play(next.steps);
		}
		return;
	}
	if (next.refuse === true) {
		playing = true;
		emit({ type: "agent_start" });
		emit({ type: "response", command: "prompt", success: false, error: "Agent is already processing" });
		await act(next.steps);
		settle();
	} else if (next.disposition === "handled") {
		emit(accepted("handled"));
	} else {
		emit(accepted(next.disposition ?? "started"));
		if (next.respondTwice === true) {
			emit(accepted(next.disposition ?? "started"));
		}
		await play(next.steps);
	}
	scheduleWake();
}

const input = createInterface({ input: process.stdin });
input.on("line", (line) => {
	const command = JSON.parse(line);
	record({ command });
	if (command.type === "prompt") {
		prompt().catch(fail);
	}
});
// Pi ends when its stdin closes; a wake that is still due does not keep it alive. The record of the close lets a test
// tell whether Pi was stopped before the jobs (R-088).
input.on("close", () => {
	record({ closed: true });
	process.exit(0);
});
