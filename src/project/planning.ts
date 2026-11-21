import { resolve } from "node:path";
import { transport } from "../config.ts";
import { readRecordSync } from "../job/record.ts";

/** Inside a job's own worktree, return the canonical root and the workspace repository from its job record. */
export function inheritedPlanning(worktree: string): { root: string; repo?: string } | undefined {
	const root = transport("LIMEN_CONTEXT_ROOT");
	const id = transport("LIMEN_JOB_ID");
	if (transport("LIMEN_JOB") !== "1" || !root || !id || !/^[A-Za-z0-9._-]+$/.test(id)) {
		return;
	}
	const record = readRecordSync(`${root}/.limen/jobs/${id}`);
	if (!record?.worktree || resolve(record.worktree) !== resolve(worktree)) {
		return;
	}
	return { root, ...(record.repo ? { repo: record.repo } : {}) };
}

/** Read every `Ticket:` path, preserving order and excluding sentence punctuation. */
export function ticketPointers(task: string): Array<{ path: string; pointer: string }> {
	return [...task.matchAll(/\bTicket:\s+(\S+)/g)].flatMap(([pointer, token]) => {
		const path = token?.replace(/[.,;:!?)\]'"`]+$/, "");
		return path ? [{ path, pointer }] : [];
	});
}
