// The Linux implementation of the platform adapter (src/platform/platform.ts): /proc for a process's identity, its
// cgroup, the memory reading and the boot id, ps for the process table and a program's name, kill(2) for liveness and
// signals, Node's per-core times for the CPU reading, and systemd: for scopes of the user manager, systemd-run starts
// one, `systemctl --user is-active` reads its state, `kill` signals it, the two together end it, and /sys/fs/cgroup
// holds its readings; `systemctl` also says what the system manager knows of a unit. This is the only code that runs
// those two programs or reads that hierarchy (A-083, test/structure.test.ts). The parsers are exported so that tests
// read fixture text instead of the machine.
import { execFileSync, type SpawnSyncReturns, spawn, spawnSync } from "node:child_process";
import { statSync } from "node:fs";
import { readFile } from "node:fs/promises";
import { cpus } from "node:os";
import { testKnob } from "../config.ts";
import { readOptional } from "../project/inherit.ts";
import { hasCode } from "../system-error.ts";
import type {
	CoreTimes,
	MemoryReading,
	Platform,
	ProcessEnd,
	ProcessQueryOutcome,
	ProcessRow,
	ScopedProcess,
	ScopedStart,
	ScopeEnd,
	ScopeProbe,
	ScopeReadings,
	ScopeSignal,
	ScopeSignalResult,
	ScopeState,
	SignalResult,
} from "./platform.ts";

const TABLE_MAX_BYTES = 1024 * 1024;
const COMMAND_NAME_TIMEOUT_MS = 2_000;
/** The program that starts a command in a new systemd user scope, in place, so that the command keeps its pid. */
const SYSTEMD_RUN = "systemd-run";
/** The program that asks the user manager to end a scope. */
const SYSTEMCTL = "systemctl";
/** The cgroup v2 hierarchy, where a scope's readings are; the test knob LIMEN_CGROUP_ROOT names another folder. */
const CGROUP_ROOT = "/sys/fs/cgroup";
/** How long a call to the user manager may take before Limen takes it as failed. */
const SCOPE_CALL_TIMEOUT_MS = 10_000;
/** How often a start in a new scope reads its process again until the command runs: an exec raises no event. */
const SCOPE_START_POLL_MS = 10;
/** The exit status of `systemctl is-active` for a unit that is not active (LSB "program is not running"). */
const NOT_ACTIVE = 3;
/** How long a question to the system manager about one of its units may take, as the GitHub doctor asks it. */
const SYSTEM_UNIT_TIMEOUT_MS = 3_000;

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

/**
 * The cgroup of `/proc/<pid>/cgroup`: the path of its cgroup v2 line, `0::<path>`; undefined when it has none, as on a
 * host with the older hierarchy only.
 */
export function parseCgroup(text: string): string | undefined {
	return /^0::(\/.*)$/m.exec(text)?.[1];
}

/** The one number of a cgroup file such as `memory.peak`; null for a missing file or any other text. */
export function parseCounter(text: string | undefined): number | null {
	const value = text?.trim() ?? "";
	return /^\d+$/.test(value) && Number.isSafeInteger(Number(value)) ? Number(value) : null;
}

/** The number of the line `<key> <number>` of a cgroup file such as `cpu.stat`; null when it has none. */
export function parseKeyed(text: string | undefined, key: string): number | null {
	const value = new RegExp(`^${key} (\\d+)$`, "m").exec(text ?? "")?.[1];
	return value !== undefined && Number.isSafeInteger(Number(value)) ? Number(value) : null;
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

/**
 * A start in the new user scope `start.unit`: systemd-run asks the user manager for the scope, moves itself into it and
 * runs the command in place, so the command keeps the pid and the process group that `detached` gives it, and
 * `--collect` removes the scope once it ends, a failed one too. It resolves only once the command runs, so in its new
 * scope: until then the process sits in its starter's cgroup, and the end of a job's scope would end it there. A host
 * whose user manager does not run fails here.
 */
async function startInScope(start: ScopedStart): Promise<ScopedProcess> {
	const words = ["--user", "--scope", "--quiet", "--collect", `--unit=${start.unit}`, "--"];
	const child = spawn(SYSTEMD_RUN, [...words, start.command, ...start.args], {
		...(start.cwd === undefined ? {} : { cwd: start.cwd }),
		detached: true,
		stdio: "ignore",
		env: start.env,
	});
	const ended = new Promise<ProcessEnd>((resolve) => child.once("exit", (code, signal) => resolve({ code, signal })));
	await new Promise<void>((resolve, reject) => {
		child.once("spawn", resolve);
		child.once("error", reject);
	});
	child.unref();
	const pid = child.pid ?? 0;
	const failure = pid > 0 ? await commandRuns(pid, ended) : "it has no pid";
	if (failure !== undefined) {
		throw new Error(`${SYSTEMD_RUN} did not run ${start.command} in the user scope ${start.unit}: ${failure}`);
	}
	return { pid, ended };
}

/**
 * Why the process `pid` did not come to run its command, or undefined once it does: its program is no longer
 * systemd-run, or it ended with exit code 0 before a read saw the change. One that passes the bound is ended.
 */
async function commandRuns(pid: number, ended: Promise<ProcessEnd>): Promise<string | undefined> {
	let end: ProcessEnd | undefined;
	void ended.then((value) => {
		end = value;
	});
	const deadline = Date.now() + SCOPE_CALL_TIMEOUT_MS;
	for (;;) {
		const info = await processInfo(pid);
		if (info.kind === "present" && info.process.command !== SYSTEMD_RUN) {
			return;
		}
		if (end !== undefined) {
			return end.code === 0 ? undefined : `it ended with ${end.signal ?? `exit code ${end.code ?? "unknown"}`}`;
		}
		if (Date.now() >= deadline) {
			signalTarget(-pid, "SIGKILL");
			return `it did not start the scope within ${SCOPE_CALL_TIMEOUT_MS / 1000} s`;
		}
		await new Promise((resolve) => setTimeout(resolve, SCOPE_START_POLL_MS));
	}
}

/** The folder of the cgroup `cgroup` in the cgroup v2 hierarchy, or in the tests' folder of LIMEN_CGROUP_ROOT. */
function cgroupFolder(cgroup: string): string {
	return `${testKnob("LIMEN_CGROUP_ROOT") ?? CGROUP_ROOT}${cgroup}`;
}

/**
 * Whether a process is left in the scope `unit`. A scope with no process left is `gone`, decided from facts, never from
 * the words systemctl prints: its cgroup folder no longer exists (the manager collected it), or `is-active` exits 3, as
 * for a scope that ended, or one that never started, such as the scope of a job whose launch failed. This is the one
 * place of that rule; the end of a scope reads it here too.
 */
function scopeState(unit: string, cgroup: string | undefined): ScopeState {
	if (cgroup !== undefined && statSync(cgroupFolder(cgroup), { throwIfNoEntry: false }) === undefined) {
		return { kind: "gone" };
	}
	const active = systemctl(["--user", "is-active", "--quiet", unit]);
	if (active.status === NOT_ACTIVE) {
		return { kind: "gone" };
	}
	const failure = callFailure(active);
	return failure === undefined ? { kind: "active" } : { kind: "failed", detail: failure };
}

/**
 * The user manager sends `signal` to every process of the scope `unit`, wherever it was re-parented and whatever group
 * it leads; a caller inside the scope gets it too.
 */
function signalScope(unit: string, signal: ScopeSignal): ScopeSignalResult {
	const failure = callFailure(systemctl(["--user", "kill", `--signal=${signal}`, unit]));
	return failure === undefined ? { kind: "sent" } : { kind: "failed", detail: failure };
}

/** SIGKILL to every process of the scope `unit` while one is left; a caller inside the scope ends with it. */
function endScope(unit: string, cgroup: string | undefined): ScopeEnd {
	const state = scopeState(unit, cgroup);
	if (state.kind !== "active") {
		return state;
	}
	const killed = signalScope(unit, "SIGKILL");
	return killed.kind === "sent" ? { kind: "ended" } : killed;
}

/** A call of systemctl, bounded as every call to a manager is. */
function systemctl(args: readonly string[], timeout = SCOPE_CALL_TIMEOUT_MS): SpawnSyncReturns<string> {
	return spawnSync(SYSTEMCTL, args, { encoding: "utf8", timeout });
}

/** What the system manager prints for `args` about one of its units, trimmed; undefined for a call that fails. */
function systemUnit(args: readonly string[]): string | undefined {
	const result = systemctl(args, SYSTEM_UNIT_TIMEOUT_MS);
	return result.status === 0 ? result.stdout.trim() : undefined;
}

/** systemd-run runs `true` in a new user scope, which needs the account's user manager and its bus. */
function probeUserScope(): ScopeProbe {
	const result = spawnSync(SYSTEMD_RUN, ["--user", "--scope", "--quiet", "true"], {
		encoding: "utf8",
		timeout: SCOPE_CALL_TIMEOUT_MS,
	});
	if (result.error && hasCode(result.error, "ENOENT")) {
		return { kind: "missing" };
	}
	const failure = callFailure(result);
	return failure === undefined ? { kind: "started" } : { kind: "failed", detail: failure };
}

/** Why a call did not succeed: its start's error, its first stderr line, or how it ended; none on exit 0. */
function callFailure(result: SpawnSyncReturns<string>): string | undefined {
	if (result.error) {
		return result.error.message;
	}
	if (result.status === 0) {
		return;
	}
	const said = (result.stderr ?? "").trim().split("\n", 1)[0];
	return said || (result.signal ? `ended by ${result.signal}` : `exit code ${result.status ?? "unknown"}`);
}

/**
 * This process's cgroup. A test's scope cannot move a process into a cgroup, so the tests' systemd-run gives the
 * cgroup in the test knob LIMEN_CGROUP, which every process of its scope inherits.
 */
function ownCgroup(): string | undefined {
	return testKnob("LIMEN_CGROUP") ?? parseCgroup(readOptional("/proc/self/cgroup") ?? "");
}

/** The peak memory, the CPU time and the OOM kills of the cgroup `cgroup`, from its own files. */
async function scopeReadings(cgroup: string): Promise<ScopeReadings> {
	const folder = cgroupFolder(cgroup);
	const [peak, cpu, events] = await Promise.all(
		["memory.peak", "cpu.stat", "memory.events"].map((name) => cgroupText(`${folder}/${name}`)),
	);
	return {
		memoryPeakBytes: parseCounter(peak),
		cpuMicroseconds: parseKeyed(cpu, "usage_usec"),
		oomKills: parseKeyed(events, "oom_kill"),
	};
}

/** A file of a cgroup; undefined when it is missing, as every file of a scope is once the scope is gone. */
async function cgroupText(path: string): Promise<string | undefined> {
	return readFile(path, "utf8").catch((error: unknown) => {
		if (hasCode(error, "ENOENT")) {
			return undefined;
		}
		throw error;
	});
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
	startInScope,
	scopeState,
	signalScope,
	endScope,
	probeUserScope,
	ownCgroup,
	scopeReadings,
	systemUnitProperty: (unit, property) => systemUnit(["show", "-P", property, unit]),
	systemUnitState: (unit, query) => systemUnit([query, unit]),
};
