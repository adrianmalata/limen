import { spawn } from "node:child_process";
import { existsSync } from "node:fs";
import { transport } from "../config.ts";
import { appendLimenLog } from "../job/record.ts";
import { limitMs, plantLimits } from "../project/limits.ts";

const DEFAULT_PREPARE_MS = 5 * 60_000;

/** Why the engine cannot start in the job's worktree: it is gone or is no Git checkout. Undefined when it can. */
export function worktreeMissing(worktree: string): string | undefined {
	return existsSync(`${worktree}/.git`)
		? undefined
		: `worktree ${worktree} is missing or is not a Git checkout, so the engine did not start`;
}

/**
 * The setup spawn hands to the job's owner after publication, so spawn returns before it: run `--prepare` in the
 * worktree with `environment`, the one the wrapper gives its engine: the command is the project's code, as the
 * engine's tools are, so it gets no Herdr name and no transport name only the wrapper reads (R-087 (c)). `LIMEN_SETUP`
 * marks a start that owes setup; a continue or a recovery does not set it. A setup prunes nothing: the seat sweep's
 * daily prune is prune's one caller (D-097 (4) (c)). The step logs its result and time, and its failure does not end
 * the job. The log also names each entry of the plant's limits file that Limen ignores.
 */
export async function setUpJob(jobDir: string, worktree: string, environment: NodeJS.ProcessEnv): Promise<void> {
	const root = transport("LIMEN_CONTEXT_ROOT");
	if (!(transport("LIMEN_SETUP") === "1" && root)) {
		return;
	}
	// Each message names the file, the entry and what Limen expected there.
	const { ignored } = plantLimits(root);
	if (ignored.length > 0) {
		await appendLimenLog(jobDir, `limits: ignored ${ignored.map(({ message }) => message).join("; ")}`);
	}
	const command = transport("LIMEN_SETUP_PREPARE")?.trim();
	if (command) {
		const timeoutMs = limitMs("prepare", DEFAULT_PREPARE_MS, root);
		await runPrepare(jobDir, { cwd: worktree, env: environment }, command, timeoutMs);
	}
}
async function runPrepare(
	jobDir: string,
	where: { readonly cwd: string; readonly env: NodeJS.ProcessEnv },
	command: string,
	timeoutMs: number,
): Promise<void> {
	const start = Date.now();
	let output = "";
	const failure = await new Promise<string | undefined>((resolve) => {
		const child = spawn(command, { ...where, shell: true, stdio: ["ignore", "pipe", "pipe"], timeout: timeoutMs });
		child.stdout.on("data", (chunk: Buffer) => {
			output += chunk.toString();
		});
		child.stderr.on("data", (chunk: Buffer) => {
			output += chunk.toString();
		});
		child.once("error", (error) => resolve(error.message));
		// `exit`, not `close`: a process the command left behind may hold its pipes open.
		child.once("exit", (code, signal) => {
			if (code === 0) {
				resolve(undefined);
			} else if (signal && Date.now() - start >= timeoutMs) {
				resolve(`timed out after ${timeoutMs / 1000} s`);
			} else {
				resolve(signal ? `killed by ${signal}` : `exit ${code}`);
			}
		});
	});
	const trimmed = output.trimEnd();
	await appendLimenLog(jobDir, `prepare: ${command} (${seconds(start)})${trimmed ? `\n${trimmed}` : ""}`);
	if (failure) {
		await appendLimenLog(jobDir, `prepare failed: ${failure}`);
	}
}
const seconds = (start: number): string => `${((Date.now() - start) / 1000).toFixed(1)} s`;
