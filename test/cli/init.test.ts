// `limen init` checks the system requirements first, a systemd user scope among them, writes the Pi extension stub and
// prints no drift, and `limen init --drop-leftovers` removes the leftover files of cut features.
import assert from "node:assert/strict";
import { copyFileSync, existsSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { test } from "node:test";
import { fileURLToPath } from "node:url";
import { outputText, readOutcome } from "../final-line.ts";
import { limen, type Plant, pathWithFailingScope, pathWithOldGit, pathWithout, plant, repository } from "../plant.ts";

const template = (name: string) => fileURLToPath(new URL(`../../templates/${name}`, import.meta.url));

/** `limen init` in a new repository with `env`: its exit code, its code, its text and whether it wrote `.limen/`. */
async function initFresh(p: Plant, env: Readonly<Record<string, string>> = {}) {
	const fresh = join(p.parent, "fresh");
	await repository(fresh);
	const run = limen(p, ["init"], { cwd: fresh, env });
	return {
		status: run.status,
		code: readOutcome(run).code,
		text: outputText(run),
		wrote: existsSync(join(fresh, ".limen")),
	};
}

test("limen init passes its requirements check when every declared tool is on PATH", async (t) => {
	const p = await plant();
	t.after(() => p.cleanup());
	const run = await initFresh(p);
	assert.deepEqual([run.status, run.code, run.wrote], [0, null, true], run.text);
});

test("MISSING_TOOL: limen init refuses with exit code 4 and names tar when tar is not on PATH, before it writes", async (t) => {
	const p = await plant();
	t.after(() => p.cleanup());
	const run = await initFresh(p, { PATH: await pathWithout(p, "tar") });
	assert.deepEqual(
		[run.status, run.code, /^tar is not on PATH/m.test(run.text), run.wrote],
		[4, "MISSING_TOOL", true, false],
	);
});

test("MISSING_FEATURE: limen init refuses with exit code 4 and names git worktree list -z when git lacks it", async (t) => {
	const p = await plant();
	t.after(() => p.cleanup());
	const run = await initFresh(p, { PATH: await pathWithOldGit(p) });
	const named = run.text.includes("git worktree list --porcelain -z");
	assert.deepEqual([run.status, run.code, named, run.wrote], [4, "MISSING_FEATURE", true, false], run.text);
});

test("MISSING_TOOL: limen init refuses with exit code 4 and names ps when ps is not on PATH", async (t) => {
	const p = await plant();
	t.after(() => p.cleanup());
	const run = await initFresh(p, { PATH: await pathWithout(p, "ps") });
	assert.deepEqual(
		[run.status, run.code, /^ps is not on PATH/m.test(run.text), run.wrote],
		[4, "MISSING_TOOL", true, false],
	);
});

// A git that refuses to find a bare repository by itself (as from -C) still uses one named with --git-dir.
test("limen init passes its git probe when the environment sets safe.bareRepository to explicit", async (t) => {
	const p = await plant();
	t.after(() => p.cleanup());
	const explicit = { GIT_CONFIG_COUNT: "1", GIT_CONFIG_KEY_0: "safe.bareRepository", GIT_CONFIG_VALUE_0: "explicit" };
	const run = await initFresh(p, explicit);
	assert.deepEqual([run.status, run.code, run.wrote], [0, null, true], run.text);
});

test("MISSING_TOOL: limen init refuses with exit code 4 and names pi when pi is not on PATH", async (t) => {
	const p = await plant();
	t.after(() => p.cleanup());
	const run = await initFresh(p, { PATH: await pathWithout(p, "pi") });
	assert.deepEqual(
		[run.status, run.code, /^pi is not on PATH/m.test(run.text), run.wrote],
		[4, "MISSING_TOOL", true, false],
	);
});

// A-029: every job runs in its own systemd user scope, and a host without the account's user instance starts none.
test("MISSING_FEATURE: limen init refuses with exit code 4 and names lingering when no systemd user scope starts", async (t) => {
	const p = await plant();
	t.after(() => p.cleanup());
	const run = await initFresh(p, { PATH: await pathWithFailingScope(p) });
	const named = /^systemd-run --user --scope --quiet true failed: .+ \(loginctl enable-linger <account>\)/m.test(
		run.text,
	);
	assert.deepEqual([run.status, run.code, named, run.wrote], [4, "MISSING_FEATURE", true, false], run.text);
});

// The plant turns Herdr off (LIMEN_HERDR=0), which is how a pane without the herdr binary looks to Limen.
test("MISSING_TOOL: limen init inside a Herdr pane refuses with exit code 4 and names herdr when herdr is missing", async (t) => {
	const p = await plant();
	t.after(() => p.cleanup());
	const run = await initFresh(p, { HERDR_ENV: "1" });
	assert.deepEqual(
		[run.status, run.code, /^herdr is not/m.test(run.text), run.wrote],
		[4, "MISSING_TOOL", true, false],
	);
});

test("limen init: in a new repository it writes the Pi extension stub and no .omp/ folder", async (t) => {
	const p = await plant();
	t.after(() => p.cleanup());
	const fresh = join(p.parent, "fresh");
	await repository(fresh);
	const run = limen(p, ["init"], { cwd: fresh });
	assert.equal(run.status, 0, run.stderr);
	const stub = readFileSync(join(fresh, ".pi/extensions/limen.ts"));
	assert.deepEqual(
		[stub.equals(readFileSync(template("limen-extension.ts"))), existsSync(join(fresh, ".omp"))],
		[true, false],
	);
});

test("limen init --drop-leftovers drops an AGENTS.md identical to the coordinator manual and names the drop", async (t) => {
	const p = await plant();
	t.after(() => p.cleanup());
	copyFileSync(template("manual.md"), join(p.root, "AGENTS.md"));
	const run = limen(p, ["init", "--drop-leftovers"]);
	assert.equal(run.status, 0, run.stderr);
	assert.deepEqual(
		[existsSync(join(p.root, "AGENTS.md")), outputText(run)],
		[false, "dropped AGENTS.md (identical copy of the package's templates/manual.md)\n"],
	);
});

// A-042: role prompts always come from the package, so a project's changed worker prompt is read by nothing.
test("limen init --drop-leftovers drops a changed .agents/limen/worker.md and names the drop", async (t) => {
	const p = await plant();
	t.after(() => p.cleanup());
	const worker = join(p.root, ".agents/limen/worker.md");
	writeFileSync(worker, `${readFileSync(template("worker.md"), "utf8")}\nA project rule.\n`);
	const run = limen(p, ["init", "--drop-leftovers"]);
	assert.equal(run.status, 0, run.stderr);
	assert.deepEqual(
		[existsSync(worker), outputText(run)],
		[false, "dropped .agents/limen/worker.md (role texts from the package (R-040))\n"],
	);
});

// A-042: a changed AGENTS.md is the project's own context, which the owner keeps.
test("limen init --drop-leftovers keeps a changed AGENTS.md", async (t) => {
	const p = await plant();
	t.after(() => p.cleanup());
	const agents = join(p.root, "AGENTS.md");
	writeFileSync(agents, `${readFileSync(template("manual.md"), "utf8")}\nA project rule.\n`);
	const run = limen(p, ["init", "--drop-leftovers"]);
	assert.equal(run.status, 0, run.stderr);
	assert.deepEqual([existsSync(agents), outputText(run)], [true, "no leftover files\n"]);
});

// A-042: drift tracking is cut; a leftover copy is listed once by limen status, not at every init.
test("a plain limen init prints no drift line when the project holds a changed register", async (t) => {
	const p = await plant();
	t.after(() => p.cleanup());
	writeFileSync(join(p.root, ".agents/limen/communication.md"), "# Communication\n\nThe project's own register.\n");
	const run = limen(p, ["init"]);
	assert.equal(run.status, 0, run.stderr);
	assert.deepEqual(
		outputText(run)
			.split("\n")
			.filter((line) => /drift|overlay/i.test(line)),
		[],
	);
});

test("a second limen init --drop-leftovers prints no leftover files and exits 0", async (t) => {
	const p = await plant();
	t.after(() => p.cleanup());
	copyFileSync(template("manual.md"), join(p.root, "AGENTS.md"));
	const first = limen(p, ["init", "--drop-leftovers"]);
	assert.equal(first.status, 0, first.stderr);
	const second = limen(p, ["init", "--drop-leftovers"]);
	assert.equal(second.status, 0, second.stderr);
	assert.equal(outputText(second), "no leftover files\n");
});
