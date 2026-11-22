// The system requirements that the platform adapter declares (src/platform/requirements.ts).
import assert from "node:assert/strict";
import { mkdtemp, readFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { type TestContext, test } from "node:test";
import { finalLine, LimenError } from "../../src/outcome.ts";
import { NODE_MAJOR, nodeFailure, REQUIREMENTS } from "../../src/platform/requirements.ts";
import { withEnvironment } from "../environment.ts";
import { failingSystemdRun, fakeSystemd } from "../plant.ts";

// bin/limen checks Node before it can load src/, so it holds its own copy of the number; package.json holds a third.
test("bin/limen and package.json require the Node major that the adapter declares", async () => {
	const bin = await readFile(new URL("../../bin/limen", import.meta.url), "utf8");
	const manifest = JSON.parse(await readFile(new URL("../../package.json", import.meta.url), "utf8"));
	assert.deepEqual(
		[Number(/major < (\d+)/.exec(bin)?.[1]), Number(/requires Node\.js (\d+)/.exec(bin)?.[1]), manifest.engines.node],
		[NODE_MAJOR, NODE_MAJOR, `>=${NODE_MAJOR}`],
	);
});

test("NODE_VERSION: the Node probe refuses the major below the declared one with an environment error and passes the declared one", () => {
	const old = nodeFailure(`${NODE_MAJOR - 1}.9.0`);
	assert.deepEqual(
		[old instanceof LimenError && [old.class, old.code], nodeFailure(`${NODE_MAJOR}.0.0`)],
		[["environment", "NODE_VERSION"], undefined],
	);
});

// bin/limen checks Node before it can load src/, so it writes the Node failure itself, with the adapter's words.
test("NODE_VERSION: bin/limen prints the message and the final line of the adapter's Node failure", async () => {
	const bin = await readFile(new URL("../../bin/limen", import.meta.url), "utf8");
	const failure = nodeFailure("unknown");
	assert.ok(failure);
	const version = ["$", "{process.versions.node}"].join("");
	const message = `\`${failure.message.replace("unknown", version)}\``;
	const line = `'${finalLine({ class: failure.class, code: failure.code, next: failure.next })}'`;
	assert.deepEqual([bin.includes(message), bin.includes(line)], [true, true], `${message}\n${line}`);
});

/** The probe of the systemd user scope, which runs systemd-run as the PATH of this process finds it. */
function userScopeProbe(): () => LimenError | undefined {
	const probe = REQUIREMENTS.find(({ tool }) => tool === "systemd-run")?.probe;
	assert.ok(probe, "the requirements declare systemd-run");
	return probe;
}

/** A folder in the OS temporary folder, removed after the test. */
async function folder(t: TestContext): Promise<string> {
	const made = await mkdtemp(join(tmpdir(), "limen-requirements-"));
	t.after(() => rm(made, { recursive: true, force: true }));
	return made;
}

// A-029: every job runs in its own systemd user scope, so a host where none starts cannot run a job.
test("MISSING_FEATURE: the user-scope probe passes when a user scope starts, and refuses with an environment error that names lingering when it fails", async (t) => {
	const made = await folder(t);
	const systemd = await fakeSystemd(made);
	withEnvironment(t, systemd);
	const started = userScopeProbe()();
	process.env.PATH = `${await failingSystemdRun(made)}:${systemd.PATH}`;
	const failed = userScopeProbe()();
	assert.deepEqual(
		[started, failed instanceof LimenError && [failed.class, failed.code], failed?.message.includes("lingering")],
		[undefined, ["environment", "MISSING_FEATURE"], true],
	);
	assert.match(failed?.message ?? "", /Failed to connect to bus: No medium found/);
});

test("MISSING_TOOL: the user-scope probe refuses with an environment error when systemd-run is not on PATH", async (t) => {
	withEnvironment(t, { PATH: await folder(t) });
	const missing = userScopeProbe()();
	assert.deepEqual(
		[
			missing instanceof LimenError && [missing.class, missing.code],
			missing?.message.startsWith("systemd-run is not on PATH"),
		],
		[["environment", "MISSING_TOOL"], true],
	);
});
