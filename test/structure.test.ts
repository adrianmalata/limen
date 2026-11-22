import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { createHash } from "node:crypto";
import { mkdir, mkdtemp, readdir, readFile, realpath, rename, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { basename, dirname, join, posix, relative } from "node:path";
import test, { type TestContext } from "node:test";
import ts from "typescript";
import { throughRunner } from "../src/operation.ts";
import { templateHistoryText } from "../src/project/inherit.ts";
import { REGISTRY } from "../src/registry.ts";
import { importsOf } from "./imports.ts";
import { knownFiles, knownFilesBelow } from "./known-files.ts";

// The fixture's git and the listing of the repository must not depend on the laptop's own git configuration.
process.env.GIT_CONFIG_GLOBAL = "/dev/null";
process.env.GIT_CONFIG_NOSYSTEM = "1";

const root = new URL("..", import.meta.url).pathname;

/** The basename of every TypeScript file of the repository at `repo`. */
async function typeScriptNames(repo: string): Promise<string[]> {
	return (await knownFiles(repo)).filter((path) => path.endsWith(".ts")).map((path) => basename(path));
}

test("runtime remains dependency-free and TypeScript basenames stay unambiguous", async () => {
	const pkg = JSON.parse(await readFile(join(root, "package.json"), "utf8")) as {
		dependencies?: Record<string, string>;
	};
	assert.deepEqual(pkg.dependencies, {});
	const names = await typeScriptNames(root);
	assert.equal(new Set(names).size, names.length, "TypeScript basenames must be unique");
});

/** A new git repository in the OS temporary folder, removed after the test, with `files` written into it. */
async function fixtureRepo(t: TestContext, files: readonly string[]): Promise<string> {
	const repo = await realpath(await mkdtemp(join(tmpdir(), "limen-structure-")));
	t.after(() => rm(repo, { recursive: true, force: true }));
	execFileSync("git", ["init", "-q"], { cwd: repo });
	for (const path of files) {
		await mkdir(dirname(join(repo, path)), { recursive: true });
		await writeFile(join(repo, path), "export {};\n");
	}
	return repo;
}

test("an ignored TypeScript file whose basename repeats a tracked one is not counted by the basename check", async (t) => {
	const repo = await fixtureRepo(t, ["tracked/name.ts", "untracked/other.ts", "vendor/name.ts"]);
	await writeFile(join(repo, ".gitignore"), "vendor/\n");
	execFileSync("git", ["add", ".gitignore", "tracked/name.ts"], { cwd: repo });
	assert.deepEqual((await typeScriptNames(repo)).sort(), ["name.ts", "other.ts"]);
});

test("a tracked TypeScript file deleted from the working tree and an untracked one of the same basename count once", async (t) => {
	const repo = await fixtureRepo(t, ["old/name.ts"]);
	execFileSync("git", ["add", "old/name.ts"], { cwd: repo });
	// A plain `mv` leaves the old path in the index and the new one untracked.
	await mkdir(join(repo, "new"));
	await rename(join(repo, "old", "name.ts"), join(repo, "new", "name.ts"));
	assert.deepEqual(await typeScriptNames(repo), ["name.ts"]);
});

/** The files git knows below each of `folders` of the repository at `repo` (D-032, D-075). */
function filesIn(folders: readonly string[], repo = root): Promise<string[]> {
	return knownFilesBelow(repo, folders);
}

test("the walks of the scans read no file git ignores, such as an editor's swap file in a scanned folder", async (t) => {
	const repo = await fixtureRepo(t, ["seat/tool.ts", "seat/.tool.ts.swp", "src/a.ts", "src/.a.ts.swp", "docs/b.ts"]);
	await writeFile(join(repo, ".gitignore"), ".*.swp\n");
	execFileSync("git", ["add", ".gitignore", "seat/tool.ts"], { cwd: repo });
	assert.deepEqual((await filesIn(["seat", "src", "bin"], repo)).map((path) => relative(repo, path)).sort(), [
		"seat/tool.ts",
		"src/a.ts",
	]);
});

test("D-010: no file in seat/ or bin/ is a shell script ending in .sh", async () => {
	const scripts = (await filesIn(["seat", "bin"])).filter((path) => path.endsWith(".sh"));
	assert.deepEqual(scripts, [], `shell scripts: ${scripts.map((path) => relative(root, path)).join(", ")}`);
});

// Gate 2 §7 D3 (audit.md): with static imports only, a process loads all of its code when it starts, so one process
// runs one version of the code. A job's finalize path can start a new `bin/limen` (`src/job/record.ts:53`,
// `src/job/group-cabinet.ts:306-307`), which loads what `/opt/limen` holds then, so the guard against a job that runs
// across a deployment is the running-job refusal of `seat/deploy.ts`, not this scan. `bin/limen` imports `src/main.ts`
// dynamically before any job code runs, and is outside the scan.
test("no TypeScript file in src/ or hook/ loads a module with a dynamic import", async () => {
	const dynamic: string[] = [];
	for (const path of (await filesIn(["src", "hook"])).filter((file) => file.endsWith(".ts"))) {
		if (/\bimport\s*\(/.test(await readFile(path, "utf8"))) {
			dynamic.push(relative(root, path));
		}
	}
	assert.deepEqual(dynamic, []);
});

/** The text of each file below `folders` that git knows and the working tree holds, by its path from the root. */
async function knownSources(
	folders: readonly string[],
	repo = root,
): Promise<ReadonlyArray<{ path: string; text: string }>> {
	const paths = await filesIn(folders, repo);
	return Promise.all(paths.map(async (path) => ({ path: relative(repo, path), text: await readFile(path, "utf8") })));
}

/** How often `literal` occurs in the text of every file below `folders`, and in the file `only`. */
async function occurrences(folders: readonly string[], literal: string, only: string): Promise<[number, number]> {
	let all = 0;
	let inOnly = 0;
	for (const { path, text } of await knownSources(folders)) {
		const found = text.split(literal).length - 1;
		all += found;
		inOnly += path === only ? found : 0;
	}
	return [all, inOnly];
}

// D-028: a command that sets the exit code and returns would print the success line, and a timer that ends the
// process skips it, so only the wrapper (`main`) and the entry point decide the exit code, within T-02's classes.
test("T-02: process.exitCode and process.exit appear in src/, hook/ and bin/ only in src/main.ts and bin/limen, with literal codes 0-5", async () => {
	const elsewhere: string[] = [];
	const outside: string[] = [];
	for (const { path, text } of await knownSources(["src", "hook", "bin"])) {
		if (text.includes("process.exit") && path !== "src/main.ts" && path !== "bin/limen") {
			elsewhere.push(path);
		}
		for (const match of text.matchAll(/process\.exit(?:Code\s*=\s*|\(\s*)(\d+)/g)) {
			if (Number(match[1]) > 5) {
				outside.push(`${path}: ${match[0]}`);
			}
		}
	}
	assert.deepEqual({ elsewhere, outside }, { elsewhere: [], outside: [] });
});

// T-25: one module writes the final line, so its shape cannot drift between commands; the scan finds a writer
// elsewhere by the start of the object it serialises.
test("T-26 (4): only src/outcome.ts builds the final line in src/, hook/ and bin/", async () => {
	const builders = (await knownSources(["src", "hook", "bin"]))
		.filter(({ path, text }) => path !== "src/outcome.ts" && /JSON\.stringify\(\{ ?class/.test(text))
		.map(({ path }) => path);
	assert.deepEqual(builders, []);
});

// T-01 → Why: the author's side channels swallow their errors. A ratchet until R-082 brings both counts to zero: the
// counts at R-013's parent commit, which a change may only lower; R-026 lowered `.catch(() => {})` to its own count, 19,
// when the starts of the group's next round and of a rule's timer stopped swallowing a failure.
const SWALLOWED = { "catch {": 81, ".catch(() => {})": 19 } as const;
test("T-01: the catch-all sites in src/ and hook/ stay at most their baseline count, and src/outcome.ts has none", async () => {
	for (const [literal, most] of Object.entries(SWALLOWED)) {
		const [all, inOutcome] = await occurrences(["src", "hook"], literal, "src/outcome.ts");
		assert.ok(all <= most, `${all} sites of ${literal}, at most ${most}`);
		assert.equal(inOutcome, 0, `src/outcome.ts holds ${literal}`);
	}
});

// The author's untyped refusals, which `failureOf` maps to UNTYPED (exit code 1) until R-082 types them. The count
// measured at R-092, which typed the refusals on the paths of the nine change commands it moved onto the runner of
// src/operation.ts and git's failures; a change may only lower it.
const UNTYPED_THROWS = 106;
test("T-01: the untyped throw new Error( sites in src/ and hook/ stay at most their baseline count, less the typed ones", async () => {
	const [all] = await occurrences(["src", "hook"], "throw new Error(", "src/outcome.ts");
	assert.ok(all <= UNTYPED_THROWS, `${all} sites of throw new Error(, at most ${UNTYPED_THROWS}`);
});

/**
 * T-38's ratchet: the change commands without `movedBy` whose handler does not go through the runner of
 * src/operation.ts yet. The list may only shrink; R-082 brings it to zero, and a ticket that rewrites one of these
 * commands moves it onto the runner (D-070 (2)). `status` and `show` are change commands only while they reap dead jobs
 * (D-045 (6.2)), so they leave it when R-032 makes them read commands again.
 */
const OUTSIDE_RUNNER = [
	"board",
	"github connect",
	"github deliver",
	"github disconnect",
	"github poll",
	"github resolve",
	"group advance",
	"group close",
	"group publish",
	"group status",
	"init",
	"land",
	"migrate",
	"show",
	"status",
	"steer",
	"ticket new",
	"unwatch",
	"watch",
	"workspace init",
];
// The mark is read from the code: a handler goes through the runner when `operationHandler` made it, and that handler
// fails any run that returns without reaching the runner. Commands with `movedBy` are exempt (D-061).
test("T-38: every change command without movedBy goes through the runner, except the listed ones, and no listed one does", () => {
	const outside = REGISTRY.filter(
		(entry) => entry.kind === "change" && entry.movedBy === undefined && !throughRunner(entry.handler),
	).map((entry) => entry.name);
	assert.deepEqual(outside.sort(), [...OUTSIDE_RUNNER].sort());
});

/** The folders whose code runs as Limen. */
const RUNTIME = ["src", "hook", "bin", "seat"] as const;

// T-27 (2): data from outside becomes a typed value only in src/boundary.ts. A ratchet until R-082 brings the count to
// zero: the 41 sites at R-015's commit, the parent of R-016, less the 3 that R-016 moved into src/boundary.ts (the
// readers of src/outcome.ts, src/project/limits.ts and `startGate` in src/runtime/start-queue.ts), less the 4 sites of
// job files that R-021 moved into the record's validators (src/job/record.ts), less the transcript reader that R-024
// moved onto the validators (src/job/usage.ts).
const JSON_PARSE = 41 - 3 - 4 - 1;
test("T-27: JSON.parse appears in src/, hook/, bin/ and seat/ outside src/boundary.ts at most its baseline count", async () => {
	let all = 0;
	for (const { path, text } of await knownSources(RUNTIME)) {
		all += path === "src/boundary.ts" ? 0 : text.split("JSON.parse").length - 1;
	}
	assert.ok(all <= JSON_PARSE, `${all} sites of JSON.parse outside src/boundary.ts, at most ${JSON_PARSE}`);
});

/** A type assertion in a file: where it is, its text, and whether it is `as unknown as`. */
type Cast = { readonly path: string; readonly line: number; readonly text: string; readonly unknownAs: boolean };

/** `value as unknown as T`: an `as` whose operand, inside any parentheses, is an `as unknown`. */
function isUnknownAs(cast: ts.AsExpression | ts.TypeAssertion): boolean {
	let operand = cast.expression;
	while (ts.isParenthesizedExpression(operand)) {
		operand = operand.expression;
	}
	return ts.isAsExpression(cast) && ts.isAsExpression(operand) && operand.type.kind === ts.SyntaxKind.UnknownKeyword;
}

/** Every cast of the TypeScript `text` at `path`: each `as` whose type is not `const`, and each `<T>value`. */
function castsIn(path: string, text: string): Cast[] {
	const source = ts.createSourceFile(path, text, ts.ScriptTarget.Latest, true, ts.ScriptKind.TS);
	const casts: Cast[] = [];
	const visit = (node: ts.Node): void => {
		if ((ts.isAsExpression(node) && !ts.isConstTypeReference(node.type)) || ts.isTypeAssertionExpression(node)) {
			const line = source.getLineAndCharacterOfPosition(node.getStart(source)).line + 1;
			casts.push({ path, line, text: node.getText(source), unknownAs: isUnknownAs(node) });
		}
		ts.forEachChild(node, visit);
	};
	visit(source);
	return casts;
}

/**
 * Casts the scan does not count (T-27 (2)): each entry names its file, the cast's text as written and the reason no
 * validator or type guard serves there. Empty: every cast in the code is debt under the ratchet below.
 */
const CAST_EXCEPTIONS: ReadonlyArray<{ readonly path: string; readonly cast: string; readonly reason: string }> = [];

/** The casts in the TypeScript files below `folders`. */
async function castsBelow(folders: readonly string[]): Promise<Cast[]> {
	return (await knownSources(folders))
		.filter(({ path }) => path.endsWith(".ts"))
		.flatMap(({ path, text }) => castsIn(path, text));
}

/** The casts a ratchet counts: those outside `CAST_EXCEPTIONS`. */
function counted(casts: readonly Cast[]): Cast[] {
	return casts.filter((cast) => !CAST_EXCEPTIONS.some((entry) => entry.path === cast.path && entry.cast === cast.text));
}

test("the cast scan finds as T, an angle-bracket assertion and as unknown as, and skips as const, import aliases and the word as in text", () => {
	const fixture = [
		'import { readFileSync as read } from "node:fs";',
		"// a comment that reads the value as a number",
		'const said = "the word as in a string";',
		'const fixed = ["a"] as const;',
		"const typed = JSON.parse(said) as number;",
		"const angled = <string>JSON.parse(said);",
		"const forced = said as unknown as number[];",
		"export { read as reader, fixed, typed, angled, forced };",
	].join("\n");
	assert.deepEqual(
		castsIn("fixture.ts", fixture).map(({ line, text, unknownAs }) => [line, text, unknownAs]),
		[
			[5, "JSON.parse(said) as number", false],
			[6, "<string>JSON.parse(said)", false],
			[7, "said as unknown as number[]", true],
			[7, "said as unknown", false],
		],
	);
});

// T-27 (2): only `as const` is free. A ratchet until R-082 brings both counts to zero: the casts this scan finds at
// R-015's commit, the parent of R-016, less the casts R-016 removed: 75 - 0 in src/, hook/, bin/ and seat/ and 7 - 0
// in test/ (R-016 moved no reader that held a cast), then 15 fewer in src/, hook/, bin/ and seat/ once R-021 read the
// job records through the record module's validators, and 4 fewer once R-024 read the job transcripts through
// validators (src/job/usage.ts). Test fixtures use `satisfies`.
const CASTS = { runtime: 75 - 15 - 4, test: 7 } as const;
test("T-27: the casts in src/, hook/, bin/ and seat/ other than as const stay at most their baseline count", async () => {
	const casts = counted(await castsBelow(RUNTIME));
	assert.ok(casts.length <= CASTS.runtime, `${casts.length} casts, at most ${CASTS.runtime}`);
});

test("T-27: the casts in test/ other than as const stay at most their own baseline count", async () => {
	const casts = counted(await castsBelow(["test"]));
	assert.ok(casts.length <= CASTS.test, `${casts.length} casts, at most ${CASTS.test}`);
});

// `as unknown as` is never allowed, so the exception list does not apply to it.
test("T-27: no file in src/, hook/, bin/, seat/ or test/ casts a value as unknown as another type", async () => {
	const forced = (await castsBelow([...RUNTIME, "test"])).filter(({ unknownAs }) => unknownAs);
	assert.deepEqual(
		forced.map(({ path, line, text }) => `${path}:${line}: ${text}`),
		[],
	);
});

/** The name of each function declaration in the TypeScript `text` at `path`, at any depth. */
function functionNames(path: string, text: string): string[] {
	const source = ts.createSourceFile(path, text, ts.ScriptTarget.Latest, true, ts.ScriptKind.TS);
	const names: string[] = [];
	const visit = (node: ts.Node): void => {
		if (ts.isFunctionDeclaration(node) && node.name) {
			names.push(node.name.text);
		}
		ts.forEachChild(node, visit);
	};
	visit(source);
	return names;
}

// T-25: one name, one function, so that a search finds the one it means; the scan covers the two modules R-016 wrote.
test("T-25: the functions of src/boundary.ts and src/outcome.ts have names no other file of src/, hook/, bin/ or seat/ declares", async () => {
	const files = (await knownSources(RUNTIME)).filter(({ path }) => path.endsWith(".ts"));
	const owned = ["src/boundary.ts", "src/outcome.ts"];
	const ours = new Set(
		files.filter(({ path }) => owned.includes(path)).flatMap((file) => functionNames(file.path, file.text)),
	);
	const shared = files
		.filter(({ path }) => !owned.includes(path))
		.flatMap(({ path, text }) =>
			functionNames(path, text)
				.filter((name) => ours.has(name))
				.map((name) => `${path}: ${name}`),
		);
	assert.ok(ours.size > 10, `${ours.size} function names in the two modules`);
	assert.deepEqual(shared, []);
});

/** The folders whose code must write and rename files only through src/atomic-write.ts (T-25 (1), A-022). */
const WRITERS = ["src", "hook", "seat"] as const;
/** The file system functions that write, rename or link a file, or open one to write it. */
const WRITE_PRIMITIVES: ReadonlySet<string> = new Set([
	"writeFile",
	"writeFileSync",
	"rename",
	"renameSync",
	"copyFile",
	"copyFileSync",
	"link",
	"linkSync",
	"createWriteStream",
]);
/** The file system functions that open a file; for writing when their flags say so. */
const OPENS: ReadonlySet<string> = new Set(["open", "openSync"]);
/** Flags that open a file for writing: a string with `w`, `a` or `+`, or an `O_` constant that writes or creates. */
const WRITE_FLAGS = /^["'`][^"'`]*[wa+]|O_(?:WRONLY|RDWR|CREAT|APPEND|TRUNC)\b/;

/** A write the scan sees: where it is, its primitive, the named function it is in, and whether it is an import. */
type WriteSite = {
	readonly line: number;
	readonly primitive: string;
	readonly inside: string;
	readonly imported: boolean;
};

/**
 * Kept uses of primitives: the file, the named function they are in, the primitives it keeps (once per kept call), and
 * the ticket that removes them.
 */
type WriteException = {
	readonly path: string;
	readonly inside: string;
	readonly primitives: readonly string[];
	readonly ticket: string;
	readonly what: string;
};

/** The write sites the scan does not count: the LaunchAgent installer until R-032. */
const WRITE_EXCEPTIONS: readonly WriteException[] = [
	{
		path: "src/project/seat.ts",
		inside: "installSeatSweep",
		primitives: ["writeFileSync"],
		ticket: "R-032",
		what: "the LaunchAgent installer",
	},
];

/** The name of the innermost named function around `node`: a declaration, a method, or a function a `const` holds. */
function enclosingFunction(node: ts.Node): string {
	for (let current = node.parent; current; current = current.parent) {
		if ((ts.isFunctionDeclaration(current) || ts.isMethodDeclaration(current)) && current.name) {
			return current.name.getText();
		}
		const held = ts.isFunctionExpression(current) || ts.isArrowFunction(current);
		if (held && ts.isVariableDeclaration(current.parent) && ts.isIdentifier(current.parent.name)) {
			return current.parent.name.text;
		}
	}
	return "(top level)";
}

/** Whether the flags argument of an open call opens for writing; a name is read through its `const` in the file. */
function opensForWriting(flags: ts.Expression | undefined, constants: ReadonlyMap<string, string>): boolean {
	if (!flags) {
		return false;
	}
	const text = ts.isIdentifier(flags) ? constants.get(flags.text) : flags.getText();
	return text === undefined || WRITE_FLAGS.test(text);
}

/** The name a call calls: `name(…)` or `object.name(…)`. */
function calledName(call: ts.CallExpression): string | undefined {
	const callee = call.expression;
	if (ts.isIdentifier(callee)) {
		return callee.text;
	}
	return ts.isPropertyAccessExpression(callee) ? callee.name.text : undefined;
}

/** The write primitives an import declaration takes by name from `fs` or `fs/promises`, aliases by their own name. */
function importedPrimitives(node: ts.Node): ts.ImportSpecifier[] {
	const fromFs =
		ts.isImportDeclaration(node) && /^["'](?:node:)?fs(?:\/promises)?["']$/.test(node.moduleSpecifier.getText());
	const named = fromFs ? node.importClause?.namedBindings : undefined;
	if (!(named && ts.isNamedImports(named))) {
		return [];
	}
	return named.elements.filter((element) => WRITE_PRIMITIVES.has((element.propertyName ?? element.name).getText()));
}

/** Every import of a write primitive from `fs`, every call of one, and every open for writing, in the code `text`. */
function writeSites(path: string, text: string): WriteSite[] {
	const kind = path.endsWith(".ts") ? ts.ScriptKind.TS : ts.ScriptKind.JS;
	const source = ts.createSourceFile(path, text, ts.ScriptTarget.Latest, true, kind);
	const constants = new Map<string, string>();
	const sites: WriteSite[] = [];
	const at = (node: ts.Node) => source.getLineAndCharacterOfPosition(node.getStart(source)).line + 1;
	const visit = (node: ts.Node): void => {
		if (ts.isVariableDeclaration(node) && ts.isIdentifier(node.name) && node.initializer) {
			constants.set(node.name.text, node.initializer.getText(source));
		}
		for (const element of importedPrimitives(node)) {
			const primitive = (element.propertyName ?? element.name).getText(source);
			sites.push({ line: at(element), primitive, inside: "(import)", imported: true });
		}
		const name = ts.isCallExpression(node) ? calledName(node) : undefined;
		if (ts.isCallExpression(node) && name) {
			const writes = WRITE_PRIMITIVES.has(name) || (OPENS.has(name) && opensForWriting(node.arguments[1], constants));
			if (writes) {
				sites.push({ line: at(node), primitive: name, inside: enclosingFunction(node), imported: false });
			}
		}
		ts.forEachChild(node, visit);
	};
	visit(source);
	return sites;
}

/**
 * The sites of the file `path` that `exceptions` do not keep: an import is kept when an entry of the file keeps its
 * primitive; a call, while its function has calls of that primitive left in the entries, in the order of the file.
 */
function unkept(path: string, sites: readonly WriteSite[], exceptions: readonly WriteException[]): WriteSite[] {
	const entries = exceptions.filter((entry) => entry.path === path);
	const left = new Map<string, number>();
	for (const entry of entries) {
		for (const primitive of entry.primitives) {
			left.set(`${entry.inside} ${primitive}`, (left.get(`${entry.inside} ${primitive}`) ?? 0) + 1);
		}
	}
	return sites.filter((site) => {
		if (site.imported) {
			return !entries.some((entry) => entry.primitives.includes(site.primitive));
		}
		const key = `${site.inside} ${site.primitive}`;
		const count = left.get(key) ?? 0;
		left.set(key, count - 1);
		return count <= 0;
	});
}

/**
 * Each write site outside src/atomic-write.ts and outside `exceptions`, in the files git knows below `WRITERS` of the
 * repository at `repo`, as `<file>:<line>: <primitive>`, with `import ` before the primitive of an import.
 */
async function writeScan(repo: string, exceptions: readonly WriteException[]): Promise<string[]> {
	const findings: string[] = [];
	for (const path of await knownFiles(repo)) {
		const file = relative(repo, path);
		const code = /\.(?:ts|mts|js|mjs)$/.test(file) && WRITERS.some((folder) => file.startsWith(`${folder}/`));
		if (!code || file === "src/atomic-write.ts") {
			continue;
		}
		for (const site of unkept(file, writeSites(file, await readFile(path, "utf8")), exceptions)) {
			findings.push(`${file}:${site.line}: ${site.imported ? "import " : ""}${site.primitive}`);
		}
	}
	return findings;
}

// A-022: a file written in place is left truncated when the disk fills; the copies of the temp-and-rename policy drifted
// apart (eight writers, three with fsync, none of the folder). One module holds the policy, so the scan bans the rest.
test("T-25: outside src/atomic-write.ts no file of src/, hook/ or seat/ imports or calls a write primitive or opens a file for writing, except the listed installer site", async () => {
	assert.deepEqual(await writeScan(root, WRITE_EXCEPTIONS), []);
});

test("the write scan finds named, aliased, namespace and method writes and opens for writing, and skips the module, a kept call, reads, text, an ignored file and other folders", async (t) => {
	const repo = await realpath(await mkdtemp(join(tmpdir(), "limen-write-scan-")));
	t.after(() => rm(repo, { recursive: true, force: true }));
	execFileSync("git", ["init", "-q"], { cwd: repo });
	const files = {
		".gitignore": "src/ignored.ts\n",
		"src/atomic-write.ts":
			'import { rename, writeFile } from "node:fs/promises";\nawait writeFile(a, b);\nawait rename(a, b);\n',
		"src/named.ts":
			'import { writeFile as put } from "node:fs/promises";\nawait put(path, "x");\nawait handle.writeFile("x");\n',
		"hook/namespace.ts": 'import * as fs from "node:fs";\n\nfs.renameSync(from, to);\nfs.copyFileSync(a, b);\n',
		"seat/opened.ts": [
			'import { constants, open, openSync } from "node:fs";',
			"const flags = constants.O_RDONLY | constants.O_NOFOLLOW;",
			'open(path, "r");',
			"open(path, flags);",
			"open(path);",
			'open(path, "wx");',
			"openSync(path, constants.O_WRONLY | constants.O_CREAT);",
		].join("\n"),
		"src/locked.ts": [
			'import { writeFileSync } from "node:fs";',
			"function lock() {",
			"\twriteFileSync(owner, pid);",
			"\twriteFileSync(cursor, next);",
			"}",
			"const other = () => {",
			'\twriteFileSync(state, "done");',
			"};",
		].join("\n"),
		"src/stream.ts": 'import { createWriteStream } from "node:fs";\n',
		"src/text.ts": 'const said = "writeFile(path)";\n// rename(a, b)\n',
		"src/ignored.ts": 'import { writeFile } from "node:fs/promises";\nawait writeFile(a, b);\n',
		"bin/outside.mjs": 'import { writeFile } from "node:fs/promises";\nawait writeFile(a, b);\n',
		"test/outside.ts": 'import { writeFile } from "node:fs/promises";\nawait writeFile(a, b);\n',
	};
	for (const [path, text] of Object.entries(files)) {
		await mkdir(dirname(join(repo, path)), { recursive: true });
		await writeFile(join(repo, path), text);
	}
	const lock: WriteException = {
		path: "src/locked.ts",
		inside: "lock",
		primitives: ["writeFileSync"],
		ticket: "R-0",
		what: "",
	};
	assert.deepEqual((await writeScan(repo, [lock])).sort(), [
		"hook/namespace.ts:3: renameSync",
		"hook/namespace.ts:4: copyFileSync",
		"seat/opened.ts:6: open",
		"seat/opened.ts:7: openSync",
		"src/locked.ts:4: writeFileSync",
		"src/locked.ts:7: writeFileSync",
		"src/named.ts:1: import writeFile",
		"src/named.ts:3: writeFile",
		"src/stream.ts:1: import createWriteStream",
	]);
});

// A kept call that is gone would let a new write in its function pass unseen once its ticket removed the old one.
test("T-25: every primitive of the write exception list keeps a call in its file and function", async () => {
	const unused: string[] = [];
	for (const entry of WRITE_EXCEPTIONS) {
		const calls = writeSites(entry.path, await readFile(join(root, entry.path), "utf8")).filter(
			(site) => !site.imported && site.inside === entry.inside,
		);
		for (const primitive of new Set(entry.primitives)) {
			const listed = entry.primitives.filter((name) => name === primitive).length;
			const found = calls.filter((site) => site.primitive === primitive).length;
			if (found < listed) {
				unused.push(`${entry.path} ${entry.inside}: ${listed} ${primitive} kept, ${found} found (${entry.ticket})`);
			}
		}
	}
	assert.deepEqual(unused, []);
});

/** The one lock module (T-25 (1), A-018): the only file whose code names a lock file. */
const LOCK_MODULE = "src/lock.ts";
/** Lock file names outside the module that stay: the lock a cut feature left, which only the leftover list names. */
const LOCK_NAME_EXCEPTIONS: ReadonlyArray<{ readonly path: string; readonly text: string }> = [
	{ path: "src/project/leftovers.ts", text: ".limen/picture/tick.lock" },
];

/** Each string or template literal of the code `text` at `path` whose text ends in `.lock`, as `<path>:<line>: <code>`. */
function lockNames(path: string, text: string): string[] {
	const kind = path.endsWith(".ts") ? ts.ScriptKind.TS : ts.ScriptKind.JS;
	const source = ts.createSourceFile(path, text, ts.ScriptTarget.Latest, true, kind);
	const found: string[] = [];
	const visit = (node: ts.Node): void => {
		const plain = ts.isStringLiteral(node) || ts.isNoSubstitutionTemplateLiteral(node);
		const literal = plain ? node.text : ts.isTemplateExpression(node) ? node.templateSpans.at(-1)?.literal.text : "";
		const kept = LOCK_NAME_EXCEPTIONS.some((entry) => entry.path === path && entry.text === literal);
		if (literal?.endsWith(".lock") && !kept) {
			const line = source.getLineAndCharacterOfPosition(node.getStart(source)).line + 1;
			found.push(`${path}:${line}: ${node.getText(source)}`);
		}
		ts.forEachChild(node, visit);
	};
	visit(source);
	return found;
}

/** Each lock file name outside the lock module, in the files git knows below `WRITERS` of the repository at `repo`. */
async function lockNameScan(repo: string): Promise<string[]> {
	const findings: string[] = [];
	for (const path of await knownFiles(repo)) {
		const file = relative(repo, path);
		const code = /\.(?:ts|mts|js|mjs)$/.test(file) && WRITERS.some((folder) => file.startsWith(`${folder}/`));
		if (code && file !== LOCK_MODULE) {
			findings.push(...lockNames(file, await readFile(path, "utf8")));
		}
	}
	return findings;
}

// A-018, A-087: the copies of the lock policy drifted apart (a bare pid with no stale check, folder locks that a reused
// pid held for ever, a takeover keyed by an inode). One module names every lock file, so the scan bans the name elsewhere.
test("T-25: outside src/lock.ts no file of src/, hook/ or seat/ names a lock file, except the leftover of the map jobs", async () => {
	assert.deepEqual(await lockNameScan(root), []);
});

test("the lock-name scan finds a string and template literals ending in .lock, and skips the module, the leftover, other text, an ignored file and other folders", async (t) => {
	const repo = await realpath(await mkdtemp(join(tmpdir(), "limen-lock-scan-")));
	t.after(() => rm(repo, { recursive: true, force: true }));
	execFileSync("git", ["init", "-q"], { cwd: repo });
	const files = {
		".gitignore": "src/ignored.ts\n",
		"src/lock.ts": `export const lock = (file: string) => \`\${file}.lock\`;\nconst poll = "poll.lock";\n`,
		"src/named.ts": 'const lock = join(dir, "poll.lock");\n',
		"hook/folder.ts": `\nconst lock = \`\${dir}/.lock\`;\n`,
		"seat/file.mjs": `const lock = \`\${file}.lock\`;\n`,
		"src/project/leftovers.ts": 'const left = [{ path: ".limen/picture/tick.lock" }];\n',
		"src/text.ts": 'const said = "a .lock folder";\n// poll.lock in a comment\nconst word = `lock`;\n',
		"src/ignored.ts": 'const lock = "x.lock";\n',
		"bin/outside.mjs": 'const lock = "x.lock";\n',
		"test/outside.ts": 'const lock = "x.lock";\n',
	};
	for (const [path, text] of Object.entries(files)) {
		await mkdir(dirname(join(repo, path)), { recursive: true });
		await writeFile(join(repo, path), text);
	}
	assert.deepEqual((await lockNameScan(repo)).sort(), [
		`hook/folder.ts:2: \`\${dir}/.lock\``,
		`seat/file.mjs:1: \`\${file}.lock\``,
		'src/named.ts:1: "poll.lock"',
	]);
});

/** The record module and the migration: the only code that names a file of the job record (T-25 (1), D-057 (5)). */
const RECORD_MODULES: ReadonlySet<string> = new Set(["src/job/record.ts", "src/job/migration.ts"]);
/** The folders whose code reads job records only through the record module. */
const RECORD_READERS = ["src", "hook", "seat", "docs/seat"] as const;
/** `record.json`, `progress.json`, and every one-value file of the older record (R-021, D-057). */
const JOB_FILE_NAMES: ReadonlySet<string> = new Set([
	"record.json",
	"progress.json",
	"state",
	"pid",
	"born",
	"group-owner.json",
	"starting",
	"started-at",
	"finished-at",
	"label",
	"branch",
	"worktree",
	"base",
	"role",
	"repo",
	"candidate",
	"parent",
	"group",
	"team",
	"deadline",
	"origin-tab",
	"origin-pane",
	"origin-session",
	"spawner",
	"spawned-by",
	"priority",
	"engine",
	"model",
	"extensions.json",
	"tool-calls",
	"last-tool",
	"activity",
	"queued",
	"stop-requested",
	"advisory",
	"stop-reason",
	"open-checks",
	"commits",
	"tip",
	"versions",
	"hosted",
	"agent-name",
	"engine-binding",
	"ownership-uncertainty",
]);
/**
 * Names of a job file outside the record modules that stay, each with its file, its literal and the reason it names
 * no job's file.
 */
const JOB_NAME_EXCEPTIONS: ReadonlyArray<{ readonly path: string; readonly name: string; readonly reason: string }> = [
	{ path: "src/integrations/coordinator-registration.ts", name: "pid", reason: "a coordinator's registration folder" },
	{ path: "src/integrations/coordinator-registration.ts", name: "born", reason: "a coordinator's registration folder" },
	{
		path: "src/integrations/coordinator-registration.ts",
		name: "started-at",
		reason: "a coordinator's registration folder",
	},
	{ path: "src/integrations/github-doctor.ts", name: "state", reason: "the GitHub poller's state folder" },
	{ path: "docs/seat/github-setup.sh", name: "state", reason: "the GitHub poller's state folder" },
	{ path: "docs/seat/quota-resume.ts", name: "state", reason: "the folder ~/.local/state of the XDG layout" },
];
/** Whether `JOB_NAME_EXCEPTIONS` keeps the name `name` in the file `path`. */
const keptJobName = (path: string, name: string) =>
	JOB_NAME_EXCEPTIONS.some((entry) => entry.path === path && entry.name === name);

/** The job file a path literal ends in: the name after its last slash, when it is one of `JOB_FILE_NAMES`. */
function namedJobFile(literal: string): string | undefined {
	const name = literal.slice(literal.lastIndexOf("/") + 1);
	return literal.includes("/") && JOB_FILE_NAMES.has(name) ? name : undefined;
}

/**
 * Each place the code `text` at `path` names a job file in a path, as `<path>:<line>: <name>`: a string or template
 * literal that ends in `/<name>`, and a `join` or `resolve` call whose last argument is the literal `<name>`. A shell
 * script is read as text: `/<name>` before a quote, a space or the end of a line.
 */
function jobFileNames(path: string, text: string): string[] {
	if (!/\.(?:ts|mts|js|mjs)$/.test(path)) {
		return text
			.split("\n")
			.flatMap((line, index) =>
				[...line.matchAll(/\/([a-z][a-z.-]*)(?=["'\s]|$)/g)].flatMap((match) =>
					match[1] && JOB_FILE_NAMES.has(match[1]) && !keptJobName(path, match[1])
						? [`${path}:${index + 1}: ${match[1]}`]
						: [],
				),
			);
	}
	const kind = path.endsWith(".ts") ? ts.ScriptKind.TS : ts.ScriptKind.JS;
	const source = ts.createSourceFile(path, text, ts.ScriptTarget.Latest, true, kind);
	const found: string[] = [];
	const add = (node: ts.Node, name: string | undefined) => {
		if (name && !keptJobName(path, name)) {
			found.push(`${path}:${source.getLineAndCharacterOfPosition(node.getStart(source)).line + 1}: ${name}`);
		}
	};
	const visit = (node: ts.Node): void => {
		if (ts.isStringLiteral(node) || ts.isNoSubstitutionTemplateLiteral(node)) {
			add(node, namedJobFile(node.text));
		} else if (ts.isTemplateExpression(node)) {
			add(node, namedJobFile(node.templateSpans.at(-1)?.literal.text ?? ""));
		} else if (ts.isCallExpression(node) && ["join", "resolve"].includes(calledName(node) ?? "")) {
			const last = node.arguments.at(-1);
			if (last && node.arguments.length > 1 && (ts.isStringLiteral(last) || ts.isNoSubstitutionTemplateLiteral(last))) {
				add(last, JOB_FILE_NAMES.has(last.text) ? last.text : undefined);
			}
		}
		ts.forEachChild(node, visit);
	};
	visit(source);
	return found;
}

/** Each name of a job file outside the record modules, in the files git knows below `RECORD_READERS` of `repo`. */
async function jobFileScan(repo: string): Promise<string[]> {
	const findings: string[] = [];
	for (const path of await knownFiles(repo)) {
		const file = relative(repo, path);
		const code = /\.(?:ts|mts|js|mjs|sh)$/.test(file) && RECORD_READERS.some((folder) => file.startsWith(`${folder}/`));
		if (code && !RECORD_MODULES.has(file)) {
			findings.push(...jobFileNames(file, await readFile(path, "utf8")));
		}
	}
	return findings;
}

// T-25 (1), D-057 (5): a reader left on an older job file shows a job as missing once the migration removed the file,
// so outside the record module and the migration no code names a file of the job record.
test("T-25: outside the record module and the migration no file of src/, hook/, seat/ or docs/seat/ names a job record file", async () => {
	assert.deepEqual(await jobFileScan(root), []);
});

test("the job-file scan finds a path literal, a template and a join that end in a job file, and skips other names, the record modules and other folders", async (t) => {
	const repo = await realpath(await mkdtemp(join(tmpdir(), "limen-job-file-scan-")));
	t.after(() => rm(repo, { recursive: true, force: true }));
	execFileSync("git", ["init", "-q"], { cwd: repo });
	/** The template literal of a path below a job folder that ends in `name`, as code writes it. */
	const below = (name: string) => `\`\${jobDir}/${name}\``;
	const files = {
		"src/job/record.ts": 'const record = join(jobDir, "record.json");\n',
		"src/job/migration.ts": `const old = ${below("state")};\n`,
		"src/reader.ts": [
			`const state = ${below("state")};`,
			'const pid = join(dir, "pid");',
			'const fixed = ".limen/jobs/x/record.json";',
			'const flag = { flag: "label", about: "the state" };',
			`const log = ${below("log")};`,
			'const tab = join(dir, "herdr", "tab");',
		].join("\n"),
		"hook/progress.ts": 'const progress = resolve(job, "progress.json");\n',
		"docs/seat/reader.sh": '#!/bin/sh\nstate=$(cat "$job/state")\nexec node "$here/reader.ts"\n',
		"src/integrations/coordinator-registration.ts": 'const pid = join(dir, "pid");\n',
		"test/outside.ts": `const state = ${below("state")};\n`,
	};
	for (const [path, text] of Object.entries(files)) {
		await mkdir(dirname(join(repo, path)), { recursive: true });
		await writeFile(join(repo, path), text);
	}
	assert.deepEqual((await jobFileScan(repo)).sort(), [
		"docs/seat/reader.sh:2: state",
		"hook/progress.ts:1: progress.json",
		"src/reader.ts:1: state",
		"src/reader.ts:2: pid",
		"src/reader.ts:3: record.json",
	]);
});

/** The adapter of T-32 (1): the one file that declares the Pi API Limen uses. */
const PI_ADAPTER = "src/runtime/pi-api.ts";

/** Whether `node` holds, at any depth, a member `on` whose first parameter is `event`, as a method or a function type. */
function declaresOn(node: ts.Node): boolean {
	const isOn = (member: ts.Node): boolean => {
		const named = ts.isMethodSignature(member) || ts.isMethodDeclaration(member) || ts.isPropertySignature(member);
		if (!named || member.name.getText() !== "on") {
			return false;
		}
		const signature = ts.isPropertySignature(member) ? member.type : member;
		const parameters = signature && ts.isFunctionLike(signature) ? signature.parameters : undefined;
		return parameters?.[0]?.name.getText() === "event";
	};
	let found = false;
	const visit = (child: ts.Node): void => {
		found ||= isOn(child);
		if (!found) {
			ts.forEachChild(child, visit);
		}
	};
	ts.forEachChild(node, visit);
	return found;
}

/** Each type or interface of the TypeScript `text` at `path` that declares Pi's API: named PiApi, or with `on(event`. */
function piApiDeclarations(path: string, text: string): string[] {
	const source = ts.createSourceFile(path, text, ts.ScriptTarget.Latest, true, ts.ScriptKind.TS);
	const found: string[] = [];
	const visit = (node: ts.Node): void => {
		const declared = ts.isTypeAliasDeclaration(node) || ts.isInterfaceDeclaration(node);
		if (declared && (node.name.text === "PiApi" || declaresOn(node))) {
			const line = source.getLineAndCharacterOfPosition(node.getStart(source)).line + 1;
			found.push(`${path}:${line}: ${node.name.text}`);
		}
		ts.forEachChild(node, visit);
	};
	visit(source);
	return found;
}

test("the Pi API scan finds a type named PiApi and a type or interface with an on(event member at any depth, and skips other on members", () => {
	const fixture = [
		"type PiApi = { sendUserMessage(text: string): void };",
		"interface Api { on(event: string, handler: () => void): void }",
		"type Nested = { readonly pi: { on: (event: string) => void } };",
		"type Emitter = { on(name: string): void };",
		"type Context = { readonly cwd: string };",
		"const pi = { on(event: string) { return event; } };",
	].join("\n");
	assert.deepEqual(piApiDeclarations("fixture.ts", fixture), [
		"fixture.ts:1: PiApi",
		"fixture.ts:2: Api",
		"fixture.ts:3: Nested",
	]);
});

// T-32 (1): a hook that declares the part of Pi's API it uses can drift from Pi with no failing check; the adapter's
// declarations are the ones the contract of test/runtime/pi-contract.test.ts compares with Pi's own types.
test("T-32: no file of src/ or hook/ outside src/runtime/pi-api.ts declares a type named PiApi or with an on(event member", async () => {
	const files = (await knownSources(["src", "hook"])).filter(({ path }) => path.endsWith(".ts"));
	const elsewhere = files
		.filter(({ path }) => path !== PI_ADAPTER)
		.flatMap(({ path, text }) => piApiDeclarations(path, text));
	assert.deepEqual(elsewhere, []);
	const adapter = files.filter(({ path }) => path === PI_ADAPTER);
	assert.deepEqual(
		adapter.flatMap(({ path, text }) => piApiDeclarations(path, text)).map((found) => found.split(": ")[1]),
		["PiApi"],
		"the adapter declares PiApi",
	);
});

/**
 * The folder of the platform adapter (A-083), the only code that reads the operating system's process and load data,
 * starts or ends a systemd user scope, and reads the cgroup hierarchy (A-029).
 */
const PLATFORM = "src/platform/";

/**
 * Each operating-system read or signal in the code `text`, as `<path>:<line>: <match>`: a `/proc/` path, a `ps`
 * literal (the program a spawn names), a `cpus(` call, `process.kill`, the name `systemd-run`, a `systemctl` literal
 * whatever its arguments are, a line that names `systemctl` with `--user` (a command in a shell string), and a path of
 * the cgroup hierarchy. Prose that names `systemctl`, such as a fix a report gives root, is no call.
 */
function platformCalls(path: string, text: string): string[] {
	const calls =
		/\/proc\/|(["'`])ps\1|\bcpus\s*\(|\bprocess\.kill\b|\bsystemd-run\b|(["'`])systemctl\2|\/sys\/fs\/cgroup/g;
	return text.split("\n").flatMap((line, index) => {
		const user = /\bsystemctl\b/.test(line) && /--user\b/.test(line) ? ["systemctl --user"] : [];
		return [...[...line.matchAll(calls)].map((match) => match[0]), ...user].map(
			(match) => `${path}:${index + 1}: ${match}`,
		);
	});
}

test("the platform scan finds a /proc/ path, a ps literal, a cpus call, process.kill, systemd-run, a systemctl literal or systemctl with --user, and a cgroup path, and skips other text", () => {
	const fixture = [
		'readFileSync("/proc/meminfo");',
		'execFile("ps", ["-A"]);',
		"const cores = os.cpus();",
		"process.kill(pid, 0);",
		'const said = "ps discovery and steps";',
		"// the CPUs of the seat",
		"const options = { cpus: 2 };",
		"child.kill();",
		'spawn("systemd-run", ["--user", "--scope", "--", command]);',
		'exec("systemctl --user kill --signal=SIGKILL " + unit);',
		'readFile("/sys/fs/cgroup/user.slice/memory.peak");',
		'command("systemctl", ["is-active", "limen-github.timer"]);',
		"// the job's systemd user scope, which its end stops",
		'report(ok, "enabled timer", "systemctl daemon-reload && systemctl enable --now limen-github.timer");',
	].join("\n");
	assert.deepEqual(platformCalls("fixture.ts", fixture), [
		"fixture.ts:1: /proc/",
		'fixture.ts:2: "ps"',
		"fixture.ts:3: cpus(",
		"fixture.ts:4: process.kill",
		"fixture.ts:9: systemd-run",
		"fixture.ts:10: systemctl --user",
		"fixture.ts:11: /sys/fs/cgroup",
		'fixture.ts:12: "systemctl"',
	]);
});

// A-083: the platform adapter is an interface with one implementation, Linux; a second operating system is a second
// implementation, so its reads and signals must not be spread over the code that calls them. A-029: the same holds for
// the systemd user scopes every job runs in.
test("A-083: outside src/platform/ no file of src/ or hook/ reads /proc/, names ps, calls cpus, signals with process.kill, runs systemd-run or systemctl, or reads the cgroup hierarchy", async () => {
	const found = (await knownSources(["src", "hook"]))
		.filter(({ path }) => !path.startsWith(PLATFORM))
		.flatMap(({ path, text }) => platformCalls(path, text));
	assert.deepEqual(found, []);
});

/** The one resolver of job references (T-20 (4), T-25 (1)): the only code that matches a job argument to a job. */
const RESOLVER = "src/job/reference.ts";
/**
 * The forms of an approximate match of a job, each with the files besides the resolver where it may stand: an id's
 * start or end compared with a word, a label's text matched or compared with a value, a label map, and a new job's id
 * made outside the resolver's draw of a unique token.
 */
const MATCHERS: ReadonlyArray<{ readonly pattern: RegExp; readonly allowed: readonly string[] }> = [
	{ pattern: /\b\w*(?:[iI]d|[iI]ds)\??\.(?:endsWith|startsWith)\((?!["'])/g, allowed: [] },
	{ pattern: /\blabel\??\.(?:toLowerCase|toUpperCase|startsWith|endsWith|includes)\(/g, allowed: [] },
	{ pattern: /\blabel\s*[!=]==?\s*(?!undefined\b|null\b|["'`])[\w?.]+/g, allowed: [] },
	{ pattern: /[!=]==?\s*(?:[\w?]+\.)*label\b/g, allowed: [] },
	{ pattern: /\blabels\[/g, allowed: [] },
	{ pattern: /\bmakeJobId\(/g, allowed: ["src/job/job.ts"] },
];
/** Label comparisons outside the resolver that name no job. */
const MATCHER_EXCEPTIONS: ReadonlyArray<{ readonly path: string; readonly text: string }> = [
	// The spawn's warning that a live job already holds the label it was given.
	{ path: "src/job/spawning.ts", text: "record?.label === label" },
	// Herdr tabs' labels, not jobs'.
	{ path: "src/integrations/herdr.ts", text: "row.label !== name" },
	{ path: "src/project/summary.ts", text: "label !== String(tab.number)" },
];

/** Each approximate matcher of a job in the code `text` at `path`, as `<path>:<line>: <match>`. */
function jobMatchers(path: string, text: string): string[] {
	if (path === RESOLVER) {
		return [];
	}
	return text
		.split("\n")
		.flatMap((line, index) =>
			MATCHERS.filter(({ allowed }) => !allowed.includes(path)).flatMap(({ pattern }) =>
				[...line.matchAll(pattern)]
					.filter(() => !MATCHER_EXCEPTIONS.some((entry) => entry.path === path && line.includes(entry.text)))
					.map((match) => `${path}:${index + 1}: ${match[0]}`),
			),
		);
}

test("the job-matcher scan finds an id suffix, a label prefix, a label comparison, a label map and a new id, and skips the resolver, literals, absent values and the exceptions", () => {
	const fixture = [
		"const hit = ids.filter((id) => id.endsWith(`-` + needle));",
		"if (label.toLowerCase().startsWith(word)) {}",
		"if (record.label === needle) {}",
		"if (needle === record?.label) {}",
		'if (typeof label === "string") {}',
		"const label = labels[id];",
		"const id = makeJobId(label);",
		'if (id.startsWith(".")) {}',
		"const label = request.label === undefined ? undefined : request.label;",
		"if (record?.label === label) {}",
	].join("\n");
	assert.deepEqual(jobMatchers("src/job/spawning.ts", fixture), [
		"src/job/spawning.ts:1: id.endsWith(",
		"src/job/spawning.ts:2: label.toLowerCase(",
		"src/job/spawning.ts:3: label === needle",
		"src/job/spawning.ts:4: === record?.label",
		"src/job/spawning.ts:6: labels[",
		"src/job/spawning.ts:7: makeJobId(",
	]);
	assert.deepEqual(jobMatchers(RESOLVER, fixture), []);
	assert.deepEqual(jobMatchers("src/job/job.ts", "export function makeJobId(label: string) {}"), []);
});

// T-20: a reference is exact; an approximate match is a hint in the resolver's refusal, never an execution elsewhere.
test("T-20: outside src/job/reference.ts no file of src/ or hook/ matches a job by an id suffix or a label, or makes a new job id", async () => {
	const found = (await knownSources(["src", "hook"])).flatMap(({ path, text }) => jobMatchers(path, text));
	assert.deepEqual(found, []);
});

/** Whether the code `text` of the file `path` imports the one resolver and calls it. */
function resolvesJobs(path: string, text: string): boolean {
	const imported = importsOf(path, text).some(
		({ module }) => module !== undefined && importedFile(path, module) === RESOLVER,
	);
	return imported && /\bresolveJob\(/.test(text);
}

/** The modules of src/ outside src/commands that the code `text` of the file `path` imports. */
function domainModules(path: string, text: string): string[] {
	return importsOf(path, text).flatMap(({ module }) => {
		const file = module === undefined ? undefined : importedFile(path, module);
		return file?.startsWith("src/") && !file.startsWith("src/commands/") ? [file] : [];
	});
}

// T-26 (1): a handler reads its values and calls one domain operation, which resolves its job argument; the scan reads
// the handler's module and the domain modules it calls.
test("T-20 (4): the module of every handler that takes an argument of type job, or the domain module it calls, resolves it through src/job/reference.ts", async () => {
	const registry = await readFile(join(root, "src", "registry.ts"), "utf8");
	const modules = new Map(
		importsOf("src/registry.ts", registry).flatMap(({ module, names }) => {
			const file = module === undefined ? undefined : importedFile("src/registry.ts", module);
			return file === undefined ? [] : names.map((name) => [name, file] as const);
		}),
	);
	const typed = REGISTRY.filter((entry) =>
		entry.schema.some((part) => ("type" in part && part.type === "job") || ("value" in part && part.value === "job")),
	);
	const unresolved: string[] = [];
	for (const entry of typed) {
		const module = modules.get(entry.handler.name);
		const text = module === undefined ? "" : await readFile(join(root, module), "utf8");
		const called = module === undefined ? [] : domainModules(module, text);
		const read = await Promise.all(
			called.map(async (file) => ({ file, code: await readFile(join(root, file), "utf8") })),
		);
		const resolved =
			module !== undefined &&
			[{ file: module, code: text }, ...read].some(({ file, code }) => resolvesJobs(file, code));
		if (!resolved) {
			unresolved.push(entry.name);
		}
	}
	assert.deepEqual(
		{ count: typed.length, unresolved },
		{ count: 11, unresolved: [] },
		"continue, steer, stop, abandon, land, diff, show, open, watch, unwatch and keeper take a job",
	);
});

/** The one module of the job id's form (T-25 (2), T-20 (1), (6)): its date and slug, its token, its older 4-hex end. */
const JOB_ID_MODULE = "src/job/id.ts";
/** A pattern of the job id's form as source text: its date and slug, or a run of 8 or 4 hex characters. */
const JOB_ID_PATTERN = /\\d\{4\}-\\d\{2\}-\\d\{2\}-|\[0-9a-f\]\{[48]\}/g;
/** Hex runs outside the job id's module that are not a job's. */
const JOB_ID_PATTERN_EXCEPTIONS: ReadonlyArray<{ readonly path: string; readonly text: string }> = [
	// The kernel's boot id, a UUID.
	{ path: "src/platform/linux.ts", text: "export const BOOT_ID =" },
];

// T-25 (2): a copy of the id's form can drift from the ids Limen writes, so one module holds it.
test("T-25: outside src/job/id.ts no file of src/, hook/, bin/ or seat/ writes a pattern of a job id or its token, except the boot id", async () => {
	const found = (await knownSources(RUNTIME))
		.filter(({ path }) => path !== JOB_ID_MODULE)
		.flatMap(({ path, text }) =>
			text
				.split("\n")
				.flatMap((line, index) =>
					JOB_ID_PATTERN_EXCEPTIONS.some((entry) => entry.path === path && line.includes(entry.text))
						? []
						: [...line.matchAll(JOB_ID_PATTERN)].map((match) => `${path}:${index + 1}: ${match[0]}`),
				),
		);
	assert.deepEqual(found, []);
});

/** The modules that take job ids from folder names, besides the record module that lists them (T-25 (1)). */
const JOB_FOLDER_READERS = ["src/job/reference.ts", "src/job/migration.ts"] as const;

// T-25 (1): the listing carries the rule for a missing folder (ENOENT), so one module holds it.
test("T-25: src/job/reference.ts and src/job/migration.ts list job folders only through src/job/record.ts", async () => {
	const listing: string[] = [];
	for (const path of JOB_FOLDER_READERS) {
		const text = await readFile(join(root, path), "utf8");
		const imported = /import \{[^}]*\bjobFolderNames\b[^}]*\} from "\.\/record\.ts"/.test(text);
		if (/\breaddir(?:Sync)?\b/.test(text) || !imported) {
			listing.push(path);
		}
	}
	assert.deepEqual(listing, []);
});

/** A file of code by its path from the repository root, for the scans of T-26 that also run on fixtures. */
type Code = { readonly path: string; readonly text: string };
const COMMANDS = "src/commands/";
/** The two files outside src/commands that import the commands: the wrapper and the registry (T-26 (3)). */
const COMMAND_IMPORTERS: ReadonlySet<string> = new Set(["src/main.ts", "src/registry.ts"]);

/** The file of the repository that the relative module path `module` in the file `path` names, else undefined. */
function importedFile(path: string, module: string): string | undefined {
	return /^\.{1,2}\//.test(module) ? posix.normalize(posix.join(posix.dirname(path), module)) : undefined;
}

/**
 * The command files whose every registry entry carries `movedBy`, which the scans of T-26 leave out (D-061): each
 * file of src/commands holds the handlers that src/registry.ts imports from it.
 */
async function movedCommandFiles(): Promise<ReadonlySet<string>> {
	const registry = await readFile(join(root, "src", "registry.ts"), "utf8");
	const files = new Map<string, boolean>();
	for (const { module, names } of importsOf("src/registry.ts", registry)) {
		const file = module === undefined ? undefined : importedFile("src/registry.ts", module);
		if (!file?.startsWith(COMMANDS)) {
			continue;
		}
		const entries = REGISTRY.filter((entry) => names.includes(entry.handler.name));
		files.set(file, entries.length > 0 && entries.every((entry) => entry.movedBy !== undefined));
	}
	return new Set([...files].filter(([, moved]) => moved).map(([file]) => file));
}

/**
 * Each import of `files` against T-26 (3), as `<path>: <code>`: a command file that imports another command file or a
 * value of the registry, a file of src/ outside src/commands, but the wrapper and the registry, or of hook/ or bin/
 * that imports a command file, and a file of src/ that imports bin/. The command files of `moved` are left out.
 */
function commandImports(files: readonly Code[], moved: ReadonlySet<string>): string[] {
	const found: string[] = [];
	for (const { path, text } of files) {
		for (const imported of importsOf(path, text)) {
			const target = imported.module === undefined ? undefined : importedFile(path, imported.module);
			if (target === undefined) {
				continue;
			}
			const command = target.startsWith(COMMANDS);
			const wrong = path.startsWith(COMMANDS)
				? !moved.has(path) && (command || (target === "src/registry.ts" && !imported.typeOnly))
				: (command && !COMMAND_IMPORTERS.has(path)) || (path.startsWith("src/") && target.startsWith("bin/"));
			if (wrong) {
				found.push(`${path}: ${imported.code}`);
			}
		}
	}
	return found;
}

test("T-26: no command file imports another or a value of the registry, and outside src/commands only the wrapper and the registry import one", async () => {
	const files = await knownSources(["src", "hook", "bin"]);
	assert.deepEqual(commandImports(files, await movedCommandFiles()), []);
});

test("the command-import scan finds both directions and skips the wrapper, the registry, a type import and a moved command", () => {
	const files: Code[] = [
		{ path: "src/commands/a.ts", text: 'import { b } from "./b.ts";\nimport type { Entry } from "../registry.ts";\n' },
		{ path: "src/commands/c.ts", text: 'import { REGISTRY } from "../registry.ts";\n' },
		{ path: "src/commands/moved.ts", text: 'import { b } from "./b.ts";\n' },
		{ path: "src/job/d.ts", text: 'import { b } from "../commands/b.ts";\n' },
		{ path: "src/job/e.ts", text: 'import { f } from "../../bin/f.mjs";\n' },
		{ path: "hook/g.ts", text: 'import { b } from "../src/commands/b.ts";\n' },
		{ path: "bin/h.mjs", text: 'import { b } from "../src/commands/b.ts";\n' },
		{ path: "src/main.ts", text: 'import { b } from "./commands/b.ts";\n' },
		{ path: "src/registry.ts", text: 'import { b } from "./commands/b.ts";\n' },
	];
	assert.deepEqual(commandImports(files, new Set(["src/commands/moved.ts"])), [
		'src/commands/a.ts: import { b } from "./b.ts";',
		'src/commands/c.ts: import { REGISTRY } from "../registry.ts";',
		'src/job/d.ts: import { b } from "../commands/b.ts";',
		'src/job/e.ts: import { f } from "../../bin/f.mjs";',
		'hook/g.ts: import { b } from "../src/commands/b.ts";',
		'bin/h.mjs: import { b } from "../src/commands/b.ts";',
	]);
});

/** The calls that print: the output methods of `console` and a write to either stream of the process. */
const PRINTS = /\bconsole\.(?:log|error|warn|info|debug)\(|\bprocess\.(?:stdout|stderr)\.write\(/g;
/** The one streaming command (D-061 (3)) and the module that prints while it runs, which the scan leaves out. */
const STREAMING = { command: "picture serve", module: "src/picture/picture-serve.ts" } as const;

/**
 * Each print in `files` outside the wrapper, the streaming command's module and the command files of `moved`, as
 * `<path>:<line>: <call>`: every other command's text goes through the wrapper, which prints it at the command's end.
 */
function printCalls(files: readonly Code[], moved: ReadonlySet<string>): string[] {
	return files
		.filter(({ path }) => path !== "src/main.ts" && path !== STREAMING.module && !moved.has(path))
		.flatMap(({ path, text }) =>
			text
				.split("\n")
				.flatMap((line, index) => [...line.matchAll(PRINTS)].map((match) => `${path}:${index + 1}: ${match[0]}`)),
		);
}

// D-061 (3): a command that prints as it goes leaves a half report when it fails, and its text interleaves with what
// it calls in-process, so the shared wrapper prints all of a command's text when the command ends.
test("T-26: no file of src/ prints but the wrapper, the module of the streaming picture serve and the moved commands", async () => {
	assert.ok(
		REGISTRY.some((entry) => entry.name === STREAMING.command),
		`${STREAMING.command} is a registry command`,
	);
	assert.deepEqual(printCalls(await knownSources(["src"]), await movedCommandFiles()), []);
});

test("the print scan finds console output and stream writes, and skips the wrapper, the streaming module and a moved command", () => {
	const files: Code[] = [
		{ path: "src/job/a.ts", text: 'const x = 1;\nconsole.log("a");\n' },
		{ path: "src/commands/b.ts", text: 'process.stdout.write("b");\nconsole.error("b");\n' },
		{ path: "src/main.ts", text: 'console.log("line");\n' },
		{ path: STREAMING.module, text: 'console.error("serving");\n' },
		{ path: "src/commands/moved.ts", text: 'console.log("moved");\n' },
	];
	assert.deepEqual(printCalls(files, new Set(["src/commands/moved.ts"])), [
		"src/job/a.ts:2: console.log(",
		"src/commands/b.ts:1: process.stdout.write(",
		"src/commands/b.ts:2: console.error(",
	]);
});

/** The one module that starts Limen's own CLI and reads its final line (D-061 (4)). */
const LAUNCHER = "src/runtime/launcher.ts";
/** The functions of node:child_process that start a process. */
const STARTERS: ReadonlySet<string> = new Set([
	"spawn",
	"spawnSync",
	"exec",
	"execSync",
	"execFile",
	"execFileSync",
	"fork",
]);
/**
 * What names Limen's own CLI in code: a path that ends in its entry point `bin/limen`, that path in parts, or the
 * setting of its path; a sentence that mentions `bin/limen` names no process to start.
 */
const LIMEN_CLI = /bin\/limen["'`]|["'`]bin["'`],\s*["'`]limen["'`]|LIMEN_GITHUB_LIMEN_BIN/;

/** The initializer of each variable the code declares, by its name. */
function declaredValues(source: ts.SourceFile): ReadonlyMap<string, string> {
	const values = new Map<string, string>();
	const visit = (node: ts.Node): void => {
		if (ts.isVariableDeclaration(node) && ts.isIdentifier(node.name) && node.initializer !== undefined) {
			values.set(node.name.text, node.initializer.getText(source));
		}
		ts.forEachChild(node, visit);
	};
	visit(source);
	return values;
}

/** The name of the function a call calls, as a name or as the last name of a property access. */
function calleeName(call: ts.CallExpression): string | undefined {
	const callee = call.expression;
	return ts.isIdentifier(callee) ? callee.text : ts.isPropertyAccessExpression(callee) ? callee.name.text : undefined;
}

/**
 * Each start of Limen's own CLI in the code `text` at `path`, as `<path>:<line>: <function>`: a call of a function that
 * starts a process whose program, or a word of its literal list of arguments, names the CLI, itself or through a
 * variable the file declares.
 */
function cliLaunches(path: string, text: string): string[] {
	const source = ts.createSourceFile(path, text, ts.ScriptTarget.Latest, true, ts.ScriptKind.TS);
	const values = declaredValues(source);
	const found: string[] = [];
	const visit = (node: ts.Node): void => {
		const callee = ts.isCallExpression(node) ? calleeName(node) : undefined;
		if (ts.isCallExpression(node) && callee !== undefined && STARTERS.has(callee)) {
			const [program, list] = node.arguments;
			const words = list !== undefined && ts.isArrayLiteralExpression(list) ? [...list.elements] : [];
			const parts = [...(program === undefined ? [] : [program]), ...words].flatMap((part) => [
				part.getText(source),
				ts.isIdentifier(part) ? (values.get(part.text) ?? "") : "",
			]);
			if (parts.some((part) => LIMEN_CLI.test(part))) {
				found.push(`${path}:${source.getLineAndCharacterOfPosition(node.getStart(source)).line + 1}: ${callee}`);
			}
		}
		ts.forEachChild(node, visit);
	};
	visit(source);
	return found;
}

// T-26 (4), D-061 (4): a caller that starts Limen's CLI by hand reads its text for people or nothing at all; one module
// starts it and reads the final line through the client function.
test("T-26: outside src/runtime/launcher.ts no file of src/ starts Limen's own CLI", async () => {
	const found = (await knownSources(["src"]))
		.filter(({ path }) => path !== LAUNCHER && path.endsWith(".ts"))
		.flatMap(({ path, text }) => cliLaunches(path, text));
	assert.deepEqual(found, []);
});

test("the launch scan finds a start of bin/limen directly, through a variable and through the CLI path setting, and skips other processes and text", () => {
	const fixture = [
		'const limen = fileURLToPath(new URL("../../bin/limen", import.meta.url));',
		'spawn(process.execPath, [limen, "group", "advance", id], { detached: true });',
		'const command = exception("LIMEN_GITHUB_LIMEN_BIN") || "/opt/limen/bin/limen";',
		'spawnSync("sudo", ["-n", "-u", user, "--", command, "github", "ensure", root]);',
		'child_process.execFileSync(join(PACKAGE_ROOT, "bin", "limen"), ["status"]);',
		'spawnSync("git", ["status"], { cwd: root });',
		`const prompt = \`run \${PACKAGE_ROOT}/bin/limen github resolve\`;`,
		'spawnSync("herdr", ["agent", "prompt", pane, prompt]);',
	].join("\n");
	assert.deepEqual(cliLaunches("src/job/a.ts", fixture), [
		"src/job/a.ts:2: spawn",
		"src/job/a.ts:4: spawnSync",
		"src/job/a.ts:5: execFileSync",
	]);
});

/** The parser of command words (T-19, D-044), the one file that may read them. */
const PARSER = "src/parser.ts";
/**
 * The idioms that read command words: a comparison of a word with a flag (`--help`, `-h`, a lone `--`) or with the word
 * `help`, and the match of a command's name word by word against the words of a command line.
 */
const WORD_READS: readonly RegExp[] = [
	/[!=]==\s*(["'`])(?:--?[A-Za-z][\w-]*|--|help)\1/g,
	/(["'`])(?:--?[A-Za-z][\w-]*|--|help)\1\s*[!=]==/g,
	/\.split\(\s*["'`] ["'`]\s*\)\.every\(/g,
];

/** Each read of command words in the code `text` at `path` outside the parser, as `<path>:<line>: <match>`. */
function wordReads(path: string, text: string): string[] {
	if (path === PARSER) {
		return [];
	}
	return text
		.split("\n")
		.flatMap((line, index) =>
			WORD_READS.flatMap((pattern) => [...line.matchAll(pattern)].map((match) => `${path}:${index + 1}: ${match[0]}`)),
		);
}

// D-044: a word read outside the parser follows rules of its own, as the `--help` lookup and the old `jobs` words did.
test("T-19: outside src/parser.ts no file of src/ reads command words", async () => {
	const found = (await knownSources(["src"])).flatMap(({ path, text }) => wordReads(path, text));
	assert.deepEqual(found, []);
});

test("the word scan finds a flag or help comparison and a name matched word by word, and skips other dashes and the parser", () => {
	const fixture = [
		'if (!name || name === "--help" || name === "-h" || name === "help") {}',
		'const task = words.filter((word) => word !== "--");',
		'const named = names.filter((old) => old.name.split(" ").every((word, index) => words[index] === word));',
		'if (all[0]?.trimEnd() !== "---") {}',
		'const source = task === "-" ? "-" : undefined;',
		'if (ref.startsWith("-")) {}',
	].join("\n");
	assert.deepEqual(wordReads("src/a.ts", fixture), [
		'src/a.ts:1: === "--help"',
		'src/a.ts:1: === "-h"',
		'src/a.ts:1: === "help"',
		'src/a.ts:2: !== "--"',
		'src/a.ts:3: .split(" ").every(',
	]);
	assert.deepEqual(wordReads(PARSER, fixture), []);
});

// Each shipped templates/.history/<name> starts with the hash of the current templates/<name>.
test("shipped template history starts at the current template", async () => {
	for (const name of await readdir(join(root, "templates/.history"))) {
		const path = join(root, "templates/.history", name);
		if (process.env.LIMEN_WRITE_HISTORY === "1") {
			await writeFile(path, templateHistoryText(`templates/${name}`));
		}
		const hash = createHash("sha256")
			.update(await readFile(join(root, "templates", name)))
			.digest("hex");
		const head = (await readFile(path, "utf8")).split(" ")[0];
		assert.equal(head, hash, `regenerate ${path}: LIMEN_WRITE_HISTORY=1 node --test test/structure.test.ts`);
	}
});
