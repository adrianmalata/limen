import { readdir, readFile, stat } from "node:fs/promises";
import { dirname, isAbsolute } from "node:path";
import { atomicWrite, TEMPORARY_NAME } from "../atomic-write.ts";
import { groupAdvanceEnvironment, transport } from "../config.ts";
import { withLock } from "../lock.ts";
import { stateChanged } from "../operation.ts";
import { type LimenError, refused, usageError } from "../outcome.ts";
import { platform } from "../platform/platform.ts";
import { limenRoot } from "../project/git.ts";
import { startLimen } from "../runtime/launcher.ts";
import { ownerState } from "../runtime/reap.ts";
import { isTerminal, SESSION_ID } from "./job.ts";
import { readRecord } from "./record.ts";

export type GroupMember = {
	id: string;
	team: string;
	role: "coordinator" | "worker";
	parent?: string;
	deadline: number;
	/** The round a team's own job works; workers carry none. */
	round?: number;
};
/** One team's model route: every job of that team runs on it. */
export type TeamRoute = { engine: string; provider: string; model: string; thinking: string };
export type GroupRun = {
	id: string;
	root: string;
	feature: string;
	lead: string;
	/** The Herdr pane the lead started the group from; the group result goes there when the lead hook is not running. */
	leadPane?: string;
	startedAt: number;
	teams: string[];
	routes: Record<string, TeamRoute>;
	workersPerTeam: number;
	/** Round names in order; the first is every team's first job. */
	rounds: string[];
	/** Index of the round now running. */
	round: number;
	/** Set once the last round ended; the lead hears the result once. */
	finishedAt?: number;
	deadline: number;
	reserveMs: number;
	stopped: boolean;
	closed: boolean;
	members: GroupMember[];
	teamExtensions?: Record<string, string[]>;
	/**
	 * The team whose first-round job a group start could not start, with why and when: the start's failed step, until
	 * the same start run again starts every team (src/job/group-control.ts). A run written before R-092 has none.
	 */
	startFailure?: { team: string; message: string; at: number };
};
export type GroupIdentity = { run: GroupRun; member?: GroupMember; recipient: string };
export const groupPath = (run: Pick<GroupRun, "root" | "id">): string => `${run.root}/.limen/groups/${run.id}`;
export function teamRoute(run: GroupRun, team: string): TeamRoute {
	const route = run.routes?.[team];
	if (!route) {
		throw refused(
			"GROUP_NO_ROUTE",
			`group ${run.feature} (${run.id}) has no recorded route for ${team}; it predates per-team routes, so stop it and start a new run`,
			`limen group stop ${run.id}`,
		);
	}
	return route;
}
/** The team's own jobs in one round, newest last. */
export const roundJobs = (run: GroupRun, round: number): GroupMember[] =>
	run.members.filter((member) => member.role === "coordinator" && (member.round ?? 0) === round);
/**
 * The run `id` of the project at `root`. `source` says where the id comes from: the command line or a member's own
 * environment, whose id that names no run is a usage error (exit 2), or a job's record, whose group is gone or
 * malformed: a refusal (exit 1), since the command itself was well formed (T-02).
 */
export async function readRun(root: string, id: string, source: "argument" | "record" = "argument"): Promise<GroupRun> {
	const fromRecord = source === "record";
	if (!/^[a-zA-Z0-9-]+$/.test(id)) {
		const message = `invalid group ID ${JSON.stringify(id)}; run limen group start FEATURE with the group settings`;
		throw fromRecord ? refused("RECORD_GROUP_ID", message) : usageError("BAD_GROUP_ID", message);
	}
	let record: string;
	try {
		record = await readFile(`${root}/.limen/groups/${id}/run.json`, "utf8");
	} catch (error) {
		if ((error as NodeJS.ErrnoException).code !== "ENOENT") {
			throw error;
		}
		const message = `no group record for ${id}; run limen group start FEATURE with the group settings`;
		throw fromRecord ? refused("GROUP_GONE", message) : usageError("GROUP_NOT_FOUND", message);
	}
	const run = JSON.parse(record) as GroupRun;
	// A run recorded before rounds had one round of team jobs; without routes it never advances.
	run.rounds ??= ["draft"];
	run.round ??= 0;
	if ("teamExtensions" in run) {
		const selections = run.teamExtensions;
		if (
			!selections ||
			typeof selections !== "object" ||
			Array.isArray(selections) ||
			Object.keys(selections).length !== run.teams.length ||
			!run.teams.every(
				(team) =>
					Object.hasOwn(selections, team) &&
					Array.isArray(selections[team]) &&
					selections[team]?.every((path) => typeof path === "string" && isAbsolute(path)),
			)
		) {
			throw refused(
				"GROUP_RECORD",
				`invalid teamExtensions in group ${id}: expected complete team lists of absolute local paths`,
			);
		}
	}
	return run;
}
export async function saveJson(path: string, value: unknown): Promise<void> {
	await atomicWrite(path, `${JSON.stringify(value, null, 2)}\n`);
}
/**
 * The group registry's lock on `directory`, for the cabinet, a launch, prune and the start queue: one call of the lock
 * module (src/lock.ts, A-018), which takes over the lock of a gone owner and never evicts a live one. `wait`, the
 * default, waits at most 60 s; `skip` makes one attempt and returns undefined while a live owner holds the lock.
 */
export function groupLock<T>(directory: string, operation: () => Promise<T>, mode: "skip"): Promise<T | undefined>;
export function groupLock<T>(directory: string, operation: () => Promise<T>, mode?: "wait"): Promise<T>;
export function groupLock<T>(
	directory: string,
	operation: () => Promise<T>,
	mode?: "skip" | "wait",
): Promise<T | undefined> {
	return mode === "skip"
		? withLock({ folder: directory }, operation, { mode: "skip" })
		: withLock({ folder: directory }, operation);
}
export async function runs(root: string): Promise<GroupRun[]> {
	const result: GroupRun[] = [];
	for (const id of await readdir(`${root}/.limen/groups`).catch(() => [])) {
		if (id.startsWith(".")) {
			continue;
		}
		result.push(await readRun(root, id));
	}
	return result.sort((left, right) => left.startedAt - right.startedAt);
}
export async function groupIdentity(cwd: string, explicitId?: string): Promise<GroupIdentity | undefined> {
	const memberId = transport("LIMEN_JOB_ID");
	const groupId = transport("LIMEN_GROUP_ID");
	if (groupId) {
		const root = transport("LIMEN_CONTEXT_ROOT");
		if (!root || !memberId) {
			throw refused(
				"GROUP_CONTEXT",
				"this job has incomplete group membership; run limen status --all to inspect its job record",
				"limen status --all",
			);
		}
		const run = await readRun(root, groupId);
		const member = run.members.find((entry) => entry.id === memberId);
		if (!member || member.team !== transport("LIMEN_TEAM_ID") || (explicitId && explicitId !== run.id)) {
			throw refused(
				"GROUP_ROSTER",
				`this job does not match group ${run.feature} (${run.id})'s roster; run limen show ${memberId}`,
			);
		}
		return { run, member, recipient: member.id };
	}
	if (!explicitId) {
		return;
	}
	const run = await readRun(limenRoot(cwd), explicitId);
	if (!run.lead || run.lead !== (await leadSession(run.root))) {
		throw refused(
			"GROUP_OTHER_LEAD",
			`group ${run.feature} (${run.id}) belongs to another lead pane; return to that pane and run limen group status ${run.id}`,
		);
	}
	return { run, recipient: `lead-${run.lead}` };
}
// A lead whose commands get no `PI_SESSION_ID` has no session to declare, so a registered lead is also recognized as a
// live ancestor process.
export async function leadSession(root: string): Promise<string | undefined> {
	const declared = process.env.PI_SESSION_ID?.trim();
	if (declared) {
		return declared;
	}
	const listeners = new Map<number, string>();
	for (const session of await readdir(`${root}/.limen/group-leads`).catch(() => [])) {
		const pid = Number(await readFile(`${root}/.limen/group-leads/${session}`, "utf8").catch(() => ""));
		if (SESSION_ID.test(session) && !TEMPORARY_NAME.test(session) && Number.isSafeInteger(pid) && pid > 1) {
			listeners.set(pid, session);
		}
	}
	let pid = process.ppid;
	for (let hop = 0; listeners.size && hop < 32 && pid > 1; hop++) {
		const session = listeners.get(pid);
		if (session) {
			return session;
		}
		const parent = await platform.processInfo(pid);
		if (parent.kind !== "present") {
			return;
		}
		pid = parent.process.ppid;
	}
}
/** How long a lead registration stays live after the group-peer hook last finished a delivery sweep. The hook sweeps every second. */
const LEAD_HEARTBEAT_MS = 30_000;
/**
 * The lead hook is live when its registration names a live process and the hook refreshed it recently.
 * A process alone is not proof: a pane can run without hook/group-peer.ts, and a hand-written registration never refreshes.
 */
export async function leadHookLive(root: string, session: string, now = Date.now()): Promise<boolean> {
	const path = `${root}/.limen/group-leads/${session}`;
	const [pid, info] = await Promise.all([
		readFile(path, "utf8").then(Number, () => 0),
		stat(path).catch(() => undefined),
	]);
	return Boolean(
		info &&
			now - info.mtimeMs < LEAD_HEARTBEAT_MS &&
			Number.isSafeInteger(pid) &&
			pid > 1 &&
			platform.processAlive(pid),
	);
}
export async function commandRoot(cwd: string): Promise<string> {
	return (await groupIdentity(cwd))?.run.root ?? limenRoot(cwd);
}
/**
 * Why `run` has no launch slot for a `role` job of `team` in `round`, or undefined when it has one: one team job per
 * round, the recorded number of workers per team, before the deadline and, for a worker, before the team's wrap-up
 * reserve. Validate refuses with it (T-38 (1)); the claim reads it again under the cabinet lock.
 */
export function memberSlotProblem(
	run: GroupRun,
	team: string,
	role: GroupMember["role"],
	round = 0,
	now = Date.now(),
	givenBack: readonly string[] = [],
): LimenError | undefined {
	const status = `limen group status ${run.id}`;
	if (run.stopped || run.closed || now >= run.deadline) {
		return refused(
			"GROUP_CLOSED",
			`group ${run.feature} (${run.id}) is stopped, closed, or past its deadline; run limen group status ${run.id}`,
			status,
		);
	}
	if (!run.teams.includes(team)) {
		return refused(
			"GROUP_TEAM_UNKNOWN",
			`${team} is not in group ${run.feature} (${run.id})'s roster; run limen group status ${run.id}`,
			status,
		);
	}
	const used = run.members.filter(
		(entry) =>
			entry.team === team &&
			entry.role === role &&
			(role === "worker" || (entry.round ?? 0) === round) &&
			!givenBack.includes(entry.id),
	).length;
	if (used >= (role === "coordinator" ? 1 : run.workersPerTeam)) {
		return refused(
			"GROUP_ALLOWANCE",
			`${team} has used its ${role === "coordinator" ? `round ${round + 1} job` : "worker"} allowance; run limen group status ${run.id} before asking the lead`,
			status,
		);
	}
	if (memberDeadline(run, role) <= now) {
		return refused(
			"GROUP_NO_TIME",
			`group ${run.feature} (${run.id}) has no worker time left before the team wraps up; run limen group status ${run.id}`,
			status,
		);
	}
	return undefined;
}

/** The deadline of a `role` job of `run`: the run's own, or for a worker its wrap-up reserve earlier. */
function memberDeadline(run: GroupRun, role: GroupMember["role"]): number {
	return role === "coordinator" ? run.deadline : run.deadline - run.reserveMs;
}

/**
 * Whether the job of `member` never ran: it has no record, or its record ended without ever running, as a launch that
 * failed after its member was claimed leaves it (T-38 (3)). Such a member gives its slot back to the start that runs
 * again (src/job/group-control.ts).
 */
export async function neverRan(run: Pick<GroupRun, "root">, member: GroupMember): Promise<boolean> {
	const record = await readRecord(`${run.root}/.limen/jobs/${member.id}`);
	return (
		record === undefined ||
		(isTerminal(record.state) && !record.transitions.some((transition) => transition.to === "running"))
	);
}

/**
 * Claims a launch slot under the cabinet lock: the first write of a launch's `apply` (src/operation.ts). The launch's
 * validate found the slot free (`memberSlotProblem`), so a slot gone by now is a group that changed since then,
 * STATE_CHANGED (T-38 (2)), with nothing written. `replaces` names members whose jobs never ran (`neverRan`), whose
 * slots this claim takes; one that has run since then is a change as well.
 */
export async function claimMember(
	run: GroupRun,
	team: string,
	role: GroupMember["role"],
	id: string,
	parent?: string,
	round = 0,
	replaces: readonly string[] = [],
): Promise<GroupMember> {
	return groupLock(
		groupPath(run),
		async () => {
			const current = await readRun(run.root, run.id);
			for (const replaced of current.members.filter((member) => replaces.includes(member.id))) {
				if (!(await neverRan(current, replaced))) {
					throw stateChanged(`the job ${replaced.id} of ${team} in group ${current.feature} (${current.id})`);
				}
			}
			const problem = memberSlotProblem(current, team, role, round, Date.now(), replaces);
			if (problem) {
				throw stateChanged(`the launch slots of group ${current.feature} (${current.id}): ${problem.message}`);
			}
			const member: GroupMember = {
				id,
				team,
				role,
				deadline: memberDeadline(current, role),
				...(parent ? { parent } : {}),
				...(role === "coordinator" ? { round } : {}),
			};
			current.members.push(member);
			await saveJson(`${groupPath(run)}/run.json`, current);
			return member;
		},
		"wait",
	);
}
/**
 * Runs `limen group advance` in its own process: a team job that ended may start the next round or finish the group.
 * Its environment holds no transport name of the finished job (`groupAdvanceEnvironment`).
 */
export function startGroupAdvance(run: GroupRun): void {
	startLimen(["group", "advance", run.id], { cwd: run.root, env: groupAdvanceEnvironment() });
}
export async function jobMembership(jobDir: string): Promise<GroupIdentity | undefined> {
	const id = (await readRecord(jobDir))?.group;
	if (!id) {
		return;
	}
	const root = dirname(dirname(dirname(jobDir)));
	const run = await readRun(root, id, "record");
	const member = run.members.find((entry) => `${root}/.limen/jobs/${entry.id}` === jobDir);
	if (!member) {
		throw refused(
			"GROUP_ROSTER",
			`job ${jobDir.split("/").at(-1)} is absent from group ${run.feature} (${run.id})'s roster; run limen group status ${run.id}`,
			`limen group status ${run.id}`,
		);
	}
	return { run, member, recipient: member.id };
}
export async function retainedGroupJob(jobDir: string): Promise<boolean> {
	return Boolean((await jobMembership(jobDir))?.run.closed === false);
}
/**
 * Why a member job is not over, or undefined when it is: its state says starting or running, the process its record
 * names still runs (its finish runs in that process after the terminal record), or it has no record yet. A process
 * that cannot be checked counts as running. Its worktree plays no part.
 */
export async function memberLive(root: string, member: GroupMember): Promise<string | undefined> {
	const record = await readRecord(`${root}/.limen/jobs/${member.id}`);
	if (!record) {
		return "it has no job record yet";
	}
	if (record.state === "starting" || record.state === "running") {
		return `its state is ${record.state}`;
	}
	if ((await ownerState(record.identity)) === "alive") {
		return `its owner process ${record.identity?.pid} still runs or cannot be checked`;
	}
	return undefined;
}
