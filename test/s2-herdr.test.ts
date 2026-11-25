// S2 · Herdr. A fake Herdr (written below to the plant) records every call and keeps its role spaces and tabs in a
// state file; a coordinator pane hears a job's start notice and its wake through `agent prompt` and Herdr's socket API,
// and a job's end closes its tab.
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { chmod, mkdir, writeFile } from "node:fs/promises";
import { createServer } from "node:net";
import { join } from "node:path";
import { createInterface } from "node:readline";
import { after, before, test } from "node:test";
import {
	FINAL,
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
