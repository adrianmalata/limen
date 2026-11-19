import { queueReport } from "../runtime/start-queue.ts";

/** `limen seat queue`: the seat's start queue in start order, and the current reading against the gate. */
export async function seatQueueCommand(): Promise<undefined> {
	console.log(await queueReport());
}
