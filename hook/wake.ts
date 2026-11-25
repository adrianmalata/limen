import { execFile, spawnSync } from "node:child_process";
import { appendFileSync, existsSync, type FSWatcher, mkdirSync, readdirSync, readFileSync, watch } from "node:fs";
import { basename, dirname, join } from "node:path";
import { atomicWriteSync, TEMPORARY_NAME } from "../src/atomic-write.ts";
import { transport } from "../src/config.ts";
import { coordinatorProject } from "../src/integrations/coordinator-refusals.ts";
import { herdrBinary } from "../src/integrations/herdr.ts";
import { closedFeatures, closedJobFeatures, derivePulse, isTerminal, type Pulse, SESSION_ID } from "../src/job/job.ts";
import {
	advisorySource,
	isLimitEnd,
	isProgressName,
	type JobRecord,
	jobFoldersSync,
	limitReset,
	type Progress,
	readProgressSync,
	readRecordSync,
	writeOwedWake,
} from "../src/job/record.ts";
import { openChecks } from "../src/job/task-note.ts";
import {
	advisoryFamily,
	advisorySlot,
	CLAIM_STALE_MS,
	claimDelivery,
	claimedJob,
	claimMarker,
	claimSlots,
	completionSlots,
	completionStopped,
	confirmClaim,
	type DeliveryCallbacks,
	deliveredSlots,
	deliveryExists,
	deliveryLeft,
	enrollLegacyRunning,
	fallbackDueAt,
	oldEnoughForFallback,
	receiptFamily,
	recordUnconfirmed,
	recoverClaims,
	refreshClaim,
	releaseOwedClaim,
	routable,
	sessionOwnsJobs,
	subscribed,
	subscribeSession,
} from "../src/job/wake-delivery.ts";
import { advisoryWake, completionWake } from "../src/job/wake-text.ts";
import { removedCommand } from "../src/old-names.ts";
import { LimenError } from "../src/outcome.ts";
import { unlandedBranches } from "../src/project/git.ts";
import { registerProject } from "../src/project/seat.ts";
import {
	type PiApi,
	type PiContext,
	type PiMessageEvent,
	piCommandArgs,
	piContext,
	piEvent,
	recorded,
} from "../src/runtime/pi-api.ts";
import { ownerState } from "../src/runtime/reap.ts";

const CACHE_REFRESH_MS = 30_000;
const SWEEP_MS = 500;
// A busy job writes many files a second; their watch events start at most one sweep a second, the first at once.
const EVENT_SWEEP_MS = 1_000;
// Each timer tick re-checks this share of settled records, so one refresh cycle takes CACHE_REFRESH_MS without a pause.
const REFRESH_TICKS = CACHE_REFRESH_MS / SWEEP_MS;
// Herdr drops pane metadata after its TTL; an unchanged label is re-sent well before then.
const METADATA_TTL_MS = 180_000;
const METADATA_REFRESH_MS = 60_000;
// The tail Limen keeps on the coordinator tab. The optional `◆` is the mark Limen put in front of the counts before
// R-006; a tab labelled then may still be open, and its old tail must still be read as one.
const TAB_TAIL = /(?:\s*·\s*(?:◆\s+)?\d+\s+(?:running|finished))+$/;
type FinishedJob = { readonly id: string; readonly label: string; readonly state: string; readonly finishedAt: number };
/** A coordinator's turn that ended on the subscription limit (D-097 (5) (h)): when, and the reset its text named. */
type LimitEnd = { readonly at: number; readonly resetAt: string | null };
type HerdrPane = { readonly binary: string; readonly pane: string };

// Toast words for a done job; one whose final "Note check" left items open asks for a decision before landing.
const PLAIN_DONE = {
	title: "done; next step: land it",
	next: "land it, or name the check that blocks landing",
	toast: "done; next step: land it, or name the check that blocks landing",
};
const OPEN_DONE = {
	title: "done with open checks; decide before landing",
	next: "continue the job, start a review, or accept each open check with a reason",
	toast: "done with open checks; decide each before landing",
};

// biome-ignore lint/complexity/noExcessiveLinesPerFunction: split pending: hook factory, handlers share its state
export default function limenWake(pi: Pick<PiApi, "on" | "sendUserMessage" | "registerCommand">): void {
	let watcher: FSWatcher | undefined;
	let sweepTimer: NodeJS.Timeout | undefined;
	let changeTimer: NodeJS.Timeout | undefined;
	let eventSweepAt = 0;
	let statusBody = "";
	let active = false;
	let muted = false;
	let session: Pick<PiContext, "isIdle" | "ui"> | undefined;
	let sessionGeneration = 0;
	let jobsDir: string | undefined;
	let sessionId = "";
	let limenDir: string | undefined;
	let lastSweepAt = 0;
	let initialSweep = false;
	let footerAlive = true;
	let footerNoted = false;
	let herdr: HerdrPane | undefined;
	let herdrSeq = Date.now();
	let herdrMetadata: string | undefined;
	let herdrMetadataAt = 0;
	let tabTail: string | undefined;
	let ownerTurnAt = 0;
	let finishedCache:
		| { readonly key: string; readonly until: number; readonly jobs: readonly FinishedJob[] }
		| undefined;
	// The job folders whose damaged file this session already named, so each one is reported once.
	const reportedDamage = new Set<string>();
	// Records with nothing left to deliver here, oldest first. A watch event, a fallback due time, or the refresh reopens one.
	const settled = new Set<string>();
	const fallbackDue = new Map<string, number>();
	// Fallbacks settled only because this session owns no job; a new subscription anywhere reopens them.
	const unowned = new Set<string>();
	let refreshTicks = 0;
	// The sorted jobs listing. An event naming a record it lacks, a top-level event, or the cache timer reads it again.
	let listing: { readonly ids: readonly string[]; readonly known: ReadonlySet<string> } | undefined;
	// Jobs that had left the start queue before this session began; their start is old news here.
	const startedEarlier = new Set<string>();
	let ownsJobs: boolean | undefined;
	let cacheExpiresAt = 0;
	let sweeping = false;
	let injectedThisSweep = false;
	type PendingDelivery = {
		readonly claim: string;
		readonly delivered: string;
		readonly message: string;
		readonly blocked: () => void;
		accepted: boolean;
		entered: boolean;
		answered: boolean;
		errored: boolean;
		settled: boolean;
	};
	const pendingDeliveries = new Map<string, PendingDelivery>();
	const activeDeliveries = new Set<string>();
	// The run's last turn ended on the subscription limit; its settle owes the wakes it could not take (A-016 (2)).
	let limitEnd: LimitEnd | undefined;
	const herdrCall = (args: readonly string[]) => {
		if (!herdr) {
			return;
		}
		try {
			execFile(herdr.binary, args, { timeout: 2_000 }, () => {}).unref();
		} catch {
			// Herdr reporting is advisory; durable state remains on disk.
		}
	};
	const herdrReport = (body: string, title: string, pulses: readonly Pulse[] = [], watched = 0) => {
		if (!herdr) {
			return;
		}
		const jobs = `${pulses.length} RUNNING · ${watched} watched · ${pulses.length - watched} unwatched`;
		const label = `${jobs} · ${body}`;
		const agent = herdrDisplayAgent(pulses, session?.isIdle() === true);
		const signature = `${title}\0${label}\0${agent}`;
		if (signature === herdrMetadata && Date.now() - herdrMetadataAt < METADATA_REFRESH_MS) {
			return;
		}
		herdrMetadata = signature;
		herdrMetadataAt = Date.now();
		const change = body
			? [
					"--title",
					title,
					"--display-agent",
					agent,
					"--token",
					`limen=${label}`,
					"--state-label",
					`idle=${label}`,
					"--state-label",
					`done=${label}`,
				]
			: ["--clear-title", "--display-agent", agent, "--clear-token", "limen", "--clear-state-labels"];
		herdrSeq += 1;
		herdrCall([
			"pane",
			"report-metadata",
			herdr.pane,
			"--source",
			"limen",
			"--seq",
			String(herdrSeq),
			...change,
			"--ttl-ms",
			String(METADATA_TTL_MS),
		]);
	};
	const releaseHerdr = () => {
		if (!herdr) {
			return;
		}
		herdrSeq += 1;
		herdrCall([
			"pane",
			"report-metadata",
			herdr.pane,
			"--source",
			"limen",
			"--seq",
			String(herdrSeq),
			"--clear-title",
			"--clear-display-agent",
			"--clear-token",
			"limen",
			"--clear-state-labels",
		]);
	};
	const stopTimers = () => {
		if (sweepTimer) {
			clearInterval(sweepTimer);
		}
		sweepTimer = undefined;
		if (changeTimer) {
			clearTimeout(changeTimer);
		}
		changeTimer = undefined;
	};
	const dropFooter = (reason: string) => {
		footerAlive = false;
		statusBody = "";
		if (footerNoted || !limenDir) {
			return;
		}
		footerNoted = true;
		try {
			appendFileSync(
				join(limenDir, "log"),
				`[limen ${new Date().toISOString()}] coordinator footer disabled: ${reason}; wake delivery remains active\n`,
			);
		} catch {
			// Delivery and the liveness stamp remain the durable signals when this note cannot be written.
		}
	};
	const setStatus = (value: string | undefined) => {
		if (!session || !footerAlive) {
			return;
		}
		try {
			session.ui.setStatus("limen", value);
		} catch {
			dropFooter("setStatus failed");
		}
	};
	const retire = (reportHerdr = true) => {
		active = false;
		sessionGeneration += 1;
		session = undefined;
		stopTimers();
		statusBody = "";
		if (reportHerdr) {
			herdrReport("", "");
		}
	};
	const clearStatus = (reportHerdr = true) => {
		statusBody = "";
		setStatus(undefined);
		if (reportHerdr) {
			herdrReport("", "");
		}
	};
	const drawStatus = () => {
		if (!active || !footerAlive || muted || !statusBody || !session) {
			return;
		}
		setStatus(statusBody);
	};
	const sessionOwns = (jobs: string) => {
		if (ownsJobs === undefined) {
			ownsJobs = sessionOwnsJobs(jobs, sessionId);
		}
		return ownsJobs;
	};
	const reopen = (id: string) => {
		settled.delete(id);
		fallbackDue.delete(id);
		unowned.delete(id);
	};
	const reopenAll = () => {
		settled.clear();
		fallbackDue.clear();
		unowned.clear();
	};
	// What the job's completion still asks of this session; a damaged record asks nothing until it changes again.
	const leftFor = (job: string) => undamaged(job, () => deliveryLeft(job, sessionId), "nothing");
	const settle = (jobs: string, id: string, left: ReturnType<typeof deliveryLeft>) => {
		const job = join(jobs, id);
		if (left === "open") {
			return;
		}
		if (left === "fallback" && !sessionOwns(jobs)) {
			unowned.add(id);
		} else if (left === "fallback") {
			// A due fallback stays open while the session is busy or muted; one inside its grace waits for its due time.
			const due = fallbackDueAt(job, recordOf(job)?.finishedAt ?? null);
			if (due <= Date.now()) {
				return;
			}
			fallbackDue.set(id, due);
		}
		settled.add(id);
	};
	// The oldest share of settled records is checked again; one that still owes nothing moves to the back unobserved.
	const refreshSettled = (jobs: string) => {
		const now = Date.now();
		for (const [id, due] of fallbackDue) {
			if (due <= now) {
				reopen(id);
			}
		}
		let share = Math.min(settled.size, refreshTicks * Math.ceil(settled.size / REFRESH_TICKS));
		refreshTicks = 0;
		for (const id of settled) {
			if (share <= 0) {
				break;
			}
			share -= 1;
			reopen(id);
			if (leftFor(join(jobs, id)) === "nothing") {
				settled.add(id);
			}
		}
	};
	const jobIds = (jobs: string) => {
		if (!listing || !watcher) {
			const ids = readdirSync(jobs).sort();
			listing = { ids, known: new Set(ids) };
		}
		return listing.ids;
	};
	// Limen owns the tab tail; the coordinator owns the stem. Rewriting only on a tail change keeps this to a spawn, a completion, a land, or an owner turn.
	const updateTabTail = (jobs: string, running: readonly string[], finished: readonly FinishedJob[]) => {
		const tab = process.env.HERDR_TAB_ID?.trim();
		if (!herdr || !tab) {
			return;
		}
		const count = running.filter((id) => recordOf(join(jobs, id))?.origin.tab === tab).length;
		// The finished count is news since the owner last spoke; the job line keeps naming older finished jobs.
		const fresh = finished.filter(
			({ id, finishedAt }) => finishedAt >= ownerTurnAt && recordOf(join(jobs, id))?.origin.tab === tab,
		).length;
		const counts = [count > 0 ? `${count} running` : "", fresh > 0 ? `${fresh} finished` : ""].filter(Boolean);
		const tail = counts.length ? ` · ${counts.join(" · ")}` : "";
		if (tail === tabTail) {
			return;
		}
		tabTail = tail;
		const current = tabLabel(herdr.binary, tab);
		if (current === undefined) {
			return;
		}
		const stem = current.replace(TAB_TAIL, "").trim();
		// A tab still carrying Herdr's own number was never named by a coordinator; decorating it would invent a stem.
		if (!stem || /^\d+$/.test(stem)) {
			return;
		}
		const next = `${stem}${tail}`;
		if (next !== current) {
			herdrCall(["tab", "rename", tab, next]);
		}
	};
	// Lands and closes happen in Git and spec/, outside the jobs directory: refresh when a job leaves the running set, after each coordinator turn, and on the cache timer.
	const finishedNow = (jobs: string, running: readonly string[]): readonly FinishedJob[] => {
		const key = running.join("\n");
		if (finishedCache && finishedCache.key === key && Date.now() < finishedCache.until) {
			return finishedCache.jobs;
		}
		const found = finishedJobs(jobs, process.env.HERDR_TAB_ID?.trim(), sessionId);
		finishedCache = { key, until: Date.now() + CACHE_REFRESH_MS, jobs: found };
		return found;
	};
	const updateStatus = async (jobs: string, running: readonly string[], generation: number) => {
		const finished = finishedNow(jobs, running);
		const next = await jobDisplay(jobs, sessionId, running, finished);
		if (!active || generation !== sessionGeneration) {
			return;
		}
		updateTabTail(jobs, running, finished);
		if (!next) {
			clearStatus();
			return;
		}
		statusBody = next.status;
		herdrReport(next.summary, next.title, next.pulses, next.watched);
		drawStatus();
	};
	const notifyHerdr = (job: string, id: string, state: string, label: string, branch: string, slot: string) => {
		if (!claimMarker(job, "herdr", slot)) {
			return;
		}
		const done = state === "done" && openChecks(recordOf(job)).length > 0 ? OPEN_DONE : PLAIN_DONE;
		// An advisory is a note on a running job, not a state; its title reads as the seat notification's does.
		const headline = state === "done" ? done.title : state === "advisory" ? "· advisory" : `is ${state}`;
		herdrCall([
			"notification",
			"show",
			`limen: ${label} ${headline}`,
			"--body",
			state === "done" ? `job ${id} · branch ${branch} · ${done.next}` : `job ${id} · branch ${branch}`,
			"--sound",
			state === "done" ? "done" : "request",
		]);
	};
	const injectWake = (message: string): Promise<void> => {
		// First idle inject in a sweep is a real turn; later injects, and any inject while busy, are followUp.
		if (session?.isIdle() === true && !injectedThisSweep) {
			injectedThisSweep = true;
			return Promise.resolve(pi.sendUserMessage(message));
		}
		return Promise.resolve(pi.sendUserMessage(message, { deliverAs: "followUp" }));
	};
	const deliveryCallbacks = (message: string, blocked: () => void): DeliveryCallbacks => ({
		blocked,
		protected(claim) {
			const pending = pendingDeliveries.get(claim);
			return Boolean(pending && (pending.entered || session?.isIdle() !== true));
		},
		pending(claim, delivered) {
			pendingDeliveries.set(claim, {
				claim,
				delivered,
				message,
				blocked,
				accepted: false,
				entered: false,
				answered: false,
				errored: false,
				settled: false,
			});
			refreshClaim(claim);
		},
		accepted(claim) {
			const pending = pendingDeliveries.get(claim);
			if (pending) {
				pending.accepted = true;
			}
			confirmDeliveries();
		},
		released(claim) {
			pendingDeliveries.delete(claim);
			activeDeliveries.delete(claim);
		},
	});
	const sendCompletion = (jobs: string, id: string, state: string, delivery: "own" | "fallback"): boolean => {
		const fallback = delivery === "fallback";
		if (!session) {
			return false;
		}
		const job = join(jobs, id);
		const record = recordOf(job);
		const label = record?.label || id;
		const branch = record?.branch ?? "";
		const repo = record?.repo ?? "";
		const slot = fallback ? "_fallback" : sessionId;
		if (!fallback && deliveryExists(job, sessionId)) {
			return false;
		}
		if (
			fallback &&
			(completionSlots(deliveredSlots(job)).length > 0 || session.isIdle() !== true || muted || !sessionOwns(jobs))
		) {
			return false;
		}
		// A stopped delivery sends nothing, so it never builds the wake text.
		if (completionStopped(job)) {
			return false;
		}
		const blocked = () => {
			try {
				session?.ui.notify(`limen: ${label} wake was unconfirmed twice; automatic delivery stopped (${id})`, "info");
			} catch {
				dropFooter("ui.notify failed");
			}
		};
		const eligible = () => {
			if (recoverClaims(job, (claim) => pendingDeliveries.has(claim))) {
				blocked();
			}
			if (!isTerminal(stateOf(jobs, id)) || !routable(job) || recordOf(job)?.owedWake) {
				return false;
			}
			// Read claims before delivered records: rename moves atomically between them, so one side is always visible.
			if (fallback) {
				return (
					session?.isIdle() === true &&
					!muted &&
					sessionOwns(jobs) &&
					completionSlots(claimSlots(job)).every((claim) => claim === "_fallback") &&
					completionSlots(deliveredSlots(job)).length === 0
				);
			}
			return (
				subscribed(job, sessionId) &&
				!existsSync(join(job, "notify", "claims", "_fallback")) &&
				!existsSync(join(job, "notify", "delivered", "_fallback"))
			);
		};
		// The wake text reads the record again; a record damaged since then sends nothing. A damaged progress file only
		// leaves out whether the job produced nothing.
		const message = undamaged(
			job,
			() => completionWake(job, label, state, id, branch, repo, { fallback, session: sessionId }, progressOf),
			"",
		);
		if (!message) {
			return false;
		}
		const routed = claimDelivery(
			job,
			slot,
			eligible,
			() => {
				// Toast always — steers alone are easy to miss on a busy coordinator, and workers' steer inbox is not this session.
				try {
					session?.ui.notify(
						state === "done"
							? `limen: ${label} ${openChecks(recordOf(job)).length ? OPEN_DONE.toast : PLAIN_DONE.toast} (${id})`
							: `limen: ${label} is ${state}; inspect failure (${id})`,
						"info",
					);
				} catch {
					dropFooter("ui.notify failed");
				}
				return injectWake(message);
			},
			deliveryCallbacks(message, blocked),
		);
		if (routed) {
			notifyHerdr(job, id, state, label, branch, slot);
		}
		return routed;
	};
	const sendAdvisory = (jobs: string, id: string, delivery: "own" | "fallback"): boolean => {
		const fallback = delivery === "fallback";
		if (!session) {
			return false;
		}
		const job = join(jobs, id);
		const record = recordOf(job);
		const advisory = record?.advisory;
		if (!advisory) {
			return false;
		}
		// One wake per source and session (the D-092 note): a session that heard the queue's diagnosis still hears the
		// wrapper's stall note; the fallback, the receipts and the attempts count per source too.
		const source = advisorySource(advisory);
		const family = advisoryFamily(source);
		const slots = (names: readonly string[]) => names.filter((name) => receiptFamily(name) === family);
		const label = record.label || id;
		const branch = record.branch ?? "";
		const repo = record.repo ?? "";
		const fallbackSlot = advisorySlot(source, "_fallback");
		const slot = fallback ? fallbackSlot : advisorySlot(source, sessionId);
		if (!fallback && deliveryExists(job, slot)) {
			return false;
		}
		if (
			fallback &&
			(slots(deliveredSlots(job)).length > 0 || session.isIdle() !== true || muted || !sessionOwns(jobs))
		) {
			return false;
		}
		const blocked = () => {
			try {
				session?.ui.notify(
					`limen: ${label} advisory wake was unconfirmed twice; automatic delivery stopped (${id})`,
					"info",
				);
			} catch {
				dropFooter("ui.notify failed");
			}
		};
		const eligible = () => {
			if (recoverClaims(job, (claim) => pendingDeliveries.has(claim))) {
				blocked();
			}
			const now = recordOf(job);
			// A note of another source since the read is not this wake's: its own claim follows.
			const same = now?.advisory && advisorySource(now.advisory) === source;
			if (now?.state !== "running" || !routable(job) || !same || now.owedWake) {
				return false;
			}
			if (fallback) {
				return (
					session?.isIdle() === true &&
					!muted &&
					sessionOwns(jobs) &&
					slots(claimSlots(job)).every((claim) => claim === fallbackSlot) &&
					slots(deliveredSlots(job)).length === 0
				);
			}
			return (
				subscribed(job, sessionId) &&
				!existsSync(join(job, "notify", "claims", fallbackSlot)) &&
				!existsSync(join(job, "notify", "delivered", fallbackSlot))
			);
		};
		const message = advisoryWake(job, label, id, branch, repo, advisory.text, fallback, record);
		const routed = claimDelivery(
			job,
			slot,
			eligible,
			() => {
				try {
					session?.ui.notify(`limen: ${label} · advisory (${id})`, "info");
				} catch {
					dropFooter("ui.notify failed");
				}
				return injectWake(message);
			},
			deliveryCallbacks(message, blocked),
		);
		if (routed) {
			notifyHerdr(job, id, "advisory", label, branch, slot);
		}
		return routed;
	};
	// A job that waited in the start queue tells its own session once that it started; the slot is its own receipt family.
	const sendStart = (jobs: string, id: string): boolean => {
		const job = join(jobs, id);
		const slot = `_start.${sessionId}`;
		const message = text(join(job, "start-notice"));
		if (!session || !message || startedEarlier.has(id) || deliveryExists(job, slot)) {
			return false;
		}
		const label = recordOf(job)?.label || id;
		const blocked = () => {
			try {
				session?.ui.notify(`limen: ${label} start notice was unconfirmed twice; delivery stopped (${id})`, "info");
			} catch {
				dropFooter("ui.notify failed");
			}
		};
		const eligible = () => {
			if (recoverClaims(job, (claim) => pendingDeliveries.has(claim))) {
				blocked();
			}
			const now = recordOf(job);
			return now?.state === "running" && subscribed(job, sessionId) && now.queued === null && !now.owedWake;
		};
		return claimDelivery(job, slot, eligible, () => injectWake(message), deliveryCallbacks(message, blocked));
	};
	// biome-ignore lint/complexity/noExcessiveCognitiveComplexity: split pending: job observer in the wake hook
	const observe = (jobs: string, id: string) => {
		const job = join(jobs, id);
		const record = recordOf(job);
		// A group member reports through its group; a migrated record is history only (D-057 (4)).
		if (!record || record.group || record.migrated) {
			return;
		}
		if (!session || !routable(job)) {
			return;
		}
		const state = record.state;
		if (!isObservable(state)) {
			return;
		}
		const own = subscribed(job, sessionId);
		const label = record.label || id;
		const branch = record.branch ?? "";
		// A job in the start queue has not started: the toast waits for its handshake and for it to leave the queue.
		const waiting = !record.identity?.pid || record.queued !== null;
		if (own && state === "running" && !muted && !waiting && claimMarker(job, "started", sessionId)) {
			try {
				session.ui.notify(`limen: ${label} started (${id})`, "info");
			} catch {
				dropFooter("ui.notify failed");
			}
		}
		// A wake of the job owed after the subscription limit waits until the seat sweep releases it (A-016 (2)).
		if (muted || record.owedWake) {
			return;
		}
		if (state === "running") {
			if (own && !waiting && existsSync(join(job, "start-notice"))) {
				sendStart(jobs, id);
			}
			if (!record.advisory) {
				return;
			}
			if (own) {
				sendAdvisory(jobs, id, "own");
			} else if (oldEnoughForFallback(job, record.advisory.at)) {
				sendAdvisory(jobs, id, "fallback");
			}
			return;
		}
		if (own && !deliveryExists(job, sessionId) && !deliveryExists(job, "_fallback")) {
			notifyHerdr(job, id, state, label, branch, sessionId);
		}
		if (own) {
			sendCompletion(jobs, id, state, "own");
		} else if (oldEnoughForFallback(job, record.finishedAt)) {
			sendCompletion(jobs, id, state, "fallback");
		}
	};
	/**
	 * A wake that a turn ended on the subscription limit could not take (A-016 (2), D-097 (5) (h)), a completion, an
	 * advisory or a start notice: owed on the record of the job whose folder holds its claim, with the reset the turn
	 * named, then its claim released with no attempt spent, so the job's wakes wait for the seat sweep, which releases
	 * them after the reset. A record that cannot take it spends the attempt as before, with the reason in the job's log
	 * (T-01).
	 */
	const oweWake = (pending: PendingDelivery, limit: LimitEnd) => {
		const owed = { since: new Date(limit.at).toISOString(), resetAt: limit.resetAt };
		void writeOwedWake(claimedJob(pending.claim), (earlier) => earlier ?? owed)
			.then(() => releaseOwedClaim(pending.claim))
			.catch((error: unknown) => {
				const reason = error instanceof Error ? error.message : String(error);
				if (recordUnconfirmed(pending.claim, `wake turn ended on the subscription limit; owing it failed: ${reason}`)) {
					pending.blocked();
				}
			});
	};
	const confirmDeliveries = () => {
		for (const pending of pendingDeliveries.values()) {
			if (!pending.accepted || !pending.settled) {
				continue;
			}
			if (!pending.errored && pending.entered && pending.answered) {
				confirmClaim(pending.claim, pending.delivered);
			} else if (limitEnd) {
				oweWake(pending, limitEnd);
			} else if (recordUnconfirmed(pending.claim)) {
				pending.blocked();
			}
			pendingDeliveries.delete(pending.claim);
		}
	};
	const refreshPendingClaims = () => {
		for (const pending of pendingDeliveries.values()) {
			refreshClaim(pending.claim);
		}
	};
	const stampSweep = () => {
		if (!limenDir || Date.now() - lastSweepAt < CLAIM_STALE_MS) {
			return;
		}
		lastSweepAt = Date.now();
		try {
			atomicWriteSync(join(limenDir, "last-sweep"), `${new Date(lastSweepAt).toISOString()}\n${sessionId}\n`);
		} catch {
			// F043 treats an absent or stale stamp as no listener; never claim liveness we could not write.
		}
	};
	const sweep = () => {
		if (!active || !session || !jobsDir || sweeping) {
			return;
		}
		sweeping = true;
		void finishSweep(jobsDir);
	};
	/** The first tick of a session observes each running job with an advisory, so a note set before it is heard. */
	const observeAdvisories = (jobs: string, running: readonly string[]) => {
		for (const id of running) {
			if (recordOf(join(jobs, id))?.advisory) {
				observe(jobs, id);
			}
		}
	};
	/** Observes each job a tick found, and settles each one with nothing left to deliver in this session. */
	const observeEach = (jobs: string, ids: readonly string[]) => {
		for (const id of ids) {
			const job = join(jobs, id);
			if (stateOf(jobs, id) === "running" && !routable(job)) {
				enrollLegacyRunning(job);
			}
			if (leftFor(job) === "nothing") {
				settled.add(id);
				continue;
			}
			observe(jobs, id);
			// Observing can claim or deliver, so the verdict is read again.
			settle(jobs, id, leftFor(job));
		}
	};
	const finishSweep = async (jobs: string) => {
		const generation = sessionGeneration;
		injectedThisSweep = false;
		refreshPendingClaims();
		stampSweep();
		try {
			// Watch events invalidate individual records; a rolling refresh recovers missed events and manual wake repair.
			if (Date.now() >= cacheExpiresAt) {
				ownsJobs = undefined;
				listing = undefined;
				cacheExpiresAt = Date.now() + CACHE_REFRESH_MS;
			}
			refreshSettled(jobs);
			const { observe: ids, running } = collectSweep(jobs, jobIds(jobs), settled);
			if (initialSweep) {
				initialSweep = false;
				observeAdvisories(jobs, running);
			}
			// The tick reaps nothing: only the seat sweep finalizes a dead job (T-04, R-032), from outside every job's scope.
			// It still delivers only once the code that started it has run to its end, as it did while it awaited the reap
			// here: a handler that starts a tick, such as `/limen on` with its notice, finishes before a wake goes out.
			await Promise.resolve();
			if (!active || generation !== sessionGeneration) {
				return;
			}
			observeEach(jobs, ids);
			await updateStatus(
				jobs,
				running.filter((id) => stateOf(jobs, id) === "running"),
				generation,
			);
			for (const line of damagedFiles(reportedDamage)) {
				session?.ui.notify(line, "warning");
			}
		} catch {
			// Display and delivery are advisory; durable state remains on disk.
		} finally {
			sweeping = false;
			if (active && generation !== sessionGeneration) {
				sweep();
			}
		}
	};
	const scheduleSweep = () => {
		if (!active || changeTimer) {
			return;
		}
		// Events inside the second after the last event sweep fold into one trailing sweep; the timer still sweeps meanwhile.
		changeTimer = setTimeout(
			() => {
				changeTimer = undefined;
				eventSweepAt = Date.now();
				sweep();
			},
			Math.max(50, eventSweepAt + EVENT_SWEEP_MS - Date.now()),
		);
		changeTimer.unref();
	};
	const jobsChanged = (filename: string | null) => {
		if (progressFilename(filename)) {
			return;
		}
		const path = filename?.replaceAll("\\", "/") ?? "";
		const id = path.split("/")[0];
		if (!filename) {
			reopenAll();
		} else if (id) {
			reopen(id);
		}
		if (!(id && path.includes("/") && listing?.known.has(id))) {
			listing = undefined;
		}
		// Claims do not schedule sweeps, but deleting a delivered slot must reopen a cached job on the next timer tick.
		if (notifyBookkeeping(filename)) {
			return;
		}
		if (!filename || !path.includes("/") || /^[^/]+\/notify(?:\/subscribers(?:\/|$)|$)/.test(path)) {
			ownsJobs = undefined;
			for (const unownedId of unowned) {
				reopen(unownedId);
			}
		}
		scheduleSweep();
	};
	/**
	 * The project of `context`, or undefined outside one. A project an older Limen recorded is migrated first (D-057
	 * (6)): the hook does nothing there and says so once.
	 */
	const projectToWake = (context: Pick<PiContext, "cwd" | "ui">): string | undefined => {
		const root = coordinatorProject(context.cwd);
		const unmigrated = root && notMigratedReason(join(root, ".limen", "jobs"));
		if (unmigrated) {
			stopTimers();
			context.ui.notify(unmigrated, "warning");
			return undefined;
		}
		return root;
	};
	pi.on(
		"session_start",
		recorded((_event: unknown, rawContext: unknown) => {
			if (transport("LIMEN_JOB") === "1") {
				return;
			}
			const context = piContext("session_start", rawContext, ["cwd", "isIdle", "sessionManager", "ui"]);
			const root = projectToWake(context);
			if (!root) {
				return;
			}
			const jobs = join(root, ".limen", "jobs");
			stopTimers();
			const id = context.sessionManager.getSessionId();
			if (!SESSION_ID.test(id)) {
				return;
			}
			try {
				mkdirSync(jobs, { recursive: true });
			} catch {
				return;
			}
			void registerProject(root).catch(() => {});
			active = true;
			sessionGeneration += 1;
			session = context;
			jobsDir = jobs;
			limenDir = join(root, ".limen");
			sessionId = id;
			lastSweepAt = 0;
			initialSweep = true;
			footerAlive = true;
			footerNoted = false;
			tabTail = undefined;
			ownerTurnAt = 0;
			finishedCache = undefined;
			pendingDeliveries.clear();
			activeDeliveries.clear();
			// A limit end belongs to its own session's run, so no run of this session owes a wake on it.
			limitEnd = undefined;
			reportedDamage.clear();
			damaged.clear();
			reopenAll();
			refreshTicks = 0;
			listing = undefined;
			startedEarlier.clear();
			ownsJobs = undefined;
			cacheExpiresAt = 0;
			herdr = herdrTarget();
			const tab = process.env.HERDR_TAB_ID?.trim();
			for (const jobId of readdirSync(jobs)) {
				const job = join(jobs, jobId);
				const record = recordOf(job);
				if (record?.state !== "running") {
					continue;
				}
				if (!routable(job)) {
					enrollLegacyRunning(job);
				}
				// A job recording origin-pane is woken through Herdr at finalize; subscribing here would wake the same coordinator twice.
				if (tab && record.origin.tab === tab && !record.origin.pane) {
					subscribeSession(job, id);
				}
				if (subscribed(job, id) && record.identity?.pid && record.queued === null) {
					claimMarker(job, "started", id);
					startedEarlier.add(jobId);
				}
			}
			watcher = watch(jobs, { recursive: true }, (_event, filename) => jobsChanged(filename));
			watcher.unref();
			watcher.on("error", () => {
				watcher?.close();
				// Without events the listing is read on every sweep again.
				watcher = undefined;
				cacheExpiresAt = 0;
				clearStatus();
			});
			sweepTimer = setInterval(() => {
				refreshTicks += 1;
				sweep();
			}, SWEEP_MS);
			sweepTimer.unref();
			sweep();
		}),
	);
	pi.on(
		"message_start",
		recorded((raw: unknown) => {
			const message = eventMessage(piEvent("message_start", raw));
			if (message.role !== "user") {
				return;
			}
			// Every Limen wake opens with "Limen job"; any other user message is the owner's turn and resets the title's finished count.
			if (!message.content.startsWith("Limen job ")) {
				ownerTurnAt = Date.now();
			}
			const pending = [...pendingDeliveries.values()].find(
				(candidate) => !candidate.entered && candidate.message === message.content,
			);
			if (!pending) {
				return;
			}
			pending.entered = true;
			activeDeliveries.add(pending.claim);
		}),
	);
	pi.on(
		"message_end",
		recorded((raw: unknown) => {
			const message = eventMessage(piEvent("message_end", raw));
			if (message.role !== "assistant") {
				return;
			}
			const failed = message.stopReason === "error" || message.stopReason === "aborted";
			// The one definition of a limit end (T-25), read from the provider's errorMessage, never from model text.
			const error = message.errorMessage ?? "";
			if (failed && isLimitEnd(error)) {
				const at = Date.now();
				limitEnd = { at, resetAt: limitReset(error, at) };
			}
			for (const claim of activeDeliveries) {
				const pending = pendingDeliveries.get(claim);
				if (!pending) {
					continue;
				}
				if (failed) {
					pending.errored = true;
				} else {
					pending.answered = true;
				}
			}
		}),
	);
	pi.on(
		"agent_settled",
		recorded(() => {
			for (const pending of pendingDeliveries.values()) {
				pending.settled = true;
			}
			confirmDeliveries();
			limitEnd = undefined;
			activeDeliveries.clear();
			finishedCache = undefined;
			sweep();
		}),
	);
	pi.on(
		"session_shutdown",
		recorded(() => {
			if (!active && !sweepTimer) {
				return;
			}
			watcher?.close();
			watcher = undefined;
			for (const pending of pendingDeliveries.values()) {
				try {
					atomicWriteSync(join(pending.claim, "live"), "closed\n");
				} catch {
					// The claim may already have been confirmed or recovered.
				}
			}
			pendingDeliveries.clear();
			activeDeliveries.clear();
			limitEnd = undefined;
			retire(false);
			releaseHerdr();
		}),
	);
	if (transport("LIMEN_JOB") === "1") {
		return;
	}
	pi.registerCommand("limen", {
		description: "Mute or resume limen job display and wakes for this session",
		getArgumentCompletions(prefix) {
			const items = ["on", "off"].filter((value) => value.startsWith(prefix)).map((value) => ({ value, label: value }));
			return items.length ? items : null;
		},
		handler: recorded(async (rawArgs: unknown, rawContext: unknown) => {
			const request = piCommandArgs("limen", rawArgs).trim();
			const commandContext = piContext("command limen", rawContext, ["ui"]);
			// A removed command typed here gets its removal line; any other word would toggle the mute state below.
			const removed = removedCommand(request.split(/\s+/)[0] ?? "");
			if (removed) {
				commandContext.ui.notify(removed, "info");
				return;
			}
			if (request === "on") {
				muted = false;
			} else if (request === "off") {
				muted = true;
			} else {
				muted = !muted;
			}
			if (active && session && jobsDir) {
				if (muted) {
					setStatus(undefined);
				} else {
					sweep();
				}
			}
			commandContext.ui.notify(`limen wake ${muted ? "off" : "on"}${active ? "" : " (inactive here)"}`, "info");
		}),
	});
}

function collectSweep(
	jobs: string,
	ids: readonly string[],
	settled: ReadonlySet<string>,
): { readonly observe: string[]; readonly running: string[] } {
	const observe: string[] = [];
	const running: string[] = [];
	for (const id of ids) {
		if (settled.has(id)) {
			continue;
		}
		observe.push(id);
		if (stateOf(jobs, id) === "running") {
			running.push(id);
		}
	}
	return { observe, running };
}
/** Whether a watch event names a job's progress file, which changes per stream event and is no news (D-057 (7.1)). */
export function progressFilename(filename: string | null): boolean {
	if (!filename) {
		return false;
	}
	// atomicWrite renames a temp sibling into place; the temp name is the same progress write.
	const parts = filename.replaceAll("\\", "/").replace(TEMPORARY_NAME, "").split("/");
	return parts.length === 2 && isProgressName(parts[1] ?? "");
}
/** Why the hook does nothing in this project: a job folder of an older Limen (D-057 (6)); undefined when it can run. */
function notMigratedReason(jobs: string): string | undefined {
	try {
		jobFoldersSync(jobs);
		return undefined;
	} catch (error) {
		if (error instanceof LimenError && error.code === "NOT_MIGRATED") {
			return notMigratedNotice(error);
		}
		// A folder the hook cannot list is handled where the hook makes it; this check only names an older record.
		return undefined;
	}
}
/**
 * The note of a project an older Limen recorded. It names the refusal's `next` only when there is one, since `next`
 * may be null (D-045 (2)) and the note must never ask to run "null".
 */
export function notMigratedNotice(error: LimenError): string {
	const first = error.next === null ? "" : `${error.next}, then `;
	return `limen: wakes are off in this project: ${error.message}; run ${first}limen migrate, then reload this coordinator session (/reload): the hook checks only at session start`;
}
/**
 * Each job folder whose record or progress file the hook read as damaged in this session, with the error, so that it
 * reports each one once (T-01). A session start clears it with the session's reported set, so a file repaired since is
 * not named again, and one still damaged is named once more.
 */
const damaged = new Map<string, string>();
/**
 * What `read` gives for the job folder `job`; when a file it reads is damaged, `instead`, so one bad file does not stop
 * the wakes and the status line of every other job, and `damagedFiles` names it.
 */
function undamaged<T>(job: string, read: () => T, instead: T): T {
	try {
		return read();
	} catch (error) {
		if (error instanceof LimenError && error.code === "BAD_DATA") {
			damaged.set(job, error.message);
			return instead;
		}
		throw error;
	}
}
/** The job's record; a damaged one counts as none here (`undamaged`). */
function recordOf(job: string): JobRecord | undefined {
	return undamaged(job, () => readRecordSync(job), undefined);
}
/** The job's progress; a damaged one counts as none here (`undamaged`). */
function progressOf(job: string): Progress | undefined {
	return undamaged(job, () => readProgressSync(job), undefined);
}
/** The job folders with a damaged file found since the last call and not in `reported`, each reported once. */
function damagedFiles(reported: Set<string>): string[] {
	const fresh = [...damaged].filter(([job]) => !reported.has(job));
	for (const [job] of fresh) {
		reported.add(job);
	}
	return fresh.map(([job, message]) => `limen: a file of job ${basename(job)} is damaged: ${message}`);
}
/** The job line: each running job with its pulse, then each finished job with its state, until it lands or closes. */
async function jobDisplay(
	jobs: string,
	session: string,
	runningIds: readonly string[],
	finished: readonly FinishedJob[],
): Promise<
	| {
			readonly status: string;
			readonly title: string;
			readonly summary: string;
			readonly pulses: readonly Pulse[];
			readonly watched: number;
	  }
	| undefined
> {
	const running = await Promise.all(
		runningIds.map(async (id) => {
			const label = recordOf(join(jobs, id))?.label || id;
			const pulse = await pulseOf(jobs, id);
			const tool = progressOf(join(jobs, id))?.lastTool ?? "";
			const watching = subscribed(join(jobs, id), session);
			return {
				label,
				pulse,
				watching,
				status: `${shortLabel(label)} ${pulse === "tool" && tool ? `${pulse}:${tool}` : pulse}${watching ? "" : " (unwatched)"}`,
			};
		}),
	);
	if (running.length === 0 && finished.length === 0) {
		return undefined;
	}
	const summary = [
		running.map(({ status }) => status),
		finished.map(({ label, state }) => `${shortLabel(label)} ${state}`),
	]
		.filter((names) => names.length > 0)
		.map((names) => `${names.slice(0, 3).join(" ")}${names.length > 3 ? ` +${names.length - 3}` : ""}`)
		.join(" · ");
	const title =
		running.length === 0
			? `Limen · ${finished.length} finished`
			: running.length === 1
				? `Limen · ${shortLabel(running[0]?.label ?? "")}`
				: `Limen · ${running.length} jobs · ${running
						.slice(0, 3)
						.map(({ label }) => shortLabel(label))
						.join(" ")}`;
	return {
		status: `limen ${running.length} · ${summary}`,
		title,
		summary,
		pulses: running.map(({ pulse }) => pulse),
		watched: running.filter(({ watching }) => watching).length,
	};
}
/**
 * Whether this coordinator answers for the job's end: a terminal record of no group member and no migrated history
 * (D-057 (4)), spawned from its tab or watched by its session.
 */
function answersFor(
	job: string,
	record: JobRecord | undefined,
	tab: string | undefined,
	session: string,
): record is JobRecord {
	if (!(record && isTerminal(record.state)) || record.group || record.migrated) {
		return false;
	}
	return Boolean(tab && record.origin.tab === tab) || subscribed(job, session);
}
/** Finished jobs this coordinator still answers for: terminal, spawned from its tab or watched by its session, not landed, and not closed. */
function finishedJobs(jobs: string, tab: string | undefined, session: string): FinishedJob[] {
	const root = dirname(dirname(jobs));
	// The seat sweep's daily close of leftover Herdr tabs and this line share one rule: a job leaves once every feature it
	// names is done, dropped or archived (`closedJobFeatures`).
	const closed = closedFeatures(root);
	const candidates: Array<
		FinishedJob & { readonly branch: string; readonly repo: string; readonly landable: boolean }
	> = [];
	for (const id of readdirSync(jobs).sort()) {
		const job = join(jobs, id);
		const record = recordOf(job);
		if (!answersFor(job, record, tab, session)) {
			continue;
		}
		const label = record.label || id;
		if (closedJobFeatures(label, id, closed).length > 0) {
			continue;
		}
		candidates.push({
			id,
			label,
			state: record.state,
			finishedAt: Date.parse(record.finishedAt ?? "") || 0,
			branch: record.branch ?? "",
			repo: record.repo ?? "",
			landable: (record.commits?.length ?? 0) > 0,
		});
	}
	// Only a job with commits can land. Without commits it stays until its feature closes, or until the seat sweep's daily
	// retire moves its record, which only an `abandoned` marker lets it do for such a job (A-002).
	const landed = new Set<string>();
	for (const [repo, group] of Map.groupBy(
		candidates.filter(({ landable, branch }) => landable && branch),
		({ repo }) => repo,
	)) {
		try {
			const unlanded = unlandedBranches(
				repo ? join(root, repo) : root,
				group.map(({ branch }) => branch),
			);
			for (const job of group) {
				if (!unlanded.has(job.branch)) {
					landed.add(job.id);
				}
			}
		} catch {
			// Git state unknown: the job stays visible rather than silently dropped.
		}
	}
	return candidates.filter(({ id }) => !landed.has(id));
}
async function pulseOf(jobs: string, id: string): Promise<Pulse> {
	const record = recordOf(join(jobs, id));
	const activity = progressOf(join(jobs, id))?.activity;
	return derivePulse({
		starting: !record || record.state === "starting",
		owner: await ownerState(record?.identity ?? null),
		queued: (record?.queued ?? null) !== null,
		...(activity ? { activity } : {}),
	});
}
function notifyBookkeeping(filename: string | null): boolean {
	if (!filename) {
		return false;
	}
	return /(?:^|\/)notify\/(claims|delivered|unconfirmed|seat)(?:\/|$)/.test(filename.replaceAll("\\", "/"));
}
/**
 * The role, the text of the text parts, one per line, the stop reason and the provider's error text of an event's
 * message; the error text tells a turn that ended on the subscription limit (D-097 (5) (h)).
 */
function eventMessage(event: PiMessageEvent): {
	readonly role: string;
	readonly content: string;
	readonly stopReason?: string;
	readonly errorMessage?: string;
} {
	const { message } = event;
	const parts = typeof message.content === "string" ? [] : (message.content ?? []);
	const textContent = parts
		.flatMap((part) => (part.type === "text" && typeof part.text === "string" ? [part.text] : []))
		.join("\n");
	const { stopReason, errorMessage } = message;
	return {
		role: message.role,
		content: textContent,
		...(stopReason ? { stopReason } : {}),
		...(errorMessage ? { errorMessage } : {}),
	};
}
/** The tab's current name, so a rewritten tail preserves whatever stem the coordinator set. */
function tabLabel(binary: string, tab: string): string | undefined {
	const result = spawnSync(binary, ["tab", "get", tab], { encoding: "utf8", timeout: 2_000 });
	if (result.status !== 0 || !result.stdout) {
		return undefined;
	}
	try {
		const row: unknown = JSON.parse(result.stdout);
		const label = record(record(record(row).result).tab).label;
		return typeof label === "string" ? label : undefined;
	} catch {
		return undefined;
	}
}
function record(value: unknown): Record<string, unknown> {
	return typeof value === "object" && value !== null ? (value as Record<string, unknown>) : {};
}
function herdrTarget(): HerdrPane | undefined {
	const binary = herdrBinary();
	const pane = process.env.HERDR_PANE_ID;
	if (!binary || process.env.HERDR_ENV !== "1" || !pane) {
		return undefined;
	}
	return { binary, pane };
}
// The display agent names the lead pane, so it describes the lead: an idle lead waits on its jobs; a working lead only counts them.
function herdrDisplayAgent(pulses: readonly Pulse[], leadIdle: boolean): string {
	if (!pulses.length) {
		return "Limen coordinator";
	}
	const dead = pulses.filter((pulse) => pulse === "dead").length;
	if (dead > 0) {
		return `⚠ Limen · ${dead} of ${pulses.length} needs attention`;
	}
	const jobs = `${pulses.length} ${pulses.length === 1 ? "job" : "jobs"}`;
	return leadIdle ? `Limen · waiting on ${jobs}` : `Limen · ${jobs}`;
}
function shortLabel(label: string): string {
	const name = label.trim();
	const feature = /\bF\d{3,}\b/i.exec(name)?.[0];
	if (!feature) {
		return name;
	}
	const legacy = /^(F\d{3,})(?:-([^\s]+))?(?:\s+(.+))?$/i.exec(name);
	const words = (legacy ? legacy[3] || legacy[2]?.replaceAll("-", " ") || "" : name.replace(feature, ""))
		.replace(/^[\s·-]+|[\s·-]+$/g, "")
		.replace(/\s+/g, " ");
	return words ? `${words} · ${feature.toUpperCase()}` : feature.toUpperCase();
}
function stateOf(jobs: string, id: string): string {
	return recordOf(join(jobs, id))?.state ?? "";
}
/** A content file of a job (its start notice), trimmed; "" when it is missing. */
function text(path: string): string {
	if (!existsSync(path)) {
		return "";
	}
	return readFileSync(path, "utf8").trim();
}
function isObservable(state: string): boolean {
	return state === "running" || isTerminal(state);
}
