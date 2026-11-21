// S2 · Herdr. A fake Herdr (written below to the plant) records every call and keeps its role spaces and tabs in a
// state file; a coordinator pane hears a job's start notice, its wake and the rule pings through `agent prompt` and
// Herdr's socket API.
import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { readFileSync } from "node:fs";
import { chmod, mkdir, writeFile } from "node:fs/promises";
import { createServer } from "node:net";
import { join } from "node:path";
import { createInterface } from "node:readline";
import { after, before, test } from "node:test";
import { outputText } from "./final-line.ts";
import {
	FINAL,
	jobDir,
	jobFile,
	jobState,
	limen,
	type Plant,
	plant,
	routed,
	start,
	startedJob,
	until,
} from "./plant.ts";

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
/** Runs the CLI without blocking the event loop, so two sweeps can race. */
const limenAsync = async (args: readonly string[]) => (await start(p, args, { env }).done).status;

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
	assert.match(run.stdout, /\nqueued flagless: CPU 90% idle \(gate 25%\), memory 10% free \(gate 20%\), 0 ahead\n/);
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

test("a rule set, change, end and end time ping each live coordinator pane once (F951); a dead timer's rule still ends", async () => {
	// Two sessions on w1:p1; w1:p3 shut down; w1:p4's pid belongs to another process now; coord:p0 runs the commands.
	for (const [index, pane] of ["w1:p1", "w1:p1", "w1:p2", "w1:p3", "w1:p4", COORDINATOR].entries()) {
		const dir = join(p.root, ".limen/coordinators", `s${index}`);
		await mkdir(dir, { recursive: true });
		const files = { pid: process.pid, pane, "started-at": new Date(index * 60_000).toISOString() };
		for (const [name, value] of Object.entries({ ...files, ...[{}, {}, {}, { shutdown: 1 }, { born: 0 }][index] })) {
			await writeFile(join(dir, name), `${value}\n`);
		}
	}
	const said = (rule: string) => named("agent", "prompt").filter((args) => args[3]?.startsWith(`Limen rule ${rule} `));
	const panes = (rule: string, word: string) =>
		said(rule).flatMap((args) => (args[3]?.includes(word) ? [args[2]] : []));
	const heard = (rule: string, ...words: string[]) => words.map((word) => panes(rule, word).sort());
	const rule = (...args: string[]) => outputText(limen(p, ["rule", ...args], { env }));
	assert.match(rule("set", "week", "--until", "1h", "Hold reviews"), /^rule week set/);
	assert.match(rule("set", "week", "--until", "1h", "--start-priority", "1", "Priority 1 only"), /^rule week changed/);
	const board = limen(p, ["board"], { env }).stdout + rule("end", "week", "done"); // an hour before its end time
	assert.match(board, /^## RULES .*\n- week until .*, start priority 1: Priority 1 only\n[\s\S]*\nrule week ended\n/);
	const [set = "", , , change = ""] = said("week").map((args) => args[3] ?? ""); // three set pings, then the change
	assert.match(set, /^Limen rule week for every coordinator, until \w+ \d+ \w+, \d\d:\d\d .*Hold reviews\. .*build/);
	assert.match(change, /changed; it now holds until .*Priority 1 only\. Start priority: 1\./);
	// The pane that runs a command is a live coordinator pane too, so it hears each set, change and end.
	const live = [COORDINATOR, "w1:p1", "w1:p2"];
	assert.deepEqual(heard("week", "coordinator, until", "changed", "(by limen rule end: done)"), [live, live, live]);
	rule("set", "now", "--until", "1h", "Now");
	assert.match(rule("set", "now", "--until", "2s", "Soon"), /^rule now changed/); // then only its timer can end it
	await until(herdr, () => panes("now", " ended ").length >= 3);
	assert.deepEqual(heard("now", "coordinator, until", "changed", "(its end time passed)"), [live, live, live]);
	assert.deepEqual([rule(), limen(p, ["board"], { env }).stdout.includes("RULES")], ["no active rules\n", false]);
	// A rule whose timer died ends on the next command, once, though two commands race to end it.
	rule("set", "late", "--until", "1h", "Late");
	spawnSync("pkill", ["-f", join(p.parent, ".limen/rules/late")]);
	const record = join(p.parent, ".limen/rules/late/rule.json");
	await writeFile(record, readFileSync(record, "utf8").replace(/"until": "[^"]+"/, '"until": "2000-01-01T00:00:00Z"'));
	assert.deepEqual(await Promise.all([limenAsync(["status"]), limenAsync(["rule"])]), [0, 0]);
	await until(herdr, () => panes("late", " ended ").length >= 3);
	assert.deepEqual(heard("late", " ended "), [live]);
});
