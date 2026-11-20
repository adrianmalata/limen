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
// runs one version of the code. A job's finalize path can start a new `bin/limen` (`src/job/record.ts:66`,
// `src/job/group-cabinet.ts:325-326`), which loads what `/opt/limen` holds then, so the guard against a job that runs
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
