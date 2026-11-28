// seat/main-watch.ts through the alerts' run: a local bare repository as the remote, real git, a recording runner, a
// local ntfy server, and a clock that moves one minute per run (each "minute" is one direct call, T-31).
import assert from "node:assert/strict";
import { mkdir, mkdtemp, readFile, realpath, rm, stat, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test, { type TestContext } from "node:test";
import { type AlertsInput, runAlerts } from "../../seat/alerts.ts";
import type { Ran, Runner } from "../../seat/program.ts";
import { git } from "../plant.ts";
import { type Ntfy, ntfy } from "./ntfy.ts";
import {
	bareRemote,
	type Call,
	commitIn,
	copyOf,
	deleteMain,
	entryFiles,
	heldTip,
	keptTimes,
	keptTips,
	recordingRunner,
	setMain,
	writeWatchEntry,
} from "./watched-remote.ts";

const TOPIC = "limen-test-topic";
const PROJECT = "synchronizer";
/** The user id the tests run with, which the fixtures count as root's. */
const UID = process.getuid?.() ?? 1000;

type Fixture = {
	readonly dir: string;
	readonly passwd: string;
	readonly credentials: string;
	readonly state: string;
	readonly remote: string;
	/** Every program the alerts asked the runner for, in order. */
	readonly calls: Call[];
	/** The tests' clock, in milliseconds: each run of the alerts moves it one minute on. */
	time: number;
};

/** An agents' home whose registry lists one project, `synchronizer`, and the watch entry of that project. */
async function fixture(t: TestContext): Promise<Fixture> {
	const dir = await realpath(await mkdtemp(join(tmpdir(), "limen-main-watch-")));
	t.after(() => rm(dir, { recursive: true, force: true }));
	const home = join(dir, "agents");
	const project = join(home, PROJECT);
	const [credentials, state] = [join(dir, "credentials"), join(dir, "state")];
	for (const folder of [join(project, ".limen", "jobs"), join(home, ".limen"), credentials, state]) {
		await mkdir(folder, { recursive: true });
	}
	await writeFile(join(home, ".limen", "projects"), `${project}\n`);
	const passwd = join(dir, "passwd");
	await writeFile(passwd, `agents:x:1000:1000::${home}:/bin/sh\n`);
	await writeFile(join(credentials, "topic"), `${TOPIC}\n`);
	const remote = bareRemote(join(dir, "remote.git"));
	await writeWatchEntry(credentials, PROJECT, remote);
	return { dir, passwd, credentials, state, remote, calls: [], time: Date.UTC(2026, 10, 28, 3, 0) };
}

/** The alerts' run for `f`, with `env` added to the service's environment. */
function input(f: Fixture, env: NodeJS.ProcessEnv = {}): AlertsInput {
	return {
		args: ["run"],
		passwd: f.passwd,
		env: { CREDENTIALS_DIRECTORY: f.credentials, STATE_DIRECTORY: f.state, PATH: process.env.PATH, ...env },
		uid: UID,
		rootUid: UID,
		run: recordingRunner(f.calls),
		unitFolder: join(f.dir, "units"),
		topicFile: join(f.dir, "alerts-topic"),
		watchFolder: join(f.dir, "watch"),
		now: () => new Date(f.time),
	};
}

/** One run of the alerts, a minute after the one before, with `run` in place of the recording runner when given. */
async function run(f: Fixture, runner?: Runner) {
	f.time += 60_000;
	return runAlerts(runner === undefined ? input(f) : { ...input(f), run: runner });
}

/** One run that must exit 0; its output. */
async function runOk(f: Fixture): Promise<string> {
	const ran = await run(f);
	assert.equal(ran.code, 0, ran.stderr);
	return ran.stdout;
}

const bodies = (server: Ntfy) => server.posts.map((post) => post.body);
const short = (tip: string) => tip.slice(0, 12);
const copy = (f: Fixture) => copyOf(f.state, PROJECT);
const unreachableAddress = (f: Fixture) => `${join(f.dir, "no-such-remote.git")}\n`;

/** A remote whose `main` holds one commit; that commit. */
function firstMain(f: Fixture): string {
	const tip = commitIn(f.remote);
	setMain(f.remote, tip);
	return tip;
}

test("the first run holds the remote's main in a bare copy of its own, with no tags, and sends nothing", async (t) => {
	const [f, server] = [await fixture(t), await ntfy(t)];
	const tip = firstMain(f);
	git(f.remote, "tag", "v1", tip);
	const said = await runOk(f);
	assert.deepEqual(
		{
			posts: bodies(server),
			held: heldTip(copy(f)),
			kept: keptTips(copy(f)),
			bare: git(copy(f), "rev-parse", "--is-bare-repository"),
			tags: git(copy(f), "for-each-ref", "refs/tags/"),
		},
		{ posts: [], held: tip, kept: [], bare: "true", tags: "" },
	);
	assert.ok(said.split("\n").includes(`main of ${PROJECT}: holds main at ${short(tip)}`), said);
});

test("a fast-forward of main sends nothing, and the held tip follows it", async (t) => {
	const [f, server] = [await fixture(t), await ntfy(t)];
	const first = firstMain(f);
	await runOk(f);
	const next = commitIn(f.remote, first);
	setMain(f.remote, next);
	await runOk(f);
	assert.deepEqual(
		{ posts: bodies(server), held: heldTip(copy(f)), kept: keptTips(copy(f)) },
		{ posts: [], held: next, kept: [] },
	);
});

test("T-28: a forced update of main sends main:forced with the old tip once, keeps the old tip, and follows the new main", async (t) => {
	const [f, server] = [await fixture(t), await ntfy(t)];
	const old = firstMain(f);
	await runOk(f);
	const other = commitIn(f.remote);
	setMain(f.remote, other);
	await runOk(f);
	await runOk(f);
	assert.deepEqual(
		{
			posts: bodies(server),
			held: heldTip(copy(f)),
			kept: keptTips(copy(f)),
			old: git(copy(f), "cat-file", "-t", old),
		},
		{ posts: [`${PROJECT} main:forced ${short(old)}`], held: other, kept: [old], old: "commit" },
	);
});

test("T-28: a second forced update on another tip sends main:forced again and keeps both old tips", async (t) => {
	const [f, server] = [await fixture(t), await ntfy(t)];
	const first = firstMain(f);
	await runOk(f);
	const second = commitIn(f.remote);
	setMain(f.remote, second);
	await runOk(f);
	const third = commitIn(f.remote);
	setMain(f.remote, third);
	await runOk(f);
	assert.deepEqual(
		{ posts: bodies(server), held: heldTip(copy(f)), kept: keptTips(copy(f)) },
		{
			posts: [`${PROJECT} main:forced ${short(first)}`, `${PROJECT} main:forced ${short(second)}`],
			held: third,
			kept: [first, second],
		},
	);
});

test("a deletion of main sends main:deleted with the held tip once and keeps the held tip", async (t) => {
	const [f, server] = [await fixture(t), await ntfy(t)];
	const tip = firstMain(f);
	await runOk(f);
	deleteMain(f.remote);
	await runOk(f);
	await runOk(f);
	assert.deepEqual(
		{ posts: bodies(server), held: heldTip(copy(f)), kept: keptTips(copy(f)) },
		{ posts: [`${PROJECT} main:deleted ${short(tip)}`], held: tip, kept: [] },
	);
});

test("a main re-created on a descendant of the held tip after its deletion sends nothing more, and the held tip follows it", async (t) => {
	const [f, server] = [await fixture(t), await ntfy(t)];
	const tip = firstMain(f);
	await runOk(f);
	deleteMain(f.remote);
	await runOk(f);
	const next = commitIn(f.remote, tip);
	setMain(f.remote, next);
	await runOk(f);
	assert.deepEqual(
		{ posts: bodies(server), held: heldTip(copy(f)), kept: keptTips(copy(f)) },
		{ posts: [`${PROJECT} main:deleted ${short(tip)}`], held: next, kept: [] },
	);
});

// D-117 (4), R-106 Decision 9: the record key names the forced update, not the tip, so a tip sent before rings again.
test("D-117: each forced update sends main:forced, though an earlier one sent the same tip: X to Y, Y to X and X to Z send three lines", async (t) => {
	const [f, server] = [await fixture(t), await ntfy(t)];
	const x = firstMain(f);
	await runOk(f);
	const y = commitIn(f.remote);
	setMain(f.remote, y);
	await runOk(f);
	setMain(f.remote, x);
	await runOk(f);
	const z = commitIn(f.remote);
	setMain(f.remote, z);
	await runOk(f);
	await runOk(f);
	assert.deepEqual(
		{ posts: bodies(server), held: heldTip(copy(f)), kept: keptTips(copy(f)) },
		{
			posts: [x, y, x].map((tip) => `${PROJECT} main:forced ${short(tip)}`),
			held: z,
			kept: [x, y, x],
		},
	);
});

// D-110 (1), R-106 Decision 9: the record key names the deletion, not the tip, so a tip sent before rings again.
test("D-110: each deletion of main sends main:deleted, though an earlier one sent the same tip: two deletions at one tip send two lines", async (t) => {
	const [f, server] = [await fixture(t), await ntfy(t)];
	const tip = firstMain(f);
	await runOk(f);
	deleteMain(f.remote);
	await runOk(f);
	setMain(f.remote, tip);
	await runOk(f);
	deleteMain(f.remote);
	await runOk(f);
	await runOk(f);
	assert.deepEqual(
		{ posts: bodies(server), held: heldTip(copy(f)), kept: keptTips(copy(f)) },
		{ posts: [`${PROJECT} main:deleted ${short(tip)}`, `${PROJECT} main:deleted ${short(tip)}`], held: tip, kept: [] },
	);
});

/** The keys of `main` events in the alerts' record of what was sent. */
const mainKeys = async (f: Fixture) =>
	(await readFile(join(f.state, "reported"), "utf8")).split("\n").filter((key) => key.includes("/main/"));

// R-106 Decision 8 (3), 9: a refused send leaves the forced update unreported; its kept ref raises it again.
test("a main:forced line ntfy refused goes out at the next run under its kept ref's time, and never again once ntfy took it", async (t) => {
	const [f, server] = [await fixture(t), await ntfy(t)];
	const old = firstMain(f);
	await runOk(f);
	setMain(f.remote, commitIn(f.remote));
	server.answer = 503;
	const refused = await run(f);
	assert.equal(refused.code, 3, refused.stderr);
	server.answer = 200;
	await runOk(f);
	await runOk(f);
	assert.deepEqual(
		{ posts: bodies(server), reported: await mainKeys(f) },
		{
			posts: [`${PROJECT} main:forced ${short(old)}`, `${PROJECT} main:forced ${short(old)}`],
			reported: keptTimes(copy(f)).map((time) => `${PROJECT}/main/${time}/forced`),
		},
	);
});

// R-106 Decision 8 (3), 9: a refused send leaves the deletion unreported; its start, kept in the state folder, keys it.
test("a main:deleted line ntfy refused goes out at the next run under its deletion's start, and never again once ntfy took it", async (t) => {
	const [f, server] = [await fixture(t), await ntfy(t)];
	const tip = firstMain(f);
	await runOk(f);
	deleteMain(f.remote);
	server.answer = 503;
	const refused = await run(f);
	assert.equal(refused.code, 3, refused.stderr);
	const start = new Date(f.time).toISOString();
	server.answer = 200;
	await runOk(f);
	await runOk(f);
	assert.deepEqual(
		{ posts: bodies(server), reported: await mainKeys(f) },
		{
			posts: [`${PROJECT} main:deleted ${short(tip)}`, `${PROJECT} main:deleted ${short(tip)}`],
			reported: [`${PROJECT}/main/${start}/deleted`],
		},
	);
});

test("D-117: an unreachable remote is named in every run and sends main:unwatched once, at the 15th run in a row", async (t) => {
	const [f, server] = [await fixture(t), await ntfy(t)];
	await writeFile(entryFiles(f.credentials, PROJECT).address, unreachableAddress(f));
	const sent: number[] = [];
	for (let runs = 1; runs <= 16; runs += 1) {
		const said = await runOk(f);
		const named = said
			.split("\n")
			.filter((line) => line.startsWith(`main of ${PROJECT}: the remote cannot be reached`));
		assert.equal(named.length, 1, `run ${runs}: ${said}`);
		sent.push(server.posts.length);
	}
	assert.deepEqual(sent, [...Array(14).fill(0), 1, 1]);
	assert.deepEqual(bodies(server), [`${PROJECT} main:unwatched`]);
});

test("D-117: a run that reaches the remote ends the count, so 14 failed runs after it send nothing", async (t) => {
	const [f, server] = [await fixture(t), await ntfy(t)];
	firstMain(f);
	const address = entryFiles(f.credentials, PROJECT).address;
	const count = () =>
		stat(join(f.state, "main", `${PROJECT}.failures`)).then(
			() => "kept",
			() => "gone",
		);
	/** Fourteen runs that cannot reach the remote; the output of the last. */
	const unreachable = async () => {
		await writeFile(address, unreachableAddress(f));
		let said = "";
		for (let runs = 1; runs <= 14; runs += 1) {
			said = await runOk(f);
		}
		return said;
	};
	await unreachable();
	const before = await count();
	await writeFile(address, `${f.remote}\n`);
	await runOk(f);
	const after = await count();
	const last = await unreachable();
	assert.deepEqual(
		{ posts: bodies(server), before, after, last: last.includes("14 runs in a row") },
		{ posts: [], before: "kept", after: "gone", last: true },
		last,
	);
});

/** The git calls among `calls`, each as its words after `git`, less the copy's folder. */
const gitCalls = (calls: readonly Call[]) =>
	calls
		.filter(({ argv }) => argv[0] === "git")
		.map(({ argv }) => argv.slice(1).filter((word) => !word.startsWith("--git-dir=")));

/** Runs the watcher through a first hold, a fast-forward, a forced update, a deletion, a new main and a failure. */
async function everyCase(f: Fixture): Promise<void> {
	const first = firstMain(f);
	await runOk(f);
	setMain(f.remote, commitIn(f.remote, first));
	await runOk(f);
	setMain(f.remote, commitIn(f.remote));
	await runOk(f);
	deleteMain(f.remote);
	await runOk(f);
	setMain(f.remote, commitIn(f.remote));
	await runOk(f);
	await writeFile(entryFiles(f.credentials, PROJECT).address, unreachableAddress(f));
	await runOk(f);
}

// AC-9: no git call of the watcher can force-update or remove its held copy.
test("no git call of the watcher holds a + refspec, --force, --prune or --mirror, and update-ref always names the old value", async (t) => {
	const [f] = [await fixture(t), await ntfy(t)];
	await everyCase(f);
	const calls = gitCalls(f.calls);
	const used = ["init", "ls-remote", "fetch", "merge-base", "update-ref"].filter((command) =>
		calls.some((words) => words[0] === command),
	);
	const banned = ["--force", "-f", "--prune", "-p", "--prune-tags", "-P", "--mirror", "-d", "--delete"];
	assert.deepEqual(
		{
			used,
			forcing: calls.flat().filter((word) => word.startsWith("+") || banned.includes(word)),
			updates: [...new Set(calls.filter((words) => words[0] === "update-ref").map((words) => words.length))],
		},
		{ used: ["init", "ls-remote", "fetch", "merge-base", "update-ref"], forcing: [], updates: [4] },
	);
});

// AC-9: the key and the host keys come only from the credentials, and nothing of the account's own setup reaches git.
test("every git call of the watcher runs with the entry's key and known hosts, no agent, no user configuration, no prompt and a time bound", async (t) => {
	const [f] = [await fixture(t), await ntfy(t)];
	firstMain(f);
	const ran = await runAlerts(input(f, { SSH_AUTH_SOCK: join(f.dir, "agent.sock"), GIT_DIR: join(f.dir, "other") }));
	assert.equal(ran.code, 0, ran.stderr);
	const files = entryFiles(f.credentials, PROJECT);
	const ssh = [
		"ssh -F /dev/null",
		`-i '${files.key}'`,
		"-o IdentitiesOnly=yes -o IdentityAgent=none",
		`-o 'UserKnownHostsFile=${files.knownHosts}'`,
		"-o GlobalKnownHostsFile=/dev/null -o StrictHostKeyChecking=yes -o UpdateHostKeys=no",
		"-o BatchMode=yes -o ConnectTimeout=10",
	].join(" ");
	const gitRuns = f.calls.filter(({ argv }) => argv[0] === "git" && argv[1] !== "--version");
	assert.ok(gitRuns.length >= 5, `${gitRuns.length} git calls`);
	for (const { argv, options } of gitRuns) {
		assert.deepEqual(
			{ env: options?.env, bounded: (options?.timeoutMs ?? 0) > 0 },
			{
				env: {
					PATH: process.env.PATH,
					GIT_CONFIG_NOSYSTEM: "1",
					GIT_CONFIG_GLOBAL: "/dev/null",
					GIT_TERMINAL_PROMPT: "0",
					GIT_SSH_COMMAND: ssh,
				},
				bounded: true,
			},
			argv.join(" "),
		);
	}
});

/** Removes the file at `path`; the path. */
async function removed(path: string): Promise<string> {
	await rm(path);
	return path;
}

/** Writes `text` into the file at `path`; the path. */
async function written(path: string, text: string): Promise<string> {
	await writeFile(path, text);
	return path;
}

// T-01, T-02: a local failure ends the run with exit 4 and names its cause; a forced update waits for the fixed entry.
test("a missing or malformed entry file exits 4, names it, and sends nothing of its project", async (t) => {
	const cases: ReadonlyArray<{ name: string; make: (f: Fixture) => Promise<string> }> = [
		{ name: "no key", make: (f) => removed(entryFiles(f.credentials, PROJECT).key) },
		{ name: "no address", make: (f) => removed(entryFiles(f.credentials, PROJECT).address) },
		{ name: "no known hosts", make: (f) => removed(entryFiles(f.credentials, PROJECT).knownHosts) },
		{
			name: "an address of two lines",
			make: (f) => written(entryFiles(f.credentials, PROJECT).address, `${f.remote}\n${f.remote}\n`),
		},
		{ name: "a key of no key", make: (f) => written(entryFiles(f.credentials, PROJECT).key, "not a key\n") },
	];
	for (const { name, make } of cases) {
		const [f, server] = [await fixture(t), await ntfy(t)];
		firstMain(f);
		await runOk(f);
		setMain(f.remote, commitIn(f.remote));
		const named = await make(f);
		const ran = await run(f);
		assert.equal(ran.code, 4, `${name}: ${ran.stderr}`);
		assert.ok(ran.stderr.includes(named), `${name}: ${ran.stderr}`);
		assert.deepEqual(bodies(server), [], name);
	}
});

// z. 10: one damaged entry never stops the watch of the others.
test("a credential file of the watch that is no entry file exits 4 naming it, and the complete entries are still watched", async (t) => {
	const [f, server] = [await fixture(t), await ntfy(t)];
	const old = firstMain(f);
	await runOk(f);
	setMain(f.remote, commitIn(f.remote));
	const typo = await written(join(f.credentials, `watch_${PROJECT}.adress`), `${f.remote}\n`);
	const ran = await run(f);
	assert.equal(ran.code, 4, ran.stderr);
	assert.ok(ran.stderr.includes(typo), ran.stderr);
	assert.deepEqual(bodies(server), [`${PROJECT} main:forced ${short(old)}`]);
});

// T-12, T-02: a missing system tool is the environment's failure, named, before the watcher reaches any remote.
test("a seat where git or ssh cannot run exits 4 naming it, and the watcher reaches no remote", async (t) => {
	for (const tool of ["git", "ssh"]) {
		const [f, server] = [await fixture(t), await ntfy(t)];
		firstMain(f);
		const missing: Ran = { status: null, stdout: "", stderr: "", error: `spawnSync ${tool} ENOENT` };
		const recorded = recordingRunner(f.calls, () => missing);
		const runner: Runner = (argv, options) => {
			if (tool === "git" && argv[0] === "git") {
				f.calls.push({ argv, options });
				return missing;
			}
			return recorded(argv, options);
		};
		const ran = await run(f, runner);
		assert.equal(ran.code, 4, `${tool}: ${ran.stderr}`);
		assert.ok(ran.stderr.includes(`${tool} cannot run`), `${tool}: ${ran.stderr}`);
		assert.deepEqual(
			gitCalls(f.calls).filter((words) => words[0] !== "--version"),
			[],
			tool,
		);
		assert.deepEqual(bodies(server), [], tool);
	}
});

// D-117 (3): the agents' registry decides nothing; it only names a registered project that has no entry.
test("D-117: a registered project with no watch entry is named in the run's output, and the run starts no program", async (t) => {
	const [f, server] = [await fixture(t), await ntfy(t)];
	const files = entryFiles(f.credentials, PROJECT);
	for (const path of [files.address, files.key, files.knownHosts]) {
		await rm(path);
	}
	const said = await runOk(f);
	assert.ok(
		said.split("\n").some((line) => line.startsWith(`main of ${PROJECT}: registered, but no watch entry`)),
		said,
	);
	assert.deepEqual({ calls: f.calls, posts: bodies(server) }, { calls: [], posts: [] });
});
