import { existsSync, readdirSync, realpathSync } from "node:fs";
import { homedir } from "node:os";
import { join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { exception } from "../config.ts";
import type { JobRecord } from "../job/record.ts";
import { refuseRemovedEngine } from "../old-names.ts";
import { environmentError, LimenError, refused, usageError } from "../outcome.ts";

export type EngineId = "pi";
export type EngineProfile = {
	readonly id: EngineId;
	/** The engine's binary, found on PATH; no variable names another one (R-015). */
	readonly binary: EngineId;
	readonly projectTrust: boolean;
	readonly toolYolo: boolean;
	readonly sessionName: boolean;
	readonly noTitle: boolean;
};
export type EngineArgv = {
	readonly jobDir: string;
	readonly label: string;
	readonly extensions: readonly string[];
	readonly provider?: string;
	readonly model?: string;
	readonly thinking?: string;
	readonly continueValue?: string;
	readonly taskFile?: string;
	/** The job role's tools and skills from the role table (src/runtime/roles.ts), never from a settings file (T-03). */
	readonly tools: readonly string[];
	readonly skills: readonly string[];
};
/** The package's root, which a role's skill path is relative to: root-owned on the seat (A-025). */
const PACKAGE_ROOT = fileURLToPath(new URL("../..", import.meta.url));
export const ENGINES: { readonly [K in EngineId]: EngineProfile } = {
	pi: {
		id: "pi",
		binary: "pi",
		projectTrust: true,
		toolYolo: false,
		sessionName: true,
		noTitle: false,
	},
};
/** The engine a job record names; a removed one refuses with its line (exit code 1, T-18). */
export function engineProfile(id: string): EngineProfile {
	if (id === "pi") {
		return ENGINES[id];
	}
	refuseRemovedEngine(id, "record");
	throw refused("ENGINE_UNKNOWN", `unknown engine ${id}`);
}
/**
 * The engine a command line names; a removed one is a usage error with its line (exit code 2, T-18). Spawn requires
 * `--engine` (D-043), so no environment variable chooses it.
 */
export function resolveSpawnEngine(flag: string): EngineProfile {
	const raw = flag.trim();
	if (raw === "pi") {
		return ENGINES[raw];
	}
	refuseRemovedEngine(raw, "argument");
	throw usageError("BAD_ENGINE", "--engine must be pi");
}
/** The engine of the job's recorded route; a record without one ran on pi. */
export function jobProfile(record: JobRecord | undefined): EngineProfile {
	return engineProfile(record?.route.engine || "pi");
}
/**
 * The model of a continuation without `--model`: `LIMEN_WORKER_MODEL`, else a package default. Spawn requires
 * `--model` and has no fallback (D-043); R-062 moves the route to an owner file.
 */
export function defaultModel(): string {
	return exception("LIMEN_WORKER_MODEL")?.trim() || "openai-codex/gpt-6-astra:high";
}
/**
 * Before a job exists: a bridged route needs its bridge package, and the engine binary is on PATH. No `pi auth
 * check` runs (R-015): a job whose engine cannot sign in fails on its own record.
 */
export function preflightEngine(profile: EngineProfile, model?: string, provider?: string): void {
	const route = engineRoute(provider, model);
	if (route.bridged && !bridgePath()) {
		throw environmentError(
			"BRIDGE_MISSING",
			`--model ${route.model} needs a pi-claude-bridge package (pi install) under ~/.pi/agent/npm, which is missing`,
		);
	}
	if (!(process.env.PATH ?? "").split(":").some((dir) => dir && existsSync(`${dir}/${profile.binary}`))) {
		throw environmentError("ENGINE_MISSING", `${profile.binary} is not on PATH; install it`);
	}
}

export function argvFor(profile: EngineProfile, slots: EngineArgv): string[] {
	// E-5: with no Pi tool the bridge gives Claude Code its own Bash, Read and Write back, so no role runs without one.
	if (slots.tools.length === 0) {
		throw new LimenError({
			class: "internal",
			code: "NO_TOOLS",
			message: "the job's role names no tool, so the engine would run with Claude Code's own tools",
			next: null,
		});
	}
	const args: string[] = ["--mode", "json"];
	if (profile.projectTrust) {
		args.push("--approve");
	}
	if (profile.toolYolo) {
		args.push("--auto-approve");
	}
	args.push("--no-extensions", "--session-dir", `${slots.jobDir}/session`);
	// A-081, E-6: `--tools` replaces Pi's defaults and a settings file's `defaultTools` and filters the tools a hook
	// or an extension registers; `--no-skills` loads only the `--skill` paths, the role's own.
	args.push("--tools", slots.tools.join(","), "--no-skills");
	for (const skill of slots.skills) {
		args.push("--skill", resolve(PACKAGE_ROOT, skill));
	}
	if (profile.sessionName) {
		args.push("--name", `limen: ${slots.label}`);
	}
	if (profile.noTitle) {
		args.push("--no-title");
	}
	// The role's text rides the job's context message, never Pi's system prompt, which the bridge drops (A-086, E-1).
	const route = engineRoute(slots.provider, slots.model);
	const bridge = route.bridged ? bridgePath() : undefined;
	const named = [...slots.extensions, ...(bridge ? [bridge] : [])];
	const seen = new Set<string>();
	for (const path of named) {
		const key = existsSync(path) ? realpathSync(path) : path;
		if (seen.has(key)) {
			continue;
		}
		seen.add(key);
		args.push("--extension", path);
	}
	if (route.provider) {
		args.push("--provider", route.provider);
	}
	if (route.model) {
		args.push("--model", route.model);
	}
	if (slots.thinking) {
		args.push("--thinking", slots.thinking);
	}
	if (slots.continueValue !== undefined) {
		args.push("--continue", slots.continueValue);
	} else {
		args.push(`@${slots.taskFile}`);
	}
	return args;
}

const BRIDGE = "pi-claude";

// Pi reaches Claude Code through a bridge extension that serves `pi-claude/…` ids, and takes the provider as given.
export function engineRoute(
	provider: string | undefined,
	model: string | undefined,
): { readonly provider: string | undefined; readonly model: string | undefined; readonly bridged: boolean } {
	return { provider, model, bridged: provider === BRIDGE || !!model?.startsWith(`${BRIDGE}/`) };
}

/**
 * Whether jobs run the bridge isolated (`CLAUDE_BRIDGE_ISOLATED=1`), in which it forwards no `AGENTS*` file (D-005,
 * E-15). Off until R-048 turns isolation on and builds that variable from `runsBridgeIsolated`, so the one value decides
 * both and the project's `AGENTS.md` never reaches a model twice.
 */
export const BRIDGE_ISOLATED = false;

/**
 * Whether a job on `route` runs the bridge isolated, so that its context message carries the project's `AGENTS.md`,
 * which the bridge then forwards no more (A-042).
 */
export function runsBridgeIsolated(route: { readonly bridged: boolean }): boolean {
	return route.bridged && BRIDGE_ISOLATED;
}

// `--no-extensions` hides the bridge. Name it explicitly so the model resolves while other user
// extensions stay off. Pi loads the bridge package it installed, scoped or not.
function bridgePath(): string | undefined {
	const modules = join(homedir(), ".pi", "agent", "npm", "node_modules");
	const scopes = existsSync(modules) ? readdirSync(modules).filter((name) => name.startsWith("@")) : [];
	const candidates = ["", ...scopes].map((scope) => join(modules, scope, "pi-claude-bridge"));
	const found = candidates.find((path) => existsSync(path));
	return found ? realpathSync(found) : undefined;
}
