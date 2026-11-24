import { existsSync } from "node:fs";
import { join } from "node:path";
import { transport } from "../src/config.ts";
import { recordRateLimit } from "../src/job/record.ts";
import { type PiApi, piRateLimit, RATE_LIMIT_EVENT, recorded } from "../src/runtime/pi-api.ts";

/**
 * The rate-limit event of a Limen job's engine (A-016 (1), E-9). The bridge gives a limit's structured reset time only
 * on Pi's event bus, as `kendex:rate-limit`, so this hook writes each such event into the job's record, where the
 * job's end takes its reset time for a `quota` failure over the one the provider's text names, and into the job's log,
 * which seat step 3.4 reads.
 */
export default function limenRateLimit(pi: Pick<PiApi, "events">): void {
	const root = transport("LIMEN_CONTEXT_ROOT");
	const id = transport("LIMEN_JOB_ID");
	if (transport("LIMEN_JOB") !== "1" || !root || !id) {
		return;
	}
	const jobDir = join(root, ".limen", "jobs", id);
	if (!existsSync(jobDir)) {
		return;
	}
	pi.events.on(
		RATE_LIMIT_EVENT,
		recorded(async (raw: unknown) => {
			const event = piRateLimit(raw);
			const resetAt = event.resetAtMs === undefined ? null : new Date(event.resetAtMs).toISOString();
			await recordRateLimit(jobDir, { type: event.rateLimitType ?? null, resetAt, at: new Date().toISOString() });
		}),
	);
}
