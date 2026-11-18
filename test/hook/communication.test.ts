// The communication hook builds a session's start from declarations only: a `jg` on PATH changes nothing (T-36).
import assert from "node:assert/strict";
import { existsSync } from "node:fs";
import { mkdir, mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test, { type TestContext } from "node:test";
import limenCommunication from "../../hook/communication.ts";

const JOB_ID = "2026-11-19-context-tools-1a2b3c4d";

type Env = Readonly<Record<string, string | undefined>>;

/** Sets each variable, or removes it when its value is undefined. */
function assign(values: Env): void {
	for (const [name, value] of Object.entries(values)) {
		if (value === undefined) {
			delete process.env[name];
		} else {
			process.env[name] = value;
		}
	}
}

/**
 * A temporary project with one job folder, a home with no seat rules, and a folder that holds a `jg` which names
 * itself Jevgrep, exits 0 and writes a marker file each time it runs.
 */
async function fixture(t: TestContext) {
	const dir = await mkdtemp(join(tmpdir(), "limen-context-tools-"));
	t.after(() => rm(dir, { recursive: true, force: true }));
	const project = join(dir, "project");
	const bin = join(dir, "bin");
	const home = join(dir, "home");
	const marker = join(dir, "jg-ran");
	const job = join(project, ".limen/jobs", JOB_ID);
	await Promise.all([mkdir(job, { recursive: true }), mkdir(bin), mkdir(home)]);
	await writeFile(join(job, "task.md"), "Implement the ticket.\n");
	const jg = `#!/bin/sh\n: > ${JSON.stringify(marker)}\necho "Jevgrep: search source by question"\nexit 0\n`;
	await writeFile(join(bin, "jg"), jg, { mode: 0o755 });
	return { project, bin, home, marker };
}

/** The `before_agent_start` result of a fresh copy of the hook: what a new session's first prompt gets. */
function sessionStart(project: string): unknown {
	const handlers = new Map<string, unknown>();
	limenCommunication({ on: (name: string, handler: unknown) => handlers.set(name, handler) });
	const start = handlers.get("before_agent_start");
	assert.ok(typeof start === "function", "the hook handles before_agent_start");
	return start({ prompt: "Hello.", systemPrompt: "Base prompt." }, { cwd: project });
}

/**
 * The session start with PATH unchanged and with the `jg` folder first on PATH, and whether that `jg` ran. Every
 * variable the hook reads for the session's kind is set or cleared, and all of them are restored after the test.
 */
async function startWithAndWithoutJg(t: TestContext, job: boolean) {
	const { project, bin, home, marker } = await fixture(t);
	const values: Env = {
		LIMEN_JOB: job ? "1" : undefined,
		LIMEN_JOB_ID: job ? JOB_ID : undefined,
		LIMEN_CONTEXT_ROOT: job ? project : undefined,
		LIMEN_HOME: home,
		PATH: process.env.PATH,
	};
	const old: Env = Object.fromEntries(Object.keys(values).map((name) => [name, process.env[name]]));
	t.after(() => assign(old));
	assign(values);
	const plain = sessionStart(project);
	process.env.PATH = `${bin}:${process.env.PATH ?? ""}`;
	const withJg = sessionStart(project);
	return { plain, withJg, ran: existsSync(marker) };
}

test("T-36: a coordinator session starts with the same context with and without a jg on PATH, and the hook never runs it", async (t) => {
	const { plain, withJg, ran } = await startWithAndWithoutJg(t, false);
	assert.deepEqual([withJg, ran], [plain, false]);
});

test("T-36: a job session starts with the same context with and without a jg on PATH, and the hook never runs it", async (t) => {
	const { plain, withJg, ran } = await startWithAndWithoutJg(t, true);
	assert.deepEqual([withJg, ran], [plain, false]);
});
