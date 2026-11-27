// src/project/modules.ts: the six modules, the switch of each in a project, and the refusal of a module that is off.
import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { existsSync } from "node:fs";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test, { type TestContext } from "node:test";
import { fileURLToPath } from "node:url";
import { LimenError } from "../../src/outcome.ts";
import { MODULES, moduleOn, requireModule } from "../../src/project/modules.ts";
import { GROUPS } from "../../src/registry.ts";
import { JOB_ROLES } from "../../src/runtime/roles.ts";
import { switchModules } from "../plant.ts";
import { snapshot } from "../snapshot.ts";

const PACKAGE = fileURLToPath(new URL("../..", import.meta.url));

/**
 * A Git repository with one commit in the OS temporary folder, with `modules` switched on in its limits file; removed
 * after `t`.
 */
async function project(t: TestContext, modules?: Parameters<typeof switchModules>[1]): Promise<string> {
	const root = await mkdtemp(join(tmpdir(), "limen-modules-"));
	t.after(() => rm(root, { recursive: true, force: true }));
	execFileSync("git", ["init", "-q", root]);
	const identity = ["-c", "user.name=limen-tests", "-c", "user.email=limen-tests@example.invalid"];
	execFileSync("git", ["-C", root, ...identity, "commit", "-q", "--allow-empty", "-m", "init"]);
	if (modules !== undefined) {
		await switchModules(root, modules);
	}
	return root;
}

// T-18: a module's switch is its command word, so every module the help lists has one.
test("every group the registry marks as a module is one of the six modules, by its command word", () => {
	const modules = GROUPS.flatMap((group) => ("module" in group ? [group.object] : []));
	assert.ok(modules.length > 0, "the registry marks no module");
	assert.deepEqual(
		modules.filter((name) => !MODULES.some((known) => known === name)),
		[],
	);
});

// A module's role is reachable only with its switch on, so each one names a role the package ships.
test("every role of the role table that belongs to a module has its template in templates/", () => {
	const roles = JOB_ROLES.filter((role) => role.module !== undefined);
	assert.deepEqual(
		roles.map((role) => [role.name, role.module]),
		[
			["judge", "research"],
			["researcher", "research"],
			["quality", "quality"],
			["coordinator", "group"],
			["group-member", "group"],
		],
	);
	assert.deepEqual(
		roles.filter((role) => !existsSync(join(PACKAGE, "templates", `${role.name}.md`))).map((role) => role.name),
		[],
	);
});

test("a module is on exactly when the project's limits file sets it true", async (t) => {
	const [none, some] = await Promise.all([project(t), project(t, ["group", "quality"])]);
	assert.deepEqual(
		[MODULES.filter((name) => moduleOn(none, name)), MODULES.filter((name) => moduleOn(some, name))],
		[[], ["group", "quality"]],
	);
});

// G1.10, T-03: no command switches a module on before the owner channel, so the refusal names the file and the field.
test("MODULE_OFF: requireModule of a module that is off refuses with the file and the field, next null, and writes nothing", async (t) => {
	const root = await project(t, ["github"]);
	const before = snapshot(root);
	assert.throws(() => requireModule(root, "group"), {
		constructor: LimenError,
		class: "refused",
		code: "MODULE_OFF",
		next: null,
		message:
			'the group module is off in this project; the owner switches it on in .agents/limen/limits.json ("modules": {"group": true})',
	});
	assert.deepEqual(snapshot(root), before);
	assert.equal(requireModule(root, "github"), undefined);
});
