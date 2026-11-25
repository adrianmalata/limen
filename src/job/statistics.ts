// `limen stats` (D-072, D-073, D-098): every job record of this project, those of the job archive included (gate 2 §2,
// A-002) but its folders that never ran, and each job's own transcripts, counted by route and role (jobs, done, failed,
// run time and the four token classes); then the lands, each a job with a `landed` marker with the jobs its `parent`
// chain reaches and the reviewers of its branch, with their tokens and lead time per land (M-06, M-07); with
// `--sessions`, the coordinator's sessions in that folder, their tokens and turns, the cache read per turn and per land
// (M-03) and the cache write of the turn after each land (M-04); then the failed jobs by kind, then what it did not
// read. It reads the records through src/job/record.ts and every transcript through src/job/usage.ts, never Git or the
// prose of `log` or `result` (T-37 (1), D-057 (4)), and it writes nothing and waits for nothing (T-04). A part the
// records do not hold is named `unknown`, or `—` where it would be a number, never guessed, so a null role and a null
// failure kind get their own row and count, and each folder, record, transcript line, run time, lead time and part of
// one it could not read is counted on the last line (z. 10). A migrated record is history that it reads like any other
// (D-057 (4)), and so is the record of a scout that ran (T-33).
import { join } from "node:path";
import { LimenError, usageError } from "../outcome.ts";
import { limenRoot } from "../project/git.ts";
import { localDay } from "../project/lanes.ts";
import { everRan, isTerminal } from "./job.ts";
import { isDayOnly } from "./landing.ts";
import {
	archivedJobs,
	FAILURE_KINDS,
	type JobRecord,
	jobFolderNames,
	jobFolders,
	type Landed,
	type Route,
	readRecord,
	waitOf,
} from "./record.ts";
import { simpleCommands } from "./session-commands.ts";
import {
	isTurn,
	readSessionFile,
	readSessionUsage,
	type SessionEntry,
	type SessionUsage,
	sessionFiles,
	startsRun,
	usageOf,
} from "./usage.ts";

/** The name of a part the record does not hold (z. 10). */
const UNKNOWN = "unknown";
/** A number the records cannot give, such as a lead time part no land has (D-098 (4)). */
const NONE = "—";
/** A simple command that lands work, by the name or the path of `limen`: `limen land …` or `limen ticket done …`. */
const LAND_COMMAND = /^(?:\S*\/)?limen (?:land|ticket done)(?: |$)/;
/** A flag the parser takes as help, `--help` or `-h` (`asksHelp`, src/parser.ts), as one word of a simple command. */
const HELP = / (?:--help|-h)(?: |$)/;
const HEADERS = ["route", "role", "jobs", "done", "failed", "run time", "input", "cache write", "cache read", "output"];
/** The parts of a lead time in the order of their line, each with its name there; the total is the lead time. */
const LEAD_PARTS = [
	["total", "lead time"],
	["queue", "queue"],
	["runs", "job runs"],
	["review", "review"],
] as const;
/** The columns of text, aligned left; the numbers after them are aligned right. */
const TEXT_COLUMNS = 2;
/** The place of each failure kind of A-016 (1) in its list, which orders kinds of an equal count. */
const KIND_ORDER: ReadonlyMap<string, number> = new Map(FAILURE_KINDS.map((kind, place) => [kind, place]));

/** One job folder's record, with the usage of its transcripts and the number of their lines that do not parse. */
type Job = { readonly record: JobRecord; readonly usage: SessionUsage | undefined; readonly unread: number };
/** One row of the table: a route and a role, with what its jobs add up to. */
type Row = {
	readonly route: string;
	readonly role: string;
	jobs: number;
	done: number;
	failed: number;
	runMs: number;
	input: number;
	cacheWrite: number;
	cacheRead: number;
	output: number;
};
/** What the count could not read (z. 10), for the last line. */
type Skipped = {
	readonly unmigrated: number;
	noRecord: number;
	damaged: number;
	/** The lines of each job's transcripts that do not parse, by the job's id, in the order of the folders. */
	readonly transcripts: Map<string, number>;
	runTimes: number;
	/** The lands by `limen ticket done`, which have no lead time. */
	noLeadTime: number;
	/** Of the other lands, by each part of the lead time, those whose part the records cannot give. */
	unknownParts: Readonly<Record<keyof LeadTime, number>>;
	/** With `--sessions`: the lands whose time lies outside the coordinator sessions' span. */
	outsideSessions: number;
	/** With `--sessions`: the lines of the coordinator sessions that do not parse. */
	sessionLines: number;
};

/**
 * A land (D-098 (1)): a job with a `landed` marker, its marker, and its jobs: the landed job first, then each job its
 * `parent` chain reaches, then the reviewers of its branch.
 */
export type Land = { readonly job: JobRecord; readonly landed: Landed; readonly jobs: readonly JobRecord[] };
/**
 * A land's lead time and its parts (M-06), in milliseconds, each undefined where the records cannot give it (D-057
 * (4)): from the first queue entry or start of its jobs to its land; the queue waits of its jobs; the run parts of its
 * jobs but the reviewers; the reviewers' run parts. M-06 is a split, so a job's run part is its run time less its own
 * queue wait: a job waits in the start queue in the state `running` (src/runtime/wrapper.ts), and the jobs table's run
 * time holds that wait, which `queue` counts.
 */
export type LeadTime = {
	readonly total: number | undefined;
	readonly queue: number | undefined;
	readonly runs: number | undefined;
	readonly review: number | undefined;
};
/** The first and the last time of the coordinator sessions' entries that carry a usage, in milliseconds. */
type Span = { readonly first: number; readonly last: number };
/**
 * What the coordinator's session files of a `--sessions` folder hold: their number, their usage, its span, the cache
 * write of the turn after each land call (M-04), and the number of their lines that do not parse.
 */
type Coordinator = {
	readonly sessions: number;
	readonly usage: SessionUsage | undefined;
	readonly span: Span | undefined;
	readonly afterLands: readonly number[];
	readonly unread: number;
};

/**
 * The report of `limen stats` for the project at `cwd`, as text for people, with the coordinator's sessions of the
 * folder `sessions` when it is given (D-098 (3)). NOT_MIGRATED, as every read of the jobs, when a folder holds a record
 * of an older Limen; SESSIONS_NOT_FOUND when no folder is at `sessions`.
 */
export async function projectStatistics(cwd: string, sessions?: string): Promise<string> {
	const root = limenRoot(cwd);
	const coordinator = sessions === undefined ? undefined : readCoordinator(sessions);
	const { jobs, skipped } = await readProjectJobs(root);
	const records = jobs.map((job) => job.record);
	const lands = landsOf(records);
	const times = lands.flatMap((land) => leadTimeOf(land) ?? []);
	skipped.runTimes = records.filter((record) => isTerminal(record.state) && runTime(record) === undefined).length;
	skipped.noLeadTime = lands.length - times.length;
	skipped.unknownParts = unknownPartsOf(times);
	if (coordinator !== undefined) {
		skipped.outsideSessions = lands.length - landsWithin(lands, coordinator.span);
		skipped.sessionLines = coordinator.unread;
	}
	const usages = new Map(jobs.map((job) => [job.record.id, job.usage]));
	return [
		heading(records),
		...table(rowsOf(jobs)),
		...landLines(lands, usages),
		...coordinatorLines(coordinator, lands),
		failedLine(records),
		...notReadLine(skipped),
	].join("\n");
}

/**
 * Every job folder of the project at `root`, those of the job archive included, and what the read left out. A folder
 * of the archive that never ran (`everRan`: no record, or a `starting` one) is no job: the daily prune moved it there
 * from a start that never ran, where before R-101 it deleted it, so the counts skip it, as the claim lookup does
 * (src/integrations/github-review.ts), and stay what they were before that start (R-101 review round 2, G2). A folder
 * of `.limen/jobs/` counts as it is, since a start may still be there.
 */
async function readProjectJobs(root: string): Promise<{ readonly jobs: readonly Job[]; readonly skipped: Skipped }> {
	const jobsRoot = join(root, ".limen", "jobs");
	const folders = [
		...(await jobFolders(jobsRoot)).map((id) => ({ id, jobDir: join(jobsRoot, id), archived: false })),
		...(await archivedJobs(root)).map((job) => ({ ...job, archived: true })),
	];
	const skipped: Skipped = {
		unmigrated: (await jobFolderNames(join(root, ".limen", "unmigrated"))).length,
		noRecord: 0,
		damaged: 0,
		transcripts: new Map(),
		runTimes: 0,
		noLeadTime: 0,
		unknownParts: { total: 0, queue: 0, runs: 0, review: 0 },
		outsideSessions: 0,
		sessionLines: 0,
	};
	const jobs: Job[] = [];
	for (const { id, jobDir, archived } of folders) {
		const job = await readJob(jobDir);
		if (archived && job !== "damaged" && !everRan(job?.record.state)) {
			continue;
		}
		if (job === undefined) {
			skipped.noRecord += 1;
		} else if (job === "damaged") {
			skipped.damaged += 1;
		} else {
			jobs.push(job);
			if (job.unread) {
				skipped.transcripts.set(id, job.unread);
			}
		}
	}
	return { jobs, skipped };
}

/**
 * The record of the folder `jobDir` with the usage of its transcripts: undefined when the folder holds no record, and
 * "damaged" when its record does not parse.
 */
async function readJob(jobDir: string): Promise<Job | "damaged" | undefined> {
	const record = await readRecord(jobDir).catch(unparsed);
	if (record === undefined || record === "damaged") {
		return record;
	}
	const { usage, unread } = readSessionUsage(jobDir, record.startedAt);
	return { record, usage, unread: unread.length };
}
/** A record the read refused (BAD_DATA) does not parse; any other failure goes on (T-01). */
function unparsed(error: unknown): "damaged" {
	if (error instanceof LimenError && error.code === "BAD_DATA") {
		return "damaged";
	}
	throw error;
}

/**
 * The time from a finished job's first transition to the one into its terminal state; undefined when its transitions
 * give none, as for a migrated record with no start time (D-057 (4)).
 */
function runTime(record: JobRecord): number | undefined {
	const [first] = record.transitions;
	const end = record.transitions.findLast((transition) => transition.to === record.state);
	if (first === undefined || end === undefined || end === first) {
		return undefined;
	}
	const ms = Date.parse(end.at) - Date.parse(first.at);
	return ms >= 0 ? ms : undefined;
}
/** The run time of a finished job; undefined for a job that has not finished, whose run has no end yet. */
function finishedRun(record: JobRecord): number | undefined {
	return isTerminal(record.state) ? runTime(record) : undefined;
}

/**
 * The lands of `records` (D-098 (1)), in the order they landed: each job with a `landed` marker, the jobs its `parent`
 * chain reaches, and the reviewers of its branch, from the records alone, never from Git. A job belongs to at most one
 * land: a chain stops at a job another land holds or that landed itself, so a parent that two lands reach belongs to
 * the first; a reviewer of a branch that several lands share belongs to the first of them that landed after its start,
 * else to the last.
 */
export function landsOf(records: readonly JobRecord[]): Land[] {
	const byId = new Map(records.map((record) => [record.id, record]));
	const lands = records
		.flatMap((job) => (job.landed === undefined ? [] : [{ job, landed: job.landed, jobs: [job] }]))
		.sort((a, b) => order(a.landed.at, b.landed.at) || order(a.job.id, b.job.id));
	const taken = new Set(lands.map(({ job }) => job.id));
	for (const land of lands) {
		let parent = byId.get(land.job.parent ?? "");
		while (parent !== undefined && !taken.has(parent.id)) {
			taken.add(parent.id);
			land.jobs.push(parent);
			parent = byId.get(parent.parent ?? "");
		}
	}
	for (const reviewer of records.filter((record) => record.role === "reviewer" && !taken.has(record.id))) {
		const own = lands.filter((land) => sameBranch(land.job, reviewer));
		const start = Date.parse(reviewer.startedAt ?? "");
		(own.find((land) => start <= Date.parse(land.landed.at)) ?? own.at(-1))?.jobs.push(reviewer);
	}
	return lands;
}
/** Whether two jobs work on the same branch of the same repository. */
function sameBranch(a: JobRecord, b: JobRecord): boolean {
	return a.branch !== null && a.branch === b.branch && a.repo === b.repo;
}

/**
 * The lead time of `land` and its parts (M-06); undefined for a land by `limen ticket done`, the record migrated or not,
 * whose `landed` time holds a day only (`isDayOnly`, defined where `limen ticket done` writes it, T-25 (2)): the ticket's
 * day at midnight UTC, where every other land holds the time of its merge or its closing commit (D-098 (5) (d)). A
 * closing commit made at exactly midnight UTC is then left out too: a number is missing and named on `Not read`, none
 * is guessed (D-057 (4)).
 */
export function leadTimeOf(land: Land): LeadTime | undefined {
	if (isDayOnly(land.landed.at)) {
		return undefined;
	}
	const starts = land.jobs.map(startOf);
	const start = starts.every((each) => each !== undefined) ? Math.min(...starts) : undefined;
	const reviewer = (record: JobRecord) => record.role === "reviewer";
	return {
		total: start === undefined ? undefined : elapsed(Date.parse(land.landed.at) - start),
		queue: sum(land.jobs.map(queueTime)),
		runs: sum(land.jobs.filter((record) => !reviewer(record)).map(runPart)),
		review: sum(land.jobs.filter(reviewer).map(runPart)),
	};
}
/**
 * A finished job's run part of a lead time: its run time less its own queue wait, which the part `queue` counts;
 * undefined when either is unknown, as for a migrated record, whose queue wait is.
 */
function runPart(record: JobRecord): number | undefined {
	const run = finishedRun(record);
	const queue = queueTime(record);
	return run === undefined || queue === undefined ? undefined : elapsed(run - queue);
}
/** Of the lead times `times`, by each part, the number whose part the records cannot give. */
function unknownPartsOf(times: readonly LeadTime[]): Record<keyof LeadTime, number> {
	const unknown = (part: keyof LeadTime) => times.filter((time) => time[part] === undefined).length;
	return { total: unknown("total"), queue: unknown("queue"), runs: unknown("runs"), review: unknown("review") };
}
/** The earliest of a job's start and its entry into the start queue; undefined when its record holds neither. */
function startOf(record: JobRecord): number | undefined {
	const times = [record.startedAt, waitOf(record)?.since].flatMap((time) => (time ? [Date.parse(time)] : []));
	return times.length ? Math.min(...times) : undefined;
}
/**
 * A job's wait in the start queue: 0 for a job that never queued, undefined while its wait has no end, and for a
 * migrated record, which holds no queue wait whether it waited or not (D-057 (4)).
 */
function queueTime(record: JobRecord): number | undefined {
	if (record.migrated !== undefined) {
		return undefined;
	}
	const wait = waitOf(record);
	if (wait === undefined) {
		return 0;
	}
	return wait.leftAt === null ? undefined : elapsed(Date.parse(wait.leftAt) - Date.parse(wait.since));
}
/** The sum of `parts`, undefined when one of them is. */
function sum(parts: readonly (number | undefined)[]): number | undefined {
	let total = 0;
	for (const part of parts) {
		if (part === undefined) {
			return undefined;
		}
		total += part;
	}
	return total;
}
/** `ms`, the time from one recorded time to a later one; undefined when the later one comes first, which gives none. */
function elapsed(ms: number): number | undefined {
	return ms >= 0 ? ms : undefined;
}
/**
 * The number of `lands` whose time lies within `span`; none without a span. A land by `limen ticket done` holds only
 * its day (`isDayOnly`), so it lies within when that day lies from the day of the span's first entry to the day of its
 * last, each taken as `ticket done` takes the ticket's day, the local one (src/project/lanes.ts). Any other land lies
 * within by its time.
 */
function landsWithin(lands: readonly Land[], span: Span | undefined): number {
	if (span === undefined) {
		return 0;
	}
	const first = localDay(new Date(span.first));
	const last = localDay(new Date(span.last));
	return lands.filter(({ landed }) => {
		if (isDayOnly(landed.at)) {
			const day = landed.at.slice(0, 10);
			return day >= first && day <= last;
		}
		const at = Date.parse(landed.at);
		return at >= span.first && at <= span.last;
	}).length;
}

/**
 * The coordinator's session files directly in the folder `dir` (D-098 (3)), each line through the one transcript
 * reader, every entry of a file counted, those of an abandoned branch of Pi's tree too, since their tokens were spent.
 * SESSIONS_NOT_FOUND when no folder is there.
 */
function readCoordinator(dir: string): Coordinator {
	const names = sessionFiles(dir);
	if (names === undefined) {
		throw usageError(
			"SESSIONS_NOT_FOUND",
			`no folder ${dir}; --sessions names the folder of the project's coordinator sessions, or a copy of it`,
			"limen stats --help",
		);
	}
	const entries: SessionEntry[] = [];
	const afterLands: number[] = [];
	let unread = 0;
	for (const name of names) {
		const file = readSessionFile(join(dir, name));
		unread += file.unread.length;
		for (const entry of file.entries) {
			entries.push(entry);
		}
		for (const write of turnsAfterLands(file.entries)) {
			afterLands.push(write);
		}
	}
	return { sessions: names.length, usage: usageOf(entries), span: spanOf(entries), afterLands, unread };
}
/** The first and the last time of the entries that carry a usage, the ones the count takes; undefined for none. */
function spanOf(entries: readonly SessionEntry[]): Span | undefined {
	let span: Span | undefined;
	for (const { at, usage } of entries) {
		if (usage !== undefined) {
			span = { first: Math.min(span?.first ?? at, at), last: Math.max(span?.last ?? at, at) };
		}
	}
	return span;
}
/**
 * The cache write of the turn after each land in one session's entries (M-04, A-037). A land is a bash call of an
 * assistant message that runs `limen land` or `limen ticket done`; its turn is the first assistant message after the
 * next message that starts a run, the owner's or Limen's, because the prefix the land changes is built once per run
 * (E-11). A land whose session holds no such turn gives none.
 */
function turnsAfterLands(entries: readonly SessionEntry[]): number[] {
	const writes: number[] = [];
	for (const [index, entry] of entries.entries()) {
		const lands = isTurn(entry) ? entry.commands.filter(runsLand).length : 0;
		const turn = lands ? turnAfterNextRun(entries.slice(index + 1)) : undefined;
		for (let land = 0; turn?.usage !== undefined && land < lands; land += 1) {
			writes.push(turn.usage.cacheWrite);
		}
	}
	return writes;
}
/** The first assistant message of `later` after its first message that starts a run. */
function turnAfterNextRun(later: readonly SessionEntry[]): SessionEntry | undefined {
	const run = later.findIndex(startsRun);
	return run === -1 ? undefined : later.slice(run + 1).find(isTurn);
}
/**
 * Whether the shell call `command` runs `limen land` or `limen ticket done` as one of its simple commands; one that
 * asks for the command's help lands nothing.
 */
function runsLand(command: string): boolean {
	return simpleCommands(command).some((words) => LAND_COMMAND.test(words) && !HELP.test(words));
}

/** The rows of the jobs, one per route and role, sorted by route, then role. */
function rowsOf(jobs: readonly Job[]): Row[] {
	const rows = new Map<string, Row>();
	for (const { record, usage } of jobs) {
		const route = routeText(record.route);
		const role = named(record.role);
		const key = `${route}\n${role}`;
		const row = rows.get(key) ?? emptyRow(route, role);
		rows.set(key, row);
		row.jobs += 1;
		row.done += record.state === "done" ? 1 : 0;
		row.failed += record.state === "failed" ? 1 : 0;
		row.runMs += isTerminal(record.state) ? (runTime(record) ?? 0) : 0;
		row.input += usage?.input ?? 0;
		row.cacheWrite += usage?.cacheWrite ?? 0;
		row.cacheRead += usage?.cacheRead ?? 0;
		row.output += usage?.output ?? 0;
	}
	return [...rows.values()].sort((a, b) => order(a.route, b.route) || order(a.role, b.role));
}
function emptyRow(route: string, role: string): Row {
	return { route, role, jobs: 0, done: 0, failed: 0, runMs: 0, input: 0, cacheWrite: 0, cacheRead: 0, output: 0 };
}
/** The order of two texts by their code units, the same in every locale. */
function order(a: string, b: string): number {
	return a < b ? -1 : Number(a > b);
}

/** The route as `<provider>/<model> <thinking>`, each part the record does not hold named. */
function routeText(route: Route): string {
	return `${named(route.provider)}/${named(route.model)} ${named(route.thinking)}`;
}
function named(part: string | null): string {
	return part?.trim() ? part : UNKNOWN;
}

/** `Jobs by route and role (<n> records, <first day> to <last day>)`, from the days the records started. */
function heading(records: readonly JobRecord[]): string {
	const days = records.flatMap((record) => (record.startedAt ? [record.startedAt.slice(0, 10)] : [])).sort();
	const [first] = days;
	const span = first === undefined ? "" : `, ${first} to ${days.at(-1)}`;
	return `Jobs by route and role (${counted(records.length, "record")}${span})`;
}

/** The table: a line of headers, then one line per row; nothing when there is no row. */
function table(rows: readonly Row[]): string[] {
	if (rows.length === 0) {
		return [];
	}
	const lines = [
		HEADERS,
		...rows.map((row) => [
			row.route,
			row.role,
			String(row.jobs),
			String(row.done),
			String(row.failed),
			runTimeText(row.runMs),
			tokenText(row.input),
			tokenText(row.cacheWrite),
			tokenText(row.cacheRead),
			tokenText(row.output),
		]),
	];
	const widths = HEADERS.map((_, column) => Math.max(...lines.map((line) => line[column]?.length ?? 0)));
	const cell = (text: string, column: number) =>
		column < TEXT_COLUMNS ? text.padEnd(widths[column] ?? 0) : text.padStart(widths[column] ?? 0);
	return lines.map((line) => `  ${line.map(cell).join("  ")}`);
}
/** Hours and minutes, as `29 h 40`. */
function runTimeText(ms: number): string {
	const minutes = Math.round(ms / 60_000);
	return `${Math.floor(minutes / 60)} h ${String(minutes % 60).padStart(2, "0")}`;
}
/**
 * A number of tokens as D-073's table writes it: as it is below 1,000, in thousands while it rounds to fewer than 100
 * of them and in millions above, with one decimal while the rounded number of the unit is below 10, as `950`, `7.0k`,
 * `44k`, `0.8M` and `201M`. The unit and the decimal follow the rounded value, so 9,950 is `10k`, not `10.0k`, and
 * 99,500 is `0.1M`, not `100k`.
 */
function tokenText(tokens: number): string {
	if (tokens < 1_000) {
		return String(tokens);
	}
	return Math.round(tokens / 1_000) < 100 ? unitText(tokens, 1_000, "k") : unitText(tokens, 1_000_000, "M");
}
/**
 * `tokens` in the unit of `size` tokens: rounded half up to tenths of it, as `9.9k`, while that is below 10, and to
 * whole units above. The tenths come from a division by a tenth of the unit, which keeps a half exact (9,950 / 100 is
 * 99.5), where `toFixed(1)` of 9.95, a number with no exact binary form, gives `9.9`.
 */
function unitText(tokens: number, size: number, unit: string): string {
	const tenths = Math.round(tokens / (size / 10));
	return tenths < 100 ? `${Math.floor(tenths / 10)}.${tenths % 10}${unit}` : `${Math.round(tokens / size)}${unit}`;
}

/**
 * The two lines of the lands (D-098 (4), variant A): their number and the days of the first and the last, then per
 * land, the total over the lands divided by their number, the jobs and the tokens by class of their jobs' own
 * transcripts (M-07), the coordinator's not added (D-098 (5) (e)); then the median of each lead time part over the
 * lands that have it (M-06). One line `Lands: none` when there is no land.
 */
function landLines(lands: readonly Land[], usages: ReadonlyMap<string, SessionUsage | undefined>): string[] {
	if (lands.length === 0) {
		return ["Lands: none"];
	}
	const days = lands.map((land) => land.landed.at.slice(0, 10)).sort();
	const jobs = lands.flatMap((land) => land.jobs);
	const total = { input: 0, cacheWrite: 0, cacheRead: 0, output: 0 };
	for (const job of jobs) {
		const usage = usages.get(job.id);
		total.input += usage?.input ?? 0;
		total.cacheWrite += usage?.cacheWrite ?? 0;
		total.cacheRead += usage?.cacheRead ?? 0;
		total.output += usage?.output ?? 0;
	}
	const per = (tokens: number) => tokenText(Math.round(tokens / lands.length));
	const times = lands.flatMap((land) => leadTimeOf(land) ?? []);
	const part = (pick: (time: LeadTime) => number | undefined) =>
		durationText(median(times.flatMap((time) => pick(time) ?? [])));
	return [
		`Lands (${lands.length}, ${days[0]} to ${days.at(-1)}), per land: jobs ${tenthsText(jobs.length, lands.length)}` +
			` · input ${per(total.input)} · cache write ${per(total.cacheWrite)} · cache read ${per(total.cacheRead)}` +
			` · output ${per(total.output)}`,
		`Lead time per land (median): ${part((time) => time.total)} · queue ${part((time) => time.queue)}` +
			` · job runs ${part((time) => time.runs)} · review ${part((time) => time.review)}`,
	];
}

/**
 * The two lines of the coordinator's sessions, only with `--sessions` (D-098 (3), (4)): their number, their turns and
 * the days of their span, with their tokens by class; then the cache read per turn, per land whose time lies within
 * the span (M-03, D-098 (2)), and the median and the largest cache write of the turn after a land (M-04).
 */
function coordinatorLines(coordinator: Coordinator | undefined, lands: readonly Land[]): string[] {
	if (coordinator === undefined) {
		return [];
	}
	const { sessions, usage, span, afterLands } = coordinator;
	const turns = usage?.turns ?? 0;
	const read = usage?.cacheRead ?? 0;
	const within = landsWithin(lands, span);
	const days = span === undefined ? "" : `, ${dayOf(span.first)} to ${dayOf(span.last)}`;
	const tokens =
		`input ${tokenText(usage?.input ?? 0)} · cache write ${tokenText(usage?.cacheWrite ?? 0)}` +
		` · cache read ${tokenText(read)} · output ${tokenText(usage?.output ?? 0)}`;
	const perTurn = turns ? tokenText(Math.round(read / turns)) : NONE;
	const perLand = within ? tokenText(Math.round(read / within)) : NONE;
	return [
		`Coordinator (${counted(sessions, "session")}, ${counted(turns, "turn")}${days}): ${tokens}`,
		`Coordinator cache read: ${perTurn} per turn · ${perLand} per land · first turn after a land: ${afterLandText(afterLands)}`,
	];
}
/** The cache write of the turns after the lands: `cache write <median> median, <largest> max (<n> lands)`. */
function afterLandText(writes: readonly number[]): string {
	const middle = median(writes);
	if (middle === undefined) {
		return "none found";
	}
	const largest = writes.reduce((most, write) => Math.max(most, write), 0);
	return `cache write ${tokenText(Math.round(middle))} median, ${tokenText(largest)} max (${counted(writes.length, "land")})`;
}
/** The middle of `values` in order, or the mean of the two middle ones for an even count; undefined for none. */
function median(values: readonly number[]): number | undefined {
	const sorted = [...values].sort((a, b) => a - b);
	const half = Math.floor(sorted.length / 2);
	const high = sorted[half];
	if (high === undefined) {
		return undefined;
	}
	return sorted.length % 2 ? high : ((sorted[half - 1] ?? high) + high) / 2;
}
/** A time as `runTimeText` writes it, or `—` when the records cannot give it. */
function durationText(ms: number | undefined): string {
	return ms === undefined ? NONE : runTimeText(ms);
}
/** `count` divided by `of`, rounded half up to tenths, as `2.7`. */
function tenthsText(count: number, of: number): string {
	const tenths = Math.round((count * 10) / of);
	return `${Math.floor(tenths / 10)}.${tenths % 10}`;
}
/** The UTC day of a time in milliseconds, as `2026-11-02`. */
function dayOf(ms: number): string {
	return new Date(ms).toISOString().slice(0, 10);
}

/**
 * `Failed by kind: <kind> <n> · …`, the most frequent first and, at an equal count, in the order of A-016's kinds, a
 * failure with no known kind last as `unknown`; `none` when no job failed.
 */
function failedLine(records: readonly JobRecord[]): string {
	const kinds = new Map<string, number>();
	for (const record of records.filter((each) => each.state === "failed")) {
		const kind = record.failure?.kind ?? UNKNOWN;
		kinds.set(kind, (kinds.get(kind) ?? 0) + 1);
	}
	const rank = (kind: string) => KIND_ORDER.get(kind) ?? FAILURE_KINDS.length;
	const items = [...kinds].sort(([a, m], [b, n]) => n - m || rank(a) - rank(b)).map(([kind, n]) => `${kind} ${n}`);
	return `Failed by kind: ${items.length ? items.join(" · ") : "none"}`;
}

/**
 * `Not read: …`, each thing the count left out with its number: the folders of `.limen/unmigrated/` with no pointer,
 * since a second `limen migrate` has nothing to do with them (D-073); a folder with no record and a record that does
 * not parse with `limen status --all`, which lists both; the lines of a job's transcripts that do not parse, with the
 * job; the run times its transitions do not give; the lead time of the lands by `limen ticket done`, then of the
 * other lands each part of the lead time whose median leaves them out; with `--sessions`, the lands outside the
 * coordinator sessions' span and the lines of those sessions that do not parse (D-098 (4)). No line when nothing was
 * left out.
 */
function notReadLine(skipped: Skipped): string[] {
	const { unmigrated, noRecord, damaged, transcripts, runTimes } = skipped;
	const { noLeadTime, unknownParts, outsideSessions, sessionLines } = skipped;
	const parts = [
		unmigrated ? `${counted(unmigrated, "folder")} in .limen/unmigrated/` : "",
		noRecord ? `${counted(noRecord, "folder")} with no record (limen status --all)` : "",
		damaged
			? `${damaged} ${damaged === 1 ? "record that does" : "records that do"} not parse (limen status --all)`
			: "",
		...[...transcripts].map(([id, lines]) => `${counted(lines, "transcript line")} of ${id}`),
		runTimes ? `the run time of ${counted(runTimes, "finished job")}` : "",
		noLeadTime ? `the lead time of ${counted(noLeadTime, "land")} by limen ticket done` : "",
		...LEAD_PARTS.map(([part, name]) =>
			unknownParts[part] ? `the ${name} of ${counted(unknownParts[part], "land")}` : "",
		),
		outsideSessions ? `${counted(outsideSessions, "land")} outside the coordinator sessions' span` : "",
		sessionLines ? `${counted(sessionLines, "line")} of the coordinator sessions` : "",
	].filter(Boolean);
	return parts.length ? [`Not read: ${parts.join(" · ")}`] : [];
}
/** `1 record`, `2 records`. */
function counted(count: number, noun: string): string {
	return `${count} ${noun}${count === 1 ? "" : "s"}`;
}
