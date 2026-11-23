// The land of a done job (T-26 (2)): the merge onto the checked-out branch after the ticket check and the test-line
// cap, the record's `landed` marker (A-002), the delete of the branch it merged, and the close of the job's active
// tickets; and the `landed` marker that `limen ticket done` writes on the finished jobs of the tickets it closed. Its
// text goes to `out`.
import { spawnSync } from "node:child_process";
import { readFile } from "node:fs/promises";
import { join } from "node:path";
import { createInterface } from "node:readline/promises";
import { transport } from "../config.ts";
import type { CommandText } from "../outcome.ts";
import {
	abortMerge,
	commitList,
	currentBranch,
	dirtyPaths,
	gitText,
	headCommit,
	limenRoot,
	mergeBranch,
	mergePaths,
	workspaceRepository,
} from "../project/git.ts";
import { closeTickets, landReason } from "../project/lanes.ts";
import { landTicketCheck } from "../project/ticket-check.ts";
import { deleteLandedBranches, keptLine } from "../runtime/pruning.ts";
import { isTerminal, jobFeatures } from "./job.ts";
import { type JobRecord, type Landed, readRecord, textFile, writeMarker } from "./record.ts";
import { type JobArgument, resolveJob } from "./reference.ts";
import { hasWork, type JobReader, jobStandings } from "./unlanded.ts";

/** What `limen land` was asked: the job, whether to skip the question in a terminal, the tickets kept open, the branch. */
export type LandRequest = {
	readonly query: JobArgument;
	readonly yes: boolean;
	readonly keepOpen: boolean;
	readonly onto: string | undefined;
};

/** Asks `question` and says whether the answer is yes. */
export type Ask = (question: string) => Promise<boolean>;

/**
 * Merges the done job `request.query` names onto the checked-out branch and closes its active tickets. In a terminal
 * (`ask`, unless `--yes`) it asks first, and the lines the owner reads to decide, the uncommitted files, the ticket
 * check's warnings and the test-line cap, come once, in the question; a refusal before the question prints them with
 * its message (AC-10, D-061 (3)).
 */
export async function landJob(
	request: LandRequest,
	cwd: string,
	out: CommandText,
	ask: Ask | undefined = process.stdin.isTTY === true ? confirm : undefined,
): Promise<void> {
	if (transport("LIMEN_GROUP_ID")) {
		throw new Error("group members cannot land; the owner-facing lead owns landing");
	}
	const job = await readDoneJob(cwd, request.query);
	const { id, jobDir, branch, base, repo, label } = job;
	const root = limenRoot(cwd);
	const repository = repo ? workspaceRepository(root, repo) : root;
	const target = landTarget(repository, request.onto, branch);
	const question = request.yes ? undefined : ask;
	const asked: string[] = [];
	const before: CommandText = question ? { line: (text) => asked.push(text), diagnostic: out.diagnostic } : out;
	let dirty: readonly string[];
	try {
		dirty = checkCheckoutBeside(repository, target, { id, branch, base }, before);
		await checkLandGates(repository, root, branch, id, before);
	} catch (error) {
		for (const line of asked) {
			out.line(line);
		}
		throw error;
	}
	if (question) {
		const answer: Promise<boolean> = question([...asked, `Land ${label || id} onto ${target}? [y/N] `].join("\n"));
		if (!(await answer)) {
			throw new Error("land cancelled");
		}
	}
	// The commits this land brings; a branch that merged main also holds main's own commits since its base.
	const subjects = (commitList(repository, "HEAD", branch) ?? "").split("\n").map((line) => line.replace(/^\S+ /, ""));
	let merged: string;
	try {
		merged = mergeBranch(repository, branch);
	} catch (error) {
		// A half-done merge beside another session's files would turn its next commit into this merge.
		if (dirty.length) {
			abortMerge(repository);
		}
		throw error;
	}
	if (merged) {
		out.line(merged);
	}
	// The marker comes as soon as the merge holds, before any step that could fail after it (R-031, Decision 4). A land
	// run again, as for a worktree that stayed, keeps the first land's marker, since the target may have moved since.
	if (job.landed === undefined) {
		await writeMarker(jobDir, { landed: { sha: headCommit(repository), at: new Date().toISOString() } });
	}
	out.line(`landed ${id} onto ${target}`);
	// The merge put every branch commit in the target, so the branch is landed.
	// A worktree that holds unlanded work stays with its branch, and says so in the one line of every kept worktree.
	for (const { branch: name, kept, worktree } of await deleteLandedBranches(root, [{ repository, branch }])) {
		out.line(worktree ? keptLine(worktree) : kept ? `kept branch ${name}: ${kept}` : `deleted branch ${name}`);
	}
	if (request.keepOpen) {
		return;
	}
	await closeLandedTickets(root, id, [...jobFeatures(label, id, job.task, subjects)], out);
}
/** The tickets the job works on leave active/ with the land; a ticket that cannot move says why and stays. */
async function closeLandedTickets(
	root: string,
	id: string,
	features: readonly string[],
	out: CommandText,
): Promise<void> {
	try {
		const closed = await closeTickets(root, features, landReason(id));
		for (const path of closed.moved) {
			out.line(`land: closed ${path}${closed.commit ? ` in ${closed.commit}` : ""}; NOW and PROVEN regenerated`);
		}
		if (closed.moved.length === 0) {
			out.line(`land: no active ticket for ${features.join(", ") || "this job"}; nothing closed`);
		}
	} catch (error) {
		out.line(`land: tickets stay active: ${error instanceof Error ? error.message : String(error)}`);
	}
}
/** A done job as land reads it: its folder, its recorded facts and task, and the `landed` marker of an earlier land. */
type DoneJob = {
	readonly id: string;
	readonly jobDir: string;
	readonly branch: string;
	readonly base: string;
	readonly repo: string;
	readonly label: string;
	readonly task: string;
	readonly landed: Landed | undefined;
};
/** The job's folder, its recorded facts and its task; only a done job with a branch and a base lands. */
async function readDoneJob(cwd: string, query: JobArgument): Promise<DoneJob> {
	const { id, jobDir } = await resolveJob(cwd, query, "control");
	const record = await readRecord(jobDir);
	const branch = record?.branch ?? "";
	const base = record?.base ?? "";
	const repo = record?.repo ?? "";
	const label = record?.label ?? "";
	const task = (await readFile(`${jobDir}/task.md`, "utf8").catch(() => "")).trim();
	if (record?.state !== "done") {
		throw new Error(`job ${id} is ${record?.state || "missing"}; land requires a done job`);
	}
	if (!branch || !base) {
		throw new Error(`job ${id} has no recorded ${branch ? "base" : "branch"}`);
	}
	return { id, jobDir, branch, base, repo, label, task, landed: record.landed };
}

/** A finished job of a ticket that `limen ticket done` closes, and whether it holds unlanded work of its own. */
export type TicketJob = { readonly id: string; readonly holdsWork: boolean };

/**
 * The jobs whose record `limen ticket done` marks `landed` (A-002; R-031, Decision 3): every finished job of the
 * project at `root` whose features, as land reads them (`jobFeatures`, its recorded commits as the subjects), name one
 * of the tickets `codes`; one that holds unlanded work of its own stays unmarked, so that a marker never hides work
 * (A-001). A job that holds a `landed` marker already keeps it; a review, a member of a group, a continued parent and a
 * job with no commit hold no work of their own on the target, so they get none. It reads through `reader`, the close's
 * validate, so a refusal of the read comes before the commit (R-031, review round 2, G4).
 */
export async function ticketDoneJobs(
	root: string,
	codes: readonly string[],
	reader: JobReader,
): Promise<readonly TicketJob[]> {
	const jobsRoot = join(root, ".limen", "jobs");
	const wanted = new Set(codes.map((code) => code.toUpperCase()));
	const named: string[] = [];
	for (const id of await reader.jobs(jobsRoot)) {
		const jobDir = join(jobsRoot, id);
		const record = await reader.record(jobDir);
		if (record && ownsLandedWork(record) && [...(await featuresOf(jobDir, record))].some((code) => wanted.has(code))) {
			named.push(id);
		}
	}
	if (named.length === 0) {
		return [];
	}
	const standings = await jobStandings(root, reader);
	return named.flatMap((id) => {
		const standing = standings.get(id);
		return standing?.kind === "finished" ? [{ id, holdsWork: hasWork(standing.work) }] : [];
	});
}

/**
 * The `landed` marker of `limen ticket done` on each of `jobs` that holds no unlanded work, with the closing commit
 * `sha` and the day `day` it closed their tickets; each job it marks, and each one it leaves for its work, gets a line
 * in `out`.
 */
export async function markTicketJobs(
	root: string,
	jobs: readonly TicketJob[],
	ticket: { readonly sha: string; readonly commit: string; readonly day: string },
	out: CommandText,
): Promise<void> {
	for (const { id, holdsWork } of jobs) {
		if (holdsWork) {
			out.line(`job ${id} stays without a landed marker: it holds unlanded work (limen status)`);
			continue;
		}
		const jobDir = join(root, ".limen", "jobs", id);
		await writeMarker(jobDir, { landed: { sha: ticket.sha, at: `${ticket.day}T00:00:00.000Z` } });
		out.line(`marked job ${id} landed in ${ticket.commit}`);
	}
}
/** Whether a record may hold work of its own that a ticket's close landed: a finished non-review job with commits. */
function ownsLandedWork(record: JobRecord): boolean {
	const own = record.role !== "reviewer" && record.group === null && record.landed === undefined;
	return own && isTerminal(record.state) && (record.commits?.length ?? 0) > 0;
}
/** The tickets a job works on, as land reads them: its label, id and task, else the subjects of its commits. */
async function featuresOf(jobDir: string, record: JobRecord): Promise<ReadonlySet<string>> {
	const subjects = (record.commits ?? []).map((line) => line.replace(/^\S+ /, ""));
	return jobFeatures(record.label ?? "", record.id, await textFile(join(jobDir, "task.md")), subjects);
}
/** Land merges onto the checked-out branch, never onto the job's own branch. */
function landTarget(repository: string, onto: string | undefined, branch: string): string {
	const current = currentBranch(repository);
	const target = onto ?? current;
	if (target !== current) {
		throw new Error(`land merges onto the current branch (${current}); checkout ${target} first`);
	}
	if (target === branch) {
		throw new Error(`already on job branch ${branch}`);
	}
	return target;
}
/**
 * Another session may be editing this checkout. Land merges beside its files and never touches them: no staged
 * change, no uncommitted file the merge would change. Returns the uncommitted paths.
 */
function checkCheckoutBeside(
	repository: string,
	target: string,
	job: { readonly id: string; readonly branch: string; readonly base: string },
	out: CommandText,
): readonly string[] {
	const dirty = dirtyPaths(repository);
	if (dirty.staged.length) {
		throw new Error(
			`target ${target} has staged changes, and a merge would refuse or sweep them in: ${dirty.staged.join(", ")}; commit or unstage them first`,
		);
	}
	const commits = commitList(repository, job.base, job.branch);
	if (!commits) {
		throw new Error(`job ${job.id} has no commits to land`);
	}
	const merged = dirty.paths.length ? mergePaths(repository, job.branch) : new Set<string>();
	const overlap = dirty.paths.filter((path) => merged.has(path));
	if (overlap.length) {
		throw new Error(
			`target ${target} has uncommitted changes in files this land would change: ${overlap.join(", ")}; commit or move them first`,
		);
	}
	if (dirty.paths.length) {
		out.line(
			`land: ${dirty.paths.length} uncommitted file${dirty.paths.length === 1 ? "" : "s"} in ${repository} stay untouched; none is in this merge`,
		);
	}
	return dirty.paths;
}
/** The strict ticket check and the test/ line cap; either one refuses the land. */
async function checkLandGates(
	repository: string,
	root: string,
	branch: string,
	id: string,
	out: CommandText,
): Promise<void> {
	const gate = await landTicketCheck(repository, root, branch, "HEAD", id);
	if (!gate.ok) {
		throw new Error(`land refused: ${branch} has tickets that fail the strict check\n${gate.lines.join("\n")}`);
	}
	for (const line of gate.lines) {
		out.line(line);
	}
	const cap = landTestCap(repository, branch);
	if (cap) {
		out.line(cap.line);
	}
	if (cap?.refuse) {
		throw new Error(`land refused: ${cap.refuse}`);
	}
}

/** The cap on `test/` lines that `spec/vision.md` names, or undefined when it names none. */
export function testLineCap(vision: string): number | undefined {
	const match = /`test\/` holds at most ([\d,]+) lines/.exec(vision);
	return match?.[1] ? Number(match[1].replaceAll(",", "")) : undefined;
}

// The cap is read from the target's vision, the owner's copy, so a branch cannot raise its own cap.
// Only a branch that adds test lines and leaves test/ over the cap is refused; deletions always land.
function landTestCap(
	repository: string,
	branch: string,
): { readonly line: string; readonly refuse?: string } | undefined {
	const vision = spawnSync("git", ["show", "HEAD:spec/vision.md"], { cwd: repository, encoding: "utf8" });
	const cap = vision.status === 0 ? testLineCap(vision.stdout) : undefined;
	if (cap === undefined) {
		return undefined;
	}
	let added = 0;
	let removed = 0;
	for (const row of gitText(repository, ["diff", "--numstat", `HEAD...${branch}`, "--", "test"]).split("\n")) {
		const [plus = "", minus = ""] = row.split("\t");
		added += Number(plus) || 0;
		removed += Number(minus) || 0;
	}
	const counts = spawnSync("git", ["grep", "-c", "", "HEAD", "--", "test"], {
		cwd: repository,
		encoding: "utf8",
		maxBuffer: 64 * 1024 * 1024,
	}).stdout;
	const lines =
		counts.split("\n").reduce((sum, row) => sum + (Number(row.slice(row.lastIndexOf(":") + 1)) || 0), 0) +
		added -
		removed;
	const line = `land: test/ holds ${lines} lines after this land (cap ${cap}, spec/vision.md); this branch +${added} -${removed}`;
	if (lines <= cap || added <= removed) {
		return { line };
	}
	return {
		line,
		refuse: `test/ would hold ${lines} lines; spec/vision.md caps it at ${cap}. Remove ${Math.min(lines - cap, added - removed)} test lines in this branch, or ask Adam to raise the cap.`,
	};
}

async function confirm(question: string): Promise<boolean> {
	const rl = createInterface({ input: process.stdin, output: process.stdout });
	try {
		return /^(y|yes)$/i.test((await rl.question(question)).trim());
	} finally {
		rl.close();
	}
}
