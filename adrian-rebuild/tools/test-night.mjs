/* PL: Test narzędzia night.mjs (D-019) z fałszywym claude i sztucznym zegarem, bez prawdziwego czekania; jeden test
   sprawdza jeden mechanizm (T-29). Pokrywa: koniec kodem 0 po statusie done, argumenty claude, stdin z /dev/null,
   katalog roboczy, oba strumienie w logu, zwolnienie blokady, ponowienia po 30, 60 i 120 min, kod 3 po trzech
   ponowieniach, brak ponowienia o godzinie końca i po niej oraz po przespanym końcu, status sprzed przebiegu
   i nieznany powód, odmowy kodem 1, przejęcie porzuconej blokady (pid, czas startu, boot id) i kod 4 przy awarii
   narzędzia. Stan: działa. */
// Usage: node --test adrian-rebuild/tools/test-night.mjs
import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import {
	chmodSync,
	existsSync,
	mkdirSync,
	mkdtempSync,
	readFileSync,
	rmSync,
	utimesSync,
	writeFileSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { after, test } from "node:test";
import { deadline, FIRST_MESSAGE, night, ownerRecord } from "./night.mjs";

const MINUTE = 60_000;
const work = mkdtempSync(join(tmpdir(), "night-"));
after(() => rmSync(work, { recursive: true, force: true }));

// The fake claude records each call (arguments, working directory, whether stdin is /dev/null), prints to both
// streams and acts out the next step of its plan: "done" and "bad" write a status, "none" ends like a window limit.
const fakeScript = (dir) => `#!${process.execPath}
import { appendFileSync, fstatSync, mkdirSync, readFileSync, statSync, writeFileSync } from "node:fs";
const dir = ${JSON.stringify(dir)};
const calls = readFileSync(dir + "/calls.jsonl", "utf8").split("\\n").filter(Boolean).length;
const step = JSON.parse(readFileSync(dir + "/plan.json", "utf8"))[calls] ?? "none";
const stdin = fstatSync(0);
const stdinNull = stdin.isCharacterDevice() && stdin.rdev === statSync("/dev/null").rdev;
appendFileSync(dir + "/calls.jsonl", JSON.stringify({ argv: process.argv.slice(2), cwd: process.cwd(), stdinNull }) + "\\n");
process.stdout.write("fake stdout " + step + "\\n");
process.stderr.write("fake stderr " + step + "\\n");
if (step === "done" || step === "bad") {
	mkdirSync("adrian-rebuild/.night", { recursive: true });
	writeFileSync("adrian-rebuild/.night/status.json", JSON.stringify({ reason: step === "done" ? "done" : "blocked" }));
}
process.exitCode = step === "none" ? 1 : 0;
`;

let fixtures = 0;

/** A repository root with prompt.md and a fake claude that follows `plan`, one step per call. */
function fixture(plan, prompt = `Pierwsza wiadomość: „${FIRST_MESSAGE}”\n`) {
	fixtures += 1;
	const root = join(work, `root-${fixtures}`);
	const fake = join(work, `fake-${fixtures}`);
	mkdirSync(join(root, "adrian-rebuild", "input"), { recursive: true });
	mkdirSync(fake);
	writeFileSync(join(root, "adrian-rebuild", "input", "prompt.md"), prompt);
	writeFileSync(join(fake, "plan.json"), JSON.stringify(plan));
	writeFileSync(join(fake, "calls.jsonl"), "");
	writeFileSync(join(fake, "claude"), fakeScript(fake));
	chmodSync(join(fake, "claude"), 0o755);
	const calls = () =>
		readFileSync(join(fake, "calls.jsonl"), "utf8")
			.split("\n")
			.filter(Boolean)
			.map((line) => JSON.parse(line));
	return { root, claude: join(fake, "claude"), calls, night: join(root, "adrian-rebuild", ".night") };
}

/**
 * 22:00 local time on a fixed past day with no daylight-saving change near it, so the hour arithmetic is exact; every
 * real file time is after it, so a status the fake writes counts as written after the run started.
 */
const evening = () => new Date(2026, 0, 14, 22, 0, 0, 0);

/**
 * The artificial clock: `sleep` records the wait and moves the time on, without waiting; `oversleep` minutes more act
 * out a suspended laptop that wakes up after the planned time.
 */
function clock(start = evening(), oversleep = 0) {
	let time = start.getTime();
	const sleeps = [];
	return {
		start,
		sleeps,
		now: () => new Date(time),
		sleep: async (ms) => {
			sleeps.push(ms / MINUTE);
			time += ms + oversleep * MINUTE;
		},
	};
}

/** Runs the night in-process; returns the exit code, the waits in minutes and what it printed. */
async function run(setup, args, time = clock()) {
	const printed = [];
	const code = await night(["--claude", setup.claude, ...args], {
		root: setup.root,
		now: time.now,
		sleep: time.sleep,
		out: (line) => printed.push(line),
		err: (line) => printed.push(line),
	});
	return { code, sleeps: time.sleeps, printed: printed.join("\n"), start: time.start };
}

const day = (date) =>
	`${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}-${String(date.getDate()).padStart(2, "0")}`;
const runLog = (setup, start, n) => readFileSync(join(setup.night, `${day(start)}-run-${n}.log`), "utf8");

test("a run that writes the reason done ends the night with exit 0 and no retry", async () => {
	const setup = fixture(["done"]);
	const result = await run(setup, ["--until", "06:00"]);
	assert.equal(result.code, 0, result.printed);
	assert.deepEqual(result.sleeps, []);
	assert.equal(setup.calls().length, 1);
});

test("claude gets the first message in night mode, dontAsk and no --dangerously-skip-permissions", async () => {
	const setup = fixture(["done"]);
	await run(setup, ["--until", "06:00"]);
	const [call] = setup.calls();
	assert.deepEqual(call.argv, [
		"-p",
		`${FIRST_MESSAGE} Tryb nocny do 06:00.`,
		"--permission-mode",
		"dontAsk",
		"--output-format",
		"json",
	]);
	assert.ok(!call.argv.includes("--dangerously-skip-permissions"));
});

test("claude runs with stdin on /dev/null, so claude -p does not wait for input", async () => {
	const setup = fixture(["done"]);
	await run(setup, ["--until", "06:00"]);
	assert.equal(setup.calls()[0].stdinNull, true);
});

test("claude runs from the repository root", async () => {
	const setup = fixture(["done"]);
	await run(setup, ["--until", "06:00"]);
	assert.equal(setup.calls()[0].cwd, setup.root);
});

test("the run log holds the runner's start line and both output streams of claude", async () => {
	const setup = fixture(["done"]);
	const result = await run(setup, ["--until", "06:00"]);
	const log = runLog(setup, result.start, 1);
	assert.match(log, /night: run 1 started/);
	assert.match(log, /fake stdout done/);
	assert.match(log, /fake stderr done/);
});

test("the lock is released when the night ends, with or without a reason", async () => {
	for (const plan of [["done"], []]) {
		const setup = fixture(plan);
		await run(setup, ["--until", "06:00"]);
		assert.equal(existsSync(join(setup.night, "lock")), false);
	}
});

test("runs without a status are retried after 30, 60 and 120 minutes", async () => {
	const setup = fixture(["none", "none", "none", "done"]);
	const result = await run(setup, ["--until", "06:00"]);
	assert.equal(result.code, 0, result.printed);
	assert.deepEqual(result.sleeps, [30, 60, 120]);
	assert.equal(setup.calls().length, 4);
});

test("a night that is always interrupted ends with exit 3 after 3 retries and a line in the log", async () => {
	const setup = fixture([]);
	const result = await run(setup, ["--until", "06:00"]);
	assert.equal(result.code, 3, result.printed);
	assert.deepEqual(result.sleeps, [30, 60, 120]);
	assert.equal(setup.calls().length, 4);
	assert.match(runLog(setup, result.start, 4), /ended without a reason in status\.json after 4 runs; exit 3/);
});

test("no retry starts at --until", async () => {
	const setup = fixture([]);
	// 22:00 → run 1; the first retry would start at 22:30, the end itself.
	const result = await run(setup, ["--until", "22:30"]);
	assert.equal(result.code, 3, result.printed);
	assert.deepEqual(result.sleeps, []);
	assert.equal(setup.calls().length, 1);
});

test("no retry starts after --until", async () => {
	const setup = fixture([]);
	// 22:00 → run 1, 22:30 → run 2; the next retry would start at 23:30, after the end at 23:00.
	const result = await run(setup, ["--until", "23:00"]);
	assert.equal(result.code, 3, result.printed);
	assert.deepEqual(result.sleeps, [30]);
	assert.equal(setup.calls().length, 2);
});

test("a wait that wakes up after --until starts no run", async () => {
	const setup = fixture([]);
	// The retry is planned for 22:30, before the end at 23:00, but the clock wakes up at 23:30.
	const result = await run(setup, ["--until", "23:00"], clock(evening(), 60));
	assert.equal(result.code, 3, result.printed);
	assert.equal(setup.calls().length, 1);
	assert.match(runLog(setup, result.start, 1), /the end came during the wait/);
});

test("a status written before the run started does not count", async () => {
	const setup = fixture(["none", "done"]);
	const time = clock();
	mkdirSync(setup.night, { recursive: true });
	const status = join(setup.night, "status.json");
	writeFileSync(status, JSON.stringify({ reason: "done" }));
	const before = (time.start.getTime() - 60 * MINUTE) / 1000;
	utimesSync(status, before, before);
	const result = await run(setup, ["--until", "06:00"], time);
	assert.equal(result.code, 0, result.printed);
	assert.deepEqual(result.sleeps, [30]);
	assert.match(runLog(setup, result.start, 1), /before this run/);
});

test("a reason outside the list does not count", async () => {
	const setup = fixture(["bad", "done"]);
	const result = await run(setup, ["--until", "06:00"]);
	assert.equal(result.code, 0, result.printed);
	assert.deepEqual(result.sleeps, [30]);
	assert.match(runLog(setup, result.start, 1), /"blocked" is not one of/);
});

test("--until that has passed is refused with exit 1", async () => {
	const setup = fixture(["done"]);
	const result = await run(setup, ["--until", "21:00"]);
	assert.equal(result.code, 1);
	assert.match(result.printed, /--until 21:00 has passed/);
	assert.equal(setup.calls().length, 0);
	assert.equal(existsSync(setup.night), false, "a refusal leaves no trace");
});

test("the end is the next HH:MM, at most 18 hours ahead", () => {
	const now = evening();
	assert.equal(deadline("06:00", now).getTime() - now.getTime(), 8 * 60 * MINUTE);
	assert.equal(deadline("23:30", now).getTime() - now.getTime(), 90 * MINUTE);
	assert.equal(deadline("16:00", now).getTime() - now.getTime(), 18 * 60 * MINUTE);
	// 16:01 is 18 h 1 min ahead, so it passed 5 h 59 min ago; 22:00 is now, which has passed as well.
	assert.throws(() => deadline("16:01", now), /has passed/);
	assert.throws(() => deadline("22:00", now), /has passed/);
});

test("--until in another form than HH:MM is refused", () => {
	assert.throws(() => deadline("6:00", evening()), /not a local time HH:MM/);
});

test("no --until is refused with exit 1 (the command line)", () => {
	const result = spawnSync(process.execPath, [join(import.meta.dirname, "night.mjs")], { encoding: "utf8" });
	assert.equal(result.status, 1);
	assert.match(result.stderr, /--until HH:MM/);
});

test("a prompt.md without the exact first message is refused with exit 1", async () => {
	const setup = fixture(["done"], `„${FIRST_MESSAGE.replace("etapu 0", "etapu 1")}”\n`);
	const result = await run(setup, ["--until", "06:00"]);
	assert.equal(result.code, 1);
	assert.match(result.printed, /does not contain the first message/);
	assert.equal(setup.calls().length, 0);
	assert.equal(existsSync(setup.night), false, "a refusal leaves no trace");
});

test("a claude that cannot be found is refused with exit 1", async () => {
	const setup = fixture(["done"]);
	const result = await run({ ...setup, claude: join(work, "no-such-claude") }, ["--until", "06:00"]);
	assert.equal(result.code, 1);
	assert.match(result.printed, /cannot run/);
});

test("a lock held by a live night.mjs is refused with exit 1 and stays as it was", async () => {
	const setup = fixture(["done"]);
	mkdirSync(setup.night, { recursive: true });
	const held = ownerRecord(process.pid, new Date());
	writeFileSync(join(setup.night, "lock"), held);
	const result = await run(setup, ["--until", "06:00"]);
	assert.equal(result.code, 1);
	assert.match(result.printed, new RegExp(`another night\\.mjs runs: pid ${process.pid}`));
	assert.equal(setup.calls().length, 0);
	assert.equal(readFileSync(join(setup.night, "lock"), "utf8"), held);
});

test("A-017: a lock with a reused pid, another boot or a dead owner is abandoned and taken over", async () => {
	const live = JSON.parse(ownerRecord(process.pid, new Date()));
	const owners = [
		{ ...live, start: "1" },
		{ ...live, boot: "00000000-0000-0000-0000-000000000000" },
		{ ...live, pid: spawnSync(process.execPath, ["-e", ""]).pid },
	];
	for (const owner of owners) {
		const setup = fixture(["done"]);
		mkdirSync(setup.night, { recursive: true });
		writeFileSync(join(setup.night, "lock"), `${JSON.stringify(owner)}\n`);
		const result = await run(setup, ["--until", "06:00"]);
		assert.equal(result.code, 0, result.printed);
		assert.match(result.printed, new RegExp(`took over the abandoned lock of pid ${owner.pid}`));
		assert.equal(setup.calls().length, 1);
	}
});

test("a failure of the runner itself ends with exit 4, not with the refusal code", async () => {
	const setup = fixture(["done"]);
	// A file where the runner's directory belongs makes its first write fail.
	writeFileSync(setup.night, "not a directory\n");
	const result = await run(setup, ["--until", "06:00"]);
	assert.equal(result.code, 4);
	assert.match(result.printed, /night: failed:/);
	assert.equal(setup.calls().length, 0);
});
