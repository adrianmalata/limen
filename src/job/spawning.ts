// The spawn of a job (T-26 (2)): `limen spawn`, keeper, group start and the GitHub jobs start one through
// `startSpawn`, and continue shares its preamble, handshake and versions. A spawn is an operation of T-38
// (src/operation.ts): its validate makes every check and writes nothing, its apply names and publishes the job under
// the jobs lock after reading again what the checks relied on, and only then are the GitHub review's branch and the
// worktree made and the wrapper started, a failure of which ends the published job `failed`, so its record names what
// happened (T-38 (3)). The text a spawn reports goes to `out`, and the shared wrapper prints it when the command ends
// (D-061 (3)).
import { spawn } from "node:child_process";
import { existsSync, readFileSync } from "node:fs";
import { mkdir, readFile } from "node:fs/promises";
import { basename, dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import type { WrapperValues } from "../config.ts";
import { herdrBinary, openWatchTab } from "../integrations/herdr.ts";
import { hunkBinary } from "../integrations/hunk.ts";
import { type NameSource, refuseRemovedRole } from "../old-names.ts";
import { type Checked, cleanedUp, type Operation, type StateView, stepFailure, validated } from "../operation.ts";
import { type CommandText, environmentError, JOB_STARTED, refused, type Success, usageError } from "../outcome.ts";
import { type ProcessEnd, platform, type ScopedProcess } from "../platform/platform.ts";
import {
	addBranchWorktree,
	addDetachedWorktree,
	addNewWorktree,
	branchCommit,
	branchExists,
	commitHasFile,
	createBranch,
	isBranchName,
	repoRoot,
	resolveCommit,
	spawnBaseCommit,
	workspaceRepository,
	workspaceRoot,
	worktreeForBranch,
} from "../project/git.ts";
import { readOptional } from "../project/inherit.ts";
import { inheritedPlanning, ticketPointers } from "../project/planning.ts";
import { type EngineProfile, preflightEngine, resolveSpawnEngine } from "../runtime/engine.ts";
import { launchWrapper } from "../runtime/launcher.ts";
import { holdsProcesses, KILL_WAIT_MS, waitForProcessGroup } from "../runtime/reap.ts";
import { DEFAULT_PRIORITY, parsePriority, queuedLine } from "../runtime/start-queue.ts";
import { normalizeWorkerExtensions } from "../runtime/worker-extensions.ts";
import { hasCode } from "../system-error.ts";
import { finalizeJob } from "./finalize.ts";
import type { GroupMember, GroupRun } from "./group-cabinet.ts";
import {
	claimMember,
	groupIdentity,
	groupLock,
	groupPath,
	memberSlotProblem,
	readRun,
	teamRoute,
} from "./group-cabinet.ts";
import { syncLifecycle } from "./group-events.ts";
import { memberPacket, routeFlags } from "./group-packet.ts";
import { parseDuration } from "./job.ts";
import { publishJob } from "./publication.ts";
import { readRecord, transition } from "./record.ts";
import { jobsLock, newJobId } from "./reference.ts";
import { type Takeover, takesOver, unlandedSummary, unlandedWork } from "./unlanded.ts";
import { currentNotificationSession, herdrWakePane } from "./watching.ts";

/**
 * A spawn as its flags give it, before any check: the handler reads it from the command line, and keeper, group start
 * and the GitHub jobs build it themselves (T-26). The four route fields are required (D-043). `branchAt`, which no flag
 * gives, is the GitHub review's: `branch` does not exist yet, and the spawn makes it at that commit once the job's
 * record names it, before the worktree (`launchChecked`).
 */
export type SpawnRequest = {
	readonly task: readonly string[];
	readonly engine: string;
	readonly provider: string;
	readonly model: string;
	readonly thinking: string;
	readonly label?: string | undefined;
	readonly branch?: string | undefined;
	readonly branchAt?: string | undefined;
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
 * call this in their validate.
 */
export function resolvePreamble(root: string, role: string, source: NameSource = "argument"): string {
	const places = [`${root}/.agents/limen/${role}.md`, resolve(PACKAGE_ROOT, "templates", `${role}.md`)];
	for (const path of places) {
		if (existsSync(path)) {
			return path;
		}
	}
	refuseRemovedRole(role, source);
	const message = `no preamble for role ${role} in ${places.join(" or ")}; write .agents/limen/${role}.md to add the role`;
	throw source === "argument" ? usageError("ROLE_UNKNOWN", message) : refused("ROLE_UNKNOWN", message);
}
/**
 * The worktree a spawn's validate chose, before the job has an id: the id names the new worktree's folder, and, with
 * no `--branch`, the job's own branch `limen/<id>`, so its apply places it (`worktreePlan`).
 */
type WorktreeChoice =
	| { readonly kind: "detach"; readonly ref: string }
	| { readonly kind: "reuse"; readonly path: string; readonly branch: string }
	| { readonly kind: "add-branch"; readonly branch: string }
	| { readonly kind: "add-new"; readonly branch: string | undefined };
type WorktreePlan =
	| { readonly kind: "detach"; readonly path: string; readonly ref: string }
	| { readonly kind: "reuse"; readonly path: string; readonly branch: string }
	| { readonly kind: "add-branch"; readonly path: string; readonly branch: string }
	| { readonly kind: "add-new"; readonly path: string; readonly branch: string; readonly base: string };
const HANDSHAKE_POLL_MS = 20;
/** How long spawn and continue wait for the wrapper's handshake; a constant, as no setting chooses it (R-015). */
const HANDSHAKE_MS = 10_000;
/** A team's own job, or a worker of a team, with the run it belongs to. */
type SpawnGroup = {
	run: GroupRun;
	team: string;
	role: "coordinator" | "worker";
	/** Members of the team whose jobs never ran, whose slots a start run again takes (`neverRan`). */
	replaces: readonly string[];
};
/** A team's first-round job that group start launches, and the members whose slots it takes back. */
export type TeamLaunch = { readonly run: GroupRun; readonly team: string; readonly replaces?: readonly string[] };
/**
 * The first write of a spawn's apply that its caller adds, after the re-check under the jobs lock and before the job's
 * own writes: the GitHub handoff's gate, so that a changed state ends the handoff before it writes anything.
 */
export type FirstWrite = () => Promise<void>;
/**
 * What a caller adds to a spawn: the team job a group start launches, a first write of its own (`FirstWrite`), and
 * `again`, the command line that runs it again, the `next` of its STATE_CHANGED (T-37).
 */
export type SpawnCall = {
	readonly team?: TeamLaunch;
	readonly firstWrite?: FirstWrite;
	readonly again?: string | null;
};
/**
 * Starts one job; its success names the job in `ids.job` (D-022), and its text goes to `out`. A group's in-process
 * launch ignores the result.
 */
export async function startSpawn(
	request: SpawnRequest,
	cwd: string,
	out: CommandText,
	call: SpawnCall = {},
): Promise<Success> {
	return startChecked(await checkedSpawn(request, cwd, out, call));
}
/**
 * The validate of one spawn (T-38 (1)): every check, and nothing written. A caller that has more to do between the
 * checks and the job, such as group start, which writes its run first, or the GitHub handoff, which takes its gate,
 * calls this, then `startChecked`.
 */
export function checkedSpawn(
	request: SpawnRequest,
	cwd: string,
	out: CommandText,
	call: SpawnCall = {},
): Promise<Checked<SpawnPlan, SpawnedRecord>> {
	return validated(spawnOperation(request, cwd, out, call));
}
/**
 * The writes of a validated spawn: in a group under the group's launch lock, which a group stop waits for, the apply
 * under the jobs lock, then the worktree and the wrapper.
 */
export async function startChecked(checked: Checked<SpawnPlan, SpawnedRecord>): Promise<Success> {
	const { group } = checked.plan;
	let id: string;
	try {
		id = group
			? await groupLock(`${groupPath(group.run)}/launch`, () => launchChecked(checked), "wait")
			: await launchChecked(checked);
	} catch (error) {
		// After validate every failure is a step's (T-38 (3)): the launch lock's file is a write too.
		throw stepFailure(error);
	}
	return { next: null, ids: { job: id }, text: JOB_STARTED };
}
type SpawnTask = { text: string; bytes: Buffer; raw: boolean };
/** Where the job is recorded and which repository its worktree comes from. */
type SpawnPlace = {
	readonly workspace: string | undefined;
	readonly currentRoot: string;
	readonly root: string;
	readonly repository: string;
	readonly repo: string | undefined;
};
/** What spawn's validate decided (T-38 (1)): every input of its apply, checked. */
export type SpawnPlan = {
	readonly cwd: string;
	readonly out: CommandText;
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
	readonly role: string;
	readonly preamble: string;
	readonly jobsRoot: string;
	readonly worktree: WorktreeChoice;
	/** The commit the job's work starts from, which the ticket check read and a new worktree is made at. */
	readonly baseCommit: string;
	/** The base the record names: `--base` when given, else `baseCommit`. */
	readonly base: string;
	readonly candidate: string | undefined;
	readonly branchAt: string | undefined;
};
/** A job spawn's apply published: its id and folder, the branch its record names, the worktree to make, its slot. */
export type SpawnedRecord = {
	readonly id: string;
	readonly jobDir: string;
	readonly branch: string;
	readonly worktree: WorktreePlan;
	readonly member: GroupMember | undefined;
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
/** The operation of one spawn (T-38): validate decides, and apply names and publishes the job under the jobs lock. */
function spawnOperation(
	request: SpawnRequest,
	cwd: string,
	out: CommandText,
	{ team, firstWrite, again = null }: SpawnCall,
): Operation<SpawnPlan, SpawnedRecord> {
	return {
		validate: (view) => validateSpawn(view, request, cwd, out, team),
		lock: (plan) => jobsLock(plan.place.root),
		apply: (plan) => (firstWrite ? firstWrite().then(() => publishSpawn(plan)) : publishSpawn(plan)),
		again,
	};
}
/** Every check of a spawn, in the order the author's spawn made them; it writes nothing (T-38 (1)). */
async function validateSpawn(
	view: StateView,
	request: SpawnRequest,
	cwd: string,
	out: CommandText,
	coordinator: TeamLaunch | undefined,
): Promise<SpawnPlan> {
	const group = await spawnGroup(cwd, coordinator);
	const parsed = spawnOptions(request);
	const profile = resolveSpawnEngine(parsed.engine);
	await checkLaunchAuthority(parsed, group);
	const loaded = await readSpawnTask(parsed.task, parsed.taskFile, cwd, out);
	const options = {
		...parsed,
		task: loaded.text,
		label: parsed.label ?? (loaded.text.trim().split(/\r?\n/, 1)[0]?.trim().slice(0, 80) || "job"),
	};
	const extensions = await launchExtensions(group, options.extensions, cwd);
	preflightEngine(profile, options.model, options.provider);
	const notificationSession = currentNotificationSession();
	const place = resolveSpawnPlace(cwd, group, options.repo);
	const { root, repository } = place;
	const role = options.review ? "reviewer" : (group?.role ?? options.role ?? "worker");
	const pinnedBase = options.base ? resolveCommit(repository, options.base, "--base") : undefined;
	const pinnedHead = options.head ? resolveCommit(repository, options.head, "--head") : undefined;
	const preamble = resolvePreamble(root, role, "argument");
	const jobsRoot = `${root}/.limen/jobs`;
	// A project an older Limen recorded refuses here, before any write (T-38).
	await view.jobs(jobsRoot);
	const branchAt = request.branchAt;
	const worktree = await chooseWorktree(view, {
		root: repository,
		review: options.review,
		jobsRoot,
		branchAt,
		...(place.repo ? { repo: place.repo } : {}),
		...(options.branch ? { requestedBranch: options.branch } : {}),
	});
	const branch = options.branch ?? "";
	// The base the ticket check reads is the one apply records and makes the worktree at; a moved base is a change.
	const baseCommit = await view.hold(
		`the base commit of a new job in ${repository}`,
		() => branchAt ?? (worktree.kind === "add-new" ? spawnBaseCommit(repository) : branchCommit(repository, branch)),
	);
	if (pinnedHead && baseCommit !== pinnedHead) {
		throw refused("REVIEW_HEAD_MOVED", `pinned review head moved before spawn: ${branch} is not at ${pinnedHead}`);
	}
	const task = spawnTaskText(loaded, options.repo, place);
	assertTicketsAtBase(repository, baseCommit, task);
	if (role === "worker") {
		const reuses = worktree.kind === "reuse" ? worktree.path : undefined;
		await checkNoUnlandedWork(view, root, options.branch ? { repository, branch: options.branch, reuses } : undefined);
	}
	await checkMemberSlot(view, group);
	await noteRunningJobs(view, jobsRoot, options.label, out);
	return {
		cwd,
		out,
		options,
		loaded,
		group,
		profile,
		model: options.model,
		extensions,
		notificationSession,
		coordinatorTab: process.env.HERDR_TAB_ID?.trim(),
		// A group member never subscribes a session, so its pane stays recorded even under Pi: it is the lead's route when the group hook is not running.
		coordinatorPane: herdrWakePane(group ? undefined : notificationSession),
		place,
		task,
		role,
		preamble,
		jobsRoot,
		worktree,
		baseCommit,
		base: pinnedBase ?? baseCommit,
		candidate: options.review ? baseCommit : undefined,
		branchAt,
	};
}
/** The group a spawn launches in: the team job a group start or round names, or the caller's own membership. */
async function spawnGroup(cwd: string, coordinator: TeamLaunch | undefined): Promise<SpawnGroup | undefined> {
	if (coordinator) {
		return { run: coordinator.run, team: coordinator.team, role: "coordinator", replaces: coordinator.replaces ?? [] };
	}
	const identity = await groupIdentity(cwd);
	if (identity?.member?.role === "worker") {
		throw refused("GROUP_WORKER_SPAWN", "group workers cannot launch jobs; ask their team coordinator");
	}
	return identity?.member ? { run: identity.run, team: identity.member.team, role: "worker", replaces: [] } : undefined;
}
/**
 * A worker spawn refuses while a finished job of the project holds unlanded work that nothing resolved (A-001): the
 * refusal names each such job with what it holds and both commands that resolve it, and its `next` lists them all
 * (`limen status`), since only the coordinator or the owner chooses between continuing and abandoning. A spawn with
 * `--branch` on the own branch of such a job, the repair spawn of A-015 and A-035, takes over that job's work, as a
 * continuation does, when it reuses the job's worktree or the job's worktree is gone (`takesOver`): its record is then
 * the newest on both, so only the other jobs make it refuse. Validate holds the fact, so work that a job leaves before
 * apply ends the spawn in STATE_CHANGED. A reviewer, keeper or team coordinator works on a candidate, so its spawn does
 * not refuse.
 */
async function checkNoUnlandedWork(view: StateView, root: string, takeover: Takeover | undefined): Promise<void> {
	await view.hold(`the unlanded work of the finished jobs of ${root}`, async () => {
		const held = (await unlandedWork(root, view)).filter((work) => !(takeover && takesOver(work, takeover)));
		if (held.length === 0) {
			return "none";
		}
		const lines = held.flatMap((work) => [
			`  ${work.id} (${work.state}): ${unlandedSummary(work)}`,
			`    limen continue ${work.id} "instruction", or limen abandon ${work.id}`,
		]);
		const jobs = held.length === 1 ? "a finished job holds" : `${held.length} finished jobs hold`;
		throw refused(
			"UNLANDED_WORK",
			[`${jobs} unlanded work; a worker spawn refuses until each is continued or abandoned:`, ...lines].join("\n"),
			"limen status",
		);
	});
}
/**
 * A worker launch needs a free slot of its team (`memberSlotProblem`): validate refuses without one, and holds the
 * fact, so a run.json that a group stop or another launch changed in between ends the spawn in STATE_CHANGED. A team's
 * own job is launched by group start or a round, from a run that its caller holds; its claim reads it under the cabinet
 * lock.
 */
async function checkMemberSlot(view: StateView, group: SpawnGroup | undefined): Promise<void> {
	if (!group) {
		return;
	}
	if (group.role === "coordinator") {
		const problem = memberSlotProblem(group.run, group.team, group.role, 0, Date.now(), group.replaces);
		if (problem) {
			throw problem;
		}
		return;
	}
	await view.hold(`the launch slots of group ${group.run.feature} (${group.run.id})`, async () => {
		const problem = memberSlotProblem(await readRun(group.run.root, group.run.id), group.team, group.role);
		if (problem) {
			throw problem;
		}
		return "free";
	});
}
/**
 * The apply of a spawn, under the jobs lock after the re-check (T-38 (2)): the jobs folder, the job's id, its member
 * slot, the folder of job worktrees, then the published record. It makes no branch, so a crash before the record leaves
 * none that no record names.
 */
async function publishSpawn(plan: SpawnPlan): Promise<SpawnedRecord> {
	const { options, group, place, jobsRoot } = plan;
	const { root, repository } = place;
	await mkdir(jobsRoot, { recursive: true });
	// The new token stays unique while the jobs lock is held, until publication has made the job's folder (T-20 (1)).
	const id = await newJobId(root, options.label);
	const member = group
		? await claimMember(group.run, group.team, group.role, id, undefined, 0, group.replaces)
		: undefined;
	const branch = options.branch ?? `limen/${id}`;
	const worktreeRoot = `${dirname(repository)}/.${basename(repository)}-limen-worktrees`;
	await mkdir(worktreeRoot, { recursive: true });
	const worktree = worktreePlan(plan.worktree, `${worktreeRoot}/${id}`, branch, plan.baseCommit);
	const jobDir = `${jobsRoot}/${id}`;
	const taskBody = await jobTaskBody(plan, plan.candidate, member);
	await publishSpawnedJob(plan, {
		jobDir,
		id,
		taskBody,
		branch,
		worktree: worktree.path,
		base: plan.base,
		role: plan.role,
		member,
		candidate: plan.candidate,
	});
	return { id, jobDir, branch, worktree, member };
}
/**
 * The steps after a spawn's apply: the job's record exists, so a failure to make the GitHub review's branch, the
 * worktree or the wrapper ends it `failed` with the reason (T-38 (3)). Returns the job's id.
 */
async function launchChecked(checked: Checked<SpawnPlan, SpawnedRecord>): Promise<string> {
	const { plan } = checked;
	const { options, group, place } = plan;
	const { jobDir, id, branch, worktree: planned, member } = await checked.apply();
	try {
		if (plan.branchAt) {
			createBranch(place.repository, branch, plan.branchAt);
		}
		const worktree = executeWorktree(place.repository, planned);
		const setup = {
			LIMEN_SETUP_KEEP: place.currentRoot,
			LIMEN_SETUP_PREPARE: options.prepare ?? "",
		};
		const memberDeadline = member?.deadline;
		await launchSpawnedJob(plan, {
			jobDir,
			id,
			root: place.root,
			worktree,
			preamble: plan.preamble,
			role: plan.role,
			memberDeadline,
			setup,
		});
	} catch (error) {
		throw await cleanedUp(error, async () => {
			const detail = `${group ? "group launch" : "spawn"} failed: ${String(error)}`;
			await finalizeJob(jobDir, { state: "failed", failure: { kind: "launch", detail } });
		});
	}
	return id;
}
/** Outside a group no job may claim the owner-facing lead; a group launch keeps its recorded route and branches. */
async function checkLaunchAuthority(parsed: SpawnOptions, group: SpawnGroup | undefined): Promise<void> {
	if (!group) {
		const roleClaim = claimsOwnerFacingLead(parsed.role);
		if (roleClaim) {
			throw refused("SPAWN_LEAD_ROLE", roleClaim);
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
		throw usageError("GROUP_ROUTE", `group launches require the team route explicitly: ${routeFlags(route)}`);
	}
	if (
		parsed.repo ||
		(parsed.branch && !parsed.review) ||
		(parsed.role && parsed.role !== group.role) ||
		parsed.timeoutMs
	) {
		throw usageError(
			"GROUP_LAUNCH_FLAGS",
			"group launches use isolated new branches, recorded roles and deadlines; omit --repo, ordinary --branch and --timeout",
		);
	}
	if (parsed.review) {
		const teamBranches = await Promise.all(
			run.members
				.filter((member) => member.team === group.team)
				.map(async (member) => (await readRecord(`${run.root}/.limen/jobs/${member.id}`))?.branch ?? ""),
		);
		if (!teamBranches.includes(parsed.branch ?? "")) {
			throw refused("GROUP_REVIEW_BRANCH", "group review requires a candidate branch owned by this team");
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
	const extensions = await (recorded
		? normalizeWorkerExtensions(recorded, cwd, "record")
		: normalizeWorkerExtensions(requested, cwd));
	if (
		recorded &&
		requested.length &&
		JSON.stringify(await normalizeWorkerExtensions(requested, cwd)) !== JSON.stringify(extensions)
	) {
		throw usageError(
			"GROUP_EXTENSIONS",
			"group launches require the recorded team extensions; omit --extension to inherit them",
		);
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
		throw usageError("REPO_REQUIRED", "workspace spawn requires --repo <immediate-child>");
	}
	if (!workspace && repoFlag) {
		throw usageError("REPO_OUTSIDE_WORKSPACE", "--repo is available only from a non-Git workspace coordinator");
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
/** The worktree `choice` with the job's id: the folder of a new worktree and, with no `--branch`, the job's branch. */
function worktreePlan(choice: WorktreeChoice, path: string, branch: string, base: string): WorktreePlan {
	if (choice.kind === "detach") {
		return { kind: "detach", path, ref: choice.ref };
	}
	if (choice.kind === "reuse") {
		return choice;
	}
	if (choice.kind === "add-branch") {
		return { kind: "add-branch", path, branch: choice.branch };
	}
	return { kind: "add-new", path, branch: choice.branch ?? branch, base };
}
function assertTicketsAtBase(repository: string, baseCommit: string, task: string): void {
	for (const { path } of ticketPointers(task)) {
		if (path.startsWith("spec/") && !commitHasFile(repository, baseCommit, path)) {
			throw refused("TICKET_NOT_AT_BASE", `ticket ${path} is missing from the base commit`);
		}
	}
}
/**
 * Says how many jobs already run, a running one whose wrapper died while its scope holds a process included (R-032
 * (c)), and warns about a bare feature-number label or a label a live job holds.
 */
async function noteRunningJobs(view: StateView, jobsRoot: string, label: string, out: CommandText): Promise<void> {
	let running = 0;
	let held = false;
	for (const id of await view.jobs(jobsRoot)) {
		const record = await view.record(`${jobsRoot}/${id}`);
		if (!(await holdsProcesses(record))) {
			continue;
		}
		running += 1;
		if (record?.label === label) {
			held = true;
		}
	}
	if (running > 0) {
		out.line(`note: ${running} job${running === 1 ? "" : "s"} already running; starting another`);
	}
	if (/^F\d{3,}$/i.test(label)) {
		out.line("warning: label is only a feature number");
	}
	if (held) {
		out.line("warning: a live job already holds this label");
	}
}
async function jobTaskBody(
	plan: SpawnPlan,
	candidate: string | undefined,
	member: GroupMember | undefined,
): Promise<string | Uint8Array> {
	const { task, loaded, group } = plan;
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
async function publishSpawnedJob(plan: SpawnPlan, record: SpawnRecord): Promise<void> {
	const { group, place, notificationSession, coordinatorTab, coordinatorPane } = plan;
	const { member, candidate } = record;
	await publishJob(record.jobDir, {
		task: record.taskBody,
		label: plan.options.label,
		branch: record.branch,
		worktree: record.worktree,
		base: record.base,
		role: record.role,
		engine: plan.profile.id,
		priority: plan.options.priority ?? DEFAULT_PRIORITY,
		...(plan.model ? { model: plan.model } : {}),
		provider: plan.options.provider,
		thinking: plan.options.thinking,
		extensions: plan.extensions,
		...(place.repo ? { repo: place.repo } : {}),
		...(!group && notificationSession ? { notificationSession } : {}),
		...(coordinatorTab ? { originTab: coordinatorTab } : {}),
		...(coordinatorPane ? { originPane: coordinatorPane } : {}),
		...(group && member ? { group: { id: group.run.id, team: group.team } } : {}),
		...(candidate ? { candidate } : {}),
	});
}
/** Starts the published job as a detached wrapper, which moves it to running (src/runtime/wrapper.ts). */
async function launchSpawnedJob(plan: SpawnPlan, job: SpawnedJob): Promise<void> {
	await startDetachedJob(plan, job, recordVersions(job.jobDir, plan.profile));
}
/**
 * Records the versions of the engine and the tools while the job starts or runs; a job that ended before the probes
 * answered keeps none, since nothing writes after a terminal state.
 */
export async function recordVersions(jobDir: string, profile: EngineProfile): Promise<void> {
	const versions = await capturedVersions(profile);
	await transition(jobDir, { from: ["starting", "running"], set: { versions } });
}
async function startDetachedJob(plan: SpawnPlan, job: SpawnedJob, versions: Promise<void>): Promise<void> {
	const { options, model, group, out } = plan;
	const { jobDir, id, root } = job;
	await openWatchTab({ jobDir, label: options.label, cwd: root, logPath: `${jobDir}/log`, role: job.role });
	const environment: WrapperValues = {
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
	let wrapper: ScopedProcess;
	try {
		wrapper = await launchWrapper(id, environment);
	} catch (error) {
		const message = error instanceof Error ? error.message : String(error);
		throw await cleanedUp(error, async () => {
			await versions.catch(() => {});
			await finalizeJob(jobDir, {
				state: "failed",
				failure: { kind: "launch", detail: `failed to launch wrapper: ${message}` },
			});
		});
	}
	await waitForHandshake(jobDir, wrapper);
	if (group) {
		await syncLifecycle(group.run, "skip");
	}
	const queued = await queuedLine(jobDir, options.label);
	const state = (await readRecord(jobDir))?.state;
	if (state !== "running") {
		const detail = lastLimenDetail(jobDir);
		await versions.catch(() => {});
		out.line(detail ? `${state} ${options.label}\n${detail}` : `${state} ${options.label}`);
		out.line(id);
		return;
	}
	await versions.catch(() => {});
	out.line(queued ?? `started ${options.label}`);
	out.line(id);
}
/**
 * The worktree a spawn takes, chosen before the job has an id. A `--branch`'s choice is held: a branch that gains a
 * live job, a worktree or a commit in between ends the spawn in STATE_CHANGED. Without `--branch` the job makes its own
 * new branch, which needs no fact.
 */
async function chooseWorktree(
	view: StateView,
	input: {
		readonly root: string;
		readonly review: boolean;
		readonly requestedBranch?: string;
		readonly branchAt: string | undefined;
		readonly repo?: string;
		readonly jobsRoot: string;
	},
): Promise<WorktreeChoice> {
	const { root, requestedBranch: branch } = input;
	if (input.review && !branch) {
		throw usageError("REVIEW_NEEDS_BRANCH", "--review requires --branch <candidate-branch>");
	}
	if (branch === undefined) {
		return { kind: "add-new", branch: undefined };
	}
	if (!isBranchName(root, branch)) {
		throw usageError("BAD_BRANCH", `--branch ${JSON.stringify(branch)} is no name git takes for a branch`);
	}
	if (input.branchAt !== undefined) {
		// The GitHub review's branch: the spawn makes it once the job's record names it, so it must not exist yet.
		await view.hold(`branch ${branch} in ${root}`, () => {
			if (branchExists(root, branch)) {
				throw refused(
					"BRANCH_EXISTS",
					`branch ${branch} already exists in ${root}, so a review cannot pin a new one there`,
				);
			}
			return "absent";
		});
		return { kind: "detach", ref: branch };
	}
	return view.hold(`branch ${branch} in ${root}`, async () => {
		if (input.review) {
			if (!branchExists(root, branch)) {
				throw refused("BRANCH_MISSING", `candidate branch ${branch} does not exist`);
			}
			return { kind: "detach", ref: branch } as const;
		}
		if (!branchExists(root, branch)) {
			return { kind: "add-new", branch } as const;
		}
		const existing = worktreeForBranch(root, branch);
		if (existing && resolve(existing.path) === resolve(root)) {
			throw refused(
				"BRANCH_IN_PRIMARY",
				`branch ${branch} is checked out in the primary worktree, so the job cannot get its own worktree; switch the primary worktree to another branch, or omit --branch`,
			);
		}
		if (await liveJobUsesBranch(view, input.jobsRoot, branch, input.repo)) {
			throw refused("BRANCH_LIVE_JOB", `branch ${branch} already has a live job`);
		}
		return existing
			? ({ kind: "reuse", path: existing.path, branch } as const)
			: ({ kind: "add-branch", branch } as const);
	});
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
		addNewWorktree(root, plan.path, plan.branch, plan.base);
	}
	return plan.path;
}
function claimsOwnerFacingLead(role: string | undefined): string | undefined {
	if (role === "coordinator" || role === "lead") {
		return "refusing spawn --role coordinator/lead: managed team coordinators come only from limen group start; the owner-facing lead is the interactive Herdr coordinator pane (LIMEN_COORDINATOR=1) with hook/group-peer.ts loaded (export LIMEN_PACKAGE to a package that ships group-peer, then reload that pane) — never limen spawn a substitute lead job";
	}
}

/** The checked options of a spawn; a value that does not hold is a usage error, in validate. */
function spawnOptions(request: SpawnRequest): SpawnOptions {
	const role = request.role?.trim();
	if (role !== undefined && !/^[a-z][a-z0-9-]*$/.test(role)) {
		throw usageError("BAD_ROLE", "--role must be a lowercase name");
	}
	const timeoutMs = request.timeout === undefined ? undefined : parseDuration(request.timeout);
	const priority = parsePriority(request.priority);
	if (request.review && role) {
		throw usageError("REVIEW_WITH_ROLE", "--role and --review cannot be combined");
	}
	// The drop of empty words and lone `--` words happens in the shared parser, on the command line only (`dropsDashes`
	// of the task in src/registry.ts); an in-process caller of `startSpawn` passes a task without them.
	const task = request.task;
	const label = spawnLabel(request, task);
	const checked: SpawnOptions = {
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
			checked[key] = value;
		}
	}
	return checked;
}
/** Check the task against its flags; the label, which positional words give with --task-file. */
function spawnLabel(values: SpawnRequest, task: readonly string[]): string | undefined {
	if ((values.base || values.head) && !values.review) {
		throw usageError("PIN_WITHOUT_REVIEW", "--base and --head require --review");
	}
	const label = values.label === undefined ? undefined : normalizeLabel(values.label);
	// With --task-file the file is the task, so positional words can only be its title.
	if (values.taskFile && task.length) {
		if (label) {
			throw usageError("TITLE_TWICE", "with --task-file, give the title positionally or as --label, not both");
		}
		return normalizeLabel(task.join(" "));
	}
	if (!values.taskFile && !task.join(" ").trim()) {
		throw usageError("NO_TASK", "spawn requires task text");
	}
	return label;
}
async function readSpawnTask(
	task: string,
	taskFile: string | undefined,
	cwd: string,
	out: CommandText,
): Promise<{ text: string; bytes: Buffer; raw: boolean }> {
	const source = taskFile ?? (task === "-" ? "-" : undefined);
	if (!source) {
		if (/``| {2}/.test(task)) {
			out.line("warning: empty backticks or doubled spaces in the task; single-quote it or pass --task-file");
		}
		return { text: task, bytes: Buffer.from(task), raw: false };
	}
	const bytes = source === "-" ? readFileSync(0) : await taskFileBytes(resolve(cwd, source));
	const text = bytes.toString("utf8");
	if (!text.trim()) {
		throw usageError("NO_TASK", "spawn requires task text");
	}
	return { text, bytes, raw: true };
}
/**
 * The bytes of `--task-file`: a path that names no file, or a folder, is a usage error (T-02); a file the system does
 * not let Limen read is the environment's failure.
 */
async function taskFileBytes(path: string): Promise<Buffer> {
	try {
		return await readFile(path);
	} catch (error) {
		if (hasCode(error, "ENOENT")) {
			throw usageError("BAD_TASK_FILE", `--task-file ${path} does not exist`);
		}
		if (hasCode(error, "EISDIR")) {
			throw usageError("BAD_TASK_FILE", `--task-file ${path} is a folder; name the file that holds the task`);
		}
		const reason = error instanceof Error ? error.message : String(error);
		throw environmentError("TASK_FILE_UNREADABLE", `--task-file ${path} cannot be read: ${reason}`);
	}
}
function probeVersion(command: string): Promise<string> {
	return new Promise((resolve) => {
		const child = spawn(command, ["--version"], { stdio: ["ignore", "pipe", "ignore"] });
		let output = "";
		const timer = setTimeout(() => child.kill("SIGKILL"), 1_000);
		const done = (value: string) => {
			clearTimeout(timer);
			resolve(value);
		};
		child.stdout?.on("data", (chunk: Buffer | string) => (output += chunk));
		child
			.once("error", () => done(""))
			.once("close", (code) => done(code === 0 ? (output.trim().split("\n")[0] ?? "") : ""));
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
		throw usageError("BAD_LABEL", "--label must be one non-empty line");
	}
	return label;
}
async function liveJobUsesBranch(view: StateView, jobsRoot: string, branch: string, repo?: string): Promise<boolean> {
	for (const id of await view.jobs(jobsRoot)) {
		const record = await view.record(`${jobsRoot}/${id}`);
		if (record?.branch === branch && (!repo || record.repo === repo) && (await holdsProcesses(record))) {
			return true;
		}
	}
	return false;
}
/**
 * The terminal Limen line of the job's log, without its time: the end of a job that ended before its spawn returned.
 * Lines after it, such as the end of its scope or its tab, do not say how it ended.
 */
function lastLimenDetail(jobDir: string): string {
	const log = readOptional(`${jobDir}/log`) ?? "";
	const line = log.split("\n").findLast((entry) => /^\[limen [^\]]*\] (?:done|failed|stopped):/.test(entry)) ?? "";
	const close = line.indexOf("] ");
	return close === -1 ? line : line.slice(close + 2);
}
/**
 * Waits for the wrapper's handshake, its transition from starting (src/runtime/wrapper.ts); ends the job without it: at
 * its bound, or as soon as the wrapper's process ends with the job still starting, which no later handshake follows.
 */
export async function waitForHandshake(jobDir: string, wrapper: ScopedProcess): Promise<void> {
	let end: ProcessEnd | undefined;
	void wrapper.ended.then((value) => {
		end = value;
	});
	const deadline = Date.now() + HANDSHAKE_MS;
	while (Date.now() < deadline && end === undefined) {
		if ((await readRecord(jobDir))?.state !== "starting") {
			return;
		}
		await new Promise((resolve) => setTimeout(resolve, HANDSHAKE_POLL_MS));
	}
	// A wrapper that moved the job and then ended at once ran, so the record is read once more after its end.
	if ((await readRecord(jobDir))?.state !== "starting") {
		return;
	}
	platform.signalProcessGroup(wrapper.pid, "SIGTERM");
	if (!(await waitForProcessGroup(wrapper.pid, 1_000))) {
		platform.signalProcessGroup(wrapper.pid, "SIGKILL");
		await waitForProcessGroup(wrapper.pid, KILL_WAIT_MS);
	}
	const how = end === undefined ? "" : ` (it ended with ${end.signal ?? `exit code ${end.code ?? "unknown"}`})`;
	throw await cleanedUp(
		environmentError("WRAPPER_NOT_READY", `detached wrapper did not start${how}; inspect the job record`),
		async () => {
			const detail = `detached wrapper did not become ready${how}`;
			await finalizeJob(jobDir, { state: "failed", failure: { kind: "launch", detail } });
		},
	);
}
