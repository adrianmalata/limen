/**
 * Root's deployment of one commit of `adrian-rebuild` to the checkout above this folder, run as
 * `node /opt/limen/seat/deploy.ts <sha>` (D-008, D-010). It checks nothing out until no job runs, the commit is on the
 * branch and the checkout is clean; every failure after the checkout returns the checkout to the previous commit.
 * Its output starts with the registries and projects the running-job check covered (D-045, D-046).
 */
import { spawnSync } from "node:child_process";
import { existsSync, realpathSync } from "node:fs";
import { readdir, readFile, stat } from "node:fs/promises";
import { dirname, isAbsolute, join } from "node:path";
import { fileURLToPath } from "node:url";
import { inspect } from "node:util";
import { textFile } from "../src/job/record.ts";
import { liveJob, startingJob } from "../src/runtime/reap.ts";

const BRANCH = "adrian-rebuild";
const UPSTREAM = `origin/${BRANCH}`;
const FULL_SHA = /^[0-9a-f]{40}$/;
const MAX_OUTPUT_BYTES = 64 * 1024 * 1024;
const OUTPUT_TAIL_LINES = 20;
/** The variables that point git at another repository, index or namespace than the checkout's own (git(1)). */
const REPOSITORY_LOCATION: ReadonlySet<string> = new Set([
	"GIT_DIR",
	"GIT_WORK_TREE",
	"GIT_INDEX_FILE",
	"GIT_OBJECT_DIRECTORY",
	"GIT_ALTERNATE_OBJECT_DIRECTORIES",
	"GIT_COMMON_DIR",
	"GIT_NAMESPACE",
]);

/** A check of the new checkout. It runs as its own process in the checkout, so it runs the new version's code. */
export type Verification = {
	readonly name: string;
	readonly argv: readonly [string, ...string[]];
	readonly timeoutMs: number;
};
export type DeployInput = {
	/** The command-line arguments; exactly one, the full SHA. */
	readonly args: readonly string[];
	/** The checkout that gets the commit. */
	readonly repo: string;
	/** The password file whose home directories hold the project registries, `<home>/.limen/projects`. */
	readonly passwd: string;
	readonly now: () => number;
	readonly verifications: readonly Verification[];
	/** The environment the script runs in; git and the verifications get it without `REPOSITORY_LOCATION`. */
	readonly env: NodeJS.ProcessEnv;
};
export type DeployOutcome = { readonly code: number; readonly stdout: string; readonly stderr: string };
/** The checkout, the environment of every process the script starts in it, and the command that runs this again. */
type Checkout = { readonly repo: string; readonly env: NodeJS.ProcessEnv; readonly retry: string };
type Deployed = { readonly sha: string; readonly previous: string; readonly tag: string };
type RunningJob = { readonly root: string; readonly id: string; readonly label: string };
/** A registry line: a root that holds `.limen/`, an absolute path that does not, or a line that is not a path. */
type LineKind = "project" | "not a project" | "skipped";
type RegistryLine = { readonly root: string; readonly kind: LineKind };
type Registry = { readonly path: string; readonly lines: readonly RegistryLine[] };
type GitRun = { readonly status: number | null; readonly stdout: string; readonly stderr: string };

/** The verifications at this commit, in order. R-017, R-032 and R-056 add the Pi type contract, units and nftables. */
const VERIFICATIONS: readonly Verification[] = [];

/** A refusal or a failure with its exit class (T-02) and the next command. Seat code gets the shared type with R-059. */
class DeployFailure extends Error {
	readonly exitCode: 1 | 2 | 3 | 4;
	readonly next: string;
	constructor(exitCode: 1 | 2 | 3 | 4, message: string, next: string) {
		super(message);
		this.name = "DeployFailure";
		this.exitCode = exitCode;
		this.next = next;
	}
}

/** The deployment's exit code and its text, with every control character escaped; only the entry point sets the code. */
export async function runDeploy(input: DeployInput): Promise<DeployOutcome> {
	const { code, stdout, stderr } = await outcomeOf(input);
	return { code, stdout: printable(stdout, "keep"), stderr: printable(stderr, "keep") };
}

/**
 * `text` with each control character (C0, DEL, C1) but tab written as `\xNN`, newlines too unless they are kept as
 * line breaks: job folders, the registries and the password file are written by other accounts, and git prints names
 * and messages from the repository, so none of them may send a control sequence to root's terminal.
 */
function printable(text: string, newlines: "keep" | "escape"): string {
	return text.replace(/\p{Cc}/gu, (char) =>
		char === "\t" || (char === "\n" && newlines === "keep")
			? char
			: `\\x${char.charCodeAt(0).toString(16).padStart(2, "0")}`,
	);
}

/**
 * Turns the deployment's result or failure into its exit code and text. Once the running-job check has run, stdout
 * starts with its list on success and on every failure, so root sees what the check covered.
 */
async function outcomeOf(input: DeployInput): Promise<DeployOutcome> {
	const checked: string[] = [];
	const text = (lines: readonly string[]) => lines.map((line) => `${line}\n`).join("");
	try {
		const { sha, previous, tag } = await deploy(input, checked);
		const done = `deployed ${sha} in ${input.repo} (previous ${previous}), tag ${tag}`;
		const next = "next: /reload every coordinator session (adrian-rebuild/plan.md, ## Deployment, step 0.3)";
		return { code: 0, stdout: text([...checked, done, next]), stderr: "" };
	} catch (error) {
		if (error instanceof DeployFailure) {
			return { code: error.exitCode, stdout: text(checked), stderr: `${error.message}\nnext: ${error.next}\n` };
		}
		return { code: 5, stdout: text(checked), stderr: `internal error: ${inspect(error)}\n` };
	}
}

/**
 * The steps in the order of D-008; nothing is checked out until the running jobs, the branch and the checkout pass.
 * `checked` gets the list of what the running-job check covered as soon as the check has run.
 */
async function deploy(input: DeployInput, checked: string[]): Promise<Deployed> {
	const sha = requestedSha(input);
	const retry = command(input.repo, sha);
	const found = await registries(input.passwd, retry);
	const running = await runningByProject(found, input.now(), retry);
	checked.push(...checkedList(found, running));
	refuseNoProject(found, retry);
	refuseRunningJobs([...running.values()].flat(), retry);
	const checkout: Checkout = { repo: input.repo, env: withoutRepositoryLocation(input.env), retry };
	fetchBranch(checkout);
	requireOnBranch(checkout, sha);
	requireClean(checkout);
	const previous = headOf(checkout, `check the checkout with git -C ${input.repo} status, then run ${retry}`);
	const tag = switchTo(input, checkout, sha, previous);
	return { sha, previous, tag };
}

const command = (repo: string, sha: string) => `node ${join(repo, "seat", "deploy.ts")} ${sha}`;

/** Root's environment minus `REPOSITORY_LOCATION`: an exported `GIT_DIR` would move every step to another repository. */
function withoutRepositoryLocation(env: NodeJS.ProcessEnv): NodeJS.ProcessEnv {
	return Object.fromEntries(Object.entries(env).filter(([name]) => !REPOSITORY_LOCATION.has(name)));
}

function requestedSha({ args, repo }: DeployInput): string {
	const [sha] = args;
	if (args.length === 1 && sha !== undefined && FULL_SHA.test(sha)) {
		return sha;
	}
	const given = args.length === 0 ? "no argument" : args.map((arg) => JSON.stringify(arg)).join(" ");
	throw new DeployFailure(
		2,
		`usage: ${command(repo, "<sha>")} takes one argument, the full 40-character commit SHA (given: ${given})`,
		command(repo, "<the full SHA from the stage's gate summary>"),
	);
}

/** The running jobs of each project root, each root once in the order of the registries. */
async function runningByProject(
	found: readonly Registry[],
	now: number,
	retry: string,
): Promise<ReadonlyMap<string, readonly RunningJob[]>> {
	const running = new Map<string, readonly RunningJob[]>();
	for (const { root } of found.flatMap(({ lines }) => lines.filter(({ kind }) => kind === "project"))) {
		if (!running.has(root)) {
			running.set(root, await runningJobs(root, now, retry));
		}
	}
	return running;
}

/**
 * One line per registry and one indented line per registry line. Each path is escaped with its newlines, as the
 * parts of a running-job line are, so a registry cannot forge a line of the list.
 */
function checkedList(found: readonly Registry[], running: ReadonlyMap<string, readonly RunningJob[]>): string[] {
	const state = ({ root, kind }: RegistryLine) => {
		switch (kind) {
			case "project":
				return counted(running.get(root)?.length ?? 0, "running job");
			case "not a project":
				return "not a project (no .limen/)";
			case "skipped":
				return "skipped (not an absolute path)";
		}
	};
	return found.flatMap(({ path, lines }) => {
		const projects = lines.filter(({ kind }) => kind === "project").length;
		return [
			`checked registry ${printable(path, "escape")}: ${counted(projects, "project")}`,
			...lines.map((line) => `  ${printable(line.root, "escape")}: ${state(line)}`),
		];
	});
}

const counted = (count: number, noun: string) => `${count} ${noun}${count === 1 ? "" : "s"}`;

/** Refuses when no registry holds a project: the running-job check would then have covered nothing (§7 D3, D-046). */
function refuseNoProject(found: readonly Registry[], retry: string): void {
	if (found.some(({ lines }) => lines.some(({ kind }) => kind === "project"))) {
		return;
	}
	const paths = found.map(({ path }) => printable(path, "escape")).join(", ");
	throw new DeployFailure(
		4,
		`no registered project: no root in ${paths} holds .limen/, so the running jobs cannot be checked`,
		`check that the agents' account's ~/.limen/projects lists its project roots and that each holds .limen/, then run ${retry}`,
	);
}

/** Refuses while a job of any registered project runs: a job that runs across a checkout runs two versions of Limen. */
function refuseRunningJobs(running: readonly RunningJob[], retry: string): void {
	if (running.length === 0) {
		return;
	}
	// A newline in a folder name or a label would forge a line of the refusal, so each part stays on its job's line.
	const lines = running.map(({ root, id, label }) =>
		[root, id, label]
			.filter(Boolean)
			.map((part) => printable(part, "escape"))
			.join("  "),
	);
	const count = running.length === 1 ? "1 job runs" : `${running.length} jobs run`;
	throw new DeployFailure(
		1,
		[`refused: ${count}, and a deployment now would mix two versions of Limen in one job:`, ...lines].join("\n"),
		`wait until ${running.length === 1 ? "it ends" : "they end"}, then run the same command again: ${retry}`,
	);
}

/**
 * The registries `<home>/.limen/projects` of every home directory in the password file, each line with its kind.
 * `limen init` registers a project in the registry of the account that runs it, and root has no registry of its own.
 */
async function registries(passwd: string, retry: string): Promise<readonly Registry[]> {
	const homes = new Set(
		(await requiredText(passwd, retry))
			.split("\n")
			.map((line) => line.split(":")[5] ?? "")
			.filter((home) => isAbsolute(home)),
	);
	const found: Registry[] = [];
	for (const home of homes) {
		const path = join(home, ".limen", "projects");
		const text = await optionalText(path, retry);
		if (text !== undefined) {
			found.push({ path, lines: await registryLines(text, retry) });
		}
	}
	if (found.length === 0) {
		throw new DeployFailure(
			4,
			`no project registry under any home directory of ${passwd}; the running jobs cannot be checked`,
			`check that the agents' account has its home in ${passwd} and a ~/.limen/projects there, then run ${retry}`,
		);
	}
	return found;
}

/**
 * Each distinct line of a registry with its kind. An empty line holds no root and is left out, as Limen's own reader
 * does (`registeredProjects`); a relative path would resolve against root's working folder, so it is skipped.
 */
async function registryLines(text: string, retry: string): Promise<readonly RegistryLine[]> {
	const lines: RegistryLine[] = [];
	for (const root of new Set(text.split(/\r?\n/).filter(Boolean))) {
		lines.push({ root, kind: isAbsolute(root) ? await rootKind(root, retry) : "skipped" });
	}
	return lines;
}

/** An absolute root is a project when it holds a `.limen/` folder, as `limen init` makes; a missing root holds none. */
async function rootKind(root: string, retry: string): Promise<LineKind> {
	const limen = join(root, ".limen");
	try {
		return (await stat(limen)).isDirectory() ? "project" : "not a project";
	} catch (error) {
		if (absent(error)) {
			return "not a project";
		}
		throw unreadable(limen, error, retry);
	}
}

/** The jobs of one project for which `liveJob` or `startingJob` holds; a project without `.limen/jobs/` has none. */
async function runningJobs(root: string, now: number, retry: string): Promise<readonly RunningJob[]> {
	const jobs = join(root, ".limen", "jobs");
	const running: RunningJob[] = [];
	for (const id of await jobFolders(jobs, retry)) {
		const dir = join(jobs, id);
		if ((await liveJob(dir, now)) || (await startingJob(dir))) {
			running.push({ root, id, label: await textFile(join(dir, "label")) });
		}
	}
	return running;
}

async function jobFolders(jobs: string, retry: string): Promise<readonly string[]> {
	try {
		const entries = await readdir(jobs, { withFileTypes: true });
		return entries.filter((entry) => entry.isDirectory()).map((entry) => entry.name);
	} catch (error) {
		// `limen init` creates `.limen/jobs/`, but a `.limen/` made otherwise may lack it, and then it holds no job.
		if (absent(error)) {
			return [];
		}
		throw unreadable(jobs, error, retry);
	}
}

async function requiredText(path: string, retry: string): Promise<string> {
	try {
		return await readFile(path, "utf8");
	} catch (error) {
		throw unreadable(path, error, retry);
	}
}

/** The file's text, or undefined when the file or a folder on its path does not exist. */
async function optionalText(path: string, retry: string): Promise<string | undefined> {
	try {
		return await readFile(path, "utf8");
	} catch (error) {
		if (absent(error)) {
			return undefined;
		}
		throw unreadable(path, error, retry);
	}
}

function absent(error: unknown): boolean {
	return error instanceof Error && "code" in error && (error.code === "ENOENT" || error.code === "ENOTDIR");
}

function unreadable(path: string, error: unknown, retry: string): DeployFailure {
	const reason = error instanceof Error ? error.message : String(error);
	return new DeployFailure(4, `cannot read ${path}: ${reason}`, `make ${path} readable for root, then run ${retry}`);
}

function fetchBranch(checkout: Checkout): void {
	const fetched = ran(checkout, ["fetch", "origin", BRANCH]);
	if (fetched.status !== 0) {
		throw new DeployFailure(
			3,
			`git fetch origin ${BRANCH} failed in ${checkout.repo}: ${detail(fetched)}`,
			`the usual cause is the network, and the command is safe to run again: ${checkout.retry}`,
		);
	}
}

function requireOnBranch(checkout: Checkout, sha: string): void {
	const ancestor = ran(checkout, ["merge-base", "--is-ancestor", sha, UPSTREAM]);
	if (ancestor.status === 0) {
		return;
	}
	// `--is-ancestor` exits 1 for a commit off the branch, and fails otherwise, as for a commit the checkout lacks.
	const why = ancestor.status === 1 ? "it is not an ancestor of the branch" : `git: ${detail(ancestor)}`;
	throw new DeployFailure(
		1,
		`refused: ${sha} is not a commit of ${UPSTREAM}; ${why}`,
		`deploy a commit of ${BRANCH}: the full SHA from the stage's gate summary`,
	);
}

function requireClean(checkout: Checkout): void {
	const { repo, retry } = checkout;
	const look = `git -C ${repo} status`;
	const changes = gitText(checkout, ["status", "--porcelain"], `check the checkout with ${look}, then run ${retry}`)
		.split("\n")
		.filter(Boolean);
	if (changes.length === 0) {
		return;
	}
	const reason = `refused: the checkout ${repo} has changes, which a deployment would mix with the commit or lose:`;
	throw new DeployFailure(
		1,
		[reason, ...changes].join("\n"),
		`find where the changes come from and make the checkout clean (${look}), then run ${retry}`,
	);
}

/** The checkout, the check of HEAD, the verifications and the tag; any failure returns to `previous` (D-010). */
function switchTo(input: DeployInput, checkout: Checkout, sha: string, previous: string): string {
	const next = `fix the cause, then run the same command again: ${checkout.retry}`;
	try {
		gitText(checkout, ["checkout", "--detach", sha], next);
		const head = headOf(checkout, next);
		if (head !== sha) {
			throw new DeployFailure(4, `after git checkout --detach ${sha}, HEAD is ${head}`, next);
		}
		for (const verification of input.verifications) {
			verify(checkout, verification, next);
		}
		// The tag comes last, so a failed deployment leaves no tag on a commit that is not deployed.
		const tag = tagName(input.now());
		gitText(checkout, ["tag", tag, sha], next);
		return tag;
	} catch (error) {
		throw returned(checkout, sha, previous, error);
	}
}

/** Puts the checkout back at `previous` after `error`; the error it gives names the commit the checkout holds now. */
function returned(checkout: Checkout, sha: string, previous: string, error: unknown): Error {
	const { repo } = checkout;
	const back = git(checkout, ["checkout", "--detach", previous]);
	const head = git(checkout, ["rev-parse", "HEAD"]);
	const holds = head.status === 0 ? head.stdout.trim() : `an unknown commit (${detail(head)})`;
	const restored = back.status === 0 && holds === previous;
	const why = back.status === 0 ? `HEAD is ${holds}` : detail(back);
	const state = restored
		? `the checkout is back at the previous commit ${previous}`
		: `the return to the previous commit ${previous} failed (${why}); the checkout holds ${holds}, and ${sha} is not deployed`;
	if (!(error instanceof DeployFailure)) {
		return new Error(`unexpected failure after the checkout of ${sha}; ${state}`, { cause: error });
	}
	const next = restored
		? error.next
		: `return by hand: git -C ${repo} checkout --detach ${previous}, and check that git -C ${repo} rev-parse HEAD prints it`;
	return new DeployFailure(4, `${error.message}\n${state}`, next);
}

function verify(checkout: Checkout, verification: Verification, next: string): void {
	const [program, ...args] = verification.argv;
	const result = spawnSync(program, args, {
		cwd: checkout.repo,
		env: checkout.env,
		encoding: "utf8",
		maxBuffer: MAX_OUTPUT_BYTES,
		timeout: verification.timeoutMs,
	});
	if (result.status === 0 && !result.error) {
		return;
	}
	const cause = result.error?.message ?? (result.signal ? `ended by ${result.signal}` : `exit ${result.status}`);
	const lines = `${result.stdout ?? ""}${result.stderr ?? ""}`.trim().split("\n").filter(Boolean);
	const shown = lines.length > OUTPUT_TAIL_LINES ? ` (its last ${OUTPUT_TAIL_LINES} of ${lines.length} lines)` : "";
	const output = lines.length > 0 ? `${shown}:\n${lines.slice(-OUTPUT_TAIL_LINES).join("\n")}` : "";
	throw new DeployFailure(4, `verification "${verification.name}" failed (${cause})${output}`, next);
}

/** `deployed-2026-11-19-063000`: the UTC date and time of the deployment; the stage tags stay on the laptop (D-008). */
function tagName(now: number): string {
	const iso = new Date(now).toISOString();
	return `deployed-${iso.slice(0, 10)}-${iso.slice(11, 19).replaceAll(":", "")}`;
}

const headOf = (checkout: Checkout, next: string) => gitText(checkout, ["rev-parse", "HEAD"], next).trim();

function gitText(checkout: Checkout, args: readonly string[], next: string): string {
	const run = ran(checkout, args);
	if (run.status !== 0) {
		throw new DeployFailure(4, `git ${args.join(" ")} failed in ${checkout.repo}: ${detail(run)}`, next);
	}
	return run.stdout;
}

/**
 * Git's run when git ran to an exit status. A git that cannot start, or that a signal ends, says nothing about the
 * network or the commit, so it is an environment failure (T-02: class 4) in every step, `git fetch` included.
 */
function ran(checkout: Checkout, args: readonly string[]): GitRun {
	const run = git(checkout, args);
	if (run.status === null) {
		throw new DeployFailure(
			4,
			`cannot run git in ${checkout.repo} for git ${args.join(" ")}: ${run.stderr}`,
			`check that root's PATH has a working git (command -v git), then run ${checkout.retry}`,
		);
	}
	return run;
}

/** Runs git in the checkout. It never throws, so the return to the previous commit can use it after any failure. */
function git({ repo, env }: Checkout, args: readonly string[]): GitRun {
	const result = spawnSync("git", args, { cwd: repo, env, encoding: "utf8", maxBuffer: MAX_OUTPUT_BYTES });
	if (result.error || result.status === null) {
		return { status: null, stdout: "", stderr: result.error?.message ?? `ended by ${result.signal}` };
	}
	return { status: result.status, stdout: result.stdout, stderr: result.stderr.trim() };
}

const detail = (run: GitRun) => run.stderr || `exit ${run.status}`;

// `import.meta.main` exists only from Node 24.2, and root's Node on the seat is a 24 of unknown minor, where a missed
// entry point would exit 0 having done nothing; so the entry point compares the real path of the script Node started.
const started = process.argv[1];
if (started !== undefined && existsSync(started) && realpathSync(started) === fileURLToPath(import.meta.url)) {
	const outcome = await runDeploy({
		args: process.argv.slice(2),
		repo: dirname(dirname(fileURLToPath(import.meta.url))),
		passwd: "/etc/passwd",
		now: () => Date.now(),
		verifications: VERIFICATIONS,
		env: process.env,
	});
	process.stdout.write(outcome.stdout);
	process.stderr.write(outcome.stderr);
	process.exitCode = outcome.code;
}
