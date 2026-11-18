// The leftover registry, its listing and its drop, on temporary directories with a fixture registry.
import assert from "node:assert/strict";
import {
	existsSync,
	lstatSync,
	mkdirSync,
	mkdtempSync,
	readFileSync,
	rmSync,
	symlinkSync,
	writeFileSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { dirname, isAbsolute, join, normalize } from "node:path";
import { after, test } from "node:test";
import { packageRoot, TRACKED } from "../../src/project/inherit.ts";
import { dropLeftovers, LEFTOVERS, type Leftover, listLeftovers } from "../../src/project/leftovers.ts";

const roots: string[] = [];
after(() => {
	for (const root of roots) {
		rmSync(root, { recursive: true, force: true });
	}
});

function project(): string {
	const root = mkdtempSync(join(tmpdir(), "limen-leftovers-"));
	roots.push(root);
	return root;
}

function write(root: string, path: string, text: string): void {
	mkdirSync(dirname(join(root, path)), { recursive: true });
	writeFileSync(join(root, path), text);
}

function packaged(source: string): string {
	return readFileSync(join(packageRoot(), source), "utf8");
}

/**
 * A registry path names something strictly inside the project, in normal form with no trailing slash (so the overlap
 * rule can compare paths by prefix), and never Git's own data.
 */
function insideProject(path: string): boolean {
	return (
		path !== "" &&
		path !== "." &&
		!isAbsolute(path) &&
		normalize(path) === path &&
		!path.endsWith("/") &&
		!path.split("/").includes("..") &&
		path !== ".git" &&
		!path.startsWith(".git/")
	);
}

/**
 * Each pair where a registry path equals, lies under or holds another registry path or a tracked template copy. Such a
 * pair does two kinds of harm. First, an entry that holds a tracked path deletes a changed copy of a template, which
 * the drop must keep (R-001, Change item 3), and it does so silently, because no listed line names that copy. Second,
 * the list names one file twice, and the drop fails on its second removal.
 */
function overlaps(registry: readonly string[], tracked: readonly string[]): string[] {
	const found: string[] = [];
	for (const [index, path] of registry.entries()) {
		for (const other of [...registry.slice(index + 1), ...tracked]) {
			if (path === other || other.startsWith(`${path}/`) || path.startsWith(`${other}/`)) {
				found.push(`${path} overlaps ${other}`);
			}
		}
	}
	return found;
}

const TRACKED_PATHS = TRACKED.map(([path]) => path);

const FILE = { path: "cut-file.json", feature: "a cut file" };
const DIRECTORY = { path: "cut-dir", feature: "a cut directory" };
const LINK = { path: "cut-link", feature: "a cut symlink" };
const MISSING = { path: "never-made", feature: "a leftover the project does not have" };

test("listLeftovers lists registry entries present as a file, a directory or a symlink and skips a missing one", () => {
	const root = project();
	write(root, FILE.path, "{}\n");
	mkdirSync(join(root, DIRECTORY.path));
	// A dangling link still counts: the entry is checked with lstat, not by following the link.
	symlinkSync("gone-target", join(root, LINK.path));
	assert.deepEqual(listLeftovers(root, [DIRECTORY, FILE, LINK, MISSING]), [DIRECTORY, FILE, LINK]);
});

test("listLeftovers lists a project copy identical to its packaged template and skips a changed one", () => {
	const root = project();
	write(root, "AGENTS.md", packaged("templates/agents.md"));
	write(root, ".agents/limen/worker.md", `${packaged("templates/worker.md")}\nA project rule.\n`);
	assert.deepEqual(listLeftovers(root, []), [
		{ path: "AGENTS.md", feature: "identical copy of the package's templates/agents.md" },
	]);
});

test("listLeftovers sorts registry entries and template copies together by path", () => {
	const root = project();
	const late = { path: "zz-cut", feature: "a late cut" };
	const early = { path: ".cut-early", feature: "an early cut" };
	write(root, late.path, "late\n");
	write(root, early.path, "early\n");
	write(root, "AGENTS.md", packaged("templates/agents.md"));
	assert.deepEqual(
		listLeftovers(root, [late, early]).map((entry) => entry.path),
		[".cut-early", "AGENTS.md", "zz-cut"],
	);
});

test("dropLeftovers removes a directory with its content and a symlink without its target", () => {
	const root = project();
	write(root, `${DIRECTORY.path}/nested/state.json`, "{}\n");
	write(root, "kept-target/inner.txt", "kept\n");
	symlinkSync("kept-target", join(root, LINK.path));
	assert.deepEqual(dropLeftovers(root, [DIRECTORY, LINK]), [DIRECTORY, LINK]);
	assert.equal(lstatSync(join(root, DIRECTORY.path), { throwIfNoEntry: false }), undefined);
	assert.equal(lstatSync(join(root, LINK.path), { throwIfNoEntry: false }), undefined);
	assert.equal(readFileSync(join(root, "kept-target/inner.txt"), "utf8"), "kept\n");
});

test("dropLeftovers reports each removal before the next one, so a later failure keeps the earlier report", () => {
	const root = project();
	// The second entry lies under the first, so its removal fails with ENOENT once the first removal took it.
	const outer = { path: "cut", feature: "an outer cut" };
	const inner = { path: "cut/inner.json", feature: "an inner cut" };
	write(root, inner.path, "{}\n");
	const reported: Leftover[] = [];
	assert.throws(() => dropLeftovers(root, [outer, inner], (entry) => reported.push(entry)), { code: "ENOENT" });
	assert.deepEqual(reported, [outer]);
});

test("a second dropLeftovers call removes nothing", () => {
	const root = project();
	write(root, FILE.path, "{}\n");
	write(root, "README.md", "the project's own file\n");
	assert.deepEqual(dropLeftovers(root, [FILE]), [FILE]);
	assert.deepEqual(dropLeftovers(root, [FILE]), []);
	assert.equal(existsSync(join(root, "README.md")), true);
});

test("every LEFTOVERS entry has a normalised relative path inside the project, outside .git/, and a feature", () => {
	for (const entry of LEFTOVERS) {
		assert.ok(insideProject(entry.path), `registry path ${JSON.stringify(entry.path)} is not inside the project`);
		assert.notEqual(entry.feature.trim(), "", `registry path ${entry.path} names no feature`);
	}
});

test("LEFTOVERS entries overlap neither each other nor a tracked template copy", () => {
	assert.deepEqual(
		overlaps(
			LEFTOVERS.map((entry) => entry.path),
			TRACKED_PATHS,
		),
		[],
	);
});

test("the registry path rule rejects absolute, parent, unnormalised, root and .git/ paths", () => {
	const rejected = ["", ".", "/etc/passwd", "..", "../outside", "a/../b", "./a", "a//b", "a/b/", ".git", ".git/config"];
	assert.deepEqual(
		rejected.filter((path) => insideProject(path)),
		[],
	);
	const accepted = ["AGENTS.md", ".limen/cut-feature.json", ".gitignore", ".github/workflows/ci.yml"];
	assert.deepEqual(
		accepted.filter((path) => !insideProject(path)),
		[],
	);
});

test("the overlap rule flags an equal path, a path under another entry or a tracked copy, and a path that holds one", () => {
	const bad: Array<readonly string[]> = [
		["cut", "cut"],
		["cut", "cut/inner.json"],
		["cut/inner.json", "cut"],
		["AGENTS.md"],
		["AGENTS.md/inner"],
		[".agents"],
		[".agents/limen"],
	];
	assert.deepEqual(
		bad.filter((registry) => overlaps(registry, TRACKED_PATHS).length === 0),
		[],
	);
	const good: Array<readonly string[]> = [["cut", "cut-other"], ["AGENTS.md.old"], [".agents/limen/cut.json"]];
	assert.deepEqual(
		good.filter((registry) => overlaps(registry, TRACKED_PATHS).length > 0),
		[],
	);
});
