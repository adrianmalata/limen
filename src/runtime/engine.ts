import { spawnSync } from "node:child_process";
import { existsSync, readdirSync, realpathSync } from "node:fs";
import { readFile } from "node:fs/promises";
import { homedir } from "node:os";
import { join } from "node:path";
import { refuseRemovedEngine } from "../old-names.ts";

export type EngineId = "pi";
export type EngineProfile = {
	readonly id: EngineId;
	readonly binaryEnv: "LIMEN_PI";
	readonly binaryDefault: EngineId;
	readonly projectTrust: boolean;
	readonly toolYolo: boolean;
	readonly sessionName: boolean;
	readonly noTitle: boolean;
	readonly authCheck: boolean;
};
export type EngineArgv = {
	readonly jobDir: string;
	readonly label: string;
	readonly preamble: string;
	readonly extensions: readonly string[];
	readonly provider?: string;
	readonly model?: string;
	readonly thinking?: string;
	readonly continueValue?: string;
	readonly taskFile?: string;
};
export const ENGINES: { readonly [K in EngineId]: EngineProfile } = {
	pi: {
		id: "pi",
		binaryEnv: "LIMEN_PI",
		binaryDefault: "pi",
		projectTrust: true,
		toolYolo: false,
		sessionName: true,
		noTitle: false,
		authCheck: true,
	},
};
/** The engine a job record names; a removed one refuses with its line (exit code 1, T-18). */
export function engineProfile(id: string): EngineProfile {
	if (id === "pi") {
		return ENGINES[id];
	}
	refuseRemovedEngine(id, "record");
	throw new Error(`unknown engine ${id}`);
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
	throw new Error("--engine must be pi");
}
export function engineBinary(profile: EngineProfile): string {
	return process.env[profile.binaryEnv] ?? profile.binaryDefault;
}
export async function jobProfile(jobDir: string): Promise<EngineProfile> {
	return engineProfile((await readFile(`${jobDir}/engine`, "utf8").catch(() => "pi")).trim() || "pi");
}
/**
 * The model of a continuation without `--model`: `LIMEN_WORKER_MODEL`, else a package default. Spawn requires
 * `--model` and has no fallback (D-043); R-062 moves the route to an owner file.
 */
export function defaultModel(): string {
	return process.env.LIMEN_WORKER_MODEL?.trim() || "openai-codex/gpt-6-astra:high";
}
export function preflightEngine(profile: EngineProfile, model?: string, provider?: string): void {
	const route = engineRoute(provider, model);
	if (route.bridged && !bridgePath()) {
		throw new Error(
			`--model ${route.model} needs a pi-claude-bridge package (pi install) under ~/.pi/agent/npm, which is missing`,
		);
	}
	if (!(process.env.PATH ?? "").split(":").some((dir) => dir && existsSync(`${dir}/${profile.binaryDefault}`))) {
		throw new Error(`${profile.binaryDefault} is not on PATH; install it`);
	}
	// The bridge signs in through Claude Code, so Pi's own auth store has no say over a bridged route.
	if (!profile.authCheck || route.bridged || process.env.LIMEN_PREFLIGHT !== "auth") {
		return;
	}
	const result = spawnSync(
		engineBinary(profile),
		["auth", "check", ...(provider ? ["--provider", provider] : []), ...(model ? ["--model", model] : [])],
		{
			encoding: "utf8",
		},
	);
	if (result.status !== 0) {
		throw new Error(
			(result.stderr || result.stdout || result.error?.message || "pi auth check failed").trim() ||
				"pi auth check failed",
		);
	}
}

export function argvFor(profile: EngineProfile, slots: EngineArgv): string[] {
	const args: string[] = ["--mode", "json"];
	if (profile.projectTrust) {
		args.push("--approve");
	}
	if (profile.toolYolo) {
		args.push("--auto-approve");
	}
	args.push("--no-extensions", "--session-dir", `${slots.jobDir}/session`);
	if (profile.sessionName) {
		args.push("--name", `limen: ${slots.label}`);
	}
	if (profile.noTitle) {
		args.push("--no-title");
	}
	args.push("--append-system-prompt", slots.preamble);
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

// `--no-extensions` hides the bridge. Name it explicitly so the model resolves while other user
// extensions stay off. Pi loads the bridge package it installed, scoped or not.
function bridgePath(): string | undefined {
	const modules = join(homedir(), ".pi", "agent", "npm", "node_modules");
	const scopes = existsSync(modules) ? readdirSync(modules).filter((name) => name.startsWith("@")) : [];
	const candidates = ["", ...scopes].map((scope) => join(modules, scope, "pi-claude-bridge"));
	const found = candidates.find((path) => existsSync(path));
	return found ? realpathSync(found) : undefined;
}
