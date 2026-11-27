// src/runtime/roles.ts: the role table's tools, skills and read-only flag of each job role, and the coordinator
// session's entry beside the table (A-081, E-5, D-123).
import assert from "node:assert/strict";
import { existsSync } from "node:fs";
import { join } from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";
import { COORDINATOR_SESSION, JOB_ROLES } from "../../src/runtime/roles.ts";

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
