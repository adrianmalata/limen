import { existsSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import type { ParseArgsOptionsConfig } from "node:util";
import { refuseRemovedFlags, removedCommand, removedFlag } from "../old-names.ts";
import { readDataset } from "../picture/dataset.ts";
import { parseFrontmatter } from "../picture/frontmatter.ts";
import { buildPicture } from "../picture/picture-build.ts";
import { servePicture } from "../picture/picture-serve.ts";
import { gitCommonDir, repoRoot } from "../project/git.ts";
import { parseFlags } from "./flags.ts";

const HELP = "limen picture build [--dir D] [--json F] [--strict]\nlimen picture serve [--port N]";
const SERVE_PORT = 4747;
const VALUE = { type: "string" } as const;
const SWITCH = { type: "boolean" } as const;
// A removed flag stays in its table and is refused right after parsing (src/old-names.ts), so it never reads as unknown.
const TABLES: Record<"build" | "serve", ParseArgsOptionsConfig> = {
	build: { dir: VALUE, out: VALUE, json: VALUE, strict: SWITCH },
	serve: { dir: VALUE, port: VALUE },
};

export async function pictureCommand(args: readonly string[], cwd: string): Promise<void> {
	const [mode, ...options] = args;
	// A removed subcommand gets its removal line before any word after it is read and before the usage below.
	const removed = removedCommand(`picture ${mode ?? ""}`);
	if (removed) {
		throw new Error(removed);
	}
	if (mode !== "build" && mode !== "serve") {
		throw new Error(HELP);
	}
	const command = `picture ${mode}`;
	const table = TABLES[mode];
	// A removed flag gives its removal line also when it lacks a value or repeats.
	const invalid = (word: string) => removedFlag(command, word) ?? `invalid picture option ${word}\n${HELP}`;
	const parsed = parseFlags(options, table, {
		unknown: invalid,
		missing: invalid,
		repeated: (flag) => (table[flag.slice(2)]?.type === "string" ? invalid(flag) : undefined),
		positionals: false,
		endOfFlags: false,
	});
	refuseRemovedFlags(command, parsed.values);
	const values = new Map<string, string>();
	for (const [name, value] of Object.entries(parsed.values)) {
		if (typeof value === "string") {
			values.set(name, value);
		}
	}
	if (mode === "serve") {
		await serve(cwd, values.get("port"));
		return;
	}
	await build(cwd, values.get("dir"), values.get("json"), parsed.values.strict === true);
}

/** Checks the map with its tickets and board: each diagnostic on stderr, the counts on stdout, no page. */
async function build(cwd: string, dir: string | undefined, json: string | undefined, strict: boolean): Promise<void> {
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
	if (strict && model.diagnostics.some((d) => d.level === "error")) {
		process.exitCode = 1;
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
		throw new Error(`invalid picture serve port ${JSON.stringify(port)}\n${HELP}`);
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
