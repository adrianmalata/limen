// One job's record (src/job/record.ts) with its progress and its content files, as the row of `limen status --all` and
// the detail of `limen show`, and the order of a project's jobs. The views read and write nothing else.
import type { Stats } from "node:fs";
import { open, readFile, stat } from "node:fs/promises";
import { LimenError } from "../outcome.ts";
import { liveDiffstat, workspaceRepository } from "../project/git.ts";
import { type OwnerState, ownerState, startingJob } from "../runtime/reap.ts";
import { queuedText } from "../runtime/start-queue.ts";
import { derivePulse, isTerminal, type Job, type Pulse, parseJob, producedNothing, renderJob } from "./job.ts";
import { isRateLimit, type JobRecord, type Progress, readProgress, readRecord } from "./record.ts";
import { modelLine, readSessionUsage, tokenLine } from "./usage.ts";
import type { ShownJob } from "./view.ts";

/** The window of `limen status`: a job that ended longer ago counts under Older. */
export const RECENT_MS = 7 * 24 * 60 * 60 * 1000;

/** The jobs as id, shown state and start time: running jobs first, then the newest. */
type Ordered = ReadonlyArray<readonly [string, string, string]>;

export async function orderedJobs(ids: readonly string[], jobsRoot: string): Promise<Ordered> {
	// A job its live spawner is still setting up lists as running, with pulse `starting`.
	const order = await Promise.all(
		ids.map(async (id) => {
			const record = await readRecord(`${jobsRoot}/${id}`).catch(invalidRecord);
			return [id, shownState(record), record?.startedAt || id] as const;
		}),
	);
	return order.sort((a, b) => Number(b[1] === "running") - Number(a[1] === "running") || b[2].localeCompare(a[2]));
}
/** The content files beside the record. Detail-only files stay empty in the row and human views. */
type JobEvidence = {
	readonly result: string;
	readonly cleanup: string;
	readonly herdrWake: string;
	/** Detail only: the served model (and the requested one when they differ) and the session token totals. */
	readonly model: string;
	readonly tokens: string;
};
/** A job's record with its progress, task and log present, read for one view. */
type LoadedJob = {
	readonly root: string;
	readonly jobDir: string;
	readonly id: string;
	readonly detailed: boolean;
	readonly record: JobRecord;
	readonly progress: Progress | undefined;
	readonly evidence: JobEvidence;
	readonly taskStat: Stats;
	readonly logStat: Stats;
	readonly log: { readonly tail: string; readonly detail: string };
};
/** What the parsed job and its live owner say, shared by the compact text and the shown job. */
type JobFacts = {
	readonly job: Job;
	readonly startedAt: Date;
	readonly observedAt: number;
	readonly pulse: Pulse | undefined;
	readonly queue: string | undefined;
	readonly recordedTools: number | undefined;
	readonly empty: boolean;
	readonly diffstat: string;
};
export async function renderJobDirectory(
	root: string,
	jobsRoot: string,
	id: string,
	view: "row" | "human" | "detail",
): Promise<{ compact: string; record: ShownJob }> {
	const jobDir = `${jobsRoot}/${id}`;
	const detailed = view === "detail";
	let record: JobRecord | undefined;
	let progress: Progress | undefined;
	try {
		record = await readRecord(jobDir);
		progress = await readProgress(jobDir);
	} catch (error) {
		const message = invalidMessage(error);
		return { compact: `INVALID ${id} · ${message}`, record: { id, invalid: message } };
	}
	const state = shownState(record);
	if (!(record && state)) {
		const why = record ? "never started" : "no record";
		return { compact: `ORPHAN ${id} · ${why}`, record: { id, invalid: `orphan · ${why}` } };
	}
	const [taskStat, logStat] = await Promise.all([optionalStat(`${jobDir}/task.md`), optionalStat(`${jobDir}/log`)]);
	if (!taskStat || !logStat) {
		return { compact: `INVALID ${id} · missing task.md or log`, record: { id, invalid: "missing task.md or log" } };
	}
	const evidence = await readJobEvidence(jobDir, record, detailed);
	const log = view !== "row" ? await readLog(`${jobDir}/log`) : { tail: "", detail: "" };
	try {
		const loaded = { root, jobDir, id, detailed, record, progress, evidence, taskStat, logStat, log };
		return await renderReadableJob(loaded, state);
	} catch (error: unknown) {
		const message = error instanceof Error ? error.message : String(error);
		return {
			compact: `INVALID ${id} · ${message}${log.tail ? `\n  log:\n${log.tail}` : ""}`,
			record: { id, invalid: message, ...(log.tail ? { logTail: log.tail } : {}) },
		};
	}
}
/** A record the read refused (BAD_DATA) shows as invalid in the list; any other failure goes on. */
function invalidRecord(error: unknown): undefined {
	invalidMessage(error);
	return undefined;
}
function invalidMessage(error: unknown): string {
	if (error instanceof LimenError && error.code === "BAD_DATA") {
		return error.message;
	}
	throw error;
}
async function readJobEvidence(jobDir: string, record: JobRecord, detailed: boolean): Promise<JobEvidence> {
	const result = detailed ? await text(`${jobDir}/result`) : "";
	const cleanup = detailed ? await text(`${jobDir}/cleanup`) : "";
	const herdrWake = detailed ? await text(`${jobDir}/notify/herdr-prompt`) : "";
	const usage = detailed ? readSessionUsage(jobDir, record.startedAt).usage : undefined;
	const model = detailed ? modelLine(record.route.model ?? "", usage) : "";
	const tokens = usage ? tokenLine(usage) : "";
	return { result, cleanup, herdrWake, model, tokens };
}
/** Parses the job and asks whether its owner is alive. Throws on a record that does not parse. */
async function renderReadableJob(loaded: LoadedJob, state: string): Promise<{ compact: string; record: ShownJob }> {
	const { id, detailed, record, progress, logStat, log } = loaded;
	const startedAt = record.startedAt ? new Date(record.startedAt) : loaded.taskStat.mtime;
	const pid = record.identity?.pid;
	const job = parseJob({
		id,
		state,
		label: displayed(record.label || id, detailed),
		branch: displayed(record.branch ?? "", detailed),
		...(pid ? { pid: String(pid) } : {}),
		startedAt,
		lastOutputAt: logStat.mtime,
		detail: detailed ? log.detail : "",
	});
	const running = job.phase === "running";
	const observedAt = running ? Date.now() : Date.parse(record.finishedAt ?? "") || Date.now();
	const owner = running ? await ownerState(record.identity) : undefined;
	const queue = running && record.queued ? queuedText(record.queued) : undefined;
	// A migrated folder's progress may lack a part (null), which shows as a part never recorded.
	const pulse = owner ? runningPulse(record, owner, progress?.activity ?? undefined) : undefined;
	const recordedTools = progress?.toolCalls ?? undefined;
	const commits = record.commits ? record.commits.join("\n") : undefined;
	const empty = !running && producedNothing(recordedTools, commits);
	const openChecks = recordTexts(record).openChecks;
	const diffstat = detailed ? branchDiffstat(loaded.root, record) : "";
	const lastTool = progress?.lastTool;
	const rendered = renderJob(job, {
		elapsedMs: observedAt - startedAt.getTime(),
		silentMs: observedAt - logStat.mtimeMs,
		...(recordedTools !== undefined ? { toolCalls: recordedTools } : {}),
		...(empty ? { producedNothing: true } : {}),
		...(lastTool ? { lastTool: displayed(lastTool, detailed) } : {}),
		...(running && pulse ? { pulse, processAlive: owner === "alive" } : {}),
		...(pulse === "queued" && queue ? { queue } : {}),
		...(openChecks ? { openChecks: true } : {}),
		diffstat,
		logTail: log.tail,
	});
	const facts: JobFacts = { job, startedAt, observedAt, pulse, queue, recordedTools, empty, diffstat };
	return { compact: [rendered, ...jobBlocks(loaded, facts)].join("\n"), record: shownJob(loaded, facts) };
}
/** The diffstat of the job's branch in its repository: the project's own, or the workspace repository it names. */
function branchDiffstat(root: string, record: JobRecord): string {
	return liveDiffstat(record.repo ? workspaceRepository(root, record.repo) : root, record.branch ?? "");
}
function runningPulse(record: JobRecord, owner: OwnerState, activity: string | undefined): Pulse {
	return derivePulse({
		starting: record.state === "starting",
		owner,
		queued: record.queued !== null,
		...(activity ? { activity } : {}),
	});
}
/** The record's open checks of a done job, its commits, and its side failures, as text blocks. */
function recordTexts(record: JobRecord): { openChecks: string; commits: string; sideFailures: string } {
	return {
		openChecks: record.state === "done" ? (record.openChecks ?? []).join("\n") : "",
		commits: (record.commits ?? []).join("\n"),
		sideFailures: record.sideFailures.map(({ channel, message }) => `${channel}: ${message}`).join("\n"),
	};
}
/**
 * The readings of a finished job's systemd user scope (M-09): its memory peak, its CPU time and its OOM kills, each
 * `unknown` where its finisher could not read it; "" for a job that runs, or that never recorded its scope.
 */
function scopeText(record: JobRecord): string {
	const scope = record.scope;
	if (!scope || !isTerminal(record.state)) {
		return "";
	}
	const shown = (value: number | null, text: (value: number) => string) => (value === null ? "unknown" : text(value));
	return [
		`memory peak ${shown(scope.memoryPeakBytes, (bytes) => `${(bytes / 1_048_576).toFixed(1)} MiB`)}`,
		`CPU ${shown(scope.cpuMicroseconds, (micro) => `${(micro / 1_000_000).toFixed(1)} s`)}`,
		`OOM kills ${shown(scope.oomKills, String)}`,
	].join(" · ");
}
/**
 * The failure of a failed job (A-016 (1)): its kind, `unknown` for a migrated record whose text no pattern named, and
 * for `quota` the reset time, `unknown` when none was read (R-034 resumes it); "" for a job that did not fail.
 */
function failureText(record: JobRecord): string {
	const failure = record.state === "failed" ? record.failure : null;
	if (!failure) {
		return "";
	}
	const kind = failure.kind ?? "unknown";
	return kind === "quota" ? `${kind} · resets ${failure.resetAt ?? "unknown"}` : kind;
}
/** Who ran the spawn: the spawner line, else the job that spawned it. */
function spawnedBy(record: JobRecord): string {
	return record.spawner || (record.spawnedBy ? `job ${record.spawnedBy}` : "");
}
/** The indented lines under a job's first line, in the order the board has always shown them. */
function jobBlocks(loaded: LoadedJob, facts: JobFacts): string[] {
	const { detailed, record, evidence } = loaded;
	const texts = recordTexts(record);
	const blocks: string[] = [];
	const engine = record.route.engine;
	const lines: ReadonlyArray<readonly [string, string | null | undefined]> = [
		["repo", record.repo],
		["parent", record.parent],
		["spawned-by", detailed ? spawnedBy(record) : ""],
		["candidate", record.candidate],
		["failure", detailed ? failureText(record) : ""],
		["engine", engine && engine !== "pi" ? engine : ""],
		["model", evidence.model],
		["tokens", evidence.tokens],
		["scope", detailed ? scopeText(record) : ""],
		["advisory", facts.job.phase === "running" ? record.advisory?.text : ""],
	];
	for (const [name, value] of lines) {
		if (value) {
			blocks.push(`  ${name} ${name === "model" || name === "tokens" ? value : displayed(value, detailed)}`);
		}
	}
	const sections: ReadonlyArray<readonly [string, string]> = [
		["stop-reason", record.stopReason ?? ""],
		["open-checks", texts.openChecks],
		["versions", detailed ? (record.versions ?? "") : ""],
		["commits", detailed ? texts.commits : ""],
		["side-failures", texts.sideFailures],
		["result", evidence.result],
		["herdr-wake", evidence.herdrWake],
		["cleanup", evidence.cleanup],
	];
	for (const [name, body] of sections) {
		if (body) {
			blocks.push(indented(name, body.trimEnd()));
		}
	}
	return blocks;
}
function shownJob(loaded: LoadedJob, facts: JobFacts): ShownJob {
	const { id, detailed, record, logStat, log } = loaded;
	const { job, observedAt, pulse, queue, recordedTools, empty } = facts;
	const reason = stopSummary(record.stopReason || log.detail);
	const running = job.phase === "running";
	const texts = recordTexts(record);
	const lastTool = loaded.progress?.lastTool;
	const by = detailed ? spawnedBy(record) : "";
	return {
		id,
		job,
		...(pulse ? { pulse } : {}),
		...(pulse === "queued" && queue ? { queue } : {}),
		...(recordedTools !== undefined ? { toolCalls: recordedTools } : {}),
		...(empty ? { producedNothing: true } : {}),
		...(lastTool ? { lastTool: displayed(lastTool, detailed) } : {}),
		...((job.phase === "failed" || job.phase === "stopped") && reason && reason !== "see log" ? { reason } : {}),
		...(texts.openChecks ? { reason: "done with open checks" } : {}),
		elapsedMs: observedAt - facts.startedAt.getTime(),
		silentMs: observedAt - logStat.mtimeMs,
		...(running ? {} : { ageMs: Date.now() - observedAt }),
		...(record.commits ? { commitCount: record.commits.filter((line) => line.trim()).length } : {}),
		...(record.repo ? { repo: record.repo } : {}),
		...(record.parent ? { parent: record.parent } : {}),
		...(by ? { spawnedBy: by } : {}),
		...(record.candidate ? { candidate: record.candidate } : {}),
		...(running && record.advisory ? { advisory: record.advisory.text } : {}),
		...shownEvidence(loaded, texts, facts.diffstat),
	};
}
/** Stop reason, detail fields, diffstat and log tail of the shown job, in the order it has always held them. */
function shownEvidence(loaded: LoadedJob, texts: ReturnType<typeof recordTexts>, diffstat: string): Partial<ShownJob> {
	const { detailed, record, evidence, log } = loaded;
	return {
		...(record.stopReason ? { stopReason: record.stopReason } : {}),
		...(detailed && record.versions ? { versions: record.versions.trimEnd() } : {}),
		...(detailed && texts.commits ? { commits: texts.commits } : {}),
		...(texts.openChecks ? { openChecks: texts.openChecks } : {}),
		...(texts.sideFailures ? { sideFailures: texts.sideFailures } : {}),
		...(evidence.result ? { result: evidence.result } : {}),
		...(evidence.model ? { model: evidence.model } : {}),
		...(evidence.tokens ? { tokens: evidence.tokens } : {}),
		...(detailed && scopeText(record) ? { scope: scopeText(record) } : {}),
		...(detailed && failureText(record) ? { failure: failureText(record) } : {}),
		...(evidence.cleanup ? { cleanup: evidence.cleanup } : {}),
		...(evidence.herdrWake ? { herdrWake: evidence.herdrWake } : {}),
		...(diffstat ? { diffstat } : {}),
		...(log.tail ? { logTail: log.tail } : {}),
	};
}
/** The stop reason or last log line without its prefix; a rate limit names its retry delay. */
function stopSummary(line: string): string {
	const reason = line
		.replace(/^\[limen [^\]]*\]\s*/, "")
		.replace(/^(error|failed|stopped):\s*/, "")
		.replace(/\s+/g, " ");
	if (!isRateLimit(reason)) {
		return reason;
	}
	const retryMs = /retry-after-ms=(\d+)/.exec(reason)?.[1];
	return `rate limit (429)${retryMs ? `; retry after ${Math.max(1, Math.round(Number(retryMs) / 60_000))}m` : ""}`;
}
/** Row and human views cut long values; the detail view shows them whole. */
function displayed(value: string, detailed: boolean): string {
	return detailed || value.length <= 160 ? value : `${value.slice(0, 159)}…`;
}
function indented(name: string, body: string): string {
	return `  ${name}:\n${body
		.split("\n")
		.map((line) => `    ${line}`)
		.join("\n")}`;
}
/**
 * The state a view shows: the record's, `running` for a job whose live spawner is still setting it up, and "" for a
 * job that never started (its spawner gone) or has no record.
 */
export function shownState(record: JobRecord | undefined): string {
	if (record?.state === "starting") {
		return startingJob(record) ? "running" : "";
	}
	return record?.state ?? "";
}
/** A content file's trimmed text; "" when it is missing. */
function text(path: string): Promise<string> {
	return readFile(path, "utf8")
		.then((value) => value.trim())
		.catch(() => "");
}
function optionalStat(path: string) {
	return stat(path).catch(() => undefined);
}
async function readLog(path: string): Promise<{ tail: string; detail: string }> {
	try {
		const handle = await open(path, "r");
		try {
			const { size } = await handle.stat();
			const buf = Buffer.alloc(Math.min(size, 8_192));
			await handle.read(buf, 0, buf.length, Math.max(0, size - buf.length));
			const raw = buf.toString("utf8");
			const lines = (size > buf.length ? raw.replace(/^[^\n]*\n?/, "") : raw).trimEnd().split("\n");
			const bytes = Buffer.from(lines.slice(-20).join("\n"));
			const overflow = bytes.byteLength > 4_096;
			const slice = overflow ? bytes.subarray(bytes.byteLength - 4_096) : bytes;
			const tail = overflow ? slice.toString("utf8").replace(/^[^\n]*\n?/, "…\n") : slice.toString();
			return { tail, detail: lines.findLast((line) => /^\[limen [^\]]*\] (failed|stopped):/.test(line)) ?? "" };
		} finally {
			await handle.close();
		}
	} catch {
		return { tail: "", detail: "" };
	}
}
