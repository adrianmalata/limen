// One job's record read from its folder, as the row of `limen status --all` and the detail of `limen show`, and the
// order of a project's jobs. The views read the job files and write nothing.
import type { Stats } from "node:fs";
import { open, readFile, stat } from "node:fs/promises";
import { liveDiffstat, workspaceRepository } from "../project/git.ts";
import { ownerAlive, startingJob } from "../runtime/reap.ts";
import { queuedText, readQueued } from "../runtime/start-queue.ts";
import { derivePulse, type Job, type Pulse, parseJob, producedNothing, renderJob } from "./job.ts";
import { modelLine, readSessionUsage, tokenLine } from "./usage.ts";
import type { JobRecord } from "./view.ts";

/** The window of `limen status`: a job that ended longer ago counts under Older. */
export const RECENT_MS = 7 * 24 * 60 * 60 * 1000;

/** The jobs as id, shown state and start time: running jobs first, then the newest. */
type Ordered = ReadonlyArray<readonly [string, string, string]>;

export async function orderedJobs(ids: readonly string[], jobsRoot: string): Promise<Ordered> {
	// A job its live spawner is still setting up lists as running, with pulse `starting`.
	const order = await Promise.all(
		ids.map(
			async (id) =>
				[id, await shownState(`${jobsRoot}/${id}`), (await text(`${jobsRoot}/${id}/started-at`)) || id] as const,
		),
	);
	return order.sort((a, b) => Number(b[1] === "running") - Number(a[1] === "running") || b[2].localeCompare(a[2]));
}
type JobFields = {
	readonly state: string;
	readonly label: string;
	readonly branch: string;
	readonly repo: string;
	readonly pid: string;
	readonly started: string;
	readonly finished: string;
	readonly toolCalls: string;
	readonly lastTool: string;
	readonly activity: string;
	readonly candidate: string;
	readonly advisory: string;
	readonly parent: string;
	readonly engine: string;
	readonly stopReason: string;
};
/** Files beside the job fields. Detail-only files stay empty in the row and human views. */
type JobEvidence = {
	readonly commits: string;
	readonly commitsStat: Stats | undefined;
	readonly result: string;
	/** The open items of the final "Note check" of a done job, one per line. */
	readonly openChecks: string;
	readonly versions: string;
	readonly cleanup: string;
	readonly herdrWake: string;
	/** Detail only: who ran the spawn; older records have only `spawned-by`, a job id. */
	readonly spawnedBy: string;
	/** Detail only: the served model (and the requested one when they differ) and the session token totals. */
	readonly model: string;
	readonly tokens: string;
};
/** A job directory with its task and log present, read for one view. */
type LoadedJob = {
	readonly root: string;
	readonly jobDir: string;
	readonly id: string;
	readonly detailed: boolean;
	readonly fields: JobFields;
	readonly evidence: JobEvidence;
	readonly taskStat: Stats;
	readonly logStat: Stats;
	readonly log: { readonly tail: string; readonly detail: string };
};
/** What the parsed job and its live owner say, shared by the compact text and the record. */
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
): Promise<{ compact: string; record: JobRecord }> {
	const jobDir = `${jobsRoot}/${id}`;
	const detailed = view === "detail";
	const fields = await readJobFields(jobDir);
	if (!fields.state) {
		return { compact: `ORPHAN ${id} · no state`, record: { id, invalid: "orphan · no state" } };
	}
	const { evidence, taskStat, logStat } = await readJobEvidence(jobDir, fields, detailed);
	if (!taskStat || !logStat) {
		return { compact: `INVALID ${id} · missing task.md or log`, record: { id, invalid: "missing task.md or log" } };
	}
	const log = view !== "row" ? await readLog(`${jobDir}/log`) : { tail: "", detail: "" };
	try {
		return await renderReadableJob({ root, jobDir, id, detailed, fields, evidence, taskStat, logStat, log });
	} catch (error: unknown) {
		const message = error instanceof Error ? error.message : String(error);
		return {
			compact: `INVALID ${id} · ${message}${log.tail ? `\n  log:\n${log.tail}` : ""}`,
			record: { id, invalid: message, ...(log.tail ? { logTail: log.tail } : {}) },
		};
	}
}
async function readJobFields(jobDir: string): Promise<JobFields> {
	const [
		state = "",
		label = "",
		branch = "",
		repo = "",
		pid = "",
		started = "",
		finished = "",
		toolCalls = "",
		lastTool = "",
		activity = "",
		candidate = "",
		advisory = "",
		parent = "",
		engine = "",
		stopReason = "",
	] = await Promise.all(
		"state label branch repo pid started-at finished-at tool-calls last-tool activity candidate advisory parent engine stop-reason"
			.split(" ")
			.map((field) => (field === "state" ? shownState(jobDir) : text(`${jobDir}/${field}`))),
	);
	return {
		state,
		label,
		branch,
		repo,
		pid,
		started,
		finished,
		toolCalls,
		lastTool,
		activity,
		candidate,
		advisory,
		parent,
		engine,
		stopReason,
	};
}
async function readJobEvidence(
	jobDir: string,
	fields: JobFields,
	detailed: boolean,
): Promise<{ evidence: JobEvidence; taskStat: Stats | undefined; logStat: Stats | undefined }> {
	const [commits, commitsStat] = await Promise.all([text(`${jobDir}/commits`), optionalStat(`${jobDir}/commits`)]);
	const openChecks = fields.state === "done" ? await text(`${jobDir}/open-checks`) : "";
	const [result, versions] = detailed
		? await Promise.all([text(`${jobDir}/result`), text(`${jobDir}/versions`)])
		: ["", ""];
	const [taskStat, logStat] = await Promise.all([optionalStat(`${jobDir}/task.md`), optionalStat(`${jobDir}/log`)]);
	const cleanup = detailed ? await text(`${jobDir}/cleanup`) : "";
	const herdrWake = detailed ? await text(`${jobDir}/notify/herdr-prompt`) : "";
	const [spawner, spawnerJob] = detailed
		? await Promise.all([text(`${jobDir}/spawner`), text(`${jobDir}/spawned-by`)])
		: ["", ""];
	const spawnedBy = spawner || (spawnerJob ? `job ${spawnerJob}` : "");
	const usage = detailed ? readSessionUsage(jobDir, Date.parse(fields.started) || 0) : undefined;
	const model = detailed ? modelLine(await text(`${jobDir}/model`), usage) : "";
	const tokens = usage ? tokenLine(usage) : "";
	return {
		evidence: {
			commits,
			commitsStat,
			result,
			openChecks,
			versions,
			cleanup,
			herdrWake,
			spawnedBy,
			model,
			tokens,
		},
		taskStat,
		logStat,
	};
}
/** Parses the job and asks whether its owner is alive. Throws on a record that does not parse. */
async function renderReadableJob(loaded: LoadedJob): Promise<{ compact: string; record: JobRecord }> {
	const { id, detailed, fields, evidence, logStat, log } = loaded;
	const startedAt = recordedDate(fields.started, loaded.taskStat.mtime, "started-at");
	const job = parseJob({
		id,
		state: fields.state,
		label: displayed(fields.label || id, detailed),
		branch: displayed(fields.branch, detailed),
		...(fields.pid ? { pid: fields.pid } : {}),
		startedAt,
		lastOutputAt: logStat.mtime,
		detail: detailed ? log.detail : "",
	});
	const running = job.phase === "running";
	const observedAt = running ? Date.now() : recordedDate(fields.finished, new Date(), "finished-at").getTime();
	const alive = running && (await ownerAlive(loaded.jobDir));
	const queued = running ? readQueued(loaded.jobDir) : undefined;
	const queue = queued ? queuedText(queued) : undefined;
	const pulse = running ? runningPulse(job.pid, alive, fields.activity, queued !== undefined) : undefined;
	const recordedTools = fields.toolCalls ? recordedCount(fields.toolCalls) : undefined;
	const empty = !running && producedNothing(recordedTools, evidence.commitsStat ? evidence.commits : undefined);
	const diffstat = detailed
		? liveDiffstat(fields.repo ? workspaceRepository(loaded.root, fields.repo) : loaded.root, fields.branch)
		: "";
	const rendered = renderJob(job, {
		elapsedMs: observedAt - startedAt.getTime(),
		silentMs: observedAt - logStat.mtimeMs,
		...(recordedTools !== undefined ? { toolCalls: recordedTools } : {}),
		...(empty ? { producedNothing: true } : {}),
		...(fields.lastTool ? { lastTool: displayed(fields.lastTool, detailed) } : {}),
		...(running && pulse ? { pulse, processAlive: alive } : {}),
		...(pulse === "queued" && queue ? { queue } : {}),
		...(evidence.openChecks ? { openChecks: true } : {}),
		diffstat,
		logTail: log.tail,
	});
	const facts: JobFacts = { job, startedAt, observedAt, pulse, queue, recordedTools, empty, diffstat };
	return { compact: [rendered, ...jobBlocks(loaded, facts)].join("\n"), record: jobRecord(loaded, facts) };
}
function runningPulse(pid: number | undefined, alive: boolean, activity: string, queued: boolean): Pulse {
	const input: { alive: boolean; queued: boolean; pid?: number; activity?: string } = { alive, queued };
	if (pid !== undefined) {
		input.pid = pid;
	}
	if (activity) {
		input.activity = activity;
	}
	return derivePulse(input);
}
/** The indented lines under a job's first line, in the order the board has always shown them. */
function jobBlocks(loaded: LoadedJob, facts: JobFacts): string[] {
	const { detailed, fields, evidence } = loaded;
	const blocks: string[] = [];
	if (fields.repo) {
		blocks.push(`  repo ${displayed(fields.repo, detailed)}`);
	}
	if (fields.parent) {
		blocks.push(`  parent ${displayed(fields.parent, detailed)}`);
	}
	if (evidence.spawnedBy) {
		blocks.push(`  spawned-by ${evidence.spawnedBy}`);
	}
	if (fields.candidate) {
		blocks.push(`  candidate ${displayed(fields.candidate, detailed)}`);
	}
	if (fields.engine && fields.engine !== "pi") {
		blocks.push(`  engine ${displayed(fields.engine, detailed)}`);
	}
	if (evidence.model) {
		blocks.push(`  model ${evidence.model}`);
	}
	if (evidence.tokens) {
		blocks.push(`  tokens ${evidence.tokens}`);
	}
	if (facts.job.phase === "running" && fields.advisory) {
		blocks.push(`  advisory ${displayed(fields.advisory, detailed)}`);
	}
	const sections: ReadonlyArray<readonly [string, string]> = [
		["stop-reason", fields.stopReason],
		["open-checks", evidence.openChecks],
		["versions", evidence.versions],
		["commits", detailed ? evidence.commits : ""],
		["result", evidence.result],
		["herdr-wake", evidence.herdrWake],
		["cleanup", evidence.cleanup],
	];
	for (const [name, body] of sections) {
		if (body) {
			blocks.push(indented(name, body));
		}
	}
	return blocks;
}
function jobRecord(loaded: LoadedJob, facts: JobFacts): JobRecord {
	const { id, detailed, fields, evidence, logStat, log } = loaded;
	const { job, observedAt, pulse, queue, recordedTools, empty } = facts;
	const reason = stopSummary(fields.stopReason || log.detail);
	const running = job.phase === "running";
	return {
		id,
		job,
		...(pulse ? { pulse } : {}),
		...(pulse === "queued" && queue ? { queue } : {}),
		...(recordedTools !== undefined ? { toolCalls: recordedTools } : {}),
		...(empty ? { producedNothing: true } : {}),
		...(fields.lastTool ? { lastTool: displayed(fields.lastTool, detailed) } : {}),
		...((job.phase === "failed" || job.phase === "stopped") && reason && reason !== "see log" ? { reason } : {}),
		...(evidence.openChecks ? { reason: "done with open checks" } : {}),
		elapsedMs: observedAt - facts.startedAt.getTime(),
		silentMs: observedAt - logStat.mtimeMs,
		...(running ? {} : { ageMs: Date.now() - observedAt }),
		...(evidence.commitsStat ? { commitCount: evidence.commits.split("\n").filter((line) => line.trim()).length } : {}),
		...(fields.repo ? { repo: fields.repo } : {}),
		...(fields.parent ? { parent: fields.parent } : {}),
		...(evidence.spawnedBy ? { spawnedBy: evidence.spawnedBy } : {}),
		...(fields.candidate ? { candidate: fields.candidate } : {}),
		...(running && fields.advisory ? { advisory: fields.advisory } : {}),
		...recordedEvidence(loaded, facts.diffstat),
	};
}
/** Stop reason, detail files, diffstat and log tail of the record, in the order the record has always held them. */
function recordedEvidence(loaded: LoadedJob, diffstat: string): Partial<JobRecord> {
	const { detailed, fields, evidence, log } = loaded;
	return {
		...(fields.stopReason ? { stopReason: fields.stopReason } : {}),
		...(evidence.versions ? { versions: evidence.versions } : {}),
		...(detailed && evidence.commits ? { commits: evidence.commits } : {}),
		...(evidence.openChecks ? { openChecks: evidence.openChecks } : {}),
		...(evidence.result ? { result: evidence.result } : {}),
		...(evidence.model ? { model: evidence.model } : {}),
		...(evidence.tokens ? { tokens: evidence.tokens } : {}),
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
	if (!/\b429\b/.test(reason) || !/rate_limit_error|rate limit/i.test(reason)) {
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
/** The recorded state, or `running` for a job whose live spawner has not written one yet. */
export async function shownState(jobDir: string): Promise<string> {
	return (await text(`${jobDir}/state`)) || ((await startingJob(jobDir)) ? "running" : "");
}
function text(path: string): Promise<string> {
	return readFile(path, "utf8")
		.then((value) => value.trim())
		.catch(() => "");
}
function optionalStat(path: string) {
	return stat(path).catch(() => undefined);
}
function recordedDate(value: string, fallback: Date, name: string): Date {
	if (!value) {
		return fallback;
	}
	const date = new Date(value);
	if (Number.isNaN(date.getTime())) {
		throw new Error(`invalid ${name} ${JSON.stringify(value.slice(0, 160))}`);
	}
	return date;
}
function recordedCount(value: string): number {
	const count = Number(value);
	if (!Number.isSafeInteger(count) || count < 0) {
		throw new Error(`invalid tool-calls ${JSON.stringify(value.slice(0, 160))}`);
	}
	return count;
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
