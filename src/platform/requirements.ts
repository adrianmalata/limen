// The system requirements of Limen, declared in the platform adapter (T-12 (2), A-083), each with a probe whose
// failure names the tool or the feature. `limen init` and `limen workspace init` run the check first, and the
// coordinator start script of R-050 runs the same function. A failure is an environment error (exit code 4, T-02).
// The versions of Pi, the bridge and Herdr are data: R-049 refuses another version of Pi and the bridge (T-32 (3)).
import { spawnSync } from "node:child_process";
import { existsSync, mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { herdrBinary } from "../integrations/herdr.ts";
import { LimenError } from "../outcome.ts";

/** The oldest Node major Limen runs on; `bin/limen` checks the same number before it can load this module. */
export const NODE_MAJOR = 24;
/** The engine Limen supports. */
export const PI = { package: "@earendil-works/pi-coding-agent", version: "1.5.1" } as const;
/** The engine's provider for Claude models, in the version Limen supports. */
export const BRIDGE = { package: "@vanillagreen/pi-claude-bridge", version: "5.0.3" } as const;
/** The terminal multiplexer of the seat; Limen uses it only inside a Herdr pane. */
export const HERDR = { version: "0.9.3" } as const;
/**
 * The call by which Limen reads a repository's worktrees (`listWorktrees` in src/project/git.ts). git 2.36 added
 * `-z`; git is declared by this feature, not by a version number, so a shim that provides it passes too.
 */
const GIT_FEATURE = ["worktree", "list", "--porcelain", "-z"] as const;
const GIT_PROBE_TIMEOUT_MS = 10_000;
const NEWER_GIT = "Install git 2.36 or newer.";

/** One declared tool and its probe, which returns the failure or undefined when the tool is there. */
export type Requirement = { readonly tool: string; readonly probe: () => LimenError | undefined };

/** A declared tool that is not on PATH or cannot start. */
function missingTool(message: string, cause?: unknown): LimenError {
	return new LimenError({ class: "environment", code: "MISSING_TOOL", message, next: null, cause });
}

/** A git that cannot start, from the error of its spawn: not on PATH (`ENOENT`), or another reason it names. */
export function gitStartFailure(error: Error): LimenError {
	if ("code" in error && error.code === "ENOENT") {
		return missingTool(`git is not on PATH; Limen keeps each job in a git worktree. ${NEWER_GIT}`, error);
	}
	return missingTool(`git cannot start: ${error.message}. ${NEWER_GIT}`, error);
}

/**
 * The failure of a Node older than `NODE_MAJOR`, from `version` as `process.versions.node` gives it. `bin/limen` prints
 * the same message and final line before it can load this module (a test compares them).
 */
export function nodeFailure(version: string): LimenError | undefined {
	const major = Number.parseInt(version, 10);
	if (Number.isFinite(major) && major >= NODE_MAJOR) {
		return;
	}
	const message = `limen requires Node.js ${NODE_MAJOR} or newer (this is ${version})`;
	return new LimenError({ class: "environment", code: "NODE_VERSION", message, next: null });
}

/** Whether a folder of PATH holds `tool`, the same lookup as the engine's and Herdr's. */
function onPath(tool: string): boolean {
	return (process.env.PATH ?? "").split(":").some((folder) => folder !== "" && existsSync(join(folder, tool)));
}

/** The probe of a tool that only has to be on PATH. */
function present(tool: string, use: string): Requirement["probe"] {
	return () => (onPath(tool) ? undefined : missingTool(`${tool} is not on PATH; ${use}`));
}

/**
 * The git on PATH runs `git worktree list --porcelain -z` in a new empty bare repository of the temporary folder, named
 * with `--git-dir`, so `safe.bareRepository=explicit` does not refuse it as it refuses one found from `-C`.
 */
function gitFailure(): LimenError | undefined {
	const repository = mkdtempSync(join(tmpdir(), "limen-git-probe-"));
	try {
		for (const args of [
			["init", "-q", "--bare", "--template=", repository],
			[`--git-dir=${repository}`, ...GIT_FEATURE],
		]) {
			const result = spawnSync("git", args, { encoding: "utf8", timeout: GIT_PROBE_TIMEOUT_MS });
			if (result.error) {
				return gitStartFailure(result.error);
			}
			if (result.status !== 0) {
				const said = result.stderr.trim().split("\n", 1)[0] || `exit code ${result.status}`;
				const message = `git does not run "git ${GIT_FEATURE.join(" ")}", which Limen reads worktrees with: ${said}. ${NEWER_GIT}`;
				return new LimenError({ class: "environment", code: "MISSING_FEATURE", message, next: null });
			}
		}
		return;
	} finally {
		rmSync(repository, { recursive: true, force: true });
	}
}

/** Herdr counts only inside a Herdr pane, where Limen opens tabs with it; its binary is found as Limen finds it. */
function herdrFailure(): LimenError | undefined {
	if (process.env.HERDR_ENV !== "1" || herdrBinary()) {
		return;
	}
	return missingTool(
		`herdr is not on PATH, and this is a Herdr pane (HERDR_ENV=1); Limen opens job tabs with Herdr ${HERDR.version}. Install it, or run limen outside the pane.`,
	);
}

/** The declared tools, each with its probe, in the order the check runs them. */
export const REQUIREMENTS: readonly Requirement[] = [
	{ tool: "node", probe: () => nodeFailure(process.versions.node) },
	{ tool: "git", probe: gitFailure },
	{ tool: "tar", probe: present("tar", "limen land unpacks the tickets of a job's branch with tar. Install tar.") },
	{ tool: "ps", probe: present("ps", "Limen reads the process table with ps. Install ps (procps).") },
	{ tool: "pi", probe: present("pi", `every job runs on Pi ${PI.version} (${PI.package}). Install it.`) },
	{ tool: "herdr", probe: herdrFailure },
];

/** Runs every probe in order and throws the first failure, so the refusal names one tool and exits with code 4. */
export function checkRequirements(): void {
	for (const { probe } of REQUIREMENTS) {
		const failure = probe();
		if (failure) {
			throw failure;
		}
	}
}
