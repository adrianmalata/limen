// The help Limen generates from its command registry: the general help, one command's help and the docs sections.
import assert from "node:assert/strict";
import { spawn, spawnSync } from "node:child_process";
import { mkdtempSync, readFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { after, test } from "node:test";
import { fileURLToPath } from "node:url";
import { docsSections, entryHelp, generalHelp } from "../src/help.ts";
import { EXIT_CODES, FINAL_LINE_KEYS } from "../src/outcome.ts";
import { REGISTRY } from "../src/registry.ts";
import { outputText, readOutcome } from "./final-line.ts";
import { LIMEN } from "./plant.ts";

// `--help` reads no project, so a folder outside every repository serves.
const outside = mkdtempSync(join(tmpdir(), "limen-help-"));
after(() => rmSync(outside, { recursive: true, force: true }));
const ENV = { PATH: process.env.PATH ?? "/usr/bin:/bin", HOME: outside, NODE_NO_WARNINGS: "1" };
const DOCS = fileURLToPath(new URL("../docs/commands.md", import.meta.url));
const WIDTH = 100;

function limen(args: readonly string[]) {
	const run = spawnSync(process.execPath, [LIMEN, ...args], { cwd: outside, encoding: "utf8", env: ENV });
	return { stdout: run.stdout, stderr: run.stderr, status: run.status ?? 1 };
}

/** The exit status of `limen <args>`, run beside the others. */
function status(args: readonly string[]): Promise<number | null> {
	const child = spawn(process.execPath, [LIMEN, ...args], { cwd: outside, env: ENV, stdio: "ignore" });
	return new Promise((resolve) => child.on("close", resolve));
}

// Change 4 of R-014, written out so that a change of wording or layout fails here.
const GENERAL = [
	"limen: coding jobs, each in its own git worktree",
	"",
	"Jobs: spawn starts a job; the others act on one job, or on several with --running or --all",
	'  limen spawn "task" --engine <engine> --provider <provider> --model <model> --thinking <level> …',
	"      start a job in its own worktree; the task points to its ticket",
	'  limen continue <job> "instruction" …       resume a finished job in its worktree',
	'  limen steer <job>|--running "text"         send a correction to a running job',
	'  limen stop <job> ["reason"]                stop a running job',
	"  limen abandon <job>                        give up on a job and keep its work on a branch",
	"  limen land <job> [--onto <branch>] [--yes] [--keep-open]",
	"                                             merge a done job onto this branch and close its ticket",
	"  limen diff <job>                           the change a job made against its base",
	"  limen show <job>                           one job's record",
	"  limen open <job>                           open the job's log tab in Herdr",
	"  limen watch <job>|--running                wake this coordinator when the job ends",
	"  limen unwatch <job>|--all                  stop waking this coordinator for the job",
	"",
	"This project",
	"  limen init [--drop-leftovers]",
	"      set up Limen here; --drop-leftovers deletes files Limen no longer reads",
	"  limen status [--all]",
	"      what runs, what landed, what waits for the owner; --all lists every job",
	"  limen stats [--sessions <dir>]",
	"      jobs by route and role, tokens and lead time per land; --sessions adds coordinator turns",
	"  limen board [--write]",
	"      the board with NOW and PROVEN; --write rewrites them in spec/build.md",
	"  limen migrate [--dry-run]",
	"      move job records an older Limen wrote into record.json; --dry-run writes nothing",
	"",
	"Tickets: files under spec/features/",
	'  limen ticket new "what becomes true" [--lane planned|active] [--touches <ids>]',
	"                                             write a ticket with the next free number",
	"  limen ticket check [<branch>]",
	"      the ticket check land runs, for the tickets a branch changes",
	"  limen ticket done <FNNN> … [--on <date>]   close a ticket that landed without limen land",
	"  limen keeper <ticket> --engine <engine> --provider <provider> --model <model> --thinking <level> …",
	"      a short job fixes the ticket, board and map links after the work",
	"",
	"Seat: all projects on this machine",
	"  limen seat queue                           the start queue and its CPU and memory reading",
	"  limen seat sweep [--install] [--uninstall] [--status]",
	"      end dead jobs, resume quota jobs, prune and retire daily; --install runs it every minute",
	"  limen rule                                 the seat-wide rules that hold now",
	'  limen rule set <name> --until <time> [--start-priority 1|2|3] "text"',
	"                                             a rule for every coordinator on this machine",
	'  limen rule end <name> ["reason"]           end a rule now',
	"",
	"Modules",
	"  limen github connect|disconnect|status|doctor",
	"                                             answer @limen mentions on GitHub pull requests",
	"  limen group start|status|publish|stop|close …",
	"                                             several agents on one ticket",
	"  limen picture build|serve …                the architecture map check and the job activity feed",
	"  limen workspace init",
	"      a folder outside Git that holds several Git repositories; each job works in one (--repo)",
	"",
	"Exit codes: 0 ok · 1 refused · 2 usage · 3 transient · 4 environment · 5 internal.",
	"The last output line is JSON {class, code, next, ids?}.",
];
const LAND = [
	"limen land <job> [--onto <branch>] [--yes] [--keep-open]",
	"merge a done job onto this branch and close its ticket",
	"",
	"  <job>              the job's full id or its 8-character token",
	"  --onto <branch>    refuse unless <branch> is the checked-out branch",
	"  --yes              do not ask for confirmation in a terminal",
	"  --keep-open        keep the ticket active, because more slices remain",
	"",
	"Example: limen land a1b2c3d4",
];
// R-098, D-098 (3): the flag that names the coordinator's sessions.
const STATS = [
	"limen stats [--sessions <dir>]",
	"jobs by route and role, tokens and lead time per land; --sessions adds coordinator turns",
	"",
	"  --sessions <dir>    the folder of the coordinator's Pi sessions, or a copy of it",
	"",
	"Example: limen stats --sessions ../coordinator-sessions",
];

test("T-19: limen --help prints the general help of Change 4 and ends with the success line", () => {
	const run = limen(["--help"]);
	assert.equal(run.status, 0, run.stderr);
	assert.deepEqual(readOutcome(run), { class: "ok", code: null, next: null });
	assert.deepEqual(outputText(run).split("\n"), [...GENERAL, ""]);
});

test("T-19: limen land --help prints its usage line, its summary, one line per part and its example", () => {
	const run = limen(["land", "--help"]);
	assert.equal(run.status, 0, run.stderr);
	assert.deepEqual(outputText(run).split("\n"), [...LAND, ""]);
});

test("T-19: limen stats --help prints its usage line, its summary, its flag and its example", () => {
	const run = limen(["stats", "--help"]);
	assert.equal(run.status, 0, run.stderr);
	assert.deepEqual(outputText(run).split("\n"), [...STATS, ""]);
});

test("T-10: no line of the general help or of any command's help is wider than 100 characters", () => {
	const wide = [generalHelp(), ...REGISTRY.map(entryHelp)]
		.flatMap((text) => text.split("\n"))
		.filter((line) => line.length > WIDTH);
	assert.deepEqual(wide, []);
});

test("T-19: no internal command appears in limen --help", () => {
	const help = generalHelp();
	const internal = REGISTRY.filter((entry) => entry.visibility === "internal");
	assert.ok(internal.length > 0);
	for (const entry of internal) {
		const [group, sub] = entry.name.split(" ");
		const named = new RegExp(`limen ${entry.name}(?: |$)`, "m").test(help);
		const listed = help.split("\n").some((line) => line.startsWith(`  limen ${group} `) && line.includes(`|${sub}`));
		assert.deepEqual([named, listed], [false, false], entry.name);
	}
});

test("T-19: limen <name> --help exits 0 for every registry entry, internal ones included", async () => {
	const names = REGISTRY.map((entry) => entry.name);
	const statuses = await Promise.all(names.map((name) => status([...name.split(" "), "--help"])));
	assert.deepEqual(
		names.filter((_, index) => statuses[index] !== 0),
		[],
	);
});

test("T-02: the last two lines of the help come from EXIT_CODES and the keys of the final line", () => {
	const codes = Object.entries(EXIT_CODES).map(([name, code]) => `${code} ${name}`);
	const keys = FINAL_LINE_KEYS.map(({ key, optional }) => (optional ? `${key}?` : key));
	assert.deepEqual(generalHelp().split("\n").slice(-2), [
		`Exit codes: ${codes.join(" · ")}.`,
		`The last output line is JSON {${keys.join(", ")}}.`,
	]);
});

test("A-084: both registry sections of docs/commands.md equal the text the registry generates", () => {
	const docs = readFileSync(DOCS, "utf8");
	for (const [name, text] of Object.entries(docsSections())) {
		const begin = `<!-- registry:${name}:begin -->\n`;
		const end = `<!-- registry:${name}:end -->`;
		const start = docs.indexOf(begin);
		const stop = docs.indexOf(end);
		assert.ok(start >= 0 && stop > start, `docs/commands.md has no ${name} section`);
		assert.equal(docs.slice(start + begin.length, stop), text, `regenerate the ${name} section of docs/commands.md`);
	}
});

test("BAD_ARGUMENT: limen <group> alone exits 2 with the group's lines and limen <group> --help in next", () => {
	const run = limen(["ticket"]);
	assert.equal(run.status, 2, run.stderr);
	assert.deepEqual(readOutcome(run), { class: "usage", code: "BAD_ARGUMENT", next: "limen ticket --help" });
	const lines = outputText(run).split("\n");
	assert.deepEqual(lines.slice(0, 2), [
		"limen ticket: name one of its commands",
		"Tickets: files under spec/features/",
	]);
	assert.ok(
		lines.some((line) => line.startsWith('  limen ticket new "what becomes true"')),
		outputText(run),
	);
});

test("T-19: limen <group> --help prints the group's title and the lines of its public subcommands", () => {
	const run = limen(["group", "--help"]);
	assert.equal(run.status, 0, run.stderr);
	const lines = outputText(run).split("\n");
	assert.equal(lines[0], "group: several agents on one ticket");
	assert.deepEqual(
		lines.filter((line) => line.startsWith("  limen ")).map((line) => line.split(" ").slice(3, 5).join(" ")),
		["group start", "group status", "group publish", "group stop", "group close"],
	);
});

test("T-19: limen rule --help prints the help of rule, then the lines of rule set and rule end, whose names it starts", () => {
	const run = limen(["rule", "--help"]);
	assert.equal(run.status, 0, run.stderr);
	const text = outputText(run);
	assert.ok(text.startsWith("limen rule\nthe seat-wide rules that hold now\n"), text);
	const usages = text.split("\n").filter((line) => line.startsWith("  limen rule "));
	assert.deepEqual(
		usages.map((line) => line.trim().split(/ {2,}/)[0]),
		['limen rule set <name> --until <time> [--start-priority 1|2|3] "text"', 'limen rule end <name> ["reason"]'],
	);
});
