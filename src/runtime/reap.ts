import { readdir } from "node:fs/promises";
import { testKnob } from "../config.ts";
import { finalizeJob, textFile } from "../job/record.ts";
import { type ProcessQueryOutcome, processAlive, processGroupAlive, processInfo } from "./contain.ts";
import { claimRecovery } from "./recovery.ts";

export const STARTUP_GRACE_MS = 10 * 60_000;
export async function liveJob(jobDir: string, now = Date.now()): Promise<boolean> {
	if ((await textFile(`${jobDir}/state`)) !== "running") {
		return false;
	}
	const pid = Number(await textFile(`${jobDir}/pid`));
	const recorded = Number.isSafeInteger(pid) && pid > 0 ? pid : undefined;
	if (
		recorded !== undefined &&
		processGroupAlive(recorded) &&
		(await sameBirth(recorded, await textFile(`${jobDir}/born`)))
	) {
		return true;
	}
	if (recorded !== undefined) {
		return false;
	}
	const startedAt = Date.parse(await textFile(`${jobDir}/started-at`));
	return Number.isFinite(startedAt) && now - startedAt < STARTUP_GRACE_MS;
}
/** A job its spawner is still setting up: no state yet, and the spawning process recorded in `starting` is alive. */
export async function startingJob(jobDir: string): Promise<boolean> {
	if (await textFile(`${jobDir}/state`)) {
		return false;
	}
	const pid = Number(await textFile(`${jobDir}/starting`));
	return Number.isSafeInteger(pid) && pid > 0 && processAlive(pid);
}
export async function ownerAlive(jobDir: string, query = processInfo): Promise<boolean> {
	const pid = Number(await textFile(`${jobDir}/pid`));
	if (!Number.isSafeInteger(pid) || pid <= 0 || !processAlive(pid)) {
		return false;
	}
	return sameBirth(pid, await textFile(`${jobDir}/born`), query);
}
/** `pid born` of each process a check found gone: it is gone for good, since a pid and start time never return. */
const gone = new Set<string>();
/** The live pid is still the recorded process. Every check reads the process again, except one already found gone. */
async function sameBirth(
	pid: number,
	born: string,
	query: (pid: number) => Promise<ProcessQueryOutcome> = processInfo,
): Promise<boolean> {
	if (!born) {
		return true;
	}
	const key = `${pid} ${born}`;
	if (gone.has(key)) {
		return false;
	}
	const outcome = await query(pid);
	if (outcome.kind === "unavailable") {
		return true;
	}
	const alive = outcome.kind === "present" && outcome.process.born === born;
	if (!alive) {
		gone.add(key);
	}
	return alive;
}
export async function reapDeadJobs(
	jobsRoot: string,
	seen: Map<string, number>,
	now = Date.now(),
	ids?: readonly string[],
): Promise<void> {
	const candidates = ids ?? (await readdir(jobsRoot).catch(() => [] as string[]));
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
		if ((await textFile(`${jobDir}/state`)) !== "running") {
			seen.delete(id);
			continue;
		}
		const startedAt = Date.parse(await textFile(`${jobDir}/started-at`));
		const pid = Number(await textFile(`${jobDir}/pid`));
		const validPid = Number.isSafeInteger(pid) && pid > 0;
		if ((await ownerAlive(jobDir)) || (!validPid && Number.isFinite(startedAt) && now - startedAt < STARTUP_GRACE_MS)) {
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
			if ((await textFile(`${jobDir}/state`)) !== "running" || (await ownerAlive(jobDir))) {
				continue;
			}
			await finalizeJob(jobDir, "failed", "process group gone");
			seen.delete(id);
		} finally {
			await release();
		}
	}
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
