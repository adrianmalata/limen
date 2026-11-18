/* PL: Test modułu tool-calls.mjs (D-026): liczenie wywołań narzędzi sesji głównej w wyjściu stream-json Claude Code,
   z podziałem na odcinki zakończone udanym git commit. Jeden test sprawdza jedną regułę (T-29): zdarzenia subagenta
   się nie liczą, blok liczy się raz, separatory &&, ; i |, nieudany commit nie zamyka odcinka, temat z -m, z heredoc
   i z grupy flag (-am), commit bez -m, linie spoza JSON, ostatni odcinek i pusty strumień. Stan: działa. */
// Usage: node --test adrian-rebuild/tools/test-tool-calls.mjs
import assert from "node:assert/strict";
import { test } from "node:test";
import { countToolCalls } from "./tool-calls.mjs";

let ids = 0;
const nextId = () => {
	ids += 1;
	return `toolu_${ids}`;
};

/** One `assistant` event with one `tool_use` block; `parent` marks a subagent's event. */
function call(name, input = {}, { parent = null, id = nextId() } = {}) {
	const event = {
		type: "assistant",
		message: { content: [{ type: "tool_use", id, name, input }] },
		parent_tool_use_id: parent,
	};
	return { id, line: JSON.stringify(event) };
}

/** The `user` event with the result of tool call `id`. */
function result(id, isError = false) {
	return JSON.stringify({
		type: "user",
		message: { content: [{ type: "tool_result", tool_use_id: id, content: "", is_error: isError }] },
		parent_tool_use_id: null,
	});
}

/** A Bash `git commit` call and its successful result. */
function commit(command) {
	const made = call("Bash", { command });
	return [made.line, result(made.id)];
}

const stream = (...lines) => `${lines.flat().join("\n")}\n`;

test("a subagent's tool calls do not count, only the main session's", () => {
	const text = stream(call("Read").line, call("Read", {}, { parent: "toolu_agent" }).line, call("Grep").line);
	assert.deepEqual(countToolCalls(text), [{ calls: 2, commit: undefined }]);
});

test("a tool_use block that appears in two events counts once", () => {
	const once = call("Read");
	assert.deepEqual(countToolCalls(stream(once.line, once.line)), [{ calls: 1, commit: undefined }]);
});

test("a successful git commit ends a segment named by the subject of its first -m", () => {
	const text = stream(call("Read").line, commit(`git add a && git commit -q -m "R-001: Leftover files" -m "body"`));
	assert.deepEqual(countToolCalls(text), [
		{ calls: 2, commit: "R-001: Leftover files" },
		{ calls: 0, commit: undefined },
	]);
});

test("a single-quoted -m keeps its backslashes, as the shell does", () => {
	assert.equal(countToolCalls(stream(commit("git commit -m 'R-008: a\\b'")))[0].commit, "R-008: a\\b");
});

test("a single-quoted -m gives the subject as well", () => {
	assert.equal(countToolCalls(stream(commit("git commit -m 'R-002: Cut webhooks'")))[0].commit, "R-002: Cut webhooks");
});

test("a git commit after ; or | ends a segment as well", () => {
	const text = stream(commit('git add a; git commit -m "R-004: one"'), commit('true | git commit -m "R-005: two"'));
	assert.deepEqual(
		countToolCalls(text).map(({ commit: subject }) => subject),
		["R-004: one", "R-005: two", undefined],
	);
});

test("the subject of a heredoc message is its first line", () => {
	const command = `git commit -m "$(cat <<'EOF'\nR-006: Cut private planning\n\nThe body "quoted".\nEOF\n)"`;
	assert.equal(countToolCalls(stream(commit(command)))[0].commit, "R-006: Cut private planning");
});

test("-m at the end of a group of short flags gives the subject", () => {
	assert.equal(
		countToolCalls(stream(commit('git commit -qam "R-007: Cut the viewer"')))[0].commit,
		"R-007: Cut the viewer",
	);
});

test("a git commit whose result is an error ends no segment", () => {
	const failed = call("Bash", { command: 'git commit -m "R-003: Cut Devin"' });
	const text = stream(failed.line, result(failed.id, true), call("Read").line);
	assert.deepEqual(countToolCalls(text), [{ calls: 2, commit: undefined }]);
});

test("a git commit without -m ends its segment with the commit null", () => {
	assert.deepEqual(countToolCalls(stream(commit("git commit -F message.txt"))), [
		{ calls: 1, commit: null },
		{ calls: 0, commit: undefined },
	]);
});

test("a command that only mentions git commit, not as a command, ends no segment", () => {
	const text = stream(commit('grep -n "git commit" plan.md'));
	assert.deepEqual(countToolCalls(text), [{ calls: 1, commit: undefined }]);
});

test("lines that are not JSON objects are skipped", () => {
	const text = stream("night: run 1 started", "fake stderr", "[1,2]", "null", call("Read").line, "{broken");
	assert.deepEqual(countToolCalls(text), [{ calls: 1, commit: undefined }]);
});

test("the calls after the last commit form the last segment", () => {
	const text = stream(commit('git commit -m "R-001: a"'), call("Read").line, call("Edit").line);
	assert.deepEqual(countToolCalls(text), [
		{ calls: 1, commit: "R-001: a" },
		{ calls: 2, commit: undefined },
	]);
});

test("a stream with no tool call gives one segment with no calls", () => {
	assert.deepEqual(countToolCalls(""), [{ calls: 0, commit: undefined }]);
});
