/* PL: Test strażnika review-guard.mjs na fiksturze (zastępuje test w powłoce, D-015). Tryb pełny: druga edycja już
   zmienionego pliku, nowy plik, zmiana indeksu i commit unieważniają recenzję, a drzewo bez zmian przechodzi; diff
   zawiera plik nieśledzony. Tryb --git: edycja drzewa, git rm i git mv ścieżek z ## Change oraz edycja wymienionego
   pliku tools/ przechodzą; git rm innej ścieżki, zmiana treści w indeksie, commit, zmiana refu, edycja plików sesji
   głównej, innego pliku tools/, hooka w .git/hooks i pliku input/ unieważniają pracę. Stan: działa. */
// Usage: node --test adrian-rebuild/tools/test-review-guard.mjs
import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { after, beforeEach, describe, test } from "node:test";

const guard = join(import.meta.dirname, "review-guard.mjs");
const work = mkdtempSync(join(tmpdir(), "review-guard-"));
const snap = join(mkdtempSync(join(tmpdir(), "review-guard-snap-")), "snapshot");
after(() => {
	rmSync(work, { recursive: true, force: true });
	rmSync(dirname(snap), { recursive: true, force: true });
});
const env = { ...process.env, GIT_CONFIG_GLOBAL: "/dev/null", GIT_CONFIG_NOSYSTEM: "1" };
const ticket = "adrian-rebuild/R-001-cut/ticket.md";

function git(...args) {
	const result = spawnSync("git", ["-c", "user.name=test", "-c", "user.email=test@example.invalid", ...args], {
		cwd: work,
		env,
	});
	assert.equal(result.status, 0, result.stderr.toString("utf8"));
	return result.stdout.toString("utf8");
}
function write(path, text) {
	mkdirSync(dirname(join(work, path)), { recursive: true });
	writeFileSync(join(work, path), text);
}
function guardRun(...args) {
	return spawnSync("node", [guard, ...args], { cwd: work, env, encoding: "utf8" });
}
function takeSnapshot(...mode) {
	const result = guardRun("snapshot", ...mode);
	assert.equal(result.status, 0, result.stderr);
	writeFileSync(snap, result.stdout);
}
const compare = () => guardRun("compare", snap).status;
const compareGit = () => guardRun("compare", "--git", snap, ticket).status;

git("init", "-q", "-b", "adrian-rebuild");
write(".gitignore", "adrian-rebuild/input/\n");
for (const path of ["a.txt", "keep.txt", "old/x.txt", "adrian-rebuild/plan.md"]) {
	write(path, `${path}\n`);
}
write("adrian-rebuild/tools/tool.mjs", "tool\n");
write("adrian-rebuild/tools/other.mjs", "other\n");
git("add", "-A");
git("commit", "-q", "-m", "base");
write(".git/hooks/pre-push", "#!/bin/sh\nexit 0\n");
write("adrian-rebuild/input/prompt.md", "prompt\n");
write(
	ticket,
	"# R-001 Cut\n## Change\nDelete `a.txt` and `old/`, move to `moved/`, edit `adrian-rebuild/tools/tool.mjs`.\n",
);

describe("review mode", () => {
	beforeEach(() => {
		git("reset", "-q", "--hard", "HEAD");
		write("a.txt", "changed once\n");
		takeSnapshot();
	});
	test("an unchanged tree passes", () => assert.equal(compare(), 0));
	test("a second edit of an already modified file voids the review", () => {
		write("a.txt", "changed twice\n");
		assert.equal(compare(), 1);
	});
	test("a new untracked file voids the review, and diff carries it", () => {
		write("new.txt", "new\n");
		assert.equal(compare(), 1);
		assert.match(guardRun("diff").stdout, /^\+\+\+ b\/new\.txt$/m);
		rmSync(join(work, "new.txt"));
	});
	test("a staged change voids the review", () => {
		git("add", "a.txt");
		assert.equal(compare(), 1);
	});
	test("a commit voids the review", () => {
		git("commit", "-q", "-am", "change");
		assert.equal(compare(), 1);
		git("reset", "-q", "--hard", "HEAD~1");
	});
});

describe("implementer mode (--git)", () => {
	beforeEach(() => {
		git("reset", "-q", "--hard", "HEAD");
		takeSnapshot("--git");
	});
	test("working-tree edits pass", () => {
		write("keep.txt", "edited\n");
		assert.equal(compareGit(), 0);
	});
	test("D-015: git rm of a path that ## Change names passes", () => {
		git("rm", "-q", "a.txt");
		git("rm", "-q", "-r", "old");
		assert.equal(compareGit(), 0);
	});
	test("D-015: git mv between paths that ## Change names passes", () => {
		mkdirSync(join(work, "moved"), { recursive: true });
		git("mv", "old/x.txt", "moved/x.txt");
		assert.equal(compareGit(), 0);
	});
	test("D-015: git rm of a path that ## Change does not name voids the run", () => {
		git("rm", "-q", "keep.txt");
		assert.equal(compareGit(), 1);
	});
	test("D-015: a staged content change voids the run", () => {
		write("a.txt", "edited\n");
		git("add", "a.txt");
		assert.equal(compareGit(), 1);
	});
	test("D-015: a commit voids the run", () => {
		git("commit", "-q", "--allow-empty", "-m", "by the implementer");
		assert.equal(compareGit(), 1);
		git("reset", "-q", "--hard", "HEAD~1");
	});
	test("D-015: a new ref voids the run", () => {
		git("branch", "side");
		assert.equal(compareGit(), 1);
		git("branch", "-q", "-D", "side");
	});
	test("D-015: an edit of a main-session file voids the run", () => {
		write("adrian-rebuild/plan.md", "edited\n");
		assert.equal(compareGit(), 1);
	});
	test("D-015: an edit of the ticket's ticket.md voids the run", () => {
		const text = readFileSync(join(work, ticket), "utf8");
		write(ticket, `${text}extra\n`);
		assert.equal(compareGit(), 1);
		write(ticket, text);
	});
	test("D-015: a tools/ file that ## Change names may change; another may not", () => {
		write("adrian-rebuild/tools/tool.mjs", "edited\n");
		assert.equal(compareGit(), 0);
		write("adrian-rebuild/tools/other.mjs", "edited\n");
		assert.equal(compareGit(), 1);
	});
	test("D-015: an edit of a git hook or of a file in input/ voids the run", () => {
		write(".git/hooks/pre-push", "#!/bin/sh\nexit 0 # changed\n");
		assert.equal(compareGit(), 1);
		write(".git/hooks/pre-push", "#!/bin/sh\nexit 0\n");
		write("adrian-rebuild/input/prompt.md", "changed\n");
		assert.equal(compareGit(), 1);
		write("adrian-rebuild/input/prompt.md", "prompt\n");
	});
});
