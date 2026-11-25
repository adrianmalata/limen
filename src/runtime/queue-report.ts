// The report of `limen seat queue` (T-04): the start gate, the current reading, and every waiting job in start order.
// It reads the seat's queue and writes nothing: a dead or malformed entry stays where it is, and the seat sweep removes
// it (src/runtime/sweeping.ts). Its module holds no write of the queue, which the waiting wrappers own
// (src/runtime/start-queue.ts).
import { formatDuration } from "../job/job.ts";
import {
	GATE_FILE,
	gateOpen,
	ignoredText,
	queueEntries,
	readingText,
	readLoad,
	settleLeft,
	startGate,
} from "./start-queue.ts";

/** `limen seat queue`: the gate, the current reading, and every waiting job in start order. */
export async function queueReport(): Promise<string> {
	const { gate, ignored } = startGate();
	const lines: string[] = [];
	if (ignored.length > 0) {
		lines.push(`start gate: ignored ${ignoredText(ignored)}`);
	}
	if (gate) {
		const reading = await readLoad();
		const settling = await settleLeft(gate);
		const state = !gateOpen(reading, gate) ? "closed" : settling > 0 ? `settling ${formatDuration(settling)}` : "open";
		lines.push(`start gate ${state}: ${readingText(reading, gate)}; settle ${formatDuration(gate.settleMs)}`);
	} else {
		lines.push(`start gate off (${GATE_FILE} is "off"): detached jobs start at once`);
	}
	const entries = await queueEntries();
	if (entries.length === 0) {
		lines.push("queue empty");
	}
	entries.forEach((entry, index) => {
		const wait = formatDuration(Date.now() - entry.queuedAt);
		lines.push(`${index + 1}. ${entry.id} · priority ${entry.priority} · waiting ${wait} · ${entry.label}`);
		lines.push(`   ${entry.jobDir}`);
	});
	return lines.join("\n");
}
