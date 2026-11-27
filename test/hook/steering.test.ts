// hook/steering.ts: in a coordinator's session its factory returns before it reads any switch or starts any process.
import assert from "node:assert/strict";
import childProcess from "node:child_process";
import { syncBuiltinESMExports } from "node:module";
import test from "node:test";
import limenSteering from "../../hook/steering.ts";
import { inTemporaryProject, withEnvironment } from "../environment.ts";

// R-044 Decision 19 F3: steering is in no coordinator's set whatever the switches say, so its factory asks git nothing,
// whose unexpected error would otherwise stop the project stub before the hooks after it load.
test("in a coordinator's session the steering factory registers no handler and starts no process", async (t) => {
	await inTemporaryProject(t, "limen-steering-");
	withEnvironment(t, { LIMEN_JOB: "", LIMEN_GROUP_ID: "", LIMEN_CONTEXT_ROOT: "" });
	const started = [
		t.mock.method(childProcess, "spawnSync"),
		t.mock.method(childProcess, "execFileSync"),
		t.mock.method(childProcess, "spawn"),
	];
	// The modules that import these names by name see the counting ones only after the named exports are synced.
	syncBuiltinESMExports();
	t.after(() => {
		for (const method of started) {
			method.mock.restore();
		}
		syncBuiltinESMExports();
	});
	const handlers: string[] = [];
	limenSteering({ on: (name: string) => handlers.push(name), sendUserMessage() {} });
	assert.deepEqual([handlers, started.map((method) => method.mock.callCount())], [[], [0, 0, 0]]);
});
