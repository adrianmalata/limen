/* PL: Środowisko bramki przebudowy (D-001, D-015), wspólne dla gate.mjs i fails-before.mjs. Ustawia prywatny TMPDIR
   (tryb 700) w katalogu cache użytkownika, bo poller GitHuba słusznie odrzuca klucz pod /tmp z prawami 1777, a gdy
   lokalny git nie zna `worktree list -z` (git < 2.36), kładzie shim gita obok twardego linku node w
   node_modules/.rebuild-gate repo i dopisuje ten katalog na początek PATH. Niczego nie instaluje. Stan: działa. */
import { spawnSync } from "node:child_process";
import { chmodSync, copyFileSync, linkSync, mkdirSync, rmSync } from "node:fs";
import { homedir } from "node:os";
import { join } from "node:path";

const SHIM = join(import.meta.dirname, "git-worktree-z-shim.sh");

/** The repository root that contains `cwd`. */
export function repoRoot(cwd = process.cwd()) {
	const result = spawnSync("git", ["-C", cwd, "rev-parse", "--show-toplevel"], { encoding: "utf8" });
	if (result.status !== 0) {
		throw new Error(`not inside a git repository: ${cwd}`);
	}
	return result.stdout.trim();
}

/** A hard link of the running node next to the shim; a copy when the link crosses file systems or is not allowed. */
function placeNode(target) {
	rmSync(target, { force: true });
	try {
		linkSync(process.execPath, target);
	} catch (error) {
		if (error.code !== "EXDEV" && error.code !== "EPERM") {
			throw error;
		}
		copyFileSync(process.execPath, target);
		chmodSync(target, 0o755);
	}
}

/**
 * The gate's environment for the checkout at `repo`. Test plants put the node binary's directory before /usr/bin on
 * PATH, so the git shim must sit next to the node that runs the tests.
 */
export function gateEnv(repo, base = process.env) {
	const env = { ...base };
	const tmp = join(base.XDG_CACHE_HOME ?? join(homedir(), ".cache"), "limen-rebuild-gate");
	mkdirSync(tmp, { recursive: true });
	chmodSync(tmp, 0o700);
	env.TMPDIR = tmp;
	const probe = spawnSync("git", ["-C", repo, "worktree", "list", "--porcelain", "-z"], { env });
	if (probe.status !== 0) {
		const bin = join(repo, "node_modules", ".rebuild-gate");
		mkdirSync(bin, { recursive: true });
		placeNode(join(bin, "node"));
		copyFileSync(SHIM, join(bin, "git"));
		chmodSync(join(bin, "git"), 0o755);
		const version = spawnSync("git", ["--version"], { encoding: "utf8" }).stdout.trim();
		process.stderr.write(`gate: ${version} lacks 'worktree list -z'; the shim in ${bin} emulates it\n`);
		env.PATH = `${bin}:${base.PATH ?? ""}`;
	}
	return env;
}
