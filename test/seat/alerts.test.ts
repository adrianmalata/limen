// seat/alerts.ts on fixtures: its run against a local ntfy server, and its install and units step with a fake runner.
import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { once } from "node:events";
import { chmod, mkdir, mkdtemp, readFile, realpath, rm, stat, symlink, writeFile } from "node:fs/promises";
import { createServer } from "node:http";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test, { type TestContext } from "node:test";
import { fileURLToPath } from "node:url";
import { type AlertsInput, alertLine, type Ran, runAlerts } from "../../seat/alerts.ts";
import { ALERTS_SERVICE, ALERTS_TIMER, alertsUnits, renderUnit } from "../../seat/units.ts";
import type { JobRecord } from "../../src/job/record.ts";
import { withEnvironment } from "../environment.ts";
import { writeRecord } from "../plant.ts";

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
	return { dir, passwd, home, registry, synchronizer, ledger, credentials, state, units, topicFile };
}

type Post = { readonly path: string; readonly body: string; readonly title: string | undefined };
/** A local ntfy server: what it was sent, and the status it answers with, 200 until a test changes it. */
type Ntfy = { readonly posts: Post[]; answer: number };

/** Starts a local ntfy server and points the alerts at it through their test knob for the test `t`. */
async function ntfy(t: TestContext): Promise<Ntfy> {
	const server: Ntfy = { posts: [], answer: 200 };
	const http = createServer((request, response) => {
		const body: Buffer[] = [];
		request.on("data", (chunk: Buffer) => body.push(chunk));
		request.on("end", () => {
			const title = request.headers.title ?? request.headers["x-title"];
			server.posts.push({
				path: request.url ?? "",
				body: Buffer.concat(body).toString("utf8"),
				title: Array.isArray(title) ? title.join(",") : title,
			});
			response.statusCode = server.answer;
			response.end("{}");
		});
	});
	http.listen(0, "127.0.0.1");
	await once(http, "listening");
	t.after(() => http.close());
	const address = http.address();
	assert.ok(address !== null && typeof address === "object", "the server listens on a port");
	withEnvironment(t, { LIMEN_ALERTS_URL: `http://127.0.0.1:${address.port}` });
	return server;
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
	assert.match(first.stdout, /first run/);
	const next = await run(f);
	assert.deepEqual([next.code, server.posts], [0, []], next.stderr);
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
		"setfacl --version",
		"systemd-analyze --version",
		"systemctl --version",
		`setfacl -m u:${ACCOUNT}:--x ${traverse.join(" ")}`,
		`setfacl -m u:${ACCOUNT}:r-x ${jobs.join(" ")}`,
		`setfacl -m u:${ACCOUNT}:r-- ${f.registry}`,
		`systemd-analyze verify ${join(f.units, ALERTS_SERVICE)} ${join(f.units, ALERTS_TIMER)}`,
		"systemctl daemon-reload",
		"systemctl enable --now limen-alerts.timer",
	];
}

const unitText = (name: string) =>
	renderUnit(alertsUnits(ACCOUNT).find((unit) => unit.file === name) ?? assert.fail(name));

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
		calls.filter((call) => !call.endsWith("--version")),
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
		calls.filter((call) => !call.endsWith("--version")),
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
