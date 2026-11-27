// S4 · Steering and context injection. A running worker gets each steer once, in order, and an ended one refuses a
// late steer; the model gets the project's guidance once, in the session's context message and never in the system
// prompt, also after a second `limen init` over old hook copies, and the package's register, never the project's;
// `limen continue` resumes the old session with the parent's extensions or a replacement.
import assert from "node:assert/strict";
import { spawn } from "node:child_process";
import { existsSync, mkdirSync, readdirSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { after, before, test } from "node:test";
import { fileURLToPath } from "node:url";
import {
	engineEvents,
	engineViews,
	git,
	jobDir,
	jobFile,
	jobRecord,
	limen,
	type Plant,
	plant,
	release,
	spawnJob,
	startedJob,
	until,
	waitJob,
} from "./plant.ts";

const PACKAGE = fileURLToPath(new URL("..", import.meta.url));
const FLAGS = ["--engine", "pi", "--detached"];
// One marker per project guidance source; the package capability frame and its cue are read from their own file.
const STYLE = "style-marker-s4";
// A project register, which every Limen text coming from the package leaves unread (A-039).
const REGISTER = "register-marker-s4";
const VISION = "vision-marker-s4";
const BOARD = "board-body-marker-s4";
const [, FRAME = "", CUE = ""] = readFileSync(`${PACKAGE}templates/capability.md`, "utf8").split(/\s*## \w+\s*|\s+$/);
// A sentence of the package's agent register (`templates/registers/agent.md`, `## Shared`), which every role gets.
const PACKAGED = "Write like a person. Plain words, specific claims, active voice, varied sentence length.";

let p: Plant;
let parent = "";
// The fake engine's folder of the coordinator session that the first test runs.
let coord = "";
let first = "";
let second = "";
before(async () => {
	p = await plant();
	const files: Record<string, string> = {
		".agents/limen/styleguide.md": `# Styleguide\n\n${STYLE}\n`,
		".agents/limen/communication.md": `# Communication\n\n${REGISTER}\n`,
		"spec/vision.md": `# Vision\n\n${VISION}\n`,
		"spec/build.md": `# Build\n\n## NOW\n\n- ${BOARD}\n`,
		// Copies an old `limen init` planted next to the stub; vanilla Pi loads every .ts in these folders.
		".pi/extensions/limen-communication.ts": `export { default } from ${JSON.stringify(join(PACKAGE, "hook/communication.ts"))};\n`,
	};
	for (const [path, text] of Object.entries(files)) {
		writeFileSync(join(p.root, path), text);
	}
	git(p.root, "add", "-A");
	git(p.root, "commit", "-q", "-m", "project guidance and old hook copies");
	first = join(p.parent, "first.ts");
	second = join(p.parent, "second.ts");
	for (const path of [first, second]) {
		writeFileSync(path, "export default () => {};\n");
	}
});
after(() => p.cleanup());

const count = (text: string, marker: string) => text.split(marker).length - 1;
/** The text of every record of the model's first call in the fake engine's folder `dir`, under the bridge (T-31 (1)). */
const firstView = (dir: string) => (engineViews(dir)[0]?.messages ?? []).flatMap((record) => record.text).join("\n");
const steers = (dir: string) => engineEvents(dir).flatMap((entry) => (entry.event === "steer" ? [entry.text] : []));
const argv = (id: string): string[] => JSON.parse(jobFile(p, id, "fake-argv.json"));
const extensions = (id: string) =>
	argv(id).flatMap((value, index, all) => (value === "--extension" ? [all[index + 1] ?? ""] : []));

// A-086: under the bridge the system prompt reaches no model, so the guidance rides the context message; the board
// digest is out of it until R-110 sends it after a change (A-037).
test("a second init removes old hook copies, so a coordinator's model gets each guidance source once, the package's register and not the project's", async () => {
	const init = limen(p, ["init"]);
	assert.equal(init.status, 0, init.stderr);
	// A coordinator Pi in the project loads every .ts in .pi/extensions; the stub then loads the package hooks.
	coord = join(p.parent, "coord");
	mkdirSync(coord);
	writeFileSync(join(coord, "task.md"), "say hi\n");
	const loaded = readdirSync(join(p.root, ".pi/extensions")).flatMap((name) => [
		"--extension",
		join(p.root, ".pi/extensions", name),
	]);
	const child = spawn(
		join(p.bin, "pi"),
		["--session-dir", join(coord, "session"), ...loaded, `@${join(coord, "task.md")}`],
		{ cwd: p.root, env: { ...p.env, LIMEN_PACKAGE: PACKAGE }, stdio: "ignore" },
	);
	const { promise, resolve } = Promise.withResolvers<number | null>();
	child.once("exit", resolve);
	assert.equal(await promise, 0);
	assert.deepEqual(
		[STYLE, REGISTER, PACKAGED, VISION, BOARD, FRAME].map((marker) => count(firstView(coord), marker)),
		[1, 0, 1, 1, 0, 1],
		"styleguide, project register, package register, vision, board, capability frame",
	);
	assert.deepEqual(readdirSync(join(p.root, ".pi/extensions")), ["limen.ts"]);
});

test("A-086: the system prompt a coordinator's hooks return holds none of the guidance sources", () => {
	const system = readFileSync(join(coord, "fake-system.txt"), "utf8");
	assert.deepEqual(
		[STYLE, REGISTER, VISION, BOARD, FRAME].map((marker) => count(system, marker)),
		[0, 0, 0, 0, 0],
		"styleguide, register, vision, board, capability frame",
	);
});

test("a running worker gets each steer once and in order; an ended one refuses a late steer and writes nothing", async () => {
	parent = spawnJob(p, "block", [...FLAGS, "--extension", first, "--priority", "3"]);
	const dir = jobDir(p, parent);
	await until(dir, () => existsSync(join(dir, "fake-blocked-1")));
	for (const [index, text] of ["one", "two"].entries()) {
		assert.equal(limen(p, ["steer", parent, text]).status, 0);
		// The hook has taken the file: a delivery (right or wrong) arrived, or the inbox emptied without one.
		await until(dir, () => steers(dir).length > index || readdirSync(join(dir, "steer/inbox")).length === 0);
	}
	await release(dir);
	assert.equal(waitJob(p, parent), "done");
	// The engine has exited, so every delivery it will ever get is recorded; each is its inbox text alone, since the
	// appendix that asked to log a change in the task note is cut (A-044).
	assert.deepEqual(steers(dir), ["one", "two"]);
	const before = readdirSync(join(dir, "steer"), { recursive: true }).sort();
	const late = limen(p, ["steer", parent, "late"]);
	assert.equal(late.status, 1);
	assert.deepEqual(readdirSync(join(dir, "steer"), { recursive: true }).sort(), before);
});

test("a worker's first model call carries the package's register, styleguide, frame and cue once, vision and board pointers, and no board body", () => {
	const viewed = firstView(jobDir(p, parent));
	const seen = [STYLE, REGISTER, PACKAGED, FRAME, CUE].map((marker) => count(viewed, marker));
	assert.deepEqual(seen, [1, 0, 1, 1, 1], "styleguide, project register, package register, capability frame and cue");
	assert.ok(viewed.includes("`spec/vision.md`"), "vision pointer");
	assert.ok(viewed.includes("`spec/build.md`"), "board pointer");
	const absent = [VISION, BOARD].map((marker) => count(viewed, marker));
	assert.deepEqual(absent, [0, 0], "a worker reads the vision itself, never gets the board body");
});

test("A-086: the system prompt a worker's hooks return holds none of its guidance sources", () => {
	const system = jobFile(p, parent, "fake-system.txt");
	assert.deepEqual(
		[STYLE, REGISTER, FRAME].map((marker) => count(system, marker)),
		[0, 0, 0],
		"styleguide, register, capability frame",
	);
});

test("continue resumes the parent's session, linked, with its extensions or a replacement", () => {
	const parentRecord = jobRecord(p, parent)?.extensions;
	const transcript = readFileSync(join(jobDir(p, parent), "session/fake.jsonl"), "utf8");
	const continued = (flags: readonly string[]) => {
		const run = limen(p, ["continue", parent, "say next", "--detached", ...flags]);
		const id = startedJob(run);
		assert.equal(waitJob(p, id), "done");
		return id;
	};
	const inherited = continued([]);
	assert.equal(jobRecord(p, inherited)?.parent, parent);
	// The child's first prompt names no task note, which is cut (A-044).
	assert.equal(jobFile(p, inherited, "fake-context.txt").includes("note.md"), false);
	const resumed = readFileSync(join(jobDir(p, inherited), "session/fake.jsonl"), "utf8");
	assert.ok(resumed.startsWith(transcript) && resumed.length > transcript.length, "the child's transcript grows");
	assert.deepEqual(extensions(inherited).slice(-1), [first]);
	const replaced = continued(["--extension", second, "--timeout", "10m", "--priority", "1"]);
	assert.deepEqual(extensions(replaced).slice(-1), [second]);
	assert.equal([parent, inherited, replaced].map((id) => jobRecord(p, id)?.priority).join(), "3,3,1");
	assert.equal(extensions(replaced).includes(first), false);
	assert.deepEqual(jobRecord(p, parent)?.extensions, parentRecord);
});
