// The operating-system primitives Limen uses, as one interface (A-083): a process's identity, the process table,
// liveness and signals of a process and of a process group, the CPU and memory readings of the start gate, and the
// boot id that a lock's owner record carries (D-056 (1)). The policies built on them (the escaped-descendant walk,
// birth checks, the stall rule, the start gate's thresholds, the lock's owner check) stay with their callers. Linux is
// the one implementation; another operating system is another implementation with its own tests. A member exists only
// with an implementation: the scheduler install comes with R-032, and notifications stay Herdr's
// (src/integrations/herdr.ts).
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
}

/** The implementation in use. */
export const platform: Platform = linux;

/**
 * The shape of the id that `bootId()` gives, for a reader of a stored boot id (the lock's owner record). It comes from
 * the implementation in use, which parses the id with it.
 */
export { BOOT_ID } from "./linux.ts";
