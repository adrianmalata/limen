/* PL: Moduł pomiaru kontekstu ról Limena, używany przez context-size.mjs. Rozpakowuje drzewo danego refa do katalogu
   tymczasowego, tworzy fiksturę projektu prawdziwym `limen init` (opcjonalnie z plikami prawdziwego projektu,
   kopiowanymi tylko do odczytu) i wywołuje hooki `communication` oraz `finish` z atrapą API silnika, tak jak robi to
   test/fake-engine.mjs. Zwraca bajty promptu systemowego, ukrytego cue na prompt i dodatków raz na sesję. Fikstura
   działa w trybie testowym (`LIMEN_TEST_MODE=1` obok `LIMEN_HOME` i `LIMEN_HERDR`), bo od R-087 tylko w nim Limen
   czyta pokrętła testowe. Stan: działa. */
import { spawnSync } from "node:child_process";
import { cpSync, existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { pathToFileURL } from "node:url";

export const JOB_ROLES = ["worker", "reviewer", "judge", "keeper", "scout", "researcher", "quality", "picture"];
// `templates/coordinator.md` is the preamble of a group team, titled "# Group team".
export const GROUP_ROLES = ["coordinator"];
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
		HOME: home,
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
 * two cues is what enters once per session (the job's note start).
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

/** The Limen block split at its `## Label (path)` headings; text before the first heading is "(unlabelled)". */
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

async function noteEvents(pkg, jobDir) {
	const notes = await import(pathToFileURL(join(pkg, "src/job/task-note.ts")).href);
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

/** Measures every role at `ref`; `project` optionally points at a real project to copy guidance files from. */
export async function measureRoles(ref, project) {
	const dir = mkdtempSync(join(tmpdir(), "limen-size-"));
	try {
		const pkg = extract(ref, dir);
		const { root, home, jobDir } = fixture(pkg, dir, project);
		const base = { HOME: home, LIMEN_TEST_MODE: "1", LIMEN_HOME: home, LIMEN_HERDR: "0", LIMEN_PACKAGE: pkg };
		setEnv({ ...base, ...Object.fromEntries(JOB_ENV.map((name) => [name, undefined])) });
		const coordinator = await session(pkg, root, "Hello.");
		const wake = await session(pkg, root, 'Limen job "probe" finished.');
		setEnv({ LIMEN_JOB: "1", LIMEN_JOB_ID: JOB_ID, LIMEN_CONTEXT_ROOT: root });
		const job = await session(pkg, root, "Implement the ticket.");
		const tool = await finishTool(pkg);
		const events = await noteEvents(pkg, jobDir);
		const preambles = Object.fromEntries(
			[...JOB_ROLES, ...GROUP_ROLES].map((role) => [role, preamble(pkg, root, role)]),
		);
		const search = spawnSync("jg", ["--help"]).status === 0;
		return { coordinator, wake, job, tool, events, preambles, search };
	} finally {
		setEnv({ ...Object.fromEntries(JOB_ENV.map((name) => [name, undefined])) });
		rmSync(dir, { recursive: true, force: true });
	}
}
