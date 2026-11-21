// src/integrations/coordinator-wake.ts: a record the migration wrote is history only, so its end prompts no pane.
import assert from "node:assert/strict";
import { existsSync } from "node:fs";
import { mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";
import { promptCoordinator } from "../../src/integrations/coordinator-wake.ts";
import { withEnvironment } from "../environment.ts";
import { writeRecord } from "../plant.ts";

// D-057 (4): the Limen that ran a migrated job owed its wakes; a reaper that ends such a record later wakes no one.
test("the end of a record the migration wrote prompts no coordinator pane through Herdr", async (t) => {
	const dir = await mkdtemp(join(tmpdir(), "limen-coordinator-wake-"));
	t.after(() => rm(dir, { recursive: true, force: true }));
	// A Herdr that refuses every call: the wake would claim its receipt before it calls Herdr.
	const herdr = join(dir, "herdr");
	await writeFile(herdr, "#!/bin/sh\nexit 1\n", { mode: 0o755 });
	withEnvironment(t, { LIMEN_HERDR: herdr });
	const job = join(dir, ".limen", "jobs", "2026-11-01-old-1a2b3c4d");
	const at = "2026-11-21T01:00:00.000Z";
	await writeRecord(job, {
		state: "failed",
		label: "old work",
		origin: { tab: "tab-1", pane: "pane-1", session: null },
		finishedAt: at,
		migrated: { at },
	});
	await writeFile(join(job, "task.md"), "the old task\n");
	await promptCoordinator(job);
	assert.ok(!existsSync(join(job, "notify", "herdr-prompt")), "a Herdr wake was claimed for a migrated record");
});
