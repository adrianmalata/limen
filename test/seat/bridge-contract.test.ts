// seat/bridge-contract.ts: a Claude Code session file against the view of the Pi session's first call, on synthetic
// files this test writes (no recorded session, T-31).
import assert from "node:assert/strict";
import { mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { type TestContext, test } from "node:test";
import { runBridgeContract } from "../../seat/bridge-contract.ts";

const TASK = "Do the task.";
const CUE = "<limen-project-context>\n\ncue\n\n</limen-project-context>";
/** The prompt the bridge sends for the Pi session below: the task, then the cue, as one prompt (E-14). */
const PROMPT = `${TASK}\n\n${CUE}`;

/** One entry of a Pi 1.5.1 session file (`session-manager.d.ts`). */
function piEntry(type: string, fields: Record<string, unknown>): string {
	return JSON.stringify({
		type,
		id: type.slice(0, 8),
		parentId: null,
		timestamp: "2026-11-26T10:00:00.000Z",
		...fields,
	});
}

/** A new job's Pi session: its header, the task, the cue as a custom message, and the reply. */
const PI_SESSION = [
	JSON.stringify({ type: "session", version: 3, id: "s1", timestamp: "2026-11-26T10:00:00.000Z", cwd: "/work" }),
	piEntry("message", { message: { role: "user", content: [{ type: "text", text: TASK }], timestamp: 1 } }),
	piEntry("custom_message", { customType: "limen-project-context", content: CUE, display: false }),
	piEntry("message", {
		message: { role: "assistant", content: [{ type: "text", text: "ok" }], provider: "p", model: "m", timestamp: 2 },
	}),
];

/** A record of a Claude Code session file: the SDK writes a string prompt as one text block (D-119). */
function codeRecord(type: string, content?: unknown): string {
	const message = content === undefined ? {} : { message: { role: type, content } };
	return JSON.stringify({ type, uuid: `u-${type}`, sessionId: "c1", ...message });
}

/** Writes the two files into a folder of the OS temporary folder and runs the contract on them. */
async function contract(t: TestContext, code: readonly string[]) {
	const dir = await mkdtemp(join(tmpdir(), "limen-bridge-contract-"));
	t.after(() => rm(dir, { recursive: true, force: true }));
	const [pi, claude] = [join(dir, "pi.jsonl"), join(dir, "claude.jsonl")];
	await writeFile(pi, `${PI_SESSION.join("\n")}\n`);
	await writeFile(claude, `${code.join("\n")}\n`);
	return { ...(await runBridgeContract({ args: [pi, claude] })), claude };
}

/** The contract's one line on a pass, with the two paths as placeholders. */
const passed = (run: { readonly stdout: string; readonly claude: string }) =>
	run.stdout.replace(run.claude, "<claude>").replace(/\S+pi\.jsonl/, "<pi>");

test("a Claude Code session whose first user record is the view's prompt passes with one line naming the bytes", async (t) => {
	const run = await contract(t, [
		codeRecord("user", [{ type: "text", text: PROMPT }]),
		codeRecord("assistant", [{ type: "text", text: "ok" }]),
	]);
	assert.deepEqual(
		[run.code, run.stderr, passed(run)],
		[
			0,
			"",
			`bridge contract: the first user record of <claude> equals the view of <pi>, ${Buffer.byteLength(PROMPT)} bytes compared; skipped no record\n`,
		],
	);
});

test("a record of a type the contract does not read is skipped and named by its count", async (t) => {
	const run = await contract(t, [
		codeRecord("summary"),
		codeRecord("user", PROMPT),
		codeRecord("file-history-snapshot"),
		codeRecord("summary"),
	]);
	assert.deepEqual(
		[run.code, passed(run).split("; ")[1]],
		[0, "skipped 3 records: 2 summary, 1 file-history-snapshot\n"],
	);
});

test("a first user record with text the view lacks fails with exit 1 at the first byte that differs", async (t) => {
	const run = await contract(t, [codeRecord("user", `${TASK}\n\nextra\n\n${CUE}`)]);
	assert.deepEqual([run.code, /at byte (\d+):/.exec(run.stderr)?.[1]], [1, String(Buffer.byteLength(`${TASK}\n\n`))]);
});

test("a first user record that lacks text the view holds fails with exit 1 where it ends", async (t) => {
	const run = await contract(t, [codeRecord("user", [{ type: "text", text: TASK }])]);
	assert.deepEqual([run.code, /at byte (\d+):/.exec(run.stderr)?.[1]], [1, String(Buffer.byteLength(TASK))]);
});

test("BAD_DATA: a line of the Claude Code file that is not JSON ends the contract with exit 4, naming the line", async (t) => {
	const run = await contract(t, [codeRecord("user", PROMPT), "{ not json"]);
	assert.deepEqual([run.code, run.stderr.includes(`${run.claude}:2: expected JSON`)], [4, true]);
});
