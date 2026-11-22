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
 * systemd user scopes (R-026), and LIMEN_ALERTS_URL, the ntfy server of the alerts' tests (R-033).
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
		"LIMEN_SETUP_KEEP",
		"LIMEN_SETUP_PREPARE",
		"LIMEN_CONTINUE",
	],
	"transport engine": ["LIMEN_JOB", "LIMEN_JOB_ID", "LIMEN_CONTEXT_ROOT", "LIMEN_GROUP_ID", "LIMEN_TEAM_ID"],
	test: [
		"LIMEN_HOME",
		"LIMEN_HERDR",
		"LIMEN_HUNK",
		"LIMEN_REAP_CONFIRM_MS",
		"LIMEN_START_POLL_MS",
		"LIMEN_START_READING",
		"LIMEN_WAKE_FALLBACK_MS",
		"LIMEN_LOCK_WAIT_MS",
		"LIMEN_CGROUP_ROOT",
		"LIMEN_CGROUP",
		"LIMEN_ALERTS_URL",
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

test("each exception names the ticket that ends it, and each removed name the place that replaces it", () => {
	const ends = Object.fromEntries(
		Object.entries(ENVIRONMENT).flatMap(([name, entry]) => (entry.kind === "exception" ? [[name, entry.until]] : [])),
	);
	assert.deepEqual(ends, {
		LIMEN_WORKER_MODEL: "R-062",
		LIMEN_COORDINATOR: "R-050",
		LIMEN_GITHUB_APP_ID: "R-059",
		LIMEN_GITHUB_KEY_FILE: "R-059",
		LIMEN_GITHUB_LIMEN_BIN: "R-059",
		LIMEN_GITHUB_PROJECTS_FILE: "R-059",
		LIMEN_GITHUB_STATE_DIR: "R-059",
		LIMEN_GITHUB_WORKER_UID: "R-059",
		LIMEN_PACKAGE: "R-049",
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
	withEnvironment(t, Object.fromEntries(namesOf("removed").map((name) => [name, "1"])));
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
	assert.deepEqual(ignoredSettings({ LIMEN_JOB: "1", LIMEN_HOME: "/home" }), { ignored: [], exceptions: [] });
});

test("wrapperEnvironment drops the spawner's LIMEN_TIMEOUT_MS, LIMEN_CONTINUE and removed names, and keeps what the spawner passes", (t) => {
	withEnvironment(t, {
		LIMEN_TIMEOUT_MS: "1000",
		LIMEN_CONTINUE: "1",
		LIMEN_JOB: "1",
		LIMEN_PREPARE: "pnpm install",
		LIMEN_HOME: "/home",
		LIMEN_PACKAGE: "/package",
	});
	const built = wrapperEnvironment({ LIMEN_JOB_DIR: "/jobs/a", LIMEN_LABEL: "a" });
	assert.deepEqual(
		[built.LIMEN_TIMEOUT_MS, built.LIMEN_CONTINUE, built.LIMEN_JOB, built.LIMEN_PREPARE],
		[undefined, undefined, undefined, undefined],
	);
	assert.deepEqual(
		[built.LIMEN_JOB_DIR, built.LIMEN_LABEL, built.LIMEN_HOME, built.LIMEN_PACKAGE, built.PATH],
		["/jobs/a", "a", "/home", "/package", process.env.PATH],
	);
	assert.equal(wrapperEnvironment({ LIMEN_TIMEOUT_MS: "2000" }).LIMEN_TIMEOUT_MS, "2000");
});

test("engineEnvironment drops every wrapper transport name and the wrapper's Pi and Herdr names, and keeps the engine's", () => {
	const wrapperNames = namesOf("transport").filter((name) => ENVIRONMENT[name].reader === "wrapper");
	const base = {
		...Object.fromEntries(wrapperNames.map((name) => [name, "1"])),
		LIMEN_JOB_ID: "job",
		LIMEN_CONTEXT_ROOT: "/project",
		LIMEN_GROUP_ID: "group",
		LIMEN_HOME: "/home",
		PI_SESSION_ID: "session",
		PI_SESSION_FILE: "/session.jsonl",
		PI_PROVIDER: "p",
		PI_MODEL: "m",
		PI_REASONING_LEVEL: "high",
		HERDR_PANE_ID: "pane",
		HERDR_ENV: "1",
		PATH: "/bin",
	};
	const built = engineEnvironment(base, { LIMEN_JOB: "1" });
	assert.ok(wrapperNames.includes("LIMEN_CONTINUE"));
	assert.deepEqual(
		Object.keys(built).filter((name) => wrapperNames.some((wrapper) => wrapper === name)),
		[],
	);
	assert.deepEqual(built, {
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
