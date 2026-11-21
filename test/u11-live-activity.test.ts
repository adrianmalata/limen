// U11: what the live picture says a job does. A record that says running is never shown as working when its owner is
// gone or it has been silent too long; finished jobs leave the page after an hour; a job folder reads by its owner, its
// log and its session; a coordinator's workers and a group's teams nest as one tree.
import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { mkdir, mkdtemp, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";
import { type JobRecord, type Progress, writeProgress } from "../src/job/record.ts";
import {
	activityReader,
	CHECK_QUIET_MS,
	FINISHED_SHOWN_MS,
	type JobFiles,
	jobActivity,
	QUIET_MS,
} from "../src/picture/activity.ts";
import { processIdentity } from "../src/runtime/reap.ts";
import { writeRecord } from "./plant.ts";

const NOW = Date.parse("2026-10-08T12:00:00Z");
const job = (over: Partial<JobFiles>): JobFiles => ({
	id: "2026-10-08-f932-live-1a2b3c4d",
	state: "running",
	spawning: false,
	owner: "alive",
	label: "F932 follow-up for F780",
	engine: "pi",
	model: "pi-claude/claude-opus-5-5",
	activity: "tool",
	lastTool: "bash",
	detail: "npm test",
	stopReason: "",
	tools: 3,
	role: "worker",
	spawnedBy: "",
	group: "",
	team: "",
	startedAt: NOW - 60_000,
	lastEventAt: NOW - 1_000,
	finishedAt: undefined,
	...over,
});
const seen = (over: Partial<JobFiles>) => {
	const live = jobActivity(job(over), NOW);
	return live && [live.state, live.doing, live.detail];
};
const gone = Number(spawnSync(process.execPath, ["-e", "process.stdout.write(String(process.pid))"]).stdout.toString());
/** A planted job: its record's fields, its progress, and its content files by name. */
type Planted = {
	readonly record: Partial<JobRecord>;
	readonly progress: Progress;
	readonly files?: Record<string, string>;
};
const folder = async (jobs: string, id: string, { record, progress, files = {} }: Planted) => {
	const dir = join(jobs, id);
	await writeRecord(dir, record);
	await writeProgress(dir, progress);
	await mkdir(join(dir, "session"), { recursive: true });
	for (const [name, body] of Object.entries(files)) {
		await writeFile(join(dir, name), body);
	}
};
/** The identity of a process that has exited. */
const goneIdentity = { pid: gone, born: "1", bootId: null };

test("a running record reads by its owner and its last event, never as working when either is stale", () => {
	assert.deepEqual(seen({}), ["working", "running tests and checks", "npm test"]);
	assert.deepEqual(seen({ owner: "gone" }), ["dead", "running tests and checks", ""]);
	assert.deepEqual(seen({ owner: "none" }), ["starting", "starting", ""]);
	const stale = NOW - CHECK_QUIET_MS - 1;
	assert.deepEqual(seen({ owner: "gone", lastEventAt: stale }), ["dead", "running tests and checks", ""]);
	assert.deepEqual(seen({ activity: "wait" }), ["waiting", "waiting", ""]);
	assert.deepEqual(seen({ activity: "think" }), ["working", "thinking", ""]);
	assert.deepEqual(seen({ state: "", spawning: true }), ["starting", "starting", ""]);
	assert.equal(seen({ state: "", spawning: false }), undefined);
});

test("a job turns quiet after 5 minutes without an event, or 15 while it runs a test or check", () => {
	const state = (over: Partial<JobFiles>) => jobActivity(job(over), NOW)?.state;
	assert.equal(state({ detail: "ls -la", lastEventAt: NOW - QUIET_MS }), "working");
	assert.equal(state({ detail: "ls -la", lastEventAt: NOW - QUIET_MS - 1 }), "quiet");
	assert.equal(state({ activity: "think", lastEventAt: NOW - QUIET_MS - 1 }), "quiet");
	assert.equal(state({ detail: "npm test", lastEventAt: NOW - CHECK_QUIET_MS }), "working");
	assert.equal(state({ detail: "npm test", lastEventAt: NOW - CHECK_QUIET_MS - 1 }), "quiet");
});

test("a finished job shows its end for an hour, then leaves the page", () => {
	const finishedAt = NOW - FINISHED_SHOWN_MS;
	assert.deepEqual(seen({ state: "done", finishedAt }), ["done", "", ""]);
	const failed = { state: "failed", finishedAt, stopReason: "error: overloaded" };
	assert.deepEqual(seen(failed), ["failed", "error: overloaded", ""]);
	assert.equal(seen({ state: "stopped", finishedAt: finishedAt - 1 }), undefined);
	assert.deepEqual(jobActivity(job({}), NOW)?.work, ["f932", "f780"]);
});

test("the reader reads a job folder by its owner, its log and its session", async () => {
	const jobs = await mkdtemp(join(tmpdir(), "limen-live-"));
	const running = { state: "running", identity: await processIdentity() } as const;
	const progress = { activity: "tool", lastTool: "bash", toolCalls: 0 };
	const session = "session/2026-10-08T11-59-00Z_a.jsonl";
	await folder(jobs, "2026-10-08-f932-detached-00000001", {
		record: { ...running, route: { engine: "pi", model: null, provider: null, thinking: null } },
		progress,
		files: {
			log: "think\nbash npm test\n",
			[session]: '{"type":"session"}\n{"type":"model_change","provider":"openai-codex","modelId":"gpt-6-sol"}\n',
		},
	});
	await folder(jobs, "2026-10-08-f932-gone-00000003", { record: { ...running, identity: goneIdentity }, progress });
	const snapshot = await activityReader(jobs)();
	const rows = snapshot.jobs.map((live) => [live.id.slice(16, -9), live.state, live.doing, live.detail, live.model]);
	assert.deepEqual(rows.sort(), [
		["detached", "working", "running tests and checks", "npm test", "openai-codex/gpt-6-sol"],
		["gone", "dead", "running a command", "", ""],
	]);
});

test("a coordinator's workers and a group's teams nest as one tree with their states counted", async () => {
	const root = await mkdtemp(join(tmpdir(), "limen-tree-"));
	const jobs = join(root, "jobs");
	const running = { state: "running", identity: await processIdentity(), role: "worker" } as const;
	const think = { activity: "think", lastTool: "", toolCalls: 0 };
	const planted = (record: Partial<JobRecord>, progress = think): Planted => ({
		record: { ...running, ...record },
		progress,
	});
	const member = (team: string, record: Partial<JobRecord> = {}, progress = think) =>
		planted({ group: "g1", team, ...record }, progress);
	await folder(jobs, "c1", member("team-1", { role: "coordinator" }));
	// An older group worker records no spawn link: it goes under its team's coordinator.
	await folder(jobs, "w1", member("team-1", {}, { ...think, activity: "wait" }));
	// Its coordinator is not on the page, so it stays at the top.
	await folder(jobs, "w2", member("team-2", { identity: goneIdentity }));
	await folder(jobs, "boss", planted({ role: "coordinator" }));
	await folder(jobs, "helper", planted({ spawnedBy: "boss" }));
	await folder(jobs, "orphan", planted({ spawnedBy: "2026-01-01-long-gone-00000000" }));
	await mkdir(join(root, "groups", "g1"), { recursive: true });
	const roster = [
		{ id: "w1", team: "team-1", role: "worker" },
		{ id: "c1", team: "team-1", role: "coordinator" },
		{ id: "c2", team: "team-2", role: "coordinator" },
		{ id: "w2", team: "team-2", role: "worker" },
	];
	const run = {
		id: "g1",
		feature: "spec/features/active/F929-biome",
		deadline: Date.parse("2026-10-09T09:15:00Z"),
		teams: ["team-1", "team-2"],
	};
	await writeFile(join(root, "groups/g1/run.json"), JSON.stringify({ ...run, members: roster }));
	const snapshot = await activityReader(jobs)();
	const parents = { boss: null, c1: null, helper: "boss", orphan: null, w1: "c1", w2: null };
	assert.deepEqual(Object.fromEntries(snapshot.jobs.map((live) => [live.id, live.parent])), parents);
	// A group worker's label names no feature; it still works on the group's feature.
	assert.deepEqual(snapshot.jobs.find((live) => live.id === "w1")?.work, ["f929"]);
	assert.deepEqual(snapshot.groups, [
		{
			id: "g1",
			work: ["f929"],
			feature: "F929-biome",
			deadline: "2026-10-09T09:15:00.000Z",
			teams: [
				{ name: "team-1", jobs: ["c1", "w1"], count: { working: 1, waiting: 1 } },
				{ name: "team-2", jobs: ["w2"], count: { dead: 1 } },
			],
			count: { working: 1, waiting: 1, dead: 1 },
		},
	]);
});
