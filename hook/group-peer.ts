import { mkdir, rm, utimes } from "node:fs/promises";
import { atomicWrite } from "../src/atomic-write.ts";
import { transport } from "../src/config.ts";
import type { GroupIdentity } from "../src/job/group-cabinet.ts";
import { groupIdentity, runs } from "../src/job/group-cabinet.ts";
import { acceptBatch, acceptTransport, observeBatch, releaseBatch } from "../src/job/group-events.ts";
import { SESSION_ID } from "../src/job/job.ts";
import { repoRoot } from "../src/project/git.ts";
import { type PiApi, type PiContext, type PiPart, piContext, piEvent, recorded } from "../src/runtime/pi-api.ts";

/** Peer data stays in tool/custom messages. Never use owner steering for group delivery. */
// biome-ignore lint/complexity/noExcessiveLinesPerFunction: split pending: hook factory, handlers share its state
export default function groupPeer(pi: Pick<PiApi, "on" | "sendMessage">): void {
	let leadRoot: string | undefined;
	let leadSession: string | undefined;
	let timer: NodeJS.Timeout | undefined;
	let sweeping = false;
	const observed = new Map<string, { identity: GroupIdentity; token: string }>();
	const leased = new Map<string, { identity: GroupIdentity; token: string }>();
	const seenTokens = new Set<string>();
	const identities = async (context: Pick<PiContext, "cwd">): Promise<GroupIdentity[]> => {
		const member = await groupIdentity(context.cwd);
		if (member) {
			return [member];
		}
		if (!leadRoot || !leadSession) {
			return [];
		}
		return (await runs(leadRoot))
			.filter((run) => !run.closed && run.lead === leadSession)
			.map((run) => ({ run, recipient: `lead-${leadSession}` }));
	};
	pi.on(
		"session_start",
		recorded(async (_event: unknown, rawContext: unknown) => {
			if (transport("LIMEN_JOB") === "1") {
				return;
			}
			const context = piContext("session_start", rawContext, ["cwd", "sessionManager", "ui"]);
			try {
				leadRoot = repoRoot(context.cwd);
			} catch {
				return;
			}
			leadSession = context.sessionManager.getSessionId();
			if (!SESSION_ID.test(leadSession)) {
				return;
			}
			const registration = `${leadRoot}/.limen/group-leads/${leadSession}`;
			await mkdir(`${leadRoot}/.limen/group-leads`, { recursive: true });
			await atomicWrite(registration, `${process.pid}\n`);
			const deliver = async () => {
				for (const identity of await identities(context)) {
					if ([...leased.values()].some((entry) => entry.identity.run.id === identity.run.id)) {
						continue;
					}
					const batch = await acceptBatch(identity, Date.now(), "skip");
					if (!batch) {
						continue;
					}
					leased.set(batch.token, { identity, token: batch.token });
					try {
						// nextTurn parks idle Pi messages even with triggerTurn; followUp wakes idle leads without steering busy ones.
						pi.sendMessage(
							{ customType: "limen-group-progress", content: batch.text, display: true },
							{ deliverAs: "followUp", triggerTurn: true },
						);
						await acceptTransport(identity, batch.token);
					} catch (error) {
						await releaseBatch(identity, batch.token);
						leased.delete(batch.token);
						throw error;
					}
				}
			};
			const sweep = () => {
				if (sweeping) {
					return;
				}
				sweeping = true;
				void deliver()
					// The registration's mtime is the heartbeat that `group start` and the finish path read; only a completed sweep refreshes it.
					// A removed registration stays removed: its absence is the signal that this pane is not the lead.
					.then(() => utimes(registration, new Date(), new Date()).catch(() => {}))
					.catch((error: unknown) =>
						context.ui.notify(`group delivery requires inspection: ${String(error)}`, "warning"),
					)
					.finally(() => {
						sweeping = false;
					});
			};
			timer = setInterval(sweep, 1_000);
			timer.unref();
		}),
	);
	// Pi 1.5.1 rethrows an error of a tool_call handler and blocks the call, unlike every other event's handler. Outside a
	// group the handler reads nothing, so it can block nothing; inside a group a payload of the wrong shape makes the
	// guard throw and so blocks every tool call of the member, not only `task`.
	pi.on(
		"tool_call",
		recorded((raw: unknown) => {
			if (!transport("LIMEN_GROUP_ID")) {
				return undefined;
			}
			return piEvent("tool_call", raw).toolName === "task"
				? { block: true, reason: "group helpers must use the recorded limen worker allowance, not built-in subagents" }
				: undefined;
		}),
	);
	pi.on(
		"tool_result",
		recorded(async (raw: unknown, rawContext: unknown) => {
			const event = piEvent("tool_result", raw);
			const context = piContext("tool_result", rawContext, ["cwd"]);
			const patches: PiPart[] = [...event.content];
			for (const identity of await identities(context)) {
				const batch = await acceptBatch(identity, Date.now(), "skip");
				if (!batch) {
					continue;
				}
				leased.set(batch.token, { identity, token: batch.token });
				patches.push({ type: "text", text: batch.text });
			}
			if (patches.length !== event.content.length) {
				return { content: patches };
			}
		}),
	);
	pi.on(
		"context",
		recorded(async (raw: unknown, rawContext: unknown) => {
			const event = piEvent("context", raw);
			const current = await identities(piContext("context", rawContext, ["cwd"]));
			for (const message of event.messages) {
				if (message.role !== "toolResult" && message.role !== "custom") {
					continue;
				}
				const text =
					typeof message.content === "string"
						? message.content
						: (message.content ?? []).map((part) => part.text ?? "").join("\n");
				for (const match of text.matchAll(/\[limen-group-delivery:([a-f0-9-]+)\]/g)) {
					const token = match[1];
					if (!token || seenTokens.has(token)) {
						continue;
					}
					for (const identity of current) {
						await observeBatch(identity, token, false);
						observed.set(`${identity.run.id}:${token}`, { identity, token });
					}
					seenTokens.add(token);
				}
			}
		}),
	);
	pi.on(
		"message_end",
		// biome-ignore lint/complexity/noExcessiveCognitiveComplexity: split pending: group peer message handler
		recorded(async (raw: unknown, rawContext: unknown) => {
			const event = piEvent("message_end", raw);
			const context = piContext("message_end", rawContext, ["cwd"]);
			if (event.message.role === "toolResult" || event.message.role === "custom") {
				const text =
					typeof event.message.content === "string"
						? event.message.content
						: (event.message.content ?? []).map((part) => part.text ?? "").join("\n");
				for (const match of text.matchAll(/\[limen-group-delivery:([a-f0-9-]+)\]/g)) {
					if (match[1]) {
						for (const identity of await identities(context)) {
							await acceptTransport(identity, match[1]);
						}
					}
				}
				return;
			}
			if (event.message.role !== "assistant") {
				return;
			}
			const failed = event.message.stopReason === "error" || event.message.stopReason === "aborted";
			for (const entry of observed.values()) {
				if (failed) {
					await releaseBatch(entry.identity, entry.token);
				} else {
					await observeBatch(entry.identity, entry.token, true);
				}
				leased.delete(entry.token);
			}
			observed.clear();
		}),
	);
	pi.on(
		"session_shutdown",
		recorded(async () => {
			clearInterval(timer);
			for (const entry of leased.values()) {
				await releaseBatch(entry.identity, entry.token);
			}
			leased.clear();
			observed.clear();
			if (leadRoot && leadSession) {
				await rm(`${leadRoot}/.limen/group-leads/${leadSession}`, { force: true });
			}
		}),
	);
}
