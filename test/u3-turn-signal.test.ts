// U3: what a completion wake tells a coordinator. It sends only a done job to landing.
import assert from "node:assert/strict";
import { mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";
import { promptPane } from "../src/integrations/coordinator-wake.ts";
import { completionWake } from "../src/job/wake-text.ts";
import { FINAL } from "./plant.ts";

test("only a done job is sent to landing; a done and a fallback wake have the whole message, a Herdr wake past one request is not sent", async (t) => {
	const dir = await mkdtemp(join(tmpdir(), "u12-"));
	t.after(() => rm(dir, { recursive: true, force: true }));
	await writeFile(join(dir, "task.md"), "Implement F001.\n");
	await writeFile(join(dir, "tool-calls"), "4\n");
	await writeFile(join(dir, "result"), `${FINAL.text}\n`);
	const wake = (state: string, fallback = false) =>
		completionWake(dir, "F001", state, "id", "limen/id", "", { instruction: "Inspect it before landing.", fallback });
	assert.doesNotMatch(wake("failed"), /landing/);
	assert.match(wake("done"), /is done \(id\).*before landing/s);
	assert.ok([wake("done"), wake("stopped", true)].every((text) => text.includes(`Final message:\n${FINAL.text}\n\n`)));
	await promptPane("/usr/bin/true", "w1:p1", wake("done").repeat(130), Date.now() + 60_000, join(dir, "p")); // 1.2 MB
	assert.match(await readFile(join(dir, "p"), "utf8"), /^attempt 1: not sent to w1:p1: prompt_too_large: \d{7} /);
});
