// test/fake-engine.mjs: a run takes the messages queued during its turns, then settles once, as Pi does (E-16), and
// the engine records the name of every variable of its environment.
import assert from "node:assert/strict";
import { execFileSync, spawn } from "node:child_process";
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { mkdir, mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { test } from "node:test";
import { fileURLToPath } from "node:url";
import { engineEvents, plant, until, writeRecord } from "./plant.ts";

const FAKE_ENGINE = fileURLToPath(new URL("./fake-engine.mjs", import.meta.url));
const WAKE_HOOK = fileURLToPath(new URL("../hook/wake.ts", import.meta.url));
const SESSION = "coord";

// R-087 (e): a test of a job's environment shows a dropped name of any kind, not only a Limen, Herdr or Pi one.
test("the fake engine records the name of every variable of its environment in fake-env.json, and no value", async (t) => {
	const dir = await mkdtemp(join(tmpdir(), "limen-fake-env-"));
	t.after(() => rm(dir, { recursive: true, force: true }));
	await writeFile(join(dir, "task.md"), "say recorded\n");
	const env = { PATH: process.env.PATH ?? "", DEMO_API_TOKEN: "dummy-not-a-secret", LIMEN_JOB: "1" };
	execFileSync(process.execPath, [FAKE_ENGINE, "--session-dir", join(dir, "session"), `@${join(dir, "task.md")}`], {
		cwd: dir,
		env,
		stdio: "ignore",
	});
	const recorded = readFileSync(join(dir, "fake-env.json"), "utf8");
	assert.deepEqual(
		[JSON.parse(recorded), recorded.includes("dummy-not-a-secret")],
		[["DEMO_API_TOKEN", "LIMEN_JOB", "PATH"], false],
	);
});

/**
 * The source of an extension that holds the session's first turn at its start until one write to the FIFO
 * `hold-gate` in `dir`, and writes `held` there while it holds; later turns are not held.
 */
function holdExtension(dir: string): string {
	const gate = JSON.stringify(join(dir, "hold-gate"));
	const held = JSON.stringify(join(dir, "held"));
	return `import { createReadStream, writeFileSync } from "node:fs";
let first = true;
export default function hold(pi) {
	pi.on("turn_start", async () => {
		if (!first) {
			return;
		}
		first = false;
		const released = new Promise((resolve) => createReadStream(${gate}).once("data", resolve));
		writeFileSync(${held}, "");
		await released;
	});
}
`;
}

/** A done job of the session, written by hand: routable and subscribed first, so its done record wakes the session. */
async function finished(jobs: string, id: string): Promise<void> {
	const job = join(jobs, id);
	await mkdir(join(job, "notify", "subscribers"), { recursive: true });
	await writeFile(join(job, "notify", "ready"), "1\n");
	await writeFile(join(job, "notify", "subscribers", SESSION), `${new Date().toISOString()}\n`);
	await writeRecord(job, { state: "done", label: id, finishedAt: new Date().toISOString() });
}

// A run that settled before the follow-up queued during its turn entered made the wake hook count that wake as
// unconfirmed and send it again: the extra wake of test/s3-finish-wake.test.ts (R-096).
test("a wake sent while a coordinator's turn runs enters the same run before the run settles, so the session hears it once", async (t) => {
	const p = await plant();
	t.after(() => p.cleanup());
	const dir = join(p.parent, SESSION);
	mkdirSync(dir);
	execFileSync("mkfifo", [join(dir, "hold-gate")]);
	writeFileSync(join(dir, "hold.mjs"), holdExtension(dir));
	writeFileSync(join(dir, "task.md"), "block\n");
	const jobs = join(p.root, ".limen", "jobs");
	const [early, late] = ["2026-11-21-early-0001", "2026-11-21-late-0002"];
	await finished(jobs, early);
	const args = ["--session-dir", join(dir, "session"), "--extension", WAKE_HOOK, "--extension", join(dir, "hold.mjs")];
	const options = { cwd: p.root, env: { ...p.env, PI_SESSION_ID: SESSION }, stdio: "ignore" } as const;
	spawn(join(p.bin, "pi"), [...args, `@${join(dir, "task.md")}`], options);
	const wakes = (id: string) =>
		engineEvents(dir).filter((event) => event.text?.startsWith("Limen job") && event.text.includes(id));
	// The early job's wake opens a turn, which holds; the late job ends meanwhile, and the hook sends its wake then.
	await until(dir, () => existsSync(join(dir, "held")));
	await finished(jobs, late);
	await until(dir, () => wakes(late).length > 0);
	await writeFile(join(dir, "hold-gate"), "go\n");
	// A delivered slot, or a claim blocked after two attempts, means every wake of the late job is recorded.
	const notify = (path: string) => join(jobs, late, "notify", path);
	await until(
		jobs,
		() => existsSync(notify(`delivered/${SESSION}`)) || existsSync(notify(`claims/${SESSION}/blocked`)),
	);
	assert.deepEqual(
		{
			wakes: [early, late].map((id) => wakes(id).map((wake) => wake.event)),
			unconfirmed: existsSync(notify("unconfirmed")),
		},
		{ wakes: [["user"], ["followUp"]], unconfirmed: false },
	);
});
