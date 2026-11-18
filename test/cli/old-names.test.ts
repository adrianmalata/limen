// The table of old names: a removed command, engine value or flag refuses with one line that names its replacement.
import assert from "node:assert/strict";
import { spawn } from "node:child_process";
import { createHash } from "node:crypto";
import { once } from "node:events";
import { existsSync, mkdirSync, readdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, join, relative } from "node:path";
import { test } from "node:test";
import { fileURLToPath } from "node:url";
import { isTerminal } from "../../src/job/job.ts";
import { engineEvents, git, jobDir, jobFile, limen, type Plant, plant, spawnJob, TICKET, until } from "../plant.ts";

const WAKE = fileURLToPath(new URL("../../hook/wake.ts", import.meta.url));
const REFUSAL = "limen webhook was removed with finish webhooks (R-002); the coordinator gets a wake when a job ends";
const LINEAR_REFUSAL =
	"limen linear was removed with the Linear mirror (R-003); spec/features/ is the only record of ticket state";
// Each removed engine value with its refusal, written out so that a change of wording fails here.
const ENGINE_REFUSALS = {
	devin: "engine devin was removed with Devin cloud jobs (R-003); use --engine pi",
	omp: "engine omp was removed with the OMP engine (R-004); use --engine pi",
};
/** The refusal of `--tab` on one command, written out so that a change of wording fails here. */
const tabRefusal = (command: string) =>
	`limen ${command} --tab was removed with hosted jobs (R-005); jobs run detached with a Herdr log tab; correct one with limen steer`;
// Each name R-006 removed with its refusal, written out so that a change of wording fails here.
const R006_REFUSALS = {
	planning: "limen planning was removed with private planning (R-006); planning files are committed to Git",
	highlight: "limen highlight was removed with the Herdr highlight (R-006); Herdr shows Limen's tabs without a mark",
	"ticket-author":
		"limen ticket-author was removed with ticket authorship (R-006); git log --diff-filter=A --follow -- <ticket path>",
	wait: "limen wait was removed with waiting on a job (R-006); the coordinator gets a wake when a job ends",
	"ticket series": "limen ticket series was removed with ticket series (R-006); each project numbers its own tickets",
	"continue --review":
		"limen continue --review was removed with reviews in a continued session (R-006); a re-review is a new review job: limen spawn --review",
	"group status --json":
		"limen group status --json was removed with the JSON group status (R-006); limen group status shows the run",
};
/** A job id that names no job: a refusal reads no job record, so the id need not exist. */
const NO_JOB = "2026-11-18-none-1a2b3c4d";

/** Resolves once the job's `state` is terminal, the commit point of its record. */
function ended(p: Plant, id: string): Promise<void> {
	return until(jobDir(p, id), () => isTerminal(jobFile(p, id, "state")));
}

/**
 * Resolves once the job's `state` is terminal and its wrapper removed `pid` and `born`, the last changes the wrapper
 * makes to the job's folder, so a snapshot of `.limen/` taken after it holds still.
 */
function settled(p: Plant, id: string): Promise<void> {
	const dir = jobDir(p, id);
	return until(
		dir,
		() => isTerminal(jobFile(p, id, "state")) && !existsSync(join(dir, "pid")) && !existsSync(join(dir, "born")),
	);
}

/** Every path under `dir` with a digest of its content, so a write, a new path or a removal shows as a difference. */
function snapshot(dir: string): Record<string, string> {
	const found: Record<string, string> = {};
	for (const entry of readdirSync(dir, { recursive: true, withFileTypes: true })) {
		const path = join(entry.parentPath, entry.name);
		found[relative(dir, path)] = entry.isFile()
			? createHash("sha256").update(readFileSync(path)).digest("hex")
			: entry.isDirectory()
				? "directory"
				: "other";
	}
	return found;
}

test("limen webhook test and limen webhook deliver refuse with one removal line and leave .limen/ unchanged", async (t) => {
	const p = await plant();
	t.after(() => p.cleanup());
	const before = snapshot(join(p.root, ".limen"));
	// An old hook or supervisor still runs `limen webhook deliver <receipt folder>`; the folder need not exist.
	for (const args of [
		["webhook", "test"],
		["webhook", "deliver", join(p.parent, "receipt")],
	]) {
		const run = limen(p, args);
		assert.notEqual(run.status, 0, args.join(" "));
		assert.equal(run.stderr, `${REFUSAL}\n`, args.join(" "));
	}
	assert.deepEqual(snapshot(join(p.root, ".limen")), before);
});

test("limen linear status and limen linear off refuse with one removal line and leave .limen/ and spec/ unchanged", async (t) => {
	const p = await plant();
	t.after(() => p.cleanup());
	// A project that still has its mirror config: the removed `off` renamed it to spec/linear.md.off.
	writeFileSync(join(p.root, "spec/linear.md"), "# Linear mirror\nTeam: T\nProject: P\n");
	const before = [snapshot(join(p.root, ".limen")), snapshot(join(p.root, "spec"))];
	for (const args of [
		["linear", "status"],
		["linear", "off"],
	]) {
		const run = limen(p, args);
		assert.notEqual(run.status, 0, args.join(" "));
		assert.equal(run.stderr, `${LINEAR_REFUSAL}\n`, args.join(" "));
	}
	assert.deepEqual([snapshot(join(p.root, ".limen")), snapshot(join(p.root, "spec"))], before);
});

test("spawn with a removed engine in --engine or in LIMEN_ENGINE refuses with one removal line and makes no job", async (t) => {
	const p = await plant();
	t.after(() => p.cleanup());
	const before = snapshot(join(p.root, ".limen"));
	for (const [engine, refusal] of Object.entries(ENGINE_REFUSALS)) {
		for (const [args, env] of [
			[["spawn", "--engine", engine, "work"], {}],
			[["spawn", "work"], { LIMEN_ENGINE: engine }],
		] as const) {
			const run = limen(p, args, { env });
			assert.notEqual(run.status, 0, args.join(" "));
			assert.equal(run.stderr, `${refusal}\n`, args.join(" "));
		}
	}
	assert.deepEqual(snapshot(join(p.root, ".limen")), before);
});

test("spawn, continue and group start refuse --tab with one removal line and leave no job, worktree, branch or group", async (t) => {
	const p = await plant();
	t.after(() => p.cleanup());
	const parent = spawnJob(p, "commit");
	await ended(p, parent);
	// What a half-made start would leave: a job folder, a worktree, a branch, a group folder.
	const groups = join(p.root, ".limen/groups");
	const traces = () => [
		readdirSync(join(p.root, ".limen/jobs")),
		git(p.root, "worktree", "list", "--porcelain"),
		git(p.root, "branch", "--list"),
		existsSync(groups) ? readdirSync(groups) : [],
	];
	const before = traces();
	const commands = {
		spawn: ["spawn", "--tab", "work"],
		continue: ["continue", parent, "--tab"],
		"group start": ["group", "start", dirname(TICKET), "--tab"],
	};
	const refused = Object.entries(commands).map(([command, args]) => {
		const run = limen(p, args);
		return [command, run.status !== 0, run.stderr];
	});
	assert.deepEqual(
		refused,
		Object.keys(commands).map((command) => [command, true, `${tabRefusal(command)}\n`]),
	);
	assert.deepEqual(traces(), before);
});

test("spawn --label --tab reads --tab as the label and starts the job", async (t) => {
	const p = await plant();
	t.after(() => p.cleanup());
	const id = spawnJob(p, "work", ["--label", "--tab"]);
	await ended(p, id);
	assert.deepEqual([jobFile(p, id, "label"), jobFile(p, id, "state")], ["--tab", "done"]);
});

test("limen planning, highlight, ticket-author and wait refuse with one removal line each and leave .limen/ unchanged", async (t) => {
	const p = await plant();
	t.after(() => p.cleanup());
	const before = snapshot(join(p.root, ".limen"));
	const commands = [
		["planning", ["planning", "private"]],
		["highlight", ["highlight", "on"]],
		["ticket-author", ["ticket-author", TICKET]],
		["wait", ["wait", NO_JOB]],
	] as const;
	const refused = commands.map(([name, args]) => {
		const run = limen(p, args);
		return [name, run.status !== 0, run.stderr];
	});
	assert.deepEqual(
		refused,
		commands.map(([name]) => [name, true, `${R006_REFUSALS[name]}\n`]),
	);
	assert.deepEqual(snapshot(join(p.root, ".limen")), before);
});

test("limen ticket series refuses with one removal line, with or without names, and leaves .limen/ unchanged", async (t) => {
	const p = await plant();
	t.after(() => p.cleanup());
	const before = snapshot(join(p.root, ".limen"));
	for (const args of [
		["ticket", "series"],
		["ticket", "series", "a", "b"],
	]) {
		const run = limen(p, args);
		assert.notEqual(run.status, 0, args.join(" "));
		assert.equal(run.stderr, `${R006_REFUSALS["ticket series"]}\n`, args.join(" "));
	}
	assert.deepEqual(snapshot(join(p.root, ".limen")), before);
});

test("limen continue --review refuses a finished job with one removal line and leaves .limen/ unchanged", async (t) => {
	const p = await plant();
	t.after(() => p.cleanup());
	const parent = spawnJob(p, "commit");
	await settled(p, parent);
	const before = snapshot(join(p.root, ".limen"));
	const run = limen(p, ["continue", parent, "--review", "x"]);
	assert.deepEqual([run.status !== 0, run.stderr], [true, `${R006_REFUSALS["continue --review"]}\n`]);
	assert.deepEqual(snapshot(join(p.root, ".limen")), before);
});

test("continue --label --review reads --review as the label and continues the job in its own role", async (t) => {
	const p = await plant();
	t.after(() => p.cleanup());
	const parent = spawnJob(p, "commit");
	await ended(p, parent);
	const run = limen(p, ["continue", parent, "--label", "--review", "x"]);
	assert.equal(run.status, 0, run.stderr);
	const id = run.stdout.trim().split("\n").at(-1) ?? "";
	await ended(p, id);
	assert.deepEqual(
		[jobFile(p, id, "label"), jobFile(p, id, "role"), jobFile(p, id, "state")],
		["--review", "worker", "done"],
	);
});

test("limen group status --json refuses with one removal line before a group id is read and leaves .limen/ unchanged", async (t) => {
	const p = await plant();
	t.after(() => p.cleanup());
	const before = snapshot(join(p.root, ".limen"));
	// Without a group id the lead's first word would be read as the id, so `--json` alone must refuse too.
	for (const args of [
		["group", "status", "--json"],
		["group", "status", "1a2b3c4d", "--json"],
	]) {
		const run = limen(p, args);
		assert.notEqual(run.status, 0, args.join(" "));
		assert.equal(run.stderr, `${R006_REFUSALS["group status --json"]}\n`, args.join(" "));
	}
	assert.deepEqual(snapshot(join(p.root, ".limen")), before);
});

test("/limen highlight on in a coordinator session notifies the removal line and leaves the wake mute state unchanged", async (t) => {
	const p = await plant();
	t.after(() => p.cleanup());
	// The fake engine runs the real wake hook and types each `/limen` line as a user would.
	const dir = join(p.parent, "coordinator");
	mkdirSync(dir);
	// A bare `/limen` toggles the mute state, so its notice shows the state the line before it left: off means unmuted.
	writeFileSync(join(dir, "task.md"), "/limen highlight on\n/limen\n");
	const args = ["--session-dir", join(dir, "session"), "--extension", WAKE, `@${join(dir, "task.md")}`];
	const env = { ...p.env, PI_SESSION_ID: "coord" };
	const session = spawn(join(p.bin, "pi"), args, { cwd: p.root, env, stdio: "ignore" });
	await once(session, "exit");
	const notices = engineEvents(dir)
		.filter((event) => event.event === "notify")
		.map((event) => event.text ?? "");
	assert.equal(notices.length, 2, notices.join("\n"));
	assert.equal(notices[0], R006_REFUSALS.highlight);
	assert.match(notices[1] ?? "", /^limen wake off\b/);
});

test("every old flag has a feature, a ticket and a pointer, and --detached is not an old flag", async () => {
	const { OLD_FLAGS, removedFlag } = await import("../../src/old-names.ts");
	for (const entry of OLD_FLAGS) {
		const empty = Object.entries({ feature: entry.feature, ticket: entry.ticket, instead: entry.instead })
			.filter(([, value]) => value.trim() === "")
			.map(([field]) => field);
		assert.deepEqual(empty, [], `old flag ${entry.command} ${entry.name}`);
	}
	for (const command of ["spawn", "continue", "group start"]) {
		assert.equal(removedFlag(command, "--detached"), undefined, command);
	}
});

test("every old name has a feature, a ticket and a pointer, and src/main.ts registers none of them", async () => {
	// Imported here, so the CLI tests above fail at their own assertions before the table exists.
	const { OLD_NAMES } = await import("../../src/old-names.ts");
	const { COMMAND_NAMES } = await import("../../src/main.ts");
	for (const entry of OLD_NAMES) {
		const empty = Object.entries({ feature: entry.feature, ticket: entry.ticket, instead: entry.instead })
			.filter(([, value]) => value.trim() === "")
			.map(([field]) => field);
		assert.deepEqual(empty, [], `old name ${entry.name}`);
	}
	assert.deepEqual(
		OLD_NAMES.filter((entry) => COMMAND_NAMES.includes(entry.name)).map((entry) => entry.name),
		[],
	);
});

test("every old engine has a feature, a ticket and a pointer, and engineProfile refuses each with its line", async () => {
	const { OLD_ENGINES, removedEngine } = await import("../../src/old-names.ts");
	const { engineProfile } = await import("../../src/runtime/engine.ts");
	for (const entry of OLD_ENGINES) {
		const empty = Object.entries({ feature: entry.feature, ticket: entry.ticket, instead: entry.instead })
			.filter(([, value]) => value.trim() === "")
			.map(([field]) => field);
		assert.deepEqual(empty, [], `old engine ${entry.name}`);
		assert.throws(() => engineProfile(entry.name), { message: removedEngine(entry.name) }, entry.name);
	}
});
