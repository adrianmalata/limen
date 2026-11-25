// src/config.ts: the one reader of Limen's environment names, its registry of kinds, and the environments it builds.
import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { mkdir, mkdtemp, readFile, realpath, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { dirname, join, relative } from "node:path";
import test from "node:test";
import {
	ENVIRONMENT,
	engineEnvironment,
	exception,
	groupAdvanceEnvironment,
	ignoredSettings,
	type Kind,
	type Name,
	setTestKnob,
	testKnob,
	transport,
	wrapperEnvironment,
} from "../src/config.ts";
import { withEnvironment } from "./environment.ts";
import { knownFiles } from "./known-files.ts";

// The scan's git must not depend on the laptop's own git configuration.
process.env.GIT_CONFIG_GLOBAL = "/dev/null";
process.env.GIT_CONFIG_NOSYSTEM = "1";

const root = new URL("..", import.meta.url).pathname;
/** The folders whose code runs as Limen, where only src/config.ts reads the environment by a Limen name. */
const FOLDERS = ["src", "hook", "bin", "seat"] as const;
/** The three ways to read a name from the environment that the scan forbids outside src/config.ts. */
const READS = [
	["process.env.LIMEN_", /process\.env\.LIMEN_/g],
	["process.env[", /process\.env\[/g],
	["a destructuring of process.env", /\}\s*=\s*process\.env\b/g],
] as const;

/**
 * Each read of the environment by a Limen name outside src/config.ts, and each `LIMEN_*` name that the registry does
 * not hold, in the files git knows below `FOLDERS` of the repository at `repo`, as `<file>:<line>: <what>`.
 */
async function configScan(repo: string): Promise<string[]> {
	const findings: string[] = [];
	for (const path of await knownFiles(repo)) {
		const file = relative(repo, path);
		if (!FOLDERS.some((folder) => file.startsWith(`${folder}/`))) {
			continue;
		}
		const text = await readFile(path, "utf8");
		const line = (index: number) => text.slice(0, index).split("\n").length;
		if (file !== "src/config.ts") {
			for (const [form, pattern] of READS) {
				for (const match of text.matchAll(pattern)) {
					findings.push(`${file}:${line(match.index)}: ${form}`);
				}
			}
		}
		for (const match of text.matchAll(/LIMEN_[A-Z0-9_]+/g)) {
			if (!Object.hasOwn(ENVIRONMENT, match[0])) {
				findings.push(`${file}:${line(match.index)}: unregistered ${match[0]}`);
			}
		}
	}
	return findings;
}

test("T-03: in src/, hook/, bin/ and seat/ only src/config.ts reads the environment by a Limen name, and every LIMEN_ name is registered", async () => {
	assert.deepEqual(await configScan(root), []);
});

test("the configuration scan finds each read form and an unregistered name, but nothing in src/config.ts, an ignored file or another folder", async (t) => {
	const repo = await realpath(await mkdtemp(join(tmpdir(), "limen-config-")));
	t.after(() => rm(repo, { recursive: true, force: true }));
	execFileSync("git", ["init", "-q"], { cwd: repo });
	const files = {
		".gitignore": "src/ignored.ts\n",
		"src/config.ts":
			"const a = process.env.LIMEN_JOB;\nconst b = process.env[name];\nconst { LIMEN_JOB_ID } = process.env;\n",
		"src/dotted.ts": "export const job = process.env.LIMEN_JOB;\n",
		"hook/computed.ts": "\nexport const value = process.env[name];\n",
		"bin/destructured.mjs": "const {\n\tLIMEN_JOB,\n} = process.env;\n",
		"seat/unknown.ts": 'export const name = "LIMEN_NOT_REGISTERED";\n',
		"src/ignored.ts": "export const job = process.env.LIMEN_JOB;\n",
		"docs/outside.ts": "export const job = process.env.LIMEN_JOB;\n",
	};
	for (const [path, text] of Object.entries(files)) {
		await mkdir(dirname(join(repo, path)), { recursive: true });
		await writeFile(join(repo, path), text);
	}
	assert.deepEqual((await configScan(repo)).sort(), [
		"bin/destructured.mjs:3: a destructuring of process.env",
		"hook/computed.ts:2: process.env[",
		"seat/unknown.ts:1: unregistered LIMEN_NOT_REGISTERED",
		"src/dotted.ts:1: process.env.LIMEN_",
	]);
});

/**
 * The inventory of R-015's ticket (`## Decisions`): every name Limen's code held at 9f247a5, by kind, and the names added
 * since: LIMEN_LOCK_WAIT_MS, the lock module's wait bound (R-019), LIMEN_CGROUP_ROOT and LIMEN_CGROUP, the tests'
 * systemd user scopes (R-026), LIMEN_ALERTS_URL, the ntfy server of the alerts' tests (R-033), LIMEN_STOP_GRACE_MS,
 * the one grace of stop, exhaustion and the reaper (R-027), LIMEN_END_GATE, the tests' hold of a wrapper's end
 * (R-028), LIMEN_LINGER_DIR, the folder of the linger files the sweep's install reads (R-032),
 * LIMEN_STALL_TICK_MS, the tick of a wrapper's samples of its scope's CPU time (R-036), and LIMEN_TEST_MODE, the
 * marker of test mode, in which alone the knobs are read (R-087). LIMEN_SETUP, the mark of a spawn's start that owes its
 * setup, replaced LIMEN_SETUP_KEEP when the setup prune went (R-101, Decision 7).
 */
const INVENTORY = {
	"transport wrapper": [
		"LIMEN_INTERNAL_RUN",
		"LIMEN_JOB_DIR",
		"LIMEN_WORKTREE",
		"LIMEN_TASK_FILE",
		"LIMEN_PREAMBLE",
		"LIMEN_TIMEOUT_MS",
		"LIMEN_MODEL",
		"LIMEN_PROVIDER",
		"LIMEN_THINKING",
		"LIMEN_LABEL",
		"LIMEN_SETUP",
		"LIMEN_SETUP_PREPARE",
		"LIMEN_CONTINUE",
	],
	"transport engine": ["LIMEN_JOB", "LIMEN_JOB_ID", "LIMEN_CONTEXT_ROOT", "LIMEN_GROUP_ID", "LIMEN_TEAM_ID"],
	test: [
		"LIMEN_HOME",
		"LIMEN_HERDR",
		"LIMEN_HUNK",
		"LIMEN_REAP_CONFIRM_MS",
		"LIMEN_STOP_GRACE_MS",
		"LIMEN_END_GATE",
		"LIMEN_START_POLL_MS",
		"LIMEN_START_READING",
		"LIMEN_STALL_TICK_MS",
		"LIMEN_WAKE_FALLBACK_MS",
		"LIMEN_LOCK_WAIT_MS",
		"LIMEN_CGROUP_ROOT",
		"LIMEN_CGROUP",
		"LIMEN_ALERTS_URL",
		"LIMEN_LINGER_DIR",
		"LIMEN_TEST_MODE",
	],
	exception: [
		"LIMEN_WORKER_MODEL",
		"LIMEN_COORDINATOR",
		"LIMEN_GITHUB_APP_ID",
		"LIMEN_GITHUB_KEY_FILE",
		"LIMEN_GITHUB_LIMEN_BIN",
		"LIMEN_GITHUB_PROJECTS_FILE",
		"LIMEN_GITHUB_STATE_DIR",
		"LIMEN_GITHUB_WORKER_UID",
		"LIMEN_PACKAGE",
	],
	removed: [
		"LIMEN_PREPARE_MS",
		"LIMEN_TOOL_STALL_MS",
		"LIMEN_MAX_TOOL_CALLS",
		"LIMEN_START_GATE",
		"LIMEN_PREPARE",
		"LIMEN_PREFLIGHT",
		"LIMEN_VIEW",
		"LIMEN_WAKE",
		"LIMEN_PI",
		"LIMEN_HANDSHAKE_MS",
		"LIMEN_SEAT_RING_MS",
		"LIMEN_SEAT_NOTIFY_TIMEOUT_MS",
		"LIMEN_JOB_LABEL",
		"LIMEN_ROLE",
	],
} as const;

test("the registry holds every name of R-015's inventory with the kind it gives, and no other name", () => {
	const kinds = Object.fromEntries(
		Object.entries(ENVIRONMENT).map(([name, entry]) => [
			name,
			entry.kind === "transport" ? `transport ${entry.reader}` : entry.kind,
		]),
	);
	const listed = Object.entries(INVENTORY).flatMap(([kind, names]) => names.map((name) => [name, kind]));
	assert.deepEqual(kinds, Object.fromEntries(listed));
});

// R-087 (a): only the two exceptions whose readers run inside a job cross into one; never LIMEN_COORDINATOR (A-061).
test("each exception names the ticket that ends it and whether it crosses into a job, and each removed name the place that replaces it", () => {
	const ends = Object.fromEntries(
		Object.entries(ENVIRONMENT).flatMap(([name, entry]) =>
			entry.kind === "exception" ? [[name, `${entry.until}${entry.crosses ? ", crosses" : ""}`]] : [],
		),
	);
	assert.deepEqual(ends, {
		LIMEN_WORKER_MODEL: "R-062, crosses",
		LIMEN_COORDINATOR: "R-050",
		LIMEN_GITHUB_APP_ID: "R-059",
		LIMEN_GITHUB_KEY_FILE: "R-059",
		LIMEN_GITHUB_LIMEN_BIN: "R-059",
		LIMEN_GITHUB_PROJECTS_FILE: "R-059",
		LIMEN_GITHUB_STATE_DIR: "R-059",
		LIMEN_GITHUB_WORKER_UID: "R-059",
		LIMEN_PACKAGE: "R-049, crosses",
	});
	const places = new Map<string, RegExp>([
		["LIMEN_PREPARE_MS", /^prepare in \.agents\/limen\/limits\.json$/],
		["LIMEN_TOOL_STALL_MS", /^toolStall in \.agents\/limen\/limits\.json$/],
		["LIMEN_MAX_TOOL_CALLS", /^toolCalls in \.agents\/limen\/limits\.json$/],
		["LIMEN_START_GATE", /^start-gate\.json in the seat folder/],
		["LIMEN_PREPARE", /^the spawn flag --prepare$/],
		["LIMEN_PREFLIGHT", /^nothing /],
		["LIMEN_VIEW", /^the terminal /],
		["LIMEN_WAKE", /^nothing /],
		["LIMEN_PI", /^pi on PATH$/],
		["LIMEN_HANDSHAKE_MS", /^a constant .*10 s/],
		["LIMEN_SEAT_RING_MS", /^a constant .*5 min/],
		["LIMEN_SEAT_NOTIFY_TIMEOUT_MS", /^a constant .*2 s/],
		["LIMEN_JOB_LABEL", /^nothing \(Limen never read it\)$/],
		["LIMEN_ROLE", /^nothing \(Limen never read it\)$/],
	]);
	for (const [name, entry] of Object.entries(ENVIRONMENT)) {
		if (entry.kind === "removed") {
			assert.match(entry.replacement, places.get(name) ?? /^$/, name);
		}
	}
});

/** The registered names of one kind. */
function namesOf<K extends Kind>(kind: K): Name<K>[] {
	const kinds = new Map<string, string>(Object.entries(ENVIRONMENT).map(([name, entry]) => [name, entry.kind]));
	return Object.keys(ENVIRONMENT).filter((name): name is Name<K> => kinds.get(name) === kind);
}

/** What every reader returns for every name of its kind. */
function everyReading(): Record<string, string | undefined> {
	return {
		...Object.fromEntries(namesOf("transport").map((name) => [name, transport(name)])),
		...Object.fromEntries(namesOf("test").map((name) => [name, testKnob(name)])),
		...Object.fromEntries(namesOf("exception").map((name) => [name, exception(name)])),
	};
}

test("T-03: a removed name set in the environment changes nothing a reader returns, and every reader refuses it", (t) => {
	const before = everyReading();
	// In the test mode the test found, so only the removed names change.
	const mode = process.env.LIMEN_TEST_MODE === "1" ? "1" : "0";
	withEnvironment(t, { ...Object.fromEntries(namesOf("removed").map((name) => [name, "1"])), LIMEN_TEST_MODE: mode });
	assert.deepEqual(everyReading(), before);
	for (const name of namesOf("removed")) {
		const refusal = new RegExp(`^${name} is not a`);
		// @ts-expect-error a removed name is no transport name
		assert.throws(() => transport(name), { message: refusal });
		// @ts-expect-error a removed name is no test knob
		assert.throws(() => testKnob(name), { message: refusal });
		// @ts-expect-error a removed name is no exception
		assert.throws(() => exception(name), { message: refusal });
	}
});

test("setTestKnob sets a test knob that testKnob reads, and refuses a name of any other kind with the environment unchanged", (t) => {
	// The helper puts the test process's LIMEN_HOME back after the test.
	withEnvironment(t, { LIMEN_HOME: "/before" });
	setTestKnob("LIMEN_HOME", "/fixture");
	assert.equal(testKnob("LIMEN_HOME"), "/fixture");
	const before = { ...process.env };
	const others: string[] = [
		...namesOf("transport"),
		...namesOf("exception"),
		...namesOf("removed"),
		"LIMEN_NOT_A_NAME",
	];
	for (const name of others) {
		// @ts-expect-error only a test knob is a valid name
		assert.throws(() => setTestKnob(name, "set"), { message: new RegExp(`^${name} is not a test knob`) });
	}
	assert.deepEqual({ ...process.env }, before);
});

// T-03, R-087 (b): on the seat a spawner's environment that holds a knob changes nothing; LIMEN_CGROUP, say, would pass
// an unscoped wrapper, and LIMEN_END_GATE hold every job's end.
test("T-03: testKnob returns nothing for a set knob outside test mode, which only LIMEN_TEST_MODE=1 turns on", (t) => {
	const knobs = namesOf("test").filter((name) => name !== "LIMEN_TEST_MODE");
	withEnvironment(t, Object.fromEntries(knobs.map((name) => [name, `set ${name}`])));
	const readings = ["", "0", "true", "1"].map((mode) => {
		process.env.LIMEN_TEST_MODE = mode;
		return knobs.filter((name) => testKnob(name) === `set ${name}`).length;
	});
	assert.deepEqual(readings, [0, 0, 0, knobs.length]);
});

test("setTestKnob turns test mode on for its process, so the knob it sets is read", (t) => {
	withEnvironment(t, { LIMEN_TEST_MODE: "0", LIMEN_HOME: "/before" });
	const before = testKnob("LIMEN_HOME");
	setTestKnob("LIMEN_HOME", "/fixture");
	assert.deepEqual([before, testKnob("LIMEN_HOME"), process.env.LIMEN_TEST_MODE], [undefined, "/fixture", "1"]);
});

test("each reader returns the value of a name of its kind and refuses a name of another kind or an unknown name", (t) => {
	withEnvironment(t, { LIMEN_JOB_ID: "job", LIMEN_HOME: "/home", LIMEN_PACKAGE: "/package", LIMEN_NOT_A_NAME: "1" });
	assert.deepEqual(
		[transport("LIMEN_JOB_ID"), testKnob("LIMEN_HOME"), exception("LIMEN_PACKAGE")],
		["job", "/home", "/package"],
	);
	// @ts-expect-error LIMEN_HOME is a test knob
	assert.throws(() => transport("LIMEN_HOME"), { constructor: Error, message: /^LIMEN_HOME is not a transport name/ });
	// @ts-expect-error LIMEN_PACKAGE is an exception
	assert.throws(() => testKnob("LIMEN_PACKAGE"), { message: /^LIMEN_PACKAGE is not a test knob/ });
	// @ts-expect-error LIMEN_JOB_ID is a transport name
	assert.throws(() => exception("LIMEN_JOB_ID"), { message: /^LIMEN_JOB_ID is not an exception/ });
	// @ts-expect-error LIMEN_NOT_A_NAME is not registered
	assert.throws(() => transport("LIMEN_NOT_A_NAME"), { message: /^LIMEN_NOT_A_NAME is not a transport name/ });
});

test("ignoredSettings lists a removed name, an unknown LIMEN_ name and an exception, and nothing for transport or test names", () => {
	const env = {
		LIMEN_PREPARE: "pnpm install",
		LIMEN_NOT_A_NAME: "1",
		LIMEN_WORKER_MODEL: "p/m",
		LIMEN_JOB: "1",
		LIMEN_TIMEOUT_MS: "1000",
		LIMEN_HOME: "/home",
		PATH: "/bin",
	};
	assert.deepEqual(ignoredSettings(env), {
		ignored: [
			{ name: "LIMEN_NOT_A_NAME", replacement: "nothing (not a Limen name)" },
			{ name: "LIMEN_PREPARE", replacement: "the spawn flag --prepare" },
		],
		exceptions: [{ name: "LIMEN_WORKER_MODEL", until: "R-062" }],
	});
	assert.deepEqual(ignoredSettings({ LIMEN_JOB: "1", LIMEN_HOME: "/home", LIMEN_TEST_MODE: "1" }), {
		ignored: [],
		exceptions: [],
	});
});

/**
 * A spawner's environment, a coordinator's shell (R-087 (e)): the names the list passes (the account, the locale, the
 * user bus, the Herdr pane), a token-shaped dummy, an agent socket, a git configuration and a Pi session of its own,
 * the exceptions, a knob and the tests' names, and a transport and a removed name of its own. Every value is a dummy.
 */
const SPAWNER: Readonly<Record<string, string>> = {
	HOME: "/home/agents",
	PATH: "/usr/local/bin:/usr/bin:/bin",
	USER: "agents",
	LOGNAME: "agents",
	LANG: "C.UTF-8",
	LC_TIME: "en_GB.UTF-8",
	TZ: "Europe/Warsaw",
	TMPDIR: "/tmp",
	XDG_RUNTIME_DIR: "/run/user/1001",
	DBUS_SESSION_BUS_ADDRESS: "unix:path=/run/user/1001/bus",
	HERDR_ENV: "1",
	HERDR_PANE_ID: "pane",
	SHELL: "/bin/bash",
	DEMO_API_TOKEN: "dummy-not-a-secret",
	SSH_AUTH_SOCK: "/run/user/1001/ssh-agent.sock",
	GIT_CONFIG_COUNT: "1",
	GIT_CONFIG_KEY_0: "credential.helper",
	GIT_CONFIG_VALUE_0: "!gh auth git-credential",
	PI_SESSION_ID: "coordinator",
	LIMEN_COORDINATOR: "1",
	LIMEN_GITHUB_KEY_FILE: "/keys/app.pem",
	LIMEN_PACKAGE: "/opt/limen",
	LIMEN_WORKER_MODEL: "p/m",
	LIMEN_END_GATE: "/gate",
	NODE_OPTIONS: "--import=/sink.mjs",
	GIT_CONFIG_GLOBAL: "/dev/null",
	LIMEN_TIMEOUT_MS: "1000",
	LIMEN_PREPARE: "pnpm install",
};
/** The spawner's names that the list passes in and out of test mode. */
const ALWAYS = ["HOME", "PATH", "USER", "LOGNAME", "LANG", "LC_TIME", "TZ", "TMPDIR"] as const;
const USER_BUS = ["XDG_RUNTIME_DIR", "DBUS_SESSION_BUS_ADDRESS"] as const;
const CROSSING = ["LIMEN_PACKAGE", "LIMEN_WORKER_MODEL"] as const;
/** The spawner's names that the list passes only in test mode: a knob, and the tests' Node and git names. */
const TESTS_ONLY = ["LIMEN_END_GATE", "NODE_OPTIONS", "GIT_CONFIG_GLOBAL"] as const;
/** What a spawn passes to its job's wrapper. */
const PASSED = {
	LIMEN_JOB_DIR: "/jobs/a",
	LIMEN_LABEL: "a",
	LIMEN_INTERNAL_RUN: "1",
	LIMEN_JOB_ID: "job-a",
	LIMEN_CONTEXT_ROOT: "/project",
} as const;
/** What Limen sets in every job's environment (R-087 (a)), for the job folder `jobDir`. */
const limenSets = (jobDir: string) => ({
	DISABLE_UPDATES: "1",
	GIT_CONFIG_COUNT: "1",
	GIT_CONFIG_KEY_0: "credential.helper",
	GIT_CONFIG_VALUE_0: "",
	GIT_TERMINAL_PROMPT: "0",
	GIT_ASKPASS: "",
	GH_CONFIG_DIR: `${jobDir}/gh-config`,
});
/** The spawner's values of `names`. */
const spawners = (names: readonly string[]): Record<string, string> =>
	Object.fromEntries(names.map((name) => [name, SPAWNER[name] ?? ""]));

// A-004 (T1): a job's environment is built from the allow-list alone, never from a copy of the spawner's.
test("A-004: outside test mode a job's wrapper gets only the list's names of its spawner, Limen's values and what the spawn passes, and the rest is named as dropped", () => {
	assert.deepEqual(wrapperEnvironment(PASSED, SPAWNER), {
		environment: {
			...spawners([...ALWAYS, ...USER_BUS, "HERDR_ENV", "HERDR_PANE_ID", ...CROSSING]),
			...limenSets("/jobs/a"),
			...PASSED,
		},
		dropped: [
			"DEMO_API_TOKEN",
			"GIT_CONFIG_GLOBAL",
			"LIMEN_COORDINATOR",
			"LIMEN_END_GATE",
			"LIMEN_GITHUB_KEY_FILE",
			"LIMEN_PREPARE",
			"LIMEN_TIMEOUT_MS",
			"NODE_OPTIONS",
			"PI_SESSION_ID",
			"SHELL",
			"SSH_AUTH_SOCK",
		],
	});
});

test("A-004: in its spawner's test mode a job's wrapper gets the knobs, the marker and the tests' Node and git names too", () => {
	assert.deepEqual(wrapperEnvironment(PASSED, { ...SPAWNER, LIMEN_TEST_MODE: "1" }), {
		environment: {
			...spawners([...ALWAYS, ...USER_BUS, "HERDR_ENV", "HERDR_PANE_ID", ...CROSSING, ...TESTS_ONLY]),
			LIMEN_TEST_MODE: "1",
			...limenSets("/jobs/a"),
			...PASSED,
		},
		dropped: [
			"DEMO_API_TOKEN",
			"LIMEN_COORDINATOR",
			"LIMEN_GITHUB_KEY_FILE",
			"LIMEN_PREPARE",
			"LIMEN_TIMEOUT_MS",
			"PI_SESSION_ID",
			"SHELL",
			"SSH_AUTH_SOCK",
		],
	});
});

test("A-004: a job's engine gets the wrapper's names without the wrapper's transport and Herdr names, in and out of test mode", () => {
	const engine = (spawner: Readonly<Record<string, string>>) =>
		Object.keys(
			engineEnvironment(wrapperEnvironment(PASSED, spawner).environment, { LIMEN_JOB: "1", LIMEN_JOB_ID: "job-a" }),
		).sort();
	const names = [
		...ALWAYS,
		...USER_BUS,
		...CROSSING,
		...Object.keys(limenSets("")),
		"LIMEN_JOB",
		"LIMEN_JOB_ID",
		"LIMEN_CONTEXT_ROOT",
	];
	assert.deepEqual(
		[engine(SPAWNER), engine({ ...SPAWNER, LIMEN_TEST_MODE: "1" })],
		[[...names].sort(), [...names, ...TESTS_ONLY, "LIMEN_TEST_MODE"].sort()],
	);
});

// R-087 (a), Decision 11: a job's own spawn goes through the list again.
test("A-004: the list applied to an engine's environment, a nested spawn, keeps the account, the user bus and the crossing exceptions and drops the parent's transport", () => {
	const parent = engineEnvironment(wrapperEnvironment(PASSED, SPAWNER).environment, {
		LIMEN_JOB: "1",
		LIMEN_JOB_ID: "job-a",
	});
	const nested = { LIMEN_JOB_DIR: "/jobs/b", LIMEN_JOB_ID: "job-b", LIMEN_CONTEXT_ROOT: "/project" } as const;
	assert.deepEqual(wrapperEnvironment(nested, parent), {
		environment: { ...spawners([...ALWAYS, ...USER_BUS, ...CROSSING]), ...limenSets("/jobs/b"), ...nested },
		dropped: ["LIMEN_JOB"],
	});
});

test("A-004: a spawner with no name of its own gives a job Limen's values and what the spawn passes, and drops nothing", () => {
	assert.deepEqual(wrapperEnvironment({ LIMEN_JOB_DIR: "/jobs/c" }, {}), {
		environment: { ...limenSets("/jobs/c"), LIMEN_JOB_DIR: "/jobs/c" },
		dropped: [],
	});
});

test("engineEnvironment drops every wrapper transport name and every Herdr name of its base, and keeps the rest", () => {
	const wrapperNames = namesOf("transport").filter((name) => ENVIRONMENT[name].reader === "wrapper");
	const base = {
		...Object.fromEntries(wrapperNames.map((name) => [name, "1"])),
		LIMEN_JOB_ID: "job",
		LIMEN_CONTEXT_ROOT: "/project",
		LIMEN_GROUP_ID: "group",
		LIMEN_HOME: "/home",
		HERDR_PANE_ID: "pane",
		HERDR_ENV: "1",
		PATH: "/bin",
	};
	assert.ok(wrapperNames.includes("LIMEN_CONTINUE"));
	assert.deepEqual(engineEnvironment(base, { LIMEN_JOB: "1" }), {
		LIMEN_JOB: "1",
		LIMEN_JOB_ID: "job",
		LIMEN_CONTEXT_ROOT: "/project",
		LIMEN_GROUP_ID: "group",
		LIMEN_HOME: "/home",
		PATH: "/bin",
	});
});

test("groupAdvanceEnvironment drops every transport name and the job's Pi session and Herdr pane and tab", (t) => {
	withEnvironment(t, {
		...Object.fromEntries(namesOf("transport").map((name) => [name, "1"])),
		PI_SESSION_ID: "session",
		HERDR_PANE_ID: "pane",
		HERDR_TAB_ID: "tab",
		LIMEN_HOME: "/home",
	});
	const built = groupAdvanceEnvironment();
	const names = [...namesOf("transport"), "PI_SESSION_ID", "HERDR_PANE_ID", "HERDR_TAB_ID"];
	assert.deepEqual(
		Object.keys(built).filter((name) => names.includes(name)),
		[],
	);
	assert.deepEqual([built.LIMEN_HOME, built.PATH], ["/home", process.env.PATH]);
});
