// The summary of this project (`limen status`): what runs, what landed, what waits for a decision, in the last 7 days,
// every finished job whose unlanded work blocks a worker spawn, whatever its age (A-001), each branch of abandoned work
// (A-002), each job the seat sweep cannot end (R-032), whether the seat's alerts and its sweep run (A-066, A-024), a
// Limen hook's refusal in a coordinator's session (T-32 (4)), and with `--all` every record and one row for each job
// (D-038). It is a read (T-04): a dead job is shown as dead and left to the sweep, which finalizes it.
import { spawnSync } from "node:child_process";
import { existsSync, realpathSync } from "node:fs";
import { readFile, stat } from "node:fs/promises";
import { join, relative, resolve } from "node:path";
import { shownField } from "../boundary.ts";
import { ignoredSettings } from "../config.ts";
import { coordinatorRefusals } from "../integrations/coordinator-registration.ts";
import { herdrBinary } from "../integrations/herdr.ts";
import { type GroupIdentity, jobMembership } from "../job/group-cabinet.ts";
import { DEAD_WRAPPER, isTerminal } from "../job/job.ts";
import { orderedJobs, RECENT_MS, renderJobDirectory, shownState } from "../job/listing.ts";
import { escalatedStuck, type JobRecord, jobFolders, readRecord } from "../job/record.ts";
import { abandonBranches, unlandedSummary, unlandedWork } from "../job/unlanded.ts";
import type { ShownJob } from "../job/view.ts";
import { platform } from "../platform/platform.ts";
import { SWEEP_SERVICE, SWEEP_TIMER } from "../platform/systemd-units.ts";
import { limenRoot, unlandedBranches, workspaceRepositories, workspaceRepository, workspaceRoot } from "./git.ts";
import { packageRoot } from "./inherit.ts";
import { listLeftovers } from "./leftovers.ts";

const text = (path: string) =>
	readFile(path, "utf8").then(
		(value) => value.trim(),
		() => "",
	);

type Agent = {
	pane_id?: string;
	tab_id?: string;
	cwd?: string;
	agent_status?: string;
	interactive_ready?: boolean;
	name?: string;
};
type Tab = { tab_id?: string; label?: string; number?: number; agent_status?: string };

type Finished = {
	readonly id: string;
	readonly label: string;
	readonly state: string;
	readonly branch: string;
	readonly repo: string;
};

/** What the summary reads of one job: its record's fields and its Herdr tab; "" for what the job has none of. */
type JobFiles = {
	readonly state: string;
	readonly label: string;
	readonly branch: string;
	readonly repo: string;
	readonly tab: string;
	readonly worktree: string;
	readonly origin: string;
	readonly started: string;
	readonly ended: string;
	readonly openChecks: boolean;
	/** The line of a job the seat sweep cannot end from its third attempt in a row (R-032); "" for any other job. */
	readonly stuck: string;
};

/** What one pass over the job directories found, before Git says which branches are unlanded. */
type Scan = {
	readonly root: string;
	readonly jobsRoot: string;
	readonly all: boolean;
	readonly now: number;
	readonly running: string[];
	readonly runningBranches: Set<string>;
	readonly uncertain: string[];
	readonly stuck: string[];
	readonly workerTabs: Set<string>;
	readonly worktrees: Set<string>;
	readonly originTabs: Set<string>;
	readonly finished: Map<string, Finished>;
	readonly groups: Map<string, { readonly feature: string; readonly branches: Set<string> }>;
	older: number;
	lastOrigin: string;
};

/**
 * The summary of the project at `cwd`, as text for people: what runs, what landed, what waits for a decision, in the
 * last 7 days. With `all` it reports every record, and under the summary one row for each job of the project (D-038).
 */
export async function projectStatus(cwd: string, all: boolean): Promise<string> {
	const root = existsSync(`${resolve(cwd)}/.limen/jobs`) ? resolve(cwd) : limenRoot(cwd);
	const jobsRoot = `${root}/.limen/jobs`;
	const ids = await jobFolders(jobsRoot);
	const scan: Scan = {
		root,
		jobsRoot,
		all,
		now: Date.now(),
		running: [],
		runningBranches: new Set(),
		uncertain: [],
		stuck: [],
		workerTabs: new Set(),
		worktrees: new Set(),
		originTabs: new Set(),
		finished: new Map(),
		groups: new Map(),
		older: 0,
		lastOrigin: "",
	};
	for (const id of ids) {
		await scanJob(scan, id);
	}
	if (!scan.originTabs.size && scan.lastOrigin) {
		scan.originTabs.add(scan.lastOrigin);
	}
	const ready = [...scan.groups].map(
		([id, group]) =>
			`  group ${group.feature}: ${group.branches.size} member branches; the lead decides (limen group status ${id})`,
	);
	const decide: string[] = [];
	sortUnlandedBranches(scan, ready, decide);
	const workspace = workspaceRoot(root) !== undefined;
	const coordinators = coordinatorLines(root, workspace, scan.workerTabs, scan.worktrees, scan.originTabs);
	return [
		`Plant ${root}`,
		`Running (${scan.running.length}):`,
		...(scan.running.length ? scan.running : ["  none"]),
		`Candidates to inspect (${ready.length}):`,
		...(ready.length ? ready : ["  none"]),
		`Needs a decision (${decide.length}):`,
		...(decide.length ? decide : ["  none"]),
		...(await unlandedLines(root)),
		...abandonLines(root, workspace),
		...(scan.uncertain.length ? ["Unconfirmed jobs:", ...scan.uncertain] : []),
		...(scan.stuck.length ? [`Jobs the sweep cannot end (${scan.stuck.length}):`, ...scan.stuck] : []),
		...alertsLines(),
		...sweepLines(),
		...(await refusalLines(root)),
		...leftoverLines(root),
		...environmentLines(),
		...(all ? [] : [`Older: ${scan.older} record${scan.older === 1 ? "" : "s"} (limen status --all)`]),
		"Coordinator tabs:",
		...coordinators,
		...(all ? await jobRows(root, jobsRoot, ids) : []),
	].join("\n");
}

/**
 * Every finished job whose unlanded work nothing resolved, whatever its age and migrated ones too (A-001): what it
 * holds and the two commands that resolve it, since each makes a worker spawn refuse. Empty when there is none.
 */
async function unlandedLines(root: string): Promise<string[]> {
	const held = await unlandedWork(root);
	if (held.length === 0) {
		return [];
	}
	return [
		"Unlanded work (spawn refuses until each is continued or abandoned):",
		...held.flatMap((work) => [
			`  ${work.id} · ${work.state} · ${unlandedSummary(work)}${work.repo ? ` · repo ${work.repo}` : ""}`,
			`    limen continue ${work.id} "instruction"`,
			`    limen abandon ${work.id}`,
		]),
	];
}

/**
 * Each `limen/abandon/<id>` branch of the project with its commit (A-002): of its own repository and, in a workspace,
 * of each child repository `--repo` accepts, read from Git alone, since Limen never deletes such a branch and retire
 * moves the record that named its repository to the job archive (R-031, review round 1, F2). Empty when there is none.
 */
function abandonLines(root: string, workspace: boolean): string[] {
	const places: { readonly repository: string; readonly repo: string | undefined }[] = [
		...(existsSync(`${root}/.git`) ? [{ repository: root, repo: undefined }] : []),
		...(workspace ? workspaceRepositories(root).map((repo) => ({ repository: resolve(root, repo), repo })) : []),
	];
	const lines = places.flatMap(({ repository, repo }) =>
		[...abandonBranches(repository)].map(
			([branch, commit]) => `  ${branch} · ${commit}${repo ? ` · repo ${repo}` : ""}`,
		),
	);
	return lines.length === 0 ? [] : ["Abandoned work (Limen keeps each branch until a person deletes it):", ...lines];
}

/** One row for each job, running jobs first and then the newest, as the job list has always shown them. */
async function jobRows(root: string, jobsRoot: string, ids: readonly string[]): Promise<string[]> {
	const order = await orderedJobs(ids, jobsRoot);
	const rows = await Promise.all(
		order.map(async ([id]) => (await renderJobDirectory(root, jobsRoot, id, "row")).compact),
	);
	return [`Jobs (${rows.length}):`, ...(rows.length ? rows : ["  none"])];
}

/**
 * What keeps the seat's alerts from sending (A-066): their timer is not active, or their last run failed; each with
 * what root runs next. The alerts are the owner's only escalation path, so status says when they do not run; empty
 * when the timer is active and the service has not failed.
 */
function alertsLines(): string[] {
	const problems = [
		...(platform.systemUnitState("limen-alerts.timer", "is-active") === "active"
			? []
			: [
					"  limen-alerts.timer is not active; as root, install the alerts:",
					`    node ${join(packageRoot(), "seat", "alerts.ts")} install --account <account>`,
				]),
		...(platform.systemUnitState("limen-alerts.service", "is-failed") === "failed"
			? ["  limen-alerts.service failed; as root, read why:", "    journalctl -u limen-alerts.service"]
			: []),
	];
	const count = problems.length / 2;
	return count === 0
		? []
		: [`Alerts not working (${count}); no alert reaches the phone until each is fixed:`, ...problems];
}

/**
 * What keeps the seat sweep from finalizing dead jobs (A-024, R-032): its timer is not active, or its last run failed;
 * each with what the agents' account runs next. These are the lines of `limen seat sweep --status` too. Empty when the
 * timer is active and the service has not failed.
 */
export function sweepLines(): string[] {
	const problems = [
		...(platform.userUnitState(SWEEP_TIMER, "is-active") === "active"
			? []
			: [
					`  ${SWEEP_TIMER} is not active; on the agents' account, install the sweep:`,
					"    limen seat sweep --install",
				]),
		...(platform.userUnitState(SWEEP_SERVICE, "is-failed") === "failed"
			? [`  ${SWEEP_SERVICE} failed; read why:`, `    journalctl --user -u ${SWEEP_SERVICE}`]
			: []),
	];
	const count = problems.length / 2;
	return count === 0
		? []
		: [`Sweep not working (${count}); no dead job is finalized until each is fixed:`, ...problems];
}

/**
 * The line of a job whose processes the seat sweep has failed to end three times in a row or more (R-032): its id,
 * the last reason, and since when; "" for any other job. The reason holds what systemd said, so it goes through
 * `shownField`, which keeps it on one line.
 */
function stuckLine(record: JobRecord | undefined): string {
	const stuck = record === undefined ? undefined : escalatedStuck(record);
	return stuck === undefined ? "" : `  ${record?.id}: ${shownField(stuck.detail)} (since ${stuck.since})`;
}

/**
 * One line for each coordinator session whose folder holds a Limen hook's refusal of a Pi value (T-32 (4)): the
 * session, the time and what was refused, while the folder holds it; Pi showed the refusal only in that session's
 * chat. The folder's name and the file's text come from outside Limen and reach the coordinator, so both go through
 * `shownField`, which keeps each refusal on its line. Empty when no session holds one.
 */
async function refusalLines(root: string): Promise<string[]> {
	return (await coordinatorRefusals(root)).map(
		({ session, at, detail }) =>
			`Coordinator session ${shownField(session)}, ${at ?? "time unknown"}: ${shownField(detail)}`,
	);
}

/** The leftover files of cut features, for the owner to check before the drop (A-042); empty when there are none. */
function leftoverLines(root: string): string[] {
	const found = listLeftovers(root);
	if (!found.length) {
		return [];
	}
	return [
		`Leftover files (${found.length}); check them, then run limen init --drop-leftovers:`,
		...found.map((entry) => `  ${entry.path} (${entry.feature})`),
	];
}

/**
 * The `LIMEN_*` variables of this command's environment that Limen no longer reads, with what replaces each, and the
 * ones it reads until a ticket replaces them (R-015, `plan.md` step 2.4); empty when there are none.
 */
function environmentLines(): string[] {
	const { ignored, exceptions } = ignoredSettings();
	return [
		...(ignored.length
			? [
					`Environment settings Limen no longer reads (${ignored.length}); remove them:`,
					...ignored.map((entry) => `  ${entry.name}: ${entry.replacement}`),
				]
			: []),
		...(exceptions.length
			? [
					`Environment variables read until a ticket replaces them (${exceptions.length}):`,
					...exceptions.map((entry) => `  ${entry.name}: until ${entry.until}`),
				]
			: []),
	];
}

async function readJobFiles(dir: string): Promise<JobFiles> {
	const record = await readRecord(dir);
	return {
		state: shownState(record),
		label: record?.label ?? "",
		branch: record?.branch ?? "",
		repo: record?.repo ?? "",
		// The Herdr integration keeps its tab in its own folder of the job (src/integrations/herdr.ts).
		tab: await text(`${dir}/herdr/tab`),
		worktree: record?.worktree ?? "",
		origin: record?.origin.tab ?? "",
		started: record?.startedAt ?? "",
		ended: record?.finishedAt ?? "",
		openChecks: (record?.openChecks?.length ?? 0) > 0,
		stuck: stuckLine(record),
	};
}

/** Sorts one job into running, older, unconfirmed, a group's branches, or a finished branch. */
async function scanJob(scan: Scan, id: string): Promise<void> {
	const dir = `${scan.jobsRoot}/${id}`;
	const job = await readJobFiles(dir);
	noteJobTabs(scan, job);
	if (job.stuck) {
		scan.stuck.push(job.stuck);
	}
	if (job.state === "running") {
		if (job.branch) {
			scan.runningBranches.add(`${job.repo}:${job.branch}`);
		}
		scan.running.push(await runningJobLine(scan, id, job));
		return;
	}
	const group = isTerminal(job.state) ? await openGroupMembership(dir, scan.root) : undefined;
	if (group?.run.closed) {
		return;
	}
	const finishedAt =
		Date.parse(job.ended) ||
		(await stat(dir).then(
			(value) => value.mtimeMs,
			() => 0,
		));
	if (!scan.all && scan.now - finishedAt > RECENT_MS) {
		scan.older += 1;
		return;
	}
	if (!isTerminal(job.state)) {
		scan.uncertain.push(`  ${job.label || id} (${id}) · unknown state ${job.state || "missing"}`);
		return;
	}
	if (group) {
		if (job.branch) {
			const candidate = scan.groups.get(group.run.id) ?? { feature: group.run.feature, branches: new Set<string>() };
			candidate.branches.add(`${job.repo}:${job.branch}`);
			scan.groups.set(group.run.id, candidate);
		}
		return;
	}
	if (job.branch) {
		scan.finished.set(`${job.repo}:${job.branch}`, {
			id,
			label: job.label || id,
			// Open note checks need a decision before the branch is a candidate.
			state: job.state === "done" && job.openChecks ? "done with open checks" : job.state,
			branch: job.branch,
			repo: job.repo,
		});
	}
}

/** Tabs and worktrees that belong to workers, so the coordinator list can leave them out. */
function noteJobTabs(scan: Scan, job: JobFiles): void {
	if (job.tab) {
		scan.workerTabs.add(job.tab);
	}
	if (job.worktree) {
		scan.worktrees.add(job.worktree);
	}
	if (job.origin && job.state === "running") {
		scan.originTabs.add(job.origin);
	}
	if (job.origin) {
		scan.lastOrigin = job.origin;
	}
}

async function runningJobLine(scan: Scan, id: string, job: JobFiles): Promise<string> {
	const { record } = await renderJobDirectory(scan.root, scan.jobsRoot, id, "row");
	const started = Date.parse(job.started);
	const minutes = started ? `${Math.max(0, Math.floor((scan.now - started) / 60_000))}m` : "";
	return [
		`  ${record.job?.label ?? (job.label || id)} (${id})`,
		job.tab,
		minutes,
		runningAttention(record),
		record.lastTool ?? "",
		job.repo ? `repo ${job.repo}` : "",
	]
		.filter(Boolean)
		.join(" · ");
}

/** Pulse, silence and advisory of a running job, or why its record is invalid. */
function runningAttention(record: ShownJob): string {
	if (record.invalid) {
		return `invalid: ${record.invalid}`;
	}
	const silent =
		record.silentMs !== undefined && record.silentMs >= 90_000 ? `silent ${Math.floor(record.silentMs / 60_000)}m` : "";
	return [
		record.pulse === "dead" ? DEAD_WRAPPER : (record.pulse ?? "unknown activity"),
		silent,
		record.advisory ? `advisory: ${record.advisory}` : "",
	]
		.filter(Boolean)
		.join(" · ");
}

/** The group a finished job belongs to, if its run is readable and in this plant. */
async function openGroupMembership(dir: string, root: string): Promise<GroupIdentity | undefined> {
	try {
		const group = await jobMembership(dir);
		if (
			group &&
			(group.run.root !== root ||
				typeof group.run.feature !== "string" ||
				!group.run.feature.trim() ||
				typeof group.run.closed !== "boolean")
		) {
			return undefined;
		}
		return group;
	} catch {
		// Unreadable membership must not hide a recoverable branch.
		return undefined;
	}
}

/** Asks Git which finished branches are unlanded: a done job is a candidate, any other state needs a decision. */
function sortUnlandedBranches(scan: Scan, ready: string[], decide: string[]): void {
	const byRepo = Map.groupBy(
		[...scan.finished].filter(([key]) => !scan.runningBranches.has(key)).map(([, job]) => job),
		(job) => job.repo,
	);
	for (const [repo, jobs] of byRepo) {
		let unlanded: ReadonlySet<string>;
		try {
			unlanded = unlandedBranches(
				repo ? workspaceRepository(scan.root, repo) : scan.root,
				jobs.map((job) => job.branch),
			);
		} catch (error) {
			const reason = error instanceof Error ? error.message : String(error);
			scan.uncertain.push(...jobs.map((job) => `  ${job.label} (${job.id}) · Git unknown: ${reason}`));
			continue;
		}
		for (const job of jobs.filter((each) => unlanded.has(each.branch))) {
			const line = `  ${job.label} (${job.id}) · ${job.state === "done" ? "" : `${job.state} · `}${job.branch}${repo ? ` · repo ${repo}` : ""}`;
			(job.state === "done" ? ready : decide).push(line);
		}
	}
}

function coordinatorLines(
	root: string,
	workspace: boolean,
	workers: ReadonlySet<string>,
	worktrees: ReadonlySet<string>,
	origins: ReadonlySet<string>,
): string[] {
	const bin = herdrBinary();
	if (!bin) {
		return ["  unknown (Herdr unavailable)"];
	}
	const result = spawnSync(bin, ["agent", "list"], { encoding: "utf8", timeout: 5_000 });
	if (result.error || result.status !== 0) {
		return recordedOriginLines(bin, origins, workers);
	}
	try {
		const payload = JSON.parse(result.stdout) as { result?: { agents?: Agent[] }; agents?: Agent[] };
		const agents = payload.result?.agents ?? payload.agents;
		if (!Array.isArray(agents)) {
			return recordedOriginLines(bin, origins, workers);
		}
		const plant = realpathSync(root);
		const relevant = agents.filter((agent) => {
			if (!agent.cwd || !agent.tab_id || workers.has(agent.tab_id) || worktrees.has(agent.cwd)) {
				return false;
			}
			let path: string;
			try {
				path = relative(plant, realpathSync(agent.cwd));
			} catch {
				return false;
			}
			return path === "" || (workspace && path !== ".." && !path.startsWith("../") && !path.startsWith(".limen"));
		});
		if (!relevant.length) {
			return ["  none found (not proof of an idle plant)"];
		}
		const tabs = listTabs(bin, []);
		return relevant.map((agent) => {
			const tab = tabs?.find((candidate) => candidate.tab_id === agent.tab_id);
			const subject = tabs ? ((tab && tabLabel(tab)) ?? "unlabeled tab") : "tab label unknown";
			const handle = agent.name ? `handle ${agent.name}` : "no handle";
			const ready = agent.interactive_ready === false ? " (not interactive)" : "";
			const where = agent.cwd && realpathSync(agent.cwd) !== plant ? ` · ${agent.cwd}` : "";
			return `  ${subject} · ${handle} · ${agent.agent_status ?? "unknown"}${ready} · ${agent.tab_id}${agent.pane_id ? ` ${agent.pane_id}` : ""}${where}`;
		});
	} catch {
		return recordedOriginLines(bin, origins, workers);
	}
}

/** Agent enumeration can stall while workspace tab listing still works. Origin tabs are partial evidence, not a coordinator registry. */
function recordedOriginLines(bin: string, origins: ReadonlySet<string>, workers: ReadonlySet<string>): string[] {
	const lines: string[] = [];
	const spaces = new Set([...origins].map((tab) => tab.split(":")[0]).filter((space): space is string => !!space));
	for (const workspace of spaces) {
		for (const tab of listTabs(bin, ["--workspace", workspace]) ?? []) {
			if (tab.tab_id && origins.has(tab.tab_id) && !workers.has(tab.tab_id)) {
				lines.push(`  ${tabLabel(tab) ?? "unlabeled tab"} · ${tab.agent_status ?? "unknown"} · ${tab.tab_id}`);
			}
		}
	}
	return lines.length
		? ["  Agent list unavailable; recorded origin tabs only (coordinator role unconfirmed):", ...lines]
		: ["  unknown (Herdr agent list unavailable; recorded origins unconfirmed)"];
}

/** Herdr's default tab label is the tab number, which names nothing. */
function tabLabel(tab: Tab): string | undefined {
	const label = tab.label?.trim();
	return label && label !== String(tab.number) ? label : undefined;
}

function listTabs(bin: string, args: readonly string[]): readonly Tab[] | undefined {
	const result = spawnSync(bin, ["tab", "list", ...args], { encoding: "utf8", timeout: 2_000 });
	if (result.error || result.status !== 0) {
		return undefined;
	}
	try {
		const tabs = (JSON.parse(result.stdout) as { result?: { tabs?: Tab[] } }).result?.tabs;
		return Array.isArray(tabs) ? tabs : undefined;
	} catch {
		return undefined;
	}
}
