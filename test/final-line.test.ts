// test/final-line.ts: the tests' reader checks every `next` by the rules of `main`, and every test reads through it.
import assert from "node:assert/strict";
import { readdir, readFile } from "node:fs/promises";
import { join, relative } from "node:path";
import { test } from "node:test";
import { fileURLToPath, pathToFileURL } from "node:url";
import { checkNext, shellWords } from "./final-line.ts";
import { importsOf } from "./imports.ts";

test("the reader's shell words keep a single-quoted part and an escaped character in their word", () => {
	assert.deepEqual(shellWords("limen stop 1a2b3c4d 'not needed'"), ["limen", "stop", "1a2b3c4d", "not needed"]);
	assert.deepEqual(shellWords(`limen steer a1b2c3d4 'it'\\''s done'`), ["limen", "steer", "a1b2c3d4", "it's done"]);
});

// One case per form of a command that `main` runs: a command, a group word or a command with --help, quoted words.
const RUNS = [
	"limen status --all",
	"limen --help",
	"limen ticket --help",
	"limen land --help",
	"limen land 7a2f0b1c --yes",
	"limen stop 1a2b3c4d 'not needed'",
	"limen group status 'a b'",
];
for (const next of RUNS) {
	test(`D-046 (3): the tests' reader passes the next ${JSON.stringify(next)}`, () => {
		assert.doesNotThrow(() => checkNext(next));
	});
}

test("D-046 (3): the tests' reader passes a null next", () => {
	assert.doesNotThrow(() => checkNext(null));
});

// One case per way a `next` fails: prose, a placeholder, an unknown command, a bare group word, a removed name, a
// word the shared parser refuses, a missing word, and an unclosed quote.
const FAILS = {
	prose: "fix the tickets listed above, then run limen ticket check bad",
	"a placeholder": "limen group status <group id>",
	"an unknown command": "limen nosuch",
	"a bare group word": "limen ticket",
	"a removed name": "limen jobs",
	"an unknown flag": "limen land a1b2c3d4 --ontoo main",
	"a missing argument": "limen land",
	"an unclosed quote": "limen stop a1b2c3d4 'not needed",
};
for (const [what, next] of Object.entries(FAILS)) {
	test(`D-046 (3): the tests' reader fails a next that is ${what}`, () => {
		assert.throws(() => checkNext(next), assert.AssertionError);
	});
}

const TESTS = fileURLToPath(new URL(".", import.meta.url));
/** src/outcome.ts, whose reading functions every test but `OWN_READERS` reaches only through the tests' reader. */
const OUTCOME = fileURLToPath(new URL("../src/outcome.ts", import.meta.url));
/** The reader itself and the unit test of the client function it wraps read the line through src/outcome.ts. */
const OWN_READERS = ["final-line.ts", "outcome.test.ts"];
/** The functions of src/outcome.ts that read a final line; every other test reaches them only through the reader. */
const READERS = ["readOutcome", "outputText"];

/**
 * The file that the module path `module` in the code of `file` names, as Node resolves a relative path, an absolute
 * path or a `file:` URL: against the file, with its `.` and `..` segments applied and with no query or fragment,
 * since `outcome.ts?x` loads the same file. A bare name, which Node looks up in node_modules, and a URL of another
 * scheme, such as `node:fs`, name no file of the repository.
 */
function fileOf(module: string, file: string): string | undefined {
	if (!/^\.{0,2}\//.test(module) && !URL.canParse(module)) {
		return undefined;
	}
	const url = new URL(module, pathToFileURL(file));
	url.search = "";
	url.hash = "";
	return url.protocol === "file:" ? fileURLToPath(url) : undefined;
}

/**
 * The code of each import in `text`, the code of the file `file`, that reaches a reader of src/outcome.ts: a named
 * import or re-export that takes `readOutcome` or `outputText` under any alias, and each import of another form,
 * since a namespace, a star re-export and an `import()` give the file the whole module (a side-effect import is
 * refused with them). An `import()` whose path the code computes as it runs is beyond this scan, since only then does
 * the path exist.
 */
function readerImports(text: string, file: string): string[] {
	return importsOf(file, text)
		.filter(({ module }) => module !== undefined && fileOf(module, file) === OUTCOME)
		.filter(({ form, names }) => form !== "named" || names.some((name) => READERS.includes(name)))
		.map(({ code }) => code);
}

/** A test file of this folder for the fixtures, so that their paths resolve as they would from a test file here. */
const FIXTURE = join(TESTS, "fixture.test.ts");
// One case per import form that reaches a reader, and one per way of writing one that a text pattern does not read.
const REFUSED = {
	"a named import of readOutcome": 'import { readOutcome } from "../src/outcome.ts";',
	"a named import of outputText under an alias, over several lines":
		"import {\n\tEXIT_CODES,\n\toutputText as text,\n} from '../src/outcome.ts';",
	"a named re-export of readOutcome": 'export { readOutcome as outcomeOf } from "../src/outcome.ts";',
	"a namespace import": 'import * as outcome from "../src/outcome.ts";',
	"a namespace import of the types": 'import type * as outcome from "../src/outcome.ts";',
	"a star re-export": 'export * from "../src/outcome.ts";',
	"an import() of a literal path": "const outcome = await import(`../src/outcome.ts`);",
	"a side-effect import": 'import "../src/outcome.ts";',
	"a named import with a comment inside its braces": 'import { /* } */ readOutcome } from "../src/outcome.ts";',
	"a namespace import with a comment after import": 'import /* x */ * as outcome from "../src/outcome.ts";',
	"a named import of readOutcome by its string name": 'import { "readOutcome" as read } from "../src/outcome.ts";',
	"a named import whose path has a ./ segment": 'import { readOutcome } from "../src/./outcome.ts";',
	"a named import whose path has a query": 'import { readOutcome } from "../src/outcome.ts?x";',
	"an import() of a URL of a literal path against import.meta.url":
		'const outcome = await import(new URL("../src/outcome.ts", import.meta.url).href);',
};
for (const [what, source] of Object.entries(REFUSED)) {
	test(`D-046 (3): the scan of test files refuses ${what}, which reaches the readers of src/outcome.ts`, () => {
		assert.equal(readerImports(source, FIXTURE).length, 1, source);
	});
}

test("D-046 (3): the scan of test files passes a named import of LimenError from src/outcome.ts", () => {
	assert.deepEqual(readerImports('import { LimenError } from "../src/outcome.ts";', FIXTURE), []);
});

async function testFiles(dir: string): Promise<string[]> {
	const entries = await readdir(dir, { withFileTypes: true });
	const nested = await Promise.all(
		entries.map((entry) => (entry.isDirectory() ? testFiles(join(dir, entry.name)) : [join(dir, entry.name)])),
	);
	return nested.flat().filter((path) => /\.(ts|mts|mjs)$/.test(path));
}

test("D-046 (3): no test file but the reader and the client function's own test reads the final line through src/outcome.ts", async () => {
	const found: string[] = [];
	for (const path of await testFiles(TESTS)) {
		const name = relative(TESTS, path);
		if (!OWN_READERS.includes(name)) {
			found.push(...readerImports(await readFile(path, "utf8"), path).map((code) => `${name}: ${code}`));
		}
	}
	assert.deepEqual(found, []);
});
