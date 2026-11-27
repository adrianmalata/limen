// The end of a job (A-019, T-01): its terminal transition through the record's one writer (src/job/record.ts), then
// what follows from it. A failed end takes the failure its detector passes, kind and detail (A-016 (1)). Before the
// transition it counts the job's commits and reads its
// scope's readings, unless the finisher read them before it ended the scope itself, as the reaper does
// (src/runtime/reap.ts), with the peak CPU share a job's wrapper measured (M-09); an OOM kill those readings count
// names a signal death's or a reaped wrapper's failure `oom` (A-052), and an end on the subscription limit of a job's
// last resume is `quota-exhausted` (src/job/quota.ts). A side channel that fails there is written with the terminal
// state in `sideFailures`. A read-only role's `done` end becomes `failed`, kind `read-only-violation`, when its
// worktree or its own branch changed since its start state, or when that cannot be proven (src/job/read-only.ts,
// A-081); any other end keeps its cause and logs the difference. The
// transition is the commit point: a finisher that loses it writes nothing, and the group's events, the coordinator's
// Herdr wake, the next round of its group and the job's tab, which read the terminal record, follow only the winner;
// their failures go to the job's log, since nothing writes the record after a terminal state. The winner's last step,
// also after a step before it failed, ends the job's systemd user scope (A-029), so no process of the job outlives its
// end, a detached one included; what the steps before it start runs in a scope of its own (src/runtime/launcher.ts).
import { readdir, rm } from "node:fs/promises";
import { TEMPORARY_NAME, temporaryWriter } from "../atomic-write.ts";
import { promptCoordinator } from "../integrations/coordinator-wake.ts";
import { settleJobTab } from "../integrations/herdr.ts";
import { platform, type ScopeReadings } from "../platform/platform.ts";
import { commitList } from "../project/git.ts";
import { jobScope } from "../runtime/launcher.ts";
import { jobMembership, startGroupAdvance } from "./group-cabinet.ts";
import { syncLifecycle } from "./group-events.ts";
import { limitKind } from "./quota.ts";
import { type Effect, readOnlyEffect } from "./read-only.ts";
import {
	appendLimenLog,
	type DetectedFailure,
	type Failure,
	type JobRecord,
	queueLeft,
	readRecord,
	type SideFailure,
	transition,
} from "./record.ts";

/** The readings of a scope that could not be read. */
const UNREAD: ScopeReadings = { memoryPeakBytes: null, cpuMicroseconds: null, oomKills: null };

export function isFailedStopReason(reason: string): boolean {
	return reason === "error" || reason.startsWith("error: ") || reason === "aborted" || reason.startsWith("aborted: ");
}
export const requestedTerminal = (reason: string): "done" | "stopped" =>
	reason.startsWith("done:") ? "done" : "stopped";

/**
 * How a job ends: `done` or `stopped` with its detail, or `failed` with the failure the code that detected it passes
 * (A-016 (1)), never one read back from a detail.
 */
export type JobEnd =
	| { readonly state: "done" | "stopped"; readonly detail: string }
	| { readonly state: "failed"; readonly failure: DetectedFailure };

/** The end a stop request asks for: `limen stop`'s reason, `done` when it starts with `done:` (A-052). */
export function requestedEnd(reason: string): JobEnd {
	return { state: requestedTerminal(reason), detail: reason };
}

/** When the wrapper's Herdr wake must give up, and the states the job may end from (starting or running by default). */
export type FinalizeOptions = {
	readonly shutdownDeadline?: number | undefined;
	readonly from?: readonly ("starting" | "running")[];
	/**
	 * What the winner waits for after the steps that follow the transition and before it ends the job's scope: the grace
	 * of the job's process group after a TERM, so that the scope's SIGKILL meets only what the TERM left. None by default.
	 */
	readonly beforeScopeEnd?: () => Promise<void>;
	/**
	 * What the winner does when the end of the job's scope failed, after its log line: an exhaustion's KILL of the
	 * wrapper's own group, so that an engine that ignores TERM still ends. None by default.
	 */
	readonly onScopeNotEnded?: () => void;
	/**
	 * The scope's readings when the finisher read them before it ended the scope itself, as the reaper does: once its
	 * KILL has emptied the scope, the scope's folder and its readings may be gone. Read here, before the transition, by
	 * default.
	 */
	readonly readings?: ScopeRead;
	/**
	 * The peak CPU share of the job's scope that its wrapper measured over its engine's run (M-09), written into the
	 * record's `scope` with the readings; without it, the scope's own value stays, null for a job another process ends.
	 */
	readonly cpuPeakPercent?: number | null;
};

/** The readings of a job's scope just before its end, with the side failure of a read that failed (T-01). */
export type ScopeRead = { readonly readings: ScopeReadings; readonly failures: readonly SideFailure[] };

/** Reads the readings of the scope `record` names, while its processes still hold it; a record without one has none. */
export async function readScope(record: JobRecord): Promise<ScopeRead> {
	if (!record.scope) {
		return { readings: UNREAD, failures: [] };
	}
	return platform.scopeReadings(record.scope.cgroup).then(
		(readings) => ({ readings, failures: [] }),
		(error: unknown) => ({ readings: UNREAD, failures: [sideFailure("scope readings", error)] }),
	);
}

/**
 * Ends the job of `jobDir` as `requested` says, after the read-only check of its role (`checkedEnd`), when it is
 * still in a state of `options.from`; true when this call ended it, false when it was in another state or another
 * finisher already had.
 */
export async function finalizeJob(jobDir: string, requested: JobEnd, options: FinalizeOptions = {}): Promise<boolean> {
	const from = options.from ?? ["starting", "running"];
	const record = await readRecord(jobDir);
	if (!(record && from.some((one) => one === record.state))) {
		return false;
	}
	// Both `done` paths pass here, the engine's end and a `done:` stop (R-045 Decision 6).
	const effect = await readOnlyEffect(jobDir, record);
	const end = checkedEnd(requested, effect);
	const { state } = end;
	const detail = end.state === "failed" ? end.failure.detail : end.detail;
	const readOnlyLine = requested.state !== "done" && effect?.kind === "changed" ? `read-only: ${effect.detail}` : "";
	const sideFailures: SideFailure[] = [];
	const commits = await countedCommits(record).catch((error: unknown) => {
		sideFailures.push(sideFailure("commit count", error));
		return null;
	});
	// The scope's readings just before the transition, while its processes still hold it (`memory.peak` goes with it).
	const { readings, failures } = options.readings ?? (await readScope(record));
	sideFailures.push(...failures);
	const peak = options.cpuPeakPercent === undefined ? {} : { cpuPeakPercent: options.cpuPeakPercent };
	const ended = await transition(jobDir, {
		from,
		to: state,
		// The terminal log line lands before the record changes, so the story is durable when a reader sees the state.
		prepare: async () => {
			const inbox = (await readdir(`${jobDir}/steer/inbox`).catch(() => [])).filter(
				(name) => !TEMPORARY_NAME.test(name),
			);
			const line = inbox.length
				? `${state}: ${detail}; ${inbox.length} steer(s) never delivered`
				: `${state}: ${detail}`;
			const lines = readOnlyLine ? [readOnlyLine, line] : [line];
			for (const one of lines) {
				await appendLimenLog(jobDir, one).catch((error: unknown) => sideFailures.push(sideFailure("log", error)));
			}
		},
		set: (current) => ({
			failure:
				end.state === "failed"
					? recordedFailure(end.failure, current.scope ? readings : UNREAD, current.quotaAttempt)
					: null,
			commits,
			// A job that ends while it waits leaves the queue here, its wait kept with the time it left (A-036).
			...queueLeft(current, new Date().toISOString()),
			sideFailures: [...current.sideFailures, ...sideFailures],
			...(current.scope ? { scope: { ...current.scope, ...readings, ...peak } } : {}),
		}),
	});
	if (!ended) {
		return false;
	}
	// Any terminal transition stops the whole scope, also when a step after it rejects; the rejection goes on.
	try {
		await afterEnd(jobDir, ended, options.shutdownDeadline);
		await options.beforeScopeEnd?.();
	} finally {
		await endJobScope(jobDir, ended, options.onScopeNotEnded);
	}
	return true;
}

/**
 * The end `requested` takes for a job whose read-only check gave `effect` (A-081): a `done` end of a job that changed
 * its worktree or its own branch, or whose change cannot be proven, is `failed`, kind `read-only-violation`, with the
 * difference or the `unproven:` detail as its detail; a `failed` end keeps its own kind, since a job has one cause
 * (A-016 (1)), and a `stopped` end its state.
 */
function checkedEnd(requested: JobEnd, effect: Effect | undefined): JobEnd {
	if (requested.state !== "done" || effect === undefined || effect.kind === "same") {
		return requested;
	}
	return { state: "failed", failure: { kind: "read-only-violation", detail: effect.detail } };
}

/**
 * The failure its detector passed, with kind `oom` in place of `signal` or `reaped` when `readings`, the scope's
 * readings the terminal record holds, count an OOM kill (A-052): the kernel's OOM killer ends a process by SIGKILL, so
 * it shows as the engine's signal death or as a wrapper found gone. Any other kind stays, since its own detector
 * decided the end, also when a tool's process was OOM-killed earlier in the job; only `quota` on the last resume after
 * the limit, `quotaAttempt` 3, is `quota-exhausted`, so the one terminal record says it (D-097 (5) (g)).
 */
function recordedFailure(passed: DetectedFailure, readings: ScopeReadings, quotaAttempt: number | undefined): Failure {
	const failure = {
		kind: limitKind(passed.kind, quotaAttempt),
		detail: passed.detail,
		resetAt: passed.resetAt ?? null,
	};
	const oomKilled = (readings.oomKills ?? 0) > 0;
	return oomKilled && (failure.kind === "signal" || failure.kind === "reaped") ? { ...failure, kind: "oom" } : failure;
}

/**
 * Ends the job's scope: every process still in it gets SIGKILL, also one that left the job's process group or its
 * parent (A-029). A job that never recorded its scope (it ended before it ran) is ended by its unit's name, since its
 * wrapper may already run there; a scope that never started is gone, with nothing to log. When the finisher is the
 * wrapper, which runs in that scope, this is its last act. An end that failed goes to the job's log, then to
 * `notEnded`.
 */
async function endJobScope(jobDir: string, ended: JobRecord, notEnded: (() => void) | undefined): Promise<void> {
	const unit = ended.scope?.unit ?? jobScope(ended.id);
	const end = platform.endScope(unit, ended.scope?.cgroup);
	if (end.kind === "failed") {
		try {
			await appendLimenLog(jobDir, `scope ${unit} was not ended: ${end.detail}`);
		} finally {
			notEnded?.();
		}
	}
}

/** What follows the terminal record: the group, leftover temps, the coordinator's Herdr wake, the job's tab. */
async function afterEnd(jobDir: string, ended: JobRecord, shutdownDeadline: number | undefined): Promise<void> {
	if (ended.group) {
		const membership = await jobMembership(jobDir);
		if (membership) {
			await syncLifecycle(membership.run, "skip").catch((error: unknown) =>
				appendLimenLog(jobDir, `group events could not be updated: ${message(error)}`),
			);
		}
		if (membership?.member?.role === "coordinator") {
			await startGroupAdvance(membership.run).catch((error: unknown) =>
				appendLimenLog(jobDir, `the group's next round could not start: ${message(error)}`),
			);
		}
	}
	// A tmp whose writer still runs is an in-flight rename by a racing writer, not a leftover; deleting it makes that rename ENOENT and crashes the other process.
	for (const name of await readdir(jobDir).catch(() => [])) {
		const writer = temporaryWriter(name);
		if (writer !== undefined && !platform.processAlive(writer)) {
			await rm(`${jobDir}/${name}`, { force: true });
		}
	}
	// The Herdr prompt is the coordinator's wake. A group member's wake decides there whether group events carry it.
	await promptCoordinator(jobDir, shutdownDeadline).catch((error: unknown) =>
		appendLimenLog(
			jobDir,
			`coordinator wake via Herdr: could not be recorded (${message(error)}); inspect notify/herdr-prompt`,
		),
	);
	await settleJobTab(jobDir);
}

/** The job's commits on its branch since its base, or null when the record names no branch to count. */
async function countedCommits(record: JobRecord): Promise<string[] | null> {
	const { base, branch, worktree } = record;
	if (!base || !branch || !worktree) {
		return null;
	}
	const commits = commitList(worktree, base, branch);
	if (commits === undefined) {
		throw new Error(`git log ${base}..${branch} failed in ${worktree}`);
	}
	return commits ? commits.split("\n") : [];
}

function sideFailure(channel: string, error: unknown): SideFailure {
	return { channel, message: message(error), at: new Date().toISOString() };
}
function message(error: unknown): string {
	return error instanceof Error ? error.message : String(error);
}
