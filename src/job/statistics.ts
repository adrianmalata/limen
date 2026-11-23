// `limen stats` (D-072, D-073): every job record of this project, those of the job archive included (gate 2 §2, A-002),
// and each job's own transcripts, counted by route and role (jobs, done, failed, run time and the four token classes),
// then the failed jobs by kind, then what it did not read. It reads the records through src/job/record.ts and the
// transcripts through src/job/usage.ts, never the prose
// of `log` or `result` (T-37 (1)), and it writes nothing and waits for nothing (T-04). A part the record does not hold
// is named `unknown`, so a null role and a null failure kind get their own row and count, and each folder, record,
// transcript line and run time it could not read is counted on the last line (z. 10). A migrated record is history
// that it reads like any other (D-057 (4)), and so is the record of a scout that ran (T-33).
import { join } from "node:path";
import { LimenError } from "../outcome.ts";
import { limenRoot } from "../project/git.ts";
import { isTerminal } from "./job.ts";
import {
	archivedJobs,
	FAILURE_KINDS,
	type JobRecord,
	jobFolderNames,
	jobFolders,
	type Route,
	readRecord,
} from "./record.ts";
import { readSessionUsage, type SessionUsage } from "./usage.ts";

/** The name of a part the record does not hold (z. 10). */
const UNKNOWN = "unknown";
const HEADERS = ["route", "role", "jobs", "done", "failed", "run time", "input", "cache write", "cache read", "output"];
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
};

/**
 * The report of `limen stats` for the project at `cwd`, as text for people. NOT_MIGRATED, as every read of the jobs,
 * when a folder holds a record of an older Limen.
 */
export async function projectStatistics(cwd: string): Promise<string> {
	const root = limenRoot(cwd);
	const jobsRoot = join(root, ".limen", "jobs");
	const folders = [
		...(await jobFolders(jobsRoot)).map((id) => ({ id, jobDir: join(jobsRoot, id) })),
		...(await archivedJobs(root)),
	];
	const skipped: Skipped = {
		unmigrated: (await jobFolderNames(join(root, ".limen", "unmigrated"))).length,
		noRecord: 0,
		damaged: 0,
		transcripts: new Map(),
		runTimes: 0,
	};
	const jobs: Job[] = [];
	for (const { id, jobDir } of folders) {
		const job = await readJob(jobDir);
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
	const records = jobs.map((job) => job.record);
	skipped.runTimes = records.filter((record) => isTerminal(record.state) && runTime(record) === undefined).length;
	return [heading(records), ...table(rowsOf(jobs)), failedLine(records), ...notReadLine(skipped)].join("\n");
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
 * job; the run times its transitions do not give. No line when nothing was left out.
 */
function notReadLine(skipped: Skipped): string[] {
	const { unmigrated, noRecord, damaged, transcripts, runTimes } = skipped;
	const parts = [
		unmigrated ? `${counted(unmigrated, "folder")} in .limen/unmigrated/` : "",
		noRecord ? `${counted(noRecord, "folder")} with no record (limen status --all)` : "",
		damaged
			? `${damaged} ${damaged === 1 ? "record that does" : "records that do"} not parse (limen status --all)`
			: "",
		...[...transcripts].map(([id, lines]) => `${counted(lines, "transcript line")} of ${id}`),
		runTimes ? `the run time of ${counted(runTimes, "finished job")}` : "",
	].filter(Boolean);
	return parts.length ? [`Not read: ${parts.join(" · ")}`] : [];
}
/** `1 record`, `2 records`. */
function counted(count: number, noun: string): string {
	return `${count} ${noun}${count === 1 ? "" : "s"}`;
}
