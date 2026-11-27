import { readFileSync, unlinkSync } from "node:fs";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { exception } from "../config.ts";

export function packageRoot(): string {
	return exception("LIMEN_PACKAGE")?.trim() || fileURLToPath(new URL("../..", import.meta.url));
}

const HOOK_COPIES = [
	".pi/extensions/limen-wake.ts",
	".pi/extensions/limen-communication.ts",
	".pi/extensions/limen-steering.ts",
	".omp/extensions/limen-wake.ts",
	".omp/extensions/limen-communication.ts",
	".omp/extensions/limen-steering.ts",
] as const;

export function removeHookCopies(root: string): readonly string[] {
	const removed: string[] = [];
	for (const path of HOOK_COPIES) {
		try {
			unlinkSync(join(root, path));
			removed.push(path);
		} catch {
			// Absent is the desired state.
		}
	}
	return removed;
}

export function readOptional(path: string): string | undefined {
	try {
		return readFileSync(path, "utf8");
	} catch {
		return undefined;
	}
}
