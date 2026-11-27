import { mkdir, readFile, rm, stat } from "node:fs/promises";
import { userInfo } from "node:os";
import { basename, dirname } from "node:path";
import { atomicRename, atomicWrite } from "../atomic-write.ts";
import { exception, transport } from "../config.ts";
import { platform } from "../platform/platform.ts";
import { CONTEXT_FILE } from "../runtime/context-message.ts";
import type { EngineId } from "../runtime/engine.ts";
import { groupLock } from "./group-cabinet.ts";
import { SESSION_ID } from "./job.ts";
import { START_STATE_FILE } from "./read-only.ts";
import { type Facts, publishRecord, writeProgress } from "./record.ts";

/**
 * Prune and land remove a worktree only while they hold this lock, deciding from job records they read inside it.
 * Publication holds it too, so no job claims a worktree between that read and the removal, and prune moves a folder
 * a publication left only under it.
 */
export function worktreeLock<T>(jobsRoot: string, operation: () => Promise<T>): Promise<T> {
	return groupLock(worktreeGuard(jobsRoot).folder, operation, "wait");
}
/** The lock of `worktreeLock`, for an operation of src/operation.ts whose apply removes a worktree under it. */
export function worktreeGuard(jobsRoot: string): { readonly folder: string } {
	return { folder: `${dirname(jobsRoot)}/prune` };
}

/**
 * One line naming who ran this spawn, continue or rule, from what the environment shows: a Limen job, else a Pi session
 * or Herdr pane (`coordinator` when LIMEN_COORDINATOR=1), then the user and the parent process. Unknown parts are left
 * out.
 */
export function spawnerLine(): string {
	const job = transport("LIMEN_JOB_ID")?.trim();
	if (job && SESSION_ID.test(job)) {
		return `job ${job}`;
	}
	const parts: string[] = exception("LIMEN_COORDINATOR") === "1" ? ["coordinator"] : [];
	const session = process.env.PI_SESSION_ID?.trim();
	if (session && SESSION_ID.test(session)) {
		parts.push(`pi session ${session}`);
	}
	const pane = process.env.HERDR_PANE_ID?.trim();
	if (process.env.HERDR_ENV === "1" && pane && /^[A-Za-z0-9][A-Za-z0-9._:-]{0,127}$/.test(pane)) {
		parts.push(`herdr pane ${pane}`);
	}
	const user = process.env.USER?.trim() || userInfo().username;
	if (user) {
		parts.push(`user ${user}`);
	}
	const command = platform.commandName(process.ppid);
	if (command) {
		parts.push(`parent ${command} (pid ${process.ppid})`);
	}
	return parts.join(", ");
}

type NewJob = {
	readonly task: string | Uint8Array;
	/**
	 * The Limen context message the job's session opens with (src/runtime/context-message.ts), saved as `context.md` in
	 * the same rename as the record, so a spawn that never publishes leaves none (T-38) and a continuation can carry it
	 * byte for byte (A-079).
	 */
	readonly context: string | Uint8Array;
	readonly label: string;
	readonly branch: string;
	readonly worktree: string;
	readonly base: string;
	readonly role: string;
	readonly engine: EngineId;
	/** The start-queue order: 1 is the most urgent. */
	readonly priority?: number;
	/** The model the spawner asked for, compared with the served model in `limen show <id>`. */
	readonly model?: string;
	/** The provider and the reasoning level of the route (D-043). */
	readonly provider?: string;
	readonly thinking?: string;
	readonly extensions?: readonly string[];
	readonly repo?: string;
	readonly notificationSession?: string;
	readonly originTab?: string;
	readonly originPane?: string;
	readonly group?: { readonly id: string; readonly team: string };
	/** The continued job: `limen continue` records it as `parent`. */
	readonly parent?: string;
	readonly candidate?: string;
	readonly session?: { readonly source: string; readonly name: string };
	/** The number of a resume after the subscription limit (A-016 (5)), which the record keeps as `quotaAttempt`. */
	readonly quotaAttempt?: number;
	/** A read-only parent's start state, which a continuation carries (src/job/read-only.ts, R-045 Decision 14). */
	readonly startState?: Uint8Array;
};

/**
 * The prefix of the hidden folder of `.limen/`, `.publishing-<id>`, that a job is published in; a crash before the
 * rename leaves it, and the seat sweep's daily prune moves it into the job archive once its spawner is gone (R-101).
 */
export const PUBLISHING = ".publishing-";

/**
 * Publish a complete starting record before creating or restoring its protected worktree: the record (state
 * `starting`, src/job/record.ts), the progress file and the content files, the context message among them, all in a
 * hidden folder that one rename makes the job's.
 */
export async function publishJob(jobDir: string, job: NewJob): Promise<void> {
	const jobsRoot = dirname(jobDir);
	const publishing = `${dirname(jobsRoot)}/${PUBLISHING}${basename(jobDir)}`;
	await mkdir(jobsRoot, { recursive: true });
	await mkdir(publishing);
	try {
		const startedAt = new Date().toISOString();
		const files: Record<string, string | Uint8Array> = {
			"task.md": job.task,
			[CONTEXT_FILE]: job.context,
			log: "",
		};
		if (job.notificationSession) {
			files[`notify/subscribers/${job.notificationSession}`] = `${startedAt}\n`;
		}
		if (job.startState) {
			files[START_STATE_FILE] = job.startState;
		}
		await mkdir(`${publishing}/notify/subscribers`, { recursive: true });
		const attempt = job.quotaAttempt === undefined ? {} : { quotaAttempt: job.quotaAttempt };
		await publishRecord(publishing, basename(jobDir), { ...startingFacts(job, startedAt), ...attempt });
		await writeProgress(publishing, { activity: "think", lastTool: "", toolCalls: 0 });
		// Sequential writes settle before cleanup on failure; no write can outlive the hidden directory.
		for (const [name, body] of Object.entries(files)) {
			await atomicWrite(`${publishing}/${name}`, body, { exclusive: true });
		}
		if (job.session) {
			await mkdir(`${publishing}/session`);
			// A copy keeps the transcript's permission bits; the umask may narrow them, so it is never wider.
			const { mode } = await stat(job.session.source);
			await atomicWrite(`${publishing}/session/${job.session.name}`, await readFile(job.session.source), {
				exclusive: true,
				mode: mode & 0o777,
			});
		}
		await atomicWrite(`${publishing}/notify/ready`, "1\n", { exclusive: true });
		await worktreeLock(jobsRoot, () => atomicRename(publishing, jobDir));
	} catch (error) {
		await rm(publishing, { recursive: true, force: true });
		throw error;
	}
}

/** The facts the first record holds (D-057 (7.4)); what the job does not have is null. */
function startingFacts(job: NewJob, startedAt: string): Facts {
	// A job exports its id to the agent, so a spawn or continue run by a job's agent names it.
	// The picture nests a coordinator's workers under it by this link.
	const spawnedBy = transport("LIMEN_JOB_ID")?.trim();
	return {
		label: job.label,
		branch: job.branch,
		worktree: job.worktree,
		base: job.base,
		role: job.role,
		repo: job.repo ?? null,
		origin: { tab: job.originTab ?? null, pane: job.originPane ?? null, session: job.notificationSession ?? null },
		group: job.group?.id ?? null,
		team: job.group?.team ?? null,
		parent: job.parent ?? null,
		spawner: spawnerLine() || null,
		spawnedBy: spawnedBy && SESSION_ID.test(spawnedBy) ? spawnedBy : null,
		candidate: job.candidate ?? null,
		priority: job.priority ?? null,
		route: {
			engine: job.engine,
			model: job.model ?? null,
			provider: job.provider ?? null,
			thinking: job.thinking ?? null,
		},
		extensions: [...(job.extensions ?? [])],
		// The spawning process. Until the wrapper runs the job, a live spawner means it is starting, not orphaned.
		spawnerPid: process.pid,
		startedAt,
	};
}
