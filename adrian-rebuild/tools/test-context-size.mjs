/* PL: Test narzędzia context-size.mjs (M-01, R-039) w obu formach. Forma nowa: kod drzewa roboczego zatwierdzony
   w repozytorium tymczasowym, gdzie raport daje dla każdej roli z szablonów wiadomość kontekstową o rozmiarze jej pliku
   wzorcowego z test/runtime/context-message/ oraz cue. Forma stara: ref a0.3.0, gdzie zostają kolumny promptu
   systemowego. Oba przebiegi idą bez `pi` na PATH, bo fikstura daje atrapę. Raport trafia do katalogu tymczasowego
   systemu. Stan: działa. */
// Usage: node --test adrian-rebuild/tools/test-context-size.mjs   (from the repo root)
import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { cpSync, existsSync, mkdtempSync, readFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { test } from "node:test";
import { fileURLToPath } from "node:url";

const TOOLS = dirname(fileURLToPath(import.meta.url));
const REPO = join(TOOLS, "..", "..");
const SIZE = join(TOOLS, "context-size.mjs");
/** The paths of the code that context-size.mjs extracts at a ref (role-context.mjs). */
const CODE = ["bin", "src", "hook", "templates", "package.json"];
/** The older ref: the tag of stage 3, whose hooks appended Limen's text to Pi's system prompt. */
const OLDER = "a0.3.0";
const IDENTITY = ["-c", "user.name=context-size", "-c", "user.email=context-size@example.invalid"];
/** Each row's name with the reference file of its context message (test/runtime/context-message/). */
const ROWS = [
	["coordinator (owner-facing)", "owner-facing-coordinator.md"],
	["judge", "judge.md"],
	["keeper", "keeper.md"],
	["quality", "quality.md"],
	["researcher", "researcher.md"],
	["reviewer", "reviewer.md"],
	["worker", "worker.md"],
	["group team (`coordinator.md`)", "group-team.md"],
];

function run(command, args, options = {}) {
	const result = spawnSync(command, args, { encoding: "utf8", maxBuffer: 1 << 30, ...options });
	assert.equal(result.status, 0, `${command} ${args.join(" ")}: ${result.stderr}`);
	return result.stdout;
}

/** A folder in the OS temporary folder, removed after the test `t`. */
function temporary(t, prefix) {
	const dir = mkdtempSync(join(tmpdir(), prefix));
	t.after(() => rmSync(dir, { recursive: true, force: true }));
	return dir;
}

/** A scratch repository whose one commit holds the working tree's code, so its HEAD is the code under test. */
function scratch(t) {
	const dir = temporary(t, "limen-size-scratch-");
	for (const path of CODE) {
		cpSync(join(REPO, path), join(dir, path), { recursive: true });
	}
	const env = { ...process.env, GIT_CONFIG_GLOBAL: "/dev/null", GIT_CONFIG_NOSYSTEM: "1" };
	run("git", ["init", "-q"], { cwd: dir, env });
	run("git", ["add", "-A"], { cwd: dir, env });
	run("git", [...IDENTITY, "commit", "-q", "-m", "code"], { cwd: dir, env });
	return dir;
}

/** PATH without a folder that holds a `pi`, so the measurement runs as on a host with no Pi. */
function pathWithoutPi() {
	return (process.env.PATH ?? "")
		.split(":")
		.filter((dir) => dir && !existsSync(join(dir, "pi")))
		.join(":");
}

/** The report of context-size.mjs at `ref`, run in the repository `cwd`, written to a temporary file. */
function measure(t, cwd, ref) {
	const out = join(temporary(t, "limen-size-report-"), "sizes.md");
	run(process.execPath, [SIZE, ref, "--out", out], { cwd, env: { ...process.env, PATH: pathWithoutPi() } });
	return readFileSync(out, "utf8");
}

/** The row of the table of `report` whose first cell is `name`. */
function row(report, name) {
	return report.split("\n").find((line) => line.startsWith(`| ${name} |`));
}

test("for a ref with the context message module, the report gives each role's context message, the size of its reference, and the cue", (t) => {
	const report = measure(t, scratch(t), "HEAD");
	const sized = ROWS.map(([name, reference]) => {
		const bytes = readFileSync(join(REPO, "test/runtime/context-message", reference)).length;
		return [name, row(report, name)?.split(" | ")[1]?.startsWith(`${bytes} B ≈`)];
	});
	assert.deepEqual(
		{ header: report.includes("\n| Role | Context message | Cue |\n"), sized },
		{ header: true, sized: ROWS.map(([name]) => [name, true]) },
	);
});

test("for a ref with the context message module, the report has a row for each role template of the ref and no other", (t) => {
	const report = measure(t, scratch(t), "HEAD");
	const lines = report.slice(report.indexOf("| Role | Context message | Cue |")).split("\n").slice(2);
	const table = lines.slice(
		0,
		lines.findIndex((line) => !line.startsWith("| ")),
	);
	assert.deepEqual(
		table.map((line) => line.split(" | ")[0]?.slice(2)),
		ROWS.map(([name]) => name),
	);
});

test(`for an older ref, ${OLDER}, the report keeps the system prompt's columns and the roles of that ref's templates`, {
	skip:
		spawnSync("git", ["rev-parse", "--verify", "--quiet", `${OLDER}^{commit}`], { cwd: REPO }).status === 0
			? false
			: `no ${OLDER} in this repository; a fresh clone has no local tags`,
}, (t) => {
	const report = measure(t, REPO, OLDER);
	const header = "| Role | Preamble | Limen block | Limen tools | Fixed per request | Per prompt | Once per session |";
	assert.deepEqual(
		{
			header: report.includes(`\n${header}\n`),
			rows: ROWS.map(([name]) => Boolean(row(report, name))),
			cut: ["scout", "picture"].map((name) => Boolean(row(report, name))),
		},
		{ header: true, rows: ROWS.map(() => true), cut: [false, false] },
	);
});
