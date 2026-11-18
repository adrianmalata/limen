import { existsSync } from "node:fs";
import { readdir, readFile, rm, writeFile } from "node:fs/promises";
import { openWatchTab } from "../integrations/herdr.ts";
import {
	claimMember,
	commandRoot,
	type GroupIdentity,
	type GroupRun,
	groupIdentity,
	groupLock,
	groupPath,
	jobMembership,
	teamRoute,
} from "../job/group-cabinet.ts";
import { syncLifecycle } from "../job/group-events.ts";
import { isTerminal, makeJobId, parseDuration } from "../job/job.ts";
import { resolveJob } from "../job/lookup.ts";
import { publishJob } from "../job/publication.ts";
import { atomicWrite, finalizeJob } from "../job/record.ts";
import { refuseRemovedFlags } from "../old-names.ts";
import {
	addBranchWorktree,
	branchCommit,
	branchExists,
	headCommit,
	repoRoot,
	workspaceRepository,
	workspaceRoot,
} from "../project/git.ts";
import {
	inheritedPlanning,
	type PlanningSource,
	privatePlanningTask,
	recordedPlanningSource,
	ticketPointers,
} from "../project/planning.ts";
import {
	defaultModel,
	type EngineId,
	type EngineProfile,
	engineProfile,
	preflightEngine,
	resolveSpawnEngine,
} from "../runtime/engine.ts";
import { jobPriority, parsePriority, queuedLine } from "../runtime/start-queue.ts";
import { normalizeWorkerExtensions, readWorkerExtensions } from "../runtime/worker-extensions.ts";
import { launchWrapper } from "../runtime/wrapper.ts";
import { parseFlags } from "./flags.ts";
import {
	capturedVersions,
	currentNotificationSession,
	herdrWakePane,
	normalizeLabel,
	resolvePreamble,
	waitForHandshake,
} from "./spawn.ts";

/**
 * Resume a finished job's own engine session; restore a pruned checkout from its branch.
 * `round` is set only by the group round driver, which holds the launch lock and continues a team's own job.
 */
export async function continueCommand(args: readonly string[], cwd: string, round?: number): Promise<void> {
	await continueJob(args, cwd, round !== undefined, round);
}
type ContinueOptions = {
	readonly review: boolean;
	readonly label: string | undefined;
	readonly model: string | undefined;
	readonly provider: string | undefined;
	readonly thinking: string | undefined;
	readonly engine: string | undefined;
	readonly timeoutMs: number | undefined;
	readonly priority: number | undefined;
	readonly selected: readonly string[];
	readonly query: string;
	readonly instruction: string;
};
function parseContinueArgs(args: readonly string[]): ContinueOptions {
	const { values, positionals } = parseFlags(
		args,
		{
			review: { type: "boolean" },
			// Removed: refused after parsing (src/old-names.ts).
			tab: { type: "boolean" },
			// Every job is detached; the flag stays accepted and changes nothing.
			detached: { type: "boolean" },
			// Every label is checked, the last one is used.
			label: { type: "string", multiple: true },
			model: { type: "string" },
			provider: { type: "string" },
			thinking: { type: "string" },
			engine: { type: "string" },
			timeout: { type: "string" },
			priority: { type: "string" },
			extension: { type: "string", multiple: true },
		} as const,
		{
			unknown: (word) => `unknown continue option ${word}`,
			missing: (flag) => `${flag} requires a value`,
			dashValues: ["label", "model", "provider", "thinking", "engine", "timeout", "priority"],
			endOfFlags: false,
		},
	);
	refuseRemovedFlags("continue", values);
	const label = values.label?.map(normalizeLabel).at(-1);
	// An empty word, such as an unset shell variable, is dropped.
	const [query, ...words] = positionals.filter((word) => word !== "");
	const instruction = words.join(" ").trim();
	if (!query || !instruction) {
		throw new Error('continue requires <id|suffix|label> "follow-up instruction"');
	}
	const review = values.review ?? false;
	const { model, provider, thinking } = values;
	const engine = values.engine?.trim();
	return {
		review,
		label,
		model,
		provider,
		thinking,
		engine,
		timeoutMs: values.timeout === undefined ? undefined : parseDuration(values.timeout),
		priority: parsePriority(values.priority),
		selected: values.extension ?? [],
		query,
		instruction,
	};
}
type ParentJob = {
	readonly id: string;
	readonly dir: string;
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
	readonly label: string;
	readonly role: string;
	readonly engine: EngineId;
	readonly model: string | undefined;
	readonly extensions: readonly string[];
	readonly priority: number;
	readonly source: PlanningSource;
	readonly membership: GroupIdentity | undefined;
	readonly group: ContinuationGroup | undefined;
};
/** A published continuation, ready to start as a detached wrapper. */
type Continuation = {
	readonly id: string;
	readonly jobDir: string;
	readonly root: string;
	readonly worktree: string;
	readonly label: string;
	readonly preamble: string;
	readonly role: string;
	readonly parentId: string;
	readonly review: boolean;
	readonly model: string | undefined;
	readonly provider: string | undefined;
	readonly thinking: string | undefined;
	readonly versions: Promise<void>;
	readonly group: ContinuationGroup | undefined;
	readonly timeoutMs: number | undefined;
};
async function continueJob(args: readonly string[], cwd: string, locked = false, round?: number): Promise<void> {
	const options = parseContinueArgs(args);
	const { review, label, model, provider, thinking } = options;
	const chosenModel = model ?? defaultModel(review);

	// A job that continues from its own worktree resolves jobs in its canonical root.
	const inherited = workspaceRoot(cwd) ? undefined : inheritedPlanning(repoRoot(cwd));
	const root = inherited?.root ?? (await commandRoot(cwd));
	const { id: parentId, jobDir: parentDir } = await resolveJob(root, options.query, "control");
	const membership = await jobMembership(parentDir);
	if (membership) {
		await checkGroupContinuation(membership, cwd, options, round);
		if (!locked) {
			await groupLock(`${groupPath(membership.run)}/launch`, () => continueJob(args, cwd, true), "wait");
			return;
		}
	}
	const parent = await readParentJob(root, parentId, parentDir, membership, options.engine);
	const profile = engineProfile(parent.engine);
	const extensions = await continuationExtensions(parentDir, membership, options.selected, cwd);
	preflightEngine(profile, chosenModel, provider);
	const source = recordedPlanningSource(parentDir);
	const followUp = await continuationTask(root, parentDir, options.instruction, source);
	const finalLabel = label ?? `${(await text(`${parentDir}/label`)) || parentId} · continue`;
	const id = makeJobId(finalLabel);
	const jobDir = `${root}/.limen/jobs/${id}`;
	const role = review ? "reviewer" : (await text(`${parentDir}/role`)) || "worker";
	const preamble = resolvePreamble(root, role);
	const slot = round === undefined ? "worker" : "coordinator";
	const member = membership?.member
		? await claimMember(membership.run, membership.member.team, slot, id, parentId, round)
		: undefined;
	const repository = parent.repo ? workspaceRepository(root, parent.repo) : root;
	if (!existsSync(parent.worktree) && !branchExists(repository, parent.branch)) {
		throw new Error(
			`parent worktree ${parent.worktree} is gone and branch ${parent.branch} is missing in ${repository}; restore that branch before continuing`,
		);
	}
	const group =
		membership && member ? { id: membership.run.id, team: member.team, deadline: member.deadline } : undefined;
	await publishContinuation({
		jobDir,
		parent,
		repository,
		task: followUp,
		label: finalLabel,
		role,
		engine: profile.id,
		model: chosenModel,
		extensions,
		// A continuation keeps its parent's place in the start-queue order unless it names its own.
		priority: options.priority ?? (await jobPriority(parentDir)),
		source,
		membership,
		group,
	});
	await restoreParentWorktree(jobDir, repository, parent.worktree, parent.branch);
	const continuation = {
		id,
		jobDir,
		root,
		worktree: parent.worktree,
		label: finalLabel,
		preamble,
		role,
		parentId,
		review,
		model: chosenModel,
		provider,
		thinking,
		group,
		timeoutMs: options.timeoutMs,
	};
	await launchContinuation(continuation, profile, membership?.run);
}
/** Marks the published job running, then starts it as a detached wrapper. */
async function launchContinuation(
	continuation: Omit<Continuation, "versions">,
	profile: EngineProfile,
	run: GroupRun | undefined,
): Promise<void> {
	const { jobDir } = continuation;
	const versions = capturedVersions(profile).then((text) =>
		writeFile(`${jobDir}/versions`, text, { flag: "wx", flush: true }),
	);
	await atomicWrite(`${jobDir}/state`, "running\n");
	if (run) {
		await syncLifecycle(run, "skip");
	}
	await startDetachedContinuation({ ...continuation, versions });
}
/** A group worker continues only from its team's coordinator or the lead; a team's own job only through the round driver. */
async function checkGroupContinuation(
	membership: GroupIdentity,
	cwd: string,
	options: ContinueOptions,
	round: number | undefined,
): Promise<void> {
	if ((membership.member?.role === "coordinator") !== (round !== undefined)) {
		throw new Error(
			"a team's own job continues only into its next group round, which Limen starts; continue a worker instead",
		);
	}
	if (options.timeoutMs) {
		throw new Error("group continuations keep the recorded deadline; omit --timeout");
	}
	if (round === undefined) {
		const caller = await groupIdentity(cwd, membership.run.id);
		if (
			!caller ||
			(caller.member && (caller.member.role !== "coordinator" || caller.member.team !== membership.member?.team))
		) {
			throw new Error("only this team's coordinator or the recorded lead may continue its worker");
		}
	}
	const route = teamRoute(membership.run, membership.member?.team ?? "");
	if (
		options.engine !== route.engine ||
		options.model !== route.model ||
		options.provider !== route.provider ||
		options.thinking !== route.thinking
	) {
		throw new Error("group continuation requires recorded engine/provider/model/reasoning explicitly");
	}
}
/** The finished parent job: worktree, branch, repo, engine, newest session transcript and `--engine`, in that order. */
async function readParentJob(
	root: string,
	parentId: string,
	parentDir: string,
	membership: GroupIdentity | undefined,
	engine: string | undefined,
): Promise<ParentJob> {
	const parentState = await text(`${parentDir}/state`);
	if (!isTerminal(parentState)) {
		throw new Error(`job ${parentId} is ${parentState || "stateless"}; continue needs a finished job`);
	}
	const worktree = await text(`${parentDir}/worktree`);
	if (!worktree) {
		throw new Error(`parent record ${parentId} has no worktree path`);
	}
	if (membership) {
		await assertNoLiveContinuation(root, parentId, worktree);
	}
	const branch = await text(`${parentDir}/branch`);
	if (!branch) {
		throw new Error(`parent record ${parentId} has no branch`);
	}
	const repo = await text(`${parentDir}/repo`);
	// Checked before the transcript: a record of a removed engine may hold none, and it refuses with its own line.
	const parentEngine = engineProfile((await text(`${parentDir}/engine`)) || "pi").id;
	const sessions = (await readdir(`${parentDir}/session`).catch(() => [])).filter((name) => name.endsWith(".jsonl"));
	if (sessions.length === 0) {
		throw new Error(`parent record ${parentId} has no session transcript to continue`);
	}
	const session = sessions.sort().at(-1);
	if (engine) {
		const requested = resolveSpawnEngine(engine);
		if (requested.id !== parentEngine) {
			throw new Error(`continue --engine ${engine} does not match parent engine ${parentEngine}`);
		}
	}
	return { id: parentId, dir: parentDir, worktree, branch, repo, session, engine: parentEngine };
}
async function assertNoLiveContinuation(root: string, parentId: string, worktree: string): Promise<void> {
	for (const existing of await readdir(`${root}/.limen/jobs`)) {
		if (existing === parentId) {
			continue;
		}
		const dir = `${root}/.limen/jobs/${existing}`;
		if ((await text(`${dir}/state`)) === "running" && (await text(`${dir}/worktree`)) === worktree) {
			throw new Error("group worker worktree already has a live continuation");
		}
	}
}
/** A group worker keeps its team's recorded extensions; any other job takes --extension or inherits its parent's. */
async function continuationExtensions(
	parentDir: string,
	membership: GroupIdentity | undefined,
	selected: readonly string[],
	cwd: string,
): Promise<string[]> {
	const recorded = membership?.run.teamExtensions?.[membership.member?.team ?? ""];
	const extensions = recorded
		? await normalizeWorkerExtensions(recorded, cwd)
		: selected.length
			? await normalizeWorkerExtensions(selected, cwd)
			: await readWorkerExtensions(parentDir);
	if (recorded) {
		if (JSON.stringify(await readWorkerExtensions(parentDir)) !== JSON.stringify(extensions)) {
			throw new Error("group continuation parent does not match the recorded team extensions");
		}
		if (
			selected.length &&
			JSON.stringify(await normalizeWorkerExtensions(selected, cwd)) !== JSON.stringify(extensions)
		) {
			throw new Error("group continuation requires the recorded team extensions; omit --extension to inherit them");
		}
	}
	return extensions;
}
/** Private planning: carry the parent's canonical ticket and check every pointer before a record exists. */
async function continuationTask(
	root: string,
	parentDir: string,
	instruction: string,
	source: PlanningSource,
): Promise<string> {
	let followUp = instruction;
	if (source !== "private") {
		return followUp;
	}
	const parentTicket = ticketPointers(await readFile(`${parentDir}/task.md`, "utf8"))[0]?.path;
	if (parentTicket && ticketPointers(followUp).length === 0) {
		followUp += `\n\nTicket: ${parentTicket}`;
	}
	followUp = await privatePlanningTask(root, followUp);
	return followUp;
}
/** Writes the starting record: the parent's session, branch and worktree, and where its finish is reported. */
async function publishContinuation(record: ContinuationRecord): Promise<void> {
	const { jobDir, parent, repository, membership } = record;
	// A continuation started from a shell with no wake route (a remote executor, a plain terminal) keeps the parent's coordinator; otherwise its finish reaches nobody.
	const callerSession = currentNotificationSession();
	const callerPane = herdrWakePane(membership ? undefined : callerSession);
	const routed = Boolean(callerSession || callerPane);
	const coordinatorTab = process.env.HERDR_TAB_ID?.trim() || (routed ? "" : await text(`${parent.dir}/origin-tab`));
	const coordinatorPane = routed ? callerPane : await text(`${parent.dir}/origin-pane`);
	const notificationSession = routed
		? callerSession
		: coordinatorPane
			? undefined
			: (await text(`${parent.dir}/origin-session`)) || undefined;
	const carried: Record<string, string> = {};
	for (const name of ["note.md", "note.first.md"]) {
		const body = await text(`${parent.dir}/${name}`);
		if (body) {
			carried[name] = `${body}\n`;
		}
	}
	await publishJob(jobDir, {
		task: `${record.task}\n`,
		label: record.label,
		branch: parent.branch,
		worktree: parent.worktree,
		base: existsSync(parent.worktree) ? headCommit(parent.worktree) : branchCommit(repository, parent.branch),
		role: record.role,
		engine: record.engine,
		priority: record.priority,
		extensions: record.extensions,
		...(record.model ? { model: record.model } : {}),
		planningSource: record.source,
		parent: parent.id,
		session: { source: `${parent.dir}/session/${parent.session}`, name: parent.session ?? "" },
		...(parent.repo ? { repo: parent.repo } : {}),
		...(!membership && notificationSession ? { notificationSession } : {}),
		...(coordinatorTab ? { originTab: coordinatorTab } : {}),
		...(coordinatorPane ? { originPane: coordinatorPane } : {}),
		...(record.group ? { group: record.group } : {}),
		carried,
	});
}
async function restoreParentWorktree(
	jobDir: string,
	repository: string,
	worktree: string,
	branch: string,
): Promise<void> {
	try {
		// Publication protects the checkout before restoration. Prune during hidden writes may remove
		// an old finished checkout; restore it only after the complete starting record is visible.
		if (!existsSync(worktree)) {
			addBranchWorktree(repository, worktree, branch);
			console.log(`restored ${worktree} from ${branch}; only committed branch contents were recovered`);
		}
	} catch (error) {
		await rm(jobDir, { recursive: true, force: true });
		throw error;
	}
}
async function startDetachedContinuation(continuation: Continuation): Promise<void> {
	const { jobDir, id, label, root, review, parentId, versions, group } = continuation;
	await openWatchTab({ jobDir, label, cwd: root, logPath: `${jobDir}/log`, role: continuation.role });
	const environment: Record<string, string> = {
		LIMEN_JOB_DIR: jobDir,
		LIMEN_WORKTREE: continuation.worktree,
		LIMEN_TASK_FILE: `${jobDir}/task.md`,
		LIMEN_PREAMBLE: continuation.preamble,
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
	const queued = await queuedLine(jobDir, label);
	const state = await text(`${jobDir}/state`);
	if (state !== "running") {
		console.log(state, label);
		console.log(id);
		return;
	}
	await versions.catch(() => {});
	if (queued) {
		console.log(queued);
	}
	console.log(
		review
			? `continued ${label} as reviewer in ${parentId}'s session — shares prior context; this review is not independent`
			: `continued ${label} in ${parentId}'s session`,
	);
	console.log(id);
}

async function text(path: string): Promise<string> {
	return readFile(path, "utf8").then(
		(value) => value.trim(),
		() => "",
	);
}
