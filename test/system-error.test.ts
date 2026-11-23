// src/system-error.ts: the one check of the code of a thrown object, a system error's or a tool's.
import assert from "node:assert/strict";
import { mkdtemp, readFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";
import { hasCode } from "../src/system-error.ts";

test("hasCode reads the code of a Node system error, such as ENOENT for a file that does not exist", async (t) => {
	const dir = await mkdtemp(join(tmpdir(), "limen-system-error-"));
	t.after(() => rm(dir, { recursive: true, force: true }));
	const error = await readFile(join(dir, "missing")).then(
		() => assert.fail("a file that does not exist was read"),
		(caught: unknown) => caught,
	);
	assert.deepEqual([hasCode(error, "ENOENT"), hasCode(error, "EEXIST")], [true, false]);
});

test("hasCode reads the code of a tool's coded error, such as Herdr's tab_not_found", () => {
	const error = Object.assign(new Error("tab not found"), { code: "tab_not_found" });
	assert.deepEqual([hasCode(error, "tab_not_found"), hasCode(error, "ENOENT")], [true, false]);
});

test("hasCode finds no code on a value that is no object: a string, a number, null or undefined", () => {
	for (const value of ["ENOENT", 2, null, undefined]) {
		assert.equal(hasCode(value, "ENOENT"), false, String(value));
	}
});
