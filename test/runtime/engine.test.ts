// src/runtime/engine.ts: the tool list and the skills a job's engine argv gives Pi, from the role table (A-081, E-5,
// E-6).
import assert from "node:assert/strict";
import { resolve } from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";
import { argvFor, ENGINES } from "../../src/runtime/engine.ts";
import { JOB_ROLES } from "../../src/runtime/roles.ts";

const PACKAGE = fileURLToPath(new URL("../..", import.meta.url));
const SLOTS = { jobDir: "/j", label: "l", extensions: [], taskFile: "/j/task.md" };

/** The value of each `flag` in `argv`, in order. */
function values(argv: readonly string[], flag: string): string[] {
	return argv.flatMap((arg, index) => (arg === flag ? [argv[index + 1] ?? ""] : []));
}

// A-081: Pi's `--tools` replaces its defaults, and `--no-skills` loads only the `--skill` paths, so each role's argv
// names its own list and no skill Pi would find.
test("the argv of each role names its tool list once in --tools and holds --no-skills", () => {
	const argvs = JOB_ROLES.map((role) => {
		const argv = argvFor(ENGINES.pi, { ...SLOTS, tools: role.tools, skills: role.skills });
		return { role: role.name, tools: values(argv, "--tools"), noSkills: argv.includes("--no-skills") };
	});
	assert.deepEqual(
		argvs,
		JOB_ROLES.map((role) => ({ role: role.name, tools: [role.tools.join(",")], noSkills: true })),
	);
});

// E-6, A-025: a role's skill is a package path, so the argv names it absolute, below the package root.
test("a skill entry gives --skill with its absolute path below the package root", () => {
	const skill = "test/fixtures/skills/fixture/SKILL.md";
	const argv = argvFor(ENGINES.pi, { ...SLOTS, tools: ["read", "finish"], skills: [skill] });
	assert.deepEqual(values(argv, "--skill"), [resolve(PACKAGE, skill)]);
});

// E-5: with zero Pi tools the bridge gives Claude Code its own Bash, Read and Write back.
test("E-5: an empty tool list throws before any argv is built", () => {
	assert.throws(() => argvFor(ENGINES.pi, { ...SLOTS, tools: [], skills: [] }), /no tool/);
});
