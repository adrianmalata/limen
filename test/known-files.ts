// The files of a repository that git knows, for the scans of the structure, registry and configuration tests.
import { execFile } from "node:child_process";
import { existsSync } from "node:fs";
import { join, relative } from "node:path";
import { promisify } from "node:util";

const execFileAsync = promisify(execFile);

/** Folders no listing of a scan descends into. */
export const SKIPPED: ReadonlySet<string> = new Set(["node_modules", ".git", ".pi"]);

/**
 * The files of the repository at `repo` that git knows, tracked and untracked but not ignored, outside `SKIPPED`. An
 * ignored local input, such as the Pi sources in `adrian-rebuild/input/vendor/` (D-046), is not part of the tree, and
 * neither is an index entry whose file is gone from the working tree, as a plain `mv` leaves one.
 */
export async function knownFiles(repo: string): Promise<string[]> {
	const { stdout } = await execFileAsync("git", ["ls-files", "--cached", "--others", "--exclude-standard", "-z"], {
		cwd: repo,
		encoding: "utf8",
		maxBuffer: 64 * 1024 * 1024,
	});
	return stdout
		.split("\0")
		.filter((path) => path !== "" && !path.split("/").some((part) => SKIPPED.has(part)))
		.map((path) => join(repo, path))
		.filter((path) => existsSync(path));
}

/**
 * The files of `knownFiles` below one of `folders`, each a path from the root of the repository at `repo`, so that a
 * scan of those folders reads no ignored file, such as an editor's swap file (D-032).
 */
export async function knownFilesBelow(repo: string, folders: readonly string[]): Promise<string[]> {
	return (await knownFiles(repo)).filter((path) =>
		folders.some((folder) => relative(repo, path).startsWith(`${folder}/`)),
	);
}
