// The shared test helpers of test/plant.ts: `waitJob` returns only once the job's wrapper has given up its folder, a
// record the plant writes by hand is never read in part, a plant runs the git that comes first on the runner's PATH,
// and its cleanup leaves no wrapper of the plant running.
import assert from "node:assert/strict";
import { type ChildProcess, execFileSync, spawn } from "node:child_process";
import { once } from "node:events";
import { existsSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { test } from "node:test";
import type { Identity } from "../src/job/record.ts";
import { platform } from "../src/platform/platform.ts";
import {
	editRecord,
	jobDir,
	jobRecord,
	plant as newPlant,
	type Plant,
	spawnJob,
	until,
	waitJob,
	writeRecord,
} from "./plant.ts";

const JOB = "2026-11-18-waited-1a2b3c4d";
/**
 * How long the stand-in wrapper lives after its record is terminal. A helper that returns at the state returns well
 * inside it, so the test fails every time without the wait for the process.
 */
const WRAPPER_TAIL_MS = 1_000;

/** Whether the process `pid` has exited: gone, or a zombie its blocked parent has not reaped yet. */
function exited(pid: number): boolean {
	try {
		const stat = readFileSync(`/proc/${pid}/stat`, "utf8");
		return stat[stat.lastIndexOf(") ") + 2] === "Z";
	} catch {
		return true;
	}
}

test("A-088: waitJob returns only after the job's state is terminal and its pid is gone, whatever born holds", async (t) => {
	const root = mkdtempSync(join(tmpdir(), "limen-wait-"));
	const dir = join(root, ".limen", "jobs", JOB);
	// Another process plays the wrapper's tail, since `waitJob` blocks this one until it returns.
	const tail: ChildProcess = spawn(process.execPath, ["--eval", `setTimeout(() => {}, ${WRAPPER_TAIL_MS})`], {
		stdio: "ignore",
	});
	t.after(async () => {
		if (tail.exitCode === null && tail.signalCode === null) {
			await once(tail, "exit");
		}
		rmSync(root, { recursive: true, force: true });
	});
	const pid = tail.pid ?? 0;
	// The record names the tail's process without its start time, as a record whose start time is unknown does.
	await writeRecord(dir, { state: "done", identity: { pid, born: null, bootId: null } });
	// `waitJob` reads only the plant's root; the other fields are never used here.
	const plant = { parent: root, root, bin: root, env: {}, cleanup: async () => {} } satisfies Plant;
	const state = waitJob(plant, JOB);
	assert.deepEqual([state, exited(pid)], ["done", true]);
});

/** How often the record-write test rewrites the record while the reader reads it. */
const WRITES = 300;
const RECORD_MODULE = new URL("../src/job/record.ts", import.meta.url).href;
/**
 * The reader of the record-write test: it reads the job folder's record (argument 1) through the record module, as
 * `finalizeJob` does, until the stop file (argument 2) exists, then prints how many reads it made and the error of
 * each read that did not take the record.
 */
const READER = [
	'import { existsSync } from "node:fs";',
	`import { readRecordSync } from ${JSON.stringify(RECORD_MODULE)};`,
	"const [dir, stop] = process.argv.slice(1);",
	"let reads = 0;",
	"const failed = [];",
	'process.stdout.write("reading\\n");',
	"while (!existsSync(stop)) {",
	"\treads += 1;",
	"\ttry {",
	"\t\treadRecordSync(dir);",
	"\t} catch (error) {",
	"\t\tfailed.push(String(error?.message ?? error));",
	"\t}",
	"}",
	'process.stdout.write(JSON.stringify({ reads, failed }) + "\\n");',
].join("\n");

// D-063 (1): a test that rewrites a record while a Limen process reads it, as the race test of test/cli/stop.test.ts
// does, must meet only whole records, as production writes them (src/atomic-write.ts).
test("a reader running while the plant writes record.json reads only whole records", async (t) => {
	const root = mkdtempSync(join(tmpdir(), "limen-plant-write-"));
	const dir = join(root, ".limen", "jobs", JOB);
	const stop = join(root, "stop");
	await writeRecord(dir, { label: "first" });
	const reader: ChildProcess = spawn(process.execPath, ["--input-type=module", "--eval", READER, dir, stop], {
		stdio: ["ignore", "pipe", "pipe"],
	});
	t.after(() => {
		reader.kill("SIGKILL");
		rmSync(root, { recursive: true, force: true });
	});
	let output = "";
	let errors = "";
	reader.stdout?.on("data", (chunk) => (output += chunk));
	reader.stderr?.on("data", (chunk) => (errors += chunk));
	const exited = once(reader, "exit");
	const reading = reader.stdout ? once(reader.stdout, "data") : Promise.reject(new Error("the reader has no stdout"));
	const first = await Promise.race([reading.then(() => "reading"), exited.then(() => "exited")]);
	assert.equal(first, "reading", errors);
	for (let write = 0; write < WRITES; write += 1) {
		await (write % 2 === 0
			? writeRecord(dir, { label: `written ${write}` })
			: editRecord(dir, () => ({ label: `edited ${write}` })));
	}
	writeFileSync(stop, "");
	const [code] = await exited;
	assert.equal(code, 0, errors);
	const report = JSON.parse(output.trim().split("\n").at(-1) ?? "");
	assert.ok(report.reads > 0, output);
	assert.deepEqual(report.failed.slice(0, 3), [], `${report.failed.length} of ${report.reads} reads failed`);
});

// D-060: the laptop's first git is not the system's, and a plant's PATH is fixed, so without the link a plant would
// meet the system's git instead of the one the suite runs with.
test("D-060: a plant runs the git that comes first on the runner's PATH", async (t) => {
	const folder = mkdtempSync(join(tmpdir(), "limen-runner-git-"));
	const runnerPath = process.env.PATH ?? "";
	// The fixture answers --version itself and passes every other call to the git of the runner's own PATH.
	const script = [
		"#!/bin/sh",
		'if [ "$1" = --version ]; then',
		'\techo "git version 0.0.0-fixture"',
		"\texit 0",
		"fi",
		`PATH='${runnerPath}' exec git "$@"`,
	].join("\n");
	writeFileSync(join(folder, "git"), `${script}\n`, { mode: 0o755 });
	process.env.PATH = `${folder}:${runnerPath}`;
	t.after(() => {
		process.env.PATH = runnerPath;
		rmSync(folder, { recursive: true, force: true });
	});
	const p = await newPlant();
	t.after(() => p.cleanup());
	assert.equal(execFileSync("git", ["--version"], { env: p.env, encoding: "utf8" }), "git version 0.0.0-fixture\n");
});

/**
 * The poll of the queued job in the cleanup test: one decision, then a sleep longer than the test, so the wrapper
 * cannot notice by itself that its folder is gone (src/runtime/start-queue.ts) and only cleanup can end it.
 */
const QUEUED_POLL_MS = "600000";

// D-063 (3): a queued wrapper has no engine and no path of the plant in its command line, so the plant's `pkill -f`
// missed it, and it outlived the plant that cleanup removed.
test("cleanup stops every wrapper the plant started, a queued one with no engine included", async (t) => {
	const p = await newPlant();
	const wrappers: Identity[] = [];
	t.after(async () => {
		// For a cleanup that misses one: only a live process that still has the recorded start time gets the signal. The
		// platform adapter sends it, so a process that exits after the check is `missing` and the plant's cleanup still
		// runs; a signal the system refuses fails the test once that cleanup has run.
		const denied: number[] = [];
		for (const { pid, born } of wrappers) {
			const now = pid === null ? undefined : await platform.processInfo(pid);
			const live = pid !== null && now?.kind === "present" && now.process.born === born;
			if (live && platform.signalProcess(pid, "SIGKILL") === "denied") {
				denied.push(pid);
			}
		}
		await p.cleanup();
		assert.deepEqual(denied, [], "the test may signal every wrapper the plant started");
	});
	const running = spawnJob(p, "block");
	await until(jobDir(p, running), () => existsSync(join(jobDir(p, running), "fake-blocked-1")));
	// Below the start gate's 25% CPU idle, so the next job waits in the queue and starts no engine.
	writeFileSync(join(p.parent, "start-reading.json"), '{"cpuIdle":10,"memoryFree":80}');
	const queued = spawnJob(p, "say queued", [], { env: { LIMEN_START_POLL_MS: QUEUED_POLL_MS } });
	await until(jobDir(p, queued), () => Boolean(jobRecord(p, queued)?.queued?.detail));
	for (const id of [running, queued]) {
		const identity = jobRecord(p, id)?.identity;
		assert.ok(identity?.pid, `${id} names its wrapper`);
		wrappers.push(identity);
	}
	assert.deepEqual(
		wrappers.map(({ pid }) => exited(pid ?? 0)),
		[false, false],
		"both wrappers run before cleanup",
	);
	await p.cleanup();
	assert.deepEqual(
		wrappers.map(({ pid }) => exited(pid ?? 0)),
		[true, true],
		"no wrapper of the plant runs after cleanup",
	);
});
