/**
 * The one module that reads Limen's names from the environment (T-03). Settings come only from the owner's files: the
 * project's `.agents/limen/limits.json` and the seat's `start-gate.json`; no variable overrides them. What the
 * environment still carries has a kind here: `transport` (set by Limen between its own processes, a location hint and
 * never a permission), `test` (a knob of the tests and of manual checks, read only in test mode, `LIMEN_TEST_MODE=1`),
 * or `exception` (a setting still read until the ticket named by `until` replaces it). A `removed` name is no longer
 * read; `limen status` names it with what replaces it, so an environment that still sets it is found (R-015). The
 * module also builds a job's environment from its allow-list, T1 of A-004 (R-087).
 */
import { join } from "node:path";

type Transport = {
	readonly kind: "transport";
	/** `wrapper`: removed before the engine starts. `engine`: kept for the hooks and the commands a job runs. */
	readonly reader: "wrapper" | "engine";
	readonly carries: string;
};
type TestEntry = { readonly kind: "test"; readonly carries: string };
type Exception = {
	readonly kind: "exception";
	readonly carries: string;
	readonly until: string;
	/** Whether a job's environment carries it: its reader runs inside a job (R-087). */
	readonly crosses: boolean;
};
type Removed = { readonly kind: "removed"; readonly carries: string; readonly replacement: string };
type Entry = Transport | TestEntry | Exception | Removed;
export type Kind = Entry["kind"];

const LIMITS_FILE = ".agents/limen/limits.json";
const NEVER_READ = "nothing (Limen never read it)";

/** Every `LIMEN_*` name of Limen's code, with its kind and one line on what it carries. */
export const ENVIRONMENT = {
	LIMEN_INTERNAL_RUN: { kind: "transport", reader: "wrapper", carries: "1 when bin/limen runs a job's wrapper" },
	LIMEN_JOB_DIR: { kind: "transport", reader: "wrapper", carries: "the job's folder under .limen/jobs" },
	LIMEN_WORKTREE: { kind: "transport", reader: "wrapper", carries: "the worktree the engine runs in" },
	LIMEN_TASK_FILE: { kind: "transport", reader: "wrapper", carries: "the job's task file" },
	LIMEN_PREAMBLE: { kind: "transport", reader: "wrapper", carries: "the file of the role's preamble" },
	LIMEN_TIMEOUT_MS: {
		kind: "transport",
		reader: "wrapper",
		carries: "the job's time limit from --timeout or a group deadline, in milliseconds",
	},
	LIMEN_MODEL: { kind: "transport", reader: "wrapper", carries: "the model of the job's route" },
	LIMEN_PROVIDER: { kind: "transport", reader: "wrapper", carries: "the provider of the job's route" },
	LIMEN_THINKING: { kind: "transport", reader: "wrapper", carries: "the reasoning level of the job's route" },
	LIMEN_LABEL: { kind: "transport", reader: "wrapper", carries: "the job's label, the name of the engine's session" },
	LIMEN_SETUP: {
		kind: "transport",
		reader: "wrapper",
		carries: "1 when a spawn starts the job, which owes its setup: the log of ignored limits, then --prepare",
	},
	LIMEN_SETUP_PREPARE: { kind: "transport", reader: "wrapper", carries: "the --prepare command of a spawn" },
	LIMEN_CONTINUE: {
		kind: "transport",
		reader: "wrapper",
		carries: "1 when the engine continues the parent's session with the task as its message",
	},
	LIMEN_JOB: {
		kind: "transport",
		reader: "engine",
		carries: "1 in a job's engine, its hooks and the commands it runs",
	},
	LIMEN_JOB_ID: { kind: "transport", reader: "engine", carries: "the job's id" },
	LIMEN_CONTEXT_ROOT: { kind: "transport", reader: "engine", carries: "the project root of the job's worktree" },
	LIMEN_GROUP_ID: { kind: "transport", reader: "engine", carries: "the group of a group member" },
	LIMEN_TEAM_ID: { kind: "transport", reader: "engine", carries: "the team of a group member" },
	LIMEN_HOME: { kind: "test", carries: "the folder whose .limen/ is the seat folder, in place of the home folder" },
	LIMEN_HERDR: { kind: "test", carries: "the Herdr binary, or 0 for none, in place of herdr on PATH" },
	LIMEN_HUNK: { kind: "test", carries: "the hunk binary, or 0 for none, in place of hunk on PATH" },
	LIMEN_REAP_CONFIRM_MS: { kind: "test", carries: "the wait before a dead job is reaped, in place of 10 s" },
	LIMEN_STOP_GRACE_MS: {
		kind: "test",
		carries:
			"the grace between the TERM and the KILL of a stop, an exhaustion, a reap and a TERM the wrapper forwards, in place of 10 s",
	},
	LIMEN_END_GATE: {
		kind: "test",
		carries:
			"a file whose creation a job's wrapper waits for once its engine ended, before it reads the record, so a test can signal it there (D-029)",
	},
	LIMEN_START_POLL_MS: { kind: "test", carries: "the start queue's poll interval, in place of 5 s" },
	LIMEN_START_READING: { kind: "test", carries: "a file with the CPU and memory reading, in place of the machine's" },
	LIMEN_STALL_TICK_MS: {
		kind: "test",
		carries: "how often a job's wrapper samples its scope's CPU time for the stall rule and its peak, in place of 3 s",
	},
	LIMEN_WAKE_FALLBACK_MS: { kind: "test", carries: "the grace before a fallback wake, in place of 5 min" },
	LIMEN_LOCK_WAIT_MS: { kind: "test", carries: "the lock's wait bound, in place of 60 s" },
	LIMEN_LEFTOVER_TABS_MS: {
		kind: "test",
		carries: "the bound of the seat sweep's daily close of leftover Herdr tabs, in place of 60 s",
	},
	LIMEN_CGROUP_ROOT: {
		kind: "test",
		carries: "a folder in place of the system's cgroup hierarchy, where the tests' scopes keep their readings",
	},
	LIMEN_CGROUP: {
		kind: "test",
		carries:
			"the cgroup of a process in a tests' scope, in place of the one the system gives; its processes inherit it",
	},
	LIMEN_ALERTS_URL: { kind: "test", carries: "the ntfy server the seat's alerts post to, in place of https://ntfy.sh" },
	LIMEN_LINGER_DIR: {
		kind: "test",
		carries: "a folder in place of /var/lib/systemd/linger, where systemd marks each account whose manager lingers",
	},
	LIMEN_TEST_MODE: {
		kind: "test",
		carries: "1 in a process of the tests or of a manual check, which alone reads the knobs and passes them to a job",
	},
	LIMEN_WORKER_MODEL: {
		kind: "exception",
		carries: "the model of a continue without --model, which a team job's continue reads too",
		until: "R-062",
		crosses: true,
	},
	LIMEN_COORDINATOR: {
		kind: "exception",
		carries: "1 in the owner-facing coordinator's session",
		until: "R-050",
		crosses: false,
	},
	LIMEN_GITHUB_APP_ID: { kind: "exception", carries: "the GitHub App of the poller", until: "R-059", crosses: false },
	LIMEN_GITHUB_KEY_FILE: {
		kind: "exception",
		carries: "the private key file of the GitHub App",
		until: "R-059",
		crosses: false,
	},
	LIMEN_GITHUB_LIMEN_BIN: {
		kind: "exception",
		carries: "the limen binary that the poller and the github commands run",
		until: "R-059",
		crosses: false,
	},
	LIMEN_GITHUB_PROJECTS_FILE: {
		kind: "exception",
		carries: "the poller's registry of projects",
		until: "R-059",
		crosses: false,
	},
	LIMEN_GITHUB_STATE_DIR: { kind: "exception", carries: "the poller's state folder", until: "R-059", crosses: false },
	LIMEN_GITHUB_WORKER_UID: {
		kind: "exception",
		carries: "the uid of the account that the poller starts jobs as",
		until: "R-059",
		crosses: false,
	},
	LIMEN_PACKAGE: {
		kind: "exception",
		carries: "the package whose hooks and templates a project uses, which a team job's spawns use too",
		until: "R-049",
		crosses: true,
	},
	LIMEN_PREPARE_MS: {
		kind: "removed",
		carries: "the time limit of a --prepare command",
		replacement: `prepare in ${LIMITS_FILE}`,
	},
	LIMEN_TOOL_STALL_MS: {
		kind: "removed",
		carries: "the time a CPU-idle tool may run",
		replacement: `toolStall in ${LIMITS_FILE}`,
	},
	LIMEN_MAX_TOOL_CALLS: {
		kind: "removed",
		carries: "the tool-start cap of a job",
		replacement: `toolCalls in ${LIMITS_FILE}`,
	},
	LIMEN_START_GATE: {
		kind: "removed",
		carries: "the start gate, or off",
		replacement: "start-gate.json in the seat folder (~/.limen)",
	},
	LIMEN_PREPARE: {
		kind: "removed",
		carries: "the prepare command of a spawn without --prepare",
		replacement: "the spawn flag --prepare",
	},
	LIMEN_PREFLIGHT: {
		kind: "removed",
		carries: "auth, for a pi auth check before spawn and continue",
		replacement: "nothing (spawn and continue run no pi auth check)",
	},
	LIMEN_VIEW: {
		kind: "removed",
		carries: "the view of limen show, human or compact",
		replacement: "the terminal (limen show is for people in a terminal, compact through a pipe)",
	},
	LIMEN_WAKE: {
		kind: "removed",
		carries: "0 to keep the wake hook off in a coordinator session",
		replacement: "nothing (the wake hook always sets up)",
	},
	LIMEN_PI: { kind: "removed", carries: "the engine binary", replacement: "pi on PATH" },
	LIMEN_HANDSHAKE_MS: {
		kind: "removed",
		carries: "the wait for a wrapper's handshake",
		replacement: "a constant (spawn waits 10 s for the wrapper's handshake)",
	},
	LIMEN_SEAT_RING_MS: {
		kind: "removed",
		carries: "the age at which the seat sweep rings for a job",
		replacement: "a constant (the seat sweep rings after 5 min)",
	},
	LIMEN_SEAT_NOTIFY_TIMEOUT_MS: {
		kind: "removed",
		carries: "the wait for a Herdr notification",
		replacement: "a constant (a Herdr notification waits 2 s)",
	},
	LIMEN_JOB_LABEL: { kind: "removed", carries: "the job's label, given to the engine", replacement: NEVER_READ },
	LIMEN_ROLE: { kind: "removed", carries: "a job's role", replacement: NEVER_READ },
} as const satisfies Readonly<Record<string, Entry>>;

type Registry = typeof ENVIRONMENT;
/** The registered names of kind `K`. */
export type Name<K extends Kind> = { [N in keyof Registry]: Registry[N]["kind"] extends K ? N : never }[keyof Registry];
export type TransportName = Name<"transport">;
/** The transport names that a job's engine keeps. */
export type EngineName = {
	[N in TransportName]: Registry[N]["reader"] extends "engine" ? N : never;
}[TransportName];
export type TestKnob = Name<"test">;
export type ExceptionName = Name<"exception">;

const ENTRIES: ReadonlyMap<string, Entry> = new Map(Object.entries(ENVIRONMENT));
const NOUNS: Readonly<Record<Kind, string>> = {
	transport: "a transport name",
	test: "a test knob",
	exception: "an exception",
	removed: "a removed name",
};

/** The value of `name` in the environment; a name of another kind, or none, is a plain error. */
function read(name: string, kind: Kind): string | undefined {
	if (ENTRIES.get(name)?.kind !== kind) {
		throw new Error(`${name} is not ${NOUNS[kind]} of src/config.ts`);
	}
	return process.env[name];
}

/** A name that one Limen process sets for another: where a job's folder, worktree or project is, never a permission. */
export function transport(name: TransportName): string | undefined {
	return read(name, "transport");
}

/** Whether `environment`, a process's own, is in test mode: its `LIMEN_TEST_MODE` is 1 (T-03, R-087). */
function testMode(environment: NodeJS.ProcessEnv): boolean {
	return environment.LIMEN_TEST_MODE === "1";
}

/**
 * A knob that the tests and manual checks set, read only in this process's test mode (T-03): outside it every knob is
 * undefined, so on the seat a spawner's environment that holds one changes nothing, and a job's environment carries
 * the knobs only from a spawner in test mode (`wrapperEnvironment`); the coordinator start script passes none (R-050).
 */
export function testKnob(name: TestKnob): string | undefined {
	const value = read(name, "test");
	return testMode(process.env) ? value : undefined;
}

/**
 * Sets a test knob for this process and the processes it starts, and turns test mode on for them, as a fixture that
 * runs Limen in-process does.
 */
export function setTestKnob(name: TestKnob, value: string): void {
	read(name, "test");
	process.env[name] = value;
	process.env.LIMEN_TEST_MODE = "1";
}

/** A setting the environment still gives until the ticket in its `until` replaces it (D-052). */
export function exception(name: ExceptionName): string | undefined {
	return read(name, "exception");
}

/** `environment` without every registered name whose entry `drop` selects. */
function without(environment: NodeJS.ProcessEnv, drop: (entry: Entry) => boolean): NodeJS.ProcessEnv {
	const kept = { ...environment };
	for (const [name, entry] of ENTRIES) {
		if (drop(entry)) {
			delete kept[name];
		}
	}
	return kept;
}

/** `values` with each key checked to be a transport name, so a caller cannot hand a setting to another process. */
function transportValues(values: Readonly<Record<string, string>>): Readonly<Record<string, string>> {
	for (const name of Object.keys(values)) {
		read(name, "transport");
	}
	return values;
}

/** A name a job's environment takes from its spawner, unchanged. */
type Passed = {
	/** `job`: every process of the job. `wrapper`: the job's wrapper alone, never its engine (`engineEnvironment`). */
	readonly reaches: "job" | "wrapper";
	/** `test`: only from a spawner in test mode, as the test knobs (T-03). */
	readonly only?: "test";
	readonly carries: string;
};

/**
 * T1 of A-004 (R-087): the allow-list of what a job's processes see of their spawner's environment, the one filter of
 * it, since the bridge forwards Pi's whole environment to Claude Code (E-4). A key ending in `*` stands for every name
 * with that prefix. Every other name of the spawner stays out: a token, `SSH_*`, `GIT_*`, `PI_*`, `SHELL`, `TERM`, and
 * of Limen's own names the spawner's transport values, `LIMEN_COORDINATOR` (A-061) and the poller's names.
 */
export const JOB_PASSES = {
	HOME: {
		reaches: "job",
		carries: "the account's home folder, where Pi, the bridge and Claude Code find their logins (E-4)",
	},
	PATH: { reaches: "job", carries: "where a job finds its programs: Pi's bash, git, node and a project's toolchains" },
	USER: { reaches: "job", carries: "the account's name" },
	LOGNAME: { reaches: "job", carries: "the account's name, as a login sets it" },
	LANG: { reaches: "job", carries: "the locale of the tools' text" },
	"LC_*": { reaches: "job", carries: "the locale of one category of the tools' text" },
	TZ: { reaches: "job", carries: "the time zone of the tools' times" },
	TMPDIR: { reaches: "job", carries: "the temporary folder, the spawner's until R-048 gives a job one of its own" },
	XDG_RUNTIME_DIR: {
		reaches: "job",
		carries: "the account's runtime folder, where a job's own spawns and its finisher find the user manager (R-026)",
	},
	DBUS_SESSION_BUS_ADDRESS: {
		reaches: "job",
		carries: "the user bus, through which a job's own spawns and its finisher start and end scopes (R-026)",
	},
	"HERDR_*": {
		reaches: "wrapper",
		carries: "the spawner's Herdr server and pane, through which the wrapper's end wake runs herdr status",
	},
	NODE_OPTIONS: {
		reaches: "job",
		only: "test",
		carries: "the tests' network sink, which every Node process of a test project loads",
	},
	NODE_NO_WARNINGS: { reaches: "job", only: "test", carries: "1, so Node's warnings stay out of the tests' output" },
	GIT_CONFIG_GLOBAL: {
		reaches: "job",
		only: "test",
		carries: "the tests' global git configuration, in place of the account's",
	},
	GIT_CONFIG_NOSYSTEM: { reaches: "job", only: "test", carries: "1, so the tests' git reads no system configuration" },
} as const satisfies Readonly<Record<string, Passed>>;

/** A name Limen sets in every job's environment, with its value for the job folder `jobDir`. */
type LimenValue = { readonly value: (jobDir: string) => string; readonly carries: string };

/** T1 of A-004 (R-087): what Limen sets in every job's environment, over any value the spawner holds. */
export const JOB_SETS = {
	DISABLE_UPDATES: {
		value: () => "1",
		carries: "1, so Claude Code does not update itself (D-017); the boundary is the owner of its binary",
	},
	GIT_CONFIG_COUNT: {
		value: () => "1",
		carries: "one git configuration entry, which git reads after every configuration file",
	},
	GIT_CONFIG_KEY_0: { value: () => "credential.helper", carries: "that entry's name" },
	GIT_CONFIG_VALUE_0: {
		value: () => "",
		carries: "empty, which resets every credential helper a system, global, repository or URL-scoped entry names",
	},
	GIT_TERMINAL_PROMPT: { value: () => "0", carries: "0, so git fails instead of asking for a name or a password" },
	// Git asks an askpass program before it reads GIT_TERMINAL_PROMPT: GIT_ASKPASS, else core.askPass from any
	// configuration file, else SSH_ASKPASS. A set GIT_ASKPASS, even an empty one, is the only one git reads.
	GIT_ASKPASS: {
		value: () => "",
		carries: "empty, so git runs no askpass program that a configuration file or SSH_ASKPASS names",
	},
	GH_CONFIG_DIR: {
		value: (jobDir) => join(jobDir, "gh-config"),
		carries:
			"a folder of the job's folder that Limen does not create, which hides gh's configuration files, so gh finds no login in them; gh would still find a login it keeps in a system keyring through the user bus (R-026)",
	},
} as const satisfies Readonly<Record<string, LimenValue>>;

const PASSES: ReadonlyMap<string, Passed> = new Map(Object.entries(JOB_PASSES));

/** The allow-list's entry of `name`: its own, or the one of a prefix `<prefix>*` it starts with. */
function passedEntry(name: string): Passed | undefined {
	for (const [key, entry] of PASSES) {
		if (key === name || (key.endsWith("*") && name.startsWith(key.slice(0, -1)))) {
			return entry;
		}
	}
	return undefined;
}

/**
 * Whether the spawner's `name` passes into a job's environment, `test` the spawner's test mode: a name of the list (its
 * test-only ones in test mode), an exception that crosses into a job, and in test mode every test knob and the marker.
 */
function passes(name: string, test: boolean): boolean {
	const entry = ENTRIES.get(name);
	if (entry !== undefined) {
		return (entry.kind === "exception" && entry.crosses) || (entry.kind === "test" && test);
	}
	const passed = passedEntry(name);
	return passed !== undefined && (passed.only === undefined || test);
}

/** What a spawner passes to its job's wrapper: transport values, the job's folder among them. */
export type WrapperValues = Partial<Record<TransportName, string>> & { readonly LIMEN_JOB_DIR: string };

/** A job's environment, and the names of its spawner's environment that it does not hold, sorted (R-087 (d)). */
export type JobEnvironment = { readonly environment: NodeJS.ProcessEnv; readonly dropped: readonly string[] };

/**
 * The environment of a new job wrapper, built from the allow-list alone, never from a copy of the spawner's (T1 of
 * A-004, R-087): the names of `spawner` that `JOB_PASSES` lists and the exceptions that cross into a job, in the
 * spawner's test mode the test knobs too, then Limen's own `JOB_SETS` and the transport values the spawner passes.
 * Every process of the job's scope descends from the wrapper, so the list applies to all of them; a job's own spawn
 * goes through it again. `dropped` names each name of `spawner` that the environment does not hold, never a value.
 */
export function wrapperEnvironment(
	values: Readonly<WrapperValues>,
	spawner: NodeJS.ProcessEnv = process.env,
): JobEnvironment {
	const test = testMode(spawner);
	const environment: NodeJS.ProcessEnv = {};
	for (const [name, value] of Object.entries(spawner)) {
		if (value !== undefined && passes(name, test)) {
			environment[name] = value;
		}
	}
	for (const [name, own] of Object.entries(JOB_SETS)) {
		environment[name] = own.value(values.LIMEN_JOB_DIR);
	}
	Object.assign(environment, transportValues(values));
	const dropped = Object.keys(spawner)
		.filter((name) => spawner[name] !== undefined && !Object.hasOwn(environment, name))
		.sort();
	return { environment, dropped };
}

/**
 * The environment of a job's engine and of the project's code that runs before it, its `--prepare` command (R-087
 * (c)): the wrapper's `base` without the transport names only the wrapper reads and the names the allow-list gives the
 * wrapper alone, every Herdr name (a detached job must not inherit the coordinator's pane), plus `values`.
 */
export function engineEnvironment(
	base: NodeJS.ProcessEnv,
	values: Readonly<Partial<Record<EngineName, string>>>,
): NodeJS.ProcessEnv {
	const kept = without(base, (entry) => entry.kind === "transport" && entry.reader === "wrapper");
	for (const name of Object.keys(kept)) {
		if (passedEntry(name)?.reaches === "wrapper") {
			delete kept[name];
		}
	}
	return { ...kept, ...transportValues(values) };
}

/**
 * The environment of `limen group advance`, started by a team job that ended: without any transport name, the job's
 * Pi session or its Herdr pane and tab, a child would act as the finished job (claim its membership, run it again, or
 * wake its pane).
 */
export function groupAdvanceEnvironment(): NodeJS.ProcessEnv {
	const kept = without(process.env, (entry) => entry.kind === "transport");
	for (const name of ["PI_SESSION_ID", "HERDR_PANE_ID", "HERDR_TAB_ID"]) {
		delete kept[name];
	}
	return kept;
}

export type Ignored = { readonly name: string; readonly replacement: string };
export type Excepted = { readonly name: string; readonly until: string };

/**
 * The `LIMEN_*` names in `env` that Limen does not read, a removed one or one it never had, each with what replaces it,
 * and the exceptions it still reads, each with the ticket that ends it; both sorted by name. Transport names and test
 * knobs are not listed.
 */
export function ignoredSettings(env: NodeJS.ProcessEnv = process.env): {
	readonly ignored: readonly Ignored[];
	readonly exceptions: readonly Excepted[];
} {
	const ignored: Ignored[] = [];
	const exceptions: Excepted[] = [];
	for (const name of Object.keys(env).sort()) {
		if (!name.startsWith("LIMEN_")) {
			continue;
		}
		const entry = ENTRIES.get(name);
		if (!entry) {
			ignored.push({ name, replacement: "nothing (not a Limen name)" });
		} else if (entry.kind === "removed") {
			ignored.push({ name, replacement: entry.replacement });
		} else if (entry.kind === "exception") {
			exceptions.push({ name, until: entry.until });
		}
	}
	return { ignored, exceptions };
}
