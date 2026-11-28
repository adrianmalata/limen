// The land of a done job (A-021, T-26 (2)): an operation of the runner (T-38) whose apply takes three steps, each
// recorded in the job's record once it holds (R-103): `merged`, the merge onto the checked-out branch after the ticket
// check, the test-line cap and the refusals of its ticket close, with the `landed` marker (A-002); `closed`, the close
// of the job's active tickets that `limen ticket done` makes, under the same lock (R-037); and `cleaned`, the delete of
// the branch it merged with its worktree, and the close of the job's Herdr tabs. A land run again goes on from the first
// step its record does not hold and never merges twice. The module also writes the `landed` marker that `limen ticket
// done` writes on the finished jobs of the tickets it closed. Its text goes to `out`.
import { spawnSync } from "node:child_process";
import { join } from "node:path";
import { createInterface } from "node:readline/promises";
import { transport } from "../config.ts";
import { closeJobTabs } from "../integrations/herdr.ts";
import { type Checked, type Operation, STATE_CHANGED, type StateView, validated } from "../operation.ts";
import { type CommandText, failureOf, isRefusal, LimenError, refused } from "../outcome.ts";
import {
	abortMerge,
	branchTip,
	changedPaths,
	commitList,
	currentBranch,
	dirtyPaths,
	firstParent,
	followCommit,
	gitText,
	headCommit,
	headHistory,
	isAncestor,
	isGitRepository,
	limenRoot,
	mergeBranch,
	mergePaths,
	shortCommit,
	stagedAgainst,
	unlandedBranches,
	workspaceRepository,
} from "../project/git.ts";
import {
	checkoutBehind,
	closeOperation,
	closingCodes,
	isClosingSubject,
	landClosingCommits,
	landReason,
	planTicketClose,
	stayedLine,
	type TicketClose,
	type TicketsClosed,
} from "../project/lanes.ts";
import { landTicketCheck } from "../project/ticket-check.ts";
import { deleteLandedBranches, keptLine } from "../runtime/pruning.ts";
import { isTerminal, jobFeatures, recordedBranch } from "./job.ts";
import { dayOnlyTime, type JobRecord, type LandClosed, type Landed, textFile, writeMarker } from "./record.ts";
import { type JobArgument, resolveJob } from "./reference.ts";
import { hasWork, type JobReader, jobStandings } from "./unlanded.ts";

/**
 * What `limen land` was asked: the job, whether to skip the question in a terminal, the tickets kept open, the branch,
 * and the call's own command line, the `next` of every refusal that a run again mends and of every failed step.
 */
export type LandRequest = {
	readonly query: JobArgument;
	readonly yes: boolean;
	readonly keepOpen: boolean;
	readonly onto: string | undefined;
	readonly again: string;
};

/** Asks `question` and says whether the answer is yes. */
export type Ask = (question: string) => Promise<boolean>;

/**
 * The steps of a land that a job's record holds (R-103): `merged` is the `landed` marker, and `older` says that the
 * record holds it with no `land`, as an older land, `limen ticket done` or the migration wrote it, whose later steps are
 * found from Git (D-096 (3) (g)); `closed` and `cleaned` are the fields of `land`.
 */
type Steps = {
	readonly merged: Landed | undefined;
	readonly older: boolean;
	readonly closed: LandClosed | undefined;
	readonly cleaned: boolean;
};

/** The steps the record `record` holds. */
function stepsOf(record: JobRecord | undefined): Steps {
	return {
		merged: record?.landed,
		older: record?.landed !== undefined && record.land === undefined,
		closed: record?.land?.closed,
		cleaned: record?.land?.cleaned !== undefined,
	};
}

/** What land's validate decided: the job, its repository, the branch it merges onto, and the steps left to take. */
type LandPlan = {
	readonly id: string;
	readonly jobDir: string;
	readonly label: string;
	readonly root: string;
	readonly repository: string;
	/** The job's branch, empty for a record with none, whose `cleaned` step has no branch to delete. */
	readonly branch: string;
	readonly target: string;
	readonly steps: Steps;
	/** The uncommitted paths of the checkout beside the merge, whose presence aborts a merge git stops. */
	readonly dirty: readonly string[];
	/** The features whose active tickets the `closed` step closes; undefined with `--keep-open`. */
	readonly features: readonly string[] | undefined;
};

/**
 * Lands the done job `request.query` names, or goes on with its land from the first step its record does not hold.
 * In a terminal (`ask`, unless `--yes`) a land that merges asks first, and the lines the owner reads to decide, the
 * uncommitted files, the ticket check's warnings and the test-line cap, come once, in the question; a refusal before
 * the question prints them with its message (AC-10, D-061 (3)). A land whose record holds every step changes nothing
 * and says so in one line. A step that fails keeps its class and code, and its `next` is the land's own command line,
 * which goes on from there (D-096 (3) (d)).
 */
export async function landJob(
	request: LandRequest,
	cwd: string,
	out: CommandText,
	ask: Ask | undefined = process.stdin.isTTY === true ? confirm : undefined,
): Promise<void> {
	const question = request.yes ? undefined : ask;
	const asked: string[] = [];
	const before: CommandText = question ? { line: (text) => asked.push(text), diagnostic: out.diagnostic } : out;
	let checked: Checked<LandPlan, void>;
	try {
		checked = await validated(landOperation(request, cwd, before, out));
	} catch (error) {
		for (const line of asked) {
			out.line(line);
		}
		throw error;
	}
	const { plan } = checked;
	const { steps } = plan;
	if (steps.merged !== undefined && steps.closed !== undefined && steps.cleaned) {
		out.line(stepsLine(plan.id, steps.merged, steps.closed));
		return;
	}
	if (question && steps.merged === undefined) {
		const answer: Promise<boolean> = question(
			[...asked, `Land ${plan.label || plan.id} onto ${plan.target}? [y/N] `].join("\n"),
		);
		if (!(await answer)) {
			throw refused("LAND_CANCELLED", `the land of job ${plan.id} is cancelled: the answer was not yes`);
		}
	}
	try {
		await checked.apply();
	} catch (error) {
		throw failedStep(error, request.again);
	}
}

/**
 * The operation of `limen land` (T-38): validate reads the record and the steps it holds, and makes the merge's checks
 * while `merged` is not recorded (D-096 (3) (c)); apply runs under the land lock of the job, `<jobDir>/.land`, which it
 * takes before every other lock it takes (R-103, Decision 2), after the runner read the steps again, so a land that
 * another one went on with meanwhile ends in STATE_CHANGED before its first write.
 */
function landOperation(
	request: LandRequest,
	cwd: string,
	before: CommandText,
	out: CommandText,
): Operation<LandPlan, void> {
	return {
		validate: async (view) => {
			if (transport("LIMEN_GROUP_ID")) {
				throw refused("LAND_IN_GROUP", "group members cannot land; the owner-facing lead owns landing");
			}
			const { id, jobDir } = await resolveJob(cwd, request.query, "control");
			const steps = await view.hold(`the recorded steps of the land of job ${id}`, async () =>
				stepsOf(await view.record(jobDir)),
			);
			const record = await view.record(jobDir);
			const root = limenRoot(cwd);
			const repository = record?.repo ? workspaceRepository(root, record.repo) : root;
			const job = { id, jobDir, label: record?.label ?? "", root, repository };
			if (steps.merged === undefined) {
				return { ...job, steps, ...(await mergeChecks(view, job, record, request, before)) };
			}
			const branch = record?.branch ?? "";
			const features = request.keepOpen ? undefined : [...(await featuresOf(jobDir, record))];
			return { ...job, branch, target: currentBranch(repository), steps, dirty: [], features };
		},
		lock: (plan) => ({ file: join(plan.jobDir, ".land") }),
		apply: async (plan) => {
			const merged = plan.steps.merged ?? (await mergeStep(plan, out));
			if (plan.steps.closed === undefined) {
				await closeStep(plan, merged, request.again, out);
			}
			if (!plan.steps.cleaned) {
				await cleanStep(plan, out);
			}
		},
		again: request.again,
	};
}

/** The job a land names: its id and folder, its label, the project's root and the job's repository. */
type LandingJob = Pick<LandPlan, "id" | "jobDir" | "label" | "root" | "repository">;

/**
 * The checks that guard the merge, while the record holds no `merged` step (D-096 (3) (c), T-38 (1)): a done job with
 * a branch and a base, the checked-out branch as the target, no staged change, commits to land, no uncommitted file the
 * merge changes, the strict ticket check, the test-line cap, and, unless `--keep-open`, the close's own refusals. A
 * refusal that a run again mends once the checkout is changed names the land's own call as `next`.
 */
async function mergeChecks(
	view: StateView,
	job: LandingJob,
	record: JobRecord | undefined,
	request: LandRequest,
	out: CommandText,
): Promise<Pick<LandPlan, "branch" | "target" | "dirty" | "features">> {
	const { id, root, repository } = job;
	if (record?.state !== "done") {
		throw refused("JOB_NOT_DONE", `job ${id} is ${record?.state || "missing"}; land requires a done job`);
	}
	const { branch, base } = recordedBranch(id, record);
	const target = landTarget(repository, request.onto, branch, request.again);
	await view.hold(`the staged files of ${repository} and the uncommitted files the merge changes`, () =>
		checkCheckoutBeside(repository, target, { id, branch, base }, request.again),
	);
	const dirty = dirtyPaths(repository).paths;
	if (dirty.length) {
		out.line(
			`land: ${dirty.length} uncommitted file${dirty.length === 1 ? "" : "s"} in ${repository} stay untouched; none is in this merge`,
		);
	}
	await checkLandGates(repository, root, branch, id, out, request.again);
	const features = request.keepOpen ? undefined : await closingTickets(root, repository, job, branch, request.again);
	return { branch, target, dirty, features };
}

/**
 * Step `merged`: the merge, then the `landed` marker with an empty `land` in one write, as soon as the merge holds
 * (R-031, Decision 4). A merge git stops is git's failure (MERGE_FAILED); one beside another session's files is
 * aborted, since its next commit would turn into this merge. Returns the marker.
 */
async function mergeStep(plan: LandPlan, out: CommandText): Promise<Landed> {
	const { repository, branch } = plan;
	let merged: string;
	try {
		merged = mergeBranch(repository, branch);
	} catch (error) {
		if (plan.dirty.length) {
			abortMerge(repository);
		}
		throw error;
	}
	if (merged) {
		out.line(merged);
	}
	const landed = { sha: headCommit(repository), at: new Date().toISOString() };
	await writeMarker(plan.jobDir, { merged: landed });
	out.line(`landed ${plan.id} onto ${plan.target}`);
	return landed;
}

/**
 * Step `closed`: the job's closing commit in the history of the project's HEAD after its merge (`landsOwnClose`, the
 * migration's rule, T-25) is recorded as it is, after the checkout is brought to it when a stop past the branch's move left it
 * behind (D-096 (3) (f)); a record an older close marked counts its own `landed` commit when that is a closing commit
 * (D-096 (3) (g)). Otherwise R-037's close of the job's active tickets runs, and its commit is recorded, or none when
 * nothing closed or `--keep-open` keeps them. A refusal of the close's own validate here is a state that changed since
 * the land's checks (STATE_CHANGED, exit 3); any other failure keeps its class, and says whether the closing commit is
 * on the branch, which a run again records (R-037, review round 1, note 6).
 */
async function closeStep(plan: LandPlan, merged: Landed, again: string, out: CommandText): Promise<void> {
	const { id, root, jobDir } = plan;
	const found = closingCommitOf(plan, merged);
	if (found !== undefined) {
		finishCheckout(plan, found, again);
		await writeMarker(jobDir, { closed: { sha: found.sha, at: new Date().toISOString() } });
		out.line(`land: recorded the closing commit ${shortCommit(root, found.sha)} of job ${id} on ${plan.target}`);
		return;
	}
	if (plan.features === undefined) {
		await writeMarker(jobDir, { closed: { sha: null, at: new Date().toISOString() } });
		return;
	}
	// Every command the close names is the land's own call, which goes on from here (R-103, review round 1, F1).
	const request = {
		root: () => root,
		codes: plan.features,
		reason: landReason(id),
		today: undefined,
		again,
		retry: again,
	};
	let checked: Checked<TicketClose & { readonly added: undefined }, TicketsClosed & { readonly added: undefined }>;
	try {
		checked = await validated(closeOperation(request));
	} catch (error) {
		throw closeFailure(plan, merged, error);
	}
	if (checked.plan.tickets.length === 0) {
		out.line(`land: no active ticket for ${plan.features.join(", ") || "this job"}; nothing closed`);
		await writeMarker(jobDir, { closed: { sha: null, at: new Date().toISOString() } });
		return;
	}
	let closed: TicketsClosed;
	try {
		closed = await checked.apply();
	} catch (error) {
		throw closeFailure(plan, merged, error);
	}
	for (const path of closed.moved) {
		out.line(`land: closed ${path}${closed.commit ? ` in ${closed.commit}` : ""}; NOW and PROVEN regenerated`);
	}
	for (const folder of closed.stayed) {
		out.line(`land: ${stayedLine(folder)}`);
	}
	await writeMarker(jobDir, { closed: { sha: closed.sha ?? null, at: new Date().toISOString() } });
}

/** A closing commit of the history of the project's HEAD, with its subject. */
type Closing = { readonly sha: string; readonly subject: string };

/**
 * The closing commit the land of the job made in the history of the project's HEAD, `Close <codes>: landed by <id>`:
 * one that is a strict descendant of the merged commit `merged`, since land commits its close after its merge, while
 * every commit of the job is the merged commit or one of its ancestors, so a job's own commit with that subject is no
 * close (z. 15, T-01; R-103, review round 2, G1). Undefined when there is none, also in a root that is no Git
 * repository.
 */
function landsOwnClose(plan: LandPlan, merged: Landed): string | undefined {
	if (!isGitRepository(plan.root)) {
		return undefined;
	}
	const after = (commit: { readonly sha: string }) =>
		commit.sha !== merged.sha && isAncestor(plan.root, merged.sha, commit.sha);
	return landClosingCommits(plan.root, after).get(plan.id)?.sha;
}

/**
 * The job's closing commit in the history of the project's HEAD: the one its land made (`landsOwnClose`); for a record
 * an older close marked, its own `landed` commit when that one's subject is a closing commit's, as
 * `limen ticket done` and the migration mark the closing commit (D-096 (3) (g)). Undefined in a root that is no Git
 * repository, where a close commits nothing.
 */
function closingCommitOf(plan: LandPlan, merged: Landed): Closing | undefined {
	if (!isGitRepository(plan.root)) {
		return undefined;
	}
	const history = headHistory(plan.root);
	const sha = landsOwnClose(plan, merged);
	const own = history.find((commit) => commit.sha === sha);
	if (own !== undefined) {
		return own;
	}
	const marked = plan.steps.older ? history.find((commit) => commit.sha === merged.sha) : undefined;
	return marked !== undefined && isClosingSubject(marked.subject) ? marked : undefined;
}

/**
 * Brings the checkout of the project to its closing commit `closing` when a close stopped after its branch moved and
 * before the checkout followed (R-037, Risk 3): the commit is HEAD, and the index holds a path the commit changed
 * otherwise than the commit has it. The two-way read-tree from the commit's parent then moves only what is still as the
 * parent had it; a file of the close that changed since then, in the index or the checkout, is another session's work,
 * which it refuses to overwrite (z. 29), so the checkout stays behind (CHECKOUT_BEHIND), whose message names what
 * finishes it and whose `next` is the land's own call (R-103, Decision 6; review round 1, F3).
 */
function finishCheckout(plan: LandPlan, closing: Closing, again: string): void {
	const { root } = plan;
	const parent = firstParent(root, closing.sha);
	if (parent === undefined || headCommit(root) !== closing.sha) {
		return;
	}
	const paths = changedPaths(root, parent, closing.sha);
	if (stagedAgainst(root, closing.sha, paths).length === 0) {
		return;
	}
	try {
		followCommit(root, parent, closing.sha);
	} catch (error) {
		const step = { head: parent, commit: closing.sha, short: shortCommit(root, closing.sha), paths };
		throw checkoutBehind(root, closingCodes(closing.subject), step, error, again);
	}
}

/**
 * The failure of a land's close after the merge (A-021): a refusal of the close's own validate is a state that changed
 * since the land's checks (STATE_CHANGED, exit 3), with the refusal's words; any other keeps its class and code. Its
 * message says whether the job's closing commit is on the branch, which a run again records, or the tickets stay
 * active, which a run again closes.
 */
function closeFailure(plan: LandPlan, merged: Landed, error: unknown): LimenError {
	const failure = failureOf(error);
	const done = `job ${plan.id} merged onto ${plan.target}`;
	const sha = landsOwnClose(plan, merged);
	const where =
		sha === undefined
			? `${done}, but its tickets stay active: ${failure.message}`
			: `${done}, and its closing commit ${shortCommit(plan.root, sha)} is on ${plan.target}, but the land stopped before it recorded the commit: ${failure.message}`;
	if (isRefusal(error)) {
		return new LimenError({ class: "transient", code: STATE_CHANGED, message: where, next: null, cause: error });
	}
	return new LimenError({ class: failure.class, code: failure.code, message: where, next: null, cause: error });
}

/**
 * Step `cleaned`: the branch, deleted with the finished worktree that holds it as prune deletes one, unless it holds
 * commits outside the target (`unlandedBranches`, retire's rule, T-25), which keep it (z. 29, D-097 (4) (d)); then the
 * job's recorded Herdr tabs (`closeJobTabs`). A kept branch or worktree and a tab that does not close are each a line,
 * and the step is recorded, since the seat sweep's daily steps take what is left (T-01, R-101).
 */
async function cleanStep(plan: LandPlan, out: CommandText): Promise<void> {
	const { root, repository, branch } = plan;
	if (branch && branchTip(repository, branch) !== undefined) {
		if (unlandedBranches(repository, [branch]).has(branch)) {
			out.line(`kept branch ${branch}: it holds commits that ${plan.target} does not`);
		} else {
			for (const { branch: name, kept, worktree } of await deleteLandedBranches(root, [{ repository, branch }])) {
				out.line(worktree ? keptLine(worktree) : kept ? `kept branch ${name}: ${kept}` : `deleted branch ${name}`);
			}
		}
	}
	for (const line of await closeJobTabs(plan.jobDir)) {
		out.line(line);
	}
	await writeMarker(plan.jobDir, { cleaned: { at: new Date().toISOString() } });
}

/**
 * A step's failure with the land's own call as `next`, which goes on from that step; its class, code and message stay
 * (D-096 (3) (d), R-103, Decision 4).
 */
function failedStep(error: unknown, again: string): LimenError {
	const failure = failureOf(error);
	return new LimenError({
		class: failure.class,
		code: failure.code,
		message: failure.message,
		next: again,
		cause: error,
	});
}

/**
 * The line of a land whose record holds every step, in the form of abandon's line for a job it marked: the merge's
 * commit, the closing commit or that the land made none, and that it cleaned up.
 */
function stepsLine(id: string, merged: Landed, closed: LandClosed): string {
	const close = closed.sha === null ? "with no closing commit" : `closed in ${closed.sha}`;
	return `job ${id} is landed: merged in ${merged.sha}, ${close}, cleaned`;
}

/**
 * The tickets the job `job` works on, which its land closes after the merge: its label, id or task pointers, else the
 * features of the commits it brings (a branch that merged main also holds main's own commits since its base). Their
 * close refuses here, before the merge, when the board or a ticket folder has uncommitted changes or a file is where a
 * ticket moves, as it would after the merge (T-38 (1)); the refusal names `again`, the land's own call, since nothing
 * has merged and `limen ticket done` would close the tickets with the job's work left out (R-037, review round 1,
 * F1).
 */
async function closingTickets(
	root: string,
	repository: string,
	job: LandingJob,
	branch: string,
	again: string,
): Promise<readonly string[]> {
	const subjects = (commitList(repository, "HEAD", branch) ?? "").split("\n").map((line) => line.replace(/^\S+ /, ""));
	const features = [...jobFeatures(job.label, job.id, await textFile(join(job.jobDir, "task.md")), subjects)];
	await planTicketClose(root, features, landReason(job.id), undefined, again);
	return features;
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
		await writeMarker(jobDir, { landed: { sha: ticket.sha, at: dayOnlyTime(ticket.day) } });
		out.line(`marked job ${id} landed in ${ticket.commit}`);
	}
}
/** Whether a record may hold work of its own that a ticket's close landed: a finished non-review job with commits. */
function ownsLandedWork(record: JobRecord): boolean {
	const own = record.role !== "reviewer" && record.group === null && record.landed === undefined;
	return own && isTerminal(record.state) && (record.commits?.length ?? 0) > 0;
}
/**
 * The tickets a job works on, as land reads them: its label, id and task, else the subjects of its recorded commits,
 * which a land run again after its merge reads too, as the branch's commits are then on the target.
 */
async function featuresOf(jobDir: string, record: JobRecord | undefined): Promise<ReadonlySet<string>> {
	const subjects = (record?.commits ?? []).map((line) => line.replace(/^\S+ /, ""));
	return jobFeatures(record?.label ?? "", record?.id ?? "", await textFile(join(jobDir, "task.md")), subjects);
}
/**
 * Land merges onto the checked-out branch, never onto the job's own branch; either refusal names `again`, the land's
 * own call, to run once the target is checked out.
 */
function landTarget(repository: string, onto: string | undefined, branch: string, again: string): string {
	const current = currentBranch(repository);
	const target = onto ?? current;
	if (target !== current) {
		throw refused(
			"TARGET_NOT_CHECKED_OUT",
			`land merges onto the current branch (${current}); checkout ${target} first`,
			again,
		);
	}
	if (target === branch) {
		throw refused("ON_JOB_BRANCH", `already on job branch ${branch}; checkout the branch to land onto first`, again);
	}
	return target;
}
/**
 * Another session may be editing this checkout. Land merges beside its files and never touches them: no staged change,
 * no uncommitted file the merge would change; and the job brings commits to land. Validate holds this read, so a file
 * staged or changed there before the merge ends the land in STATE_CHANGED.
 */
function checkCheckoutBeside(
	repository: string,
	target: string,
	job: { readonly id: string; readonly branch: string; readonly base: string },
	again: string,
): undefined {
	const dirty = dirtyPaths(repository);
	if (dirty.staged.length) {
		throw refused(
			"TARGET_STAGED",
			`target ${target} has staged changes, and a merge would refuse or sweep them in: ${dirty.staged.join(", ")}; commit or unstage them first`,
			again,
		);
	}
	if (!commitList(repository, job.base, job.branch)) {
		throw refused("NOTHING_TO_LAND", `job ${job.id} has no commits to land`);
	}
	const merged = dirty.paths.length ? mergePaths(repository, job.branch) : new Set<string>();
	const overlap = dirty.paths.filter((path) => merged.has(path));
	if (overlap.length) {
		throw refused(
			"UNCOMMITTED_OVERLAP",
			`target ${target} has uncommitted changes in files this land would change: ${overlap.join(", ")}; commit or move them first`,
			again,
		);
	}
	return undefined;
}
/** The strict ticket check and the test/ line cap; either one refuses the land, with its own call as `next`. */
async function checkLandGates(
	repository: string,
	root: string,
	branch: string,
	id: string,
	out: CommandText,
	again: string,
): Promise<void> {
	const gate = await landTicketCheck(repository, root, branch, "HEAD", id);
	if (!gate.ok) {
		throw refused(
			"TICKET_CHECK_FAILED",
			`land refused: ${branch} has tickets that fail the strict check\n${gate.lines.join("\n")}`,
			again,
		);
	}
	for (const line of gate.lines) {
		out.line(line);
	}
	const cap = landTestCap(repository, branch);
	if (cap) {
		out.line(cap.line);
	}
	if (cap?.refuse) {
		throw refused("TEST_LINE_CAP", `land refused: ${cap.refuse}`, again);
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
