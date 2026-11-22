// `limen show` (src/job/listing.ts) of a finished job: the readings of its systemd user scope.
import assert from "node:assert/strict";
import { writeFile } from "node:fs/promises";
import { basename, join } from "node:path";
import { test } from "node:test";
import type { Scope } from "../../src/job/record.ts";
import { jobDir, limen, plant, SCOPE_READINGS, writeRecord } from "../plant.ts";

const READ = "2026-11-22-scope-1a2b3c4d";
const UNREAD = "2026-11-22-gone-5e6f7a8b";

/** A finished job's record, task and log in its folder `dir`, its scope with `readings`. */
async function finished(dir: string, readings: Omit<Scope, "unit" | "cgroup">): Promise<void> {
	const unit = `limen-job-${basename(dir)}.scope`;
	const at = "2026-11-22T10:00:00.000Z";
	const scope = { unit, cgroup: `/user.slice/app.slice/${unit}`, ...readings };
	await writeRecord(dir, { state: "done", label: "demo", branch: "limen/demo", startedAt: at, finishedAt: at, scope });
	await writeFile(join(dir, "task.md"), "say done\n");
	await writeFile(join(dir, "log"), `[limen ${at}] done: pi exited 0\n`);
}

/** The scope line of the detail `limen show` prints through a pipe. */
const scopeLine = (stdout: string) => /^ {2}scope .+$/m.exec(stdout)?.[0];

// M-09: the scope's peak memory and CPU time per job are the signal of T-43's revisit.
test("the detail of a finished job shows the memory peak, CPU time and OOM kills of its scope, and unknown for unread ones", async (t) => {
	const p = await plant();
	t.after(() => p.cleanup());
	await finished(jobDir(p, READ), SCOPE_READINGS);
	await finished(jobDir(p, UNREAD), { memoryPeakBytes: null, cpuMicroseconds: null, oomKills: null });
	const read = limen(p, ["show", READ]);
	const unread = limen(p, ["show", UNREAD]);
	assert.deepEqual(
		[read.status, unread.status, scopeLine(read.stdout), scopeLine(unread.stdout)],
		[
			0,
			0,
			"  scope memory peak 50.0 MiB · CPU 2.5 s · OOM kills 0",
			"  scope memory peak unknown · CPU unknown · OOM kills unknown",
		],
		`${read.stdout}${read.stderr}${unread.stdout}${unread.stderr}`,
	);
});
