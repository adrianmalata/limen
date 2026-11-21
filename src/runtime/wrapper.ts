import { spawn } from "node:child_process";
import { appendFile, readFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import { atomicWrite } from "../atomic-write.ts";
import { engineEnvironment, type TransportName, transport, wrapperEnvironment } from "../config.ts";
import { promptStartNotice } from "../integrations/coordinator-wake.ts";
import { finalizeJob, isFailedStopReason, requestedTerminal } from "../job/finalize.ts";
import { jobMembership } from "../job/group-cabinet.ts";
import { formatDuration } from "../job/job.ts";
import { appendLimenLog, readRecord, textFile, transition, writeProgress } from "../job/record.ts";
import { enqueueSteer } from "../job/steer-inbox.ts";
import { platform } from "../platform/platform.ts";
import { limitCount } from "../project/limits.ts";
import { containEscapedDescendants, discoverEscapedDescendants, type JobProcess } from "./contain.ts";
import { argvFor, jobProfile } from "./engine.ts";
import { setUpJob, worktreeMissing } from "./job-setup.ts";
import { processIdentity } from "./reap.ts";
import { observeToolStall, ownedToolDescendants, type ToolStallWatch, toolStallMs } from "./stalled-tool.ts";
import { enterStartQueue, waitForStart } from "./start-queue.ts";
import { createStreamParser, type StreamEvent } from "./stream.ts";
import { readWorkerExtensions } from "./worker-extensions.ts";

const STOP_GRACE_MS = 5_000;
// Coordinators and `limen picture serve` read the job folder; a streamed delta must not rewrite the same word many
// times a second.
const ACTIVITY_REFRESH_MS = 1_000;
const HOOK = fileURLToPath(new URL("../../hook", import.meta.url));
// A job is one short turn. These bounds stop a silent runaway from burning a session; they are not a review gate.
const DEFAULT_TIMEOUT_MS = 90 * 60_000;
const MAX_TOOL_CALLS = 900;
/** The tool-start cap: `toolCalls` of the project's limits file, read at each tool start, else 900 (R-015). */
const toolCallCap = (): number => limitCount("toolCalls", MAX_TOOL_CALLS);
/** Starts a job's wrapper with what the spawner passes; it inherits no transport or removed name (R-015). */
export async function launchWrapper(environment: Readonly<Partial<Record<TransportName, string>>>): Promise<number> {
	const executable = fileURLToPath(new URL("../../bin/limen", import.meta.url));
	const child = spawn(process.execPath, [executable], {
		detached: true,
		stdio: "ignore",
		env: wrapperEnvironment({ ...environment, LIMEN_INTERNAL_RUN: "1" }),
	});
	await new Promise<void>((resolve, reject) => {
		child.once("spawn", resolve);
		child.once("error", reject);
	});
	if (!child.pid) {
		throw new Error("could not start the detached job wrapper");
	}
	child.unref();
	return child.pid;
}
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
		await finalizeJob(jobDir, "failed", "group deadline or stop before engine launch");
		return;
	}
	const preamble = await readFile(preambleFile, "utf8");
	let confirmedToolStall = false;
	let stopRequested = false;
	let shutdownDeadline: number | undefined;
	let exhausted: string | undefined;
	let graceTimer: NodeJS.Timeout | undefined;
	let tools = 0;
	let pending = Promise.resolve();
	const stop = new AbortController();
	process.on("SIGTERM", () => {
		stopRequested = true;
		stop.abort();
		if (!confirmedToolStall) {
			shutdownDeadline ??= Date.now() + STOP_GRACE_MS - 500;
		}
	});
	const record = await readRecord(jobDir);
	const profile = jobProfile(record);
	// A group member runs on its group's deadline, so it starts at once.
	const queued = membership ? undefined : await enterStartQueue(jobDir, record);
	// The handshake is the one transition to running, with this process's identity (A-056) and, for a queued job, its
	// place in the queue. Spawn waits for it, not for the queue or setup, so it returns before prune and --prepare run.
	// A job stopped or ended before it ran is no longer starting: the transition does not apply, and no engine starts.
	const running = await transition(jobDir, {
		from: ["starting"],
		to: "running",
		set: { identity: await processIdentity(), queued: queued ?? null },
	});
	if (!running) {
		return;
	}
	const queueEnd = queued ? await waitForStart(jobDir, stop.signal) : "started";
	// A job whose folder went while it was queued has no record to end and no engine to start (D-063 (3)).
	if (queueEnd === "gone") {
		return;
	}
	if (queueEnd === "stopped") {
		const requested = (await readRecord(jobDir))?.stopRequested;
		const reason = requested || "stopped while queued";
		await finalizeJob(jobDir, requestedTerminal(reason), reason, { shutdownDeadline });
		return;
	}
	const notice = await textFile(`${jobDir}/start-notice`);
	if (notice) {
		void promptStartNotice(jobDir, notice).catch(() => {});
	}
	if (transport("LIMEN_SETUP_KEEP")) {
		await setUpJob(jobDir, worktree);
		if (stopRequested || (await readRecord(jobDir))?.stopRequested) {
			await finalizeJob(jobDir, "stopped", "stopped during setup", { shutdownDeadline });
			return;
		}
	}
	const missing = worktreeMissing(worktree);
	if (missing) {
		await finalizeJob(jobDir, "failed", missing, { shutdownDeadline });
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
	const exhaust = (reason: string, captured?: readonly JobProcess[]) => {
		if (exhausted || stopRequested) {
			return;
		}
		confirmedToolStall = Boolean(captured);
		exhausted = reason;
		exhaustionTermination = (async () => {
			// Capture before TERM while ancestry still proves ownership. A confirmed tool stall
			// includes in-group descendants, not only children that escaped the wrapper group.
			const descendants = captured ?? (await discoverEscapedDescendants(jobDir, process.pid, "during exhaustion"));
			await appendLimenLog(jobDir, `${reason}; sending TERM`).catch(() => {});
			if (!captured) {
				shutdownDeadline = Date.now() + STOP_GRACE_MS - 500;
			}
			platform.signalProcessGroup(process.pid, "SIGTERM");
			if (captured) {
				await containEscapedDescendants(jobDir, descendants, "after stalled tool");
			} else {
				graceTimer = setTimeout(() => platform.signalProcessGroup(process.pid, "SIGKILL"), STOP_GRACE_MS);
				graceTimer.unref();
				void containEscapedDescendants(jobDir, descendants, "after exhaustion").catch(() => {});
			}
			await finalizeJob(jobDir, "failed", reason, { shutdownDeadline });
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
		tool: "",
		lastTool: "",
		toolCalls: 0,
		progress: 0,
	};
	const failLog = (error: unknown) =>
		appendLimenLog(jobDir, `log write failed: ${error instanceof Error ? error.message : String(error)}`).catch(
			() => {},
		);
	const apply = (events: readonly StreamEvent[]) => {
		pending = pending
			.then(() =>
				recordEvents(
					jobDir,
					events,
					() => {
						tools += 1;
						if (tools >= toolCallCap()) {
							exhaust(`tool-call cap reached after ${tools} calls`);
						}
						return tools;
					},
					seen,
				),
			)
			.catch(failLog);
	};
	const child = spawn(profile.binary, args, {
		cwd: worktree,
		stdio: ["ignore", "pipe", "pipe"],
		env: childEnvironment,
	});
	// A pipe can cut a multi-byte UTF-8 letter between two chunks; the stream's decoder keeps the cut bytes for the next one.
	child.stdout?.setEncoding("utf8");
	child.stdout?.on("data", (chunk: string) => apply(parser.push(chunk)));
	child.stderr?.on("data", (chunk: Buffer | string) => {
		seen.progress += 1;
		pending = pending.then(() => appendFile(`${jobDir}/log`, chunk.toString())).catch(failLog);
	});
	const outcome = new Promise<{
		code: number | null;
		signal: NodeJS.Signals | null;
		error?: Error;
	}>((resolve) => {
		child.once("error", (error) => resolve({ code: null, signal: null, error }));
		child.once("close", (code, signal) => resolve({ code, signal }));
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
		exhaust(
			`stalled tool ${seen.tool}: ${stallWatch.previous?.children.length ? "CPU-idle child" : "child exited"} for ${Math.round(toolStallMs() / 1000)}s`,
			descendants,
		);
	};
	const checkStall = () => {
		if (observing || exhausted || stopRequested || !enginePid) {
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
	const timeout = setTimeout(() => exhaust(`timeout after ${timeoutMs}ms`), timeoutMs);
	// A model cannot see the clock; one steer at 80% lets it leave a commit or a verdict before the timeout.
	const steerAt = Math.round(timeoutMs * 0.8);
	const deadlineSteer = setTimeout(() => {
		if (exhausted || stopRequested) {
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
	if (graceTimer) {
		clearTimeout(graceTimer);
	}
	apply(parser.flush());
	await pending;
	if (seen.stop) {
		await transition(jobDir, { from: ["running"], set: { stopReason: seen.stop } });
		await appendLimenLog(jobDir, `assistant ${seen.stop}`).catch(() => {});
	}
	if (exhausted) {
		await exhaustionTermination;
	} else if (stopRequested || result.signal === "SIGTERM" || result.signal === "SIGKILL") {
		await finalizeJob(jobDir, "stopped", "process group interrupted", { shutdownDeadline });
	} else if (result.error) {
		await finalizeJob(jobDir, "failed", result.error.message);
	} else if (result.code === 0) {
		// A `finish` handoff already in `result` outranks the words the model wrote after it.
		if (seen.assistant && !(await textFile(`${jobDir}/result`))) {
			await atomicWrite(`${jobDir}/result`, `${seen.assistant}\n`).catch(() => {});
		}
		const failedReason = isFailedStopReason(seen.stop) ? seen.stop : "";
		await finalizeJob(jobDir, failedReason ? "failed" : "done", failedReason || `${profile.id} exited 0`);
	} else {
		await finalizeJob(jobDir, "failed", `worker exited with code ${result.code ?? "unknown"}`);
	}
}
export async function failInternalJob(error: unknown): Promise<void> {
	const jobDir = transport("LIMEN_JOB_DIR");
	if (!jobDir) {
		return;
	}
	await finalizeJob(jobDir, "failed", error instanceof Error ? error.message : String(error));
}
/** What the wrapper has seen of the engine's stream so far. */
type Seen = {
	activity: string;
	activityAt: number;
	assistant: string;
	stop: string;
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
			if (event.text) {
				await appendFile(`${jobDir}/log`, `${event.text}\n`);
			}
		} else {
			seen.progress += 1;
			await appendFile(`${jobDir}/log`, `${event.line}\n`);
		}
	}
}
function requiredEnvironment(name: TransportName): string {
	const value = transport(name);
	if (!value) {
		throw new Error(`internal job wrapper is missing ${name}`);
	}
	return value;
}
