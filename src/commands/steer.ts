import { transport } from "../config.ts";
import { jobFolders, readRecord, textFile } from "../job/record.ts";
import { jobArgument, resolveJob } from "../job/reference.ts";
import { enqueueSteer } from "../job/steer-inbox.ts";
import type { Parsed } from "../parser.ts";
import { platform } from "../platform/platform.ts";
import { limenRoot } from "../project/git.ts";
import { coordinatorWakeRoute, watches } from "./watch.ts";

const READY_WAIT_MS = 2_000;

/** `limen steer`: sends a correction to one running job, or to every running job this coordinator watches. */
export async function steerCommand(values: Parsed, cwd: string): Promise<undefined> {
	if (transport("LIMEN_GROUP_ID")) {
		throw new Error("group peer messages are informational; use group publish, not owner steering");
	}
	const running = values.has("running");
	const message = (values.get("text") ?? "").trim();
	if (!message) {
		throw new Error("steer requires a message");
	}
	const targets = running ? await watchedRunning(cwd) : [await resolveJob(cwd, jobArgument(values), "control")];
	if (!targets.length) {
		console.log("nothing was reached");
		return;
	}
	for (const target of targets) {
		try {
			console.log(`steered ${target.id} · ${await deliver(target, message)}`);
		} catch (error: unknown) {
			if (!running) {
				throw error;
			}
			console.log(`not reached ${target.id}`);
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
