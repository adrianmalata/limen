import * as fs from "node:fs";
import { isAbsolute, join } from "node:path";
import { atomicWriteSync, TEMPORARY_NAME } from "../atomic-write.ts";
import { removeDeadCoordinators } from "../integrations/coordinator-registration.ts";
import { showSeatNotification } from "../integrations/herdr.ts";
import { isTerminal } from "../job/job.ts";
import { type JobRecord, jobFoldersSync, readRecordSync } from "../job/record.ts";
import { receiptFamily } from "../job/wake-delivery.ts";
import type { Parsed } from "../parser.ts";
import { installSeatSweep, uninstallSeatSweep, updateRegisteredProjects } from "../project/seat.ts";
import { confirmDeadJobs } from "../runtime/reap.ts";

const modified = (path: string) => (fs.existsSync(path) ? fs.statSync(path).mtimeMs : 0);
/** How old a job's seat event is before the sweep rings for it; a constant, as no setting chooses it (R-015). */
const SEAT_RING_MS = 5 * 60_000;

/** `limen sweep`: one pass over every registered project, or the install or removal of the timer that runs it. */
export async function sweepCommand(values: Parsed): Promise<undefined> {
	if (values.has("install") && values.has("uninstall")) {
		throw new Error("sweep takes --install or --uninstall, not both");
	}
	if (values.has("install")) {
		console.log(await installSeatSweep());
		return;
	}
	if (values.has("uninstall")) {
		console.log(await uninstallSeatSweep());
		return;
	}
	const living = await updateRegisteredProjects((projects) =>
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
	for (const id of jobFoldersSync(jobs)) {
		const job = join(jobs, id);
		const record = readRecordSync(job);
		const due = record && seatEvent(job, record);
		if (!(record && due?.since) || Date.now() - due.since < SEAT_RING_MS || !claimSeatEvent(job, due)) {
			continue;
		}
		const title = `limen: ${record.label || id}${due.headline}`;
		if (!(await showSeatNotification(title, `job ${id} · ${root}`))) {
			console.error(`seat notification failed for ${id}; event recorded to avoid an ambiguous retry`);
		}
	}
}
type SeatEvent = { readonly since: number; readonly event: string; readonly headline: string };
/**
 * What the seat has not heard about a job yet: an advisory of a running job, keyed by its time, or its terminal
 * state, keyed by the record's finish time (D-057 (7.7)). A record the migration wrote is history only: the Limen that
 * ran its job rang for it (D-057 (4)).
 */
function seatEvent(job: string, record: JobRecord): SeatEvent | undefined {
	if (record.migrated) {
		return;
	}
	const delivered = fs.existsSync(join(job, "notify", "delivered"))
		? fs.readdirSync(join(job, "notify", "delivered")).filter((name) => !TEMPORARY_NAME.test(name))
		: [];
	const heard = new Set(delivered.map(receiptFamily));
	if (record.state === "running") {
		if (heard.has("_advisory") || !record.advisory) {
			return;
		}
		const since = Date.parse(record.advisory.at);
		return { since, event: `_advisory.${since}`, headline: " · advisory" };
	}
	if (!isTerminal(record.state) || heard.has("_completion")) {
		return;
	}
	const since = Date.parse(record.finishedAt ?? "") || 0;
	return { since, event: `_terminal.${record.state}.${since}`, headline: ` is ${record.state}` };
}
/**
 * Claim before transport: a concurrent sweep or ambiguous failure must not replay this event. False when claimed
 * already. A record changes nothing after its terminal state, so any marker of that state is this event, one an older
 * Limen keyed by a file's time included.
 */
function claimSeatEvent(job: string, { since, event }: SeatEvent): boolean {
	const seat = join(job, "notify", "seat");
	const markers = fs.existsSync(seat) ? fs.readdirSync(seat) : [];
	const terminal = event.startsWith("_terminal.") ? `${event.split(".").slice(0, 2).join(".")}.` : undefined;
	const claimed = (name: string) =>
		name === event ||
		(terminal !== undefined && name.startsWith(terminal)) ||
		(/^\d+$/.test(name) && Number(name) >= since);
	if (markers.some(claimed)) {
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
