// The table of old names: a removed command, engine value, flag or role refuses with one line that names its replacement.
import assert from "node:assert/strict";
import { spawn } from "node:child_process";
import { once } from "node:events";
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { type TestContext, test } from "node:test";
import { fileURLToPath } from "node:url";
import { isTerminal } from "../../src/job/job.ts";
import { commandOf } from "../../src/main.ts";
import { OLD_ENGINES, OLD_FLAGS, OLD_NAMES, OLD_ROLES } from "../../src/old-names.ts";
import { LimenError } from "../../src/outcome.ts";
import { checkNext, outputText, readOutcome } from "../final-line.ts";
import {
	engineEvents,
	jobDir,
	jobRecord,
	jobState,
	limen,
	type Plant,
	plant,
	spawnJob,
	startedJob,
	TICKET,
	until,
	waitJob,
} from "../plant.ts";
import { snapshot } from "../snapshot.ts";

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
// Each name R-007 removed with its refusal, written out so that a change of wording fails here.
const R007_REFUSALS = {
	"picture tick":
		"limen picture tick was removed with the map jobs (R-007); no job refreshes the map; limen picture build checks it",
	"picture watch":
		"limen picture watch was removed with the map watch (R-007); limen status lists a leftover watch hook and limen init --drop-leftovers removes it",
	"picture build --out":
		"limen picture build --out was removed with the Picture viewer (R-007); picture build writes no page; --json F writes the model",
	"picture serve --dir":
		"limen picture serve --dir was removed with the Picture viewer (R-007); picture serve serves the jobs of the project it runs in, at /activity.json and /events",
	"role picture": "role picture was removed with the map jobs (R-007); no role maintains the map",
};
// The role R-009 removed with its refusal, written out so that a change of wording fails here.
const SCOUT_REFUSAL =
	"role scout was removed with the scout role (R-009); the coordinator answers a short question itself; a long one is a survey job, whose deliverable is a notes file";
/** The four route flags that `spawn` requires (D-043), and that `picture tick` and `picture watch on` took. */
const ROUTE = ["--engine", "pi", "--provider", "p", "--model", "m", "--thinking", "t"];
/** A job id that names no job: a refusal reads no job record, so the id need not exist. */
const NO_JOB = "2026-11-18-none-1a2b3c4d";

/** Resolves once the job's record is terminal, the commit point of its end. */
function ended(p: Plant, id: string): Promise<void> {
	return until(jobDir(p, id), () => isTerminal(jobState(p, id)));
}

/**
 * Resolves once the job's record is terminal and its wrapper has exited, after the last change the wrapper makes to
 * the job's folder, so a snapshot of `.limen/` taken after it holds still.
 */
async function settled(p: Plant, id: string): Promise<void> {
	waitJob(p, id);
}

test("limen webhook test and limen webhook deliver refuse with one removal line and leave .limen/ unchanged", async (t) => {
	const p = await plant();
	t.after(() => p.cleanup());
	const before = snapshot(p.root);
	// An old hook or supervisor still runs `limen webhook deliver <receipt folder>`; the folder need not exist.
	for (const args of [
		["webhook", "test"],
		["webhook", "deliver", join(p.parent, "receipt")],
	]) {
		const run = limen(p, args);
		assert.notEqual(run.status, 0, args.join(" "));
		assert.equal(outputText(run), `${REFUSAL}\n`, args.join(" "));
	}
	assert.deepEqual(snapshot(p.root), before);
});

test("limen linear status and limen linear off refuse with one removal line and leave .limen/ and spec/ unchanged", async (t) => {
	const p = await plant();
	t.after(() => p.cleanup());
	// A project that still has its mirror config: the removed `off` renamed it to spec/linear.md.off.
	writeFileSync(join(p.root, "spec/linear.md"), "# Linear mirror\nTeam: T\nProject: P\n");
	const before = snapshot(p.root);
	for (const args of [
		["linear", "status"],
		["linear", "off"],
	]) {
		const run = limen(p, args);
		assert.notEqual(run.status, 0, args.join(" "));
		assert.equal(outputText(run), `${LINEAR_REFUSAL}\n`, args.join(" "));
	}
	assert.deepEqual(snapshot(p.root), before);
});

test("spawn with a removed engine in --engine refuses with one removal line and makes no job", async (t) => {
	const p = await plant();
	t.after(() => p.cleanup());
	const before = snapshot(p.root);
	for (const [engine, refusal] of Object.entries(ENGINE_REFUSALS)) {
		const run = limen(p, ["spawn", "--engine", engine, ...ROUTE.slice(2), "work"]);
		assert.notEqual(run.status, 0, engine);
		assert.equal(outputText(run), `${refusal}\n`, engine);
	}
	assert.deepEqual(snapshot(p.root), before);
});

test("spawn, continue and group start refuse --tab with one removal line and leave no job, worktree, branch or group", async (t) => {
	const p = await plant();
	t.after(() => p.cleanup());
	const parent = spawnJob(p, "commit");
	await settled(p, parent);
	// What a half-made start would leave (a job folder, a worktree, a branch, a group folder) changes the snapshot.
	const before = snapshot(p.root);
	const commands = {
		spawn: ["spawn", "--tab", "work"],
		continue: ["continue", parent, "--tab"],
		"group start": ["group", "start", dirname(TICKET), "--tab"],
	};
	const refused = Object.entries(commands).map(([command, args]) => {
		const run = limen(p, args);
		return [command, run.status !== 0, outputText(run)];
	});
	assert.deepEqual(
		refused,
		Object.keys(commands).map((command) => [command, true, `${tabRefusal(command)}\n`]),
	);
	assert.deepEqual(snapshot(p.root), before);
});

test("spawn --label --tab reads --tab as the label and starts the job", async (t) => {
	const p = await plant();
	t.after(() => p.cleanup());
	const id = spawnJob(p, "work", ["--label", "--tab"]);
	await ended(p, id);
	assert.deepEqual([jobRecord(p, id)?.label, jobState(p, id)], ["--tab", "done"]);
});

test("limen planning, highlight, ticket-author and wait refuse with one removal line each and leave .limen/ unchanged", async (t) => {
	const p = await plant();
	t.after(() => p.cleanup());
	const before = snapshot(p.root);
	const commands = [
		["planning", ["planning", "private"]],
		["highlight", ["highlight", "on"]],
		["ticket-author", ["ticket-author", TICKET]],
		["wait", ["wait", NO_JOB]],
	] as const;
	const refused = commands.map(([name, args]) => {
		const run = limen(p, args);
		return [name, run.status !== 0, outputText(run)];
	});
	assert.deepEqual(
		refused,
		commands.map(([name]) => [name, true, `${R006_REFUSALS[name]}\n`]),
	);
	assert.deepEqual(snapshot(p.root), before);
});

test("limen ticket series refuses with one removal line, with or without names, and leaves .limen/ unchanged", async (t) => {
	const p = await plant();
	t.after(() => p.cleanup());
	const before = snapshot(p.root);
	for (const args of [
		["ticket", "series"],
		["ticket", "series", "a", "b"],
	]) {
		const run = limen(p, args);
		assert.notEqual(run.status, 0, args.join(" "));
		assert.equal(outputText(run), `${R006_REFUSALS["ticket series"]}\n`, args.join(" "));
	}
	assert.deepEqual(snapshot(p.root), before);
});

test("limen continue --review refuses a finished job with one removal line and leaves .limen/ unchanged", async (t) => {
	const p = await plant();
	t.after(() => p.cleanup());
	const parent = spawnJob(p, "commit");
	await settled(p, parent);
	const before = snapshot(p.root);
	const run = limen(p, ["continue", parent, "--review", "x"]);
	assert.deepEqual([run.status !== 0, outputText(run)], [true, `${R006_REFUSALS["continue --review"]}\n`]);
	assert.deepEqual(snapshot(p.root), before);
});

test("continue --label --review reads --review as the label and continues the job in its own role", async (t) => {
	const p = await plant();
	t.after(() => p.cleanup());
	const parent = spawnJob(p, "commit");
	await ended(p, parent);
	const run = limen(p, ["continue", parent, "--label", "--review", "x"]);
	assert.equal(run.status, 0, run.stderr);
	const id = startedJob(run);
	await ended(p, id);
	assert.deepEqual([jobRecord(p, id)?.label, jobRecord(p, id)?.role, jobState(p, id)], ["--review", "worker", "done"]);
});

test("limen group status --json refuses with one removal line before a group id is read and leaves .limen/ unchanged", async (t) => {
	const p = await plant();
	t.after(() => p.cleanup());
	const before = snapshot(p.root);
	// Without a group id the lead's first word would be read as the id, so `--json` alone must refuse too.
	for (const args of [
		["group", "status", "--json"],
		["group", "status", "1a2b3c4d", "--json"],
	]) {
		const run = limen(p, args);
		assert.notEqual(run.status, 0, args.join(" "));
		assert.equal(outputText(run), `${R006_REFUSALS["group status --json"]}\n`, args.join(" "));
	}
	assert.deepEqual(snapshot(p.root), before);
});

test("limen picture tick and limen picture watch refuse with one removal line, whatever words follow, and leave .limen/ and .git/hooks/ unchanged", async (t) => {
	const p = await plant();
	t.after(() => p.cleanup());
	// `picture watch on` wrote its hook here; a Git without hook templates makes no such folder at init.
	mkdirSync(join(p.root, ".git/hooks"), { recursive: true });
	const state = () => snapshot(p.root, [".git/hooks"]);
	const before = state();
	const commands = [
		["picture tick", ["picture", "tick", ...ROUTE]],
		["picture watch", ["picture", "watch"]],
		["picture watch", ["picture", "watch", "on", ...ROUTE]],
		["picture watch", ["picture", "watch", "off"]],
	] as const;
	const refused = commands.map(([name, args]) => {
		const run = limen(p, args);
		return [name, run.status !== 0, outputText(run)];
	});
	assert.deepEqual(
		refused,
		commands.map(([name]) => [name, true, `${R007_REFUSALS[name]}\n`]),
	);
	assert.deepEqual(state(), before);
});

test("picture build --out and picture serve --dir refuse with one removal line before anything is read or written", async (t) => {
	const p = await plant();
	t.after(() => p.cleanup());
	mkdirSync(join(p.root, ".git/hooks"), { recursive: true });
	const state = () => snapshot(p.root, [".git/hooks"]);
	const before = state();
	// The serve's `--dir` names a folder with no map, so a serve that read it would fail with another line.
	const commands = [
		["picture build --out", ["picture", "build", "--out", "x.html"]],
		["picture serve --dir", ["picture", "serve", "--dir", "x"]],
	] as const;
	const refused = commands.map(([name, args]) => {
		const run = limen(p, args);
		return [name, run.status !== 0, outputText(run)];
	});
	assert.deepEqual(
		refused,
		commands.map(([name]) => [name, true, `${R007_REFUSALS[name]}\n`]),
	);
	assert.deepEqual(state(), before);
});

test("resolvePreamble throws the removal line of the role picture in a project without .agents/limen/picture.md", async (t) => {
	const { resolvePreamble } = await import("../../src/job/spawning.ts");
	const root = mkdtempSync(join(tmpdir(), "limen-role-"));
	t.after(() => rmSync(root, { recursive: true, force: true }));
	assert.throws(() => resolvePreamble(root, "picture"), { message: R007_REFUSALS["role picture"] });
});

test("resolvePreamble returns the project's own .agents/limen/picture.md, so a project keeps a role of that name", async (t) => {
	const { resolvePreamble } = await import("../../src/job/spawning.ts");
	const root = mkdtempSync(join(tmpdir(), "limen-role-"));
	t.after(() => rmSync(root, { recursive: true, force: true }));
	mkdirSync(join(root, ".agents/limen"), { recursive: true });
	writeFileSync(join(root, ".agents/limen/picture.md"), "# The project's own picture role\n");
	assert.equal(resolvePreamble(root, "picture"), `${root}/.agents/limen/picture.md`);
});

test("spawn --role picture refuses with the removal line and leaves no job, worktree or branch", async (t) => {
	const p = await plant();
	t.after(() => p.cleanup());
	const before = snapshot(p.root);
	const run = limen(p, ["spawn", "--role", "picture", ...ROUTE, "work"]);
	assert.deepEqual([run.status !== 0, outputText(run)], [true, `${R007_REFUSALS["role picture"]}\n`]);
	assert.deepEqual(snapshot(p.root), before);
});

test("continue refuses a job of the role picture once the project's own role file is gone, and leaves .limen/ unchanged", async (t) => {
	const p = await plant();
	t.after(() => p.cleanup());
	// A job started under the project's own role file, as a picture job started before the cut ran on the template.
	const role = join(p.root, ".agents/limen/picture.md");
	mkdirSync(dirname(role), { recursive: true });
	writeFileSync(role, "# The project's own picture role\n");
	const parent = spawnJob(p, "commit", ["--role", "picture"]);
	await settled(p, parent);
	rmSync(role);
	const before = snapshot(p.root);
	const run = limen(p, ["continue", parent, "x"]);
	assert.deepEqual([run.status !== 0, outputText(run)], [true, `${R007_REFUSALS["role picture"]}\n`]);
	assert.deepEqual(snapshot(p.root), before);
});

test("resolvePreamble throws the removal line of the role scout in a project without .agents/limen/scout.md", async (t) => {
	const { resolvePreamble } = await import("../../src/job/spawning.ts");
	const root = mkdtempSync(join(tmpdir(), "limen-role-"));
	t.after(() => rmSync(root, { recursive: true, force: true }));
	assert.throws(() => resolvePreamble(root, "scout"), { message: SCOUT_REFUSAL });
});

test("resolvePreamble returns the project's own .agents/limen/scout.md, so a project keeps a role of that name", async (t) => {
	const { resolvePreamble } = await import("../../src/job/spawning.ts");
	const root = mkdtempSync(join(tmpdir(), "limen-role-"));
	t.after(() => rmSync(root, { recursive: true, force: true }));
	mkdirSync(join(root, ".agents/limen"), { recursive: true });
	writeFileSync(join(root, ".agents/limen/scout.md"), "# The project's own scout role\n");
	assert.equal(resolvePreamble(root, "scout"), `${root}/.agents/limen/scout.md`);
});

test("spawn --role scout refuses with the removal line and leaves no job, worktree or branch", async (t) => {
	const p = await plant();
	t.after(() => p.cleanup());
	const before = snapshot(p.root);
	const run = limen(p, ["spawn", "--role", "scout", ...ROUTE, "work"]);
	assert.deepEqual([run.status !== 0, outputText(run)], [true, `${SCOUT_REFUSAL}\n`]);
	assert.deepEqual(snapshot(p.root), before);
});

test("continue refuses a job of the role scout once the project's own role file is gone, and leaves .limen/ unchanged", async (t) => {
	const p = await plant();
	t.after(() => p.cleanup());
	// A job started under the project's own role file, as a scout job started before the cut ran on the template.
	const role = join(p.root, ".agents/limen/scout.md");
	mkdirSync(dirname(role), { recursive: true });
	writeFileSync(role, "# The project's own scout role\n");
	const parent = spawnJob(p, "commit", ["--role", "scout"]);
	await settled(p, parent);
	rmSync(role);
	const before = snapshot(p.root);
	const run = limen(p, ["continue", parent, "x"]);
	assert.deepEqual([run.status !== 0, outputText(run)], [true, `${SCOUT_REFUSAL}\n`]);
	assert.deepEqual(snapshot(p.root), before);
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

test("every old name has a feature, a ticket and a pointer, and the command registry holds none of them", async () => {
	// Imported here, so the CLI tests above fail at their own assertions before the table exists.
	const { OLD_NAMES } = await import("../../src/old-names.ts");
	const { COMMAND_NAMES } = await import("../../src/registry.ts");
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

/**
 * D-046 (1): the `next` of each removed name whose successor is a fixed command or one built from the words after the
 * name, by the name as its refusal line shows it, first with no words after it and then with `a1b2c3d4`. Every other
 * removed command, flag, engine value and role has null, and the sentence of its line says what to do instead.
 */
const NEXTS: Readonly<Record<string, readonly [string, string]>> = {
	"picture tick": ["limen picture build", "limen picture build"],
	"picture watch": ["limen status", "limen status"],
	jobs: ["limen status --all", "limen show a1b2c3d4"],
	queue: ["limen seat queue", "limen seat queue"],
	sweep: ["limen seat sweep", "limen seat sweep"],
	"group status --json": ["limen group status", "limen group status a1b2c3d4"],
};

/** The `next` that NEXTS gives a removed name with no words after it. */
const nextOf = (name: string): string | null => NEXTS[name]?.[0] ?? null;

/** Every entry of the table of old names, by the name as its refusal line shows it. */
async function oldEntries() {
	const old = await import("../../src/old-names.ts");
	return [
		...old.OLD_NAMES.map((entry) => [entry.name, entry] as const),
		...old.OLD_FLAGS.map((entry) => [`${entry.command} ${entry.name}`, entry] as const),
		...old.OLD_ENGINES.map((entry) => [`engine ${entry.name}`, entry] as const),
		...old.OLD_ROLES.map((entry) => [`role ${entry.name}`, entry] as const),
	];
}

test("D-046 (1): a removed name has a next only when its successor is a fixed command or one built from its words", async () => {
	// Imported here, so the CLI tests below fail at their own assertions before the function exists.
	const { oldNext } = await import("../../src/parser.ts");
	const entries = await oldEntries();
	assert.deepEqual(
		Object.fromEntries(entries.map(([name, entry]) => [name, [oldNext(entry, []), oldNext(entry, ["a1b2c3d4"])]])),
		Object.fromEntries(entries.map(([name]) => [name, NEXTS[name] ?? [null, null]])),
	);
});

test("D-046 (3): every next of the table of old names is null or a command that main runs", async () => {
	const { oldNext } = await import("../../src/parser.ts");
	for (const [, entry] of await oldEntries()) {
		for (const words of [[], ["a1b2c3d4"]]) {
			checkNext(oldNext(entry, words));
		}
	}
});

type Form = readonly [readonly string[], string | null];

/** Runs each form in a fresh project; each must exit 2 with `REMOVED` and its `next`. */
async function refusesAsRemoved(t: TestContext, forms: readonly Form[]): Promise<void> {
	const p = await plant();
	t.after(() => p.cleanup());
	const refused = forms.map(([args]) => {
		const run = limen(p, args);
		return [args.join(" "), run.status, readOutcome(run)];
	});
	assert.deepEqual(
		refused,
		forms.map(([args, next]) => [args.join(" "), 2, { class: "usage", code: "REMOVED", next }]),
	);
}

test("REMOVED: every removed command and subcommand on the command line exits 2 and names what replaced it", async (t) => {
	// `jobs` names one of two new forms; the test below holds both.
	const forms = OLD_NAMES.filter((old) => old.name !== "jobs").map(
		(old) => [old.name.split(" "), nextOf(old.name)] as const,
	);
	await refusesAsRemoved(t, forms);
});

test("REMOVED: every removed flag on the command line exits 2 and names what replaced it", async (t) => {
	await refusesAsRemoved(
		t,
		OLD_FLAGS.map((old) => [[...old.command.split(" "), old.name], nextOf(`${old.command} ${old.name}`)] as const),
	);
});

test("REMOVED: group status with a group id and the removed --json names group status with that id", async (t) => {
	await refusesAsRemoved(t, [
		[["group", "status", "a1b2c3d4", "--json"], "limen group status a1b2c3d4"],
		[["group", "status", "--json", "a1b2c3d4"], "limen group status a1b2c3d4"],
	]);
});

test("REMOVED: every removed engine value of spawn --engine exits 2 and names what replaced it", async (t) => {
	await refusesAsRemoved(
		t,
		OLD_ENGINES.map(
			(old) => [["spawn", "--engine", old.name, ...ROUTE.slice(2), "work"], nextOf(`engine ${old.name}`)] as const,
		),
	);
});

test("REMOVED: every removed role of spawn --role exits 2 and names what replaced it", async (t) => {
	await refusesAsRemoved(
		t,
		OLD_ROLES.map((old) => [["spawn", "--role", old.name, ...ROUTE, "work"], nextOf(`role ${old.name}`)] as const),
	);
});

/** The first lines of the refusals of the renamed `queue` and the split `jobs`, which say what happened to them. */
const JOBS_LINE =
	"limen jobs was split into limen status --all, which lists every job, and limen show <job>, which shows one (R-014)";
const QUEUE_LINE = "limen queue was renamed to limen seat queue (R-014)";

test("REMOVED: limen jobs <ref> names limen show <ref>, and every other form of limen jobs names limen status --all", async (t) => {
	const p = await plant();
	t.after(() => p.cleanup());
	const forms = [
		[["jobs", "a1b2c3d4"], "limen show a1b2c3d4"],
		[["jobs"], "limen status --all"],
		[["jobs", "--all"], "limen status --all"],
		[["jobs", "--running"], "limen status --all"],
		[["jobs", "--label", "x"], "limen status --all"],
	] as const;
	const refused = forms.map(([args]) => {
		const run = limen(p, args);
		return [args.join(" "), run.status, readOutcome(run), outputText(run).split("\n")[0]];
	});
	assert.deepEqual(
		refused,
		forms.map(([args, next]) => [args.join(" "), 2, { class: "usage", code: "REMOVED", next }, JOBS_LINE]),
	);
});

test("REMOVED: the shared parser reads the words of limen jobs, so limen jobs -- a1b2c3d4 names limen show a1b2c3d4", async (t) => {
	const p = await plant();
	t.after(() => p.cleanup());
	const run = limen(p, ["jobs", "--", "a1b2c3d4"]);
	assert.deepEqual(
		[run.status, readOutcome(run)],
		[2, { class: "usage", code: "REMOVED", next: "limen show a1b2c3d4" }],
	);
});

/** The `next` of the refusal of `limen jobs` with `words` after it, as `main` reads the command line. */
function jobsNext(words: readonly string[]): string | null {
	try {
		commandOf(["jobs", ...words]);
	} catch (error) {
		if (error instanceof LimenError && error.code === "REMOVED") {
			return error.next;
		}
		throw error;
	}
	return assert.fail(`limen jobs ${words.join(" ")} was not refused`);
}

// D-045 (2), D-046: a flag among the old words asks for the list, so only a job word alone names `show`, and the word
// goes into the command as a shell reads it back.
test("REMOVED: a form of limen jobs with a flag names limen status --all, a ref alone names limen show <ref>, and each next is a command main runs", () => {
	const forms: ReadonlyArray<readonly [readonly string[], string]> = [
		[[], "limen status --all"],
		[["--all"], "limen status --all"],
		[["--running"], "limen status --all"],
		[["--active"], "limen status --all"],
		[["--label", "x"], "limen status --all"],
		[["--bogus"], "limen status --all"],
		[["--all", "a1b2c3d4"], "limen status --all"],
		[["a1b2c3d4", "--running"], "limen status --all"],
		[["a1b2c3d4"], "limen show a1b2c3d4"],
		[["--", "a1b2c3d4"], "limen show a1b2c3d4"],
		[["--", "--all"], "limen show -- --all"],
		[["a b"], "limen show 'a b'"],
	];
	const nexts = forms.map(([words]) => jobsNext(words));
	assert.deepEqual(
		nexts,
		forms.map(([, next]) => next),
	);
	for (const next of nexts) {
		checkNext(next);
	}
});

test("REMOVED: limen queue exits 2, says it was renamed and names limen seat queue", async (t) => {
	const p = await plant();
	t.after(() => p.cleanup());
	const run = limen(p, ["queue"]);
	assert.deepEqual(
		[run.status, readOutcome(run), outputText(run).split("\n")[0]],
		[2, { class: "usage", code: "REMOVED", next: "limen seat queue" }, QUEUE_LINE],
	);
});
