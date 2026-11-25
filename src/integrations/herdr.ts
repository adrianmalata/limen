// Herdr, the terminal multiplexer Limen's jobs and coordinators run in: a job's watch, log and diff tabs, their places
// recorded in the job's folder, `limen open`, the one close of a job's recorded tabs that the seat sweep, `limen land`,
// `limen ticket done` and `limen abandon` share (R-103), and the seat's notifications.
import { execFile, spawnSync } from "node:child_process";
import { existsSync, realpathSync } from "node:fs";
import { appendFile, mkdir, readFile, rm } from "node:fs/promises";
import { basename } from "node:path";
import { setTimeout as delay } from "node:timers/promises";
import { atomicWrite } from "../atomic-write.ts";
import { shownField } from "../boundary.ts";
import { testKnob } from "../config.ts";
import { closedFeatures, closedJobFeatures, isTerminal } from "../job/job.ts";
import { type JobRecord, jobFolders, readRecord } from "../job/record.ts";
import { type JobReference, resolveJob } from "../job/reference.ts";
import { runOperation } from "../operation.ts";
import { environmentError, refused } from "../outcome.ts";
import { limenRoot } from "../project/git.ts";
import { startOutsideJob } from "../runtime/launcher.ts";
import { hasCode } from "../system-error.ts";

export type HerdrPlace = {
	readonly workspace: string;
	readonly tab: string;
	readonly pane: string;
	readonly mode: "watch" | "log" | "diff";
};

export function herdrAvailable(): boolean {
	return process.env.HERDR_ENV === "1" && Boolean(herdrBinary());
}

export async function openWatchTab(input: {
	readonly jobDir: string;
	readonly label: string;
	readonly cwd: string;
	readonly logPath: string;
	readonly role: string;
}): Promise<HerdrPlace | undefined> {
	if (process.env.HERDR_ENV !== "1") {
		return;
	}
	return createTab({ ...input, label: `${input.label} · running`, mode: "watch", follow: true, focus: false });
}

/**
 * Terminal jobs leave no open tabs. A detached closer does the close so finalize never waits on Herdr; the closer
 * records the result in the job log. It runs in a systemd user scope of its own, so the end of the job's scope, which
 * follows, does not end it (A-029).
 */
export async function settleJobTab(jobDir: string): Promise<void> {
	const place = await readPlace(jobDir);
	if (!place) {
		return;
	}
	const herdr = herdrBinary();
	if (!herdr) {
		return skip(jobDir, "herdr is not available");
	}
	const closer = `import { closeJobTab } from ${JSON.stringify(import.meta.url)}; await closeJobTab(${JSON.stringify(herdr)}, ${JSON.stringify(jobDir)}, ${JSON.stringify(place.tab)});`;
	const args = ["--no-warnings", "--input-type=module", "--eval", closer];
	await startOutsideJob(process.execPath, args, { env: process.env }).catch((error: unknown) =>
		skip(jobDir, `tab close could not start: ${error instanceof Error ? error.message : String(error)}`),
	);
}

/** The bound of one Herdr call that closes or reads a job's tab; a constant, as no setting chooses it (R-015). */
const TAB_CALL_MS = 10_000;
/** The wait before the one retry of a tab's close. */
const RETRY_MS = 1_000;
/**
 * The bound of the seat sweep's daily close of leftover tabs, so a hung Herdr leaves the prune and the retire most of
 * the sweep unit's 300 s (R-103, Decision 23 (d)); a constant, as no setting chooses it (R-015).
 */
const LEFTOVER_CLOSE_MS = 60_000;
/**
 * The file of a place's folder that names the tab Limen found closed there, so no close asks Herdr about it again
 * (R-103, Decision 23 (a)): Limen's own bookkeeping, which a new tab recorded in that place removes.
 */
const CLOSED_MARK = "closed";

/** The time left of a Herdr call before `deadline`, at most `TAB_CALL_MS` and at least one millisecond. */
function callBound(deadline: number): number {
	return Math.max(1, Math.min(TAB_CALL_MS, deadline - Date.now()));
}

/**
 * The closer of a job's tab: close the tab, retry a refusal once, and record the result in the job log. Returns whether
 * the tab is closed, also when Herdr had closed it already; false when it stays open after the retry. Each call ends
 * by `deadline` too, and a refusal with no time left for its retry is not tried again.
 */
export async function closeJobTab(
	herdr: string,
	jobDir: string,
	tab: string,
	deadline = Number.POSITIVE_INFINITY,
): Promise<boolean> {
	const note = (message: string) => noteTabClose(jobDir, tab, message);
	let refusal = "";
	for (const attempt of [1, 2]) {
		try {
			call(herdr, ["tab", "close", tab], callBound(deadline));
			await note(attempt === 1 ? "closed" : "closed on retry");
			return true;
		} catch (error) {
			if (hasCode(error, "tab_not_found")) {
				await note("already closed");
				return true;
			}
			refusal = error instanceof Error ? error.message : String(error);
			if (attempt === 1 && deadline - Date.now() <= RETRY_MS) {
				await note(`failed with no time left for a retry (${refusal})`);
				return false;
			}
			if (attempt === 1) {
				await note(`refused (${refusal}); retrying once`);
				await delay(RETRY_MS);
			}
		}
	}
	await note(`failed after one retry (${refusal})`);
	// The tab stays open; its label must stop saying running.
	const record = await readRecord(jobDir);
	advisoryCall(herdr, ["tab", "rename", tab, `${jobLabel(jobDir, record)} · ${record?.state ?? "finished"}`]);
	return false;
}

/**
 * The close of the recorded tabs of the finished job at `jobDir` that `limen land`'s `cleaned` step, `limen ticket
 * done` and `limen abandon` make (D-096 (3) (i), T-18 (1)): synchronous, as the seat sweep closes leftover tabs
 * (`closeRecordedTabs`), one line for each tab it closes or that stays open. With no Herdr it is one line, and the
 * caller's step is done; a job with no recorded tab, or only tabs a close found gone, gives none.
 */
export async function closeJobTabs(jobDir: string): Promise<string[]> {
	const tabs = await recordedTabs(jobDir, await readRecord(jobDir));
	if (tabs.length === 0) {
		return [];
	}
	const herdr = herdrBinary();
	if (!herdr) {
		const [count, one] = [tabs.length, tabs.length === 1];
		return [
			`herdr is not available, so the ${count} Herdr ${one ? "tab" : "tabs"} of job ${shownField(basename(jobDir))} ${one ? "stays" : "stay"} open`,
		];
	}
	const named = (tab: RecordedTab) => `the Herdr tab ${shownField(tab.tab)} of job ${shownField(basename(tab.jobDir))}`;
	return (await closeRecordedTabs(herdr, tabs, named, Number.POSITIVE_INFINITY)).lines;
}

/**
 * `limen ticket done`'s close of tabs, after its markers (D-096 (3) (i)): the recorded tabs of every finished job of
 * the project at `root` whose features are all closed (`closedJobFeatures`, the seat sweep's rule, T-25) and include
 * one of the tickets `codes`, so a job with a feature still open keeps its tabs; one `closeJobTabs` per job.
 */
export async function closeTicketTabs(root: string, codes: readonly string[]): Promise<string[]> {
	const jobsRoot = `${root}/.limen/jobs`;
	const wanted = new Set(codes.map((code) => code.toUpperCase()));
	const closed = closedFeatures(root);
	const lines: string[] = [];
	for (const id of await jobFolders(jobsRoot)) {
		const jobDir = `${jobsRoot}/${id}`;
		const record = await readRecord(jobDir);
		const features = record && isTerminal(record.state) ? closedJobFeatures(record.label ?? "", id, closed) : [];
		if (features.some((feature) => wanted.has(feature))) {
			lines.push(...(await closeJobTabs(jobDir)));
		}
	}
	return lines;
}

/** A tab a finished job recorded: the job's folder, the label its tabs start with, its place, and the tab's id. */
type RecordedTab = {
	readonly jobDir: string;
	readonly label: string;
	readonly place: "diff" | undefined;
	readonly tab: string;
};

/**
 * The one close of a job's recorded tabs `tabs` (T-25, R-103 Decision 21), which the seat sweep's daily step, `limen
 * land`, `limen ticket done` and `limen abandon` share: each tab that Herdr lists with the job's label closes as
 * `closeJobTab` closes one, with its bound and one retry. Every recorded place is a tab Limen made for the job, and a
 * tab id Herdr gave again carries another label, so the label check leaves every tab that is not the job's, the
 * coordinator's among them; a run from a Herdr pane also leaves its own `HERDR_TAB_ID`. A tab that closes, or that
 * Herdr no longer lists, is marked closed in its place's folder, so no later close asks about it; one that stays open
 * is not (Decision 23 (a)). Each line names the tab as `named` does; a tab id, a job name and Herdr's error text reach
 * the coordinator's model, so each is escaped (`shownField`; z. 15, R-101 review round 2, G1). A tab it reaches no
 * more before `deadline` asks Herdr nothing and comes back in `unreached`.
 */
async function closeRecordedTabs(
	herdr: string,
	tabs: readonly RecordedTab[],
	named: (tab: RecordedTab) => string,
	deadline: number,
): Promise<{ readonly lines: string[]; readonly unreached: RecordedTab[] }> {
	const own = process.env.HERDR_TAB_ID?.trim();
	const lines: string[] = [];
	const unreached: RecordedTab[] = [];
	for (const recorded of tabs) {
		if (recorded.tab === own) {
			continue;
		}
		if (Date.now() >= deadline) {
			unreached.push(recorded);
			continue;
		}
		const listed = listedTab(herdr, recorded.tab, deadline);
		if (listed === undefined) {
			// The closer's word for a tab Herdr does not find goes to the job's log (R-103, review round 1, F2).
			await noteTabClose(recorded.jobDir, recorded.tab, "already closed");
			await markClosed(recorded);
		} else if ("unread" in listed) {
			lines.push(`${named(recorded)} stays open: herdr tab get failed (${shownField(listed.unread)})`);
		} else if (listed.label === recorded.label || listed.label.startsWith(`${recorded.label} · `)) {
			const closed = await closeJobTab(herdr, recorded.jobDir, recorded.tab, deadline);
			if (closed) {
				await markClosed(recorded);
			}
			lines.push(closed ? `closed ${named(recorded)}` : `${named(recorded)} did not close; its log says why`);
		}
	}
	return { lines, unreached };
}

/** The tabs of the job at `jobDir` that it recorded (`herdr/`, `herdr/diff/`), the log tab first, but those marked closed. */
async function recordedTabs(jobDir: string, record: JobRecord | undefined): Promise<RecordedTab[]> {
	const tabs: RecordedTab[] = [];
	for (const place of [undefined, "diff"] as const) {
		const recorded = await readPlace(jobDir, place);
		if (recorded && (await text(`${placeFolder(jobDir, place)}/${CLOSED_MARK}`)) !== recorded.tab) {
			tabs.push({ jobDir, label: jobLabel(jobDir, record), place, tab: recorded.tab });
		}
	}
	return tabs;
}

/**
 * The line of a tab's close in the job's log, `herdr tab close <tab>: <message>`; a log that cannot take it loses the
 * line, as the closer's lines always did, since the close's result is the caller's line too.
 */
function noteTabClose(jobDir: string, tab: string, message: string): Promise<void> {
	return appendFile(`${jobDir}/log`, `[limen ${new Date().toISOString()}] herdr tab close ${tab}: ${message}\n`).catch(
		() => {},
	);
}

/** Marks the place of `recorded` as holding a tab Limen found closed, by its tab id. */
async function markClosed(recorded: RecordedTab): Promise<void> {
	await atomicWrite(`${placeFolder(recorded.jobDir, recorded.place)}/${CLOSED_MARK}`, `${recorded.tab}\n`);
}

/** The folder of a job's recorded place: `herdr/` for its log or watch tab, `herdr/diff/` for its diff tab. */
function placeFolder(jobDir: string, record: "diff" | undefined): string {
	return record ? `${jobDir}/herdr/${record}` : `${jobDir}/herdr`;
}

/** The label of a job's tabs before the part after ` · `: the record's label, else the job's id. */
function jobLabel(jobDir: string, record: JobRecord | undefined): string {
	return record?.label || basename(jobDir);
}

/** The seat's notice as a Herdr notification; false when Herdr is missing or cannot show it. */
export async function showSeatNotification(title: string, body: string): Promise<boolean> {
	const herdr = herdrBinary();
	if (!herdr) {
		return false;
	}
	return notify(herdr, ["notification", "show", title, "--body", body, "--sound", "request"]);
}
/** How long a seat notice waits for Herdr; a constant, as no setting chooses it (R-015). */
const NOTIFY_TIMEOUT_MS = 2_000;
function notify(command: string, args: readonly string[]): Promise<boolean> {
	return new Promise((done) => execFile(command, args, { timeout: NOTIFY_TIMEOUT_MS }, (error) => done(!error)));
}

/**
 * `limen diff` in Herdr, the apply of its operation (src/integrations/hunk.ts): focuses the job's recorded diff tab,
 * or opens one that runs Hunk and records its place, so that a close finds it (D-096 (2)); returns the line that says
 * which. A tab Herdr does not open is the environment's failure, HERDR_FAILED.
 */
export async function openDiffTab(input: {
	readonly herdr: string;
	readonly jobDir: string;
	readonly label: string;
	readonly cwd: string;
	readonly workspaceCwd: string;
	readonly hunk: string;
	readonly args: readonly string[];
}): Promise<string> {
	const { herdr } = input;
	const recorded = await readPlace(input.jobDir, "diff");
	if (recorded && tabExists(herdr, recorded.tab)) {
		call(herdr, ["tab", "focus", recorded.tab]);
		return `focused ${input.label} diff`;
	}
	const place = await createTab({
		jobDir: input.jobDir,
		label: `${input.label} · diff`,
		cwd: input.cwd,
		workspaceCwd: input.workspaceCwd,
		logPath: `${input.jobDir}/log`,
		mode: "diff",
		follow: false,
		focus: true,
		herdr,
		shellOnly: true,
		record: "diff",
		strict: true,
	});
	call(herdr, ["pane", "run", place.pane, input.hunk, ...input.args]);
	return `opened ${input.label} diff`;
}

/** What `limen open` decided: the job's folder, the project's root, whether the job runs, and the Herdr binary. */
type OpenPlan = { readonly jobDir: string; readonly cwd: string; readonly running: boolean; readonly herdr: string };

/**
 * `limen open`, a change command since it opens a Herdr tab and records its place so that a close finds it (D-096
 * (2), T-38): its validate resolves the job, reads its record and refuses with HERDR_UNAVAILABLE where Herdr is not;
 * its apply focuses or opens the tab. Returns the line that says what it did.
 */
export async function openJob(cwd: string, query: JobReference): Promise<string> {
	return runOperation<OpenPlan, string>({
		validate: async (view) => {
			const { jobDir } = await resolveJob(cwd, query, "read");
			const herdr = herdrBinary();
			if (!herdr) {
				throw refused("HERDR_UNAVAILABLE", "limen open opens the job's tab in Herdr, and Herdr is not available here");
			}
			const running = (await view.record(jobDir))?.state === "running";
			return { jobDir, cwd: limenRoot(cwd), running, herdr };
		},
		apply: (plan) => openJobPlace(plan),
	});
}

/** The apply of `limen open`: focuses the job's recorded tab, or opens one that shows its log and records its place. */
async function openJobPlace(input: OpenPlan): Promise<string> {
	const { herdr } = input;
	const record = await readRecord(input.jobDir);
	const label = record?.label || basename(input.jobDir);
	const recorded = await readPlace(input.jobDir);
	try {
		if (recorded && tabExists(herdr, recorded.tab)) {
			call(herdr, ["tab", "focus", recorded.tab]);
			return `focused ${label}`;
		}
	} catch (error) {
		await skip(input.jobDir, error instanceof Error ? error.message : String(error));
	}
	const state = record?.state ?? "done";
	await createTab({
		jobDir: input.jobDir,
		label: `${label} · ${state}`,
		cwd: input.cwd,
		logPath: `${input.jobDir}/log`,
		mode: input.running ? "watch" : "log",
		follow: input.running,
		focus: true,
		herdr,
		strict: true,
	});
	return `opened ${label}`;
}

/**
 * The seat sweep's daily close of leftover Herdr tabs (D-096 (1), D-097 (4) (k), T-18 (1)): for every finished job of
 * the project at `root` whose features are all closed (`closedJobFeatures`), the tabs it recorded and no close marked
 * closed close as `closeRecordedTabs` closes a job's tabs. Returns one line for each tab it closed or that stays open:
 * a tab that does not close is a line, and the step is done (T-01). With no Herdr it is one line, which counts the tabs
 * that stay open. The whole close ends by `LEFTOVER_CLOSE_MS`, so a hung Herdr cannot keep the sweep's unit past its
 * 300 s (R-103, Decision 23 (d)): once that passes it asks Herdr nothing more, names the tabs it did not reach in one
 * line, and the step is done, so the next daily run takes them.
 */
export async function closeLeftoverTabs(root: string): Promise<string[]> {
	const leftover = await leftoverTabs(root);
	const count = leftover.reduce((sum, tabs) => sum + tabs.length, 0);
	if (count === 0) {
		return [];
	}
	const herdr = herdrBinary();
	if (!herdr) {
		const one = count === 1;
		return [
			`herdr is not available, so the ${count} leftover ${one ? "tab" : "tabs"} of finished jobs of closed features ${one ? "stays" : "stay"} open`,
		];
	}
	const bound = leftoverBound();
	const deadline = Date.now() + bound;
	const named = (tab: RecordedTab) =>
		`the leftover Herdr tab ${shownField(tab.tab)} of job ${shownField(basename(tab.jobDir))}`;
	const lines: string[] = [];
	const unreached: RecordedTab[] = [];
	for (const tabs of leftover) {
		const closed = await closeRecordedTabs(herdr, tabs, named, deadline);
		lines.push(...closed.lines);
		unreached.push(...closed.unreached);
	}
	if (unreached.length > 0) {
		const left = unreached.map((tab) => `${shownField(tab.tab)} of job ${shownField(basename(tab.jobDir))}`);
		const one = unreached.length === 1;
		lines.push(
			`the close of leftover Herdr tabs reached its bound of ${bound / 1000} s, so ${unreached.length} ${one ? "tab waits" : "tabs wait"} for the next daily run: ${left.join(", ")}`,
		);
	}
	return lines;
}

/** The bound of the daily close of leftover tabs: `LEFTOVER_CLOSE_MS`, or the test knob in milliseconds (R-087). */
function leftoverBound(): number {
	const raw = Number(testKnob("LIMEN_LEFTOVER_TABS_MS"));
	return Number.isFinite(raw) && raw > 0 ? raw : LEFTOVER_CLOSE_MS;
}

/**
 * The recorded tabs that no close marked closed of each finished job of the project at `root` whose features are all
 * closed, one list per job, the log tab first.
 */
async function leftoverTabs(root: string): Promise<RecordedTab[][]> {
	const jobsRoot = `${root}/.limen/jobs`;
	const closed = closedFeatures(root);
	const jobs: RecordedTab[][] = [];
	for (const id of await jobFolders(jobsRoot)) {
		const jobDir = `${jobsRoot}/${id}`;
		const record = await readRecord(jobDir);
		if (!(record && isTerminal(record.state)) || closedJobFeatures(record.label ?? "", id, closed).length === 0) {
			continue;
		}
		const tabs = await recordedTabs(jobDir, record);
		if (tabs.length > 0) {
			jobs.push(tabs);
		}
	}
	return jobs;
}

/**
 * The label Herdr lists the tab `tab` with, read within `TAB_CALL_MS` and by `deadline`; undefined when Herdr lists no
 * such tab, and the failure's words when the read fails another way, so the caller names it (T-01).
 */
function listedTab(
	herdr: string,
	tab: string,
	deadline: number,
): { readonly label: string } | { readonly unread: string } | undefined {
	try {
		const label = asRecord(asRecord(call(herdr, ["tab", "get", tab], callBound(deadline))).tab).label;
		return { label: typeof label === "string" ? label : "" };
	} catch (error) {
		return hasCode(error, "tab_not_found")
			? undefined
			: { unread: error instanceof Error ? error.message : String(error) };
	}
}

/** A tab to open for a job: its job, its label and folder, the log it shows, its mode, and the place it records. */
type NewTab = {
	readonly jobDir: string;
	readonly label: string;
	readonly cwd: string;
	readonly workspaceCwd?: string;
	readonly logPath: string;
	readonly mode: HerdrPlace["mode"];
	readonly follow: boolean;
	readonly focus: boolean;
	readonly role?: string;
	readonly herdr?: string;
	readonly shellOnly?: boolean;
	readonly record?: "diff";
	/** Set by a command whose work is the tab (`limen open`, `limen diff`): a failure throws instead of a log line. */
	readonly strict?: true;
};

/**
 * Opens the tab `input` names and records its place. A watch tab of a job's start is a side channel, so a failure
 * there is a line in the job's log and gives undefined (A-029); for `limen open` and `limen diff` (`strict`) the tab is
 * the command's work, so a failure ends it as the environment's, HERDR_FAILED (T-01).
 */
function createTab(input: NewTab & { readonly strict: true }): Promise<HerdrPlace>;
function createTab(input: NewTab): Promise<HerdrPlace | undefined>;
async function createTab(input: NewTab): Promise<HerdrPlace | undefined> {
	const herdr = input.herdr ?? herdrBinary();
	if (!herdr) {
		await skip(input.jobDir, "herdr is not available");
		return;
	}
	try {
		return await openTab(herdr, input);
	} catch (error) {
		const message = error instanceof Error ? error.message : String(error);
		if (input.strict) {
			throw environmentError(
				"HERDR_FAILED",
				`herdr did not open the tab of job ${shownField(basename(input.jobDir))}: ${shownField(message)}`,
				null,
			);
		}
		await skip(input.jobDir, message);
	}
}

/** The Herdr calls that open the tab `input` names in its role space and record its place; a failed call throws. */
async function openTab(herdr: string, input: NewTab): Promise<HerdrPlace> {
	const record = input.role ? undefined : await readRecord(input.jobDir);
	const { workspace, seeded } = ensureWorkspace(
		herdr,
		input.workspaceCwd ?? input.cwd,
		input.role ?? (record?.role || (record?.candidate ? "reviewer" : "worker")),
	);
	const created = call(herdr, [
		"tab",
		"create",
		"--workspace",
		workspace,
		"--label",
		input.label,
		"--cwd",
		input.cwd,
		input.focus ? "--focus" : "--no-focus",
	]);
	const place: HerdrPlace = {
		workspace,
		tab: id(created, "tab", "tab_id"),
		pane: id(created, "root_pane", "pane_id"),
		mode: input.mode,
	};
	await recordPlace(input.jobDir, place, input.record);
	if (seeded) {
		advisoryCall(herdr, ["tab", "close", seeded]);
	}
	if (!input.shellOnly) {
		call(
			herdr,
			input.follow
				? ["pane", "run", place.pane, "tail", "-f", input.logPath]
				: ["pane", "run", place.pane, "tail", "-n", "+1", input.logPath],
		);
	}
	return place;
}

/** The one rule for the Herdr binary: `LIMEN_HERDR=0` turns Herdr off; another value must exist; otherwise `herdr` on PATH. */
export function herdrBinary(): string | undefined {
	const override = testKnob("LIMEN_HERDR")?.trim();
	if (override === "0") {
		return;
	}
	if (override) {
		return existsSync(override) ? override : undefined;
	}
	for (const dir of (process.env.PATH ?? "").split(":")) {
		const candidate = `${dir}/herdr`;
		if (dir && existsSync(candidate)) {
			return candidate;
		}
	}
}

/** A created workspace is seeded with one empty tab; `seeded` names it so the first job tab can replace it. */
function ensureWorkspace(
	herdr: string,
	cwd: string,
	role: string,
): { readonly workspace: string; readonly seeded?: string } {
	const root = realpathSync(cwd);
	// Herdr has no immutable root field. Qualify the label; an unqualified legacy space proves nothing.
	const name = `${basename(root)} ${role}s · ${root}`;
	const listed = asRecord(call(herdr, ["workspace", "list"])).workspaces;
	let workspace: unknown;
	let matches = 0;
	if (Array.isArray(listed)) {
		for (const item of listed) {
			const row = asRecord(item);
			if (row.label !== name) {
				continue;
			}
			matches++;
			workspace = row.workspace_id;
		}
	}
	if (matches > 1) {
		throw new Error(`ambiguous Herdr role space: ${name} (${matches} matches)`);
	}
	if (matches && (typeof workspace !== "string" || !workspace)) {
		throw new Error(`Herdr role space has no workspace ID: ${name}`);
	}
	if (typeof workspace === "string") {
		return { workspace };
	}
	const created = call(herdr, ["workspace", "create", "--cwd", root, "--label", name, "--no-focus"]);
	const seeded = asRecord(asRecord(created).tab).tab_id;
	return {
		workspace: id(created, "workspace", "workspace_id"),
		...(typeof seeded === "string" && seeded ? { seeded } : {}),
	};
}

function tabExists(herdr: string, tab: string): boolean {
	try {
		return Boolean(id(call(herdr, ["tab", "get", tab]), "tab", "tab_id"));
	} catch {
		return false;
	}
}

function advisoryCall(herdr: string, args: readonly string[]): void {
	// These surfaces are additive. A slow or unavailable daemon must not stall supervision.
	spawnSync(herdr, args, { stdio: "ignore", timeout: 2_000 });
}

function call(herdr: string, args: readonly string[], timeout = 180_000): unknown {
	const result = spawnSync(herdr, args, { encoding: "utf8", timeout });
	if (result.error) {
		throw result.error;
	}
	if (result.status !== 0) {
		const raw = result.stderr.trim() || result.stdout.trim() || `herdr ${args[0]} failed`;
		try {
			const err = asRecord(asRecord(JSON.parse(raw)).error);
			const message = typeof err.message === "string" && err.message ? err.message : raw;
			const code = typeof err.code === "string" && err.code ? err.code : undefined;
			throw Object.assign(new Error(message), code ? { code } : {});
		} catch (error) {
			if (error instanceof Error && error.message !== raw) {
				throw error;
			}
		}
		throw new Error(raw);
	}
	const parsed: unknown = JSON.parse(result.stdout || "{}");
	return asRecord(parsed).result ?? parsed;
}

function id(result: unknown, object: string, field: string): string {
	const value = asRecord(asRecord(result)[object])[field];
	if (typeof value !== "string" || !value) {
		throw new Error(`herdr response missing ${object}.${field}`);
	}
	return value;
}

function asRecord(value: unknown): Record<string, unknown> {
	return typeof value === "object" && value !== null ? (value as Record<string, unknown>) : {};
}

/**
 * Records `place` as the job's tab of its kind. The mark that a close found the place's earlier tab closed goes first,
 * so a close asks Herdr about the new tab, also when Herdr gave it the earlier tab's id (R-103, Decision 23 (b)).
 */
async function recordPlace(jobDir: string, place: HerdrPlace, record?: "diff"): Promise<void> {
	const directory = placeFolder(jobDir, record);
	await mkdir(directory, { recursive: true });
	await rm(`${directory}/${CLOSED_MARK}`, { force: true });
	await Promise.all(
		(["workspace", "tab", "pane", "mode"] as const).map((name) =>
			atomicWrite(`${directory}/${name}`, `${place[name]}\n`),
		),
	);
}

/** The recorded place, or none when a file is missing or the mode is one this version does not open (an old record's). */
async function readPlace(jobDir: string, record?: "diff"): Promise<HerdrPlace | undefined> {
	const directory = placeFolder(jobDir, record);
	const [workspace, tab, pane, mode] = await Promise.all(
		(["workspace", "tab", "pane", "mode"] as const).map((name) => text(`${directory}/${name}`)),
	);
	if (!workspace || !tab || !pane || (mode !== "watch" && mode !== "log" && mode !== "diff")) {
		return;
	}
	return { workspace, tab, pane, mode };
}

function text(path: string): Promise<string> {
	return readFile(path, "utf8").then(
		(value) => value.trim(),
		() => "",
	);
}

function skip(jobDir: string, message: string): Promise<void> {
	return appendFile(`${jobDir}/log`, `[limen ${new Date().toISOString()}] herdr skipped: ${message}\n`);
}
