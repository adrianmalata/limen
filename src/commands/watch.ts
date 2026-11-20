import { access, mkdir, readdir, readFile, rm } from "node:fs/promises";
import { atomicWrite } from "../atomic-write.ts";
import { resolveJob } from "../job/lookup.ts";
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
	const state = await text(`${named}/state`);
	const id = named.split("/").at(-1);
	if (state && state !== "running") {
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
	return (await text(`${job}/origin-pane`)) === route.pane;
}
async function jobDirectories(root: string, runningOnly: boolean): Promise<string[]> {
	const entries = await readdir(root, { withFileTypes: true }).catch(() => []);
	const jobs = entries.filter((entry) => entry.isDirectory()).map((entry) => `${root}/${entry.name}`);
	if (!runningOnly) {
		return jobs;
	}
	const states = await Promise.all(jobs.map((job) => readFile(`${job}/state`, "utf8").catch(() => "")));
	return jobs.filter((_job, index) => states[index]?.trim() === "running");
}
async function setSubscription(job: string, route: WakeRoute, watching: boolean): Promise<void> {
	if ("pane" in route) {
		// A job has one wake pane. Watching takes it over from the pane that spawned or last watched the job.
		if (watching && !(await watches(job, route))) {
			await atomicWrite(`${job}/origin-pane`, `${route.pane}\n`);
		}
		if (!watching && (await watches(job, route))) {
			await rm(`${job}/origin-pane`, { force: true });
		}
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
function text(path: string): Promise<string> {
	return readFile(path, "utf8").then(
		(value) => value.trim(),
		() => "",
	);
}
