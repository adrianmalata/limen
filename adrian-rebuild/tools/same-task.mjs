/* PL: Narzędzie same-task (R-011, D-021): próba to cała sesja koordynatora Limena uruchomiona bez UI przez tryb RPC Pi
   (pi-rpc.mjs) w czystym klonie projektu bez `origin` i bez obiektów zmiany referencyjnej. Wysyła jedną stałą
   wiadomość właściciela, na każdą turę właściciela odpowiada stałym zdaniem, kończy próbę, gdy po odpowiedzi nic nie
   postąpiło, albo po limicie czasu (abort i limen stop), i zapisuje atomowo result.json: wynik (też unieważnienie przez
   limit albo skażenie), tury, punkty styku z ich definicją, zadania, kandydata, land, tokeny, liczniki M-05,
   nieczytelne linie sesji, błędy rozszerzeń i ścieżkę transkryptu. Przebieg kończy `agent_settled`, a prompt obsłużony
   przez rozszerzenie nie czeka na przebieg (R-091). Przy limicie czasu i przy awarii (kod 4, a dla błędu wewnętrznego
   kod 5 ze stosem) zatrzymuje najpierw Pi, potem działające zadania, a zadanie bez pliku `state` albo `pid` zatrzymuje
   ponownie, gdy ma oba (najwyżej 10 min), albo podaje polecenie do wykonania (R-088); błąd protokołu z linią Pi trafia
   najpierw do protocol-error.json. `evaluate` kładzie ukryte testy na tip kandydata i uruchamia polecenia, `report`
   podaje definicję punktów styku i liczy pass^k. Stan: działa; test w tools/test-same-task.mjs. */
// Usage:
//   node adrian-rebuild/tools/same-task.mjs run --limen <dir> --project <repo> --commit <sha> --reference <sha>
//        --ticket <path> --time-limit <minutes> --out <dir> [--pi <path>] -- <engine args>
//   node adrian-rebuild/tools/same-task.mjs evaluate <out> --tests <dir> --command "<cmd>" [--command "<cmd>" …]
//   node adrian-rebuild/tools/same-task.mjs report <out> [<out> …]
// Exit 0: the file is written (for run, whatever the outcome); 1: refused; 2: usage error; 4: git, the file system or
// Pi failed; 5: an internal error, with its stack (T-02).
import { spawnSync } from "node:child_process";
import { copyFileSync, existsSync, mkdirSync, readdirSync, readFileSync, realpathSync, rmSync } from "node:fs";
import { dirname, join, relative, resolve } from "node:path";
import { writeAtomic } from "./atomic-write.mjs";
import { assistantReply, isExtensionError, PiError, promptAnswer, runEnded, runStarted, startPi } from "./pi-rpc.mjs";
import { bashCommands, callsContaining, quotaLimits, readSession, replies, tokens } from "./same-task-session.mjs";

/** The fixed reply to every owner turn (D-021). */
export const FIXED_REPLY = "Decide this yourself; I am not available.";
/** The one owner message of an attempt (D-021, the wording of Q-2's proposal). */
export const ownerMessage = (ticket) => `Implement ${ticket}; decide engineering questions yourself`;
/** What `touchpoints` counts, as result.json and the report state it (D-045 (3.4)). */
export const TOUCHPOINTS_DEFINITION =
	"touchpoints = answered owner turns; questions asked while a job runs are not counted";

const MINUTE = 60_000;
// D-021 (2): the time limit is 1.5 times the ticket's real time, at least 3 hours.
const MIN_MINUTES = 180;
// The settle time after a run ends, the job poll, Pi's response limit and its stop grace times (ticket items 1, 3.5),
// and the wait for a job's `state` and `pid` files before a second stop (R-011 review round 2; `pid` since R-088).
const TIMING = {
	settleMs: 10_000,
	pollMs: 2_000,
	responseMs: 60_000,
	termMs: 10_000,
	killMs: 10_000,
	stateWaitMs: 10 * MINUTE,
};
const STOP_REASON = "same-task time limit";
const FAILURE_REASON = "same-task runner failure";
// Headless: the coordinator opens no Herdr tabs.
const HERDR = ["HERDR_ENV", "HERDR_PANE_ID", "HERDR_TAB_ID"];
// The start of a shell command: after a separator, then any shell reserved words that open a body or a group (`do`,
// `then`, `else`, `{`, `!`, `(`), assignments and wrappers that run the rest.
const LEAD =
	/(?:^|[\n;&|(`]|\$\()\s*(?:(?:do|then|else|\{|!)\s+|\(\s*|(?:[A-Za-z_]\w*=\S*|nohup|time|command|env|timeout\s+\S+)\s+)*/
		.source;
const SLEEP = new RegExp(`${LEAD}sleep\\b`);
const STATUS_READ = new RegExp(`${LEAD}(?:node\\s+)?(?:\\S*/)?limen\\s+(?:status|jobs)\\b`);
// A line of the footer's labels (T-15), also behind Markdown list, quote and emphasis marks.
const FOOTER_LINE = /^[\s>*_#-]*(?:Done|In progress|Waiting for you)\b/m;
const RUN_FLAGS = ["--limen", "--project", "--commit", "--reference", "--ticket", "--time-limit", "--out", "--pi"];
const USAGE = [
	"usage: same-task.mjs run --limen <dir> --project <repo> --commit <sha> --reference <sha> --ticket <path>",
	"                         --time-limit <minutes> --out <dir> [--pi <path>] -- <engine args>",
	'       same-task.mjs evaluate <out> --tests <dir> --command "<cmd>" [--command "<cmd>" …]',
	"       same-task.mjs report <out> [<out> …]",
].join("\n");

/** A condition the runner checks is not met: exit 1. */
class Refusal extends Error {}
/** A flag, an argument or a subcommand is wrong: exit 2. */
class UsageError extends Error {}
/** A git command failed: exit 4. */
class GitError extends Error {}

function git(args, env) {
	const result = spawnSync("git", args, { env, encoding: "utf8", maxBuffer: 1 << 28 });
	if (result.error !== undefined) {
		throw new GitError(`cannot run git ${args.join(" ")}: ${result.error.message}`);
	}
	return result;
}

function gitOk(args, env) {
	const result = git(args, env);
	if (result.status !== 0) {
		throw new GitError(`git ${args.join(" ")} exited with ${result.status}: ${result.stderr.trim()}`);
	}
	return result.stdout.trim();
}

/** The file's trimmed text, or null when it does not exist. */
function field(path) {
	try {
		return readFileSync(path, "utf8").trim();
	} catch (error) {
		if (error.code === "ENOENT") {
			return null;
		}
		throw error;
	}
}

const json = (value) => `${JSON.stringify(value, null, "\t")}\n`;
const iso = (ms) => new Date(ms).toISOString();
const jobsDir = (clone) => join(clone, ".limen", "jobs");

/** The jobs below `dir` (`.limen/jobs/<id>/`, one file per field), by id; none when the directory does not exist. */
export function readJobs(dir) {
	let entries;
	try {
		entries = readdirSync(dir, { withFileTypes: true });
	} catch (error) {
		if (error.code === "ENOENT") {
			return [];
		}
		throw error;
	}
	return entries
		.filter((entry) => entry.isDirectory() && !entry.name.startsWith("."))
		.map((entry) => entry.name)
		.sort()
		.map((id) => {
			const at = (name) => field(join(dir, id, name));
			return {
				id,
				role: at("role"),
				state: at("state"),
				pid: at("pid"),
				tip: at("tip"),
				started: at("started-at"),
				finished: at("finished-at"),
			};
		});
}

/**
 * A job runs while its state says so, and also before it has a state: at `rebuild-base` `spawn` writes `state` after
 * it creates the worktree and before it starts the wrapper (`src/commands/spawn.ts:445`); a queued job already has
 * `running`.
 */
export const isRunning = (job) => job.state === null || job.state === "running";

/**
 * The clean copy of D-021 (4): `main` at the commit and checked out, no `origin`, no other ref, no reflog and no
 * unreachable object. Refuses when the reference commit is still in the clone, because the agents could then read
 * the merged change.
 */
export function makeClone({ project, commit, reference, clone, env }) {
	gitOk(["clone", "--no-local", "--no-checkout", "--quiet", project, clone], env);
	const inClone = (...args) => gitOk(["-C", clone, ...args], env);
	inClone("checkout", "--quiet", "-B", "main", commit);
	inClone("remote", "remove", "origin");
	for (const ref of inClone("for-each-ref", "--format=%(refname)").split("\n")) {
		if (ref !== "" && ref !== "refs/heads/main") {
			inClone("update-ref", "-d", ref);
		}
	}
	inClone("reflog", "expire", "--expire=now", "--expire-unreachable=now", "--all");
	inClone("gc", "--prune=now", "--quiet");
	if (git(["-C", clone, "cat-file", "-e", reference], env).status === 0) {
		throw new Refusal(
			`the reference ${reference} is still in the clone, so the reference change would be in the agents' reach; use a --commit that does not contain it`,
		);
	}
}

/** The full SHA of a commit of the project; a refusal when there is none. */
function commitOf(project, rev, flag, env) {
	const result = git(["-C", project, "rev-parse", "--verify", "--quiet", `${rev}^{commit}`], env);
	if (result.status !== 0) {
		throw new Refusal(`${flag} ${rev} is not a commit of ${project} ${result.stderr.trim()}`.trim());
	}
	return result.stdout.trim();
}

/** The refusals of item 3.1 that need the project; the arguments with absolute paths and full SHAs. */
function checkRun(options, env) {
	const out = resolve(options.out);
	if (existsSync(out)) {
		throw new Refusal(`--out ${out} exists; every attempt writes a new directory`);
	}
	// The runner creates only <out> itself, so a refusal can remove all that it created (T-38).
	if (!existsSync(dirname(out))) {
		throw new Refusal(`the parent directory of --out ${out} does not exist; create it first`);
	}
	const project = resolve(options.project);
	const commit = commitOf(project, options.commit, "--commit", env);
	const reference = commitOf(project, options.reference, "--reference", env);
	const kind = git(["-C", project, "cat-file", "-t", `${commit}:${options.ticket}`], env);
	if (kind.status !== 0 || kind.stdout.trim() !== "blob") {
		throw new Refusal(`--ticket ${options.ticket} is not a file of ${project} at ${commit}`);
	}
	return { ...options, out, project, limen: resolve(options.limen), commit, reference, clone: join(out, "clone") };
}

/** The runner's environment for the coordinator (item 3.3). */
function coordinatorEnv(base, limen) {
	const env = Object.fromEntries(Object.entries(base).filter(([name]) => !HERDR.includes(name)));
	return { ...env, LIMEN_COORDINATOR: "1", LIMEN_PACKAGE: limen, PATH: `${join(limen, "bin")}:${base.PATH ?? ""}` };
}

/** What counts as progress (item 3.5): the job directories and the clone's `main`. */
function snapshot(clone, env) {
	return {
		jobs: readJobs(jobsDir(clone)).map(({ id }) => id),
		main: gitOk(["-C", clone, "rev-parse", "refs/heads/main"], env),
	};
}

const progressed = (mark, now) => mark.main !== now.main || now.jobs.some((id) => !mark.jobs.includes(id));

/**
 * Applies one handled object from Pi, with its line, to the state of the conversation; decides only from events and
 * fields, never from reply text.
 */
function observe({ object, line }, state, now) {
	if (runStarted(object)) {
		state.active = true;
		state.awaitingStart = false;
		state.refusal = undefined;
	}
	if (runEnded(object)) {
		state.active = false;
		state.quietSince = now();
	}
	if (isExtensionError(object)) {
		state.extensionErrors.push(object);
	}
	state.lastReply = assistantReply(object) ?? state.lastReply;
	const answer = promptAnswer(object);
	if (answer !== undefined) {
		answered(answer, line, state, now);
	}
}

/** Pi's answer to the owner message or to a reply, with its line; an accepted reply is the owner turn's record. */
function answered(answer, line, state, now) {
	const asked = state.asked;
	state.asked = undefined;
	if (!answer.accepted && asked.kind === "owner") {
		throw new PiError(`Pi refused the owner message: ${answer.error}`, line);
	}
	if (!answer.accepted) {
		// A run started in the meantime (a wake): no owner turn; wait for the next quiet moment.
		state.awaitingStart = false;
		state.quietSince = now();
		state.refusal = state.active ? undefined : { error: answer.error, line };
		return;
	}
	if (answer.disposition === "handled") {
		// An extension consumed the prompt, so no run starts for it (`pi-coding-agent@1.5.1/docs/rpc.md#L67`).
		state.awaitingStart = false;
		state.quietSince = now();
	}
	if (asked.kind === "owner") {
		return;
	}
	const previous = state.turns.at(-1);
	if (previous !== undefined) {
		previous.progressAfter = asked.progress;
	}
	state.turns.push({ time: asked.time, lastReply: asked.lastReply, replied: true, progressAfter: null });
	state.replies += 1;
	state.mark = asked.mark;
}

/**
 * At an owner turn (the coordinator idle for the settle time and no job running), ends the attempt when a reply was
 * sent and nothing progressed since, otherwise sends the fixed reply. Returns true when the attempt is finished.
 */
function ownerTurn(pi, state, { clone, env, now, timing }) {
	if (state.active || state.awaitingStart || state.asked !== undefined) {
		return false;
	}
	if (readJobs(jobsDir(clone)).some(isRunning)) {
		state.quietSince = now();
		return false;
	}
	if (now() - state.quietSince < timing.settleMs) {
		return false;
	}
	if (state.refusal !== undefined) {
		throw new PiError(`Pi refused a prompt although no run started: ${state.refusal.error}`, state.refusal.line);
	}
	const mark = snapshot(clone, env);
	const progress = state.mark !== undefined && progressed(state.mark, mark);
	const time = iso(now());
	if (state.replies > 0 && !progress) {
		state.turns.at(-1).progressAfter = false;
		state.turns.push({ time, lastReply: state.lastReply, replied: false, progressAfter: null });
		return true;
	}
	state.asked = { kind: "reply", time, lastReply: state.lastReply, progress, mark };
	state.awaitingStart = true;
	pi.prompt(FIXED_REPLY);
	return false;
}

/** The loop of item 3.5 up to its end: `finished`, or `timeout` at the deadline. */
async function converse(pi, context) {
	const { now, timing, deadline } = context;
	const state = {
		turns: [],
		replies: 0,
		mark: undefined,
		lastReply: "",
		active: false,
		awaitingStart: true,
		asked: { kind: "owner" },
		refusal: undefined,
		quietSince: now(),
		extensionErrors: [],
	};
	pi.prompt(context.ownerMessage);
	for (;;) {
		const left = deadline - now();
		if (left <= 0) {
			return { end: "timeout", state, endedAt: now() };
		}
		const next = await pi.next(Math.min(timing.pollMs, left));
		if (next !== undefined) {
			observe(next, state, now);
		}
		if (ownerTurn(pi, state, context)) {
			return { end: "finished", state, endedAt: now() };
		}
	}
}

/** `limen stop <id> <reason>` in the clone; a failed stop is recorded and named, not hidden. */
function stopOne({ clone, limen, coordinator, err }, id, reason) {
	const result = spawnSync(join(limen, "bin", "limen"), ["stop", id, reason], {
		cwd: clone,
		env: coordinator,
		encoding: "utf8",
	});
	const stop = { id, exit: result.status, error: result.error?.message ?? (result.stderr.trim() || null) };
	if (stop.exit !== 0) {
		err(`same-task: limen stop ${id} failed (exit ${stop.exit}): ${stop.error}`);
	}
	return stop;
}

/** The file a running job still lacks for `limen stop` at `rebuild-base`: `state`, then `pid`; undefined when none. */
const missingForStop = (job) => (job.state === null ? "state" : job.pid === null ? "pid" : undefined);

/**
 * `limen stop` for every running job, one record per call. At `rebuild-base` the stop reads the job's `state` file,
 * then its `pid` file (`src/commands/stop.ts:32`), so it cannot end a job before `spawn` has written `state`
 * (`src/commands/spawn.ts:445`) and its wrapper has written `pid`. A wrapper that owes setup or queues writes it at
 * once (`src/runtime/wrapper.ts:102`), which covers every job `spawn` starts, since `spawn` passes `LIMEN_SETUP_KEEP`
 * (`src/commands/spawn.ts:355`); one with neither, as `limen continue` without setup starts, writes it after its
 * engine starts (`src/runtime/wrapper.ts:255`). A queued job has both. A job whose stop failed for lack of one of
 * them is polled until it has both, for at most `timing.stateWaitMs`, and stopped again; one that still lacks a file
 * is named with the command to run (R-088).
 */
async function stopJobs(context, reason) {
	const { clone, limen, now, timing, err } = context;
	const running = readJobs(jobsDir(clone)).filter(isRunning);
	const stops = running.map(({ id }) => stopOne(context, id, reason));
	let waiting = running.filter((job, index) => stops[index].exit !== 0 && missingForStop(job) !== undefined);
	const until = now() + timing.stateWaitMs;
	while (waiting.length > 0) {
		const jobs = new Map(readJobs(jobsDir(clone)).map((job) => [job.id, job]));
		const ready = waiting.filter(({ id }) => jobs.get(id)?.state === "running" && jobs.get(id).pid !== null);
		for (const { id } of ready) {
			stops.push(stopOne(context, id, reason));
		}
		waiting = waiting
			.filter(({ id }) => jobs.has(id) && isRunning(jobs.get(id)) && missingForStop(jobs.get(id)) !== undefined)
			.map(({ id }) => jobs.get(id));
		if (waiting.length === 0 || now() >= until) {
			break;
		}
		await new Promise((resolve) => setTimeout(resolve, timing.pollMs));
	}
	for (const job of waiting) {
		const missing = missingForStop(job);
		const next = `cd ${clone} && ${join(limen, "bin", "limen")} stop ${job.id} "${reason}"`;
		err(
			`same-task: job ${job.id} still has no ${missing} after ${timing.stateWaitMs / 1000} s, so limen stop cannot end it; run: ${next}`,
		);
		stops.push({ id: job.id, exit: null, error: `no ${missing} file`, next });
	}
	return stops;
}

/** Stops Pi, so that no wake can start a coordinator run that spawns a job the stops that follow miss (R-088). */
const stopPi = (pi, { timing }) => pi.stop({ termMs: timing.termMs, killMs: timing.killMs });

/** Item 3.6: abort the run, stop Pi, then stop every running job. */
async function timeUp(pi, { state }, context) {
	pi.abort();
	await stopPi(pi, context);
	const stops = await stopJobs(context, STOP_REASON);
	const { clone, env } = context;
	const last = state.turns.at(-1);
	if (last?.replied && last.progressAfter === null) {
		last.progressAfter = progressed(state.mark, snapshot(clone, env));
	}
	return stops;
}

/**
 * Item 3.7: quota-limit errors, and tool calls that name the project path or the reference SHA. Both name checks
 * ignore the attempt's own `--out` path, which the clone's absolute paths contain.
 */
function voidEvidence(sessions, { project, reference, out }) {
	const own = [...new Set([out, realpathSync(out)])];
	const paths = [...new Set([project, realpathSync(project)])];
	const sha = reference.slice(0, 7);
	const limit = [];
	const contaminated = [];
	for (const { session, messages } of sessions) {
		limit.push(...quotaLimits(messages).map((text) => ({ session, text })));
		const named = [
			...callsContaining(messages, sha, own).map((tool) => ({ session, tool, names: "reference SHA" })),
			...paths.flatMap((path) =>
				callsContaining(messages, path, own).map((tool) => ({ session, tool, names: "project path" })),
			),
		];
		contaminated.push(...named);
	}
	return { limit, contaminated };
}

/** M-05 from the coordinator's session: sleep calls, status reads and replies with a footer line, beside the replies. */
function m05(messages) {
	const commands = bashCommands(messages);
	const texts = replies(messages);
	return {
		sleepCalls: commands.filter((command) => SLEEP.test(command)).length,
		statusReads: commands.filter((command) => STATUS_READ.test(command)).length,
		footerReplies: texts.filter((text) => FOOTER_LINE.test(text)).length,
		replies: texts.length,
	};
}

/** The newest `done` worker job by finish time, or null. */
function newestDoneWorker(jobs) {
	const done = jobs.filter(({ role, state }) => role === "worker" && state === "done");
	done.sort((a, b) => String(a.finished).localeCompare(String(b.finished)));
	const job = done.at(-1);
	return job === undefined ? null : { id: job.id, tip: job.tip };
}

/** The outcome, the final state of the clone and the counts of item 3.8. */
function summarize(settings, ending, stops) {
	const { clone, out, env, started } = settings;
	const jobs = readJobs(jobsDir(clone));
	const transcript = join(out, "session");
	const read = readSession(transcript);
	const coordinator = read.messages;
	const jobSessions = jobs.map(({ id }) => ({
		session: `job ${id}`,
		...readSession(join(jobsDir(clone), id, "session")),
	}));
	const sessionErrors = [...read.errors, ...jobSessions.flatMap(({ errors }) => errors)];
	const evidence = voidEvidence([{ session: "coordinator", messages: coordinator }, ...jobSessions], settings);
	let outcome = ending.end;
	if (evidence.limit.length > 0) {
		outcome = "void-limit";
	}
	if (evidence.contaminated.length > 0) {
		outcome = "void-contaminated";
	}
	const candidate = newestDoneWorker(jobs);
	const landed =
		candidate?.tip != null &&
		git(["-C", clone, "merge-base", "--is-ancestor", candidate.tip, "refs/heads/main"], env).status === 0;
	return {
		outcome,
		end: ending.end,
		voidEvidence: evidence,
		arguments: settings.arguments,
		started: iso(started),
		ended: iso(ending.endedAt),
		elapsedSeconds: Math.round((ending.endedAt - started) / 100) / 10,
		ownerMessage: settings.ownerMessage,
		ownerTurns: ending.state.turns,
		touchpoints: ending.state.replies,
		touchpointsDefinition: TOUCHPOINTS_DEFINITION,
		transcript,
		extensionErrors: ending.state.extensionErrors,
		jobs,
		rounds: jobs.filter(({ role }) => role === "reviewer").length,
		candidate,
		landed,
		main: gitOk(["-C", clone, "rev-parse", "refs/heads/main"], env),
		tokens: { coordinator: tokens(coordinator), jobs: tokens(jobSessions.flatMap(({ messages }) => messages)) },
		m05: m05(coordinator),
		replies: replies(coordinator),
		stops,
		sessionErrors,
	};
}

/**
 * When the conversation fails, Pi is stopped and then every running job, as at the time limit, so that they stop
 * using the shared subscription; the jobs stopped are named, and `stopJobs` names each stop that failed. The caller
 * then reports the failure itself, so a failure to stop is reported beside it, never in its place.
 */
async function stopAfterFailure(pi, context) {
	try {
		await stopPi(pi, context);
		const stopped = (await stopJobs(context, FAILURE_REASON)).filter(({ exit }) => exit === 0);
		if (stopped.length > 0) {
			context.err(`same-task: stopped the running jobs: ${stopped.map(({ id }) => id).join(", ")}`);
		}
	} catch (error) {
		context.err(`same-task: cannot stop the running jobs in ${context.clone}: ${error.message}`);
	}
}

/**
 * When the failure is about a line Pi wrote, writes `<out>/protocol-error.json` with the reason and the line, and
 * names the file (D-045 (3.2)). A failed write is named beside the failure, never in its place, so that Pi and the
 * jobs are still stopped.
 */
function keepProtocolError(error, { out, err }) {
	if (!(error instanceof PiError) || error.line === undefined) {
		return;
	}
	const file = join(out, "protocol-error.json");
	try {
		writeAtomic(file, json({ reason: error.message, line: error.line }));
		err(`same-task: wrote the reason and Pi's line to ${file}`);
	} catch (writeError) {
		err(`same-task: cannot write ${file}: ${writeError.message}`);
	}
}

/** One attempt (items 3.1–3.8): the clone, the coordinator, the conversation, the end and result.json. */
async function attemptOnce(options, deps) {
	const { env = process.env, now = Date.now, err = console.error, out: print = console.log } = deps;
	const timing = { ...TIMING, ...deps.timing };
	const checked = checkRun(options, env);
	mkdirSync(checked.out);
	try {
		makeClone({ ...checked, env });
	} catch (error) {
		if (error instanceof Refusal) {
			rmSync(checked.out, { recursive: true, force: true });
		}
		throw error;
	}
	const sessionDir = join(checked.out, "session");
	mkdirSync(sessionDir);
	const coordinator = coordinatorEnv(env, checked.limen);
	const pi = startPi({
		pi: options.pi ?? "pi",
		sessionDir,
		args: options.engineArgs,
		cwd: checked.clone,
		env: coordinator,
		responseMs: timing.responseMs,
	});
	const started = now();
	const context = { ...checked, env, coordinator, now, timing, err, deadline: started + options.timeLimitMs };
	context.ownerMessage = ownerMessage(options.ticket);
	let ending;
	let stops = [];
	try {
		ending = await converse(pi, context);
		if (ending.end === "timeout") {
			stops = await timeUp(pi, ending, context);
		}
	} catch (error) {
		keepProtocolError(error, context);
		await stopAfterFailure(pi, context);
		throw error;
	} finally {
		await pi.stop({ termMs: timing.termMs, killMs: timing.killMs });
	}
	const given = { ...options, out: checked.out, timeLimitMinutes: options.timeLimitMs / MINUTE };
	const settings = { ...context, started, arguments: given };
	const result = summarize(settings, ending, stops);
	writeAtomic(join(checked.out, "result.json"), json(result));
	print(`same-task: ${result.outcome}, ${result.touchpoints} touchpoints; wrote ${join(checked.out, "result.json")}`);
}

/** `result.json` of an attempt; a refusal when the attempt wrote none. */
function readResult(out) {
	const text = field(join(out, "result.json"));
	if (text === null) {
		throw new Refusal(`${out} has no result.json; run the attempt first`);
	}
	return JSON.parse(text);
}

/** Copies every file below `from` to the same relative path below `to`; returns the relative paths. */
function layOver(from, to) {
	const files = readdirSync(from, { recursive: true, withFileTypes: true })
		.filter((entry) => entry.isFile())
		.map((entry) => relative(from, join(entry.parentPath, entry.name)))
		.sort();
	for (const path of files) {
		mkdirSync(dirname(join(to, path)), { recursive: true });
		copyFileSync(join(from, path), join(to, path));
	}
	return files;
}

/** `evaluate`: the hidden tests over the candidate's tip in a detached worktree, each command, evaluation.json. */
function evaluateOnce(outDir, { tests, commands }, deps) {
	const { env = process.env, now = Date.now, stdio = ["ignore", 2, 2], out: print = console.log } = deps;
	const out = resolve(outDir);
	const { candidate } = readResult(out);
	if (candidate?.tip == null) {
		throw new Refusal(`${out}/result.json has no candidate (no done worker job with a tip); nothing to evaluate`);
	}
	const work = join(out, "eval");
	if (existsSync(work)) {
		throw new Refusal(`${work} exists; evaluate runs once per attempt`);
	}
	const hidden = resolve(tests);
	if (!existsSync(hidden)) {
		throw new Refusal(`--tests ${hidden} does not exist`);
	}
	gitOk(["-C", join(out, "clone"), "worktree", "add", "--quiet", "--detach", work, candidate.tip], env);
	const files = layOver(hidden, work);
	const ran = commands.map((command) => {
		const start = now();
		const result = spawnSync("sh", ["-c", command], { cwd: work, env, stdio });
		const seconds = Math.round((now() - start) / 100) / 10;
		return { command, exit: result.status, signal: result.signal, seconds };
	});
	const evaluation = { candidate, tests: hidden, files, commands: ran, pass: ran.every(({ exit }) => exit === 0) };
	writeAtomic(join(out, "evaluation.json"), json(evaluation));
	print(`same-task: pass ${evaluation.pass ? "yes" : "no"}; wrote ${join(out, "evaluation.json")}`);
}

/** `report`: the touchpoint definition, one line per attempt, then pass^K over the attempts that are not void. */
function reportOnce(outs, { out: print = console.log }) {
	const rows = outs.map((dir) => {
		const { outcome } = readResult(resolve(dir));
		const evaluation = field(join(resolve(dir), "evaluation.json"));
		const isVoid = String(outcome).startsWith("void-");
		const pass = outcome === "finished" && evaluation !== null && JSON.parse(evaluation).pass === true;
		return { dir, outcome, isVoid, pass };
	});
	print(TOUCHPOINTS_DEFINITION);
	for (const { dir, outcome, isVoid, pass } of rows) {
		print(isVoid ? `${dir}: ${outcome}; void, runs again` : `${dir}: ${outcome}; pass: ${pass ? "yes" : "no"}`);
	}
	const counted = rows.filter(({ isVoid }) => !isVoid);
	const passed = counted.filter(({ pass }) => pass).length;
	const voids = rows.filter(({ isVoid }) => isVoid).map(({ dir }) => dir);
	const all = counted.length > 0 && passed === counted.length;
	const named = voids.length > 0 ? ` (${voids.join(", ")})` : "";
	print(
		`passed ${passed} of ${counted.length}; pass^${counted.length}: ${all ? "yes" : "no"}; void: ${voids.length}${named}`,
	);
}

/** Splits `argv` into flags of `allowed` (one value each; a flag of `repeated` collects a list) and positionals. */
function parseFlags(argv, allowed, repeated = []) {
	const values = {};
	const positional = [];
	for (let index = 0; index < argv.length; index += 1) {
		const name = argv[index];
		if (!name.startsWith("--")) {
			positional.push(name);
			continue;
		}
		const value = argv[index + 1];
		if (!allowed.includes(name)) {
			throw new UsageError(`unknown flag ${name}`);
		}
		if (value === undefined || value.startsWith("--")) {
			throw new UsageError(`${name} needs a value`);
		}
		index += 1;
		if (repeated.includes(name)) {
			values[name] = [...(values[name] ?? []), value];
		} else if (name in values) {
			throw new UsageError(`${name} is given twice`);
		} else {
			values[name] = value;
		}
	}
	return { values, positional };
}

/** `run`'s flags; the time limit's floor is a refusal (D-021 (2)). */
function parseRun(argv) {
	const split = argv.indexOf("--");
	const own = split < 0 ? argv : argv.slice(0, split);
	const { values, positional } = parseFlags(own, RUN_FLAGS);
	const missing = RUN_FLAGS.filter((name) => name !== "--pi" && values[name] === undefined);
	if (missing.length > 0 || positional.length > 0) {
		throw new UsageError(missing.length > 0 ? `missing ${missing.join(", ")}` : `unexpected ${positional[0]}`);
	}
	const minutes = Number(values["--time-limit"]);
	if (!Number.isFinite(minutes) || minutes <= 0) {
		throw new UsageError(`--time-limit ${values["--time-limit"]} is not a number of minutes`);
	}
	if (minutes < MIN_MINUTES) {
		throw new Refusal(
			`--time-limit ${minutes} is below ${MIN_MINUTES} minutes; D-021 (2) sets 1.5 times the ticket's time, at least 3 hours`,
		);
	}
	return {
		limen: values["--limen"],
		project: values["--project"],
		commit: values["--commit"],
		reference: values["--reference"],
		ticket: values["--ticket"],
		timeLimitMs: minutes * MINUTE,
		out: values["--out"],
		pi: values["--pi"],
		engineArgs: split < 0 ? [] : argv.slice(split + 1),
	};
}

function parseEvaluate(argv) {
	const { values, positional } = parseFlags(argv, ["--tests", "--command"], ["--command"]);
	if (positional.length !== 1 || values["--tests"] === undefined || values["--command"] === undefined) {
		throw new UsageError("evaluate takes one <out>, --tests <dir> and at least one --command");
	}
	return [positional[0], { tests: values["--tests"], commands: values["--command"] }];
}

function parseReport(argv) {
	const { positional } = parseFlags(argv, []);
	if (positional.length === 0) {
		throw new UsageError("report takes at least one <out>");
	}
	return positional;
}

/**
 * The exit code of a failure (T-02), with its message on stderr: 4 for git, the file system (a system error, which
 * names its `syscall`) and Pi; 5 with the stack for anything else, which is a fault of the runner itself.
 */
function failure(error, err) {
	if (error instanceof UsageError) {
		err(`same-task: ${error.message}\n${USAGE}`);
		return 2;
	}
	if (error instanceof Refusal) {
		err(`same-task: refused: ${error.message}`);
		return 1;
	}
	if (error instanceof PiError || error instanceof GitError || typeof error?.syscall === "string") {
		err(`same-task: failed: ${error.message}`);
		return 4;
	}
	err(`same-task: internal error: ${error?.stack ?? String(error)}`);
	return 5;
}

async function guarded(work, err = console.error) {
	try {
		await work();
		return 0;
	} catch (error) {
		return failure(error, err);
	}
}

function guardedSync(work, err = console.error) {
	try {
		work();
		return 0;
	} catch (error) {
		return failure(error, err);
	}
}

/** One attempt with the time limit in `options.timeLimitMs`; the tests give short times in `deps.timing`. */
export const runAttempt = (options, deps) => guarded(() => attemptOnce(options, deps), deps.err);
/** `evaluate <out>` with `{ tests, commands }`. */
export const evaluate = (out, request, deps) => guardedSync(() => evaluateOnce(out, request, deps), deps.err);
/** `report <out>…`. */
export const report = (outs, deps) => guardedSync(() => reportOnce(outs, deps), deps.err);

/** The command line: `run`, `evaluate` or `report`. */
export function main(argv, deps = {}) {
	const [command, ...rest] = argv;
	return guarded(async () => {
		if (command === "run") {
			await attemptOnce(parseRun(rest), deps);
		} else if (command === "evaluate") {
			evaluateOnce(...parseEvaluate(rest), deps);
		} else if (command === "report") {
			reportOnce(parseReport(rest), deps);
		} else {
			throw new UsageError(`unknown command ${command ?? "(none)"}`);
		}
	}, deps.err);
}

if (import.meta.main) {
	process.exitCode = await main(process.argv.slice(2));
}
