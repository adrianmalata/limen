/* PL: Test bramki gate.mjs na fiksturze (D-105 (1), D-130): w tymczasowym repo skrypt `check` wypisuje linie
   i zapisuje podane pliki, a bramka kończy się porażką i nazywa każdy nowy plik ignorowany przez git, nie licząc
   `node_modules/` na każdej głębokości i plików wymiany edytora (D-032); zmieniony plik, który istniał przed biegiem,
   nie jest nowy, nieudany `check` zachowuje swój kod wyjścia, a lista, której nie dało się zrobić po biegu, też jest
   porażką. Z `--out` plik ma całe wyjście w kolejności, linie bramki i kod wyjścia, także po nieudanej liście;
   `--out` bez pliku i nieznany argument niczego nie uruchamiają, a stary plik nie przetrwa biegu. Stan: działa. */
// Usage: node --test adrian-rebuild/tools/test-gate.mjs
import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { existsSync, mkdirSync, mkdtempSync, readdirSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { after, test } from "node:test";

const GATE = join(import.meta.dirname, "gate.mjs");
const root = mkdtempSync(join(tmpdir(), "gate-fixture-"));
after(() => rmSync(root, { recursive: true, force: true }));
const env = {
	...process.env,
	GIT_CONFIG_GLOBAL: "/dev/null",
	GIT_CONFIG_NOSYSTEM: "1",
	// A repository above the fixtures must not answer for one whose `.git` a test removed.
	GIT_CEILING_DIRECTORIES: root,
	XDG_CACHE_HOME: join(root, "cache"),
};
// The fixture's whole suite: it prints the lines it is given to stdout or stderr in order, writes and removes the paths
// it is given, then exits with the given code.
const CHECK = `import { mkdirSync, rmSync, writeFileSync } from "node:fs";
import { dirname } from "node:path";
const plan = JSON.parse(process.env.GATE_FIXTURE);
for (const [stream, line] of plan.print ?? []) {
	(stream === "err" ? console.error : console.log)(line);
}
for (const path of plan.write ?? []) {
	mkdirSync(dirname(path), { recursive: true });
	writeFileSync(path, "written by the check\\n");
}
for (const path of plan.remove ?? []) {
	rmSync(path, { recursive: true, force: true });
}
process.exitCode = plan.exit ?? 0;
`;

function write(work, path, text) {
	mkdirSync(dirname(join(work, path)), { recursive: true });
	writeFileSync(join(work, path), text);
}

/** A repository whose `npm run check` is CHECK, with the ignored files `existing` already in place. */
function fixture(existing = []) {
	const work = mkdtempSync(join(root, "repo-"));
	const init = spawnSync("git", ["init", "-q"], { cwd: work, env, encoding: "utf8" });
	assert.equal(init.status, 0, init.stderr);
	write(work, ".gitignore", "node_modules/\nout/\n.*.swp\n");
	write(work, "package.json", JSON.stringify({ scripts: { check: "node check.mjs" } }));
	write(work, "check.mjs", CHECK);
	for (const path of existing) {
		write(work, path, "there before the run\n");
	}
	return work;
}

const gate = (work, plan, args = []) =>
	spawnSync(process.execPath, [GATE, ...args], {
		cwd: work,
		env: { ...env, GATE_FIXTURE: JSON.stringify(plan) },
		encoding: "utf8",
	});
const named = (path) => `gate: the run left a new ignored file in the checkout: ${path} (D-105)`;

test("D-105: a new ignored file fails the gate, and each new file is named", () => {
	const result = gate(fixture(), { write: ["out/refusal.json", "out/deep/other.json"] });
	assert.equal(result.status, 1, result.stderr);
	assert.ok(result.stderr.includes(named("out/refusal.json")), result.stderr);
	assert.ok(result.stderr.includes(named("out/deep/other.json")), result.stderr);
});

test("A file in node_modules at any depth does not fail the gate", () => {
	const result = gate(fixture(), { write: ["node_modules/.rebuild-gate/node", "lib/node_modules/x.js"] });
	assert.equal(result.status, 0, result.stderr);
	assert.doesNotMatch(result.stderr, /new ignored file/);
});

test("An editor swap file does not fail the gate, as an open editor must not (D-032)", () => {
	const result = gate(fixture(), { write: [".plan.md.swp", "out/.notes.swp"] });
	assert.equal(result.status, 0, result.stderr);
	assert.doesNotMatch(result.stderr, /new ignored file/);
});

test("An ignored file that existed before the run and changed is not new", () => {
	const result = gate(fixture(["out/kept.json"]), { write: ["out/kept.json"] });
	assert.equal(result.status, 0, result.stderr);
	assert.doesNotMatch(result.stderr, /new ignored file/);
});

test("A new ignored file is named even when the check fails", () => {
	const result = gate(fixture(), { write: ["out/left.json"], exit: 3 });
	assert.ok(result.stderr.includes(named("out/left.json")), result.stderr);
});

test("A failing check's exit code wins over a new ignored file", () => {
	assert.equal(gate(fixture(), { write: ["out/left.json"], exit: 3 }).status, 3);
});

test("A listing that fails after the run fails the gate, so a lost listing is no pass", () => {
	const result = gate(fixture(), { remove: [".git"] });
	assert.equal(result.status, 1, result.stderr);
	assert.match(result.stderr, /gate: git ls-files failed: .*not a git repository/s);
});

test("D-130: --out writes the check's output in order, the gate's lines and its exit code, which it keeps", () => {
	const work = fixture();
	const lines = ["one, on stdout", "two, on stderr", "three, on stdout"];
	const print = [
		["out", lines[0]],
		["err", lines[1]],
		["out", lines[2]],
	];
	const result = gate(work, { print, write: ["out/left.json"], exit: 3 }, ["--out", "out/gate.txt"]);
	assert.equal(result.status, 3, result.stderr);
	const text = readFileSync(join(work, "out/gate.txt"), "utf8");
	const at = lines.map((line) => text.indexOf(line));
	assert.ok(at[0] >= 0 && at[0] < at[1] && at[1] < at[2], text);
	assert.ok(text.includes(named("out/left.json")), text);
	assert.match(text, /gate: exit 3\n$/);
	assert.ok(result.stderr.includes("gate: exit 3; the whole output is in out/gate.txt"), result.stderr);
});

test("D-130: the --out file in an ignored folder of the checkout is no new ignored file of the run", () => {
	const work = fixture();
	const result = gate(work, {}, ["--out", "out/gate.txt"]);
	assert.equal(result.status, 0, result.stderr);
	assert.doesNotMatch(result.stderr, /new ignored file/);
	assert.ok(existsSync(join(work, "out/gate.txt")), "the file is written");
});

test("D-130: --out without a file refuses before the check runs", () => {
	const work = fixture();
	const result = gate(work, { write: ["out/ran.json"] }, ["--out"]);
	assert.notEqual(result.status, 0);
	assert.match(result.stderr, /--out needs a file/);
	assert.equal(existsSync(join(work, "out/ran.json")), false);
});

test("D-130: with --out, a listing that fails after the run keeps the check's output in the file and fails", () => {
	const work = fixture();
	const result = gate(work, { print: [["out", "the check ran"]], remove: [".git"] }, ["--out", "out/gate.txt"]);
	assert.equal(result.status, 1, result.stderr);
	const text = readFileSync(join(work, "out/gate.txt"), "utf8");
	assert.ok(text.includes("the check ran"), text);
	assert.match(text, /gate: git ls-files failed: .*not a git repository/s);
	assert.match(text, /gate: exit 1\n$/);
	assert.deepEqual(readdirSync(join(work, "out")), ["gate.txt"]);
});

test("A failing check's exit code wins over a listing that fails after it", () => {
	const result = gate(fixture(), { remove: [".git"], exit: 3 });
	assert.equal(result.status, 3, result.stderr);
	assert.match(result.stderr, /gate: git ls-files failed/);
});

test("D-130: an unknown argument refuses before the check runs", () => {
	const work = fixture();
	const result = gate(work, { write: ["out/ran.json"] }, ["--output", "out/gate.txt"]);
	assert.equal(result.status, 2, result.stderr);
	assert.match(result.stderr, /gate: unknown arguments: --output out\/gate\.txt/);
	assert.equal(existsSync(join(work, "out/ran.json")), false);
});

test("D-130: an earlier run's --out file is gone when this run ends before its own file is written", () => {
	const work = fixture();
	write(work, "out/gate.txt", "an earlier run\n");
	rmSync(join(work, ".git"), { recursive: true, force: true });
	const result = gate(work, {}, ["--out", "out/gate.txt"]);
	assert.notEqual(result.status, 0);
	assert.equal(existsSync(join(work, "out/gate.txt")), false);
});
