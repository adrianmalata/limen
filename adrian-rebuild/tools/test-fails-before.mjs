/* PL: Test narzędzia fails-before.mjs na fiksturze (D-015): w tymczasowym repo test, który sprawdza zmienione
   zachowanie, pada na HEAD (narzędzie kończy się kodem 0), test, który przechodzi już na HEAD, daje błąd (kod 1),
   a brak nowego testu też daje kod 1; od 23.11 także, że kopia HEAD leży w prywatnym TMPDIR bramki i że kopia, której
   nie dało się zrobić, nie zostaje w nim (punkt otwarty 3 R-018). Stan: działa. */
// Usage: node --test adrian-rebuild/tools/test-fails-before.mjs
import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { mkdirSync, mkdtempSync, readdirSync, readFileSync, realpathSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { after, test } from "node:test";

const tool = join(import.meta.dirname, "fails-before.mjs");
const work = mkdtempSync(join(tmpdir(), "fails-before-fixture-"));
after(() => rmSync(work, { recursive: true, force: true }));
const env = { ...process.env, GIT_CONFIG_GLOBAL: "/dev/null", GIT_CONFIG_NOSYSTEM: "1" };

function git(...args) {
	const result = spawnSync("git", ["-c", "user.name=test", "-c", "user.email=test@example.invalid", ...args], {
		cwd: work,
		env,
	});
	assert.equal(result.status, 0, result.stderr.toString("utf8"));
}
function write(path, text) {
	mkdirSync(dirname(join(work, path)), { recursive: true });
	writeFileSync(join(work, path), text);
}
const run = (...paths) => spawnSync("node", [tool, ...paths], { cwd: work, env, encoding: "utf8" });
const testOf = (body) => `import assert from "node:assert/strict";\nimport { test } from "node:test";\n${body}\n`;

git("init", "-q");
write(".gitignore", "node_modules/\n");
write("lib.mjs", "export const value = 1;\n");
git("add", "-A");
git("commit", "-q", "-m", "base");

test("D-015: no new or changed test file is an error", () => {
	assert.equal(run().status, 1);
});

test("D-015: a test of the changed behaviour fails at HEAD, so the tool exits 0", () => {
	write("lib.mjs", "export const value = 2;\n");
	write(
		"test/value.test.mjs",
		testOf('import { value } from "../lib.mjs";\ntest("value is 2", () => assert.equal(value, 2));'),
	);
	const result = run();
	assert.equal(result.status, 0, result.stderr);
	assert.match(result.stdout, /fail at HEAD/);
});

test("R-018 open point 3: the copy of HEAD lies in the gate's private TMPDIR, where the tests run", () => {
	const probe = join(work, ".where-probe");
	write(
		"test/where.test.mjs",
		testOf(
			'import { writeFileSync } from "node:fs";\n' +
				'test("records its folder", () => {\n' +
				"\tconst where = { cwd: process.cwd(), tmpdir: process.env.TMPDIR };\n" +
				"\twriteFileSync(process.env.FAILS_BEFORE_PROBE, JSON.stringify(where));\n" +
				'\tassert.fail("on purpose, so that the tool exits 0");\n' +
				"});",
		),
	);
	const result = spawnSync("node", [tool, "test/where.test.mjs"], {
		cwd: work,
		env: { ...env, XDG_CACHE_HOME: join(work, ".cache-home"), FAILS_BEFORE_PROBE: probe },
		encoding: "utf8",
	});
	assert.equal(result.status, 0, result.stderr);
	const where = JSON.parse(readFileSync(probe, "utf8"));
	// The tool removes the copy before it exits, so the folder that held it is what is left to resolve.
	assert.equal(realpathSync(dirname(where.cwd)), realpathSync(where.tmpdir), `the copy ran in ${where.cwd}`);
});

test("R-018 open point 3: a copy that cannot be made is removed, so the private folder keeps no leftover", () => {
	const cache = join(work, ".cache-failed");
	const gate = join(cache, "limen-rebuild-gate");
	// The OS temporary folder is the gate's here too, so a copy made outside the cleanup would be left in sight.
	mkdirSync(gate, { recursive: true });
	const result = spawnSync("node", [tool, "test/missing.test.mjs"], {
		cwd: work,
		env: { ...env, XDG_CACHE_HOME: cache, TMPDIR: gate },
		encoding: "utf8",
	});
	assert.notEqual(result.status, 0, result.stdout);
	assert.match(result.stderr, /ENOENT/);
	assert.deepEqual(
		readdirSync(gate).filter((name) => name.startsWith("fails-before-")),
		[],
	);
});

test("D-015: a test that passes at HEAD is an error", () => {
	write("test/trivial.test.mjs", testOf('test("always true", () => assert.ok(true));'));
	const result = run("test/trivial.test.mjs");
	assert.equal(result.status, 1);
	assert.match(result.stderr, /pass at HEAD/);
});
