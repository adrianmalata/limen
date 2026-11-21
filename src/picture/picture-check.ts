// `limen picture build`: the offline check of the map with its tickets and board, which writes no page; `--json`
// writes the map's model to a file, and `--strict` refuses on an error diagnostic.
import { existsSync } from "node:fs";
import { join, resolve } from "node:path";
import { type CommandText, LimenError } from "../outcome.ts";
import { gitCommonDir, repoRoot } from "../project/git.ts";
import { readDataset } from "./dataset.ts";
import { parseFrontmatter } from "./frontmatter.ts";
import { buildPicture } from "./picture-build.ts";

/** What `picture build` checks: the map's folder, the file for its model, and whether an error refuses. */
export type BuildCheck = {
	readonly dir: string | undefined;
	readonly json: string | undefined;
	readonly strict: boolean;
};

/**
 * Checks the map with its tickets and board: each diagnostic on stderr, the counts on stdout, no page. With `--strict`
 * an error diagnostic is a refusal (D-028), which `main` ends with after the diagnostics; its `next` is `again`, the
 * same check of the same folder (D-045 (5.1)).
 */
export async function checkPicture(cwd: string, check: BuildCheck, again: string, out: CommandText): Promise<void> {
	const { picture, root } = await pictureSources(cwd, check.dir);
	const model = await buildPicture(picture, check.json === undefined ? undefined : resolve(cwd, check.json), root);
	for (const d of model.diagnostics) {
		out.diagnostic(
			`${d.level} ${d.code}${d.source ? ` ${d.source}${d.line === null ? "" : `:${d.line}`}` : ""}: ${d.message}`,
		);
	}
	const wrote = check.json === undefined ? "" : `; wrote ${resolve(cwd, check.json)}`;
	out.line(`picture: ${model.nodes.length} places, ${model.edges.length} edges${wrote}`);
	const errors = model.diagnostics.filter((d) => d.level === "error").length;
	if (check.strict && errors > 0) {
		throw new LimenError({
			class: "refused",
			code: "PICTURE_INVALID",
			message: `picture build --strict: ${errors} error${errors === 1 ? "" : "s"} in the map, its tickets or its board\nfix the errors listed above`,
			next: again,
		});
	}
}

/**
 * The map folder and the checkout whose tickets and board join it. Both come from the repository that holds the map,
 * except that a checkout of that repository, a job worktree too, keeps its own tickets and board: a branch checks its
 * tickets against the project's map.
 */
async function pictureSources(cwd: string, dir: string | undefined): Promise<{ picture: string; root: string }> {
	const picture = await mapFolder(dir === undefined ? repoRoot(cwd) : resolve(cwd, dir));
	const owner = repoRoot(picture);
	const root = gitCommonDir(cwd) === gitCommonDir(owner) ? repoRoot(cwd) : owner;
	return { picture, root };
}

/** `dir` when it holds the plant file, else the `.limen/picture` below it; a folder with neither has no map. */
async function mapFolder(dir: string): Promise<string> {
	const dataset = await readDataset(dir).catch(() => undefined);
	if (dataset?.files.some((file) => parseFrontmatter(file.text).data.kind === "plant")) {
		return dir;
	}
	const nested = join(dir, ".limen", "picture");
	if (existsSync(nested)) {
		return nested;
	}
	throw new Error(`${dir} has no plant file (nodes/*.md with "kind: plant") and no map at ${nested}`);
}
