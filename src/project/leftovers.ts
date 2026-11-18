// The one owner of leftover files: what cut features leave in a project. `limen status` lists them and
// `limen init --drop-leftovers` removes them (A-042), so the owner checks the list before anything goes.
import { lstatSync, readFileSync, rmSync, statSync } from "node:fs";
import { join } from "node:path";
import { packageRoot, TRACKED } from "./inherit.ts";

/**
 * A file or directory that a cut feature left in a project; `path` is relative to the project root. With a `marker`,
 * the entry is found only as a regular file whose text holds the marker, so a file Limen did not write is never
 * listed or dropped.
 */
export type Leftover = { readonly path: string; readonly feature: string; readonly marker?: string };

/**
 * The registry: every path a cut feature leaves behind, with the feature in plain words and the ticket that cut it,
 * e.g. the feature `finish webhooks (R-002)`. Each cut ticket appends its own entries. An entry never equals, lies
 * under or holds another entry or a `TRACKED` path (checked in `test/project/leftovers.test.ts`). First, an entry that
 * holds a tracked path would silently delete a changed copy of a template, which the drop must keep. Second, an
 * overlap lists one file twice, and the drop fails on its second removal. An entry lies outside Git's own data, except
 * a hook directly in `.git/hooks/` that Limen wrote; such an entry carries the line Limen wrote into it as its marker,
 * so the project's own hook of that name stays.
 */
export const LEFTOVERS: readonly Leftover[] = [
	// The webhook targets and their bearer tokens (A-027).
	{ path: ".limen/finish-webhook.env", feature: "finish webhooks (R-002)" },
	{ path: ".limen/outbox", feature: "finish webhooks (R-002)" },
	{ path: ".limen/webhook-rejected", feature: "finish webhooks (R-002)" },
	{ path: ".limen/coordinator-events", feature: "coordinator signals (R-002)" },
	// The mirror's config, on or parked, and the project's override of the cut templates/linear.md.
	{ path: "spec/linear.md", feature: "the Linear mirror (R-003)" },
	{ path: "spec/linear.md.off", feature: "the Linear mirror (R-003)" },
	{ path: ".agents/limen/linear.md", feature: "the Linear mirror (R-003)" },
	// The stub `limen init` copied for OMP coordinators; the folders around it may hold the project's own files.
	{ path: ".omp/extensions/limen.ts", feature: "the OMP engine (R-004)" },
	// The planning source `limen planning` stored; every project now commits its planning files, and nothing reads it.
	{ path: ".limen/planning-source", feature: "private planning (R-006)" },
	// The page `picture build` wrote beside the dataset by default; the dataset itself stays.
	{ path: ".limen/picture/map.html", feature: "the Picture viewer (R-007)" },
	// The last refresh job's id, the lock of one pass, and the log of the passes the watch hook started.
	{ path: ".limen/picture/job", feature: "the map jobs (R-007)" },
	{ path: ".limen/picture/tick.lock", feature: "the map jobs (R-007)" },
	{ path: ".limen/picture-watch.log", feature: "the map jobs (R-007)" },
	// The watch hook, written only into the primary checkout's own hooks with this line in it.
	{
		path: ".git/hooks/reference-transaction",
		feature: "the map watch (R-007)",
		marker: "# limen picture watch ",
	},
];

/**
 * The registry entries present under `root`, plus every project copy that is byte-identical to the packaged template
 * it was copied from, sorted by path. It only reads the project and the package, never Git history. `lstat` with
 * `throwIfNoEntry: false` makes a missing path the one expected absence; any other error propagates.
 */
export function listLeftovers(root: string, registry: readonly Leftover[] = LEFTOVERS): readonly Leftover[] {
	const found = registry.filter((entry) => present(root, entry));
	const packaged = packageRoot();
	for (const [path, source] of TRACKED) {
		if (identicalCopy(join(root, path), join(packaged, source))) {
			found.push({ path, feature: `identical copy of the package's ${source}` });
		}
	}
	return found.toSorted(byPath);
}

/**
 * Removes every entry `listLeftovers` finds, a directory with its content, a symlink but never its target. `dropped`
 * hears of each entry right after its removal, so a removal that fails later leaves a report of the earlier ones.
 */
export function dropLeftovers(
	root: string,
	registry: readonly Leftover[] = LEFTOVERS,
	dropped?: (entry: Leftover) => void,
): readonly Leftover[] {
	const found = listLeftovers(root, registry);
	for (const entry of found) {
		rmSync(join(root, entry.path), { recursive: true });
		dropped?.(entry);
	}
	return found;
}

/**
 * An entry without a marker is present in any form. A marked entry is present only as a regular file that holds its
 * marker. Its folders are checked first, from the root down: in a job worktree `.git` is a file, and a path below a
 * file is no entry, not an error.
 */
function present(root: string, entry: Leftover): boolean {
	const path = join(root, entry.path);
	if (entry.marker === undefined) {
		return lstatSync(path, { throwIfNoEntry: false }) !== undefined;
	}
	let folder = root;
	for (const name of entry.path.split("/").slice(0, -1)) {
		folder = join(folder, name);
		if (statSync(folder, { throwIfNoEntry: false })?.isDirectory() !== true) {
			return false;
		}
	}
	return (
		lstatSync(path, { throwIfNoEntry: false })?.isFile() === true && readFileSync(path, "utf8").includes(entry.marker)
	);
}

/**
 * Only a regular file can be a copy; a symlink or a directory at a template's path is the project's own. The package
 * ships every tracked template, so a missing one is a broken install and throws.
 */
function identicalCopy(project: string, template: string): boolean {
	return (
		lstatSync(project, { throwIfNoEntry: false })?.isFile() === true &&
		readFileSync(project).equals(readFileSync(template))
	);
}

/** Code-unit order, so the list reads the same under every locale. */
function byPath(left: Leftover, right: Leftover): number {
	return Number(left.path > right.path) - Number(left.path < right.path);
}
