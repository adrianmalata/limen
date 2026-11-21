// `limen spawn`: the job it starts takes its time limit from the spawn, never from the spawner's environment.
import assert from "node:assert/strict";
import { test } from "node:test";
import { isTerminal } from "../../src/job/job.ts";
import { jobDir, jobFile, jobState, limen, plant, spawnJob, until, waitJob } from "../plant.ts";

/** How long the job runs past its engine's start before the test looks: well past the 1 s the variable would give. */
const PAST_LEAK_MS = 2_500;

test("a spawn without --timeout from an environment that holds LIMEN_TIMEOUT_MS=1000 starts a job that outlives 1 s", async (t) => {
	const p = await plant();
	t.after(() => p.cleanup());
	const id = spawnJob(p, "block", ["--label", "leak"], { env: { LIMEN_TIMEOUT_MS: "1000" } });
	const dir = jobDir(p, id);
	// The wrapper logs "worker started" just before it sets its timeout; a job that times out ends the wait as well.
	const started = () => Date.parse(/\[limen (\S+)\] worker started/.exec(jobFile(p, id, "log"))?.[1] ?? "");
	await until(dir, () => isTerminal(jobState(p, id)) || Date.now() - started() > PAST_LEAK_MS);
	const log = jobFile(p, id, "log");
	assert.deepEqual(
		[jobState(p, id), log.match(/timeout after \d+ms/)?.[0], log.match(/worker started, time limit (\S+)/)?.[1]],
		["running", undefined, "1h30m"],
	);
	assert.equal(limen(p, ["stop", id, "test stop"]).status, 0);
	assert.equal(waitJob(p, id), "stopped");
});
