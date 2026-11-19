// `limen group wait`: its requested time limit and its cap end the wait with one typed failure, never a process exit.
import assert from "node:assert/strict";
import { mkdir, writeFile } from "node:fs/promises";
import { dirname, join } from "node:path";
import { test } from "node:test";
import { waitCapped } from "../../src/commands/group.ts";
import { LimenError, readOutcome } from "../../src/outcome.ts";
import { limen, plant, TICKET } from "../plant.ts";

test("GROUP_WAIT_TIMEOUT: group wait past its --timeout exits 3 with exactly one final line", async (t) => {
	const p = await plant();
	t.after(() => p.cleanup());
	// A running group with no events, as a lead's group start leaves it.
	const now = Date.now();
	const run = {
		id: "wait-group",
		root: p.root,
		feature: dirname(TICKET),
		planningSource: "committed",
		lead: "wait-lead",
		startedAt: now,
		teams: ["team-1"],
		routes: { "team-1": { engine: "pi", provider: "p", model: "m", thinking: "high" } },
		workersPerTeam: 0,
		rounds: ["draft"],
		round: 0,
		deadline: now + 60 * 60_000,
		reserveMs: 60_000,
		stopped: false,
		closed: false,
		members: [],
	};
	await mkdir(join(p.root, ".limen/groups", run.id), { recursive: true });
	await writeFile(join(p.root, ".limen/groups", run.id, "run.json"), `${JSON.stringify(run)}\n`);
	const waited = limen(p, ["group", "wait", run.id, "--timeout", "500ms"], { env: { PI_SESSION_ID: run.lead } });
	assert.equal(waited.status, 3, waited.stderr);
	assert.deepEqual(readOutcome(waited), {
		class: "transient",
		code: "GROUP_WAIT_TIMEOUT",
		next: `limen group status ${run.id}`,
	});
	const finals = `${waited.stdout}${waited.stderr}`.split("\n").filter((line) => line.startsWith('{"class"'));
	assert.equal(finals.length, 1, `${waited.stdout}${waited.stderr}`);
});

test("GROUP_WAIT_TIMEOUT: the wait cap rejects a stalled operation after its bound and aborts the operation's signal", async () => {
	let signal: AbortSignal | undefined;
	const stalled = waitCapped(20, "limen group status g1", (given) => {
		signal = given;
		return new Promise<never>(() => {});
	});
	await assert.rejects(stalled, (error: unknown) => {
		assert.ok(error instanceof LimenError, String(error));
		assert.deepEqual(
			[error.class, error.code, error.next],
			["transient", "GROUP_WAIT_TIMEOUT", "limen group status g1"],
		);
		return true;
	});
	assert.equal(signal?.aborted, true);
});
