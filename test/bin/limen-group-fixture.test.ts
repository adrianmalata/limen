// The manual group fixture, bin/limen-group-fixture.mjs: the shell exports it prints for the interactive lead.
import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { mkdir, mkdtemp, rm, symlink } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";
import { ENVIRONMENT } from "../../src/config.ts";
import { fakeSystemd } from "../plant.ts";

const FIXTURE = fileURLToPath(new URL("../../bin/limen-group-fixture.mjs", import.meta.url));
const FAKE_ENGINE = fileURLToPath(new URL("../fake-engine.mjs", import.meta.url));
const KINDS = new Map<string, string>(Object.entries(ENVIRONMENT).map(([name, entry]) => [name, entry.kind]));

// T-03, R-087 (b): Limen reads a knob only in test mode, so a lead whose shell holds the fixture's LIMEN_HOME without
// the marker would register the throwaway fixture, and queue its jobs, in the account's own seat folder.
test("T-03: the group fixture's exports for the interactive lead set LIMEN_TEST_MODE=1 whenever they set a test knob", async (t) => {
	const folder = await mkdtemp(join(tmpdir(), "limen-group-fixture-"));
	t.after(() => rm(folder, { recursive: true, force: true }));
	// The fixture's `limen init` checks the system requirements: the tests' systemd and the fake engine as `pi`.
	const systemd = await fakeSystemd(folder);
	const bin = join(folder, "bin");
	await mkdir(bin);
	await symlink(FAKE_ENGINE, join(bin, "pi"));
	const run = spawnSync(process.execPath, [FIXTURE, join(folder, "repository")], {
		encoding: "utf8",
		env: {
			...systemd,
			PATH: `${bin}:${systemd.PATH}`,
			HOME: folder,
			TMPDIR: tmpdir(),
			GIT_CONFIG_GLOBAL: "/dev/null",
			GIT_CONFIG_NOSYSTEM: "1",
		},
	});
	assert.equal(run.status, 0, run.stderr);
	const exported = new Map(
		[...run.stdout.matchAll(/^\s*export ([A-Z_][A-Z0-9_]*)=(.*)$/gm)].map(([, name = "", value = ""]) => [name, value]),
	);
	assert.ok(exported.size > 0, `no export line in:\n${run.stdout}`);
	const knobs = [...exported.keys()].filter((name) => KINDS.get(name) === "test" && name !== "LIMEN_TEST_MODE");
	assert.ok(
		knobs.length === 0 || exported.get("LIMEN_TEST_MODE") === "1",
		`${knobs.join(", ")} without LIMEN_TEST_MODE=1 in:\n${run.stdout}`,
	);
});
