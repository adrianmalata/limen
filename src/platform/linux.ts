// The Linux implementation of the platform adapter (src/platform/platform.ts): /proc for a process's identity, the
// memory reading and the boot id, ps for the process table and a program's name, kill(2) for liveness and signals, and
// Node's per-core times for the CPU reading. The parsers are exported so that tests read fixture text instead of the
// machine.
import { execFileSync, spawn } from "node:child_process";
import { readFile } from "node:fs/promises";
import { cpus } from "node:os";
import { readOptional } from "../project/inherit.ts";
import { hasCode } from "../system-error.ts";
import type { CoreTimes, MemoryReading, Platform, ProcessQueryOutcome, ProcessRow, SignalResult } from "./platform.ts";

const TABLE_MAX_BYTES = 1024 * 1024;
const COMMAND_NAME_TIMEOUT_MS = 2_000;

/**
 * The identity in `/proc/<pid>/stat`. The command sits in parentheses and may hold spaces and parentheses itself, so
 * the fields start after the last ") "; a zombie is absent, since its pid no longer runs anything.
 */
export function parseStat(pid: number, stat: string): ProcessQueryOutcome {
	const close = stat.lastIndexOf(") ");
	if (close < 0) {
		return { kind: "unavailable" };
	}
	const fields = stat
		.slice(close + 2)
		.trim()
		.split(/\s+/);
	const ppid = Number(fields[1]);
	const pgid = Number(fields[2]);
	const born = fields[19];
	if (fields[0] === "Z") {
		return { kind: "absent" };
	}
	if (!Number.isSafeInteger(ppid) || !Number.isSafeInteger(pgid) || !born || !/^\d+$/.test(born)) {
		return { kind: "unavailable" };
	}
	return { kind: "present", process: { pid, ppid, pgid, born, command: stat.slice(stat.indexOf("(") + 1, close) } };
}

/** ps's `[DD-][HH:]MM:SS` CPU time in seconds; NaN for any other text. */
function cpuSeconds(value: string): number {
	const parts = value.split(":");
	if (parts.length < 2 || parts.length > 3) {
		return Number.NaN;
	}
	const first = (parts[0] ?? "").split("-");
	if (first.length > 2) {
		return Number.NaN;
	}
	const numbers = [...first, ...parts.slice(1)].map(Number);
	if (numbers.some((n) => !Number.isFinite(n) || n < 0)) {
		return Number.NaN;
	}
	const days = first.length === 2 ? (numbers.shift() ?? 0) : 0;
	return days * 86400 + numbers.reduce((total, n) => total * 60 + n, 0);
}

/** The rows of `ps -Ao pid=,ppid=,pgid=,time=,stat=`, without the row of `scannerPid` (the ps that printed them). */
export function parseProcessTable(output: string, scannerPid: number | undefined): ProcessRow[] {
	return output.split("\n").flatMap((line) => {
		const match = /^\s*(\d+)\s+(\d+)\s+(\d+)\s+(\S+)\s+(\S+)\s*$/.exec(line);
		if (!match?.[1] || !match[2] || !match[3] || !match[4] || !match[5] || Number(match[1]) === scannerPid) {
			return [];
		}
		const [pid, ppid, pgid] = [Number(match[1]), Number(match[2]), Number(match[3])];
		return [{ pid, ppid, pgid, cpuSeconds: cpuSeconds(match[4]), state: match[5] }];
	});
}

/** MemAvailable and MemTotal of `/proc/meminfo`; undefined when either is missing. */
export function parseMeminfo(text: string): MemoryReading | undefined {
	const kib = (name: string) => Number(new RegExp(`^${name}:\\s+(\\d+)`, "m").exec(text)?.[1]);
	const availableKib = kib("MemAvailable");
	const totalKib = kib("MemTotal");
	return Number.isFinite(availableKib) && Number.isFinite(totalKib) ? { availableKib, totalKib } : undefined;
}

/** The shape of a boot id: a UUID in lower-case hexadecimal, as the kernel writes it. */
export const BOOT_ID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/;

/** The boot id of `/proc/sys/kernel/random/boot_id`: its one line, a UUID; undefined for an empty or any other text. */
export function parseBootId(text: string): string | undefined {
	const id = text.trim();
	return BOOT_ID.test(id) ? id : undefined;
}

async function processInfo(pid: number): Promise<ProcessQueryOutcome> {
	if (!Number.isSafeInteger(pid) || pid <= 0) {
		return { kind: "unavailable" };
	}
	try {
		return parseStat(pid, await readFile(`/proc/${pid}/stat`, "utf8"));
	} catch (error) {
		return hasCode(error, "ENOENT") ? { kind: "absent" } : { kind: "unavailable" };
	}
}

async function processTable(deadline: number): Promise<readonly ProcessRow[]> {
	let scannerPid: number | undefined;
	const output = await runBounded("ps", ["-Ao", "pid=,ppid=,pgid=,time=,stat="], "ps discovery", deadline, (pid) => {
		scannerPid = pid;
	});
	return parseProcessTable(output, scannerPid);
}

/** A query process in its own group, so a deadline or an oversized answer ends it and anything it started. */
function runBounded(
	command: string,
	args: readonly string[],
	description: string,
	deadline: number,
	onSpawn?: (pid: number) => void,
): Promise<string> {
	return new Promise((resolve, reject) => {
		const remaining = deadline - Date.now();
		if (remaining <= 0) {
			return reject(new Error(`${description} exceeded the process-query deadline`));
		}
		const child = spawn(command, args, { detached: true, stdio: ["ignore", "pipe", "ignore"] });
		if (child.pid) {
			onSpawn?.(child.pid);
		}
		let stdout = "",
			settled = false;
		const finish = (error?: Error) => {
			if (settled) {
				return;
			}
			settled = true;
			clearTimeout(timeout);
			if (error) {
				reject(error);
			} else {
				resolve(stdout);
			}
		};
		const terminate = () => {
			if (child.pid) {
				signalTarget(-child.pid, "SIGKILL");
			}
		};
		const timeout = setTimeout(() => {
			terminate();
			finish(new Error(`${description} exceeded the process-query deadline`));
		}, remaining);
		child.stdout?.on("data", (chunk: Buffer | string) => {
			stdout += chunk.toString();
			if (Buffer.byteLength(stdout) > TABLE_MAX_BYTES) {
				terminate();
				finish(new Error(`${description} exceeded ${TABLE_MAX_BYTES} bytes`));
			}
		});
		child.once("error", (error) => finish(error));
		child.once("close", (code, signal) =>
			finish(code === 0 ? undefined : new Error(`${description} exited with ${signal ?? `code ${code ?? "unknown"}`}`)),
		);
	});
}

function commandName(pid: number): string {
	try {
		const shown = execFileSync("ps", ["-o", "comm=", "-p", String(pid)], {
			encoding: "utf8",
			timeout: COMMAND_NAME_TIMEOUT_MS,
		});
		return shown.trim().split("\n", 1)[0]?.trim() ?? "";
	} catch {
		return "";
	}
}

/** kill(2) on `target`: a pid, or a process group as its negative id. */
function signalTarget(target: number, signal: NodeJS.Signals | 0): SignalResult {
	try {
		process.kill(target, signal);
		return "sent";
	} catch (error) {
		if (hasCode(error, "ESRCH")) {
			return "missing";
		}
		if (hasCode(error, "EPERM")) {
			return "denied";
		}
		throw error;
	}
}

function coreTimes(): readonly CoreTimes[] {
	return cpus().map(({ times }) => ({
		idle: times.idle,
		total: Object.values(times).reduce((sum, value) => sum + value, 0),
	}));
}

export const linux: Platform = {
	processInfo,
	processTable,
	commandName,
	signalProcess: (pid, signal) => signalTarget(pid, signal),
	signalProcessGroup: (pgid, signal) => signalTarget(-pgid, signal),
	processAlive: (pid) => signalTarget(pid, 0) !== "missing",
	processGroupAlive: (pgid) => signalTarget(-pgid, 0) !== "missing",
	coreTimes,
	memory: () => parseMeminfo(readOptional("/proc/meminfo") ?? ""),
	bootId: () => parseBootId(readOptional("/proc/sys/kernel/random/boot_id") ?? ""),
};
