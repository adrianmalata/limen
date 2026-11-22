// S9 · sweep, prune and recovery: a dead or finished job is cleaned up, a live one is not. One plant, real bin/limen.
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

test("spawn returns before --prepare; prune keeps live, nested and starting work, drops and explains the rest", async () => {
	// Spawn returns while its job's --prepare still waits on a FIFO.
	const gate = join(p.parent, "prepare-gate"),
		prepared = join(p.parent, "prepared");
	execFileSync("mkfifo", [gate]);
	const half = spawnJob(p, "say half", ["--prepare", `pwd > ${prepared}; cat ${gate} > /dev/null`]);
	await until(p.parent, () => existsSync(prepared) && readFileSync(prepared, "utf8").endsWith("\n"));
	const halfTree = readFileSync(prepared, "utf8").trim();
	const landed = spawnJob(p, "commit");
	const unmerged = spawnJob(p, "commit");
	assert.deepEqual([waitJob(p, landed), waitJob(p, unmerged)], ["done", "done"]);
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
	const trees = [jobRecord(p, landed)?.worktree ?? "", jobRecord(p, unmerged)?.worktree ?? ""];
	for (const dropped of [...trees, jobDir(p, stale)]) {
		assert.ok(!existsSync(dropped), `prune kept ${dropped}`);
	}
	const others = [...[starting, gone].map((id) => join(halfTree, "..", id)), join(liveTree, "tmp/scratch")];
	for (const kept of [liveTree, nestedTree, halfTree, jobDir(p, half), nestedDir, ...others]) {
		assert.ok(existsSync(kept), `prune removed ${kept}`);
	}

	await writeFile(gate, "go\n");
	assert.equal(waitJob(p, half), "done");
	await release(nestedDir);
	assert.equal(waitJob(p, nested, { cwd: liveTree }), "done");

	const landedBranch = jobRecord(p, landed)?.branch ?? "";
	git(p.root, "merge", "-q", "--no-edit", landedBranch);
	assert.equal(limen(p, ["prune", "--retire"]).status, 0);
	assert.deepEqual([existsSync(jobDir(p, landed)), git(p.root, "branch", "--list", landedBranch)], [false, ""]);
	assert.deepEqual([existsSync(jobDir(p, unmerged)), existsSync(jobDir(p, live))], [true, true]); // both stay
	await release(jobDir(p, live));
	assert.equal(waitJob(p, live), "done");
});

// A-029: the fake engine's `orphan` starts a child in a process group of its own, as `setsid` does, which no signal of
// the job's group reaches; only the end of the job's systemd user scope, at every terminal transition, does.
test("a killed wrapper is reaped at once; the orphan of a job that ends, is stopped or is reaped is dead after its end; each wakes the coordinator once", async () => {
	const env = { PI_SESSION_ID: SESSION };
	const killed = spawnJob(p, "orphan\nblock", [], { env });
	await until(jobDir(p, killed), () => existsSync(join(jobDir(p, killed), "fake-blocked-1")));
	const pid = jobRecord(p, killed)?.identity?.pid ?? 0;
	assert.ok(pid > 0, "the wrapper recorded its pid");
	process.kill(pid, "SIGKILL");
	// A young job: only the product's dead-pid confirmation window applies, never the startup grace.
	const listed = limen(p, ["show", killed], { env: { LIMEN_REAP_CONFIRM_MS: "1" } });
	assert.deepEqual([listed.status, jobState(p, killed)], [0, "failed"], listed.stderr);

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
