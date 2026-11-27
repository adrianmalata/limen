// src/runtime/context-message.ts: each role's exact message against its reference file, its marker, the registers of
// its audience, the package as the only source of Limen's texts, the project's AGENTS.md only with an isolated bridge,
// what it never holds, its line bound, that it is built from files alone (T-36), and the module parts it holds only for
// the modules switched on (G1.10, A-040).
import assert from "node:assert/strict";
import { existsSync, readdirSync } from "node:fs";
import { copyFile, cp, mkdir, mkdtemp, readFile, rename, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import test, { type TestContext } from "node:test";
import { fileURLToPath } from "node:url";
import { resolvePreamble } from "../../src/job/spawning.ts";
import { type ContextAudience, contextMessage } from "../../src/runtime/context-message.ts";
import { withEnvironment } from "../environment.ts";

const PACKAGE = fileURLToPath(new URL("../..", import.meta.url));
/** The reference files, one per role: a later ticket that changes a part's text changes its reference too (A-051). */
const REFERENCES = fileURLToPath(new URL("./context-message", import.meta.url));
/** The project files that `limen init` writes from the package and that a message reads (src/project/setup.ts). */
const INIT_COPIES = [
	["templates/styleguide.md", ".agents/limen/styleguide.md"],
	["templates/spec/vision.md", "spec/vision.md"],
	["templates/spec/build.md", "spec/build.md"],
] as const;
/**
 * Each role with its name and its reference file: the owner-facing coordinator, which is no job, then each job role by
 * the role its record names, a group team's (`coordinator`, `templates/coordinator.md`) last.
 */
const ROLES = [
	{ name: "owner-facing coordinator", reference: "owner-facing-coordinator.md", role: undefined },
	{ name: "worker", reference: "worker.md", role: "worker" },
	{ name: "reviewer", reference: "reviewer.md", role: "reviewer" },
	{ name: "judge", reference: "judge.md", role: "judge" },
	{ name: "keeper", reference: "keeper.md", role: "keeper" },
	{ name: "researcher", reference: "researcher.md", role: "researcher" },
	{ name: "quality", reference: "quality.md", role: "quality" },
	{ name: "group team", reference: "group-team.md", role: "coordinator" },
] as const;

/** A project in a new folder as `limen init` leaves it, with no file of its own beside them; removed after `t`. */
async function initProject(t: TestContext): Promise<string> {
	const root = await mkdtemp(join(tmpdir(), "limen-context-message-"));
	t.after(() => rm(root, { recursive: true, force: true }));
	for (const [source, target] of INIT_COPIES) {
		await mkdir(dirname(join(root, target)), { recursive: true });
		await copyFile(join(PACKAGE, source), join(root, target));
	}
	return root;
}

/**
 * The audience of `role` in `root`: the owner-facing coordinator for none, else the job with its resolved preamble,
 * whose bridge runs isolated only with `bridgeIsolated`, as no job's does until R-048.
 */
function audience(root: string, role: string | undefined, bridgeIsolated = false): ContextAudience {
	return role === undefined
		? { session: "coordinator" }
		: { session: "job", role, preamble: resolvePreamble(root, role), bridgeIsolated };
}

/** The message of every role in `root`, in the order of `ROLES`. */
function everyMessage(root: string): string[] {
	return ROLES.map(({ role }) => contextMessage(root, audience(root, role)));
}

/** Writes `text` at `path` under `root`, with the folders it needs. */
async function plantFile(root: string, path: string, text: string): Promise<void> {
	await mkdir(dirname(join(root, path)), { recursive: true });
	await writeFile(join(root, path), text);
}

for (const { name, reference, role } of ROLES) {
	// A missing reference is written from the module's output and the test fails, so a new or regenerated reference is
	// read before it is committed: delete a reference and run this file to write it again.
	test(`A-051: the context message of the ${name} for a project as limen init leaves it is its reference file, ${reference}`, async (t) => {
		const root = await initProject(t);
		const message = contextMessage(root, audience(root, role));
		const path = join(REFERENCES, reference);
		if (!existsSync(path)) {
			await mkdir(REFERENCES, { recursive: true });
			await writeFile(path, message);
			assert.fail(`wrote the missing reference ${path}; read it, then run the test again`);
		}
		assert.equal(message, await readFile(path, "utf8"));
	});
}

/** Each module file of the package, `templates/modules/<module>/<part file>`, by its path in the package. */
function moduleFiles(): string[] {
	const folder = join(PACKAGE, "templates/modules");
	return readdirSync(folder).flatMap((module) =>
		readdirSync(join(folder, module)).map((file) => `templates/modules/${module}/${file}`),
	);
}

/** The part of the package file `path` with its heading `label`, as the message holds it (src/runtime/context-message.ts). */
async function packagePart(path: string, label: string): Promise<string> {
	return `## ${label} (limen/${path})\n${(await readFile(join(PACKAGE, path), "utf8")).trim()}`;
}

// G1.10, A-038: a module that is off contributes no text, so no message of a project as limen init leaves it holds one.
test("G1.10: with every module off no role's message holds a module part or the text of a module file", async (t) => {
	const root = await initProject(t);
	const texts = await Promise.all(
		moduleFiles().map(async (path) => (await readFile(join(PACKAGE, path), "utf8")).trim()),
	);
	assert.ok(texts.length >= 6, `${texts.length} module files`);
	const found = everyMessage(root).flatMap((message, index) => [
		...(message.includes(" module (limen/templates/modules/") ? [`${ROLES[index]?.reference}: a module part`] : []),
		...texts.flatMap((text, file) =>
			message.includes(text) ? [`${ROLES[index]?.reference}: ${moduleFiles()[file]}`] : [],
		),
	]);
	assert.deepEqual(found, []);
});

// A-040: an enabled module's text is always on, as its own part right after the part it adds to, in the module order.
test("A-040: with the picture module on, the worker's, keeper's, group team's and coordinator's messages hold their picture file right after its part", async (t) => {
	const root = await initProject(t);
	await plantFile(root, ".agents/limen/limits.json", '{ "modules": { "picture": true } }\n');
	const pairs: ReadonlyArray<readonly [string | undefined, string, string, string]> = [
		["worker", "templates/worker.md", "Role", "templates/modules/picture/worker.md"],
		["keeper", "templates/keeper.md", "Role", "templates/modules/picture/keeper.md"],
		["coordinator", "templates/coordinator.md", "Role", "templates/modules/picture/coordinator.md"],
		[undefined, "templates/manual.md", "Coordinator manual", "templates/modules/picture/manual.md"],
		[undefined, "templates/registers/specs.md", "Specs register", "templates/modules/picture/specs.md"],
	];
	const missing: string[] = [];
	for (const [role, part, label, module] of pairs) {
		const expected = `${await packagePart(part, label)}\n\n${await packagePart(module, "Picture module")}\n\n`;
		if (!contextMessage(root, audience(root, role)).includes(expected)) {
			missing.push(`${role ?? "owner-facing coordinator"}: ${module} after ${part}`);
		}
	}
	assert.deepEqual(missing, []);
});

// A-051: the whole message of one role with a module on, so a change of a module part's place or heading fails here.
test("A-051: the worker's context message with the picture module on is its reference file, worker-picture.md", async (t) => {
	const root = await initProject(t);
	await plantFile(root, ".agents/limen/limits.json", '{ "modules": { "picture": true } }\n');
	const message = contextMessage(root, audience(root, "worker"));
	const path = join(REFERENCES, "worker-picture.md");
	if (!existsSync(path)) {
		await writeFile(path, message);
		assert.fail(`wrote the missing reference ${path}; read it, then run the test again`);
	}
	assert.equal(message, await readFile(path, "utf8"));
});

// E-14: until the seat shows how Claude Code takes a leading slash, the message never starts with one.
test("D-114 (3): every message opens with the marker that names its role and ends with the closing tag, so none starts with a slash", async (t) => {
	const root = await initProject(t);
	const marks = everyMessage(root).map((message) => [
		message.split("\n", 1)[0],
		message.endsWith("\n\n</limen-context>"),
		message.startsWith("/"),
	]);
	assert.deepEqual(
		marks,
		ROLES.map(({ role }) => [`<limen-context role="${role ?? "owner-facing coordinator"}">`, true, false]),
	);
});

// A-037: the board changes at every land, so a message that held it would change within a session.
test("A-037: the coordinator's message holds no board digest: the board's NOW and NEXT stay out of it", async (t) => {
	const root = await initProject(t);
	await writeFile(join(root, "spec/build.md"), "# Build\n\n## NOW\n\n- now-marker\n\n## NEXT\n\n- next-marker\n");
	const message = contextMessage(root, { session: "coordinator" });
	assert.deepEqual([message.includes("now-marker"), message.includes("next-marker")], [false, false]);
});

/** The heading of each register's part, by the register's name (A-038). */
const REGISTER_HEADINGS = {
	agent: "\n\n## Agent register (limen/templates/registers/agent.md)\n",
	specs: "\n\n## Specs register (limen/templates/registers/specs.md)\n",
	owner: "\n\n## Owner register (limen/templates/registers/owner.md)\n",
} as const;
/** The registers of the roles that get more than the agent register, by their name in `ROLES` (A-038). */
const WIDER_REGISTERS: Readonly<Record<string, readonly string[]>> = {
	"owner-facing coordinator": ["agent", "specs", "owner"],
	keeper: ["agent", "specs"],
};

test("A-038: the coordinator's message holds the owner, agent and specs registers, the keeper's agent and specs, every other role's the agent register alone", async (t) => {
	const root = await initProject(t);
	const held = everyMessage(root).map((message, index) => [
		ROLES[index]?.name,
		Object.entries(REGISTER_HEADINGS).flatMap(([name, heading]) => (message.includes(heading) ? [name] : [])),
	]);
	assert.deepEqual(
		held,
		ROLES.map(({ name }) => [name, WIDER_REGISTERS[name] ?? ["agent"]]),
	);
});

/** The first line of the owner register: the reply's language and when to switch to the agent register (D-134 (4)). */
const LANGUAGE_RULE =
	"Use the register the audience line names, and answer in the language of the owner's last message. Switch to plain technical English only for text another agent will execute or a file will keep (a ticket, a job task, a steer, a commit), because agents read it and the records keep one language.";

// T-13: the owner register, not a setting or the cue, carries the rule to answer in the owner's language.
test("T-13: the coordinator's owner register opens with the rule to answer in the language of the owner's last message", async (t) => {
	const root = await initProject(t);
	const message = contextMessage(root, { session: "coordinator" });
	assert.equal(message.includes(`${REGISTER_HEADINGS.owner}${LANGUAGE_RULE}\n`), true);
});

/** A job's line that points at the project's vision, which the turn cue carried before (D-134 (3)). */
const VISION_LINE = "Vision (read-only): `spec/vision.md` — durable intent. Load it before choosing or starting work.";

// D-134 (3): the line rides the job's frozen message instead of every turn, in the coordinator's vision part's place.
test("D-134: a worker's message holds the vision line once, between the agent register and the styleguide, only while the project holds spec/vision.md", async (t) => {
	const root = await initProject(t);
	const agent = (await readFile(join(PACKAGE, "templates/registers/agent.md"), "utf8")).trim();
	const held = contextMessage(root, audience(root, "worker"));
	await rm(join(root, "spec/vision.md"));
	const none = contextMessage(root, audience(root, "worker"));
	assert.deepEqual(
		[
			held.split(VISION_LINE).length - 1,
			held.includes(`${agent}\n\n${VISION_LINE}\n\n## Styleguide (.agents/limen/styleguide.md)\n`),
			none.includes(VISION_LINE),
		],
		[1, true, false],
	);
});

/** The plain-English paragraph that the cue's shared section carried on every turn (D-134 (5)). */
const ASD_STE100 =
	"Write in plain technical English (about 80% of ASD-STE100). Short sentences. One idea each. Active voice. Simple exact words. One word for one thing. No slang, idioms, or filler.";

test("D-134: every role's message holds the ASD-STE100 paragraph first under the agent register's ## Agent", async (t) => {
	const root = await initProject(t);
	const missing = everyMessage(root).flatMap((message, index) =>
		message.includes(`\n## Agent\n\n${ASD_STE100}\n\n`) ? [] : [ROLES[index]?.name],
	);
	assert.deepEqual(missing, []);
});

// A-039: the register override is cut; the coordinator keeps the owner's language through the conversation itself.
test("A-039: a project's .agents/limen/communication.md changes no role's message", async (t) => {
	const root = await initProject(t);
	const plain = everyMessage(root);
	await plantFile(root, ".agents/limen/communication.md", "# Communication\n\nproject-register-marker\n");
	assert.deepEqual(everyMessage(root), plain);
});

// A-042: role prompts always come from the package, so a project file of a role's name replaces no preamble.
test("A-042: a project's .agents/limen/worker.md changes no role's message, the worker's included", async (t) => {
	const root = await initProject(t);
	const plain = everyMessage(root);
	await plantFile(root, ".agents/limen/worker.md", "# The project's own worker role\n");
	assert.deepEqual(everyMessage(root), plain);
});

// A-042, D-005: AGENTS.md is project context beside Limen's text, and the bridge forwards it while it runs unisolated.
test("A-042: a project's AGENTS.md changes no role's message while no job's bridge runs isolated", async (t) => {
	const root = await initProject(t);
	const plain = everyMessage(root);
	await plantFile(root, "AGENTS.md", "# Project rules\n\nproject-agents-marker\n");
	assert.deepEqual(everyMessage(root), plain);
});

// E-15: an isolated bridge forwards no AGENTS* file, so the message carries the project's, last, as a varying part.
test("D-005: a job whose bridge runs isolated gets the project's AGENTS.md as the last part of its message, headed like the vision", async (t) => {
	const root = await initProject(t);
	await plantFile(root, "AGENTS.md", "# Project rules\n\nproject-agents-marker\n");
	const message = contextMessage(root, audience(root, "worker", true));
	assert.equal(
		message.slice(message.lastIndexOf("\n\n## ")),
		"\n\n## Project context (AGENTS.md)\n# Project rules\n\nproject-agents-marker\n\n</limen-context>",
	);
});

// A-038: the notes for the package's maintainers moved into CONTRIBUTING.md; a model has no use for them.
test("A-038: no message holds a maintainer note of the package's speech texts", async (t) => {
	const root = await initProject(t);
	const notes = ["Package default speech registers", "## Turn cue convention", "The hook selects the bodies"];
	const found = everyMessage(root).flatMap((message, index) =>
		notes.filter((note) => message.includes(note)).map((note) => `${ROLES[index]?.reference}: ${note}`),
	);
	assert.deepEqual(found, []);
});

/** The package texts a coordinator's message reads, each of which a broken install can lack. */
const PACKAGE_TEXTS = [
	"templates/capability.md",
	"templates/manual.md",
	"templates/registers/agent.md",
	"templates/registers/specs.md",
	"templates/registers/owner.md",
];

// A missing package text is a broken install, which a silent gap in the message would hide.
test("T-01: a coordinator's message throws when the package lacks any text it holds, instead of leaving the part out", async (t) => {
	const root = await initProject(t);
	const pkg = await mkdtemp(join(tmpdir(), "limen-context-package-"));
	t.after(() => rm(pkg, { recursive: true, force: true }));
	await cp(join(PACKAGE, "templates"), join(pkg, "templates"), { recursive: true });
	withEnvironment(t, { LIMEN_PACKAGE: pkg });
	for (const path of PACKAGE_TEXTS) {
		await rename(join(pkg, path), join(pkg, `${path}.gone`));
		assert.throws(() => contextMessage(root, { session: "coordinator" }), { code: "ENOENT" }, path);
		await rename(join(pkg, `${path}.gone`), join(pkg, path));
	}
});

// z. 3: the message is the session's stable prefix, so nothing in it may vary by host, folder or time.
test("no message holds the project's or the package's absolute path, a date or a job id", async (t) => {
	const root = await initProject(t);
	const found = everyMessage(root).flatMap((message, index) =>
		[root, PACKAGE.replace(/\/$/, ""), /\d{4}-\d{2}-\d{2}/]
			.filter((pattern) => (typeof pattern === "string" ? message.includes(pattern) : pattern.test(message)))
			.map((pattern) => `${ROLES[index]?.reference}: ${String(pattern)}`),
	);
	assert.deepEqual(found, []);
});

// T-10: until R-046 sets a budget per role, each part keeps the 1,000-line bound, and the cut is never silent.
test("T-10: a part over 1,000 lines is cut to 1,000 with a notice that names the file and its length", async (t) => {
	const root = await initProject(t);
	const lines = Array.from({ length: 1001 }, (_, index) => `line ${index + 1}`);
	await writeFile(join(root, "spec/vision.md"), `${lines.join("\n")}\n`);
	const message = contextMessage(root, { session: "coordinator" });
	const vision = message.slice(message.indexOf("## Vision (spec/vision.md)\n"));
	assert.deepEqual(
		[
			vision.includes("\nline 1000\n"),
			vision.includes("line 1001"),
			vision.includes("[spec/vision.md truncated to 1000 of 1001 lines; read the file for remaining context.]"),
		],
		[true, false, true],
	);
});

/** A folder that holds a `jg` which writes the marker file `ran` each time it runs and exits 0, as Jevgrep's does. */
async function jgFolder(t: TestContext): Promise<{ readonly bin: string; readonly ran: string }> {
	const dir = await mkdtemp(join(tmpdir(), "limen-context-jg-"));
	t.after(() => rm(dir, { recursive: true, force: true }));
	const ran = join(dir, "ran");
	await mkdir(join(dir, "bin"));
	await writeFile(join(dir, "bin", "jg"), `#!/bin/sh\n: > ${JSON.stringify(ran)}\necho "Jevgrep"\n`, { mode: 0o755 });
	return { bin: join(dir, "bin"), ran };
}

// T-36: a tool a prompt recommends comes from a declaration, so a jg found on PATH changes no byte of a message.
test("T-36: every message is the same bytes with and without a jg on PATH, and building it never runs that jg", async (t) => {
	const root = await initProject(t);
	const { bin, ran } = await jgFolder(t);
	const plain = everyMessage(root);
	withEnvironment(t, { PATH: `${bin}:${process.env.PATH ?? ""}` });
	assert.deepEqual([everyMessage(root), existsSync(ran)], [plain, false]);
});

// T-36: hooks start no process while the context message is built; the module that builds it cannot start one.
test("T-36: the module that builds the message imports no process module", async () => {
	const source = await readFile(join(PACKAGE, "src/runtime/context-message.ts"), "utf8");
	const imports = [...source.matchAll(/^import .* from "([^"]+)";$/gm)].map((match) => match[1]);
	assert.deepEqual(
		imports.filter((name) => name === "node:child_process" || name === "child_process"),
		[],
	);
});
