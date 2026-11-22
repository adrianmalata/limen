// src/job/record.ts: the job's record.json, its reads, the one function that writes it, a failure's kind, and the
// optional scope of a record.
import assert from "node:assert/strict";
import { existsSync } from "node:fs";
import { link, mkdir, mkdtemp, readFile, rm, symlink, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test, { type TestContext } from "node:test";
import {
	emptyRecord,
	failureFrom,
	type JobRecord,
	jobFolders,
	publishRecord,
	readRecord,
	readRecordSync,
	serialized,
	transition,
} from "../../src/job/record.ts";
import { LimenError } from "../../src/outcome.ts";

const ID = "2026-11-21-record-1a2b3c4d";

/** A jobs folder in the OS temporary folder, removed after the test. */
async function jobsFolder(t: TestContext): Promise<string> {
	const jobs = await mkdtemp(join(tmpdir(), "limen-record-"));
	t.after(() => rm(jobs, { recursive: true, force: true }));
	return jobs;
}

/** A job folder whose record is `emptyRecord` with `fields`. */
async function recorded(t: TestContext, fields: Partial<JobRecord>, id = ID): Promise<string> {
	const dir = join(await jobsFolder(t), id);
	await mkdir(dir);
	await writeFile(join(dir, "record.json"), serialized({ ...emptyRecord(id), ...fields }));
	return dir;
}

const IDENTITY = { pid: 4242, born: "123", bootId: null } as const;
const RUNNING: Partial<JobRecord> = { state: "running", identity: IDENTITY, startedAt: "2026-11-21T10:00:00.000Z" };

/** The error a call threw, which the test needs to be a LimenError. */
async function thrown(call: () => unknown): Promise<LimenError> {
	try {
		await call();
	} catch (error) {
		assert.ok(error instanceof LimenError, String(error));
		return error;
	}
	assert.fail("the call did not throw");
}

test("publishRecord writes a starting record with its facts and its first transition", async (t) => {
	const folder = await jobsFolder(t);
	await publishRecord(folder, "job", { ...emptyRecord("job"), label: "demo" });
	const record = JSON.parse(await readFile(join(folder, "record.json"), "utf8"));
	assert.deepEqual([record.version, record.state, record.label, record.transitions.length], [1, "starting", "demo", 1]);
});

test("publishRecord writes once: a second publication into the same folder fails with EEXIST", async (t) => {
	const folder = await jobsFolder(t);
	await publishRecord(folder, "job", { ...emptyRecord("job"), label: "demo" });
	await assert.rejects(publishRecord(folder, "job", emptyRecord("job")), { code: "EEXIST" });
	assert.equal(JSON.parse(await readFile(join(folder, "record.json"), "utf8")).label, "demo");
});

test("A-019: a transition applies only from the state it expects and leaves the record alone from any other", async (t) => {
	const dir = await recorded(t, {});
	const before = await readFile(join(dir, "record.json"), "utf8");
	assert.equal(await transition(dir, { from: ["running"], to: "done" }), undefined);
	assert.equal(await readFile(join(dir, "record.json"), "utf8"), before);
	const running = await transition(dir, { from: ["starting"], to: "running", set: { identity: IDENTITY } });
	assert.deepEqual(
		[running?.state, running?.transitions.map(({ from, to }) => `${from}>${to}`), (await readRecord(dir))?.state],
		["running", ["starting>running"], "running"],
	);
});

test("two finishers at once: one wins, and the loser writes neither the record nor its log line", async (t) => {
	const dir = await recorded(t, RUNNING);
	const finish = (state: "done" | "stopped") =>
		transition(dir, {
			from: ["running"],
			to: state,
			prepare: () => writeFile(join(dir, "log"), `${state}\n`, { flag: "a" }),
		});
	const results = await Promise.all([finish("done"), finish("stopped")]);
	const winners = results.filter((result) => result !== undefined);
	assert.equal(winners.length, 1, "exactly one finisher wins");
	const record = await readRecord(dir);
	assert.deepEqual(
		[record?.state, await readFile(join(dir, "log"), "utf8")],
		[winners[0]?.state, `${winners[0]?.state}\n`],
	);
});

test("nothing writes after a terminal state, also a change that names the terminal state it finds", async (t) => {
	const dir = await recorded(t, { ...RUNNING, state: "done", finishedAt: "2026-11-21T11:00:00.000Z" });
	const before = await readFile(join(dir, "record.json"), "utf8");
	const update = await transition(dir, { from: ["running", "done"], set: { advisory: null, stopReason: "late" } });
	const move = await transition(dir, { from: ["done"], to: "failed" });
	assert.deepEqual([update, move, await readFile(join(dir, "record.json"), "utf8")], [undefined, undefined, before]);
});

test("the terminal transition takes the claim `terminal` exclusively, holding the record it writes", async (t) => {
	const dir = await recorded(t, RUNNING);
	const won = await transition(dir, { from: ["running"], to: "done" });
	assert.deepEqual(
		JSON.parse(await readFile(join(dir, "terminal"), "utf8")),
		JSON.parse(serialized(won ?? emptyRecord(ID))),
	);
	assert.equal((await readRecord(dir))?.state, "done");
});

// A finisher that died between its claim and its record: the claim holds `failed`, the record still says running.
test("a claim whose record was never written still wins: the next terminal change writes it and runs no prepare", async (t) => {
	const dir = await recorded(t, RUNNING);
	const claimed: JobRecord = {
		...emptyRecord(ID),
		...RUNNING,
		state: "failed",
		finishedAt: "2026-11-21T11:00:00.000Z",
	};
	await writeFile(join(dir, "terminal"), serialized(claimed));
	const late = await transition(dir, {
		from: ["running"],
		to: "stopped",
		prepare: () => writeFile(join(dir, "log"), "stopped\n", { flag: "a" }),
	});
	assert.deepEqual([late, (await readRecord(dir))?.state, existsSync(join(dir, "log"))], [undefined, "failed", false]);
});

test("T-01: the side failures of a terminal transition are written in the same record as its state", async (t) => {
	const dir = await recorded(t, RUNNING);
	const failure = { channel: "commit count", message: "git failed", at: "2026-11-21T11:00:00.000Z" };
	await transition(dir, { from: ["running"], to: "done", set: { sideFailures: [failure] } });
	const record = await readRecord(dir);
	assert.deepEqual([record?.state, record?.sideFailures], ["done", [failure]]);
	assert.equal(typeof record?.finishedAt, "string", "the terminal transition records its finish time");
});

// D-071: the provider's text of the subscription limit, in the stop reason the engine ends on (`error: <text>` or
// `aborted: <text>`); the 5-hour limit's text is the one of audit.md, gate 2 §1, Q1.
test("failureFrom names an engine stop reason that says a subscription limit was hit quota, with no reset time", () => {
	const limits = [
		"error: You've hit your session limit · resets 3pm (UTC)",
		"error: You've hit your weekly limit · resets Nov 23, 5pm",
		"error: You've hit your limit · resets 3pm (UTC)",
		"aborted: You've hit your session limit · resets 3pm (UTC)",
	];
	assert.deepEqual(
		limits.map((detail) => failureFrom(detail)),
		limits.map((detail) => ({ kind: "quota", detail, resetAt: null })),
	);
});

test("failureFrom keeps an engine stop reason that names no subscription limit engine-error", () => {
	const others = [
		"error",
		"error: 500 Internal server error",
		"error: 529 overloaded_error: Overloaded",
		"error: prompt is too long: 1048576 tokens > 1000000 maximum",
		"error: the tool output hit the size limit",
		"error: Claude Code process exited with code 1",
		"aborted: Request was aborted.",
	];
	assert.deepEqual(
		others.map((detail) => failureFrom(detail).kind),
		others.map(() => "engine-error"),
	);
});

// A-052: the wrapper names the signal of an end without a stop request, and where the job stood before its engine ran;
// an older record's `process group interrupted` keeps its kind.
test("failureFrom names a detail that says which signal killed the job signal, and keeps process group interrupted signal", () => {
	const details = [
		"killed by SIGTERM",
		"killed by SIGKILL",
		"killed by SIGSEGV",
		"killed by SIGTERM while queued",
		"killed by SIGTERM during setup",
		"process group interrupted",
	];
	assert.deepEqual(
		details.map((detail) => failureFrom(detail)),
		details.map((detail) => ({ kind: "signal", detail, resetAt: null })),
	);
});

test("BAD_DATA: a damaged record gives a typed error that names the file and the field", async (t) => {
	const dir = await recorded(t, {});
	const text = (await readFile(join(dir, "record.json"), "utf8")).replace('"state": "starting"', '"state": "lost"');
	await writeFile(join(dir, "record.json"), text);
	const error = await thrown(() => readRecord(dir));
	assert.deepEqual(
		[error.class, error.code, "file" in error && error.file, "field" in error && error.field],
		["environment", "BAD_DATA", join(dir, "record.json"), "state"],
	);
});

/** A job folder whose `record.json` is gone and whose record text sits in a file beside the folder. */
async function recordElsewhere(t: TestContext): Promise<{ readonly dir: string; readonly other: string }> {
	const dir = await recorded(t, {});
	const other = join(dir, "..", "elsewhere.json");
	await writeFile(other, await readFile(join(dir, "record.json")));
	await rm(join(dir, "record.json"));
	return { dir, other };
}

test("the read refuses a record that is a symlink (it opens with O_NOFOLLOW), as BAD_DATA", async (t) => {
	const { dir, other } = await recordElsewhere(t);
	await symlink(other, join(dir, "record.json"));
	assert.match(
		(await thrown(() => readRecord(dir))).message,
		/expected a regular file with one name, got "a symbolic link"/,
	);
});

test("the read refuses a record that has a second name, as BAD_DATA", async (t) => {
	const { dir, other } = await recordElsewhere(t);
	await link(other, join(dir, "record.json"));
	assert.match((await thrown(() => readRecord(dir))).message, /expected a regular file with one name, got "2 names"/);
});

// A rewrite renames a new record over the old one; a read that opened the old one before the rename finds it with no
// name left, and its text is still a whole record.
test("a read during rewrites gives the old record or the new one, never BAD_DATA", async (t) => {
	const dir = await recorded(t, RUNNING);
	let writing = true;
	const writes = async () => {
		for (let index = 0; index < 100; index++) {
			await transition(dir, { from: ["running"], set: { stopReason: `stop ${index}` } });
		}
		writing = false;
	};
	const seen = new Set<string>();
	const reads = async () => {
		while (writing) {
			const read = await readRecord(dir).then(
				(record) => record?.state ?? "none",
				(error: unknown) => (error instanceof LimenError ? error.message : String(error)),
			);
			seen.add(read);
		}
	};
	await Promise.all([writes(), reads(), reads(), reads(), reads()]);
	assert.deepEqual([...seen], ["running"]);
});

test("the sync read gives the record the async read gives, and undefined for a folder without one", async (t) => {
	const dir = await recorded(t, RUNNING);
	assert.deepEqual(readRecordSync(dir), await readRecord(dir));
	assert.equal(readRecordSync(join(dir, "..")), undefined);
});

test("NOT_MIGRATED: a folder with an older state file and no record refuses the read and the listing", async (t) => {
	const jobs = await jobsFolder(t);
	await mkdir(join(jobs, "old"));
	await writeFile(join(jobs, "old", "state"), "done\n");
	for (const error of [await thrown(() => readRecord(join(jobs, "old"))), await thrown(() => jobFolders(jobs))]) {
		assert.deepEqual([error.class, error.code, error.next], ["environment", "NOT_MIGRATED", "limen migrate --dry-run"]);
	}
});

/** A scope as a finisher writes it: the wrapper's unit and cgroup, and the readings of its end. */
const SCOPE = {
	unit: `limen-job-${ID}.scope`,
	cgroup: `/user.slice/user-1000.slice/user@1000.service/app.slice/limen-job-${ID}.scope`,
	memoryPeakBytes: 52_428_800,
	cpuMicroseconds: 2_500_000,
	oomKills: 0,
} as const;

// D-079: `record.json` changes additively, so a record written before R-026 reads as before.
test("a record reads with its optional scope, and a record without one reads with none", async (t) => {
	const scoped = await recorded(t, { ...RUNNING, scope: SCOPE });
	const plain = await readRecord(await recorded(t, RUNNING));
	assert.deepEqual([(await readRecord(scoped))?.scope, plain && "scope" in plain], [SCOPE, false]);
});

test("BAD_DATA: a scope with a reading below zero gives a typed error that names the field", async (t) => {
	const error = await thrown(async () =>
		readRecord(await recorded(t, { ...RUNNING, scope: { ...SCOPE, oomKills: -1 } })),
	);
	assert.deepEqual(
		[error.code, "field" in error && error.field, error.message.includes("an integer of at least 0")],
		["BAD_DATA", "scope.oomKills", true],
	);
});
