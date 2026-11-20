import { atomicWrite } from "../atomic-write.ts";
import { appendLimenLog } from "../job/record.ts";
import { type Platform, type ProcessInfo, platform, type SignalResult } from "../platform/platform.ts";

const ESCAPED_TERM_GRACE_MS = 2_000;
const ESCAPED_KILL_GRACE_MS = 1_000;
const PROCESS_QUERY_TIMEOUT_MS = 1_000;
export type JobProcess = Pick<ProcessInfo, "pid" | "pgid" | "born" | "command">;
type ContainmentDependencies = {
	readonly query?: Platform["processInfo"];
	readonly signal?: (pid: number, signal: NodeJS.Signals) => SignalResult;
};
export async function waitForProcessGroup(pid: number, milliseconds: number): Promise<boolean> {
	const deadline = Date.now() + milliseconds;
	while (platform.processGroupAlive(pid) && Date.now() < deadline) {
		await delay(100);
	}
	return !platform.processGroupAlive(pid);
}
async function listEscapedDescendants(rootPid: number): Promise<readonly JobProcess[]> {
	const deadline = Date.now() + PROCESS_QUERY_TIMEOUT_MS;
	const table = await platform.processTable(deadline);
	const root = table.find((row) => row.pid === rootPid);
	if (!root || root.state.startsWith("Z")) {
		throw new Error(`root process ${rootPid} was missing or terminal in process snapshot`);
	}
	const escaped: Array<{ pid: number; pgid: number }> = [],
		seen = new Set([rootPid]),
		queue = [rootPid];
	let liveJobDescendant = false;
	for (let parent = queue.shift(); parent !== undefined; parent = queue.shift()) {
		for (const row of table) {
			if (row.ppid !== parent || seen.has(row.pid)) {
				continue;
			}
			seen.add(row.pid);
			queue.push(row.pid);
			if (!row.state.startsWith("Z")) {
				liveJobDescendant = true;
			}
			if (row.pgid !== rootPid) {
				escaped.push(row);
			}
		}
	}
	// The wrapper needs a live Pi child: an empty post-TERM tree is attribution loss, not proof that no detached child escaped.
	if (!liveJobDescendant) {
		throw new Error(`root process ${rootPid} was missing or terminal in process snapshot`);
	}
	const captured = await Promise.all(
		escaped.map(async (row): Promise<JobProcess | undefined> => {
			const outcome = await platform.processInfo(row.pid);
			if (outcome.kind === "present") {
				return outcome.process;
			}
			if (outcome.kind === "unavailable") {
				return { ...row, born: "identity-unavailable", command: "identity unavailable" };
			}
			return undefined;
		}),
	);
	return captured.filter((process): process is JobProcess => process !== undefined);
}
// Discovery failure is advisory but durable; callers await only this bounded pre-TERM snapshot.
export async function discoverEscapedDescendants(
	jobDir: string,
	rootPid: number,
	context: string,
): Promise<readonly JobProcess[]> {
	try {
		return await listEscapedDescendants(rootPid);
	} catch (error) {
		const message = `escaped descendant discovery failed ${context}: ${error instanceof Error ? error.message : String(error)}`;
		await recordCleanupWarning(jobDir, message);
		return [];
	}
}
// Each individual signal gets a fresh birth check. Only an exact present identity may be signaled.
export async function containEscapedDescendants(
	jobDir: string,
	escaped: readonly JobProcess[],
	context: string,
	dependencies: ContainmentDependencies = {},
): Promise<void> {
	if (escaped.length === 0) {
		return;
	}
	const query = dependencies.query ?? platform.processInfo,
		signal = dependencies.signal ?? platform.signalProcess,
		warned: JobProcess[] = [];
	const check = async (process: JobProcess): Promise<"same" | "changed" | "absent" | "unavailable"> => {
		const outcome = await query(process.pid);
		if (outcome.kind !== "present") {
			return outcome.kind;
		}
		return outcome.process.pid === process.pid && outcome.process.born === process.born ? "same" : "changed";
	};
	const signalIfPresent = async (process: JobProcess, signalName: NodeJS.Signals, recordChanged: boolean) => {
		const outcome = await check(process);
		if (outcome === "same") {
			signal(process.pid, signalName);
			return true;
		}
		if (outcome === "unavailable" || (recordChanged && outcome === "changed")) {
			warned.push(process);
		}
		return false;
	};
	await appendLimenLog(
		jobDir,
		`terminating ${escaped.length} escaped job process(es): ${escaped.map((p) => p.pid).join(", ")}`,
	);
	const termed: JobProcess[] = [];
	for (const process of escaped) {
		if (await signalIfPresent(process, "SIGTERM", true)) {
			termed.push(process);
		}
	}
	if (termed.length) {
		await delay(ESCAPED_TERM_GRACE_MS);
	}
	const killed: JobProcess[] = [];
	for (const process of termed) {
		if (await signalIfPresent(process, "SIGKILL", false)) {
			killed.push(process);
		}
	}
	if (killed.length) {
		await delay(ESCAPED_KILL_GRACE_MS);
	}
	for (const process of killed) {
		if (["same", "unavailable"].includes(await check(process))) {
			warned.push(process);
		}
	}
	const unique = [...new Map(warned.map((process) => [`${process.pid}:${process.born}`, process])).values()];
	if (unique.length) {
		await recordCleanup(jobDir, unique, context);
	}
}
export async function recordCleanup(jobDir: string, processes: readonly JobProcess[], context: string): Promise<void> {
	const header = `[limen ${new Date().toISOString()}] termination unconfirmed ${context}: ${processes.length} process(es) require attention`;
	await atomicWrite(
		`${jobDir}/cleanup`,
		`${[header, ...processes.map((p) => `${p.pid} ${p.born} ${p.command}`)].join("\n")}\n`,
	);
	await appendLimenLog(jobDir, `cleanup note written: unconfirmed pid(s) ${processes.map((p) => p.pid).join(", ")}`);
}
async function recordCleanupWarning(jobDir: string, warning: string): Promise<void> {
	await atomicWrite(`${jobDir}/cleanup`, `[limen ${new Date().toISOString()}] ${warning}\n`).catch(() => {});
	await appendLimenLog(jobDir, `cleanup warning: ${warning}`).catch(() => {});
}
const delay = (milliseconds: number) => new Promise<void>((resolve) => setTimeout(resolve, milliseconds));
