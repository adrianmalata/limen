// hook/wake.ts: the `limen` command reads its arguments from Pi only through a guard.
import assert from "node:assert/strict";
import test from "node:test";
import limenWake from "../../hook/wake.ts";
import { LimenError } from "../../src/outcome.ts";
import { withEnvironment } from "../environment.ts";

/** The handler of the `limen` command that the hook registers on a fake `pi`. */
function commandHandler(): (args: unknown, context: unknown) => Promise<void> {
	const commands = new Map<string, unknown>();
	limenWake({
		on() {},
		sendUserMessage() {},
		registerCommand: (name: string, command: unknown) => commands.set(name, command),
	});
	const command = commands.get("limen");
	const handler = typeof command === "object" && command !== null ? Reflect.get(command, "handler") : undefined;
	assert.ok(typeof handler === "function", "the hook registers the limen command");
	return async (args, context) => {
		await handler(args, context);
	};
}

test("the limen command refuses arguments that are not a string with BAD_DATA naming them", async (t) => {
	withEnvironment(t, { LIMEN_JOB: "" });
	const context = { ui: { notify() {}, setStatus() {} } };
	await assert.rejects(
		commandHandler()(["on"], context),
		(error) =>
			error instanceof LimenError && error.code === "BAD_DATA" && /: args: expected a string/.test(error.message),
	);
});
