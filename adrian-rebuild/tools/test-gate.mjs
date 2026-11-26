/* PL: Test bramki gate.mjs na fiksturze (D-105 (1)): w tymczasowym repo skrypt `check` zapisuje podane pliki, a bramka
   kończy się porażką i nazywa każdy nowy plik ignorowany przez git, nie licząc `node_modules/` na każdej głębokości
   i plików wymiany edytora (D-032); zmieniony plik, który istniał przed biegiem, nie jest nowy, nieudany `check`
   zachowuje swój kod wyjścia, a lista, której nie dało się zrobić po biegu, też jest porażką. Stan: działa. */
// Usage: node --test adrian-rebuild/tools/test-gate.mjs
import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
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
// The fixture's whole suite: it writes and removes the paths it is given, then exits with the given code.
const CHECK = `import { mkdirSync, rmSync, writeFileSync } from "node:fs";
import { dirname } from "node:path";
const plan = JSON.parse(process.env.GATE_FIXTURE);
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

const gate = (work, plan) =>
	spawnSync(process.execPath, [GATE], {
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
