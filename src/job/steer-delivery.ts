// `limen steer`: a correction delivered to one running job, or to every running job this coordinator watches, through
// the job's steer inbox (src/job/steer-inbox.ts).
import { transport } from "../config.ts";
import type { CommandText } from "../outcome.ts";
import { platform } from "../platform/platform.ts";
import { limenRoot } from "../project/git.ts";
import { jobFolders, readRecord, textFile } from "./record.ts";
import { type JobArgument, resolveJob } from "./reference.ts";
import { enqueueSteer } from "./steer-inbox.ts";
import { coordinatorWakeRoute, watches } from "./watching.ts";

const READY_WAIT_MS = 2_000;

/**
 * Sends `text` to the job `query` names, or with `query` undefined to every running job this coordinator watches; says
 * in `out` which job it reached. A group member does not steer: its peers get findings through `group publish`.
 */
export async function steerJobs(
	query: JobArgument | undefined,
	text: string,
	cwd: string,
	out: CommandText,
): Promise<void> {
	if (transport("LIMEN_GROUP_ID")) {
		throw new Error("group peer messages are informational; use group publish, not owner steering");
	}
	const running = query === undefined;
	const message = text.trim();
	if (!message) {
		throw new Error("steer requires a message");
	}
	const targets = running ? await watchedRunning(cwd) : [await resolveJob(cwd, query, "control")];
	if (!targets.length) {
		out.line("nothing was reached");
		return;
	}
	for (const target of targets) {
		try {
			out.line(`steered ${target.id} · ${await deliver(target, message)}`);
		} catch (error: unknown) {
			if (!running) {
				throw error;
			}
			out.line(`not reached ${target.id}`);
		}
	}
}

async function deliver(target: { readonly id: string; readonly jobDir: string }, message: string): Promise<string> {
	const { id, jobDir } = target;
	const record = await readRecord(jobDir);
	if (record?.state !== "running") {
		throw new Error(`${id} is already ${record?.state ?? "missing"}; not steered`);
	}
	const pid = record.identity?.pid;
	if (!pid || !platform.processGroupAlive(pid)) {
		throw new Error(`${id} is not running; not steered`);
	}
	if (!(await waitForReady(jobDir))) {
		throw new Error(`steering is unavailable for ${id}; the worker extension is not loaded`);
	}
	return enqueueSteer(jobDir, message);
}

async function watchedRunning(cwd: string): Promise<ReadonlyArray<{ readonly id: string; readonly jobDir: string }>> {
	const route = coordinatorWakeRoute("steer --running", 'name the job instead: limen steer <id> "correction"');
	const jobsRoot = `${limenRoot(cwd)}/.limen/jobs`;
	const selected: Array<{ id: string; jobDir: string }> = [];
	for (const id of await jobFolders(jobsRoot)) {
		const jobDir = `${jobsRoot}/${id}`;
		if ((await readRecord(jobDir))?.state === "running" && (await watches(jobDir, route))) {
			selected.push({ id, jobDir });
		}
	}
	return selected;
}

async function waitForReady(jobDir: string): Promise<boolean> {
	const deadline = Date.now() + READY_WAIT_MS;
	while (Date.now() <= deadline) {
		// The steering hook marks its inbox ready (hook/steering.ts), a receipt folder of the job.
		if (await textFile(`${jobDir}/steer/ready`)) {
			return true;
		}
		await new Promise((resolve) => setTimeout(resolve, 20));
	}
	return false;
}
