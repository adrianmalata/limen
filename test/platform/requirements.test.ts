// The system requirements that the platform adapter declares (src/platform/requirements.ts).
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { test } from "node:test";
import { finalLine, LimenError } from "../../src/outcome.ts";
import { NODE_MAJOR, nodeFailure } from "../../src/platform/requirements.ts";

// bin/limen checks Node before it can load src/, so it holds its own copy of the number; package.json holds a third.
test("bin/limen and package.json require the Node major that the adapter declares", async () => {
	const bin = await readFile(new URL("../../bin/limen", import.meta.url), "utf8");
	const manifest = JSON.parse(await readFile(new URL("../../package.json", import.meta.url), "utf8"));
	assert.deepEqual(
		[Number(/major < (\d+)/.exec(bin)?.[1]), Number(/requires Node\.js (\d+)/.exec(bin)?.[1]), manifest.engines.node],
		[NODE_MAJOR, NODE_MAJOR, `>=${NODE_MAJOR}`],
	);
});

test("NODE_VERSION: the Node probe refuses the major below the declared one with an environment error and passes the declared one", () => {
	const old = nodeFailure(`${NODE_MAJOR - 1}.9.0`);
	assert.deepEqual(
		[old instanceof LimenError && [old.class, old.code], nodeFailure(`${NODE_MAJOR}.0.0`)],
		[["environment", "NODE_VERSION"], undefined],
	);
});

// bin/limen checks Node before it can load src/, so it writes the Node failure itself, with the adapter's words.
test("NODE_VERSION: bin/limen prints the message and the final line of the adapter's Node failure", async () => {
	const bin = await readFile(new URL("../../bin/limen", import.meta.url), "utf8");
	const failure = nodeFailure("unknown");
	assert.ok(failure);
	const version = ["$", "{process.versions.node}"].join("");
	const message = `\`${failure.message.replace("unknown", version)}\``;
	const line = `'${finalLine({ class: failure.class, code: failure.code, next: failure.next })}'`;
	assert.deepEqual([bin.includes(message), bin.includes(line)], [true, true], `${message}\n${line}`);
});
