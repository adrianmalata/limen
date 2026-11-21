// src/project/seat.ts: the seat's project registry, here many registrations at once past a lock whose owner is dead.
import assert from "node:assert/strict";
import { execFileSync, spawn } from "node:child_process";
import { once } from "node:events";
import {
	closeSync,
	mkdirSync,
	mkdtempSync,
	openSync,
	readdirSync,
	readFileSync,
	rmSync,
	writeFileSync,
	writeSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";
import { type LockRecord, lockPath } from "../../src/lock.ts";
import { platform } from "../../src/platform/platform.ts";
import { until } from "../plant.ts";

const SEAT_MODULE = new URL("../../src/project/seat.ts", import.meta.url).href;
const PROCESSES = 41;

// D-029, A-087: a registration lost while processes took over a dead registry lock together drops a project from the
// seat sweep and the alerts. Each process meets the dead lock at the same moment: it pauses on a FIFO first.
test("A-087: 41 processes that register at once past a registry lock whose owner is dead leave 41 entries", async (t) => {
	const home = mkdtempSync(join(tmpdir(), "limen-seat-"));
	t.after(() => rmSync(home, { recursive: true, force: true }));
	const registry = join(home, ".limen", "projects");
	const [ready, gate] = [join(home, "ready"), join(home, "gate")];
	mkdirSync(ready, { recursive: true });
	mkdirSync(join(home, ".limen"));
	const bootId = platform.bootId();
	const dead: LockRecord = {
		pid: 999_999_999,
		born: "1",
		...(bootId === undefined ? {} : { bootId }),
		token: "d".repeat(32),
		since: "2026-11-20T00:00:00.000Z",
	};
	writeFileSync(lockPath({ file: registry }), `${JSON.stringify(dead)}\n`);
	execFileSync("mkfifo", [gate]);
	const projects = Array.from({ length: PROCESSES }, (_, index) => join(home, `project-${index}`));
	const script = [
		'import { closeSync, openSync, readSync, writeFileSync } from "node:fs";',
		`import { registerProject } from ${JSON.stringify(SEAT_MODULE)};`,
		`writeFileSync(${JSON.stringify(ready)} + "/" + process.pid, "");`,
		`const fd = openSync(${JSON.stringify(gate)}, "r");`,
		"readSync(fd, Buffer.alloc(1));",
		"closeSync(fd);",
		"await registerProject(process.argv[1]);",
	].join("\n");
	const hold = openSync(gate, "r+");
	t.after(() => closeSync(hold));
	const children = projects.map((project) => {
		const child = spawn(process.execPath, ["--input-type=module", "--eval", script, project], {
			env: { ...process.env, LIMEN_HOME: home },
			stdio: ["ignore", "ignore", "pipe"],
		});
		let stderr = "";
		child.stderr.on("data", (chunk) => (stderr += chunk));
		return { child, done: once(child, "exit").then(([code]) => ({ code, stderr })) };
	});
	t.after(() => {
		for (const { child } of children) {
			child.kill("SIGKILL");
		}
	});
	// A child that fails before the FIFO never writes its ready file; count it, so the wait still ends.
	await until(
		home,
		() => readdirSync(ready).length + children.filter(({ child }) => child.exitCode !== null).length >= PROCESSES,
	);
	writeSync(hold, "x".repeat(PROCESSES));
	const results = await Promise.all(children.map(({ done }) => done));
	assert.deepEqual(
		results.filter(({ code }) => code !== 0),
		[],
	);
	assert.deepEqual(readFileSync(registry, "utf8").trim().split("\n").sort(), projects.toSorted());
});
