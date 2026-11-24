// One module holds the times and the cap of the resume after the subscription limit (T-25 (1)), because the sweep's
// step, the end of a job, its wake and the alerts each act on them, and a copy in any of them would drift from the
// others; the step itself imports the continuation, which the wake's text must not (it would close an import cycle).
// The alerts (seat/alerts.ts) read when a resume is overdue from here as well (D-100).
import type { FailureKind, JobRecord, OwedWake } from "./record.ts";

/** The most resumes Limen makes of one job after the limit (A-016 (5)); the record's `quotaAttempt` counts them. */
export const QUOTA_RESUMES = 3;
/** How long after the limit's reset a resume and an owed wake are due, so that the reset surely passed (A-016 (3)). */
const AFTER_RESET_MS = 5 * 60_000;
/** How long an owed wake whose reset no text named waits before the sweep releases it (A-016 (4)). */
const NO_RESET_MS = 60 * 60_000;
/** How long past its due time a resume may wait before the alerts ring for its job (D-100), A-033's grace. */
const OVERDUE_MS = 15 * 60_000;

/** A resume Limen makes of a job: the ISO time it is due, null while the reset time is unknown, and its number. */
export type QuotaResume = { readonly at: string | null; readonly attempt: number };

/**
 * The resume Limen makes of the job of `record` by the record's fields alone (D-097 (5) (c)): a `failed` job of kind
 * `quota` that the migration did not write (D-057 (4)), with no `landed` or `abandoned` marker, below the cap of
 * resumes; undefined for any other. A group member gets one too, which the sweep skips with a line of its own, since
 * `continue` refuses it outside its team; whether a newer record holds the job's worktree is the sweep's to read.
 */
export function quotaResume(record: JobRecord): QuotaResume | undefined {
	const { failure } = record;
	const attempt = (record.quotaAttempt ?? 0) + 1;
	const marked = record.migrated !== undefined || record.landed !== undefined || record.abandoned !== undefined;
	if (record.state !== "failed" || failure?.kind !== "quota" || marked || attempt > QUOTA_RESUMES) {
		return undefined;
	}
	const at = failure.resetAt === null ? null : new Date(Date.parse(failure.resetAt) + AFTER_RESET_MS).toISOString();
	return { at, attempt };
}

/**
 * The kind a job's end records for the failure kind `kind` its detector passed, on the job's `quotaAttempt`: an end on
 * the limit of the last resume is `quota-exhausted` (D-097 (5) (g)), so no candidate is left for a fourth one, and the
 * alerts send it; any other kind stays.
 */
export function limitKind(kind: FailureKind, quotaAttempt: number | undefined): FailureKind {
	return kind === "quota" && (quotaAttempt ?? 0) >= QUOTA_RESUMES ? "quota-exhausted" : kind;
}

/**
 * Whether the alerts ring `failed:quota` for the `quota` failure of `record` (D-097 (5) (b), D-100): at once when no
 * reset time was read; with a known one only once its resume is overdue by `OVERDUE_MS` while nothing continued the
 * job, so that `newest`, the newest record on its worktree, is the job itself and no `landed` or `abandoned` marker
 * closed it. A group member, which the sweep never resumes, and a resume refused at every run ring so, with no counter;
 * a resume that started rings nothing.
 */
export function quotaRings(record: JobRecord, newest: string | undefined, now = Date.now()): boolean {
	const resetAt = record.failure?.resetAt ?? null;
	if (resetAt === null) {
		return true;
	}
	const continued = newest !== undefined && newest !== record.id;
	const closed = record.landed !== undefined || record.abandoned !== undefined;
	return !(continued || closed) && now >= Date.parse(resetAt) + AFTER_RESET_MS + OVERDUE_MS;
}

/**
 * The epoch time from which the sweep releases the owed wake `owed` (D-097 (5) (h)): 5 minutes after the reset its
 * turn's text named, or one hour after it was owed when the text named none (A-016 (4)).
 */
export function owedWakeDue(owed: OwedWake): number {
	return owed.resetAt === null ? Date.parse(owed.since) + NO_RESET_MS : Date.parse(owed.resetAt) + AFTER_RESET_MS;
}
