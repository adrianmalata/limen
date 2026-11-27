// src/job/spawning.ts: the role resolution of a spawn, which reads a role's preamble from the package alone (A-042) and
// takes only a role of the role table (src/runtime/roles.ts).
import assert from "node:assert/strict";
import { existsSync } from "node:fs";
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

/** The refusal of a role outside the role table (src/runtime/roles.ts), as resolvePreamble words it. */
const notJobRole = (role: string) =>
	`${role} is no job role; a job runs as worker, reviewer, judge, researcher, quality, keeper, coordinator or group-member`;

// A-042: a project file no longer adds a role, so a role outside the package's table refuses.
test("ROLE_UNKNOWN: a role the package has no template for refuses, naming the job roles, although the project holds .agents/limen/<role>.md, and leaves the snapshot identical", async (t) => {
	const root = await project(t);
	await repository(root);
	await mkdir(join(root, ".agents/limen"), { recursive: true });
	await writeFile(join(root, ".agents/limen/tester.md"), "# The project's own tester role\n");
	const before = snapshot(root);
	assert.throws(
		() => resolvePreamble(root, "tester"),
		(error) => error instanceof LimenError && error.code === "ROLE_UNKNOWN" && error.message === notJobRole("tester"),
	);
	assert.deepEqual(snapshot(root), before);
});

// R-045 Change 1, T-25 (1): the role table is the one list of job roles, so a part file of the context message in
// templates/ is no role, and no job runs without the table's tools for its role.
test("ROLE_UNKNOWN: --role manual and --role styleguide refuse although their templates exist, and leave the snapshot identical", async (t) => {
	const root = await project(t);
	await repository(root);
	const before = snapshot(root);
	const refusals = ["manual", "styleguide"].map((role) => {
		assert.ok(existsSync(join(TEMPLATES, `${role}.md`)), `templates/${role}.md exists`);
		try {
			resolvePreamble(root, role);
			return "started";
		} catch (error) {
			return error instanceof LimenError ? [error.code, error.message] : String(error);
		}
	});
	assert.deepEqual(
		{ refusals, snapshot: snapshot(root) },
		{
			refusals: [
				["ROLE_UNKNOWN", notJobRole("manual")],
				["ROLE_UNKNOWN", notJobRole("styleguide")],
			],
			snapshot: before,
		},
	);
});
