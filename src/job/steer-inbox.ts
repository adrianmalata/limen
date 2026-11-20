import { mkdir, readdir } from "node:fs/promises";
import { atomicWrite } from "../atomic-write.ts";

/** Queue one steer for the worker's steering hook; numbers continue past every inbox, claim and delivered name. */
export async function enqueueSteer(jobDir: string, message: string): Promise<string> {
	const inbox = `${jobDir}/steer/inbox`;
	await mkdir(inbox, { recursive: true });
	for (let next = (await highest(jobDir)) + 1; next <= 9_999; next += 1) {
		const seq = String(next).padStart(4, "0");
		try {
			await atomicWrite(`${inbox}/${seq}`, `${message}\n`, { exclusive: true });
			return seq;
		} catch (error: unknown) {
			if (!isExist(error)) {
				throw error;
			}
		}
	}
	throw new Error(`steer inbox is full for ${jobDir}`);
}

async function highest(jobDir: string): Promise<number> {
	const names = await Promise.all(
		["inbox", "claims", "delivered"].map((part) => readdir(`${jobDir}/steer/${part}`).catch(() => [])),
	);
	return names.flat().reduce((max, name) => {
		const value = Number(name);
		return /^\d+$/.test(name) && value > max ? value : max;
	}, 0);
}

function isExist(error: unknown): boolean {
	return typeof error === "object" && error !== null && "code" in error && error.code === "EEXIST";
}
