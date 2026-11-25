// src/runtime/job-setup.ts: the setup a job's wrapper runs before its engine runs the project's --prepare command.
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { mkdir, mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { test } from "node:test";
import { ENVIRONMENT, engineEnvironment } from "../../src/config.ts";
import { setUpJob } from "../../src/runtime/job-setup.ts";
import { withEnvironment } from "../environment.ts";
import { repository } from "../plant.ts";

// R-087 (c): the prepare command is the project's code, as the engine's tools are, so it runs with what the engine
// gets.
test("the prepare command runs with the engine's environment, with no Herdr name and no transport name only the wrapper reads", async (t) => {
	const folder = await mkdtemp(join(tmpdir(), "limen-job-setup-"));
	t.after(() => rm(folder, { recursive: true, force: true }));
	const [project, job, names] = [join(folder, "project"), join(folder, "job"), join(folder, "prepare-names.json")];
	await Promise.all([repository(project), mkdir(job)]);
	const record = `require("node:fs").writeFileSync(${JSON.stringify(names)}, JSON.stringify(Object.keys(process.env)))`;
	// The wrapper's environment: what its spawner passed, its Herdr pane among it.
	withEnvironment(t, {
		HERDR_ENV: "1",
		HERDR_PANE_ID: "pane",
		LIMEN_JOB_DIR: job,
		LIMEN_WORKTREE: project,
		LIMEN_LABEL: "setup",
		LIMEN_INTERNAL_RUN: "1",
		LIMEN_JOB_ID: "job-setup",
		LIMEN_CONTEXT_ROOT: project,
		LIMEN_SETUP_KEEP: project,
		LIMEN_SETUP_PREPARE: `${JSON.stringify(process.execPath)} -e ${JSON.stringify(record)}`,
	});
	await setUpJob(job, project, engineEnvironment(process.env, { LIMEN_JOB: "1", LIMEN_JOB_ID: "job-setup" }));
	const got: string[] = JSON.parse(readFileSync(names, "utf8"));
	const wrapperNames = Object.entries(ENVIRONMENT).flatMap(([name, entry]) =>
		entry.kind === "transport" && entry.reader === "wrapper" ? [name] : [],
	);
	assert.deepEqual(
		[
			got.filter((name) => name.startsWith("HERDR_") || wrapperNames.includes(name)),
			["LIMEN_JOB", "LIMEN_JOB_ID", "LIMEN_CONTEXT_ROOT"].filter((name) => !got.includes(name)),
		],
		[[], []],
	);
});
