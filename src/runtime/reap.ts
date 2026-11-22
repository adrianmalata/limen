// Whether the process a job record names still runs, and the reaper that ends a running job whose process is gone
// (A-056). The identity is the record's `{pid, born, bootId}`, written in the transition to running: a missing part
// means unknown, never alive, so nothing keeps a job running on it; another boot, or another start time under the pid,
// means dead. What the system cannot describe (a process query that gives no answer) is not dead, as in src/lock.ts.
import { testKnob } from "../config.ts";
import { finalizeJob } from "../job/finalize.ts";
import { type Identity, type JobRecord, jobFolders, readRecord } from "../job/record.ts";
import { type Platform, platform } from "../platform/platform.ts";
import { claimRecovery } from "./recovery.ts";

export const STARTUP_GRACE_MS = 10 * 60_000;

/** `alive`: the recorded process runs; `dead`: it is gone; `unknown`: the record does not say which process it is. */
export type OwnerState = "alive" | "dead" | "unknown";

/** `pid born bootId` of each process a check found gone: it is gone for good, since that identity never returns. */
const gone = new Set<string>();

/** Whether the process `identity` names runs now. Every check reads the process again, except one already found gone. */
export async function ownerState(
	identity: Identity | null,
	query: Platform["processInfo"] = platform.processInfo,
): Promise<OwnerState> {
	if (identity?.pid == null || identity.born === null) {
		return "unknown";
	}
	const { pid, born, bootId } = identity;
	const key = `${pid} ${born} ${bootId}`;
	if (gone.has(key)) {
		return "dead";
	}
	const current = platform.bootId();
	const otherBoot = bootId !== null && current !== undefined && bootId !== current;
	const outcome = otherBoot || !platform.processAlive(pid) ? undefined : await query(pid);
	if (outcome?.kind === "unavailable" || (outcome?.kind === "present" && outcome.process.born === born)) {
		return "alive";
	}
	gone.add(key);
	return "dead";
}

/** This process's identity, which the transition to running records: a part the system does not give is null. */
export async function processIdentity(): Promise<Identity> {
	const own = await platform.processInfo(process.pid);
	const born = own.kind === "present" ? own.process.born : null;
	return { pid: process.pid, born, bootId: platform.bootId() ?? null };
}

/** A job its spawner is still setting up: published, not yet running, and the publishing process is alive. */
export function startingJob(record: JobRecord | undefined): boolean {
	return record?.state === "starting" && record.spawnerPid !== null && platform.processAlive(record.spawnerPid);
}

/** Whether `startedAt` lies within the startup grace before `now`. */
function young(record: JobRecord, now: number): boolean {
	const started = Date.parse(record.startedAt ?? "");
	return Number.isFinite(started) && now - started < STARTUP_GRACE_MS;
}

/**
 * A job that runs or starts now: a running job whose process is alive; a starting job whose spawner lives or whose
 * startup grace runs. A running job has no grace: the transition to running writes its identity in the same write.
 */
export async function liveJob(record: JobRecord | undefined, now = Date.now()): Promise<boolean> {
	if (record?.state === "starting") {
		return startingJob(record) || young(record, now);
	}
	return record?.state === "running" && (await ownerState(record.identity)) === "alive";
}

/**
 * Ends each running job whose process is dead or unknown, once it was seen so twice `reapConfirmMs` apart (`seen`
 * holds the first sighting), under the job's recovery claim.
 */
export async function reapDeadJobs(
	jobsRoot: string,
	seen: Map<string, number>,
	now = Date.now(),
	ids?: readonly string[],
): Promise<void> {
	const candidates = ids ?? (await jobFolders(jobsRoot));
	if (ids) {
		const live = new Set(ids);
		for (const id of seen.keys()) {
			if (!live.has(id)) {
				seen.delete(id);
			}
		}
	}
	for (const id of candidates) {
		const jobDir = `${jobsRoot}/${id}`;
		const record = await readRecord(jobDir);
		if (record?.state !== "running" || (await liveJob(record, now))) {
			seen.delete(id);
			continue;
		}
		const first = seen.get(id);
		if (first === undefined) {
			seen.set(id, now);
			continue;
		}
		if (now - first < reapConfirmMs()) {
			continue;
		}
		const release = await claimRecovery(jobDir);
		if (!release) {
			continue;
		}
		try {
			if (await liveJob(await readRecord(jobDir), now)) {
				continue;
			}
			await finalizeJob(jobDir, "failed", "process group gone");
			seen.delete(id);
		} finally {
			await release();
		}
	}
}
/**
 * Whether the process group `pgid`, a wrapper's, is gone within `milliseconds`, read again every 100 ms: the grace of
 * a group after a TERM, before a KILL and before the end of the job's scope.
 */
export async function waitForProcessGroup(pgid: number, milliseconds: number): Promise<boolean> {
	const deadline = Date.now() + milliseconds;
	while (platform.processGroupAlive(pgid) && Date.now() < deadline) {
		await delay(100);
	}
	return !platform.processGroupAlive(pgid);
}
export async function confirmDeadJobs(jobsRoot: string): Promise<void> {
	const seen = new Map<string, number>();
	await reapDeadJobs(jobsRoot, seen);
	if (seen.size === 0) {
		return;
	}
	await delay(reapConfirmMs());
	await reapDeadJobs(jobsRoot, seen);
}
function reapConfirmMs(): number {
	const raw = Number(testKnob("LIMEN_REAP_CONFIRM_MS"));
	return Number.isFinite(raw) && raw > 0 ? raw : 10_000;
}
const delay = (milliseconds: number) => new Promise<void>((resolve) => setTimeout(resolve, milliseconds));
