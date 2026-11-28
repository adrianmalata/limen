/**
 * How the seat's alerts run a system program (T-25): to its end, within a time bound and an output cap, with the
 * environment the caller gives or else their own, and what it did as data, so that its exit code decides and a program
 * that cannot start says why. `seat/alerts.ts` runs the install's tools through it and `seat/main-watch.ts` its git and
 * ssh, each through an injected `Runner`, which a test replaces.
 */
import { spawnSync } from "node:child_process";

/** The bound of a program whose caller gives none. */
const PROGRAM_TIMEOUT_MS = 60_000;
const MAX_OUTPUT_BYTES = 16 * 1024 * 1024;

/** What a system program did: its exit status, null when it did not run to one; its output; why it did not start. */
export type Ran = {
	readonly status: number | null;
	readonly stdout: string;
	readonly stderr: string;
	readonly error?: string;
};
/** The environment a program gets in place of the caller's own, and its time bound. */
export type RunOptions = { readonly env?: NodeJS.ProcessEnv; readonly timeoutMs?: number };
/** Runs a system program to its end. */
export type Runner = (argv: readonly [string, ...string[]], options?: RunOptions) => Ran;

/** A system program run to its end, bounded; a program that cannot start, or that its bound ends, says why. */
export function runProgram([program, ...args]: readonly [string, ...string[]], options: RunOptions = {}): Ran {
	const result = spawnSync(program, args, {
		encoding: "utf8",
		timeout: options.timeoutMs ?? PROGRAM_TIMEOUT_MS,
		maxBuffer: MAX_OUTPUT_BYTES,
		...(options.env === undefined ? {} : { env: options.env }),
	});
	return {
		status: result.status,
		stdout: result.stdout ?? "",
		stderr: result.stderr ?? "",
		...(result.error ? { error: result.error.message } : {}),
	};
}

/** Whether `result` is a failure: the program did not start, did not end within its bound, or exited non-zero. */
export const failed = (result: Ran) => result.error !== undefined || result.status !== 0;
/** Why `result` failed: why it did not start or end, else what it wrote to stderr, else its exit status. */
export const why = (result: Ran) => result.error ?? (result.stderr.trim() || `exit ${result.status ?? "unknown"}`);
