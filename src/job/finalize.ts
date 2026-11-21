// The end of a job (A-019, T-01): its terminal transition through the record's one writer (src/job/record.ts), then
// what follows from it. Before the transition it counts the job's commits and collects the open note checks; a side
// channel that fails there is written with the terminal state in `sideFailures`. The transition is the commit point:
// a finisher that loses it writes nothing, and the group's events, the coordinator's Herdr wake and the job's tab,
// which read the terminal record, follow only the winner; their failures go to the job's log, since nothing writes
// the record after a terminal state.
import { readdir, rm } from "node:fs/promises";
import { TEMPORARY_NAME, temporaryWriter } from "../atomic-write.ts";
import { promptCoordinator } from "../integrations/coordinator-wake.ts";
import { settleJobTab } from "../integrations/herdr.ts";
import { platform } from "../platform/platform.ts";
import { commitList } from "../project/git.ts";
import { jobMembership, startGroupAdvance } from "./group-cabinet.ts";
import { syncLifecycle } from "./group-events.ts";
import type { TerminalState } from "./job.ts";
import { appendLimenLog, failureFrom, type JobRecord, readRecord, type SideFailure, transition } from "./record.ts";
import { noteCheckOpen } from "./task-note.ts";

export function isFailedStopReason(reason: string): boolean {
	return reason === "error" || reason.startsWith("error: ") || reason === "aborted" || reason.startsWith("aborted: ");
}
export const requestedTerminal = (reason: string): "done" | "stopped" =>
	reason.startsWith("done:") ? "done" : "stopped";

/** When the wrapper's Herdr wake must give up, and the states the job may end from (starting or running by default). */
export type FinalizeOptions = {
	readonly shutdownDeadline?: number | undefined;
	readonly from?: readonly ("starting" | "running")[];
};

/**
 * Ends the job of `jobDir` as `state` with `detail` when it is still in a state of `options.from`; true when this call
 * ended it, false when it was in another state or another finisher already had.
 */
export async function finalizeJob(
	jobDir: string,
	state: TerminalState,
	detail: string,
	options: FinalizeOptions = {},
): Promise<boolean> {
	const from = options.from ?? ["starting", "running"];
	const record = await readRecord(jobDir);
	if (!(record && from.some((one) => one === record.state))) {
		return false;
	}
	const sideFailures: SideFailure[] = [];
	const commits = await countedCommits(record).catch((error: unknown) => {
		sideFailures.push(sideFailure("commit count", error));
		return null;
	});
	// A done the coordinator asked for (`done: <reason>`) already accepts what is open.
	const open = state === "done" && !detail.startsWith("done:") ? noteCheckOpen(jobDir, record.worktree) : [];
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
			await appendLimenLog(jobDir, line).catch((error: unknown) => sideFailures.push(sideFailure("log", error)));
		},
		set: (current) => ({
			failure: state === "failed" ? failureFrom(detail) : null,
			openChecks: open.length ? open : null,
			commits,
			queued: null,
			sideFailures: [...current.sideFailures, ...sideFailures],
		}),
	});
	if (!ended) {
		return false;
	}
	await afterEnd(jobDir, ended, options.shutdownDeadline);
	return true;
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
			startGroupAdvance(membership.run);
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
