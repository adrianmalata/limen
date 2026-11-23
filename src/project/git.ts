import { execFileSync, spawnSync } from "node:child_process";
import { existsSync, readdirSync, readFileSync } from "node:fs";
import { basename, resolve } from "node:path";
import { transport } from "../config.ts";
import { environmentError, refused, usageError } from "../outcome.ts";
import { gitStartFailure } from "../platform/requirements.ts";
import { hasCode } from "../system-error.ts";
export type GitWorktree = {
	readonly path: string;
	readonly branch?: string;
	readonly detached: boolean;
	readonly locked?: boolean;
};
type GitResult = { readonly stdout: string; readonly stderr: string; readonly status: number };
export function repoRoot(cwd: string): string {
	const result = git(cwd, ["rev-parse", "--show-toplevel"]);
	if (result.status !== 0) {
		if (result.stderr.includes("not a git repository")) {
			throw refused(
				"NOT_A_PROJECT",
				`not inside a Limen project: ${cwd}; run this command from your project repository or Limen workspace.`,
			);
		}
		throw environmentError("GIT_FAILED", result.stderr.trim() || result.stdout.trim() || "git rev-parse failed");
	}
	return result.stdout.trim();
}
export function workspaceRoot(cwd: string): string | undefined {
	const root = resolve(cwd);
	return existsSync(`${root}/.agents/limen`) && !isGitRepository(root) ? root : undefined;
}
export function limenRoot(cwd: string): string {
	const id = transport("LIMEN_GROUP_ID");
	if (id) {
		const root = transport("LIMEN_CONTEXT_ROOT");
		if (!root || !/^[A-Za-z0-9-]+$/.test(id)) {
			throw refused("GROUP_CONTEXT", "group routing context is incomplete");
		}
		const run = JSON.parse(readFileSync(`${root}/.limen/groups/${id}/run.json`, "utf8")) as {
			root: string;
			members: { id: string; team: string }[];
		};
		if (
			run.root !== root ||
			!run.members.some(
				(member) => member.id === transport("LIMEN_JOB_ID") && member.team === transport("LIMEN_TEAM_ID"),
			)
		) {
			throw refused("GROUP_CONTEXT", "group identity does not match the canonical cabinet");
		}
		return root;
	}
	return workspaceRoot(cwd) ?? repoRoot(cwd);
}
export function isGitRepository(cwd: string): boolean {
	return git(cwd, ["rev-parse", "--show-toplevel"]).status === 0;
}
/** The Git folder a primary checkout shares with its worktrees; undefined outside a Git repository. */
export function gitCommonDir(cwd: string): string | undefined {
	const result = git(cwd, ["rev-parse", "--path-format=absolute", "--git-common-dir"]);
	return result.status === 0 ? result.stdout.trim() : undefined;
}
export function workspaceRepository(workspace: string, name: string): string {
	if (!name || basename(name) !== name || name === "." || name === "..") {
		throw usageError("BAD_REPO", "--repo must name one immediate child repository");
	}
	const repository = resolve(workspace, name);
	if (repoRoot(repository) !== repository) {
		throw usageError(
			"BAD_REPO",
			`--repo ${JSON.stringify(name)} must be a Git repository directly below the workspace`,
		);
	}
	return repository;
}
/**
 * The names of the immediate child Git repositories of the workspace at `workspace`, sorted: the places `--repo`
 * accepts (`workspaceRepository`), each a folder with its own `.git` that is the top level of its repository.
 */
export function workspaceRepositories(workspace: string): readonly string[] {
	const root = resolve(workspace);
	return readdirSync(root, { withFileTypes: true })
		.filter((entry) => entry.isDirectory() && existsSync(`${root}/${entry.name}/.git`))
		.map((entry) => entry.name)
		.filter((name) => {
			const top = git(`${root}/${name}`, ["rev-parse", "--show-toplevel"]);
			return top.status === 0 && top.stdout.trim() === `${root}/${name}`;
		})
		.sort();
}
/** Whether `branch` is a name git takes for a branch as it is written (`git check-ref-format --branch`). */
export function isBranchName(cwd: string, branch: string): boolean {
	const result = git(cwd, ["check-ref-format", "--branch", branch]);
	return result.status === 0 && result.stdout.trim() === branch;
}
export function branchExists(cwd: string, branch: string): boolean {
	requireGit(cwd, ["check-ref-format", "--branch", branch]);
	return git(cwd, ["show-ref", "--verify", "--quiet", `refs/heads/${branch}`]).status === 0;
}
/**
 * Branches with commits not in HEAD by ancestry or patch-id (`git cherry` semantics), in four Git
 * processes per repository however many branches. Missing branches are absent: nothing to land.
 * Upstream patches are read from HEAD since the oldest unlanded commit; a cherry-pick is committed later.
 */
export function unlandedBranches(cwd: string, branches: Iterable<string>): ReadonlySet<string> {
	const wanted = new Set(branches);
	const tips = new Map<string, string[]>();
	for (const line of requireGit(cwd, ["for-each-ref", "--format=%(objectname) %(refname)", "refs/heads"]).stdout.split(
		"\n",
	)) {
		const [oid, ref] = [line.slice(0, line.indexOf(" ")), line.slice(line.indexOf(" ") + " refs/heads/".length)];
		if (wanted.has(ref)) {
			tips.set(oid, [...(tips.get(oid) ?? []), ref]);
		}
	}
	if (!tips.size) {
		return new Set();
	}
	const input = `${[...tips.keys()].join("\n")}\n`;
	const graph: CommitGraph = new Map();
	let oldest = Number.POSITIVE_INFINITY;
	for (const line of requireGit(cwd, ["log", "--format=%H %ct %P", "--stdin"], `${input}^HEAD\n`).stdout.split("\n")) {
		const [oid, time, ...parents] = line.split(" ");
		if (!oid || !time) {
			continue;
		}
		graph.set(oid, { parents, merge: parents.length > 1 });
		oldest = Math.min(oldest, Number(time));
	}
	if (!graph.size) {
		return new Set();
	}
	const oneDay = 86_400; // seconds of slack before the oldest unlanded commit
	const patches = requireGit(
		cwd,
		[
			"log",
			"-p",
			"--no-merges",
			"--no-color",
			"--no-ext-diff",
			"--format=commit %H",
			`--since=${oldest - oneDay}`,
			"--stdin",
		],
		`${input}HEAD\n`,
	).stdout;
	const seen = new Set(patches.match(/^commit [0-9a-f]+$/gm)?.map((line) => line.slice("commit ".length)));
	const patchIds = new Map<string, string>();
	for (const line of requireGit(cwd, ["patch-id", "--stable"], patches).stdout.split("\n")) {
		const [patch, oid] = line.split(" ");
		if (patch && oid) {
			patchIds.set(oid, patch);
		}
	}
	const upstream = new Set([...patchIds].filter(([oid]) => !graph.has(oid)).map(([, patch]) => patch));
	const unlanded = new Set<string>();
	for (const [tip, refs] of tips) {
		if (!tipLanded(tip, graph, seen, patchIds, upstream)) {
			for (const ref of refs) {
				unlanded.add(ref);
			}
		}
	}
	return unlanded;
}
type CommitGraph = Map<string, { readonly parents: readonly string[]; readonly merge: boolean }>;
/** Walks the tip's unlanded commits; false at the first non-merge commit whose patch HEAD does not hold. */
function tipLanded(
	tip: string,
	graph: CommitGraph,
	seen: ReadonlySet<string>,
	patchIds: ReadonlyMap<string, string>,
	upstream: ReadonlySet<string>,
): boolean {
	const stack = [tip];
	const visited = new Set<string>();
	while (stack.length) {
		const oid = stack.pop() as string;
		const commit = graph.get(oid);
		if (!commit || visited.has(oid)) {
			continue;
		}
		visited.add(oid);
		stack.push(...commit.parents);
		if (commit.merge) {
			continue;
		}
		// Unseen means the dated walk missed it: stay unlanded. Seen without a patch id is an empty commit.
		const patch = patchIds.get(oid);
		if (!seen.has(oid) || (patch !== undefined && !upstream.has(patch))) {
			return false;
		}
	}
	return true;
}
export function branchCommit(cwd: string, branch: string): string {
	return requireGit(cwd, ["rev-parse", `refs/heads/${branch}`]).stdout.trim();
}
export function commitHasFile(cwd: string, commit: string, path: string): boolean {
	return git(cwd, ["cat-file", "-t", `${commit}:${path}`]).stdout.trim() === "blob";
}
export function listWorktrees(cwd: string): readonly GitWorktree[] {
	const fields = requireGit(cwd, ["worktree", "list", "--porcelain", "-z"]).stdout.split("\0");
	const worktrees: GitWorktree[] = [];
	let path: string | undefined;
	let branch: string | undefined;
	let detached = false;
	let locked = false;
	const finish = () => {
		if (path) {
			worktrees.push({ path, detached, ...(branch ? { branch } : {}), ...(locked ? { locked } : {}) });
		}
		path = undefined;
		branch = undefined;
		detached = false;
		locked = false;
	};
	for (const field of fields) {
		if (field.startsWith("worktree ")) {
			finish();
			path = field.slice("worktree ".length);
		} else if (field.startsWith("branch refs/heads/")) {
			branch = field.slice("branch refs/heads/".length);
		} else if (field === "detached") {
			detached = true;
		} else if (field === "locked" || field.startsWith("locked ")) {
			locked = true;
		}
	}
	finish();
	return worktrees;
}
export function worktreeForBranch(cwd: string, branch: string): GitWorktree | undefined {
	return listWorktrees(cwd).find((worktree) => worktree.branch === branch);
}
/** A worktree at `path` on the new branch `branch`, made at `base`: the commit the job's record names as its base. */
export function addNewWorktree(cwd: string, path: string, branch: string, base: string): void {
	requireGit(cwd, ["worktree", "add", "-b", branch, path, base]);
}
/** The new local branch `branch` at `commit`, with no upstream; an existing branch of that name fails. */
export function createBranch(cwd: string, branch: string, commit: string): void {
	requireGit(cwd, ["branch", "--no-track", "--", branch, commit]);
}
export function addBranchWorktree(cwd: string, path: string, branch: string): void {
	requireGit(cwd, ["worktree", "add", path, branch]);
}
export function addDetachedWorktree(cwd: string, path: string, ref: string): void {
	requireGit(cwd, ["worktree", "add", "--detach", path, ref]);
}
export function pruneWorktrees(cwd: string): void {
	requireGit(cwd, ["worktree", "prune"]);
}
/** Deletes a local branch whatever its merge state; the caller has proven it landed. */
export function deleteBranch(cwd: string, branch: string): void {
	requireGit(cwd, ["branch", "-D", "--", branch]);
}
export function headCommit(cwd: string): string {
	return requireGit(cwd, ["rev-parse", "HEAD"]).stdout.trim();
}
/** A full commit SHA for `ref`: a full SHA as given, or a short SHA, branch, tag or other revision that Git resolves. */
export function resolveCommit(cwd: string, ref: string, option: string): string {
	if (/^[0-9a-f]{40}$/.test(ref)) {
		return ref;
	}
	const result = ref.startsWith("-") ? undefined : git(cwd, ["rev-parse", "--verify", "--quiet", `${ref}^{commit}`]);
	if (result?.status !== 0) {
		throw usageError("BAD_COMMIT", `${option} ${JSON.stringify(ref)} names no commit in ${cwd}`);
	}
	return result.stdout.trim();
}
export const NO_COMMIT = "this repository has no commit yet; commit once, then spawn.";
export function hasCommit(cwd: string): boolean {
	return git(cwd, ["rev-parse", "--verify", "HEAD"]).status === 0;
}
export function spawnBaseCommit(cwd: string): string {
	const result = git(cwd, ["rev-parse", "--verify", "HEAD"]);
	if (result.status === 0) {
		return result.stdout.trim();
	}
	const branch = git(cwd, ["symbolic-ref", "--quiet", "HEAD"]);
	if (branch.status === 0 && git(cwd, ["show-ref", "--verify", "--quiet", branch.stdout.trim()]).status === 1) {
		throw refused("NO_COMMIT", NO_COMMIT);
	}
	throw environmentError("GIT_FAILED", result.stderr.trim() || result.stdout.trim() || "git rev-parse failed");
}
export function currentBranch(cwd: string): string {
	return requireGit(cwd, ["symbolic-ref", "--short", "HEAD"]).stdout.trim();
}
/**
 * Merges `branch` into the checkout. A merge git stops, as on a conflict, is land's refusal (exit 1, as before R-092),
 * with git's own words; land is R-037's, which types it further.
 */
export function mergeBranch(cwd: string, branch: string): string {
	requireGit(cwd, ["check-ref-format", "--branch", branch]);
	const result = git(cwd, ["merge", "--no-edit", branch]);
	if (result.status !== 0) {
		throw refused("MERGE_FAILED", result.stderr.trim() || result.stdout.trim() || "git merge failed");
	}
	return result.stdout.trimEnd();
}
/** Abort a merge that stopped half way; with no merge in progress it does nothing. */
export function abortMerge(cwd: string): void {
	git(cwd, ["merge", "--abort"]);
}
/** The words of a `git status` that lists every uncommitted path, each untracked file on its own, refreshing no index. */
const STATUS = ["--no-optional-locks", "status", "--porcelain", "-z", "--untracked-files=all"] as const;
/** Uncommitted paths, untracked files included; `staged` lists the paths whose change is already in the index. */
export function dirtyPaths(cwd: string): { readonly paths: readonly string[]; readonly staged: readonly string[] } {
	return statusPaths(requireGit(cwd, STATUS).stdout);
}
/**
 * The paths `git status` lists in the worktree at `cwd`, read without refreshing its index (T-04): changes, deletions
 * and untracked files, not ignored ones (A-001). Undefined when no checkout is there: no folder, no `.git`, or one Git
 * does not accept. Any other Git failure is the environment's (exit 4), so work Git cannot read never reads as none;
 * its message names the worktree and `job`, the job that holds it, before Git's own words.
 */
export function worktreeChanges(cwd: string, job: string | undefined): readonly string[] | undefined {
	if (!existsSync(`${cwd}/.git`)) {
		return undefined;
	}
	const result = git(cwd, STATUS);
	if (result.status === 0) {
		return statusPaths(result.stdout).paths;
	}
	if (result.stderr.includes("not a git repository")) {
		return undefined;
	}
	const words = result.stderr.trim() || result.stdout.trim() || "git status failed";
	throw environmentError("GIT_FAILED", `the worktree ${cwd} of job ${job ?? "none"} cannot be read: ${words}`);
}
/**
 * Whether the object store of the repository at `cwd` holds the object `oid` (`git cat-file -e`). Any answer but
 * yes, a missing object or a check that failed, is false, so a caller that keeps what it cannot prove saved fails safe.
 */
export function hasObject(cwd: string, oid: string): boolean {
	return git(cwd, ["cat-file", "-e", oid]).status === 0;
}
/**
 * The first nested repository of the checkout at `cwd` whose commit the object store of `repository` lacks: a gitlink
 * (mode 160000) of its HEAD tree or its index, or the commit a nested `.git` at such a path has checked out. That
 * commit lives only in the nested `.git`, so whatever removes the worktree loses it, however clean `git status` shows
 * it and whether or not its job is resolved (A-001, R-030). Undefined when the store holds every such commit. A commit
 * it cannot check, or a nested `.git` whose HEAD it cannot read, counts as lacking (`hasObject`), so the rule fails safe.
 */
export function unsavedGitlink(cwd: string, repository: string): string | undefined {
	const links = [...gitlinks(cwd, "HEAD"), ...indexGitlinks(cwd)];
	const missing = links.find(([, oid]) => !hasObject(repository, oid));
	if (missing) {
		return missing[0];
	}
	for (const path of new Set(links.map(([path]) => path))) {
		const nested = resolve(cwd, path);
		if (!existsSync(`${nested}/.git`)) {
			continue;
		}
		const head = git(nested, ["rev-parse", "--verify", "HEAD"]);
		if (head.status !== 0 || !hasObject(repository, head.stdout.trim())) {
			return path;
		}
	}
	return undefined;
}
/** The gitlinks of the index of the checkout at `cwd` (`ls-files -s`), each path with the commit it records. */
function indexGitlinks(cwd: string): ReadonlyMap<string, string> {
	const links = new Map<string, string>();
	for (const entry of requireGit(cwd, ["ls-files", "-s", "-z"]).stdout.split("\0")) {
		const [meta = "", path = ""] = entry.split("\t");
		const [mode, oid] = meta.split(" ");
		if (mode === "160000" && oid && path) {
			links.set(path, oid);
		}
	}
	return links;
}
/**
 * The nested repositories that `treeish` records in the checkout at `cwd` (gitlinks, mode 160000), each path with the
 * commit it records: a registered submodule, or a folder with its own `.git` that `add -A` took as one.
 */
export function gitlinks(cwd: string, treeish: string): ReadonlyMap<string, string> {
	const links = new Map<string, string>();
	for (const entry of requireGit(cwd, ["ls-tree", "-r", "-z", treeish]).stdout.split("\0")) {
		const [meta = "", path = ""] = entry.split("\t");
		const [mode, , oid] = meta.split(" ");
		if (mode === "160000" && oid && path) {
			links.set(path, oid);
		}
	}
	return links;
}
/** The paths of the output of `STATUS`, and those whose change is already in the index. */
function statusPaths(stdout: string): { readonly paths: readonly string[]; readonly staged: readonly string[] } {
	const fields = stdout.split("\0");
	const paths: string[] = [];
	const staged: string[] = [];
	for (let index = 0; index < fields.length; index++) {
		const field = fields[index] ?? "";
		if (field.length < 4) {
			continue;
		}
		paths.push(field.slice(3));
		if (field[0] !== " " && field[0] !== "?") {
			staged.push(field.slice(3));
		}
		// A rename or copy names its source path in the next field.
		if ((field[0] === "R" || field[0] === "C") && fields[index + 1]) {
			paths.push(fields[++index] ?? "");
		}
	}
	return { paths, staged };
}
/** Paths that merging `branch` into HEAD changes: every path the branch changed since their merge base. */
export function mergePaths(cwd: string, branch: string): ReadonlySet<string> {
	return new Set(
		requireGit(cwd, ["diff", "--name-only", "-z", "--no-renames", `HEAD...${branch}`])
			.stdout.split("\0")
			.filter(Boolean),
	);
}
export function commitList(cwd: string, base: string, branch: string): string | undefined {
	const result = git(cwd, ["log", "--oneline", `${base}..${branch}`]);
	return result.status === 0 ? result.stdout.trimEnd() : undefined;
}
/** How many commits the branch `branch` holds that HEAD of the checkout at `cwd` does not reach. */
export function commitsOutsideHead(cwd: string, branch: string): number {
	return Number(requireGit(cwd, ["rev-list", "--count", `refs/heads/${branch}`, "^HEAD"]).stdout.trim());
}
/** The branches below `prefix`, such as `limen/abandon/`, each by its name with its short commit, in one Git process. */
export function branchesBelow(cwd: string, prefix: string): ReadonlyMap<string, string> {
	const format = "--format=%(objectname:short) %(refname)";
	const refs = requireGit(cwd, ["for-each-ref", format, `refs/heads/${prefix}`])
		.stdout.split("\n")
		.filter(Boolean);
	return new Map(
		refs.map((line) => [line.slice(line.indexOf(" ") + " refs/heads/".length), line.slice(0, line.indexOf(" "))]),
	);
}
/**
 * Whether a branch, a tag, a stash entry or a reflog entry of the repository at `nested` names a commit that the
 * object store of `repository` lacks: such a commit lives only in that `.git`, so whatever removes the worktree around
 * it loses it (D-088). The commits are checked in one `git cat-file --batch-check` of `repository`, however many the
 * listing names (R-031, review round 1, F10). A listing Git cannot give counts as one, and so does a check that fails
 * or answers for another number of commits, so a caller that keeps the worktree for it fails safe.
 */
export function namesUnsavedCommit(nested: string, repository: string): boolean {
	const listed = git(nested, ["rev-list", "--no-walk", "--branches", "--tags", "--reflog"]);
	if (listed.status !== 0) {
		return true;
	}
	const oids = listed.stdout.split("\n").filter(Boolean);
	if (oids.length === 0) {
		return false;
	}
	const checked = git(repository, ["cat-file", "--batch-check"], `${oids.join("\n")}\n`);
	const answers = checked.stdout.split("\n").filter(Boolean);
	return checked.status !== 0 || answers.length !== oids.length || answers.some((line) => line.endsWith(" missing"));
}
/** Whether the commit `ancestor` is `commit` itself or one of its ancestors (`git merge-base --is-ancestor`). */
export function isAncestor(cwd: string, ancestor: string, commit: string): boolean {
	const result = git(cwd, ["merge-base", "--is-ancestor", ancestor, commit]);
	if (result.status === 0 || result.status === 1) {
		return result.status === 0;
	}
	throw environmentError("GIT_FAILED", result.stderr.trim() || result.stdout.trim() || "git merge-base failed");
}
/** The commit the branch `branch` points at, or undefined when there is no such branch. */
export function branchTip(cwd: string, branch: string): string | undefined {
	const result = git(cwd, ["rev-parse", "--verify", "--quiet", `refs/heads/${branch}^{commit}`]);
	return result.status === 0 ? result.stdout.trim() : undefined;
}
/** The tree of the commit `commit`. */
export function treeOf(cwd: string, commit: string): string {
	return requireGit(cwd, ["rev-parse", "--verify", `${commit}^{tree}`]).stdout.trim();
}
/**
 * The tree of the worktree's whole state: its HEAD with every change, deletion and untracked file in it, ignored files
 * left out (`add -A`). Git writes it through the index file `index`, which the caller makes in a folder of its own, so
 * the worktree's own index stays as it is and no hook runs (A-001).
 */
export function worktreeTree(worktree: string, index: string): string {
	const env = { ...process.env, GIT_INDEX_FILE: index };
	requireGit(worktree, ["read-tree", "HEAD"], undefined, env);
	requireGit(worktree, ["add", "-A"], undefined, env);
	return requireGit(worktree, ["write-tree"], undefined, env).stdout.trim();
}
/** A new commit of `tree` on top of `parent`, with `message` and the repository's configured identity; no hook runs. */
export function commitTree(cwd: string, tree: string, parent: string, message: string): string {
	return requireGit(cwd, ["commit-tree", tree, "-p", parent, "-m", message]).stdout.trim();
}
/** Makes the branch `branch` at `commit` only while no such branch exists, so two writers cannot both make it. */
export function createBranchOnce(cwd: string, branch: string, commit: string): void {
	requireGit(cwd, ["update-ref", `refs/heads/${branch}`, commit, ""]);
}
/**
 * Commits only `paths`, as they are in the working tree, beside whatever else is staged or changed; returns the
 * commit's full SHA and its short form.
 */
export function commitPaths(
	cwd: string,
	paths: readonly string[],
	message: string,
): { readonly sha: string; readonly short: string } {
	requireGit(cwd, ["add", "-A", "--", ...paths]);
	requireGit(cwd, ["commit", "--quiet", "-m", message, "--", ...paths]);
	const sha = requireGit(cwd, ["rev-parse", "HEAD"]).stdout.trim();
	return { sha, short: requireGit(cwd, ["rev-parse", "--short", sha]).stdout.trim() };
}
/** The committer time of the commit `commit`, in seconds since the epoch. */
export function committerTime(cwd: string, commit: string): number {
	return Number(requireGit(cwd, ["log", "-1", "--format=%ct", commit, "--"]).stdout.trim());
}
/**
 * Each commit of the history of HEAD of the checkout at `cwd`, newest first, with its committer time in seconds and
 * its subject; none for a repository with no commit yet.
 */
export function headHistory(
	cwd: string,
): ReadonlyArray<{ readonly sha: string; readonly time: number; readonly subject: string }> {
	if (!hasCommit(cwd)) {
		return [];
	}
	return requireGit(cwd, ["log", "--format=%H %ct %s", "HEAD"])
		.stdout.split("\n")
		.filter(Boolean)
		.map((line) => {
			const [sha = "", time = "", ...subject] = line.split(" ");
			return { sha, time: Number(time), subject: subject.join(" ") };
		});
}
/**
 * A worktree's Git state, read without refreshing its index. `none`: no folder, or a folder that is no Git checkout (no
 * `.git`, or one Git does not accept), so it holds no uncommitted Git work. Any other Git failure reads as dirty.
 */
export function worktreeState(cwd: string): "clean" | "dirty" | "none" {
	if (!existsSync(`${cwd}/.git`)) {
		return "none";
	}
	const result = git(cwd, ["--no-optional-locks", "status", "--porcelain"]);
	if (result.status === 0) {
		return result.stdout.trim() === "" ? "clean" : "dirty";
	}
	return result.stderr.includes("not a git repository") ? "none" : "dirty";
}
export function liveDiffstat(cwd: string, branch: string): string {
	const result = git(cwd, ["diff", "--stat", `HEAD...${branch}`]);
	return result.status === 0 ? result.stdout.trim() : `(unavailable: ${result.stderr.trim() || "git diff failed"})`;
}
/**
 * The output of a git command in `cwd`, trimmed, up to 64 MiB; a failed command throws. The land's ticket check and
 * its test-line cap read the branch's diff and tree through it.
 */
export function gitText(cwd: string, args: readonly string[]): string {
	return execFileSync("git", args, { cwd, encoding: "utf8", maxBuffer: 64 * 1024 * 1024 }).trim();
}
/** A git call that must succeed; its failure is the environment's (T-02, exit 4), with git's own words. */
function requireGit(cwd: string, args: readonly string[], input?: string, env?: NodeJS.ProcessEnv): GitResult {
	const result = git(cwd, args, input, env);
	if (result.status !== 0) {
		throw environmentError("GIT_FAILED", result.stderr.trim() || result.stdout.trim() || `git ${args[0]} failed`);
	}
	return result;
}
let gitBin = "";
function git(cwd: string, args: readonly string[], input?: string, env?: NodeJS.ProcessEnv): GitResult {
	const run = (bin: string) =>
		spawnSync(bin, args, {
			cwd: resolve(cwd),
			encoding: "utf8",
			maxBuffer: Number.POSITIVE_INFINITY,
			...(input === undefined ? {} : { input }),
			...(env === undefined ? {} : { env }),
		});
	const miss = (error: Error | undefined) => hasCode(error, "ENOENT");
	let result = run(gitBin || "git");
	// ENOENT: try the same binary once more before the absolute-path fallback below.
	if (miss(result.error)) {
		result = run(gitBin || "git");
	}
	if (miss(result.error) && !gitBin) {
		const fallback = ["/usr/bin/git", "/usr/local/bin/git"].find((path) => existsSync(path));
		if (fallback) {
			gitBin = fallback;
			result = run(fallback);
		}
	} else if (!gitBin && !result.error) {
		gitBin = "git";
	}
	// A git that cannot start (not found, not executable) is the requirements check's environment failure (T-02: exit code
	// 4); any other spawn error goes up as it is.
	if (result.error) {
		const unstarted = hasCode(result.error, "ENOENT") || hasCode(result.error, "EACCES");
		throw unstarted ? gitStartFailure(result.error) : result.error;
	}
	return { stdout: result.stdout ?? "", stderr: result.stderr ?? "", status: result.status ?? 1 };
}
