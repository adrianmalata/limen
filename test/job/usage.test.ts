// The transcript reader of src/job/usage.ts: the tokens by class of the entries of a job's own transcript that carry a
// Pi usage, each line it could not read, named by its file and line, and the model line `limen show` builds from them.
import assert from "node:assert/strict";
import { mkdir, mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { type TestContext, test } from "node:test";
import type { BadData } from "../../src/boundary.ts";
import { modelLine, readSessionUsage, type SessionUsage } from "../../src/job/usage.ts";

/**
 * When the job of these tests started, as its record holds it (`startedAt`): a turn written before it is a parent's,
 * which a continuation copied.
 */
const START = "2026-11-14T10:00:00.000Z";
const FILE = "2026-11-14T09-00-00-000Z_0b1c.jsonl";

/** A job folder in the OS temporary folder; removed after the test. */
async function jobFolder(t: TestContext): Promise<string> {
	const dir = await mkdtemp(join(tmpdir(), "limen-usage-"));
	t.after(() => rm(dir, { recursive: true, force: true }));
	return dir;
}

/** Writes `lines` as one transcript of the job folder `dir`, as Pi writes it below `--session-dir`. */
async function transcript(dir: string, lines: readonly string[]): Promise<string> {
	await mkdir(join(dir, "session"), { recursive: true });
	const path = join(dir, "session", FILE);
	await writeFile(path, `${lines.join("\n")}\n`);
	return path;
}

/** A Pi `Usage` (pi-ai) with its four classes; the total and the cost are there as Pi writes them, and not read. */
function usage(input: number, output: number, cacheRead: number, cacheWrite: number) {
	const cost = { input: 0, output: 0, cacheRead: 0, cacheWrite: 0, total: 0 };
	return { input, output, cacheRead, cacheWrite, totalTokens: input + output + cacheRead + cacheWrite, cost };
}

/** A session entry of Pi 1.5.1 (`session-manager.d.ts`) as one line. */
function entry(type: string, timestamp: string, fields: Record<string, unknown>): string {
	return JSON.stringify({ type, id: `e-${timestamp}`, parentId: null, timestamp, ...fields });
}

function assistant(timestamp: string, model: string, tokens: ReturnType<typeof usage>): string {
	const message = { role: "assistant", content: [], api: "anthropic-messages", provider: "p", model, usage: tokens };
	return entry("message", timestamp, { message: { ...message, stopReason: "stop", timestamp: Date.parse(timestamp) } });
}

/** What a test compares of a line the reader could not read: where it is and what was wrong. */
function named({ file, field, expected, code }: BadData) {
	return { file, field, expected, code };
}

const HEADER = JSON.stringify({
	type: "session",
	version: 3,
	id: "0b1c",
	timestamp: "2026-11-14T09:00:00.000Z",
	cwd: "/work",
});

test("a job's tokens include those of each compaction that carries a usage, beside its assistant messages", async (t) => {
	const dir = await jobFolder(t);
	await transcript(dir, [
		HEADER,
		assistant("2026-11-14T10:00:02.000Z", "m", usage(1, 10, 100, 1000)),
		entry("compaction", "2026-11-14T10:05:00.000Z", {
			summary: "the work so far",
			firstKeptEntryId: "e-2026-11-14T10:00:02.000Z",
			tokensBefore: 900_000,
			usage: usage(2, 20, 200, 2000),
		}),
		entry("compaction", "2026-11-14T10:06:00.000Z", {
			summary: "an extension's summary, with no usage",
			firstKeptEntryId: "e-2026-11-14T10:00:02.000Z",
			tokensBefore: 10,
			fromHook: true,
		}),
	]);
	assert.deepEqual(readSessionUsage(dir, START), {
		usage: { served: ["p/m"], turns: 1, input: 3, output: 30, cacheRead: 300, cacheWrite: 3000 },
		unread: [],
	});
});

test("a job's tokens leave out a parent turn that its transcript copied from before the job's start", async (t) => {
	const dir = await jobFolder(t);
	await transcript(dir, [
		HEADER,
		assistant("2026-11-14T09:30:00.000Z", "parent", usage(1000, 1000, 1000, 1000)),
		entry("message", "2026-11-14T10:00:01.000Z", {
			message: { role: "user", content: "go", timestamp: Date.parse(START) },
		}),
		assistant("2026-11-14T10:00:02.000Z", "m", usage(1, 10, 100, 1000)),
	]);
	assert.deepEqual(readSessionUsage(dir, START), {
		usage: { served: ["p/m"], turns: 1, input: 1, output: 10, cacheRead: 100, cacheWrite: 1000 },
		unread: [],
	});
});

test("a job whose record holds no start counts every entry of its transcript, one written before any start too", async (t) => {
	const dir = await jobFolder(t);
	await transcript(dir, [
		HEADER,
		assistant("2026-11-14T09:30:00.000Z", "parent", usage(1000, 1000, 1000, 1000)),
		assistant("2026-11-14T10:00:02.000Z", "m", usage(1, 10, 100, 1000)),
	]);
	assert.deepEqual(readSessionUsage(dir, null), {
		usage: { served: ["p/parent", "p/m"], turns: 2, input: 1001, output: 1010, cacheRead: 1100, cacheWrite: 2000 },
		unread: [],
	});
});

test("a transcript line cut in the middle is named by its file and line, and the job's other lines still count", async (t) => {
	const dir = await jobFolder(t);
	const good = assistant("2026-11-14T10:00:02.000Z", "m", usage(1, 10, 100, 1000));
	// A line cut in the middle, as a write that stopped would leave it.
	const path = await transcript(dir, [
		HEADER,
		good,
		good.slice(0, 60),
		assistant("2026-11-14T10:00:04.000Z", "m", usage(2, 20, 200, 2000)),
	]);
	const read = readSessionUsage(dir, START);
	assert.deepEqual(
		[read.usage, read.unread.map(named)],
		[
			{ served: ["p/m"], turns: 2, input: 3, output: 30, cacheRead: 300, cacheWrite: 3000 },
			[{ file: `${path}:3`, field: "", expected: "JSON", code: "BAD_DATA" }],
		],
	);
});

test("a usage whose class is no count of tokens is named by its file, line and field, and the other lines still count", async (t) => {
	const dir = await jobFolder(t);
	const path = await transcript(dir, [
		HEADER,
		assistant("2026-11-14T10:00:02.000Z", "m", usage(1, 10, 100, 1000)),
		assistant("2026-11-14T10:00:03.000Z", "m", { ...usage(1, 10, 100, 1000), input: Number.NaN }),
		assistant("2026-11-14T10:00:04.000Z", "m", usage(2, 20, 200, 2000)),
	]);
	const read = readSessionUsage(dir, START);
	assert.deepEqual(
		[read.usage, read.unread.map(named)],
		[
			{ served: ["p/m"], turns: 2, input: 3, output: 30, cacheRead: 300, cacheWrite: 3000 },
			[{ file: `${path}:3`, field: "message.usage.input", expected: "an integer of at least 0", code: "BAD_DATA" }],
		],
	);
});

test("a job with no session folder has no usage and no line it could not read", async (t) => {
	const dir = await jobFolder(t);
	assert.deepEqual(readSessionUsage(dir, START), { usage: undefined, unread: [] });
});

// Compactions and other entries with a usage count tokens, but only an assistant message says which model served.
test("while no assistant turn served a model, the model line names the requested one with no turn yet", () => {
	const compactions = {
		served: [],
		turns: 0,
		input: 2,
		output: 20,
		cacheRead: 200,
		cacheWrite: 2000,
	} satisfies SessionUsage;
	assert.equal(modelLine("claude-opus-5-5", compactions), "requested claude-opus-5-5; no turn yet");
});
