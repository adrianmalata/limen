import { spawn } from "node:child_process";
import { existsSync } from "node:fs";
import { readdir, readFile, stat } from "node:fs/promises";
import { dirname, isAbsolute } from "node:path";
import { fileURLToPath } from "node:url";
import { atomicWrite, TEMPORARY_NAME } from "../atomic-write.ts";
import { groupAdvanceEnvironment, transport } from "../config.ts";
import { withLock } from "../lock.ts";
import { platform } from "../platform/platform.ts";
import { limenRoot } from "../project/git.ts";
import { SESSION_ID } from "./job.ts";

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
};
export type GroupIdentity = { run: GroupRun; member?: GroupMember; recipient: string };
export const groupPath = (run: Pick<GroupRun, "root" | "id">): string => `${run.root}/.limen/groups/${run.id}`;
export function teamRoute(run: GroupRun, team: string): TeamRoute {
	const route = run.routes?.[team];
	if (!route) {
		throw new Error(
			`group ${run.feature} (${run.id}) has no recorded route for ${team}; it predates per-team routes, so stop it and start a new run`,
		);
	}
	return route;
}
/** The team's own jobs in one round, newest last. */
export const roundJobs = (run: GroupRun, round: number): GroupMember[] =>
	run.members.filter((member) => member.role === "coordinator" && (member.round ?? 0) === round);
export async function readRun(root: string, id: string): Promise<GroupRun> {
	if (!/^[a-zA-Z0-9-]+$/.test(id)) {
		throw new Error(`invalid group ID ${JSON.stringify(id)}; run limen group start FEATURE with the group settings`);
	}
	let record: string;
	try {
		record = await readFile(`${root}/.limen/groups/${id}/run.json`, "utf8");
	} catch (error) {
		if ((error as NodeJS.ErrnoException).code !== "ENOENT") {
			throw error;
		}
		throw new Error(`no group record for ${id}; run limen group start FEATURE with the group settings`);
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
			throw new Error(`invalid teamExtensions in group ${id}: expected complete team lists of absolute local paths`);
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
			throw new Error("this job has incomplete group membership; run limen status --all to inspect its job record");
		}
		const run = await readRun(root, groupId);
		const member = run.members.find((entry) => entry.id === memberId);
		if (!member || member.team !== transport("LIMEN_TEAM_ID") || (explicitId && explicitId !== run.id)) {
			throw new Error(`this job does not match group ${run.feature} (${run.id})'s roster; run limen show ${memberId}`);
		}
		return { run, member, recipient: member.id };
	}
	if (!explicitId) {
		return;
	}
	const run = await readRun(limenRoot(cwd), explicitId);
	if (!run.lead || run.lead !== (await leadSession(run.root))) {
		throw new Error(
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
/** Claims a launch slot: one team job per round, and the recorded number of workers per team. */
export async function claimMember(
	run: GroupRun,
	team: string,
	role: GroupMember["role"],
	id: string,
	parent?: string,
	round = 0,
): Promise<GroupMember> {
	return groupLock(
		groupPath(run),
		async () => {
			const current = await readRun(run.root, run.id);
			if (current.stopped || current.closed || Date.now() >= current.deadline) {
				throw new Error(
					`group ${current.feature} (${current.id}) is stopped, closed, or past its deadline; run limen group status ${current.id}`,
				);
			}
			if (!current.teams.includes(team)) {
				throw new Error(
					`${team} is not in group ${current.feature} (${current.id})'s roster; run limen group status ${current.id}`,
				);
			}
			const used = current.members.filter(
				(entry) => entry.team === team && entry.role === role && (role === "worker" || (entry.round ?? 0) === round),
			).length;
			if (used >= (role === "coordinator" ? 1 : current.workersPerTeam)) {
				throw new Error(
					`${team} has used its ${role === "coordinator" ? `round ${round + 1} job` : "worker"} allowance; run limen group status ${current.id} before asking the lead`,
				);
			}
			const deadline = role === "coordinator" ? current.deadline : current.deadline - current.reserveMs;
			if (deadline <= Date.now()) {
				throw new Error(
					`group ${current.feature} (${current.id}) has no worker time left before the team wraps up; run limen group status ${current.id}`,
				);
			}
			const member: GroupMember = {
				id,
				team,
				role,
				deadline,
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
	const limen = fileURLToPath(new URL("../../bin/limen", import.meta.url));
	const child = spawn(process.execPath, [limen, "group", "advance", run.id], {
		cwd: run.root,
		detached: true,
		stdio: "ignore",
		env: groupAdvanceEnvironment(),
	});
	// An advance that cannot start leaves the round for the next finish or `limen group status`.
	child.once("error", () => {});
	child.unref();
}
export async function jobMembership(jobDir: string): Promise<GroupIdentity | undefined> {
	const id = (await readFile(`${jobDir}/group`, "utf8").catch(() => "")).trim();
	if (!id) {
		return;
	}
	const root = dirname(dirname(dirname(jobDir)));
	const run = await readRun(root, id);
	const member = run.members.find((entry) => `${root}/.limen/jobs/${entry.id}` === jobDir);
	if (!member) {
		throw new Error(
			`job ${jobDir.split("/").at(-1)} is absent from group ${run.feature} (${run.id})'s roster; run limen group status ${run.id}`,
		);
	}
	return { run, member, recipient: member.id };
}
export async function retainedGroupJob(jobDir: string): Promise<boolean> {
	return Boolean((await jobMembership(jobDir))?.run.closed === false);
}
/**
 * Why a member job is not over, or undefined when it is: its state says running, a process it recorded may still run,
 * or it has no record yet. A process that cannot be checked counts as running. Its worktree plays no part.
 */
export async function memberLive(root: string, member: GroupMember): Promise<string | undefined> {
	const dir = `${root}/.limen/jobs/${member.id}`;
	const state = (await readFile(`${dir}/state`, "utf8").catch(() => "")).trim();
	if (state === "running") {
		return "its state is running";
	}
	const pid = Number(await readFile(`${dir}/pid`, "utf8").catch(() => ""));
	if (pid > 0 && (await platform.processInfo(pid)).kind !== "absent") {
		return `its process ${pid} still runs or cannot be checked`;
	}
	const owner = JSON.parse(await readFile(`${dir}/group-owner.json`, "utf8").catch(() => "null")) as {
		pid: number;
		born: string;
	} | null;
	const info = owner ? await platform.processInfo(owner.pid) : undefined;
	if (info?.kind === "unavailable" || (info?.kind === "present" && info.process.born === owner?.born)) {
		return `its owner process ${owner?.pid} ${info.kind === "present" ? "still runs" : "cannot be checked"}`;
	}
	return !state && !existsSync(`${dir}/finished-at`) ? "it has no job record yet" : undefined;
}
