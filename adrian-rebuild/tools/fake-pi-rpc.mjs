/* PL: Fałszywy Pi dla testów narzędzia same-task (R-011): mówi dokładnie podzbiorem trybu RPC zadeklarowanym
   w pi-rpc.mjs (jeden JSON na linię stdin i stdout, `prompt` z odpowiedzią `response`, `abort`, zdarzenia
   `agent_start`, `message_end`, `agent_end`) i odgrywa scenariusz z pliku podanego w `--scenario`. Na każdy prompt
   wykonuje kroki przebiegu: zakłada i kończy katalog zadania w .limen/jobs/, robi commit i przesuwa main w klonie,
   dopisuje do pliku sesji odpowiedź, wywołanie basha, linię spoza JSON albo błąd limitu (w errorMessage albo
   w tekście tury); potrafi
   też sam zacząć przebieg po czasie (pobudka), odmówić promptu, bo przebieg już trwa, odpowiedzieć dwa razy albo nie
   odpowiedzieć wcale, także po wykonaniu kroków przebiegu. Zadanie dostaje `pid` jak po starcie wrappera (chyba że
   krok podaje `pid: null`), a zamknięcie stdin zapisuje w rejestrze (R-088). Stan: działa. */
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

/** One session entry, in the shape `src/job/usage.ts` and `src/job/session-commands.ts` read. */
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
};

/** A run: `agent_start`, the steps in order, `agent_end`. */
function play(steps = []) {
	emit({ type: "agent_start" });
	for (const step of steps) {
		STEPS[step.do](step);
	}
	emit({ type: "agent_end", messages: [] });
}

/** After a run, a wake that follows it starts by itself after its delay. */
function scheduleWake() {
	const next = runs[cursor];
	if (next?.trigger === "wake") {
		cursor += 1;
		setTimeout(() => {
			play(next.steps);
			scheduleWake();
		}, next.after);
	}
}

/**
 * A prompt plays the next run when that run waits for one. `respond: false` never answers (a protocol error), but plays
 * the run's steps when it has any, so a job can be running when the error comes; `respondTwice: true` answers twice.
 * `refuse: true` acts out a wake that started a run just before the prompt arrived, so the prompt is refused. A prompt
 * past the scenario's end, or one sent while a wake is due, gets an empty run.
 */
function prompt() {
	const next = runs[cursor];
	if (next?.trigger !== "prompt") {
		emit({ type: "response", command: "prompt", success: true });
		play([]);
		return;
	}
	cursor += 1;
	if (next.respond === false) {
		if (next.steps !== undefined) {
			play(next.steps);
		}
		return;
	}
	if (next.refuse === true) {
		emit({ type: "agent_start" });
		emit({ type: "response", command: "prompt", success: false, error: "Agent is already processing" });
		for (const step of next.steps ?? []) {
			STEPS[step.do](step);
		}
		emit({ type: "agent_end", messages: [] });
	} else {
		emit({ type: "response", command: "prompt", success: true });
		if (next.respondTwice === true) {
			emit({ type: "response", command: "prompt", success: true });
		}
		play(next.steps);
	}
	scheduleWake();
}

const input = createInterface({ input: process.stdin });
input.on("line", (line) => {
	const command = JSON.parse(line);
	record({ command });
	if (command.type === "prompt") {
		prompt();
	}
});
// Pi ends when its stdin closes; a wake that is still due does not keep it alive. The record of the close lets a test
// tell whether Pi was stopped before the jobs (R-088).
input.on("close", () => {
	record({ closed: true });
	process.exit(0);
});
