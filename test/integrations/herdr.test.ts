// src/integrations/herdr.ts: the seat sweep's daily step that closes leftover Herdr tabs, against a fake Herdr that
// keeps its tabs in a state file: which recorded tabs it closes, which it leaves, and what a tab that will not close
// and a seat without Herdr give, each on one line.
import assert from "node:assert/strict";
import { existsSync, readFileSync } from "node:fs";
import { chmod, mkdir, mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { type TestContext, test } from "node:test";
import { closeLeftoverTabs } from "../../src/integrations/herdr.ts";
import { withEnvironment } from "../environment.ts";
import { writeRecord } from "../plant.ts";

/**
 * A fake Herdr: `tab get <tab>` answers the tab and its label from the state file, or `tab_not_found` once it is
 * closed or unknown, or fails with the state's `unread` text for the tab; `tab close <tab>` closes it, or refuses with
 * `busy` while the state's `refuse` holds it.
 */
const HERDR = `#!/usr/bin/env node
const fs = require("node:fs"), path = require("node:path");
const args = process.argv.slice(2), file = path.join(__dirname, "state.json");
fs.appendFileSync(path.join(__dirname, "calls.jsonl"), JSON.stringify(args) + "\\n");
const state = JSON.parse(fs.readFileSync(file, "utf8"));
const ok = (result) => { console.log(JSON.stringify({ result })); process.exit(0); };
const fail = (code, message = code) => { console.log(JSON.stringify({ error: { code, message } })); process.exit(1); };
const [noun, verb, tab] = args;
const row = state.tabs[tab], unread = (state.unread ?? {})[tab];
if (noun + " " + verb === "tab get" && unread !== undefined) fail("unavailable", unread);
else if (noun + " " + verb === "tab get") row && !row.closed ? ok({ tab: { tab_id: tab, label: row.label } }) : fail("tab_not_found");
else if (noun + " " + verb === "tab close") {
	if (!row || row.closed) fail("tab_not_found");
	if ((state.refuse ?? []).includes(tab)) fail("busy");
	row.closed = true;
	fs.writeFileSync(file, JSON.stringify(state));
	ok({});
} else ok({});
`;

type Tabs = Readonly<Record<string, { readonly label: string }>>;
/**
 * How the fake Herdr misbehaves: the tabs it refuses to close, its error text for the tabs it cannot read, and whether
 * Limen finds it at all.
 */
type Fake = {
	readonly refuse?: readonly string[];
	readonly unread?: Readonly<Record<string, string>>;
	readonly found?: boolean;
};

/**
 * A project with no Git in a folder of its own and a fake Herdr beside it, whose tabs are `tabs`, misbehaving as
 * `fake` says; F012 is done, F013 active. Returns the root and the calls the fake Herdr got.
 */
async function project(t: TestContext, tabs: Tabs, { refuse = [], unread = {}, found = true }: Fake = {}) {
	const folder = await mkdtemp(join(tmpdir(), "limen-herdr-"));
	t.after(() => rm(folder, { recursive: true, force: true }));
	const root = join(folder, "project");
	await mkdir(join(root, "spec/features/done/2026-11/F012-demo"), { recursive: true });
	await mkdir(join(root, "spec/features/active/F013-next"), { recursive: true });
	const herdr = join(folder, "herdr");
	await mkdir(herdr);
	await writeFile(join(herdr, "state.json"), JSON.stringify({ tabs, refuse, unread }));
	await writeFile(join(herdr, "herdr"), HERDR);
	await chmod(join(herdr, "herdr"), 0o755);
	withEnvironment(t, { LIMEN_HERDR: found ? join(herdr, "herdr") : "0" });
	const calls = (): string[][] =>
		existsSync(join(herdr, "calls.jsonl"))
			? readFileSync(join(herdr, "calls.jsonl"), "utf8")
					.trim()
					.split("\n")
					.map((line): string[] => {
						const words: unknown = JSON.parse(line);
						return Array.isArray(words) ? words.map(String) : [];
					})
			: [];
	return { root, calls };
}

/** A finished job of `root` labelled `label`, with `places` recorded as Limen records a tab: its log tab, its diff tab. */
async function finishedJob(
	root: string,
	id: string,
	label: string,
	places: { readonly log?: string; readonly diff?: string },
): Promise<string> {
	const dir = join(root, ".limen", "jobs", id);
	await writeRecord(dir, { state: "done", label });
	for (const [folder, tab, mode] of [
		[join(dir, "herdr"), places.log, "log"],
		[join(dir, "herdr", "diff"), places.diff, "diff"],
	] as const) {
		if (tab !== undefined) {
			await mkdir(folder, { recursive: true });
			for (const [name, value] of Object.entries({ workspace: "w1", tab, pane: `${tab}:p`, mode })) {
				await writeFile(join(folder, name), `${value}\n`);
			}
		}
	}
	return dir;
}

const closes = (calls: string[][]) =>
	calls.filter(([noun, verb]) => noun === "tab" && verb === "close").map(([, , tab]) => tab);

// D-096 (1), T-18 (1): the close of leftovers was a prose trigger, `limen close FNNN`, run by the coordinator.
test("the daily step closes the recorded tabs of a finished job whose features are all closed, and no tab of a job of an open feature", async (t) => {
	const { root, calls } = await project(t, {
		"w1:t1": { label: "F012 demo · done" },
		"w1:t2": { label: "F012 demo · diff" },
		"w1:t3": { label: "F013 next · done" },
	});
	await finishedJob(root, "2026-11-24-f012-demo-1a2b3c4d", "F012 demo", { log: "w1:t1", diff: "w1:t2" });
	await finishedJob(root, "2026-11-24-f013-next-5e6f7a8b", "F013 next", { log: "w1:t3" });
	const lines = await closeLeftoverTabs(root);
	assert.deepEqual(
		[lines, closes(calls())],
		[
			[
				"closed the leftover Herdr tab w1:t1 of job 2026-11-24-f012-demo-1a2b3c4d",
				"closed the leftover Herdr tab w1:t2 of job 2026-11-24-f012-demo-1a2b3c4d",
			],
			["w1:t1", "w1:t2"],
		],
	);
});

// Decision 2: every recorded place is a tab Limen made for a job, so a tab id that Herdr gave another tab, the
// coordinator's among them, carries another label.
test("the daily step leaves a recorded tab that Herdr lists with a label that is not the job's", async (t) => {
	const { root, calls } = await project(t, { "w1:t1": { label: "coordinator" } });
	await finishedJob(root, "2026-11-24-f012-demo-1a2b3c4d", "F012 demo", { log: "w1:t1" });
	assert.deepEqual([await closeLeftoverTabs(root), closes(calls())], [[], []]);
});

// D-096 (1), Decision 2: a timer has no HERDR_TAB_ID; a manual run from a Herdr pane never closes the tab it runs in.
test("a run from a Herdr pane leaves the tab of its own pane, though Herdr lists it with the job's label", async (t) => {
	const { root, calls } = await project(t, { "w1:t1": { label: "F012 demo · done" } });
	await finishedJob(root, "2026-11-24-f012-demo-1a2b3c4d", "F012 demo", { log: "w1:t1" });
	withEnvironment(t, { HERDR_TAB_ID: "w1:t1" });
	assert.deepEqual([await closeLeftoverTabs(root), closes(calls())], [[], []]);
});

// D-097 (4) (k), T-01: a tab that does not close is reported and the step is done, as `closeJobTab` closes one.
test("a leftover tab that does not close after one retry is a line, and the step is done", async (t) => {
	const { root, calls } = await project(t, { "w1:t1": { label: "F012 demo · done" } }, { refuse: ["w1:t1"] });
	const id = "2026-11-24-f012-demo-1a2b3c4d";
	const dir = await finishedJob(root, id, "F012 demo", { log: "w1:t1" });
	const lines = await closeLeftoverTabs(root);
	assert.deepEqual(
		[lines, closes(calls()), readFileSync(join(dir, "log"), "utf8").includes("failed after one retry (busy)")],
		[[`the leftover Herdr tab w1:t1 of job ${id} did not close; its log says why`], ["w1:t1", "w1:t1"], true],
	);
});

// R-101 review round 2, G1, z. 15: the job's account can write the tab id its folder records, Herdr's error text is
// another program's, and the sweep's lines reach the coordinator's model, so each is escaped as prune's lines are.
test("each line of a leftover tab that stays open shows the recorded tab id and Herdr's error text escaped, on one line", async (t) => {
	const [refused, unread] = ["w1:t1\nretired 2026-11-24-fake-5e6f7a8b to /tmp", "w1:t2\u001b[2J"];
	const tabs = { [refused]: { label: "F012 demo · done" }, [unread]: { label: "F012 demo · diff" } };
	const { root } = await project(t, tabs, {
		refuse: [refused],
		unread: { [unread]: "daemon gone\nclosed the leftover Herdr tab w1:t9" },
	});
	const id = "2026-11-24-f012-demo-1a2b3c4d";
	await finishedJob(root, id, "F012 demo", { log: refused, diff: unread });
	assert.deepEqual(await closeLeftoverTabs(root), [
		`the leftover Herdr tab w1:t1\\nretired 2026-11-24-fake-5e6f7a8b to /tmp of job ${id} did not close; its log says why`,
		`the leftover Herdr tab w1:t2\\u001b[2J of job ${id} stays open: herdr tab get failed (daemon gone\\nclosed the leftover Herdr tab w1:t9)`,
	]);
});

test("with no Herdr the daily step is one line, and it closes nothing", async (t) => {
	const { root } = await project(t, { "w1:t1": { label: "F012 demo · done" } }, { found: false });
	await finishedJob(root, "2026-11-24-f012-demo-1a2b3c4d", "F012 demo", { log: "w1:t1" });
	assert.deepEqual(await closeLeftoverTabs(root), [
		"herdr is not available, so the 1 leftover tab of finished jobs of closed features stays open",
	]);
});
