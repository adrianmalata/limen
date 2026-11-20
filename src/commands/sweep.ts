import * as fs from "node:fs";
import { isAbsolute, join } from "node:path";
import { atomicWriteSync, TEMPORARY_NAME } from "../atomic-write.ts";
import { removeDeadCoordinators } from "../integrations/coordinator-registration.ts";
import { showSeatNotification } from "../integrations/herdr.ts";
import { isTerminal } from "../job/job.ts";
import { receiptFamily } from "../job/wake-delivery.ts";
import type { Parsed } from "../parser.ts";
import { installSeatSweep, uninstallSeatSweep, updateRegisteredProjects } from "../project/seat.ts";
import { confirmDeadJobs } from "../runtime/reap.ts";

const text = (path: string) => (fs.existsSync(path) ? fs.readFileSync(path, "utf8").trim() : "");
const modified = (path: string) => (fs.existsSync(path) ? fs.statSync(path).mtimeMs : 0);
/** How old a job's seat event is before the sweep rings for it; a constant, as no setting chooses it (R-015). */
const SEAT_RING_MS = 5 * 60_000;
const metadata = (path: string) => {
	try {
		return fs.statSync(path);
	} catch (error) {
		if ((error as NodeJS.ErrnoException).code === "ENOENT") {
			return undefined;
		}
		throw error;
	}
};

/** `limen sweep`: one pass over every registered project, or the install or removal of the timer that runs it. */
export async function sweepCommand(values: Parsed): Promise<undefined> {
	if (values.has("install") && values.has("uninstall")) {
		throw new Error("sweep takes --install or --uninstall, not both");
	}
	if (values.has("install")) {
		await installSeatSweep();
		return;
	}
	if (values.has("uninstall")) {
		await uninstallSeatSweep();
		return;
	}
	const living = updateRegisteredProjects((projects) =>
		projects.filter((project) => isAbsolute(project) && fs.existsSync(project) && fs.statSync(project).isDirectory()),
	);
	await Promise.all(living.map(sweepProject));
}
async function sweepProject(root: string): Promise<void> {
	const jobs = join(root, ".limen", "jobs");
	await confirmDeadJobs(jobs);
	// Housekeeping every pass, not after the seat ring threshold: dead registrations go, so `.limen/coordinators/` does not grow.
	await removeDeadCoordinators(root).catch((error: unknown) =>
		console.error(`coordinator sweep failed for ${root}: ${error instanceof Error ? error.message : String(error)}`),
	);
	if (Date.now() - modified(join(root, ".limen", "last-sweep")) < SEAT_RING_MS) {
		return;
	}
	for (const entry of fs.existsSync(jobs) ? fs.readdirSync(jobs, { withFileTypes: true }) : []) {
		if (!entry.isDirectory()) {
			continue;
		}
		const job = join(jobs, entry.name);
		const due = seatEvent(job);
		if (!due?.since || Date.now() - due.since < SEAT_RING_MS || !claimSeatEvent(job, due)) {
			continue;
		}
		const label = text(join(job, "label")) || entry.name;
		const title = `limen: ${label}${due.headline}`;
		if (!(await showSeatNotification(title, `job ${entry.name} · ${root}`))) {
			console.error(`seat notification failed for ${entry.name}; event recorded to avoid an ambiguous retry`);
		}
	}
}
type SeatEvent = { readonly since: number; readonly event: string; readonly headline: string };
/** What the seat has not heard about a job yet: an advisory of a running job, or its terminal state. */
function seatEvent(job: string): SeatEvent | undefined {
	const statePath = join(job, "state");
	const state = text(statePath);
	const delivered = fs.existsSync(join(job, "notify", "delivered"))
		? fs.readdirSync(join(job, "notify", "delivered")).filter((name) => !TEMPORARY_NAME.test(name))
		: [];
	const heard = new Set(delivered.map(receiptFamily));
	if (state === "running") {
		if (heard.has("_advisory")) {
			return;
		}
		const stamp = metadata(join(job, "advisory"));
		if (!stamp) {
			return;
		}
		return { since: stamp.mtimeMs, event: `_advisory.${stamp.mtimeMs}.${stamp.birthtimeMs}`, headline: " · advisory" };
	}
	if (!isTerminal(state) || heard.has("_completion")) {
		return;
	}
	const since = Math.max(modified(join(job, "finished-at")), modified(statePath));
	return { since, event: `_terminal.${state}.${since}`, headline: ` is ${state}` };
}
/** Claim before transport: a concurrent sweep or ambiguous failure must not replay this event. False when claimed already. */
function claimSeatEvent(job: string, { since, event }: SeatEvent): boolean {
	const seat = join(job, "notify", "seat");
	const markers = fs.existsSync(seat) ? fs.readdirSync(seat) : [];
	if (markers.some((name) => name === event || (/^\d+$/.test(name) && Number(name) >= since))) {
		return false;
	}
	fs.mkdirSync(seat, { recursive: true });
	try {
		atomicWriteSync(join(seat, event), `${new Date().toISOString()}\n`, { exclusive: true });
	} catch (error) {
		if ((error as NodeJS.ErrnoException).code === "EEXIST") {
			return false;
		}
		throw error;
	}
	return true;
}
