// S9 · sweep, prune and recovery, real bin/limen: a dead or finished job is cleaned up; live and unlanded work stay.
import assert from "node:assert/strict";
import { execFileSync, spawn, spawnSync } from "node:child_process";
import { closeSync, existsSync, openSync, readdirSync, readFileSync, writeSync } from "node:fs";
import { mkdir, utimes, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { after, before, test } from "node:test";
import { setTimeout as delay } from "node:timers/promises";
import { fileURLToPath } from "node:url";
import {
	engineEvents,
	git,
	jobDir,
	jobFile,
	jobRecord,
	jobState,
	limen,
	type Plant,
	plant,
	release,
	spawnJob,
	start,
	until,
	waitJob,
	writeRecord,
} from "./plant.ts";

const WAKE = fileURLToPath(new URL("../hook/wake.ts", import.meta.url));
const SESSION = "s9-coordinator";
let p: Plant;
before(async () => {
	p = await plant();
});
after(() => p.cleanup());

/** Alive and not a zombie: a zombie answers kill(pid, 0) but has already exited. */
const alive = (pid: number) =>
	/^[^Z]/.test(spawnSync("ps", ["-o", "stat=", "-p", String(pid)], { encoding: "utf8" }).stdout.trim());
const wakes = (dir: string, id: string) =>
	engineEvents(dir).filter((entry) => entry.event !== "notify" && entry.text?.includes(id)).length;
/** How long a process that got SIGKILL may take to exit: milliseconds, so the bound only ends a wait for a live one. */
const ORPHAN_EXIT_MS = 5_000;
/** The processes of `pids` still alive once `boundMs` passed, read every 50 ms, since an exit raises no file event. */
async function survivors(pids: readonly number[], boundMs: number): Promise<number[]> {
	const deadline = Date.now() + boundMs;
	let left = pids.filter(alive);
	while (left.length > 0 && Date.now() < deadline) {
		await delay(50);
		left = left.filter(alive);
	}
	return left;
}

test("spawn returns before --prepare; prune keeps live, nested, starting and unlanded work, drops and explains the rest", async () => {
	// Spawn returns while its job's --prepare still waits on a FIFO.
	const gate = join(p.parent, "prepare-gate"),
		prepared = join(p.parent, "prepared");
	execFileSync("mkfifo", [gate]);
	const half = spawnJob(p, "say half", ["--prepare", `pwd > ${prepared}; cat ${gate} > /dev/null`]);
	await until(p.parent, () => existsSync(prepared) && readFileSync(prepared, "utf8").endsWith("\n"));
	const halfTree = readFileSync(prepared, "utf8").trim();
	const lost = spawnJob(p, "say lost", ["--prepare", 'rm -rf "$PWD"']);
	assert.equal(waitJob(p, lost), "failed");
	assert.ok(jobFile(p, lost, "log").includes(`failed: worktree ${jobRecord(p, lost)?.worktree} `));
	const live = spawnJob(p, "block");
	await until(jobDir(p, live), () => jobFile(p, live, "log").includes("prune: removed"));
	const liveTree = jobRecord(p, live)?.worktree ?? "";
	// Another checkout (the live job's worktree) runs its own job; its worktree nests inside this plant's worktree root.
	assert.equal(limen(p, ["init"], { cwd: liveTree }).status, 0);
	const nested = spawnJob(p, "block", [], { cwd: liveTree });
	const nestedDir = join(liveTree, ".limen/jobs", nested);
	const nestedTree = jobRecord(p, nested, { cwd: liveTree })?.worktree ?? "";
	await until(nestedDir, () => readFileSync(join(nestedDir, "log"), "utf8").includes("prune: removed"));
	// Two done jobs with a commit each, spawned last: a worker spawn refuses while a finished job holds unlanded work.
	const landed = spawnJob(p, "commit");
	assert.equal(waitJob(p, landed), "done");
	const landedBranch = jobRecord(p, landed)?.branch ?? "";
	git(p.root, "merge", "-q", "--no-edit", landedBranch);
	const unmerged = spawnJob(p, "commit");
	assert.equal(waitJob(p, unmerged), "done");
	// Records with a worktree that never started, their spawner alive (this test) or long gone; one running, its process
	// unknown long past the startup grace.
	const [stale, starting, gone] = ["2000-01-stale-aaaaaaaa", "2000-01-starting-aaaaaaaa", "2000-01-gone-aaaaaaaa"];
	for (const id of [stale, starting, gone]) {
		await writeRecord(jobDir(p, id), {
			state: id === gone ? "running" : "starting",
			startedAt: "2000-01-01T00:00:00.000Z",
			spawnerPid: id === starting ? process.pid : null,
			worktree: join(halfTree, "..", id),
		});
		git(p.root, "worktree", "add", "-q", "--detach", join(halfTree, "..", id), "HEAD");
	}
	git(p.root, "worktree", "add", "-q", "--detach", join(liveTree, "tmp/scratch"), "HEAD"); // the live job's own

	const pruned = limen(p, ["prune"]);
	assert.match(pruned.stdout, new RegExp(`pruned .*/${stale} \\(job ${stale}\\): its record never started`));
	for (const dropped of [jobRecord(p, landed)?.worktree ?? "", jobDir(p, stale)]) {
		assert.ok(!existsSync(dropped), `prune kept ${dropped}`);
	}
	// A-001: the done job whose branch holds a commit outside HEAD keeps its worktree, and prune says why.
	const unmergedTree = jobRecord(p, unmerged)?.worktree ?? "";
	assert.ok(pruned.stdout.includes(`kept ${unmergedTree} (job ${unmerged}): unlanded work\n`), pruned.stdout);
	const others = [...[starting, gone].map((id) => join(halfTree, "..", id)), join(liveTree, "tmp/scratch")];
	for (const kept of [liveTree, nestedTree, halfTree, jobDir(p, half), nestedDir, unmergedTree, ...others]) {
		assert.ok(existsSync(kept), `prune removed ${kept}`);
	}

	await writeFile(gate, "go\n");
	assert.equal(waitJob(p, half), "done");
	await release(nestedDir);
	assert.equal(waitJob(p, nested, { cwd: liveTree }), "done");

	// A-002: a hand `git merge` writes no `landed` marker, so retire keeps that job's record and branch, as it keeps
	// every finished job without a marker (before R-031 it took the git graph for the land and deleted both).
	assert.equal(limen(p, ["prune", "--retire"]).status, 0);
	const kept = git(p.root, "for-each-ref", "--format=%(refname:short)", `refs/heads/${landedBranch}`);
	assert.deepEqual([existsSync(jobDir(p, landed)), kept], [true, landedBranch]);
	assert.deepEqual([existsSync(jobDir(p, unmerged)), existsSync(jobDir(p, live))], [true, true]); // both stay
	await release(jobDir(p, live));
	assert.equal(waitJob(p, live), "done");
	// The next tests of this plant spawn workers, which a finished job with unlanded work refuses. The unmerged job's
	// commit goes on its abandon branch. The live job holds only its own scratch worktree, which goes by hand: abandon
	// keeps a worktree that holds another registered one, and since R-031 a kept worktree leaves its job unresolved.
	git(p.root, "worktree", "remove", "--force", join(liveTree, "tmp/scratch"));
	const abandoned = limen(p, ["abandon", unmerged]);
	assert.equal(abandoned.status, 0, abandoned.stderr);
});

// A-001's experiment: before R-030 prune moved this worktree out of reach and deleted it, the file with it.
test("prune keeps the worktree of a failed job that holds an untracked file and says why", async (t) => {
	const own = await plant();
	t.after(() => own.cleanup());
	const failed = spawnJob(own, "say partial\nfail 3");
	assert.equal(waitJob(own, failed), "failed");
	const tree = jobRecord(own, failed)?.worktree ?? "";
	await writeFile(join(tree, "wip.txt"), "half-done edit\n");
	const pruned = limen(own, ["prune"]);
	assert.equal(pruned.status, 0, pruned.stderr);
	assert.deepEqual(
		[pruned.stdout.split("\n").slice(0, 2), readFileSync(join(tree, "wip.txt"), "utf8")],
		[[`kept ${tree} (job ${failed}): unlanded work`, "no finished worktrees"], "half-done edit\n"],
	);
});

// Before R-030 the retire deleted this landed branch, the worktree that held it and the job's record.
test("prune --retire keeps the record, branch and worktree of a landed job whose worktree holds an untracked file", async (t) => {
	const own = await plant();
	t.after(() => own.cleanup());
	const done = spawnJob(own, "commit");
	assert.equal(waitJob(own, done), "done");
	const [branch, worktree] = [jobRecord(own, done)?.branch ?? "", jobRecord(own, done)?.worktree ?? ""];
	git(own.root, "merge", "-q", "--no-edit", branch);
	await writeFile(join(worktree, "notes.txt"), "a note the job left\n");
	const retired = limen(own, ["prune", "--retire"]);
	assert.equal(retired.status, 0, retired.stderr);
	const branches = git(own.root, "for-each-ref", "--format=%(refname:short)", `refs/heads/${branch}`);
	assert.deepEqual(
		[existsSync(jobDir(own, done)), branches, readFileSync(join(worktree, "notes.txt"), "utf8")],
		[true, branch, "a note the job left\n"],
	);
	assert.ok(retired.stdout.includes(`kept ${worktree} (job ${done}): unlanded work\n`), retired.stdout);
});

// Review round 1, F2: before the fix prune decided parents first, so the clean worktree went with the registered
// worktree in its ignored `.limen/` and the untracked file there.
test("prune keeps a clean finished worktree that holds a registered worktree with an untracked file, and keeps both", async (t) => {
	const own = await plant();
	t.after(() => own.cleanup());
	const done = spawnJob(own, "say clean");
	assert.equal(waitJob(own, done), "done");
	const worktree = jobRecord(own, done)?.worktree ?? "";
	const inner = join(worktree, ".limen/inner");
	git(own.root, "worktree", "add", "-q", "--detach", inner, "HEAD");
	await writeFile(join(inner, "wip.txt"), "half-done edit\n");
	const pruned = limen(own, ["prune"]);
	assert.equal(pruned.status, 0, pruned.stderr);
	assert.deepEqual(
		[pruned.stdout.split("\n").slice(0, 3), readFileSync(join(inner, "wip.txt"), "utf8")],
		[
			[
				`kept ${worktree} (job ${done}): it holds the registered worktree ${inner}`,
				`kept ${inner} (job none): unlanded work`,
				"no finished worktrees",
			],
			"half-done edit\n",
		],
	);
});

// Review round 2, G3: before the fix the line said `unlanded work` of a clean worktree kept only for the worktree below it.
test("prune names the registered worktree below as the cause when it keeps a clean worktree only for it", async (t) => {
	const own = await plant();
	t.after(() => own.cleanup());
	const done = spawnJob(own, "say clean");
	assert.equal(waitJob(own, done), "done");
	const worktree = jobRecord(own, done)?.worktree ?? "";
	// A locked worktree is no candidate of prune, so it stays, and the clean one around it with it.
	const inner = join(worktree, ".limen/inner");
	git(own.root, "worktree", "add", "-q", "--detach", inner, "HEAD");
	git(own.root, "worktree", "lock", inner);
	const pruned = limen(own, ["prune"]);
	assert.equal(pruned.status, 0, pruned.stderr);
	assert.deepEqual(pruned.stdout.split("\n").slice(0, 2), [
		`kept ${worktree} (job ${done}): it holds the registered worktree ${inner}`,
		"no finished worktrees",
	]);
});

// Review round 2, G2: before the fix a held worktree inside another held one stayed without a line of its own.
test("prune names a dirty worktree inside another dirty one with a kept line of its own", async (t) => {
	const own = await plant();
	t.after(() => own.cleanup());
	const done = spawnJob(own, "say clean");
	assert.equal(waitJob(own, done), "done");
	const worktree = jobRecord(own, done)?.worktree ?? "";
	await writeFile(join(worktree, "notes.txt"), "a note the job left\n");
	const inner = join(worktree, "inner");
	git(own.root, "worktree", "add", "-q", "--detach", inner, "HEAD");
	await writeFile(join(inner, "wip.txt"), "half-done edit\n");
	const pruned = limen(own, ["prune"]);
	assert.equal(pruned.status, 0, pruned.stderr);
	assert.deepEqual(pruned.stdout.split("\n").slice(0, 3), [
		`kept ${worktree} (job ${done}): unlanded work`,
		`kept ${inner} (job none): unlanded work`,
		"no finished worktrees",
	]);
});

// A-029: the fake engine's `orphan` starts a child in a process group of its own, as `setsid` does, which no signal of
// the job's group reaches; only the end of the job's systemd user scope, at every terminal transition, does. A-005: the
// reaper ends that scope, the engine in it, before it writes `failed`, and the failure names what it checked.
test("a killed wrapper is reaped at once, its engine dead; the orphan of a job that ends, is stopped or is reaped is dead after its end; each wakes the coordinator once", async () => {
	const env = { PI_SESSION_ID: SESSION };
	const killed = spawnJob(p, "orphan\nblock", [], { env });
	await until(jobDir(p, killed), () => existsSync(join(jobDir(p, killed), "fake-blocked-1")));
	const pid = jobRecord(p, killed)?.identity?.pid ?? 0;
	assert.ok(pid > 0, "the wrapper recorded its pid");
	const engines = engineEvents(jobDir(p, killed)).flatMap((entry) => (entry.event === "pid" ? [entry.pid ?? 0] : []));
	assert.equal(engines.length, 1, "the engine recorded its pid");
	process.kill(pid, "SIGKILL");
	// A young job: only the product's dead-pid confirmation window applies, never the startup grace.
	const listed = limen(p, ["show", killed], { env: { LIMEN_REAP_CONFIRM_MS: "1" } });
	assert.deepEqual([listed.status, jobState(p, killed)], [0, "failed"], listed.stderr);
	const scope = jobRecord(p, killed)?.scope?.unit;
	assert.deepEqual(jobRecord(p, killed)?.failure, {
		kind: "reaped",
		detail: `process group gone: wrapper ${pid} is not running; scope ${scope} ended after TERM`,
		resetAt: null,
	});
	assert.deepEqual(await survivors(engines, ORPHAN_EXIT_MS), [], "the reaped job's engine is dead");

	const stopped = spawnJob(p, "orphan\nblock", [], { env });
	await until(jobDir(p, stopped), () => existsSync(join(jobDir(p, stopped), "fake-blocked-1")));
	assert.ok(alive(Number(jobFile(p, stopped, "fake-orphan"))), "the orphan left the job's process group and runs");
	const stop = limen(p, ["stop", stopped, "s9"]);
	assert.deepEqual([stop.status, jobState(p, stopped)], [0, "stopped"], stop.stderr);

	const ended = spawnJob(p, "orphan", [], { env });
	assert.equal(waitJob(p, ended), "done");
	const orphans = [killed, stopped, ended].map((id) => Number(jobFile(p, id, "fake-orphan")));
	assert.deepEqual(await survivors(orphans, ORPHAN_EXIT_MS), [], "every orphan is dead after its job's end");

	const coordinator = join(p.parent, "coordinator");
	await mkdir(coordinator);
	await writeFile(join(coordinator, "task.md"), "block\n");
	const session = spawn(
		join(p.bin, "pi"),
		["--extension", WAKE, "--session-dir", join(coordinator, "session"), `@${join(coordinator, "task.md")}`],
		{ cwd: p.root, env: { ...p.env, ...env }, stdio: "ignore" },
	);
	// A later job's wake orders the count: a duplicate for any earlier job would have arrived before it.
	const last = spawnJob(p, "say last", [], { env });
	assert.equal(waitJob(p, last), "done");
	await until(coordinator, () => wakes(coordinator, last) > 0);
	assert.deepEqual(
		[killed, stopped, ended].map((id) => wakes(coordinator, id)),
		[1, 1, 1],
	);
	await release(coordinator);
	await new Promise((resolve) => session.once("exit", resolve));
});

test("seat registrations survive a dead-owner registry lock under contention", async () => {
	const registry = join(p.parent, ".limen/projects"),
		lock = `${registry}.lock`,
		gate = join(p.parent, "registry-gate"),
		ready = join(p.parent, "registry-ready"),
		barrier = join(p.parent, "registry-barrier.mjs");
	const projects = Array.from({ length: 40 }, (_, index) => join(p.parent, `seat-${index}`));
	await Promise.all([...projects, ready].map((dir) => mkdir(dir)));
	await writeFile(registry, `${p.root}\n${join(p.parent, "gone-one")}\n${join(p.parent, "gone-two")}\n`);
	// A lock whose owner died long ago: a pid no process holds, an mtime far past any freshness window, and the marker of
	// a reclaimer that died mid-claim inside it.
	await mkdir(lock);
	await writeFile(join(lock, "owner"), "999999999\n");
	await writeFile(join(lock, "reclaimer"), "999999998.0");
	await utimes(lock, new Date(0), new Date(0));
	execFileSync("mkfifo", [gate]);
	// Each process pauses at its first touch of the registry or its lock, so every one meets the dead lock together; one
	// write releases all. The lock module (src/lock.ts) touches the lock first, through node:fs/promises.
	await writeFile(
		barrier,
		`import fs from "node:fs"; import { syncBuiltinESMExports } from "node:module";
let waited = false;
const pause = (path) => {
	if (!waited && String(path).startsWith(${JSON.stringify(registry)})) {
		waited = true;
		fs.writeFileSync(${JSON.stringify(ready)} + "/" + process.pid, "");
		const fd = fs.openSync(${JSON.stringify(gate)}, "r");
		fs.readSync(fd, Buffer.alloc(1));
		fs.closeSync(fd);
	}
};
for (const [module, names] of [[fs, ["existsSync", "mkdirSync"]], [fs.promises, ["open", "mkdir", "readFile", "stat", "link"]]]) {
	for (const name of names) {
		const original = module[name];
		module[name] = (path, ...rest) => {
			pause(path);
			return original(path, ...rest);
		};
	}
}
syncBuiltinESMExports();
`,
	);
	const hold = openSync(gate, "r+");
	const env = { NODE_OPTIONS: `${p.env.NODE_OPTIONS} --import=${barrier}` };
	const children = [
		...projects.map((project) => start(p, ["workspace", "init"], { cwd: project, env })),
		...Array.from({ length: 8 }, () => start(p, ["sweep"], { env })),
	];
	// A child that fails before its first registry touch never reaches the barrier; count it so the wait still ends.
	await until(
		ready,
		() => readdirSync(ready).length + children.filter(({ child }) => child.exitCode !== null).length >= children.length,
	);
	writeSync(hold, "x".repeat(children.length));
	const results = await Promise.all(children.map((child) => child.done));
	closeSync(hold);
	const broken = results.filter((result) => result.status !== 0 || /ENOTEMPTY/.test(result.stdout + result.stderr));
	assert.deepEqual(broken, []);
	assert.deepEqual(new Set(readFileSync(registry, "utf8").trim().split("\n")), new Set([p.root, ...projects]));
});
