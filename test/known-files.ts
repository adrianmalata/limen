// The files of a repository that git knows, for the scans of the structure and configuration tests.
import { execFile } from "node:child_process";
import { existsSync } from "node:fs";
import { join } from "node:path";
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
