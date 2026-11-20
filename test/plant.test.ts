// The shared test helpers of test/plant.ts: `waitJob` returns only once the job's wrapper has given up its folder, and
// a plant runs the git that comes first on the runner's PATH.
import assert from "node:assert/strict";
import { type ChildProcess, execFileSync, spawn } from "node:child_process";
import { once } from "node:events";
import { existsSync, mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { test } from "node:test";
import { plant as newPlant, type Plant, waitJob } from "./plant.ts";

const JOB = "2026-11-18-waited-1a2b3c4d";
/**
 * How long the stand-in wrapper keeps `pid` after `state` is terminal. A helper that returns at the state returns well
 * inside it, so the test fails every time without the wait for `pid`.
 */
const WRAPPER_TAIL_MS = 1_000;
/** Removes `pid` after the tail, as `finalizeJob` does once the state is written; `born` stays, as `recordBorn` can leave it. */
const WRAPPER_TAIL = `
import { rmSync } from "node:fs";
import { join } from "node:path";
const dir = process.argv[1];
setTimeout(() => rmSync(join(dir, "pid")), ${WRAPPER_TAIL_MS});
`;

test("A-088: waitJob returns only after the job's state is terminal and its pid is gone, whatever born holds", async (t) => {
	const root = mkdtempSync(join(tmpdir(), "limen-wait-"));
	const dir = join(root, ".limen", "jobs", JOB);
	mkdirSync(dir, { recursive: true });
	writeFileSync(join(dir, "state"), "done\n");
	writeFileSync(join(dir, "pid"), "4242\n");
	writeFileSync(join(dir, "born"), "Wed Nov 18 10:00:00 2026\n");
	// Another process plays the wrapper's tail, since `waitJob` blocks this one until it returns.
	const tail: ChildProcess = spawn(process.execPath, ["--input-type=module", "--eval", WRAPPER_TAIL, dir], {
		stdio: "ignore",
	});
	t.after(async () => {
		if (tail.exitCode === null && tail.signalCode === null) {
			await once(tail, "exit");
		}
		rmSync(root, { recursive: true, force: true });
	});
	// `waitJob` reads only the plant's root; the other fields are never used here.
	const plant = { parent: root, root, bin: root, env: {}, cleanup: async () => {} } satisfies Plant;
	const state = waitJob(plant, JOB);
	assert.deepEqual([state, existsSync(join(dir, "pid")), existsSync(join(dir, "born"))], ["done", false, true]);
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
