import type { Success } from "../outcome.ts";
import { queueReport } from "../runtime/start-queue.ts";

/** `limen seat queue`: the seat's start queue in start order, and the current reading against the gate. */
export async function seatQueueCommand(): Promise<Success> {
	return { next: null, text: await queueReport() };
}
