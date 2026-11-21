import { setTimeout as delay } from "node:timers/promises";
import { transport } from "../config.ts";
import type { GroupIdentity } from "../job/group-cabinet.ts";
import { readRun } from "../job/group-cabinet.ts";
import { selectedGroup } from "../job/group-control.ts";
import { acceptBatch, acceptTransport } from "../job/group-events.ts";
import { parseDuration } from "../job/job.ts";
import { type CommandText, LimenError, type Success } from "../outcome.ts";
import { limenCommand, type Parsed } from "../parser.ts";

const WAIT_CAP_MS = 20_000;

/**
 * A wait that ended at its time limit, with the text line that says so. A member waits again while its work is live,
 * so this is a success whose `next` is the same call (D-046 (5)), not a failure.
 */
export type LimitPassed = { readonly limitPassed: string };
/** Waits for the next batch of the group's events, as its text; past `requestedMs` (at most the cap) the limit passed. */
export async function waitGroup(
	identity: GroupIdentity,
	requestedMs = WAIT_CAP_MS,
	signal?: AbortSignal,
): Promise<string | LimitPassed> {
	const until = Date.now() + Math.max(0, Math.min(WAIT_CAP_MS, requestedMs));
	while (true) {
		signal?.throwIfAborted();
		const run = await readRun(identity.run.root, identity.run.id);
		if (run.stopped || run.closed) {
			return "group stopped or closed; preserve work and return to the lead";
		}
		if (Date.now() >= (identity.member?.deadline ?? run.deadline)) {
			return "group member deadline expired";
		}
		const batch = await acceptBatch(identity, Date.now(), "skip");
		if (batch) {
			return batch.text;
		}
		if (Date.now() >= until) {
			return {
				limitPassed: "group wait timed out; re-enter bounded wait while your collaboration or children remain live",
			};
		}
		await delay(Math.min(100, until - Date.now()));
	}
}
/**
 * Runs `operation` under a bound (D-028): past `boundMs` the limit passed, so `main` prints the one final line, and
 * the signal aborts, so the operation prints nothing after it and accepts no delivery.
 */
export async function waitCapped<T>(
	boundMs: number,
	operation: (signal: AbortSignal) => Promise<T>,
): Promise<T | LimitPassed> {
	const cap = new AbortController();
	const { promise: capped, resolve } = Promise.withResolvers<LimitPassed>();
	const timer = setTimeout(() => {
		cap.abort();
		resolve({
			limitPassed: `group wait timed out after the ${boundMs / 1000}-second CLI cap; inspect any uncertain delivery receipt before retrying`,
		});
	}, boundMs);
	try {
		return await Promise.race([operation(cap.signal), capped]);
	} finally {
		clearTimeout(timer);
	}
}
/**
 * `limen group wait` (internal, D-042): a team member with a worker allowance is itself a job whose work ends with its
 * turn, so it keeps the turn open here while its workers run. The lead gets the group's result once, as a group event,
 * and never waits. The check reads the job's environment (`LIMEN_GROUP_ID`): a guard against mistakes, not a security
 * boundary, since a member's own shell sets that environment (A-029). The wait is bounded even if a group lock or a
 * file system operation stalls: by `capMs`, the CLI cap, which a test sets lower so that it need not wait 20 s. It
 * prints the batch itself, before it acknowledges the batch's transport, so a wait that dies between the two delivers
 * the batch again; the wrapper would print it only after the acknowledgement.
 */
export async function groupWaitCommand(
	values: Parsed,
	cwd: string,
	_out?: CommandText,
	capMs = WAIT_CAP_MS,
): Promise<Success | undefined> {
	if (!transport("LIMEN_GROUP_ID")) {
		const group = values.get("group");
		throw new LimenError({
			class: "refused",
			code: "GROUP_WAIT_MEMBERS_ONLY",
			message:
				"group wait is for team members, which keep their turn open while their workers run; the lead gets the group's result once, when the group ends",
			next: limenCommand("group status", { positionals: group === undefined ? [] : [group] }),
		});
	}
	const ended = await waitCapped(capMs, async (signal) => {
		const { identity, word } = await selectedGroup(values.get("group"), cwd);
		if (word !== undefined) {
			throw new Error("invalid group wait arguments; run limen group wait --timeout 5s");
		}
		return printGroupWait(identity, values.get("timeout"), signal);
	});
	// The call as it was made, from its own words: the raw --timeout, not the duration it parsed to.
	return ended === undefined ? undefined : { next: values.commandLine(), text: ended.limitPassed };
}
/** Prints the batch the wait got and acknowledges its transport; a wait whose limit passed prints nothing here. */
async function printGroupWait(
	identity: GroupIdentity,
	timeout: string | undefined,
	signal?: AbortSignal,
): Promise<LimitPassed | undefined> {
	const output = await waitGroup(identity, timeout ? parseDuration(timeout) : WAIT_CAP_MS, signal);
	// Past the cap, `main` has printed the final line: the batch is not printed, and its transport is not acknowledged.
	signal?.throwIfAborted();
	if (typeof output !== "string") {
		return output;
	}
	console.log(output);
	const token = /\[limen-group-delivery:([a-f0-9-]+)\]/.exec(output)?.[1];
	if (token) {
		await acceptTransport(identity, token);
	}
}
