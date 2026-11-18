// The coordinator registration under .limen/coordinators/, which `limen rule` reads: the sweep's removal of dead ones.
import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { mkdir, mkdtemp, readdir, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { test } from "node:test";
import { coordinatorRegistration, removeDeadCoordinators } from "../../src/integrations/coordinator-registration.ts";

test("the sweep removes a registration whose process died, also after a normal exit, and keeps a live one", async (t) => {
	const root = await mkdtemp(join(tmpdir(), "limen-coordinators-"));
	const saved = { ...process.env };
	t.after(async () => {
		process.env = saved;
		await rm(root, { recursive: true, force: true });
	});
	// The hook registers only a coordinator session, never one inside a job.
	process.env = { ...saved, LIMEN_COORDINATOR: "1" };
	delete process.env.LIMEN_JOB;
	const base = join(root, ".limen/coordinators");
	const registration = coordinatorRegistration();
	registration.start(root, { cwd: root, sessionManager: { getSessionId: () => "s-ended" } });
	registration.shutdown();
	// The pid of a process that ran and ended, as a coordinator's pid reads once its process is gone.
	await writeFile(join(base, "s-ended", "pid"), `${spawnSync("true").pid}\n`);
	await mkdir(join(base, "s-live"));
	await writeFile(join(base, "s-live", "pid"), `${process.pid}\n`);
	await removeDeadCoordinators(root);
	assert.deepEqual(await readdir(base), ["s-live"]);
});
