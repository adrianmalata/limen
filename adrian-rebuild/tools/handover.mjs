/* PL: Narzędzie przekazania sesji głównej przebudowy (D-047, zmienia D-033). `start <n>` zakłada w tmux sesję
   `limen-rebuild-<n>` z Claude Code w trybie remote-control, pierwszą wiadomością promptu i bez zmiennych sesji
   wywołującej; `close-previous` zamyka każdą starszą sesję przebudowy: sesje tmux `limen-rebuild-<n>` w repozytorium
   poza własną i procesy `claude` w repozytorium starsze od własnej sesji, poza jej przodkami. Oba polecenia działają
   tylko w bezpiecznym punkcie (gałąź adrian-rebuild, czyste drzewo, HEAD wypchnięty). Stan: działa; test
   w tools/test-handover.mjs. */
// Usage: node adrian-rebuild/tools/handover.mjs start <n>
//        node adrian-rebuild/tools/handover.mjs close-previous
// Run from the repository root. Exit 0 done, 1 refused or not done (the reason on stderr), 2 usage, 4 tool failure.
import { spawnSync } from "node:child_process";
import { readdirSync, readFileSync, realpathSync } from "node:fs";
import { basename } from "node:path";
import { setTimeout as sleep } from "node:timers/promises";
import { FIRST_MESSAGE } from "./night.mjs";

const BRANCH = "adrian-rebuild";
const SESSION = /^limen-rebuild-\d+$/;
// The new session must still exist this long after `tmux new-session`; a claude that fails at start exits sooner.
const START_CHECK_MS = 2000;
// Long enough for claude to finish on SIGTERM, short enough to be a new session's first command.
const TERM_GRACE_MS = 5000;
// The variables Claude Code 2.1 adds to the environment of its Bash tool: the names there that the claude process
// itself does not have (observed 2026-11-19). A claude started with them takes itself for part of the caller's
// session, so the new session starts without them, whichever tmux server runs it; user settings such as
// CLAUDE_CONFIG_DIR are not among them.
export const SESSION_VARIABLES = Object.freeze([
	"AI_AGENT",
	"COREPACK_ENABLE_AUTO_PIN",
	"GIT_EDITOR",
	"NoDefaultCurrentDirectoryInExePath",
	"CLAUDECODE",
	"CLAUDE_PID",
	"CLAUDE_EFFORT",
	"CLAUDE_CODE_ENTRYPOINT",
	"CLAUDE_CODE_EXECPATH",
	"CLAUDE_CODE_SESSION_ID",
	"CLAUDE_CODE_SESSION_ATTENDED",
	"CLAUDE_CODE_BRIDGE_SESSION_ID",
	"CLAUDE_CODE_CHILD_SESSION",
	"CLAUDE_CODE_CHILD_NOTES_DIR",
	"CLAUDE_CODE_MESSAGING_SOCKET",
	"CLAUDE_CODE_MESSAGING_TOKEN",
]);

class Refusal extends Error {}

function run(command, args, cwd) {
	const result = spawnSync(command, args, { cwd, encoding: "utf8" });
	if (result.error) {
		throw new Error(`${command}: ${result.error.message}`);
	}
	return result;
}

function git(repo, args) {
	const result = run("git", args, repo);
	if (result.status !== 0) {
		throw new Error(`git ${args.join(" ")} exited with ${result.status}: ${result.stderr.trim()}`);
	}
	return result.stdout.trim();
}

/** The safe point of D-033, from git: on adrian-rebuild, a clean tree, HEAD pushed. Throws a Refusal otherwise. */
function requireSafePoint(repo) {
	const branch = run("git", ["symbolic-ref", "--quiet", "--short", "HEAD"], repo).stdout.trim();
	if (branch !== BRANCH) {
		throw new Refusal(`the branch is ${branch || "detached"}, not ${BRANCH}`);
	}
	if (git(repo, ["status", "--porcelain"]) !== "") {
		throw new Refusal("the working tree is not clean");
	}
	const remote = run("git", ["rev-parse", "--verify", "--quiet", `refs/remotes/origin/${BRANCH}`], repo);
	if (git(repo, ["rev-parse", "HEAD"]) !== remote.stdout.trim()) {
		throw new Refusal(`HEAD is not origin/${BRANCH}: commit and push first`);
	}
}

/** The fields of /proc/<pid>/stat from field 3 on; the command name before them may hold spaces and parentheses. */
function statFields(pid) {
	try {
		const stat = readFileSync(`/proc/${pid}/stat`, "utf8");
		return stat.slice(stat.lastIndexOf(")") + 2).split(" ");
	} catch {
		return undefined;
	}
}

/** A zombie stays in /proc until its parent reaps it, but it no longer runs, so it counts as gone. */
function isAlive(pid) {
	const state = statFields(pid)?.[0];
	return state !== undefined && state !== "Z" && state !== "X";
}

/** Field 22, the start time in clock ticks since boot; NaN when the process is gone. */
const startOf = (pid) => Number(statFields(pid)?.[19]);

/** The pid and its ancestors, nearest first, up to pid 1. */
function lineage(pid) {
	const chain = [];
	for (let current = pid; current > 0 && !chain.includes(current); ) {
		chain.push(current);
		current = Number(statFields(current)?.[1] ?? 0);
	}
	return chain;
}

/** The argument vector of a process, or undefined when it is gone or unreadable. */
function argvOf(pid) {
	try {
		return readFileSync(`/proc/${pid}/cmdline`, "utf8").split("\0").filter(Boolean);
	} catch {
		return undefined;
	}
}

const isClaude = (pid) => {
	const argv0 = argvOf(pid)?.[0];
	return argv0 !== undefined && basename(argv0) === "claude";
};

function realOrNone(path) {
	try {
		return realpathSync(path);
	} catch {
		return undefined;
	}
}

/** Every rebuild session of tmux with its directory and pane pids; none when no tmux server runs. */
function rebuildSessions() {
	const result = run("tmux", ["list-panes", "-a", "-F", "#{session_name}\t#{pane_pid}\t#{session_path}"]);
	if (result.status !== 0) {
		if (/no server running|error connecting to/.test(result.stderr)) {
			return new Map();
		}
		throw new Error(`tmux list-panes exited with ${result.status}: ${result.stderr.trim()}`);
	}
	const sessions = new Map();
	for (const line of result.stdout.split("\n").filter(Boolean)) {
		const [name, pid, ...path] = line.split("\t");
		if (SESSION.test(name)) {
			const session = sessions.get(name) ?? { path: path.join("\t"), panes: [] };
			session.panes.push(Number(pid));
			sessions.set(name, session);
		}
	}
	return sessions;
}

const hasSession = (name) => run("tmux", ["has-session", "-t", `=${name}`]).status === 0;

async function start(repo, n) {
	requireSafePoint(repo);
	const name = `limen-rebuild-${n}`;
	if (hasSession(name)) {
		throw new Refusal(`the tmux session ${name} exists`);
	}
	// tmux runs the command with these arguments as given, without a shell, so the message needs no quoting.
	const command = ["env", ...SESSION_VARIABLES.flatMap((variable) => ["-u", variable]), "claude"];
	const opened = run("tmux", [
		"new-session",
		"-d",
		"-s",
		name,
		"-c",
		repo,
		...command,
		"--remote-control",
		`Limen rebuild ${n}`,
		FIRST_MESSAGE,
	]);
	if (opened.status !== 0) {
		throw new Error(`tmux new-session exited with ${opened.status}: ${opened.stderr.trim()}`);
	}
	await sleep(START_CHECK_MS);
	if (!hasSession(name)) {
		throw new Refusal(`the tmux session ${name} is gone ${START_CHECK_MS / 1000} s after its start`);
	}
	console.log(`handover: started ${name}`);
}

async function closePrevious(repo) {
	requireSafePoint(repo);
	const ancestors = lineage(process.pid);
	// The caller's own session: the nearest ancestor that is claude (none when Adrian runs the tool in a terminal).
	const own = ancestors.find(isClaude);
	// Only what started before the caller's own session is previous, so an old session that runs this by mistake
	// after `start` leaves the new one; a process that is gone has nothing left to keep.
	const older = (pid) => own === undefined || !(startOf(pid) >= startOf(own));
	let closed = 0;
	for (const [name, session] of rebuildSessions()) {
		const runsCaller = session.panes.some((pid) => ancestors.includes(pid));
		if (runsCaller || realOrNone(session.path) !== repo || !session.panes.every(older)) {
			continue;
		}
		const killed = run("tmux", ["kill-session", "-t", `=${name}`]);
		// A session that ended after list-panes is closed too; the processes below must still be stopped.
		if (killed.status !== 0 && hasSession(name)) {
			throw new Error(`tmux kill-session -t =${name} exited with ${killed.status}: ${killed.stderr.trim()}`);
		}
		console.log(
			killed.status === 0 ? `handover: closed tmux session ${name}` : `handover: tmux session ${name} was already gone`,
		);
		closed += 1;
	}
	const previous = readdirSync("/proc")
		.filter((entry) => /^\d+$/.test(entry))
		.map(Number)
		.filter(
			(pid) => isClaude(pid) && realOrNone(`/proc/${pid}/cwd`) === repo && !ancestors.includes(pid) && older(pid),
		);
	const commands = new Map(previous.map((pid) => [pid, argvOf(pid)?.join(" ") ?? ""]));
	for (const pid of previous) {
		try {
			process.kill(pid, "SIGTERM");
		} catch (error) {
			if (error.code !== "ESRCH") {
				throw error;
			}
		}
	}
	const end = Date.now() + TERM_GRACE_MS;
	while (previous.some(isAlive) && Date.now() < end) {
		await sleep(100);
	}
	const survivors = previous.filter(isAlive);
	for (const pid of previous.filter((pid) => !survivors.includes(pid))) {
		console.log(`handover: stopped claude ${pid} (${commands.get(pid).slice(0, 120)})`);
		closed += 1;
	}
	if (closed === 0 && survivors.length === 0) {
		console.log("handover: nothing to close");
	}
	if (survivors.length > 0) {
		throw new Refusal(
			survivors.map((pid) => `claude ${pid} is still running ${TERM_GRACE_MS / 1000} s after SIGTERM`).join("; "),
		);
	}
}

async function main(args) {
	const usage = "usage: handover.mjs start <n> | close-previous";
	const repo = realpathSync(git(process.cwd(), ["rev-parse", "--show-toplevel"]));
	if (args[0] === "start" && args.length === 2 && /^[1-9]\d*$/.test(args[1])) {
		await start(repo, Number(args[1]));
	} else if (args[0] === "close-previous" && args.length === 1) {
		await closePrevious(repo);
	} else {
		console.error(`handover: ${usage}`);
		return 2;
	}
	return 0;
}

if (import.meta.main) {
	try {
		process.exitCode = await main(process.argv.slice(2));
	} catch (error) {
		console.error(`handover: ${error.message}`);
		process.exitCode = error instanceof Refusal ? 1 : 4;
	}
}
