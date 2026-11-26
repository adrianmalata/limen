/* PL: Bramka testów przebudowy (D-001, od D-015 w Node zamiast w powłoce): uruchamia `npm run check` w środowisku
   z gate-env.mjs (prywatny TMPDIR, shim gita tylko przy git < 2.36), żeby laptop dał ten sam wynik co seat. Od D-105
   spisuje też ignorowane pliki checkoutu poza `node_modules/` i bez plików wymiany edytora przed biegiem i po nim,
   a każdy nowy kończy bramkę porażką z jego nazwą. Kończy się kodem `npm run check`, gdy ten nie jest 0, a inaczej 1
   przy nowym pliku. Niczego nie instaluje. Stan: przyjęta jako bramka przebudowy; test w tools/test-gate.mjs. */
// Usage: node adrian-rebuild/tools/gate.mjs   (from anywhere inside the repository)
import { spawnSync } from "node:child_process";
import { gateEnv, repoRoot } from "./gate-env.mjs";

// D-105 (1): a test that writes into the checkout hides in its ignored files (R-102's `.limen/refusals/`), which
// neither `git status` nor the review guard shows. `node_modules/` holds the gate's own helper, and an open editor's
// swap file must not fail the gate, as it must not fail `check.mjs` (D-032).
const IGNORED = [
	"ls-files",
	"-z",
	"--others",
	"--ignored",
	"--exclude-standard",
	"--",
	":(exclude,glob)**/node_modules/**",
	":(exclude,glob)**/.*.swp",
];

/** The ignored files of the checkout at `repo` that the gate watches; a failed listing is an error, never empty. */
function ignoredFiles(repo) {
	// The listing holds the rebuild's vendored engine sources and grows with them, so spawnSync's default 1 MiB buffer
	// would one day fail the gate with ENOBUFS while no new file exists.
	const result = spawnSync("git", ["-C", repo, ...IGNORED], { encoding: "utf8", maxBuffer: 1 << 30 });
	if (result.error !== undefined || result.status !== 0) {
		throw new Error(`gate: git ls-files failed: ${result.error?.message ?? result.stderr.trim()}`);
	}
	return new Set(result.stdout.split("\0").filter((path) => path !== ""));
}

const repo = repoRoot();
const before = ignoredFiles(repo);
const result = spawnSync("npm", ["run", "check"], { cwd: repo, env: gateEnv(repo), stdio: "inherit" });
if (result.status === null) {
	console.error(`gate: npm run check ended by ${result.signal ?? result.error?.message}`);
}
const left = [...ignoredFiles(repo)].filter((path) => !before.has(path));
for (const path of left) {
	console.error(`gate: the run left a new ignored file in the checkout: ${path} (D-105)`);
}
process.exitCode = result.status !== 0 ? (result.status ?? 1) : left.length > 0 ? 1 : 0;
