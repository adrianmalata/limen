import { mkdir, readFile, rm, stat } from "node:fs/promises";
import { userInfo } from "node:os";
import { basename, dirname } from "node:path";
import { atomicRename, atomicWrite } from "../atomic-write.ts";
import { exception, transport } from "../config.ts";
import { platform } from "../platform/platform.ts";
import type { EngineId } from "../runtime/engine.ts";
import { groupLock } from "./group-cabinet.ts";
import { SESSION_ID } from "./job.ts";
import { type Facts, publishRecord, writeProgress } from "./record.ts";

/**
 * Prune and land remove a worktree only while they hold this lock, deciding from job records they read inside it.
 * Publication holds it too, so no job claims a worktree between that read and the removal.
 */
export function worktreeLock<T>(jobsRoot: string, operation: () => Promise<T>): Promise<T> {
	return groupLock(`${dirname(jobsRoot)}/prune`, operation, "wait");
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
	/** Files a continuation carries from its parent's job folder, such as the task note. */
	readonly carried?: Readonly<Record<string, string>>;
};

/**
 * Publish a complete starting record before creating or restoring its protected worktree: the record (state
 * `starting`, src/job/record.ts), the progress file and the content files, all in a hidden folder that one rename
 * makes the job's.
 */
export async function publishJob(jobDir: string, job: NewJob): Promise<void> {
	const jobsRoot = dirname(jobDir);
	const publishing = `${dirname(jobsRoot)}/.publishing-${basename(jobDir)}`;
	await mkdir(jobsRoot, { recursive: true });
	await mkdir(publishing);
	try {
		const startedAt = new Date().toISOString();
		const files: Record<string, string | Uint8Array> = { "task.md": job.task, log: "", ...job.carried };
		if (job.notificationSession) {
			files[`notify/subscribers/${job.notificationSession}`] = `${startedAt}\n`;
		}
		await mkdir(`${publishing}/notify/subscribers`, { recursive: true });
		await publishRecord(publishing, basename(jobDir), startingFacts(job, startedAt));
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
