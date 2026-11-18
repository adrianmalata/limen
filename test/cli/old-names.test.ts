// The table of old names: a removed command or engine value refuses with one line that names its replacement.
import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { readdirSync, readFileSync, writeFileSync } from "node:fs";
import { join, relative } from "node:path";
import { test } from "node:test";
import { limen, plant } from "../plant.ts";

const REFUSAL = "limen webhook was removed with finish webhooks (R-002); the coordinator gets a wake when a job ends";
const LINEAR_REFUSAL =
	"limen linear was removed with the Linear mirror (R-003); spec/features/ is the only record of ticket state";
// Each removed engine value with its refusal, written out so that a change of wording fails here.
const ENGINE_REFUSALS = {
	devin: "engine devin was removed with Devin cloud jobs (R-003); use --engine pi",
	omp: "engine omp was removed with the OMP engine (R-004); use --engine pi",
};

/** Every path under `dir` with a digest of its content, so a write, a new path or a removal shows as a difference. */
function snapshot(dir: string): Record<string, string> {
	const found: Record<string, string> = {};
	for (const entry of readdirSync(dir, { recursive: true, withFileTypes: true })) {
		const path = join(entry.parentPath, entry.name);
		found[relative(dir, path)] = entry.isFile()
			? createHash("sha256").update(readFileSync(path)).digest("hex")
			: entry.isDirectory()
				? "directory"
				: "other";
	}
	return found;
}

test("limen webhook test and limen webhook deliver refuse with one removal line and leave .limen/ unchanged", async (t) => {
	const p = await plant();
	t.after(() => p.cleanup());
	const before = snapshot(join(p.root, ".limen"));
	// An old hook or supervisor still runs `limen webhook deliver <receipt folder>`; the folder need not exist.
	for (const args of [
		["webhook", "test"],
		["webhook", "deliver", join(p.parent, "receipt")],
	]) {
		const run = limen(p, args);
		assert.notEqual(run.status, 0, args.join(" "));
		assert.equal(run.stderr, `${REFUSAL}\n`, args.join(" "));
	}
	assert.deepEqual(snapshot(join(p.root, ".limen")), before);
});

test("limen linear status and limen linear off refuse with one removal line and leave .limen/ and spec/ unchanged", async (t) => {
	const p = await plant();
	t.after(() => p.cleanup());
	// A project that still has its mirror config: the removed `off` renamed it to spec/linear.md.off.
	writeFileSync(join(p.root, "spec/linear.md"), "# Linear mirror\nTeam: T\nProject: P\n");
	const before = [snapshot(join(p.root, ".limen")), snapshot(join(p.root, "spec"))];
	for (const args of [
		["linear", "status"],
		["linear", "off"],
	]) {
		const run = limen(p, args);
		assert.notEqual(run.status, 0, args.join(" "));
		assert.equal(run.stderr, `${LINEAR_REFUSAL}\n`, args.join(" "));
	}
	assert.deepEqual([snapshot(join(p.root, ".limen")), snapshot(join(p.root, "spec"))], before);
});

test("spawn with a removed engine in --engine or in LIMEN_ENGINE refuses with one removal line and makes no job", async (t) => {
	const p = await plant();
	t.after(() => p.cleanup());
	const before = snapshot(join(p.root, ".limen"));
	for (const [engine, refusal] of Object.entries(ENGINE_REFUSALS)) {
		for (const [args, env] of [
			[["spawn", "--engine", engine, "work"], {}],
			[["spawn", "work"], { LIMEN_ENGINE: engine }],
		] as const) {
			const run = limen(p, args, { env });
			assert.notEqual(run.status, 0, args.join(" "));
			assert.equal(run.stderr, `${refusal}\n`, args.join(" "));
		}
	}
	assert.deepEqual(snapshot(join(p.root, ".limen")), before);
});

test("every old name has a feature, a ticket and a pointer, and src/main.ts registers none of them", async () => {
	// Imported here, so the CLI tests above fail at their own assertions before the table exists.
	const { OLD_NAMES } = await import("../../src/old-names.ts");
	const { COMMAND_NAMES } = await import("../../src/main.ts");
	for (const entry of OLD_NAMES) {
		const empty = Object.entries({ feature: entry.feature, ticket: entry.ticket, instead: entry.instead })
			.filter(([, value]) => value.trim() === "")
			.map(([field]) => field);
		assert.deepEqual(empty, [], `old name ${entry.name}`);
	}
	assert.deepEqual(
		OLD_NAMES.filter((entry) => COMMAND_NAMES.includes(entry.name)).map((entry) => entry.name),
		[],
	);
});

test("every old engine has a feature, a ticket and a pointer, and engineProfile refuses each with its line", async () => {
	const { OLD_ENGINES, removedEngine } = await import("../../src/old-names.ts");
	const { engineProfile } = await import("../../src/runtime/engine.ts");
	for (const entry of OLD_ENGINES) {
		const empty = Object.entries({ feature: entry.feature, ticket: entry.ticket, instead: entry.instead })
			.filter(([, value]) => value.trim() === "")
			.map(([field]) => field);
		assert.deepEqual(empty, [], `old engine ${entry.name}`);
		assert.throws(() => engineProfile(entry.name), { message: removedEngine(entry.name) }, entry.name);
	}
});
