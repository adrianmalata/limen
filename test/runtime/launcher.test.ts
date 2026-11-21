// src/runtime/launcher.ts: a run of Limen's CLI gives its final line, read past the text for people before it.
import assert from "node:assert/strict";
import { chmod, mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { type TestContext, test } from "node:test";
import { runLimen } from "../../src/runtime/launcher.ts";

/** A stand-in for the CLI at another path, as the GitHub poller names it: a script that prints `body`'s lines. */
async function standIn(t: TestContext, body: string): Promise<string> {
	const folder = await mkdtemp(join(tmpdir(), "limen-launcher-"));
	t.after(() => rm(folder, { recursive: true, force: true }));
	const path = join(folder, "limen");
	await writeFile(path, `#!${process.execPath}\n${body}\n`);
	await chmod(path, 0o755);
	return path;
}

test("T-26: a run of this package's CLI returns the final line that ends its help text, and the text with it", () => {
	const ran = runLimen(["--help"], { env: { PATH: process.env.PATH ?? "/usr/bin:/bin", NODE_NO_WARNINGS: "1" } });
	assert.deepEqual(ran.outcome, { class: "ok", code: null, next: null });
	assert.match(ran.output.stdout, /^ {2}limen spawn "task" /m);
});

test("T-26: a run of a CLI at another path reads its final line past the text before it", async (t) => {
	const cli = await standIn(
		t,
		'console.log("said first");\nconsole.log(JSON.stringify({ class: "ok", code: null, next: "limen status" }));',
	);
	const ran = runLimen(["status"], { cli });
	assert.deepEqual(
		[ran.outcome, ran.output.stdout],
		[
			{ class: "ok", code: null, next: "limen status" },
			`said first\n{"class":"ok","code":null,"next":"limen status"}\n`,
		],
	);
});

test("T-26: a run whose process left no final line is an internal failure, which the caller sees as a failed run", async (t) => {
	const cli = await standIn(t, 'console.error("sudo: a password is required");\nprocess.exitCode = 1;');
	const ran = runLimen(["github", "ensure"], { cli });
	assert.deepEqual(
		[ran.outcome, ran.output.stderr],
		[{ class: "internal", code: "INTERNAL", next: null }, "sudo: a password is required\n"],
	);
});
