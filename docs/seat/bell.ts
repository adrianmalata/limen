// The seat's bell: one ntfy message for each job of one project whose record is terminal and has no `notify/bell`
// yet, which it then leaves, so a run after it is a no-op. It reads the records through the record module
// (src/job/record.ts) and skips a record the migration wrote, whose Limen rang for it (D-057 (4)). Operator-owned, not
// called by limen: `limen-bell.service` starts it through `bell.sh`, which keeps the path its drop-in names.
//
//   NTFY_TOPIC=your-secret-topic node bell.ts /home/you/project
import { existsSync, realpathSync } from "node:fs";
import { mkdir } from "node:fs/promises";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { atomicWrite } from "../../src/atomic-write.ts";
import { isTerminal } from "../../src/job/job.ts";
import { jobFolders, readRecord } from "../../src/job/record.ts";

/** Sends one message; true when ntfy took it. */
export type Send = (text: string) => Promise<boolean>;

/** Rings once for each terminal record of the project at `root` without `notify/bell`; returns the messages sent. */
export async function ringBell(root: string, send: Send): Promise<string[]> {
	const jobs = join(root, ".limen", "jobs");
	const rung: string[] = [];
	for (const id of await jobFolders(jobs)) {
		const dir = join(jobs, id);
		const record = await readRecord(dir);
		if (!(record && isTerminal(record.state)) || record.migrated || existsSync(join(dir, "notify", "bell"))) {
			continue;
		}
		const text = `limen: ${record.label || id} is ${record.state} (${id})`;
		if (await send(text)) {
			await mkdir(join(dir, "notify"), { recursive: true });
			await atomicWrite(join(dir, "notify", "bell"), `${record.state}\n`);
			rung.push(text);
		}
	}
	return rung;
}

/** The ntfy topic `topic` at `url` as a sender. */
export function ntfy(url: string, topic: string): Send {
	return async (text) => (await fetch(`${url}/${topic}`, { method: "POST", body: text })).ok;
}

// The real paths, as in seat/deploy.ts: a start through a symlinked path runs the bell too.
const started = process.argv[1];
if (started !== undefined && existsSync(started) && realpathSync(started) === fileURLToPath(import.meta.url)) {
	const [root] = process.argv.slice(2);
	const topic = process.env.NTFY_TOPIC;
	if (!root || !topic) {
		throw new Error("usage: NTFY_TOPIC=<topic> [NTFY_URL=<url>] node bell.ts <project root>");
	}
	await ringBell(root, ntfy(process.env.NTFY_URL || "https://ntfy.sh", topic));
}
