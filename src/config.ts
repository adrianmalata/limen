/**
 * The one module that reads Limen's names from the environment (T-03). Settings come only from the owner's files: the
 * project's `.agents/limen/limits.json` and the seat's `start-gate.json`; no variable overrides them. What the
 * environment still carries has a kind here: `transport` (set by Limen between its own processes, a location hint and
 * never a permission), `test` (a knob of the tests and of manual checks), or `exception` (a setting still read until
 * the ticket named by `until` replaces it). A `removed` name is no longer read; `limen status` names it with what
 * replaces it, so an environment that still sets it is found (R-015).
 */

type Transport = {
	readonly kind: "transport";
	/** `wrapper`: removed before the engine starts. `engine`: kept for the hooks and the commands a job runs. */
	readonly reader: "wrapper" | "engine";
	readonly carries: string;
};
type TestEntry = { readonly kind: "test"; readonly carries: string };
type Exception = { readonly kind: "exception"; readonly carries: string; readonly until: string };
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
	LIMEN_SETUP_KEEP: {
		kind: "transport",
		reader: "wrapper",
		carries: "the spawner's checkout, which the job's prune keeps; only spawn sets it, so only a spawn sets up",
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
	LIMEN_START_POLL_MS: { kind: "test", carries: "the start queue's poll interval, in place of 5 s" },
	LIMEN_START_READING: { kind: "test", carries: "a file with the CPU and memory reading, in place of the machine's" },
	LIMEN_WAKE_FALLBACK_MS: { kind: "test", carries: "the grace before a fallback wake, in place of 5 min" },
	LIMEN_LOCK_WAIT_MS: { kind: "test", carries: "the lock's wait bound, in place of 60 s" },
	LIMEN_CGROUP_ROOT: {
		kind: "test",
		carries: "a folder in place of the system's cgroup hierarchy, where the tests' scopes keep their readings",
	},
	LIMEN_CGROUP: {
		kind: "test",
		carries:
			"the cgroup of a process in a tests' scope, in place of the one the system gives; its processes inherit it",
	},
	LIMEN_WORKER_MODEL: { kind: "exception", carries: "the model of a continue without --model", until: "R-062" },
	LIMEN_COORDINATOR: { kind: "exception", carries: "1 in the owner-facing coordinator's session", until: "R-050" },
	LIMEN_GITHUB_APP_ID: { kind: "exception", carries: "the GitHub App of the poller", until: "R-059" },
	LIMEN_GITHUB_KEY_FILE: { kind: "exception", carries: "the private key file of the GitHub App", until: "R-059" },
	LIMEN_GITHUB_LIMEN_BIN: {
		kind: "exception",
		carries: "the limen binary that the poller and the github commands run",
		until: "R-059",
	},
	LIMEN_GITHUB_PROJECTS_FILE: { kind: "exception", carries: "the poller's registry of projects", until: "R-059" },
	LIMEN_GITHUB_STATE_DIR: { kind: "exception", carries: "the poller's state folder", until: "R-059" },
	LIMEN_GITHUB_WORKER_UID: {
		kind: "exception",
		carries: "the uid of the account that the poller starts jobs as",
		until: "R-059",
	},
	LIMEN_PACKAGE: {
		kind: "exception",
		carries: "the package whose hooks and templates a project uses",
		until: "R-049",
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

/** A knob that the tests and manual checks set; T1 (R-087) and the coordinator start script (R-050) do not pass it. */
export function testKnob(name: TestKnob): string | undefined {
	return read(name, "test");
}

/** Sets a test knob for this process and the processes it starts, as a fixture that runs Limen in-process does. */
export function setTestKnob(name: TestKnob, value: string): void {
	read(name, "test");
	process.env[name] = value;
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

/**
 * The environment of a new job wrapper: the spawner's own without any transport or removed name, so a variable that a
 * coordinator's shell or a job's engine holds never reaches the job, plus what the spawner passes.
 */
export function wrapperEnvironment(values: Readonly<Partial<Record<TransportName, string>>>): NodeJS.ProcessEnv {
	const inherited = without(process.env, (entry) => entry.kind === "transport" || entry.kind === "removed");
	return { ...inherited, ...transportValues(values) };
}

/** The wrapper's names of the spawner's Pi session; the engine starts a session of its own. */
const WRAPPER_PI = ["PI_SESSION_ID", "PI_SESSION_FILE", "PI_PROVIDER", "PI_MODEL", "PI_REASONING_LEVEL"];

/**
 * The environment of a job's engine: the wrapper's `base` without the transport names only the wrapper reads, the
 * spawner's Pi session and every Herdr name (a detached job must not inherit the coordinator's pane), plus `values`.
 */
export function engineEnvironment(
	base: NodeJS.ProcessEnv,
	values: Readonly<Partial<Record<EngineName, string>>>,
): NodeJS.ProcessEnv {
	const kept = without(base, (entry) => entry.kind === "transport" && entry.reader === "wrapper");
	for (const name of Object.keys(kept)) {
		if (WRAPPER_PI.includes(name) || name.startsWith("HERDR_")) {
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
