// The one owner of leftover files: what cut features leave in a project. `limen status` lists them and
// `limen init --drop-leftovers` removes them (A-042), so the owner checks the list before anything goes.
import { lstatSync, readFileSync, rmSync } from "node:fs";
import { join } from "node:path";
import { packageRoot, TRACKED } from "./inherit.ts";

/** A file or directory that a cut feature left in a project; `path` is relative to the project root. */
export type Leftover = { readonly path: string; readonly feature: string };

/**
 * The registry: every path a cut feature leaves behind, with the feature in plain words and the ticket that cut it,
 * e.g. the feature `finish webhooks (R-002)`. Each cut ticket appends its own entries. An entry never equals, lies
 * under or holds another entry or a `TRACKED` path (checked in `test/project/leftovers.test.ts`). First, an entry that
 * holds a tracked path would silently delete a changed copy of a template, which the drop must keep. Second, an
 * overlap lists one file twice, and the drop fails on its second removal.
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
];

/**
 * The registry entries present under `root`, plus every project copy that is byte-identical to the packaged template
 * it was copied from, sorted by path. It only reads the project and the package, never Git history. `lstat` with
 * `throwIfNoEntry: false` makes a missing path the one expected absence; any other error propagates.
 */
export function listLeftovers(root: string, registry: readonly Leftover[] = LEFTOVERS): readonly Leftover[] {
	const found = registry.filter((entry) => lstatSync(join(root, entry.path), { throwIfNoEntry: false }) !== undefined);
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
