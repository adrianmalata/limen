// Hunk, the terminal diff viewer: where its binary is, and `limen diff`, the change a job made against its base, shown
// in a Herdr tab, in Hunk in this terminal, or named as the git command that shows it. A change command, since in
// Herdr it opens a tab and records its place so that a close finds it (D-096 (2), T-38).
import { spawnSync } from "node:child_process";
import { existsSync } from "node:fs";
import { testKnob } from "../config.ts";
import { recordedBranch } from "../job/job.ts";
import { type JobReference, resolveJob } from "../job/reference.ts";
import { runOperation } from "../operation.ts";
import { environmentError } from "../outcome.ts";
import { limenRoot, workspaceRepository } from "../project/git.ts";
import { herdrAvailable, herdrBinary, openDiffTab } from "./herdr.ts";

/**
 * What `limen diff` decided in its validate: to name the git command that shows the change, which writes nothing; to
 * open the change in a Herdr tab; or to run Hunk in this terminal.
 */
type DiffPlan =
	| { readonly kind: "command"; readonly line: string }
	| {
			readonly kind: "tab";
			readonly herdr: string;
			readonly jobDir: string;
			readonly label: string;
			readonly cwd: string;
			readonly workspaceCwd: string;
			readonly hunk: string;
			readonly args: readonly string[];
	  }
	| { readonly kind: "terminal"; readonly hunk: string; readonly cwd: string; readonly args: readonly string[] };

/**
 * The change the job `query` names made against its base: in a Herdr tab, in Hunk in this terminal, or, without Hunk
 * or a terminal, the git command that shows it. Its validate resolves the job and reads its record; a record with no
 * branch or base refuses (JOB_NO_BRANCH, JOB_NO_BASE). Returns the line for people, or nothing after Hunk ran here.
 */
export function showJobDiff(cwd: string, query: JobReference): Promise<string | undefined> {
	return runOperation<DiffPlan, string | undefined>({
		validate: async (view) => {
			const { id, jobDir } = await resolveJob(cwd, query, "read");
			const record = await view.record(jobDir);
			const { branch, base } = recordedBranch(id, record);
			const range = `${base}...${branch}`;
			const hunk = hunkBinary();
			const herdr = herdrAvailable() ? herdrBinary() : undefined;
			if (!hunk || ((!process.stdin.isTTY || !process.stdout.isTTY) && !herdr)) {
				return { kind: "command", line: `git diff ${shellArg(range)}` };
			}
			const root = limenRoot(cwd);
			const repository = record?.repo ? workspaceRepository(root, record.repo) : root;
			const worktree = record?.worktree ?? "";
			const live = record?.state === "running" && Boolean(worktree) && existsSync(worktree);
			const reviewCwd = live ? worktree : repository;
			const args = live ? ["diff", base, "--watch"] : ["diff", range];
			if (herdr) {
				const label = record?.label || id;
				return { kind: "tab", herdr, jobDir, label, cwd: reviewCwd, workspaceCwd: root, hunk, args };
			}
			return { kind: "terminal", hunk, cwd: reviewCwd, args };
		},
		apply: async (plan) => {
			if (plan.kind === "command") {
				return plan.line;
			}
			if (plan.kind === "tab") {
				return openDiffTab(plan);
			}
			runHunk(plan);
			return undefined;
		},
	});
}

/** Runs Hunk in this terminal; one that cannot start or that exits non-zero is the environment's failure, HUNK_FAILED. */
function runHunk(plan: Extract<DiffPlan, { readonly kind: "terminal" }>): void {
	const result = spawnSync(plan.hunk, plan.args, { cwd: plan.cwd, stdio: "inherit" });
	if (result.error) {
		throw environmentError("HUNK_FAILED", `hunk did not start: ${result.error.message}`);
	}
	if (result.status !== 0) {
		throw environmentError("HUNK_FAILED", `hunk exited with status ${result.status ?? "unknown"}`);
	}
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
