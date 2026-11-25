// The refusal of a Limen hook in a coordinator's session (T-32 (4)): the file of the process that refused, under
// .limen/refusals/, and the sweep's removal of the file of a process that is gone, which takes regular files only.
import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { mkdir, mkdtemp, readdir, readFile, rm, symlink, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { type TestContext, test } from "node:test";
import { removeDeadRefusals, writeCoordinatorRefusal } from "../../src/integrations/coordinator-refusals.ts";
import { platform } from "../../src/platform/platform.ts";

const REFUSAL = {
	event: "message_end",
	field: "message",
	message: "Pi event message_end",
	at: "2026-11-24T14:10:00.000Z",
};

/** A project in the OS temporary folder, removed after the test: a folder that holds `.agents/limen`. */
async function project(t: TestContext): Promise<string> {
	const root = await mkdtemp(join(tmpdir(), "limen-refusals-"));
	t.after(() => rm(root, { recursive: true, force: true }));
	await mkdir(join(root, ".agents", "limen"), { recursive: true });
	return root;
}

/** This process's start time, as the platform adapter reads it. */
async function ownBorn(): Promise<string> {
	const own = await platform.processInfo(process.pid);
	assert.ok(own.kind === "present", "the test reads its own start time");
	return own.process.born;
}

// R-102, D-097 (6) (b): the registration that took the refusal is gone, and a session that never registered lost its
// refusal; the file is named by the process, since the context that would name the session may be the refused value.
test("a hook's refusal goes to the file of this process's pid and start time, with no registration folder", async (t) => {
	const root = await project(t);
	await writeCoordinatorRefusal(root, REFUSAL);
	const folder = join(root, ".limen", "refusals");
	const name = `${process.pid}-${await ownBorn()}.json`;
	assert.deepEqual(
		[
			await readdir(join(root, ".limen")),
			await readdir(folder),
			JSON.parse(await readFile(join(folder, name), "utf8")),
		],
		[["refusals"], [name], REFUSAL],
	);
});

// A pid is reused once its process ends, so the start time in the name tells this process from a dead one of the same
// pid (A-058), as the sweep's liveness checks read it.
test("the sweep's step removes the refusal file of a process that is gone and keeps a live process's", async (t) => {
	const root = await project(t);
	const folder = join(root, ".limen", "refusals");
	await mkdir(folder, { recursive: true });
	const born = await ownBorn();
	const live = `${process.pid}-${born}.json`;
	// The pid of a process that ran and ended, and this process's pid with another start time.
	for (const name of [live, `${process.pid}-${born}0.json`, `${spawnSync("true").pid}-1.json`]) {
		await writeFile(join(folder, name), `${JSON.stringify(REFUSAL)}\n`);
	}
	await removeDeadRefusals(root);
	assert.deepEqual(await readdir(folder), [live]);
});

// R-102 review round 1, finding 2: the step removed such a name without `recursive`, so a directory of it failed the
// step at every minute's run; `limen status` names a directory and a link there as BAD_DATA, so the step leaves both.
test("the sweep's step takes only regular files, so a directory and a link named as a dead process's refusal file stay and the step succeeds", async (t) => {
	const root = await project(t);
	const folder = join(root, ".limen", "refusals");
	const dead = spawnSync("true").pid;
	await mkdir(join(folder, `${dead}-1.json`), { recursive: true });
	await symlink(join(root, "elsewhere.json"), join(folder, `${dead}-2.json`));
	await removeDeadRefusals(root);
	assert.deepEqual((await readdir(folder)).sort(), [`${dead}-1.json`, `${dead}-2.json`]);
});
