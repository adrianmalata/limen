import { mkdir } from "node:fs/promises";
import { finalizeJob, requestedTerminal } from "../job/finalize.ts";
import { SESSION_ID } from "../job/job.ts";
import { resolveJob } from "../job/lookup.ts";
import { appendLimenLog, readRecord, transition } from "../job/record.ts";
import type { Parsed } from "../parser.ts";
import { platform } from "../platform/platform.ts";
import { containEscapedDescendants, discoverEscapedDescendants, waitForProcessGroup } from "../runtime/contain.ts";
/** `limen stop`: stops a running job with the reason given, or "stopped by request". */
export async function stopCommand(values: Parsed, cwd: string): Promise<undefined> {
	await stopJob(values.get("job") ?? "", values.get("reason") ?? "", cwd);
}
/**
 * Stops the job `query` names; a group's stop calls it for each member job. A job its wrapper has not run yet ends
 * here at once, only from `starting`, and its wrapper then finds it no longer starting and runs no engine; a wrapper
 * that moved it to running in between is stopped as a running job, signal and all.
 */
export async function stopJob(query: string, given: string, cwd: string): Promise<void> {
	const { id, jobDir } = await resolveJob(cwd, query, "control");
	let record = await readRecord(jobDir);
	const reason = given.trim() || "stopped by request";
	if (record?.state === "starting" || record?.state === "running") {
		await appendLimenLog(jobDir, `stop requested: ${reason}`);
	}
	if (record?.state === "starting") {
		if (await finalizeJob(jobDir, requestedTerminal(reason), reason, { from: ["starting"] })) {
			console.log(`${requestedTerminal(reason)} ${id}: ${reason}`);
			return;
		}
		record = await readRecord(jobDir);
	}
	if (record?.state !== "running") {
		console.log(`${id} is already ${record?.state ?? "without a record"}`);
		return;
	}
	const pid = record.identity?.pid;
	if (!pid) {
		throw new Error(`running job ${id} has no recorded pid`);
	}
	// A wrapper in the start queue ends its own job with this reason at once; then this command finalizes nothing.
	const queued = record.queued !== null;
	if (queued) {
		await transition(jobDir, { from: ["running"], set: { stopRequested: reason } });
	}
	// Complete the bounded ownership snapshot while the parent chain is intact, then signal. A queued wrapper runs no
	// engine child, so it has no process tree to search and an empty one is no attribution loss.
	const escaped = queued ? [] : await discoverEscapedDescendants(jobDir, pid, "during stop");
	const result = platform.signalProcessGroup(pid, "SIGTERM");
	void containEscapedDescendants(jobDir, escaped, "after stop").catch((error: unknown) =>
		appendLimenLog(
			jobDir,
			`escaped cleanup unconfirmed after stop: ${error instanceof Error ? error.message : String(error)}`,
		),
	);
	void (async () => {
		if (result !== "missing" && !(await waitForProcessGroup(pid, 5_000))) {
			await appendLimenLog(jobDir, "TERM grace elapsed; sending KILL");
			platform.signalProcessGroup(pid, "SIGKILL");
			await waitForProcessGroup(pid, 1_000);
		}
	})().catch(() => {});
	// Give a signaled wrapper one brief turn to publish its own terminal state; the first finisher wins either way.
	const turn = Date.now() + (queued ? 2_000 : 25);
	do {
		await new Promise((resolve) => setTimeout(resolve, 25));
	} while (queued && Date.now() < turn && (await stateOf(jobDir)) === "running");
	if (!(await finalizeJob(jobDir, requestedTerminal(reason), reason))) {
		await markCallerDelivered(jobDir);
		const settled = await stateOf(jobDir);
		console.log(queued ? `${settled} ${id}: ${reason}` : `${id} is already ${settled}`);
		return;
	}
	await markCallerDelivered(jobDir);
	console.log(`${requestedTerminal(reason)} ${id}: ${reason}`);
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
