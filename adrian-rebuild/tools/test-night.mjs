/* PL: Test narzędzia night.mjs (D-019) z fałszywym claude i sztucznym zegarem, bez prawdziwego czekania; jeden test
   sprawdza jeden mechanizm (T-29). Pokrywa: koniec kodem 0 po statusie done, argumenty claude, stdin z /dev/null,
   katalog roboczy, oba strumienie w logu, zwolnienie blokady, ponowienia po 30, 60 i 120 min, kod 3 po trzech
   ponowieniach, brak ponowienia o godzinie końca i po niej oraz po przespanym końcu, status sprzed przebiegu
   i nieznany powód, odmowy kodem 1, przejęcie porzuconej blokady (pid, czas startu, boot id) i kod 4 przy awarii
   narzędzia, a od D-026: stream-json, zmienną CLAUDE_CODE_DISABLE_BACKGROUND_TASKS=1 tylko w środowisku claude
   (nie w ustawieniach repo), powód cannot-wait i liczbę wywołań narzędzi na commit w logu. Stan: działa. */
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

// The fake claude records each call (arguments, working directory, whether stdin is /dev/null, the variable of D-026),
// prints to both streams and acts out the next step of its plan: "done", "cannot-wait" and "bad" write a status,
// "none" ends like a window limit; a step { status, lines } also prints its lines to stdout, as a stream-json run does,
// and { unlinkLog: true } removes the run logs, so that the count after the run cannot read its log.
const fakeScript = (dir) => `#!${process.execPath}
import { appendFileSync, fstatSync, mkdirSync, readdirSync, readFileSync, rmSync, statSync, writeFileSync } from "node:fs";
const dir = ${JSON.stringify(dir)};
const calls = readFileSync(dir + "/calls.jsonl", "utf8").split("\\n").filter(Boolean).length;
const planned = JSON.parse(readFileSync(dir + "/plan.json", "utf8"))[calls] ?? "none";
const step = typeof planned === "string" ? planned : planned.status;
const stdin = fstatSync(0);
const stdinNull = stdin.isCharacterDevice() && stdin.rdev === statSync("/dev/null").rdev;
const background = process.env.CLAUDE_CODE_DISABLE_BACKGROUND_TASKS ?? null;
appendFileSync(dir + "/calls.jsonl", JSON.stringify({ argv: process.argv.slice(2), cwd: process.cwd(), stdinNull, background }) + "\\n");
for (const line of planned.lines ?? []) {
	process.stdout.write(line + "\\n");
}
process.stdout.write("fake stdout " + step + "\\n");
process.stderr.write("fake stderr " + step + "\\n");
if (planned.unlinkLog) {
	for (const name of readdirSync("adrian-rebuild/.night").filter((file) => /-run-\\d+\\.log$/.test(file))) {
		rmSync("adrian-rebuild/.night/" + name);
	}
}
const reasons = { done: "done", "cannot-wait": "cannot-wait", bad: "blocked" };
if (step in reasons) {
	mkdirSync("adrian-rebuild/.night", { recursive: true });
	writeFileSync("adrian-rebuild/.night/status.json", JSON.stringify({ reason: reasons[step] }));
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
		"stream-json",
		"--verbose",
	]);
	assert.ok(!call.argv.includes("--dangerously-skip-permissions"));
});

test("D-026: claude runs with CLAUDE_CODE_DISABLE_BACKGROUND_TASKS=1, so every subagent runs in the foreground", async () => {
	const setup = fixture(["done"]);
	// A night session's own commands inherit the variable; set it otherwise here, so only the runner can make it 1.
	const inherited = process.env.CLAUDE_CODE_DISABLE_BACKGROUND_TASKS;
	process.env.CLAUDE_CODE_DISABLE_BACKGROUND_TASKS = "0";
	try {
		await run(setup, ["--until", "06:00"]);
	} finally {
		if (inherited === undefined) {
			delete process.env.CLAUDE_CODE_DISABLE_BACKGROUND_TASKS;
		} else {
			process.env.CLAUDE_CODE_DISABLE_BACKGROUND_TASKS = inherited;
		}
	}
	assert.equal(setup.calls()[0].background, "1");
});

test("D-026: the repository's Claude Code settings do not set the variable, so by day background work stays", () => {
	const root = join(import.meta.dirname, "..", "..");
	for (const file of [".claude/settings.local.json", ".claude/settings.json"]) {
		const path = join(root, file);
		if (existsSync(path)) {
			assert.doesNotMatch(readFileSync(path, "utf8"), /CLAUDE_CODE_DISABLE_BACKGROUND_TASKS/, file);
		}
	}
});

test("D-026: the reason cannot-wait ends the night with exit 0 and no retry", async () => {
	const setup = fixture(["cannot-wait"]);
	const result = await run(setup, ["--until", "06:00"]);
	assert.equal(result.code, 0, result.printed);
	assert.deepEqual(result.sleeps, []);
	assert.match(runLog(setup, result.start, 1), /the reason cannot-wait/);
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

/** stream-json lines of the main session: a tool call, and a Bash `git commit` with its successful result. */
const toolUse = (id, name = "Read", input = {}) =>
	JSON.stringify({
		type: "assistant",
		message: { content: [{ type: "tool_use", id, name, input }] },
		parent_tool_use_id: null,
	});
const committed = (id, subject) => [
	toolUse(id, "Bash", { command: `git commit -q -m "${subject}"` }),
	JSON.stringify({
		type: "user",
		message: { content: [{ type: "tool_result", tool_use_id: id, content: "" }] },
		parent_tool_use_id: null,
	}),
];

test("D-026: after a run the log gets the main session's tool calls per commit, and the same lines are printed", async () => {
	const lines = [toolUse("t1"), ...committed("t2", "R-001: a"), toolUse("t3"), ...committed("t4", "R-002: b")];
	const setup = fixture([{ status: "done", lines: [...lines, toolUse("t5")] }]);
	const result = await run(setup, ["--until", "06:00"]);
	const counts = [
		'night: run 1: main-session tool calls: 2, up to the commit "R-001: a"',
		'night: run 1: main-session tool calls: 2, up to the commit "R-002: b"',
		"night: run 1: main-session tool calls: 1, after the last commit",
	];
	const log = runLog(setup, result.start, 1);
	for (const line of counts) {
		assert.ok(log.includes(`${line}\n`), `${line}\n--- log ---\n${log}`);
		assert.ok(result.printed.includes(line), line);
	}
});

test("D-026: the count reads only what this run appended to a log that an earlier night of the same day began", async () => {
	const setup = fixture([{ status: "done", lines: [toolUse("new")] }]);
	const start = evening();
	mkdirSync(setup.night, { recursive: true });
	const earlier = ["e1", "e2", "e3"].map((id) => toolUse(id)).join("\n");
	writeFileSync(join(setup.night, `${day(start)}-run-1.log`), `${earlier}\n`);
	const result = await run(setup, ["--until", "06:00"], clock(start));
	assert.match(runLog(setup, result.start, 1), /night: run 1: main-session tool calls: 1, no commit in this run\n/);
});

test("D-026: a count that fails is written into the log, and the night still ends by its status", async () => {
	const setup = fixture([{ status: "done", unlinkLog: true }]);
	const result = await run(setup, ["--until", "06:00"]);
	assert.equal(result.code, 0, result.printed);
	assert.match(runLog(setup, result.start, 1), /night: run 1: tool calls not counted \(ENOENT\)\n/);
	assert.match(runLog(setup, result.start, 1), /the session ended with the reason done/);
});

test("D-026: the line of a failed count names the error's code, not a path, so a copy into plan.md holds no home path", async () => {
	const setup = fixture([{ status: "done", unlinkLog: true }]);
	const result = await run(setup, ["--until", "06:00"]);
	const failed = runLog(setup, result.start, 1)
		.split("\n")
		.find((line) => line.includes("tool calls not counted"));
	assert.ok(failed !== undefined && !failed.includes(setup.root), failed);
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
