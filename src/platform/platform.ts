// The operating-system primitives Limen uses, as one interface (A-083): a process's identity, the process table,
// liveness and signals of a process and of a process group, the CPU and memory readings of the start gate, the boot id
// that a lock's owner record carries (D-056 (1)), and the systemd user scopes every job runs in (A-029): a start in a
// new scope, a scope's state, a signal to a whole scope, the end of a scope, a process's own cgroup, a scope's
// readings, and the probe of `limen init`; and what the system manager says of a unit, which the GitHub doctor and the
// alerts' warning of `limen status` read. The policies built on them (birth checks, the stall rule, the start gate's
// thresholds, the lock's owner check, the names of Limen's scopes, when one ends and the grace before its KILL) stay
// with their callers. Linux is the one implementation; another operating system
// is another implementation with its own tests. A member exists only with an implementation: the scheduler install
// comes with R-032, and notifications stay Herdr's (src/integrations/herdr.ts).
import { linux } from "./linux.ts";

/** A process as the system reports it; `born` is its start time in clock ticks since boot, which a reused pid lacks. */
export type ProcessInfo = {
	readonly pid: number;
	readonly ppid: number;
	readonly pgid: number;
	readonly born: string;
	readonly command: string;
};
/** `absent`: no such process, or one that has exited and waits for its parent; `unavailable`: the system did not say. */
export type ProcessQueryOutcome =
	| { readonly kind: "present"; readonly process: ProcessInfo }
	| { readonly kind: "absent" }
	| { readonly kind: "unavailable" };
/** One row of the process table: `state` as ps prints it (`Z` first for a zombie), CPU time NaN when unreadable. */
export type ProcessRow = {
	readonly pid: number;
	readonly ppid: number;
	readonly pgid: number;
	readonly cpuSeconds: number;
	readonly state: string;
};
/** What a signal did: delivered, no such process, or not permitted (the process exists). */
export type SignalResult = "sent" | "missing" | "denied";
/** One core's cumulative time since boot, in milliseconds: idle and in total. */
export type CoreTimes = { readonly idle: number; readonly total: number };
/** The memory the system can give to new work without swapping, and all of it, in KiB. */
export type MemoryReading = { readonly availableKib: number; readonly totalKib: number };
/** How a process ended: its exit code, or the signal that ended it. */
export type ProcessEnd = { readonly code: number | null; readonly signal: NodeJS.Signals | null };
/** What runs in a new user scope: the scope's unit, the program with its words, and its environment and folder. */
export type ScopedStart = {
	readonly unit: string;
	readonly command: string;
	readonly args: readonly string[];
	readonly env: NodeJS.ProcessEnv;
	readonly cwd?: string;
};
/** A process started in a new user scope: its pid, which the scope keeps as it runs the command in place; its end. */
export type ScopedProcess = { readonly pid: number; readonly ended: Promise<ProcessEnd> };
/**
 * `ended`: every process left in the scope got SIGKILL; `gone`: no process is left in the scope, which ended or never
 * started; `failed`: the system did not end it, as it says.
 */
export type ScopeEnd =
	| { readonly kind: "ended" }
	| { readonly kind: "gone" }
	| { readonly kind: "failed"; readonly detail: string };
/**
 * `active`: a process is left in the scope; `gone`: no process is left in it, which ended or never started; `failed`:
 * the system did not say, as it says.
 */
export type ScopeState =
	| { readonly kind: "active" }
	| { readonly kind: "gone" }
	| { readonly kind: "failed"; readonly detail: string };
/** The signals a whole scope gets: the TERM that starts a grace, and the KILL after it. */
export type ScopeSignal = "SIGTERM" | "SIGKILL";
/** `sent`: the system sent the signal to every process of the scope; `failed`: it did not, as it says. */
export type ScopeSignalResult = { readonly kind: "sent" } | { readonly kind: "failed"; readonly detail: string };
/**
 * `started`: a new user scope ran `true`; `missing`: the program that starts one is not on PATH; `failed`: it ran and
 * failed, as it says.
 */
export type ScopeProbe =
	| { readonly kind: "started" }
	| { readonly kind: "missing" }
	| { readonly kind: "failed"; readonly detail: string };
/** A scope's readings from its cgroup (M-09, A-052): each null when its file is gone or holds no number. */
export type ScopeReadings = {
	readonly memoryPeakBytes: number | null;
	readonly cpuMicroseconds: number | null;
	readonly oomKills: number | null;
};

export interface Platform {
	/** The identity of the process `pid`. */
	processInfo(pid: number): Promise<ProcessQueryOutcome>;
	/** Every process but the one that reads the table; rejects when the read passes `deadline` (epoch milliseconds). */
	processTable(deadline: number): Promise<readonly ProcessRow[]>;
	/** The name of the program `pid` runs, or "" when the system cannot say. */
	commandName(pid: number): string;
	/** Sends `signal` to the process `pid`; 0 only checks that it exists. */
	signalProcess(pid: number, signal: NodeJS.Signals | 0): SignalResult;
	/** Sends `signal` to every process of the group `pgid`; 0 only checks that one exists. */
	signalProcessGroup(pgid: number, signal: NodeJS.Signals | 0): SignalResult;
	/** Whether the process `pid` exists, also when it belongs to another user. */
	processAlive(pid: number): boolean;
	/** Whether a process of the group `pgid` exists, also when it belongs to another user. */
	processGroupAlive(pgid: number): boolean;
	/** The cumulative times of each core, in the order the system lists them. */
	coreTimes(): readonly CoreTimes[];
	/** The memory reading, or undefined when the system does not give it. */
	memory(): MemoryReading | undefined;
	/** The id of the current boot, which a reboot changes; undefined when the system does not give it. */
	bootId(): string | undefined;
	/**
	 * Starts `start.command` detached, as the leader of its own process group, in the new systemd user scope
	 * `start.unit`, which is collected once it ends; resolves once the command runs in that scope, and rejects when it
	 * could not start there.
	 */
	startInScope(start: ScopedStart): Promise<ScopedProcess>;
	/**
	 * Whether a process is left in the user scope `unit`, read without a signal; `cgroup`, when known, lets a scope
	 * already gone answer with no call.
	 */
	scopeState(unit: string, cgroup: string | undefined): ScopeState;
	/** Sends `signal` to every process of the user scope `unit`, `setsid` and re-parented ones included. */
	signalScope(unit: string, signal: ScopeSignal): ScopeSignalResult;
	/**
	 * Sends SIGKILL to every process of the user scope `unit` that `scopeState` finds active; a scope already gone ends
	 * with nothing to do.
	 */
	endScope(unit: string, cgroup: string | undefined): ScopeEnd;
	/** Whether a new user scope starts here, as `limen init` checks it (T-12). */
	probeUserScope(): ScopeProbe;
	/** The cgroup this process runs in, as a path of the cgroup v2 hierarchy; undefined when the system gives none. */
	ownCgroup(): string | undefined;
	/** The readings of the cgroup `cgroup`, a path of the cgroup v2 hierarchy as `ownCgroup` gives it. */
	scopeReadings(cgroup: string): Promise<ScopeReadings>;
	/** The property `property` of the system manager's unit `unit` as it prints it; undefined when the call fails. */
	systemUnitProperty(unit: string, property: string): string | undefined;
	/**
	 * What the system manager prints for `is-enabled`, `is-active` or `is-failed` of its unit `unit`; undefined when it
	 * says no, so `is-failed` gives `failed` only for a unit that failed.
	 */
	systemUnitState(unit: string, query: "is-enabled" | "is-active" | "is-failed"): string | undefined;
}

/** The implementation in use. */
export const platform: Platform = linux;

/**
 * The shape of the id that `bootId()` gives, for a reader of a stored boot id (the lock's owner record). It comes from
 * the implementation in use, which parses the id with it.
 */
export { BOOT_ID } from "./linux.ts";
