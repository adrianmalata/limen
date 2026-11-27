// src/job/spawning.ts: the role resolution of a spawn, which reads a role's preamble from the package alone (A-042).
import assert from "node:assert/strict";
import { mkdir, mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test, { type TestContext } from "node:test";
import { fileURLToPath } from "node:url";
import { resolvePreamble } from "../../src/job/spawning.ts";
import { LimenError } from "../../src/outcome.ts";
import { repository } from "../plant.ts";
import { snapshot } from "../snapshot.ts";

const TEMPLATES = fileURLToPath(new URL("../../templates", import.meta.url));

/** A project folder with no file of its own, removed after `t`. */
async function project(t: TestContext): Promise<string> {
	const root = await mkdtemp(join(tmpdir(), "limen-spawning-"));
	t.after(() => rm(root, { recursive: true, force: true }));
	return root;
}

// A-042: role prompts always come from the package, so a project file of the role's name replaces nothing.
test("resolvePreamble returns the package's templates/worker.md although the project holds .agents/limen/worker.md", async (t) => {
	const root = await project(t);
	await mkdir(join(root, ".agents/limen"), { recursive: true });
	await writeFile(join(root, ".agents/limen/worker.md"), "# The project's own worker role\n");
	assert.equal(resolvePreamble(root, "worker"), join(TEMPLATES, "worker.md"));
});

// A-042: a project file no longer adds a role, so the refusal names only the package's template.
test("ROLE_UNKNOWN: a role the package has no template for refuses with the template's path, although the project holds .agents/limen/<role>.md, and leaves the snapshot identical", async (t) => {
	const root = await project(t);
	await repository(root);
	await mkdir(join(root, ".agents/limen"), { recursive: true });
	await writeFile(join(root, ".agents/limen/tester.md"), "# The project's own tester role\n");
	const before = snapshot(root);
	assert.throws(
		() => resolvePreamble(root, "tester"),
		(error) =>
			error instanceof LimenError &&
			error.code === "ROLE_UNKNOWN" &&
			error.message === `no preamble for role tester in ${join(TEMPLATES, "tester.md")}`,
	);
	assert.deepEqual(snapshot(root), before);
});
