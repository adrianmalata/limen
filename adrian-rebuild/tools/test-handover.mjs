/* PL: Test narzędzia handover.mjs (D-047) z fałszywym tmux na PATH, fałszywymi procesami claude (Node z argv0
   „claude”) i repozytorium roboczym z gołym origin; jeden test sprawdza jeden mechanizm (T-29). Pokrywa: start
   z pierwszą wiadomością bez powłoki i bez zmiennych sesji wywołującej, odmowy startu (zajęta nazwa, zły numer,
   sesja, która znikła), trzy warunki bezpiecznego punktu, wybór sesji tmux (nazwa, własny panel, katalog, kolejność
   startu), zatrzymanie procesów claude w repozytorium bez własnej sesji, jej potomków, przodków, procesów
   nowszych i spoza repozytorium, proces, który przeżył SIGTERM, brak serwera tmux i brak programu tmux, oraz odmowę
   obu poleceń przy żywej blokadzie nocy i jej brak przy blokadzie martwej lub nieczytelnej (D-102). Stan: działa. */
// Usage: node --test adrian-rebuild/tools/test-handover.mjs
import assert from "node:assert/strict";
import { spawn, spawnSync } from "node:child_process";
import { mkdirSync, mkdtempSync, readFileSync, rmSync, symlinkSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { after, test } from "node:test";
import { setTimeout as sleep } from "node:timers/promises";
import { SESSION_VARIABLES } from "./handover.mjs";
import { FIRST_MESSAGE, ownerRecord } from "./night.mjs";

const TOOL = resolve(import.meta.dirname, "handover.mjs");
const work = mkdtempSync(join(tmpdir(), "handover-"));
const children = [];
const orphans = [];
after(() => {
	for (const child of children) {
		child.kill("SIGKILL");
	}
	for (const pid of orphans) {
		try {
			process.kill(pid, "SIGKILL");
		} catch {}
	}
	rmSync(work, { recursive: true, force: true });
});

// A killed child stays in /proc as a zombie until its parent reaps it, and a zombie no longer runs.
function alive(pid) {
	try {
		const stat = readFileSync(`/proc/${pid}/stat`, "utf8");
		return !/^[ZX]/.test(stat.slice(stat.lastIndexOf(")") + 2));
	} catch {
		return false;
	}
}

// Waits until a process runs as claude (between fork and exec it still shows its parent's command).
function started(pid) {
	const end = Date.now() + 3000;
	while (Date.now() < end) {
		try {
			if (readFileSync(`/proc/${pid}/cmdline`, "utf8").startsWith("claude\0")) {
				return;
			}
		} catch {}
	}
	throw new Error(`the fake claude ${pid} did not start`);
}

// The two helpers for the code of a fake session, which runs as CommonJS through `node -e`.
const HELPERS = `const { readFileSync } = require("node:fs");\n${alive}\n${started}\n`;

async function until(condition, ms = 3000) {
	const end = Date.now() + ms;
	while (!condition() && Date.now() < end) {
		await sleep(20);
	}
	return condition();
}

let counter = 0;

/** A scratch repository on `adrian-rebuild` with one commit, pushed to a bare `origin`, so the safe point holds. */
function makeRepo() {
	counter += 1;
	const repo = join(work, `repo-${counter}`);
	const origin = join(work, `origin-${counter}.git`);
	const git = (cwd, ...args) => {
		const result = spawnSync(
			"git",
			[
				"-c",
				"user.name=handover",
				"-c",
				"user.email=handover@example.invalid",
				"-c",
				"core.hooksPath=/dev/null",
				...args,
			],
			{ cwd, encoding: "utf8" },
		);
		assert.equal(result.status, 0, result.stderr);
	};
	mkdirSync(repo);
	git(work, "init", "-q", "--bare", origin);
	git(repo, "init", "-q", "-b", "adrian-rebuild");
	writeFileSync(join(repo, "file.txt"), "one\n");
	git(repo, "add", "file.txt");
	git(repo, "commit", "-q", "-m", "one");
	git(repo, "remote", "add", "origin", origin);
	git(repo, "push", "-q", "origin", "adrian-rebuild");
	return { repo, git: (...args) => git(repo, ...args) };
}

// The fake tmux logs every call and plays the sessions of a state file ({ sessions: { name: { path, panes } },
// addNew }): list-panes prints "<name>\t<pane pid>\t<session path>" per pane, or fails as tmux does with no server;
// has-session and kill-session take an exact name `=<name>`; a session with `vanish` ends just before its
// kill-session, which then fails; new-session adds its session unless `addNew` is false.
const bin = join(work, "bin");
mkdirSync(bin);
const STATE = join(work, "tmux-state.json");
writeFileSync(
	join(bin, "tmux"),
	`#!${process.execPath}
import { appendFileSync, readFileSync, writeFileSync } from "node:fs";
const dir = ${JSON.stringify(work)};
const args = process.argv.slice(2);
appendFileSync(dir + "/tmux-calls.jsonl", JSON.stringify(args) + "\\n");
const state = JSON.parse(readFileSync(${JSON.stringify(STATE)}, "utf8"));
const save = () => writeFileSync(${JSON.stringify(STATE)}, JSON.stringify(state));
const exact = () => {
	const target = args[args.indexOf("-t") + 1] ?? "";
	return target.startsWith("=") ? target.slice(1) : undefined;
};
const names = Object.keys(state.sessions);
if (args[0] === "list-panes") {
	if (names.length === 0) {
		console.error("no server running on /tmp/tmux-test/default");
		process.exit(1);
	}
	for (const name of names) {
		for (const pid of state.sessions[name].panes) console.log(name + "\\t" + pid + "\\t" + state.sessions[name].path);
	}
} else if (args[0] === "has-session") {
	process.exit(Object.hasOwn(state.sessions, exact()) ? 0 : 1);
} else if (args[0] === "kill-session") {
	if (!Object.hasOwn(state.sessions, exact())) process.exit(1);
	const vanished = state.sessions[exact()].vanish;
	delete state.sessions[exact()];
	save();
	if (vanished) {
		console.error("can't find session: " + exact());
		process.exit(1);
	}
} else if (args[0] === "new-session") {
	if (state.addNew !== false) state.sessions[args[args.indexOf("-s") + 1]] = { path: "", panes: [] };
	save();
} else {
	process.exit(1);
}
`,
	{ mode: 0o755 },
);

function tmuxState(sessions, addNew = true) {
	writeFileSync(STATE, JSON.stringify({ sessions, addNew }));
	writeFileSync(join(work, "tmux-calls.jsonl"), "");
}

function tmuxCalls() {
	return readFileSync(join(work, "tmux-calls.jsonl"), "utf8")
		.split("\n")
		.filter(Boolean)
		.map((line) => JSON.parse(line));
}

const kills = () => tmuxCalls().filter((call) => call[0] === "kill-session");

const env = { ...process.env, PATH: `${bin}:${process.env.PATH}` };

/** A fake claude: a Node process whose argv[0] is `claude`, started in `cwd`; it may ignore SIGTERM. */
function fakeClaude(cwd, { ignoreTerm = false } = {}) {
	const code = `${ignoreTerm ? 'process.on("SIGTERM", () => {});' : ""} setInterval(() => {}, 1000);`;
	const child = spawn(process.execPath, ["-e", code], { argv0: "claude", cwd, stdio: "ignore" });
	children.push(child);
	started(child.pid);
	// Start times count in clock ticks of 10 ms, and the tool keeps a process that started in the caller's tick, so
	// the session that runs the tool must start at least one tick after this process to see it as previous.
	Atomics.wait(new Int32Array(new SharedArrayBuffer(4)), 0, 0, 30);
	return child;
}

// Code for a session's `before`: a fake claude in the session's directory, started after the session and orphaned
// by an intermediate process, so that it is neither the session's descendant nor older than it. Sets `newer`.
const NEWER = `
const orphan = cp.spawnSync(process.execPath, ["-e", ${JSON.stringify(
	'const c = require("node:child_process").spawn(process.execPath, ["-e", "setInterval(() => {}, 1000)"], ' +
		'{ argv0: "claude", detached: true, stdio: "ignore" }); c.unref(); console.log(c.pid);',
)}], { encoding: "utf8" });
const newer = Number(orphan.stdout.trim());
started(newer);
`;

/**
 * Runs the tool as the main session's Bash tool does: as a child of a `claude` process started in the repository
 * (inside a second `claude` process when `wrapped`). `before` is code that this session runs first; the session
 * prints the tool's exit status and the value of `report` as its last line.
 */
function runAsSession(repo, args, { before = "", report = "null", wrapped = false, path = env.PATH } = {}) {
	const code = `
const cp = require("node:child_process");
${HELPERS}
${before}
const run = cp.spawnSync(process.execPath, ${JSON.stringify([TOOL, ...args])}, { encoding: "utf8" });
process.stdout.write(run.stdout);
process.stderr.write(run.stderr);
console.log(JSON.stringify({ status: run.status, report: ${report} }));
`;
	const outer = `const r = require("node:child_process").spawnSync(process.execPath, ["-e", ${JSON.stringify(code)}], { argv0: "claude", stdio: "inherit" });
process.exit(r.status ?? 1);`;
	const result = spawnSync(process.execPath, ["-e", wrapped ? outer : code], {
		argv0: "claude",
		cwd: repo,
		env: { ...env, PATH: path },
		encoding: "utf8",
	});
	assert.equal(result.status, 0, `a session itself was stopped: ${result.signal} ${result.stderr}`);
	const lines = result.stdout.trim().split("\n");
	return { ...JSON.parse(lines.at(-1)), stdout: lines.slice(0, -1).join("\n"), stderr: result.stderr };
}

test("start opens limen-rebuild-<n> in the repository with the first message, with no shell between", () => {
	const { repo } = makeRepo();
	tmuxState({});
	const run = runAsSession(repo, ["start", "8"]);
	assert.equal(run.status, 0, run.stderr);
	const opened = tmuxCalls().find((call) => call[0] === "new-session");
	assert.deepEqual(opened.slice(0, 6), ["new-session", "-d", "-s", "limen-rebuild-8", "-c", repo]);
	assert.deepEqual(opened.slice(-4), ["claude", "--remote-control", "Limen rebuild 8", FIRST_MESSAGE]);
	assert.match(run.stdout, /started limen-rebuild-8/);
});

test("start removes the variables of the caller's Claude Code session from the new session", () => {
	const { repo } = makeRepo();
	tmuxState({});
	const run = runAsSession(repo, ["start", "8"]);
	assert.equal(run.status, 0, run.stderr);
	const opened = tmuxCalls().find((call) => call[0] === "new-session");
	const command = opened.slice(6, -3);
	assert.deepEqual(command, ["env", ...SESSION_VARIABLES.flatMap((name) => ["-u", name]), "claude"]);
	const marks = ["CLAUDECODE", "CLAUDE_CODE_CHILD_SESSION", "CLAUDE_CODE_SESSION_ID", "CLAUDE_PID", "AI_AGENT"];
	for (const name of [...marks, "GIT_EDITOR", "COREPACK_ENABLE_AUTO_PIN", "NoDefaultCurrentDirectoryInExePath"]) {
		assert.ok(SESSION_VARIABLES.includes(name), name);
	}
});

test("start refuses a session name that exists, and opens nothing", () => {
	const { repo } = makeRepo();
	tmuxState({ "limen-rebuild-8": { path: repo, panes: [1] } });
	const run = runAsSession(repo, ["start", "8"]);
	assert.equal(run.status, 1);
	assert.equal(
		tmuxCalls().some((call) => call[0] === "new-session"),
		false,
	);
	assert.match(run.stderr, /limen-rebuild-8 exists/);
});

test("start refuses a number that is not a positive integer, with exit 2", () => {
	const { repo } = makeRepo();
	tmuxState({});
	for (const args of [["start"], ["start", "0"], ["start", "8x"], ["start", "-1"], ["start", "8", "9"]]) {
		assert.equal(runAsSession(repo, args).status, 2, args.join(" "));
	}
	assert.deepEqual(tmuxCalls(), []);
});

test("start fails when the new session is gone after the wait", () => {
	const { repo } = makeRepo();
	tmuxState({}, false);
	const run = runAsSession(repo, ["start", "8"]);
	assert.equal(run.status, 1);
	assert.match(run.stderr, /limen-rebuild-8 is gone/);
});

test("a working tree that is not clean is no safe point: close-previous closes nothing", () => {
	const { repo } = makeRepo();
	writeFileSync(join(repo, "new.txt"), "untracked\n");
	tmuxState({ "limen-rebuild-5": { path: repo, panes: [999_999_991] } });
	const other = fakeClaude(repo);
	const run = runAsSession(repo, ["close-previous"]);
	assert.equal(run.status, 1);
	assert.match(run.stderr, /not clean/);
	assert.deepEqual(kills(), []);
	assert.equal(alive(other.pid), true);
});

test("a HEAD that is not origin/adrian-rebuild is no safe point: start opens nothing", () => {
	const { repo, git } = makeRepo();
	git("commit", "-q", "--allow-empty", "-m", "unpushed");
	tmuxState({});
	const run = runAsSession(repo, ["start", "8"]);
	assert.equal(run.status, 1);
	assert.match(run.stderr, /origin\/adrian-rebuild/);
	assert.deepEqual(tmuxCalls(), []);
});

test("a branch other than adrian-rebuild is no safe point", () => {
	const { repo, git } = makeRepo();
	git("switch", "-q", "-c", "other");
	tmuxState({});
	const run = runAsSession(repo, ["start", "8"]);
	assert.equal(run.status, 1);
	assert.match(run.stderr, /branch is other/);
});

/** Writes `adrian-rebuild/.night/lock` into a scratch repository, which ignores `.night/` as the real one does. */
function nightLock(repo, text) {
	mkdirSync(join(repo, "adrian-rebuild", ".night"), { recursive: true });
	writeFileSync(join(repo, ".git", "info", "exclude"), "adrian-rebuild/.night/\n");
	writeFileSync(join(repo, "adrian-rebuild", ".night", "lock"), text);
}

/** A running process that stands for night.mjs, and the lock text that names it as the owner. */
function liveNight() {
	const child = spawn(process.execPath, ["-e", "setInterval(() => {}, 1000)"], { stdio: "ignore" });
	children.push(child);
	return { pid: child.pid, text: ownerRecord(child.pid, new Date()) };
}

test("start refuses while a live night.mjs holds .night/lock, names its owner and opens nothing", () => {
	const { repo } = makeRepo();
	const night = liveNight();
	nightLock(repo, night.text);
	tmuxState({});
	const run = runAsSession(repo, ["start", "8"]);
	assert.equal(run.status, 1);
	assert.match(run.stderr, new RegExp(`holds adrian-rebuild/\\.night/lock \\(night\\.mjs pid ${night.pid}, started `));
	assert.deepEqual(tmuxCalls(), []);
});

test("close-previous refuses while a live night.mjs holds .night/lock, and closes or stops nothing", () => {
	const { repo } = makeRepo();
	const night = liveNight();
	nightLock(repo, night.text);
	tmuxState({ "limen-rebuild-5": { path: repo, panes: [999_999_991] } });
	const older = fakeClaude(repo);
	const run = runAsSession(repo, ["close-previous"]);
	assert.equal(run.status, 1);
	assert.match(run.stderr, new RegExp(`night\\.mjs pid ${night.pid}`));
	assert.deepEqual(tmuxCalls(), []);
	assert.equal(alive(older.pid), true);
});

test("a lock whose owner is gone, whose start or boot differs, or that is no owner record refuses neither command", () => {
	const gone = spawnSync(process.execPath, ["-e", "console.log(process.pid)"], { encoding: "utf8" });
	const live = JSON.parse(liveNight().text);
	const texts = [
		ownerRecord(Number(gone.stdout.trim()), new Date()),
		`${JSON.stringify({ ...live, start: "1" })}\n`,
		`${JSON.stringify({ ...live, boot: "another boot" })}\n`,
		"not an owner record\n",
	];
	for (const text of texts) {
		const { repo } = makeRepo();
		nightLock(repo, text);
		tmuxState({});
		const started = runAsSession(repo, ["start", "8"]);
		assert.equal(started.status, 0, `${text}: ${started.stderr}`);
		tmuxState({});
		const closed = runAsSession(repo, ["close-previous"]);
		assert.equal(closed.status, 0, `${text}: ${closed.stderr}`);
	}
});

test("close-previous closes only tmux sessions named limen-rebuild-<digits>", () => {
	const { repo } = makeRepo();
	tmuxState({
		"limen-rebuild-5": { path: repo, panes: [999_999_991] },
		"limen-rebuild-x": { path: repo, panes: [999_999_992] },
		work: { path: repo, panes: [999_999_993] },
	});
	const run = runAsSession(repo, ["close-previous"]);
	assert.equal(run.status, 0, run.stderr);
	assert.deepEqual(kills(), [["kill-session", "-t", "=limen-rebuild-5"]]);
	assert.match(run.stdout, /closed tmux session limen-rebuild-5/);
});

test("close-previous keeps the tmux session whose pane runs the caller", () => {
	const { repo } = makeRepo();
	// The test process is an ancestor of the tool, so the session with it as a pane is the caller's own.
	tmuxState({ "limen-rebuild-7": { path: repo, panes: [999_999_992, process.pid] } });
	const run = runAsSession(repo, ["close-previous"]);
	assert.equal(run.status, 0, run.stderr);
	assert.deepEqual(kills(), []);
});

test("close-previous keeps a limen-rebuild session that runs in another directory", () => {
	const { repo } = makeRepo();
	const elsewhere = join(work, "elsewhere");
	mkdirSync(elsewhere, { recursive: true });
	tmuxState({ "limen-rebuild-5": { path: elsewhere, panes: [999_999_991] } });
	const run = runAsSession(repo, ["close-previous"]);
	assert.equal(run.status, 0, run.stderr);
	assert.deepEqual(kills(), []);
});

test("close-previous keeps a tmux session whose pane started after the caller's session", () => {
	const { repo } = makeRepo();
	tmuxState({});
	const run = runAsSession(repo, ["close-previous"], {
		before: `${NEWER}
require("node:fs").writeFileSync(${JSON.stringify(STATE)}, JSON.stringify({
	sessions: { "limen-rebuild-8": { path: ${JSON.stringify(repo)}, panes: [newer] } },
}));`,
		report: "newer",
	});
	orphans.push(run.report);
	assert.equal(run.status, 0, run.stderr);
	assert.deepEqual(kills(), []);
});

test("close-previous stops a claude process in the repository and leaves one in another directory", async () => {
	const { repo } = makeRepo();
	const elsewhere = join(work, "elsewhere");
	mkdirSync(elsewhere, { recursive: true });
	tmuxState({});
	const previous = fakeClaude(repo);
	const outside = fakeClaude(elsewhere);
	const run = runAsSession(repo, ["close-previous"]);
	assert.equal(run.status, 0, run.stderr);
	assert.equal(await until(() => !alive(previous.pid)), true);
	assert.equal(alive(outside.pid), true);
	assert.match(run.stdout, new RegExp(`stopped claude ${previous.pid}`));
});

test("a tmux session that ends before its kill-session counts as closed, and the claude processes are still stopped", () => {
	const { repo } = makeRepo();
	tmuxState({ "limen-rebuild-5": { path: repo, panes: [999_999_991], vanish: true } });
	const previous = fakeClaude(repo);
	const run = runAsSession(repo, ["close-previous"]);
	assert.equal(run.status, 0, run.stderr);
	assert.match(run.stdout, /tmux session limen-rebuild-5 was already gone/);
	assert.match(run.stdout, new RegExp(`stopped claude ${previous.pid}`));
});

// The caller's own session is its ancestor, and a process it started is younger than it.
test("close-previous leaves the caller's own session and a claude process that session started", () => {
	const { repo } = makeRepo();
	tmuxState({});
	const run = runAsSession(repo, ["close-previous"], {
		before: `
const own = cp.spawn(process.execPath, ["-e", "setInterval(() => {}, 1000)"], { argv0: "claude", stdio: "ignore" });
started(own.pid);`,
		report: "(() => { const kept = alive(own.pid); own.kill('SIGKILL'); return kept; })()",
	});
	assert.equal(run.status, 0, run.stderr);
	assert.equal(run.report, true);
	assert.match(run.stdout, /nothing to close/);
});

test("close-previous leaves a claude process among the caller's ancestors", () => {
	const { repo } = makeRepo();
	tmuxState({});
	// runAsSession asserts that neither session process was stopped.
	const run = runAsSession(repo, ["close-previous"], { wrapped: true });
	assert.equal(run.status, 0, run.stderr);
	assert.match(run.stdout, /nothing to close/);
});

test("close-previous leaves a claude process started after the caller's session", () => {
	const { repo } = makeRepo();
	tmuxState({});
	const run = runAsSession(repo, ["close-previous"], {
		before: NEWER,
		report: "{ pid: newer, kept: alive(newer) }",
	});
	orphans.push(run.report.pid);
	assert.equal(run.status, 0, run.stderr);
	assert.equal(run.report.kept, true);
});

test("a claude process still alive 5 s after SIGTERM is named as running, not as stopped, and the exit is 1", () => {
	const { repo } = makeRepo();
	tmuxState({});
	const stubborn = fakeClaude(repo, { ignoreTerm: true });
	const run = runAsSession(repo, ["close-previous"]);
	assert.equal(run.status, 1);
	assert.match(run.stderr, new RegExp(`claude ${stubborn.pid} is still running`));
	assert.doesNotMatch(run.stdout, new RegExp(`stopped claude ${stubborn.pid}`));
	assert.equal(alive(stubborn.pid), true);
});

test("no tmux server is no error for close-previous", () => {
	const { repo } = makeRepo();
	tmuxState({});
	const run = runAsSession(repo, ["close-previous"]);
	assert.equal(run.status, 0, run.stderr);
	assert.deepEqual(
		tmuxCalls().map((call) => call[0]),
		["list-panes"],
	);
});

test("a missing tmux program ends with exit 4 and names tmux", () => {
	const { repo } = makeRepo();
	const gitOnly = join(work, `git-only-${counter}`);
	mkdirSync(gitOnly);
	const which = spawnSync("sh", ["-c", "command -v git"], { encoding: "utf8" });
	symlinkSync(which.stdout.trim(), join(gitOnly, "git"));
	const run = runAsSession(repo, ["close-previous"], { path: gitOnly });
	assert.equal(run.status, 4);
	assert.match(run.stderr, /handover: tmux: .*ENOENT/);
});

test("a missing git program ends with exit 4 and names git", () => {
	const { repo } = makeRepo();
	// `bin` holds only the fake tmux.
	const run = runAsSession(repo, ["close-previous"], { path: bin });
	assert.equal(run.status, 4);
	assert.match(run.stderr, /handover: git: .*ENOENT/);
});
