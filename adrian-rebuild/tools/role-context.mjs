/* PL: Moduł pomiaru kontekstu ról Limena, używany przez context-size.mjs. Rozpakowuje drzewo danego refa do katalogu
   tymczasowego, tworzy fiksturę projektu prawdziwym `limen init` (z atrapą `pi` na PATH, bo od R-020 init jej wymaga;
   opcjonalnie z plikami prawdziwego projektu, kopiowanymi tylko do odczytu) i bierze listę ról z szablonów refa (bez
   podręcznika, także `templates/manual.md` od R-040, i bez rejestrów z `templates/registers/`). Dla
   refa z `src/runtime/context-message.ts` (od R-039) mierzy wiadomość kontekstową każdej roli z tego modułu i cue
   z hooka `communication`; dla starszego refa, jak dotąd, prompt systemowy, cue i dodatki raz na sesję z hooków
   z atrapą API silnika; teksty notatki zadania (sprawdzenie przed `finish`, dopisek do steera) tylko dla refa
   z `src/job/task-note.ts`, czyli sprzed R-042. Fikstura działa w trybie testowym (`LIMEN_TEST_MODE=1`). Stan:
   działa; test w tools/test-context-size.mjs. */
import { spawnSync } from "node:child_process";
import { cpSync, existsSync, mkdirSync, mkdtempSync, readdirSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { pathToFileURL } from "node:url";

// `templates/coordinator.md` is the preamble of a group team, titled "# Group team".
export const GROUP_ROLES = ["coordinator"];
// The templates of a ref that are no role's preamble: the manual (`agents.md`, from R-040 on `manual.md`), the frame,
// the register or, from R-040 on, the cue sections, the project copies' sources, a group member's packet, and the
// Linear mirror of `rebuild-base`. The registers of R-040 lie in `templates/registers/`, which `rolesOf` never lists.
const NOT_ROLES = new Set(["agents", "manual", "capability", "communication", "styleguide", "group-member", "linear"]);
// The module that builds a role's context message, from R-039 on; an older ref has none.
const CONTEXT_MODULE = "src/runtime/context-message.ts";
// The task note's module, up to R-042, which cut it; a later ref has none.
const NOTE_MODULE = "src/job/task-note.ts";
const JOB_ID = "2026-01-01-size-probe-00000000";
const TICKET = "spec/features/active/F001-probe/ticket.md";
// Project files the hooks read; copied from --project into the fixture, never written back.
const PROJECT_FILES = ["AGENTS.md", ".agents/limen", "spec/vision.md", "spec/build.md", ".limen/planning-source"];
const JOB_ENV = ["LIMEN_JOB", "LIMEN_JOB_ID", "LIMEN_CONTEXT_ROOT"];

function run(command, args, options) {
	const result = spawnSync(command, args, { maxBuffer: 1 << 30, ...options });
	if (result.status !== 0) {
		throw new Error(`${command} ${args.join(" ")} failed: ${result.stderr}`);
	}
	return result.stdout;
}

/** The code paths a role's context depends on, extracted from `ref` into `dir/pkg`. */
function extract(ref, dir) {
	const pkg = join(dir, "pkg");
	mkdirSync(pkg);
	const tar = run("git", ["archive", "--format=tar", ref, "--", "bin", "src", "hook", "templates", "package.json"]);
	run("tar", ["-x", "-C", pkg], { input: tar });
	return pkg;
}

/** The job roles the ref's templates hold, sorted, a group team's last: every `templates/<role>.md` but `NOT_ROLES`. */
function rolesOf(pkg) {
	const names = readdirSync(join(pkg, "templates"))
		.filter((name) => name.endsWith(".md"))
		.map((name) => name.slice(0, -".md".length))
		.filter((name) => !NOT_ROLES.has(name));
	const jobs = names.filter((name) => !GROUP_ROLES.includes(name)).sort();
	return [...jobs, ...GROUP_ROLES.filter((name) => names.includes(name))];
}

/**
 * A folder with a stub `pi`: since R-020 `limen init` refuses a host without `pi` on PATH, and the fixture runs no
 * job, so the stub only answers that it is there.
 */
function stubPi(dir) {
	const bin = join(dir, "bin");
	mkdirSync(bin);
	writeFileSync(join(bin, "pi"), "#!/bin/sh\necho 1.5.1\n", { mode: 0o755 });
	return bin;
}

/** A fresh project made by the ref's own `limen init`, overlaid with copies of a real project's guidance files. */
function fixture(pkg, dir, project) {
	const root = join(dir, "project");
	const home = join(dir, "home");
	mkdirSync(root);
	mkdirSync(home);
	run("git", ["init", "-q"], { cwd: root });
	// Test mode, in which alone Limen reads LIMEN_HOME and LIMEN_HERDR (R-087); an older ref reads them without it.
	const env = {
		...process.env,
		PATH: `${stubPi(dir)}:${process.env.PATH ?? ""}`,
		HOME: home,
		HERDR_ENV: "",
		LIMEN_TEST_MODE: "1",
		LIMEN_HOME: home,
		LIMEN_HERDR: "0",
		LIMEN_PACKAGE: pkg,
	};
	run(process.execPath, [join(pkg, "bin/limen"), "init"], { cwd: root, env });
	for (const path of project ? PROJECT_FILES : []) {
		if (existsSync(join(project, path))) {
			cpSync(join(project, path), join(root, path), { recursive: true, force: true });
		}
	}
	const jobDir = join(root, ".limen/jobs", JOB_ID);
	mkdirSync(jobDir, { recursive: true });
	writeFileSync(join(jobDir, "task.md"), `Implement the ticket.\n\nTicket: ${TICKET}\n`);
	return { root, home, jobDir };
}

function setEnv(values) {
	for (const [name, value] of Object.entries(values)) {
		if (value === undefined) {
			delete process.env[name];
		} else {
			process.env[name] = value;
		}
	}
}

/** Installs a hook against a stub engine API and returns its handlers and registered tools. */
async function install(pkg, hook) {
	const handlers = new Map();
	const tools = [];
	const api = {
		on: (event, handler) => handlers.set(event, handler),
		registerTool: (tool) => tools.push(tool),
		sendMessage: () => undefined,
		sendUserMessage: () => undefined,
		appendEntry: () => undefined,
	};
	const module = await import(pathToFileURL(join(pkg, "hook", hook)).href);
	await module.default(api);
	return { handlers, tools };
}

/**
 * One session of the communication hook: the first prompt and a second ordinary prompt. The difference between the
 * two cues is what enters once per session (the job's note start, up to R-042); `system` is the system prompt the
 * first returned, which a ref from R-039 on never returns.
 */
async function session(pkg, root, prompt) {
	const { handlers } = await install(pkg, "communication.ts");
	const start = handlers.get("before_agent_start");
	const first = (await start({ prompt, systemPrompt: "" }, { cwd: root })) ?? {};
	const second = (await start({ prompt, systemPrompt: "" }, { cwd: root })) ?? {};
	const firstCue = first.message?.content ?? "";
	const cue = second.message?.content ?? "";
	return {
		system: first.systemPrompt ?? "",
		cue,
		once: firstCue.length > cue.length ? firstCue.slice(cue.length) : "",
	};
}

/**
 * The Limen block or a context message split at its `## Label (path)` headings; text before the first is
 * "(unlabelled)".
 */
export function sections(system) {
	return system
		.split(/\n\n(?=## )/)
		.filter(Boolean)
		.map((part) => ({ label: part.startsWith("## ") ? part.split("\n")[0].slice(3) : "(unlabelled)", text: part }));
}

async function finishTool(pkg) {
	const { tools } = await install(pkg, "finish.ts");
	return tools.map(({ name, description, parameters }) => JSON.stringify({ name, description, parameters })).join("");
}

/**
 * The job's task-note texts of one event each, the check before the finish and the steer's appendix, for a ref that
 * has the module; undefined for a ref from R-042 on, which cut it.
 */
async function noteEvents(pkg, jobDir) {
	if (!existsSync(join(pkg, NOTE_MODULE))) {
		return undefined;
	}
	const notes = await import(pathToFileURL(join(pkg, NOTE_MODULE)).href);
	return {
		noteCheck: typeof notes.noteCheck === "function" ? notes.noteCheck(jobDir, false) : undefined,
		noteSteer: typeof notes.noteSteer === "function" ? notes.noteSteer(jobDir) : undefined,
	};
}

function preamble(pkg, root, role) {
	for (const path of [join(root, ".agents/limen", `${role}.md`), join(pkg, "templates", `${role}.md`)]) {
		if (existsSync(path)) {
			return readFileSync(path, "utf8");
		}
	}
	return undefined;
}

/**
 * The context message of the coordinator and of each role, from the ref's own module, each job role's preamble chosen
 * as its spawn chooses it (`resolvePreamble`).
 */
async function contextMessages(pkg, root, roles) {
	const { contextMessage } = await import(pathToFileURL(join(pkg, CONTEXT_MODULE)).href);
	const { resolvePreamble } = await import(pathToFileURL(join(pkg, "src/job/spawning.ts")).href);
	const messages = { coordinator: contextMessage(root, { session: "coordinator" }) };
	for (const role of roles) {
		messages[`job ${role}`] = contextMessage(root, { session: "job", role, preamble: resolvePreamble(root, role) });
	}
	return messages;
}

/**
 * Measures every role at `ref`; `project` optionally points at a real project to copy guidance files from. The form
 * is `message` for a ref with the context message module and `system` for an older one.
 */
export async function measureRoles(ref, project) {
	const dir = mkdtempSync(join(tmpdir(), "limen-size-"));
	try {
		const pkg = extract(ref, dir);
		const roles = rolesOf(pkg);
		const { root, home, jobDir } = fixture(pkg, dir, project);
		const base = { HOME: home, LIMEN_TEST_MODE: "1", LIMEN_HOME: home, LIMEN_HERDR: "0", LIMEN_PACKAGE: pkg };
		setEnv({ ...base, ...Object.fromEntries(JOB_ENV.map((name) => [name, undefined])) });
		const form = existsSync(join(pkg, CONTEXT_MODULE)) ? "message" : "system";
		const messages = form === "message" ? await contextMessages(pkg, root, roles) : undefined;
		const coordinator = await session(pkg, root, "Hello.");
		const wake = await session(pkg, root, 'Limen job "probe" finished.');
		setEnv({ LIMEN_JOB: "1", LIMEN_JOB_ID: JOB_ID, LIMEN_CONTEXT_ROOT: root });
		const job = await session(pkg, root, "Implement the ticket.");
		const tool = await finishTool(pkg);
		const events = await noteEvents(pkg, jobDir);
		const preambles = Object.fromEntries(roles.map((role) => [role, preamble(pkg, root, role)]));
		const search = spawnSync("jg", ["--help"]).status === 0;
		return { form, roles, messages, coordinator, wake, job, tool, events, preambles, search };
	} finally {
		setEnv({ ...Object.fromEntries(JOB_ENV.map((name) => [name, undefined])) });
		rmSync(dir, { recursive: true, force: true });
	}
}
