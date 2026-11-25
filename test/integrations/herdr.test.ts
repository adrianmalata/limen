// src/integrations/herdr.ts: the one close of a job's recorded Herdr tabs, which the seat sweep's daily step and land,
// ticket done and abandon share, against a fake Herdr that keeps its tabs in a state file: which recorded tabs it
// closes, which it leaves, what a tab that will not close and a seat without Herdr give, each on one line, the mark of
// a tab it found closed, and the bound of the daily close.
import assert from "node:assert/strict";
import { existsSync, readFileSync } from "node:fs";
import { mkdir, mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { type TestContext, test } from "node:test";
import { closeJobTabs, closeLeftoverTabs } from "../../src/integrations/herdr.ts";
import { withEnvironment } from "../environment.ts";
import { type HerdrState, herdrFake, recordTab, writeRecord } from "../plant.ts";

type Tabs = HerdrState["tabs"];
/** How the fake Herdr misbehaves, and whether Limen finds it at all. */
type Fake = Omit<HerdrState, "tabs"> & { readonly found?: boolean };

/**
 * A project with no Git in a folder of its own and a fake Herdr beside it, whose tabs are `tabs`, misbehaving as
 * `fake` says; F012 is done, F013 active. Returns the root and the fake.
 */
async function project(t: TestContext, tabs: Tabs, { found = true, ...state }: Fake = {}) {
	const folder = await mkdtemp(join(tmpdir(), "limen-herdr-"));
	t.after(() => rm(folder, { recursive: true, force: true }));
	const root = join(folder, "project");
	await mkdir(join(root, "spec/features/done/2026-11/F012-demo"), { recursive: true });
	await mkdir(join(root, "spec/features/active/F013-next"), { recursive: true });
	const fake = await herdrFake(join(folder, "herdr"), { tabs, ...state });
	withEnvironment(t, { LIMEN_HERDR: found ? fake.binary : "0" });
	return { root, ...fake };
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
	for (const place of ["log", "diff"] as const) {
		const tab = places[place];
		if (tab !== undefined) {
			await recordTab(dir, place, tab);
		}
	}
	return dir;
}

const ID = "2026-11-24-f012-demo-1a2b3c4d";

// D-096 (1), T-18 (1): the close of leftovers was a prose trigger, `limen close FNNN`, run by the coordinator.
test("the daily step closes the recorded tabs of a finished job whose features are all closed, and no tab of a job of an open feature", async (t) => {
	const { root, closes } = await project(t, {
		"w1:t1": { label: "F012 demo · done" },
		"w1:t2": { label: "F012 demo · diff" },
		"w1:t3": { label: "F013 next · done" },
	});
	await finishedJob(root, ID, "F012 demo", { log: "w1:t1", diff: "w1:t2" });
	await finishedJob(root, "2026-11-24-f013-next-5e6f7a8b", "F013 next", { log: "w1:t3" });
	const lines = await closeLeftoverTabs(root);
	assert.deepEqual(
		[lines, closes()],
		[
			[`closed the leftover Herdr tab w1:t1 of job ${ID}`, `closed the leftover Herdr tab w1:t2 of job ${ID}`],
			["w1:t1", "w1:t2"],
		],
	);
});

// R-101 Decision 2: every recorded place is a tab Limen made for a job, so a tab id that Herdr gave another tab, the
// coordinator's among them, carries another label.
test("the daily step leaves a recorded tab that Herdr lists with a label that is not the job's", async (t) => {
	const { root, closes } = await project(t, { "w1:t1": { label: "coordinator" } });
	await finishedJob(root, ID, "F012 demo", { log: "w1:t1" });
	assert.deepEqual([await closeLeftoverTabs(root), closes()], [[], []]);
});

// D-096 (1), R-101 Decision 2: a timer has no HERDR_TAB_ID; a manual run from a Herdr pane never closes the tab it runs
// in.
test("a run from a Herdr pane leaves the tab of its own pane, though Herdr lists it with the job's label", async (t) => {
	const { root, closes } = await project(t, { "w1:t1": { label: "F012 demo · done" } });
	await finishedJob(root, ID, "F012 demo", { log: "w1:t1" });
	withEnvironment(t, { HERDR_TAB_ID: "w1:t1" });
	assert.deepEqual([await closeLeftoverTabs(root), closes()], [[], []]);
});

// D-097 (4) (k), T-01: a tab that does not close is reported and the step is done, as `closeJobTab` closes one.
test("a leftover tab that does not close after one retry is a line, and the step is done", async (t) => {
	const { root, closes } = await project(t, { "w1:t1": { label: "F012 demo · done" } }, { refuse: ["w1:t1"] });
	const dir = await finishedJob(root, ID, "F012 demo", { log: "w1:t1" });
	const lines = await closeLeftoverTabs(root);
	assert.deepEqual(
		[lines, closes(), readFileSync(join(dir, "log"), "utf8").includes("failed after one retry (busy)")],
		[[`the leftover Herdr tab w1:t1 of job ${ID} did not close; its log says why`], ["w1:t1", "w1:t1"], true],
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
	await finishedJob(root, ID, "F012 demo", { log: refused, diff: unread });
	assert.deepEqual(await closeLeftoverTabs(root), [
		`the leftover Herdr tab w1:t1\\nretired 2026-11-24-fake-5e6f7a8b to /tmp of job ${ID} did not close; its log says why`,
		`the leftover Herdr tab w1:t2\\u001b[2J of job ${ID} stays open: herdr tab get failed (daemon gone\\nclosed the leftover Herdr tab w1:t9)`,
	]);
});

test("with no Herdr the daily step is one line, and it closes nothing", async (t) => {
	const { root } = await project(t, { "w1:t1": { label: "F012 demo · done" } }, { found: false });
	await finishedJob(root, ID, "F012 demo", { log: "w1:t1" });
	assert.deepEqual(await closeLeftoverTabs(root), [
		"herdr is not available, so the 1 leftover tab of finished jobs of closed features stays open",
	]);
});

// R-103 Decision 23 (a): the daily step asked Herdr about every recorded tab of every finished job each day, also
// about the tabs it had closed, up to 10 s each on a hung Herdr.
test("a tab a close found closed is marked in its place, and no later close asks Herdr about it", async (t) => {
	const { root, calls } = await project(t, { "w1:t1": { label: "F012 demo · done" } });
	const dir = await finishedJob(root, ID, "F012 demo", { log: "w1:t1", diff: "w1:t9" });
	await closeLeftoverTabs(root);
	const asked = calls().length;
	assert.deepEqual(
		[
			readFileSync(join(dir, "herdr", "closed"), "utf8"),
			readFileSync(join(dir, "herdr", "diff", "closed"), "utf8"),
			await closeLeftoverTabs(root),
			calls().length,
		],
		["w1:t1\n", "w1:t9\n", [], asked],
	);
});

// R-103, review round 1, F2: a tab that Herdr no longer lists got its mark and no word in the job's log, where the
// closer says `already closed` of a tab that Herdr does not find.
test("a recorded tab that Herdr no longer lists is marked, and the job's log says it was already closed", async (t) => {
	const { root } = await project(t, {});
	const dir = await finishedJob(root, ID, "F012 demo", { log: "w1:t9" });
	assert.deepEqual(
		[
			await closeLeftoverTabs(root),
			readFileSync(join(dir, "herdr", "closed"), "utf8"),
			readFileSync(join(dir, "log"), "utf8").includes("herdr tab close w1:t9: already closed\n"),
		],
		[[], "w1:t9\n", true],
	);
});

// R-103 Decision 23 (b): the mark names the tab it marks, so a new tab recorded in that place is asked about.
test("a new tab recorded in a place marked closed is asked about and closed", async (t) => {
	const { root, closes } = await project(t, {
		"w1:t1": { label: "F012 demo · done" },
		"w1:t4": { label: "F012 demo · done" },
	});
	const dir = await finishedJob(root, ID, "F012 demo", { log: "w1:t1" });
	await closeLeftoverTabs(root);
	await recordTab(dir, "log", "w1:t4");
	assert.deepEqual(
		[await closeLeftoverTabs(root), closes()],
		[[`closed the leftover Herdr tab w1:t4 of job ${ID}`], ["w1:t1", "w1:t4"]],
	);
});

// R-103 Decision 23 (d): with a hung Herdr each tab cost up to 10 s, so about 30 tabs passed the sweep unit's 300 s.
// R-103, review round 1, F5: the test asserts what the bound decides, not how fast the fake Herdr starts, which a slow
// host does not decide: the tab it reached stays open with its failure, each tab past the bound is named and asked
// nothing, and the call it made ended by the bound, not by its own 10 s.
test("on a Herdr that hangs the daily close stops at its bound, names the tabs it did not reach in one line, and is done", async (t) => {
	const { root, calls } = await project(t, { "w1:t1": { label: "F012 demo · done" } }, { hang: true });
	await finishedJob(root, ID, "F012 demo", { log: "w1:t1", diff: "w1:t2" });
	await finishedJob(root, "2026-11-24-f012-more-5e6f7a8b", "F012 more", { log: "w1:t3" });
	withEnvironment(t, { LIMEN_LEFTOVER_TABS_MS: "300" });
	const started = Date.now();
	const lines = await closeLeftoverTabs(root);
	const asked = calls().map(([, , tab]) => tab);
	assert.deepEqual(
		[
			lines.length,
			lines.at(-1),
			asked.filter((tab) => tab !== "w1:t1"),
			new RegExp(`^the leftover Herdr tab w1:t1 of job ${ID} stays open: herdr tab get failed`).test(lines[0] ?? ""),
			Date.now() - started < 10_000,
		],
		[
			2,
			`the close of leftover Herdr tabs reached its bound of 0.3 s, so 2 tabs wait for the next daily run: w1:t2 of job ${ID}, w1:t3 of job 2026-11-24-f012-more-5e6f7a8b`,
			[],
			true,
			true,
		],
		lines.join("\n"),
	);
});

// D-096 (3) (i), R-103 Decision 21: land's `cleaned` step, ticket done and abandon close a job's tabs with the sweep's
// close, in words with no "leftover".
test("the close of one job's tabs closes both its recorded tabs and names each", async (t) => {
	const { root, closes } = await project(t, {
		"w1:t1": { label: "F013 next · done" },
		"w1:t2": { label: "F013 next · diff" },
	});
	const dir = await finishedJob(root, ID, "F013 next", { log: "w1:t1", diff: "w1:t2" });
	assert.deepEqual(
		[await closeJobTabs(dir), closes()],
		[
			[`closed the Herdr tab w1:t1 of job ${ID}`, `closed the Herdr tab w1:t2 of job ${ID}`],
			["w1:t1", "w1:t2"],
		],
	);
});

test("the close of one job's tabs leaves the tab of the pane it runs in", async (t) => {
	const { root, closes } = await project(t, {
		"w1:t1": { label: "F013 next · done" },
		"w1:t2": { label: "F013 next · diff" },
	});
	const dir = await finishedJob(root, ID, "F013 next", { log: "w1:t1", diff: "w1:t2" });
	withEnvironment(t, { HERDR_TAB_ID: "w1:t1" });
	assert.deepEqual(
		[await closeJobTabs(dir), closes(), existsSync(join(dir, "herdr", "closed"))],
		[[`closed the Herdr tab w1:t2 of job ${ID}`], ["w1:t2"], false],
	);
});

test("the close of one job's tabs names a tab that does not close, and leaves its place unmarked", async (t) => {
	const { root } = await project(t, { "w1:t1": { label: "F013 next · done" } }, { refuse: ["w1:t1"] });
	const dir = await finishedJob(root, ID, "F013 next", { log: "w1:t1" });
	assert.deepEqual(
		[await closeJobTabs(dir), existsSync(join(dir, "herdr", "closed"))],
		[[`the Herdr tab w1:t1 of job ${ID} did not close; its log says why`], false],
	);
});

// R-103 Decision 21: absence is no failure (T-01), so the caller's step is done.
test("with no Herdr the close of one job's tabs is one line that counts the tabs that stay open", async (t) => {
	const { root } = await project(t, {}, { found: false });
	const dir = await finishedJob(root, ID, "F013 next", { log: "w1:t1", diff: "w1:t2" });
	assert.deepEqual(await closeJobTabs(dir), [`herdr is not available, so the 2 Herdr tabs of job ${ID} stay open`]);
});

test("a job with no recorded tab has no tab to close and gives no line", async (t) => {
	const { root, calls } = await project(t, {});
	const dir = await finishedJob(root, ID, "F013 next", {});
	assert.deepEqual([await closeJobTabs(dir), calls()], [[], []]);
});
