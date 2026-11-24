// The resume after the subscription limit lives in code and in the minute run of `limen seat sweep`, because a prose
// rule and a seat extension in the coordinator's session left a job stopped until someone noticed (A-016, A-068), and
// a timer per reset would be one more timer that no one installs (T-42). A step needs no command of its own: a resume
// at once is `limen continue`, which this step calls through the same function, so one check under the jobs lock
// guards every path that continues a job (T-25). A resume that another path won is a line, since nothing is lost; any
// other failure is that job's, so it stops no other job, as in the sweep's other steps.
import { basename, join } from "node:path";
import { type ContinueRequest, startContinue } from "../job/continuation.ts";
import { jobFeatures } from "../job/job.ts";
import { owedWakeDue, QUOTA_RESUMES, type QuotaResume, quotaResume } from "../job/quota.ts";
import { type JobRecord, writeOwedWake } from "../job/record.ts";
import { type JobReader, newestOnWorktree } from "../job/unlanded.ts";
import { STATE_CHANGED } from "../operation.ts";
import { type CommandText, failureOf, LimenError, type Success } from "../outcome.ts";
import { eachRecord, type JobFailure } from "./reap.ts";

/** The command that checks a resume again, the `next` of its STATE_CHANGED. */
const AGAIN = "limen seat sweep";
/** The suffix of a resume's label, which the next resume replaces rather than adds to. */
const RESUME_LABEL = / · resume \d+$/;

/** The start of one resume: `startContinue` (src/job/continuation.ts); a test of this step gives its own. */
export type ResumeStart = (request: ContinueRequest, cwd: string, out: CommandText) => Promise<Success>;
const START: ResumeStart = (request, cwd, out) => startContinue(request, cwd, out, undefined, AGAIN);

/** A job of the project with its folder and its record. */
type Job = { readonly jobDir: string; readonly record: JobRecord };

/**
 * The step of the project at `root`: each due resume after the limit, in the order of the job ids, then the release of
 * each owed wake whose time came. A record that does not read is returned with its failure, as every failure of a job.
 */
export async function resumeAfterQuota(
	root: string,
	out: CommandText,
	start: ResumeStart = START,
): Promise<readonly JobFailure[]> {
	const failed: JobFailure[] = [];
	const jobs: Job[] = [];
	await eachRecord(join(root, ".limen", "jobs"), failed, async (_id, jobDir, record) => {
		if (record) {
			jobs.push({ jobDir, record });
		}
	});
	const due = await dueResumes(root, jobs);
	for (const { job, resume } of due) {
		await resumeJob(root, job, resume, out, start, failed);
	}
	for (const job of jobs) {
		await releaseOwedWake(job, out, failed);
	}
	return failed;
}

/**
 * The resumes due now (D-097 (5) (a), (c)): a job Limen resumes by its fields, with a known reset 5 minutes past, that
 * is the newest record on its worktree, read from the records the step read, so a record that does not read stops none.
 */
async function dueResumes(
	root: string,
	jobs: readonly Job[],
): Promise<readonly { readonly job: Job; readonly resume: QuotaResume }[]> {
	const byId = new Map(jobs.map((job) => [job.record.id, job.record]));
	const reader: JobReader = {
		jobs: async () => [...byId.keys()],
		record: async (jobDir) => byId.get(basename(jobDir)),
	};
	const holder = await newestOnWorktree(root, reader);
	return jobs.flatMap((job) => {
		const resume = quotaResume(job.record);
		const { worktree, id } = job.record;
		const ready = resume !== undefined && resume.at !== null && Date.now() >= Date.parse(resume.at);
		return resume && ready && worktree && holder(worktree) === id ? [{ job, resume }] : [];
	});
}

/** Resumes one due job, or names why not; a failure to start goes into `failed`. */
async function resumeJob(
	root: string,
	{ jobDir, record }: Job,
	resume: QuotaResume,
	out: CommandText,
	start: ResumeStart,
	failed: JobFailure[],
): Promise<void> {
	if (record.group !== null) {
		out.line(`not resumed ${record.id}: a member of group ${record.group}, which only its team continues`);
		return;
	}
	const said: CommandText = { line: (text) => out.line(`resume of ${record.id}: ${text}`), diagnostic: out.diagnostic };
	try {
		const started = await start(resumeRequest(record, resume), root, said);
		const id = started.ids?.job ?? "a new job";
		out.line(
			`resumed ${record.id} after the subscription limit as ${id}, resume ${resume.attempt} of ${QUOTA_RESUMES}`,
		);
	} catch (error) {
		if (!wonElsewhere(error)) {
			failed.push({ jobDir, error });
			return;
		}
		const failure = failureOf(error);
		out.line(`not resumed ${record.id}: ${failure.message} (${failure.code})`);
	}
}

/**
 * Whether a resume's refusal says that another continuation of the job won (R-034 Decision 4): one that has not
 * finished (LIVE_CONTINUATION), or one that another process published between the resume's checks and its write.
 */
function wonElsewhere(error: unknown): boolean {
	return error instanceof LimenError && (error.code === "LIVE_CONTINUATION" || error.code === STATE_CHANGED);
}

/**
 * The continuation of a resume (D-097 (5) (e)): the parent's recorded route (A-030), no timeout of its own, so the
 * default of 90 minutes, the parent's start-queue priority, the attempt's number, and the task of `resumeTask`.
 */
function resumeRequest(record: JobRecord, resume: QuotaResume): ContinueRequest {
	const { engine, provider, model, thinking } = record.route;
	return {
		query: record.id,
		instruction: [resumeTask(record, resume)],
		label: `${(record.label || record.id).replace(RESUME_LABEL, "")} · resume ${resume.attempt}`,
		engine: engine ?? undefined,
		provider: provider ?? undefined,
		model: model ?? undefined,
		thinking: thinking ?? undefined,
		quotaAttempt: resume.attempt,
		// The step chose the parent as the newest on its worktree before the jobs lock (D-097 (5) (d)).
		onlyNewest: true,
	};
}

/**
 * The task of a resume, built by code from the record's id, its reset time, the attempt and the tickets its label and
 * id name (D-097 (5) (f), T-07): plain English for the agent (T-13), with no word of the provider's text (A-068).
 */
function resumeTask(record: JobRecord, resume: QuotaResume): string {
	const tickets = [...jobFeatures(record.label ?? "", record.id, "", [])].sort();
	const named = tickets.length === 0 ? "" : ` (${tickets.length === 1 ? "ticket" : "tickets"} ${tickets.join(", ")})`;
	return [
		`Limen resumed job ${record.id} after the subscription limit stopped it: resume ${resume.attempt} of ${QUOTA_RESUMES}${named}.`,
		`The limit reset at ${record.failure?.resetAt ?? "an unknown time"}. This job continues in the same session and worktree.`,
		"Continue the task from the point where the last turn stopped; do not redo work that the worktree already holds.",
	].join("\n");
}

/**
 * Releases the owed wake of a job once it is due (D-097 (5) (h)), checked again under the job's lock, since the hook
 * may owe it anew; the coordinator's hook then delivers the wake as any other. A migrated record holds none.
 */
async function releaseOwedWake({ jobDir, record }: Job, out: CommandText, failed: JobFailure[]): Promise<void> {
	const { owedWake } = record;
	if (owedWake === undefined || record.migrated !== undefined || Date.now() < owedWakeDue(owedWake)) {
		return;
	}
	try {
		const after = await writeOwedWake(jobDir, (owed) =>
			owed !== undefined && Date.now() >= owedWakeDue(owed) ? undefined : owed,
		);
		if (after !== undefined && after.owedWake === undefined) {
			out.line(`released the owed wake of ${record.id}`);
		}
	} catch (error) {
		failed.push({ jobDir, error });
	}
}
