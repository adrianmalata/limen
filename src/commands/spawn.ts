import { spawn } from "node:child_process";
import { existsSync, readFileSync } from "node:fs";
import { mkdir, readdir, readFile, writeFile } from "node:fs/promises";
import { basename, dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import type { TransportName } from "../config.ts";
import { herdrBinary, openWatchTab } from "../integrations/herdr.ts";
import type { GroupMember, GroupRun } from "../job/group-cabinet.ts";
import { claimMember, groupIdentity, groupLock, groupPath, teamRoute } from "../job/group-cabinet.ts";
import { syncLifecycle } from "../job/group-events.ts";
import { memberPacket, routeFlags } from "../job/group-packet.ts";
import { makeJobId, parseDuration, SESSION_ID } from "../job/job.ts";
import { publishJob } from "../job/publication.ts";
import { atomicWrite, finalizeJob } from "../job/record.ts";
import { type NameSource, refuseRemovedRole } from "../old-names.ts";
import { JOB_STARTED, type Success } from "../outcome.ts";
import type { Parsed } from "../parser.ts";
import {
	addBranchWorktree,
	addDetachedWorktree,
	addNewWorktree,
	branchCommit,
	branchExists,
	commitHasFile,
	repoRoot,
	resolveCommit,
	spawnBaseCommit,
	workspaceRepository,
	workspaceRoot,
	worktreeForBranch,
} from "../project/git.ts";
import { inheritedPlanning, ticketPointers } from "../project/planning.ts";
import { signalProcessGroup, waitForProcessGroup } from "../runtime/contain.ts";
import { type EngineProfile, preflightEngine, resolveSpawnEngine } from "../runtime/engine.ts";
import { liveJob } from "../runtime/reap.ts";
import { DEFAULT_PRIORITY, parsePriority, queuedLine } from "../runtime/start-queue.ts";
import { normalizeWorkerExtensions } from "../runtime/worker-extensions.ts";
import { launchWrapper } from "../runtime/wrapper.ts";
import { hunkBinary } from "./diff.ts";

/**
 * A spawn as its flags give it, before any check: the handler reads it from the command line, and keeper, group start
 * and the GitHub jobs build it themselves (T-26). The four route fields are required (D-043).
 */
export type SpawnRequest = {
	readonly task: readonly string[];
	readonly engine: string;
	readonly provider: string;
	readonly model: string;
	readonly thinking: string;
	readonly label?: string | undefined;
	readonly branch?: string | undefined;
	readonly repo?: string | undefined;
	readonly role?: string | undefined;
	readonly review?: boolean | undefined;
	readonly base?: string | undefined;
	readonly head?: string | undefined;
	readonly timeout?: string | undefined;
	readonly taskFile?: string | undefined;
	readonly prepare?: string | undefined;
	readonly priority?: string | undefined;
	readonly extensions?: readonly string[] | undefined;
};
type SpawnOptions = {
	task: string;
	taskFile?: string;
	label?: string;
	branch?: string;
	base?: string;
	head?: string;
	repo?: string;
	engine: string;
	model: string;
	provider: string;
	thinking: string;
	timeoutMs?: number;
	prepare?: string;
	priority?: number;
	review: boolean;
	role?: string;
	extensions: string[];
};
const PACKAGE_ROOT = fileURLToPath(new URL("../..", import.meta.url));
/**
 * The project's own `.agents/limen/<role>.md`, else the package's template. With neither, a role a cut removed refuses
 * with its line from `src/old-names.ts`, by `source`: spawn's `--role`, or continue's parent record. Spawn and continue
 * call this before the job id and the job folder.
 */
export function resolvePreamble(root: string, role: string, source: NameSource = "argument"): string {
	const places = [`${root}/.agents/limen/${role}.md`, resolve(PACKAGE_ROOT, "templates", `${role}.md`)];
	for (const path of places) {
		if (existsSync(path)) {
			return path;
		}
	}
	refuseRemovedRole(role, source);
	throw new Error(
		`no preamble for role ${role} in ${places.join(" or ")}; write .agents/limen/${role}.md to add the role`,
	);
}
type WorktreePlan =
	| { readonly kind: "detach"; readonly path: string; readonly ref: string }
	| { readonly kind: "reuse"; readonly path: string; readonly branch: string }
	| { readonly kind: "add-branch"; readonly path: string; readonly branch: string }
	| { readonly kind: "add-new"; readonly path: string; readonly branch: string };
const HANDSHAKE_POLL_MS = 20;
/** How long spawn and continue wait for the wrapper's handshake; a constant, as no setting chooses it (R-015). */
const HANDSHAKE_MS = 10_000;
/** `limen spawn`: starts one job from the command line. */
export function spawnCommand(values: Parsed, cwd: string): Promise<Success> {
	return startSpawn(
		{
			task: values.list("task"),
			engine: values.get("engine") ?? "",
			provider: values.get("provider") ?? "",
			model: values.get("model") ?? "",
			thinking: values.get("thinking") ?? "",
			label: values.get("label"),
			branch: values.get("branch"),
			repo: values.get("repo"),
			role: values.get("role"),
			review: values.has("review"),
			base: values.get("base"),
			head: values.get("head"),
			timeout: values.get("timeout"),
			taskFile: values.get("task-file"),
			prepare: values.get("prepare"),
			priority: values.get("priority"),
			extensions: values.list("extension"),
		},
		cwd,
	);
}
/** Starts one job; its success names the job in `ids.job` (D-022). A group's in-process launch ignores the result. */
export async function startSpawn(
	request: SpawnRequest,
	cwd: string,
	coordinator?: { run: GroupRun; team: string },
): Promise<Success> {
	const identity = coordinator ? undefined : await groupIdentity(cwd);
	const group = coordinator
		? { run: coordinator.run, team: coordinator.team, role: "coordinator" as const }
		: identity?.member
			? { run: identity.run, team: identity.member.team, role: "worker" as const }
			: undefined;
	if (identity?.member?.role === "worker") {
		throw new Error("group workers cannot launch jobs; ask their team coordinator");
	}
	const id = group
		? await groupLock(`${groupPath(group.run)}/launch`, () => spawnJob(request, cwd, group), "wait")
		: await spawnJob(request, cwd);
	return { next: JOB_STARTED, ids: { job: id } };
}
type SpawnGroup = { run: GroupRun; team: string; role: "coordinator" | "worker" };
type SpawnTask = { text: string; bytes: Buffer; raw: boolean };
/** Where the job is recorded and which repository its worktree comes from. */
type SpawnPlace = {
	readonly workspace: string | undefined;
	readonly currentRoot: string;
	readonly root: string;
	readonly repository: string;
	readonly repo: string | undefined;
};
/** What the checks decided before any job record exists. */
type SpawnLaunch = {
	readonly cwd: string;
	readonly options: SpawnOptions & { readonly task: string; readonly label: string };
	readonly loaded: SpawnTask;
	readonly group: SpawnGroup | undefined;
	readonly profile: EngineProfile;
	readonly model: string | undefined;
	readonly extensions: readonly string[];
	readonly notificationSession: string | undefined;
	readonly coordinatorTab: string | undefined;
	readonly coordinatorPane: string | undefined;
	readonly place: SpawnPlace;
	readonly task: string;
};
type SpawnRecord = {
	readonly jobDir: string;
	readonly id: string;
	readonly taskBody: string | Uint8Array;
	readonly branch: string;
	readonly worktree: string;
	readonly base: string;
	readonly role: string;
	readonly member: GroupMember | undefined;
	readonly candidate: string | undefined;
};
/** A recorded job with its worktree, ready to start as a detached wrapper. */
type SpawnedJob = {
	readonly jobDir: string;
	readonly id: string;
	readonly root: string;
	readonly worktree: string;
	readonly preamble: string;
	readonly role: string;
	readonly memberDeadline: number | undefined;
	/** What the wrapper runs after its handshake: prune keeping the spawner's checkout, then --prepare. */
	readonly setup: { readonly LIMEN_SETUP_KEEP: string; readonly LIMEN_SETUP_PREPARE: string };
};
/** Checks, records and starts the job; returns its id. */
async function spawnJob(request: SpawnRequest, cwd: string, group?: SpawnGroup): Promise<string> {
	const parsed = spawnOptions(request);
	const profile = resolveSpawnEngine(parsed.engine);
	await checkLaunchAuthority(parsed, group);
	const loaded = await readSpawnTask(parsed.task, parsed.taskFile, cwd);
	const options = {
		...parsed,
		task: loaded.text,
		label: parsed.label ?? (loaded.text.trim().split(/\r?\n/, 1)[0]?.trim().slice(0, 80) || "job"),
	};
	const model = options.model;
	const extensions = await launchExtensions(group, options.extensions, cwd);
	preflightEngine(profile, model, options.provider);
	const notificationSession = currentNotificationSession();
	const coordinatorTab = process.env.HERDR_TAB_ID?.trim();
	// A group member never subscribes a session, so its pane stays recorded even under Pi: it is the lead's route when the group hook is not running.
	const coordinatorPane = herdrWakePane(group ? undefined : notificationSession);
	const place = resolveSpawnPlace(cwd, group, options.repo);
	const task = spawnTaskText(loaded, options.repo, place);
	return recordSpawnedJob({
		cwd,
		options,
		loaded,
		group,
		profile,
		model,
		extensions,
		notificationSession,
		coordinatorTab,
		coordinatorPane,
		place,
		task,
	});
}
/** Outside a group no job may claim the owner-facing lead; a group launch keeps its recorded route and branches. */
async function checkLaunchAuthority(parsed: SpawnOptions, group: SpawnGroup | undefined): Promise<void> {
	if (!group) {
		const roleClaim = claimsOwnerFacingLead(parsed.role);
		if (roleClaim) {
			throw new Error(roleClaim);
		}
		return;
	}
	const run = group.run;
	const route = teamRoute(run, group.team);
	if (
		parsed.engine !== route.engine ||
		parsed.provider !== route.provider ||
		parsed.model !== route.model ||
		parsed.thinking !== route.thinking
	) {
		throw new Error(`group launches require the team route explicitly: ${routeFlags(route)}`);
	}
	if (
		parsed.repo ||
		(parsed.branch && !parsed.review) ||
		(parsed.role && parsed.role !== group.role) ||
		parsed.timeoutMs
	) {
		throw new Error(
			"group launches use isolated new branches, recorded roles and deadlines; omit --repo, ordinary --branch and --timeout",
		);
	}
	if (parsed.review) {
		const teamBranches = await Promise.all(
			run.members
				.filter((member) => member.team === group.team)
				.map((member) => text(`${run.root}/.limen/jobs/${member.id}/branch`)),
		);
		if (!teamBranches.includes(parsed.branch ?? "")) {
			throw new Error("group review requires a candidate branch owned by this team");
		}
	}
}
/** A group launch takes its team's recorded extensions; --extension must then name the same ones. */
async function launchExtensions(
	group: SpawnGroup | undefined,
	requested: readonly string[],
	cwd: string,
): Promise<string[]> {
	const recorded = group?.run.teamExtensions?.[group.team];
	const extensions = await normalizeWorkerExtensions(recorded ?? requested, cwd);
	if (
		recorded &&
		requested.length &&
		JSON.stringify(await normalizeWorkerExtensions(requested, cwd)) !== JSON.stringify(extensions)
	) {
		throw new Error("group launches require the recorded team extensions; omit --extension to inherit them");
	}
	return extensions;
}
function resolveSpawnPlace(cwd: string, group: SpawnGroup | undefined, repoFlag: string | undefined): SpawnPlace {
	const workspace = group ? undefined : workspaceRoot(cwd);
	const currentRoot = workspace ?? repoRoot(cwd);
	// A job that spawns from its own worktree keeps its canonical root and repository.
	const inherited = group || workspace ? undefined : inheritedPlanning(currentRoot);
	const root = group?.run.root ?? inherited?.root ?? currentRoot;
	if (workspace && !repoFlag) {
		throw new Error("workspace spawn requires --repo <immediate-child>");
	}
	if (!workspace && repoFlag) {
		throw new Error("--repo is available only from a non-Git workspace coordinator");
	}
	let repository = currentRoot;
	if (workspace) {
		repository = workspaceRepository(root, repoFlag ?? "");
	} else if (group) {
		repository = root;
	}
	return { workspace, currentRoot, root, repository, repo: repoFlag ?? inherited?.repo };
}
function spawnTaskText(loaded: SpawnTask, repoFlag: string | undefined, place: SpawnPlace): string {
	if (!loaded.raw && place.workspace) {
		return workspaceTask(loaded.text, place.root, repoFlag ?? "");
	}
	return loaded.text;
}
/** Plans the worktree, claims the member slot, writes the job record and prints its ID, then creates the worktree and starts the job; returns the ID. */
async function recordSpawnedJob(launch: SpawnLaunch): Promise<string> {
	const { options, group, place, task } = launch;
	const { root, repository } = place;
	const role = options.review ? "reviewer" : (group?.role ?? options.role ?? "worker");
	const pinnedBase = options.base ? resolveCommit(repository, options.base, "--base") : undefined;
	const pinnedHead = options.head ? resolveCommit(repository, options.head, "--head") : undefined;
	const preamble = resolvePreamble(root, role, "argument");
	const id = makeJobId(options.label);
	const jobsRoot = `${root}/.limen/jobs`;
	await mkdir(jobsRoot, { recursive: true });
	const branch = options.branch ?? `limen/${id}`;
	const worktreeRoot = `${dirname(repository)}/.${basename(repository)}-limen-worktrees`;
	const requestedPath = `${worktreeRoot}/${id}`;
	await mkdir(worktreeRoot, { recursive: true });
	const plan = await planWorktree({
		root: repository,
		requestedPath,
		branch,
		review: options.review,
		jobsRoot,
		...(place.repo ? { repo: place.repo } : {}),
		...(options.branch ? { requestedBranch: options.branch } : {}),
	});
	if (pinnedHead && branchCommit(repository, branch) !== pinnedHead) {
		throw new Error(`pinned review head moved before spawn: ${branch} is not at ${pinnedHead}`);
	}
	const baseCommit = plan.kind === "add-new" ? spawnBaseCommit(repository) : branchCommit(repository, branch);
	assertTicketsAtBase(repository, baseCommit, task);
	const member = group ? await claimMember(group.run, group.team, group.role, id) : undefined;
	await noteRunningJobs(jobsRoot, options.label);
	const jobDir = `${jobsRoot}/${id}`;
	const candidate = options.review ? branchCommit(repository, branch) : undefined;
	const base = pinnedBase ?? baseCommit;
	const taskBody = await jobTaskBody(launch, candidate, member);
	await publishSpawnedJob(launch, { jobDir, id, taskBody, branch, worktree: plan.path, base, role, member, candidate });
	// The ID prints once the record exists, so a caller killed during the rest still names its job.
	console.log(id);
	try {
		const worktree = executeWorktree(place.repository, plan);
		const setup = {
			LIMEN_SETUP_KEEP: place.currentRoot,
			LIMEN_SETUP_PREPARE: options.prepare ?? "",
		};
		const memberDeadline = member?.deadline;
		await launchSpawnedJob(launch, { jobDir, id, root, worktree, preamble, role, memberDeadline, setup });
	} catch (error) {
		await finalizeJob(jobDir, "failed", `${group ? "group launch" : "spawn"} failed: ${String(error)}`);
		throw error;
	}
	return id;
}
function assertTicketsAtBase(repository: string, baseCommit: string, task: string): void {
	for (const { path } of ticketPointers(task)) {
		if (path.startsWith("spec/") && !commitHasFile(repository, baseCommit, path)) {
			throw new Error(`ticket ${path} is missing from the base commit`);
		}
	}
}
/** Says how many jobs already run, and warns about a bare feature-number label or a label a live job holds. */
async function noteRunningJobs(jobsRoot: string, label: string): Promise<void> {
	let running = 0;
	let held = false;
	for (const entry of await readdir(jobsRoot, { withFileTypes: true })) {
		if (!entry.isDirectory() || !(await liveJob(`${jobsRoot}/${entry.name}`))) {
			continue;
		}
		running += 1;
		if ((await text(`${jobsRoot}/${entry.name}/label`)) === label) {
			held = true;
		}
	}
	if (running > 0) {
		console.log(`note: ${running} job${running === 1 ? "" : "s"} already running; starting another`);
	}
	if (/^F\d{3,}$/i.test(label)) {
		console.log("warning: label is only a feature number");
	}
	if (held) {
		console.log("warning: a live job already holds this label");
	}
}
async function jobTaskBody(
	launch: SpawnLaunch,
	candidate: string | undefined,
	member: GroupMember | undefined,
): Promise<string | Uint8Array> {
	const { task, loaded, group } = launch;
	let taskBody: string | Uint8Array = `${task.trim()}\n`;
	if (loaded.raw) {
		taskBody = loaded.bytes;
	} else if (candidate) {
		taskBody = `${task.trim()}\n\nCandidate commit: ${candidate}.\n`;
	}
	if (group && member) {
		taskBody = `${await memberPacket(group.run, group.team, member)}\n\n${taskBody}`;
	}
	return taskBody;
}
async function publishSpawnedJob(launch: SpawnLaunch, record: SpawnRecord): Promise<void> {
	const { group, place, notificationSession, coordinatorTab, coordinatorPane } = launch;
	const { member, candidate } = record;
	await publishJob(record.jobDir, {
		task: record.taskBody,
		label: launch.options.label,
		branch: record.branch,
		worktree: record.worktree,
		base: record.base,
		role: record.role,
		engine: launch.profile.id,
		priority: launch.options.priority ?? DEFAULT_PRIORITY,
		...(launch.model ? { model: launch.model } : {}),
		extensions: launch.extensions,
		...(place.repo ? { repo: place.repo } : {}),
		...(!group && notificationSession ? { notificationSession } : {}),
		...(coordinatorTab ? { originTab: coordinatorTab } : {}),
		...(coordinatorPane ? { originPane: coordinatorPane } : {}),
		...(group && member ? { group: { id: group.run.id, team: group.team, deadline: member.deadline } } : {}),
		...(candidate ? { candidate } : {}),
	});
}
/** Marks the job running, then starts it as a detached wrapper. */
async function launchSpawnedJob(launch: SpawnLaunch, job: SpawnedJob): Promise<void> {
	const versions = capturedVersions(launch.profile).then((text) =>
		writeFile(`${job.jobDir}/versions`, text, { flag: "wx", flush: true }),
	);
	await atomicWrite(`${job.jobDir}/state`, "running\n");
	if (launch.group) {
		await syncLifecycle(launch.group.run, "skip");
	}
	await startDetachedJob(launch, job, versions);
}
async function startDetachedJob(launch: SpawnLaunch, job: SpawnedJob, versions: Promise<void>): Promise<void> {
	const { options, model, group } = launch;
	const { jobDir, id, root } = job;
	await openWatchTab({ jobDir, label: options.label, cwd: root, logPath: `${jobDir}/log`, role: job.role });
	const environment: Partial<Record<TransportName, string>> = {
		LIMEN_JOB_DIR: jobDir,
		LIMEN_WORKTREE: job.worktree,
		LIMEN_TASK_FILE: `${jobDir}/task.md`,
		LIMEN_PREAMBLE: job.preamble,
		LIMEN_JOB_ID: id,
		LIMEN_LABEL: options.label,
		LIMEN_CONTEXT_ROOT: root,
		...job.setup,
	};
	if (group) {
		environment.LIMEN_GROUP_ID = group.run.id;
		environment.LIMEN_TEAM_ID = group.team;
		environment.LIMEN_TIMEOUT_MS = String(Math.max(1, (job.memberDeadline ?? group.run.deadline) - Date.now()));
	}
	environment.LIMEN_PROVIDER = options.provider ?? "";
	environment.LIMEN_THINKING = options.thinking ?? "";
	if (model) {
		environment.LIMEN_MODEL = model;
	}
	if (options.timeoutMs) {
		environment.LIMEN_TIMEOUT_MS = String(options.timeoutMs);
	}
	let wrapperPid: number;
	try {
		wrapperPid = await launchWrapper(environment);
	} catch (error) {
		const message = error instanceof Error ? error.message : String(error);
		await versions.catch(() => {});
		await finalizeJob(jobDir, "failed", `failed to launch wrapper: ${message}`);
		throw error;
	}
	await waitForHandshake(jobDir, wrapperPid);
	const queued = await queuedLine(jobDir, options.label);
	const state = await text(`${jobDir}/state`);
	if (state !== "running") {
		const detail = await lastLimenDetail(jobDir);
		await versions.catch(() => {});
		console.log(detail ? `${state} ${options.label}\n${detail}` : `${state} ${options.label}`);
		console.log(id);
		return;
	}
	await versions.catch(() => {});
	console.log(queued ?? `started ${options.label}`);
	console.log(id);
}
async function planWorktree(input: {
	readonly root: string;
	readonly requestedPath: string;
	readonly branch: string;
	readonly review: boolean;
	readonly requestedBranch?: string;
	readonly repo?: string;
	readonly jobsRoot: string;
}): Promise<WorktreePlan> {
	const { root, requestedPath: path, branch } = input;
	if (input.review) {
		if (!input.requestedBranch) {
			throw new Error("--review requires --branch <candidate-branch>");
		}
		if (!branchExists(root, branch)) {
			throw new Error(`candidate branch ${branch} does not exist`);
		}
		return { kind: "detach", path, ref: branch };
	}
	if (!branchExists(root, branch)) {
		return { kind: "add-new", path, branch };
	}
	const existing = worktreeForBranch(root, branch);
	if (existing && resolve(existing.path) === resolve(root)) {
		throw new Error(
			`branch ${branch} is checked out in the primary worktree, so the job cannot get its own worktree; switch the primary worktree to another branch, or omit --branch`,
		);
	}
	if (await liveJobUsesBranch(input.jobsRoot, branch, input.repo)) {
		throw new Error(`branch ${branch} already has a live job`);
	}
	return existing ? { kind: "reuse", path: existing.path, branch } : { kind: "add-branch", path, branch };
}
function executeWorktree(root: string, plan: WorktreePlan): string {
	if (plan.kind === "detach") {
		addDetachedWorktree(root, plan.path, plan.ref);
	}
	// A prune that decided before this job's record was published may have taken the reused worktree; restore it.
	if (plan.kind === "add-branch" || (plan.kind === "reuse" && !existsSync(plan.path))) {
		addBranchWorktree(root, plan.path, plan.branch);
	}
	if (plan.kind === "add-new") {
		addNewWorktree(root, plan.path, plan.branch);
	}
	return plan.path;
}
function claimsOwnerFacingLead(role: string | undefined): string | undefined {
	if (role === "coordinator" || role === "lead") {
		return "refusing spawn --role coordinator/lead: managed team coordinators come only from limen group start; the owner-facing lead is the interactive Herdr coordinator pane (LIMEN_COORDINATOR=1) with hook/group-peer.ts loaded (export LIMEN_PACKAGE to a package that ships group-peer, then reload that pane) — never limen spawn a substitute lead job";
	}
}

/** The checked options of a spawn; a value that does not hold refuses before any job record exists. */
function spawnOptions(request: SpawnRequest): SpawnOptions {
	const role = request.role?.trim();
	if (role !== undefined && !/^[a-z][a-z0-9-]*$/.test(role)) {
		throw new Error("--role must be a lowercase name");
	}
	const timeoutMs = request.timeout === undefined ? undefined : parseDuration(request.timeout);
	const priority = parsePriority(request.priority);
	if (request.review && role) {
		throw new Error("--role and --review cannot be combined");
	}
	// Every `--` and every empty word is dropped from the task.
	const task = request.task.filter((word) => word !== "" && word !== "--");
	const label = spawnLabel(request, task);
	const out: SpawnOptions = {
		task: request.taskFile ? "" : task.join(" "),
		extensions: [...(request.extensions ?? [])],
		review: request.review ?? false,
		engine: request.engine.trim(),
		model: request.model,
		provider: request.provider,
		thinking: request.thinking,
		...(role ? { role } : {}),
		...(label ? { label } : {}),
		...(request.taskFile ? { taskFile: request.taskFile } : {}),
		...(timeoutMs ? { timeoutMs } : {}),
		...(priority ? { priority } : {}),
	};
	for (const key of ["prepare", "branch", "base", "head", "repo"] as const) {
		const value = request[key];
		if (value) {
			out[key] = value;
		}
	}
	return out;
}
/** Check the task against its flags; the label, which positional words give with --task-file. */
function spawnLabel(values: SpawnRequest, task: readonly string[]): string | undefined {
	if ((values.base || values.head) && !values.review) {
		throw new Error("--base and --head require --review");
	}
	const label = values.label === undefined ? undefined : normalizeLabel(values.label);
	// With --task-file the file is the task, so positional words can only be its title.
	if (values.taskFile && task.length) {
		if (label) {
			throw new Error("with --task-file, give the title positionally or as --label, not both");
		}
		return normalizeLabel(task.join(" "));
	}
	if (!values.taskFile && !task.join(" ").trim()) {
		throw new Error("spawn requires task text");
	}
	return label;
}
async function readSpawnTask(
	task: string,
	taskFile: string | undefined,
	cwd: string,
): Promise<{ text: string; bytes: Buffer; raw: boolean }> {
	const source = taskFile ?? (task === "-" ? "-" : undefined);
	if (!source) {
		if (/``| {2}/.test(task)) {
			console.log("warning: empty backticks or doubled spaces in the task; single-quote it or pass --task-file");
		}
		return { text: task, bytes: Buffer.from(task), raw: false };
	}
	const bytes = source === "-" ? readFileSync(0) : await readFile(resolve(cwd, source));
	const text = bytes.toString("utf8");
	if (!text.trim()) {
		throw new Error("spawn requires task text");
	}
	return { text, bytes, raw: true };
}
function probeVersion(command: string): Promise<string> {
	return new Promise((resolve) => {
		const child = spawn(command, ["--version"], { stdio: ["ignore", "pipe", "ignore"] });
		let out = "";
		const timer = setTimeout(() => child.kill("SIGKILL"), 1_000);
		const done = (value: string) => {
			clearTimeout(timer);
			resolve(value);
		};
		child.stdout?.on("data", (chunk: Buffer | string) => (out += chunk));
		child
			.once("error", () => done(""))
			.once("close", (code) => done(code === 0 ? (out.trim().split("\n")[0] ?? "") : ""));
	});
}
export async function capturedVersions(profile: EngineProfile): Promise<string> {
	const herdr = herdrBinary();
	const hunk = hunkBinary();
	const version = (await probeVersion(profile.binary)) || "unavailable";
	const herdrVersion = herdr && (await probeVersion(herdr));
	const hunkVersion = hunk && (await probeVersion(hunk));
	return `${profile.id} ${version}\n${herdrVersion ? `herdr ${herdrVersion}\n` : ""}${hunkVersion ? `hunk ${hunkVersion}\n` : ""}`;
}
function workspaceTask(task: string, root: string, repo: string): string {
	let rewritten = task;
	for (const { pointer, path } of ticketPointers(task)) {
		if (path.startsWith("spec/")) {
			rewritten = rewritten.replace(pointer, pointer.replace(path, `${root}/${path}`));
		}
	}
	return `Repository: ${repo}. Work only in this repository.\n\n${rewritten}`;
}
export function normalizeLabel(value: string): string {
	const label = value.trim();
	if (!label || /[\r\n]/.test(label)) {
		throw new Error("--label must be one non-empty line");
	}
	return label;
}
export function currentNotificationSession(): string | undefined {
	const value = process.env.PI_SESSION_ID?.trim();
	if (value && !SESSION_ID.test(value)) {
		throw new Error("PI_SESSION_ID is not safe for notification routing");
	}
	return value || undefined;
}
/**
 * A Herdr coordinator without a Pi session (`PI_SESSION_ID` unset in its commands) has no session to subscribe, so it
 * is woken on its pane. `limen watch` and `steer --running` use the same route through `origin-pane`.
 */
export function herdrWakePane(notificationSession: string | undefined): string | undefined {
	const pane = process.env.HERDR_PANE_ID?.trim();
	if (notificationSession || process.env.HERDR_ENV !== "1" || !pane) {
		return undefined;
	}
	if (!/^[A-Za-z0-9][A-Za-z0-9._:-]{0,127}$/.test(pane)) {
		throw new Error("HERDR_PANE_ID is not safe for wake routing");
	}
	return pane;
}
async function liveJobUsesBranch(jobsRoot: string, branch: string, repo?: string): Promise<boolean> {
	for (const entry of await readdir(jobsRoot, { withFileTypes: true })) {
		const jobDir = `${jobsRoot}/${entry.name}`;
		if (
			entry.isDirectory() &&
			(await text(`${jobDir}/branch`)) === branch &&
			(!repo || (await text(`${jobDir}/repo`)) === repo) &&
			(await liveJob(jobDir))
		) {
			return true;
		}
	}
	return false;
}
async function lastLimenDetail(jobDir: string): Promise<string> {
	const line = (await text(`${jobDir}/log`)).split("\n").findLast((entry) => entry.startsWith("[limen ")) ?? "";
	const close = line.indexOf("] ");
	return close === -1 ? line : line.slice(close + 2);
}
const text = async (path: string): Promise<string> => (await readFile(path, "utf8").catch(() => "")).trim();
export async function waitForHandshake(jobDir: string, wrapperPid: number): Promise<void> {
	const deadline = Date.now() + HANDSHAKE_MS;
	while (Date.now() < deadline) {
		if ((await text(`${jobDir}/state`)) !== "running" || (await text(`${jobDir}/pid`))) {
			return;
		}
		await new Promise((resolve) => setTimeout(resolve, HANDSHAKE_POLL_MS));
	}
	signalProcessGroup(wrapperPid, "SIGTERM");
	if (!(await waitForProcessGroup(wrapperPid, 1_000))) {
		signalProcessGroup(wrapperPid, "SIGKILL");
		await waitForProcessGroup(wrapperPid, 1_000);
	}
	await finalizeJob(jobDir, "failed", "detached wrapper did not become ready");
	throw new Error("detached wrapper did not start; inspect the job record");
}
