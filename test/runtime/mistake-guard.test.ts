// src/runtime/mistake-guard.ts: which Bash command the coordinator's session refuses as a sleep of 30 s or more, and the
// wake sentence that ends its reason and that the coordinator's context message holds.
import assert from "node:assert/strict";
import { mkdtemp, readFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";
import { contextMessage } from "../../src/runtime/context-message.ts";
import { sleepRefusal, WAKE_SENTENCE } from "../../src/runtime/mistake-guard.ts";

/** The commands of `commands` that the guard refuses, in their order. */
function refused(commands: readonly string[]): string[] {
	return commands.filter((command) => sleepRefusal(command) !== undefined);
}

// T-34 (1), z. 12: the reason is what the model reads in the call's error result, so it says what to do instead.
test("T-34: sleep 240 is refused with a reason that names the sleep and the 30 s rule, then the wake sentence verbatim", () => {
	const reason = sleepRefusal("sleep 240");
	assert.deepEqual(
		[reason, WAKE_SENTENCE, reason?.endsWith(` ${WAKE_SENTENCE}`)],
		[
			"Refused `sleep 240`: the coordinator's session runs no sleep of 30 s or more, or of a length Limen cannot read. Limen wakes you when a job ends; end your turn instead of waiting.",
			"Limen wakes you when a job ends; end your turn instead of waiting.",
			true,
		],
	);
});

test("T-34: a sleep shorter than 30 s passes: sleep 5 and sleep 29", () => {
	assert.deepEqual(refused(["sleep 5", "sleep 29"]), []);
});

// GNU sleep waits for the sum of its arguments, each a number with an optional unit s, m, h or d, or `infinity`.
test("T-34: a sleep is refused when the sum of its arguments, each read with its unit, is 30 s or more", () => {
	const longest = ["sleep 30", "sleep 1m", "sleep 0.5m", "sleep 10 25", "sleep 1h", "sleep infinity"];
	const shorter = ["sleep 29.9", "sleep 0.4m", "sleep 10 19", "sleep 29s"];
	assert.deepEqual(refused([...longest, ...shorter]), longest);
});

// M-05's definition of a command start (adrian-rebuild/tools/same-task.mjs), so the guard refuses what the metric counts.
test("T-34: a sleep at a command's start is refused after ;, &&, |, $(, do, nohup and timeout 5", () => {
	const commands = [
		"cd spec; sleep 240",
		"limen status && sleep 240",
		"true | sleep 240",
		"waited=$(sleep 240)",
		"while true; do sleep 240; done",
		"nohup sleep 240",
		"timeout 5 sleep 240",
	];
	assert.deepEqual(refused(commands), commands);
});

// z. 14: a mistake guard fails closed, so a length it cannot read counts as 30 s or more.
test('T-34: a sleep whose length cannot be read is refused: sleep "$T" and sleep $((N*60))', () => {
	const commands = ['sleep "$T"', "sleep $((N*60))"];
	assert.deepEqual(refused(commands), commands);
});

test("T-34: the word sleep inside another command's quoted argument is no sleep call, so the command passes", () => {
	assert.deepEqual(refused(['git commit -m "fix sleep 60"', "echo 'sleep 300'"]), []);
});

// T-34 (1): the manual keeps the one sentence; the test reads the message the coordinator's session opens with, not a
// file by its name, which a later ticket may change.
test("T-34: the coordinator's context message holds the wake sentence once", async (t) => {
	const root = await mkdtemp(join(tmpdir(), "limen-mistake-guard-"));
	t.after(() => rm(root, { recursive: true, force: true }));
	const message = contextMessage(root, { session: "coordinator" });
	assert.equal(message.split(WAKE_SENTENCE).length - 1, 1);
});

// T-38, AC-11: a refusal leaves no trace; a module that imports nothing can start no process and touch no file.
test("the mistake guard's module imports no module, so it starts no process, reads no file and writes nothing", async () => {
	const source = await readFile(fileURLToPath(new URL("../../src/runtime/mistake-guard.ts", import.meta.url)), "utf8");
	assert.deepEqual(source.match(/^\s*import\b.*$/gm), null);
});
