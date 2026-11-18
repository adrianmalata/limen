/* PL: Test narzędzia gate-time.mjs (M-10, T-11) z fałszywą bramką w katalogu tymczasowym i repozytorium-fiksturą:
   przy bramce, która wypisuje liczby testów i kończy się kodem 0, plik zawiera SHA, liczby i czas, a narzędzie
   kończy się kodem 0; przy bramce z kodem 1 plik zapisuje kod 1, a narzędzie kończy się kodem 1; plik zaczyna się
   od bloku `<!-- PL:`; nieudany zapis pliku (katalog nad --out jest plikiem) daje kod 4 z powodem. Jeden test
   sprawdza jeden mechanizm (T-29). Stan: działa. */
// Usage: node --test adrian-rebuild/tools/test-gate-time.mjs
import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { existsSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { after, test } from "node:test";

const TOOL = join(import.meta.dirname, "gate-time.mjs");
const ENV = { ...process.env, GIT_CONFIG_GLOBAL: "/dev/null", GIT_CONFIG_NOSYSTEM: "1" };
const work = mkdtempSync(join(tmpdir(), "gate-time-"));
after(() => rmSync(work, { recursive: true, force: true }));

function git(...args) {
	const result = spawnSync("git", ["-c", "user.name=test", "-c", "user.email=test@example.invalid", ...args], {
		cwd: repo,
		env: ENV,
		encoding: "utf8",
	});
	assert.equal(result.status, 0, result.stderr);
	return result.stdout.trim();
}

const repo = mkdtempSync(join(work, "repo-"));
git("init", "-q", "-b", "main");
writeFileSync(join(repo, "README.md"), "fixture\n");
git("add", "-A");
git("commit", "-q", "-m", "fixture");
const head = git("rev-parse", "HEAD");

/** Runs the tool in the fixture repository with a fake gate that prints test counts and exits with `code`. */
function measure(code, out = join(work, `out-${code}`, "gate-time.md")) {
	const gate = join(work, `gate-${code}.mjs`);
	writeFileSync(gate, `console.log("# tests 3\\n# pass ${3 - code}\\n# fail ${code}");\nprocess.exitCode = ${code};\n`);
	const result = spawnSync(process.execPath, [TOOL, "--gate", gate, "--out", out], {
		cwd: repo,
		env: ENV,
		encoding: "utf8",
	});
	const file = existsSync(out) ? readFileSync(out, "utf8") : undefined;
	return { status: result.status, stdout: result.stdout, stderr: result.stderr, file };
}

test("a gate that exits 0: the file holds the SHA, the counts and a time, and the tool exits 0", () => {
	const run = measure(0);
	assert.equal(run.status, 0, run.stderr);
	assert.match(run.file, new RegExp(`HEAD: \`${head}\``));
	assert.match(run.file, /tests 3, pass 3, fail 0/);
	assert.match(run.file, /Run time: \d+\.\d s/);
	assert.match(run.stdout, /# tests 3/, "the gate's output is not passed through");
});

test("a gate that exits 1: the file records exit code 1, and the tool exits 1", () => {
	const run = measure(1);
	assert.equal(run.status, 1, run.stderr);
	assert.match(run.file, /Gate exit code: 1\n/);
});

test("the file opens with a Polish summary block", () => {
	assert.match(measure(0).file, /^<!-- PL: [\s\S]*? -->\n/);
});

test("a failed write of the file exits 4 with its reason, apart from a failing gate", () => {
	const parent = join(work, "a-file");
	writeFileSync(parent, "not a directory\n");
	const run = measure(0, join(parent, "gate-time.md"));
	assert.equal(run.status, 4, run.stderr);
	assert.match(run.stderr, /gate-time: cannot write .*a-file\/gate-time\.md/);
});
