import { readdirSync } from "node:fs";
import { join } from "node:path";
import { TEMPORARY_NAME } from "../atomic-write.ts";
import { readOptional } from "../project/inherit.ts";
import { ticketPointers } from "../project/planning.ts";
import { producedNothing } from "./job.ts";
import { QUOTA_RESUMES, quotaResume } from "./quota.ts";
import { type JobRecord, type Progress, readProgressSync, readRecordSync } from "./record.ts";
import { claimSlots, deliveryExists } from "./wake-delivery.ts";

/** A content file of the job (`task.md`, `result`, `start-notice`), trimmed; "" when it is missing. */
function text(path: string): string {
	return readOptional(path)?.trim() ?? "";
}
/**
 * How the job ended: stop reason, bounded commits, the whole final message, and undelivered steers. The coordinator
 * decides the next step from this, so the final message is never cut. A part the record or the folder does not hold
 * is omitted; that absence is information. An end on the subscription limit is said from the record's fields
 * (`limitStop`), never with the provider's text (A-068).
 */
export function jobEnding(job: string, record = readRecordSync(job)): string {
	const sections: string[] = [];
	const stop = record && limitStop(record);
	if (stop) {
		sections.push(stop);
	} else if (record?.stopReason) {
		sections.push(`Stop reason: ${record.stopReason}`);
	}
	const commits = record?.commits;
	if (commits) {
		const lines = commits.filter(Boolean);
		sections.push(
			lines.length
				? `Commits:\n${lines.slice(0, 10).join("\n")}${lines.length > 10 ? `\n… ${lines.length - 10} more` : ""}`
				: "Commits: none",
		);
	}
	const result = text(join(job, "result"));
	if (result) {
		sections.push(`Final message:\n${result}`);
	}
	try {
		const unseen = readdirSync(join(job, "steer", "inbox")).filter((name) => !TEMPORARY_NAME.test(name)).length;
		if (unseen) {
			sections.push(`${unseen} steer(s) never delivered`);
		}
	} catch {
		// Inbox may be absent; that is not an undelivered steer.
	}
	return sections.join("\n\n");
}
/**
 * How a completion wake travels. `fallback`: a busy coordinator's wake reaches another session. `instruction`: a route's
 * own landing words (the Herdr prompt to a coordinator without a Pi session). `session`: the Pi session that receives
 * the wake.
 */
type CompletionRoute = { readonly fallback?: boolean; readonly instruction?: string; readonly session?: string };
/** A read of the job folder's progress; the hook passes its damage guard, so a damaged file reads as none there. */
type ProgressRead = (job: string) => Progress | undefined;
export function completionWake(
	job: string,
	label: string,
	state: string,
	id: string,
	branch: string,
	repo: string,
	route: CompletionRoute = {},
	progressOf: ProgressRead = readProgressSync,
): string {
	const { fallback = false, instruction: routeInstruction } = route;
	const record = readRecordSync(job);
	const location = repo ? ` in repository ${repo}` : "";
	const task = firstSentence(text(join(job, "task.md")));
	const said = task
		? `Limen job ${JSON.stringify(label)}: ${task}\nis ${state} (${id}) on branch ${branch}${location}.`
		: `Limen job ${JSON.stringify(label)} is ${state} (${id}) on branch ${branch}${location}.`;
	const waited = missedStartNotice(job, route.session);
	// A start notice the session never got is its own paragraph after the lead, word for word.
	const lead = [said, waited].filter(Boolean).join("\n\n");
	const empty = jobProducedNothing(record, progressOf(job));
	const facts = empty ? "It produced nothing (0 tool calls, no commits)." : "";
	let handoff = "The job failed or stopped; inspect the failure before deciding whether to resume work.";
	if (state === "done") {
		handoff =
			"Job done. Next step: land it, or name the check that still blocks landing. Done does not mean that review passed.";
	}
	let instruction =
		"Inspect the job record, failure and log/session. A repair handoff states the observed failure with its evidence and names a cause only when you verified it. Resume focused fixes and re-review if appropriate; do not treat this failure as a new-spawn or release signal. Keep the user informed; ask only when genuine product ambiguity, a scope or risk tradeoff, or an irreversible action needs a human decision.";
	if (state === "done") {
		// A route's own wording (the Herdr prompt to a coordinator without a Pi session) replaces only the landing
		// instruction.
		instruction =
			routeInstruction ??
			`Inspect the job record, branch diff and commits, log/session, and relevant checks. Then land the work at the verified commit. If a check blocks landing, name that check and resume a focused fix. ${keeperHint(job, id, record)} After it lands, continue with the next item on the board. Keep the user informed; ask only when genuine product ambiguity, a scope or risk tradeoff, or an irreversible action needs a human decision.`;
	}
	if (empty) {
		instruction =
			"Inspect the job record and log/session to understand why, then resume focused work if the ticket remains open. Keep the user informed; ask only when genuine product ambiguity, a scope or risk tradeoff, or an irreversible action needs a human decision.";
	}
	// D-097 (5) (i): Limen resumes the job after the limit itself, so the coordinator leaves it alone.
	if (state === "failed" && record && limenResumes(record)) {
		handoff = "Limen resumes this job by itself; it needs nothing from you now.";
		instruction = `Go on with other work, and do not continue this job yourself: Limen resumes it. Only when the owner asks to resume it at once, run limen continue ${id} "<instruction>"; Limen then leaves it to that continuation.`;
	}
	if (fallback) {
		instruction =
			"The subscribed coordinator is busy. Do not spawn, stop, steer, or land on behalf of another coordinator unless the human asks.";
	}
	return joinWake(lead, jobEnding(job, record), [facts, handoff].filter(Boolean).join("\n\n"), instruction);
}
/**
 * Whether Limen resumes the job of `record` after the subscription limit; never a group member's, which `continue`
 * refuses outside its team.
 */
function limenResumes(record: JobRecord): boolean {
	return record.group === null && quotaResume(record) !== undefined;
}
/**
 * How a job that the subscription limit stopped ended, from its record's fields alone (D-097 (5) (i), A-068): when
 * Limen resumes it and which resume of the cap that is, or that the cap was reached; undefined for any other end. The
 * provider's text stays in the record, which `limen show` prints.
 */
function limitStop(record: JobRecord): string | undefined {
	const kind = record.state === "failed" ? record.failure?.kind : undefined;
	if (kind === "quota-exhausted") {
		return `Stop: the subscription limit, after ${QUOTA_RESUMES} resumes, the most Limen makes. Limen does not resume it again.`;
	}
	if (kind !== "quota") {
		return undefined;
	}
	const resetAt = record.failure?.resetAt ?? null;
	const limit = `Stop: the subscription limit, ${resetAt === null ? "with no reset time read" : `which resets at ${resetAt}`}.`;
	const resume = quotaResume(record);
	if (record.group !== null) {
		return `${limit} Limen does not resume a member of a group; its team continues it.`;
	}
	if (resume === undefined) {
		return limit;
	}
	const when = resume.at === null ? "once the reset time is known" : `at ${resume.at}`;
	return `${limit} Limen resumes the job ${when}, resume ${resume.attempt} of ${QUOTA_RESUMES}.`;
}
/**
 * The first line of the job's start notice, when the job waited in the start queue and `session` never got that
 * notice: the job ended before the Pi hook delivered it. A start notice is news only while the job runs, so the
 * completion wake carries this line instead. A notice in flight (claimed) may have reached the session; it counts.
 */
function missedStartNotice(job: string, session: string | undefined): string {
	const slot = `_start.${session}`;
	if (!session || deliveryExists(job, slot) || claimSlots(job).includes(slot)) {
		return "";
	}
	return text(join(job, "start-notice")).split("\n", 1)[0] ?? "";
}
/** The done-wake sentence that sends spec work to the keeper; the ticket comes from the job task's first `Ticket:` pointer (keeper follows a moved one). */
export function keeperHint(job: string, id: string, record = readRecordSync(job)): string {
	// A keeper always changes a ticket; sending it to another keeper would loop.
	if (record?.role === "keeper") {
		return "This is the spec keeper: land it, since it carries the work and the spec fixes. If it made no commit, land the original job.";
	}
	const ticket = ticketPointers(text(join(job, "task.md")))[0]?.path ?? "<ticket>";
	return `If it added, moved or changed a ticket, start limen keeper ${ticket} --job ${id} --engine <engine> --provider <provider> --model <model> --thinking <level> and land the keeper job instead.`;
}
/**
 * The wake of a running job's advisory. Its ending comes from `record`, the record the caller read, so the wake reads
 * no record of its own: the hook reads records through its damage guard (T-01).
 */
export function advisoryWake(
	job: string,
	label: string,
	id: string,
	branch: string,
	repo: string,
	advisory: string,
	fallback: boolean,
	record: JobRecord,
): string {
	const location = repo ? ` in repository ${repo}` : "";
	const task = firstSentence(text(join(job, "task.md")));
	const lead = task
		? `Limen job ${JSON.stringify(label)}: ${task}\nis still running (${id}) on branch ${branch}${location}: ${advisory}.`
		: `Limen job ${JSON.stringify(label)} is still running (${id}) on branch ${branch}${location}: ${advisory}.`;
	const instruction = fallback
		? "The subscribed coordinator is busy. Do not spawn, stop, or steer on this wake unless the human asks."
		: "Inspect the job record and continue the loop; steer; or open the tab and exit if you mean the session to end.";
	return joinWake(lead, jobEnding(job, record), "", instruction);
}
function joinWake(lead: string, ending: string, facts: string, instruction: string): string {
	const parts = [lead];
	if (ending) {
		parts.push(ending);
	}
	if (facts) {
		parts.push(facts);
	}
	parts.push(instruction);
	return parts.join("\n\n");
}
function firstSentence(body: string): string {
	const paragraph = body.trim().split(/\n\n/, 1)[0]?.replaceAll("\n", " ").trim() ?? "";
	if (!paragraph) {
		return "";
	}
	const cut = paragraph.search(/[.!?](?:\s|$)/);
	const sentence = (cut === -1 ? paragraph : paragraph.slice(0, cut + 1)).trim();
	return sentence.length > 240 ? `${sentence.slice(0, 239)}…` : sentence;
}
function jobProducedNothing(record: JobRecord | undefined, progress: Progress | undefined): boolean {
	const commits = record?.commits ? record.commits.join("\n") : undefined;
	return producedNothing(progress?.toolCalls ?? undefined, commits);
}
