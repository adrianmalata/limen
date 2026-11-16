/**
 * Hands a Limen coordinator's work to a fresh pi session when its context passes a limit.
 *
 * 1. After each settled turn at or above LIMIT_PCT of the context window, the next turn gets one
 *    hidden reminder: at the next clean point, write the handoff note and the request file.
 * 2. When a turn settles and `.limen/coordinator-handoff.request` is newer than the start of this
 *    session, the extension runs /coordinator-handoff. The command archives
 *    `.limen/coordinator-handoff.md`, opens a new session in the same pane, and sends it the note
 *    as its first message.
 *
 * Running jobs follow the new session without help: on session_start the Limen wake hook
 * subscribes the session to every running job whose origin-tab is this Herdr tab
 * (/opt/limen/hook/wake.ts). The first message still tells the new session to run `limen status`
 * and `limen watch`, because a job can end while the sessions change.
 *
 * Only coordinator sessions take part: LIMEN_COORDINATOR=1, and not LIMEN_JOB=1.
 */

import { existsSync, mkdirSync, readFileSync, renameSync, statSync, unlinkSync } from "node:fs";
import { dirname, join } from "node:path";
import type { ExtensionAPI } from "@earendil-works/pi-coding-agent";

/** The limit the owner set on 2026-11-10: restart at about 30-40% of the context window. */
const LIMIT_PCT = Number(process.env.COORDINATOR_HANDOFF_LIMIT_PCT ?? "30");
const NOTE = "coordinator-handoff.md";
const REQUEST = "coordinator-handoff.request";

/** The nearest directory at or above `cwd` that holds `.limen`. */
function limenRoot(cwd: string): string | undefined {
	for (let dir = cwd; ; dir = dirname(dir)) {
		if (existsSync(join(dir, ".limen"))) return dir;
		if (dirname(dir) === dir) return undefined;
	}
}

function reminder(percent: number, root: string): string {
	return [
		`Context is at ${Math.round(percent)}% of the window, past the handoff limit of ${LIMIT_PCT}%.`,
		"At the next clean point (board and tickets true, no edit half done), hand the work to a fresh session:",
		`1. Write ${join(root, ".limen", NOTE)}: what is finished, what runs and which job has it,` +
			" what waits on the owner, every decision the owner gave in conversation that no file holds yet," +
			" and the next step.",
		`2. Then create ${join(root, ".limen", REQUEST)} (any content).`,
		"3. Tell the owner in one line that the work moves to a new session, and end the turn.",
		"The switch happens when the turn ends. Jobs started from this tab follow the new session.",
	].join("\n");
}

function kickoff(note: string, oldSession: string | undefined, archived: string): string {
	return [
		"You are the Limen coordinator of this project. You take over from the previous coordinator session" +
			(oldSession ? ` (${oldSession})` : "") +
			", because its context passed the handoff limit.",
		`Its handoff note follows. It is archived at ${archived}.`,
		"",
		"Before anything else:",
		"1. Run `limen status`.",
		"2. Run `limen watch <id>` for each running job that it lists.",
		"3. Inspect each candidate that it lists.",
		"Then continue with the next step of the note. Tell the owner in one short message that you took over, and what runs now.",
		"",
		"--- handoff note ---",
		note.trim(),
	].join("\n");
}

export default function (pi: ExtensionAPI) {
	if (process.env.LIMEN_COORDINATOR !== "1" || process.env.LIMEN_JOB === "1") return;

	let sessionStartedAt = Date.now();
	let reminded = false;

	pi.on("session_start", () => {
		sessionStartedAt = Date.now();
		reminded = false;
	});

	pi.on("agent_settled", (_event, ctx) => {
		const root = limenRoot(ctx.cwd);
		if (!root) return;

		const request = join(root, ".limen", REQUEST);
		if (existsSync(request) && statSync(request).mtimeMs >= sessionStartedAt) {
			unlinkSync(request);
			pi.sendUserMessage("/coordinator-handoff", { expandPromptTemplates: true });
			return;
		}

		const percent = ctx.getContextUsage()?.percent;
		if (!reminded && percent != null && percent >= LIMIT_PCT) {
			reminded = true;
			pi.sendMessage(
				{ customType: "coordinator-handoff", content: reminder(percent, root), display: false },
				{ deliverAs: "nextTurn" },
			);
		}
	});

	pi.registerCommand("coordinator-handoff", {
		description: "Hand the coordinator's work to a fresh session, with .limen/coordinator-handoff.md as its first message",
		handler: async (_args, ctx) => {
			const root = limenRoot(ctx.cwd);
			const notePath = root ? join(root, ".limen", NOTE) : undefined;
			if (!root || !notePath || !existsSync(notePath)) {
				ctx.ui.notify(`coordinator-handoff: no handoff note at .limen/${NOTE}`, "error");
				return;
			}
			await ctx.waitForIdle();

			const note = readFileSync(notePath, "utf8");
			const oldSession = ctx.sessionManager.getSessionFile();
			const archived = join(root, ".limen", "handoffs", `${new Date().toISOString().replace(/[:.]/g, "-")}.md`);
			mkdirSync(dirname(archived), { recursive: true });
			renameSync(notePath, archived);

			const first = kickoff(note, oldSession, archived);
			const result = await ctx.newSession({
				parentSession: oldSession,
				withSession: async (fresh) => {
					await fresh.sendUserMessage(first);
				},
			});
			if (result.cancelled) {
				// The note goes back, so that the next request can use it.
				renameSync(archived, notePath);
				ctx.ui.notify("coordinator-handoff: an extension cancelled the new session", "error");
			}
		},
	});
}
