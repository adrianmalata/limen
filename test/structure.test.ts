import assert from "node:assert/strict";
import { execFile, execFileSync } from "node:child_process";
import { createHash } from "node:crypto";
import { existsSync } from "node:fs";
import { mkdir, mkdtemp, readdir, readFile, realpath, rename, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { basename, dirname, join, relative } from "node:path";
import test, { type TestContext } from "node:test";
import { promisify } from "node:util";
import { templateHistoryText } from "../src/project/inherit.ts";

const execFileAsync = promisify(execFile);

// The fixture's git and the listing of the repository must not depend on the laptop's own git configuration.
process.env.GIT_CONFIG_GLOBAL = "/dev/null";
process.env.GIT_CONFIG_NOSYSTEM = "1";

const root = new URL("..", import.meta.url).pathname;
/** Folders no listing of this file descends into. */
const SKIPPED: ReadonlySet<string> = new Set(["node_modules", ".git", ".pi"]);

async function filesBelow(dir: string): Promise<string[]> {
	const entries = await readdir(dir, { withFileTypes: true });
	const paths = await Promise.all(
		entries
			.filter((entry) => !SKIPPED.has(entry.name))
			.map(async (entry) => {
				const path = join(dir, entry.name);
				return entry.isDirectory() ? filesBelow(path) : [path];
			}),
	);
	return paths.flat();
}

/**
 * The files of the repository at `repo` that git knows, tracked and untracked but not ignored, outside `SKIPPED`. An
 * ignored local input, such as the Pi sources in `adrian-rebuild/input/vendor/` (D-046), is not part of the tree, and
 * neither is an index entry whose file is gone from the working tree, as a plain `mv` leaves one.
 */
async function knownFiles(repo: string): Promise<string[]> {
	const { stdout } = await execFileAsync("git", ["ls-files", "--cached", "--others", "--exclude-standard", "-z"], {
		cwd: repo,
		encoding: "utf8",
		maxBuffer: 64 * 1024 * 1024,
	});
	return stdout
		.split("\0")
		.filter((path) => path !== "" && !path.split("/").some((part) => SKIPPED.has(part)))
		.map((path) => join(repo, path))
		.filter((path) => existsSync(path));
}

/** The basename of every TypeScript file of the repository at `repo`. */
async function typeScriptNames(repo: string): Promise<string[]> {
	return (await knownFiles(repo)).filter((path) => path.endsWith(".ts")).map((path) => basename(path));
}

test("runtime remains dependency-free and TypeScript basenames stay unambiguous", async () => {
	const pkg = JSON.parse(await readFile(join(root, "package.json"), "utf8")) as {
		dependencies?: Record<string, string>;
	};
	assert.deepEqual(pkg.dependencies, {});
	const names = await typeScriptNames(root);
	assert.equal(new Set(names).size, names.length, "TypeScript basenames must be unique");
});

/** A new git repository in the OS temporary folder, removed after the test, with `files` written into it. */
async function fixtureRepo(t: TestContext, files: readonly string[]): Promise<string> {
	const repo = await realpath(await mkdtemp(join(tmpdir(), "limen-structure-")));
	t.after(() => rm(repo, { recursive: true, force: true }));
	execFileSync("git", ["init", "-q"], { cwd: repo });
	for (const path of files) {
		await mkdir(dirname(join(repo, path)), { recursive: true });
		await writeFile(join(repo, path), "export {};\n");
	}
	return repo;
}

test("an ignored TypeScript file whose basename repeats a tracked one is not counted by the basename check", async (t) => {
	const repo = await fixtureRepo(t, ["tracked/name.ts", "untracked/other.ts", "vendor/name.ts"]);
	await writeFile(join(repo, ".gitignore"), "vendor/\n");
	execFileSync("git", ["add", ".gitignore", "tracked/name.ts"], { cwd: repo });
	assert.deepEqual((await typeScriptNames(repo)).sort(), ["name.ts", "other.ts"]);
});

test("a tracked TypeScript file deleted from the working tree and an untracked one of the same basename count once", async (t) => {
	const repo = await fixtureRepo(t, ["old/name.ts"]);
	execFileSync("git", ["add", "old/name.ts"], { cwd: repo });
	// A plain `mv` leaves the old path in the index and the new one untracked.
	await mkdir(join(repo, "new"));
	await rename(join(repo, "old", "name.ts"), join(repo, "new", "name.ts"));
	assert.deepEqual(await typeScriptNames(repo), ["name.ts"]);
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

/** The text of every file below each folder that exists, by its path from the repository root. */
async function sources(folders: readonly string[]): Promise<ReadonlyArray<{ path: string; text: string }>> {
	const paths = await filesIn(folders);
	return Promise.all(paths.map(async (path) => ({ path: relative(root, path), text: await readFile(path, "utf8") })));
}

/** How often `literal` occurs in the text of every file below `folders`, and in the file `only`. */
async function occurrences(folders: readonly string[], literal: string, only: string): Promise<[number, number]> {
	let all = 0;
	let inOnly = 0;
	for (const { path, text } of await sources(folders)) {
		const found = text.split(literal).length - 1;
		all += found;
		inOnly += path === only ? found : 0;
	}
	return [all, inOnly];
}

// D-028: a command that sets the exit code and returns would print the success line, and a timer that ends the
// process skips it, so only the wrapper (`main`) and the entry point decide the exit code, within T-02's classes.
test("T-02: process.exitCode and process.exit appear in src/, hook/ and bin/ only in src/main.ts and bin/limen, with literal codes 0-5", async () => {
	const elsewhere: string[] = [];
	const outside: string[] = [];
	for (const { path, text } of await sources(["src", "hook", "bin"])) {
		if (text.includes("process.exit") && path !== "src/main.ts" && path !== "bin/limen") {
			elsewhere.push(path);
		}
		for (const match of text.matchAll(/process\.exit(?:Code\s*=\s*|\(\s*)(\d+)/g)) {
			if (Number(match[1]) > 5) {
				outside.push(`${path}: ${match[0]}`);
			}
		}
	}
	assert.deepEqual({ elsewhere, outside }, { elsewhere: [], outside: [] });
});

// T-25: one module writes the final line, so its shape cannot drift between commands; the scan finds a writer
// elsewhere by the start of the object it serialises.
test("T-26 (4): only src/outcome.ts builds the final line in src/, hook/ and bin/", async () => {
	const builders = (await sources(["src", "hook", "bin"]))
		.filter(({ path, text }) => path !== "src/outcome.ts" && /JSON\.stringify\(\{ ?class/.test(text))
		.map(({ path }) => path);
	assert.deepEqual(builders, []);
});

// T-01 → Why: the author's side channels swallow their errors. A ratchet until R-082 brings both counts to zero: the
// counts at R-013's parent commit, which a change may only lower.
const SWALLOWED = { "catch {": 81, ".catch(() => {})": 27 } as const;
test("T-01: the catch-all sites in src/ and hook/ stay at most their baseline count, and src/outcome.ts has none", async () => {
	for (const [literal, most] of Object.entries(SWALLOWED)) {
		const [all, inOutcome] = await occurrences(["src", "hook"], literal, "src/outcome.ts");
		assert.ok(all <= most, `${all} sites of ${literal}, at most ${most}`);
		assert.equal(inOutcome, 0, `src/outcome.ts holds ${literal}`);
	}
});

// The author's untyped refusals, which `failureOf` maps to UNTYPED (exit code 1) until R-082 types them. The count at
// R-013's parent, less the sites R-013 typed as LimenError: the four parse errors of src/commands/flags.ts (BAD_FLAG)
// and ten checks of src/integrations/github-poller.ts (GITHUB_CONFIG): the six before the poll's loop, the two in
// `appJwt`, the one in `privatePath` and the one in `installationToken`.
const UNTYPED_THROWS = 275 - 14;
test("T-01: the untyped throw new Error( sites in src/ and hook/ stay at most their baseline count, less the typed ones", async () => {
	const [all] = await occurrences(["src", "hook"], "throw new Error(", "src/outcome.ts");
	assert.ok(all <= UNTYPED_THROWS, `${all} sites of throw new Error(, at most ${UNTYPED_THROWS}`);
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
