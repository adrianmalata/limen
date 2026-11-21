// The parsers of src/platform/linux.ts on fixture text: /proc/<pid>/stat, ps, /proc/meminfo and the boot id.
import assert from "node:assert/strict";
import { test } from "node:test";
import { parseBootId, parseMeminfo, parseProcessTable, parseStat } from "../../src/platform/linux.ts";

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

test("a ps row gives the process's pid, parent, group, CPU seconds and state, in that order of columns", () => {
	assert.deepEqual(parseProcessTable("  200     1   300 00:00:03 Ss\n", undefined), [
		{ pid: 200, ppid: 1, pgid: 300, cpuSeconds: 3, state: "Ss" },
	]);
});

test("ps's CPU time reads in its MM:SS, HH:MM:SS and DD-HH:MM:SS forms, and as NaN in any other form", () => {
	const rows = ["05:06", "01:02:03", "1-02:03:04", "1:2:3:4"].map((time, index) => `${index + 1} 1 1 ${time} S`);
	assert.deepEqual(
		parseProcessTable(rows.join("\n"), undefined).map((row) => row.cpuSeconds),
		[5 * 60 + 6, 3600 + 2 * 60 + 3, 86_400 + 2 * 3600 + 3 * 60 + 4, Number.NaN],
	);
});

test("the process table leaves out the row of the ps that printed it", () => {
	const output = "  200     1   200 00:00:00 S\n  999   200   200 00:00:00 R\n";
	assert.deepEqual(
		parseProcessTable(output, 999).map((row) => row.pid),
		[200],
	);
});

test("the process table skips a header line and empty lines", () => {
	const output = "PID PPID PGID TIME STAT\n\n  200     1   200 00:00:00 S\n\n";
	assert.deepEqual(
		parseProcessTable(output, undefined).map((row) => row.pid),
		[200],
	);
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
