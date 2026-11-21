// The operations of a group (T-26 (2)): its start with one job per team, its status, a finding published to the other
// teams, and the lead's stop and close. Their text goes to `out`, which the shared wrapper prints at the end.
import { randomUUID } from "node:crypto";
import { existsSync } from "node:fs";
import { mkdir } from "node:fs/promises";
import { relative, resolve } from "node:path";
import { setTimeout as delay } from "node:timers/promises";
import { transport } from "../config.ts";
import type { CommandText } from "../outcome.ts";
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
import { startSpawn } from "./spawning.ts";
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
		throw new Error(`${INVALID_TEAM}; the reasoning level is one of ${LEVELS.join(", ")}`);
	}
	const engine = resolveSpawnEngine(route[1]).id;
	return { engine, provider: route[2], model: route[3], thinking: route[4] };
}
function teamExtensionPaths(values: readonly string[]): Record<string, string[]> {
	const paths: Record<string, string[]> = {};
	for (const value of values) {
		const selection = /^(team-[1-9]\d*)=(.+)$/.exec(value);
		if (!selection?.[1] || !selection[2]) {
			throw new Error("invalid --team-extension; use team-N=PATH");
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
/** Starts the group, or resumes the feature's open one; returns its run. The team jobs' text goes to `out`. */
export async function startGroup(request: GroupStartRequest, cwd: string, out: CommandText): Promise<GroupRun> {
	if (transport("LIMEN_GROUP_ID") || transport("LIMEN_JOB") === "1") {
		throw new Error(
			"only the owner-facing lead may start a group: run limen group start from the plant's interactive Herdr coordinator pane (LIMEN_COORDINATOR=1) with hook/group-peer.ts loaded — a limen job (LIMEN_JOB=1) cannot register as lead or start groups",
		);
	}
	const featureArgument = request.folder;
	const options = groupStartOptions(request);
	// Deliberately ignore inherited LIMEN_CONTEXT_ROOT for new activation.
	const root = repoRoot(cwd);
	const feature = groupFeature(root, cwd, featureArgument);
	const lead = await liveGroupLead(root);
	const settings = await groupSettings(options);
	checkGroupPacket(root, feature, settings.teams);
	const activated = await activateGroup(root, cwd, { feature, lead, settings, options });
	if (activated.created) {
		await spawnTeamCoordinators(root, activated.run, out);
	}
	return readRun(root, activated.run.id);
}
function groupFeature(root: string, cwd: string, featureArgument: string): string {
	const feature = relative(root, resolve(cwd, featureArgument));
	if (feature.startsWith("..") || !feature.startsWith("spec/features/")) {
		throw new Error(
			"feature must be inside this repository's spec/features; run limen group start spec/features/active/FEATURE with the group settings",
		);
	}
	return feature;
}
/** The interactive coordinator registered as lead, whose group-peer hook is alive. */
async function liveGroupLead(root: string): Promise<string> {
	const lead = (await leadSession(root)) ?? "";
	if (!SESSION_ID.test(lead)) {
		throw new Error(
			"group start requires the interactive Herdr coordinator pane (LIMEN_COORDINATOR=1) with hook/group-peer.ts loaded and registered under .limen/group-leads — reload that pane after updating the package; a limen job never registers as lead",
		);
	}
	if (!(await leadHookLive(root, lead))) {
		throw new Error(
			`group lead hook is not running in this pane: .limen/group-leads/${lead} names no live process refreshed by hook/group-peer.ts in the last 30 seconds. Reload this interactive Herdr coordinator (LIMEN_COORDINATOR=1) with the Limen package hooks, including hook/group-peer.ts, and retry. Do not write .limen/group-leads by hand: without the hook, team results never reach this pane — and do not spawn a job as lead`,
		);
	}
	return lead;
}
/** The roster, routes, rounds, allowance and deadline, checked before anything is written. */
async function groupSettings({ routes, rounds, workers, timeout }: GroupStartOptions): Promise<GroupSettings> {
	if (!routes.length) {
		throw new Error(`group start has no team; ${GROUP_START}`);
	}
	const teams = routes.map((_, index) => `team-${index + 1}`);
	const known = await roundNames();
	for (const [index, name] of rounds.entries()) {
		if (!known.includes(name)) {
			throw new Error(`unknown group round ${JSON.stringify(name)}; use rounds from ${known.join(", ")}`);
		}
		if (name === "final" && index !== rounds.length - 1) {
			throw new Error("the final round writes the group's one result, so it must be the last round");
		}
	}
	if (!/^\d+$/.test(workers) || !Number.isSafeInteger(Number(workers))) {
		throw new Error(`--workers must be a whole number of workers per team; ${GROUP_START}`);
	}
	const timeoutMs = parseDuration(timeout);
	if (timeoutMs <= WRAP_UP_RESERVE_MS) {
		throw new Error(
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
		throw new Error(`group packet is missing ${ticket}; create it, then run limen group start ${feature}`);
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
			throw new Error(`group packet ${path} is not committed; run git add ${path} and commit before starting`);
		}
	}
}
/** Under the cabinet lock: resume the feature's open run, or write a new run once every prior run has ended. */
async function activateGroup(
	root: string,
	cwd: string,
	activation: GroupActivation,
): Promise<{ run: GroupRun; created: boolean }> {
	const { feature, options, settings } = activation;
	return groupLock(`${root}/.limen/groups`, async () => {
		const previous = (await runs(root)).filter((run) => run.feature === feature);
		const latest = previous.at(-1);
		// A finished group still holds its result for the lead; only stop or close makes room for a new paid run.
		if (latest && !latest.stopped && !latest.closed) {
			return { run: latest, created: false };
		}
		await assertPriorRunsEnded(root, previous);
		for (const team of Object.keys(options.teamSelections)) {
			if (!settings.teams.includes(team)) {
				throw new Error(`--team-extension names ${team}, which is not in the roster`);
			}
		}
		const teamExtensions = await teamExtensionPathsByTeam(settings, options, cwd);
		for (const route of Object.values(settings.routes)) {
			preflightEngine(resolveSpawnEngine(route.engine), route.model, route.provider);
		}
		const run = newGroupRun(root, activation, teamExtensions);
		await mkdir(groupPath(run));
		await saveJson(`${groupPath(run)}/run.json`, run);
		return { run, created: true };
	});
}
async function assertPriorRunsEnded(root: string, previous: readonly GroupRun[]): Promise<void> {
	for (const prior of previous) {
		for (const member of prior.members) {
			const live = await memberLive(root, member);
			if (live) {
				throw new Error(
					`group ${prior.feature} (${prior.id}): ${member.team} ${member.role} (${member.id}) is not over (${live}); run limen group status ${prior.id}`,
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
/** Each team's first-round job. A failed launch is recorded and ends the start. */
async function spawnTeamCoordinators(root: string, run: GroupRun, out: CommandText): Promise<void> {
	const ticket = `${run.feature}/ticket.md`;
	for (const team of run.teams) {
		const route = teamRoute(run, team);
		try {
			await startSpawn(
				{
					task: [`Work the ticket as ${team} of the group. Ticket: ${ticket}`],
					label: teamJobLabel(run, team, 0),
					...route,
				},
				root,
				out,
				{ run, team },
			);
		} catch (error) {
			await saveJson(`${groupPath(run)}/activation-error.json`, {
				team,
				error: error instanceof Error ? error.message : String(error),
			});
			throw new Error(
				`group ${run.feature} (${run.id}) started only part of its roster: ${error instanceof Error ? error.message : String(error)}; run limen group stop ${run.id} before starting a new run`,
			);
		}
	}
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
		throw new Error("no group selected; run limen group status GROUP-ID from the lead pane");
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
	for (const member of members) {
		const place =
			member.role === "coordinator" ? `round ${(member.round ?? 0) + 1} ${run.rounds[member.round ?? 0]}` : "worker";
		out.line(`${member.team} ${place} (${member.id}): ${member.state}`);
	}
	if (!run.finishedAt && !run.stopped) {
		// A round whose last finish could not start the next one moves on here.
		startGroupAdvance(run);
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
		throw new Error(`only the group lead may ${command}; run limen group status to inspect your group's members`);
	}
	return identity;
}
/**
 * `limen group stop`: blocks new launches, then stops every live member job. Throws with the members that could not be
 * stopped; each member's stop line goes to `out`.
 */
export async function stopGroup(given: string | undefined, cwd: string, out: CommandText): Promise<void> {
	const identity = await leadGroup(given, cwd, "stop");
	await groupLock(groupPath(identity.run), async () => {
		const run = await readRun(identity.run.root, identity.run.id);
		run.stopped = true;
		await saveJson(`${groupPath(run)}/run.json`, run);
	});
	const run = await groupLock(
		`${groupPath(identity.run)}/launch`,
		() => readRun(identity.run.root, identity.run.id),
		"wait",
	);
	const failures: string[] = [];
	for (const member of run.members) {
		await stopReservedSlot(run, member);
		const failure = await stopMemberJob(run, member, out);
		if (failure) {
			failures.push(failure);
		}
	}
	await saveJson(`${groupPath(run)}/stop-report.json`, { at: Date.now(), failures });
	if (failures.length) {
		throw new Error(
			`group ${run.feature} (${run.id}) blocked new launches but some jobs could not be stopped:\n${failures.join("\n")}\nRun limen group status ${run.id}`,
		);
	}
	out.line("group stopped; recovery work and unread events retained until close");
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
/** Stops a live member job and waits up to 6 s for it to end. Returns why it is not confirmed stopped. */
async function stopMemberJob(run: GroupRun, member: GroupMember, out: CommandText): Promise<string | undefined> {
	if (!(await memberLive(run.root, member))) {
		return;
	}
	try {
		out.line(await stopJob(member.id, "group stopped by lead", run.root));
		const until = Date.now() + 6_000;
		let live = await memberLive(run.root, member);
		while (live && Date.now() < until) {
			await delay(100);
			live = await memberLive(run.root, member);
		}
		return live ? `${member.team} ${member.role} (${member.id}): not confirmed stopped (${live})` : undefined;
	} catch (error) {
		return `${member.team} ${member.role} (${member.id}): ${error instanceof Error ? error.message : String(error)}`;
	}
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
