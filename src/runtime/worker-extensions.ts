import { realpath, stat } from "node:fs/promises";
import { homedir } from "node:os";
import { isAbsolute, resolve } from "node:path";
import type { JobRecord } from "../job/record.ts";

/** Resolve only local paths. Pi, not Limen, interprets the selected module or package. */
export async function normalizeWorkerExtensions(paths: readonly string[], cwd: string): Promise<string[]> {
	const selected: string[] = [];
	for (const input of paths) {
		if (
			!input.trim() ||
			/[\0\r\n*?[\]]/.test(input) ||
			/^(?:[a-z][a-z0-9+.-]*:|[^/]+@[^/]+:|--)/i.test(input) ||
			(input.startsWith("~") && !input.startsWith("~/"))
		) {
			throw new Error(`extension must be a local file or directory path: ${JSON.stringify(input)}`);
		}
		const path = resolve(cwd, input.startsWith("~/") ? resolve(homedir(), input.slice(2)) : input);
		try {
			const canonical = await realpath(path);
			const info = await stat(canonical);
			if (!info.isFile() && !info.isDirectory()) {
				throw new Error("target is neither a file nor a directory");
			}
			if (!selected.includes(canonical)) {
				selected.push(canonical);
			}
		} catch (error) {
			throw new Error(`cannot use extension ${path}: ${error instanceof Error ? error.message : String(error)}`);
		}
	}
	return selected;
}

/**
 * The extensions the job's record names, resolved again; a record without them (an older job) has none. A path that
 * is not absolute must reach launch failure handling.
 */
export async function readWorkerExtensions(jobDir: string, record: JobRecord | undefined): Promise<string[]> {
	const paths = record?.extensions ?? [];
	if (!paths.every((path) => isAbsolute(path))) {
		throw new Error(`invalid extensions in the record of ${jobDir}: expected absolute local paths`);
	}
	return normalizeWorkerExtensions(paths, jobDir);
}
