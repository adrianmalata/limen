// Whether the process a job record names still runs (A-056), the reaper that ends a running job whose process is gone
// (A-005), and the one grace between a TERM and a KILL of a stop, an exhaustion, a reap and a TERM the job's wrapper
// forwards to its engine (A-020). The identity is the record's `{pid, born, bootId}`, written in the transition to
// running: a missing part means unknown, never alive, so nothing keeps a job running on it; another boot, or another
// start time under the pid, means dead. What the system cannot describe (a process query that gives no answer) is not
// dead, as in src/lock.ts. A dead wrapper can leave its engine running, so the reaper ends what is left of the job, its
// scope or its wrapper's group, before it writes `failed`; while that is not gone, the job stays running, with a line
// in its log.
import { testKnob } from "../config.ts";
import { finalizeJob, readScope } from "../job/finalize.ts";
import { appendLimenLog, type Identity, type JobRecord, jobFolders, readRecord } from "../job/record.ts";
import { platform, type ScopeSignal, type ScopeState } from "../platform/platform.ts";
import { claimRecovery } from "./recovery.ts";

export const STARTUP_GRACE_MS = 10 * 60_000;
/** The grace between a TERM and a KILL (A-005, A-020: 10 s); the knob LIMEN_STOP_GRACE_MS shortens it. */
const STOP_GRACE_MS = 10_000;
/** How long a reap, a stop (src/job/stopping.ts) and a spawn's failed handshake wait for what they KILLed to be gone. */
export const KILL_WAIT_MS = 1_000;
/** How often a wait for a scope or a group to be gone reads it again: an exit raises no event. */
const GONE_POLL_MS = 100;

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

/** `ownerState` with its reason. */
async function ownerCheck(identity: Identity | null): Promise<OwnerCheck> {
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
function otherBoot(bootId: string | null): boolean {
	const current = platform.bootId();
	return bootId !== null && current !== undefined && bootId !== current;
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
 * A job that runs or starts now: a running job whose wrapper is alive by its identity; a starting job whose spawner
 * lives or whose startup grace runs. A running job has no grace: the transition to running writes its identity in the
 * same write. A running job that is not live may still hold processes in its scope, which the reaper ends first.
 */
export async function liveJob(record: JobRecord | undefined, now = Date.now()): Promise<boolean> {
	if (record?.state === "starting") {
		return startingJob(record) || young(record, now);
	}
	return record?.state === "running" && (await ownerState(record.identity)) === "alive";
}

/**
 * Ends each running job whose wrapper is dead or unknown, once it was seen so twice `reapConfirmMs` apart (`seen` holds
 * the first sighting), under the job's recovery claim: its scope or group first, then the job (`endDeadJob`). A job
 * whose scope or group was not ended stays running and needs a new confirmation before the next attempt.
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
			const current = await readRecord(jobDir);
			if (current?.state !== "running" || (await liveJob(current, now))) {
				continue;
			}
			await endDeadJob(jobDir, current);
			seen.delete(id);
		} finally {
			await release();
		}
	}
}

/** What a reap did to what is left of a job: `gone`, with how it ended; or `not ended`, with what and why. */
type Ending =
	| { readonly kind: "gone"; readonly how: string }
	| { readonly kind: "not ended"; readonly target: string; readonly reason: string };

/**
 * Ends the running job of `jobDir`, whose wrapper is dead or unknown, only once nothing of it is left (A-005): the
 * readings of its scope first, which the terminal record holds since the KILL may take the scope's folder; then its
 * scope, or, for a record without one (written before R-026), its wrapper's process group, by TERM, a grace and KILL;
 * then `failed`, with what was checked. A scope or group that is not gone, or whose state cannot be read, leaves the
 * job running with its identity, and one line in its log (T-01).
 */
async function endDeadJob(jobDir: string, record: JobRecord): Promise<void> {
	const owner = await ownerCheck(record.identity);
	const readings = await readScope(record);
	const ending = record.scope
		? await terminateScope(record.scope.unit, record.scope.cgroup)
		: await terminateGroup(record.identity);
	if (ending.kind === "not ended") {
		await appendLimenLog(jobDir, `reap: ${ending.target} not ended: ${ending.reason}`);
		return;
	}
	// The prefix is the pattern of the failure kind `reaped` (src/job/record.ts), which older records carry too.
	await finalizeJob(jobDir, "failed", `process group gone: ${owner.why}; ${ending.how}`, { readings });
}

/**
 * TERM to every process of the scope `unit`, at most the grace for it to be gone, then KILL and at most `KILL_WAIT_MS`.
 * The scope holds every process of the job, `setsid` ones included (A-029), so its end is the job's. A signal whose
 * call fails is followed by one state read, and its failure goes into the line of whatever then decides the ending
 * (T-01).
 */
async function terminateScope(unit: string, cgroup: string): Promise<Ending> {
	const failures: string[] = [];
	const noted = (text: string) => [text, ...failures].join("; ");
	const outcome = (state: ScopeState, how: string): Ending | undefined => {
		if (state.kind === "gone") {
			return { kind: "gone", how: noted(`scope ${unit} ${how}`) };
		}
		return state.kind === "failed" ? { kind: "not ended", target: unit, reason: noted(state.detail) } : undefined;
	};
	const signalled = async (signal: ScopeSignal, wait: number): Promise<ScopeState> => {
		const sent = platform.signalScope(unit, signal);
		if (sent.kind === "sent") {
			return await scopeAfter(unit, cgroup, wait);
		}
		failures.push(`${signal} failed: ${sent.detail}`);
		return platform.scopeState(unit, cgroup);
	};
	const found = outcome(platform.scopeState(unit, cgroup), "was gone");
	if (found) {
		return found;
	}
	const termed = outcome(await signalled("SIGTERM", stopGraceMs()), "ended after TERM");
	if (termed) {
		return termed;
	}
	const failedBeforeKill = failures.length;
	const killed = outcome(await signalled("SIGKILL", KILL_WAIT_MS), "ended after KILL");
	if (killed) {
		return killed;
	}
	// A KILL whose call failed had no wait after it; its failure is the last of the notes.
	const killFailed = failures.length > failedBeforeKill;
	const reason = killFailed ? "still active" : `still active ${KILL_WAIT_MS / 1000} s after SIGKILL`;
	return { kind: "not ended", target: unit, reason: noted(reason) };
}

/** The state of the scope `unit` once it is no longer active or `milliseconds` passed, read every `GONE_POLL_MS`. */
async function scopeAfter(unit: string, cgroup: string, milliseconds: number): Promise<ScopeState> {
	const deadline = Date.now() + milliseconds;
	for (;;) {
		const state = platform.scopeState(unit, cgroup);
		if (state.kind !== "active" || Date.now() >= deadline) {
			return state;
		}
		await delay(GONE_POLL_MS);
	}
}

/**
 * The same steps on the wrapper's process group, whose id is the wrapper's pid, for a record without a scope. A pid
 * that a live group holds is never given to a new process, so a process at that pid with another start time shows that
 * the job's group ended before it came. A process there whose start time the record lacks may be the wrapper or a
 * stranger that leads a group of its own, so the reaper signals no group it cannot tell apart (z. 14).
 */
async function terminateGroup(identity: Identity | null): Promise<Ending> {
	if (identity?.pid == null) {
		return { kind: "gone", how: "no process group to end" };
	}
	const { pid, born, bootId } = identity;
	const group = `group ${pid}`;
	const notEnded = (reason: string): Ending => ({ kind: "not ended", target: group, reason });
	if (otherBoot(bootId)) {
		return { kind: "gone", how: `${group} was gone` };
	}
	const holder = await platform.processInfo(pid);
	if (holder.kind === "present") {
		const another = born !== null && holder.process.born !== born;
		return another
			? { kind: "gone", how: `${group} was gone` }
			: notEnded(`pid ${pid} runs a process that may be the wrapper`);
	}
	if (holder.kind === "unavailable") {
		return notEnded(`the system does not describe pid ${pid}`);
	}
	if (!platform.processGroupAlive(pid)) {
		return { kind: "gone", how: `${group} was gone` };
	}
	for (const [signal, wait, how] of [
		["SIGTERM", stopGraceMs(), "ended after TERM"],
		["SIGKILL", KILL_WAIT_MS, "ended after KILL"],
	] as const) {
		if (platform.signalProcessGroup(pid, signal) === "denied") {
			return notEnded(`${signal} to the group was not permitted`);
		}
		if (await waitForProcessGroup(pid, wait)) {
			return { kind: "gone", how: `${group} ${how}` };
		}
	}
	return notEnded(`still alive ${KILL_WAIT_MS / 1000} s after SIGKILL`);
}

/**
 * Whether the process group `pgid`, a wrapper's, is gone within `milliseconds`, read again every `GONE_POLL_MS`: the
 * grace of a group after a TERM, before a KILL and before the end of the job's scope.
 */
export async function waitForProcessGroup(pgid: number, milliseconds: number): Promise<boolean> {
	const deadline = Date.now() + milliseconds;
	while (platform.processGroupAlive(pgid) && Date.now() < deadline) {
		await delay(GONE_POLL_MS);
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
/**
 * The grace a stop (src/job/stopping.ts), an exhaustion, a TERM the wrapper forwards (src/runtime/wrapper.ts) and a
 * reap give a TERM.
 */
export function stopGraceMs(): number {
	const raw = Number(testKnob("LIMEN_STOP_GRACE_MS"));
	return Number.isFinite(raw) && raw > 0 ? raw : STOP_GRACE_MS;
}
const delay = (milliseconds: number) => new Promise<void>((resolve) => setTimeout(resolve, milliseconds));
