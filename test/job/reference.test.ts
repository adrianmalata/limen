// src/job/reference.ts: the one resolver of job references (T-20) and the draw of a new job's unique token.
import assert from "node:assert/strict";
import { existsSync } from "node:fs";
import { mkdir, mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test, { type TestContext } from "node:test";
import { jobArgument, resolveJob, withNewJobId } from "../../src/job/reference.ts";
import { LimenError } from "../../src/outcome.ts";
import { type Command, parse } from "../../src/parser.ts";
import { repository, writeRecord } from "../plant.ts";

const IMPL = "2026-08-13-f001-implementation-7a2f0b1c";
const REVIEW = "2026-08-14-f001-review-d4821e3f";
const FIX = "2026-08-15-f002-fix-0000aaaa";
/** The shape of `limen land` that the hints rebuild: the job, then a switch. */
const LAND: Command = {
	name: "land",
	schema: [
		{ positional: "job", type: "job", about: "the job" },
		{ flag: "yes", about: "no question" },
	],
};

/** A project at a temporary root with the three jobs above, newest last; removed after the test. */
async function project(t: TestContext): Promise<string> {
	const root = await mkdtemp(join(tmpdir(), "limen-reference-"));
	t.after(() => rm(root, { recursive: true, force: true }));
	await repository(root);
	const jobs: ReadonlyArray<readonly [string, string, string]> = [
		[IMPL, "F001 implementation", "2026-08-13T10:00:00.000Z"],
		[REVIEW, "F001 review", "2026-08-14T10:00:00.000Z"],
		[FIX, "F002", "2026-08-15T10:00:00.000Z"],
	];
	for (const [id, label, at] of jobs) {
		await writeRecord(join(root, ".limen", "jobs", id), {
			label,
			state: "done",
			transitions: [{ from: null, to: "starting", at }],
		});
	}
	return root;
}

/** The refusal `resolveJob` throws for `word` given as `limen land <word> --yes`. */
async function refusal(root: string, word: string): Promise<LimenError> {
	const values = parse(LAND, [word, "--yes"]);
	const error = await resolveJob(root, jobArgument(values), "read").then(
		() => undefined,
		(thrown: unknown) => thrown,
	);
	assert.ok(error instanceof LimenError, `${word} must be refused`);
	return error;
}

test("a job resolves by its full id and by its 8-character token, to its folder", async (t) => {
	const root = await project(t);
	for (const word of [IMPL, "7a2f0b1c", ` ${REVIEW} `]) {
		const expected = word.trim() === REVIEW ? REVIEW : IMPL;
		assert.deepEqual(await resolveJob(root, word, "read"), {
			id: expected,
			jobDir: `${root}/.limen/jobs/${expected}`,
		});
	}
});

test("JOB_NOT_EXACT: a label, a label prefix and a shorter suffix exit 2 with the candidates and the command with the token in next", async (t) => {
	const root = await project(t);
	for (const word of ["F001 implementation", "f001 impl", "0b1c"]) {
		const error = await refusal(root, word);
		assert.deepEqual([error.class, error.code, error.next], ["usage", "JOB_NOT_EXACT", "limen land 7a2f0b1c --yes"]);
		assert.match(error.message, /^ {2}7a2f0b1c {2}F001 implementation {2}done$/m, word);
	}
	const several = await refusal(root, "F001");
	assert.deepEqual([several.code, several.next], ["JOB_NOT_EXACT", "limen status --all"]);
	const lines = several.message.split("\n").filter((line) => line.startsWith("  "));
	assert.deepEqual(lines, ["  d4821e3f  F001 review  done", "  7a2f0b1c  F001 implementation  done"]);
});

test("JOB_NOT_FOUND: a well-formed id or token that names no job exits 2 with limen status --all", async (t) => {
	const root = await project(t);
	for (const word of ["2026-08-13-f001-implementation-00000000", "12345678"]) {
		const error = await refusal(root, word);
		assert.deepEqual([error.class, error.code, error.next], ["usage", "JOB_NOT_FOUND", "limen status --all"]);
	}
});

test("an older id that ends in 4 hex characters resolves only by its full id", async (t) => {
	const root = await project(t);
	const older = "2026-08-01-say-hi-1a2b";
	await writeRecord(join(root, ".limen", "jobs", older), { label: "say hi", state: "done" });
	assert.equal((await resolveJob(root, older, "read")).id, older);
	const error = await refusal(root, "1a2b");
	assert.deepEqual([error.code, error.next], ["JOB_NOT_EXACT", `limen land ${older} --yes`]);
});

test("JOB_TOKEN_SHARED: a token two ids share names neither job, and each still resolves by its full id", async (t) => {
	const root = await project(t);
	const twin = "2026-08-16-f003-other-7a2f0b1c";
	await writeRecord(join(root, ".limen", "jobs", twin), { label: "F003", state: "done" });
	const error = await refusal(root, "7a2f0b1c");
	assert.deepEqual([error.class, error.code, error.next], ["usage", "JOB_TOKEN_SHARED", "limen status --all"]);
	assert.match(error.message, new RegExp(`^ {2}${IMPL} {2}F001 implementation {2}done$`, "m"));
	assert.equal((await resolveJob(root, twin, "read")).id, twin);
	assert.equal((await resolveJob(root, IMPL, "read")).id, IMPL);
});

test("a record that cannot be read stops no other job's resolution", async (t) => {
	const root = await project(t);
	await writeFile(join(root, ".limen", "jobs", REVIEW, "record.json"), "{ not json\n");
	assert.equal((await resolveJob(root, "7a2f0b1c", "control")).id, IMPL);
});

test("a record that cannot be read is listed as damaged when the reference matches its id", async (t) => {
	const root = await project(t);
	await writeFile(join(root, ".limen", "jobs", REVIEW, "record.json"), "{ not json\n");
	const error = await refusal(root, "1e3f");
	const lines = error.message.split("\n").filter((line) => line.startsWith("  "));
	assert.deepEqual([lines, error.next], [["  d4821e3f  damaged record"], "limen land d4821e3f --yes"]);
});

test("a record that cannot be read is no candidate for a label it may not hold, so the one readable match gets its token in next", async (t) => {
	const root = await project(t);
	await writeFile(join(root, ".limen", "jobs", REVIEW, "record.json"), "{ not json\n");
	const error = await refusal(root, "F001 implementation");
	const lines = error.message.split("\n").filter((line) => line.startsWith("  "));
	assert.deepEqual([lines, error.next], [["  7a2f0b1c  F001 implementation  done"], "limen land 7a2f0b1c --yes"]);
});

test("JOB_OTHER_TEAM: a group member controls only its own team's jobs and gets the read command in next", async (t) => {
	const root = await project(t);
	await mkdir(join(root, ".limen", "groups", "g1"), { recursive: true });
	await writeFile(
		join(root, ".limen", "groups", "g1", "run.json"),
		JSON.stringify({ root, members: [{ id: FIX, team: "a" }] }),
	);
	const environment = { LIMEN_GROUP_ID: "g1", LIMEN_CONTEXT_ROOT: root, LIMEN_JOB_ID: FIX, LIMEN_TEAM_ID: "a" };
	Object.assign(process.env, environment);
	t.after(() => {
		for (const name of Object.keys(environment)) {
			delete process.env[name];
		}
	});
	const error = await resolveJob(root, "7a2f0b1c", "control").then(
		() => undefined,
		(thrown: unknown) => thrown,
	);
	assert.ok(error instanceof LimenError);
	assert.deepEqual([error.class, error.code, error.next], ["refused", "JOB_OTHER_TEAM", "limen show 7a2f0b1c"]);
	assert.equal((await resolveJob(root, "7a2f0b1c", "read")).id, IMPL);
});

test("T-20: a new job's token is drawn again while a job folder or a folder in .limen/unmigrated/ ends in it", async (t) => {
	const root = await project(t);
	const unmigrated = join(root, ".limen", "unmigrated", "2026-08-02-old-cafebabe");
	await mkdir(unmigrated, { recursive: true });
	const draws = ["7a2f0b1c", "cafebabe", "0badf00d"];
	const drawn: string[] = [];
	const draw = () => {
		const token = draws[drawn.length] ?? "";
		drawn.push(token);
		return token;
	};
	const id = await withNewJobId(root, "F004 new work", async (made) => made, { draw });
	assert.deepEqual(drawn, draws);
	assert.match(id, /^\d{4}-\d{2}-\d{2}-f004-new-work-0badf00d$/);
});

// T-20 (1): before R-031 the draw read only .limen/jobs/ and .limen/unmigrated/, so a token of a retired job came back.
test("T-20: a new job's token is drawn again while a job of the job archive ends in it", async (t) => {
	const root = await project(t);
	await writeRecord(join(root, ".limen", "archive", "2026-07", "2026-07-02-old-cafebabe"), { state: "done" });
	const draws = ["cafebabe", "0badf00d"];
	const drawn: string[] = [];
	const draw = () => {
		const token = draws[drawn.length] ?? "";
		drawn.push(token);
		return token;
	};
	const id = await withNewJobId(root, "F004 new work", async (made) => made, { draw });
	assert.deepEqual([drawn, id.endsWith("-0badf00d")], [draws, true], id);
});

/** `rounds` turns of the event loop, so that work another promise started can run as far as it can. */
async function turns(rounds: number): Promise<void> {
	for (let round = 0; round < rounds; round++) {
		await new Promise((resolve) => setImmediate(resolve));
	}
}

test("T-20: the token's lock is held until the job's folder exists, so a second spawn's draw sees the first job", async (t) => {
	const root = await project(t);
	const gate: { release?: () => void } = {};
	const first = withNewJobId(
		root,
		"first",
		async (made) => {
			await new Promise<void>((resolve) => {
				gate.release = resolve;
			});
			await mkdir(join(root, ".limen", "jobs", made));
			return made;
		},
		{ draw: () => "11111111" },
	);
	while (gate.release === undefined) {
		await turns(1);
	}
	const { release } = gate;
	const queue = ["11111111", "22222222"];
	const second = withNewJobId(root, "second", async (made) => made, { draw: () => queue.shift() ?? "" });
	// Without the lock the second draw would end here, with the token the first job is about to take.
	const early = await Promise.race([second, turns(50).then(() => "waiting")]);
	assert.equal(early, "waiting");
	release();
	assert.match(await first, /-11111111$/);
	assert.match(await second, /-22222222$/);
	assert.equal(existsSync(join(root, ".limen", "jobs.lock")), false);
});
