// The refusal of a Limen hook in a coordinator's session (T-32 (4)): Pi shows it only in that session's chat, so the
// process that refused writes it into its project's `.limen/refusals/<pid>-<born>.json`, `limen status` shows each
// such file, and the seat sweep removes the file of a process that is gone. The file is named by the process, since the
// context that would name the session may be the refused value; it needs no registration of the session, which went
// with the seat rules, its one reader (R-102, D-097 (6) (b)).
import { type Dirent, existsSync } from "node:fs";
import { lstat, mkdir, readdir, rm } from "node:fs/promises";
import { basename, dirname, join, resolve } from "node:path";
import { atomicWrite, TEMPORARY_NAME } from "../atomic-write.ts";
import { refusedValue } from "../boundary.ts";
import { type Refusal, readRefusalFile, refusalDetail } from "../job/record.ts";
import { LimenError } from "../outcome.ts";
import { platform } from "../platform/platform.ts";
import { hasCode } from "../system-error.ts";

/** A refusal file's name: the pid and the start time of the process that wrote it. */
const REFUSAL_NAME = /^(\d+)-(\d+)\.json$/;
/** The name a refusal file has, as a BAD_DATA message says it expected one. */
const EXPECTED_NAME = "a name <pid>-<start time>.json";

/** The project's folder of the refusal files of its coordinator processes. */
const refusalsFolder = (root: string) => join(root, ".limen", "refusals");

/** The project of a coordinator's session that runs in `cwd`: the nearest folder up that holds `.agents/limen`. */
export function coordinatorProject(cwd: string): string | undefined {
	let dir = resolve(cwd);
	for (;;) {
		if (existsSync(join(dir, ".agents", "limen"))) {
			return dir;
		}
		const parent = dirname(dir);
		if (parent === dir) {
			return undefined;
		}
		dir = parent;
	}
}

/**
 * Writes `refusal`, a Limen hook's refusal of a Pi value in this coordinator's session, atomically as the newest one of
 * this process in the project of `cwd` (T-32 (4)): its pid and its start time name the file, so a later process that
 * reuses the pid writes a file of its own (A-058). A process whose start time cannot be read writes none, and Pi's
 * message in its chat is the one trace; so does one outside a project.
 */
export async function writeCoordinatorRefusal(cwd: string, refusal: Refusal): Promise<void> {
	const root = coordinatorProject(cwd);
	if (!root) {
		return;
	}
	const own = await platform.processInfo(process.pid);
	if (own.kind !== "present") {
		return;
	}
	await mkdir(refusalsFolder(root), { recursive: true });
	await atomicWrite(
		join(refusalsFolder(root), `${process.pid}-${own.process.born}.json`),
		`${JSON.stringify(refusal)}\n`,
	);
}

/**
 * The sweep's step (R-102): removes the refusal file of every process that is gone, as the sweep's liveness checks read
 * it: no process of that pid, or one with another start time. A process the system says nothing of keeps its file. It
 * takes regular files only, so a directory, a link and a name that is no refusal file's stay for `limen status` to name
 * (R-102 review round 1, finding 2); a `.limen/refusals` that is no folder or cannot be read fails the step.
 */
export async function removeDeadRefusals(root: string): Promise<void> {
	for (const entry of await refusalEntries(root)) {
		const [, pid = "", born = ""] = REFUSAL_NAME.exec(entry.name) ?? [];
		if (!entry.isFile() || pid === "") {
			continue;
		}
		const outcome = await platform.processInfo(Number(pid));
		if (outcome.kind === "absent" || (outcome.kind === "present" && outcome.process.born !== born)) {
			await rm(join(refusalsFolder(root), entry.name), { force: true });
		}
	}
}

/**
 * A coordinator process's newest refusal of a Limen hook, as `limen status` shows it: the process's pid, `unknown` for
 * a file whose name names none and for a folder that does not read, when, and what was refused; a file that does not
 * read gives its BAD_DATA message.
 */
export type ProcessRefusal = { readonly pid: string; readonly at: string | null; readonly detail: string };

/**
 * The refusal of each file of the project's `.limen/refusals/` at `root`, by name; a temp of a write in progress is
 * skipped. It reads and writes nothing else (T-04). A file that does not read, a directory, a link, an unreadable or a
 * damaged file, or one whose name is no refusal file's, gives its BAD_DATA message, so the rest of `limen status`
 * prints (R-029 review round 3, note (2)); so does a `.limen/refusals` that is no folder or cannot be read, as the one
 * entry, its pid `unknown` (R-102 review round 1, finding 3).
 */
export async function coordinatorRefusals(root: string): Promise<ProcessRefusal[]> {
	let entries: Dirent[];
	try {
		entries = await refusalEntries(root);
	} catch (error) {
		const detail = typedRefusal(refusalsFolder(root), error, "a folder Limen can read").message;
		return [{ pid: "unknown", at: null, detail }];
	}
	const found: ProcessRefusal[] = [];
	for (const name of entries.map((entry) => entry.name).sort()) {
		if (TEMPORARY_NAME.test(name)) {
			continue;
		}
		const pid = REFUSAL_NAME.exec(name)?.[1] ?? "unknown";
		const refusal = await refusalIn(join(refusalsFolder(root), name), pid !== "unknown");
		if (refusal === undefined) {
			continue;
		}
		found.push(
			refusal instanceof LimenError
				? { pid, at: null, detail: refusal.message }
				: { pid, at: refusal.at, detail: refusalDetail(refusal) },
		);
	}
	return found;
}

/**
 * The refusal in the file `path`, undefined once it is gone, or the BAD_DATA error of a file that does not read: one
 * whose name is no refusal file's (`named` false), one the record's read rule refuses, or one the system cannot read.
 */
async function refusalIn(path: string, named: boolean): Promise<Refusal | LimenError | undefined> {
	if (!named) {
		return refusedValue(path, { field: "", expected: EXPECTED_NAME, got: basename(path) });
	}
	try {
		return await readRefusalFile(path);
	} catch (error) {
		return typedRefusal(path, error, "a file Limen can read");
	}
}

/**
 * `error`, a failure to read `path`, as the BAD_DATA error `limen status` shows: a typed error as it is, and any other,
 * such as `EACCES` or `EIO`, as the expectation `expected` and the system's message.
 */
function typedRefusal(path: string, error: unknown, expected: string): LimenError {
	if (error instanceof LimenError) {
		return error;
	}
	const got = error instanceof Error ? error.message : String(error);
	return refusedValue(path, { field: "", expected, got });
}

/**
 * The entries of the project's `.limen/refusals/` at `root`, none when it does not exist. A link or a file of another
 * kind in its place is BAD_DATA, so no reader follows it out of the project, and any other failure to read it goes on.
 */
async function refusalEntries(root: string): Promise<Dirent[]> {
	const folder = refusalsFolder(root);
	try {
		const info = await lstat(folder);
		if (!info.isDirectory()) {
			const got = info.isSymbolicLink() ? "a symbolic link" : "another kind of file";
			throw refusedValue(folder, { field: "", expected: "a folder", got });
		}
		return await readdir(folder, { withFileTypes: true });
	} catch (error) {
		if (hasCode(error, "ENOENT")) {
			return [];
		}
		throw error;
	}
}
