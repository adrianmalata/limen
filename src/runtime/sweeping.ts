// `limen seat sweep` (A-024, T-04, R-032): the one minute run of the seat over every registered project, and the
// install, removal and status of the user timer that runs it. Only this run and the explicit change commands finalize
// a job: the read commands and the coordinator's hook never reap. A run, through the runner of src/operation.ts
// (T-38), does for each project in parallel: the reap of every dead running job (src/runtime/reap.ts), the end of each
// finished job's scope that the user manager still lists, the resume of each job the subscription limit stopped and
// the release of the wakes the limit kept from a coordinator (src/runtime/resuming.ts), the removal of dead coordinator
// registrations, and one Herdr ring for an end nobody heard of; then, once, the removal of the start queue's dead
// entries. A job record that does not read and a step that fails are named with their reasons once every other job,
// step and project is done (z. 10), and the run ends with the worst class among them (T-02). It refuses to run inside
// a job's scope, since it would signal the scope it runs in.
import * as fs from "node:fs";
import { userInfo } from "node:os";
import { isAbsolute, join } from "node:path";
import { fileURLToPath } from "node:url";
import { atomicWriteSync, TEMPORARY_NAME } from "../atomic-write.ts";
import { removeDeadCoordinators } from "../integrations/coordinator-registration.ts";
import { showSeatNotification } from "../integrations/herdr.ts";
import { isTerminal } from "../job/job.ts";
import { type JobRecord, jobFolderNames, readRecord, unmigratedFolder } from "../job/record.ts";
import { receiptFamily } from "../job/wake-delivery.ts";
import { runOperation, stepFailure } from "../operation.ts";
import {
	type CommandText,
	EXIT_CODES,
	environmentError,
	failureOf,
	LimenError,
	refused,
	usageError,
} from "../outcome.ts";
import { platform } from "../platform/platform.ts";
import { installSweepUnits, SWEEP_TIMER, uninstallSweepUnits } from "../platform/systemd-units.ts";
import { updateRegisteredProjects } from "../project/seat.ts";
import { sweepLines } from "../project/summary.ts";
import { hasCode } from "../system-error.ts";
import { jobOfScope } from "./launcher.ts";
import { confirmDeadJobs, endLeftoverScopes, type JobFailure } from "./reap.ts";
import { resumeAfterQuota } from "./resuming.ts";
import { removeDeadEntries } from "./start-queue.ts";

/** The package root of the running CLI, whose `bin/limen` the sweep's service runs (`/opt/limen` on the seat). */
const PACKAGE_ROOT = fileURLToPath(new URL("../..", import.meta.url));
/** How old a job's seat event is before the sweep rings for it; a constant, as no setting chooses it (R-015). */
const SEAT_RING_MS = 5 * 60_000;
/** The command that runs the sweep again, the `next` of a run that failed. */
const AGAIN = "limen seat sweep";

/** The flags of `limen seat sweep`, of which a call gives at most one. */
export type SweepFlags = { readonly install: boolean; readonly uninstall: boolean; readonly status: boolean };
type Mode = "run" | "install" | "uninstall" | "status";

/** `limen seat sweep` with `flags`: a run, or the install, removal or status of its timer; `again` is its command
 * line. */
export async function seatSweep(flags: SweepFlags, out: CommandText, again: string): Promise<void> {
	await runOperation<Mode, void>({
		again,
		validate: async () => {
			const mode = modeOf(flags);
			if (mode === "run") {
				refuseInJob();
			}
			if (mode === "install") {
				requireLinger();
				installingPath();
			}
			return mode;
		},
		apply: async (mode) => {
			if (mode === "run") {
				await sweepSeat(out);
			} else if (mode === "install") {
				printed(out, await installSweepUnits(PACKAGE_ROOT, installingPath()));
			} else if (mode === "uninstall") {
				printed(out, await uninstallSweepUnits());
			} else {
				const problems = sweepLines();
				printed(out, problems.length === 0 ? [`${SWEEP_TIMER} is active`] : problems);
			}
		},
	});
}

/** The one mode the flags name; a usage error for two or three of them, which exclude each other. */
function modeOf(flags: SweepFlags): Mode {
	const given = (["install", "uninstall", "status"] as const).filter((flag) => flags[flag]);
	if (given.length > 1) {
		throw usageError(
			"SWEEP_FLAGS",
			`limen seat sweep takes one of --install, --uninstall and --status, not ${given.map((flag) => `--${flag}`).join(" and ")}`,
			"limen seat sweep --help",
		);
	}
	return given[0] ?? "run";
}

/** SWEEP_IN_JOB: a run inside a job's scope would signal that scope, and itself with it, so it refuses first. */
function refuseInJob(): void {
	const scope = (platform.ownCgroup() ?? "").split("/").find((part) => jobOfScope(part) !== undefined);
	if (scope !== undefined) {
		throw refused(
			"SWEEP_IN_JOB",
			`limen seat sweep runs in the scope ${scope} of a job, which a run could end with itself in it; run it from outside every job: its timer, or a shell of the agents' account`,
		);
	}
}

/**
 * NO_LINGER (A-024): without lingering the account's user manager, and the sweep's timer with it, stops when its last
 * login session ends, so the install stops before it writes, and names root's command.
 */
function requireLinger(): void {
	const account = userInfo().username;
	if (!platform.lingers(account)) {
		throw environmentError(
			"NO_LINGER",
			`the user manager of ${account} stops with its last login session, and the sweep's timer with it; as root, run loginctl enable-linger ${account}, then install again`,
			"limen seat sweep --install",
		);
	}
}

/**
 * NO_PATH (R-034 (g)): the sweep's service runs with the PATH of the process that installs it, where a job it resumes
 * after the subscription limit finds `pi`, `node` and `herdr`, so an install with none stops before it writes.
 */
function installingPath(): string {
	const path = process.env.PATH ?? "";
	if (path === "") {
		throw environmentError(
			"NO_PATH",
			"this process has no PATH, and the sweep's service runs with the PATH of its install, where a job it resumes finds pi, node and herdr; run the install from the agents' login shell",
			"limen seat sweep --install",
		);
	}
	return path;
}

/** Each line of `lines` on stdout, as the shared wrapper prints a command's text (D-061 (3)). */
function printed(out: CommandText, lines: readonly string[]): void {
	for (const line of lines) {
		out.line(line);
	}
}

/** A step of the run that failed: where, and the failure. */
type Failed = { readonly where: string; readonly error: unknown };

/**
 * One run over every registered project: each project's steps in parallel, then the start queue's dead entries once.
 * The user manager's units are listed once for every project; when this process runs under none, the scopes of
 * finished jobs are not read, and the run names that.
 */
async function sweepSeat(out: CommandText): Promise<void> {
	const projects = await updateRegisteredProjects((registered) =>
		registered.filter((root) => isAbsolute(root) && fs.existsSync(root) && fs.statSync(root).isDirectory()),
	);
	const units = await platform.userUnits();
	const failed: Failed[] = [];
	if (units === undefined) {
		const message =
			"this process runs under no systemd user manager, so the sweep cannot list the scopes of finished jobs";
		failed.push({ where: "the seat", error: environmentError("NO_USER_MANAGER", message, AGAIN) });
	}
	const live = units === undefined ? undefined : new Set(units.map(({ unit }) => unit));
	for (const failures of await Promise.all(projects.map((root) => sweepProject(root, live, out)))) {
		failed.push(...failures);
	}
	try {
		const removed = await removeDeadEntries();
		if (removed > 0) {
			out.line(`removed ${removed} dead ${removed === 1 ? "entry" : "entries"} of the start queue`);
		}
	} catch (error) {
		failed.push({ where: "the start queue", error });
	}
	out.line(`swept ${projects.length} ${projects.length === 1 ? "project" : "projects"}`);
	if (failed.length > 0) {
		throw runFailure(failed);
	}
}

/**
 * The run's failure (T-02): each step that failed on its line, by where it failed, its message and its code, with the
 * class and the code of the worst of them, which a timer reads. A step's failure has the class `stepFailure` gives it,
 * so none is a refusal.
 */
function runFailure(failed: readonly Failed[]): LimenError {
	const failures = failed.map(({ where, error }) => ({ where, failure: failureOf(stepFailure(error)) }));
	const worst = failures.reduce((most, each) =>
		EXIT_CODES[each.failure.class] > EXIT_CODES[most.failure.class] ? each : most,
	).failure;
	// A job that fails to read in several steps of its project is named once.
	const lines = [...new Set(failures.map(({ where, failure }) => `${where}: ${failure.message} (${failure.code})`))];
	return new LimenError({
		class: worst.class,
		code: worst.code,
		message: [`the sweep did not finish ${counted(lines.length)}:`, ...lines].join("\n"),
		next: AGAIN,
		cause: new AggregateError(failed.map(({ error }) => error)),
	});
}

const counted = (steps: number) => (steps === 1 ? "one step" : `${steps} steps`);

/**
 * The steps of one project: its dead running jobs reaped, the scopes its finished jobs left in `live` ended (none when
 * the units could not be listed), its jobs due after the subscription limit resumed and its owed wakes released, its
 * dead coordinator registrations removed, and its unheard ends rung for. A job that fails to read, to end or to resume,
 * and a step that fails, are returned with where they failed, and stop neither the project's other jobs nor its other
 * steps (z. 10, R-032 review round 1, note 8).
 */
async function sweepProject(
	root: string,
	live: ReadonlySet<string> | undefined,
	out: CommandText,
): Promise<readonly Failed[]> {
	const jobs = join(root, ".limen", "jobs");
	const failed: Failed[] = [];
	const step = async (work: () => Promise<readonly JobFailure[] | undefined>) => {
		try {
			failed.push(...((await work()) ?? []).map(({ jobDir, error }) => ({ where: jobDir, error })));
		} catch (error) {
			failed.push({ where: root, error });
		}
	};
	await step(() => confirmDeadJobs(jobs));
	if (live !== undefined) {
		await step(() => endLeftoverScopes(jobs, live));
	}
	// After the reap, so that a dead job is finalized before it can be a candidate (R-034 Decision 1).
	await step(() => resumeAfterQuota(root, out));
	await step(async () => {
		await removeDeadCoordinators(root);
		return undefined;
	});
	await step(() => ringUnheard(root, jobs, out));
	return failed;
}

/**
 * One Herdr notification for each event of the project that no coordinator heard of, unless the coordinator's hook
 * stamped `.limen/last-sweep` within `SEAT_RING_MS` and so delivers its own wakes. A folder of an older Limen holds no
 * event the reap did not name already; a record that fails to read is returned, and the other jobs are rung for.
 */
async function ringUnheard(root: string, jobs: string, out: CommandText): Promise<readonly JobFailure[]> {
	if (Date.now() - modified(join(root, ".limen", "last-sweep")) < SEAT_RING_MS) {
		return [];
	}
	const failed: JobFailure[] = [];
	for (const id of await jobFolderNames(jobs)) {
		const job = join(jobs, id);
		try {
			const record = unmigratedFolder(job) ? undefined : await readRecord(job);
			const due = record && seatEvent(job, record);
			if (!(record && due?.since) || Date.now() - due.since < SEAT_RING_MS || !claimSeatEvent(job, due)) {
				continue;
			}
			const title = `limen: ${record.label || id}${due.headline}`;
			if (!(await showSeatNotification(title, `job ${id} · ${root}`))) {
				out.diagnostic(`seat notification failed for ${id}; event recorded to avoid an ambiguous retry`);
			}
		} catch (error) {
			failed.push({ jobDir: job, error });
		}
	}
	return failed;
}

const modified = (path: string) => (fs.existsSync(path) ? fs.statSync(path).mtimeMs : 0);

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
		if (hasCode(error, "EEXIST")) {
			return false;
		}
		throw error;
	}
	return true;
}
