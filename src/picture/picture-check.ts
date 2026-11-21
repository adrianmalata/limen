// `limen picture build`: the offline check of the map with its tickets and board, which writes no page; `--json`
// writes the map's model to a file, and `--strict` refuses on an error diagnostic. It is an operation of T-38
// (src/operation.ts): its validate reads the map and makes the refusal, so a refused build writes nothing, the
// `--json` file included (D-061); its apply writes that one file atomically, with no fact to read again.
import { existsSync, statSync } from "node:fs";
import { join, resolve } from "node:path";
import { runOperation } from "../operation.ts";
import { type CommandText, refused } from "../outcome.ts";
import { gitCommonDir, repoRoot } from "../project/git.ts";
import { readDataset } from "./dataset.ts";
import { parseFrontmatter } from "./frontmatter.ts";
import { readPicture, writePictureModel } from "./picture-build.ts";
import type { PictureModel } from "./picture-model.ts";

/** What `picture build` checks: the map's folder, the file for its model, and whether an error refuses. */
export type BuildCheck = {
	readonly dir: string | undefined;
	readonly json: string | undefined;
	readonly strict: boolean;
};

/**
 * Checks the map with its tickets and board: each diagnostic on stderr, the counts on stdout, no page. With `--strict`
 * an error diagnostic is a refusal (D-028), which `main` ends with after the diagnostics; its `next` is `again`, the
 * same check of the same folder (D-045 (5.1)). Only a build that is not refused writes `--json`.
 */
export async function checkPicture(cwd: string, check: BuildCheck, again: string, out: CommandText): Promise<void> {
	const json = check.json === undefined ? undefined : resolve(cwd, check.json);
	await runOperation({
		validate: async () => {
			const { picture, root } = await pictureSources(cwd, check.dir);
			const model = await readPicture(picture, root);
			for (const d of model.diagnostics) {
				out.diagnostic(
					`${d.level} ${d.code}${d.source ? ` ${d.source}${d.line === null ? "" : `:${d.line}`}` : ""}: ${d.message}`,
				);
			}
			const errors = model.diagnostics.filter((d) => d.level === "error").length;
			if (check.strict && errors > 0) {
				out.line(counts(model, undefined));
				return refused(
					"PICTURE_INVALID",
					`picture build --strict: ${errors} error${errors === 1 ? "" : "s"} in the map, its tickets or its board\nfix the errors listed above`,
					again,
				);
			}
			return model;
		},
		apply: async (model) => {
			if (json !== undefined) {
				await writePictureModel(json, model);
			}
			out.line(counts(model, json));
		},
	});
}

/** The line of the counts, with the file `--json` wrote when it wrote one. */
function counts(model: PictureModel, wrote: string | undefined): string {
	return `picture: ${model.nodes.length} places, ${model.edges.length} edges${wrote === undefined ? "" : `; wrote ${wrote}`}`;
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
		if (!statSync(nested).isDirectory()) {
			throw refused("PICTURE_NOT_A_FOLDER", `${nested} is not a folder, so it holds no map`);
		}
		return nested;
	}
	throw refused("PICTURE_NO_MAP", `${dir} has no plant file (nodes/*.md with "kind: plant") and no map at ${nested}`);
}
