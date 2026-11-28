// src/runtime/roles.ts: the role table's tools, skills and read-only flag of each job role, the coordinator session's
// entry beside the table, and a role's preamble from the package alone (A-081, E-5, D-123, A-042).
import assert from "node:assert/strict";
import { existsSync } from "node:fs";
import { mkdir, mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test, { type TestContext } from "node:test";
import { fileURLToPath } from "node:url";
import { LimenError } from "../../src/outcome.ts";
import { COORDINATOR_SESSION, JOB_ROLES, resolvePreamble } from "../../src/runtime/roles.ts";
import { repository } from "../plant.ts";
import { snapshot } from "../snapshot.ts";

const TEMPLATES = fileURLToPath(new URL("../../templates", import.meta.url));

// R-040, T-25 (1): the table is the one list of job roles, and each role's preamble is its package template.
test("every role of the table has its template templates/<role>.md in the package", () => {
	assert.deepEqual(
		JOB_ROLES.filter((role) => !existsSync(join(TEMPLATES, `${role.name}.md`))).map((role) => role.name),
		[],
	);
});

// E-5: a session with no Pi tool gets Claude Code's own tools back, and Pi filters a registered tool the list does not
// name, so every list holds Limen's `finish`.
test("E-5: no role's tool list is empty, and every list holds finish", () => {
	assert.deepEqual(
		JOB_ROLES.filter((role) => role.tools.length === 0 || !role.tools.includes("finish")).map((role) => role.name),
		[],
	);
});

// A-081 (T-33 drops the scout): the read-only roles get no write or edit tool, and the quality role writes its
// findings file, so it is a writer (R-045 Decision 1).
test("A-081: exactly the reviewer, the judge and the researcher are read-only, and none of them holds edit or write", () => {
	const readOnly = JOB_ROLES.filter((role) => role.readOnly);
	assert.deepEqual(
		{
			readOnly: readOnly.map((role) => role.name),
			writing: readOnly.filter((role) => role.tools.some((tool) => tool === "edit" || tool === "write")),
		},
		{ readOnly: ["reviewer", "judge", "researcher"], writing: [] },
	);
});

// D-123: R-050's start script applies the coordinator's entry; it is no table key, since the table's coordinator is a
// group's team.
test("D-123: the coordinator session's entry holds Pi's four default tools, no skill, and is not read-only", () => {
	assert.deepEqual(
		{ ...COORDINATOR_SESSION, keyed: JOB_ROLES.some((role) => role === COORDINATOR_SESSION) },
		{ tools: ["read", "bash", "edit", "write"], skills: [], readOnly: false, keyed: false },
	);
});

/** A project folder with no file of its own, removed after `t`. */
async function project(t: TestContext): Promise<string> {
	const root = await mkdtemp(join(tmpdir(), "limen-roles-"));
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
