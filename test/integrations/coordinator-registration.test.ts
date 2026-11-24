// The coordinator registration under .limen/coordinators/, which `limen rule` reads: the sweep's removal of dead ones,
// and the folder that takes a hook's refusal in the session (T-32 (4)).
import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { existsSync } from "node:fs";
import { mkdir, mkdtemp, readdir, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { test } from "node:test";
import {
	coordinatorRegistration,
	removeDeadCoordinators,
	writeCoordinatorRefusal,
} from "../../src/integrations/coordinator-registration.ts";
import { platform } from "../../src/platform/platform.ts";

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
	registration.start(root, { sessionManager: { getSessionId: () => "s-ended" } });
	registration.shutdown();
	// The pid of a process that ran and ended, as a coordinator's pid reads once its process is gone.
	await writeFile(join(base, "s-ended", "pid"), `${spawnSync("true").pid}\n`);
	await mkdir(join(base, "s-live"));
	await writeFile(join(base, "s-live", "pid"), `${process.pid}\n`);
	await removeDeadCoordinators(root);
	assert.deepEqual(await readdir(base), ["s-live"]);
});

/** A registration folder `session` below `base` that records the process `pid` with the start time `born`. */
async function registered(base: string, session: string, pid: number, born: string): Promise<void> {
	await mkdir(join(base, session), { recursive: true });
	await writeFile(join(base, session, "pid"), `${pid}\n`);
	await writeFile(join(base, session, "born"), `${born}\n`);
}

// R-029 review round 2, note 3: a pid is reused once its process ends, so a dead session's folder can hold this
// process's pid; the start time the registration records tells them apart, as the sweep's liveness check reads it
// (A-058). The stale folder is alone at the first write, so the write cannot find the live folder first.
test("a hook's refusal goes only into the folder whose pid and start time are this process's, never a stale one of the same pid", async (t) => {
	const root = await mkdtemp(join(tmpdir(), "limen-coordinators-"));
	t.after(() => rm(root, { recursive: true, force: true }));
	await mkdir(join(root, ".agents", "limen"), { recursive: true });
	const own = await platform.processInfo(process.pid);
	assert.ok(own.kind === "present", "the test reads its own start time");
	const base = join(root, ".limen", "coordinators");
	const refusal = {
		event: "message_end",
		field: "message",
		message: "Pi event message_end",
		at: "2026-11-24T14:10:00.000Z",
	};
	await registered(base, "s-stale", process.pid, `${own.process.born}0`);
	await writeCoordinatorRefusal(root, refusal);
	const staleAlone = existsSync(join(base, "s-stale", "refusal.json"));
	await registered(base, "s-live", process.pid, own.process.born);
	await writeCoordinatorRefusal(root, refusal);
	assert.deepEqual(
		[staleAlone, existsSync(join(base, "s-stale", "refusal.json")), existsSync(join(base, "s-live", "refusal.json"))],
		[false, false, true],
	);
});
