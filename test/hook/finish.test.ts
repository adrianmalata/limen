// hook/finish.ts: a job's first `finish` call writes its handoff as the result and ends the session, with no check
// before it and no handler of its own around the run's end.
import assert from "node:assert/strict";
import { mkdir, mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test, { type TestContext } from "node:test";
import limenFinish from "../../hook/finish.ts";
import type { PiTool, PiToolOutput } from "../../src/runtime/pi-api.ts";
import { withEnvironment } from "../environment.ts";

const JOB_ID = "2026-11-27-finish-1a2b3c4d";

/** A job folder with an empty log in a project in the OS temporary folder, in the environment of that job's session. */
async function jobSession(t: TestContext): Promise<string> {
	const root = await mkdtemp(join(tmpdir(), "limen-finish-"));
	t.after(() => rm(root, { recursive: true, force: true }));
	const job = join(root, ".limen", "jobs", JOB_ID);
	await mkdir(job, { recursive: true });
	await writeFile(join(job, "log"), "");
	withEnvironment(t, { LIMEN_JOB: "1", LIMEN_CONTEXT_ROOT: root, LIMEN_JOB_ID: JOB_ID });
	return job;
}

/** The hook on a fake `pi`: the events it handles, by name, and the tools it registers. */
function loadHook() {
	const events: string[] = [];
	const tools: PiTool[] = [];
	const pi = {
		on(event: string) {
			events.push(event);
		},
		registerTool(tool: PiTool) {
			tools.push(tool);
		},
	};
	limenFinish(pi);
	return { events, tools };
}

/** Calls the hook's `finish` tool once with `handoff`; its answer, and how often it shut the session down. */
async function finish(handoff: string): Promise<{ readonly output: PiToolOutput; readonly shutdowns: number }> {
	const tool = loadHook().tools.find((each) => each.name === "finish");
	assert.ok(tool, "the hook registers the finish tool");
	let shutdowns = 0;
	const context = {
		shutdown() {
			shutdowns += 1;
		},
	};
	const output = await tool.execute("call-1", { handoff }, undefined, undefined, context);
	return { output, shutdowns };
}

// A-044: the first call answered with the note check and wrote no result, so a job near its timeout lost its handoff.
test("the first finish call writes its handoff as the job's result, shuts the session down and answers done", async (t) => {
	const job = await jobSession(t);
	const { output, shutdowns } = await finish("The handoff.");
	assert.deepEqual(
		{ answer: output.content, shutdowns, result: await readFile(join(job, "result"), "utf8") },
		{ answer: [{ type: "text", text: "done" }], shutdowns: 1, result: "The handoff.\n" },
	);
});

// A-044: the hook gave a run that ended without finish one more turn at agent_before_settle.
test("the finish hook registers its tool and handles no event of the run", async (t) => {
	await jobSession(t);
	const { events, tools } = loadHook();
	assert.deepEqual({ events, tools: tools.map(({ name }) => name) }, { events: [], tools: ["finish"] });
});

test("a finish call writes no line to the job's log", async (t) => {
	const job = await jobSession(t);
	await finish("The handoff.");
	assert.equal(await readFile(join(job, "log"), "utf8"), "");
});
