// Whether the process a job record names still runs (A-056), and whether a starting job's spawner still sets it up. The
// identity is the record's `{pid, born, bootId}`, written in the transition to running: a missing part means unknown,
// never alive, so nothing keeps a job running on it; another boot, or another start time under the pid, means dead.
// What the system cannot describe (a process query that gives no answer) is not dead, as in src/lock.ts. The module
// writes nothing, so the reads that show a job's state load it without the reaper (T-04, R-105), which ends a job whose
// process is gone (src/runtime/reap.ts).
import type { Identity, JobRecord } from "../job/record.ts";
import { platform } from "../platform/platform.ts";

/** `alive`: the recorded process runs; `dead`: it is gone; `unknown`: the record does not say which process it is. */
export type OwnerState = "alive" | "dead" | "unknown";
/** What a check of the recorded process found, and why, in the words of the reaper's log line. */
type OwnerCheck = { readonly state: OwnerState; readonly why: string };

/** Why each process a check found gone is gone, by its `pid born bootId`: that identity never returns. */
const gone = new Map<string, string>();

/** Whether the process `identity` names runs now. Every check reads the process again, except one already found gone. */
export async function ownerState(identity: Identity | null): Promise<OwnerState> {
	return (await ownerCheck(identity)).state;
}

/** `ownerState` with its reason, which the reaper writes into the end of a job it reaps. */
export async function ownerCheck(identity: Identity | null): Promise<OwnerCheck> {
	if (identity?.pid == null) {
		return { state: "unknown", why: "no wrapper pid recorded" };
	}
	const { pid, born, bootId } = identity;
	if (born === null) {
		return { state: "unknown", why: `wrapper ${pid} has no start time recorded` };
	}
	const key = `${pid} ${born} ${bootId}`;
	const known = gone.get(key);
	if (known !== undefined) {
		return { state: "dead", why: known };
	}
	const why = await deadBecause(pid, born, bootId);
	if (why === undefined) {
		return { state: "alive", why: `wrapper ${pid} runs` };
	}
	gone.set(key, why);
	return { state: "dead", why };
}

/** Why the process `pid`, started at `born` in the boot `bootId`, is gone; undefined while it runs or none can say. */
async function deadBecause(pid: number, born: string, bootId: string | null): Promise<string | undefined> {
	if (otherBoot(bootId)) {
		return `wrapper ${pid} ran in another boot`;
	}
	const outcome = platform.processAlive(pid) ? await platform.processInfo(pid) : undefined;
	if (outcome?.kind === "unavailable" || (outcome?.kind === "present" && outcome.process.born === born)) {
		return;
	}
	return outcome?.kind === "present" ? `wrapper ${pid} is another process now` : `wrapper ${pid} is not running`;
}

/** Whether the recorded boot id names a boot other than the current one; a boot id nobody gives is no other boot. */
export function otherBoot(bootId: string | null): boolean {
	const current = platform.bootId();
	return bootId !== null && current !== undefined && bootId !== current;
}

/** A job its spawner is still setting up: published, not yet running, and the publishing process is alive. */
export function startingJob(record: JobRecord | undefined): boolean {
	return record?.state === "starting" && record.spawnerPid !== null && platform.processAlive(record.spawnerPid);
}
