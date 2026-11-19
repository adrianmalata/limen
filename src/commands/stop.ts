import { existsSync } from "node:fs";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import { SESSION_ID } from "../job/job.ts";
import { resolveJob } from "../job/lookup.ts";
import { appendLimenLog, finalizeJob, requestedTerminal } from "../job/record.ts";
import type { Parsed } from "../parser.ts";
import {
	containEscapedDescendants,
	discoverEscapedDescendants,
	signalProcessGroup,
	waitForProcessGroup,
} from "../runtime/contain.ts";
/** `limen stop`: stops a running job with the reason given, or "stopped by request". */
export async function stopCommand(values: Parsed, cwd: string): Promise<undefined> {
	await stopJob(values.get("job") ?? "", values.get("reason") ?? "", cwd);
}
/** Stops the running job `query` names; a group's stop calls it for each member job. */
export async function stopJob(query: string, given: string, cwd: string): Promise<void> {
	const { id, jobDir } = await resolveJob(cwd, query, "control");
	const state = (await readFile(`${jobDir}/state`, "utf8")).trim();
	if (state !== "running") {
		console.log(`${id} is already ${state}`);
		return;
	}
	const reason = given.trim() || "stopped by request";
	await appendLimenLog(jobDir, `stop requested: ${reason}`);
	const pid = Number((await readFile(`${jobDir}/pid`, "utf8")).trim());
	if (!Number.isSafeInteger(pid) || pid <= 0) {
		throw new Error(`running job ${id} has no valid pid`);
	}
	// A wrapper in the start queue ends its own job with this reason at once; then this command finalizes nothing.
	const queued = existsSync(`${jobDir}/queued`);
	if (queued) {
		await writeFile(`${jobDir}/stop-requested`, `${reason}\n`);
	}
	// Complete the bounded ownership snapshot while the parent chain is intact, then signal. A queued wrapper runs no
	// engine child, so it has no process tree to search and an empty one is no attribution loss.
	const escaped = queued ? [] : await discoverEscapedDescendants(jobDir, pid, "during stop");
	const result = signalProcessGroup(pid, "SIGTERM");
	void containEscapedDescendants(jobDir, escaped, "after stop").catch((error: unknown) =>
		appendLimenLog(
			jobDir,
			`escaped cleanup unconfirmed after stop: ${error instanceof Error ? error.message : String(error)}`,
		),
	);
	void (async () => {
		if (result !== "missing" && !(await waitForProcessGroup(pid, 5_000))) {
			await appendLimenLog(jobDir, "TERM grace elapsed; sending KILL");
			signalProcessGroup(pid, "SIGKILL");
			await waitForProcessGroup(pid, 1_000);
		}
	})().catch(() => {});
	// Give a signaled wrapper one brief turn to publish its own terminal state before overwriting it.
	const turn = Date.now() + (queued ? 2_000 : 25);
	do {
		await new Promise((resolve) => setTimeout(resolve, 25));
	} while (queued && Date.now() < turn && (await text(`${jobDir}/state`)) === "running");
	const settledState = (await readFile(`${jobDir}/state`, "utf8")).trim();
	if (settledState !== "running") {
		await markCallerDelivered(jobDir);
		console.log(queued ? `${settledState} ${id}: ${reason}` : `${id} is already ${settledState}`);
		return;
	}
	await finalizeJob(jobDir, requestedTerminal(reason), reason);
	await markCallerDelivered(jobDir);
	console.log(`${requestedTerminal(reason)} ${id}: ${reason}`);
}
async function markCallerDelivered(jobDir: string): Promise<void> {
	const session = process.env.PI_SESSION_ID?.trim();
	if (session && SESSION_ID.test(session)) {
		await mkdir(`${jobDir}/notify/delivered/${session}`, { recursive: true });
	}
}
function text(path: string): Promise<string> {
	return readFile(path, "utf8").then(
		(value) => value.trim(),
		() => "",
	);
}
