/* PL: Test sprawdzania wpisów changes.md według D-009 i D-138 na fiksturze: tymczasowe repo z gałęzią adrian-rebuild,
   w którym wpis R-001 ma zero, jeden albo dwa commity z tematem „R-001:”. Oczekiwane: wpis niezacommitowany bez
   commitu przechodzi, wpis w HEAD bez commitu „R-001:” i wpis z dwoma takimi commitami dają błąd, jeden commit
   z wpisem przechodzi. Sprawdza też format pól Commit i Rollback oraz kolizję z D-138: commit o innym temacie
   z linią „R-002:” w treści nie liczy się jako commit ticketu, a wpis R-002 musi mieć dokładną linię Rollback. Stan:
   działa. */
// Usage: node --test adrian-rebuild/tools/test-changes-entries.mjs
import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { after, test } from "node:test";
import { CHANGES, checkEntries, exactRollbackCommand, rollbackCommand } from "./changes-entries.mjs";

const work = mkdtempSync(join(tmpdir(), "changes-entries-"));
after(() => rmSync(work, { recursive: true, force: true }));
const env = { ...process.env, GIT_CONFIG_GLOBAL: "/dev/null", GIT_CONFIG_NOSYSTEM: "1" };

function git(...args) {
	const result = spawnSync("git", ["-c", "user.name=test", "-c", "user.email=test@example.invalid", ...args], {
		cwd: work,
		env,
	});
	assert.equal(result.status, 0, result.stderr.toString("utf8"));
	return result.stdout.toString("utf8");
}

const header = "<!-- PL: test. -->\n\n# Changes\n";
const entry = `
## 2026-11-18 R-001 Leftover files
- What: src/
- Why: A-042
- Proof: node adrian-rebuild/tools/gate.mjs → exit 0
- Measurement: measured
- Commit: R-001
- Rollback: ${rollbackCommand("R-001")}
`;
const head = () => git("show", `HEAD:${CHANGES}`);
const check = (text) =>
	checkEntries({ text, headText: head(), folders: ["R-001-leftovers"], done: new Set(["R-001"]), cwd: work });

git("init", "-q", "-b", "adrian-rebuild");
mkdirSync(join(work, "adrian-rebuild"));
writeFileSync(join(work, CHANGES), header);
git("add", CHANGES);
git("commit", "-q", "-m", "base");

test("D-009: an entry not yet committed and no commit R-001: passes", () => {
	assert.deepEqual(check(header + entry), []);
});

test("D-009: an entry in HEAD without a commit R-001: is an error", () => {
	writeFileSync(join(work, CHANGES), header + entry);
	git("commit", "-q", "-am", "unrelated subject");
	assert.match(check(header + entry).join("\n"), /0 commits "R-001:" on adrian-rebuild, expected exactly one/);
	git("reset", "-q", "--hard", "HEAD~1");
});

test("D-009: exactly one commit R-001: that carries the entry passes", () => {
	writeFileSync(join(work, CHANGES), header + entry);
	git("commit", "-q", "-am", "R-001: Leftover files");
	assert.deepEqual(check(header + entry), []);
});

test("D-009: two commits R-001: are an error", () => {
	git("commit", "-q", "--allow-empty", "-m", "R-001: fix after push");
	assert.match(check(header + entry).join("\n"), /2 commits "R-001:" on adrian-rebuild, expected exactly one/);
});

test("D-009: Commit must be the ticket ID and Rollback the subject-keyed revert", () => {
	const wrong = entry
		.replace("- Commit: R-001", "- Commit: 802f2f7")
		.replace(/- Rollback: .*/, "- Rollback: git revert 802f2f7");
	const errors = check(header + wrong).join("\n");
	assert.match(errors, /Commit is "802f2f7", expected "R-001"/);
	assert.match(errors, /Rollback does not say/);
});

// D-138: a published commit whose body, not its subject, starts a line with the ticket's ID (a State commit holds one
// for R-045) is no commit of the ticket, and D-009's `--grep` Rollback would revert it too.
const second = (rollback) => `
## 2026-11-27 R-002 Second ticket
- What: src/
- Why: A-081
- Proof: node adrian-rebuild/tools/gate.mjs → exit 0
- Measurement: measured
- Commit: R-002
- Rollback: ${rollback}
`;
const checkSecond = (text) =>
	checkEntries({ text, headText: head(), folders: ["R-002-second"], done: new Set(["R-002"]), cwd: work });

test("D-138: with a body line R-002: in another commit, D-009's Rollback is an error that names the exact form", () => {
	git("commit", "-q", "--allow-empty", "-m", "State: ticket.md of R-002", "-m", "R-002: the ticket's summary.");
	const errors = checkSecond(header + second(rollbackCommand("R-002"))).join("\n");
	assert.match(errors, /R-002: Rollback does not say /);
	assert.ok(errors.includes(exactRollbackCommand("R-002")), errors);
});

test("D-138: the exact Rollback passes before the commit, which a body line R-002: does not stand for", () => {
	assert.deepEqual(checkSecond(header + second(exactRollbackCommand("R-002"))), []);
});

test("D-138: after the commit R-002: that carries the entry, one commit is counted and the entry passes", () => {
	writeFileSync(join(work, CHANGES), header + entry + second(exactRollbackCommand("R-002")));
	git("commit", "-q", "-am", "R-002: Second ticket");
	assert.deepEqual(checkSecond(header + second(exactRollbackCommand("R-002"))), []);
});

test("D-138: the exact Rollback's command selects only the commit whose subject starts with R-002:", () => {
	const selection = exactRollbackCommand("R-002").replace(/^git revert \$\((.*)\)$/, "$1");
	const selected = spawnSync("sh", ["-c", selection], { cwd: work, env });
	assert.equal(
		selected.stdout.toString("utf8").trim(),
		git("log", "-1", "--format=%H", "--grep=^R-002: Second").trim(),
	);
});
