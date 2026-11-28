// src/platform/linux.ts: its parsers on fixture text (/proc/<pid>/stat, /proc/meminfo, the boot id, a process's cgroup,
// a scope's readings), the CPU time of one cgroup and the units of the user manager on a fake cgroup hierarchy, which
// only test mode reads, the state and the signals of a user scope on the tests' systemd (test/plant.ts), and the linger
// file, the user unit folder and the user manager's answers of the seat sweep's units.
import assert from "node:assert/strict";
import { existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { type TestContext, test } from "node:test";
import {
	linux,
	parseBootId,
	parseCgroup,
	parseCounter,
	parseKeyed,
	parseMeminfo,
	parseStat,
} from "../../src/platform/linux.ts";
import { withEnvironment } from "../environment.ts";
import { failingSystemctl, fakeCgroup, fakeSystemd, scopeProcess, systemdCalls } from "../plant.ts";

/** A stat line: the fields after the command are state, parent, group, session, then fields 7-21, start ticks last. */
const stat = (pid: number, command: string, state: string, startTicks: string) =>
	`${pid} (${command}) ${state} 77 4242 4242 0 -1 4194560 120 0 0 0 3 1 0 0 20 0 1 0 ${startTicks} 1234 56\n`;

test("a stat line whose command holds spaces and parentheses gives the parent, the group, the start ticks and the whole command", () => {
	assert.deepEqual(parseStat(4321, stat(4321, "we (i) rd) x", "S", "987654")), {
		kind: "present",
		process: { pid: 4321, ppid: 77, pgid: 4242, born: "987654", command: "we (i) rd) x" },
	});
});

test("a stat line in state Z reads as an absent process", () => {
	assert.deepEqual(parseStat(4321, stat(4321, "gone", "Z", "987654")), { kind: "absent" });
});

test("a stat line without the parenthesis that closes its command reads as unavailable", () => {
	assert.deepEqual(parseStat(4321, "4321 (cut S 77 4242"), { kind: "unavailable" });
});

test("the boot id is the one UUID line of boot_id, and nothing for an empty or other text", () => {
	assert.deepEqual(
		[parseBootId("6f1b2c3d-4e5f-4a6b-8c7d-9e0f1a2b3c4d\n"), parseBootId(""), parseBootId("not a boot id\n")],
		["6f1b2c3d-4e5f-4a6b-8c7d-9e0f1a2b3c4d", undefined, undefined],
	);
});

test("meminfo gives MemAvailable and MemTotal in KiB, and nothing when either line is missing", () => {
	const meminfo = "MemTotal:       16303428 kB\nMemFree:         1234567 kB\nMemAvailable:    8151714 kB\n";
	assert.deepEqual(
		[parseMeminfo(meminfo), parseMeminfo("MemTotal:       16303428 kB\n")],
		[{ availableKib: 8_151_714, totalKib: 16_303_428 }, undefined],
	);
});

test("a process's cgroup is the path of the cgroup v2 line of /proc/<pid>/cgroup, and nothing without that line", () => {
	const scope = "/user.slice/user-1000.slice/user@1000.service/app.slice/limen-job-2026-11-22-f001-a-1a2b3c4d.scope";
	const hybrid = `12:memory:/user.slice\n1:name=systemd:/user.slice\n0::${scope}\n`;
	assert.deepEqual(
		[parseCgroup(`0::${scope}\n`), parseCgroup(hybrid), parseCgroup("12:memory:/user.slice\n"), parseCgroup("")],
		[scope, scope, undefined, undefined],
	);
});

test("a scope's memory peak, CPU time and OOM kills read from memory.peak, cpu.stat and memory.events", () => {
	const cpu = "usage_usec 2500000\nuser_usec 2000000\nsystem_usec 500000\n";
	const events = "low 0\nhigh 0\nmax 3\noom 1\noom_kill 2\noom_group_kill 0\n";
	assert.deepEqual(
		[parseCounter("52428800\n"), parseKeyed(cpu, "usage_usec"), parseKeyed(events, "oom_kill")],
		[52_428_800, 2_500_000, 2],
	);
});

test("a scope's reading is null for a file that is gone or holds no number of its own", () => {
	assert.deepEqual(
		[
			parseCounter(undefined),
			parseCounter("max\n"),
			parseKeyed(undefined, "usage_usec"),
			parseKeyed("oom_group_kill 4\n", "oom_kill"),
			parseKeyed("usage_usec -1\n", "usage_usec"),
		],
		[null, null, null, null, null],
	);
});

/** The cgroup of the user manager in the fake hierarchies of the tests of `userUnits`. */
/** The account the tests run as, whose user manager `userUnits` reads (R-032 review round 1, note 6). */
const UID = process.getuid?.() ?? 0;
const MANAGER = `/user.slice/user-${UID}.slice/user@${UID}.service`;

/**
 * A fake cgroup hierarchy for one test, which this process reads in place of the system's, as one that runs in the
 * cgroup `own`; each of `files` is written below it with its text.
 */
async function cgroupTree(t: TestContext, own: string, files: Readonly<Record<string, string>>): Promise<string> {
	const root = mkdtempSync(join(tmpdir(), "limen-units-"));
	t.after(() => rmSync(root, { recursive: true, force: true }));
	for (const [path, text] of Object.entries(files)) {
		mkdirSync(join(root, path, ".."), { recursive: true });
		writeFileSync(join(root, path), text);
	}
	withEnvironment(t, { LIMEN_CGROUP_ROOT: root, LIMEN_CGROUP: own });
	return root;
}

// T-03, R-087 (b): on the seat a spawner's environment that held either knob would pass an unscoped wrapper as in its
// scope, or read and end a scope in a folder of its own (the R-050, R-087 note of `plan.md`).
test("ownCgroup and the cgroup folder ignore LIMEN_CGROUP and LIMEN_CGROUP_ROOT outside test mode", async (t) => {
	const cgroup = `${MANAGER}/app.slice/limen-job-2026-11-25-mode-1a2b3c4d.scope`;
	const root = await cgroupTree(t, cgroup, { [`${cgroup}/cpu.stat`]: "usage_usec 7\nuser_usec 0\nsystem_usec 0\n" });
	process.env.LIMEN_TEST_MODE = "0";
	const own = existsSync("/proc/self/cgroup") ? parseCgroup(readFileSync("/proc/self/cgroup", "utf8")) : undefined;
	assert.deepEqual(
		[linux.ownCgroup(), await linux.cpuTime(cgroup)],
		[own, { kind: "unreadable", detail: `/sys/fs/cgroup${cgroup}/cpu.stat is missing` }],
		root,
	);
});

// A-036: the start queue's diagnosis ranks the units of the agents' user manager by memory and CPU.
test("userUnits lists each unit of this process's user manager with its current memory and CPU time, by name", async (t) => {
	const cpu = (usec: number) => `usage_usec ${usec}\nuser_usec 0\nsystem_usec 0\n`;
	await cgroupTree(t, `${MANAGER}/app.slice/limen-job-2026-11-23-units-1a2b3c4d.scope`, {
		[`${MANAGER}/memory.current`]: "999999999\n",
		[`${MANAGER}/init.scope/memory.current`]: "1048576\n",
		[`${MANAGER}/init.scope/cpu.stat`]: cpu(100),
		[`${MANAGER}/app.slice/memory.current`]: "888888888\n",
		[`${MANAGER}/app.slice/limen-job-2026-11-23-units-1a2b3c4d.scope/memory.current`]: "52428800\n",
		[`${MANAGER}/app.slice/limen-job-2026-11-23-units-1a2b3c4d.scope/cpu.stat`]: cpu(2_500_000),
		// A unit's own child cgroups are counted in the unit, so they are no units of their own.
		[`${MANAGER}/app.slice/herdr.service/memory.current`]: "10485760\n",
		[`${MANAGER}/app.slice/herdr.service/cpu.stat`]: cpu(7),
		[`${MANAGER}/app.slice/herdr.service/payload/memory.current`]: "777\n",
		[`${MANAGER}/session.slice/dbus.service/memory.current`]: "max\n",
		// A login session sits beside the user manager, not in it.
		[`/user.slice/user-${UID}.slice/session-3.scope/memory.current`]: "123456789\n",
	});
	assert.deepEqual(await linux.userUnits(), [
		{ unit: "dbus.service", memoryBytes: null, cpuMicroseconds: null },
		{ unit: "herdr.service", memoryBytes: 10_485_760, cpuMicroseconds: 7 },
		{ unit: "init.scope", memoryBytes: 1_048_576, cpuMicroseconds: 100 },
		{ unit: "limen-job-2026-11-23-units-1a2b3c4d.scope", memoryBytes: 52_428_800, cpuMicroseconds: 2_500_000 },
	]);
});

test("userUnits gives nothing for a process outside a user manager", async (t) => {
	await cgroupTree(t, "/system.slice/limen-alerts.service", {});
	assert.equal(await linux.userUnits(), undefined);
});

// R-032 review round 1, note 6: an empty listing read as "no leftover scope" would clear what the sweep counts.
test("userUnits gives nothing, not an empty listing, when the user manager of the process's account has no cgroup folder", async (t) => {
	await cgroupTree(t, `${MANAGER}/app.slice/gone.scope`, {});
	assert.equal(await linux.userUnits(), undefined);
});

// A unit can end while the walk reads, and a folder that is gone holds no unit.
test("userUnits lists no unit for a user manager whose cgroup folder holds none", async (t) => {
	await cgroupTree(t, `${MANAGER}/app.slice/gone.scope`, { [`${MANAGER}/memory.current`]: "4096\n" });
	assert.deepEqual(await linux.userUnits(), []);
});

// R-032 review round 1, note 6: the manager is the account's own, never the one a cgroup's slice names.
test("userUnits of a process in a login session of another uid lists nothing of that uid's manager", async (t) => {
	const other = UID + 1;
	const theirs = `/user.slice/user-${other}.slice/user@${other}.service`;
	await cgroupTree(t, `/user.slice/user-${other}.slice/session-3.scope`, {
		[`${theirs}/app.slice/limen-job-2026-11-24-theirs-1a2b3c4d.scope/memory.current`]: "4096\n",
	});
	assert.equal(await linux.userUnits(), undefined);
});

// A-059: the stall rule and the peak CPU share read the job scope's CPU time at every tick, so only `cpu.stat` is read.
test("cpuTime gives the usage_usec of the cgroup's own cpu.stat", async (t) => {
	const cgroup = `${MANAGER}/app.slice/limen-job-2026-11-24-cpu-1a2b3c4d.scope`;
	await cgroupTree(t, cgroup, {
		[`${cgroup}/cpu.stat`]: "usage_usec 2500000\nuser_usec 2000000\nsystem_usec 500000\n",
		[`${cgroup}/memory.peak`]: "52428800\n",
	});
	assert.deepEqual(await linux.cpuTime(cgroup), { kind: "read", microseconds: 2_500_000 });
});

// T-01: a read that fails is never a number, so the stall rule takes it for no evidence and names it.
test("cpuTime of a cgroup whose cpu.stat is gone, or holds no usage_usec line, is unreadable and names the file", async (t) => {
	const gone = `${MANAGER}/app.slice/limen-job-2026-11-24-gone-1a2b3c4d.scope`;
	const other = `${MANAGER}/app.slice/limen-job-2026-11-24-other-5e6f7a8b.scope`;
	const root = await cgroupTree(t, gone, { [`${other}/cpu.stat`]: "user_usec 2000000\nsystem_usec 500000\n" });
	assert.deepEqual(
		[await linux.cpuTime(gone), await linux.cpuTime(other)],
		[
			{ kind: "unreadable", detail: `${root}${gone}/cpu.stat is missing` },
			{ kind: "unreadable", detail: `${root}${other}/cpu.stat holds no usage_usec line` },
		],
	);
});

const UNIT = "limen-job-2026-11-22-scope-1a2b3c4d.scope";

/**
 * The tests' systemd for this test, in a new folder of the OS temporary folder removed after it, with the folder of the
 * scope `UNIT`: its cgroup, the folder of the tests' cgroups, and the test's own folder.
 */
async function scopeFolder(
	t: TestContext,
): Promise<{ readonly cgroup: string; readonly cgroups: string; readonly folder: string }> {
	const folder = mkdtempSync(join(tmpdir(), "limen-linux-"));
	t.after(() => rmSync(folder, { recursive: true, force: true }));
	const systemd = await fakeSystemd(folder);
	withEnvironment(t, systemd);
	const cgroup = fakeCgroup(UNIT);
	mkdirSync(join(systemd.LIMEN_CGROUP_ROOT, cgroup), { recursive: true });
	return { cgroup, cgroups: systemd.LIMEN_CGROUP_ROOT, folder };
}

test("scopeState reads a scope that holds a process as active and sends its process no signal", async (t) => {
	const { cgroup, cgroups } = await scopeFolder(t);
	const member = await scopeProcess(t, cgroup);
	assert.deepEqual(
		[linux.scopeState(UNIT, cgroup), systemdCalls(cgroups, "systemctl"), linux.processAlive(member.pid)],
		[{ kind: "active" }, [`--user is-active ${UNIT}`], true],
	);
});

test("scopeState reads a scope with no process left as gone, and one whose cgroup folder is gone with no call", async (t) => {
	const { cgroup, cgroups } = await scopeFolder(t);
	const empty = linux.scopeState(UNIT, cgroup);
	rmSync(join(cgroups, cgroup), { recursive: true });
	assert.deepEqual(
		[empty, linux.scopeState(UNIT, cgroup), systemdCalls(cgroups, "systemctl")],
		[{ kind: "gone" }, { kind: "gone" }, [`--user is-active ${UNIT}`]],
	);
});

test("scopeState gives the user manager's first line of error when it cannot read the scope", async (t) => {
	const { cgroup, folder } = await scopeFolder(t);
	process.env.PATH = `${await failingSystemctl(folder)}:${process.env.PATH ?? ""}`;
	assert.deepEqual(linux.scopeState(UNIT, cgroup), {
		kind: "failed",
		detail: "Failed to connect to bus: No medium found",
	});
});

test("signalScope sends SIGTERM to every process of the scope, which then holds none and reads as gone", async (t) => {
	const { cgroup, cgroups } = await scopeFolder(t);
	const [first, second] = [await scopeProcess(t, cgroup), await scopeProcess(t, cgroup)];
	assert.deepEqual(linux.signalScope(UNIT, "SIGTERM"), { kind: "sent" });
	assert.deepEqual(
		[await first.end(), await second.end(), existsSync(join(cgroups, cgroup)), linux.scopeState(UNIT, cgroup)],
		["SIGTERM", "SIGTERM", true, { kind: "gone" }],
	);
	assert.equal(systemdCalls(cgroups, "systemctl").at(0), `--user kill --signal=SIGTERM ${UNIT}`);
});

test("signalScope gives the user manager's words for a scope with no process left", async (t) => {
	const { cgroup } = await scopeFolder(t);
	assert.deepEqual(linux.signalScope(UNIT, "SIGKILL"), {
		kind: "failed",
		detail: `Failed to kill unit ${UNIT}: Unit ${UNIT} not loaded.`,
	});
	assert.deepEqual(linux.scopeState(UNIT, cgroup), { kind: "gone" });
});

/**
 * A folder below `parent` whose systemctl answers `--user is-active` of every unit with `word` and exit code `status`,
 * as systemd answers for a unit in that state, and fails every other call; for one test of the user manager's answers.
 * Its name holds both, so one test can put a word with two exit codes side by side.
 */
function answeringSystemctl(parent: string, word: string, status: number): string {
	const folder = join(parent, `systemctl-${word}-${status}`);
	mkdirSync(folder);
	const script = [
		"#!/bin/sh",
		`[ "$1 $2" = "--user is-active" ] && { echo ${word}; exit ${status}; }`,
		'echo "systemctl (tests): only --user is-active is emulated" >&2',
		"exit 1",
	];
	writeFileSync(join(folder, "systemctl"), `${script.join("\n")}\n`, { mode: 0o755 });
	return folder;
}

// R-027 review round 1, finding 4: `is-active` exits 3 for a scope systemd is still stopping, which may hold processes.
test("scopeState reads a scope systemd is still stopping (deactivating) as active, not as gone", async (t) => {
	const { cgroup, folder } = await scopeFolder(t);
	process.env.PATH = `${answeringSystemctl(folder, "deactivating", 3)}:${process.env.PATH ?? ""}`;
	assert.deepEqual(linux.scopeState(UNIT, cgroup), { kind: "active" });
});

test("scopeState reads a scope that is-active calls inactive or failed, with exit 3, as gone", async (t) => {
	const { cgroup, folder } = await scopeFolder(t);
	const path = process.env.PATH ?? "";
	const states = ["inactive", "failed"].map((word) => {
		process.env.PATH = `${answeringSystemctl(folder, word, 3)}:${path}`;
		return linux.scopeState(UNIT, cgroup);
	});
	assert.deepEqual(states, [{ kind: "gone" }, { kind: "gone" }]);
});

// E-18: the seat's systemd 259 exits 4, not 3, for a unit it does not hold, such as the scope of a job that ended
// before its wrapper ran, whose record names no cgroup; the end of that job read the scope's state as a failed call.
test("scopeState of a scope with no recorded cgroup reads exits 3 and 4 of is-active alike, by the printed word", async (t) => {
	const { folder } = await scopeFolder(t);
	const path = process.env.PATH ?? "";
	const states = [3, 4].map((status) =>
		["inactive", "failed", "deactivating"].map((word) => {
			process.env.PATH = `${answeringSystemctl(folder, word, status)}:${path}`;
			return linux.scopeState(UNIT, undefined);
		}),
	);
	const byWord = [{ kind: "gone" }, { kind: "gone" }, { kind: "active" }];
	assert.deepEqual(states, [byWord, byWord]);
});

// A-024: the sweep's install reads the linger state from the file systemd keeps, with no call.
test("lingers reads whether the account's linger file exists, and runs no program", async (t) => {
	const folder = mkdtempSync(join(tmpdir(), "limen-linger-"));
	t.after(() => rmSync(folder, { recursive: true, force: true }));
	writeFileSync(join(folder, "agents"), "");
	withEnvironment(t, { LIMEN_LINGER_DIR: folder, PATH: "/nonexistent" });
	assert.deepEqual([linux.lingers("agents"), linux.lingers("other")], [true, false]);
});

test("the user unit folder is $XDG_CONFIG_HOME/systemd/user, and ~/.config/systemd/user when it is unset or relative", (t) => {
	withEnvironment(t, { HOME: "/home/agents", XDG_CONFIG_HOME: "/srv/config" });
	const set = linux.userUnitFolder();
	process.env.XDG_CONFIG_HOME = "relative/config";
	const relative = linux.userUnitFolder();
	delete process.env.XDG_CONFIG_HOME;
	assert.deepEqual(
		[set, relative, linux.userUnitFolder()],
		["/srv/config/systemd/user", "/home/agents/.config/systemd/user", "/home/agents/.config/systemd/user"],
	);
});

// R-032 (f): `limen status` names a sweep that does not run from two probes of the user manager.
test("userUnitState gives what the user manager prints for a unit in the state asked, and nothing when it says no", async (t) => {
	const { folder } = await scopeFolder(t);
	const path = process.env.PATH ?? "";
	process.env.PATH = `${answeringSystemctl(folder, "active", 0)}:${path}`;
	const active = linux.userUnitState("limen-sweep.timer", "is-active");
	process.env.PATH = `${answeringSystemctl(folder, "inactive", 3)}:${path}`;
	assert.deepEqual([active, linux.userUnitState("limen-sweep.timer", "is-active")], ["active", undefined]);
});

// R-032 Decision 2: a sweep run by hand from a login shell lists the units its timer lists.
test("userUnits of a process in a login session lists the units of the user manager of that session's account", async (t) => {
	await cgroupTree(t, `/user.slice/user-${UID}.slice/session-3.scope`, {
		[`${MANAGER}/app.slice/limen-job-2026-11-24-session-1a2b3c4d.scope/memory.current`]: "4096\n",
		[`/user.slice/user-${UID}.slice/session-3.scope/memory.current`]: "123456789\n",
	});
	assert.deepEqual(await linux.userUnits(), [
		{ unit: "limen-job-2026-11-24-session-1a2b3c4d.scope", memoryBytes: 4096, cpuMicroseconds: null },
	]);
});
