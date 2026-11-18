// Group extension selections: one plant per test, the fake engine as `pi` (it records the argv it got), real bin/limen.
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { mkdir, readdir, readFile, rm, symlink, writeFile } from "node:fs/promises";
import { dirname, join } from "node:path";
import test from "node:test";
import { type GroupRun, readRun } from "../src/job/group-cabinet.ts";
import { git, jobDir, jobFile, limen, plant, type RunOptions, TICKET, waitJob } from "./plant.ts";

const lead = { PI_SESSION_ID: "extension-lead" };
const route = ["--engine", "pi", "--provider", "fixture", "--model", "fixture", "--thinking", "high"];
const team = "pi:fixture/fixture:high";
const settings = ["--team", team, "--team", team, "--workers", "3", "--timeout", "30m"];
// A Herdr that opens log tabs: role spaces and tabs get IDs; every other verb, such as the tail command, answers empty.
const herdr = `#!/usr/bin/env node
const { randomUUID } = require('node:crypto');
const args = process.argv.slice(2);
const ok = (result) => console.log(JSON.stringify({ result }));
if (args[0] === 'workspace' && args[1] === 'list') ok({ workspaces: [] });
else if (args[0] === 'workspace' && args[1] === 'create') ok({ workspace: { workspace_id: 'w1' } });
else if (args[0] === 'tab' && args[1] === 'create') { const id = randomUUID(); ok({ tab: { tab_id: 'w1:t' + id }, root_pane: { pane_id: 'w1:p' + id } }); }
else ok({});
`;
async function fixture() {
	const p = await plant();
	const feature = dirname(TICKET);
	await mkdir(join(p.root, feature, "group/teams"), { recursive: true });
	for (const path of ["group/brief.md", "group/teams/team-1.md", "group/teams/team-2.md"]) {
		await writeFile(join(p.root, feature, path), `# ${path}\n`);
	}
	git(p.root, "add", "-A");
	git(p.root, "commit", "-q", "-m", "group packet");
	await mkdir(join(p.root, ".limen/group-leads"), { recursive: true });
	await writeFile(join(p.root, ".limen/group-leads/extension-lead"), `${process.pid}\n`);
	const extensions = join(p.parent, "extensions");
	await mkdir(extensions);
	const common = join(extensions, "common.ts"),
		privatePath = join(extensions, "private = entry.ts");
	for (const path of [common, privatePath]) {
		await writeFile(path, "export default () => {};\n");
	}
	await symlink(common, join(extensions, "alias.ts"));
	await writeFile(join(p.parent, "herdr"), herdr, { mode: 0o755 });
	const mode = "--detached";
	const run = (args: readonly string[], options: RunOptions = {}) =>
		limen(p, args, { ...options, env: { ...lead, ...options.env } });
	const start = (...extra: string[]) => run(["group", "start", feature, ...settings, mode, ...extra]);
	const member = (run: GroupRun, team: string) => ({
		LIMEN_JOB: "1",
		LIMEN_JOB_ID: run.members.find((entry) => entry.team === team && entry.role === "coordinator")?.id ?? "",
		LIMEN_CONTEXT_ROOT: p.root,
		LIMEN_GROUP_ID: run.id,
		LIMEN_TEAM_ID: team,
	});
	const launch = (group: GroupRun, team: string, ...extra: string[]) =>
		run(["spawn", "candidate", ...route, mode, ...extra], { env: member(group, team) });
	const resume = (id: string, ...extra: string[]) => run(["continue", id, "follow-up", ...route, mode, ...extra]);
	const checkJob = async (id: string, selected: string[]) => {
		assert.equal(waitJob(p, id), "done");
		assert.deepEqual(JSON.parse(await readFile(join(jobDir(p, id), "extensions.json"), "utf8")), selected);
		const argv: string[] = JSON.parse(await readFile(join(jobDir(p, id), "fake-argv.json"), "utf8"));
		assert.ok(argv.includes("--no-extensions"));
		const loaded = argv.flatMap((arg, index) => (arg === "--extension" ? [argv[index + 1]] : []));
		for (const hook of ["finish", "steering", "communication", "group-peer"]) {
			assert.equal(loaded.filter((path) => path?.endsWith(`/hook/${hook}.ts`)).length, 1);
		}
		const chosen = loaded.filter((path) => path?.startsWith(extensions));
		assert.deepEqual(chosen, selected);
	};
	return { ...p, feature, extensions, common, privatePath, mode, run, start, launch, resume, checkJob };
}
const lastLine = (stdout: string) => stdout.trim().split("\n").at(-1) ?? "";

test("Pi teams keep common and private selections through workers, reviews and continuation", async (context) => {
	const f = await fixture();
	context.after(f.cleanup);
	const started = f.start(
		"--extension",
		f.common,
		"--extension",
		join(f.extensions, "alias.ts"),
		"--team-extension",
		`team-2=${f.privatePath}`,
		"--team-extension",
		`team-2=${f.common}`,
	);
	assert.equal(started.status, 0, started.stderr);
	const run = await readRun(f.root, lastLine(started.stdout));
	assert.deepEqual({ ...run.teamExtensions }, { "team-1": [f.common], "team-2": [f.common, f.privatePath] });
	for (const coordinator of run.members) {
		const expected = run.teamExtensions?.[coordinator.team] ?? [];
		await f.checkJob(coordinator.id, expected);
		const refused = f.launch(run, coordinator.team, "--extension", f.privatePath);
		assert.match(`${refused.status} ${refused.stderr}`, /^1 .*recorded team extensions/s);
		const child = f.launch(
			run,
			coordinator.team,
			...(coordinator.team === "team-1" ? expected.flatMap((path) => ["--extension", path]) : []),
		);
		assert.equal(child.status, 0, child.stderr);
		const id = lastLine(child.stdout);
		await f.checkJob(id, expected);
		const bad = f.resume(id, "--extension", f.privatePath);
		assert.match(`${bad.status} ${bad.stderr}`, /^1 .*recorded team extensions/s);
		const record = join(jobDir(f, id), "extensions.json");
		await writeFile(record, "[]\n");
		assert.match(f.resume(id).stderr, /parent does not match/);
		await writeFile(record, JSON.stringify(expected));
		const continued = f.resume(id);
		assert.equal(continued.status, 0, continued.stderr);
		const continuedId = lastLine(continued.stdout);
		await f.checkJob(continuedId, expected);
		const entry = (await readRun(f.root, run.id)).members.find((entry) => entry.id === continuedId);
		assert.deepEqual([entry?.parent, entry?.team], [id, coordinator.team]);
		assert.ok(entry && entry.deadline <= run.deadline - run.reserveMs);
		const branch = readFileSync(join(jobDir(f, id), "branch"), "utf8").trim();
		assert.equal(f.launch(run, coordinator.team, "--review", "--branch", "main").status, 1);
		const review = f.launch(run, coordinator.team, "--review", "--branch", branch);
		assert.equal(review.status, 0, review.stderr);
		await f.checkJob(lastLine(review.stdout), expected);
		assert.equal(f.resume(continuedId).status, 1, "continuation uses the total launch allowance");
		assert.match(f.resume(coordinator.id).stderr, /next group round/);
	}
});

test("a group started inside Herdr with no mode flag runs each team job detached, with a log tab", async (context) => {
	const f = await fixture();
	context.after(f.cleanup);
	const inside = { HERDR_ENV: "1", LIMEN_HERDR: join(f.parent, "herdr") };
	const started = f.run(["group", "start", f.feature, ...settings], { env: inside });
	assert.equal(started.status, 0, started.stderr);
	const run = await readRun(f.root, lastLine(started.stdout));
	assert.equal(run.members.length, 2);
	for (const member of run.members) {
		// `watch` is the mode of the log tab that follows a detached job's log.
		assert.equal(jobFile(f, member.id, "herdr/mode"), "watch", member.id);
		await f.checkJob(member.id, []);
	}
});

test("invalid group selections never activate or consume jobs, including later teams", async (context) => {
	const f = await fixture();
	context.after(f.cleanup);
	const trees = git(f.root, "worktree", "list", "--porcelain");
	for (const extra of [
		["--team-extension", "team-2=missing.ts"],
		["--team-extension", `team-9=${f.common}`],
		["--team-extension", "team-2="],
		["--team-extension", "wrong"],
		["--extension"],
		["--extension", "npm:package"],
	]) {
		const result = f.start("--extension", f.common, ...extra);
		assert.equal(result.status, 1, result.stderr);
	}
	assert.deepEqual(await readdir(join(f.root, ".limen/groups")).catch(() => []), []);
	assert.deepEqual(await readdir(join(f.root, ".limen/jobs")).catch(() => []), []);
	assert.equal(git(f.root, "worktree", "list", "--porcelain"), trees);
});

// Two concurrent starts ending in one run is s8's first test; here a repeated start must keep the first selections.
test("a repeated start keeps the original selections, even after a path disappears", async (context) => {
	const f = await fixture();
	context.after(f.cleanup);
	const started = f.start("--team-extension", `team-2=${f.privatePath}`);
	assert.equal(started.status, 0, started.stderr);
	const run = await readRun(f.root, lastLine(started.stdout));
	assert.deepEqual(run.teamExtensions?.["team-1"], []);
	for (const member of run.members) {
		await f.checkJob(member.id, run.teamExtensions?.[member.team] ?? []);
	}
	await rm(f.common);
	await rm(f.privatePath);
	const repeated = f.start("--extension", "missing-again.ts");
	assert.equal(repeated.status, 0, repeated.stderr);
	assert.equal(lastLine(repeated.stdout), run.id);
	assert.deepEqual((await readRun(f.root, run.id)).teamExtensions, run.teamExtensions);
	assert.equal((await readdir(join(f.root, ".limen/jobs"))).length, 2);
	assert.match(f.launch(run, "team-2").stderr, /cannot use extension/);
	assert.equal((await readRun(f.root, run.id)).members.length, 2);
});
