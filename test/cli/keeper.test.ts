// `limen keeper`: the jobs it reads for its task, named by a job argument and through a group; its refusal before its
// branch while a module its job needs is off (group, workspace); and the map it names only with the picture module on.
import assert from "node:assert/strict";
import { existsSync } from "node:fs";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import { dirname, join } from "node:path";
import { test } from "node:test";
import { outputText, readOutcome } from "../final-line.ts";
import {
	git,
	jobDir,
	jobFile,
	limen,
	type Plant,
	plant,
	repository,
	routed,
	startedJob,
	switchModules,
	TICKET,
	waitJob,
	writeRecord,
} from "../plant.ts";
import { snapshot } from "../snapshot.ts";

/** The `Map:` line of the task of a keeper started for one finished job of `p`'s ticket. */
async function keeperMapLine(p: Plant): Promise<string | undefined> {
	const id = "2026-11-27-f001-map-1a2b3c4d";
	const branch = "limen/f001-map";
	git(p.root, "branch", branch);
	await writeRecord(jobDir(p, id), { state: "done", label: "F001 map", branch });
	const keeper = startedJob(limen(p, ["keeper", TICKET, ...routed(["--job", id])]));
	waitJob(p, keeper);
	return jobFile(p, keeper, "task.md")
		.split("\n")
		.find((line) => line.startsWith("Map: "));
}

// G1.10, R-044 Decision 14: the packet's Map line is prompt text, so it follows the picture switch, not the folder.
test("the keeper's task reads Map: none while the picture module is off, though the project holds a map", async (t) => {
	const p = await plant();
	t.after(() => p.cleanup());
	assert.deepEqual([existsSync(join(p.root, ".limen/picture")), await keeperMapLine(p)], [true, "Map: none"]);
});

test("the keeper's task names the project's map while the picture module is on", async (t) => {
	const p = await plant({ modules: ["picture"] });
	t.after(() => p.cleanup());
	assert.equal(await keeperMapLine(p), `Map: ${join(p.root, ".limen/picture")}`);
});

/** A finished job `id` of the plant's ticket on its branch, and the group g1 that lists it as a team; its branch. */
async function groupJob(p: Plant, id: string): Promise<string> {
	const branch = "limen/f001-demo";
	git(p.root, "branch", branch);
	// A finished job with no process identity, so no live owner holds it back.
	await writeRecord(jobDir(p, id), { state: "done", label: "F001 demo", branch });
	const group = join(p.root, ".limen", "groups", "g1");
	await mkdir(group, { recursive: true });
	const member = { id, team: "a", role: "coordinator", deadline: 0 };
	await writeFile(join(group, "run.json"), `${JSON.stringify({ id: "g1", members: [member] })}\n`);
	return branch;
}

// G1.10, AC-16 (R-044 Decision 19 F5): a keeper of a group's jobs reads the group, so it refuses while the module is off.
test("MODULE_OFF: keeper --group with the group module off exits 1, names the field and leaves the snapshot identical", async (t) => {
	const p = await plant();
	t.after(() => p.cleanup());
	const branch = await groupJob(p, "2026-11-21-f001-demo-1a2b3c4d");
	const before = snapshot(p.root);
	const run = limen(p, ["keeper", TICKET, ...routed(["--group", "g1", "--candidate", branch])]);
	assert.deepEqual(
		[run.status, readOutcome(run), outputText(run).includes('("modules": {"group": true})'), snapshot(p.root)],
		[1, { class: "refused", code: "MODULE_OFF", next: null }, true, before],
		run.stderr,
	);
});

/**
 * A workspace beside the plant with the child repository `api`, the workspace module off once `limen workspace init`
 * ran, and one finished job of `api` whose branch holds the plant's ticket; the workspace, the repository and the id.
 */
async function workspaceJob(p: Plant): Promise<{ workspace: string; api: string; id: string }> {
	const workspace = join(p.parent, "workspace");
	const api = join(workspace, "api");
	await repository(api);
	await switchModules(workspace, ["workspace"]);
	assert.equal(limen(p, ["workspace", "init"], { cwd: workspace }).status, 0);
	git(api, "checkout", "-q", "-b", "limen/f001-ws");
	await mkdir(join(api, dirname(TICKET)), { recursive: true });
	await writeFile(join(api, TICKET), await readFile(join(p.root, TICKET), "utf8"));
	git(api, "add", "-A");
	git(api, "commit", "-q", "-m", "the ticket");
	git(api, "checkout", "-q", "main");
	const id = "2026-11-27-f001-ws-1a2b3c4d";
	await writeRecord(join(workspace, ".limen/jobs", id), {
		state: "done",
		label: "F001 ws",
		branch: "limen/f001-ws",
		repo: "api",
	});
	await switchModules(workspace, []);
	return { workspace, api, id };
}

// T-38 (R-044 Decision 20 G1): the keeper checks every switch its job needs before its first write, its branch, so a
// refusal leaves no branch even where the cleanup after a refused spawn would fail. A reference-transaction hook of the
// child repository records each change of its refs, a branch made and deleted again included.
test("MODULE_OFF: keeper of a workspace job with the workspace module off exits 1, never makes its branch and leaves the snapshot identical", async (t) => {
	const p = await plant();
	t.after(() => p.cleanup());
	const { workspace, api, id } = await workspaceJob(p);
	const hooks = join(p.parent, "api-hooks");
	const refs = join(p.parent, "api-refs.log");
	await mkdir(hooks);
	await writeFile(join(hooks, "reference-transaction"), `#!/bin/sh\ncat >> ${JSON.stringify(refs)}\n`, { mode: 0o755 });
	git(api, "config", "core.hooksPath", hooks);
	const before = snapshot(api, ["../.limen", "../spec"]);
	const run = limen(p, ["keeper", TICKET, ...routed(["--job", id])], { cwd: workspace });
	const changed = existsSync(refs) ? await readFile(refs, "utf8") : "";
	assert.deepEqual(
		[
			run.status,
			readOutcome(run),
			changed.includes("refs/heads/limen/keeper-"),
			snapshot(api, ["../.limen", "../spec"]),
		],
		[1, { class: "refused", code: "MODULE_OFF", next: null }, false, before],
		`${run.stderr}\n${changed}`,
	);
});

// R-022 (`review.md` → Round 3): the keeper keyed its queries by the word given, so a job named by its token and as a
// member of its group was read twice and stood twice in the keeper's task.
test("limen keeper: reads a job once when the command names it by its token and through its group", async (t) => {
	const p = await plant({ modules: ["group"] });
	t.after(() => p.cleanup());
	const id = "2026-11-21-f001-demo-1a2b3c4d";
	const branch = await groupJob(p, id);
	const run = limen(p, ["keeper", TICKET, ...routed(["--job", "1a2b3c4d", "--group", "g1", "--candidate", branch])]);
	const keeper = startedJob(run);
	waitJob(p, keeper);
	const blocks = jobFile(p, keeper, "task.md")
		.split("\n")
		.filter((line) => line.startsWith("Job: "));
	assert.deepEqual(blocks, [`Job: ${id}`]);
});
