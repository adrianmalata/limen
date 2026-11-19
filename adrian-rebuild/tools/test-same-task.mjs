/* PL: Test narzędzia same-task.mjs (R-011, D-021) z fałszywym Pi (fake-pi-rpc.mjs) i fałszywym bin/limen w katalogach
   tymczasowych, bez sieci i z krótkimi czasami zamiast 10 s i minut; jeden test sprawdza jeden mechanizm (T-29).
   Pokrywa czystą kopię projektu, odmowy osiągalnej zmiany referencyjnej i braku katalogu nad --out, start Pi w klonie,
   pętlę tur właściciela (odpowiedzi, punkty styku, postęp, pytanie na początku, pobudka w trakcie odpowiedzi), zadania,
   kandydata, rundy i tokeny, limit czasu z abort i limen stop (także drugie zatrzymanie zadania, które dostało `state`
   po pierwszym, i polecenie dla zadania, które go nie dostało), unieważnienie przez limit (także w tekście tury)
   i skażenie (bez własnej ścieżki --out), linię sesji spoza JSON w sessionErrors, trzy liczniki M-05 (także w pętlach
   powłoki), błędy protokołu i zatrzymanie zadań przy kodzie 4, kod 5 błędu wewnętrznego, evaluate, report i odmowy
   CLI; od R-088 także drugie zatrzymanie zadania, które ma `state`, ale jeszcze nie `pid`, oraz zatrzymanie Pi przed
   zadaniami; od R-091 oznaczenia obiektów Pi 1.5.1 (typ bez oznaczenia, prośby rozszerzenia, na które Pi czeka,
   pomijane typy i metody, obce odpowiedzi i dyspozycje, protocol-error.json z surową linią), koniec przebiegu
   na `agent_settled`, prompt obsłużony przez rozszerzenie, błędy rozszerzeń i definicję touchpoints. Stan: działa. */
// Usage: node --test adrian-rebuild/tools/test-same-task.mjs
import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import {
	chmodSync,
	existsSync,
	mkdirSync,
	mkdtempSync,
	readFileSync,
	realpathSync,
	rmSync,
	writeFileSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { after, before, describe, test } from "node:test";
import { evaluate, FIXED_REPLY, isRunning, makeClone, readJobs, report, runAttempt } from "./same-task.mjs";

const TOOL = join(import.meta.dirname, "same-task.mjs");
const FAKE = join(import.meta.dirname, "fake-pi-rpc.mjs");
// Short times in place of the CLI's 10 s settle, 60 s response limit, 10 s stop grace and 10 min wait for a job's
// state and pid, so that a regression fails within seconds (R-088).
const TIMING = { settleMs: 150, pollMs: 20, responseMs: 3000, termMs: 1000, killMs: 1000, stateWaitMs: 3000 };
const ENV = {
	...process.env,
	GIT_CONFIG_GLOBAL: "/dev/null",
	GIT_CONFIG_NOSYSTEM: "1",
	HERDR_ENV: "1",
	HERDR_PANE_ID: "p1",
	HERDR_TAB_ID: "t1",
};
const work = mkdtempSync(join(tmpdir(), "same-task-"));
after(() => rmSync(work, { recursive: true, force: true }));

function git(cwd, ...args) {
	const result = spawnSync("git", ["-c", "user.name=test", "-c", "user.email=test@example.invalid", ...args], {
		cwd,
		env: ENV,
		encoding: "utf8",
	});
	assert.equal(result.status, 0, result.stderr);
	return result.stdout.trim();
}
const gitStatus = (cwd, ...args) => spawnSync("git", args, { cwd, env: ENV }).status;

function write(root, path, text) {
	mkdirSync(dirname(join(root, path)), { recursive: true });
	writeFileSync(join(root, path), text);
}
function executable(path, text) {
	writeFileSync(path, text);
	chmodSync(path, 0o755);
	return path;
}
const jsonLines = (path) =>
	existsSync(path)
		? readFileSync(path, "utf8")
				.split("\n")
				.filter(Boolean)
				.map((line) => JSON.parse(line))
		: [];
const readJson = (path) => (existsSync(path) ? JSON.parse(readFileSync(path, "utf8")) : undefined);

/** base → parent (the attempt's commit) → reference (the merged change, with the hidden test); plus a tag and a branch. */
function makeProject() {
	const dir = join(work, "project");
	mkdirSync(dir);
	git(dir, "init", "-q", "-b", "main");
	write(dir, "README.md", "project\n");
	git(dir, "add", "-A");
	git(dir, "commit", "-q", "-m", "base");
	const base = git(dir, "rev-parse", "HEAD");
	write(dir, "spec/T-001.md", "# T-001 The answer is right\n");
	write(dir, "src/answer.txt", "wrong\n");
	git(dir, "add", "-A");
	git(dir, "commit", "-q", "-m", "parent");
	const commit = git(dir, "rev-parse", "HEAD");
	write(dir, "src/answer.txt", "right\n");
	write(dir, "test/hidden.txt", "the hidden test\n");
	git(dir, "add", "-A");
	git(dir, "commit", "-q", "-m", "reference");
	const reference = git(dir, "rev-parse", "HEAD");
	git(dir, "tag", "v1");
	git(dir, "branch", "topic", base);
	return { dir, base, commit, reference, hiddenBlob: git(dir, "rev-parse", "HEAD:test/hidden.txt") };
}

const project = makeProject();
const pi = executable(
	join(work, "pi"),
	`#!/bin/sh\nexec ${JSON.stringify(process.execPath)} ${JSON.stringify(FAKE)} "$@"\n`,
);
let attempts = 0;

/**
 * A Limen package whose bin/limen records its arguments, its working directory and whether the fake Pi has already
 * recorded the close of its stdin (`piClosed`), then exits with `exit`. With `late`, `stop` acts as at `rebuild-base`
 * for a job that finishes setting up just after the stop: a job without its `state` or its `pid` file makes the stop
 * fail, and the job then gets the missing ones (`running`, a pid), as `spawn` and the wrapper write them; a stop of a
 * job with both writes `stopped`.
 */
function fakeLimen(base, { exit = 0, late = false, record }) {
	const limen = join(base, "limen");
	mkdirSync(join(limen, "bin"), { recursive: true });
	const log = join(base, "limen-calls.jsonl");
	const closed = `existsSync(${JSON.stringify(record)}) && readFileSync(${JSON.stringify(record)}, "utf8").includes('"closed":true')`;
	const call = `JSON.stringify({ argv: process.argv.slice(2), cwd: process.cwd(), piClosed: ${closed} })`;
	const lateSetup = [
		'const job = ".limen/jobs/" + process.argv[3];',
		'if (!existsSync(job + "/state") || !existsSync(job + "/pid")) {',
		'\tconst missing = existsSync(job + "/state") ? "pid" : "state";',
		'\twriteFileSync(job + "/state", "running\\n");',
		'\twriteFileSync(job + "/pid", "4242\\n");',
		'\tconsole.error("fake limen: no " + missing + " file");',
		"\tprocess.exit(1);",
		"}",
		'writeFileSync(job + "/state", "stopped\\n");',
	];
	const script = [
		`#!${process.execPath}`,
		'import { appendFileSync, existsSync, readFileSync, writeFileSync } from "node:fs";',
		`appendFileSync(${JSON.stringify(log)}, ${call} + "\\n");`,
		...(late ? lateSetup : []),
		`if (${exit} !== 0) { console.error("fake limen: cannot stop"); }`,
		`process.exitCode = ${exit};`,
	];
	executable(join(limen, "bin", "limen"), `${script.join("\n")}\n`);
	return { limen, log };
}

/**
 * One attempt with the fake Pi playing `runs` (or `runs(out)`, for a scenario that names the output directory);
 * returns the exit code, the result and what Pi and limen received.
 */
async function attempt(runs, setup = {}) {
	const { reference = project.reference, timeLimitMs = 20_000, timing = {}, outName = "out" } = setup;
	attempts += 1;
	const base = join(work, `attempt-${attempts}`);
	mkdirSync(base);
	const record = join(base, "pi-record.jsonl");
	const { limen, log } = fakeLimen(base, { exit: setup.limenExit ?? 0, late: setup.late === true, record });
	const scenario = join(base, "scenario.json");
	const out = join(base, outName);
	writeFileSync(scenario, JSON.stringify({ record, runs: typeof runs === "function" ? runs(out) : runs }));
	const printed = [];
	const options = {
		limen,
		project: project.dir,
		commit: project.commit,
		reference,
		ticket: "spec/T-001.md",
		out,
		pi,
		engineArgs: ["--scenario", scenario],
		timeLimitMs,
	};
	const keep = (line) => printed.push(line);
	const deps = { env: ENV, now: Date.now, out: keep, err: keep, timing: { ...TIMING, ...timing } };
	const code = await runAttempt(options, deps);
	const seen = jsonLines(record);
	return {
		code,
		printed: printed.join("\n"),
		base,
		out,
		limen,
		result: readJson(join(out, "result.json")),
		start: seen[0],
		commands: seen
			.slice(1)
			.filter(({ command }) => command !== undefined)
			.map(({ command }) => command),
		limenCalls: jsonLines(log),
	};
}
const prompts = (run) => run.commands.filter(({ type }) => type === "prompt").map(({ message }) => message);
const NOTHING_MORE = { trigger: "prompt", steps: [{ do: "reply", text: "Nothing more." }] };
// D-045 (3.4), word for word.
const DEFINITION = "touchpoints = answered owner turns; questions asked while a job runs are not counted";

test("the clone has main at the commit, no origin, no other ref and no object of the reference commit", () => {
	const clone = join(work, "clone-check", "clone");
	makeClone({ project: project.dir, commit: project.commit, reference: project.reference, clone, env: ENV });
	assert.equal(git(clone, "rev-parse", "main"), project.commit);
	assert.equal(git(clone, "symbolic-ref", "HEAD"), "refs/heads/main");
	assert.equal(git(clone, "remote"), "");
	assert.equal(git(clone, "for-each-ref", "--format=%(refname)"), "refs/heads/main");
	assert.notEqual(gitStatus(clone, "cat-file", "-e", project.reference), 0, "the reference commit is in the clone");
	assert.notEqual(gitStatus(clone, "cat-file", "-e", project.hiddenBlob), 0, "the hidden test is in the clone");
	assert.equal(readFileSync(join(clone, "src", "answer.txt"), "utf8"), "wrong\n");
});

test("a reference that is reachable from the commit is refused with exit 1 and leaves no output", async () => {
	const run = await attempt([NOTHING_MORE], { reference: project.base });
	assert.equal(run.code, 1, run.printed);
	assert.match(run.printed, /reference .* in the agents' reach/);
	assert.equal(existsSync(run.out), false);
	assert.equal(run.start, undefined, "Pi was started");
});

test("an --out whose parent directory does not exist is refused with exit 1 and creates no directory", async () => {
	const run = await attempt([NOTHING_MORE], { outName: join("missing", "out") });
	assert.equal(run.code, 1, run.printed);
	assert.match(run.printed, /parent directory .* does not exist/);
	assert.equal(existsSync(join(run.base, "missing")), false);
});

describe("an attempt that spawns, reviews, asks to land, lands and stops", () => {
	let run;
	// The wakes come after the settle time, so only the running job keeps the runner from replying in between.
	const wakeAfter = TIMING.settleMs * 3;
	before(async () => {
		run = await attempt([
			{
				trigger: "prompt",
				steps: [
					{ do: "spawn", job: "w1", role: "worker" },
					{
						do: "reply",
						text: "I spawned a worker.",
						usage: { input: 100, output: 10, cacheRead: 1000, cacheWrite: 200 },
					},
				],
			},
			{
				trigger: "wake",
				after: wakeAfter,
				steps: [
					{ do: "reply", job: "w1", text: "Done.", usage: { input: 50, output: 5, cacheRead: 500, cacheWrite: 100 } },
					{ do: "finish", job: "w1", state: "done" },
					{ do: "spawn", job: "r1", role: "reviewer" },
					{ do: "reply", text: "The worker is done; a reviewer runs." },
				],
			},
			{
				trigger: "wake",
				after: wakeAfter,
				steps: [
					{ do: "reply", job: "r1", text: "PASS", usage: { input: 30, output: 3, cacheRead: 300, cacheWrite: 60 } },
					{ do: "finish", job: "r1", state: "done" },
					{ do: "reply", text: "The review passed. Shall I land?" },
				],
			},
			{
				trigger: "prompt",
				steps: [
					{ do: "land", job: "w1" },
					{ do: "reply", text: "Landed." },
				],
			},
			NOTHING_MORE,
		]);
		assert.equal(run.code, 0, run.printed);
	});

	test("Pi starts in the clone with the RPC flags, the session directory, the engine args and no Herdr names", () => {
		const { argv, cwd, env } = run.start;
		assert.deepEqual(argv.slice(0, 4), ["--mode", "rpc", "--session-dir", join(run.out, "session")]);
		assert.deepEqual(argv.slice(4, 5), ["--scenario"]);
		assert.equal(cwd, realpathSync(join(run.out, "clone")));
		assert.equal(env.LIMEN_COORDINATOR, "1");
		assert.equal(env.LIMEN_PACKAGE, run.limen);
		assert.ok(env.PATH.startsWith(`${join(run.limen, "bin")}:`), env.PATH);
		assert.deepEqual([env.HERDR_ENV, env.HERDR_PANE_ID, env.HERDR_TAB_ID], [undefined, undefined, undefined]);
	});

	test("Pi gets the owner message once and the fixed reply at each owner turn", () => {
		assert.deepEqual(prompts(run), [
			"Implement spec/T-001.md; decide engineering questions yourself",
			FIXED_REPLY,
			FIXED_REPLY,
		]);
	});

	test("it ends finished with two touchpoints: progress after the first reply, none after the second", () => {
		const { outcome, touchpoints, ownerTurns } = run.result;
		assert.equal(outcome, "finished");
		assert.equal(touchpoints, 2);
		assert.deepEqual(
			ownerTurns.map(({ lastReply, replied, progressAfter }) => ({ lastReply, replied, progressAfter })),
			[
				{ lastReply: "The review passed. Shall I land?", replied: true, progressAfter: true },
				{ lastReply: "Landed.", replied: true, progressAfter: false },
				{ lastReply: "Nothing more.", replied: false, progressAfter: null },
			],
		);
	});

	test("the candidate is the newest done worker job, and its tip is landed on the clone's main", () => {
		const tip = git(join(run.out, "clone"), "rev-parse", "limen/w1");
		assert.deepEqual(run.result.candidate, { id: "w1", tip });
		assert.equal(run.result.landed, true);
	});

	test("every job is listed with its role and state, and each reviewer job is one round", () => {
		assert.deepEqual(
			run.result.jobs.map(({ id, role, state }) => ({ id, role, state })),
			[
				{ id: "r1", role: "reviewer", state: "done" },
				{ id: "w1", role: "worker", state: "done" },
			],
		);
		assert.equal(run.result.rounds, 1);
	});

	test("tokens are summed by class for the coordinator's session and for the jobs' sessions", () => {
		assert.deepEqual(run.result.tokens, {
			coordinator: { input: 100, cacheWrite: 200, cacheRead: 1000, output: 10 },
			jobs: { input: 80, cacheWrite: 160, cacheRead: 800, output: 8 },
		});
	});

	test("result.json states the touchpoint definition and names the coordinator's session folder as the transcript", () => {
		assert.deepEqual([run.result.touchpointsDefinition, run.result.transcript], [DEFINITION, join(run.out, "session")]);
	});
});

test("a first reply that asks a question gets the fixed reply before anything has progressed", async () => {
	const run = await attempt([
		{ trigger: "prompt", steps: [{ do: "reply", text: "Which file should hold the answer?" }] },
		NOTHING_MORE,
	]);
	assert.equal(run.code, 0, run.printed);
	assert.deepEqual(prompts(run).slice(1), [FIXED_REPLY]);
	const [first] = run.result.ownerTurns;
	assert.deepEqual([first.lastReply, first.replied], ["Which file should hold the answer?", true]);
	assert.deepEqual(run.result.jobs, [], "something progressed before the reply");
	assert.equal(run.result.touchpoints, 1);
});

test("a wake that starts a run while the runner is about to reply is not an owner turn", async () => {
	const run = await attempt([
		{ trigger: "prompt", steps: [{ do: "reply", text: "I read the ticket." }] },
		{ trigger: "prompt", refuse: true, steps: [{ do: "reply", text: "A wake arrived." }] },
		NOTHING_MORE,
	]);
	assert.equal(run.code, 0, run.printed);
	assert.equal(prompts(run).length, 3, "the refused reply was not sent again");
	assert.equal(run.result.touchpoints, 1);
	assert.deepEqual(
		run.result.ownerTurns.map(({ lastReply, replied }) => ({ lastReply, replied })),
		[
			{ lastReply: "A wake arrived.", replied: true },
			{ lastReply: "Nothing more.", replied: false },
		],
	);
});

test("a job that never ends reaches the time limit: abort, limen stop for the running job, outcome timeout", async () => {
	const run = await attempt(
		[
			{
				trigger: "prompt",
				steps: [
					{ do: "spawn", job: "w1", role: "worker" },
					{ do: "reply", text: "I spawned a worker." },
				],
			},
		],
		{ timeLimitMs: 1000 },
	);
	assert.equal(run.code, 0, run.printed);
	assert.equal(run.result.outcome, "timeout");
	assert.deepEqual(run.commands.at(-1), { type: "abort" });
	assert.deepEqual(
		run.limenCalls.map(({ argv, cwd }) => ({ argv, cwd })),
		[{ argv: ["stop", "w1", "same-task time limit"], cwd: realpathSync(join(run.out, "clone")) }],
	);
});

/** A worker with no `state` file yet (before `spawn` writes it; a queued job has one) when the time limit comes. */
const SETTING_UP_AT_TIME_LIMIT = [
	{
		trigger: "prompt",
		steps: [
			{ do: "spawn", job: "w1", role: "worker", state: null },
			{ do: "reply", text: "I spawned a worker." },
		],
	},
];

/** A worker with its `state` but no `pid` yet (its wrapper has not written it) when the time limit comes. */
const NO_PID_AT_TIME_LIMIT = [
	{
		trigger: "prompt",
		steps: [
			{ do: "spawn", job: "w1", role: "worker", pid: null },
			{ do: "reply", text: "I spawned a worker." },
		],
	},
];

test("a job that gets its state after a limen stop failed on its missing state is stopped by a second stop", async () => {
	const run = await attempt(SETTING_UP_AT_TIME_LIMIT, { timeLimitMs: 500, late: true });
	assert.equal(run.code, 0, run.printed);
	assert.deepEqual(
		run.limenCalls.map(({ argv }) => argv),
		[
			["stop", "w1", "same-task time limit"],
			["stop", "w1", "same-task time limit"],
		],
	);
	assert.equal(readFileSync(join(run.out, "clone", ".limen", "jobs", "w1", "state"), "utf8"), "stopped\n");
});

test("a job that has its state but no pid when the time limit comes is stopped again once its pid exists", async () => {
	const run = await attempt(NO_PID_AT_TIME_LIMIT, { timeLimitMs: 500, late: true });
	assert.equal(run.code, 0, run.printed);
	assert.deepEqual(
		run.limenCalls.map(({ argv }) => argv),
		[
			["stop", "w1", "same-task time limit"],
			["stop", "w1", "same-task time limit"],
		],
	);
	assert.equal(readFileSync(join(run.out, "clone", ".limen", "jobs", "w1", "state"), "utf8"), "stopped\n");
});

/** A set-up worker, with its `state` and `pid`, still running when the time limit comes. */
const RUNNING_AT_TIME_LIMIT = [
	{
		trigger: "prompt",
		steps: [
			{ do: "spawn", job: "w1", role: "worker" },
			{ do: "reply", text: "I spawned a worker." },
		],
	},
];

test("at the time limit Pi is stopped before any job is stopped, so no wake can spawn a job the stops miss", async () => {
	const run = await attempt(RUNNING_AT_TIME_LIMIT, { timeLimitMs: 500 });
	assert.equal(run.code, 0, run.printed);
	assert.ok(run.limenCalls.length > 0, run.printed);
	assert.deepEqual(
		run.limenCalls.map(({ piClosed }) => piClosed),
		run.limenCalls.map(() => true),
	);
});

test("a job that never gets a state is named with the limen stop command to run once the wait bound passes", async () => {
	const run = await attempt(SETTING_UP_AT_TIME_LIMIT, { timeLimitMs: 500, limenExit: 1, timing: { stateWaitMs: 300 } });
	assert.equal(run.code, 0, run.printed);
	assert.match(run.printed, /job w1 still has no state after 0\.3 s/);
	assert.match(run.result.stops.at(-1).next, /limen stop w1 "same-task time limit"$/);
});

test("a job that never gets a pid is named as lacking its pid once the wait bound passes", async () => {
	const run = await attempt(NO_PID_AT_TIME_LIMIT, { timeLimitMs: 500, limenExit: 1, timing: { stateWaitMs: 300 } });
	assert.equal(run.code, 0, run.printed);
	assert.match(run.printed, /job w1 still has no pid after 0\.3 s/);
	assert.equal(run.result.stops.at(-1).error, "no pid file");
});

test("a quota-limit error in a job's session makes the attempt void-limit", async () => {
	const run = await attempt([
		{
			trigger: "prompt",
			steps: [
				{ do: "spawn", job: "w1", role: "worker" },
				{ do: "limit", job: "w1" },
				{ do: "finish", job: "w1", state: "failed" },
				{ do: "reply", text: "The worker failed." },
			],
		},
		NOTHING_MORE,
	]);
	assert.equal(run.code, 0, run.printed);
	assert.equal(run.result.outcome, "void-limit");
});

test("a quota-limit text in a text part of an error turn makes the attempt void-limit", async () => {
	const run = await attempt([
		{
			trigger: "prompt",
			steps: [
				{ do: "limit", in: "text" },
				{ do: "reply", text: "I stopped." },
			],
		},
		NOTHING_MORE,
	]);
	assert.equal(run.code, 0, run.printed);
	assert.equal(run.result.outcome, "void-limit");
});

test("a session line that is not JSON in the middle of a file is listed in sessionErrors, and the result is written", async () => {
	const run = await attempt([
		{
			trigger: "prompt",
			steps: [
				{ do: "reply", text: "I read the ticket." },
				{ do: "garbage" },
				{ do: "reply", text: "I planned the work." },
			],
		},
		NOTHING_MORE,
	]);
	assert.equal(run.code, 0, run.printed);
	assert.equal(run.result.outcome, "finished");
	assert.equal(run.result.sessionErrors.length, 1);
	assert.match(run.result.sessionErrors[0], /session\/fake\.jsonl:2: not a JSON session entry/);
});

test("a tool call that names the reference SHA makes the attempt void-contaminated", async () => {
	const run = await attempt([
		{
			trigger: "prompt",
			steps: [
				{ do: "bash", command: `git show ${project.reference.slice(0, 7)}` },
				{ do: "reply", text: "I looked around." },
			],
		},
		NOTHING_MORE,
	]);
	assert.equal(run.code, 0, run.printed);
	assert.equal(run.result.outcome, "void-contaminated");
});

test("the reference SHA inside the attempt's own --out path does not contaminate it", async () => {
	const run = await attempt(
		(out) => [
			{
				trigger: "prompt",
				steps: [
					{ do: "bash", command: `cat ${join(out, "clone", "README.md")}` },
					{ do: "reply", text: "I read the README." },
				],
			},
			NOTHING_MORE,
		],
		{ outName: `out-${project.reference.slice(0, 7)}` },
	);
	assert.equal(run.code, 0, run.printed);
	assert.equal(run.result.outcome, "finished");
});

test("a tool call that names the project path makes the attempt void-contaminated", async () => {
	const run = await attempt([
		{
			trigger: "prompt",
			steps: [
				{ do: "bash", command: `cat ${join(project.dir, "src", "answer.txt")}` },
				{ do: "reply", text: "I looked around." },
			],
		},
		NOTHING_MORE,
	]);
	assert.equal(run.code, 0, run.printed);
	assert.equal(run.result.outcome, "void-contaminated");
});

describe("the M-05 counts of the coordinator's session", () => {
	let run;
	before(async () => {
		run = await attempt([
			{
				trigger: "prompt",
				steps: [
					{ do: "bash", command: "sleep 30" },
					{ do: "bash", command: "while true; do sleep 30; done" },
					{ do: "bash", command: "echo sleep" },
					{ do: "bash", command: "limen status" },
					{ do: "bash", command: "git status" },
					{ do: "bash", command: "for job in a b; do limen status; done" },
					{ do: "reply", text: "I read the ticket.\nDone: nothing yet." },
				],
			},
			NOTHING_MORE,
		]);
		assert.equal(run.code, 0, run.printed);
	});

	test("a bash call that runs sleep counts once, also inside a while … do loop, and echo sleep does not", () => {
		assert.equal(run.result.m05.sleepCalls, 2);
	});

	test("a bash call that runs limen status counts once, also inside a for … do loop, and git status does not", () => {
		assert.equal(run.result.m05.statusReads, 2);
	});

	test("a reply with a line that starts with Done counts, next to the number of replies", () => {
		assert.deepEqual([run.result.m05.footerReplies, run.result.m05.replies], [1, 2]);
	});
});

test("a prompt with no response ends with exit 4 and names the missing response", async () => {
	const run = await attempt([{ trigger: "prompt", respond: false }], { timing: { responseMs: 300 } });
	assert.equal(run.code, 4);
	assert.match(run.printed, /no response to a prompt/);
	assert.match(run.printed, /"type":"response","command":"prompt"/);
	assert.equal(run.result, undefined);
});

test("a second response to one prompt ends with exit 4 and the named protocol error", async () => {
	const run = await attempt([{ trigger: "prompt", respondTwice: true, steps: [{ do: "reply", text: "Read." }] }]);
	assert.equal(run.code, 4, run.printed);
	assert.match(run.printed, /Pi answered a prompt that was not sent/);
	assert.doesNotMatch(run.printed, /TypeError/);
});

/** A worker that runs while Pi leaves the owner message unanswered, so the attempt ends with exit 4. */
const RUNNING_WHEN_PI_FAILS = [
	{
		trigger: "prompt",
		respond: false,
		steps: [
			{ do: "spawn", job: "w1", role: "worker" },
			{ do: "reply", text: "I spawned a worker." },
		],
	},
];

test("on exit 4 the runner runs limen stop in the clone for every running job", async () => {
	const run = await attempt(RUNNING_WHEN_PI_FAILS, { timing: { responseMs: 300 } });
	assert.equal(run.code, 4, run.printed);
	assert.deepEqual(
		run.limenCalls.map(({ argv, cwd }) => ({ argv, cwd })),
		[{ argv: ["stop", "w1", "same-task runner failure"], cwd: realpathSync(join(run.out, "clone")) }],
	);
	assert.match(run.printed, /stopped the running jobs: w1/);
});

test("on exit 4 Pi is stopped before any job is stopped", async () => {
	const run = await attempt(RUNNING_WHEN_PI_FAILS, { timing: { responseMs: 300 } });
	assert.equal(run.code, 4, run.printed);
	assert.ok(run.limenCalls.length > 0, run.printed);
	assert.deepEqual(
		run.limenCalls.map(({ piClosed }) => piClosed),
		run.limenCalls.map(() => true),
	);
});

test("on exit 4 a limen stop that fails is named", async () => {
	const run = await attempt(RUNNING_WHEN_PI_FAILS, { timing: { responseMs: 300 }, limenExit: 1 });
	assert.equal(run.code, 4, run.printed);
	assert.match(run.printed, /limen stop w1 failed \(exit 1\): fake limen: cannot stop/);
});

/** One run in which Pi writes `writes` between two replies, then a quiet turn. */
const writing = (...writes) => [
	{
		trigger: "prompt",
		steps: [{ do: "reply", text: "I read the ticket." }, ...writes, { do: "reply", text: "I planned the work." }],
	},
	NOTHING_MORE,
];

/** A `writing` attempt ended as it ends when Pi writes nothing between the replies: one owner turn, then the end. */
function endedAsWithout(run) {
	assert.equal(run.code, 0, run.printed);
	const turns = run.result.ownerTurns.map(({ lastReply, replied }) => ({ lastReply, replied }));
	assert.deepEqual(
		[run.result.outcome, run.result.touchpoints, turns],
		[
			"finished",
			1,
			[
				{ lastReply: "I planned the work.", replied: true },
				{ lastReply: "Nothing more.", replied: false },
			],
		],
	);
}

const protocolError = (run) => readJson(join(run.out, "protocol-error.json"));

test("an object of a type with no mark ends the attempt with exit 4 and protocol-error.json holds its raw line", async () => {
	// Spaces that a serialized copy would drop, and a value longer than any cut of the line.
	const line = `{"type": "made_up_event",  "detail": "${"x".repeat(300)}"}`;
	const run = await attempt(writing({ do: "write", line }));
	assert.equal(run.code, 4, run.printed);
	assert.equal(protocolError(run)?.line, line);
	assert.ok(run.printed.includes(join(run.out, "protocol-error.json")), run.printed);
});

test("a stdout line that is not JSON ends the attempt with exit 4 and protocol-error.json holds it in full", async () => {
	const line = `Pi says ${"y".repeat(300)}`;
	const run = await attempt(writing({ do: "write", line }));
	assert.equal(run.code, 4, run.printed);
	assert.equal(protocolError(run)?.line, line);
});

test("a refused owner message ends the attempt with exit 4 and protocol-error.json holds Pi's response", async () => {
	const run = await attempt([{ trigger: "prompt", refuse: true }]);
	assert.equal(run.code, 4, run.printed);
	assert.deepEqual(JSON.parse(protocolError(run)?.line ?? "null"), {
		type: "response",
		command: "prompt",
		success: false,
		error: "Agent is already processing",
	});
});

const uiRequest = (method, fields) => ({ type: "extension_ui_request", id: `ui-${method}`, method, ...fields });
/** One request of each method on which Pi waits for an `extension_ui_response`, in the shapes of rpc-types.d.ts. */
const WAITING = {
	select: { title: "Pick one", options: ["a", "b"] },
	confirm: { title: "Go on?", message: "The worker is done." },
	input: { title: "Name", placeholder: "a name" },
	editor: { title: "Edit", prefill: "a draft" },
};

for (const [method, fields] of Object.entries(WAITING)) {
	test(`an extension's ${method} request, on which Pi waits for an answer, ends the attempt with exit 4`, async () => {
		const run = await attempt(writing({ do: "write", object: uiRequest(method, fields) }));
		assert.equal(run.code, 4, run.printed);
		assert.match(run.printed, new RegExp(`waits for an answer to an extension's ${method} request`));
	});
}

test("every extension request that Pi does not wait on passes without changing the attempt", async () => {
	const requests = [
		uiRequest("notify", { message: "limen: worker started", notifyType: "info" }),
		uiRequest("setStatus", { statusKey: "limen", statusText: "1 job" }),
		uiRequest("setWidget", { widgetKey: "limen", widgetLines: ["one job"] }),
		uiRequest("setTitle", { title: "limen" }),
		uiRequest("set_editor_text", { text: "a draft" }),
	];
	endedAsWithout(await attempt(writing(...requests.map((object) => ({ do: "write", object })))));
});

test("an extension request of a method with no mark ends the attempt with exit 4", async () => {
	const run = await attempt(writing({ do: "write", object: uiRequest("made_up", { title: "x" }) }));
	assert.equal(run.code, 4, run.printed);
	assert.match(run.printed, /method "made_up", which has no mark/);
});

/** One object of each type Pi 1.5.1 writes that the runner skips, in the shapes of the sources pi-rpc.mjs names. */
const SKIPPED = [
	{ type: "agent_end", messages: [], willRetry: false },
	{ type: "turn_start" },
	{ type: "turn_end", message: { role: "assistant", content: [] }, toolResults: [] },
	{ type: "message_start", message: { role: "assistant", content: [] } },
	{ type: "message_update", usage: {}, assistantMessageEvent: { type: "text_delta", contentIndex: 0, delta: "I" } },
	{ type: "tool_execution_start", toolCallId: "c1", toolName: "bash", args: { command: "ls" } },
	{ type: "tool_execution_update", toolCallId: "c1", toolName: "bash", args: { command: "ls" }, partialResult: {} },
	{ type: "tool_execution_end", toolCallId: "c1", toolName: "bash", result: {}, isError: false },
	{ type: "queue_update", steering: [], followUp: [] },
	{ type: "compaction_start", reason: "threshold" },
	{ type: "compaction_end", reason: "threshold", aborted: false, willRetry: false },
	{ type: "entry_appended", entry: { type: "custom", id: "e1" } },
	{ type: "session_info_changed", name: "coordinator" },
	{ type: "thinking_level_changed", level: "high" },
	{ type: "auto_retry_start", attempt: 1, maxAttempts: 3, delayMs: 2000, errorMessage: "overloaded" },
	{ type: "auto_retry_end", success: true, attempt: 1 },
	{ type: "summarization_retry_scheduled", attempt: 1, maxAttempts: 3, delayMs: 2000, errorMessage: "overloaded" },
	{ type: "summarization_retry_attempt_start", source: "compaction", reason: "threshold" },
	{ type: "summarization_retry_finished" },
	{ type: "bash_execution_update", delta: "output" },
];

test("every skipped type passes without changing the attempt", async () => {
	endedAsWithout(await attempt(writing(...SKIPPED.map((object) => ({ do: "write", object })))));
});

test("a response to abort passes without changing the attempt", async () => {
	const object = { type: "response", command: "abort", success: true };
	endedAsWithout(await attempt(writing({ do: "write", object })));
});

test("a response to a command the runner did not send, such as parse, ends the attempt with exit 4", async () => {
	const object = { type: "response", command: "parse", success: false, error: "Failed to parse command: Unexpected" };
	const run = await attempt(writing({ do: "write", object }));
	assert.equal(run.code, 4, run.printed);
	assert.match(run.printed, /a command the runner did not send \("parse"\)/);
});

test("a prompt response whose disposition is not started, queued or handled ends the attempt with exit 4", async () => {
	const run = await attempt([{ trigger: "prompt", disposition: "pending", steps: [{ do: "reply", text: "Read." }] }]);
	assert.equal(run.code, 4, run.printed);
	assert.match(run.printed, /disposition "pending"/);
});

test("an agent_end that will retry is not an owner turn", async () => {
	const run = await attempt([
		{
			trigger: "prompt",
			steps: [
				{ do: "reply", text: "The provider is overloaded." },
				// Longer than two settle times, so a runner that took agent_end for the end would reply inside the delay.
				{ do: "retry", after: TIMING.settleMs * 4 },
				{ do: "reply", text: "I read the ticket." },
			],
		},
		NOTHING_MORE,
	]);
	assert.equal(run.code, 0, run.printed);
	assert.deepEqual(prompts(run).slice(1), [FIXED_REPLY]);
	assert.equal(run.result.touchpoints, 1);
});

test("a prompt the coordinator's extension handled does not wait for a run", async () => {
	const run = await attempt(
		[
			{ trigger: "prompt", steps: [{ do: "reply", text: "Which file should hold the answer?" }] },
			{ trigger: "prompt", disposition: "handled" },
		],
		{ timeLimitMs: 3000 },
	);
	assert.equal(run.code, 0, run.printed);
	assert.equal(run.result.outcome, "finished");
});

test("an extension error is kept in result.json and the attempt goes on", async () => {
	const failure = { path: "/limen/hook/wake.ts", event: "agent_start", error: "wake failed" };
	const run = await attempt(writing({ do: "extensionError", ...failure }));
	assert.equal(run.code, 0, run.printed);
	assert.equal(run.result.outcome, "finished");
	assert.deepEqual(run.result.extensionErrors, [
		{ type: "extension_error", extensionPath: failure.path, event: failure.event, error: failure.error },
	]);
});

test("a job directory without a state file is still setting up and counts as running", () => {
	const jobs = join(work, "jobs-check");
	write(jobs, "a1/role", "worker\n");
	const [job] = readJobs(jobs);
	assert.equal(job.state, null);
	assert.equal(isRunning(job), true);
});

/** An attempt's output directory with a clone whose main holds `answer`, and a result naming main's tip as candidate. */
function evaluated(name, answer, candidate = true) {
	const out = join(work, name);
	const clone = join(out, "clone");
	mkdirSync(clone, { recursive: true });
	git(clone, "init", "-q", "-b", "main");
	write(clone, "src/answer.txt", `${answer}\n`);
	git(clone, "add", "-A");
	git(clone, "commit", "-q", "-m", "tip");
	const tip = git(clone, "rev-parse", "HEAD");
	writeFileSync(
		join(out, "result.json"),
		JSON.stringify({ outcome: "finished", candidate: candidate ? { id: "w1", tip } : null }),
	);
	const tests = join(work, `${name}-hidden`);
	write(tests, "test/hidden.txt", "the hidden test\n");
	const printed = [];
	const commands = ["test -f test/hidden.txt", "grep -q right src/answer.txt"];
	const keep = (line) => printed.push(line);
	const code = evaluate(out, { tests, commands }, { env: ENV, out: keep, err: keep, stdio: "ignore" });
	return { code, printed: printed.join("\n"), out, evaluation: readJson(join(out, "evaluation.json")) };
}

test("evaluate lays the hidden tests over the candidate's tip and reports pass: false with the failing command", () => {
	const { code, printed, evaluation } = evaluated("eval-wrong", "wrong");
	assert.equal(code, 0, printed);
	assert.equal(evaluation.pass, false);
	assert.deepEqual(
		evaluation.commands.map(({ command, exit }) => ({ command, exit })),
		[
			{ command: "test -f test/hidden.txt", exit: 0 },
			{ command: "grep -q right src/answer.txt", exit: 1 },
		],
	);
});

test("evaluate reports pass: true when every command exits 0", () => {
	const { code, printed, evaluation } = evaluated("eval-right", "right");
	assert.equal(code, 0, printed);
	assert.equal(evaluation.pass, true);
});

test("evaluate refuses with exit 1 when the attempt has no candidate", () => {
	const { code, printed, out } = evaluated("eval-none", "right", false);
	assert.equal(code, 1);
	assert.match(printed, /no candidate/);
	assert.equal(existsSync(join(out, "evaluation.json")), false);
});

test("report counts passes of the non-void attempts and names the void ones", () => {
	const outs = [
		["r-pass-1", "finished", true],
		["r-pass-2", "finished", true],
		["r-fail", "finished", false],
		["r-void", "void-limit", undefined],
	].map(([name, outcome, pass]) => {
		const out = join(work, name);
		mkdirSync(out);
		writeFileSync(join(out, "result.json"), JSON.stringify({ outcome }));
		if (pass !== undefined) {
			writeFileSync(join(out, "evaluation.json"), JSON.stringify({ pass }));
		}
		return out;
	});
	const lines = [];
	const code = report(outs, { out: (line) => lines.push(line), err: (line) => lines.push(line) });
	assert.equal(code, 0, lines.join("\n"));
	assert.match(lines.at(-1), /^passed 2 of 3; pass\^3: no; void: 1 /);
	assert.match(lines.at(-1), /r-void/);
});

test("the report prints the touchpoint definition once, above its counts", () => {
	const out = join(work, "r-definition");
	mkdirSync(out);
	writeFileSync(join(out, "result.json"), JSON.stringify({ outcome: "finished" }));
	const lines = [];
	const code = report([out], { out: (line) => lines.push(line), err: (line) => lines.push(line) });
	assert.equal(code, 0, lines.join("\n"));
	assert.deepEqual([lines[0], lines.filter((line) => line === DEFINITION).length], [DEFINITION, 1]);
});

test("an exception that is not a git, file-system or protocol failure exits 5 with its stack", () => {
	const out = join(work, "r-damaged");
	mkdirSync(out);
	writeFileSync(join(out, "result.json"), "{ not json\n");
	const lines = [];
	const code = report([out], { out: (line) => lines.push(line), err: (line) => lines.push(line) });
	assert.equal(code, 5, lines.join("\n"));
	assert.match(lines.join("\n"), /SyntaxError[\s\S]*\n\s+at /);
});

const cli = (...args) => spawnSync(process.execPath, [TOOL, ...args], { encoding: "utf8", env: ENV });
// Every flag of run but --time-limit, with a placeholder value: the floor is checked before any of them is read.
const RUN_FLAGS = ["limen", "project", "commit", "reference", "ticket", "out"].flatMap((name) => [`--${name}`, "x"]);

test("the CLI refuses a --time-limit of 179 minutes with exit 1", () => {
	const result = cli("run", ...RUN_FLAGS, "--time-limit", "179", "--", "--model", "m");
	assert.equal(result.status, 1, result.stderr);
	assert.match(result.stderr, /180/);
});

test("the CLI treats an unknown flag as a usage error with exit 2", () => {
	const result = cli("run", ...RUN_FLAGS, "--time-limit", "180", "--bogus", "x");
	assert.equal(result.status, 2, result.stderr);
	assert.match(result.stderr, /--bogus/);
});
