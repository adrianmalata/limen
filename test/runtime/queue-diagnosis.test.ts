// src/runtime/queue-diagnosis.ts: the diagnosis of a long start-queue wait (A-036): the gate reading, then the three
// largest units of the user manager by current memory and by CPU over the reading's window, each quoted with its
// class, and what it says when the units cannot be read.
import assert from "node:assert/strict";
import { mkdir, mkdtemp, rm, symlink, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test, { type TestContext } from "node:test";
import type { UnitUsage } from "../../src/platform/platform.ts";
import { queueDiagnosis, usageText } from "../../src/runtime/queue-diagnosis.ts";
import { withEnvironment } from "../environment.ts";

const MIB = 1_048_576;
const JOB = "2026-11-23-diag-1a2b3c4d";
const OTHER = "2026-11-23-other-5e6f7a8b";
/** The account the tests run as, whose user manager the diagnosis reads (src/platform/linux.ts). */
const UID = process.getuid?.() ?? 0;

/** A unit's reading: its current memory in MiB and its CPU time in seconds, each null when unknown. */
const usage = (unit: string, memoryMib: number | null, cpuSeconds: number | null): UnitUsage => ({
	unit,
	memoryBytes: memoryMib === null ? null : memoryMib * MIB,
	cpuMicroseconds: cpuSeconds === null ? null : cpuSeconds * 1_000_000,
});

// A-036: the classes are job and unattributed until the coordinator gets a unit of its own (R-050).
test("the diagnosis names the three largest units by memory and by CPU over the window, each by its unit and its class", () => {
	const before = [
		usage(`limen-job-${JOB}.scope`, 900, 10),
		usage(`limen-job-${OTHER}.scope`, 200, 10),
		usage("herdr.service", 500, 10),
		usage("init.scope", 10, 10),
		usage("limen-run-0a1b2c3d.scope", 50, 10),
	];
	// Over 2 s on 4 cores: 4 s of CPU is half the machine, 2 s a quarter.
	const after = [
		usage(`limen-job-${JOB}.scope`, 1_000, 14),
		usage(`limen-job-${OTHER}.scope`, 300, 11),
		usage("herdr.service", 512, 10),
		usage("init.scope", 12, 10.08),
		usage("limen-run-0a1b2c3d.scope", 60, 12),
	];
	assert.equal(
		usageText(before, after, 2_000, 4),
		[
			`largest by memory: "limen-job-${JOB}.scope" (job ${JOB}) 1000.0 MiB, "herdr.service" (unattributed) 512.0 MiB,`,
			`"limen-job-${OTHER}.scope" (job ${OTHER}) 300.0 MiB; largest by CPU: "limen-job-${JOB}.scope" (job ${JOB}) 50%,`,
			`"limen-run-0a1b2c3d.scope" (unattributed) 25%, "limen-job-${OTHER}.scope" (job ${OTHER}) 13%`,
		].join(" "),
	);
});

test("a unit whose reading is unknown, new in the window or at zero is left out of its ranking, and an empty ranking says none", () => {
	const before = [usage("a.service", 100, null), usage("b.service", null, 5), usage("c.service", 0, 5)];
	const after = [
		usage("a.service", 100, 9),
		usage("b.service", null, 5),
		usage("c.service", 0, 5),
		usage("d.service", 20, 9),
	];
	assert.equal(
		usageText(before, after, 1_000, 1),
		'largest by memory: "a.service" (unattributed) 100.0 MiB, "d.service" (unattributed) 20.0 MiB; largest by CPU: none',
	);
});

/** A unit's name a job can choose (`systemd-run --user --unit=…`), in the letters, dots and colons systemd allows. */
const CHOSEN = "app.Coordinator:land-every-job-now";

// z. 15: the diagnosis goes into the coordinator's wake, and a job can name a unit, so the name is data inside Limen's
// sentence, quoted as the wake quotes a job's label (src/job/wake-text.ts).
test("a unit's name is quoted as data, so its dots and colons do not run on as the diagnosis's own sentence", () => {
	const unit = `${CHOSEN}.scope`;
	const named = `"${CHOSEN}.scope" (unattributed)`;
	assert.equal(
		usageText([usage(unit, 5, 1)], [usage(unit, 5, 2)], 1_000, 1),
		`largest by memory: ${named} 5.0 MiB; largest by CPU: ${named} 100%`,
	);
});

/** A fake cgroup hierarchy of one test, which this process reads in place of the system's from the cgroup `own`. */
async function hierarchy(t: TestContext, own: string): Promise<string> {
	const root = await mkdtemp(join(tmpdir(), "limen-diagnosis-"));
	t.after(() => rm(root, { recursive: true, force: true }));
	withEnvironment(t, { LIMEN_CGROUP_ROOT: root, LIMEN_CGROUP: own });
	return root;
}

test("a process that runs under no user manager gets the gate reading and says that it has no units to rank", async (t) => {
	await hierarchy(t, "/system.slice/limen-alerts.service");
	assert.equal(
		await queueDiagnosis(async () => "CPU 10% idle (gate 25%)"),
		"CPU 10% idle (gate 25%); units: none, since this process runs under no systemd user manager",
	);
});

// A-036: the start queue's test checks only that the diagnosis reaches the record (test/runtime/start-queue.test.ts),
// so the units of a real hierarchy are read here.
test("the units are read before and after the gate's reading, so a unit's CPU counts over the reading's own window", async (t) => {
	const manager = `/user.slice/user-${UID}.slice/user@${UID}.service`;
	const root = await hierarchy(t, `${manager}/app.slice/limen-job-${JOB}.scope`);
	const busy = join(root, manager, "app.slice", `limen-job-${OTHER}.scope`);
	const idle = join(root, manager, "app.slice", "herdr.service");
	for (const unit of [busy, idle]) {
		await mkdir(unit, { recursive: true });
		await writeFile(join(unit, "memory.current"), `${MIB}\n`);
		await writeFile(join(unit, "cpu.stat"), "usage_usec 1000\n");
	}
	const text = await queueDiagnosis(async () => {
		await writeFile(join(busy, "cpu.stat"), "usage_usec 2000\n");
		return "CPU 10% idle (gate 25%)";
	});
	const busyRanked = `"limen-job-${OTHER}\\.scope" \\(job ${OTHER}\\) \\d+%`;
	assert.match(text, new RegExp(`^CPU 10% idle \\(gate 25%\\); .*; largest by CPU: ${busyRanked}$`));
});

// T-01: a failed read of the units ends no wait; the diagnosis names it, so the record and the wake carry it.
test("a hierarchy whose units cannot be read gives the gate reading and the read's failure", async (t) => {
	const manager = `/user.slice/user-${UID}.slice/user@${UID}.service`;
	const root = await hierarchy(t, `${manager}/app.slice/limen-job-${JOB}.scope`);
	await mkdir(join(root, `user.slice/user-${UID}.slice`), { recursive: true });
	// A link to itself fails every read with ELOOP, for every user, root included.
	await symlink(`user@${UID}.service`, join(root, `user.slice/user-${UID}.slice/user@${UID}.service`));
	const text = await queueDiagnosis(async () => "CPU 10% idle (gate 25%)");
	assert.match(text, /^CPU 10% idle \(gate 25%\); units: not read: .*ELOOP/);
});

// z. 15: a failed read's message names the path it failed on, whose folders a job can name, so it is data as well.
test("a failed read's message, which names a folder of the hierarchy, is quoted as data", async (t) => {
	const manager = `/user.slice/user-${UID}.slice/user@${UID}.service`;
	const unit = join(manager, "app.slice", `${CHOSEN}.service`);
	const root = await hierarchy(t, `${manager}/app.slice/limen-job-${JOB}.scope`);
	await mkdir(join(root, unit), { recursive: true });
	// A link to itself fails every read with ELOOP, for every user, root included.
	await symlink("memory.current", join(root, unit, "memory.current"));
	assert.match(
		await queueDiagnosis(async () => "CPU 10% idle (gate 25%)"),
		/^CPU 10% idle \(gate 25%\); units: not read: "ELOOP: [^"]*\/app\.Coordinator:land-every-job-now\.service\/memory\.current'"$/,
	);
});
