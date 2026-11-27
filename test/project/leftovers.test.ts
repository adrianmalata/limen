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
import { packageRoot } from "../../src/project/inherit.ts";
import { dropLeftovers, LEFTOVERS, type Leftover, listLeftovers, PROJECT_FILES } from "../../src/project/leftovers.ts";

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
 * rule can compare paths by prefix), and never Git's own data, except a hook directly in `.git/hooks/` on an entry
 * with a marker: the marker keeps a hook Limen did not write from being listed or dropped.
 */
function insideProject(path: string, marker?: string): boolean {
	return (
		path !== "" &&
		path !== "." &&
		!isAbsolute(path) &&
		normalize(path) === path &&
		!path.endsWith("/") &&
		!path.split("/").includes("..") &&
		(/^\.git\/hooks\/[^/]+$/.test(path) ? marker !== undefined : path !== ".git" && !path.startsWith(".git/"))
	);
}

/**
 * Each pair where a registry path equals, lies under or holds another registry path or a project context or owner
 * file. Such a pair does two kinds of harm. First, an entry that holds a project file deletes a file the project
 * needs, which the drop must keep (R-001, Change item 3), and it does so silently, because no listed line names that
 * file. Second, the list names one file twice, and the drop fails on its second removal.
 */
function overlaps(registry: readonly string[], kept: readonly string[]): string[] {
	const found: string[] = [];
	for (const [index, path] of registry.entries()) {
		for (const other of [...registry.slice(index + 1), ...kept]) {
			if (path === other || other.startsWith(`${path}/`) || path.startsWith(`${other}/`)) {
				found.push(`${path} overlaps ${other}`);
			}
		}
	}
	return found;
}

/** The roles of the package and the two a cut removed, whose project copies no code reads since R-040. */
const ROLES = ["coordinator", "group-member", "judge", "keeper", "quality", "researcher", "reviewer", "worker"];
const REMOVED_ROLES = ["picture", "scout"];
/** The project copies of Limen's texts that R-040 leaves unread: the register and a file per role. */
const ROLE_TEXTS = [
	".agents/limen/communication.md",
	...[...ROLES, ...REMOVED_ROLES].map((role) => `.agents/limen/${role}.md`),
];
const ROLE_TEXTS_FEATURE = "role texts from the package (R-040)";

const FILE = { path: "cut-file.json", feature: "a cut file" };
const DIRECTORY = { path: "cut-dir", feature: "a cut directory" };
const LINK = { path: "cut-link", feature: "a cut symlink" };
const MISSING = { path: "never-made", feature: "a leftover the project does not have" };
const HOOK = { path: ".git/hooks/cut-hook", feature: "a cut hook", marker: "# written by the cut feature " };

test("listLeftovers lists registry entries present as a file, a directory or a symlink and skips a missing one", () => {
	const root = project();
	write(root, FILE.path, "{}\n");
	mkdirSync(join(root, DIRECTORY.path));
	// A dangling link still counts: the entry is checked with lstat, not by following the link.
	symlinkSync("gone-target", join(root, LINK.path));
	assert.deepEqual(listLeftovers(root, [DIRECTORY, FILE, LINK, MISSING]), [DIRECTORY, FILE, LINK]);
});

test("listLeftovers lists an AGENTS.md identical to the package's coordinator manual", () => {
	const root = project();
	write(root, "AGENTS.md", packaged("templates/manual.md"));
	assert.deepEqual(listLeftovers(root, []), [
		{ path: "AGENTS.md", feature: "identical copy of the package's templates/manual.md" },
	]);
});

// A-042: a changed AGENTS.md is the project's own context, which reaches every role beside Limen's text.
test("listLeftovers never lists a changed AGENTS.md", () => {
	const root = project();
	write(root, "AGENTS.md", `${packaged("templates/manual.md")}\nA project rule.\n`);
	assert.deepEqual(listLeftovers(root), []);
});

// A-039, A-042: every Limen text comes from the package, so the project's register and role files are read by nothing.
test("listLeftovers lists .agents/limen/communication.md and every role's .agents/limen/<role>.md, each changed, as leftovers of role texts from the package", () => {
	const root = project();
	for (const path of ROLE_TEXTS) {
		write(root, path, "# The project's own text\n");
	}
	assert.deepEqual(
		listLeftovers(root),
		ROLE_TEXTS.toSorted().map((path) => ({ path, feature: ROLE_TEXTS_FEATURE })),
	);
});

test("dropLeftovers removes the project's register and role files and keeps its styleguide", () => {
	const root = project();
	for (const path of [...ROLE_TEXTS, ".agents/limen/styleguide.md"]) {
		write(root, path, "# The project's own text\n");
	}
	dropLeftovers(root);
	assert.deepEqual(
		[ROLE_TEXTS.filter((path) => existsSync(join(root, path))), existsSync(join(root, ".agents/limen/styleguide.md"))],
		[[], true],
	);
});

test("listLeftovers sorts registry entries and template copies together by path", () => {
	const root = project();
	const late = { path: "zz-cut", feature: "a late cut" };
	const early = { path: ".cut-early", feature: "an early cut" };
	write(root, late.path, "late\n");
	write(root, early.path, "early\n");
	write(root, "AGENTS.md", packaged("templates/manual.md"));
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

test("dropLeftovers removes a hook that holds the entry's marker and keeps one that does not", () => {
	const marked = project();
	const unmarked = project();
	write(marked, HOOK.path, `#!/bin/sh\n${HOOK.marker}{"branch":"main"}\nexit 0\n`);
	write(unmarked, HOOK.path, "#!/bin/sh\n# the project's own hook\nexit 0\n");
	assert.deepEqual([dropLeftovers(marked, [HOOK]), dropLeftovers(unmarked, [HOOK])], [[HOOK], []]);
	assert.deepEqual(
		[existsSync(join(marked, HOOK.path)), readFileSync(join(unmarked, HOOK.path), "utf8")],
		[false, "#!/bin/sh\n# the project's own hook\nexit 0\n"],
	);
});

test("listLeftovers finds a marked entry only as a regular file, never as a directory or a symlink", () => {
	const directory = project();
	const link = project();
	mkdirSync(join(directory, HOOK.path), { recursive: true });
	// The link's target holds the marker; the entry still counts only for a regular file at the path itself.
	write(link, "target", `${HOOK.marker}\n`);
	mkdirSync(join(link, dirname(HOOK.path)), { recursive: true });
	symlinkSync(join(link, "target"), join(link, HOOK.path));
	assert.deepEqual([listLeftovers(directory, [HOOK]), listLeftovers(link, [HOOK])], [[], []]);
});

test("listLeftovers finds no marked entry under a .git file, as in a job worktree", () => {
	const root = project();
	// A worktree's `.git` is a file naming the shared Git folder, so nothing can lie below it.
	write(root, ".git", "gitdir: /elsewhere/.git/worktrees/job\n");
	assert.deepEqual(listLeftovers(root, [HOOK]), []);
});

// R-102, D-097 (6) (b): the coordinator registration went with the seat rules, its one reader, so nothing reads its
// folder any more.
test("listLeftovers names a .limen/coordinators folder as a leftover of the cut seat rules", () => {
	const root = project();
	write(root, ".limen/coordinators/s1/pid", "4242\n");
	assert.deepEqual(listLeftovers(root), [{ path: ".limen/coordinators", feature: "seat rules (R-102)" }]);
});

test("a second dropLeftovers call removes nothing", () => {
	const root = project();
	write(root, FILE.path, "{}\n");
	write(root, "README.md", "the project's own file\n");
	assert.deepEqual(dropLeftovers(root, [FILE]), [FILE]);
	assert.deepEqual(dropLeftovers(root, [FILE]), []);
	assert.equal(existsSync(join(root, "README.md")), true);
});

test("every LEFTOVERS entry has a normalised relative path inside the project, outside .git/ but for a marked hook, and a feature", () => {
	for (const entry of LEFTOVERS) {
		assert.ok(
			insideProject(entry.path, entry.marker),
			`registry path ${JSON.stringify(entry.path)} is not inside the project`,
		);
		assert.notEqual(entry.feature.trim(), "", `registry path ${entry.path} names no feature`);
		assert.notEqual(entry.marker?.trim(), "", `registry path ${entry.path} has an empty marker`);
	}
});

test("LEFTOVERS entries overlap neither each other nor a project context or owner file", () => {
	assert.deepEqual(
		overlaps(
			LEFTOVERS.map((entry) => entry.path),
			PROJECT_FILES,
		),
		[],
	);
});

test("the registry path rule rejects absolute, parent, unnormalised, root and .git/ paths", () => {
	const rejected = [
		"",
		".",
		"/etc/passwd",
		"..",
		"../outside",
		"a/../b",
		"./a",
		"a//b",
		"a/b/",
		".git",
		".git/config",
		".git/hooks/reference-transaction",
	];
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

test("the registry path rule accepts a path under .git/ only as .git/hooks/<name> on an entry with a marker", () => {
	const marker = "# written by the cut feature ";
	const rejected = [
		".git",
		".git/config",
		".git/hooks",
		".git/hooks/",
		".git/hooks/a/b",
		".git/hooksx/a",
		".git/info/a",
	];
	assert.deepEqual(
		rejected.filter((path) => insideProject(path, marker)),
		[],
	);
	assert.deepEqual(
		[insideProject(".git/hooks/reference-transaction", marker), insideProject(".git/hooks/reference-transaction")],
		[true, false],
	);
});

test("the overlap rule flags an equal path, a path under another entry or a project file, and a path that holds one", () => {
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
		bad.filter((registry) => overlaps(registry, PROJECT_FILES).length === 0),
		[],
	);
	const good: Array<readonly string[]> = [["cut", "cut-other"], ["AGENTS.md.old"], [".agents/limen/cut.json"]];
	assert.deepEqual(
		good.filter((registry) => overlaps(registry, PROJECT_FILES).length > 0),
		[],
	);
});
