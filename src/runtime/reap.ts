// The reaper that ends a running job whose process is gone (A-005), and the one grace between a TERM and a KILL of a
// stop, an exhaustion, a reap and a TERM the job's wrapper forwards to its engine (A-020). Whether the process a job
// record names still runs is src/runtime/liveness.ts's (A-056). A dead wrapper can leave its engine running, so the
// reaper ends what is left of the job, its scope or its wrapper's group, before it writes `failed`; while that is not
// gone, the job stays running, with a line in its log and its `stuck` one attempt longer (R-032). The seat sweep
// (src/runtime/sweeping.ts) is the reaper's one caller, and it also ends the scope a finished job left behind
// (`endLeftoverScopes`). Whether a job holds any process at all, its wrapper or its scope, is `holdsProcesses`, which
// the callers outside the reaper ask.
import { testKnob } from "../config.ts";
import { finalizeJob, readScope } from "../job/finalize.ts";
import { isTerminal } from "../job/job.ts";
import {
	appendLimenLog,
	type Identity,
	type JobRecord,
	jobFolderNames,
	notMigrated,
	readRecord,
	unmigratedFolder,
	writeStuck,
} from "../job/record.ts";
import { platform, type ScopeSignal, type ScopeState } from "../platform/platform.ts";
import { jobScope } from "./launcher.ts";
import { otherBoot, ownerCheck, ownerState, startingJob } from "./liveness.ts";
import { claimRecovery } from "./recovery.ts";

export const STARTUP_GRACE_MS = 10 * 60_000;
/** The grace between a TERM and a KILL (A-005, A-020: 10 s); the knob LIMEN_STOP_GRACE_MS shortens it. */
const STOP_GRACE_MS = 10_000;
/** How long a reap, a stop (src/job/stopping.ts) and a spawn's failed handshake wait for what they KILLed to be gone. */
export const KILL_WAIT_MS = 1_000;
/** How often a wait for a scope or a group to be gone reads it again: an exit raises no event. */
const GONE_POLL_MS = 100;

/** This process's identity, which the transition to running records: a part the system does not give is null. */
export async function processIdentity(): Promise<Identity> {
	const own = await platform.processInfo(process.pid);
	const born = own.kind === "present" ? own.process.born : null;
	return { pid: process.pid, born, bootId: platform.bootId() ?? null };
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
 * Whether the job of `record` holds a process now (R-032 (c)): a starting job as `liveJob` reads it; a running job
 * while its wrapper lives or a process is in the cgroup of the scope its record names, since a wrapper killed alone
 * leaves its engine running there. The cgroup's own `cgroup.events` answers, not a user manager: the deployment's gate
 * runs as root, whose manager knows no scope of the agents' account (R-032 review round 1, note 7); a cgroup that does
 * not read holds processes (z. 14). The deployment's gate, the migration and spawn ask this; the reaper asks `liveJob`,
 * about the wrapper alone, since it ends the scope of a dead wrapper itself. A finished job's leftover scope is the
 * sweep's (`endLeftoverScopes`).
 */
export async function holdsProcesses(record: JobRecord | undefined, now = Date.now()): Promise<boolean> {
	if (await liveJob(record, now)) {
		return true;
	}
	return record?.state === "running" && scopeHolds(record);
}

/**
 * Whether the scope `record` names holds a process: its cgroup's own `cgroup.events`, read as `holdsProcesses` reads
 * it, so a cgroup that does not read holds processes (z. 14); none when the record names no scope. Prune asks it of a
 * finished job, whose scope end may have failed (D-097 (4) (e)), so it keeps that job's worktree (T-25).
 */
export function scopeHolds(record: JobRecord): boolean {
	return record.scope !== undefined && platform.cgroupPopulated(record.scope.cgroup).kind !== "empty";
}

/** A job folder the reaper could not read or end, and why; the sweep names each one and goes on (z. 10, T-01). */
export type JobFailure = { readonly jobDir: string; readonly error: unknown };

/**
 * Each job folder of `jobsRoot` with its record, read one by one (R-032 review round 1, note 8): a folder an older
 * Limen wrote (NOT_MIGRATED) or a record that does not read (BAD_DATA) goes into `failed` and stops no other job. The
 * sweep's steps share it, its resume after the subscription limit included (src/runtime/resuming.ts).
 */
export async function eachRecord(
	jobsRoot: string,
	failed: JobFailure[],
	work: (id: string, jobDir: string, record: JobRecord | undefined) => Promise<void>,
): Promise<void> {
	for (const id of await jobFolderNames(jobsRoot)) {
		const jobDir = `${jobsRoot}/${id}`;
		try {
			if (unmigratedFolder(jobDir)) {
				throw notMigrated(jobsRoot, id);
			}
			await work(id, jobDir, await readRecord(jobDir));
		} catch (error) {
			failed.push({ jobDir, error });
		}
	}
}

/**
 * Ends each running job whose wrapper is dead or unknown, once it was seen so twice `reapConfirmMs` apart (`seen` holds
 * the first sighting), under the job's recovery claim: its scope or group first, then the job (`endDeadJob`). A job
 * whose scope or group was not ended stays running and needs a new confirmation before the next attempt. A job that
 * fails to read or to end is returned with its failure, and the other jobs go on.
 */
export async function reapDeadJobs(
	jobsRoot: string,
	seen: Map<string, number>,
	now = Date.now(),
): Promise<readonly JobFailure[]> {
	const failed: JobFailure[] = [];
	await eachRecord(jobsRoot, failed, async (id, jobDir, record) => {
		if (record?.state !== "running" || (await liveJob(record, now))) {
			seen.delete(id);
			return;
		}
		const first = seen.get(id);
		if (first === undefined) {
			seen.set(id, now);
			return;
		}
		if (now - first < reapConfirmMs()) {
			return;
		}
		const release = await claimRecovery(jobDir);
		if (!release) {
			return;
		}
		try {
			const current = await readRecord(jobDir);
			if (current?.state !== "running" || (await liveJob(current, now))) {
				return;
			}
			await endDeadJob(jobDir, current);
			seen.delete(id);
		} finally {
			await release();
		}
	});
	return failed;
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
		await notEnded(jobDir, ending);
		return;
	}
	// The prefix is the pattern of the failure kind `reaped` (src/job/record.ts), which older records carry too.
	const detail = `process group gone: ${owner.why}; ${ending.how}`;
	await finalizeJob(jobDir, { state: "failed", failure: { kind: "reaped", detail } }, { readings });
	await writeStuck(jobDir, () => undefined);
}

/**
 * One failed attempt to end what is left of a job (R-032): a line in its log (T-01), and its `stuck` one attempt
 * longer, which from the third attempt in a row the alerts send and `limen status` names (`escalatedStuck`).
 */
async function notEnded(jobDir: string, ending: Extract<Ending, { kind: "not ended" }>): Promise<void> {
	const detail = `${ending.target} not ended: ${ending.reason}`;
	await appendLimenLog(jobDir, `reap: ${detail}`);
	const now = new Date().toISOString();
	await writeStuck(jobDir, (stuck) => ({
		since: stuck?.since ?? now,
		attempts: (stuck?.attempts ?? 0) + 1,
		detail,
	}));
}

/**
 * Ends the scope of each finished job of `jobsRoot` that `live`, the user manager's live units, still holds (R-032):
 * what is left of a job whose end did not end its scope, which may still hold its engine. It ends such a scope as a
 * reap does (TERM, the grace, KILL) under the job's recovery claim, and writes its log line and `stuck` as a reap that
 * fails does. A job whose wrapper still runs is left alone: the wrapper finishes the job from inside its scope and ends
 * that scope last. A finished job keeps its `stuck` until the run sees its scope gone, also one the listing lacks: a
 * missing scope in a listing is no end (R-032 review round 1, note 6). A job that fails to read or to end is returned
 * with its failure, and the other jobs go on.
 */
export async function endLeftoverScopes(jobsRoot: string, live: ReadonlySet<string>): Promise<readonly JobFailure[]> {
	const failed: JobFailure[] = [];
	await eachRecord(jobsRoot, failed, async (id, jobDir, record) => {
		if (!(record && isTerminal(record.state))) {
			return;
		}
		const unit = record.scope?.unit ?? jobScope(id);
		if (!(live.has(unit) || record.stuck)) {
			return;
		}
		// The listing is the run's, so a scope a reap of this run ended is in it; its state says it is gone.
		if (platform.scopeState(unit, record.scope?.cgroup).kind === "gone") {
			if (record.stuck) {
				await writeStuck(jobDir, () => undefined);
			}
			return;
		}
		if ((await ownerState(record.identity)) === "alive") {
			return;
		}
		const release = await claimRecovery(jobDir);
		if (!release) {
			return;
		}
		try {
			const ending = await terminateScope(unit, record.scope?.cgroup);
			if (ending.kind === "not ended") {
				await notEnded(jobDir, ending);
			} else {
				await appendLimenLog(jobDir, `reap: the ${record.state} job's ${ending.how}`);
				await writeStuck(jobDir, () => undefined);
			}
		} finally {
			await release();
		}
	});
	return failed;
}

/**
 * TERM to every process of the scope `unit`, at most the grace for it to be gone, then KILL and at most `KILL_WAIT_MS`.
 * The scope holds every process of the job, `setsid` ones included (A-029), so its end is the job's. A signal whose
 * call fails is followed by one state read, and its failure goes into the line of whatever then decides the ending
 * (T-01).
 */
async function terminateScope(unit: string, cgroup: string | undefined): Promise<Ending> {
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
async function scopeAfter(unit: string, cgroup: string | undefined, milliseconds: number): Promise<ScopeState> {
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
/**
 * One reap of `jobsRoot` as the seat sweep runs it (R-032): a first sighting of each dead running job, the confirmation
 * `reapConfirmMs` later when it found one, then one attempt at each. Returns the jobs that failed in its last pass.
 */
export async function confirmDeadJobs(jobsRoot: string): Promise<readonly JobFailure[]> {
	const seen = new Map<string, number>();
	const first = await reapDeadJobs(jobsRoot, seen);
	if (seen.size === 0) {
		return first;
	}
	await delay(reapConfirmMs());
	return reapDeadJobs(jobsRoot, seen);
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
