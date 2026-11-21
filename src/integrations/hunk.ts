// Hunk, the terminal diff viewer: where its binary is, and the change a job made against its base, shown in Hunk or
// named as the git command that shows it (`limen diff`).
import { spawnSync } from "node:child_process";
import { existsSync } from "node:fs";
import { testKnob } from "../config.ts";
import { readRecord } from "../job/record.ts";
import { type JobReference, resolveJob } from "../job/reference.ts";
import { limenRoot, workspaceRepository } from "../project/git.ts";
import { herdrAvailable, openDiffTab } from "./herdr.ts";

/**
 * The change the job `query` names made against its base: in a Herdr tab, in Hunk in this terminal, or, without Hunk
 * or a terminal, the git command that shows it. Returns the line for people, or nothing after Hunk ran here.
 */
export async function showJobDiff(cwd: string, query: JobReference): Promise<string | undefined> {
	const { id, jobDir } = await resolveJob(cwd, query, "read");
	const record = await readRecord(jobDir);
	const base = record?.base ?? "";
	const branch = record?.branch ?? "";
	const worktree = record?.worktree ?? "";
	const repo = record?.repo ?? "";
	const label = record?.label ?? "";
	const state = record?.state;
	if (!base || !branch) {
		throw new Error(`job ${id} has no recorded ${base ? "branch" : "base"}`);
	}
	const range = `${base}...${branch}`;
	const fallback = `git diff ${shellArg(range)}`;
	const hunk = hunkBinary();
	const herdr = herdrAvailable();
	if (!hunk || ((!process.stdin.isTTY || !process.stdout.isTTY) && !herdr)) {
		return fallback;
	}
	const root = limenRoot(cwd);
	const repository = repo ? workspaceRepository(root, repo) : root;
	const live = state === "running" && Boolean(worktree) && existsSync(worktree);
	const reviewCwd = live ? worktree : repository;
	const hunkArgs = live ? ["diff", base, "--watch"] : ["diff", range];
	if (herdr) {
		return openDiffTab({ jobDir, label: label || id, cwd: reviewCwd, workspaceCwd: root, hunk, args: hunkArgs });
	}
	const result = spawnSync(hunk, hunkArgs, {
		cwd: reviewCwd,
		stdio: "inherit",
	});
	if (result.error) {
		throw result.error;
	}
	if (result.status !== 0) {
		throw new Error(`hunk exited with status ${result.status ?? "unknown"}`);
	}
	return undefined;
}

/** Hunk's binary: the tests' knob, `0` for none, else the first `hunk` on PATH; undefined without one. */
export function hunkBinary(): string | undefined {
	const override = testKnob("LIMEN_HUNK")?.trim();
	if (override === "0") {
		return;
	}
	if (override) {
		return existsSync(override) ? override : undefined;
	}
	for (const dir of (process.env.PATH ?? "").split(":")) {
		const candidate = `${dir}/hunk`;
		if (dir && existsSync(candidate)) {
			return candidate;
		}
	}
}

function shellArg(value: string): string {
	return /^[A-Za-z0-9_./:@+~-]+$/.test(value) ? value : `'${value.replaceAll("'", `'\\''`)}'`;
}
