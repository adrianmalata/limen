/**
 * The seat's alerts (A-066, A-054, D-084, D-085): one ntfy line for each failed job (one the subscription limit stopped
 * with a known reset only once its resume is overdue or Limen's resumes are used up), each long wait in the start queue
 * (A-036) and each job the seat sweep cannot end (R-032) of every registered project, sent from their own account,
 * which reads the job records read-only and keeps the events it reported and the projects it has read in its own
 * state folder (D-090). After the job records, each run watches `main` of each repository root's entries name, and
 * sends its forced update, its deletion, or 15 runs in a row that could not reach it (seat/main-watch.ts, D-117). An
 * alert holds only the project folder's base name, the event and the job id or the tip: it leaves the seat through a
 * public relay, so it carries no path, label or job text, and the topic comes only from the systemd credential.
 *
 *   node /opt/limen/seat/alerts.ts run                       the service, every minute, on the alerts account
 *   node /opt/limen/seat/alerts.ts install --account <name>  root, once: the read rights, the units, the timer
 *   node /opt/limen/seat/alerts.ts units --account <name>    root, from seat/deploy.ts: this version's units
 */
import { existsSync, realpathSync, type Stats } from "node:fs";
import { lstat, readFile, realpath, stat } from "node:fs/promises";
import { basename, dirname, isAbsolute, join } from "node:path";
import { fileURLToPath } from "node:url";
import { inspect } from "node:util";
import { atomicWrite } from "../src/atomic-write.ts";
import { testKnob } from "../src/config.ts";
import { quotaRings } from "../src/job/quota.ts";
import { escalatedStuck, type JobRecord, jobFolderNames, readRecord, unmigratedFolder } from "../src/job/record.ts";
import { type JobReader, newestOnWorktree } from "../src/job/unlanded.ts";
import { LimenError } from "../src/outcome.ts";
import type { ManagerCall } from "../src/platform/platform.ts";
import { placeUnitFiles } from "../src/platform/systemd-units.ts";
import {
	checkWatchFolder,
	type MainEvent,
	type MainKind,
	makeWatchFolder,
	TIP_CHARACTERS,
	watchMain,
} from "./main-watch.ts";
import { failed, type Runner, runProgram, why } from "./program.ts";
import { absent, readRegistry, registryOf, registryPaths } from "./registries.ts";
import {
	counted,
	modeOf,
	printable,
	reason,
	requiredText,
	SeatFailure,
	type SeatOutcome,
	shapeOf,
} from "./tool-outcome.ts";
import { ALERTS_SERVICE, ALERTS_TIMER, accountName, alertsUnitFiles, TOPIC_FILE, WATCH_FOLDER } from "./units.ts";

const SCRIPT = "/opt/limen/seat/alerts.ts";
const INSTALL = `node ${SCRIPT} install --account <account>`;
const USAGE = [
	`usage: node ${SCRIPT} run`,
	`       node ${SCRIPT} install --account <account>`,
	`       node ${SCRIPT} units --account <account>`,
].join("\n");
/** The public relay the alerts post to (A-066); the test knob LIMEN_ALERTS_URL names a local server instead. */
const NTFY = "https://ntfy.sh";
/** An ntfy topic name; the topic is the relay's only access control, so no output ever names it. */
const TOPIC = /^[A-Za-z0-9_-]{1,64}$/;
/** The width of every generated view (T-10), an alert line included (D-084). */
const LINE_LIMIT = 100;
const SEND_TIMEOUT_MS = 10_000;
/** The file of the service's state folder that holds the reported events, one key per line. */
const REPORTED = "reported";
/** The file of the service's state folder that holds the roots of the projects the alerts have read, one per line. */
const PROJECTS = "projects";
/**
 * The system tools the install and the alerts' runs need, declared here and checked by the install before it changes
 * anything (T-12), each by a call that only prints its version.
 */
const SEAT_TOOLS: ReadonlyArray<{ readonly probe: readonly [string, ...string[]]; readonly need: string }> = [
	{ probe: ["setfacl", "--version"], need: "the install grants the alerts account its read rights (the package acl)" },
	{ probe: ["systemd-analyze", "--version"], need: "the install verifies the units before they are loaded (D-010)" },
	{ probe: ["systemctl", "--version"], need: "the install reloads the units and enables the timer" },
	{ probe: ["git", "--version"], need: "the main watcher keeps its copy of each watched main (D-117)" },
	{ probe: ["ssh", "-V"], need: "the main watcher reaches each watched repository with its key (the OpenSSH client)" },
];

export type AlertsInput = {
	/** The command-line arguments: the subcommand and its flags. */
	readonly args: readonly string[];
	/** The password file whose home directories hold the project registries, and whose lines name the accounts. */
	readonly passwd: string;
	/** The environment, where systemd names the service's credentials and state folders. */
	readonly env: NodeJS.ProcessEnv;
	/** The user id this runs as, and the one that counts as root's: 0 on the seat; a test gives its own. */
	readonly uid: number;
	readonly rootUid: number;
	readonly run: Runner;
	/** The folder of the system manager's units. */
	readonly unitFolder: string;
	/** The root-owned file, mode 0600, that holds the ntfy topic. */
	readonly topicFile: string;
	/** The root-owned folder, mode 0700, of the `main` watcher's entries, which the install checks and makes. */
	readonly watchFolder: string;
	/** The time of a run, which the `main` watcher writes into a kept ref's name and the start of its failed runs. */
	readonly now: () => Date;
};

/**
 * An event of the job records (A-066): what a run's summary counts, and the words it sends, read from the job record
 * with the id of the newest record on that job's worktree.
 */
type RecordEvent = {
	readonly from: "record";
	readonly kind: string;
	readonly counted: string;
	readonly of: (record: JobRecord, newest: string | undefined) => string | undefined;
};
/** An event of the `main` watcher (seat/main-watch.ts): its kind, its word in the alert, and whether a tip follows. */
type WatchEvent = {
	readonly from: "main";
	readonly kind: MainKind;
	readonly event: string;
	readonly namesTip: boolean;
};

/** The events an alert reports, in one list (T-25). A plain `done` is no event. R-050, R-060 and R-069 add theirs here. */
const EVENTS: ReadonlyArray<RecordEvent | WatchEvent> = [
	// A `quota` failure rings at once with no reset time, A-016 (4)'s "notify me once"; with a known one Limen resumes the
	// job itself, so it rings only once that resume is overdue (src/job/quota.ts, D-100), or as `quota-exhausted`.
	{
		from: "record",
		kind: "failed",
		counted: "failed job",
		of: (record, newest) =>
			record.state === "failed" && (record.failure?.kind !== "quota" || quotaRings(record, newest))
				? `failed:${record.failure?.kind ?? "unknown"}`
				: undefined,
	},
	// A wait past the gate file's diagnoseAfter (A-036), read from the wait the record keeps after the job left the queue.
	{
		from: "record",
		kind: "queue",
		counted: "long start-queue wait",
		of: (record) => ((record.queueWait?.diagnosedAt ?? null) === null ? undefined : "queue"),
	},
	// A job whose processes the seat sweep failed to end three times in a row (R-032), read from the record's `stuck`.
	{
		from: "record",
		kind: "stuck",
		counted: "stuck job",
		of: (record) => (escalatedStuck(record) === undefined ? undefined : "stuck"),
	},
	// Each forced update or deletion of a watched `main` rings at once, with the tip the watcher's copy held; a remote no
	// run could reach in 15 runs in a row rings once per such run of failures (D-117 (2), (4), (5)).
	{ from: "main", kind: "forced", event: "main:forced", namesTip: true },
	{ from: "main", kind: "deleted", event: "main:deleted", namesTip: true },
	{ from: "main", kind: "unwatched", event: "main:unwatched", namesTip: false },
];
const RECORD_EVENTS = EVENTS.filter((each): each is RecordEvent => each.from === "record");

/**
 * One event to report: the root of its project, or the name of a watched one; its kind; its key, `<project
 * path>/<job id>/<kind>` or `<project>/main/<time of the occurrence>/<kind>`; and its line.
 */
type Alert = { readonly root: string; readonly kind: string; readonly key: string; readonly line: string };
/**
 * What a pass over the projects found: how many it read and their roots, the roots whose jobs it listed, their events,
 * what it could not read, and the registries it read and those in homes it cannot enter.
 */
type Scan = {
	projects: number;
	readonly roots: string[];
	readonly listed: string[];
	readonly alerts: Alert[];
	readonly problems: string[];
	readonly read: string[];
	readonly closed: string[];
	/** The registries, and the registered roots, the account can see but cannot read. */
	unreadableRegistries: number;
	unreadableRoots: number;
};
/** The topic once a run has read it, so that no text of the run can name it. */
type Secret = { topic?: string };

/** The tool's exit code and its text; only the entry point sets the code. */
export async function runAlerts(input: AlertsInput): Promise<SeatOutcome> {
	const said: string[] = [];
	const secret: Secret = {};
	const hidden = (text: string) => (secret.topic === undefined ? text : text.split(secret.topic).join("<topic>"));
	const stdout = () => hidden(said.map((line) => `${printable(line, "escape")}\n`).join(""));
	try {
		await perform(input, said, secret);
		return { code: 0, stdout: stdout(), stderr: "" };
	} catch (error) {
		if (error instanceof SeatFailure) {
			const stderr = hidden(`${printable(error.message, "keep")}\nnext: ${printable(error.next, "keep")}\n`);
			return { code: error.exitCode, stdout: stdout(), stderr };
		}
		return { code: 5, stdout: stdout(), stderr: hidden(`internal error: ${printable(inspect(error), "keep")}\n`) };
	}
}

async function perform(input: AlertsInput, said: string[], secret: Secret): Promise<void> {
	const [command, ...rest] = input.args;
	switch (command) {
		case "run":
			if (rest.length > 0) {
				throw usage(`run takes no arguments (given: ${rest.join(" ")})`);
			}
			return alertRun(input, said, secret);
		case "install":
			return install(input, accountArgument(rest), said);
		case "units":
			return refreshUnits(input, accountArgument(rest), said);
		default:
			throw usage(command === undefined ? "no subcommand" : `unknown subcommand ${JSON.stringify(command)}`);
	}
}

function usage(reason: string): SeatFailure {
	return new SeatFailure(2, `${reason}\n${USAGE}`, `node ${SCRIPT} run (the service) or ${INSTALL} (root, once)`);
}

/** The account of `--account <name>`, the only flag of `install` and `units`. */
function accountArgument(rest: readonly string[]): string {
	const [flag, name] = rest;
	if (rest.length !== 2 || flag !== "--account" || name === undefined) {
		throw usage(`expected --account <account> (given: ${rest.length === 0 ? "nothing" : rest.join(" ")})`);
	}
	if (!accountName(name)) {
		throw usage(`${JSON.stringify(name)} is not a system account name (lower-case letters, digits, - and _)`);
	}
	return name;
}

/** What the state folder held when a run began: the reported events and the read projects, each undefined if none. */
type State = { readonly reported: readonly string[] | undefined; readonly listed: readonly string[] | undefined };
/** The sends of one run: the topic, the state folder, the record of what was sent, and the lines of the run. */
type Sender = {
	readonly topic: string;
	readonly folder: string;
	known: Set<string>;
	readonly said: string[];
	readonly unsent: string[];
};

/**
 * One run of the service: every event of every project it can read, then the `main` watcher's (D-117). A project it
 * reads for the first time, every project on its first run included, has its present events recorded as reported and
 * none sent (A-054, D-090); the other projects send each new event, recorded only after ntfy took it. The watcher runs
 * whatever the registries gave, since no file the agents' account writes may stop it (D-117 (3)). What it cannot read
 * or send is named once every other project is done, so one damaged record never stops the rest (z. 10).
 */
async function alertRun(input: AlertsInput, said: string[], secret: Secret): Promise<void> {
	const credentials = credentialsFolder(input.env);
	secret.topic = await credentialTopic(credentials);
	const folder = stateFolder(input.env);
	const state: State = { reported: await stateLines(folder, REPORTED), listed: await stateLines(folder, PROJECTS) };
	const scan = await scanProjects(input.passwd);
	const events = RECORD_EVENTS.map((event) =>
		counted(scan.alerts.filter(({ kind }) => kind === event.kind).length, event.counted),
	);
	said.push(`read ${counted(scan.projects, "project")}: ${events.join(", ")}`);
	const sender: Sender = { topic: secret.topic, folder, known: new Set(state.reported ?? []), said, unsent: [] };
	const problems = [...scan.problems];
	// A run that reads nothing would exit 0 every minute while no failure reaches the phone (T-01), and a first run
	// would record nothing, so the failures already there would ring once the projects are readable.
	if (scan.projects === 0) {
		problems.push(noProjectRead(scan, input.passwd));
	} else {
		const { read, known } = await recordFirstReads(folder, state, scan, said);
		sender.known = known;
		await sendNew(
			sender,
			scan.alerts.filter(({ root }) => read.has(root)),
		);
	}
	const registered = scan.roots.map((root) => basename(root));
	const now = input.now();
	const watch = await watchMain({ credentials, state: folder, path: input.env.PATH, run: input.run, now, registered });
	said.push(...watch.said);
	problems.push(...watch.problems);
	await sendMainEvents(sender, scan.projects === 0 ? state : undefined, watch.events);
	endRun(problems, sender.unsent);
}

/** Sends each of `alerts` the record of what was sent lacks, and records each once ntfy took it. */
async function sendNew(sender: Sender, alerts: readonly Alert[]): Promise<void> {
	for (const alert of alerts) {
		if (sender.known.has(alert.key)) {
			continue;
		}
		const failure = await send(sender.topic, alert.line);
		if (failure === undefined) {
			sender.known.add(alert.key);
			await saveLines(sender.folder, REPORTED, sender.known);
			sender.said.push(`sent: ${alert.line}`);
		} else {
			sender.unsent.push(`not sent: ${alert.line} (${failure})`);
		}
	}
}

/**
 * Sends the `main` events no run has sent. They pass no first read (A-054): a watcher's first run holds each tip and
 * raises nothing, so an event is always news. `unread`, the state of a run that read no project, is checked first: when
 * no run ever read one, the empty list of read projects is written before any send writes `reported`, so a later run
 * still takes every project it reads as a first read, not as one of R-033's state that `recordFirstReads` sends from.
 */
async function sendMainEvents(sender: Sender, unread: State | undefined, events: readonly MainEvent[]): Promise<void> {
	const alerts = events.map(mainAlert).filter(({ key }) => !sender.known.has(key));
	if (alerts.length > 0 && unread !== undefined && unread.reported === undefined) {
		await saveLines(sender.folder, PROJECTS, new Set());
	}
	await sendNew(sender, alerts);
}

/**
 * The alert of a `main` event (D-117 (5)): `<project> main:<kind>` and, for a forced update or a deletion, the tip as
 * its first 12 characters, keyed by the time of its occurrence (R-106 Decision 9), so each forced update, deletion or
 * run of failures rings once, a tip rung before included (D-117 (4)).
 */
function mainAlert(event: MainEvent): Alert {
	const kind = EVENTS.find((each): each is WatchEvent => each.from === "main" && each.kind === event.kind);
	if (kind === undefined) {
		throw new Error(`the list of events holds no main:${event.kind}`);
	}
	return {
		root: event.project,
		kind: event.kind,
		key: `${event.project}/main/${event.at}/${event.kind}`,
		line: alertLine(event.project, kind.event, kind.namesTip ? event.tip?.slice(0, TIP_CHARACTERS) : undefined),
	};
}

/**
 * D-090 (1), A-054: a project the alerts read for the first time, one whose jobs this run listed and that is not in
 * the list of read projects, has its present events recorded as reported, none sent, and then joins the list. A first
 * run, with no reported events, has read no project yet; R-033's state, reported events and no list, has read every
 * project of this run. The events are written before the list, so a run that stops between the two reads the project
 * as new again and sends nothing old. Returns the projects read before this run, whose new events it sends, and the
 * reported events.
 */
async function recordFirstReads(
	folder: string,
	state: State,
	scan: Scan,
	said: string[],
): Promise<{ readonly read: ReadonlySet<string>; readonly known: Set<string> }> {
	const read = new Set(state.reported === undefined ? [] : (state.listed ?? scan.listed));
	const first = [...new Set(scan.listed.filter((root) => !read.has(root)))];
	const present = scan.alerts.filter(({ root }) => !read.has(root));
	const known = new Set([...(state.reported ?? []), ...present.map(({ key }) => key)]);
	if (state.reported === undefined || present.length > 0) {
		await saveLines(folder, REPORTED, known);
	}
	if (state.listed === undefined || first.length > 0) {
		await saveLines(folder, PROJECTS, new Set([...read, ...first]));
	}
	if (first.length > 0) {
		said.push(
			`first read of ${counted(first.length, "project")}: ${counted(present.length, "event")} recorded as reported, none sent (A-054)`,
		);
	}
	return { read, known };
}

/** The one line that says why a run read no project: what the registries of the password file gave it. */
function noProjectRead(scan: Scan, passwd: string): string {
	// What could not be read comes first: on the seat `/root/.limen/projects` is always closed, so a closed home or an
	// empty registry beside an unreadable one is not the cause (review round 2, G1).
	const unreadable = [
		...(scan.unreadableRegistries > 0 ? [counted(scan.unreadableRegistries, "registry", "registries")] : []),
		...(scan.unreadableRoots > 0 ? [counted(scan.unreadableRoots, "registered project")] : []),
	];
	if (unreadable.length > 0) {
		return `read no project: could not read ${unreadable.join(" and ")} (named above)`;
	}
	if (scan.read.length > 0) {
		return `read no project: no line of the registries ${scan.read.join(", ")} names a folder with .limen/`;
	}
	if (scan.closed.length > 0) {
		return `read no project: every registry is in a home this account cannot enter (${scan.closed.join(", ")})`;
	}
	return `read no project: no home directory of ${passwd} holds a project registry (~/.limen/projects)`;
}

/** Exits 4 when something could not be read, else 3 when an alert could not be sent; the next run tries again. */
function endRun(problems: readonly string[], unsent: readonly string[]): void {
	if (problems.length > 0) {
		throw new SeatFailure(
			4,
			[...problems, ...unsent].join("\n"),
			`check each path above; when the alerts account lacks a read right, as root: ${INSTALL}`,
		);
	}
	if (unsent.length > 0) {
		throw new SeatFailure(3, unsent.join("\n"), `none: the next run of ${ALERTS_SERVICE} sends them again`);
	}
}

/** Root's start of the service, which hands it its credentials and its state folder. */
const START = `as root: systemctl start ${ALERTS_SERVICE}`;

/**
 * The folder where systemd gives the service its credentials, the topic (A-066) and the `main` watcher's entries
 * (D-117 (3)); no variable can name another source.
 */
function credentialsFolder(env: NodeJS.ProcessEnv): string {
	const folder = env.CREDENTIALS_DIRECTORY;
	if (!folder) {
		throw new SeatFailure(
			4,
			`CREDENTIALS_DIRECTORY is not set: the alerts read their ntfy topic only from the credential topic that ${ALERTS_SERVICE} loads from ${TOPIC_FILE}`,
			`run them as their service, ${START}`,
		);
	}
	return folder;
}

/** The topic of the credential `topic` in the credentials folder `folder` (A-066). */
async function credentialTopic(folder: string): Promise<string> {
	const path = join(folder, "topic");
	let text: string;
	try {
		text = await readFile(path, "utf8");
	} catch (error) {
		throw new SeatFailure(
			4,
			`cannot read the credential ${path}: ${reason(error)}`,
			`check ${TOPIC_FILE}, then ${START}`,
		);
	}
	const topic = text.trim();
	if (!TOPIC.test(topic)) {
		throw new SeatFailure(
			4,
			`the credential ${path} holds no ntfy topic name (1 to 64 letters, digits, - or _)`,
			`as root, write the topic into ${TOPIC_FILE}, then ${START}`,
		);
	}
	return topic;
}

/** The service's own state folder, which systemd makes for `StateDirectory=` and names in `STATE_DIRECTORY`. */
function stateFolder(env: NodeJS.ProcessEnv): string {
	const folder = env.STATE_DIRECTORY;
	if (!folder) {
		throw new SeatFailure(
			4,
			`STATE_DIRECTORY is not set: the alerts keep the events they reported in the state folder of ${ALERTS_SERVICE}`,
			`run them as their service, as root: systemctl start ${ALERTS_SERVICE}`,
		);
	}
	return folder;
}

/** The lines of the state file `name`, the reported events or the read projects; undefined before a run wrote it. */
async function stateLines(folder: string, name: string): Promise<readonly string[] | undefined> {
	const path = join(folder, name);
	try {
		return (await readFile(path, "utf8")).split("\n").filter(Boolean);
	} catch (error) {
		if (absent(error)) {
			return undefined;
		}
		throw new SeatFailure(4, `cannot read ${path}: ${reason(error)}`, `check the state folder ${folder}`);
	}
}

/** Writes `lines`, sorted, as the state file `name`, readable by the alerts' account alone. */
async function saveLines(folder: string, name: string, lines: ReadonlySet<string>): Promise<void> {
	const path = join(folder, name);
	const sorted = [...lines].sort();
	try {
		await atomicWrite(path, sorted.length > 0 ? `${sorted.join("\n")}\n` : "", { mode: 0o600 });
	} catch (error) {
		throw new SeatFailure(4, `cannot write ${path}: ${reason(error)}`, `check the state folder ${folder}`);
	}
}

/** Every event of every project of the registries the account can read; what it cannot read goes to `problems`. */
async function scanProjects(passwd: string): Promise<Scan> {
	const scan: Scan = {
		projects: 0,
		roots: [],
		listed: [],
		alerts: [],
		problems: [],
		read: [],
		closed: [],
		unreadableRegistries: 0,
		unreadableRoots: 0,
	};
	// Each root counts once, however many registries list it, whether it is read or cannot be (D-090 (2)).
	const seen = new Set<string>();
	for (const path of registryPaths(await requiredText(passwd, `systemctl start ${ALERTS_SERVICE}`))) {
		const read = await readRegistry(path);
		if (read.kind === "absent") {
			continue;
		}
		// A home the account cannot enter holds no registry of its own to read; the install opened the agents' one.
		if (read.kind === "closed") {
			scan.closed.push(path);
			continue;
		}
		if (read.kind === "unreadable") {
			scan.unreadableRegistries += 1;
			scan.problems.push(`cannot read the registry ${path}: ${reason(read.error)}`);
			continue;
		}
		scan.read.push(path);
		for (const line of read.lines) {
			if (seen.has(line.root) || !(line.kind === "unreadable" || line.kind === "project")) {
				continue;
			}
			seen.add(line.root);
			if (line.kind === "unreadable") {
				scan.unreadableRoots += 1;
				scan.problems.push(`cannot read the project ${line.root}: ${reason(line.error)}`);
			} else {
				scan.projects += 1;
				scan.roots.push(line.root);
				await projectAlerts(line.root, scan);
			}
		}
	}
	return scan;
}

/** The events of the project at `root`, from its records, read-only (T-04); a root whose jobs it lists is `listed`. */
async function projectAlerts(root: string, scan: Scan): Promise<void> {
	const jobs = join(root, ".limen", "jobs");
	let names: readonly string[];
	try {
		names = await jobFolderNames(jobs);
	} catch (error) {
		scan.problems.push(`cannot read the project ${root}: ${reason(error)}`);
		return;
	}
	scan.listed.push(root);
	const records = new Map<string, JobRecord>();
	for (const name of names) {
		const dir = join(jobs, name);
		// A folder an older Limen wrote holds no record yet, and the migration makes it history (D-057 (4)).
		if (unmigratedFolder(dir)) {
			continue;
		}
		try {
			const record = await readRecord(dir);
			if (record !== undefined) {
				records.set(name, record);
			}
		} catch (error) {
			scan.problems.push(`cannot read the record of ${dir}: ${reason(error)}`);
		}
	}
	// The newest record on each worktree, from the records that read, tells a job that a continuation took over (D-100).
	const reader: JobReader = {
		jobs: async () => [...records.keys()],
		record: async (dir) => records.get(basename(dir)),
	};
	const newest = await newestOnWorktree(root, reader);
	for (const record of records.values()) {
		// A record the migration wrote is history, which no alert answers (D-057 (4)).
		if (record.migrated !== undefined) {
			continue;
		}
		for (const { kind, of } of RECORD_EVENTS) {
			const event = of(record, record.worktree === null ? undefined : newest(record.worktree));
			if (event !== undefined) {
				const key = `${root}/${record.id}/${kind}`;
				scan.alerts.push({ root, kind, key, line: alertLine(root, event, record.id) });
			}
		}
	}
}

/**
 * The alert of D-084: `<project folder's base name> <event> <subject>`, the subject a job id or a tip, or no subject
 * (D-117 (5)), at most 100 characters (T-10). A longer line cuts the name with a visible ellipsis; a subject too long
 * for the line, which no Limen makes, keeps its end, a job id's token.
 */
export function alertLine(root: string, event: string, subject?: string): string {
	const name = [...printable(basename(root), "escape")];
	const shown = subject === undefined ? "" : printable(subject, "escape");
	const tail = [...` ${event}${subject === undefined ? "" : ` ${shown}`}`];
	if (name.length + tail.length <= LINE_LIMIT) {
		return [...name, ...tail].join("");
	}
	if (tail.length < LINE_LIMIT) {
		return [...name.slice(0, LINE_LIMIT - tail.length - 1), "…", ...tail].join("");
	}
	const head = `… ${event} …`;
	return `${head}${[...shown].slice(-(LINE_LIMIT - [...head].length)).join("")}`;
}

/** Posts `line` as the body of one ntfy message with no title; the reason it was not taken, or undefined. */
async function send(topic: string, line: string): Promise<string | undefined> {
	try {
		const response = await fetch(`${testKnob("LIMEN_ALERTS_URL") ?? NTFY}/${topic}`, {
			method: "POST",
			body: line,
			signal: AbortSignal.timeout(SEND_TIMEOUT_MS),
		});
		await response.body?.cancel();
		return response.ok ? undefined : `ntfy answered ${response.status}`;
	} catch (error) {
		return reason(error);
	}
}

/**
 * Root's install (D-085): it refuses before any change unless it runs as root, the account exists and is one of the
 * alerts' own, the topic file is root's with mode 0600, the watch folder of the `main` watcher, when there is one, and
 * its entries are root's as the topic file is (seat/main-watch.ts), and every seat tool runs; then it grants the
 * account its read rights by ACL, once a registry names a project, makes the watch folder when it is absent, places and
 * verifies the units, and enables the timer. Run again, it changes nothing that is already in place.
 */
async function install(input: AlertsInput, account: string, said: string[]): Promise<void> {
	refuseUnlessRoot(input, "install");
	const passwd = await requiredText(input.passwd, `node ${SCRIPT} install --account ${account}`);
	await requireOwnAccount(accountEntry(passwd, account, input.passwd), account);
	await requireTopicFile(input);
	said.push(await checkWatchFolder(input.watchFolder, input.rootUid, INSTALL));
	for (const { probe, need } of SEAT_TOOLS) {
		const ran = input.run(probe);
		if (failed(ran)) {
			throw new SeatFailure(4, `${probe[0]} cannot run (${why(ran)}); ${need}`, `install ${probe[0]}, then ${INSTALL}`);
		}
	}
	const grants = await grantsOf(passwd, input.passwd);
	for (const [rights, paths] of [
		["--x", grants.traverse],
		["r-x", grants.jobs],
		["r--", grants.registries],
	] as const) {
		if (paths.length > 0) {
			step(input.run, ["setfacl", "-m", `u:${account}:${rights}`, ...paths], `granting ${rights}`);
		}
	}
	said.push(
		`granted ${account} --x on ${counted(grants.traverse.length, "folder")}, r-x on ${counted(grants.jobs.length, "jobs folder")} and r-- on ${counted(grants.registries.length, "registry", "registries")}`,
	);
	await watchFolder(input, INSTALL, said);
	await placeUnits(input, account, said);
	step(input.run, ["systemctl", "enable", "--now", ALERTS_TIMER], "enabling the timer");
	said.push(`enabled ${ALERTS_TIMER}; its first run records the events already there and sends none (A-054)`);
}

/**
 * The units step of `seat/deploy.ts` (D-085): this version's units for the account the installed service holds, after
 * the watch folder they load, which it makes when it is absent, so a deployment never leaves the service without it.
 */
async function refreshUnits(input: AlertsInput, account: string, said: string[]): Promise<void> {
	refuseUnlessRoot(input, "units");
	const again = `node ${SCRIPT} units --account ${account}`;
	accountEntry(await requiredText(input.passwd, again), account, input.passwd);
	await watchFolder(input, again, said);
	await placeUnits(input, account, said);
}

/** Makes the watch folder of the `main` watcher, root's with mode 0700, when it is absent (seat/main-watch.ts). */
async function watchFolder(input: AlertsInput, again: string, said: string[]): Promise<void> {
	if (await makeWatchFolder(input.watchFolder, again)) {
		said.push(
			`made the watch folder ${input.watchFolder}, root's with mode 0700; no main is watched until root writes its entries`,
		);
	}
}

function refuseUnlessRoot(input: AlertsInput, command: string): void {
	if (input.uid !== input.rootUid) {
		throw new SeatFailure(
			1,
			`refused: ${command} writes units into ${input.unitFolder}, so it runs only as root`,
			`as root: node ${SCRIPT} ${command} --account <account>`,
		);
	}
}

/** The fields of the password file's line of `account` (name, password, uid, gid, comment, home, shell). */
function accountEntry(passwd: string, account: string, path: string): readonly string[] {
	const fields = passwd
		.split("\n")
		.map((line) => line.split(":"))
		.find((each) => each[0] === account);
	if (fields === undefined) {
		throw new SeatFailure(
			1,
			`refused: the account ${account} does not exist (no line of ${path} names it)`,
			`as root, create the alerts account, then: node ${SCRIPT} install --account ${account}`,
		);
	}
	return fields;
}

/**
 * G2: the alerts run on an account of their own, which reads the records and writes none of them. Root's account
 * writes everything, and an agents' account, whose home holds a Limen registry, writes the records it would report.
 */
async function requireOwnAccount(fields: readonly string[], account: string): Promise<void> {
	const another = `as root, create an account for the alerts alone (useradd --system), then ${INSTALL}`;
	if (fields[2] === "0") {
		throw new SeatFailure(
			1,
			`refused: ${account} has uid 0, root's; the alerts run on an account of their own`,
			another,
		);
	}
	const home = fields[5] ?? "";
	const registry = isAbsolute(home) ? registryOf(home) : undefined;
	if (registry !== undefined && (await entryAt(registry)) !== undefined) {
		throw new SeatFailure(
			1,
			`refused: the home of ${account} holds the Limen registry ${registry}, so it is an agents' account; the alerts run on an account of their own`,
			another,
		);
	}
}

/** The topic file must be a regular file of root's with mode 0600, since systemd hands its text to the service. */
async function requireTopicFile(input: AlertsInput): Promise<void> {
	const path = input.topicFile;
	const make = `as root, write the topic into ${path} (install -o root -g root -m 0600), then ${INSTALL}`;
	let info: Stats;
	try {
		info = await lstat(path);
	} catch (error) {
		if (absent(error)) {
			throw new SeatFailure(1, `refused: the topic file ${path} is missing`, make);
		}
		throw new SeatFailure(4, `cannot read the topic file ${path}: ${reason(error)}`, make);
	}
	if (!info.isFile() || info.uid !== input.rootUid || modeOf(info) !== "0600") {
		throw new SeatFailure(
			1,
			`refused: the topic file ${path} must be a regular file of root's with mode 0600; it is ${shapeOf(info, input.rootUid)}`,
			make,
		);
	}
}

/** The paths that get each right: traverse, read and traverse (the jobs folders), read (the registries). */
type Grants = {
	readonly traverse: readonly string[];
	readonly jobs: readonly string[];
	readonly registries: readonly string[];
};

/**
 * The read rights the alerts need, by the narrowest access that reads the records: `--x` on every folder above a
 * registry and above a project's `.limen/jobs`, `r-x` on `.limen/jobs`, `r--` on each registry. Root grants them
 * only along real paths, so that no link an agent planted moves a right onto another file. With no registered project
 * the alerts would read nothing and exit 0 every minute (T-01), so the install refuses before any grant.
 */
async function grantsOf(passwd: string, path: string): Promise<Grants> {
	const found = await grantsOfRegistries(passwd);
	if (found.projects === 0) {
		throw new SeatFailure(
			1,
			`refused: no registry under the home directories of ${path} names a project, so the alerts would read nothing`,
			`run limen init in each project on the agents' account, then ${INSTALL}`,
		);
	}
	return found.grants;
}

/** The grants of every registry and of every registered project, and how many projects the registries name. */
async function grantsOfRegistries(passwd: string): Promise<{ readonly grants: Grants; readonly projects: number }> {
	const [traverse, jobs, registries] = [new Set<string>(), new Set<string>(), new Set<string>()];
	const again = `fix it, then ${INSTALL}`;
	let projects = 0;
	for (const path of registryPaths(passwd)) {
		const read = await readRegistry(path);
		if (read.kind === "absent") {
			continue;
		}
		if (read.kind !== "read") {
			throw new SeatFailure(4, `cannot read the registry ${path}: ${reason(read.error)}`, again);
		}
		await requireRealPath(path, `the registry ${path}`);
		registries.add(path);
		for (const folder of parents(path)) {
			traverse.add(folder);
		}
		for (const line of read.lines) {
			if (line.kind === "unreadable") {
				throw new SeatFailure(4, `cannot read ${line.path}: ${reason(line.error)}`, again);
			}
			if (line.kind !== "project") {
				continue;
			}
			projects += 1;
			const folder = join(line.root, ".limen", "jobs");
			// A project without `.limen/jobs/` holds no job yet, so it needs no right there.
			if ((await entryAt(folder))?.isDirectory()) {
				await requireRealPath(folder, `the jobs folder of the registered project ${line.root}`);
				jobs.add(folder);
				for (const parent of parents(folder)) {
					traverse.add(parent);
				}
			}
		}
	}
	const grants = { traverse: [...traverse].sort(), jobs: [...jobs].sort(), registries: [...registries].sort() };
	return { grants, projects };
}

/** Every folder above `path` but `/`, which every account can enter already. */
function parents(path: string): string[] {
	const found: string[] = [];
	for (let folder = dirname(path); folder !== dirname(folder); folder = dirname(folder)) {
		found.push(folder);
	}
	return found;
}

/** What is at `path`, as root sees it; undefined when nothing is. */
async function entryAt(path: string): Promise<Stats | undefined> {
	try {
		return await stat(path);
	} catch (error) {
		if (absent(error)) {
			return undefined;
		}
		throw new SeatFailure(4, `cannot read ${path}: ${reason(error)}`, `fix it, then ${INSTALL}`);
	}
}

/** Refuses a path that a symbolic link leads through: root would grant the right on what the link names. */
async function requireRealPath(path: string, what: string): Promise<void> {
	let real: string;
	try {
		real = await realpath(path);
	} catch (error) {
		throw new SeatFailure(4, `cannot read ${path}: ${reason(error)}`, `fix it, then ${INSTALL}`);
	}
	if (real !== path) {
		throw new SeatFailure(
			1,
			`refused: ${what} is ${real} by its real path, and the install grants rights only along a real path`,
			`register the project by its real path (limen init in it) and remove the other line, then ${INSTALL}`,
		);
	}
}

/**
 * Places this version's units in the system manager's folder through the one placement policy of unit files
 * (src/platform/systemd-units.ts): only a unit whose text differs is written, both are verified with `systemd-analyze
 * verify` (D-010) when one was, and a failure puts every unit back as it was. Then it reloads the manager, also when no
 * unit changed: a reload that failed before left the written units unloaded, and the next run finds them unchanged.
 */
async function placeUnits(input: AlertsInput, account: string, said: string[]): Promise<void> {
	const files = alertsUnitFiles(account);
	const units = files.map((unit) => ({ path: join(input.unitFolder, unit.file), text: unit.text }));
	const verify = (paths: readonly string[]): ManagerCall => {
		const result = input.run(["systemd-analyze", "verify", ...paths]);
		return failed(result) ? { kind: "failed", detail: why(result) } : { kind: "done" };
	};
	let written: readonly string[];
	try {
		written = await placeUnitFiles(units, { name: "systemd-analyze verify", verify }, null);
	} catch (error) {
		if (!(error instanceof LimenError)) {
			throw error;
		}
		const fix = error.code === "UNITS_INVALID" ? "fix the units" : "fix it";
		throw new SeatFailure(4, error.message, `${fix}, then run the same command again`);
	}
	step(input.run, ["systemctl", "daemon-reload"], "reloading the units");
	const names = files.map((unit) => unit.file).join(" and ");
	said.push(
		written.length === 0
			? `${names} unchanged in ${input.unitFolder}; reloaded`
			: `wrote ${written.map((path) => basename(path)).join(" and ")} in ${input.unitFolder}; verified and reloaded`,
	);
}

/** Runs one step of the install; a step that fails ends it with exit 4, naming the step and what the program said. */
function step(run: Runner, argv: readonly [string, ...string[]], doing: string): void {
	const result = run(argv);
	if (failed(result)) {
		throw new SeatFailure(
			4,
			`${doing} failed: ${argv.join(" ")}: ${why(result)}`,
			"fix the cause, then run the same command again",
		);
	}
}

// As in seat/deploy.ts: the entry point compares the real path of the script Node started, so a start through a
// symlinked path runs the tool too, and an import by a test runs nothing.
const started = process.argv[1];
if (started !== undefined && existsSync(started) && realpathSync(started) === fileURLToPath(import.meta.url)) {
	const outcome = await runAlerts({
		args: process.argv.slice(2),
		passwd: "/etc/passwd",
		env: process.env,
		uid: process.getuid?.() ?? -1,
		rootUid: 0,
		run: runProgram,
		unitFolder: "/etc/systemd/system",
		topicFile: TOPIC_FILE,
		watchFolder: WATCH_FOLDER,
		now: () => new Date(),
	});
	process.stdout.write(outcome.stdout);
	process.stderr.write(outcome.stderr);
	process.exitCode = outcome.code;
}
