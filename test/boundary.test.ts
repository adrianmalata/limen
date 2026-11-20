// src/boundary.ts: the validators of data from outside, the JSON reader and its typed error, through the readers too.
import assert from "node:assert/strict";
import { mkdir, mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test, { type TestContext } from "node:test";
import ts from "typescript";
import {
	at,
	type BadData,
	checkValue,
	duration,
	eachField,
	either,
	matching,
	numberIn,
	object,
	oneOf,
	optional,
	parseJson,
	refusedValue,
	string,
	type Validator,
} from "../src/boundary.ts";
import { LimenError } from "../src/outcome.ts";
import { PLANT_LIMITS, plantLimits } from "../src/project/limits.ts";
import { GATE_FILE, startGate } from "../src/runtime/start-queue.ts";
import { withEnvironment } from "./environment.ts";

const FILE = "fixture.json";

/** The typed error `checkValue` gives for `value` read from `FILE`; the test fails when the validator accepts it. */
function refusal<T>(value: unknown, validator: Validator<T>): BadData {
	const read = checkValue(FILE, value, validator);
	assert.ok(read instanceof LimenError, `the validator accepted ${JSON.stringify(value)}`);
	return read;
}

/** The parts of a typed error that a reader of it uses. */
function parts(error: BadData): readonly unknown[] {
	return [error.class, error.code, error.file, error.field, error.expected, error.message];
}

test("string accepts a string and refuses any other value", () => {
	assert.equal(checkValue(FILE, "limen", string), "limen");
	assert.deepEqual(parts(refusal(3, string)), [
		"environment",
		"BAD_DATA",
		FILE,
		"",
		"a string",
		"fixture.json: expected a string, got 3",
	]);
});

test("matching accepts a string of its pattern and refuses another string or a value that is not a string", () => {
	const code = matching(/^[A-Z]+$/, "an upper-case word");
	assert.equal(checkValue(FILE, "BAD", code), "BAD");
	assert.equal(refusal("bad", code).message, 'fixture.json: expected an upper-case word, got "bad"');
	assert.equal(refusal(0, code).expected, "an upper-case word");
});

test("numberIn keeps its bounds: an integer of at least 1, and a number from 0 to 100", () => {
	const count = numberIn({ integer: true, min: 1 });
	const percent = numberIn({ min: 0, max: 100 });
	assert.deepEqual(
		[checkValue(FILE, 1, count), checkValue(FILE, 0, percent), checkValue(FILE, 99.5, percent)],
		[1, 0, 99.5],
	);
	for (const value of [0, 1.5, -3, "40", 2 ** 53]) {
		assert.equal(refusal(value, count).expected, "an integer of at least 1", String(value));
	}
	for (const value of [-1, 100.5, "50", null]) {
		assert.equal(refusal(value, percent).expected, "a number from 0 to 100", String(value));
	}
});

test("oneOf accepts each of its literals and refuses any other value, naming them all", () => {
	assert.equal(checkValue(FILE, "off", oneOf(["off"])), "off");
	assert.equal(checkValue(FILE, 0, oneOf([0])), 0);
	assert.equal(refusal("on", oneOf(["off"])).message, 'fixture.json: expected "off", got "on"');
	assert.equal(refusal(0, oneOf(["a", "b", "c"])).expected, 'one of "a", "b" or "c"');
});

test("optional accepts a field that is not there and checks one that is", () => {
	assert.equal(checkValue(FILE, undefined, optional(string)), undefined);
	assert.equal(checkValue(FILE, "x", optional(string)), "x");
	assert.equal(refusal(null, optional(string)).expected, "a string");
});

test("object gives an object's fields by name and refuses null, an array and a value of another kind", () => {
	const fields = checkValue(FILE, { a: 1, b: "two" }, object());
	assert.ok(fields instanceof Map, String(fields));
	assert.deepEqual(
		[...fields],
		[
			["a", 1],
			["b", "two"],
		],
	);
	for (const value of [null, [1], "{}", 2]) {
		assert.equal(refusal(value, object()).expected, "an object", JSON.stringify(value));
	}
});

test("object with known fields refuses an unknown field and names it as the field", () => {
	assert.deepEqual(parts(refusal({ a: 1, extra: true }, object(["a", "b"]))), [
		"environment",
		"BAD_DATA",
		FILE,
		"extra",
		"one of the fields a or b",
		"fixture.json: extra: expected one of the fields a or b, got true",
	]);
});

test("a field that holds a newline is escaped in the message as the value is, so a log line stays one line", () => {
	const error = refusal({ "time\nout": "2h" }, object(["timeout"]));
	assert.deepEqual(
		[error.field, error.message],
		["time\nout", 'fixture.json: time\\nout: expected one of the fields timeout, got "2h"'],
	);
});

test("DEL, the C1 controls, U+2028 and U+2029 are escaped in the field and the value of a message", () => {
	const raw = String.fromCodePoint(0x7f, 0x85, 0x9b, 0x2028, 0x2029);
	const shown = "\\u007f\\u0085\\u009b\\u2028\\u2029";
	const error = refusal({ [`k${raw}`]: `v${raw}` }, object(["k"]));
	assert.equal(error.message, `fixture.json: k${shown}: expected one of the fields k, got "v${shown}"`);
	const raws = [...error.message]
		.map((char) => char.codePointAt(0) ?? 0)
		.filter((code) => code < 0x20 || (code >= 0x7f && code <= 0x9f) || code === 0x2028 || code === 0x2029);
	assert.deepEqual(raws, []);
});

test("a validator of a field inside a field names the whole path of the value it refuses", () => {
	const job: Validator<string> = (value, field) => string(object(["job"])(value, field).get("job"), at(field, "job"));
	const ids: Validator<string> = (value, field) => job(object(["ids"])(value, field).get("ids"), at(field, "ids"));
	assert.equal(refusal({ ids: { job: 1 } }, ids).message, "fixture.json: ids.job: expected a string, got 1");
});

test("either accepts what one of its validators accepts, and names both expectations when neither does", () => {
	const gate = either(oneOf(["off"]), object());
	assert.equal(checkValue(FILE, "off", gate), "off");
	assert.ok(checkValue(FILE, { cpuIdle: 1 }, gate) instanceof Map);
	assert.equal(refusal([1], gate).message, 'fixture.json: expected "off" or an object, got [1]');
});

test("either passes on a mismatch inside a field of the value instead of naming both expectations", () => {
	const error = refusal({ b: 1 }, either(oneOf(["off"]), object(["a"])));
	assert.deepEqual([error.field, error.expected], ["b", "one of the fields a"]);
});

test("duration reads the --timeout form as milliseconds and refuses a value without a unit or not a string", () => {
	assert.deepEqual(
		["500ms", "90s", "20m", "2h"].map((value) => checkValue(FILE, value, duration)),
		[500, 90_000, 20 * 60_000, 2 * 3_600_000],
	);
	for (const value of ["60", "0s", "1d", 60, ["60s"]]) {
		assert.equal(refusal(value, duration).expected, "a duration such as 90s, 20m or 2h", JSON.stringify(value));
	}
});

test("eachField keeps every valid field and gives a typed error for each invalid or unknown one", () => {
	const fields = checkValue(FILE, { a: "1s", b: "x", c: 3 }, object());
	assert.ok(fields instanceof Map);
	const { values, ignored } = eachField(FILE, fields, { a: duration, b: duration });
	assert.deepEqual(values, { a: 1_000 });
	assert.deepEqual(
		ignored.map((error) => [error.field, error.expected]),
		[
			["b", "a duration such as 90s, 20m or 2h"],
			["c", "one of the fields a or b"],
		],
	);
});

test("parseJson gives the typed value of a valid text", () => {
	const fields = parseJson(FILE, '{ "prepare": "20m", "toolCalls": 40 }\n', object());
	assert.ok(fields instanceof Map, String(fields));
	assert.deepEqual(eachField(FILE, fields, { prepare: duration, toolCalls: numberIn({ integer: true, min: 1 }) }), {
		values: { prepare: 20 * 60_000, toolCalls: 40 },
		ignored: [],
	});
});

test("T-27: a text that is not JSON gives the typed error with the file, an empty field and the expectation JSON", () => {
	const read = parseJson(FILE, "{ prepare: 20m }", object());
	assert.ok(read instanceof LimenError, String(read));
	assert.deepEqual(parts(read), [
		"environment",
		"BAD_DATA",
		FILE,
		"",
		"JSON",
		'fixture.json: expected JSON, got "{ prepare: 20m }"',
	]);
	assert.ok(read.cause instanceof SyntaxError, String(read.cause));
});

test("the message shows at most 40 characters of the value it got, and a missing value as nothing", () => {
	const long = "x".repeat(60);
	assert.equal(refusal(long, numberIn({})).message, `fixture.json: expected a number, got "${"x".repeat(39)}…`);
	assert.equal(refusal(undefined, string).message, "fixture.json: expected a string, got nothing");
});

test("refusedValue gives the typed error of a check outside the module, with its file, field and expectation", () => {
	const error = refusedValue("Pi event tool_call", { field: "toolName", expected: "a string", got: 3 });
	assert.deepEqual(parts(error), [
		"environment",
		"BAD_DATA",
		"Pi event tool_call",
		"toolName",
		"a string",
		"Pi event tool_call: toolName: expected a string, got 3",
	]);
});

test("checkValue with uncut shows a long value in full", () => {
	const long = "x".repeat(60);
	const read = checkValue(FILE, long, numberIn({}), { uncut: true });
	assert.ok(read instanceof LimenError, String(read));
	assert.equal(read.message, `fixture.json: expected a number, got "${long}"`);
});

// T-18: one word per thing. In src/boundary.ts "whole" names the whole value a validator reads, and nothing else.
test("the word whole in src/boundary.ts names only the whole value", async () => {
	const text = await readFile(new URL("../src/boundary.ts", import.meta.url), "utf8");
	const uses = text
		.split("\n")
		.flatMap((line, index) => (/\bwhole\b/.test(line) ? [`${index + 1}: ${line.trim()}`] : []));
	assert.ok(uses.length > 0, "src/boundary.ts names the whole value");
	assert.deepEqual(
		uses.filter((use) => use.split(/\bwhole\b/).length - 1 !== use.split(/\bthe whole value\b/).length - 1),
		[],
	);
});

/** A project folder in the OS temporary folder whose limits file holds `text`. */
async function project(t: TestContext, text: string): Promise<string> {
	const root = await mkdtemp(join(tmpdir(), "limen-boundary-"));
	t.after(() => rm(root, { recursive: true, force: true }));
	await mkdir(join(root, ".agents/limen"), { recursive: true });
	await writeFile(join(root, PLANT_LIMITS), text);
	return root;
}

test("T-27: a damaged limits.json gives a typed error with the file, the field and the expectation", async (t) => {
	const root = await project(t, '{ "prepare": "20 minutes", "toolStall": "15m" }\n');
	const { limits, ignored } = plantLimits(root);
	assert.deepEqual(limits, { toolStall: 15 * 60_000 });
	assert.deepEqual(ignored.map(parts), [
		[
			"environment",
			"BAD_DATA",
			".agents/limen/limits.json",
			"prepare",
			"a duration such as 90s, 20m or 2h",
			'.agents/limen/limits.json: prepare: expected a duration such as 90s, 20m or 2h, got "20 minutes"',
		],
	]);
});

test("T-27: a damaged start-gate.json gives a typed error with the file, the field and the expectation", async (t) => {
	const home = await mkdtemp(join(tmpdir(), "limen-boundary-seat-"));
	t.after(() => rm(home, { recursive: true, force: true }));
	await mkdir(join(home, ".limen"));
	await writeFile(join(home, ".limen", GATE_FILE), '{ "cpuIdle": 150, "memoryFree": 30 }\n');
	withEnvironment(t, { LIMEN_HOME: home });
	const { gate, ignored } = startGate();
	assert.deepEqual(gate, { cpuIdle: 25, memoryFree: 30, settleMs: 60_000 });
	assert.deepEqual(ignored.map(parts), [
		[
			"environment",
			"BAD_DATA",
			"start-gate.json",
			"cpuIdle",
			"a number from 0 to 100",
			"start-gate.json: cpuIdle: expected a number from 0 to 100, got 150",
		],
	]);
});

/**
 * The modules the TypeScript `text` loads at run time, in order: each `import` and `export … from` that is not
 * type-only, and each `import(…)` with a literal path. Type-only forms are erased before the code runs.
 */
function runtimeImports(text: string): string[] {
	const source = ts.createSourceFile("imports.ts", text, ts.ScriptTarget.Latest, true, ts.ScriptKind.TS);
	const modules: string[] = [];
	const visit = (node: ts.Node): void => {
		if (ts.isImportDeclaration(node) && !node.importClause?.isTypeOnly && ts.isStringLiteral(node.moduleSpecifier)) {
			modules.push(node.moduleSpecifier.text);
		} else if (ts.isExportDeclaration(node) && !node.isTypeOnly && node.moduleSpecifier !== undefined) {
			modules.push(
				ts.isStringLiteral(node.moduleSpecifier) ? node.moduleSpecifier.text : node.moduleSpecifier.getText(),
			);
		} else if (ts.isCallExpression(node) && node.expression.kind === ts.SyntaxKind.ImportKeyword) {
			const [path] = node.arguments;
			modules.push(path !== undefined && ts.isStringLiteral(path) ? path.text : node.getText(source));
		}
		ts.forEachChild(node, visit);
	};
	visit(source);
	return modules;
}

test("the import scan finds a side-effect import, an export from a module and a dynamic import, and skips type-only imports", () => {
	const fixture = [
		'import { readFileSync } from "node:fs";',
		'import type { Outcome } from "./types.ts";',
		'import "./side.ts";',
		'export { at } from "./re.ts";',
		'export * from "./all.ts";',
		'export type { Ids } from "./ids.ts";',
		'const lazy = await import("./lazy.ts");',
	].join("\n");
	assert.deepEqual(runtimeImports(fixture), ["node:fs", "./side.ts", "./re.ts", "./all.ts", "./lazy.ts"]);
});

// T-27 (2), T-12: the boundary runs in every Limen process, so it brings in no package and none of Limen's own modules
// beyond the error type and the duration form.
test("src/boundary.ts imports only node: modules, src/outcome.ts and src/job/job.ts", async () => {
	const text = await readFile(new URL("../src/boundary.ts", import.meta.url), "utf8");
	assert.deepEqual(
		runtimeImports(text).filter((path) => !path.startsWith("node:")),
		["./job/job.ts", "./outcome.ts"],
	);
});

/** Identifiers that T-29 (2) allows once per test name: a rule or decision ID, and an error code such as BAD_DATA. */
const IDENTIFIER = /\b(?:[ADRT]-\d{2,3}|[A-Z][A-Z0-9]*(?:_[A-Z0-9]+)+)\b/g;

test("each test name of this file holds at most one identifier", async () => {
	const text = await readFile(new URL(import.meta.url), "utf8");
	const names = [...text.matchAll(/^test\(\s*(["'])(.*?)\1,/gm)].flatMap((match) => (match[2] ? [match[2]] : []));
	assert.ok(names.length > 20, `${names.length} test names found`);
	assert.deepEqual(
		names.filter((name) => (name.match(IDENTIFIER) ?? []).length > 1),
		[],
	);
});
