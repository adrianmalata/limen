// `limen workspace init` checks the system requirements before it sets up a folder outside Git.
import assert from "node:assert/strict";
import { existsSync } from "node:fs";
import { mkdir } from "node:fs/promises";
import { join } from "node:path";
import { test } from "node:test";
import { outputText, readOutcome } from "../final-line.ts";
import { limen, pathWithout, plant } from "../plant.ts";

test("MISSING_TOOL: limen workspace init refuses with exit code 4 and names tar when tar is not on PATH, before it writes", async (t) => {
	const p = await plant();
	t.after(() => p.cleanup());
	const workspace = join(p.parent, "workspace");
	await mkdir(workspace);
	const run = limen(p, ["workspace", "init"], { cwd: workspace, env: { PATH: await pathWithout(p, "tar") } });
	const named = /^tar is not on PATH/m.test(outputText(run));
	assert.deepEqual(
		[run.status, readOutcome(run).code, named, existsSync(join(workspace, ".limen"))],
		[4, "MISSING_TOOL", true, false],
	);
});
