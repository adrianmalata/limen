import { spawnSync } from "node:child_process";
import { existsSync } from "node:fs";
import { testKnob } from "../config.ts";
import { herdrAvailable, openDiffTab } from "../integrations/herdr.ts";
import { readRecord } from "../job/record.ts";
import { jobArgument, resolveJob } from "../job/reference.ts";
import type { Parsed } from "../parser.ts";
import { limenRoot, workspaceRepository } from "../project/git.ts";

/** `limen diff`: the change a job made against its base, in Hunk or as the git command that shows it. */
export async function diffCommand(values: Parsed, cwd: string): Promise<undefined> {
	const { id, jobDir } = await resolveJob(cwd, jobArgument(values), "read");
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
		console.log(fallback);
		return;
	}
	const root = limenRoot(cwd);
	const repository = repo ? workspaceRepository(root, repo) : root;
	const live = state === "running" && Boolean(worktree) && existsSync(worktree);
	const reviewCwd = live ? worktree : repository;
	const hunkArgs = live ? ["diff", base, "--watch"] : ["diff", range];
	if (herdr) {
		console.log(
			await openDiffTab({ jobDir, label: label || id, cwd: reviewCwd, workspaceCwd: root, hunk, args: hunkArgs }),
		);
		return;
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
}

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
