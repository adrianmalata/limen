// The setup of a project (`limen init`), of a workspace outside Git (`limen workspace init`), and the drop of the files
// Limen no longer reads (`limen init --drop-leftovers`). The system requirements come first (T-12 (2)), so a missing
// tool refuses before anything is written. Each file it writes, keeps or removes is a line in `out`.
import { access, appendFile, mkdir, readFile } from "node:fs/promises";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { atomicWrite } from "../atomic-write.ts";
import type { CommandText } from "../outcome.ts";
import { checkRequirements } from "../platform/requirements.ts";
import { hasCommit, isGitRepository, NO_COMMIT, repoRoot, workspaceRoot } from "./git.ts";
import { removeHookCopies } from "./inherit.ts";
import { dropLeftovers, LEFTOVERS } from "./leftovers.ts";
import { registerProject } from "./seat.ts";

const ROOT = fileURLToPath(new URL("../..", import.meta.url));

/** `limen init`: sets up the project at `cwd`, or with `drop` removes the files Limen no longer reads. */
export async function initProject(cwd: string, drop: boolean, out: CommandText): Promise<void> {
	checkRequirements();
	if (drop) {
		const root = workspaceRoot(cwd) ?? (isGitRepository(cwd) ? repoRoot(cwd) : undefined);
		if (!root) {
			throw new Error("init --drop-leftovers requires a Limen project or workspace");
		}
		for (const path of removeHookCopies(root)) {
			out.line(`removed ${path}`);
		}
		const dropped = dropLeftovers(root, LEFTOVERS, (entry) => out.line(`dropped ${entry.path} (${entry.feature})`));
		if (!dropped.length) {
			out.line("no leftover files");
		}
		return;
	}
	if (!isGitRepository(cwd)) {
		throw new Error(
			"init requires a Git repository; run 'git init' first, or use 'limen workspace init' for a non-Git workspace",
		);
	}
	const root = repoRoot(cwd);
	for (const legacy of [
		".control",
		".agents/control",
		".pi/extensions/control-wake.ts",
		".pi/extensions/control-communication.ts",
	]) {
		if (await pathExists(`${root}/${legacy}`)) {
			throw new Error(`legacy ${legacy} exists; leftover Control path — rename or remove it by hand`);
		}
	}
	await initialize(root, true, out);
	if (!hasCommit(root)) {
		out.line(NO_COMMIT);
	}
	out.line(
		"next: write spec/vision.md and .agents/limen/styleguide.md, commit, then open a coordinator in this folder (docs/setup.md)",
	);
}
/** `limen workspace init`: sets up a folder outside Git whose child repositories its jobs work in; tools come first. */
export async function initWorkspace(cwd: string, out: CommandText): Promise<void> {
	checkRequirements();
	if (isGitRepository(cwd)) {
		throw new Error("workspace init requires a non-Git parent directory");
	}
	await initialize(resolve(cwd), false, out);
}
async function initialize(root: string, repository: boolean, out: CommandText): Promise<void> {
	const copies = [
		[`${ROOT}/templates/styleguide.md`, `${root}/.agents/limen/styleguide.md`],
		[`${ROOT}/templates/spec/vision.md`, `${root}/spec/vision.md`],
		[`${ROOT}/templates/spec/build.md`, `${root}/spec/build.md`],
		...(repository ? [] : ([[`${ROOT}/templates/spec/workspace.md`, `${root}/spec/workspace.md`]] as const)),
		[`${ROOT}/templates/spec/features/_template/ticket.md`, `${root}/spec/features/_template/ticket.md`],
		[`${ROOT}/templates/spec/features/_template/outcome.md`, `${root}/spec/features/_template/outcome.md`],
		...(["planned", "active", "done", "dropped"] as const).map(
			(lane) => [`${ROOT}/templates/spec/features/${lane}/.gitkeep`, `${root}/spec/features/${lane}/.gitkeep`] as const,
		),
		[`${ROOT}/templates/limen-extension.ts`, `${root}/.pi/extensions/limen.ts`],
	] as const;
	for (const [source, target] of copies) {
		await mkdir(dirname(target), { recursive: true });
		const exists = await pathExists(target);
		if (!exists) {
			await atomicWrite(target, await readFile(source), { exclusive: true });
		}
		out.line(`${exists ? "kept" : "created"} ${target.slice(root.length + 1)}`);
	}
	for (const path of removeHookCopies(root)) {
		out.line(`removed ${path}`);
	}
	await mkdir(`${root}/.limen/jobs`, { recursive: true });
	await registerProject(root);
	if (repository) {
		await ensureIgnored(`${root}/.gitignore`);
	}
	out.line("ready .limen/jobs");
}
async function ensureIgnored(path: string): Promise<void> {
	const exists = await pathExists(path);
	const content = exists ? await readFile(path, "utf8") : "";
	const relevant = content
		.split(/\r?\n/)
		.map((line) => line.trim())
		.filter((line) => [".limen/", "/.limen/", "!.limen/", "!/.limen/"].includes(line));
	if ([".limen/", "/.limen/"].includes(relevant.at(-1) ?? "")) {
		return;
	}
	const addition = `${content && !content.endsWith("\n") ? "\n" : ""}/.limen/\n`;
	if (exists) {
		await appendFile(path, addition);
	} else {
		await atomicWrite(path, addition);
	}
}
async function pathExists(path: string): Promise<boolean> {
	return access(path).then(
		() => true,
		() => false,
	);
}
