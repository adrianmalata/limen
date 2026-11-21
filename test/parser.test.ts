// The shared parser: every argument error is a usage error with the command's usage line, and the rules of a word.
import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { after, test } from "node:test";
import { LimenError } from "../src/outcome.ts";
import { type Command, limenCommand, parse, usage } from "../src/parser.ts";
import { outputText, readOutcome } from "./final-line.ts";
import { limen as inPlant, jobDir, LIMEN, plant, writeRecord } from "./plant.ts";

// A parse error happens before any command reads a project, so a folder outside every repository serves.
const outside = mkdtempSync(join(tmpdir(), "limen-parser-"));
after(() => rmSync(outside, { recursive: true, force: true }));
const LAND_USAGE = "usage: limen land <job> [--onto <branch>] [--yes] [--keep-open]";

function limen(args: readonly string[]) {
	const run = spawnSync(process.execPath, [LIMEN, ...args], {
		cwd: outside,
		encoding: "utf8",
		env: { PATH: process.env.PATH ?? "/usr/bin:/bin", HOME: outside, NODE_NO_WARNINGS: "1" },
	});
	return { stdout: run.stdout, stderr: run.stderr, status: run.status ?? 1 };
}

/** The parser's answer to `words` for `command`, or the usage error it throws. */
function refusal(command: Command, words: readonly string[]): LimenError {
	try {
		parse(command, words);
	} catch (error) {
		assert.ok(error instanceof LimenError, String(error));
		return error;
	}
	throw new Error(`${words.join(" ")} parsed`);
}

test("BAD_ARGUMENT: the parser error of an unknown flag is exactly two lines and the final line on stderr", () => {
	const run = limen(["land", "a1b2c3d4", "--ontoo", "main"]);
	assert.equal(run.status, 2, run.stderr);
	assert.equal(
		run.stderr,
		`limen land: unknown flag --ontoo\n${LAND_USAGE}\n{"class":"usage","code":"BAD_ARGUMENT","next":"limen land --help"}\n`,
	);
});

// One case per kind of error the parser finds in a command's words.
const ERRORS = {
	"a missing value": [["land", "a1b2c3d4", "--onto"], "limen land: missing the value of --onto"],
	"a missing positional": [["land"], "limen land: missing <job>"],
	"an extra positional": [["land", "a1b2c3d4", "b2c3d4e5"], 'limen land: unexpected argument "b2c3d4e5"'],
} as const;
for (const [kind, [args, first]] of Object.entries(ERRORS)) {
	test(`BAD_ARGUMENT: ${kind} exits 2 with the usage line in the message and limen land --help in next`, () => {
		const run = limen(args);
		assert.equal(run.status, 2, run.stderr);
		assert.deepEqual(readOutcome(run), { class: "usage", code: "BAD_ARGUMENT", next: "limen land --help" });
		assert.equal(outputText(run), `${first}\n${LAND_USAGE}\n`);
	});
}

test("BAD_ARGUMENT: a spawn without --model and --thinking exits 2 and names both missing flags", () => {
	const run = limen(["spawn", "task", "--engine", "pi", "--provider", "anthropic"]);
	assert.equal(run.status, 2, run.stderr);
	assert.deepEqual(readOutcome(run), { class: "usage", code: "BAD_ARGUMENT", next: "limen spawn --help" });
	assert.equal(outputText(run).split("\n")[0], "limen spawn: missing --model, --thinking");
});

const NOTE: Command = {
	name: "note",
	schema: [
		{ flag: "label", value: "label", dashValue: true, about: "a label" },
		{ flag: "tag", value: "tag", about: "a tag" },
		{ flag: "yes", about: "a switch" },
		{ positional: "text", type: "text", about: "the words" },
	],
};

test("a lone -- ends the flags, so a word after it that starts with -- is text", () => {
	const parsed = parse(NOTE, ["first", "--", "--yes", "last"]);
	assert.deepEqual([parsed.get("text"), parsed.has("yes")], ["first --yes last", false]);
});

test("a word that starts with one dash, and a lone dash, are positionals", () => {
	assert.deepEqual(parse(NOTE, ["-x", "-", "--yes"]).list("text"), ["-x", "-"]);
});

test("a separate value that starts with -- is the value of a flag that allows it, and a missing value otherwise", () => {
	assert.equal(parse(NOTE, ["--label", "--yes", "words"]).get("label"), "--yes");
	assert.equal(
		refusal(NOTE, ["--tag", "--yes", "words"]).message.split("\n")[0],
		"limen note: missing the value of --tag",
	);
});

test("REMOVED: a removed flag in the schema refuses as a flag and reads as a value after a flag that takes one", () => {
	const spawnLike: Command = { name: "spawn", schema: [...NOTE.schema, { removed: "tab" }] };
	const removed = refusal(spawnLike, ["--tab", "words"]);
	assert.deepEqual([removed.class, removed.code], ["usage", "REMOVED"]);
	assert.equal(parse(spawnLike, ["--label", "--tab", "words"]).get("label"), "--tab");
});

const SPAWN_LIKE: Command = {
	name: "spawn",
	schema: [
		{ positional: "task", type: "text", replacedBy: "task-file", about: "the task" },
		{ flag: "task-file", value: "file", about: "the task's file" },
	],
};
const STEER_LIKE: Command = {
	name: "steer",
	schema: [
		{ positional: "job", type: "job", replacedBy: "running", about: "the job" },
		{ flag: "running", about: "every running job" },
		{ positional: "text", type: "text", about: "the correction" },
	],
};

test("the flag that stands in for a positional takes its place, so the words go to the next positional", () => {
	const parsed = parse(STEER_LIKE, ["--running", "fix", "the", "test"]);
	assert.deepEqual([parsed.has("job"), parsed.get("text")], [false, "fix the test"]);
});

test("a final text whose flag stands in for it still takes the words, which name the job", () => {
	assert.equal(parse(SPAWN_LIKE, ["--task-file", "task.md", "Short", "title"]).get("task"), "Short title");
	assert.equal(parse(SPAWN_LIKE, ["--task-file", "task.md"]).has("task"), false);
});

test("an abbreviated usage line ends with … only when it hides a flag", () => {
	const shown: Command = {
		name: "probe",
		abbreviated: true,
		schema: [{ flag: "model", value: "model", required: true, about: "the model" }],
	};
	const hiding: Command = { ...shown, schema: [...shown.schema, { flag: "label", value: "label", about: "a label" }] };
	assert.deepEqual([usage(shown), usage(hiding)], ["probe --model <model>", "probe --model <model> …"]);
});

// `--help` asks for help only where it stands as a flag of its own: not as a flag's value, and not after `--`. D-044:
// continue's own refusal of a running job, exit 1, shows that the parser gave it the label; a parser refusal exits 2.
test("a --help that is the value of a flag asks for no help, so continue runs with it as its label and refuses the running job itself", async (t) => {
	const p = await plant();
	t.after(() => p.cleanup());
	const id = "2026-11-21-help-1a2b3c4d";
	await writeRecord(jobDir(p, id), { state: "running", label: "demo" });
	const run = inPlant(p, ["continue", id, "x", "--label", "--help"]);
	assert.deepEqual(
		[run.status, readOutcome(run).code, run.stdout.includes("limen continue <job>")],
		[1, "UNTYPED", false],
	);
	assert.match(outputText(run), new RegExp(`job ${id} is running; continue needs a finished job`));
});

test("a --help after a lone -- asks for no help, so it reads as a positional", () => {
	const run = limen(["land", "--", "--help"]);
	assert.deepEqual([run.status === 0, run.stdout.includes("limen land <job>")], [false, false]);
});

/** A command with an optional positional, a flag with a value and a switch, for the lines `Parsed` builds back. */
const PROBE: Command = {
	name: "probe run",
	schema: [
		{ positional: "group", type: "word", optional: true, about: "a group" },
		{ flag: "timeout", value: "duration", about: "a limit" },
		{ flag: "yes", about: "a switch" },
	],
};

// D-046 (5): a `next` that repeats the call is built from the words the parser read, each value as it was given.
test("commandLine builds the call back from its values, a positional that starts with -- after a lone --", () => {
	const line = parse(PROBE, ["--yes", "--timeout", "5s", "--", "--odd"]).commandLine();
	assert.equal(line, "limen probe run --timeout 5s --yes -- --odd");
	const again = parse(PROBE, line.split(" ").slice(3));
	assert.deepEqual([again.get("group"), again.get("timeout"), again.has("yes")], ["--odd", "5s", true]);
});

test("commandLine with the names it keeps builds only those parts of the call", () => {
	const values = parse(PROBE, ["g1", "--timeout", "5s", "--yes"]);
	assert.equal(values.commandLine(["group", "yes"]), "limen probe run g1 --yes");
});

test("limenCommand quotes a word with a special character so that a shell reads it back as one word", () => {
	assert.equal(
		limenCommand("ticket check", { positionals: ["it's a branch"] }),
		"limen ticket check 'it'\\''s a branch'",
	);
});
