import { realpath, stat } from "node:fs/promises";
import { homedir } from "node:os";
import { isAbsolute, resolve } from "node:path";
import type { JobRecord } from "../job/record.ts";
import { refused, usageError } from "../outcome.ts";

/**
 * Resolve only local paths. Pi, not Limen, interprets the selected module or package. `source` says where the paths
 * come from: the command line, whose bad path is a usage error (exit 2), or a record (a group's run, a parent job), whose
 * path that no longer holds is a refusal (exit 1), since the command itself was well formed (T-02).
 */
export async function normalizeWorkerExtensions(
	paths: readonly string[],
	cwd: string,
	source: "argument" | "record" = "argument",
): Promise<string[]> {
	const bad = (code: string, message: string) =>
		source === "argument" ? usageError("BAD_EXTENSION", message) : refused(code, message);
	const selected: string[] = [];
	for (const input of paths) {
		if (
			!input.trim() ||
			/[\0\r\n*?[\]]/.test(input) ||
			/^(?:[a-z][a-z0-9+.-]*:|[^/]+@[^/]+:|--)/i.test(input) ||
			(input.startsWith("~") && !input.startsWith("~/"))
		) {
			throw bad("RECORD_EXTENSIONS", `extension must be a local file or directory path: ${JSON.stringify(input)}`);
		}
		const path = resolve(cwd, input.startsWith("~/") ? resolve(homedir(), input.slice(2)) : input);
		let canonical: string;
		let kind: "file or folder" | "other";
		try {
			canonical = await realpath(path);
			const info = await stat(canonical);
			kind = info.isFile() || info.isDirectory() ? "file or folder" : "other";
		} catch (error) {
			const reason = error instanceof Error ? error.message : String(error);
			throw bad("EXTENSION_GONE", `cannot use extension ${path}: ${reason}`);
		}
		if (kind === "other") {
			throw bad("EXTENSION_GONE", `cannot use extension ${path}: target is neither a file nor a directory`);
		}
		if (!selected.includes(canonical)) {
			selected.push(canonical);
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
		throw refused("RECORD_EXTENSIONS", `invalid extensions in the record of ${jobDir}: expected absolute local paths`);
	}
	return normalizeWorkerExtensions(paths, jobDir, "record");
}
