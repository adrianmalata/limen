// S2 · Herdr. A fake Herdr (written below to the plant) records every call and keeps its role spaces and tabs in a
// state file; a coordinator pane hears a job's start notice and its wake through `agent prompt` and Herdr's socket API,
// and a job's end closes its tab; `limen open` and `limen diff` open a tab and record its place.
import assert from "node:assert/strict";
import { existsSync, readFileSync } from "node:fs";
import { chmod, mkdir, writeFile } from "node:fs/promises";
import { createServer } from "node:net";
import { join } from "node:path";
import { createInterface } from "node:readline";
import { after, before, type TestContext, test } from "node:test";
import { outputText, readOutcome } from "./final-line.ts";
import {
	FINAL,
	git,
	jobDir,
	jobFile,
	jobState,
	limen,
	type Plant,
	plant,
	routed,
	scopeCalls,
	startedJob,
	until,
	writeRecord,
} from "./plant.ts";
import { snapshot } from "./snapshot.ts";

const herdrSource = `#!/usr/bin/env node
const fs = require("node:fs"), path = require("node:path");
const args = process.argv.slice(2), file = path.join(__dirname, "state.json");
fs.appendFileSync(path.join(__dirname, "calls.jsonl"), JSON.stringify(args) + "\\n");
if (args[0] === "--version") { console.log("0.0.0-test"); process.exit(0); }
const state = JSON.parse(fs.readFileSync(file, "utf8"));
const save = () => { fs.writeFileSync(file + process.pid, JSON.stringify(state)); fs.renameSync(file + process.pid, file); };
const ok = (result) => { console.log(JSON.stringify({ result })); process.exit(0); };
const fail = (code) => { console.log(JSON.stringify({ error: { code, message: code } })); process.exit(1); };
const flag = (name) => args[args.indexOf(name) + 1];
const [noun, verb, target] = args;
switch (noun + " " + verb) {
	case "workspace list": ok({ workspaces: state.workspaces });
	case "workspace create": state.workspaces.push({ workspace_id: "w" + (state.workspaces.length + 1), label: flag("--label") });
		save(); ok({ workspace: state.workspaces.at(-1) });
	case "tab create": {
		const n = Object.keys(state.tabs).length + 1;
		state.tabs["t" + n] = { pane: "p" + n, cwd: flag("--cwd"), label: flag("--label") };
		save(); ok({ tab: { tab_id: "t" + n }, root_pane: { pane_id: "p" + n } });
	}
	case "tab get": ok({ tab: { tab_id: target, focused: true, label: state.tabs[target]?.label } });
	case "tab list": ok({ tabs: Object.entries(state.tabs).filter(([, row]) => !row.closed).map(([tab_id, row]) => ({ tab_id, label: row.label })) });
	case "tab rename": (state.tabs[target] ??= {}).label = args[3]; save(); ok({});
	case "tab close": (state.tabs[target] ??= {}).closed = true; save(); ok({});
	case "agent prompt": fail("agent_prompt_stalled"); // Sent, but the busy coordinator pane started no turn.
	case "status --json": console.log(JSON.stringify({ server: { running: true, socket: path.join(__dirname, "h.sock") } })); process.exit(0);
	default: ok({});
}
`;

let p: Plant;
let herdr: string;
let env: Record<string, string>;
const COORDINATOR = "coord:p0";
const calls = (): string[][] =>
	readFileSync(join(herdr, "calls.jsonl"), "utf8")
		.trim()
		.split("\n")
		.map((line) => JSON.parse(line) as string[]);
const named = (noun: string, verb: string) => calls().filter((args) => args[0] === noun && args[1] === verb);
// Herdr's socket API, served here, takes a prompt too long for one argument; as with `agent prompt`, no turn starts.
const asked: string[] = [];
const socket = createServer((conn) =>
	createInterface({ input: conn }).once("line", (line) => {
		asked.push(JSON.parse(line).params.text);
		conn.end('{"id":"","error":{"code":"agent_prompt_stalled","message":"no turn"}}\n');
	}),
);
before(async () => {
	p = await plant();
	herdr = join(p.parent, "herdr");
	await mkdir(herdr);
	await writeFile(join(herdr, "state.json"), JSON.stringify({ workspaces: [], tabs: {} }));
	await writeFile(join(herdr, "herdr"), herdrSource);
	await chmod(join(herdr, "herdr"), 0o755);
	await new Promise<void>((resolve) => socket.listen(join(herdr, "h.sock"), resolve));
	// The caller is a coordinator pane with no Pi session: its wake travels as one Herdr prompt. Sweeps confirm at once.
	env = {
		LIMEN_HERDR: join(herdr, "herdr"),
		HERDR_ENV: "1",
		HERDR_PANE_ID: COORDINATOR,
		HERDR_TAB_ID: "coord:t0",
		LIMEN_REAP_CONFIRM_MS: "1",
	};
});
after(() => p.cleanup().finally(() => socket.close()));

test("in Herdr a spawn with no mode flag runs detached under its --timeout; queued, it tells its pane once that it started", async () => {
	const reading = join(p.parent, "start-reading.json");
	await writeFile(reading, '{"cpuIdle":90,"memoryFree":10}');
	const run = limen(
		p,
		["spawn", ...routed(["--timeout", "5m", "--label", "flagless"]), `say ${FINAL.line.repeat(12)}`],
		{
			env,
		},
	);
	// D-061 (3): the queued line is the first line of spawn's text, which no early id line comes before any more.
	assert.match(run.stdout, /^queued flagless: CPU 90% idle \(gate 25%\), memory 10% free \(gate 20%\), 0 ahead\n/);
	const id = startedJob(run);
	await writeFile(reading, "{}");
	// The wake goes whole through the Herdr socket this test process serves, while the wrapper still runs: the wait
	// keeps this process's event loop free, where `waitJob` would block it until the wrapper exits.
	await until(jobDir(p, id), () => jobState(p, id) === "done");
	assert.equal(jobFile(p, id, "herdr/mode"), "watch", "a log-tail tab");
	const receipts = ["herdr-start", "herdr-prompt"].map((name) => () => jobFile(p, id, `notify/${name}`));
	await until(jobDir(p, id), () => receipts.every((receipt) => receipt().startsWith("attempt 1: delivered to")));
	const sent = [...named("agent", "prompt").map((args) => args[3] ?? ""), ...asked].filter((text) => text.includes(id));
	assert.equal(sent.map((text) => text.includes(") started after ")).join(), "true,false", "each sent once");
	assert.ok(asked.at(-1)?.includes(`Final message:\n${FINAL.text.repeat(12)}\n\n`), "whole, by socket");
});

// A-029: the job's end starts the tab's closer and then ends the job's systemd user scope; the closer runs in a scope
// of its own, so it still closes the tab.
test("a job's end closes its Herdr tab from a systemd user scope of its own", async () => {
	const run = limen(p, ["spawn", ...routed(["--label", "closed tab"]), "say closed"], { env });
	const id = startedJob(run);
	await until(jobDir(p, id), () => jobState(p, id) === "done");
	const tab = jobFile(p, id, "herdr/tab");
	await until(herdr, () => named("tab", "close").some((args) => args[2] === tab));
	const closer =
		/^--user --scope --quiet --collect --unit=limen-run-[0-9a-f]{8}\.scope -- \S+ --no-warnings --input-type=module --eval import \{ closeJobTab \}/;
	assert.ok(scopeCalls(p, "systemd-run").some((words) => closer.test(words) && words.includes(jobDir(p, id))));
});

/**
 * A done job of the plant `on` (the shared one by default) written by hand, labelled `label`, whose branch and base are
 * main, with no recorded tab.
 */
async function handJob(id: string, label: string, on: Plant = p): Promise<string> {
	const head = git(on.root, "rev-parse", "HEAD");
	await writeRecord(jobDir(on, id), { state: "done", label, branch: "main", base: head });
	return id;
}

/**
 * A plant of its own for a test that compares snapshots, since a job's end in the shared plant leaves a detached closer
 * that writes the job's log; removed after the test.
 */
async function quiet(t: TestContext): Promise<Plant> {
	const own = await plant();
	t.after(() => own.cleanup());
	return own;
}

// D-096 (2): `limen open` was a read command, though it records the place of the tab it opens.
test("limen open: opens a finished job's log tab in Herdr, records its place, and says so", async () => {
	const id = await handJob("2026-11-25-open-1a2b3c4d", "open me");
	const run = limen(p, ["open", id], { env });
	assert.equal(run.status, 0, run.stderr);
	const tab = jobFile(p, id, "herdr/tab");
	assert.deepEqual(
		[
			outputText(run),
			jobFile(p, id, "herdr/mode"),
			named("tab", "create").some((args) => args.includes("open me · done")),
		],
		["opened open me\n", "log", true],
		tab,
	);
});

// R-103 Decision 23 (b): a close marks a place whose tab it found gone; a new tab recorded there is asked about again.
test("a tab that limen open records removes the mark an earlier close left in its place", async () => {
	const id = await handJob("2026-11-25-reopen-5e6f7a8b", "reopen me");
	await mkdir(join(jobDir(p, id), "herdr"), { recursive: true });
	await writeFile(join(jobDir(p, id), "herdr", "closed"), "t1\n");
	assert.equal(limen(p, ["open", id], { env }).status, 0);
	assert.equal(existsSync(join(jobDir(p, id), "herdr", "closed")), false);
});

// D-096 (2): `limen diff` in Herdr opens a tab and records its place, so it is a change command.
test("limen diff: in Herdr opens the job's diff in a tab that runs Hunk, records its place, and says so", async () => {
	const id = await handJob("2026-11-25-diff-9c0d1e2f", "diff me");
	const run = limen(p, ["diff", id], { env: { ...env, LIMEN_HUNK: join(herdr, "herdr") } });
	assert.equal(run.status, 0, run.stderr);
	const pane = jobFile(p, id, "herdr/diff/pane");
	assert.deepEqual(
		[
			outputText(run),
			jobFile(p, id, "herdr/diff/mode"),
			named("pane", "run").some((args) => args[2] === pane && args[3] === join(herdr, "herdr")),
		],
		["opened diff me diff\n", "diff", true],
	);
});

// D-096 (2): without Herdr, `limen diff` still names the git command that shows the change, and writes nothing.
test("limen diff without Herdr or a terminal names the git command that shows the change and writes nothing", async (t) => {
	const own = await quiet(t);
	const id = await handJob("2026-11-25-plain-3a4b5c6d", "plain diff", own);
	const before = snapshot(own.root);
	const run = limen(own, ["diff", id], { env: { LIMEN_HUNK: join(herdr, "herdr") } });
	const base = git(own.root, "rev-parse", "HEAD");
	assert.deepEqual(
		[run.status, outputText(run), snapshot(own.root)],
		[0, `git diff ${base}...main\n`, before],
		run.stderr,
	);
});

test("HERDR_UNAVAILABLE: limen open where Herdr is not available exits 1 and leaves the snapshot identical", async (t) => {
	const own = await quiet(t);
	const id = await handJob("2026-11-25-noherdr-7e8f9a0b", "no herdr", own);
	const before = snapshot(own.root);
	const run = limen(own, ["open", id]);
	assert.deepEqual(
		[run.status, readOutcome(run), snapshot(own.root)],
		[1, { class: "refused", code: "HERDR_UNAVAILABLE", next: null }, before],
		run.stderr,
	);
});
