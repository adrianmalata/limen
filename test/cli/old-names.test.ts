// The table of old command names: a command a cut removed refuses with one line that names what replaced it.
import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { readdirSync, readFileSync } from "node:fs";
import { join, relative } from "node:path";
import { test } from "node:test";
import { limen, plant } from "../plant.ts";

const REFUSAL = "limen webhook was removed with finish webhooks (R-002); the coordinator gets a wake when a job ends";

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

test("every old name has a feature, a ticket and a pointer, and src/main.ts registers none of them", async () => {
	// Imported here, so the CLI test above fails at its own assertion before the table exists.
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
