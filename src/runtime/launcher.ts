// The one module that starts Limen's own CLI (D-061 (4), T-26 (4), T-25 (1)): a job's wrapper, which prints no final
// line; a command started in the background, whose output nobody reads; and a command whose final line the caller
// reads, through the client function `readOutcome`, never the text for people before it.
import { spawn, spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";
import { type TransportName, wrapperEnvironment } from "../config.ts";
import { LimenError, type Outcome, type Output, readOutcome } from "../outcome.ts";

/** This package's entry point, which runs under this node. */
const CLI = fileURLToPath(new URL("../../bin/limen", import.meta.url));

/**
 * Where a run of the CLI runs and as whom: `cli` names the CLI at another path, which runs as a program (the GitHub
 * poller's installed copy); `user` runs it as that user through `sudo -n -u <user> --`, so it never asks for a
 * password. Without `env` the run inherits this process's environment.
 */
export type RunOptions = {
	readonly cli?: string;
	readonly user?: string;
	readonly cwd?: string;
	readonly env?: NodeJS.ProcessEnv;
	readonly timeout?: number;
};
/**
 * A finished run of the CLI: its final line, read by the client function, and the output it came from. A run that left
 * no valid final line, as when it did not start or `sudo` refused it, has the internal failure the reader names, so a
 * caller sees a failed run; `error` is the start's own error when there was one.
 */
export type LimenRun = { readonly outcome: Outcome; readonly output: Output; readonly error?: Error };

/** Runs the CLI with `args`, waits for it and reads its final line (T-26 (4), T-37 (2)). */
export function runLimen(args: readonly string[], options: RunOptions = {}): LimenRun {
	const cli = options.cli ?? CLI;
	const program = options.user !== undefined ? "sudo" : options.cli !== undefined ? options.cli : process.execPath;
	const words = [
		...(options.user !== undefined ? ["-n", "-u", options.user, "--", cli] : options.cli !== undefined ? [] : [cli]),
		...args,
	];
	const result = spawnSync(program, words, {
		encoding: "utf8",
		...(options.cwd === undefined ? {} : { cwd: options.cwd }),
		...(options.env === undefined ? {} : { env: options.env }),
		...(options.timeout === undefined ? {} : { timeout: options.timeout }),
	});
	const output = { status: result.status, stdout: result.stdout ?? "", stderr: result.stderr ?? "" };
	return { outcome: finalOutcome(output), output, ...(result.error === undefined ? {} : { error: result.error }) };
}

/** The final line of `output`, or the failure the client function names when it has none. */
function finalOutcome(output: Output): Outcome {
	try {
		return readOutcome(output);
	} catch (error) {
		if (!(error instanceof LimenError)) {
			throw error;
		}
		return { class: error.class, code: error.code, next: error.next };
	}
}

/**
 * Starts the CLI with `args` in the background, detached, its output ignored: the group's next round and a rule's
 * timer. A start that fails is left to the next caller that starts it again: the next finished team job or
 * `limen group status`, and the next command that finds a rule past its end.
 */
export function startLimen(
	args: readonly string[],
	options: { readonly cwd?: string; readonly env: NodeJS.ProcessEnv },
): void {
	const child = spawn(process.execPath, [CLI, ...args], {
		...(options.cwd === undefined ? {} : { cwd: options.cwd }),
		detached: true,
		stdio: "ignore",
		env: options.env,
	});
	child.once("error", () => {});
	child.unref();
}

/**
 * Starts a job's wrapper, the CLI's internal run, with what the spawner passes; it inherits no transport or removed name
 * (R-015), and it prints no final line, so nobody reads its output.
 */
export async function launchWrapper(environment: Readonly<Partial<Record<TransportName, string>>>): Promise<number> {
	const child = spawn(process.execPath, [CLI], {
		detached: true,
		stdio: "ignore",
		env: wrapperEnvironment({ ...environment, LIMEN_INTERNAL_RUN: "1" }),
	});
	await new Promise<void>((resolve, reject) => {
		child.once("spawn", resolve);
		child.once("error", reject);
	});
	if (!child.pid) {
		throw new Error("could not start the detached job wrapper");
	}
	child.unref();
	return child.pid;
}
