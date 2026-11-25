// The command registry: each entry's fields, the wrapper's hold on its ids, and the coverage T-28 derives from it.
import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { readdirSync, readFileSync } from "node:fs";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import { join, relative } from "node:path";
import { type TestContext, test } from "node:test";
import { fileURLToPath } from "node:url";
import { isDeepStrictEqual } from "node:util";
import { tokenOf } from "../src/job/id.ts";
import { main } from "../src/main.ts";
import { OLD_FLAGS } from "../src/old-names.ts";
import { SHARED_CODES } from "../src/operation.ts";
import { LimenError } from "../src/outcome.ts";
import { parse } from "../src/parser.ts";
import { platform } from "../src/platform/platform.ts";
import { type Entry, GROUPS, REGISTRY } from "../src/registry.ts";
import {
	type Case,
	type Code,
	codesWithoutTest,
	codeTestsWithoutSnapshot,
	commandsWithoutSuccessTest,
	declarationProblems,
	type Kinded,
	sitesOf,
	type Thrown,
	testCases,
	thrownCodes,
} from "./coverage.ts";
import { withEnvironment } from "./environment.ts";
import { readOutcome } from "./final-line.ts";
import { knownFilesBelow } from "./known-files.ts";
import { jobDir, jobRecord, limen, type Plant, plant, spawnJob, waitJob, writeRecord } from "./plant.ts";
import { snapshot } from "./snapshot.ts";

const ROOT = fileURLToPath(new URL("..", import.meta.url));
const OBJECTS = ["job", "owner", "project", "ticket", "seat", "github", "group", "picture", "workspace"];
const TYPES = ["job", "ticket", "text", "path", "branch", "word"];
// D-039, D-042 and D-096 (1): the commands a subsequent ticket moves or cuts, each with that ticket.
const MOVED = {
	prune: "R-101",
	close: "R-101",
	keeper: "R-066",
	rule: "R-102",
	"rule set": "R-102",
	"rule end": "R-102",
	"rule timer": "R-102",
	"group wait": "R-077",
};
// Change 1: the entries that return identifiers, with their keys; every other entry returns none (D-022).
const IDS = { spawn: ["job"], continue: ["job"], keeper: ["job"], "github review": ["job"], "github work": ["job"] };
const TICKET_IDS = { "ticket new": ["ticket"] };

const byName = (name: string): Entry | undefined => REGISTRY.find((entry) => entry.name === name);

/** The code files git knows below `folders`, each with its path from the repository root and its text. */
async function codeBelow(folders: readonly string[], pattern = /\.ts$/): Promise<Code[]> {
	const paths = (await knownFilesBelow(ROOT, folders)).filter((path) => pattern.test(path));
	return Promise.all(paths.map(async (path) => ({ path: relative(ROOT, path), text: await readFile(path, "utf8") })));
}

test("T-19: every exported command handler under src/commands/ is the handler of a registry entry", async () => {
	const handlers = new Set(REGISTRY.map((entry) => entry.handler));
	const loose: string[] = [];
	const files = (await knownFilesBelow(ROOT, ["src/commands"])).filter((path) =>
		/^src\/commands\/[^/]+\.ts$/.test(relative(ROOT, path)),
	);
	for (const path of files) {
		const exports: Record<string, unknown> = await import(path);
		for (const [name, value] of Object.entries(exports)) {
			if (name.endsWith("Command") && typeof value === "function" && !handlers.has(value as Entry["handler"])) {
				loose.push(`${relative(ROOT, path)}: ${name}`);
			}
		}
	}
	assert.ok(files.length > 20, `${files.length} command files found`);
	assert.deepEqual(loose, []);
});

test("T-19: every registry entry has every field of R-014 with an allowed value", () => {
	assert.equal(new Set(REGISTRY.map((entry) => entry.name)).size, REGISTRY.length, "entry names are unique");
	for (const entry of REGISTRY) {
		const problems = [
			/^[a-z][a-z-]*(?: [a-z][a-z-]*)?$/.test(entry.name) ? "" : "name",
			OBJECTS.includes(entry.object) ? "" : "object",
			entry.kind === "read" || entry.kind === "change" ? "" : "kind",
			(entry.visibility === "internal") === Boolean(entry.caller?.trim()) ? "" : "visibility and caller",
			entry.summary.trim() && !entry.summary.endsWith(".") ? "" : "summary",
			entry.example.startsWith(`limen ${entry.name}`) ? "" : "example",
			entry.movedBy === undefined || /^R-\d{3}$/.test(entry.movedBy) ? "" : "movedBy",
			typeof entry.handler === "function" ? "" : "handler",
			...entry.schema.map((part) => {
				if ("positional" in part) {
					return TYPES.includes(part.type) && part.about.trim() ? "" : `positional ${part.positional}`;
				}
				return "flag" in part && !part.about.trim() ? `flag ${part.flag}` : "";
			}),
		].filter(Boolean);
		assert.deepEqual(problems, [], entry.name);
	}
});

test("D-022: an entry declares the ids keys of R-014 and no others", () => {
	const declared = Object.fromEntries(
		REGISTRY.filter((entry) => entry.ids.length).map((entry) => [entry.name, entry.ids]),
	);
	assert.deepEqual(declared, { ...IDS, ...TICKET_IDS });
});

test("T-18: a top-level entry acts on a job, the owner or the project, and a subcommand on its group, unless it is moved", () => {
	const misplaced = REGISTRY.filter((entry) => entry.movedBy === undefined)
		.filter((entry) => {
			const [first, sub] = entry.name.split(" ");
			return sub === undefined ? !["job", "owner", "project"].includes(entry.object) : entry.object !== first;
		})
		.map((entry) => `${entry.name} acts on ${entry.object}`);
	assert.deepEqual(misplaced, []);
});

test("D-039: the moved entries are exactly the commands a subsequent ticket moves, with that ticket", () => {
	const moved = REGISTRY.filter((entry) => entry.movedBy !== undefined);
	assert.ok(moved.length > 0, "no entry is moved any more: remove the field movedBy and this exception");
	assert.deepEqual(Object.fromEntries(moved.map((entry) => [entry.name, entry.movedBy])), MOVED);
});

// T-28 (3): each command marked irreversible, with its test file and the titles of its tests of running it again and
// of losing nothing.
const IRREVERSIBLE = {
	abandon: {
		file: "test/cli/abandon.test.ts",
		again: "a second abandon after all its steps prints the branch, exits 0 and changes nothing",
		kept: "abandon keeps every changed, deleted and untracked file of the worktree on its branch byte for byte, and no ignored one",
	},
	migrate: {
		file: "test/cli/migrate.test.ts",
		again: "a second run has nothing to do, exits 0 and changes nothing",
		kept: "limen migrate: a valid older job becomes a record holding every value of its files, and its content files stay",
	},
};

test("T-28 (3): the irreversible entries are changes with tests of running them again and of losing nothing", () => {
	const marked = REGISTRY.filter((entry) => entry.irreversible).map((entry) => entry.name);
	assert.deepEqual(marked, Object.keys(IRREVERSIBLE));
	for (const [name, { file, again, kept }] of Object.entries(IRREVERSIBLE)) {
		assert.equal(byName(name)?.kind, "change", name);
		const text = readFileSync(fileURLToPath(new URL(`../${file}`, import.meta.url)), "utf8");
		for (const title of [again, kept]) {
			assert.ok(text.includes(`test(${JSON.stringify(title)},`), `${file} has no test "${title}"`);
		}
	}
});

test("T-18: an entry that acts on one job takes a required job, except spawn, which creates it", () => {
	const without = REGISTRY.filter((entry) => entry.object === "job" && entry.name !== "spawn")
		.filter((entry) => !entry.schema.some((part) => "positional" in part && part.type === "job" && !part.optional))
		.map((entry) => entry.name);
	assert.deepEqual(without, []);
});

/** The words of a shell line: a double-quoted part is one word. */
function words(line: string): string[] {
	return [...line.matchAll(/"([^"]*)"|(\S+)/g)].map((match) => match[1] ?? match[2] ?? "");
}

test("D-041: every example in the registry goes through the real parser of its entry", () => {
	for (const entry of REGISTRY) {
		const [limen, ...rest] = words(entry.example);
		assert.equal(limen, "limen", entry.name);
		const length = entry.name.split(" ").length;
		assert.equal(rest.slice(0, length).join(" "), entry.name, entry.example);
		assert.doesNotThrow(() => parse(entry, rest.slice(length)), entry.example);
	}
});

test("T-19: every group a public entry belongs to has a header, and every module a summary for its line", () => {
	const objects = new Set(REGISTRY.filter((entry) => entry.visibility === "public").map((entry) => entry.object));
	const missing = [...objects].filter((object) => {
		const group = GROUPS.find((candidate) => candidate.object === object);
		return !group || !("module" in group ? group.summary : group.header).trim();
	});
	assert.deepEqual(missing, []);
});

test("every removed flag of src/old-names.ts is a removed part of its command's schema", () => {
	const absent = OLD_FLAGS.filter(
		(old) => !byName(old.command)?.schema.some((part) => "removed" in part && part.removed === old.name.slice(2)),
	).map((old) => `${old.command} ${old.name}`);
	assert.deepEqual(absent, []);
});

test("T-25: no file in src/ reads process.argv, and no command handler takes the raw words", async () => {
	const files = await codeBelow(["src"]);
	const found = files
		.filter(({ text }) => text.includes("process.argv") || /export (?:async )?function \w+Command\(args\b/.test(text))
		.map(({ path }) => path);
	assert.ok(files.length > 50, `${files.length} files of src/ found`);
	assert.deepEqual(found, []);
});

test("UNDECLARED_IDS: a handler that returns an ids key its entry does not declare ends with exit code 5", async (t) => {
	const probe: Entry = {
		name: "probe",
		object: "project",
		kind: "read",
		visibility: "public",
		summary: "a probe",
		schema: [],
		ids: [],
		refuses: [],
		example: "limen probe",
		handler: async () => ({ next: null, ids: { job: "2026-11-19-probe-a1b2c3d4" } }),
	};
	const errors: string[] = [];
	t.mock.method(console, "error", (line: unknown) => errors.push(String(line)));
	t.mock.method(console, "log", () => {});
	// No rule timer starts from this in-process run (src/commands/rule.ts, endDueRules); the helper turns test mode on.
	withEnvironment(t, { LIMEN_HERDR: "0" });
	await main(["probe"], process.cwd(), [probe]);
	const code = process.exitCode;
	process.exitCode = 0;
	assert.equal(code, 5);
	const output = { status: 5, stdout: "", stderr: `${errors.join("\n")}\n` };
	assert.deepEqual(readOutcome(output), { class: "internal", code: "UNDECLARED_IDS", next: null });
});

// D-061 (3): a command's text reaches its streams when the command ends, in the order it gave it, and the text it gave
// before it failed is printed with the failure.
test("T-26: the wrapper prints a command's text when the command ends, the text before a failure too", async (t) => {
	const stdout: string[] = [];
	const stderr: string[] = [];
	t.mock.method(console, "log", (line: unknown) => stdout.push(String(line)));
	t.mock.method(console, "error", (line: unknown) => stderr.push(String(line)));
	let printedWhileRunning = -1;
	const probe: Entry = {
		name: "probe",
		object: "project",
		kind: "read",
		visibility: "public",
		summary: "a probe",
		schema: [],
		ids: [],
		refuses: ["PROBE_REFUSED"],
		example: "limen probe",
		handler: async (_values, _cwd, out) => {
			out.line("first");
			out.diagnostic("noted");
			out.line("second");
			printedWhileRunning = stdout.length + stderr.length;
			throw new LimenError({ class: "refused", code: "PROBE_REFUSED", message: "probe refused", next: null });
		},
	};
	// No rule timer starts from this in-process run; the helper turns test mode on.
	withEnvironment(t, { LIMEN_HERDR: "0" });
	await main(["probe"], process.cwd(), [probe]);
	const status = process.exitCode === undefined ? null : Number(process.exitCode);
	process.exitCode = 0;
	const output = { status, stdout: `${stdout.join("\n")}\n`, stderr: `${stderr.join("\n")}\n` };
	assert.deepEqual(
		[printedWhileRunning, stdout, stderr.slice(0, -1), readOutcome(output)],
		[0, ["first", "second"], ["noted", "probe refused"], { class: "refused", code: "PROBE_REFUSED", next: null }],
	);
});

// D-045 (6), D-075: status and show were change commands while they reaped dead jobs; R-032 made the reap the seat
// sweep's alone, so they are reads; `rule` only lists, since `rule set` and `rule end` are entries of their own.
test("D-045: status and show, which no longer reap, and rule, which only lists, are read commands; seat sweep is a change", () => {
	assert.deepEqual(
		Object.fromEntries(["status", "show", "rule", "seat sweep"].map((name) => [name, byName(name)?.kind])),
		{ status: "read", show: "read", rule: "read", "seat sweep": "change" },
	);
});

// D-039, R-032: the ticket that moves a command leaves no entry moved by it.
test("D-039: no registry entry is moved by R-032, which made sweep the seat's seat sweep and moved prune to R-101", () => {
	assert.deepEqual(
		REGISTRY.filter((entry) => entry.movedBy === "R-032").map((entry) => entry.name),
		[],
	);
});

test("the code scan reads a literal, both branches, a constant and a caller's argument, and names an unreadable refusal", () => {
	const text = [
		'const KEPT = "KEPT_CODE";',
		'throw refused("LITERAL", "a");',
		'throw usageError(ok ? "YES" : "NO", "b");',
		'throw new LimenError({ class: "refused", code: KEPT, message: "c", next: null });',
		'const bad = (code: string) => refused(code, "d");',
		'throw bad("PASSED");',
		'throw environmentError("NOT_A_REFUSAL", "e");',
		'throw refused(compute(), "g");',
		'function refused(code: string) { return new LimenError({ class: "refused", code, message: "", next: null }); }',
	].join("\n");
	const { thrown, unreadable } = thrownCodes([{ path: "src/a.ts", text }]);
	assert.deepEqual(
		{ thrown: thrown.map(({ at, code, refusal }) => `${at} ${code} ${refusal}`), unreadable },
		{
			thrown: [
				"src/a.ts:2 LITERAL true",
				"src/a.ts:3 YES true",
				"src/a.ts:3 NO true",
				"src/a.ts:4 KEPT_CODE true",
				"src/a.ts:5 PASSED true",
				"src/a.ts:7 NOT_A_REFUSAL false",
			],
			unreadable: ['src/a.ts:8: refused(compute(), "g")'],
		},
	);
});

test("the code scan names each code of a LimenError whose class is no literal, and only a rewrap of one failure makes none", () => {
	const text = [
		'throw new LimenError({ class: failure.class, code: "MADE_HERE", message: "a", next: null });',
		'throw new LimenError({ class: error.class, code: error.code, message: "b", next: null });',
		'throw new LimenError({ class: failure.class, code: other.code, message: "c", next: null });',
		'throw new LimenError({ class: pick(), code: "PICKED", message: "d", next: null });',
	].join("\n");
	const { thrown, unknownClass, unreadable } = thrownCodes([{ path: "src/d.ts", text }]);
	assert.deepEqual(
		{ thrown, unknownClass: unknownClass.map(({ at, code }) => `${at} ${code}`), unreadable },
		{
			thrown: [],
			unknownClass: ["src/d.ts:1 MADE_HERE", "src/d.ts:4 PICKED"],
			unreadable: ['src/d.ts:3: new LimenError({ class: failure.class, code: other.code, message: "c", next: null })'],
		},
	);
});

test("the unknown-class list holds one entry per site, as its file and code, so a new site of a listed code changes it", () => {
	const site = 'throw new LimenError({ class: failure.class, code: "LISTED", message: "", next: null });';
	const { unknownClass } = thrownCodes([
		{ path: "src/a.ts", text: [site, site].join("\n") },
		{ path: "src/b.ts", text: site },
	]);
	assert.deepEqual(sitesOf(unknownClass), ["src/a.ts LISTED", "src/a.ts LISTED", "src/b.ts LISTED"]);
});

test("the code scan reads a parameter named like a constant of its file from the function's callers, as the language's scopes do", () => {
	const text = [
		'const code = "FILE_WIDE";',
		'function bad(code: string) { return refused(code, "a"); }',
		'throw bad("PASSED_IN");',
		'throw refused(code, "b");',
		'words.forEach((code) => refused(code, "c"));',
	].join("\n");
	const { thrown, unreadable } = thrownCodes([{ path: "src/c.ts", text }]);
	assert.deepEqual(
		{ thrown: thrown.map(({ at, code }) => `${at} ${code}`), unreadable },
		{ thrown: ["src/c.ts:2 PASSED_IN", "src/c.ts:4 FILE_WIDE"], unreadable: ['src/c.ts:5: refused(code, "c")'] },
	);
});

test("the code scan reads a code destructured from a call of the file's own function from that property's literals there, and no other", () => {
	const text = [
		'function problemOf(word: string) { return word ? { code: "FIRST", problem: "" } : { code: "SECOND", problem: "" }; }',
		'const elsewhere = { code: "ELSEWHERE" };',
		"const { code } = problemOf(word);",
		'throw new LimenError({ class: word ? "usage" : "refused", code, message: "", next: null });',
		'function fromOutside() { const { code } = imported(word); throw refused(code, "a"); }',
	].join("\n");
	const { thrown, unreadable } = thrownCodes([{ path: "src/b.ts", text }]);
	assert.deepEqual(
		{ thrown: thrown.map(({ at, code, refusal }) => `${at} ${code} ${refusal}`), unreadable },
		{
			thrown: ["src/b.ts:4 FIRST true", "src/b.ts:4 SECOND true"],
			unreadable: ['src/b.ts:5: refused(code, "a")'],
		},
	);
});

test("the code scan reads a name from its innermost declaration, so each function's local constant gives its own code", () => {
	const text = [
		'function one() { const code = "FIRST_LOCAL"; throw refused(code, "a"); }',
		'function two() { const code = "SECOND_LOCAL"; throw refused(code, "b"); }',
	].join("\n");
	assert.deepEqual(
		thrownCodes([{ path: "src/e.ts", text }]).thrown.map(({ at, code }) => `${at} ${code}`),
		["src/e.ts:1 FIRST_LOCAL", "src/e.ts:2 SECOND_LOCAL"],
	);
});

test("the code scan names as unreadable a name bound otherwise than as a string constant, even where the file gives a code property literals", () => {
	const computed = [
		'const problem = { code: "A_PROPERTY", message: "" };',
		'function computed(word: string) { const code = lookup(word); throw refused(code, "a"); }',
	].join("\n");
	const other = [
		'const problem = { changing: "A_PROPERTY", imported: "A_PROPERTY" };',
		'function changing() { let changing = "NOT_CONSTANT"; throw refused(changing, "b"); }',
		'import { code as imported } from "./other.ts";',
		'throw refused(imported, "c");',
	].join("\n");
	assert.deepEqual(
		thrownCodes([
			{ path: "src/f.ts", text: computed },
			{ path: "src/g.ts", text: other },
		]),
		{
			thrown: [],
			unknownClass: [],
			unreadable: [
				'src/f.ts:2: refused(code, "a")',
				'src/g.ts:2: refused(changing, "b")',
				'src/g.ts:4: refused(imported, "c")',
			],
		},
	);
});

test("the declaration check names an undeclared refusal, a stale or no-refusal code, a shared code made nowhere or declared again, and a code declared twice", () => {
	const thrown: Thrown[] = [
		{ at: "src/a.ts:1", code: "DECLARED", refusal: true },
		{ at: "src/a.ts:2", code: "UNDECLARED", refusal: true },
		{ at: "src/a.ts:3", code: "SHARED", refusal: false },
		{ at: "src/a.ts:4", code: "ENVIRONMENT", refusal: false },
	];
	const entries = [
		{ name: "one", refuses: ["DECLARED", "STALE", "ENVIRONMENT"] },
		{ name: "two", refuses: ["DECLARED", "SHARED", "DECLARED"] },
	];
	assert.deepEqual(declarationProblems(thrown, entries, ["SHARED", "GONE"]), [
		"UNDECLARED is undeclared: src/a.ts:2",
		"one declares ENVIRONMENT, which no refusal or usage error of the code carries",
		"one declares STALE, which no refusal or usage error of the code carries",
		"the shared GONE is made nowhere",
		"two declares DECLARED twice",
		"two declares SHARED, which no refusal or usage error of the code carries",
		"two declares the shared SHARED again",
	]);
});

test("the test reader holds a test to comparing the snapshot when it takes it twice, itself or through the file's functions, and names one that takes it once", () => {
	const text = [
		'import { snapshot } from "../snapshot.ts";',
		"function quiet(root: string) { return snapshot(root); }",
		"const viaQuiet = (root: string) => quiet(root);",
		"function twice(root: string) { const before = snapshot(root); act(); return [before, snapshot(root)]; }",
		'test("A_CODE: compares the snapshots itself", () => { const before = snapshot(root); same(snapshot(root), before); });',
		'test("B_CODE: compares them through two helpers", async () => { const before = viaQuiet(root); same(viaQuiet(root), before); });',
		'test("E_CODE: compares them through a function that takes it twice", () => { twice(root); });',
		'test("F_CODE: takes the snapshot once", () => { snapshot(root); });',
		'test("G_CODE: takes it once through a function of its own body", () => { const take = () => snapshot(root); take(); });',
		`test(\`C_CODE: \${kind} takes none\`, () => { other(); });`,
	].join("\n");
	const alone = 'test("D_CODE: calls a snapshot its file does not import", () => { snapshot(root); snapshot(root); });';
	const cases = testCases([
		{ path: "test/a.test.ts", text },
		{ path: "test/b.test.ts", text: alone },
	]);
	const entries: readonly Kinded[] = [
		{ name: "change", kind: "change", refuses: ["A_CODE", "B_CODE", "C_CODE", "D_CODE", "E_CODE", "F_CODE", "G_CODE"] },
	];
	assert.deepEqual(codeTestsWithoutSnapshot(entries, [], cases), [
		`test/a.test.ts: C_CODE: \${kind} takes none`,
		"test/a.test.ts: F_CODE: takes the snapshot once",
		"test/a.test.ts: G_CODE: takes it once through a function of its own body",
		"test/b.test.ts: D_CODE: calls a snapshot its file does not import",
	]);
});

/**
 * The tests of the readers below: three codes, a shared code, a read command's code, a longer code, a code named
 * later, and three command names.
 */
const CASES: readonly Case[] = [
	{ file: "test/a.test.ts", name: "A_CODE: refuses and compares the snapshots", snapshots: 2 },
	{ file: "test/a.test.ts", name: "B_CODE: refuses and compares nothing", snapshots: 0 },
	{ file: "test/a.test.ts", name: "O_CODE: refuses and takes the snapshot once", snapshots: 1 },
	{ file: "test/a.test.ts", name: "S_CODE: a shared code's refusal compares nothing", snapshots: 0 },
	{ file: "test/a.test.ts", name: "R_CODE: a read command's refusal compares nothing", snapshots: 0 },
	{ file: "test/a.test.ts", name: "C_CODEX: names a longer code", snapshots: 0 },
	{ file: "test/a.test.ts", name: "a test that names C_CODE: later", snapshots: 2 },
	{ file: "test/b.test.ts", name: "limen group status: shows the round", snapshots: 0 },
	{ file: "test/b.test.ts", name: "limen status shows the jobs", snapshots: 0 },
];

test("the CODE test reader names a code whose name only a longer code or a later word holds", () => {
	assert.deepEqual(codesWithoutTest(["A_CODE", "B_CODE", "C_CODE"], CASES), ["C_CODE"]);
});

test("the snapshot reader names each CODE test of a change command's own or a shared code that compares no snapshots, and no other", () => {
	const entries: readonly Kinded[] = [
		{ name: "change", kind: "change", refuses: ["A_CODE", "B_CODE", "C_CODE", "O_CODE"] },
		{ name: "read", kind: "read", refuses: ["R_CODE"] },
	];
	assert.deepEqual(codeTestsWithoutSnapshot(entries, ["S_CODE"], CASES), [
		"test/a.test.ts: B_CODE: refuses and compares nothing",
		"test/a.test.ts: O_CODE: refuses and takes the snapshot once",
		"test/a.test.ts: S_CODE: a shared code's refusal compares nothing",
	]);
});

test("the success reader names a command whose name starts only a longer command's test or lacks the colon", () => {
	assert.deepEqual(commandsWithoutSuccessTest(["group status", "group", "status"], CASES), ["group", "status"]);
});

/** The refusal and usage codes of src/ and hook/, and the names of every test file. */
async function coverage(): Promise<{ readonly thrown: ReturnType<typeof thrownCodes>; readonly cases: Case[] }> {
	const [code, tests] = await Promise.all([codeBelow(["src", "hook"]), codeBelow(["test"], /\.test\.ts$/)]);
	return { thrown: thrownCodes(code), cases: testCases(tests) };
}

/**
 * The sites of a `new LimenError` whose class is no literal and that is no rewrap of one failure, one entry per site as
 * its file and code, each with why its class is never a refusal or usage error. The declaration scan cannot read that
 * class, so a new such site, even one with a listed code, fails the test below until it is listed here with its reason
 * or its class is written as a literal.
 */
const UNKNOWN_CLASS: readonly { readonly file: string; readonly code: string; readonly why: string }[] = [
	{
		file: "src/job/group-control.ts",
		code: "GROUP_PARTIAL_START",
		why: "its class is that of the team's failed start after stepFailure (src/operation.ts), which makes a refusal there REFUSED_AFTER_VALIDATE",
	},
	{
		file: "src/job/group-control.ts",
		code: "GROUP_STOP_INCOMPLETE",
		why: "its class is that of a member's failed stop: environment for a running member with no pid, else the class after stepFailure (src/operation.ts), which makes a refusal there REFUSED_AFTER_VALIDATE",
	},
];

test("T-28 (1): every refusal and usage code of src/ and hook/ is declared by an entry or the shared list, and each declared code is thrown", async () => {
	const { thrown } = await coverage();
	assert.ok(thrown.thrown.length > 100, `${thrown.thrown.length} codes found`);
	assert.deepEqual(
		{
			unreadable: thrown.unreadable,
			unknownClass: sitesOf(thrown.unknownClass),
			problems: declarationProblems(thrown.thrown, REGISTRY, SHARED_CODES),
		},
		{ unreadable: [], unknownClass: UNKNOWN_CLASS.map(({ file, code }) => `${file} ${code}`).sort(), problems: [] },
	);
});

/**
 * T-28 (1): the declared codes that no test named `CODE: …` proves yet. The list may only shrink, and R-082 brings it
 * to zero: a code that gets its test leaves it. Six of them are proved inside a test of other mechanisms (a table of
 * spawn's refusals, a group's whole run, the parser's `--help`), which R-082 splits.
 */
const WITHOUT_CODE_TEST: readonly string[] = [
	"BAD_CLAIM",
	"BAD_COMMIT",
	"BAD_DURATION",
	"BAD_EXTENSION",
	"BAD_FEATURE",
	"BAD_GROUP_ID",
	"BAD_LABEL",
	"BAD_PRIORITY",
	"BAD_REPO",
	"BAD_ROLE",
	"BAD_ROOT",
	"BAD_ROUND",
	"BAD_TEAM",
	"BAD_TEAM_EXTENSION",
	"BAD_WORKERS",
	"BRANCH_EXISTS",
	"ENGINE_MISMATCH",
	"ENGINE_UNKNOWN",
	"EXTENSION_GONE",
	"FINAL_NOT_LAST",
	"GITHUB_BINDING",
	"GITHUB_CLAIM_MISMATCH",
	"GITHUB_DISCONNECTED",
	"GITHUB_NOT_COORDINATOR",
	"GITHUB_NO_CLAIM",
	"GITHUB_ORIGIN",
	"GITHUB_PRIVILEGED",
	"GROUP_CLOSED",
	"GROUP_CONTEXT",
	"GROUP_EXTENSIONS",
	"GROUP_LAUNCH_FLAGS",
	"GROUP_LEAD_HOOK",
	"GROUP_NOT_ALLOWED",
	"GROUP_NOT_FOUND",
	"GROUP_NO_ROUTE",
	"GROUP_NO_TIME",
	"GROUP_OTHER_LEAD",
	"GROUP_PACKET_MISSING",
	"GROUP_PACKET_UNCOMMITTED",
	"GROUP_RECORD",
	"GROUP_ROSTER",
	"GROUP_ROUTE",
	"GROUP_RUN_LIVE",
	"GROUP_TEAM_JOB",
	"GROUP_TEAM_UNKNOWN",
	"GROUP_TIMEOUT_SHORT",
	"JOB_NO_BRANCH",
	"JOB_NO_SESSION",
	"JOB_NO_WORKTREE",
	"MERGE_FAILED",
	"NOT_A_PROJECT",
	"NO_COMMIT",
	"NO_GROUP",
	"NO_INSTRUCTION",
	"NO_TASK",
	"NO_TEAM",
	"PICTURE_NO_MAP",
	"PIN_WITHOUT_REVIEW",
	"RECORD_EXTENSIONS",
	"RECORD_GROUP_ID",
	"REPO_OUTSIDE_WORKSPACE",
	"REPO_REQUIRED",
	"REVIEW_WITH_ROLE",
	"ROLE_UNKNOWN",
	"SPAWN_LEAD_ROLE",
	"TICKET_NOT_AT_BASE",
	"TITLE_TWICE",
];

test("T-28 (1): every declared code has a test named CODE: …, except the listed ones, and no listed one has", async () => {
	const { cases } = await coverage();
	const declared = [...SHARED_CODES, ...REGISTRY.flatMap((entry) => entry.refuses)];
	assert.deepEqual(codesWithoutTest(declared, cases), [...WITHOUT_CODE_TEST].sort());
});

/**
 * T-38 → Check: the `CODE: …` tests that do not compare the shared snapshot yet, of a code a `change` entry declares
 * or of a shared code, which every command, a change command too, can end with (`SHARED_CODES`, D-075). The scan
 * knows a test's command only by its code, so a unit test of such a code counts as well. The list may only shrink,
 * and R-082 brings it to zero.
 */
const WITHOUT_SNAPSHOT: readonly string[] = [
	"test/cli/continue.test.ts: BAD_ARGUMENT: continue with --label given twice exits 2, as every value flag given twice does",
	"test/cli/group.test.ts: BAD_ARGUMENT: group start without --team exits 2, names the missing flag and shows the usage line",
	"test/cli/group.test.ts: GROUP_WAIT_MEMBERS_ONLY: a group wait outside a team that gives no group id names group status without one",
	"test/cli/group.test.ts: GROUP_WAIT_MEMBERS_ONLY: the lead's group wait exits 1, says the lead gets the result once and names group status",
	"test/cli/land.test.ts: JOB_NOT_EXACT: land with a job's label exits 2, names the command with the token in next and leaves the record byte-identical",
	"test/cli/old-names.test.ts: REMOVED: a form of limen jobs with a flag names limen status --all, a ref alone names limen show <ref>, and each next is a command main runs",
	"test/cli/old-names.test.ts: REMOVED: every removed command and subcommand on the command line exits 2 and names what replaced it",
	"test/cli/old-names.test.ts: REMOVED: every removed engine value of spawn --engine exits 2 and names what replaced it",
	"test/cli/old-names.test.ts: REMOVED: every removed flag on the command line exits 2 and names what replaced it",
	"test/cli/old-names.test.ts: REMOVED: every removed role of spawn --role exits 2 and names what replaced it",
	"test/cli/old-names.test.ts: REMOVED: group status with a group id and the removed --json names group status with that id",
	"test/cli/old-names.test.ts: REMOVED: limen jobs <ref> names limen show <ref>, and every other form of limen jobs names limen status --all",
	"test/cli/old-names.test.ts: REMOVED: limen queue exits 2, says it was renamed and names limen seat queue",
	"test/cli/old-names.test.ts: REMOVED: the shared parser reads the words of limen jobs, so limen jobs -- a1b2c3d4 names limen show a1b2c3d4",
	"test/cli/ticket.test.ts: LOCK_TIMEOUT: ticket new exits 3 and writes no ticket while the ticket-number lock is held, then takes the next number",
	"test/help.test.ts: BAD_ARGUMENT: limen <group> alone exits 2 with the group's lines and limen <group> --help in next",
	"test/job/reference.test.ts: JOB_NOT_EXACT: a label, a label prefix and a shorter suffix exit 2 with the candidates and the command with the token in next",
	"test/job/reference.test.ts: JOB_NOT_FOUND: a well-formed id or token that names no job exits 2 with limen status --all",
	"test/job/reference.test.ts: JOB_OTHER_TEAM: a group member controls only its own team's jobs and gets the read command in next",
	"test/job/reference.test.ts: JOB_TOKEN_SHARED: a token two ids share names neither job, and each still resolves by its full id",
	"test/lock.test.ts: LOCK_TIMEOUT: a wait on a live owner ends after its bound as a transient error that names the lock and its owner",
	"test/lock.test.ts: LOCK_TIMEOUT: a wait on an owner file of an older Limen names the file to remove by hand",
	"test/operation.test.ts: REFUSED_AFTER_VALIDATE: a refusal that apply throws is an internal error, never exit code 1",
	"test/operation.test.ts: STATE_CHANGED: a held fact another process changed after validate ends the apply with exit code 3, before it writes",
	"test/operation.test.ts: STATE_CHANGED: a held fact that refuses when it is read again ends the apply before it writes",
	"test/operation.test.ts: STATE_CHANGED: one that apply throws with no next names the operation's own command line in next",
	"test/operation.test.ts: STEP_FAILED: an untyped failure of apply, as git or the file system gives one, is an environment failure",
	"test/outcome.test.ts: BAD_ARGUMENT: spawn with an unknown flag exits 2 before it writes anything",
	"test/outcome.test.ts: JOB_NOT_FOUND: show of a well-formed id that names no job exits 2 with limen status --all in next",
	"test/outcome.test.ts: UNKNOWN_COMMAND: an unknown command exits 2 with its code in the last line of stderr",
	"test/outcome.test.ts: UNTYPED: a refusal that carries no type of its own exits 1 with code UNTYPED",
	`test/parser.test.ts: BAD_ARGUMENT: \${kind} exits 2 with the usage line in the message and limen land --help in next`,
	"test/parser.test.ts: BAD_ARGUMENT: a spawn without --model and --thinking exits 2 and names both missing flags",
	"test/parser.test.ts: BAD_ARGUMENT: the parser error of an unknown flag is exactly two lines and the final line on stderr",
	"test/parser.test.ts: REMOVED: a removed flag in the schema refuses as a flag and reads as a value after a flag that takes one",
];

test("T-38: every CODE test of a change command's own or a shared code compares the shared snapshot, except the listed ones, and no listed one does", async () => {
	const { cases } = await coverage();
	assert.deepEqual(codeTestsWithoutSnapshot(REGISTRY, SHARED_CODES, cases), [...WITHOUT_SNAPSHOT].sort());
});

/**
 * D-076: the registry commands that no test named `limen <command words>: …` proves on success yet; for a read
 * command that test is its golden test of the whole output. The list may only shrink, and R-083 brings it to zero.
 */
const WITHOUT_SUCCESS_TEST: readonly string[] = [
	"board",
	"close",
	"diff",
	"github connect",
	"github deliver",
	"github disconnect",
	"github doctor",
	"github ensure",
	"github poll",
	"github status",
	"group advance",
	"group close",
	"group publish",
	"group stop",
	"open",
	"picture serve",
	"rule",
	"rule end",
	"rule set",
	"rule timer",
	"seat queue",
	"show",
	"steer",
	"stop",
	"ticket check",
	"unwatch",
	"workspace init",
];

test("T-28: every registry command has a success test named limen <command words>: …, except the listed ones, and no listed one has", async () => {
	const { cases } = await coverage();
	const names = REGISTRY.map((entry) => entry.name);
	assert.deepEqual(commandsWithoutSuccessTest(names, cases), [...WITHOUT_SUCCESS_TEST].sort());
});

/** The read commands the test below cannot run, each with why; every other read command of the registry runs there. */
const READS_NOT_RUN: Readonly<Record<string, string>> = {
	open: "it opens the job's log tab in Herdr, which a test project does not run (LIMEN_HERDR=0)",
	"picture serve": "it serves the activity until it is stopped, so it never ends for the snapshot after it",
};
/**
 * The read commands that refuse on the test project below, each with its code and why it refuses there; every other
 * read command that runs there exits 0, so any other end, a crash included, fails the test.
 */
const READ_REFUSALS: Readonly<Record<string, { readonly code: string; readonly why: string }>> = {
	"github doctor": {
		code: "UNTYPED",
		why: "a test project is no seat: the stub of `id` gives the poller no uid, a failed check of the seat on every machine, and doctor refuses on its failed checks (untyped until R-082)",
	},
	"github ensure": {
		code: "UNTYPED",
		why: "the project is bound to no GitHub repository, so it has no registered coordinator (untyped until R-082)",
	},
};
/**
 * The account's tools on the test project's PATH: in no group with sudo and with no sudo of its own, so `github
 * ensure` passes its privilege check and reads the project's binding on an account that is not root; under uid 0
 * `assertUnprivileged` refuses before it runs `id`, so the stubs cannot hold there.
 */
const UNPRIVILEGED = { id: "#!/bin/sh\necho staff\n", sudo: "#!/bin/sh\nexit 1\n" };
/**
 * The jobs of the test below: the finished one by its token, its branch and the root of its project, and a running
 * one whose wrapper is dead by its token.
 */
type Jobs = { readonly token: string; readonly branch: string; readonly root: string; readonly dead: string };
/** The words after its name that each read command takes on the test project; a command not named takes none. */
const READ_ARGUMENTS: Readonly<Record<string, (jobs: Jobs) => readonly string[]>> = {
	diff: (jobs) => [jobs.token],
	show: (jobs) => [jobs.dead],
	"ticket check": (jobs) => [jobs.branch],
	"github ensure": (jobs) => [jobs.root],
};
/** The seat's folder of a test project, beside its root (LIMEN_HOME, test/plant.ts), which the snapshot digests too. */
const SEAT = ["../.limen"] as const;
/** A running job whose wrapper is gone: a pid no process holds, under this boot, as a wrapper killed alone leaves
 * it. */
const DEAD_JOB = "2026-11-24-dead-wrapper-5e6f7a8b";

/**
 * A test project with one job that ran, committed and finished, with its transcript, and one running job whose wrapper
 * is dead, which a reap would end, with the start-queue entry it left, on an account with no sudo; removed after the
 * test.
 */
async function readProject(t: TestContext): Promise<{ p: Plant; jobs: Jobs }> {
	const p = await plant();
	t.after(() => p.cleanup());
	for (const [name, text] of Object.entries(UNPRIVILEGED)) {
		await writeFile(join(p.bin, name), text, { mode: 0o755 });
	}
	const id = spawnJob(p, "commit");
	assert.equal(waitJob(p, id), "done");
	const record = jobRecord(p, id);
	assert.ok(record?.branch, `job ${id} has a branch`);
	const session = readdirSync(join(jobDir(p, id), "session"));
	assert.ok(
		session.some((name) => name.endsWith(".jsonl")),
		`job ${id} has a transcript: ${session.join(", ")}`,
	);
	const identity = { pid: 2_147_483_646, born: "1", bootId: platform.bootId() ?? null };
	const startedAt = new Date().toISOString();
	await writeRecord(jobDir(p, DEAD_JOB), {
		state: "running",
		label: "dead",
		branch: "limen/dead",
		identity,
		startedAt,
	});
	await writeFile(join(jobDir(p, DEAD_JOB), "task.md"), "block\n");
	await writeFile(join(jobDir(p, DEAD_JOB), "log"), "");
	// Its entry of the start queue, which its dead wrapper left; `seat queue` lists it as dead and leaves it there.
	const entries = join(p.parent, ".limen", "start-queue", "entries");
	await mkdir(entries, { recursive: true });
	const entry = {
		id: DEAD_JOB,
		jobDir: jobDir(p, DEAD_JOB),
		label: "dead",
		priority: 2,
		queuedAt: 1,
		pid: identity.pid,
	};
	await writeFile(join(entries, `${DEAD_JOB}.json`), `${JSON.stringify(entry)}\n`);
	const jobs = { token: tokenOf(id) ?? id, branch: record.branch, root: p.root, dead: tokenOf(DEAD_JOB) ?? DEAD_JOB };
	return { p, jobs };
}

/** Runs `work` with the folders `folders` and all below them read-only, and gives their write right back after it. */
async function readOnly<T>(folders: readonly string[], work: () => T): Promise<T> {
	execFileSync("chmod", ["-R", "a-w", ...folders]);
	try {
		return work();
	} finally {
		execFileSync("chmod", ["-R", "u+w", ...folders]);
	}
}

// D-045 (6.3), T-04: a read run on a project leaves its files, `.limen/` and the seat as they were, and needs no write
// right there; status and show are reads since R-032, and a dead job is left to the seat sweep.
test("T-04: every read command of the registry, run on a read-only .limen/ with a dead running job, leaves the project and the seat unchanged", async (t) => {
	const { p, jobs } = await readProject(t);
	const reads = REGISTRY.filter((entry) => entry.kind === "read").map((entry) => entry.name);
	const runs = reads.filter((read) => !Object.hasOwn(READS_NOT_RUN, read));
	assert.deepEqual(
		[
			...Object.keys(READS_NOT_RUN).filter((name) => !reads.includes(name)),
			...Object.keys(READ_REFUSALS).filter((name) => !runs.includes(name)),
			...["status", "show"].filter((name) => !runs.includes(name)),
		],
		[],
		"an exception names a read command that the test runs or names as not run, or status or show is no read",
	);
	const wrong: string[] = [];
	await readOnly([join(p.root, ".limen"), join(p.parent, ".limen")], () => {
		for (const name of runs) {
			const before = snapshot(p.root, SEAT);
			const run = limen(p, [...name.split(" "), ...(READ_ARGUMENTS[name]?.(jobs) ?? [])], {
				env: { LIMEN_REAP_CONFIRM_MS: "1" },
			});
			const code = READ_REFUSALS[name]?.code ?? null;
			if (run.status !== (code === null ? 0 : 1) || readOutcome(run).code !== code) {
				wrong.push(`${name} exited ${run.status}, not as ${code ?? "a success"}: ${run.stderr.trim()}`);
			}
			if (!isDeepStrictEqual(snapshot(p.root, SEAT), before)) {
				wrong.push(`${name} changed the project or the seat`);
			}
		}
	});
	assert.deepEqual([wrong, jobRecord(p, DEAD_JOB)?.state], [[], "running"]);
});
