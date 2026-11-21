import { access, mkdir, rm } from "node:fs/promises";
import { atomicWrite } from "../atomic-write.ts";
import { isTerminal } from "../job/job.ts";
import { resolveJob } from "../job/lookup.ts";
import { jobFolders, readRecord, transition } from "../job/record.ts";
import type { Parsed } from "../parser.ts";
import { limenRoot } from "../project/git.ts";
import { currentNotificationSession, herdrWakePane } from "./spawn.ts";

/**
 * How a job's wake reaches this coordinator: a Pi session subscribes in-process; a Herdr coordinator without one
 * (`PI_SESSION_ID` unset) is the job's `origin-pane`.
 */
export type WakeRoute = { readonly session: string } | { readonly pane: string };

/** `limen watch`: this coordinator gets the job's wake, or the wakes of every job running now with `--running`. */
export function watchCommand(values: Parsed, cwd: string): Promise<undefined> {
	return changeSubscriptions(values.has("running") ? undefined : values.get("job"), cwd, true);
}
/** `limen unwatch`: this coordinator stops getting the job's wake, or every job's with `--all`. */
export function unwatchCommand(values: Parsed, cwd: string): Promise<undefined> {
	return changeSubscriptions(values.has("all") ? undefined : values.get("job"), cwd, false);
}
/** Subscribes or unsubscribes one job, or every job when `query` is undefined. */
async function changeSubscriptions(query: string | undefined, cwd: string, watching: boolean): Promise<undefined> {
	const next = watching ? "follow the job with `limen show <id>` instead" : "it watches nothing";
	const route = coordinatorWakeRoute(watching ? "watch" : "unwatch", next);
	const bulk = query === undefined;
	const root = limenRoot(cwd);
	const jobs = bulk
		? await jobDirectories(`${root}/.limen/jobs`, watching)
		: [(await resolveJob(cwd, query, "control")).jobDir];
	for (const job of jobs) {
		await setSubscription(job, route, watching);
	}
	console.log(`${watching ? "watching" : "unwatched"} ${jobs.length} job${jobs.length === 1 ? "" : "s"}`);
	const [named] = jobs;
	if (!watching || bulk || !named || !("pane" in route)) {
		return;
	}
	// The pane wake is sent once, when the job ends; a job that already ended will not send another.
	const state = (await readRecord(named))?.state;
	const id = named.split("/").at(-1);
	if (state && isTerminal(state)) {
		console.log(`${id} already ${state}; no wake will follow, so read \`limen show ${id}\``);
	}
}
/** The route that wakes this shell's coordinator. Without one, `next` names what works instead. */
export function coordinatorWakeRoute(command: string, next: string): WakeRoute {
	const session = currentNotificationSession();
	if (session) {
		return { session };
	}
	const pane = herdrWakePane(session);
	if (pane) {
		return { pane };
	}
	throw new Error(
		`${command} needs a wake route to this coordinator, a Pi session (PI_SESSION_ID) or a Herdr pane (HERDR_ENV=1 and HERDR_PANE_ID), and this shell has neither; ${next}`,
	);
}
export async function watches(job: string, route: WakeRoute): Promise<boolean> {
	if ("session" in route) {
		return access(`${job}/notify/subscribers/${route.session}`).then(
			() => true,
			() => false,
		);
	}
	return (await readRecord(job))?.origin.pane === route.pane;
}
async function jobDirectories(root: string, runningOnly: boolean): Promise<string[]> {
	const jobs = (await jobFolders(root)).map((id) => `${root}/${id}`);
	if (!runningOnly) {
		return jobs;
	}
	const states = await Promise.all(jobs.map(async (job) => (await readRecord(job))?.state));
	return jobs.filter((_job, index) => states[index] === "running");
}
async function setSubscription(job: string, route: WakeRoute, watching: boolean): Promise<void> {
	if ("pane" in route) {
		// A job has one wake pane. Watching takes it over from the pane that spawned or last watched the job; a job that
		// ended keeps its record, so the pane of an ended job stays as it was.
		const pane = watching ? route.pane : null;
		await transition(job, {
			from: ["starting", "running"],
			set: (record) => (watching || record.origin.pane === route.pane ? { origin: { ...record.origin, pane } } : {}),
		});
		return;
	}
	const marker = `${job}/notify/subscribers/${route.session}`;
	if (!watching) {
		await rm(marker, { force: true });
		return;
	}
	await mkdir(`${job}/notify/subscribers`, { recursive: true });
	await exclusiveWrite(marker, `${new Date().toISOString()}\n`);
	await exclusiveWrite(`${job}/notify/ready`, "1\n");
}
async function exclusiveWrite(path: string, content: string): Promise<void> {
	await atomicWrite(path, content, { exclusive: true }).catch((error: unknown) => {
		if (!(typeof error === "object" && error !== null && "code" in error && error.code === "EEXIST")) {
			throw error;
		}
	});
}
