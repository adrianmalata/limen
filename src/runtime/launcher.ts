// The one module that starts Limen's own CLI (D-061 (4), T-26 (4), T-25 (1)): a job's wrapper, which prints no final
// line; a command started in the background, whose output nobody reads; and a command whose final line the caller
// reads, through the client function `readOutcome`, never the text for people before it. It also names Limen's
// systemd user scopes (A-029), and tells a job's scope among other units (A-036): a job's wrapper starts in the job's
// own scope, so the engine, its tools and whatever they detach run there, outside the spawner's cgroup; what a job's
// end starts runs in a scope of its own, so the end of the job's scope does not end it (src/job/finalize.ts).
import { spawnSync } from "node:child_process";
import { randomBytes } from "node:crypto";
import { fileURLToPath } from "node:url";
import { type WrapperValues, wrapperEnvironment } from "../config.ts";
import { JOB_ID } from "../job/id.ts";
import { appendLimenLog } from "../job/record.ts";
import { LimenError, type Outcome, type Output, readOutcome } from "../outcome.ts";
import { platform, type ScopedProcess } from "../platform/platform.ts";

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

/** The words around a job's id in the unit of its scope. */
const JOB_SCOPE_PREFIX = "limen-job-";
const JOB_SCOPE_SUFFIX = ".scope";
/**
 * The unit of the systemd user scope of the job `id` (A-029): one per job, named by its full id (T-20), so that every
 * reader of the seat's scopes can tell a job's scope from any other.
 */
export function jobScope(id: string): string {
	return `${JOB_SCOPE_PREFIX}${id}${JOB_SCOPE_SUFFIX}`;
}
/**
 * The job whose scope is the unit `unit`, as `jobScope` names it, so a reader of the seat's units tells a job's scope
 * from any other (A-036); undefined for any other unit.
 */
export function jobOfScope(unit: string): string | undefined {
	if (!(unit.startsWith(JOB_SCOPE_PREFIX) && unit.endsWith(JOB_SCOPE_SUFFIX))) {
		return undefined;
	}
	const id = unit.slice(JOB_SCOPE_PREFIX.length, -JOB_SCOPE_SUFFIX.length);
	return JOB_ID.test(id) ? id : undefined;
}

/**
 * Starts `command` with `args` detached in a new user scope of its own, `limen-run-<token>.scope`, so that the end of
 * the job whose finisher started it does not end it; resolves once it runs there, so a finisher that awaits it ends the
 * job's scope only after, and rejects when it could not start.
 */
export async function startOutsideJob(
	command: string,
	args: readonly string[],
	options: { readonly cwd?: string; readonly env: NodeJS.ProcessEnv },
): Promise<void> {
	const unit = `limen-run-${randomBytes(4).toString("hex")}.scope`;
	await platform.startInScope({ unit, command, args, ...options });
}

/**
 * Starts the CLI with `args` in the background, detached, its output ignored: the group's next round, in a scope of its
 * own (`startOutsideJob`); resolves once it runs there, and rejects with what the system said when it could not start.
 * Its caller writes that failure where its work is read (T-01), and the next caller starts it again: the next finished
 * team job or `limen group status`.
 */
export async function startLimen(
	args: readonly string[],
	options: { readonly cwd?: string; readonly env: NodeJS.ProcessEnv },
): Promise<void> {
	await startOutsideJob(process.execPath, [CLI, ...args], options);
}

/**
 * Starts a job's wrapper, the CLI's internal run, with what the spawner passes, in the job's own user scope
 * (`jobScope`), in the environment the allow-list builds (T1 of A-004, `wrapperEnvironment`), and it prints no final
 * line, so nobody reads its output. Before the start the job's log names the spawner's names the list dropped, never a
 * value, so a project tool that fails for a dropped name shows its cause (R-087 (d)). A scope that cannot start is
 * SCOPE_FAILED, an environment failure with what the system said: the job never runs outside its scope (A-029), and the
 * host's user instance is the likely cause, which `limen init` checks.
 */
export async function launchWrapper(id: string, environment: Readonly<WrapperValues>): Promise<ScopedProcess> {
	const { environment: env, dropped } = wrapperEnvironment({ ...environment, LIMEN_INTERNAL_RUN: "1" });
	if (dropped.length > 0) {
		const names = `${dropped.length} ${dropped.length === 1 ? "name" : "names"}`;
		await appendLimenLog(
			environment.LIMEN_JOB_DIR,
			`environment: dropped ${names} of the spawner: ${dropped.join(", ")}`,
		);
	}
	return platform
		.startInScope({ unit: jobScope(id), command: process.execPath, args: [CLI], env })
		.catch((error: unknown) => {
			throw new LimenError({
				class: "environment",
				code: "SCOPE_FAILED",
				message: `the job's systemd user scope did not start: ${error instanceof Error ? error.message : String(error)}. Every job runs in its own user scope, which needs the account's systemd user instance; root keeps it running with lingering (loginctl enable-linger <account>)`,
				next: null,
				cause: error,
			});
		});
}
