// `limen show` (src/job/listing.ts) of a finished job: the readings of its systemd user scope with its peak CPU share,
// the kind and the reset time of its failure, and an older record's open checks; and of a running job whose wrapper is
// dead, which it shows and does not end (T-04).
import assert from "node:assert/strict";
import { writeFile } from "node:fs/promises";
import { basename, join } from "node:path";
import { test } from "node:test";
import type { JobRecord, Scope } from "../../src/job/record.ts";
import { platform } from "../../src/platform/platform.ts";
import { jobDir, jobRecord, limen, plant, SCOPE_READINGS, writeRecord } from "../plant.ts";
import { snapshot } from "../snapshot.ts";

const READ = "2026-11-22-scope-1a2b3c4d";
const UNREAD = "2026-11-22-gone-5e6f7a8b";

/** A finished job's record, task and log in its folder `dir`, its scope with `readings`, and the record's `fields`. */
async function finished(
	dir: string,
	readings: Omit<Scope, "unit" | "cgroup">,
	fields: Partial<JobRecord> = {},
): Promise<void> {
	const unit = `limen-job-${basename(dir)}.scope`;
	const at = "2026-11-22T10:00:00.000Z";
	const scope = { unit, cgroup: `/user.slice/app.slice/${unit}`, ...readings };
	const record = { state: "done", label: "demo", branch: "limen/demo", startedAt: at, finishedAt: at, scope } as const;
	await writeRecord(dir, { ...record, ...fields });
	await writeFile(join(dir, "task.md"), "say done\n");
	await writeFile(join(dir, "log"), `[limen ${at}] done: pi exited 0\n`);
}

/** The scope line of the detail `limen show` prints through a pipe. */
const scopeLine = (stdout: string) => /^ {2}scope .+$/m.exec(stdout)?.[0];

// M-09: the scope's peak memory, CPU time and peak CPU share per job are the signal of T-43's revisit.
test("the detail of a finished job shows the memory peak, the CPU time with its peak share and the OOM kills of its scope, and unknown for unread ones", async (t) => {
	const p = await plant();
	t.after(() => p.cleanup());
	await finished(jobDir(p, READ), { ...SCOPE_READINGS, cpuPeakPercent: 37 });
	await finished(jobDir(p, UNREAD), { memoryPeakBytes: null, cpuMicroseconds: null, oomKills: null });
	const read = limen(p, ["show", READ]);
	const unread = limen(p, ["show", UNREAD]);
	assert.deepEqual(
		[read.status, unread.status, scopeLine(read.stdout), scopeLine(unread.stdout)],
		[
			0,
			0,
			"  scope memory peak 50.0 MiB · CPU 2.5 s, peak 37% · OOM kills 0",
			"  scope memory peak unknown · CPU unknown, peak unknown · OOM kills unknown",
		],
		`${read.stdout}${read.stderr}${unread.stdout}${unread.stderr}`,
	);
});

/** The failure line of the detail `limen show` prints through a pipe. */
const failureLine = (stdout: string) => /^ {2}failure .+$/m.exec(stdout)?.[0];

// A-016 (1), R-034: the coordinator reads a failed job's kind, and for `quota` when the limit resets, in its detail.
test("the detail of a failed job shows its failure kind, and for quota its reset time or unknown", async (t) => {
	const p = await plant();
	t.after(() => p.cleanup());
	const at = "2026-11-24T14:10:00.000Z";
	const failures = {
		"2026-11-24-quota-1a2b3c4d": { kind: "quota", detail: "error: limit", resetAt: "2026-11-24T15:00:00.000Z" },
		"2026-11-24-unread-5e6f7a8b": { kind: "quota", detail: "error: limit", resetAt: null },
		"2026-11-24-timeout-9a8b7c6d": { kind: "timeout", detail: "timeout after 5400000ms", resetAt: null },
	} as const;
	for (const [id, failure] of Object.entries(failures)) {
		const dir = jobDir(p, id);
		await writeRecord(dir, {
			state: "failed",
			label: "demo",
			branch: "limen/demo",
			startedAt: at,
			finishedAt: at,
			failure,
		});
		await writeFile(join(dir, "task.md"), "error limit\n");
		await writeFile(join(dir, "log"), `[limen ${at}] failed: ${failure.detail}\n`);
	}
	const shown = Object.keys(failures).map((id) => limen(p, ["show", id]));
	assert.deepEqual(
		shown.map((run) => [run.status, failureLine(run.stdout)]),
		[
			[0, "  failure quota · resets 2026-11-24T15:00:00.000Z"],
			[0, "  failure quota · resets unknown"],
			[0, "  failure timeout"],
		],
		shown.map((run) => `${run.stdout}${run.stderr}`).join("\n"),
	);
});

// A-044, z. 29: the task note is cut, so a done job is a plain done; an older record's open items stay readable as
// history (R-042 Decision 2).
test("the detail of a done job whose older record holds open checks shows it done, with one plain open-checks block", async (t) => {
	const p = await plant();
	t.after(() => p.cleanup());
	const open = ["Tests: not proven. No run.", "Build: dropped."];
	await finished(jobDir(p, READ), SCOPE_READINGS, { openChecks: open });
	const run = limen(p, ["show", READ]);
	const lines = run.stdout.split("\n");
	const at = lines.indexOf("  open-checks:");
	assert.deepEqual(
		[run.status, lines[0]?.startsWith("DONE demo · "), lines.slice(at + 1, at + 3), /open checks/i.test(run.stdout)],
		[0, true, open.map((line) => `    ${line}`), false],
		`${run.stdout}${run.stderr}`,
	);
});

/** A wrapper that is gone: a pid no process holds, under this boot, as a wrapper killed alone leaves it. */
const DEAD = { pid: 2_147_483_646, born: "1", bootId: platform.bootId() ?? null };

// T-04, R-032 (d): a read shows a dead job's state without writing it; only the seat sweep finalizes it.
test("the detail of a running job whose wrapper is dead says wrapper dead; limen-sweep will finalize, and show leaves it running", async (t) => {
	const p = await plant();
	t.after(() => p.cleanup());
	const id = "2026-11-24-dead-1a2b3c4d";
	const dir = jobDir(p, id);
	const at = new Date().toISOString();
	await writeRecord(dir, { state: "running", label: "demo", branch: "limen/demo", identity: DEAD, startedAt: at });
	await writeFile(join(dir, "task.md"), "block\n");
	await writeFile(join(dir, "log"), `[limen ${at}] worker started\n`);
	const before = snapshot(p.root);
	const run = limen(p, ["show", id], { env: { LIMEN_REAP_CONFIRM_MS: "1" } });
	assert.deepEqual(
		[
			run.status,
			run.stdout.split("\n")[0]?.includes(" · wrapper dead; limen-sweep will finalize · "),
			jobRecord(p, id)?.state,
		],
		[0, true, "running"],
		`${run.stdout}${run.stderr}`,
	);
	assert.deepEqual(snapshot(p.root), before);
});
