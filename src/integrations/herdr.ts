import { execFile, spawnSync } from "node:child_process";
import { existsSync, realpathSync } from "node:fs";
import { appendFile, mkdir, readFile } from "node:fs/promises";
import { basename } from "node:path";
import { setTimeout as delay } from "node:timers/promises";
import { atomicWrite } from "../atomic-write.ts";
import { shownField } from "../boundary.ts";
import { testKnob } from "../config.ts";
import { closedFeatures, closedJobFeatures, isTerminal } from "../job/job.ts";
import { type JobRecord, jobFolders, readRecord } from "../job/record.ts";
import { type JobReference, resolveJob } from "../job/reference.ts";
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

/**
 * The closer of a job's tab: close the tab, retry a refusal once, and record the result in the job log. Returns whether
 * the tab is closed, also when Herdr had closed it already; false when it stays open after the retry.
 */
export async function closeJobTab(herdr: string, jobDir: string, tab: string): Promise<boolean> {
	const note = (message: string) =>
		appendFile(`${jobDir}/log`, `[limen ${new Date().toISOString()}] herdr tab close ${tab}: ${message}\n`).catch(
			() => {},
		);
	let refusal = "";
	for (const attempt of [1, 2]) {
		try {
			call(herdr, ["tab", "close", tab], TAB_CALL_MS);
			await note(attempt === 1 ? "closed" : "closed on retry");
			return true;
		} catch (error) {
			if (hasCode(error, "tab_not_found")) {
				await note("already closed");
				return true;
			}
			refusal = error instanceof Error ? error.message : String(error);
			if (attempt === 1) {
				await note(`refused (${refusal}); retrying once`);
				await delay(1_000);
			}
		}
	}
	await note(`failed after one retry (${refusal})`);
	// The tab stays open; its label must stop saying running.
	const record = await readRecord(jobDir);
	advisoryCall(herdr, ["tab", "rename", tab, `${jobLabel(jobDir, record)} · ${record?.state ?? "finished"}`]);
	return false;
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

export async function openDiffTab(input: {
	readonly jobDir: string;
	readonly label: string;
	readonly cwd: string;
	readonly workspaceCwd: string;
	readonly hunk: string;
	readonly args: readonly string[];
}): Promise<string> {
	const herdr = requireHerdr();
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
	});
	if (!place) {
		throw new Error("herdr skipped opening the diff tab");
	}
	call(herdr, ["pane", "run", place.pane, input.hunk, ...input.args]);
	return `opened ${input.label} diff`;
}

/** `limen open`: opens the log tab of the job `query` names in Herdr; returns the line that says what it did. */
export async function openJob(cwd: string, query: JobReference): Promise<string> {
	const { jobDir } = await resolveJob(cwd, query, "read");
	const running = (await readRecord(jobDir))?.state === "running";
	return openJobPlace({ jobDir, cwd: limenRoot(cwd), running });
}

export async function openJobPlace(input: {
	readonly jobDir: string;
	readonly cwd: string;
	readonly running: boolean;
}): Promise<string> {
	const herdr = herdrBinary();
	if (!herdr) {
		throw new Error("herdr is not available");
	}
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
	const place = await createTab({
		jobDir: input.jobDir,
		label: `${label} · ${state}`,
		cwd: input.cwd,
		logPath: `${input.jobDir}/log`,
		mode: input.running ? "watch" : "log",
		follow: input.running,
		focus: true,
		herdr,
	});
	if (!place) {
		throw new Error("herdr skipped");
	}
	return `opened ${label}`;
}

/**
 * The seat sweep's daily close of leftover Herdr tabs (D-096 (1), D-097 (4) (k), T-18 (1)): for every finished job of
 * the project at `root` whose features are all closed (`closedJobFeatures`), each tab it recorded (`herdr/`,
 * `herdr/diff/`) that Herdr lists with the job's label closes as `closeJobTab` closes one, with its bound and one retry.
 * Every recorded place is a tab Limen made for the job, and a tab id Herdr gave again carries another label, so the
 * label check leaves every tab that is not the job's, the coordinator's among them; a run from a Herdr pane also leaves
 * its own `HERDR_TAB_ID`. Returns one line for each tab it closed or that stays open: a tab that does not close is a
 * line, and the step is done (T-01). The job's account can write a recorded tab id, Herdr's error text is another
 * program's, and the sweep's lines reach the coordinator's model, so each line shows the tab id, the job's name and
 * that text escaped (`shownField`), as prune's lines do (z. 15, R-101 review round 2, G1). With no Herdr it is one line,
 * which counts the tabs that stay open.
 */
export async function closeLeftoverTabs(root: string): Promise<string[]> {
	const leftover = await leftoverTabs(root);
	if (leftover.length === 0) {
		return [];
	}
	const herdr = herdrBinary();
	if (!herdr) {
		const [count, one] = [leftover.length, leftover.length === 1];
		return [
			`herdr is not available, so the ${count} leftover ${one ? "tab" : "tabs"} of finished jobs of closed features ${one ? "stays" : "stay"} open`,
		];
	}
	const own = process.env.HERDR_TAB_ID?.trim();
	const lines: string[] = [];
	for (const { jobDir, label, tab } of leftover) {
		const named = `the leftover Herdr tab ${shownField(tab)} of job ${shownField(basename(jobDir))}`;
		const listed = tab === own ? undefined : listedTab(herdr, tab);
		if (listed !== undefined && "unread" in listed) {
			lines.push(`${named} stays open: herdr tab get failed (${shownField(listed.unread)})`);
		} else if (listed !== undefined && (listed.label === label || listed.label.startsWith(`${label} · `))) {
			const closed = await closeJobTab(herdr, jobDir, tab);
			lines.push(closed ? `closed ${named}` : `${named} did not close; its log says why`);
		}
	}
	return lines;
}

/** A tab a finished job recorded: the job's folder, the label its tabs start with, and the tab's id. */
type LeftoverTab = { readonly jobDir: string; readonly label: string; readonly tab: string };

/** The recorded tabs of each finished job of the project at `root` whose features are all closed, the log tab first. */
async function leftoverTabs(root: string): Promise<LeftoverTab[]> {
	const jobsRoot = `${root}/.limen/jobs`;
	const closed = closedFeatures(root);
	const tabs: LeftoverTab[] = [];
	for (const id of await jobFolders(jobsRoot)) {
		const jobDir = `${jobsRoot}/${id}`;
		const record = await readRecord(jobDir);
		if (!(record && isTerminal(record.state)) || closedJobFeatures(record.label ?? "", id, closed).length === 0) {
			continue;
		}
		for (const place of await Promise.all([readPlace(jobDir), readPlace(jobDir, "diff")])) {
			if (place) {
				tabs.push({ jobDir, label: jobLabel(jobDir, record), tab: place.tab });
			}
		}
	}
	return tabs;
}

/**
 * The label Herdr lists the tab `tab` with, read within `TAB_CALL_MS`; undefined when Herdr lists no such tab, and the
 * failure's words when the read fails another way, so the caller names it (T-01).
 */
function listedTab(herdr: string, tab: string): { readonly label: string } | { readonly unread: string } | undefined {
	try {
		const label = asRecord(asRecord(call(herdr, ["tab", "get", tab], TAB_CALL_MS)).tab).label;
		return { label: typeof label === "string" ? label : "" };
	} catch (error) {
		return hasCode(error, "tab_not_found")
			? undefined
			: { unread: error instanceof Error ? error.message : String(error) };
	}
}

async function createTab(input: {
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
}): Promise<HerdrPlace | undefined> {
	const herdr = input.herdr ?? herdrBinary();
	if (!herdr) {
		await skip(input.jobDir, "herdr is not available");
		return;
	}
	try {
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
	} catch (error) {
		await skip(input.jobDir, error instanceof Error ? error.message : String(error));
	}
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

function requireHerdr(): string {
	const herdr = herdrBinary();
	if (!herdr) {
		throw new Error("herdr is not available");
	}
	return herdr;
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

async function recordPlace(jobDir: string, place: HerdrPlace, record?: "diff"): Promise<void> {
	const directory = record ? `${jobDir}/herdr/${record}` : `${jobDir}/herdr`;
	await mkdir(directory, { recursive: true });
	await Promise.all(
		(["workspace", "tab", "pane", "mode"] as const).map((name) =>
			atomicWrite(`${directory}/${name}`, `${place[name]}\n`),
		),
	);
}

/** The recorded place, or none when a file is missing or the mode is one this version does not open (an old record's). */
async function readPlace(jobDir: string, record?: "diff"): Promise<HerdrPlace | undefined> {
	const directory = record ? `${jobDir}/herdr/${record}` : `${jobDir}/herdr`;
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
