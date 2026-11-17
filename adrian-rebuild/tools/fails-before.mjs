/* PL: Narzędzie sesji głównej z etapu 5 (D-015): sprawdza, że nowe i zmienione testy ticketu padają przed zmianą.
   Rozpakowuje `git archive HEAD` do katalogu tymczasowego (jako repo z jednym commitem), kopiuje tam nowe i zmienione
   pliki spod test/ z drzewa roboczego i uruchamia nowe i zmienione pliki testów w środowisku bramki. Kod 0, gdy
   padają (oczekiwane); kod 1, gdy przechodzą na HEAD albo gdy nie ma żadnego testu. Stan: działa; test
   w tools/test-fails-before.mjs. */
// Usage: node adrian-rebuild/tools/fails-before.mjs [<test path>…]
//   Without paths it takes every new or changed file under test/ from `git status`.
import { spawnSync } from "node:child_process";
import { copyFileSync, existsSync, mkdirSync, mkdtempSync, rmSync, symlinkSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { gateEnv, repoRoot } from "./gate-env.mjs";

const TEST_FILE = /\.test\.(ts|mts|mjs|js)$/;
const IDENTITY = ["-c", "user.name=fails-before", "-c", "user.email=fails-before@example.invalid"];

function run(command, args, options) {
	const result = spawnSync(command, args, { maxBuffer: 1 << 30, ...options });
	if (result.status !== 0) {
		throw new Error(`${command} ${args.join(" ")} exited with ${result.status}: ${String(result.stderr).trim()}`);
	}
	return result.stdout;
}

/** New and changed paths under test/ (renames by their new path; deletions skipped). */
function changedTests(repo) {
	const fields = run("git", ["-C", repo, "status", "--porcelain=v1", "-z", "--untracked-files=all"])
		.toString("utf8")
		.split("\0")
		.filter(Boolean);
	const paths = [];
	for (let index = 0; index < fields.length; index += 1) {
		const entry = fields[index];
		if (entry[0] === "R" || entry[0] === "C") {
			index += 1;
		}
		if (!entry.slice(0, 2).includes("D") && entry.slice(3).startsWith("test/")) {
			paths.push(entry.slice(3));
		}
	}
	return paths;
}

/** A throwaway repository holding HEAD, with the given working-tree files copied over it. */
function headWith(repo, paths) {
	const work = mkdtempSync(join(tmpdir(), "fails-before-"));
	const archive = run("git", ["-C", repo, "archive", "--format=tar", "HEAD"]);
	run("tar", ["-x", "-C", work], { input: archive });
	const env = { ...process.env, GIT_CONFIG_GLOBAL: "/dev/null", GIT_CONFIG_NOSYSTEM: "1" };
	run("git", ["-C", work, "init", "-q"], { env });
	run("git", ["-C", work, "add", "-A"], { env });
	run("git", ["-C", work, ...IDENTITY, "commit", "-q", "--allow-empty", "-m", "HEAD"], { env });
	for (const path of paths) {
		mkdirSync(dirname(join(work, path)), { recursive: true });
		copyFileSync(join(repo, path), join(work, path));
	}
	if (existsSync(join(repo, "node_modules"))) {
		symlinkSync(join(repo, "node_modules"), join(work, "node_modules"));
	}
	return work;
}

const repo = repoRoot();
const listed = process.argv.slice(2);
const paths = listed.length > 0 ? listed : changedTests(repo);
const tests = paths.filter((path) => TEST_FILE.test(path));
if (tests.length === 0) {
	console.error("fails-before: no new or changed test file under test/");
	process.exit(1);
}
const work = headWith(repo, paths);
// A parent `node --test` passes NODE_TEST_CONTEXT down, which turns the inner run into its subtest and hides its exit.
const { NODE_TEST_CONTEXT, ...base } = process.env;
try {
	const result = spawnSync("node", ["--test", "--test-timeout=180000", "--test-force-exit", ...tests], {
		cwd: work,
		env: gateEnv(repo, base),
		encoding: "utf8",
		maxBuffer: 1 << 30,
	});
	const tail = `${result.stdout}${result.stderr}`.trim().split("\n").slice(-40).join("\n");
	if (result.status === 0) {
		console.error(`fails-before: ${tests.join(", ")} pass at HEAD, so they do not show the change\n${tail}`);
		process.exitCode = 1;
	} else {
		console.log(`fails-before: ${tests.join(", ")} fail at HEAD (exit ${result.status ?? result.signal})\n${tail}`);
	}
} finally {
	rmSync(work, { recursive: true, force: true });
}
