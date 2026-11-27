/* PL: Bramka testów przebudowy (D-001, od D-015 w Node zamiast w powłoce): uruchamia `npm run check` w środowisku
   z gate-env.mjs (prywatny TMPDIR, shim gita tylko przy git < 2.36), żeby laptop dał ten sam wynik co seat. Od D-105
   spisuje też ignorowane pliki checkoutu poza `node_modules/` i bez plików wymiany edytora przed biegiem i po nim,
   a każdy nowy kończy bramkę porażką z jego nazwą. Kończy się kodem `npm run check`, gdy ten nie jest 0, a inaczej 1
   przy nowym pliku. Od D-130 z `--out <plik>` zapisuje całe wyjście `npm run check` (stdout i stderr w kolejności),
   własne linie i kod wyjścia atomowo do pliku, żeby test, który padł, dało się nazwać. Niczego nie instaluje.
   Stan: przyjęta jako bramka przebudowy; test w tools/test-gate.mjs. */
// Usage: node adrian-rebuild/tools/gate.mjs [--out <file>]   (from anywhere inside the repository)
import { spawnSync } from "node:child_process";
import { realpathSync, rmSync, writeSync } from "node:fs";
import { resolve } from "node:path";
import { takeOut, writeAtomicWith } from "./atomic-write.mjs";
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

/**
 * The gate's exit code for a finished `npm run check`: the check's code when it is not 0, else 1 when the run left a
 * new ignored file or the listing after it failed; `say` gets each of the gate's own lines, and `own` is a file of the
 * gate itself, never counted.
 */
function verdict(repo, before, result, say, own) {
	if (result.status === null) {
		say(`gate: npm run check ended by ${result.signal ?? result.error?.message}`);
	}
	let after;
	try {
		after = ignoredFiles(repo);
	} catch (error) {
		// A lost listing is no pass; said as a line, so the `--out` file keeps the check's output with it (D-130).
		say(error.message);
		return result.status !== 0 ? (result.status ?? 1) : 1;
	}
	const left = [...after].filter((path) => !before.has(path) && resolve(repo, path) !== own);
	for (const path of left) {
		say(`gate: the run left a new ignored file in the checkout: ${path} (D-105)`);
	}
	return result.status !== 0 ? (result.status ?? 1) : left.length > 0 ? 1 : 0;
}

const { file, rest } = takeOut(process.argv.slice(2));
if (rest.length > 0) {
	// A mistyped option would run the whole check and keep nothing (D-130).
	console.error(`gate: unknown arguments: ${rest.join(" ")}; usage: node adrian-rebuild/tools/gate.mjs [--out <file>]`);
	process.exit(2);
}
if (file !== undefined) {
	// A run that ends before its rename must not leave an earlier run's file to be read as its own (D-130).
	rmSync(resolve(file), { force: true });
}
const repo = repoRoot();
const before = ignoredFiles(repo);
const check = (stdio) => spawnSync("npm", ["run", "check"], { cwd: repo, env: gateEnv(repo), stdio });
if (file === undefined) {
	process.exitCode = verdict(repo, before, check("inherit"), (line) => console.error(line));
} else {
	// D-130: a failed test becomes a finding only by its name (D-029), and a session's tool output can be cut, so the
	// whole run goes to the file. The check writes into the temporary file itself, so stdout and stderr keep their order.
	const code = writeAtomicWith(resolve(file), (fd, temp) => {
		const say = (line) => {
			console.error(line);
			writeSync(fd, `${line}\n`);
		};
		const exit = verdict(repo, before, check(["inherit", fd, fd]), say, realpathSync(temp));
		writeSync(fd, `gate: exit ${exit}\n`);
		return exit;
	});
	console.error(`gate: exit ${code}; the whole output is in ${file}`);
	process.exitCode = code;
}
