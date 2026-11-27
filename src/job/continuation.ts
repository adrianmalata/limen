// The continuation of a finished job in its own session and worktree (T-26 (2)): `limen continue`, the group round
// driver and the seat sweep's resume after the subscription limit (src/runtime/resuming.ts) start one through
// `startContinue`. It is an operation of T-38 (src/operation.ts), as a spawn is: its validate makes every check, its
// apply names and publishes the job under the jobs lock after the re-check, and the restored worktree and the wrapper
// follow. Its text goes to `out`, which the shared wrapper prints at the end.
import { existsSync, readFileSync } from "node:fs";
import { readdir, rm } from "node:fs/promises";
import { join } from "node:path";
import type { WrapperValues } from "../config.ts";
import { openWatchTab } from "../integrations/herdr.ts";
import { type Checked, cleanedUp, type StateView, stepFailure, validated } from "../operation.ts";
import { type CommandText, JOB_STARTED, refused, type Success, usageError } from "../outcome.ts";
import type { ScopedProcess } from "../platform/platform.ts";
import {
	addBranchWorktree,
	branchCommit,
	branchExists,
	headCommit,
	repoRoot,
	workspaceRepository,
	workspaceRoot,
} from "../project/git.ts";
import { inheritedPlanning } from "../project/planning.ts";
import { CONTEXT_FILE, type ContextAudience, contextMessage } from "../runtime/context-message.ts";
import {
	defaultModel,
	type EngineId,
	type EngineProfile,
	engineProfile,
	engineRoute,
	preflightEngine,
	resolveSpawnEngine,
	runsBridgeIsolated,
} from "../runtime/engine.ts";
import { launchWrapper } from "../runtime/launcher.ts";
import { requireJobModules } from "../runtime/roles.ts";
import { jobPriority, parsePriority, queuedLine } from "../runtime/start-queue.ts";
import { normalizeWorkerExtensions, readWorkerExtensions } from "../runtime/worker-extensions.ts";
import { finalizeJob } from "./finalize.ts";
import {
	claimMember,
	commandRoot,
	type GroupIdentity,
	type GroupRun,
	groupIdentity,
	groupLock,
	groupPath,
	jobMembership,
	memberSlotProblem,
	readRun,
	teamRoute,
} from "./group-cabinet.ts";
import { syncLifecycle } from "./group-events.ts";
import { isTerminal, parseDuration } from "./job.ts";
import { publishJob } from "./publication.ts";
import { type JobRecord, readRecord } from "./record.ts";
import { type JobReference, jobsLock, newJobId, referenceWord, resolveJob } from "./reference.ts";
import { normalizeLabel, recordVersions, resolvePreamble, waitForHandshake } from "./spawning.ts";
import { worktreeJobs } from "./unlanded.ts";
import { currentNotificationSession, herdrWakePane } from "./watching.ts";

/**
 * A continuation as its flags give it, before any check: the handler reads it from the command line, and the group
 * round driver builds it itself (T-26).
 */
export type ContinueRequest = {
	readonly query: JobReference;
	readonly instruction: readonly string[];
	readonly label?: string | undefined;
	readonly engine?: string | undefined;
	readonly provider?: string | undefined;
	readonly model?: string | undefined;
	readonly thinking?: string | undefined;
	readonly timeout?: string | undefined;
	readonly priority?: string | undefined;
	readonly extensions?: readonly string[] | undefined;
	/** The number of a resume after the subscription limit, which only the seat sweep's resume gives (A-016 (5)). */
	readonly quotaAttempt?: number | undefined;
	/**
	 * A continuation only of the newest record on the parent's worktree: the sweep's resume gives it, since the sweep
	 * chose the parent as the newest outside the jobs lock (D-097 (5) (d)); `limen continue` may continue an older job.
	 */
	readonly onlyNewest?: boolean | undefined;
};
/**
 * Resume a finished job's own engine session; restore a pruned checkout from its branch. `round` is set only by the
 * group round driver, which holds the launch lock and continues a team's own job.
 */
export async function startContinue(
	request: ContinueRequest,
	cwd: string,
	out: CommandText,
	round?: number,
	again: string | null = null,
): Promise<Success> {
	return continueChecked(await checkContinue(request, cwd, out, round, again));
}
/** A continuation that its checks passed and that has written nothing yet: the first half of `startContinue`. */
export type CheckedContinuation = Checked<ContinuePlan, ContinuedRecord>;
/**
 * The checks of a continuation (T-38 (1)), which write nothing; `continueChecked` makes its writes. `startContinue`
 * runs both; a test runs two checks before either write, the window that the newest record held under the jobs lock
 * closes (D-097 (5) (d)).
 */
export function checkContinue(
	request: ContinueRequest,
	cwd: string,
	out: CommandText,
	round?: number,
	again: string | null = null,
): Promise<CheckedContinuation> {
	return validated({
		validate: (view: StateView) => validateContinue(view, request, cwd, out, round),
		lock: (plan: ContinuePlan) => jobsLock(plan.root),
		apply: publishContinue,
		again,
	});
}
/**
 * The writes of a checked continuation: its record under the jobs lock after the held facts were read again, then the
 * restored worktree and the wrapper; returns the new job's id.
 */
export async function continueChecked(checked: CheckedContinuation): Promise<Success> {
	const { membership, round } = checked.plan;
	// A worker's continuation takes the group's launch lock, which a group stop waits for; the round driver holds it.
	let id: string;
	try {
		id =
			membership && round === undefined
				? await groupLock(`${groupPath(membership.run)}/launch`, () => launchContinued(checked), "wait")
				: await launchContinued(checked);
	} catch (error) {
		// After validate every failure is a step's (T-38 (3)): the launch lock's file is a write too.
		throw stepFailure(error);
	}
	return { next: null, ids: { job: id }, text: JOB_STARTED };
}
type ContinueOptions = {
	readonly label: string | undefined;
	readonly model: string | undefined;
	readonly provider: string | undefined;
	readonly thinking: string | undefined;
	readonly engine: string | undefined;
	readonly timeoutMs: number | undefined;
	readonly priority: number | undefined;
	readonly selected: readonly string[];
	readonly query: JobReference;
	readonly instruction: string;
	readonly quotaAttempt: number | undefined;
	readonly onlyNewest: boolean;
};
/** The checked options of a continuation; a value that does not hold refuses before any job record exists. */
function continueOptions(request: ContinueRequest): ContinueOptions {
	const label = request.label === undefined ? undefined : normalizeLabel(request.label);
	const instruction = request.instruction.join(" ").trim();
	if (!referenceWord(request.query) || !instruction) {
		throw usageError("NO_INSTRUCTION", 'continue requires <id|token> "follow-up instruction"');
	}
	return {
		label,
		model: request.model,
		provider: request.provider,
		thinking: request.thinking,
		engine: request.engine?.trim(),
		timeoutMs: request.timeout === undefined ? undefined : parseDuration(request.timeout),
		priority: parsePriority(request.priority),
		selected: request.extensions ?? [],
		query: request.query,
		instruction,
		quotaAttempt: request.quotaAttempt,
		onlyNewest: request.onlyNewest === true,
	};
}
type ParentJob = {
	readonly id: string;
	readonly dir: string;
	readonly record: JobRecord;
	readonly worktree: string;
	readonly branch: string;
	readonly repo: string;
	readonly session: string | undefined;
	readonly engine: string;
};
type ContinuationGroup = { readonly id: string; readonly team: string; readonly deadline: number };
type ContinuationRecord = {
	readonly jobDir: string;
	readonly parent: ParentJob;
	readonly repository: string;
	readonly task: string;
	readonly context: string | Uint8Array;
	readonly label: string;
	readonly role: string;
	readonly engine: EngineId;
	readonly model: string | undefined;
	readonly provider: string | undefined;
	readonly thinking: string | undefined;
	readonly extensions: readonly string[];
	readonly priority: number;
	readonly membership: GroupIdentity | undefined;
	readonly group: ContinuationGroup | undefined;
	readonly route: WakeRouting;
	readonly quotaAttempt: number | undefined;
};
/** A published continuation, ready to start as a detached wrapper. */
type Continuation = {
	readonly id: string;
	readonly jobDir: string;
	readonly root: string;
	readonly worktree: string;
	readonly label: string;
	readonly role: string;
	readonly parentId: string;
	readonly model: string | undefined;
	readonly provider: string | undefined;
	readonly thinking: string | undefined;
	readonly versions: Promise<void>;
	readonly group: ContinuationGroup | undefined;
	readonly timeoutMs: number | undefined;
};
/** What continue's validate decided (T-38 (1)): every input of its apply, checked. */
type ContinuePlan = {
	readonly root: string;
	readonly out: CommandText;
	readonly options: ContinueOptions;
	readonly parent: ParentJob;
	readonly membership: GroupIdentity | undefined;
	readonly round: number | undefined;
	readonly profile: EngineProfile;
	readonly model: string;
	readonly extensions: readonly string[];
	readonly label: string;
	readonly role: string;
	/** The context message the continuation publishes: its parent's, or one built for a parent that has none. */
	readonly context: string | Uint8Array;
	readonly repository: string;
	readonly route: WakeRouting;
};
/**
 * Where the continuation's finish is reported, read in validate (T-38 (1)): an unsafe `PI_SESSION_ID` or
 * `HERDR_PANE_ID` refuses before any write, a group member's slot included.
 */
type WakeRouting = {
	readonly notificationSession: string | undefined;
	readonly coordinatorTab: string;
	readonly coordinatorPane: string | undefined;
};
/** What continue's apply published: the job's id and folder, and its place in a group. */
type ContinuedRecord = { readonly id: string; readonly jobDir: string; readonly group: ContinuationGroup | undefined };
/** Every check of a continuation, in the order the author's continue made them; it writes nothing (T-38 (1)). */
async function validateContinue(
	view: StateView,
	request: ContinueRequest,
	cwd: string,
	out: CommandText,
	round: number | undefined,
): Promise<ContinuePlan> {
	const options = continueOptions(request);
	const { label, model, provider } = options;
	const chosenModel = model ?? defaultModel();

	// A job that continues from its own worktree resolves jobs in its canonical root.
	const inherited = workspaceRoot(cwd) ? undefined : inheritedPlanning(repoRoot(cwd));
	const root = inherited?.root ?? (await commandRoot(cwd));
	const { id: parentId, jobDir: parentDir } = await resolveJob(root, options.query, "control");
	const membership = await jobMembership(parentDir);
	if (membership) {
		await checkGroupContinuation(membership, cwd, options, round);
	}
	const parent = await readParentJob(view, root, parentId, parentDir, options);
	const profile = engineProfile(parent.engine);
	const extensions = await continuationExtensions(parent, membership, options.selected, cwd);
	preflightEngine(profile, chosenModel, provider);
	const finalLabel = label ?? `${parent.record.label || parentId} · continue`;
	const role = parent.record.role || "worker";
	// A module's role, and a job in a workspace repository, continue only while the module is on, as they spawn (G1.10,
	// R-044 Decisions 6 and 20 G1).
	requireJobModules(root, { role, repo: parent.repo });
	// A role a cut removed refuses here, also for a parent whose context message the continuation carries.
	const context = carriedContext(parentDir, root, {
		session: "job",
		role,
		preamble: resolvePreamble(root, role, "record"),
		bridgeIsolated: runsBridgeIsolated(engineRoute(provider, chosenModel)),
	});
	const repository = parent.repo ? workspaceRepository(root, parent.repo) : root;
	await view.hold(`the worktree ${parent.worktree} or branch ${parent.branch} of job ${parentId}`, () => {
		if (!existsSync(parent.worktree) && !branchExists(repository, parent.branch)) {
			throw refused(
				"JOB_TREE_GONE",
				`parent worktree ${parent.worktree} is gone and branch ${parent.branch} is missing in ${repository}; restore that branch before continuing`,
			);
		}
		return "present";
	});
	if (membership?.member) {
		const { run, member } = membership;
		const slot = round === undefined ? "worker" : "coordinator";
		await view.hold(`the launch slots of group ${run.feature} (${run.id})`, async () => {
			const problem = memberSlotProblem(await readRun(run.root, run.id), member.team, slot, round);
			if (problem) {
				throw problem;
			}
			return "free";
		});
	}
	return {
		root,
		out,
		options,
		parent,
		membership,
		round,
		profile,
		model: chosenModel,
		extensions,
		label: finalLabel,
		role,
		context,
		repository,
		route: wakeRouting(parent, membership),
	};
}
/**
 * The context message a continuation carries: its parent's `context.md` byte for byte, beside the transcript it copies,
 * so the continued session holds one message and its hook sends no second one (A-079); a parent folder published
 * before the file existed holds none, so the continuation builds one for its own audience (R-039's migration).
 */
function carriedContext(parentDir: string, root: string, audience: ContextAudience): string | Uint8Array {
	const saved = join(parentDir, CONTEXT_FILE);
	return existsSync(saved) ? readFileSync(saved) : contextMessage(root, audience);
}
/**
 * The continuation's wake route. A continuation started from a shell with no wake route (a remote executor, a plain
 * terminal) keeps the parent's coordinator; otherwise its finish reaches nobody.
 */
function wakeRouting(parent: ParentJob, membership: GroupIdentity | undefined): WakeRouting {
	const callerSession = currentNotificationSession();
	const callerPane = herdrWakePane(membership ? undefined : callerSession);
	const routed = Boolean(callerSession || callerPane);
	const { origin } = parent.record;
	const coordinatorTab = process.env.HERDR_TAB_ID?.trim() || (routed ? "" : (origin.tab ?? ""));
	const coordinatorPane = routed ? callerPane : (origin.pane ?? "");
	const notificationSession = routed ? callerSession : coordinatorPane ? undefined : origin.session || undefined;
	return { notificationSession, coordinatorTab, coordinatorPane };
}
/**
 * The apply of a continuation, under the jobs lock after the re-check (T-38 (2)): the job's id, its member slot in a
 * group, then the published record.
 */
async function publishContinue(plan: ContinuePlan): Promise<ContinuedRecord> {
	const { root, parent, membership, round } = plan;
	// The new token stays unique while the jobs lock is held, until publication has made the job's folder (T-20 (1)).
	const id = await newJobId(root, plan.label);
	const jobDir = `${root}/.limen/jobs/${id}`;
	const slot = round === undefined ? "worker" : "coordinator";
	const member = membership?.member
		? await claimMember(membership.run, membership.member.team, slot, id, parent.id, round)
		: undefined;
	const group =
		membership && member ? { id: membership.run.id, team: member.team, deadline: member.deadline } : undefined;
	await publishContinuation({
		jobDir,
		parent,
		repository: plan.repository,
		task: plan.options.instruction,
		context: plan.context,
		label: plan.label,
		role: plan.role,
		engine: plan.profile.id,
		model: plan.model,
		provider: plan.options.provider,
		thinking: plan.options.thinking,
		extensions: plan.extensions,
		// A continuation keeps its parent's place in the start-queue order unless it names its own.
		priority: plan.options.priority ?? jobPriority(parent.record),
		membership,
		group,
		route: plan.route,
		quotaAttempt: plan.options.quotaAttempt,
	});
	return { id, jobDir, group };
}
/** The steps after continue's apply: the parent's worktree restored when a prune took it, then the wrapper. */
async function launchContinued(checked: CheckedContinuation): Promise<string> {
	const { plan } = checked;
	const record = await checked.apply();
	try {
		return await startContinued(plan, record);
	} catch (error) {
		throw stepFailure(error);
	}
}
/** The restored worktree and the wrapper of a published continuation; returns its job id. */
async function startContinued(plan: ContinuePlan, { id, jobDir, group }: ContinuedRecord): Promise<string> {
	await restoreParentWorktree(jobDir, plan.repository, plan.parent.worktree, plan.parent.branch, plan.out);
	const continuation = {
		id,
		jobDir,
		root: plan.root,
		worktree: plan.parent.worktree,
		label: plan.label,
		role: plan.role,
		parentId: plan.parent.id,
		model: plan.model,
		provider: plan.options.provider,
		thinking: plan.options.thinking,
		group,
		timeoutMs: plan.options.timeoutMs,
	};
	await launchContinuation(continuation, plan.profile, plan.membership?.run, plan.out);
	return id;
}
/** Starts the published job as a detached wrapper, which moves it to running (src/runtime/wrapper.ts). */
async function launchContinuation(
	continuation: Omit<Continuation, "versions">,
	profile: EngineProfile,
	run: GroupRun | undefined,
	out: CommandText,
): Promise<void> {
	const versions = recordVersions(continuation.jobDir, profile);
	await startDetachedContinuation({ ...continuation, versions }, run, out);
}
/** A group worker continues only from its team's coordinator or the lead; a team's own job only through the round driver. */
async function checkGroupContinuation(
	membership: GroupIdentity,
	cwd: string,
	options: ContinueOptions,
	round: number | undefined,
): Promise<void> {
	if ((membership.member?.role === "coordinator") !== (round !== undefined)) {
		throw refused(
			"GROUP_TEAM_JOB",
			"a team's own job continues only into its next group round, which Limen starts; continue a worker instead",
		);
	}
	if (options.timeoutMs) {
		throw usageError("GROUP_LAUNCH_FLAGS", "group continuations keep the recorded deadline; omit --timeout");
	}
	if (round === undefined) {
		const caller = await groupIdentity(cwd, membership.run.id);
		if (
			!caller ||
			(caller.member && (caller.member.role !== "coordinator" || caller.member.team !== membership.member?.team))
		) {
			throw refused("GROUP_NOT_ALLOWED", "only this team's coordinator or the recorded lead may continue its worker");
		}
	}
	const route = teamRoute(membership.run, membership.member?.team ?? "");
	if (
		options.engine !== route.engine ||
		options.model !== route.model ||
		options.provider !== route.provider ||
		options.thinking !== route.thinking
	) {
		throw usageError("GROUP_ROUTE", "group continuation requires recorded engine/provider/model/reasoning explicitly");
	}
}
/**
 * The finished parent job: worktree, the jobs on it, branch, repo, engine, newest session transcript and `--engine`,
 * in that order.
 */
async function readParentJob(
	view: StateView,
	root: string,
	parentId: string,
	parentDir: string,
	{ engine, onlyNewest }: Pick<ContinueOptions, "engine" | "onlyNewest">,
): Promise<ParentJob> {
	// A terminal state is final (nothing writes after it), so the parent's state needs no re-check.
	const record = await view.record(parentDir);
	if (!(record && isTerminal(record.state))) {
		throw refused(
			"JOB_NOT_FINISHED",
			`job ${parentId} is ${record?.state ?? "stateless"}; continue needs a finished job`,
		);
	}
	const worktree = record.worktree;
	if (!worktree) {
		throw refused("JOB_NO_WORKTREE", `parent record ${parentId} has no worktree path`);
	}
	await view.hold(`the jobs on worktree ${worktree}`, () =>
		assertNoLiveContinuation(view, root, parentId, worktree, onlyNewest),
	);
	const branch = record.branch;
	if (!branch) {
		throw refused("JOB_NO_BRANCH", `parent record ${parentId} has no branch`);
	}
	const repo = record.repo ?? "";
	// Checked before the transcript: a record of a removed engine may hold none, and it refuses with its own line.
	const parentEngine = engineProfile(record.route.engine || "pi").id;
	const sessions = (await readdir(`${parentDir}/session`).catch(() => [])).filter((name) => name.endsWith(".jsonl"));
	if (sessions.length === 0) {
		throw refused("JOB_NO_SESSION", `parent record ${parentId} has no session transcript to continue`);
	}
	const session = sessions.sort().at(-1);
	if (engine) {
		const requested = resolveSpawnEngine(engine);
		if (requested.id !== parentEngine) {
			throw usageError("ENGINE_MISMATCH", `continue --engine ${engine} does not match parent engine ${parentEngine}`);
		}
	}
	return { id: parentId, dir: parentDir, record, worktree, branch, repo, session, engine: parentEngine };
}
/**
 * LIVE_CONTINUATION (D-097 (5) (d), z. 14): one worktree runs one job at a time, so a continuation of any job, a group
 * member's, an ordinary job's or the sweep's resume after the subscription limit, refuses while another record on the
 * parent's worktree has not finished. The answer it holds is the newest record on the worktree: a continuation that another
 * process published between this validate and its apply ends this one in STATE_CHANGED, also once that one has ended,
 * so two resumes of one parent never both start. A later continuation of the same parent, once the first has ended, is
 * a choice of its caller and starts, unless `onlyNewest` asks for the newest record, as the sweep's resume does: one
 * that another path continued since the sweep read it is refused too, a race the sweep names in a line.
 */
async function assertNoLiveContinuation(
	view: StateView,
	root: string,
	parentId: string,
	worktree: string,
	onlyNewest: boolean,
): Promise<string> {
	const { newest, live } = await worktreeJobs(root, worktree, view);
	const other = live.find((id) => id !== parentId);
	if (other !== undefined) {
		throw refused(
			"LIVE_CONTINUATION",
			`job ${other} has not finished on the worktree ${worktree} of job ${parentId}, and one worktree runs one job at a time; continue once its wake comes`,
			`limen show ${other}`,
		);
	}
	if (onlyNewest && newest !== undefined && newest !== parentId) {
		throw refused(
			"LIVE_CONTINUATION",
			`job ${newest} took over the worktree ${worktree} of job ${parentId} after it, so a resume of ${parentId} would run on work that ${newest} holds now`,
			`limen show ${newest}`,
		);
	}
	return newest ?? parentId;
}
/** A group worker keeps its team's recorded extensions; any other job takes --extension or inherits its parent's. */
async function continuationExtensions(
	parent: ParentJob,
	membership: GroupIdentity | undefined,
	selected: readonly string[],
	cwd: string,
): Promise<string[]> {
	const recorded = membership?.run.teamExtensions?.[membership.member?.team ?? ""];
	const extensions = recorded
		? await normalizeWorkerExtensions(recorded, cwd, "record")
		: selected.length
			? await normalizeWorkerExtensions(selected, cwd)
			: await readWorkerExtensions(parent.dir, parent.record);
	if (recorded) {
		if (JSON.stringify(await readWorkerExtensions(parent.dir, parent.record)) !== JSON.stringify(extensions)) {
			throw refused("GROUP_EXTENSIONS_PARENT", "group continuation parent does not match the recorded team extensions");
		}
		if (
			selected.length &&
			JSON.stringify(await normalizeWorkerExtensions(selected, cwd)) !== JSON.stringify(extensions)
		) {
			throw usageError(
				"GROUP_EXTENSIONS",
				"group continuation requires the recorded team extensions; omit --extension to inherit them",
			);
		}
	}
	return extensions;
}
/** Writes the starting record: the parent's session, branch and worktree, and where its finish is reported. */
async function publishContinuation(record: ContinuationRecord): Promise<void> {
	const { jobDir, parent, repository, membership } = record;
	const { notificationSession, coordinatorTab, coordinatorPane } = record.route;
	await publishJob(jobDir, {
		task: `${record.task}\n`,
		context: record.context,
		label: record.label,
		branch: parent.branch,
		worktree: parent.worktree,
		base: existsSync(parent.worktree) ? headCommit(parent.worktree) : branchCommit(repository, parent.branch),
		role: record.role,
		engine: record.engine,
		priority: record.priority,
		extensions: record.extensions,
		...(record.model ? { model: record.model } : {}),
		...(record.provider ? { provider: record.provider } : {}),
		...(record.thinking ? { thinking: record.thinking } : {}),
		parent: parent.id,
		session: { source: `${parent.dir}/session/${parent.session}`, name: parent.session ?? "" },
		...(parent.repo ? { repo: parent.repo } : {}),
		...(!membership && notificationSession ? { notificationSession } : {}),
		...(coordinatorTab ? { originTab: coordinatorTab } : {}),
		...(coordinatorPane ? { originPane: coordinatorPane } : {}),
		...(record.group ? { group: { id: record.group.id, team: record.group.team } } : {}),
		...(record.quotaAttempt === undefined ? {} : { quotaAttempt: record.quotaAttempt }),
	});
}
async function restoreParentWorktree(
	jobDir: string,
	repository: string,
	worktree: string,
	branch: string,
	out: CommandText,
): Promise<void> {
	try {
		// Publication protects the checkout before restoration. Prune during hidden writes may remove
		// an old finished checkout; restore it only after the complete starting record is visible.
		if (!existsSync(worktree)) {
			addBranchWorktree(repository, worktree, branch);
			out.line(`restored ${worktree} from ${branch}; only committed branch contents were recovered`);
		}
	} catch (error) {
		throw await cleanedUp(error, () => rm(jobDir, { recursive: true, force: true }));
	}
}
async function startDetachedContinuation(
	continuation: Continuation,
	run: GroupRun | undefined,
	out: CommandText,
): Promise<void> {
	const { jobDir, id, label, root, parentId, versions, group } = continuation;
	await openWatchTab({ jobDir, label, cwd: root, logPath: `${jobDir}/log`, role: continuation.role });
	const environment: WrapperValues = {
		LIMEN_JOB_DIR: jobDir,
		LIMEN_WORKTREE: continuation.worktree,
		LIMEN_TASK_FILE: `${jobDir}/task.md`,
		LIMEN_JOB_ID: id,
		LIMEN_LABEL: label,
		LIMEN_CONTEXT_ROOT: root,
		LIMEN_CONTINUE: "1",
		LIMEN_PROVIDER: continuation.provider ?? "",
		LIMEN_THINKING: continuation.thinking ?? "",
	};
	if (group) {
		environment.LIMEN_GROUP_ID = group.id;
		environment.LIMEN_TEAM_ID = group.team;
		environment.LIMEN_TIMEOUT_MS = String(Math.max(1, group.deadline - Date.now()));
	}
	if (continuation.timeoutMs) {
		environment.LIMEN_TIMEOUT_MS = String(continuation.timeoutMs);
	}
	if (continuation.model) {
		environment.LIMEN_MODEL = continuation.model;
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
	if (run) {
		await syncLifecycle(run, "skip");
	}
	const queued = await queuedLine(jobDir, label);
	const state = (await readRecord(jobDir))?.state;
	if (state !== "running") {
		out.line(`${state} ${label}`);
		out.line(id);
		return;
	}
	await versions.catch(() => {});
	if (queued) {
		out.line(queued);
	}
	out.line(`continued ${label} in ${parentId}'s session`);
	out.line(id);
}
