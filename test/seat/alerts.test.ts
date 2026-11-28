// seat/alerts.ts on fixtures: its run against a local ntfy server, and its install and units step with a fake runner.
import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { chmod, mkdir, mkdtemp, readFile, realpath, rm, stat, symlink, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test, { type TestContext } from "node:test";
import { fileURLToPath } from "node:url";
import { type AlertsInput, alertLine, runAlerts } from "../../seat/alerts.ts";
import type { Ran } from "../../seat/program.ts";
import { ALERTS_SERVICE, ALERTS_TIMER, alertsUnitFiles } from "../../seat/units.ts";
import type { JobRecord } from "../../src/job/record.ts";
import { writeRecord } from "../plant.ts";
import { type Ntfy, ntfy } from "./ntfy.ts";
import {
	bareRemote,
	commitIn,
	copyOf,
	KEY_TEXT,
	KNOWN_HOSTS_TEXT,
	keptTimes,
	recordingRunner,
	setMain,
	writeWatchEntry,
} from "./watched-remote.ts";

const SCRIPT = fileURLToPath(new URL("../../seat/alerts.ts", import.meta.url));
const TOPIC = "limen-test-topic";
const ACCOUNT = "alerts-test";
const FAILED_ID = "2026-11-16-f001-work-a-37c02ed6";
const OTHER_ID = "2026-11-17-f002-work-b-1a2b3c4d";
const FINISHED = "2026-11-16T10:00:00.000Z";
/** The user id the tests run with; the fixtures count it as root's, so the files they write are root's. */
const UID = process.getuid?.() ?? 1000;
const QUOTA: Partial<JobRecord> = {
	state: "failed",
	failure: { kind: "quota", detail: "You've hit your limit", resetAt: null },
	finishedAt: FINISHED,
};

type Fixture = {
	readonly dir: string;
	readonly passwd: string;
	/** The agents' home, whose registry lists both projects. */
	readonly home: string;
	readonly registry: string;
	readonly synchronizer: string;
	readonly ledger: string;
	readonly credentials: string;
	readonly state: string;
	readonly units: string;
	readonly topicFile: string;
	/** The `main` watcher's folder of root's entries, which no fixture holds until a test writes it. */
	readonly watchFolder: string;
};

async function fixture(t: TestContext): Promise<Fixture> {
	const dir = await realpath(await mkdtemp(join(tmpdir(), "limen-alerts-")));
	t.after(() => rm(dir, { recursive: true, force: true }));
	const home = join(dir, "agents");
	const [synchronizer, ledger] = [join(home, "synchronizer"), join(home, "ledger")];
	const [credentials, state, units] = [join(dir, "credentials"), join(dir, "state"), join(dir, "units")];
	await Promise.all(
		[
			join(synchronizer, ".limen", "jobs"),
			join(ledger, ".limen", "jobs"),
			join(home, ".limen"),
			credentials,
			state,
			units,
		].map((folder) => mkdir(folder, { recursive: true })),
	);
	const registry = join(home, ".limen", "projects");
	await writeFile(registry, `${synchronizer}\n${ledger}\n`);
	const passwd = join(dir, "passwd");
	await writeFile(
		passwd,
		[
			`root:x:0:0:root:${join(dir, "root")}:/bin/sh`,
			`agents:x:1000:1000::${home}:/bin/sh`,
			`${ACCOUNT}:x:998:998::${join(dir, "alerts-home")}:/usr/sbin/nologin`,
			"",
		].join("\n"),
	);
	await writeFile(join(credentials, "topic"), `${TOPIC}\n`);
	const topicFile = join(dir, "alerts-topic");
	await writeFile(topicFile, `${TOPIC}\n`, { mode: 0o600 });
	const watchFolder = join(dir, "watch");
	return { dir, passwd, home, registry, synchronizer, ledger, credentials, state, units, topicFile, watchFolder };
}

/** A runner that records every program it is asked to run and answers each with `answer`, success by default. */
function runner(answer: (argv: readonly string[]) => Ran = () => ({ status: 0, stdout: "", stderr: "" })) {
	const calls: string[] = [];
	const run = (argv: readonly [string, ...string[]]): Ran => {
		calls.push(argv.join(" "));
		return answer(argv);
	};
	return { calls, run };
}

function input(f: Fixture, args: readonly string[], overrides: Partial<AlertsInput> = {}): AlertsInput {
	return {
		args,
		passwd: f.passwd,
		env: { CREDENTIALS_DIRECTORY: f.credentials, STATE_DIRECTORY: f.state },
		uid: UID,
		rootUid: UID,
		run: runner(() => assert.fail("a run of the alerts starts no program")).run,
		unitFolder: f.units,
		topicFile: f.topicFile,
		watchFolder: f.watchFolder,
		now: () => new Date(),
		...overrides,
	};
}

const run = (f: Fixture, overrides: Partial<AlertsInput> = {}) => runAlerts(input(f, ["run"], overrides));
const job = (project: string, id: string) => join(project, ".limen", "jobs", id);

/** The first run: it records what fails now, so the tests that send have a state file. */
async function firstRun(f: Fixture): Promise<void> {
	const first = await run(f);
	assert.equal(first.code, 0, first.stderr);
}

test("a failed job sends one line to the topic, and a second run sends nothing more", async (t) => {
	const [f, server] = [await fixture(t), await ntfy(t)];
	await firstRun(f);
	await writeRecord(job(f.synchronizer, FAILED_ID), QUOTA);
	const sent = await run(f);
	assert.equal(sent.code, 0, sent.stderr);
	const again = await run(f);
	assert.equal(again.code, 0, again.stderr);
	assert.deepEqual(server.posts, [
		{ path: `/${TOPIC}`, body: `synchronizer failed:quota ${FAILED_ID}`, title: undefined },
	]);
});

test("a done, stopped, running or starting job sends nothing", async (t) => {
	const [f, server] = [await fixture(t), await ntfy(t)];
	await firstRun(f);
	const states = ["done", "stopped", "running", "starting"] as const;
	for (const [index, state] of states.entries()) {
		await writeRecord(job(f.synchronizer, `2026-11-18-f00${index}-work-a-0000000${index}`), {
			state,
			finishedAt: FINISHED,
		});
	}
	const ran = await run(f);
	assert.deepEqual([ran.code, server.posts], [0, []], ran.stderr);
});

// A-054: installing the alerts marks every failure of the projects as already reported.
test("A-054: the first run records every current failure as reported and sends nothing, and the next run sends nothing", async (t) => {
	const [f, server] = [await fixture(t), await ntfy(t)];
	await writeRecord(job(f.synchronizer, FAILED_ID), QUOTA);
	await writeRecord(job(f.ledger, OTHER_ID), { ...QUOTA, failure: null });
	const first = await run(f);
	assert.equal(first.code, 0, first.stderr);
	assert.match(first.stdout, /^first read of 2 projects: 2 events recorded as reported, none sent \(A-054\)$/m);
	const next = await run(f);
	assert.deepEqual([next.code, server.posts], [0, []], next.stderr);
});

/** The wait of a job in the start queue that got its diagnosis (A-036), as the wrapper writes it. */
const DIAGNOSIS = {
	since: FINISHED,
	diagnosedAt: "2026-11-16T10:30:00.000Z",
	diagnosis: "CPU 10% idle (gate 25%), memory 80% free (gate 20%); largest by memory: none; largest by CPU: none",
	leftAt: null,
} as const;
const DIAGNOSED: Partial<JobRecord> = {
	state: "running",
	queued: { since: FINISHED, detail: "CPU 10% idle (gate 25%), memory 80% free (gate 20%)", ahead: 0 },
	queueWait: DIAGNOSIS,
};

// A-066, D-084: a long wait in the start queue is an event of its own, `queue`, with the fixed fields only.
test("a job whose start-queue wait got its diagnosis sends one queue line, and a second run sends nothing more", async (t) => {
	const [f, server] = [await fixture(t), await ntfy(t)];
	await firstRun(f);
	await writeRecord(job(f.synchronizer, FAILED_ID), DIAGNOSED);
	const sent = await run(f);
	assert.equal(sent.code, 0, sent.stderr);
	const again = await run(f);
	assert.equal(again.code, 0, again.stderr);
	assert.deepEqual(
		server.posts.map((post) => post.body),
		[`synchronizer queue ${FAILED_ID}`],
	);
});

// A-036: the event is the diagnosis, which comes after diagnoseAfter, so a wait that has not reached it is no event.
test("a job whose start-queue wait has no diagnosis yet sends nothing", async (t) => {
	const [f, server] = [await fixture(t), await ntfy(t)];
	await firstRun(f);
	const undiagnosed = { ...DIAGNOSIS, diagnosedAt: null, diagnosis: null };
	await writeRecord(job(f.synchronizer, FAILED_ID), { ...DIAGNOSED, queueWait: undiagnosed });
	const ran = await run(f);
	assert.deepEqual([ran.code, server.posts], [0, []], ran.stderr);
});

/** A running job whose processes the seat sweep failed to end `attempts` times in a row (R-032). */
const stuckJob = (attempts: number): Partial<JobRecord> => ({
	state: "running",
	stuck: { since: FINISHED, attempts, detail: "limen-job-x.scope not ended: Failed to connect to bus" },
});

// R-032 (b), T-02: a timer rings only after several runs in a row, so the alert waits for the third failed attempt.
test("a job the sweep failed to end sends one stuck line from its third attempt in a row, none before, and nothing more after", async (t) => {
	const [f, server] = [await fixture(t), await ntfy(t)];
	await firstRun(f);
	await writeRecord(job(f.synchronizer, FAILED_ID), stuckJob(2));
	const second = await run(f);
	const before = [...server.posts];
	await writeRecord(job(f.synchronizer, FAILED_ID), stuckJob(3));
	const third = await run(f);
	await writeRecord(job(f.synchronizer, FAILED_ID), stuckJob(4));
	const fourth = await run(f);
	assert.deepEqual(
		[second.code, before, third.code, fourth.code, server.posts.map((post) => post.body)],
		[0, [], 0, 0, [`synchronizer stuck ${FAILED_ID}`]],
		`${second.stderr}${third.stderr}${fourth.stderr}`,
	);
});

test("a run's summary counts the events it found of each kind", async (t) => {
	const [f] = [await fixture(t), await ntfy(t)];
	await firstRun(f);
	await writeRecord(job(f.synchronizer, FAILED_ID), DIAGNOSED);
	await writeRecord(job(f.ledger, OTHER_ID), QUOTA);
	const ran = await run(f);
	assert.equal(ran.code, 0, ran.stderr);
	assert.equal(ran.stdout.split("\n")[0], "read 2 projects: 1 failed job, 1 long start-queue wait, 0 stuck jobs");
});

// D-090 (1), A-054: the alerts kept no list of the projects they had read, so a project registered after their first
// run sent every failure it already held.
test("D-090: a project registered after the first run records its present events as reported and sends none, then alerts as the others", async (t) => {
	const [f, server] = [await fixture(t), await ntfy(t)];
	await writeFile(f.registry, `${f.synchronizer}\n`);
	await firstRun(f);
	await writeRecord(job(f.ledger, OTHER_ID), QUOTA);
	await writeFile(f.registry, `${f.synchronizer}\n${f.ledger}\n`);
	const joined = await run(f);
	assert.equal(joined.code, 0, joined.stderr);
	assert.match(joined.stdout, /^first read of 1 project: 1 event recorded as reported, none sent \(A-054\)$/m);
	await writeRecord(job(f.ledger, FAILED_ID), QUOTA);
	const next = await run(f);
	assert.equal(next.code, 0, next.stderr);
	assert.deepEqual(
		{
			posts: server.posts.map((post) => post.body),
			projects: await readFile(join(f.state, "projects"), "utf8"),
			mode: (await stat(join(f.state, "projects"))).mode & 0o777,
		},
		{ posts: [`ledger failed:quota ${FAILED_ID}`], projects: `${f.ledger}\n${f.synchronizer}\n`, mode: 0o600 },
	);
});

// D-090 (1): R-033's state folder holds `reported` and no list, so every project of the next run counts as read once.
test("D-090: a state folder with a reported file and no list of projects counts every project of the run as read, and sends its new events", async (t) => {
	const [f, server] = [await fixture(t), await ntfy(t)];
	await writeFile(join(f.state, "reported"), "");
	await writeRecord(job(f.synchronizer, FAILED_ID), QUOTA);
	const ran = await run(f);
	assert.equal(ran.code, 0, ran.stderr);
	assert.deepEqual(
		{
			posts: server.posts.map((post) => post.body),
			projects: await readFile(join(f.state, "projects"), "utf8"),
			reported: await readFile(join(f.state, "reported"), "utf8"),
		},
		{
			posts: [`synchronizer failed:quota ${FAILED_ID}`],
			projects: `${f.ledger}\n${f.synchronizer}\n`,
			reported: `${f.synchronizer}/${FAILED_ID}/failed\n`,
		},
	);
});

// The ticket's Migration: the seat's failed jobs are migrated records (D-057), and none of them rings.
test("A-054: a project of migrated failed records sends nothing on the first run, and one line for a new failed job", async (t) => {
	const [f, server] = [await fixture(t), await ntfy(t)];
	const migrated = { ...QUOTA, migrated: { at: FINISHED } };
	await writeRecord(job(f.synchronizer, "2026-11-10-f001-work-a-0a0b"), migrated);
	await writeRecord(job(f.synchronizer, "2026-11-11-f002-work-a-0c0d0e0f"), { ...migrated, failure: null });
	await firstRun(f);
	assert.equal(server.posts.length, 0);
	await writeRecord(job(f.synchronizer, FAILED_ID), QUOTA);
	const second = await run(f);
	assert.equal(second.code, 0, second.stderr);
	assert.deepEqual(
		server.posts.map((post) => post.body),
		[`synchronizer failed:quota ${FAILED_ID}`],
	);
});

test("a send that ntfy refuses leaves the failure unreported: the run exits 3, and the next run sends it", async (t) => {
	const [f, server] = [await fixture(t), await ntfy(t)];
	await firstRun(f);
	await writeRecord(job(f.synchronizer, FAILED_ID), QUOTA);
	server.answer = 503;
	const refused = await run(f);
	assert.equal(refused.code, 3, refused.stderr);
	assert.ok(refused.stderr.includes(`synchronizer failed:quota ${FAILED_ID}`), refused.stderr);
	server.answer = 200;
	const retried = await run(f);
	assert.equal(retried.code, 0, retried.stderr);
	const after = await run(f);
	assert.equal(after.code, 0, after.stderr);
	assert.deepEqual(
		server.posts.map((post) => post.body),
		[`synchronizer failed:quota ${FAILED_ID}`, `synchronizer failed:quota ${FAILED_ID}`],
	);
});

// A-066: the topic is the only access control of a public relay, so no output names it.
test("A-066: a failed send names the alert and never the topic", async (t) => {
	const [f, server] = [await fixture(t), await ntfy(t)];
	await firstRun(f);
	await writeRecord(job(f.synchronizer, FAILED_ID), QUOTA);
	server.answer = 500;
	const refused = await run(f);
	assert.equal(refused.code, 3, refused.stderr);
	assert.ok(refused.stderr.includes(FAILED_ID), refused.stderr);
	assert.ok(!`${refused.stdout}${refused.stderr}`.includes(TOPIC), `${refused.stdout}${refused.stderr}`);
});

// z. 10: one damaged project never stops the alerts of the others.
test("a project whose jobs cannot be listed is named, the run exits 4, and the next project still alerts", async (t) => {
	const [f, server] = [await fixture(t), await ntfy(t)];
	await firstRun(f);
	// A file in the place of the jobs folder fails the listing for every user, root included.
	await rm(join(f.synchronizer, ".limen", "jobs"), { recursive: true });
	await writeFile(join(f.synchronizer, ".limen", "jobs"), "not a folder\n");
	await writeRecord(job(f.ledger, FAILED_ID), QUOTA);
	const ran = await run(f);
	assert.equal(ran.code, 4, ran.stderr);
	assert.ok(ran.stderr.includes(f.synchronizer), ran.stderr);
	assert.deepEqual(
		server.posts.map((post) => post.body),
		[`ledger failed:quota ${FAILED_ID}`],
	);
});

test("a record that cannot be read is named, the run exits 4, and the other jobs of its project still alert", async (t) => {
	const [f, server] = [await fixture(t), await ntfy(t)];
	await firstRun(f);
	const damaged = job(f.synchronizer, "2026-11-15-f000-work-a-00000000");
	await mkdir(damaged, { recursive: true });
	await writeFile(join(damaged, "record.json"), "{ damaged\n");
	await writeRecord(job(f.synchronizer, FAILED_ID), QUOTA);
	const ran = await run(f);
	assert.equal(ran.code, 4, ran.stderr);
	assert.ok(ran.stderr.includes(damaged), ran.stderr);
	assert.deepEqual(
		server.posts.map((post) => post.body),
		[`synchronizer failed:quota ${FAILED_ID}`],
	);
});

// Review round 1, F1 (T-01): a run that reads nothing would exit 0 every minute while no failure reaches the phone.
test("a run that reads no project exits 4 with one line that names why, and records nothing as reported", async (t) => {
	const cases: ReadonlyArray<{ name: string; make: (f: Fixture) => Promise<void>; says: RegExp }> = [
		{ name: "no registry", make: (f) => rm(f.registry), says: /read no project: no home directory of .* holds/ },
		{
			name: "a registry with no project",
			make: (f) => writeFile(f.registry, `${join(f.dir, "not-a-project")}\nrelative/line\n`),
			says: /read no project: no line of the registries .* names a folder with \.limen/,
		},
	];
	for (const { name, make, says } of cases) {
		const [f, server] = [await fixture(t), await ntfy(t)];
		await make(f);
		const ran = await run(f);
		assert.equal(ran.code, 4, `${name}: ${ran.stderr}`);
		assert.match(ran.stderr, says, name);
		assert.deepEqual(server.posts, [], name);
		await assert.rejects(stat(join(f.state, "reported")), /ENOENT/, name);
	}
});

/** Appends an account whose home is `home` to the fixture's password file. */
async function addAccount(f: Fixture, name: string, home: string): Promise<void> {
	await writeFile(f.passwd, `${await readFile(f.passwd, "utf8")}${name}:x:1001:1001::${home}:/bin/sh\n`);
}

/** Runs `work` with the mode of `path` set to `mode`, and gives the path its mode back after it. */
async function withMode<T>(path: string, mode: number, work: () => Promise<T>): Promise<T> {
	const before = (await stat(path)).mode & 0o7777;
	await chmod(path, mode);
	try {
		return await work();
	} finally {
		await chmod(path, before);
	}
}

const isRoot = process.getuid?.() === 0;

test("a run whose every registry is in a home its account cannot enter exits 4 naming them", async (t) => {
	if (isRoot) {
		t.skip("root enters every folder");
		return;
	}
	const [f, server] = [await fixture(t), await ntfy(t)];
	const ran = await withMode(f.home, 0o000, () => run(f));
	assert.equal(ran.code, 4, ran.stderr);
	assert.ok(
		ran.stderr.includes(`read no project: every registry is in a home this account cannot enter (${f.registry})`),
		ran.stderr,
	);
	assert.deepEqual(server.posts, []);
});

/** The line of a run's stderr that says why it read no project. */
const noProjectLine = (stderr: string) => stderr.split("\n").find((line) => line.startsWith("read no project:"));

// Review round 2, G1 (z. 10): on the seat `/root/.limen/projects` is always closed, so the summary must not blame a
// closed home when the agents' registry is the one that cannot be read.
test("a run with an unreadable registry beside a closed one says it could not read the registry", async (t) => {
	if (isRoot) {
		t.skip("root reads every file");
		return;
	}
	const [f, server] = [await fixture(t), await ntfy(t)];
	const closed = join(f.dir, "closed");
	await mkdir(join(closed, ".limen"), { recursive: true });
	await writeFile(join(closed, ".limen", "projects"), `${join(closed, "project")}\n`);
	await addAccount(f, "closed", closed);
	const ran = await withMode(closed, 0o000, () => withMode(f.registry, 0o000, () => run(f)));
	assert.equal(ran.code, 4, ran.stderr);
	assert.ok(ran.stderr.includes(`cannot read the registry ${f.registry}`), ran.stderr);
	assert.equal(noProjectLine(ran.stderr), "read no project: could not read 1 registry (named above)");
	assert.deepEqual(server.posts, []);
});

test("a run whose read registry names only projects it cannot read says it could not read them", async (t) => {
	const [f, server] = [await fixture(t), await ntfy(t)];
	const loop = join(f.dir, "loop");
	await mkdir(loop);
	// A symlink to itself fails every stat with ELOOP, for every user, root included.
	await symlink(".limen", join(loop, ".limen"));
	await writeFile(f.registry, `${loop}\n`);
	const ran = await run(f);
	assert.equal(ran.code, 4, ran.stderr);
	assert.ok(ran.stderr.includes(`cannot read the project ${loop}`), ran.stderr);
	assert.equal(noProjectLine(ran.stderr), "read no project: could not read 1 registered project (named above)");
	assert.deepEqual(server.posts, []);
});

// D-090 (2): an unreadable root was counted, with its problem line, once for each registry that listed it.
test("D-090: a run that reads no project counts a root two registries list and it cannot read once, with one line", async (t) => {
	const [f, server] = [await fixture(t), await ntfy(t)];
	const loop = join(f.dir, "loop");
	await mkdir(loop);
	// A symlink to itself fails every stat with ELOOP, for every user, root included.
	await symlink(".limen", join(loop, ".limen"));
	await writeFile(f.registry, `${loop}\n`);
	const other = join(f.dir, "other");
	await mkdir(join(other, ".limen"), { recursive: true });
	await writeFile(join(other, ".limen", "projects"), `${loop}\n`);
	await addAccount(f, "other", other);
	const ran = await run(f);
	assert.equal(ran.code, 4, ran.stderr);
	assert.deepEqual(
		{
			lines: ran.stderr.split("\n").filter((line) => line.startsWith(`cannot read the project ${loop}`)).length,
			summary: noProjectLine(ran.stderr),
			posts: server.posts,
		},
		{ lines: 1, summary: "read no project: could not read 1 registered project (named above)", posts: [] },
	);
});

// Review round 1, F2: each test fails when the behaviour it names is removed.
test("D-057: migrated failed records written after the first run send nothing", async (t) => {
	const [f, server] = [await fixture(t), await ntfy(t)];
	await firstRun(f);
	await writeRecord(job(f.synchronizer, FAILED_ID), { ...QUOTA, migrated: { at: FINISHED } });
	await writeRecord(job(f.ledger, OTHER_ID), { ...QUOTA, failure: null, migrated: { at: FINISHED } });
	const ran = await run(f);
	assert.deepEqual([ran.code, server.posts], [0, []], ran.stderr);
});

test("D-057: a folder an older Limen wrote after the first run sends nothing and fails nothing", async (t) => {
	const [f, server] = [await fixture(t), await ntfy(t)];
	await firstRun(f);
	const older = job(f.synchronizer, "2026-11-12-f003-work-a-0e0f");
	await mkdir(older, { recursive: true });
	await writeFile(join(older, "state"), "failed\n");
	const ran = await run(f);
	assert.deepEqual([ran.code, server.posts], [0, []], ran.stderr);
});

test("a registry in a home the alerts account cannot enter is skipped, and the other projects still alert", async (t) => {
	if (isRoot) {
		t.skip("root enters every folder");
		return;
	}
	const [f, server] = [await fixture(t), await ntfy(t)];
	const closed = join(f.dir, "closed");
	await mkdir(join(closed, ".limen"), { recursive: true });
	await writeFile(join(closed, ".limen", "projects"), `${join(closed, "project")}\n`);
	await addAccount(f, "closed", closed);
	await firstRun(f);
	await writeRecord(job(f.ledger, FAILED_ID), QUOTA);
	const ran = await withMode(closed, 0o000, () => run(f));
	assert.equal(ran.code, 0, ran.stderr);
	assert.deepEqual(
		server.posts.map((post) => post.body),
		[`ledger failed:quota ${FAILED_ID}`],
	);
});

test("a registry the alerts account can see but not read is named and fails the run with exit 4", async (t) => {
	if (isRoot) {
		t.skip("root reads every file");
		return;
	}
	const [f, server] = [await fixture(t), await ntfy(t)];
	const blocked = join(f.dir, "blocked");
	await mkdir(join(blocked, ".limen"), { recursive: true });
	const registry = join(blocked, ".limen", "projects");
	await writeFile(registry, `${f.ledger}\n`);
	await addAccount(f, "blocked", blocked);
	await firstRun(f);
	await writeRecord(job(f.ledger, FAILED_ID), QUOTA);
	const ran = await withMode(registry, 0o000, () => run(f));
	assert.equal(ran.code, 4, ran.stderr);
	assert.ok(ran.stderr.includes(`cannot read the registry ${registry}`), ran.stderr);
	assert.deepEqual(
		server.posts.map((post) => post.body),
		[`ledger failed:quota ${FAILED_ID}`],
	);
});

test("a failed job whose record names no failure kind sends the kind unknown", async (t) => {
	const [f, server] = [await fixture(t), await ntfy(t)];
	await firstRun(f);
	await writeRecord(job(f.ledger, FAILED_ID), { ...QUOTA, failure: null });
	const ran = await run(f);
	assert.equal(ran.code, 0, ran.stderr);
	assert.deepEqual(
		server.posts.map((post) => post.body),
		[`ledger failed:unknown ${FAILED_ID}`],
	);
});

// D-095: an end where the engine did not start had no kind, so its alert said `failed:unknown`.
test("a failed job whose record names the kind launch sends the kind launch", async (t) => {
	const [f, server] = [await fixture(t), await ntfy(t)];
	await firstRun(f);
	const failure = { kind: "launch", detail: "failed to launch wrapper: no scope", resetAt: null } as const;
	await writeRecord(job(f.ledger, FAILED_ID), { ...QUOTA, failure });
	const ran = await run(f);
	assert.equal(ran.code, 0, ran.stderr);
	assert.deepEqual(
		server.posts.map((post) => post.body),
		[`ledger failed:launch ${FAILED_ID}`],
	);
});

/** The provider's text of the 5-hour limit, which no alert carries. */
const LIMIT_TEXT = "error: You've hit your session limit · resets 3pm (UTC)";
/** An ISO time `minutes` from now: in the past when negative. */
const fromNow = (minutes: number) => new Date(Date.now() + minutes * 60_000).toISOString();
/** The ids of the quota jobs these tests plant in the ledger project. */
const QUOTA_ID = "2026-11-24-f001-limit-1a2b3c4d";
const NEWER_ID = "2026-11-24-f001-continued-2b3c4d5e";

/** A job of the ledger project that stopped on the limit with the reset `resetAt`, on a worktree of its own. */
async function quotaJob(f: Fixture, resetAt: string, fields: Partial<JobRecord> = {}): Promise<void> {
	await writeRecord(job(f.ledger, QUOTA_ID), {
		...QUOTA,
		worktree: join(f.dir, "worktrees", QUOTA_ID),
		startedAt: fromNow(-120),
		failure: { kind: "quota", detail: LIMIT_TEXT, resetAt },
		...fields,
	});
}

/** The bodies the alerts sent in two runs after the first, each run exiting 0. */
async function twoRuns(f: Fixture, server: Ntfy): Promise<string[]> {
	for (const _ of [1, 2]) {
		const ran = await run(f);
		assert.equal(ran.code, 0, ran.stderr);
	}
	return server.posts.map((post) => post.body);
}

// D-097 (5) (b): Limen resumes a quota job with a known reset itself, 5 minutes after it, so the phone stays quiet then.
test("a quota failure with a known reset whose resume is not yet 15 minutes overdue sends nothing", async (t) => {
	const [f, server] = [await fixture(t), await ntfy(t)];
	await firstRun(f);
	await quotaJob(f, fromNow(-10));
	assert.deepEqual(await twoRuns(f, server), []);
});

// D-100: a resume that never started, refused at every run, rang nothing at all.
test("a quota failure whose resume is overdue and that nothing continued sends failed:quota once", async (t) => {
	const [f, server] = [await fixture(t), await ntfy(t)];
	await firstRun(f);
	await quotaJob(f, fromNow(-30));
	assert.deepEqual(await twoRuns(f, server), [`ledger failed:quota ${QUOTA_ID}`]);
});

// D-100: a continuation took the job's worktree, a resume or the coordinator's own, so nothing is left to report.
test("an overdue quota failure whose worktree a newer record holds sends nothing", async (t) => {
	const [f, server] = [await fixture(t), await ntfy(t)];
	await firstRun(f);
	await quotaJob(f, fromNow(-30));
	await writeRecord(job(f.ledger, NEWER_ID), {
		state: "running",
		worktree: join(f.dir, "worktrees", QUOTA_ID),
		startedAt: fromNow(-20),
	});
	assert.deepEqual(await twoRuns(f, server), []);
});

// D-100: the sweep never resumes a member of a group, so its overdue resume rings as any other.
test("an overdue quota failure of a group member sends failed:quota", async (t) => {
	const [f, server] = [await fixture(t), await ntfy(t)];
	await firstRun(f);
	await quotaJob(f, fromNow(-30), { group: "f001-group", team: "team-1" });
	assert.deepEqual(await twoRuns(f, server), [`ledger failed:quota ${QUOTA_ID}`]);
});

// A-016 (5): the third resume that stops on the limit again ends Limen's resumes, which the phone hears of.
test("a quota-exhausted job sends failed:quota-exhausted", async (t) => {
	const [f, server] = [await fixture(t), await ntfy(t)];
	await firstRun(f);
	await quotaJob(f, fromNow(-10), {
		quotaAttempt: 3,
		failure: { kind: "quota-exhausted", detail: LIMIT_TEXT, resetAt: fromNow(-10) },
	});
	assert.deepEqual(await twoRuns(f, server), [`ledger failed:quota-exhausted ${QUOTA_ID}`]);
});

/** A bare remote whose `main` holds one commit, and the watch entry of `synchronizer` that names it; both. */
async function watchedSynchronizer(f: Fixture): Promise<{ readonly remote: string; readonly tip: string }> {
	const remote = bareRemote(join(f.dir, "remote.git"));
	const tip = commitIn(remote);
	setMain(remote, tip);
	await writeWatchEntry(f.credentials, "synchronizer", remote);
	return { remote, tip };
}

/** A run of the alerts with watch entries: its runner runs git for real, which finds git on the test's PATH. */
const watchedRun = (f: Fixture) =>
	run(f, {
		env: { CREDENTIALS_DIRECTORY: f.credentials, STATE_DIRECTORY: f.state, PATH: process.env.PATH },
		run: recordingRunner([]),
	});

const bodies = (server: Ntfy) => server.posts.map((post) => post.body);

// D-117 (2): the watcher runs after the record events, so its lines follow the jobs' in a run.
test("D-117: a forced update of a watched main sends its line after the job lines of the same run", async (t) => {
	const [f, server] = [await fixture(t), await ntfy(t)];
	const { remote, tip } = await watchedSynchronizer(f);
	assert.equal((await watchedRun(f)).code, 0);
	await writeRecord(job(f.synchronizer, FAILED_ID), QUOTA);
	setMain(remote, commitIn(remote));
	const sent = await watchedRun(f);
	assert.equal(sent.code, 0, sent.stderr);
	assert.deepEqual(bodies(server), [
		`synchronizer failed:quota ${FAILED_ID}`,
		`synchronizer main:forced ${tip.slice(0, 12)}`,
	]);
});

// D-117 (2): the watcher's events go through the alerts' one record of what was sent.
test("D-117: a main line ntfy took is recorded under its kept ref's time, and a second run sends nothing more", async (t) => {
	const [f, server] = [await fixture(t), await ntfy(t)];
	const { remote, tip } = await watchedSynchronizer(f);
	assert.equal((await watchedRun(f)).code, 0);
	setMain(remote, commitIn(remote));
	for (const _ of [1, 2]) {
		const ran = await watchedRun(f);
		assert.equal(ran.code, 0, ran.stderr);
	}
	const [time] = keptTimes(copyOf(f.state, "synchronizer"));
	assert.deepEqual(
		{
			posts: bodies(server),
			reported: (await readFile(join(f.state, "reported"), "utf8"))
				.split("\n")
				.includes(`synchronizer/main/${time}/forced`),
		},
		{ posts: [`synchronizer main:forced ${tip.slice(0, 12)}`], reported: true },
	);
});

test("D-117: a main line ntfy refuses leaves it unreported: the run exits 3, and the next run sends it", async (t) => {
	const [f, server] = [await fixture(t), await ntfy(t)];
	const { remote, tip } = await watchedSynchronizer(f);
	assert.equal((await watchedRun(f)).code, 0);
	setMain(remote, commitIn(remote));
	server.answer = 503;
	const refused = await watchedRun(f);
	assert.equal(refused.code, 3, refused.stderr);
	assert.ok(refused.stderr.includes(`synchronizer main:forced ${tip.slice(0, 12)}`), refused.stderr);
	server.answer = 200;
	for (const _ of [1, 2]) {
		const ran = await watchedRun(f);
		assert.equal(ran.code, 0, ran.stderr);
	}
	assert.deepEqual(bodies(server), [
		`synchronizer main:forced ${tip.slice(0, 12)}`,
		`synchronizer main:forced ${tip.slice(0, 12)}`,
	]);
});

test("D-117: a seat with no watch entries sends the job lines as before", async (t) => {
	const [f, server] = [await fixture(t), await ntfy(t)];
	await firstRun(f);
	await writeRecord(job(f.synchronizer, FAILED_ID), QUOTA);
	const ran = await run(f);
	assert.equal(ran.code, 0, ran.stderr);
	assert.deepEqual(bodies(server), [`synchronizer failed:quota ${FAILED_ID}`]);
});

// D-117 (3): the registry only names a registered project that has no entry.
test("D-117: a seat with no watch entries names each registered project in the run's output", async (t) => {
	const [f] = [await fixture(t), await ntfy(t)];
	const ran = await run(f);
	assert.equal(ran.code, 0, ran.stderr);
	assert.deepEqual(
		ran.stdout.split("\n").filter((line) => line.includes("registered, but no watch entry")),
		["synchronizer", "ledger"].map(
			(name) => `main of ${name}: registered, but no watch entry (watch_${name}.address and .key)`,
		),
	);
});

test("D-117: a seat with no watch entries starts no program", async (t) => {
	const [f] = [await fixture(t), await ntfy(t)];
	const programs = runner();
	const ran = await run(f, { run: programs.run });
	assert.equal(ran.code, 0, ran.stderr);
	assert.deepEqual(programs.calls, []);
});

// D-117 (3): the registry is the agents' file, so emptying it must not stop the watch of main.
test("D-117: a run that reads no project still watches main and sends its line, then exits 4", async (t) => {
	const [f, server] = [await fixture(t), await ntfy(t)];
	const { remote, tip } = await watchedSynchronizer(f);
	assert.equal((await watchedRun(f)).code, 0);
	await writeFile(f.registry, "");
	setMain(remote, commitIn(remote));
	const ran = await watchedRun(f);
	assert.equal(ran.code, 4, ran.stderr);
	assert.match(ran.stderr, /read no project/);
	assert.deepEqual(bodies(server), [`synchronizer main:forced ${tip.slice(0, 12)}`]);
});

// A-054: a main line written to `reported` before any project was read made a later run send old job failures.
test("A-054: a main line sent before any run read a project leaves every project for its first read", async (t) => {
	const [f, server] = [await fixture(t), await ntfy(t)];
	const { remote, tip } = await watchedSynchronizer(f);
	await rm(f.registry);
	assert.equal((await watchedRun(f)).code, 4);
	setMain(remote, commitIn(remote));
	assert.equal((await watchedRun(f)).code, 4);
	await writeRecord(job(f.synchronizer, FAILED_ID), QUOTA);
	await writeFile(f.registry, `${f.synchronizer}\n${f.ledger}\n`);
	const joined = await watchedRun(f);
	assert.equal(joined.code, 0, joined.stderr);
	assert.match(joined.stdout, /^first read of 2 projects: 1 event recorded as reported, none sent \(A-054\)$/m);
	assert.deepEqual(bodies(server), [`synchronizer main:forced ${tip.slice(0, 12)}`]);
});

test("D-117: an alert with no subject is the project folder's base name and the event", () => {
	assert.equal(alertLine("synchronizer", "main:unwatched"), "synchronizer main:unwatched");
});

test("D-084: an alert is the project folder's base name, the event and the job id, with no path", () => {
	assert.equal(
		alertLine("/home/agents/synchronizer", "failed:quota", FAILED_ID),
		`synchronizer failed:quota ${FAILED_ID}`,
	);
});

test("T-10: a project name that would make an alert longer than 100 characters is cut with a visible ellipsis", () => {
	const line = alertLine(`/home/agents/${"long-project-name-".repeat(6)}`, "failed:read-only-violation", FAILED_ID);
	assert.equal([...line].length, 100);
	assert.ok(line.endsWith(`… failed:read-only-violation ${FAILED_ID}`), line);
	assert.ok(line.startsWith("long-project-name-"), line);
});

test("T-10: an id no Limen makes, too long for one alert line, keeps its end", () => {
	const id = `${"x".repeat(120)}-1a2b3c4d`;
	const line = alertLine("/home/agents/synchronizer", "failed:quota", id);
	assert.equal([...line].length, 100);
	assert.ok(line.endsWith("-1a2b3c4d"), line);
});

test("a control character in a project's folder name reaches the alert escaped", () => {
	assert.equal(
		alertLine("/home/agents/odd\u001b]0;owned\u0007", "failed:quota", FAILED_ID),
		`odd\\x1b]0;owned\\x07 failed:quota ${FAILED_ID}`,
	);
});

// A-066: the topic is a systemd credential only; the environment never names it.
test("A-066: a run without a credentials folder exits 4 naming CREDENTIALS_DIRECTORY and sends nothing, whatever NTFY_TOPIC says", async (t) => {
	const [f, server] = [await fixture(t), await ntfy(t)];
	await firstRun(f);
	await writeRecord(job(f.synchronizer, FAILED_ID), QUOTA);
	const ran = await run(f, { env: { STATE_DIRECTORY: f.state, NTFY_TOPIC: TOPIC } });
	assert.equal(ran.code, 4, ran.stderr);
	assert.match(ran.stderr, /CREDENTIALS_DIRECTORY/);
	assert.deepEqual(server.posts, []);
});

test("the entry point runs as a program: without a subcommand it exits 2 and names the subcommands", () => {
	const ran = spawnSync(process.execPath, [SCRIPT], { encoding: "utf8", timeout: 60_000 });
	assert.equal(ran.status, 2, ran.stderr);
	assert.match(ran.stderr, /run/);
	assert.match(ran.stderr, /install --account/);
});

/** The install's probes of the seat tools it and the runs need (T-12), each a call that prints only a version. */
const PROBES = ["setfacl --version", "systemd-analyze --version", "systemctl --version", "git --version", "ssh -V"];

/** The commands of a first install for `f`: the tool probes, the grants, the units and the timer. */
function installCommands(f: Fixture): string[] {
	const parents = (path: string) => {
		const found: string[] = [];
		for (let folder = join(path, ".."); folder !== "/"; folder = join(folder, "..")) {
			found.push(folder);
		}
		return found;
	};
	const jobs = [join(f.ledger, ".limen", "jobs"), join(f.synchronizer, ".limen", "jobs")];
	const traverse = [...new Set([f.registry, ...jobs].flatMap(parents))].sort();
	return [
		...PROBES,
		`setfacl -m u:${ACCOUNT}:--x ${traverse.join(" ")}`,
		`setfacl -m u:${ACCOUNT}:r-x ${jobs.join(" ")}`,
		`setfacl -m u:${ACCOUNT}:r-- ${f.registry}`,
		`systemd-analyze verify ${join(f.units, ALERTS_SERVICE)} ${join(f.units, ALERTS_TIMER)}`,
		"systemctl daemon-reload",
		"systemctl enable --now limen-alerts.timer",
	];
}

const unitText = (name: string) =>
	(alertsUnitFiles(ACCOUNT).find((unit) => unit.file === name) ?? assert.fail(name)).text;

test("install grants the account its read rights by ACL, writes both units, verifies them, reloads and enables the timer", async (t) => {
	const f = await fixture(t);
	const { calls, run: fake } = runner();
	const ran = await runAlerts(input(f, ["install", "--account", ACCOUNT], { run: fake }));
	assert.equal(ran.code, 0, ran.stderr);
	assert.deepEqual(calls, installCommands(f));
	assert.deepEqual(
		await Promise.all([ALERTS_SERVICE, ALERTS_TIMER].map((name) => readFile(join(f.units, name), "utf8"))),
		[unitText(ALERTS_SERVICE), unitText(ALERTS_TIMER)],
	);
});

test("install run again writes and verifies no unit, and grants, reloads and enables as before", async (t) => {
	const f = await fixture(t);
	const first = runner();
	assert.equal((await runAlerts(input(f, ["install", "--account", ACCOUNT], { run: first.run }))).code, 0);
	const before = await stat(join(f.units, ALERTS_SERVICE));
	const again = runner();
	const ran = await runAlerts(input(f, ["install", "--account", ACCOUNT], { run: again.run }));
	assert.equal(ran.code, 0, ran.stderr);
	assert.deepEqual(
		again.calls,
		installCommands(f).filter((call) => !call.startsWith("systemd-analyze verify")),
	);
	assert.equal((await stat(join(f.units, ALERTS_SERVICE))).ino, before.ino);
});

// Review round 1, F3: a reload that failed left the written units unloaded, and a retry found them unchanged.
test("a reload that failed is done by the next install, though no unit changed", async (t) => {
	const f = await fixture(t);
	let reloads = 0;
	const answer = (argv: readonly string[]): Ran => {
		if (argv[1] === "daemon-reload") {
			reloads += 1;
			if (reloads === 1) {
				return { status: 1, stdout: "", stderr: "Failed to reload daemon: Connection timed out" };
			}
		}
		return { status: 0, stdout: "", stderr: "" };
	};
	const first = await runAlerts(input(f, ["install", "--account", ACCOUNT], { run: runner(answer).run }));
	assert.equal(first.code, 4, first.stderr);
	assert.match(first.stderr, /daemon-reload/);
	const again = runner(answer);
	const ran = await runAlerts(input(f, ["install", "--account", ACCOUNT], { run: again.run }));
	assert.equal(ran.code, 0, ran.stderr);
	assert.deepEqual(
		again.calls.filter((call) => call.startsWith("systemctl ") && call !== "systemctl --version"),
		["systemctl daemon-reload", "systemctl enable --now limen-alerts.timer"],
	);
});

// Review round 1, F4 (G2): the alerts run on an account of their own.
test("install refuses with exit 1 and runs nothing for an account of uid 0, naming it", async (t) => {
	const f = await fixture(t);
	const { calls, run: fake } = runner();
	const ran = await runAlerts(input(f, ["install", "--account", "root"], { run: fake }));
	assert.equal(ran.code, 1, ran.stderr);
	assert.match(ran.stderr, /refused: root has uid 0/);
	assert.deepEqual(calls, []);
});

test("install refuses with exit 1 and runs nothing for an account whose home holds a Limen registry, naming it", async (t) => {
	const f = await fixture(t);
	const { calls, run: fake } = runner();
	const ran = await runAlerts(input(f, ["install", "--account", "agents"], { run: fake }));
	assert.equal(ran.code, 1, ran.stderr);
	assert.ok(ran.stderr.includes(`refused: the home of agents holds the Limen registry ${f.registry}`), ran.stderr);
	assert.deepEqual(calls, []);
});

// Review round 1, F1 (T-01): with no project, the alerts would read nothing and exit 0 every minute.
test("install refuses with exit 1 when no registry names a project, and grants, writes and enables nothing", async (t) => {
	const f = await fixture(t);
	await writeFile(f.registry, `${join(f.dir, "not-a-project")}\n`);
	const { calls, run: fake } = runner();
	const ran = await runAlerts(input(f, ["install", "--account", ACCOUNT], { run: fake }));
	assert.equal(ran.code, 1, ran.stderr);
	assert.match(ran.stderr, /names a project/);
	assert.deepEqual(
		calls.filter((call) => !PROBES.includes(call)),
		[],
	);
	await assert.rejects(stat(join(f.units, ALERTS_SERVICE)), /ENOENT/);
});

test("install refuses with exit 1 and runs nothing when it does not run as root", async (t) => {
	const f = await fixture(t);
	const { calls, run: fake } = runner();
	const ran = await runAlerts(input(f, ["install", "--account", ACCOUNT], { run: fake, uid: UID + 1 }));
	assert.equal(ran.code, 1, ran.stderr);
	assert.match(ran.stderr, /root/);
	assert.deepEqual(calls, []);
});

test("install refuses with exit 1 and runs nothing when the account does not exist", async (t) => {
	const f = await fixture(t);
	const { calls, run: fake } = runner();
	const ran = await runAlerts(input(f, ["install", "--account", "no-such-account"], { run: fake }));
	assert.equal(ran.code, 1, ran.stderr);
	assert.match(ran.stderr, /no-such-account/);
	assert.deepEqual(calls, []);
});

test("install refuses with exit 1 and runs nothing when the topic file is missing, not root's or not mode 0600", async (t) => {
	const cases: ReadonlyArray<{ name: string; make: (f: Fixture) => Promise<Partial<AlertsInput>> }> = [
		{ name: "missing", make: async (f) => ({ topicFile: join(f.dir, "no-topic") }) },
		// The fixture's files are the test's own, so an install whose root is another user finds them not root's.
		{ name: "not root's", make: async () => ({ uid: UID + 1, rootUid: UID + 1 }) },
		{
			name: "mode 0644",
			make: async (f) => {
				const open = join(f.dir, "open-topic");
				await writeFile(open, `${TOPIC}\n`, { mode: 0o644 });
				return { topicFile: open };
			},
		},
		{
			name: "a symbolic link",
			make: async (f) => {
				const link = join(f.dir, "linked-topic");
				await symlink(f.topicFile, link);
				return { topicFile: link };
			},
		},
	];
	for (const { name, make } of cases) {
		const f = await fixture(t);
		const { calls, run: fake } = runner();
		const ran = await runAlerts(input(f, ["install", "--account", ACCOUNT], { run: fake, ...(await make(f)) }));
		assert.equal(ran.code, 1, `${name}: ${ran.stderr}`);
		assert.match(ran.stderr, /topic/, name);
		assert.deepEqual(calls, [], name);
	}
});

test("install exits 4 naming setfacl when it cannot run, before any change", async (t) => {
	const f = await fixture(t);
	const { calls, run: fake } = runner((argv) =>
		argv[0] === "setfacl"
			? { status: null, stdout: "", stderr: "", error: "spawnSync setfacl ENOENT" }
			: { status: 0, stdout: "", stderr: "" },
	);
	const ran = await runAlerts(input(f, ["install", "--account", ACCOUNT], { run: fake }));
	assert.equal(ran.code, 4, ran.stderr);
	assert.match(ran.stderr, /setfacl/);
	assert.deepEqual(calls, ["setfacl --version"]);
	await assert.rejects(stat(join(f.units, ALERTS_SERVICE)), /ENOENT/);
});

test("install with a failed verification puts the earlier units back, exits 4 naming the step, and enables nothing", async (t) => {
	const cases = [
		{ name: "earlier units", earlier: "[Unit]\nDescription=an earlier unit\n" },
		{ name: "no earlier units", earlier: undefined },
	];
	for (const { name, earlier } of cases) {
		const f = await fixture(t);
		for (const unit of [ALERTS_SERVICE, ALERTS_TIMER]) {
			if (earlier !== undefined) {
				await writeFile(join(f.units, unit), earlier);
			}
		}
		const { calls, run: fake } = runner((argv) =>
			argv[1] === "verify"
				? { status: 1, stdout: "", stderr: "limen-alerts.service: Unknown key name 'Typo'" }
				: { status: 0, stdout: "", stderr: "" },
		);
		const ran = await runAlerts(input(f, ["install", "--account", ACCOUNT], { run: fake }));
		assert.equal(ran.code, 4, `${name}: ${ran.stderr}`);
		assert.match(ran.stderr, /systemd-analyze verify/, name);
		assert.deepEqual(
			calls.filter((call) => call.startsWith("systemctl ") && call !== "systemctl --version"),
			[],
			name,
		);
		for (const unit of [ALERTS_SERVICE, ALERTS_TIMER]) {
			const text = await readFile(join(f.units, unit), "utf8").catch(() => undefined);
			assert.equal(text, earlier, `${name}: ${unit}`);
		}
	}
});

test("install refuses with exit 1 a registered project whose real path is not its line, and grants nothing", async (t) => {
	const f = await fixture(t);
	const linked = join(f.dir, "linked-ledger");
	await symlink(f.ledger, linked);
	await writeFile(f.registry, `${f.synchronizer}\n${linked}\n`);
	const { calls, run: fake } = runner();
	const ran = await runAlerts(input(f, ["install", "--account", ACCOUNT], { run: fake }));
	assert.equal(ran.code, 1, ran.stderr);
	assert.ok(ran.stderr.includes(linked), ran.stderr);
	assert.deepEqual(
		calls.filter((call) => !PROBES.includes(call)),
		[],
	);
});

test("units writes only a unit whose text differs for the account, then verifies both and reloads", async (t) => {
	const f = await fixture(t);
	await writeFile(join(f.units, ALERTS_SERVICE), "[Service]\nUser=alerts-test\n");
	await writeFile(join(f.units, ALERTS_TIMER), unitText(ALERTS_TIMER));
	const timer = await stat(join(f.units, ALERTS_TIMER));
	const { calls, run: fake } = runner();
	const ran = await runAlerts(input(f, ["units", "--account", ACCOUNT], { run: fake }));
	assert.equal(ran.code, 0, ran.stderr);
	assert.equal(await readFile(join(f.units, ALERTS_SERVICE), "utf8"), unitText(ALERTS_SERVICE));
	assert.equal((await stat(join(f.units, ALERTS_TIMER))).ino, timer.ino);
	assert.deepEqual(calls, [
		`systemd-analyze verify ${join(f.units, ALERTS_SERVICE)} ${join(f.units, ALERTS_TIMER)}`,
		"systemctl daemon-reload",
	]);
});

test("units with both units as this version renders them writes and verifies nothing, and reloads", async (t) => {
	const f = await fixture(t);
	for (const unit of [ALERTS_SERVICE, ALERTS_TIMER]) {
		await writeFile(join(f.units, unit), unitText(unit));
	}
	const { calls, run: fake } = runner();
	const ran = await runAlerts(input(f, ["units", "--account", ACCOUNT], { run: fake }));
	assert.deepEqual([ran.code, calls], [0, ["systemctl daemon-reload"]], ran.stderr);
	assert.match(ran.stdout, /unchanged/);
});

/** The kind, owner and mode of the folder at `path`, as a test compares them. */
async function folderShape(path: string): Promise<{ folder: boolean; uid: number; mode: number }> {
	const info = await stat(path);
	return { folder: info.isDirectory(), uid: info.uid, mode: info.mode & 0o7777 };
}

// R-106 Change 2: the service loads the watch folder as a credential, so its source must exist on every seat.
test("install makes the watch folder, root's with mode 0700, when it is absent", async (t) => {
	const f = await fixture(t);
	const ran = await runAlerts(input(f, ["install", "--account", ACCOUNT], { run: runner().run }));
	assert.equal(ran.code, 0, ran.stderr);
	assert.deepEqual(await folderShape(f.watchFolder), { folder: true, uid: UID, mode: 0o700 });
});

test("units makes the watch folder, root's with mode 0700, when it is absent", async (t) => {
	const f = await fixture(t);
	const ran = await runAlerts(input(f, ["units", "--account", ACCOUNT], { run: runner().run }));
	assert.equal(ran.code, 0, ran.stderr);
	assert.deepEqual(await folderShape(f.watchFolder), { folder: true, uid: UID, mode: 0o700 });
});

/** A watch folder of root's with mode 0700 holding a complete entry of `synchronizer` and the known hosts. */
async function watchFolderOf(f: Fixture): Promise<void> {
	await mkdir(f.watchFolder, { mode: 0o700 });
	const files = [
		["synchronizer.address", "git@example.test:owner/synchronizer.git\n"],
		["synchronizer.key", KEY_TEXT],
		["known_hosts", KNOWN_HOSTS_TEXT],
	] as const;
	for (const [name, text] of files) {
		await writeFile(join(f.watchFolder, name), text, { mode: 0o600 });
	}
}

test("install checks a watch folder of complete entries of root's and keeps it as it is", async (t) => {
	const f = await fixture(t);
	await watchFolderOf(f);
	const ran = await runAlerts(input(f, ["install", "--account", ACCOUNT], { run: runner().run }));
	assert.equal(ran.code, 0, ran.stderr);
	assert.ok(ran.stdout.split("\n").includes(`checked 1 watch entry in ${f.watchFolder}`), ran.stdout);
	assert.deepEqual(await folderShape(f.watchFolder), { folder: true, uid: UID, mode: 0o700 });
});

// R-106 Decision 8 (1), (4): root's 0600 is the install's check, and systemd skips a link and loads no subfolder.
test("install refuses with exit 1 and runs nothing for a watch folder or entry that systemd would not hand over whole", async (t) => {
	const cases: ReadonlyArray<{ name: string; make: (f: Fixture) => Promise<void> }> = [
		{ name: "a folder of mode 0755", make: (f) => chmod(f.watchFolder, 0o755) },
		{ name: "an entry file of mode 0644", make: (f) => chmod(join(f.watchFolder, "synchronizer.key"), 0o644) },
		{
			name: "an entry file that is a symbolic link",
			make: async (f) => {
				await rm(join(f.watchFolder, "synchronizer.key"));
				await symlink(f.topicFile, join(f.watchFolder, "synchronizer.key"));
			},
		},
		{ name: "a subfolder", make: (f) => mkdir(join(f.watchFolder, "ledger"), { mode: 0o700 }) },
		{
			name: "a file of no entry",
			make: (f) => writeFile(join(f.watchFolder, "ledger.adress"), "x\n", { mode: 0o600 }),
		},
		{ name: "an entry with no key", make: (f) => rm(join(f.watchFolder, "synchronizer.key")) },
		{ name: "entries with no known hosts", make: (f) => rm(join(f.watchFolder, "known_hosts")) },
		{
			name: "an address of two lines",
			make: (f) => writeFile(join(f.watchFolder, "synchronizer.address"), "a\nb\n", { mode: 0o600 }),
		},
	];
	for (const { name, make } of cases) {
		const f = await fixture(t);
		await watchFolderOf(f);
		await make(f);
		const { calls, run: fake } = runner();
		const ran = await runAlerts(input(f, ["install", "--account", ACCOUNT], { run: fake }));
		assert.equal(ran.code, 1, `${name}: ${ran.stderr}`);
		assert.match(ran.stderr, /watch/, name);
		assert.deepEqual(calls, [], name);
	}
});

// T-12: the main watcher's tools are declared with the install's own, and a missing one stops it before any change.
test("install exits 4 naming ssh when it cannot run, before any change", async (t) => {
	const f = await fixture(t);
	const { calls, run: fake } = runner((argv) =>
		argv[0] === "ssh"
			? { status: null, stdout: "", stderr: "", error: "spawnSync ssh ENOENT" }
			: { status: 0, stdout: "", stderr: "" },
	);
	const ran = await runAlerts(input(f, ["install", "--account", ACCOUNT], { run: fake }));
	assert.equal(ran.code, 4, ran.stderr);
	assert.match(ran.stderr, /ssh cannot run/);
	assert.deepEqual(calls, PROBES);
	await assert.rejects(stat(join(f.units, ALERTS_SERVICE)), /ENOENT/);
});
