import { existsSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { LimenError } from "../outcome.ts";
import type { Parsed } from "../parser.ts";
import { readDataset } from "../picture/dataset.ts";
import { parseFrontmatter } from "../picture/frontmatter.ts";
import { buildPicture } from "../picture/picture-build.ts";
import { servePicture } from "../picture/picture-serve.ts";
import { gitCommonDir, repoRoot } from "../project/git.ts";

const SERVE_PORT = 4747;

/** `limen picture build`: the offline check of the map with its tickets and board. */
export async function pictureBuildCommand(values: Parsed, cwd: string): Promise<undefined> {
	const check = { dir: values.get("dir"), json: values.get("json"), strict: values.has("strict") };
	await build(cwd, check, values.commandLine(["dir", "strict"]));
}
/** `limen picture serve`: this project's job activity on 127.0.0.1. */
export async function pictureServeCommand(values: Parsed, cwd: string): Promise<undefined> {
	await serve(cwd, values.get("port"));
}

/** What `picture build` checks: the map's folder, the file for its model, and whether an error refuses. */
type BuildCheck = { readonly dir: string | undefined; readonly json: string | undefined; readonly strict: boolean };

/**
 * Checks the map with its tickets and board: each diagnostic on stderr, the counts on stdout, no page. With `--strict`
 * an error diagnostic is a refusal (D-028), which `main` ends with after the diagnostics; its `next` is `again`, the
 * same check of the same folder (D-045 (5.1)).
 */
async function build(cwd: string, { dir, json, strict }: BuildCheck, again: string): Promise<void> {
	const { picture, root } = await pictureSources(cwd, dir);
	const out = json === undefined ? undefined : resolve(cwd, json);
	const model = await buildPicture(picture, out, root);
	for (const d of model.diagnostics) {
		console.error(
			`${d.level} ${d.code}${d.source ? ` ${d.source}${d.line === null ? "" : `:${d.line}`}` : ""}: ${d.message}`,
		);
	}
	const wrote = out === undefined ? "" : `; wrote ${out}`;
	console.log(`picture: ${model.nodes.length} places, ${model.edges.length} edges${wrote}`);
	const errors = model.diagnostics.filter((d) => d.level === "error").length;
	if (strict && errors > 0) {
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

async function serve(cwd: string, port = String(SERVE_PORT)): Promise<void> {
	if (!/^\d{1,5}$/.test(port) || Number(port) > 65_535) {
		throw new Error(`invalid picture serve port ${JSON.stringify(port)}; give a number from 0 to 65535`);
	}
	const served = await servePicture({ jobsRoot: primaryJobs(cwd), port: Number(port) });
	console.log(`picture: serving ${served.url}activity.json and /events; Ctrl-C stops`);
}

/**
 * The `.limen/jobs` of the primary checkout of the repository at `cwd`, so a job worktree serves the same jobs as the
 * primary checkout. `repoRoot` gives its own error outside a repository; inside one, Git always names the shared folder.
 */
function primaryJobs(cwd: string): string {
	const common = gitCommonDir(repoRoot(cwd));
	if (common === undefined) {
		throw new Error(`git rev-parse --git-common-dir failed in ${cwd}`);
	}
	return join(dirname(common), ".limen", "jobs");
}
