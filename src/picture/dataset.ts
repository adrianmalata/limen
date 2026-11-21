import type { Stats } from "node:fs";
import { readdir, readFile, stat } from "node:fs/promises";
import { join } from "node:path";
import { environmentError, refused } from "../outcome.ts";
import { hasCode } from "../system-error.ts";
import type { Diagnostic, PictureFile } from "./picture-model.ts";

const DATA_DIRS = ["nodes", "edges", "features", "journeys"] as const;
const MAX_FILES = 10_000;

// Read only flat Markdown files; missing graph directories and unrelated paths are ignored. A map path that is no
// folder is refused (T-02, exit 1: the project's map is not what the check needs); a read the system fails is the
// environment's failure (exit 4).
export async function readDataset(dir: string): Promise<{ files: PictureFile[]; diagnostics: Diagnostic[] }> {
	let info: Stats;
	try {
		info = await stat(dir);
	} catch (error) {
		if (hasCode(error, "ENOENT")) {
			throw refused("PICTURE_NO_MAP", `picture directory ${dir} does not exist`);
		}
		throw environmentError("PICTURE_UNREADABLE", `picture directory ${dir} cannot be read: ${String(error)}`);
	}
	if (!info.isDirectory()) {
		throw refused("PICTURE_NOT_A_FOLDER", `picture directory ${dir} is not a directory`);
	}

	const diagnostics: Diagnostic[] = [];
	const sources: string[] = [];
	for (const name of DATA_DIRS) {
		const entries = await readdir(join(dir, name), { withFileTypes: true }).catch((error: NodeJS.ErrnoException) => {
			if (error.code === "ENOENT") {
				return [];
			}
			throw error;
		});
		for (const entry of entries) {
			if (entry.isFile() && entry.name.endsWith(".md")) {
				sources.push(`${name}/${entry.name}`);
			}
		}
	}
	sources.sort();
	if (sources.length > MAX_FILES) {
		diagnostics.push({
			level: "error",
			code: "read.too-many",
			message: `more than ${MAX_FILES} files; only the first ${MAX_FILES} are read`,
			source: null,
			id: null,
			line: null,
		});
	}

	const files: PictureFile[] = [];
	for (const source of sources.slice(0, MAX_FILES)) {
		files.push({ source, text: await readFile(join(dir, source), "utf8") });
	}
	return { files, diagnostics };
}
