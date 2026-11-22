// The one state snapshot of the refusal tests (T-38 (4)): a refusal leaves it identical. It holds what a half-made
// change would leave in a project: the git refs and HEAD, git's worktree list and the folder Limen makes worktrees
// in, the tree status, every folder of the project outside `.git` (git's status shows no empty one), and a digest of
// every path under `.limen/` and `spec/` (and of any folder `also` names).
// Nothing is left out, so a test takes it only while no process writes there: every job of the plant settled, its
// wrapper exited (`waitJob` of test/plant.ts), and a job that must stay running given as a record whose owner is a
// process that writes nothing. A live wrapper writes its log and `progress.json` (through a temp file and a rename),
// so a snapshot taken beside it races it: a file can go between the listing and its read, or change between two
// snapshots. A git call that fails throws, so a snapshot where git cannot run never reads as an empty, equal one.
import { type SpawnSyncReturns, spawnSync } from "node:child_process";
import { createHash } from "node:crypto";
import { existsSync, readdirSync, readFileSync } from "node:fs";
import { basename, dirname, join, relative } from "node:path";

/** What `snapshot` records of a project; two equal snapshots mean no change Limen makes shows between them. */
export type Snapshot = {
	readonly refs: string;
	readonly worktrees: string;
	/** The entries of the folder beside the repository that holds its job worktrees, or null when there is none. */
	readonly worktreeFolder: readonly string[] | null;
	readonly status: string;
	/** Every folder under the root but `.git` and what is below it, from the root, in order. */
	readonly folders: readonly string[];
	/** Each path under the digested folders, from the root, with the SHA-256 of a file, or the kind of anything else. */
	readonly files: Readonly<Record<string, string>>;
};

/** The folders whose every path the snapshot digests, from the project's root. */
const DIGESTED = [".limen", "spec"] as const;

/**
 * The snapshot of the project at `root`, a Git repository. `also` names more folders, from the root, to digest: one
 * under it, such as `.git/hooks` for a command that once wrote hooks, or the seat's folder beside a test project,
 * `../.limen` (test/plant.ts). A git call that fails throws, except the name of a detached HEAD (`headName`).
 */
export function snapshot(root: string, also: readonly string[] = []): Snapshot {
	const files: Record<string, string> = {};
	for (const folder of [...DIGESTED, ...also]) {
		digest(root, join(root, folder), files);
	}
	const folder = join(dirname(root), `.${basename(root)}-limen-worktrees`);
	return {
		refs: [
			git(root, ["for-each-ref", "--format=%(refname) %(objectname)"]),
			headName(root),
			git(root, ["rev-parse", "-q", "--verify", "HEAD"]),
		].join(""),
		worktrees: git(root, ["worktree", "list", "--porcelain"]),
		worktreeFolder: existsSync(folder) ? readdirSync(folder).sort() : null,
		status: git(root, ["status", "--porcelain", "--untracked-files=all"]),
		folders: foldersBelow(root, root),
		files,
	};
}

/** Every folder below `dir`, from `root`, in order, but `.git` of the root and what is below it. */
function foldersBelow(root: string, dir: string): string[] {
	if (!existsSync(dir)) {
		return [];
	}
	return readdirSync(dir, { withFileTypes: true })
		.filter((entry) => entry.isDirectory() && !(dir === root && entry.name === ".git"))
		.flatMap((entry) => {
			const path = join(dir, entry.name);
			return [relative(root, path), ...foldersBelow(root, path)];
		})
		.sort();
}

/** Adds each path under `dir` to `files`: a file's digest, "directory", or "other" for a link or a socket. */
function digest(root: string, dir: string, files: Record<string, string>): void {
	if (!existsSync(dir)) {
		return;
	}
	for (const entry of readdirSync(dir, { recursive: true, withFileTypes: true })) {
		const path = join(entry.parentPath, entry.name);
		files[relative(root, path)] = entry.isFile()
			? createHash("sha256").update(readFileSync(path)).digest("hex")
			: entry.isDirectory()
				? "directory"
				: "other";
	}
}

/**
 * The branch HEAD names, or "" for a detached HEAD: `symbolic-ref -q` then exits 1 with no output and no message, by
 * design. Any other failure of git throws, as in `git`.
 */
function headName(root: string): string {
	const run = gitRun(root, ["symbolic-ref", "-q", "HEAD"]);
	return run.status === 1 && run.stdout === "" && run.stderr === "" ? "" : output(root, run);
}

/** The output of the git call `args` in `root`; a call that fails throws with its exit code and git's message. */
function git(root: string, args: readonly string[]): string {
	return output(root, gitRun(root, args));
}

/** A finished git call with the arguments it ran. */
type GitRun = SpawnSyncReturns<string> & { readonly args: readonly string[] };

/** Runs git in `root` with `args`, without the user's or the system's git configuration. */
function gitRun(root: string, args: readonly string[]): GitRun {
	const run = spawnSync("git", ["-C", root, ...args], {
		encoding: "utf8",
		stdio: ["ignore", "pipe", "pipe"],
		env: { ...process.env, GIT_CONFIG_GLOBAL: "/dev/null", GIT_CONFIG_NOSYSTEM: "1" },
	});
	return { ...run, args };
}

/** The stdout of a git call that exited 0; any other end of it throws. */
function output(root: string, run: GitRun): string {
	if (run.status === 0) {
		return run.stdout;
	}
	const reason = run.error?.message ?? (run.stderr.trim() || `exit code ${run.status ?? run.signal}`);
	throw new Error(`snapshot: git ${run.args.join(" ")} failed in ${root}: ${reason}`);
}
