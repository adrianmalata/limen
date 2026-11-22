// src/job/statistics.ts: the operation of `limen stats`, called directly (T-26 (5)), here the units of its tokens.
import assert from "node:assert/strict";
import { mkdir, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { type TestContext, test } from "node:test";
import { projectStatistics } from "../../src/job/statistics.ts";
import { plant, writeRecord } from "../plant.ts";

type Tokens = {
	readonly input: number;
	readonly cacheWrite: number;
	readonly cacheRead: number;
	readonly output: number;
};

/**
 * The four token cells (input, cache write, cache read, output) of the one row of the report on a project whose one
 * job has a transcript of one assistant message with `tokens`.
 */
async function tokenCells(t: TestContext, tokens: Tokens): Promise<string[]> {
	const p = await plant();
	t.after(() => p.cleanup());
	const dir = join(p.root, ".limen", "jobs", "2026-11-02-worker-1a2b3c4d");
	await writeRecord(dir);
	const message = { role: "assistant", content: [], provider: "anthropic", model: "claude-opus-5-5", usage: tokens };
	const timestamp = "2026-11-02T10:10:00.000Z";
	await mkdir(join(dir, "session"));
	await writeFile(
		join(dir, "session", "2026-11-02T10-00-00-000Z_0b1c.jsonl"),
		`${JSON.stringify({ type: "message", id: "a", parentId: null, timestamp, message })}\n`,
	);
	// The heading, the line of headers, then the row; its cells stand at least two spaces apart.
	const [, , row] = (await projectStatistics(p.root)).split("\n");
	return (row ?? "").trim().split(/ {2,}/).slice(-4);
}

test("the decimal of a token count follows its rounded value: 9,949 tokens are 9.9k, and 9,950 to 10,000 are 10k", async (t) => {
	const cells = await tokenCells(t, { input: 9_949, cacheWrite: 9_950, cacheRead: 9_999, output: 10_000 });
	assert.deepEqual(cells, ["9.9k", "10k", "10k", "10k"]);
});

test("the unit of a token count follows its rounded value: 99,499 tokens are 99k, and 99,500 to 100,000 are 0.1M", async (t) => {
	const cells = await tokenCells(t, { input: 99_499, cacheWrite: 99_500, cacheRead: 99_999, output: 100_000 });
	assert.deepEqual(cells, ["99k", "0.1M", "0.1M", "0.1M"]);
});
