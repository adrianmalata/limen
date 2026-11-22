// S1 · Spawn, detached. A job gets its own worktree and branch from the base commit, the exact task bytes and an
// engine environment without the caller's Herdr pane or Pi session; reading a running job leaves its index alone;
// a workspace job works in one child repository; each refusal leaves the shared snapshot identical (T-38 (4)).
import assert from "node:assert/strict";
import { readdirSync, readFileSync } from "node:fs";
import { mkdir, rm, utimes, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { after, before, test } from "node:test";
import { readOutcome } from "./final-line.ts";
import {
	editRecord,
	git,
	jobDir,
	jobRecord,
	limen,
	type Plant,
	plant,
	release,
	repository,
	routed,
	spawnJob,
	startedJob,
	TICKET,
	waitJob,
} from "./plant.ts";
import { snapshot } from "./snapshot.ts";

let p: Plant;
before(async () => {
	p = await plant();
});
after(() => p.cleanup());

const json = (path: string) => JSON.parse(readFileSync(path, "utf8"));

// The plant has no job yet, so the folder of job worktrees does not exist: a spawn that made it before its ticket
// check (before R-092) changed the snapshot.
test("each spawn refusal exits with its class's code, names its cause and its own code, and leaves the snapshot identical", async (context) => {
	const draft = "spec/features/active/F002-draft/ticket.md";
	await mkdir(join(p.root, "spec/features/active/F002-draft"));
	context.after(() => rm(join(p.root, "spec/features/active/F002-draft"), { recursive: true }));
	await writeFile(join(p.root, draft), "# F002 · Not committed yet\n");
	const clean = snapshot(p.root);
	const refusals: ReadonlyArray<readonly [readonly string[], string, number, string, Record<string, string>?]> = [
		[[`Implement F002. Ticket: ${draft}`], draft, 1, "TICKET_NOT_AT_BASE"],
		[["--role", "coordinator", "work"], "coordinator", 1, "SPAWN_LEAD_ROLE"],
		[["--engine", "claude", "work"], "--engine", 2, "BAD_ENGINE"],
		[["--engine", "pi", "work"], "PATH", 4, "ENGINE_MISSING", { PATH: "/usr/bin:/bin" }],
		[["--engine", "pi", "--extension", "missing.ts", "work"], "missing.ts", 2, "BAD_EXTENSION"],
		[["--provider", "pi-claude", "--model", "claude-opus-5-5", "work"], "pi install", 4, "BRIDGE_MISSING"],
	];
	for (const [args, cause, status, code, env] of refusals) {
		const run = limen(p, ["spawn", ...routed(args)], env ? { env } : {});
		assert.deepEqual([run.status, readOutcome(run).code, snapshot(p.root)], [status, code, clean], args.join(" "));
		assert.ok(run.stderr.includes(cause), `${args.join(" ")}: ${run.stderr}`);
	}
});

test("limen spawn: a detached job runs in its own worktree from the base with the exact task and a clean engine environment", async () => {
	const base = git(p.root, "rev-parse", "HEAD");
	const task = `block\ncommit\nsay all done\n\nTicket: ${TICKET}  \n\t'quoted' $HOME \`tick\`\n`;
	const caller = {
		PI_SESSION_ID: "coord",
		PI_SESSION_FILE: join(p.parent, "coord.jsonl"),
		HERDR_ENV: "1",
		HERDR_PANE_ID: "p1",
		LIMEN_JOB_ID: "2026-10-08-f001-coordinator-1a2b3c4d",
	};
	const id = spawnJob(p, task, ["--detached", "--label", "F001 demo"], { env: caller });
	const dir = jobDir(p, id);
	const tree = jobRecord(p, id)?.worktree ?? "";
	assert.deepEqual([git(tree, "branch", "--show-current"), git(tree, "rev-parse", "HEAD")], [`limen/${id}`, base]);
	// `show` below reads the picture's link to the spawner job, `spawnedBy`, alone.
	await editRecord(dir, () => ({ spawner: null }));

	// Plain `git status` on stale stat data rewrites the index under the worker's own `git add`.
	// regression: 43c01cf
	const index = join(git(tree, "rev-parse", "--absolute-git-dir"), "index");
	await utimes(join(tree, "README.md"), new Date(0), new Date(0));
	const bytes = readFileSync(index);
	for (const read of [["status", "--all"], ["status"], ["show", id]]) {
		assert.equal(limen(p, read).status, 0, read.join(" "));
	}
	assert.deepEqual(readFileSync(index), bytes);

	await release(dir);
	assert.deepEqual([waitJob(p, id), readFileSync(join(dir, "task.md"), "utf8")], ["done", task]);
	assert.equal(readFileSync(join(dir, "fake-task.txt"), "utf8"), task);
	const argv: string[] = json(join(dir, "fake-argv.json"));
	assert.ok(!argv.some((value) => value.includes("say all done")), "the task stays out of argv");
	const leak = /^(HERDR_|PI_SESSION_)/;
	const leaked = json(join(dir, "fake-env.json")).filter((name: string) => leak.test(name));
	assert.deepEqual(leaked, []);
	const commits = git(p.root, "rev-list", `${base}..limen/${id}`).split("\n");
	assert.equal(commits.length, 1);
	assert.deepEqual([git(p.root, "rev-parse", "HEAD"), git(p.root, "status", "--porcelain")], [base, ""]);
	const shown = limen(p, ["show", id]);
	assert.ok(shown.stdout.includes(commits[0]?.slice(0, 7) ?? "?"), shown.stdout);
	assert.ok(shown.stdout.includes("all done"), shown.stdout);
	assert.ok(shown.stdout.includes(`\n  spawned-by job ${caller.LIMEN_JOB_ID}\n`), shown.stdout);

	// A served model other than the requested one shows both; a turn copied from a parent session is not counted.
	const usage = { input: 1, output: 10, cacheRead: 100, cacheWrite: 1000 };
	const turn = (timestamp: string, model: string) =>
		JSON.stringify({ type: "message", timestamp, message: { role: "assistant", provider: "p", model, usage } });
	const now = new Date().toISOString();
	const turns = [turn("2020-01-01T00:00:00.000Z", "parent"), turn(now, "other"), turn(now, "other")];
	await writeFile(join(dir, "session", "turns.jsonl"), `${turns.join("\n")}\n`);
	const detail = limen(p, ["show", id]).stdout;
	assert.ok(detail.includes(`model served p/other · requested ${jobRecord(p, id)?.route.model}`), detail);
	assert.ok(detail.includes("tokens 2 turns · input 2 · output 20 · cache read 200 · cache write 2,000"), detail);
});

test("a detached spawn says to end the turn, then ends with the golden final line, whose ids.job names its job folder", () => {
	const before = new Set(readdirSync(join(p.root, ".limen/jobs")));
	const run = limen(p, ["spawn", ...routed([]), "say golden"]);
	assert.equal(run.status, 0, run.stderr);
	const made = readdirSync(join(p.root, ".limen/jobs")).filter((name) => !before.has(name));
	assert.equal(made.length, 1, made.join(", "));
	assert.equal(readOutcome(run).ids?.job, made[0]);
	// The raw lines, not a re-serialised object, so the key order counts; the sentence is text before the line (D-046).
	const golden = `{"class":"ok","code":null,"next":null,"ids":{"job":"${made[0]}"}}`;
	const lines = run.stdout.trimEnd().split("\n").slice(-2);
	assert.deepEqual(lines, ["End your turn; Limen wakes you when the job ends.", golden]);
	assert.equal(waitJob(p, made[0] ?? ""), "done");
});

// D-061 (3): the wrapper prints a command's text at its end, so spawn no longer prints the id before the worktree
// exists; the text names the job once, after its start line, and the final line carries it in ids.job.
test("a spawn prints no early id line: its id is one line of text, after the start line and before the sentence", () => {
	const run = limen(p, ["spawn", ...routed([]), "say once"]);
	assert.equal(run.status, 0, run.stderr);
	const id = startedJob(run);
	const lines = run.stdout.trimEnd().split("\n");
	assert.deepEqual(
		[lines.filter((line) => line === id).length, lines.at(-4), lines.at(-3)],
		[1, "started say once", id],
	);
	assert.equal(waitJob(p, id), "done");
});

test("a workspace job works in one child repository", async () => {
	const workspace = join(p.parent, "workspace");
	await Promise.all(["api", "web"].map((name) => repository(join(workspace, name))));
	assert.equal(limen(p, ["workspace", "init"], { cwd: workspace }).status, 0);
	const id = spawnJob(p, "commit", ["--repo", "api", "--engine", "pi"], { cwd: workspace });
	assert.equal(waitJob(p, id, { cwd: workspace }), "done");
	assert.equal(jobRecord(p, id, { cwd: workspace })?.repo, "api");
	assert.match(limen(p, ["show", id], { cwd: workspace }).stdout, /\n {2}spawned-by user \S+, parent .+ \(pid \d+\)\n/);
	assert.equal(git(join(workspace, "api"), "rev-list", "--count", `main..limen/${id}`), "1");
	assert.equal(git(join(workspace, "web"), "branch", "--list", `limen/${id}`), "");
});
