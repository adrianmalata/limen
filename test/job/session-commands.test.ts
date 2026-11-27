// src/job/session-commands.ts: the splitter `limen stats` reads a coordinator's bash calls with, on literal commands.
import assert from "node:assert/strict";
import test from "node:test";
import { simpleCommands } from "../../src/job/session-commands.ts";

test("simpleCommands splits a shell call at &&, ; and a pipe into its simple commands, in order", () => {
	assert.deepEqual(["cd . && npm test -- x", "false && npm test; true", "npm test | cat"].map(simpleCommands), [
		["cd .", "npm test -- x"],
		["false", "npm test", "true"],
		["npm test", "cat"],
	]);
});

test("simpleCommands drops a leading ! and the assignments and wrappers before a command", () => {
	assert.deepEqual(["! PATH=/x npm test", "cd . && CI=1 timeout 60 npm test"].map(simpleCommands), [
		["npm test"],
		["cd .", "npm test"],
	]);
});

test("simpleCommands keeps quoted text whole, a separator in quotes included, so a quoted command is no command", () => {
	assert.deepEqual(["printf '%s\\n' 'npm test'", "echo 'a; b' && ls"].map(simpleCommands), [
		["printf '%s\\n' 'npm test'"],
		["echo 'a; b'", "ls"],
	]);
});

test("simpleCommands gives each part of an if at its separators, the keyword with it", () => {
	assert.deepEqual(simpleCommands("if true; then exit 0; fi; npm test"), ["if true", "then exit 0", "fi", "npm test"]);
});
