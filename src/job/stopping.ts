// The stop of a running job (T-26 (2)): `limen stop` and a group's stop of its members call `stopJob`. It is an
// operation of T-38 (src/operation.ts): its validate reads the job's state and refuses a running job with no pid, its
// apply writes the "stop requested" line under the job's lock once the state is still the one it read, and every later
// write is a compare-and-swap of the record's one writer (src/job/record.ts), which a wrapper that ends first wins.
// The first of them puts the stop's reason into the record as its stop request, before the TERM: the wrapper tells a
// stop from any other TERM only by it, so whichever finisher wins ends the job as the stop asked (A-052, A-019).
import { mkdir } from "node:fs/promises";
import { runOperation, stepFailure } from "../operation.ts";
import { LimenError, refused } from "../outcome.ts";
import { platform } from "../platform/platform.ts";
import { KILL_WAIT_MS, stopGraceMs, waitForProcessGroup } from "../runtime/reap.ts";
import { finalizeJob, requestedTerminal } from "./finalize.ts";
import { SESSION_ID } from "./job.ts";
import { appendLimenLog, type JobRecord, readRecord, transition } from "./record.ts";
import { type JobReference, resolveJob } from "./reference.ts";

/** What stop's validate found: the job, the reason, and its state with the pid a running job has. */
type StopPlan = {
	readonly id: string;
	readonly jobDir: string;
	readonly reason: string;
	readonly state: JobRecord["state"] | undefined;
};

/**
 * The tests' injection points (D-029): `requested` runs after the stop's first write and before its first transition;
 * `signalled` runs after the TERM of a running job and before the stop's terminal transition, so a test can let the
 * wrapper end the job first. Limen's own callers never pass them, and no setting does (T-03).
 */
export type StopSteps = { readonly requested?: () => Promise<void>; readonly signalled?: () => Promise<void> };

/**
 * Stops the job `query` names with the reason `given`, or "stopped by request"; returns the line that says how it
 * ended. A job its wrapper has not run yet ends here at once, only from `starting`, and its wrapper then finds it no
 * longer starting and runs no engine; a wrapper that moved it to running after the stop's first write is stopped as a
 * running job, signal and all.
 */
export async function stopJob(
	query: JobReference,
	given: string,
	cwd: string,
	steps: StopSteps = {},
	again: string | null = null,
): Promise<string> {
	const plan = await runOperation<StopPlan, StopPlan>({
		again,
		validate: async (view) => {
			const { id, jobDir } = await resolveJob(cwd, query, "control");
			const state = await view.hold(`the state of job ${id}`, async () => {
				const record = await view.record(jobDir);
				if (record?.state === "running" && !record.identity?.pid) {
					throw refused("JOB_NO_PID", `running job ${id} has no recorded pid`);
				}
				return record?.state;
			});
			return { id, jobDir, reason: given.trim() || "stopped by request", state };
		},
		lock: ({ jobDir }) => ({ folder: jobDir }),
		apply: async (plan) => {
			if (plan.state === "starting" || plan.state === "running") {
				await appendLimenLog(plan.jobDir, `stop requested: ${plan.reason}`);
			}
			return plan;
		},
	});
	await steps.requested?.();
	try {
		return await endJob(plan, again, steps);
	} catch (error) {
		throw stepFailure(error);
	}
}

/** The writes after the stop's first: each a transition from the state the record is in, or a signal. */
async function endJob(
	{ id, jobDir, reason, state }: StopPlan,
	again: string | null,
	steps: StopSteps,
): Promise<string> {
	let record = await readRecord(jobDir);
	if (state === "starting") {
		if (await finalizeJob(jobDir, requestedTerminal(reason), reason, { from: ["starting"] })) {
			return `${requestedTerminal(reason)} ${id}: ${reason}`;
		}
		record = await readRecord(jobDir);
	}
	if (record?.state !== "running") {
		return `${id} is already ${record?.state ?? "without a record"}`;
	}
	const pid = record.identity?.pid;
	if (!pid) {
		// Validate refused a running job with no pid; this one moved to running after the stop's first write, so the
		// failure is no refusal (T-38 (3)) but a state still settling, which a rerun reads again.
		throw new LimenError({
			class: "transient",
			code: "JOB_PID_PENDING",
			message: `job ${id} moved to running after the stop asked for it and has no recorded pid yet; run limen stop again`,
			next: again,
		});
	}
	// The request is in the record before the TERM, so a wrapper that the TERM reaches reads it at its end (A-052). A job
	// that ended meanwhile has no request to take, and its group gets no signal.
	if (!(await transition(jobDir, { from: ["running"], set: { stopRequested: reason } }))) {
		return `${id} is already ${await stateOf(jobDir)}`;
	}
	// A wrapper in the start queue ends its own job with this reason at once; then this command finalizes nothing.
	const queued = record.queued !== null;
	// The wrapper's group gets TERM, then KILL when it still runs after its grace. A process outside the group, such as
	// one the engine detached, is left to the end of the job's scope, which the winner of the transition sends after
	// this grace (A-029).
	const result = platform.signalProcessGroup(pid, "SIGTERM");
	const grace = (async () => {
		if (result !== "missing" && !(await waitForProcessGroup(pid, stopGraceMs()))) {
			await appendLimenLog(jobDir, "TERM grace elapsed; sending KILL");
			platform.signalProcessGroup(pid, "SIGKILL");
			await waitForProcessGroup(pid, KILL_WAIT_MS);
		}
	})().catch(() => {});
	await steps.signalled?.();
	// Give a signaled wrapper one brief turn to publish its own terminal state; the first finisher wins either way.
	const turn = Date.now() + (queued ? 2_000 : 25);
	do {
		await new Promise((resolve) => setTimeout(resolve, 25));
	} while (queued && Date.now() < turn && (await stateOf(jobDir)) === "running");
	if (!(await finalizeJob(jobDir, requestedTerminal(reason), reason, { beforeScopeEnd: () => grace }))) {
		await markCallerDelivered(jobDir);
		const settled = await stateOf(jobDir);
		return queued ? `${settled} ${id}: ${reason}` : `${id} is already ${settled}`;
	}
	await markCallerDelivered(jobDir);
	return `${requestedTerminal(reason)} ${id}: ${reason}`;
}
async function stateOf(jobDir: string): Promise<string> {
	return (await readRecord(jobDir))?.state ?? "without a record";
}
async function markCallerDelivered(jobDir: string): Promise<void> {
	const session = process.env.PI_SESSION_ID?.trim();
	if (session && SESSION_ID.test(session)) {
		await mkdir(`${jobDir}/notify/delivered/${session}`, { recursive: true });
	}
}
