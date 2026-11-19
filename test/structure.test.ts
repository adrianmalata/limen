import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { existsSync } from "node:fs";
import { readdir, readFile, writeFile } from "node:fs/promises";
import { basename, join, relative } from "node:path";
import test from "node:test";
import { templateHistoryText } from "../src/project/inherit.ts";

const root = new URL("..", import.meta.url).pathname;

async function filesBelow(dir: string): Promise<string[]> {
	const entries = await readdir(dir, { withFileTypes: true });
	const paths = await Promise.all(
		entries
			.filter((entry) => !["node_modules", ".git", ".pi"].includes(entry.name))
			.map(async (entry) => {
				const path = join(dir, entry.name);
				return entry.isDirectory() ? filesBelow(path) : [path];
			}),
	);
	return paths.flat();
}

test("runtime remains dependency-free and TypeScript basenames stay unambiguous", async () => {
	const pkg = JSON.parse(await readFile(join(root, "package.json"), "utf8")) as {
		dependencies?: Record<string, string>;
	};
	assert.deepEqual(pkg.dependencies, {});
	const names = (await filesBelow(root)).filter((path) => path.endsWith(".ts")).map((path) => basename(path));
	assert.equal(new Set(names).size, names.length, "TypeScript basenames must be unique");
});

/** The files below each folder of the repository root that exists. */
async function filesIn(folders: readonly string[]): Promise<string[]> {
	const present = folders.map((folder) => join(root, folder)).filter((path) => existsSync(path));
	return (await Promise.all(present.map(filesBelow))).flat();
}

test("D-010: no file in seat/ or bin/ is a shell script ending in .sh", async () => {
	const scripts = (await filesIn(["seat", "bin"])).filter((path) => path.endsWith(".sh"));
	assert.deepEqual(scripts, [], `shell scripts: ${scripts.map((path) => relative(root, path)).join(", ")}`);
});

// Gate 2 §7 D3 (audit.md): with static imports only, a process loads all of its code when it starts, so one process
// runs one version of the code. A job's finalize path can start a new `bin/limen` (`src/job/record.ts:66`,
// `src/job/group-cabinet.ts:325-326`), which loads what `/opt/limen` holds then, so the guard against a job that runs
// across a deployment is the running-job refusal of `seat/deploy.ts`, not this scan. `bin/limen` imports `src/main.ts`
// dynamically before any job code runs, and is outside the scan.
test("no TypeScript file in src/ or hook/ loads a module with a dynamic import", async () => {
	const dynamic: string[] = [];
	for (const path of (await filesIn(["src", "hook"])).filter((file) => file.endsWith(".ts"))) {
		if (/\bimport\s*\(/.test(await readFile(path, "utf8"))) {
			dynamic.push(relative(root, path));
		}
	}
	assert.deepEqual(dynamic, []);
});

// Each shipped templates/.history/<name> starts with the hash of the current templates/<name>.
test("shipped template history starts at the current template", async () => {
	for (const name of await readdir(join(root, "templates/.history"))) {
		const path = join(root, "templates/.history", name);
		if (process.env.LIMEN_WRITE_HISTORY === "1") {
			await writeFile(path, templateHistoryText(`templates/${name}`));
		}
		const hash = createHash("sha256")
			.update(await readFile(join(root, "templates", name)))
			.digest("hex");
		const head = (await readFile(path, "utf8")).split(" ")[0];
		assert.equal(head, hash, `regenerate ${path}: LIMEN_WRITE_HISTORY=1 node --test test/structure.test.ts`);
	}
});
