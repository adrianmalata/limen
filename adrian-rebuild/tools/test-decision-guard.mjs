/* PL: Test hooka decision-guard.mjs (D-083) na fikcyjnych transkryptach, uruchamianego tak jak Claude Code: JSON na
   stdin, kod wyjścia i stderr. Pięć przypadków z D-083, potem po jednym teście na mechanizm: liczy się tylko
   zakończone, nie-błędne wywołanie sesji głównej po poprzednim zadanym pytaniu; Read, Grep i Bash grep, sed -n, cat
   z argumentem źródła; błąd strażnika przy pytaniu blokuje. Stan: działa. */
// Usage: node --test adrian-rebuild/tools/test-decision-guard.mjs
import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join, resolve } from "node:path";
import { after, test } from "node:test";
import { fileURLToPath } from "node:url";

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "../..");
const TOOL = join(ROOT, "adrian-rebuild/tools/decision-guard.mjs");
const GATE = "adrian-rebuild/input/gate-2-decisions.md";
const TASTE = "adrian-rebuild/taste.md";
const RUBRIC = "adrian-rebuild/input/zasady-budowy-harnessu.md";
const PLAN = "adrian-rebuild/plan.md";
const QUESTIONS = join(ROOT, "adrian-rebuild/.night/questions.md");
const work = mkdtempSync(join(tmpdir(), "decision-guard-"));
after(() => rmSync(work, { recursive: true, force: true }));

let ids = 0;
// A string entry is written as it is: a line that is not JSON.
const jsonl = (entries) =>
	entries.map((entry) => (typeof entry === "string" ? entry : JSON.stringify(entry))).join("\n");
/** A tool call as its two transcript entries: the `tool_use`, then its `tool_result` (`result: false` leaves it out). */
function call(name, input, { error = false, result = true, sidechain = false } = {}) {
	ids += 1;
	const id = `toolu_${ids}`;
	const use = {
		type: "assistant",
		isSidechain: sidechain,
		message: { content: [{ type: "tool_use", id, name, input }] },
	};
	const done = { type: "tool_result", tool_use_id: id, content: "output", ...(error ? { is_error: true } : {}) };
	const reply = { type: "user", isSidechain: sidechain, message: { content: [done] } };
	return result ? [use, reply] : [use];
}

const read = (path, options) => call("Read", { file_path: join(ROOT, path) }, options);
const bash = (command, options) => call("Bash", { command }, options);
const push = (message, options) => call("PushNotification", { message }, options);
const SOURCES = [GATE, TASTE, RUBRIC, PLAN];
const searchAll = () => SOURCES.flatMap((path) => read(path));

/** Runs the hook on a tool call with the given transcript entries; returns its exit code and stderr. */
function guard(toolName, toolInput, entries, { transcript } = {}) {
	ids += 1;
	const path = transcript ?? join(work, `transcript-${ids}.jsonl`);
	if (transcript === undefined) {
		writeFileSync(path, `${jsonl(entries.flat())}\n`);
	}
	const input = { hook_event_name: "PreToolUse", tool_name: toolName, tool_input: toolInput, transcript_path: path };
	const run = spawnSync(process.execPath, [TOOL], { input: JSON.stringify(input), encoding: "utf8" });
	return { status: run.status, stderr: run.stderr };
}

const ask = (entries) => guard("PushNotification", { message: "Q-36 R-033: which account?" }, entries);
/** A question after Reads of the three other sources and one Bash command, so the command alone decides `source`. */
const shell = (command, source) =>
	ask([...SOURCES.filter((path) => path !== source).flatMap((path) => read(path)), bash(command)]);

test("D-083: a decision question without a search is blocked", () => {
	const { status, stderr } = ask([]);
	assert.equal(status, 2);
	assert.match(stderr, /taste\.md/);
});

test("D-083: a search before the previous question does not count", () => {
	assert.equal(ask([...searchAll(), push("Q-35: hook or memory?")]).status, 2);
});

test("D-083: a search of all four sources passes", () => {
	assert.deepEqual(ask([push("Q-35: hook or memory?"), ...searchAll()]), { status: 0, stderr: "" });
});

test("D-083: a push without a question id passes", () => {
	assert.equal(guard("PushNotification", { message: "R-026 done, gate green" }, []).status, 0);
});

test("D-083: a write of questions.md without a search is blocked", () => {
	assert.equal(guard("Write", { file_path: QUESTIONS, content: "## Q-36 R-033 Alerts\n" }, []).status, 2);
});

test("an edit of questions.md without a search is blocked", () => {
	assert.equal(guard("Edit", { file_path: QUESTIONS, old_string: "a", new_string: "b" }, []).status, 2);
});

test("an edit of another file passes without reading the transcript", () => {
	const input = { file_path: join(ROOT, PLAN), old_string: "a", new_string: "b" };
	assert.equal(guard("Edit", input, [], { transcript: join(work, "missing.jsonl") }).status, 0);
});

test("the block message names only the sources not searched", () => {
	const { stderr } = ask([read(GATE), read(TASTE)]);
	assert.match(stderr, /zasady-budowy-harnessu\.md/);
	assert.match(stderr, /plan\.md/);
	assert.doesNotMatch(stderr, /gate-2-decisions\.md|taste\.md/);
});

test("a search whose result is an error does not count", () => {
	assert.equal(ask([read(GATE, { error: true }), read(TASTE), read(RUBRIC), read(PLAN)]).status, 2);
});

test("a search without its result yet does not count", () => {
	assert.equal(ask([read(GATE, { result: false }), read(TASTE), read(RUBRIC), read(PLAN)]).status, 2);
});

test("a question that was blocked is not the previous question", () => {
	assert.equal(ask([...searchAll(), push("Q-36 R-033: which account?", { error: true })]).status, 0);
});

test("a question without its result yet is not the previous question", () => {
	assert.equal(ask([...searchAll(), push("Q-36 R-033: which account?", { result: false })]).status, 0);
});

test("a write of questions.md is a previous question", () => {
	const write = call("Write", { file_path: QUESTIONS, content: "## Q-35 R-033 Alerts\n" });
	assert.equal(ask([...searchAll(), write]).status, 2);
});

test("a subagent's search does not count", () => {
	const subagent = [GATE, TASTE, RUBRIC, PLAN].flatMap((path) => read(path, { sidechain: true }));
	assert.equal(ask(subagent).status, 2);
});

test("a tool_use outside an assistant entry does not count", () => {
	const blobs = searchAll().map((entry) =>
		entry.type === "assistant" ? { ...entry, type: "api-request-blob" } : entry,
	);
	assert.equal(ask(blobs).status, 2);
});

test("a tool_result outside a user entry does not count", () => {
	const blobs = searchAll().map((entry) => (entry.type === "user" ? { ...entry, type: "api-request-blob" } : entry));
	assert.equal(ask(blobs).status, 2);
});

test("a Grep with the source as its path counts", () => {
	const grep = (path) => call("Grep", { pattern: "D-0", path: join(ROOT, path) });
	assert.equal(ask([grep(GATE), grep(TASTE), grep(RUBRIC), grep(PLAN)]).status, 0);
});

test("a Grep over a directory does not count", () => {
	const grep = call("Grep", { pattern: "D-0", path: join(ROOT, "adrian-rebuild") });
	assert.equal(ask([read(GATE), read(RUBRIC), read(PLAN), grep]).status, 2);
});

test("a Bash grep with the source as an argument counts", () => {
	assert.equal(shell(`grep -n 'D-083' ${GATE}`, GATE).status, 0);
});

test("a Bash git grep with the source as an argument counts", () => {
	assert.equal(shell(`git grep -n T-10 -- ${TASTE}`, TASTE).status, 0);
});

test("a Bash sed -n in a flag group counts", () => {
	assert.equal(shell(`sed -En '1,40p' ${RUBRIC}`, RUBRIC).status, 0);
});

test("a Bash cat with the source as an argument counts", () => {
	assert.equal(shell(`cat ${PLAN}`, PLAN).status, 0);
});

test("an absolute path in double quotes names the source", () => {
	assert.equal(shell(`cat "${join(ROOT, PLAN)}"`, PLAN).status, 0);
});

test("a search after && counts", () => {
	assert.equal(shell(`git log -1 && cat ${PLAN}`, PLAN).status, 0);
});

test("a search after ; counts", () => {
	assert.equal(shell(`git status; cat ${PLAN}`, PLAN).status, 0);
});

test("a search after a pipe counts", () => {
	assert.equal(shell(`git status | grep -n x ${PLAN}`, PLAN).status, 0);
});

test("a search on its own line counts", () => {
	assert.equal(shell(`git status\ncat ${PLAN}`, PLAN).status, 0);
});

test("a search in a subshell counts", () => {
	assert.equal(shell(`(cat ${PLAN})`, PLAN).status, 0);
});

test("a command without a search naming the source does not count", () => {
	assert.equal(shell(`git add ${PLAN}`, PLAN).status, 2);
});

test("a redirection target is not a searched argument", () => {
	assert.equal(shell(`cat notes.txt >> ${PLAN}`, PLAN).status, 2);
});

test("a redirection of stderr keeps the command's arguments", () => {
	assert.equal(shell(`grep -n D-0 ${GATE} 2>/dev/null`, GATE).status, 0);
});

test("a quoted ; or | in a pattern does not split the command", () => {
	assert.equal(shell(`grep -n 'a;b|c' ${GATE}`, GATE).status, 0);
});

test("an escaped quote inside double quotes does not end the quote", () => {
	assert.equal(shell(String.raw`grep -n "say \"hi\"" ${GATE}`, GATE).status, 0);
});

test("an escaped backslash inside double quotes leaves the closing quote", () => {
	assert.equal(shell(String.raw`grep -n "x\\" ${GATE}`, GATE).status, 0);
});

test("a grep pattern is not a searched file", () => {
	assert.equal(shell(`grep -rn ${PLAN} adrian-rebuild/tools`, PLAN).status, 2);
});

test("a git grep pattern is not a searched file", () => {
	assert.equal(shell(`git grep -n ${TASTE} -- adrian-rebuild/tools`, TASTE).status, 2);
});

test("a grep option's separate argument is not the pattern", () => {
	assert.equal(shell(`grep -rn -C 3 ${PLAN} adrian-rebuild/tools`, PLAN).status, 2);
});

test("an option's attached argument leaves the pattern in place", () => {
	assert.equal(shell(`grep -C3 D-0 ${GATE}`, GATE).status, 0);
});

test("a second -e pattern is not a searched file", () => {
	assert.equal(shell(`grep -rn -e x -e ${PLAN} adrian-rebuild/tools`, PLAN).status, 2);
});

test("with an -e pattern every other word is a file", () => {
	assert.equal(shell(`grep -n -e D-0 ${GATE}`, GATE).status, 0);
});

test("a --regexp= pattern leaves every other word a file", () => {
	assert.equal(shell(`grep -n --regexp=D-0 ${GATE}`, GATE).status, 0);
});

test("a --regexp pattern in the next word is not a file", () => {
	assert.equal(shell(`grep -rn --regexp ${PLAN} adrian-rebuild/tools`, PLAN).status, 2);
});

test("a long option without = takes the next word", () => {
	assert.equal(shell(`grep -rn --include '*.mjs' ${PLAN} adrian-rebuild/tools`, PLAN).status, 2);
});

test("a long option with = takes no further word", () => {
	assert.equal(shell(`grep --color=auto D-0 ${GATE}`, GATE).status, 0);
});

test("a git grep option's separate argument is not the pattern", () => {
	assert.equal(shell(`git grep -n -C 3 ${TASTE} -- adrian-rebuild/tools`, TASTE).status, 2);
});

test("after -- a word with a dash is the pattern", () => {
	assert.equal(shell(`grep -n -- -x ${PLAN}`, PLAN).status, 0);
});

test("sed --in-place is not a search", () => {
	assert.equal(shell(`sed -n --in-place=.bak 1p ${PLAN}`, PLAN).status, 2);
});

test("sed without -n is not a search", () => {
	assert.equal(shell(`sed 's/a/b/' ${PLAN}`, PLAN).status, 2);
});

test("sed -i in the first flag group is not a search", () => {
	assert.equal(shell(`sed -ni 's/a/b/' ${PLAN}`, PLAN).status, 2);
});

test("sed with a later -i flag is not a search", () => {
	assert.equal(shell(`sed -n -i 's/a/b/' ${PLAN}`, PLAN).status, 2);
});

test("a heredoc body is not a command", () => {
	assert.equal(shell(`git commit -F - <<'EOF'\ncat ${PLAN}\nEOF`, PLAN).status, 2);
});

test("a path outside the repository with the same suffix does not count", () => {
	const elsewhere = call("Read", { file_path: join(work, PLAN) });
	assert.equal(ask([read(GATE), read(TASTE), read(RUBRIC), elsewhere]).status, 2);
});

test("a torn last line of the transcript is skipped", () => {
	const path = join(work, "torn.jsonl");
	writeFileSync(path, `${jsonl(searchAll())}\n{"type":"assistant","mess`);
	assert.equal(guard("PushNotification", { message: "Q-36" }, [], { transcript: path }).status, 0);
});

test("an unreadable transcript blocks a decision question", () => {
	const { status, stderr } = guard("PushNotification", { message: "Q-36" }, [], { transcript: join(work, "none") });
	assert.equal(status, 2);
	assert.match(stderr, /transcript/);
});

test("an unreadable hook input blocks", () => {
	const run = spawnSync(process.execPath, [TOOL], { input: "{not json", encoding: "utf8" });
	assert.equal(run.status, 2);
	assert.match(run.stderr, /hook input/);
});

test("a line that is not JSON before the end counts as a question", () => {
	assert.equal(ask([...searchAll(), "{not json"]).status, 2);
});

test("a JSON line that is not an object counts as a question", () => {
	assert.equal(ask([...searchAll(), "[1,2]"]).status, 2);
});

test("a blank line is not a question", () => {
	assert.equal(ask([...searchAll(), "   "]).status, 0);
});

test("a search after a line that is not JSON counts", () => {
	assert.equal(ask(["{not json", ...searchAll()]).status, 0);
});

test("a repeated tool_use of a completed call keeps it counted", () => {
	const gate = read(GATE);
	assert.equal(ask([...gate, gate[0], read(TASTE), read(RUBRIC), read(PLAN)]).status, 0);
});

test("a hook input without tool_name blocks", () => {
	const input = JSON.stringify({ toolName: "PushNotification", tool_input: { message: "Q-36" } });
	const run = spawnSync(process.execPath, [TOOL], { input, encoding: "utf8" });
	assert.equal(run.status, 2);
	assert.match(run.stderr, /tool_name/);
});

test("a hook input without tool_input blocks", () => {
	const input = JSON.stringify({ tool_name: "PushNotification", toolInput: { message: "Q-36" } });
	const run = spawnSync(process.execPath, [TOOL], { input, encoding: "utf8" });
	assert.equal(run.status, 2);
	assert.match(run.stderr, /tool_input/);
});

test("the block message does not name the transcript's path", () => {
	const path = join(work, "none");
	const { stderr } = guard("PushNotification", { message: "Q-36" }, [], { transcript: path });
	assert.equal(stderr.includes(path), false);
});
