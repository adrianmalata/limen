import { type ChildProcess, spawn } from "node:child_process";
import { existsSync, watch } from "node:fs";
import { appendFile, readFile } from "node:fs/promises";
import { dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { atomicWrite } from "../atomic-write.ts";
import { engineEnvironment, type TransportName, testKnob, transport } from "../config.ts";
import { promptStartNotice } from "../integrations/coordinator-wake.ts";
import { finalizeJob, isFailedStopReason, type JobEnd, requestedEnd } from "../job/finalize.ts";
import { jobMembership } from "../job/group-cabinet.ts";
import { formatDuration } from "../job/job.ts";
import {
	appendLimenLog,
	type DetectedFailure,
	engineStopKind,
	type JobRecord,
	limitReset,
	readRecord,
	refusalDetail,
	textFile,
	transition,
	writeProgress,
} from "../job/record.ts";
import { enqueueSteer } from "../job/steer-inbox.ts";
import { platform, type SignalResult } from "../platform/platform.ts";
import { limitCount } from "../project/limits.ts";
import { argvFor, jobProfile } from "./engine.ts";
import { setUpJob, worktreeMissing } from "./job-setup.ts";
import { jobScope } from "./launcher.ts";
import { processIdentity, stopGraceMs } from "./reap.ts";
import { observeToolStall, ownedToolDescendants, type ToolStallWatch, toolStallMs } from "./stalled-tool.ts";
import { enterStartQueue, waitForStart } from "./start-queue.ts";
import { createStreamParser, type StreamEvent } from "./stream.ts";
import { readWorkerExtensions } from "./worker-extensions.ts";

// Coordinators and `limen picture serve` read the job folder; a streamed delta must not rewrite the same word many
// times a second.
const ACTIVITY_REFRESH_MS = 1_000;
const HOOK = fileURLToPath(new URL("../../hook", import.meta.url));
// A job is one short turn. These bounds stop a silent runaway from burning a session; they are not a review gate.
const DEFAULT_TIMEOUT_MS = 90 * 60_000;
const MAX_TOOL_CALLS = 900;
/** The tool-start cap: `toolCalls` of the project's limits file, read at each tool start, else 900 (R-015). */
const toolCallCap = (): number => limitCount("toolCalls", MAX_TOOL_CALLS);
// biome-ignore lint/complexity/noExcessiveCognitiveComplexity: split pending: internal job runner
// biome-ignore lint/complexity/noExcessiveLinesPerFunction: same split as the line above
export async function runInternalJob(): Promise<void> {
	const jobDir = requiredEnvironment("LIMEN_JOB_DIR");
	const worktree = requiredEnvironment("LIMEN_WORKTREE");
	const taskFile = requiredEnvironment("LIMEN_TASK_FILE");
	const preambleFile = requiredEnvironment("LIMEN_PREAMBLE");
	const jobId = requiredEnvironment("LIMEN_JOB_ID");
	const label = transport("LIMEN_LABEL") || jobId;
	const membership = await jobMembership(jobDir);
	if (
		membership &&
		(membership.run.stopped || Date.now() >= (membership.member?.deadline ?? membership.run.deadline))
	) {
		// A group's deadline is the job's time limit, so its end before the engine starts is a timeout (D-095).
		const detail = "group deadline or stop before engine launch";
		await finalizeJob(jobDir, { state: "failed", failure: { kind: "timeout", detail } });
		return;
	}
	// The spawner started this process in the job's own scope (A-029); outside it, the job's end could not reach what
	// the engine leaves behind, so the job fails before it runs anything.
	const unit = jobScope(jobId);
	const cgroup = platform.ownCgroup();
	if (!cgroup?.endsWith(`/${unit}`)) {
		const detail = `not in its scope: the wrapper runs in cgroup ${cgroup ?? "unknown"}, not ${unit}`;
		await finalizeJob(jobDir, { state: "failed", failure: { kind: "launch", detail } });
		return;
	}
	const preamble = await readFile(preambleFile, "utf8");
	const failLog = (error: unknown) =>
		appendLimenLog(jobDir, `log write failed: ${error instanceof Error ? error.message : String(error)}`).catch(
			() => {},
		);
	// The wrapper got a TERM from outside: a stop's, a manual `kill`'s or systemd's. Only the stop request in the record
	// tells a stop from the others (A-052).
	let termed = false;
	// The wrapper has sent its own process group a TERM, forwarded or at an exhaustion; that TERM comes back to it.
	let groupTermed = false;
	let shutdownDeadline: number | undefined;
	let exhausted: string | undefined;
	let tools = 0;
	let pending = Promise.resolve();
	const note = (line: string) => {
		pending = pending.then(() => appendLimenLog(jobDir, line)).catch(failLog);
	};
	let engineProcess: ChildProcess | undefined;
	const stop = new AbortController();
	// A-020: the first TERM from outside goes on to the whole group once, the engine and its children that did not leave
	// it, and the engine gets the grace before its KILL. The KILL goes to the engine's pid, not to the group, so the
	// wrapper lives on to record the end (R-026, Deviation 1). No TERM disarms a limit: one that runs out in the grace
	// ends the job with its own failure, as the first finisher (A-019).
	process.on("SIGTERM", () => {
		if (groupTermed) {
			return;
		}
		groupTermed = true;
		termed = true;
		stop.abort();
		// A stop's KILL of the group follows its TERM after the same grace, so the Herdr wake must end before it.
		shutdownDeadline ??= Date.now() + stopGraceMs() - 500;
		const group = `process group ${process.pid}`;
		note(signalLine("SIGTERM received", "TERM", group, platform.signalProcessGroup(process.pid, "SIGTERM")));
		// An engine that has not started never starts after the TERM (`endBeforeEngine`). The engine's handle keeps this
		// process alive while it runs, so the timer needs no hold of its own.
		const current = engineProcess;
		if (current?.pid) {
			const pid = current.pid;
			setTimeout(() => {
				// Until Node has reaped the engine, its pid is not free for another process.
				if (current.exitCode === null && current.signalCode === null) {
					note(signalLine("TERM grace elapsed", "KILL", `engine ${pid}`, platform.signalProcess(pid, "SIGKILL")));
				}
			}, stopGraceMs()).unref();
		}
	});
	/**
	 * Ends the job before its engine started, after a TERM or with a stop request in the record; `stage` says where it
	 * stood. The record is read after the TERM, and `limen stop` writes its request before its TERM.
	 */
	const endBeforeEngine = async (stage: string) => {
		await pending;
		const requested = (await readRecord(jobDir))?.stopRequested ?? null;
		await finalizeJob(jobDir, signalledEnding(requested, "SIGTERM", stage), { shutdownDeadline });
	};
	const record = await readRecord(jobDir);
	const profile = jobProfile(record);
	// A group member runs on its group's deadline, so it starts at once.
	const queued = membership ? undefined : await enterStartQueue(jobDir, record);
	// The handshake is the one transition to running, with this process's identity (A-056), its scope (A-029) and, for a
	// queued job, its place in the queue. Spawn waits for it, not for the queue or setup, so it returns before prune and
	// --prepare run.
	// A job stopped or ended before it ran is no longer starting: the transition does not apply, and no engine starts.
	const scope = { unit, cgroup, memoryPeakBytes: null, cpuMicroseconds: null, oomKills: null };
	const running = await transition(jobDir, {
		from: ["starting"],
		to: "running",
		set: { identity: await processIdentity(), queued: queued ?? null, scope },
	});
	if (!running) {
		return;
	}
	const queueEnd = queued ? await waitForStart(jobDir, stop.signal) : "started";
	// A job whose folder went while it was queued has no record to end and no engine to start (D-063 (3)).
	if (queueEnd === "gone") {
		return;
	}
	// Only the TERM handler ends the queue's wait.
	if (queueEnd === "stopped") {
		await endBeforeEngine(" while queued");
		return;
	}
	// A wait past the gate file's failAfter ends the job failed, kind `queue`, unless a stop asked for its end first
	// (A-036, A-052); no engine starts after it.
	if (typeof queueEnd === "object") {
		await pending;
		const requested = (await readRecord(jobDir))?.stopRequested ?? null;
		const queueFailure: JobEnd = { state: "failed", failure: { kind: "queue", detail: queueEnd.failed } };
		await finalizeJob(jobDir, signalledEnding(requested, null) ?? queueFailure, { shutdownDeadline });
		return;
	}
	const notice = await textFile(`${jobDir}/start-notice`);
	if (notice) {
		void promptStartNotice(jobDir, notice).catch(() => {});
	}
	// The forwarded TERM reaches --prepare, which runs in this process group; the check before the spawn ends the job.
	if (transport("LIMEN_SETUP_KEEP")) {
		await setUpJob(jobDir, worktree);
	}
	const missing = worktreeMissing(worktree);
	if (missing) {
		const options = { shutdownDeadline };
		await finalizeJob(jobDir, { state: "failed", failure: { kind: "launch", detail: missing } }, options);
		return;
	}
	// The timeout and a group deadline count from engine start, so time in the start queue never counts against them.
	// Only spawn and continue set it, for --timeout or a group deadline: a spawner's own variable never reaches here.
	const configured = transport("LIMEN_TIMEOUT_MS");
	const configuredTimeout = configured ? Number(configured) : DEFAULT_TIMEOUT_MS;
	const timeoutMs = membership
		? Math.max(1, Math.min(configuredTimeout, (membership.member?.deadline ?? membership.run.deadline) - Date.now()))
		: configuredTimeout;
	let exhaustionTermination = Promise.resolve();
	// The engine has exited and the last of its stream is in the job's files: what the end of the scope waits for.
	const settled = Promise.withResolvers<void>();
	// A limit that runs out ends the job with its own kind (A-016 (1)): `timeout`, `tool-cap` or `stall`.
	const exhaust = (failure: DetectedFailure) => {
		if (exhausted) {
			return;
		}
		exhausted = failure.detail;
		const graceEnd = Date.now() + stopGraceMs();
		exhaustionTermination = (async () => {
			// This TERM comes back to the wrapper too, and its handler leaves it alone: the exhaustion has its own grace.
			groupTermed = true;
			const sent = platform.signalProcessGroup(process.pid, "SIGTERM");
			// The line names the TERM's result, as the TERM handler's do (T-01). A failed write of it goes to `failLog`,
			// which writes a `log write failed` line and gives up when that write fails too.
			await appendLimenLog(jobDir, signalLine(failure.detail, "TERM", `process group ${process.pid}`, sent)).catch(
				failLog,
			);
			// The group gets its grace after the TERM; then the end of the job's scope kills what is left, the engine
			// included when it ignored the TERM, and this wrapper with it (A-029). A KILL of this group would end the
			// wrapper before it ends its scope, so it is only the fallback for an end of the scope that failed: then the
			// engine still ends, and this wrapper's wait for it with it.
			await finalizeJob(
				jobDir,
				{ state: "failed", failure },
				{
					beforeScopeEnd: () => settledBy(settled.promise, graceEnd),
					onScopeNotEnded: () => platform.signalProcessGroup(process.pid, "SIGKILL"),
				},
			);
		})();
	};
	const provider = transport("LIMEN_PROVIDER");
	const model = transport("LIMEN_MODEL");
	const thinking = transport("LIMEN_THINKING");
	const args = argvFor(profile, {
		jobDir,
		label,
		preamble,
		extensions: [
			`${HOOK}/finish.ts`,
			`${HOOK}/steering.ts`,
			`${HOOK}/communication.ts`,
			`${HOOK}/rate-limit.ts`,
			...((await jobMembership(jobDir)) ? [`${HOOK}/group-peer.ts`] : []),
			...(await readWorkerExtensions(jobDir, record)),
		],
		...(provider ? { provider } : {}),
		...(model ? { model } : {}),
		...(thinking ? { thinking } : {}),
		...(transport("LIMEN_CONTINUE") === "1"
			? { continueValue: (await readFile(taskFile, "utf8")).trim() }
			: { taskFile }),
	});
	const childEnvironment = engineEnvironment(process.env, { LIMEN_JOB: "1", LIMEN_JOB_ID: jobId });
	const parser = createStreamParser();
	const seen: Seen = {
		activity: "",
		activityAt: 0,
		assistant: "",
		stop: "",
		stopAt: 0,
		tool: "",
		lastTool: "",
		toolCalls: 0,
		progress: 0,
	};
	const apply = (events: readonly StreamEvent[]) => {
		pending = pending
			.then(() =>
				recordEvents(
					jobDir,
					events,
					() => {
						tools += 1;
						if (tools >= toolCallCap()) {
							exhaust({ kind: "tool-cap", detail: `tool-call cap reached after ${tools} calls` });
						}
						return tools;
					},
					seen,
				),
			)
			.catch(failLog);
	};
	// A TERM or a stop request before this point ends the job here, during its setup, and no engine starts after it
	// (A-020): `termed` is read after the record's read, and nothing waits between it and the spawn, so no TERM can come
	// between them.
	const requestedInSetup = (await readRecord(jobDir))?.stopRequested;
	if (requestedInSetup || termed) {
		await endBeforeEngine(" during setup");
		return;
	}
	const child = spawn(profile.binary, args, {
		cwd: worktree,
		stdio: ["ignore", "pipe", "pipe"],
		env: childEnvironment,
	});
	engineProcess = child;
	// A pipe can cut a multi-byte UTF-8 letter between two chunks; the stream's decoder keeps the cut bytes for the next one.
	child.stdout?.setEncoding("utf8");
	child.stdout?.on("data", (chunk: string) => apply(parser.push(chunk)));
	child.stderr?.on("data", (chunk: Buffer | string) => {
		seen.progress += 1;
		pending = pending.then(() => appendFile(`${jobDir}/log`, chunk.toString())).catch(failLog);
	});
	// Whether the wrapper got a TERM is taken once, at the engine's exit: a TERM after it reached no engine and changes
	// nothing (A-019), also while a process the engine left still holds its pipes. The outcome waits for `close`, so the
	// last of the stream is read first (the D-092 note).
	let termedAtExit: boolean | undefined;
	const outcome = new Promise<EngineOutcome>((resolve) => {
		child.once("error", (error) => resolve({ code: null, signal: null, error, termed }));
		child.once("exit", () => {
			termedAtExit = termed;
		});
		child.once("close", (code, signal) => resolve({ code, signal, termed: termedAtExit ?? termed }));
	});
	await appendLimenLog(jobDir, `worker started, time limit ${formatDuration(timeoutMs)}`);
	const enginePid = child.pid;
	const stallWatch: ToolStallWatch = { tool: "", born: "", started: 0 };
	let observing = false;
	// The record's advisory shows the current observation; the log gets each distinct observation once per run, since a
	// flaky process query alternates its reasons every few seconds and coordinators tail this log.
	let advised = "";
	const logged = new Set<string>();
	const warnUncertain = async (detail: string) => {
		const line = `tool stall observation uncertain: ${detail}`;
		if (line !== advised) {
			advised = line;
			const advisory = { text: line, at: new Date().toISOString() };
			await transition(jobDir, { from: ["running"], set: { advisory } });
		}
		if (!logged.has(line)) {
			logged.add(line);
			await appendLimenLog(jobDir, line);
		}
	};
	const clearUncertain = async () => {
		if (!advised) {
			return;
		}
		advised = "";
		await transition(jobDir, { from: ["running"], set: { advisory: null } });
	};
	const observeStall = async (pid: number) => {
		const identity = await platform.processInfo(pid);
		if (identity.kind !== "present" || identity.process.ppid !== process.pid || identity.process.pgid !== process.pid) {
			stallWatch.previous = undefined;
			stallWatch.started = Date.now();
			await warnUncertain("detached engine ownership unavailable");
			return;
		}
		const result = await observeToolStall(stallWatch, identity.process, `${tools}:${seen.tool}:${seen.progress}`);
		if (result === "uncertain") {
			await warnUncertain("CPU or process identity unavailable");
			return;
		}
		if (result !== "stalled") {
			await clearUncertain();
			return;
		}
		const [owner, engine] = await Promise.all([platform.processInfo(process.pid), platform.processInfo(pid)]);
		if (
			owner.kind !== "present" ||
			owner.process.pgid !== process.pid ||
			engine.kind !== "present" ||
			engine.process.born !== stallWatch.born ||
			engine.process.ppid !== process.pid ||
			engine.process.pgid !== process.pid
		) {
			await warnUncertain("process group ownership changed");
			return;
		}
		const descendants = await ownedToolDescendants(process.pid, owner.process.born);
		if (!descendants?.some((member) => member.pid === pid) || descendants.length < 2) {
			await warnUncertain("child ownership changed before termination");
			return;
		}
		if (
			seen.activity !== "tool" ||
			(await observeToolStall(stallWatch, engine.process, `${tools}:${seen.tool}:${seen.progress}`)) !== "stalled"
		) {
			return;
		}
		await clearUncertain();
		const how = stallWatch.previous?.children.length ? "CPU-idle child" : "child exited";
		exhaust({ kind: "stall", detail: `stalled tool ${seen.tool}: ${how} for ${Math.round(toolStallMs() / 1000)}s` });
	};
	const checkStall = () => {
		if (observing || exhausted || !enginePid) {
			return;
		}
		if (seen.activity !== "tool") {
			void clearUncertain();
			return;
		}
		observing = true;
		void observeStall(enginePid)
			.catch(failLog)
			.finally(() => {
				observing = false;
			});
	};
	const stallTimer = setInterval(checkStall, 3_000);
	const timeout = setTimeout(() => exhaust({ kind: "timeout", detail: `timeout after ${timeoutMs}ms` }), timeoutMs);
	// A model cannot see the clock; one steer at 80% lets it leave a commit or a verdict before the timeout.
	const steerAt = Math.round(timeoutMs * 0.8);
	const deadlineSteer = setTimeout(() => {
		if (exhausted) {
			return;
		}
		const minutes = Math.max(1, Math.round((timeoutMs - steerAt) / 60_000));
		const text = `${minutes} min left before the timeout: commit your work or write your verdict now; mark checks you did not run as unverified.`;
		void enqueueSteer(jobDir, text).catch(failLog);
	}, steerAt);
	const result = await outcome;
	clearTimeout(timeout);
	clearTimeout(deadlineSteer);
	clearInterval(stallTimer);
	apply(parser.flush());
	await pending;
	if (seen.stop) {
		await transition(jobDir, { from: ["running"], set: { stopReason: seen.stop } });
		await appendLimenLog(jobDir, `assistant ${seen.stop}`).catch(() => {});
	}
	settled.resolve();
	if (exhausted) {
		await exhaustionTermination;
		return;
	}
	// Pi exits 143 on a TERM rather than dying by it (E-17), so a TERM the wrapper got by its engine's end names the end.
	// The record is read after that end, so it holds every stop request written before its TERM (A-052). An exit code
	// alone, as Pi's 143 after a TERM sent to it alone, is no signal and keeps kind `exit`.
	await endGate(jobDir);
	const current = await readRecord(jobDir);
	const ending = signalledEnding(current?.stopRequested ?? null, result.termed ? "SIGTERM" : result.signal);
	// The Herdr wake must end before a stop's KILL also when the stop's TERM came after the engine's end.
	const options = { shutdownDeadline };
	if (ending) {
		// The detail names the stop, the TERM or the signal, not how the engine ended, so the log keeps that: Pi's exit 143
		// after a TERM (E-17).
		note(engineEndLine(result));
		await pending;
		await finalizeJob(jobDir, ending, options);
		return;
	}
	// A `finish` handoff already in `result` outranks the words the model wrote after it.
	if (!result.error && result.code === 0 && seen.assistant && !(await textFile(`${jobDir}/result`))) {
		await atomicWrite(`${jobDir}/result`, `${seen.assistant}\n`).catch(() => {});
	}
	await finalizeJob(jobDir, engineEnding(result, seen, current, profile.id), options);
}
export async function failInternalJob(error: unknown): Promise<void> {
	const jobDir = transport("LIMEN_JOB_DIR");
	if (!jobDir) {
		return;
	}
	// An error the wrapper itself throws is Limen's own failure (D-095, the class `internal` of T-02).
	const detail = error instanceof Error ? error.message : String(error);
	await finalizeJob(jobDir, { state: "failed", failure: { kind: "internal", detail } });
}
/**
 * The end of a job whose engine ended by itself, no stop request, TERM or signal deciding it: a spawn error is a
 * `launch` failure, since no engine ran; exit 0 is `done`, or the failure of a failed stop reason; any other exit
 * `exit`. A hook's refusal the record holds (T-32 (4)) makes `done`, `exit` and an `engine-error` stop reason `failed`,
 * kind `engine-error`, while a `quota` stop reason keeps its kind, since the job's first cause stays (A-019) and R-034
 * resumes `quota` jobs.
 */
function engineEnding(result: EngineOutcome, seen: Seen, record: JobRecord | undefined, engine: string): JobEnd {
	if (result.error) {
		return { state: "failed", failure: { kind: "launch", detail: result.error.message } };
	}
	const detail = `worker exited with code ${result.code ?? "unknown"}`;
	const exited: JobEnd = { state: "failed", failure: { kind: "exit", detail } };
	const own =
		result.code === 0 ? (stopFailure(seen, record) ?? { state: "done", detail: `${engine} exited 0` }) : exited;
	if (record?.refusal && !(own.state === "failed" && own.failure.kind === "quota")) {
		return { state: "failed", failure: { kind: "engine-error", detail: refusalDetail(record.refusal) } };
	}
	return own;
}
/**
 * The failure of an engine that stopped on `error` or `aborted` with the provider's text, the one detector of `quota`
 * and an engine's `engine-error` (A-016 (1)); undefined for any other stop reason. The reset time of `quota` is that of
 * the `kendex:rate-limit` event the record holds, else the one the provider's errorMessage names, read at the time the
 * stop reason came (E-9); it stays null when neither gives one (A-016 (4)).
 */
function stopFailure(seen: Seen, record: JobRecord | undefined): JobEnd | undefined {
	if (!isFailedStopReason(seen.stop)) {
		return undefined;
	}
	const kind = engineStopKind(seen.stop);
	if (kind !== "quota") {
		return { state: "failed", failure: { kind, detail: seen.stop } };
	}
	const resetAt = record?.rateLimit?.resetAt ?? limitReset(seen.stop, seen.stopAt);
	return { state: "failed", failure: { kind, detail: seen.stop, resetAt } };
}
/** How the engine ended, and whether the wrapper had got a TERM by then. */
type EngineOutcome = {
	readonly code: number | null;
	readonly signal: NodeJS.Signals | null;
	readonly error?: Error;
	readonly termed: boolean;
};
/**
 * The log line of the engine's own end, which the wrapper writes before the terminal line of an end that a stop
 * request, a TERM or a signal decides (E-17).
 */
function engineEndLine({ code, signal, error }: EngineOutcome): string {
	if (signal) {
		return `engine killed by ${signal}`;
	}
	return error ? `engine error: ${error.message}` : `engine exited with code ${code ?? "unknown"}`;
}
/**
 * The end of a job that no limit exhausted, decided here for each stage of the wrapper (A-020, A-052): a stop request
 * in the record ends the job as `limen stop` asked, whoever finishes first (A-019), so a `done:` stop ends `done`; else
 * `signal`, the TERM the wrapper got or else the signal the engine died by, ends it `failed`, kind `signal`, with the
 * signal's name and `stage`, where the job stood when no engine ran yet. With neither, undefined: the engine's own exit
 * decides.
 */
function signalledEnding(requested: string | null, signal: NodeJS.Signals, stage?: string): JobEnd;
function signalledEnding(requested: string | null, signal: NodeJS.Signals | null, stage?: string): JobEnd | undefined;
function signalledEnding(requested: string | null, signal: NodeJS.Signals | null, stage = ""): JobEnd | undefined {
	if (requested) {
		return requestedEnd(requested);
	}
	return signal ? { state: "failed", failure: { kind: "signal", detail: `killed by ${signal}${stage}` } } : undefined;
}
/**
 * The log line of a signal the TERM handler sent, after `why`, with its result (T-01): a `missing` target had already
 * ended, which is no failure, and a `denied` call is one, named by its signal and its target.
 */
function signalLine(why: string, signal: "TERM" | "KILL", target: string, result: SignalResult): string {
	if (result === "sent") {
		return `${why}; ${signal} sent to ${target}`;
	}
	return result === "missing" ? `${why}; ${target} was gone` : `${why}; ${signal} to ${target} failed: not permitted`;
}
/**
 * The tests' injection point (D-029): with the test knob LIMEN_END_GATE, the wrapper logs that it waits and waits for
 * that file to be created, once its engine ended and before it reads the record, so a test can send it a signal between
 * the two. Limen's own callers never set the knob (T-03).
 */
async function endGate(jobDir: string): Promise<void> {
	const gate = testKnob("LIMEN_END_GATE");
	if (!gate) {
		return;
	}
	const created = Promise.withResolvers<void>();
	const settle = () => {
		if (existsSync(gate)) {
			created.resolve();
		}
	};
	const watcher = watch(dirname(gate), settle);
	await appendLimenLog(jobDir, `engine ended; waiting for the test gate ${gate}`);
	settle();
	await created.promise;
	watcher.close();
}
/** What the wrapper has seen of the engine's stream so far. */
type Seen = {
	activity: string;
	activityAt: number;
	assistant: string;
	stop: string;
	/** When the last assistant message came, the time a limit's text names its reset after (E-9). */
	stopAt: number;
	/** The last tool with its detail, for the stall rule and its messages. */
	tool: string;
	/** The last tool's name and the tool count, as the progress file shows them. */
	lastTool: string;
	toolCalls: number;
	progress: number;
};
async function recordEvents(
	jobDir: string,
	events: readonly StreamEvent[],
	nextCount: () => number,
	seen: Seen,
): Promise<void> {
	for (const event of events) {
		if (event.kind === "tool") {
			seen.activity = "tool";
			seen.tool = event.detail ? `${event.name} ${event.detail}` : event.name;
			seen.lastTool = event.name;
			seen.activityAt = Date.now();
			seen.toolCalls = nextCount();
			await writeProgress(jobDir, { activity: "tool", lastTool: seen.lastTool, toolCalls: seen.toolCalls });
			await appendFile(`${jobDir}/log`, event.detail ? `${event.name} ${event.detail}\n` : `${event.name}\n`);
		} else if (event.kind === "activity") {
			// Every streamed delta reports activity; an unchanged one refreshes the file at most once a second.
			if (seen.activity !== event.name || Date.now() - seen.activityAt >= ACTIVITY_REFRESH_MS) {
				await writeProgress(jobDir, { activity: event.name, lastTool: seen.lastTool, toolCalls: seen.toolCalls });
				seen.activityAt = Date.now();
			}
			if (seen.activity !== event.name) {
				seen.activity = event.name;
				await appendFile(`${jobDir}/log`, `${event.name}\n`);
			}
		} else if (event.kind === "assistant") {
			seen.assistant = event.text;
			seen.stop = event.stopReason ?? "";
			seen.stopAt = Date.now();
			if (event.text) {
				await appendFile(`${jobDir}/log`, `${event.text}\n`);
			}
		} else {
			seen.progress += 1;
			await appendFile(`${jobDir}/log`, `${event.line}\n`);
		}
	}
}
/** Resolves once `done` does, or once `deadline` (epoch milliseconds) passes when that comes first. */
async function settledBy(done: Promise<void>, deadline: number): Promise<void> {
	let timer: NodeJS.Timeout | undefined;
	const passed = new Promise<void>((resolve) => {
		timer = setTimeout(resolve, Math.max(0, deadline - Date.now()));
	});
	await Promise.race([done, passed]);
	clearTimeout(timer);
}
function requiredEnvironment(name: TransportName): string {
	const value = transport(name);
	if (!value) {
		throw new Error(`internal job wrapper is missing ${name}`);
	}
	return value;
}
