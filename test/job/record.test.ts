// src/job/record.ts: the job's record.json, its reads, the one function that writes it, a failure's kind, the reset
// time of a limit's text, the optional fields of a record, the markers `landed` and `abandoned` and a land's steps
// with their one writer, and the job archive's listing.
import assert from "node:assert/strict";
import { existsSync } from "node:fs";
import { link, mkdir, mkdtemp, readFile, rm, symlink, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test, { type TestContext } from "node:test";
import {
	advisorySource,
	archivedJobs,
	emptyRecord,
	failureFrom,
	type JobRecord,
	jobFolders,
	limitReset,
	publishRecord,
	readRecord,
	readRecordSync,
	recordRefusal,
	serialized,
	transition,
	writeMarker,
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

// A-036: the wrapper ends a wait past the gate file's failAfter with this detail (src/runtime/start-queue.ts).
test("failureFrom names a detail that says the job waited in the start queue without a start queue", () => {
	const detail = "queued for 2h1m without a start: CPU 10% idle (gate 25%), memory 80% free (gate 20%)";
	assert.deepEqual(failureFrom(detail), { kind: "queue", detail, resetAt: null });
});

/** The provider's text of the 5-hour limit: a synthetic copy of the format of audit.md, gate 2 §1, Q1. */
const SESSION_LIMIT = "error: You've hit your session limit · resets 3pm (UTC)";

// A-016 (1), E-9: a reset with no date is the 5-hour window's, so it is the first such hour after the error.
test("limitReset reads a reset hour with no date as the first such hour after the error's time", () => {
	const before = Date.parse("2026-11-24T14:10:00.000Z");
	const after = Date.parse("2026-11-24T16:00:00.000Z");
	assert.deepEqual(
		[limitReset(SESSION_LIMIT, before), limitReset(SESSION_LIMIT, after)],
		["2026-11-24T15:00:00.000Z", "2026-11-25T15:00:00.000Z"],
	);
});

test("limitReset reads a reset with a month, a day and minutes as that time in the zone the text names", () => {
	const said = Date.parse("2026-11-24T14:10:00.000Z");
	assert.deepEqual(
		[
			limitReset("error: You've hit your weekly limit · resets Nov 26, 5pm (Europe/Warsaw)", said),
			limitReset("error: You've hit your session limit · resets 3:30pm (UTC)", said),
		],
		["2026-11-26T16:00:00.000Z", "2026-11-24T15:30:00.000Z"],
	);
});

// A-016 (4), z. 10: a reset whose zone the text does not name is not read, so R-059's usage reading takes over.
test("limitReset gives null for a reset with no zone, a zone no clock knows, and a text with no reset", () => {
	const said = Date.parse("2026-11-24T14:10:00.000Z");
	const texts = [
		"error: You've hit your weekly limit · resets Nov 23, 5pm",
		"error: You've hit your session limit · resets 3pm (Mars/Olympus)",
		"error: You've hit your session limit",
	];
	assert.deepEqual(
		texts.map((text) => limitReset(text, said)),
		[null, null, null],
	);
});

// D-095: the kinds launch and internal join A-016's.
test("a record reads with the failure kinds launch and internal", async (t) => {
	const kinds = [];
	for (const kind of ["launch", "internal"] as const) {
		const failure = { kind, detail: "the engine did not start", resetAt: null };
		kinds.push((await readRecord(await recorded(t, { ...RUNNING, state: "failed", failure })))?.failure?.kind);
	}
	assert.deepEqual(kinds, ["launch", "internal"]);
});

// D-079: the rate-limit event and a hook's refusal are optional fields, so a record written before R-029 reads as before.
test("a record reads with its optional rateLimit and refusal, and a record without them reads with neither", async (t) => {
	const rateLimit = { type: "five_hour", resetAt: "2026-11-24T15:00:00.000Z", at: "2026-11-24T14:10:00.000Z" };
	const refusal = {
		event: "message_end",
		field: "message",
		message: "Pi event message_end: message: expected an object, got nothing",
		at: "2026-11-24T14:10:00.000Z",
	};
	const full = await readRecord(await recorded(t, { ...RUNNING, rateLimit, refusal }));
	const plain = await readRecord(await recorded(t, RUNNING));
	assert.deepEqual(
		[full?.rateLimit, full?.refusal, plain && ("rateLimit" in plain || "refusal" in plain)],
		[rateLimit, refusal, false],
	);
});

// T-32 (4), A-019: the first cause is the one the job's end reads, so a later refusal changes nothing.
test("recordRefusal writes a hook's refusal into a running job's record and keeps the first one", async (t) => {
	const dir = await recorded(t, RUNNING);
	const at = "2026-11-24T14:10:00.000Z";
	const refusal = (event: string) => ({ event, field: "", message: `Pi event ${event}: expected an object`, at });
	await recordRefusal(dir, refusal("message_end"));
	await recordRefusal(dir, refusal("tool_result"));
	assert.deepEqual((await readRecord(dir))?.refusal, refusal("message_end"));
});

const WAIT = {
	since: "2026-11-21T09:00:00.000Z",
	diagnosedAt: "2026-11-21T09:30:00.000Z",
	diagnosis: "CPU 10% idle (gate 25%), memory 80% free (gate 20%); largest by memory: none; largest by CPU: none",
	leftAt: null,
} as const;

// D-072, D-079: the wait is an optional field, so a record written before R-035 reads as before.
test("a record reads with its optional queueWait, and a record without one reads with none", async (t) => {
	const waited = await readRecord(await recorded(t, { ...RUNNING, queueWait: WAIT }));
	const plain = await readRecord(await recorded(t, RUNNING));
	assert.deepEqual([waited?.queueWait, plain && "queueWait" in plain], [WAIT, false]);
});

test("BAD_DATA: a queueWait whose leftAt is no ISO time gives a typed error that names the field", async (t) => {
	const error = await thrown(async () =>
		readRecord(await recorded(t, { ...RUNNING, queueWait: { ...WAIT, leftAt: "soon" } })),
	);
	assert.deepEqual([error.code, "field" in error && error.field], ["BAD_DATA", "queueWait.leftAt"]);
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

// M-09, D-079: the wrapper adds the peak CPU share at its end; a scope written before R-036 reads as before.
test("a scope reads with its optional peak CPU share, null until the wrapper's end, and a scope without one reads with none", async (t) => {
	const [peaked, open, plain] = await Promise.all(
		[{ ...SCOPE, cpuPeakPercent: 37 }, { ...SCOPE, cpuPeakPercent: null }, SCOPE].map(async (scope) =>
			readRecord(await recorded(t, { ...RUNNING, scope })),
		),
	);
	assert.deepEqual(
		[peaked?.scope?.cpuPeakPercent, open?.scope?.cpuPeakPercent, plain?.scope && "cpuPeakPercent" in plain.scope],
		[37, null, false],
	);
});

test("BAD_DATA: a peak CPU share above the whole machine gives a typed error that names the field", async (t) => {
	const error = await thrown(async () =>
		readRecord(await recorded(t, { ...RUNNING, scope: { ...SCOPE, cpuPeakPercent: 101 } })),
	);
	assert.deepEqual(
		[error.code, "field" in error && error.field, error.message.includes("an integer from 0 to 100")],
		["BAD_DATA", "scope.cpuPeakPercent", true],
	);
});

/** A note on a running job as the wrapper sets it, with its time. */
const ADVISORY = {
	text: "tool stall observation uncertain: scope CPU unavailable: cpu.stat is missing",
	at: "2026-11-24T10:00:00.000Z",
} as const;

// The D-092 note: the wake hook's receipt is per source, so each note names its source; a record written before R-036
// holds only the wrapper's note (D-079).
test("an advisory reads with its source, and an advisory without one reads as the wrapper's stall note", async (t) => {
	const queued = await readRecord(await recorded(t, { ...RUNNING, advisory: { ...ADVISORY, source: "queue" } }));
	const older = await readRecord(await recorded(t, { ...RUNNING, advisory: ADVISORY }));
	assert.deepEqual(
		[queued?.advisory && advisorySource(queued.advisory), older?.advisory && advisorySource(older.advisory)],
		["queue", "stall"],
	);
});

test("BAD_DATA: an advisory whose source is neither queue nor stall gives a typed error that names the field", async (t) => {
	const dir = await recorded(t, { ...RUNNING, advisory: { ...ADVISORY, source: "queue" } });
	const text = (await readFile(join(dir, "record.json"), "utf8")).replace('"source": "queue"', '"source": "seat"');
	await writeFile(join(dir, "record.json"), text);
	const error = await thrown(() => readRecord(dir));
	assert.deepEqual(
		[error.code, "field" in error && error.field, error.message.includes('one of "queue" or "stall"')],
		["BAD_DATA", "advisory.source", true],
	);
});

/** A wake of a job the subscription limit kept from the coordinator's turn (A-016 (2)), with the reset the turn named. */
const OWED = { since: "2026-11-24T14:10:00.000Z", resetAt: "2026-11-24T15:00:00.000Z" } as const;

// D-079, A-016 (2), (5): both fields are optional, so a record written before R-034 reads as before; 3 is the last
// attempt the cap allows.
test("a record reads with its optional quotaAttempt and owedWake, and a record without them reads with neither", async (t) => {
	const full = await readRecord(await recorded(t, { ...RUNNING, quotaAttempt: 3, owedWake: OWED }));
	const unknown = await readRecord(await recorded(t, { ...RUNNING, owedWake: { ...OWED, resetAt: null } }));
	const plain = await readRecord(await recorded(t, RUNNING));
	assert.deepEqual(
		[
			full?.quotaAttempt,
			full?.owedWake,
			unknown?.owedWake?.resetAt,
			plain && ("quotaAttempt" in plain || "owedWake" in plain),
		],
		[3, OWED, null, false],
	);
});

test("BAD_DATA: a quotaAttempt above the cap of 3 resumes gives a typed error that names the field and the cap", async (t) => {
	const error = await thrown(async () => readRecord(await recorded(t, { ...RUNNING, quotaAttempt: 4 })));
	assert.deepEqual(
		[error.code, "field" in error && error.field, error.message.includes("expected an integer from 1 to 3")],
		["BAD_DATA", "quotaAttempt", true],
	);
});

test("BAD_DATA: an owedWake whose since is no ISO time gives a typed error that names the field", async (t) => {
	const error = await thrown(async () =>
		readRecord(await recorded(t, { ...RUNNING, owedWake: { ...OWED, since: "after the limit" } })),
	);
	assert.deepEqual([error.code, "field" in error && error.field], ["BAD_DATA", "owedWake.since"]);
});

const DONE: Partial<JobRecord> = { ...RUNNING, state: "done", finishedAt: "2026-11-21T11:00:00.000Z" };

// D-097 (5) (h): an owed wake is written as R-032's `stuck` is, so a finished record takes it with no transition.
test("writeOwedWake sets owedWake on a finished record and removes it, and changes no other field", async (t) => {
	// Imported here, so that the file's other tests run on a record module that has no such writer.
	const { writeOwedWake } = await import("../../src/job/record.ts");
	const dir = await recorded(t, DONE);
	const before = await readRecord(dir);
	await writeOwedWake(dir, (owed) => owed ?? OWED);
	await writeOwedWake(dir, (owed) => owed ?? { ...OWED, since: "2026-11-24T14:20:00.000Z" });
	const owed = await readRecord(dir);
	await writeOwedWake(dir, () => undefined);
	assert.deepEqual([owed, await readRecord(dir)], [before && { ...before, owedWake: OWED }, before]);
});

const LANDED = { sha: "0123456789abcdef0123456789abcdef01234567", at: "2026-11-21T12:00:00.000Z" } as const;
const ABANDONED = { branch: `limen/abandon/${ID}`, commit: "89abcdef0123456789abcdef0123456789abcdef", at: LANDED.at };

// A-002: the one write after a terminal state; a record before R-031 has no marker and reads as before (D-079).
test("writeMarker writes the landed marker on a finished record once and keeps every other field as it was", async (t) => {
	const dir = await recorded(t, DONE);
	const before = await readRecord(dir);
	const written = await writeMarker(dir, { landed: LANDED });
	assert.deepEqual(
		[written, await readRecord(dir)],
		[
			{ ...before, landed: LANDED },
			{ ...before, landed: LANDED },
		],
	);
	assert.ok(before && !("landed" in before) && !("abandoned" in before));
});

// T-28 (3): the callers run again after a stop, so the marker they wrote is found again, not written twice.
test("writeMarker with the marker the record holds, at a later time, changes nothing", async (t) => {
	const dir = await recorded(t, DONE);
	await writeMarker(dir, { abandoned: ABANDONED });
	const text = await readFile(join(dir, "record.json"), "utf8");
	const again = await writeMarker(dir, { abandoned: { ...ABANDONED, at: "2026-11-22T08:00:00.000Z" } });
	assert.deepEqual([again.abandoned, await readFile(join(dir, "record.json"), "utf8")], [ABANDONED, text]);
});

test("MARKER_NOT_FINISHED: writeMarker refuses a running record and a folder without one, and writes nothing", async (t) => {
	const dir = await recorded(t, RUNNING);
	const text = await readFile(join(dir, "record.json"), "utf8");
	const running = await thrown(() => writeMarker(dir, { landed: LANDED }));
	const missing = await thrown(() => writeMarker(join(dir, "..", "2026-11-21-gone-5e6f7a8b"), { landed: LANDED }));
	assert.deepEqual(
		[running.class, running.code, missing.code, await readFile(join(dir, "record.json"), "utf8")],
		["internal", "MARKER_NOT_FINISHED", "MARKER_NOT_FINISHED", text],
	);
});

test("MARKER_DIFFERS: writeMarker refuses a second landed marker with another commit, and the first one stays", async (t) => {
	const dir = await recorded(t, DONE);
	await writeMarker(dir, { landed: LANDED });
	const text = await readFile(join(dir, "record.json"), "utf8");
	const other = { ...LANDED, sha: "fedcba9876543210fedcba9876543210fedcba98" };
	const error = await thrown(() => writeMarker(dir, { landed: other }));
	assert.deepEqual(
		[error.class, error.code, await readFile(join(dir, "record.json"), "utf8")],
		["internal", "MARKER_DIFFERS", text],
	);
});

test("BAD_DATA: a landed marker whose commit is no full commit SHA gives a typed error that names the field", async (t) => {
	const error = await thrown(async () =>
		readRecord(await recorded(t, { ...DONE, landed: { ...LANDED, sha: "0123" } })),
	);
	assert.deepEqual([error.code, "field" in error && error.field], ["BAD_DATA", "landed.sha"]);
});

const CLOSING = "fedcba9876543210fedcba9876543210fedcba98";

// R-103, A-021: before R-103 land recorded no step past its merge, so a land that failed after it could not go on.
test("writeMarker writes a land's merged step as the landed marker with an empty land, then closed and cleaned, each in its own write", async (t) => {
	const dir = await recorded(t, DONE);
	const merged = await writeMarker(dir, { merged: LANDED });
	const closed = await writeMarker(dir, { closed: { sha: CLOSING, at: "2026-11-21T12:01:00.000Z" } });
	const cleaned = await writeMarker(dir, { cleaned: { at: "2026-11-21T12:02:00.000Z" } });
	assert.deepEqual(
		[merged.landed, merged.land, closed.land, cleaned.land, (await readRecord(dir))?.land],
		[
			LANDED,
			{},
			{ closed: { sha: CLOSING, at: "2026-11-21T12:01:00.000Z" } },
			{ closed: { sha: CLOSING, at: "2026-11-21T12:01:00.000Z" }, cleaned: { at: "2026-11-21T12:02:00.000Z" } },
			cleaned.land,
		],
	);
});

// T-28 (3): a land run again writes a step it finds recorded once more; the record keeps the first.
test("a land step written again with the same commit at a later time changes nothing", async (t) => {
	const dir = await recorded(t, DONE);
	await writeMarker(dir, { merged: LANDED });
	await writeMarker(dir, { closed: { sha: null, at: "2026-11-21T12:01:00.000Z" } });
	await writeMarker(dir, { cleaned: { at: "2026-11-21T12:02:00.000Z" } });
	const text = await readFile(join(dir, "record.json"), "utf8");
	await writeMarker(dir, { merged: { ...LANDED, at: "2026-11-22T08:00:00.000Z" } });
	await writeMarker(dir, { closed: { sha: null, at: "2026-11-22T08:00:00.000Z" } });
	await writeMarker(dir, { cleaned: { at: "2026-11-22T08:00:00.000Z" } });
	assert.equal(await readFile(join(dir, "record.json"), "utf8"), text);
});

// D-096 (3) (g): a record with `landed` and no `land` came from a land before R-103, `limen ticket done` or the
// migration, and a land run again records its first step there.
test("a record with the landed marker and no land takes land with its closed step", async (t) => {
	const dir = await recorded(t, { ...DONE, landed: LANDED });
	const closed = await writeMarker(dir, { closed: { sha: LANDED.sha, at: "2026-11-21T12:01:00.000Z" } });
	assert.deepEqual(
		[closed.landed, closed.land],
		[LANDED, { closed: { sha: LANDED.sha, at: "2026-11-21T12:01:00.000Z" } }],
	);
});

test("MARKER_DIFFERS: writeMarker refuses a land's closed step with another closing commit, and the first one stays", async (t) => {
	const dir = await recorded(t, DONE);
	await writeMarker(dir, { merged: LANDED });
	await writeMarker(dir, { closed: { sha: null, at: LANDED.at } });
	const text = await readFile(join(dir, "record.json"), "utf8");
	const error = await thrown(() => writeMarker(dir, { closed: { sha: CLOSING, at: LANDED.at } }));
	assert.deepEqual(
		[error.class, error.code, await readFile(join(dir, "record.json"), "utf8")],
		["internal", "MARKER_DIFFERS", text],
	);
});

test("MARKER_OUT_OF_ORDER: writeMarker refuses a closed step before the landed marker and a cleaned step before the closed one, and writes nothing", async (t) => {
	const dir = await recorded(t, DONE);
	const text = await readFile(join(dir, "record.json"), "utf8");
	const closed = await thrown(() => writeMarker(dir, { closed: { sha: CLOSING, at: LANDED.at } }));
	const cleaned = await thrown(() => writeMarker(dir, { cleaned: { at: LANDED.at } }));
	assert.deepEqual(
		[closed.class, closed.code, cleaned.code, await readFile(join(dir, "record.json"), "utf8")],
		["internal", "MARKER_OUT_OF_ORDER", "MARKER_OUT_OF_ORDER", text],
	);
});

// D-079: a record refuses a field it does not know, inside `land` too.
test("BAD_DATA: a land with a key of no step gives a typed error that names the field", async (t) => {
	const dir = await recorded(t, { ...DONE, landed: LANDED });
	const record = JSON.parse(await readFile(join(dir, "record.json"), "utf8"));
	await writeFile(join(dir, "record.json"), JSON.stringify({ ...record, land: { merged: { at: LANDED.at } } }));
	const error = await thrown(() => readRecord(dir));
	assert.deepEqual([error.code, "field" in error && error.field], ["BAD_DATA", "land.merged"]);
});

// A-002: the job archive holds a folder per UTC month of a marker, and a job folder per job below it.
test("archivedJobs lists the job folders of every month of the job archive, and none for a project without one", async (t) => {
	const root = await jobsFolder(t);
	assert.deepEqual(await archivedJobs(root), []);
	const [october, november] = ["2026-10-02-old-1a2b3c4d", "2026-11-02-new-5e6f7a8b"];
	await mkdir(join(root, ".limen", "archive", "2026-10", october), { recursive: true });
	await mkdir(join(root, ".limen", "archive", "2026-11", november), { recursive: true });
	assert.deepEqual(await archivedJobs(root), [
		{ id: october, jobDir: join(root, ".limen", "archive", "2026-10", october) },
		{ id: november, jobDir: join(root, ".limen", "archive", "2026-11", november) },
	]);
});
