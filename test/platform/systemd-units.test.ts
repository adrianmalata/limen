// src/platform/systemd-units.ts: the seat sweep's user units as golden texts, the width of their lines, the renderer's
// refusal of a value that would add a line and of a package root ExecStart cannot hold as one word, and the one
// placement of unit files: what it writes, verifies and puts back.
import assert from "node:assert/strict";
import { existsSync } from "node:fs";
import { mkdir, mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test, { type TestContext } from "node:test";
import { LimenError } from "../../src/outcome.ts";
import type { ManagerCall } from "../../src/platform/platform.ts";
import {
	placeUnitFiles,
	renderUnit,
	SWEEP_SERVICE,
	SWEEP_TIMER,
	sweepUnits,
	type UnitDefinition,
	type UnitFile,
} from "../../src/platform/systemd-units.ts";

/** A PATH of an installing shell, fixed so that the golden texts do not depend on the machine (R-034 (g)). */
const PATH = "/home/agents/.local/bin:/usr/local/bin:/usr/bin:/bin";

/** The text of the sweep unit `name` for the seat's package root and the installing shell's `path`. */
function rendered(name: string, root = "/opt/limen", path = PATH): string {
	const unit = sweepUnits(root, path).find((each) => each.file === name);
	assert.ok(unit, `no unit ${name}`);
	return renderUnit(unit);
}

const HEADER = "# Written by limen seat sweep --install, which writes it again only when its text changes.";

// A-024, T-26 (4), D-056 (4): `limen` by an absolute path under root's Node, with a bound above the 60 s lock wait;
// R-034 (g): the installing shell's PATH, where a resumed job's start finds pi, node and herdr.
test("limen-sweep.service renders as its golden text: a oneshot run of the package's limen seat sweep with the installing PATH, stopped after 300 s", () => {
	assert.equal(
		rendered(SWEEP_SERVICE),
		[
			HEADER,
			"[Unit]",
			"Description=Limen seat sweep: end the dead jobs of every registered project",
			"",
			"[Service]",
			"Type=oneshot",
			"ExecStart=/usr/bin/node /opt/limen/bin/limen seat sweep",
			`Environment="PATH=${PATH}"`,
			"TimeoutStartSec=300",
			"",
		].join("\n"),
	);
});

test("limen-sweep.timer renders as its golden text: every minute, from boot", () => {
	assert.equal(
		rendered(SWEEP_TIMER),
		[
			HEADER,
			"[Unit]",
			"Description=Run the Limen seat sweep every minute",
			"",
			"[Timer]",
			"OnBootSec=1min",
			"OnUnitActiveSec=1min",
			"AccuracySec=1s",
			"Unit=limen-sweep.service",
			"",
			"[Install]",
			"WantedBy=timers.target",
			"",
		].join("\n"),
	);
});

test("T-10: every line of both sweep units is at most 100 characters", () => {
	const wide = [SWEEP_SERVICE, SWEEP_TIMER]
		.flatMap((name) => rendered(name).split("\n"))
		.filter((line) => [...line].length > 100);
	assert.deepEqual(wide, []);
});

test("the service runs the bin/limen of the package root it is given, a trailing slash left out", () => {
	assert.match(
		rendered(SWEEP_SERVICE, "/home/agents/limen/"),
		/^ExecStart=\/usr\/bin\/node \/home\/agents\/limen\/bin\/limen seat sweep$/m,
	);
});

test("a package root with a space, which ExecStart would read as two words, is refused before a unit holds it", () => {
	assert.throws(() => sweepUnits("/opt/my limen", PATH), /one word/);
});

// systemd splits an unquoted Environment= at white space, reads C escapes inside quotes and specifiers after %.
test("the service's PATH is quoted with its quotes, backslashes and percent signs escaped, so systemd reads it whole", () => {
	assert.match(
		rendered(SWEEP_SERVICE, "/opt/limen", '/opt/my tools/bin:/opt/a"b:/opt/c\\d:/opt/e%f'),
		/^Environment="PATH=\/opt\/my tools\/bin:\/opt\/a\\"b:\/opt\/c\\\\d:\/opt\/e%%f"$/m,
	);
});

test("a unit value with a line break is refused, so a value cannot add a directive of its own", () => {
	const unit = {
		file: "odd.service",
		header: "# a unit of the test",
		sections: [{ name: "Service", directives: [["User", "alerts\nExecStartPre=/bin/sh -c id"]] }],
	} satisfies UnitDefinition;
	assert.throws(() => renderUnit(unit), /User/);
});

test("a header that is no comment line is refused, so the first line of a unit cannot be a directive", () => {
	const unit = {
		file: "odd.service",
		header: "ExecStartPre=/bin/sh -c id",
		sections: [{ name: "Service", directives: [["Type", "oneshot"]] }],
	} satisfies UnitDefinition;
	assert.throws(() => renderUnit(unit), /header/);
});

/** Two unit files in a new folder of the OS temporary folder, removed after the test; their paths and the folder. */
async function unitFolder(t: TestContext): Promise<{ readonly folder: string; readonly files: UnitFile[] }> {
	const folder = await mkdtemp(join(tmpdir(), "limen-place-units-"));
	t.after(() => rm(folder, { recursive: true, force: true }));
	const files = ["a.service", "a.timer"].map((name) => ({ path: join(folder, name), text: `# ${name}\n[Unit]\n` }));
	return { folder, files };
}

/** A verifier that answers `answer` and keeps the paths of each call. */
function verifier(answer: ManagerCall = { kind: "done" }) {
	const calls: (readonly string[])[] = [];
	const verify = (paths: readonly string[]): ManagerCall => {
		calls.push(paths);
		return answer;
	};
	return { calls, check: { name: "the tests' verify", verify } };
}

// T-25 (1), R-032 review round 1, note 1: the sweep's install and the alerts' install place unit files by one policy.
test("placeUnitFiles writes only a file whose text differs, verifies every file once when it wrote one, and returns what it wrote", async (t) => {
	const { files } = await unitFolder(t);
	await writeFile(files[1]?.path ?? "", files[1]?.text ?? "");
	const first = verifier();
	const written = await placeUnitFiles(files, first.check, null);
	const second = verifier();
	const again = await placeUnitFiles(files, second.check, null);
	assert.deepEqual(
		[written, first.calls, again, second.calls, await Promise.all(files.map((file) => readFile(file.path, "utf8")))],
		[[files[0]?.path], [files.map((file) => file.path)], [], [], files.map((file) => file.text)],
	);
});

test("UNITS_INVALID: a failed verification puts each file placeUnitFiles wrote back as it was, an earlier text or none", async (t) => {
	const { files } = await unitFolder(t);
	await writeFile(files[1]?.path ?? "", "# earlier\n");
	const failing = verifier({ kind: "failed", detail: "Unknown key name 'Typo'" });
	await assert.rejects(placeUnitFiles(files, failing.check, "limen seat sweep --install"), (error: unknown) => {
		assert.ok(error instanceof LimenError);
		assert.deepEqual(
			[error.class, error.code, error.next],
			["environment", "UNITS_INVALID", "limen seat sweep --install"],
		);
		assert.equal(
			error.message,
			"the tests' verify failed for a.service and a.timer: Unknown key name 'Typo'; the units are back as they were",
		);
		return true;
	});
	assert.deepEqual(
		[existsSync(files[0]?.path ?? ""), await readFile(files[1]?.path ?? "", "utf8")],
		[false, "# earlier\n"],
	);
});

test("UNIT_FILE_UNREADABLE: a unit file that cannot be read ends placeUnitFiles before it writes any file", async (t) => {
	const { files } = await unitFolder(t);
	await mkdir(files[1]?.path ?? "");
	const check = verifier();
	await assert.rejects(placeUnitFiles(files, check.check, null), { code: "UNIT_FILE_UNREADABLE" });
	assert.deepEqual([existsSync(files[0]?.path ?? ""), check.calls], [false, []]);
});
