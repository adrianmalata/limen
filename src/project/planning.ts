import { readFileSync } from "node:fs";
import { resolve } from "node:path";

/** Inside a job's own worktree, return the canonical root and the workspace repository from its job record. */
export function inheritedPlanning(worktree: string): { root: string; repo?: string } | undefined {
	const root = process.env.LIMEN_CONTEXT_ROOT;
	const id = process.env.LIMEN_JOB_ID;
	if (process.env.LIMEN_JOB !== "1" || !root || !id || !/^[A-Za-z0-9._-]+$/.test(id)) {
		return;
	}
	const jobDir = `${root}/.limen/jobs/${id}`;
	if (resolve(readFileSync(`${jobDir}/worktree`, "utf8").trim()) !== resolve(worktree)) {
		return;
	}
	const repo = readIfPresent(`${jobDir}/repo`)?.trim();
	return { root, ...(repo ? { repo } : {}) };
}

/** Read every `Ticket:` path, preserving order and excluding sentence punctuation. */
export function ticketPointers(task: string): Array<{ path: string; pointer: string }> {
	return [...task.matchAll(/\bTicket:\s+(\S+)/g)].flatMap(([pointer, token]) => {
		const path = token?.replace(/[.,;:!?)\]'"`]+$/, "");
		return path ? [{ path, pointer }] : [];
	});
}

function readIfPresent(file: string): string | undefined {
	try {
		return readFileSync(file, "utf8");
	} catch (error) {
		if ((error as NodeJS.ErrnoException).code === "ENOENT") {
			return;
		}
		throw error;
	}
}
