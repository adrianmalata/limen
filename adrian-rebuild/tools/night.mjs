/* PL: Nocny przebieg przebudowy (D-019), uruchamiany przez Adriana w terminalu, nigdy przez sesję. Przed startem
   odmawia kodem 1: brak lub miniona godzina `--until`, prompt.md bez dokładnej pierwszej wiadomości, brak polecenia
   claude albo blokada żywego night.mjs w .night/lock (porzuconą przejmuje jak w A-017). Każdy przebieg to `claude -p`
   z pierwszą wiadomością i „Tryb nocny do HH:MM.”, z `--permission-mode dontAsk`, stdin z /dev/null i logiem w .night/;
   o końcu decyduje wyłącznie pole `reason` w .night/status.json zapisanym po starcie przebiegu (kod 0), a bez niego
   następuje ponowienie po 30, 60 i 120 min, nigdy od godziny końca (potem kod 3); awaria samego narzędzia daje kod 4.
   Nie dotyka gita ani plików poza .night/. Stan: działa; test w tools/test-night.mjs. */
// Usage: node adrian-rebuild/tools/night.mjs --until HH:MM [--claude <path>]
//   --until  local time; the end is the next HH:MM, and one more than 18 h ahead has passed (exit 1)
//   --claude the Claude Code executable (default: claude on PATH); the tests pass a fake
// Exit 0: a run wrote its reason of the end; 1: refused before the first run; 3: the night ended without a reason;
//      4: the runner itself failed (the message carries the stack).
import { spawn } from "node:child_process";
import { randomUUID } from "node:crypto";
import {
	accessSync,
	appendFileSync,
	closeSync,
	constants,
	linkSync,
	mkdirSync,
	openSync,
	readFileSync,
	rmSync,
	statSync,
	writeFileSync,
} from "node:fs";
import { delimiter, join, resolve } from "node:path";

/** The first message of the rebuild prompt (`input/prompt.md`, line 5), word for word. */
export const FIRST_MESSAGE =
	"Przeczytaj `adrian-rebuild/input/prompt.md` i wykonaj go od etapu wskazanego w sekcji `## State` pliku " +
	"`adrian-rebuild/plan.md`; jeśli plik nie istnieje, zacznij od etapu 0.";
// The reasons of the end that a session writes into `.night/status.json` (night mode of the prompt; D-019).
const REASONS = ["done", "no-ticket", "failed-twice", "end-time", "dirty-tree"];
const RETRY_MINUTES = [30, 60, 120];
const HORIZON_HOURS = 18;
const MINUTE = 60_000;
const PROMPT = "adrian-rebuild/input/prompt.md";
const NIGHT = "adrian-rebuild/.night";
const USAGE = "usage: node adrian-rebuild/tools/night.mjs --until HH:MM [--claude <path>]";

/** A refusal before the first run: exit 1 with its message. */
class Refusal extends Error {}

/** A local time as ISO 8601 with its offset, e.g. 2026-11-17T22:00:00+01:00. */
function stamp(date) {
	const pad = (value) => String(value).padStart(2, "0");
	const offset = -date.getTimezoneOffset();
	const zone = `${offset < 0 ? "-" : "+"}${pad(Math.floor(Math.abs(offset) / 60))}:${pad(Math.abs(offset) % 60)}`;
	const day = `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}`;
	return `${day}T${pad(date.getHours())}:${pad(date.getMinutes())}:${pad(date.getSeconds())}${zone}`;
}

/** The file's text, or undefined when it does not exist. */
function readIfExists(path) {
	try {
		return readFileSync(path, "utf8");
	} catch (error) {
		if (error.code === "ENOENT") {
			return undefined;
		}
		throw error;
	}
}

function parseArgs(argv) {
	const options = { until: undefined, claude: "claude" };
	for (let index = 0; index < argv.length; index += 2) {
		const [name, value] = [argv[index], argv[index + 1]];
		if (name !== "--until" && name !== "--claude") {
			throw new Refusal(`unexpected argument "${name}"; ${USAGE}`);
		}
		if (value === undefined || value.startsWith("--")) {
			throw new Refusal(`${name} needs a value; ${USAGE}`);
		}
		options[name.slice(2)] = value;
	}
	if (options.until === undefined) {
		throw new Refusal(`--until is required; ${USAGE}`);
	}
	return options;
}

/** The end of the night: the next local HH:MM after `now`; one more than 18 hours ahead has passed (D-019). */
export function deadline(hhmm, now) {
	const match = /^([01]\d|2[0-3]):([0-5]\d)$/.exec(hhmm);
	if (match === null) {
		throw new Refusal(`--until "${hhmm}" is not a local time HH:MM, e.g. --until 06:30`);
	}
	const end = new Date(now);
	end.setHours(Number(match[1]), Number(match[2]), 0, 0);
	if (end <= now) {
		end.setDate(end.getDate() + 1);
	}
	if (end.getTime() - now.getTime() > HORIZON_HOURS * 60 * MINUTE) {
		const passed = new Date(end);
		passed.setDate(passed.getDate() - 1);
		throw new Refusal(
			`--until ${hhmm} has passed (${stamp(passed)}); a night ends at the next HH:MM, at most ${HORIZON_HOURS} h after the start`,
		);
	}
	return end;
}

function checkPrompt(root) {
	const text = readIfExists(join(root, PROMPT));
	if (text === undefined) {
		throw new Refusal(`${PROMPT} does not exist; the night run needs the rebuild prompt`);
	}
	if (!text.includes(FIRST_MESSAGE)) {
		throw new Refusal(
			`${PROMPT} does not contain the first message of night.mjs word for word; make FIRST_MESSAGE in adrian-rebuild/tools/night.mjs and the prompt agree`,
		);
	}
}

/** Refuses a command that is not an executable file (by its path, or on PATH). */
function checkCommand(command) {
	const candidates = command.includes("/")
		? [command]
		: (process.env.PATH ?? "")
				.split(delimiter)
				.filter(Boolean)
				.map((dir) => join(dir, command));
	const executable = (path) => {
		try {
			accessSync(path, constants.X_OK);
			return statSync(path).isFile();
		} catch (error) {
			if (["ENOENT", "EACCES", "ENOTDIR"].includes(error.code)) {
				return false;
			}
			throw error;
		}
	};
	if (!candidates.some(executable)) {
		throw new Refusal(
			`cannot run ${command}: no executable file${command.includes("/") ? "" : " on PATH"}; pass --claude <path>`,
		);
	}
}

/** A live process's identity (A-017): its start time since boot and the boot id; undefined when it is dead. */
function processIdentity(pid) {
	const stat = readIfExists(`/proc/${pid}/stat`);
	if (stat === undefined) {
		return undefined;
	}
	// Field 2, the command name, is in parentheses and may hold spaces; field 22, the start time, is the 20th after it.
	const start = stat.slice(stat.lastIndexOf(")") + 2).split(" ")[19];
	return { start, boot: readFileSync("/proc/sys/kernel/random/boot_id", "utf8").trim() };
}

/** The text of a lock owned by `pid`: pid, process start time, boot id and the wall-clock start of the night. */
export function ownerRecord(pid, date) {
	return `${JSON.stringify({ pid, ...processIdentity(pid), started: stamp(date) })}\n`;
}

/** A lock's owner when its text is a record with a pid; undefined for any other text. */
function parseOwner(text) {
	try {
		const owner = JSON.parse(text);
		return Number.isInteger(owner?.pid) ? owner : undefined;
	} catch (error) {
		if (error instanceof SyntaxError) {
			return undefined;
		}
		throw error;
	}
}

/** Removes the lock when its owner is gone (any mismatch of pid, start time or boot id); refuses when it is alive. */
function removeAbandoned(lock, out) {
	const text = readIfExists(lock);
	if (text === undefined) {
		return;
	}
	const owner = parseOwner(text);
	const identity = owner === undefined ? undefined : processIdentity(owner.pid);
	if (identity !== undefined && identity.start === owner.start && identity.boot === owner.boot) {
		throw new Refusal(
			`another night.mjs runs: pid ${owner.pid}, started ${owner.started} (lock ${NIGHT}/lock); wait for it to end or stop it`,
		);
	}
	// Read again right before the removal, so that a lock another runner has just taken over stays.
	if (readIfExists(lock) === text) {
		rmSync(lock, { force: true });
		out(
			`night: took over the abandoned lock of pid ${owner?.pid ?? "unknown"} (started ${owner?.started ?? "unknown"})`,
		);
	}
}

/** Takes `.night/lock`; `link` never replaces a file, so of two runners started together only one gets it. */
function takeLock(dir, now, out) {
	const lock = join(dir, "lock");
	const mine = ownerRecord(process.pid, now);
	const temp = join(dir, `.lock-${randomUUID()}.tmp`);
	writeFileSync(temp, mine, { flag: "wx" });
	try {
		for (let attempt = 1; attempt <= 2; attempt += 1) {
			try {
				linkSync(temp, lock);
				return mine;
			} catch (error) {
				if (error.code !== "EEXIST") {
					throw error;
				}
			}
			removeAbandoned(lock, out);
		}
		throw new Refusal(`another night.mjs took ${NIGHT}/lock at the same moment; check it and start again`);
	} finally {
		rmSync(temp, { force: true });
	}
}

/** The reason of the end in `.night/status.json`; it counts only when the file was modified after `since` (D-019). */
function readReason(file, since) {
	let modified;
	try {
		modified = statSync(file).mtime;
	} catch (error) {
		if (error.code === "ENOENT") {
			return { note: "absent" };
		}
		throw error;
	}
	if (modified.getTime() <= since.getTime()) {
		return { note: `last modified ${stamp(modified)}, before this run` };
	}
	let reason;
	try {
		reason = JSON.parse(readFileSync(file, "utf8"))?.reason;
	} catch (error) {
		if (error instanceof SyntaxError) {
			return { note: `not JSON (${error.message})` };
		}
		throw error;
	}
	if (!REASONS.includes(reason)) {
		return { note: `reason ${JSON.stringify(reason)} is not one of ${REASONS.join(", ")}` };
	}
	return { reason, note: `reason ${reason}, modified ${stamp(modified)}` };
}

/** One run of claude with stdin on /dev/null and both output streams appended to `log`; resolves to how it ended. */
function runClaude(command, args, cwd, log) {
	const fd = openSync(log, "a");
	return new Promise((done) => {
		const child = spawn(command, args, { cwd, stdio: ["ignore", fd, fd] });
		child.once("error", (error) => done(`could not start (${error.message})`));
		child.once("exit", (code, signal) => done(code === null ? `ended by ${signal}` : `ended with exit code ${code}`));
	}).finally(() => closeSync(fd));
}

/** Runs and retries until a run writes its reason (0), the retries are used up or the end comes (3). */
async function runNight({ root, dir, claude, until, end }, { now, sleep, out }) {
	const day = stamp(now()).slice(0, 10);
	const args = [
		"-p",
		`${FIRST_MESSAGE} Tryb nocny do ${until}.`,
		"--permission-mode",
		"dontAsk",
		"--output-format",
		"json",
	];
	const shown = [claude, ...args].map((arg) => (/\s/.test(arg) ? JSON.stringify(arg) : arg)).join(" ");
	const hint = `see the run logs in ${NIGHT}/ and plan.md → ## State`;
	for (let run = 1; ; run += 1) {
		const log = join(dir, `${day}-run-${run}.log`);
		const note = (line) => {
			appendFileSync(log, `${line}\n`);
			out(line);
		};
		const started = now();
		note(`night: run ${run} started ${stamp(started)}, until ${stamp(end)}: ${shown}`);
		const ending = await runClaude(claude, args, root, log);
		const status = readReason(join(dir, "status.json"), started);
		note(`night: run ${run} ${ending} at ${stamp(now())}; status.json: ${status.note}`);
		if (status.reason !== undefined) {
			note(`night: the session ended with the reason ${status.reason}; exit 0`);
			return 0;
		}
		const wait = RETRY_MINUTES[run - 1];
		const next = wait === undefined ? undefined : new Date(now().getTime() + wait * MINUTE);
		if (next === undefined || next >= end) {
			const why =
				next === undefined
					? `all ${RETRY_MINUTES.length} retries used`
					: `a retry at ${stamp(next)} would start at or after the end`;
			note(`night: ended without a reason in status.json after ${run} runs; exit 3 (${why}); ${hint}`);
			return 3;
		}
		note(`night: retry ${run} of ${RETRY_MINUTES.length} at ${stamp(next)}`);
		await sleep(wait * MINUTE);
		if (now() >= end) {
			note(
				`night: ended without a reason in status.json after ${run} runs; exit 3 (the end came during the wait); ${hint}`,
			);
			return 3;
		}
	}
}

/** The checks before the first run (a `Refusal` each), the lock, then the runs; the lock goes when the night ends. */
async function guardedNight(argv, { root, now, sleep, out }) {
	const options = parseArgs(argv);
	const end = deadline(options.until, now());
	checkPrompt(root);
	checkCommand(options.claude);
	const dir = join(root, NIGHT);
	mkdirSync(dir, { recursive: true });
	const mine = takeLock(dir, now(), out);
	const claude = options.claude.includes("/") ? resolve(options.claude) : options.claude;
	try {
		return await runNight({ root, dir, claude, until: options.until, end }, { now, sleep, out });
	} finally {
		if (readIfExists(join(dir, "lock")) === mine) {
			rmSync(join(dir, "lock"), { force: true });
		}
	}
}

/**
 * The night, with the clock and the output injected: 0 or 3 from the runs, 1 for a refusal before the first run, and
 * 4 when the runner itself fails, so that a crash in the night never reads as a refusal (z. 12).
 */
export async function night(argv, deps) {
	try {
		return await guardedNight(argv, deps);
	} catch (error) {
		if (error instanceof Refusal) {
			deps.err(`night: refused: ${error.message}`);
			return 1;
		}
		deps.err(`night: failed: ${error.stack}; the run logs are in ${NIGHT}/`);
		return 4;
	}
}

if (import.meta.main) {
	process.exitCode = await night(process.argv.slice(2), {
		root: resolve(import.meta.dirname, "..", ".."),
		now: () => new Date(),
		sleep: (ms) => new Promise((wake) => setTimeout(wake, ms)),
		out: (line) => console.log(line),
		err: (line) => console.error(line),
	});
}
