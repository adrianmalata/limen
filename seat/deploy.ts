/**
 * Root's deployment of one commit of `adrian-rebuild` to the checkout above this folder, run as
 * `node /opt/limen/seat/deploy.ts <sha>` (D-008, D-010). It checks nothing out until no job runs, the commit is on the
 * branch and the checkout is clean; every failure after the checkout returns the checkout to the previous commit.
 * Its output starts with the registries and projects the running-job check covered (D-045, D-046). When the alerts
 * are installed, the new version writes their units again for the account their service holds (D-085).
 */
import { spawnSync } from "node:child_process";
import { existsSync, realpathSync } from "node:fs";
import { readFile } from "node:fs/promises";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { inspect } from "node:util";
import { oldJobLive, oldLabel } from "../src/job/migration.ts";
import { jobFolderNames, readRecord, unmigratedFolder } from "../src/job/record.ts";
import { startingJob } from "../src/runtime/liveness.ts";
import { holdsProcesses } from "../src/runtime/reap.ts";
import { absent, type ReadLine, readRegistry, registryPaths } from "./registries.ts";
import { counted, printable, reason, requiredText, SeatFailure, type SeatOutcome } from "./tool-outcome.ts";
import { ALERTS_SERVICE, accountName, unitUser } from "./units.ts";

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
	/** The alerts' service as root installed it (D-085); the deployment writes their units again when it exists. */
	readonly alertsService: string;
	/** The new version's step that writes, verifies and loads the alerts' units for `account`, run in the checkout. */
	readonly alertsUnits: (account: string) => Verification;
};
export type DeployOutcome = SeatOutcome;
/** The checkout, the environment of every process the script starts in it, and the command that runs this again. */
type Checkout = { readonly repo: string; readonly env: NodeJS.ProcessEnv; readonly retry: string };
/** The commits before and after, the tag, and the lines that say what became of the alerts' units. */
type Deployed = { readonly sha: string; readonly previous: string; readonly tag: string; readonly alerts: string[] };
type RunningJob = { readonly root: string; readonly id: string; readonly label: string };
type Registry = { readonly path: string; readonly lines: readonly ReadLine[] };
type GitRun = { readonly status: number | null; readonly stdout: string; readonly stderr: string };

/**
 * The verifications at this commit, in order: the seat sweep's user units, rendered by the new checkout's code and
 * verified by `systemd-analyze verify` in a temporary folder, with no write in any home (R-032 (g),
 * seat/sweep-units.ts). R-056 adds the nftables check.
 */
export const VERIFICATIONS: readonly Verification[] = [
	{ name: "sweep units", argv: [process.execPath, join("seat", "sweep-units.ts")], timeoutMs: 60_000 },
];
/** The folder of the system manager's units, where `seat/alerts.ts install` put the alerts' units. */
const SYSTEM_UNITS = "/etc/systemd/system";
const UNITS_STEP_TIMEOUT_MS = 120_000;

/** The deployment's exit code and its text, with every control character escaped; only the entry point sets the code. */
export async function runDeploy(input: DeployInput): Promise<DeployOutcome> {
	const { code, stdout, stderr } = await outcomeOf(input);
	return { code, stdout: printable(stdout, "keep"), stderr: printable(stderr, "keep") };
}

/**
 * Turns the deployment's result or failure into its exit code and text. Once the running-job check has run, stdout
 * starts with its list on success and on every failure, so root sees what the check covered.
 */
async function outcomeOf(input: DeployInput): Promise<DeployOutcome> {
	const checked: string[] = [];
	const text = (lines: readonly string[]) => lines.map((line) => `${line}\n`).join("");
	try {
		const { sha, previous, tag, alerts } = await deploy(input, checked);
		const done = `deployed ${sha} in ${input.repo} (previous ${previous}), tag ${tag}`;
		const next = "next: /reload every coordinator session (adrian-rebuild/plan.md, ## Deployment, step 0.3)";
		return { code: 0, stdout: text([...checked, done, ...alerts, next]), stderr: "" };
	} catch (error) {
		if (error instanceof SeatFailure) {
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
	const account = await alertsAccount(input, retry);
	const previous = headOf(checkout, `check the checkout with git -C ${input.repo} status, then run ${retry}`);
	const { tag, units } = switchTo(input, checkout, sha, previous, account);
	const alerts =
		account === undefined
			? [`alerts: not installed; to install them, as root: ${alertsInstall(input.repo)}`]
			: units.map((line) => `alerts: ${line}`);
	return { sha, previous, tag, alerts };
}

/** Root's command that installs the alerts from the checkout `repo` (D-085, `## Deployment` 3.3). */
const alertsInstall = (repo: string) => `node ${join(repo, "seat", "alerts.ts")} install --account <account>`;

/**
 * The account of the installed alerts, from `User=` of their service (D-085); undefined when they are not installed.
 * A service that names no account is not one the install wrote, so the deployment refuses before the checkout.
 */
async function alertsAccount(input: DeployInput, retry: string): Promise<string | undefined> {
	const service = input.alertsService;
	const text = await optionalText(service, retry);
	if (text === undefined) {
		return undefined;
	}
	const account = unitUser(text);
	if (account === undefined || !accountName(account)) {
		throw new SeatFailure(
			4,
			`${service} names no account in User= of its [Service] section, so the deployment cannot write the alerts' units for it`,
			`as root, install the alerts again (${alertsInstall(input.repo)}), then run ${retry}`,
		);
	}
	return account;
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
	throw new SeatFailure(
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
	const state = ({ root, kind }: ReadLine) => {
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

/** Refuses when no registry holds a project: the running-job check would then have covered nothing (§7 D3, D-046). */
function refuseNoProject(found: readonly Registry[], retry: string): void {
	if (found.some(({ lines }) => lines.some(({ kind }) => kind === "project"))) {
		return;
	}
	const paths = found.map(({ path }) => printable(path, "escape")).join(", ");
	throw new SeatFailure(
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
	throw new SeatFailure(
		1,
		[`refused: ${count}, and a deployment now would mix two versions of Limen in one job:`, ...lines].join("\n"),
		`wait until ${running.length === 1 ? "it ends" : "they end"}, then run the same command again: ${retry}`,
	);
}

/**
 * The registries of every home directory in the password file, each line with its kind (seat/registries.ts). Root
 * reads every file, so a registry or a registered root it cannot read refuses the deployment.
 */
async function registries(passwd: string, retry: string): Promise<readonly Registry[]> {
	const found: Registry[] = [];
	for (const path of registryPaths(await requiredText(passwd, retry))) {
		const read = await readRegistry(path);
		if (read.kind === "closed" || read.kind === "unreadable") {
			throw unreadable(path, read.error, retry);
		}
		if (read.kind === "read") {
			const lines = read.lines.map((line) => {
				if (line.kind === "unreadable") {
					throw unreadable(line.path, line.error, retry);
				}
				return line;
			});
			found.push({ path, lines });
		}
	}
	if (found.length === 0) {
		throw new SeatFailure(
			4,
			`no project registry under any home directory of ${passwd}; the running jobs cannot be checked`,
			`check that the agents' account has its home in ${passwd} and a ~/.limen/projects there, then run ${retry}`,
		);
	}
	return found;
}

/**
 * The jobs of one project that run or start, by their records (src/job/record.ts), a running job whose wrapper died
 * while its scope still holds a process included (R-032 (c)). The job folders come from the record module's listing,
 * as for every other reader (T-25 (1)): a hidden folder is no job, and a project without `.limen/jobs/` has none. A
 * folder an older Limen wrote is read as that Limen read it (src/job/migration.ts), since the migration runs after this
 * deployment (D-057 (1)).
 */
async function runningJobs(root: string, now: number, retry: string): Promise<readonly RunningJob[]> {
	const jobs = join(root, ".limen", "jobs");
	// `limen init` creates `.limen/jobs/`, but a `.limen/` made otherwise may lack it, and then it holds no job. Any other
	// failure, such as a file in its place, stops the deployment, since the check could not see the jobs (z. 10).
	const ids = await jobFolderNames(jobs).catch((error: unknown) => {
		throw unreadable(jobs, error, retry);
	});
	const running: RunningJob[] = [];
	for (const id of ids) {
		const dir = join(jobs, id);
		// A folder without a record is an older one, or one whose spawner an older Limen still sets up.
		const record = unmigratedFolder(dir) ? undefined : await readRecord(dir);
		if (record === undefined) {
			if (await oldJobLive(dir, now)) {
				running.push({ root, id, label: await oldLabel(dir) });
			}
			continue;
		}
		if ((await holdsProcesses(record, now)) || startingJob(record)) {
			running.push({ root, id, label: record.label ?? "" });
		}
	}
	return running;
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

function unreadable(path: string, error: unknown, retry: string): SeatFailure {
	return new SeatFailure(
		4,
		`cannot read ${path}: ${reason(error)}`,
		`make ${path} readable for root, then run ${retry}`,
	);
}

function fetchBranch(checkout: Checkout): void {
	const fetched = ran(checkout, ["fetch", "origin", BRANCH]);
	if (fetched.status !== 0) {
		throw new SeatFailure(
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
	throw new SeatFailure(
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
	throw new SeatFailure(
		1,
		[reason, ...changes].join("\n"),
		`find where the changes come from and make the checkout clean (${look}), then run ${retry}`,
	);
}

/**
 * The checkout, the check of HEAD, the verifications, the alerts' units of the new version for `account` when the
 * alerts are installed, and the tag; any failure returns to `previous` (D-010). The units step runs after every
 * verification, so a commit that fails one leaves the installed units as they were; on a failed `systemd-analyze
 * verify` the step itself puts them back. Its output lines say what became of the units.
 */
function switchTo(
	input: DeployInput,
	checkout: Checkout,
	sha: string,
	previous: string,
	account: string | undefined,
): { readonly tag: string; readonly units: string[] } {
	const next = `fix the cause, then run the same command again: ${checkout.retry}`;
	try {
		gitText(checkout, ["checkout", "--detach", sha], next);
		const head = headOf(checkout, next);
		if (head !== sha) {
			throw new SeatFailure(4, `after git checkout --detach ${sha}, HEAD is ${head}`, next);
		}
		for (const verification of input.verifications) {
			verify(checkout, verification, next);
		}
		const units = account === undefined ? [] : verify(checkout, input.alertsUnits(account), next);
		// The tag comes last, so a failed deployment leaves no tag on a commit that is not deployed.
		const tag = tagName(input.now());
		gitText(checkout, ["tag", tag, sha], next);
		return { tag, units };
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
	if (!(error instanceof SeatFailure)) {
		return new Error(`unexpected failure after the checkout of ${sha}; ${state}`, { cause: error });
	}
	const next = restored
		? error.next
		: `return by hand: git -C ${repo} checkout --detach ${previous}, and check that git -C ${repo} rev-parse HEAD prints it`;
	return new SeatFailure(4, `${error.message}\n${state}`, next);
}

/** Runs one check in the checkout; its stdout lines on success, and on a failure the tail of what it printed. */
function verify(checkout: Checkout, verification: Verification, next: string): string[] {
	const [program, ...args] = verification.argv;
	const result = spawnSync(program, args, {
		cwd: checkout.repo,
		env: checkout.env,
		encoding: "utf8",
		maxBuffer: MAX_OUTPUT_BYTES,
		timeout: verification.timeoutMs,
	});
	if (result.status === 0 && !result.error) {
		return (result.stdout ?? "").split("\n").filter(Boolean);
	}
	const cause = result.error?.message ?? (result.signal ? `ended by ${result.signal}` : `exit ${result.status}`);
	const lines = `${result.stdout ?? ""}${result.stderr ?? ""}`.trim().split("\n").filter(Boolean);
	const shown = lines.length > OUTPUT_TAIL_LINES ? ` (its last ${OUTPUT_TAIL_LINES} of ${lines.length} lines)` : "";
	const output = lines.length > 0 ? `${shown}:\n${lines.slice(-OUTPUT_TAIL_LINES).join("\n")}` : "";
	throw new SeatFailure(4, `verification "${verification.name}" failed (${cause})${output}`, next);
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
		throw new SeatFailure(4, `git ${args.join(" ")} failed in ${checkout.repo}: ${detail(run)}`, next);
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
		throw new SeatFailure(
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
		alertsService: join(SYSTEM_UNITS, ALERTS_SERVICE),
		alertsUnits: (account) => ({
			name: "alerts units",
			argv: [process.execPath, join("seat", "alerts.ts"), "units", "--account", account],
			timeoutMs: UNITS_STEP_TIMEOUT_MS,
		}),
	});
	process.stdout.write(outcome.stdout);
	process.stderr.write(outcome.stderr);
	process.exitCode = outcome.code;
}
