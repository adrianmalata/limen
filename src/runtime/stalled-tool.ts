import { type ProcessRow, platform } from "../platform/platform.ts";
import { limitMs } from "../project/limits.ts";
import type { JobProcess } from "./contain.ts";

const DEFAULT_TOOL_STALL_MS = 3 * 60_000;
const PROCESS_SAMPLE_MS = 2_000;
export function toolStallMs(): number {
	return limitMs("toolStall", DEFAULT_TOOL_STALL_MS);
}

type Sample = { children: ProcessRow[]; cpu: number };
/** The process table, which a sample needs whole: a CPU time ps could not print leaves the sample unread. */
async function processRows(): Promise<readonly ProcessRow[]> {
	const rows = await platform.processTable(Date.now() + PROCESS_SAMPLE_MS);
	if (rows.some((row) => !Number.isFinite(row.cpuSeconds))) {
		throw new Error("unreadable process CPU time");
	}
	return rows;
}

/** The caller confirmed `pid` has `born` just before; the same birth after the scan proves every row is that process's own. */
async function sampleTree(pid: number, born: string): Promise<Sample | undefined> {
	const rows = await processRows();
	const root = rows.find((row) => row.pid === pid && !row.state.startsWith("Z"));
	if (!root) {
		return;
	}
	const byParent = new Map<number, ProcessRow[]>();
	for (const row of rows) {
		if (row.state.startsWith("Z")) {
			continue;
		}
		const siblings = byParent.get(row.ppid);
		if (siblings) {
			siblings.push(row);
		} else {
			byParent.set(row.ppid, [row]);
		}
	}
	const children: ProcessRow[] = [];
	const seen = new Set([pid]);
	for (let index = 0; index <= children.length; index += 1) {
		const parent = index === 0 ? pid : children[index - 1]?.pid;
		if (parent === undefined) {
			continue;
		}
		for (const row of byParent.get(parent) ?? []) {
			if (seen.has(row.pid)) {
				continue;
			}
			seen.add(row.pid);
			children.push(row);
		}
	}
	const after = await platform.processInfo(pid);
	if (after.kind !== "present" || after.process.born !== born) {
		return;
	}
	return { children, cpu: root.cpuSeconds + children.reduce((total, row) => total + row.cpuSeconds, 0) };
}

export type ToolStallWatch = {
	tool: string;
	born: string;
	started: number;
	hadChild?: boolean;
	lastSampleAt?: number;
	previous?: Sample | undefined;
};
/** A pending tool needs an observed child and unchanged cumulative CPU time; a vanished child stays evidence after its exit.
 * The caller confirmed the engine's birth just before. */
export async function observeToolStall(
	watch: ToolStallWatch,
	engine: { readonly pid: number; readonly born: string },
	tool: string,
	now = Date.now(),
	windowMs = toolStallMs(),
): Promise<"stalled" | "uncertain" | undefined> {
	if (!tool) {
		watch.tool = "";
		watch.previous = undefined;
		watch.hadChild = false;
		return;
	}
	if (watch.tool !== tool || watch.born !== engine.born) {
		watch.tool = tool;
		watch.born = engine.born;
		watch.started = now;
		watch.previous = undefined;
		watch.hadChild = false;
	}
	let current: Sample | undefined;
	try {
		current = await sampleTree(engine.pid, watch.born);
	} catch {
		watch.previous = undefined;
		watch.started = now;
		return "uncertain";
	}
	if (!current) {
		watch.previous = undefined;
		watch.started = now;
		return "uncertain";
	}
	const previous = watch.previous;
	watch.previous = current;
	if (current.children.length > 0) {
		watch.hadChild = true;
	}
	const stableChildren =
		previous &&
		watch.hadChild &&
		current.children.length === previous.children.length &&
		current.children.every((row) =>
			previous.children.some(
				(prior) => prior.pid === row.pid && prior.ppid === row.ppid && row.cpuSeconds === prior.cpuSeconds,
			),
		);
	if (!previous || !stableChildren || current.cpu !== previous.cpu) {
		watch.started = now;
	}
	if (previous && stableChildren && current.cpu === previous.cpu && now - watch.started >= windowMs) {
		return "stalled";
	}
}

/** Capture only descendants still connected to the root whose birth the caller just confirmed, with individual birth identities. */
export async function ownedToolDescendants(pid: number, born: string): Promise<JobProcess[] | undefined> {
	const sample = await sampleTree(pid, born).catch(() => undefined);
	if (!sample) {
		return;
	}
	const captured = await Promise.all(
		sample.children.map(async (row) => {
			const result = await platform.processInfo(row.pid);
			return result.kind === "present" && result.process.ppid === row.ppid ? result.process : undefined;
		}),
	);
	if (captured.some((child) => !child)) {
		return;
	}
	return captured as JobProcess[];
}

export async function signalOwnedProcess(pid: number, born: string, signal: NodeJS.Signals): Promise<boolean> {
	const info = await platform.processInfo(pid);
	if (info.kind !== "present" || info.process.born !== born) {
		return false;
	}
	return platform.signalProcess(pid, signal) === "sent";
}
