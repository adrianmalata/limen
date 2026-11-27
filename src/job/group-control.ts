// The operations of a group (T-26 (2)): its start with one job per team, its status, a finding published to the other
// teams, and the lead's stop and close. Start and stop are operations of T-38 (src/operation.ts): their validate makes
// every check before the first write. A start's team jobs come after its run.json, each a recorded step (its member in
// run.json), so the same start run again starts the teams that have none (T-38 (3)); a stop's steps after its stopped
// flag are idempotent, so a stop run again finishes them. Their text goes to `out`, which the shared wrapper prints at
// the end.
import { randomUUID } from "node:crypto";
import { existsSync } from "node:fs";
import { mkdir } from "node:fs/promises";
import { relative, resolve } from "node:path";
import { setTimeout as delay } from "node:timers/promises";
import { atomicRename } from "../atomic-write.ts";
import { transport } from "../config.ts";
import { type Checked, cleanedUp, runOperation, type StateView, stepFailure } from "../operation.ts";
import { type CommandText, type FailureClass, failureOf, LimenError, refused, usageError } from "../outcome.ts";
import { commitHasFile, headCommit, repoRoot, worktreeState } from "../project/git.ts";
import { preflightEngine, resolveSpawnEngine } from "../runtime/engine.ts";
import { normalizeWorkerExtensions } from "../runtime/worker-extensions.ts";
import type { GroupIdentity, GroupMember, GroupRun, TeamRoute } from "./group-cabinet.ts";
import {
	groupIdentity,
	groupLock,
	groupPath,
	leadHookLive,
	leadSession,
	memberLive,
	neverRan,
	readRun,
	runs,
	saveJson,
	startGroupAdvance,
	teamRoute,
} from "./group-cabinet.ts";
import { publishEvent, syncLifecycle } from "./group-events.ts";
import { roundNames } from "./group-packet.ts";
import { teamJobLabel } from "./group-rounds.ts";
import { parseDuration, SESSION_ID } from "./job.ts";
import { readRecord, transition } from "./record.ts";
import { checkedSpawn, type SpawnedRecord, type SpawnPlan, startChecked } from "./spawning.ts";
import { stopJob } from "./stopping.ts";
import { herdrWakePane } from "./watching.ts";

const WRAP_UP_RESERVE_MS = 60_000;
const DEFAULT_TIMEOUT = "90m";
const LEVELS = ["off", "minimal", "low", "medium", "high", "xhigh"];

type GroupStartOptions = {
	readonly routes: readonly TeamRoute[];
	readonly rounds: readonly string[];
	readonly workers: string;
	readonly timeout: string;
	readonly extensions: readonly string[];
	readonly teamSelections: Readonly<Record<string, readonly string[]>>;
};
const GROUP_START =
	"run limen group start FEATURE --team ENGINE:PROVIDER/MODEL:THINKING (once per team) [--rounds draft,critique,final] [--workers N] [--timeout 90m]";
const INVALID_TEAM = `invalid --team; ${GROUP_START}, for example --team pi:openai-codex/gpt-6.1-sol:high`;

/** `limen group start` as its flags give it, before any check. */
export type GroupStartRequest = {
	readonly folder: string;
	readonly teams: readonly string[];
	readonly rounds: string | undefined;
	readonly workers: string | undefined;
	readonly timeout: string | undefined;
	readonly extensions: readonly string[];
	readonly teamExtensions: readonly string[];
};
function groupStartOptions(request: GroupStartRequest): GroupStartOptions {
	return {
		routes: request.teams.map(teamRouteFlag),
		rounds: (request.rounds ?? "draft").split(",").map((name) => name.trim()),
		workers: request.workers ?? "0",
		timeout: request.timeout ?? DEFAULT_TIMEOUT,
		extensions: request.extensions,
		teamSelections: teamExtensionPaths(request.teamExtensions),
	};
}
/** `--team ENGINE:PROVIDER/MODEL:THINKING`; the model may hold `/` and `:`, the reasoning level is last. */
function teamRouteFlag(value: string): TeamRoute {
	const route = /^([^:/\s]+):([^:/\s]+)\/(\S+):([a-z]+)$/.exec(value);
	if (!route?.[1] || !route[2] || !route[3] || !route[4] || !LEVELS.includes(route[4])) {
		throw usageError("BAD_TEAM", `${INVALID_TEAM}; the reasoning level is one of ${LEVELS.join(", ")}`);
	}
	const engine = resolveSpawnEngine(route[1]).id;
	return { engine, provider: route[2], model: route[3], thinking: route[4] };
}
function teamExtensionPaths(values: readonly string[]): Record<string, string[]> {
	const paths: Record<string, string[]> = {};
	for (const value of values) {
		const selection = /^(team-[1-9]\d*)=(.+)$/.exec(value);
		if (!selection?.[1] || !selection[2]) {
			throw usageError("BAD_TEAM_EXTENSION", "invalid --team-extension; use team-N=PATH");
		}
		paths[selection[1]] = [...(paths[selection[1]] ?? []), selection[2]];
	}
	return paths;
}
type GroupSettings = {
	readonly teams: string[];
	readonly routes: Record<string, TeamRoute>;
	readonly rounds: string[];
	readonly workersPerTeam: number;
	readonly timeout: number;
};
type GroupActivation = {
	readonly feature: string;
	readonly lead: string;
	readonly settings: GroupSettings;
	readonly options: GroupStartOptions;
};
/**
 * What group start's validate decided: a new run, or the feature's open run when the start runs again, with the checked
 * spawn of each team that has no job of the first round yet.
 */
type GroupStartPlan = {
	readonly root: string;
	readonly run: GroupRun;
	readonly created: boolean;
	readonly spawns: ReadonlyMap<string, Checked<SpawnPlan, SpawnedRecord>>;
};
/**
 * Starts the group, or goes on with the feature's open one; returns its run. Every check runs in validate, the team
 * spawns' own checks too, before run.json is written; the team jobs follow it as recorded steps (`startTeams`). The
 * team jobs' text goes to `out`; `again` is the same command line, which a partial start names in `next`.
 */
export async function startGroup(
	request: GroupStartRequest,
	cwd: string,
	out: CommandText,
	again: string | null = null,
): Promise<GroupRun> {
	const plan = await runOperation<GroupStartPlan, GroupStartPlan>({
		validate: (view) => validateGroupStart(view, request, cwd, out),
		// The cabinet lock: two starts of one feature never write two runs.
		lock: (plan) => ({ folder: `${plan.root}/.limen/groups` }),
		apply: async (plan) => {
			if (plan.created) {
				// The run appears whole: a start that lists the runs outside the cabinet lock, in its validate, sees no
				// folder without its run.json, since `runs` skips the hidden folder until the rename.
				const hidden = `${plan.root}/.limen/groups/.${plan.run.id}`;
				await mkdir(hidden);
				await saveJson(`${hidden}/run.json`, plan.run);
				await atomicRename(hidden, groupPath(plan.run));
			}
			return plan;
		},
		again,
	});
	await startTeams(plan, again).catch((error: unknown) => {
		throw stepFailure(error);
	});
	return readRun(plan.root, plan.run.id);
}
/** Every check of a group start, before its first write (T-38 (1)). */
async function validateGroupStart(
	view: StateView,
	request: GroupStartRequest,
	cwd: string,
	out: CommandText,
): Promise<GroupStartPlan> {
	if (transport("LIMEN_GROUP_ID") || transport("LIMEN_JOB") === "1") {
		throw refused(
			"GROUP_LEAD_ONLY",
			"only the owner-facing lead may start a group: run limen group start from the plant's interactive Herdr coordinator pane (LIMEN_COORDINATOR=1) with hook/group-peer.ts loaded, which loads only with the group module on in .agents/limen/limits.json — a limen job (LIMEN_JOB=1) cannot register as lead or start groups",
		);
	}
	const options = groupStartOptions(request);
	// Deliberately ignore inherited LIMEN_CONTEXT_ROOT for new activation.
	const root = repoRoot(cwd);
	const feature = groupFeature(root, cwd, request.folder);
	const lead = await liveGroupLead(root);
	const settings = await groupSettings(options);
	checkGroupPacket(root, feature, settings.teams);
	// A finished group still holds its result for the lead; only stop or close makes room for a new paid run.
	const open = await view.hold(`the open group run of ${feature}`, async () => {
		const latest = (await runs(root)).filter((run) => run.feature === feature).at(-1);
		return latest && !latest.stopped && !latest.closed ? latest.id : undefined;
	});
	if (open !== undefined) {
		const run = await readRun(root, open);
		return { root, run, created: false, spawns: await teamSpawns(run, await teamsToStart(run), out) };
	}
	await assertPriorRunsEnded(
		root,
		(await runs(root)).filter((run) => run.feature === feature),
	);
	for (const team of Object.keys(options.teamSelections)) {
		if (!settings.teams.includes(team)) {
			throw usageError("BAD_TEAM_EXTENSION", `--team-extension names ${team}, which is not in the roster`);
		}
	}
	const teamExtensions = await teamExtensionPathsByTeam(settings, options, cwd);
	for (const route of Object.values(settings.routes)) {
		preflightEngine(resolveSpawnEngine(route.engine), route.model, route.provider);
	}
	const run = newGroupRun(root, { feature, lead, settings, options }, teamExtensions);
	return { root, run, created: true, spawns: await teamSpawns(run, new Map(run.teams.map((team) => [team, []])), out) };
}
/**
 * The first-round members of `team` in `run` whose jobs never ran (`neverRan`): none for a team a start launched,
 * or undefined when the team's newest first-round job has run (or still may), so the team needs no start.
 */
async function toReplace(run: GroupRun, team: string): Promise<readonly string[] | undefined> {
	const members = run.members.filter(
		(member) => member.team === team && member.role === "coordinator" && (member.round ?? 0) === 0,
	);
	const latest = members.at(-1);
	if (latest !== undefined && !(await neverRan(run, latest))) {
		return undefined;
	}
	const given: string[] = [];
	for (const member of members) {
		if (await neverRan(run, member)) {
			given.push(member.id);
		}
	}
	return given;
}
/**
 * The teams of `run` a start still has to launch, each with the members whose slots it takes back: a team with no
 * first-round job, or one whose first-round job never ran because its launch failed after its member was claimed
 * (T-38 (3): the step the record names, which the same start run again continues).
 */
async function teamsToStart(run: GroupRun): Promise<ReadonlyMap<string, readonly string[]>> {
	const teams = new Map<string, readonly string[]>();
	for (const team of run.teams) {
		const replaces = await toReplace(run, team);
		if (replaces !== undefined) {
			teams.set(team, replaces);
		}
	}
	return teams;
}
/** The validate of each team's first-round spawn against `run`, which may not be written yet; a refusal throws. */
async function teamSpawns(
	run: GroupRun,
	teams: ReadonlyMap<string, readonly string[]>,
	out: CommandText,
): Promise<ReadonlyMap<string, Checked<SpawnPlan, SpawnedRecord>>> {
	const spawns = new Map<string, Checked<SpawnPlan, SpawnedRecord>>();
	const ticket = `${run.feature}/ticket.md`;
	for (const [team, replaces] of teams) {
		const request = {
			task: [`Work the ticket as ${team} of the group. Ticket: ${ticket}`],
			label: teamJobLabel(run, team, 0),
			...teamRoute(run, team),
		};
		spawns.set(team, await checkedSpawn(request, run.root, out, { team: { run, team, replaces } }));
	}
	return spawns;
}
function groupFeature(root: string, cwd: string, featureArgument: string): string {
	const feature = relative(root, resolve(cwd, featureArgument));
	if (feature.startsWith("..") || !feature.startsWith("spec/features/")) {
		throw usageError(
			"BAD_FEATURE",
			"feature must be inside this repository's spec/features; run limen group start spec/features/active/FEATURE with the group settings",
		);
	}
	return feature;
}
/** The interactive coordinator registered as lead, whose group-peer hook is alive. */
async function liveGroupLead(root: string): Promise<string> {
	const lead = (await leadSession(root)) ?? "";
	if (!SESSION_ID.test(lead)) {
		throw refused(
			"GROUP_NO_LEAD",
			"group start requires the interactive Herdr coordinator pane (LIMEN_COORDINATOR=1) with hook/group-peer.ts loaded and registered under .limen/group-leads; the hook loads only with the group module on in .agents/limen/limits.json, so reload that pane after switching it on or updating the package; a limen job never registers as lead",
		);
	}
	if (!(await leadHookLive(root, lead))) {
		throw refused(
			"GROUP_LEAD_HOOK",
			`group lead hook is not running in this pane: .limen/group-leads/${lead} names no live process refreshed by hook/group-peer.ts in the last 30 seconds. Reload this interactive Herdr coordinator (LIMEN_COORDINATOR=1) with the Limen package hooks, including hook/group-peer.ts, which loads only with the group module on in .agents/limen/limits.json, and retry. Do not write .limen/group-leads by hand: without the hook, team results never reach this pane — and do not spawn a job as lead`,
		);
	}
	return lead;
}
/** The roster, routes, rounds, allowance and deadline, checked before anything is written. */
async function groupSettings({ routes, rounds, workers, timeout }: GroupStartOptions): Promise<GroupSettings> {
	if (!routes.length) {
		throw usageError("NO_TEAM", `group start has no team; ${GROUP_START}`);
	}
	const teams = routes.map((_, index) => `team-${index + 1}`);
	const known = await roundNames();
	for (const [index, name] of rounds.entries()) {
		if (!known.includes(name)) {
			throw usageError("BAD_ROUND", `unknown group round ${JSON.stringify(name)}; use rounds from ${known.join(", ")}`);
		}
		if (name === "final" && index !== rounds.length - 1) {
			throw usageError("FINAL_NOT_LAST", "the final round writes the group's one result, so it must be the last round");
		}
	}
	if (!/^\d+$/.test(workers) || !Number.isSafeInteger(Number(workers))) {
		throw usageError("BAD_WORKERS", `--workers must be a whole number of workers per team; ${GROUP_START}`);
	}
	const timeoutMs = parseDuration(timeout);
	if (timeoutMs <= WRAP_UP_RESERVE_MS) {
		throw usageError(
			"GROUP_TIMEOUT_SHORT",
			`group timeout must leave a ${WRAP_UP_RESERVE_MS / 1000}-second wrap-up reserve; run limen group start FEATURE with --timeout above 1m`,
		);
	}
	return {
		teams,
		routes: Object.fromEntries(teams.map((team, index) => [team, routes[index] as TeamRoute])),
		rounds: [...rounds],
		workersPerTeam: Number(workers),
		timeout: timeoutMs,
	};
}
/** The ticket must exist; a brief and approach notes are optional. Each packet file that exists is committed at HEAD. */
function checkGroupPacket(root: string, feature: string, teams: readonly string[]): void {
	const ticket = `${feature}/ticket.md`;
	if (!existsSync(`${root}/${ticket}`)) {
		throw refused(
			"GROUP_PACKET_MISSING",
			`group packet is missing ${ticket}; create it, then run limen group start ${feature}`,
		);
	}
	for (const path of [
		ticket,
		`${feature}/group/brief.md`,
		...teams.map((team) => `${feature}/group/teams/${team}.md`),
	]) {
		if (!existsSync(`${root}/${path}`)) {
			continue;
		}
		if (!commitHasFile(root, headCommit(root), path)) {
			throw refused(
				"GROUP_PACKET_UNCOMMITTED",
				`group packet ${path} is not committed; run git add ${path} and commit before starting`,
			);
		}
	}
}
async function assertPriorRunsEnded(root: string, previous: readonly GroupRun[]): Promise<void> {
	for (const prior of previous) {
		for (const member of prior.members) {
			const live = await memberLive(root, member);
			if (live) {
				throw refused(
					"GROUP_RUN_LIVE",
					`group ${prior.feature} (${prior.id}): ${member.team} ${member.role} (${member.id}) is not over (${live}); run limen group status ${prior.id}`,
					`limen group status ${prior.id}`,
				);
			}
		}
	}
}
async function teamExtensionPathsByTeam(
	settings: GroupSettings,
	options: GroupStartOptions,
	cwd: string,
): Promise<Record<string, string[]>> {
	const teamExtensions: Record<string, string[]> = {};
	for (const team of settings.teams) {
		teamExtensions[team] = await normalizeWorkerExtensions(
			[...options.extensions, ...(options.teamSelections[team] ?? [])],
			cwd,
		);
	}
	return teamExtensions;
}
function newGroupRun(
	root: string,
	{ feature, lead, settings }: GroupActivation,
	teamExtensions: Record<string, string[]>,
): GroupRun {
	const leadPane = herdrWakePane(undefined);
	return {
		id: randomUUID(),
		root,
		feature,
		lead,
		...(leadPane ? { leadPane } : {}),
		startedAt: Date.now(),
		teams: settings.teams,
		routes: settings.routes,
		workersPerTeam: settings.workersPerTeam,
		rounds: settings.rounds,
		round: 0,
		deadline: Date.now() + settings.timeout,
		reserveMs: WRAP_UP_RESERVE_MS,
		stopped: false,
		closed: false,
		members: [],
		teamExtensions,
	};
}
/**
 * The team jobs of a start, in the roster's order, each a recorded step: its member in run.json, which its spawn's apply
 * writes. Under the run's start lock, so a start run again while another still launches waits for it, then starts only
 * the teams still to start (`teamsToStart`): one with no first-round job, or one whose job never ran. A team whose
 * spawn fails is recorded as the run's `startFailure` and ends the start with the class of its failure (T-38 (3)); the
 * same start run again goes on from that team.
 */
async function startTeams(plan: GroupStartPlan, again: string | null): Promise<void> {
	const { root, run } = plan;
	await groupLock(
		`${groupPath(run)}/start`,
		async () => {
			for (const [team, checked] of plan.spawns) {
				// Another start may have launched the team meanwhile; the claim reads the slots taken back once more.
				if (!(await teamsToStart(await readRun(root, run.id))).has(team)) {
					continue;
				}
				try {
					await startChecked(checked);
				} catch (error) {
					const message = failureOf(stepFailure(error)).message;
					const failure = failureOf(
						await cleanedUp(error, () => recordStartFailure(run, { team, message, at: Date.now() })),
					);
					throw new LimenError({
						class: failure.class,
						code: "GROUP_PARTIAL_START",
						message: `group ${run.feature} (${run.id}) started only part of its roster: ${team}: ${failure.message}; run the same limen group start again to start the teams whose jobs did not start`,
						next: again,
						cause: error,
					});
				}
			}
			if ((await readRun(root, run.id)).startFailure !== undefined) {
				await recordStartFailure(run, undefined);
			}
		},
		"wait",
	);
}
/** Writes the start's failed step into run.json under the run's cabinet lock, or removes it once every team started. */
async function recordStartFailure(run: GroupRun, failure: GroupRun["startFailure"]): Promise<void> {
	await groupLock(groupPath(run), async () => {
		const { startFailure: _, ...current } = await readRun(run.root, run.id);
		await saveJson(
			`${groupPath(run)}/run.json`,
			failure === undefined ? current : { ...current, startFailure: failure },
		);
	});
}
/**
 * The group a command acts on: a member's own, from its recorded membership, or the one the lead names in `given`. A
 * member's group word is no id, so it is returned for the command to refuse or to read as its text.
 */
export async function selectedGroup(
	given: string | undefined,
	cwd: string,
): Promise<{ identity: GroupIdentity; word?: string }> {
	const explicit = transport("LIMEN_GROUP_ID") ? undefined : given;
	const identity = await groupIdentity(cwd, explicit);
	if (!identity) {
		throw usageError("NO_GROUP", "no group selected; run limen group status GROUP-ID from the lead pane");
	}
	return explicit === undefined && given !== undefined ? { identity, word: given } : { identity };
}
/** `limen group status`: the run, its round and every member's state; a stuck round moves on. */
export async function showGroupStatus(given: string | undefined, cwd: string, out: CommandText): Promise<void> {
	const { identity, word } = await selectedGroup(given, cwd);
	// `group status` takes at most the group id, which the lead gives and a member omits.
	if (word !== undefined) {
		const id = identity.member ? "" : ` ${identity.run.id}`;
		throw new Error(`invalid group status arguments; run limen group status${id}`);
	}
	await syncLifecycle(identity.run, "skip");
	const run = await readRun(identity.run.root, identity.run.id);
	const members = await Promise.all(
		run.members.map(async (member) => ({
			...member,
			state: (await readRecord(`${run.root}/.limen/jobs/${member.id}`))?.state ?? "no job record yet",
		})),
	);
	const round = run.rounds[run.round] ?? "";
	out.line(`Group ${run.feature} (${run.id})`);
	out.line(
		run.finishedAt
			? `Finished after round ${run.round + 1} of ${run.rounds.length} (${round}) · result: ${groupPath(run)}/result.md`
			: `Round ${run.round + 1} of ${run.rounds.length}: ${round} · deadline ${new Date(run.deadline).toLocaleString()} · ${Math.max(0, Math.ceil((run.deadline - Date.now()) / 60_000))} minutes left`,
	);
	out.line(`Stopped: ${run.stopped ? "yes" : "no"} · Closed: ${run.closed ? "yes" : "no"}`);
	if (run.startFailure) {
		const { team, message } = run.startFailure;
		out.line(`Start: ${team} did not start: ${message}; run the same limen group start again to start it`);
	}
	for (const member of members) {
		const place =
			member.role === "coordinator" ? `round ${(member.round ?? 0) + 1} ${run.rounds[member.round ?? 0]}` : "worker";
		out.line(`${member.team} ${place} (${member.id}): ${member.state}`);
	}
	if (!run.finishedAt && !run.stopped) {
		// A round whose last finish could not start the next one moves on here.
		await startGroupAdvance(run).catch((error: unknown) =>
			out.diagnostic(
				`the group's next round could not start: ${error instanceof Error ? error.message : String(error)}`,
			),
		);
	}
}
/**
 * `limen group publish`: a finding for every other team, or for the one `team` names; returns the event's id. A member
 * names no group, so its first word belongs to the finding.
 */
export async function publishFinding(
	given: string | undefined,
	words: readonly string[],
	team: string | undefined,
	cwd: string,
): Promise<string> {
	const { identity, word } = await selectedGroup(given, cwd);
	const finding = [...(word === undefined ? [] : [word]), ...words].join(" ");
	return (await publishEvent(identity, finding, "finding", team)).id;
}
/** The group the lead names for `command`; a member is refused. */
async function leadGroup(given: string | undefined, cwd: string, command: string): Promise<GroupIdentity> {
	const { identity } = await selectedGroup(given, cwd);
	if (identity.member) {
		throw refused(
			"GROUP_LEAD_ONLY",
			`only the group lead may ${command}; run limen group status to inspect your group's members`,
			"limen group status",
		);
	}
	return identity;
}
/**
 * `limen group stop`, an operation of T-38: its validate refuses a caller that is not the lead, and its apply sets the
 * run's stopped flag under the cabinet lock, which blocks new launches. Then its idempotent steps: the launch lock
 * drains, each reserved slot ends, each live member stops, and `stop-report.json` names what did not. A member it
 * could not confirm stopped is no refusal: the stop fails with the class of that member's cause (`incompleteStop`).
 * Each member's stop line goes to `out`.
 */
export async function stopGroup(given: string | undefined, cwd: string, out: CommandText): Promise<void> {
	const stopped = await runOperation({
		validate: async () => (await leadGroup(given, cwd, "stop")).run,
		lock: (run: GroupRun) => ({ folder: groupPath(run) }),
		apply: async (planned: GroupRun) => {
			const run = await readRun(planned.root, planned.id);
			run.stopped = true;
			await saveJson(`${groupPath(run)}/run.json`, run);
			return run;
		},
	});
	const { run, failures } = await stopMembers(stopped, out).catch((error: unknown) => {
		throw stepFailure(error);
	});
	if (failures.length) {
		throw incompleteStop(run, failures);
	}
	out.line("group stopped; recovery work and unread events retained until close");
}
/**
 * A member a stop could not confirm stopped: its line in `stop-report.json`, the class T-02 gives its cause, and, for
 * a cause that no stop changes, what the owner runs first.
 */
export type MemberFailure = {
	readonly line: string;
	/** `transient` while the same stop run again can still stop the member; otherwise its cause's class. */
	readonly class: FailureClass;
	readonly remedy?: { readonly next: string; readonly text: string };
};
/**
 * The failure of a stop that could not confirm every member stopped, after its first write (T-38 (3)). While the same
 * stop run again can still stop each member, it is transient with that stop in `next`, which a timer retries (T-02).
 * Otherwise a rerun ends the same way, so it takes the class of the first cause no rerun changes, which rings at once,
 * and `next` names what the owner runs: the cause's remedy, or the same stop once the cause is fixed.
 */
export function incompleteStop(run: Pick<GroupRun, "id" | "feature">, failures: readonly MemberFailure[]): LimenError {
	const again = `limen group stop ${run.id}`;
	const lines = failures.map(({ line }) => line).join("\n");
	const lasting = failures.find((failure) => failure.class !== "transient");
	if (lasting === undefined) {
		return new LimenError({
			class: "transient",
			code: "GROUP_STOP_INCOMPLETE",
			message: `group ${run.feature} (${run.id}) blocked new launches but some jobs could not be stopped:\n${lines}\nRun limen group status ${run.id}, then ${again} again`,
			next: again,
		});
	}
	const remedy = lasting.remedy?.text ?? "Fix the cause above";
	return new LimenError({
		class: lasting.class,
		code: "GROUP_STOP_INCOMPLETE",
		message: `group ${run.feature} (${run.id}) blocked new launches but some jobs could not be stopped, and the same stop run again ends the same way:\n${lines}\n${remedy}, then run ${again} again`,
		next: lasting.remedy?.next ?? again,
	});
}
/**
 * The steps of a stop after its stopped flag, each one idempotent: the launch lock drains, then each member's reserved
 * slot ends and each live member stops, and `stop-report.json` names those it could not confirm stopped.
 */
async function stopMembers(
	stopped: GroupRun,
	out: CommandText,
): Promise<{ readonly run: GroupRun; readonly failures: readonly MemberFailure[] }> {
	const run = await groupLock(`${groupPath(stopped)}/launch`, () => readRun(stopped.root, stopped.id), "wait");
	const failures: MemberFailure[] = [];
	for (const member of run.members) {
		await stopReservedSlot(run, member);
		const failure = await stopMemberJob(run, member, out);
		if (failure) {
			failures.push(failure);
		}
	}
	await saveJson(`${groupPath(run)}/stop-report.json`, { at: Date.now(), failures: failures.map(({ line }) => line) });
	return { run, failures };
}
/**
 * The launch lock has drained: a reserved slot whose job never started cannot launch later. A slot without a record
 * gets one, stopped, in a folder the transition makes, with no task or log; a published job that never ran stops.
 */
async function stopReservedSlot(run: GroupRun, member: GroupMember): Promise<void> {
	await transition(`${run.root}/.limen/jobs/${member.id}`, {
		from: ["absent", "starting"],
		to: "stopped",
		set: (record) => ({ group: record.group ?? run.id, team: record.team ?? member.team }),
	});
}
/**
 * The stop of one member job, with the member's id, the reason and the project's root: `stopJob` in Limen's own calls.
 * The tests' injection point (D-029), since no state of the files makes `stopJob` end transiently there with no wait;
 * no setting chooses it (T-03).
 */
export type MemberStop = (id: string, reason: string, root: string) => Promise<string>;
/**
 * Stops a live member job and waits up to 6 s for it to end. Returns why it is not confirmed stopped: a member still
 * live after the wait may end yet, and the same stop run again stops or checks it again, so that failure is transient;
 * a stop that failed has the class of its cause (`stopCause`).
 */
export async function stopMemberJob(
	run: Pick<GroupRun, "root">,
	member: GroupMember,
	out: CommandText,
	stop: MemberStop = stopJob,
): Promise<MemberFailure | undefined> {
	if (!(await memberLive(run.root, member))) {
		return;
	}
	const name = `${member.team} ${member.role} (${member.id})`;
	try {
		out.line(await stop(member.id, "group stopped by lead", run.root));
		const until = Date.now() + 6_000;
		let live = await memberLive(run.root, member);
		while (live && Date.now() < until) {
			await delay(100);
			live = await memberLive(run.root, member);
		}
		return live ? { line: `${name}: not confirmed stopped (${live})`, class: "transient" } : undefined;
	} catch (error) {
		return { line: `${name}: ${error instanceof Error ? error.message : String(error)}`, ...stopCause(error) };
	}
}
/**
 * The class T-02 gives the cause of a member stop that failed, and its remedy. A running record with no pid names no
 * process, so every stop refuses it (JOB_NO_PID, src/job/stopping.ts): that is the seat's state, which `limen seat
 * sweep` ends, since it ends a running job whose process is unknown (A-056). Any other failure keeps the class a step's
 * failure has (`stepFailure`), so a refusal there is the internal REFUSED_AFTER_VALIDATE.
 */
function stopCause(error: unknown): Pick<MemberFailure, "class" | "remedy"> {
	if (error instanceof LimenError && error.code === "JOB_NO_PID") {
		const text = "No stop can signal a job whose record names no process; limen seat sweep ends such a job";
		return { class: "environment", remedy: { next: "limen seat sweep", text } };
	}
	return { class: failureOf(stepFailure(error)).class };
}
/**
 * `limen group close`: marks the run closed once every member job is over and no member worktree holds uncommitted Git
 * work. A member whose worktree is gone or is no Git checkout has none; close names that folder, and prune removes it
 * afterwards.
 */
export async function closeGroup(given: string | undefined, cwd: string, out: CommandText): Promise<void> {
	const identity = await leadGroup(given, cwd, "close");
	const lost = await groupLock(
		`${groupPath(identity.run)}/launch`,
		async () => {
			const run = await readRun(identity.run.root, identity.run.id);
			const folders = new Map<string, string>();
			for (const member of run.members) {
				const name = `${member.team} ${member.role} (${member.id})`;
				const live = await memberLive(run.root, member);
				if (live) {
					throw new Error(
						`cannot close group ${run.feature} (${run.id}): ${name} is not over (${live}); run limen group stop ${run.id}`,
					);
				}
				const tree = (await readRecord(`${run.root}/.limen/jobs/${member.id}`))?.worktree ?? "";
				const state = tree ? worktreeState(tree) : "none";
				if (state === "dirty") {
					throw new Error(
						`cannot close group ${run.feature} (${run.id}): ${name} has uncommitted work in ${tree}; run git -C ${JSON.stringify(tree)} status --short before committing or recovering that work`,
					);
				}
				if (state === "none" && existsSync(tree) && !folders.has(tree)) {
					folders.set(tree, `${name}: ${tree} is no Git checkout, so it holds no Git work; prune removes it`);
				}
			}
			run.closed = true;
			run.stopped = true;
			await saveJson(`${groupPath(run)}/run.json`, run);
			return [...folders.values()];
		},
		"wait",
	);
	for (const line of lost) {
		out.line(line);
	}
	out.line("group closed; clean member paths released for ordinary pruning");
}
