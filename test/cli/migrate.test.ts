// `limen migrate`: the job folders an older Limen wrote, one plain file per value, become `record.json` (D-057), on
// fixtures of such folders. Nothing of a migrated folder is lost, a folder without a known state moves unchanged, the
// report names older ids and token collisions, a dry run writes nothing, a second run has nothing to do, and the
// migration refuses while a job runs. Until it ran, a command that reads jobs refuses the project.
import assert from "node:assert/strict";
import { existsSync, readdirSync, readFileSync, statSync, utimesSync } from "node:fs";
import { mkdir, rm, writeFile } from "node:fs/promises";
import { dirname, join } from "node:path";
import { type TestContext, test } from "node:test";
import { readProgressSync, readRecordSync } from "../../src/job/record.ts";
import { outputText, readOutcome } from "../../src/outcome.ts";
import { limen, type Plant, plant, routed } from "../plant.ts";

/** A project with no job yet; removed after the test. */
async function project(t: TestContext): Promise<Plant> {
	const p = await plant();
	t.after(() => p.cleanup());
	return p;
}

/** Writes the folder `id` of the older record with `files`, each a path below the folder and its text. */
async function oldFolder(p: Plant, id: string, files: Readonly<Record<string, string>>): Promise<string> {
	const dir = join(p.root, ".limen", "jobs", id);
	await mkdir(dir, { recursive: true });
	for (const [name, text] of Object.entries(files)) {
		await mkdir(dirname(join(dir, name)), { recursive: true });
		await writeFile(join(dir, name), text);
	}
	return dir;
}

/** Every file below `dir` with its text, by its path below `dir`. */
function tree(dir: string): Record<string, string> {
	const files: Record<string, string> = {};
	for (const entry of readdirSync(dir, { recursive: true, withFileTypes: true })) {
		if (entry.isFile()) {
			const path = join(entry.parentPath, entry.name);
			files[path.slice(dir.length + 1)] = readFileSync(path, "utf8");
		}
	}
	return files;
}

const STARTED = "2026-11-01T10:00:00.000Z";
const FINISHED = "2026-11-01T11:00:00.000Z";
const QUEUED = '{"since":"2026-11-01T09:59:00.000Z","detail":"the seat is busy","ahead":1}\n';
/** The content files of a job: they stay as they are. */
const CONTENT = {
	"task.md": "do the old work\n",
	log: "[limen 2026-11-01T10:00:01.000Z] worker started\n",
	result: "the old result\n",
	"note.md": "a note\n",
	"note.first.md": "the first note\n",
	"start-notice": "started\n",
	"session/2026-11-01T10-00-00Z_a.jsonl": '{"type":"session"}\n',
	"notify/seat/_terminal.stopped.1": "",
	"steer/inbox/0001": "steer me\n",
	"recovery/claim": "x\n",
	cleanup: "[limen 2026-11-01T11:00:01.000Z] termination unconfirmed\n",
	"herdr/mode": "watch\n",
};
/** A stopped job of an older Limen with a file for every value its record holds. */
const OLD_JOB = {
	state: "stopped\n",
	"started-at": `${STARTED}\n`,
	"finished-at": `${FINISHED}\n`,
	label: "F001 old work\n",
	branch: "limen/f001-old\n",
	worktree: "/work/trees/f001-old\n",
	base: "0123abc\n",
	role: "worker\n",
	repo: "app\n",
	candidate: "4567def\n",
	parent: "2026-10-31-parent-1a2b3c4d\n",
	group: "g1\n",
	team: "team-1\n",
	"origin-tab": "tab-1\n",
	"origin-pane": "pane-2\n",
	"origin-session": "session-3\n",
	spawner: "the coordinator in tab-1\n",
	"spawned-by": "2026-10-31-boss-1a2b3c4d\n",
	priority: "2\n",
	engine: "pi\n",
	model: "anthropic/claude-opus\n",
	"extensions.json": '["/work/ext/one.ts"]\n',
	starting: "4241\n",
	pid: "4242\n",
	born: "123456\n",
	queued: QUEUED,
	"stop-requested": "the owner stopped it\n",
	advisory: "tool stall observation uncertain\n",
	"stop-reason": "stop\n",
	"open-checks": "check one\ncheck two\n",
	commits: "abc1234 first\ndef5678 second\n",
	versions: "pi 1.2.3\n",
	"tool-calls": "7\n",
	"last-tool": "bash\n",
	activity: "tool\n",
	...CONTENT,
};

// T-28 (3): an operation that moves data loses nothing; every value of the older files is in the record or the
// progress file, and every content file stays byte for byte.
test("a valid older job becomes a record holding every value of its files, and its content files stay", async (t) => {
	const p = await project(t);
	const id = "2026-11-01-f001-old-1a2b3c4d";
	const dir = await oldFolder(p, id, OLD_JOB);
	const advisoryAt = new Date(statSync(join(dir, "advisory")).mtimeMs).toISOString();
	const run = limen(p, ["migrate"]);
	assert.equal(run.status, 0, run.stderr);
	const { migrated, ...record } = readRecordSync(dir) ?? assert.fail("no record written");
	assert.ok(migrated && Number.isFinite(Date.parse(migrated.at)), "the record is marked migrated");
	assert.deepEqual(record, {
		version: 1,
		id,
		state: "stopped",
		transitions: [
			{ from: null, to: "starting", at: STARTED },
			{ from: null, to: "stopped", at: FINISHED },
		],
		identity: { pid: 4242, born: "123456", bootId: null },
		label: "F001 old work",
		branch: "limen/f001-old",
		worktree: "/work/trees/f001-old",
		base: "0123abc",
		role: "worker",
		repo: "app",
		origin: { tab: "tab-1", pane: "pane-2", session: "session-3" },
		group: "g1",
		team: "team-1",
		parent: "2026-10-31-parent-1a2b3c4d",
		spawner: "the coordinator in tab-1",
		spawnedBy: "2026-10-31-boss-1a2b3c4d",
		candidate: "4567def",
		priority: 2,
		route: { engine: "pi", model: "anthropic/claude-opus", provider: null, thinking: null },
		extensions: ["/work/ext/one.ts"],
		spawnerPid: 4241,
		startedAt: STARTED,
		finishedAt: FINISHED,
		failure: null,
		sideFailures: [],
		queued: { since: "2026-11-01T09:59:00.000Z", detail: "the seat is busy", ahead: 1 },
		stopRequested: "the owner stopped it",
		advisory: { text: "tool stall observation uncertain", at: advisoryAt },
		stopReason: "stop",
		openChecks: ["check one", "check two"],
		commits: ["abc1234 first", "def5678 second"],
		versions: "pi 1.2.3",
	});
	assert.deepEqual(readProgressSync(dir), { activity: "tool", lastTool: "bash", toolCalls: 7 });
	assert.deepEqual(tree(dir), {
		...CONTENT,
		"record.json": readFileSync(join(dir, "record.json"), "utf8"),
		"progress.json": readFileSync(join(dir, "progress.json"), "utf8"),
	});
});

test("a folder without a state or with a state Limen does not know moves unchanged to .limen/unmigrated/", async (t) => {
	const p = await project(t);
	const orphan = "2026-11-02-orphan-1a2b3c4d";
	const odd = "2026-11-02-odd-5e6f7a8b";
	await oldFolder(p, orphan, { label: "never published\n", "task.md": "orphan\n" });
	await oldFolder(p, odd, { state: "paused\n", label: "odd\n", log: "odd log\n" });
	const before = {
		orphan: tree(join(p.root, ".limen", "jobs", orphan)),
		odd: tree(join(p.root, ".limen", "jobs", odd)),
	};
	const run = limen(p, ["migrate"]);
	assert.equal(run.status, 0, run.stderr);
	const unmigrated = join(p.root, ".limen", "unmigrated");
	assert.deepEqual([tree(join(unmigrated, orphan)), tree(join(unmigrated, odd))], [before.orphan, before.odd]);
	assert.deepEqual(readdirSync(join(p.root, ".limen", "jobs")), []);
	const report = outputText(run);
	assert.ok(report.includes(`job ${orphan}: move to .limen/unmigrated/${orphan}: no state\n`), report);
	assert.ok(report.includes(`job ${odd}: move to .limen/unmigrated/${odd}: unknown state "paused"\n`), report);
});

// T-28 (3): a value its field cannot hold stays in its file, and the report names it.
test("a born that is not in clock ticks stays in its file, the record's born is null, and the report names it", async (t) => {
	const p = await project(t);
	const id = "2026-11-03-born-1a2b3c4d";
	const dir = await oldFolder(p, id, { state: "done\n", "task.md": "x\n", log: "", pid: "4242\n", born: "10:00\n" });
	const run = limen(p, ["migrate"]);
	assert.equal(run.status, 0, run.stderr);
	assert.deepEqual(readRecordSync(dir)?.identity, { pid: 4242, born: null, bootId: null });
	assert.equal(readFileSync(join(dir, "born"), "utf8"), "10:00\n");
	const report = outputText(run);
	assert.ok(report.includes(`job ${id}: migrate (done); kept born: not in clock ticks\n`), report);
});

test("a job without task.md or log migrates, and the report notes the missing content", async (t) => {
	const p = await project(t);
	const id = "2026-11-03-bare-1a2b3c4d";
	const dir = await oldFolder(p, id, { state: "done\n", label: "bare\n" });
	const run = limen(p, ["migrate"]);
	assert.equal(run.status, 0, run.stderr);
	assert.equal(readRecordSync(dir)?.state, "done");
	assert.ok(outputText(run).includes(`job ${id}: migrate (done); no task.md; no log\n`), outputText(run));
});

// D-057 (7.7): without `finished-at` the finish time is when `state` was last written, so a reader keyed by it sees
// the time it saw before.
test("a terminal job without finished-at takes its finish time from the modification time of its state file", async (t) => {
	const p = await project(t);
	const dir = await oldFolder(p, "2026-11-03-untimed-1a2b3c4d", { state: "failed\n", "task.md": "x\n", log: "" });
	const ended = new Date("2026-11-03T08:00:00.000Z");
	utimesSync(join(dir, "state"), ended, ended);
	assert.equal(limen(p, ["migrate"]).status, 0);
	assert.equal(readRecordSync(dir)?.finishedAt, ended.toISOString());
});

// T-20 (6): an id of the older format, which ends in 4 hex digits, is named only by its full id.
test("the report names an id of the older 4-hex format as one that only its full id names", async (t) => {
	const p = await project(t);
	await oldFolder(p, "2026-01-02-old-1a2b", { state: "done\n", "task.md": "x\n", log: "" });
	const run = limen(p, ["migrate"]);
	assert.equal(run.status, 0, run.stderr);
	assert.ok(outputText(run).includes("older id 2026-01-02-old-1a2b: only its full id names it\n"), outputText(run));
});

// T-20 (6): two ids that end in the same token cannot be told apart by it.
test("the report names a token two job ids share", async (t) => {
	const p = await project(t);
	await oldFolder(p, "2026-11-04-one-1a2b3c4d", { state: "done\n", "task.md": "x\n", log: "" });
	await oldFolder(p, "2026-11-05-two-1a2b3c4d", { state: "failed\n", "task.md": "x\n", log: "" });
	const run = limen(p, ["migrate"]);
	assert.equal(run.status, 0, run.stderr);
	const line =
		"token 1a2b3c4d is shared by 2026-11-04-one-1a2b3c4d, 2026-11-05-two-1a2b3c4d: only their full ids name them\n";
	assert.ok(outputText(run).includes(line), outputText(run));
});

// T-20 (6): the token and older-id reports count each folder once, also one the run moved to .limen/unmigrated/.
test("the report of a run that moves folders names each older id once and no token a folder shares with itself", async (t) => {
	const p = await project(t);
	await oldFolder(p, "2026-11-12-orphan-1a2b", { label: "x\n" });
	await oldFolder(p, "2026-11-12-odd-5e6f7a8b", { state: "paused\n" });
	await oldFolder(p, "2026-11-12-done-9c0d1e2f", { state: "done\n", "task.md": "x\n", log: "" });
	const run = limen(p, ["migrate"]);
	assert.equal(run.status, 0, run.stderr);
	assert.deepEqual(
		outputText(run)
			.split("\n")
			.filter((line) => line.startsWith("older id ") || line.startsWith("token ")),
		["older id 2026-11-12-orphan-1a2b: only its full id names it"],
	);
});

// T-28 (3): HEAD's wrapper wrote `activity` before the first tool call wrote `tool-calls`; no value is lost.
test("a folder with activity and last-tool but no tool-calls keeps both in progress.json, with the count null", async (t) => {
	const p = await project(t);
	const dir = await oldFolder(p, "2026-11-13-think-1a2b3c4d", {
		state: "done\n",
		"task.md": "x\n",
		log: "",
		activity: "think\n",
		"last-tool": "bash\n",
	});
	assert.equal(limen(p, ["migrate"]).status, 0);
	assert.deepEqual(readProgressSync(dir), { activity: "think", lastTool: "bash", toolCalls: null });
	assert.deepEqual(Object.keys(tree(dir)).sort(), ["log", "progress.json", "record.json", "task.md"]);
});

// An interrupted migration wrote the record and stopped before the progress file and the removals; the next run
// finishes it and loses no progress value.
test("a run that finishes an interrupted migration writes the missing progress.json from the progress files", async (t) => {
	const p = await project(t);
	const id = "2026-11-14-cut-1a2b3c4d";
	const dir = await oldFolder(p, id, OLD_JOB);
	assert.equal(limen(p, ["migrate"]).status, 0);
	await oldFolder(p, id, OLD_JOB);
	await rm(join(dir, "progress.json"));
	const run = limen(p, ["migrate"]);
	assert.equal(run.status, 0, run.stderr);
	assert.ok(outputText(run).includes(`job ${id}: finish an earlier migration\n`), outputText(run));
	assert.deepEqual(readProgressSync(dir), { activity: "tool", lastTool: "bash", toolCalls: 7 });
	assert.deepEqual(Object.keys(tree(dir)).sort(), [...Object.keys(CONTENT), "progress.json", "record.json"].sort());
});

// T-01: only an absent log means no log line; a log that cannot be read stops the migration with the reason.
test("a failed job whose log cannot be read stops the migration with the error and writes no record", async (t) => {
	const p = await project(t);
	const dir = await oldFolder(p, "2026-11-15-unread-1a2b3c4d", {
		state: "failed\n",
		"task.md": "x\n",
		"stop-reason": "stop\n",
	});
	await mkdir(join(dir, "log"));
	const run = limen(p, ["migrate"]);
	assert.deepEqual([run.status, readOutcome(run).code, existsSync(join(dir, "record.json"))], [1, "UNTYPED", false]);
	assert.match(outputText(run), /EISDIR/);
});

// D-057 (3): the files of R-005's hosted jobs, which nothing reads, go, and so do the unread deadline and tip.
test("the files of removed features go and the report lists them", async (t) => {
	const p = await project(t);
	const id = "2026-11-06-hosted-1a2b3c4d";
	const dir = await oldFolder(p, id, {
		state: "done\n",
		"task.md": "x\n",
		log: "",
		hosted: "1\n",
		"agent-name": "agent\n",
		"engine-binding": "pi\n",
		"ownership-uncertainty": "maybe\n",
		"herdr/agent": "agent-1\n",
		"herdr/tab": "tab-1\n",
		deadline: "2026-11-06T12:00:00.000Z\n",
		tip: "abc\n",
	});
	const run = limen(p, ["migrate"]);
	assert.equal(run.status, 0, run.stderr);
	assert.deepEqual(Object.keys(tree(dir)).sort(), ["herdr/tab", "log", "record.json", "task.md"]);
	const removed =
		"  remove state, deadline, tip, hosted, agent-name, engine-binding, ownership-uncertainty, herdr/agent\n";
	assert.ok(outputText(run).includes(removed), outputText(run));
});

// D-057 (4): the failure kind comes from today's patterns only, with the original text as the detail.
test("a failed job's failure kind comes from its last failed: log line, else from its engine's stop reason", async (t) => {
	const p = await project(t);
	const logged = await oldFolder(p, "2026-11-07-logged-1a2b3c4d", {
		state: "failed\n",
		"task.md": "x\n",
		log: "[limen 2026-11-07T10:00:00.000Z] failed: worker exited with code 3\n[limen 2026-11-07T10:01:00.000Z] failed: timeout after 60000ms\n",
		"stop-reason": "stop\n",
	});
	const stopped = await oldFolder(p, "2026-11-07-engine-5e6f7a8b", {
		state: "failed\n",
		"task.md": "x\n",
		log: "",
		"stop-reason": "error: 429 rate_limit_error\n",
	});
	assert.equal(limen(p, ["migrate"]).status, 0);
	assert.deepEqual(
		[readRecordSync(logged)?.failure, readRecordSync(stopped)?.failure],
		[
			{ kind: "timeout", detail: "timeout after 60000ms", resetAt: null },
			{ kind: "quota", detail: "error: 429 rate_limit_error", resetAt: null },
		],
	);
});

test("--dry-run prints what the migration would do and writes nothing", async (t) => {
	const p = await project(t);
	const id = "2026-11-08-dry-1a2b3c4d";
	await oldFolder(p, id, OLD_JOB);
	await oldFolder(p, "2026-11-08-orphan-5e6f7a8b", { label: "x\n" });
	const limenDir = join(p.root, ".limen");
	const before = tree(limenDir);
	const run = limen(p, ["migrate", "--dry-run"]);
	assert.equal(run.status, 0, run.stderr);
	assert.deepEqual(tree(limenDir), before);
	assert.ok(!existsSync(join(limenDir, "unmigrated")));
	assert.ok(outputText(run).includes(`job ${id}: would migrate (stopped)\n`), outputText(run));
	assert.equal(readOutcome(run).next, "limen migrate");
});

// T-28 (3), T-02: a second run finds every folder a record and changes nothing.
test("a second run has nothing to do, exits 0 and changes nothing", async (t) => {
	const p = await project(t);
	await oldFolder(p, "2026-11-09-again-1a2b3c4d", OLD_JOB);
	await oldFolder(p, "2026-11-09-orphan-5e6f7a8b", { label: "x\n" });
	assert.equal(limen(p, ["migrate"]).status, 0);
	const limenDir = join(p.root, ".limen");
	const after = tree(limenDir);
	const again = limen(p, ["migrate"]);
	assert.equal(again.status, 0, again.stderr);
	assert.deepEqual(tree(limenDir), after);
	assert.ok(outputText(again).endsWith("nothing to do: every job folder holds a record\n"), outputText(again));
	assert.equal(readOutcome(again).next, "");
});

// D-057 (7.6): the migration moves no record under a live job.
test("MIGRATE_JOBS_RUNNING: the migration refuses with exit 4 while a job of the older record runs, and changes nothing", async (t) => {
	const p = await project(t);
	const id = "2026-11-10-live-1a2b3c4d";
	// This test's own process is the live wrapper; an older Limen that recorded no start time counted it alive.
	const dir = await oldFolder(p, id, { state: "running\n", pid: `${process.pid}\n`, "task.md": "x\n", log: "" });
	const before = tree(dir);
	const run = limen(p, ["migrate"]);
	assert.equal(run.status, 4, run.stdout);
	assert.deepEqual(readOutcome(run), {
		class: "environment",
		code: "MIGRATE_JOBS_RUNNING",
		next: "limen migrate --dry-run",
	});
	assert.ok(outputText(run).includes(id), outputText(run));
	assert.deepEqual(tree(dir), before);
});

// D-057 (6): until the migration ran, a command that reads jobs refuses the project and names the migration.
test("NOT_MIGRATED: a command that reads jobs refuses a project not yet migrated with exit 4 and names limen migrate --dry-run", async (t) => {
	const p = await project(t);
	await oldFolder(p, "2026-11-11-old-1a2b3c4d", { state: "done\n", "task.md": "x\n", log: "" });
	const run = limen(p, ["status"]);
	assert.equal(run.status, 4, run.stdout);
	assert.deepEqual(readOutcome(run), { class: "environment", code: "NOT_MIGRATED", next: "limen migrate --dry-run" });
});

// T-38: the refusal comes before the spawn's first write, so a refused spawn leaves no worktree root and no job folder.
test("NOT_MIGRATED: a spawn in a project not yet migrated refuses with exit 4 and leaves no trace", async (t) => {
	const p = await project(t);
	await oldFolder(p, "2026-11-11-old-1a2b3c4d", { state: "done\n", "task.md": "x\n", log: "" });
	const below = () => readdirSync(join(p.root, ".limen"), { recursive: true }).map(String).sort();
	const [beside, before] = [readdirSync(p.parent).sort(), below()];
	const run = limen(p, ["spawn", ...routed([]), "do the thing"]);
	assert.equal(run.status, 4, run.stdout);
	assert.deepEqual(readOutcome(run), { class: "environment", code: "NOT_MIGRATED", next: "limen migrate --dry-run" });
	assert.deepEqual(below(), before, "nothing written below the project's .limen");
	assert.deepEqual(readdirSync(p.parent).sort(), beside, "no worktree root beside the repository");
});
