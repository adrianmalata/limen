import { existsSync } from "node:fs";
import { join } from "node:path";
import { atomicWriteSync } from "../src/atomic-write.ts";
import { transport } from "../src/config.ts";
import { type PiApi, type PiToolOutput, piContext, piToolInput, recorded } from "../src/runtime/pi-api.ts";

/**
 * `finish` for every Limen job. The first call ends the job: its handoff becomes the job result, and the session ends
 * after this turn (A-044 cut the check before it).
 */
export default function limenFinish(pi: Pick<PiApi, "registerTool">): void {
	const root = transport("LIMEN_CONTEXT_ROOT");
	const id = transport("LIMEN_JOB_ID");
	if (transport("LIMEN_JOB") !== "1" || !root || !id) {
		return;
	}
	const jobDir = join(root, ".limen", "jobs", id);
	if (!existsSync(jobDir)) {
		return;
	}
	pi.registerTool({
		name: "finish",
		label: "Finish",
		description: "End this job. Pass the handoff text; the job is recorded done and the session exits.",
		parameters: {
			type: "object",
			properties: { handoff: { type: "string", description: "Handoff for the coordinator" } },
			required: ["handoff"],
		},
		execute: recorded(
			async (
				_toolCallId: string,
				params: unknown,
				_signal: unknown,
				_onUpdate: unknown,
				rawContext: unknown,
			): Promise<PiToolOutput> => {
				const input = piToolInput("finish", params);
				const context = piContext("tool finish", rawContext, ["shutdown"]);
				const handoff = typeof input.handoff === "string" ? input.handoff.trim() : "";
				try {
					if (handoff) {
						atomicWriteSync(join(jobDir, "result"), `${handoff}\n`);
					}
				} catch {
					// The engine's exit still ends the job; only the handoff text is lost.
				}
				context.shutdown();
				return { content: [{ type: "text", text: "done" }], details: {} };
			},
		),
	});
}
