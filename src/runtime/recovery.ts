import { randomUUID } from "node:crypto";
import { mkdir, readdir, rm, rmdir } from "node:fs/promises";
import { atomicRename, atomicWrite } from "../atomic-write.ts";
import { textFile } from "../job/record.ts";
import { platform } from "../platform/platform.ts";

/** A populated directory is published atomically. Retire only the observed unique entry:
 * competing stale-claim removers cannot unlink a replacement owner's entry. */
// biome-ignore lint/complexity/noExcessiveCognitiveComplexity: split pending: job recovery claim
export async function claimRecovery(jobDir: string): Promise<(() => Promise<void>) | undefined> {
	const claim = `${jobDir}/recovery`;
	const entry = `${process.pid}.${Date.now()}.${randomUUID()}`;
	const prepared = `${claim}.${entry}`;
	await mkdir(prepared);
	const identity = await platform.processInfo(process.pid);
	await atomicWrite(`${prepared}/${entry}`, identity.kind === "present" ? identity.process.born : "");
	try {
		for (let attempt = 0; attempt < 2; attempt++) {
			try {
				await atomicRename(prepared, claim);
				return async () => {
					await rm(`${claim}/${entry}`, { force: true });
					await rmdir(claim).catch(() => {});
				};
			} catch (error) {
				if (!(error instanceof Error && "code" in error && ["EEXIST", "ENOTEMPTY"].includes(String(error.code)))) {
					throw error;
				}
			}
			for (const name of await readdir(claim).catch(() => [] as string[])) {
				const [rawPid, rawTime] = name.split(".");
				const pid = Number(rawPid),
					time = Number(rawTime);
				const validPid = Number.isSafeInteger(pid) && pid > 0;
				if (validPid && platform.processAlive(pid)) {
					const born = await textFile(`${claim}/${name}`);
					const info = born ? await platform.processInfo(pid) : undefined;
					if (!info || info.kind === "unavailable" || (info.kind === "present" && info.process.born === born)) {
						return;
					}
				} else if (!validPid && Number.isFinite(time) && Date.now() - time < 5_000) {
					return;
				}
				await rm(`${claim}/${name}`, { force: true });
			}
			await rmdir(claim).catch(() => {});
		}
	} finally {
		await rm(prepared, { recursive: true, force: true });
	}
}
