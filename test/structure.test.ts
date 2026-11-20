import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { createHash } from "node:crypto";
import { existsSync } from "node:fs";
import { mkdir, mkdtemp, readdir, readFile, realpath, rename, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { basename, dirname, join, relative } from "node:path";
import test, { type TestContext } from "node:test";
import ts from "typescript";
import { templateHistoryText } from "../src/project/inherit.ts";
import { knownFiles, SKIPPED } from "./known-files.ts";

// The fixture's git and the listing of the repository must not depend on the laptop's own git configuration.
process.env.GIT_CONFIG_GLOBAL = "/dev/null";
process.env.GIT_CONFIG_NOSYSTEM = "1";

const root = new URL("..", import.meta.url).pathname;

async function filesBelow(dir: string): Promise<string[]> {
	const entries = await readdir(dir, { withFileTypes: true });
	const paths = await Promise.all(
		entries
			.filter((entry) => !SKIPPED.has(entry.name))
			.map(async (entry) => {
				const path = join(dir, entry.name);
				return entry.isDirectory() ? filesBelow(path) : [path];
			}),
	);
	return paths.flat();
}

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

/** The files below each folder of the repository root that exists. */
async function filesIn(folders: readonly string[]): Promise<string[]> {
	const present = folders.map((folder) => join(root, folder)).filter((path) => existsSync(path));
	return (await Promise.all(present.map(filesBelow))).flat();
}

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

/** The text of every file below each folder that exists, by its path from the repository root. */
async function sources(folders: readonly string[]): Promise<ReadonlyArray<{ path: string; text: string }>> {
	const paths = await filesIn(folders);
	return Promise.all(paths.map(async (path) => ({ path: relative(root, path), text: await readFile(path, "utf8") })));
}

/** How often `literal` occurs in the text of every file below `folders`, and in the file `only`. */
async function occurrences(folders: readonly string[], literal: string, only: string): Promise<[number, number]> {
	let all = 0;
	let inOnly = 0;
	for (const { path, text } of await sources(folders)) {
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
	for (const { path, text } of await sources(["src", "hook", "bin"])) {
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
	const builders = (await sources(["src", "hook", "bin"]))
		.filter(({ path, text }) => path !== "src/outcome.ts" && /JSON\.stringify\(\{ ?class/.test(text))
		.map(({ path }) => path);
	assert.deepEqual(builders, []);
});

// T-01 → Why: the author's side channels swallow their errors. A ratchet until R-082 brings both counts to zero: the
// counts at R-013's parent commit, which a change may only lower.
const SWALLOWED = { "catch {": 81, ".catch(() => {})": 27 } as const;
test("T-01: the catch-all sites in src/ and hook/ stay at most their baseline count, and src/outcome.ts has none", async () => {
	for (const [literal, most] of Object.entries(SWALLOWED)) {
		const [all, inOutcome] = await occurrences(["src", "hook"], literal, "src/outcome.ts");
		assert.ok(all <= most, `${all} sites of ${literal}, at most ${most}`);
		assert.equal(inOutcome, 0, `src/outcome.ts holds ${literal}`);
	}
});

// The author's untyped refusals, which `failureOf` maps to UNTYPED (exit code 1) until R-082 types them. The count at
// R-013's parent, less the sites R-013 typed as LimenError: the four parse errors of src/commands/flags.ts (BAD_FLAG)
// and ten checks of src/integrations/github-poller.ts (GITHUB_CONFIG): the six before the poll's loop, the two in
// `appJwt`, the one in `privatePath` and the one in `installationToken`.
const UNTYPED_THROWS = 275 - 14;
test("T-01: the untyped throw new Error( sites in src/ and hook/ stay at most their baseline count, less the typed ones", async () => {
	const [all] = await occurrences(["src", "hook"], "throw new Error(", "src/outcome.ts");
	assert.ok(all <= UNTYPED_THROWS, `${all} sites of throw new Error(, at most ${UNTYPED_THROWS}`);
});

/** The folders whose code runs as Limen. */
const RUNTIME = ["src", "hook", "bin", "seat"] as const;

/** The text of each file below `folders` that git knows and the working tree holds, by its path from the root. */
async function knownSources(folders: readonly string[]): Promise<ReadonlyArray<{ path: string; text: string }>> {
	const paths = (await knownFiles(root))
		.map((path) => relative(root, path))
		.filter((path) => folders.some((folder) => path.startsWith(`${folder}/`)));
	return Promise.all(paths.map(async (path) => ({ path, text: await readFile(join(root, path), "utf8") })));
}

// T-27 (2): data from outside becomes a typed value only in src/boundary.ts. A ratchet until R-082 brings the count to
// zero: the 41 sites at R-015's commit, the parent of R-016, less the 3 that R-016 moved into src/boundary.ts (the
// readers of src/outcome.ts, src/project/limits.ts and `startGate` in src/runtime/start-queue.ts).
const JSON_PARSE = 41 - 3;
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
// in test/ (R-016 moved no reader that held a cast). Test fixtures use `satisfies`.
const CASTS = { runtime: 75, test: 7 } as const;
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

/** The write sites the scan does not count: the lock primitives until R-019, the LaunchAgent installer until R-032. */
const WRITE_EXCEPTIONS: readonly WriteException[] = [
	{
		path: "src/job/group-cabinet.ts",
		inside: "groupLock",
		primitives: ["writeFile", "writeFile", "rename"],
		ticket: "R-019",
		what: "the group lock's owner file, its reclaim claim and the takeover rename",
	},
	{
		path: "src/integrations/github-poller.ts",
		inside: "project",
		primitives: ["writeFile"],
		ticket: "R-019",
		what: "the poll lock",
	},
	{
		path: "src/project/seat.ts",
		inside: "withSeatLock",
		primitives: ["writeFileSync"],
		ticket: "R-019",
		what: "the seat lock's owner file",
	},
	{
		path: "src/project/seat.ts",
		inside: "releaseSeatLock",
		primitives: ["renameSync"],
		ticket: "R-019",
		what: "the seat lock's release rename",
	},
	{
		path: "src/project/seat.ts",
		inside: "removeAbandonedLock",
		primitives: ["writeFileSync", "renameSync"],
		ticket: "R-019",
		what: "the seat lock's reclaim claim and takeover rename",
	},
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
test("T-25: outside src/atomic-write.ts no file of src/, hook/ or seat/ imports or calls a write primitive or opens a file for writing, except the listed lock and installer sites", async () => {
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

/** The folder of the platform adapter (A-083), the only code that reads the operating system's process and load data. */
const PLATFORM = "src/platform/";

/**
 * Each operating-system read or signal in the code `text`, as `<path>:<line>: <match>`: a `/proc/` path, a `ps`
 * literal (the program a spawn names), a `cpus(` call, and `process.kill`.
 */
function platformCalls(path: string, text: string): string[] {
	return text
		.split("\n")
		.flatMap((line, index) =>
			[...line.matchAll(/\/proc\/|(["'`])ps\1|\bcpus\s*\(|\bprocess\.kill\b/g)].map(
				(match) => `${path}:${index + 1}: ${match[0]}`,
			),
		);
}

test("the platform scan finds a /proc/ path, a ps literal, a cpus call and process.kill, and skips other text", () => {
	const fixture = [
		'readFileSync("/proc/meminfo");',
		'execFile("ps", ["-A"]);',
		"const cores = os.cpus();",
		"process.kill(pid, 0);",
		'const said = "ps discovery and steps";',
		"// the CPUs of the seat",
		"const options = { cpus: 2 };",
		"child.kill();",
	].join("\n");
	assert.deepEqual(platformCalls("fixture.ts", fixture), [
		"fixture.ts:1: /proc/",
		'fixture.ts:2: "ps"',
		"fixture.ts:3: cpus(",
		"fixture.ts:4: process.kill",
	]);
});

// A-083: the platform adapter is an interface with one implementation, Linux; a second operating system is a second
// implementation, so its reads and signals must not be spread over the code that calls them.
test("A-083: outside src/platform/ no file of src/ or hook/ reads /proc/, names ps, calls cpus or signals with process.kill", async () => {
	const found = (await knownSources(["src", "hook"]))
		.filter(({ path }) => !path.startsWith(PLATFORM))
		.flatMap(({ path, text }) => platformCalls(path, text));
	assert.deepEqual(found, []);
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
