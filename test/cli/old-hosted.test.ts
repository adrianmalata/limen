// Records that hosted jobs and hosted groups left before R-005: every reader ignores their extra files.
import assert from "node:assert/strict";
import { type ChildProcess, spawn } from "node:child_process";
import { existsSync } from "node:fs";
import { mkdir, mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { test } from "node:test";
import { fileURLToPath } from "node:url";
import {
	type GithubClaim,
	githubBranch,
	githubMarker,
	matchedGithubJob,
} from "../../src/integrations/github-review.ts";
import { isTerminal } from "../../src/job/job.ts";
import { engineEvents, jobDir, jobFile, limen, type Plant, plant, spawnJob, TICKET, until } from "../plant.ts";

const WAKE = fileURLToPath(new URL("../../hook/wake.ts", import.meta.url));
/** The files a hosted job had beside the ones every job has, as its supervisor and its Pi hook wrote them. */
const HOSTED_FILES: Readonly<Record<string, string>> = {
	hosted:
		"Hosted job: weaker guarantees. No 90-minute timeout, no tool-call cap, no process-group containment (stop cannot kill child processes the agent started). Herdr owns the process tree. Closing the tab ends the worker.\n",
	"agent-name": "limen-commit-1a2b3c4d\n",
	"herdr/workspace": "w1\n",
	"herdr/tab": "w1:t2\n",
	"herdr/pane": "w1:p2\n",
	"herdr/agent": "w1:p2\n",
	"herdr/mode": "hosted\n",
	"engine-binding": `${JSON.stringify({ pid: 4242, born: "1", boot: "boot" })}\n`,
	"ownership-uncertainty": `${JSON.stringify({ since: 1, root: true, child: false })}\n`,
};

/** Resolves once the job's `state` is terminal, the commit point of its record. */
function ended(p: Plant, id: string): Promise<void> {
	return until(jobDir(p, id), () => isTerminal(jobFile(p, id, "state")));
}
async function writeFiles(dir: string, files: Readonly<Record<string, string>>): Promise<void> {
	for (const [name, body] of Object.entries(files)) {
		await mkdir(dirname(join(dir, name)), { recursive: true });
		await writeFile(join(dir, name), body);
	}
}
/** Turns a finished job's folder into an old hosted one: its files, and the receipt of an ownership wake. */
async function addHostedFiles(dir: string): Promise<void> {
	await writeFiles(dir, HOSTED_FILES);
	await mkdir(join(dir, "notify/delivered/_uncertainty.1._fallback"), { recursive: true });
}

test("limen status and limen jobs <id> show an old terminal hosted job as they show it without its hosted files", async (t) => {
	const p = await plant();
	t.after(() => p.cleanup());
	const id = spawnJob(p, "commit");
	await ended(p, id);
	const reads = () => [limen(p, ["status"]), limen(p, ["jobs", id])];
	const before = reads();
	await addHostedFiles(jobDir(p, id));
	const after = reads();
	assert.deepEqual(
		after.map((run) => [run.status, run.stderr]),
		[
			[0, ""],
			[0, ""],
		],
	);
	assert.deepEqual(after, before);
});

test("an old hosted job's _uncertainty receipt is no completion: its pending completion wake still reaches its session", async (t) => {
	const p = await plant();
	const sessions: ChildProcess[] = [];
	t.after(async () => {
		for (const session of sessions) {
			session.kill();
		}
		await p.cleanup();
	});
	const id = spawnJob(p, "commit", [], { env: { PI_SESSION_ID: "coord" } });
	await ended(p, id);
	await addHostedFiles(jobDir(p, id));
	// The coordinator session starts after the job ended: the fake engine with the real wake hook, held on a FIFO.
	const coordinator = join(p.parent, "coord");
	await mkdir(coordinator);
	await writeFile(join(coordinator, "task.md"), "block\n");
	const args = ["--session-dir", join(coordinator, "session"), "--extension", WAKE, `@${join(coordinator, "task.md")}`];
	const env = { ...p.env, PI_SESSION_ID: "coord" };
	sessions.push(spawn(join(p.bin, "pi"), args, { cwd: p.root, env, stdio: "ignore" }));
	await until(jobDir(p, id), () => existsSync(join(jobDir(p, id), "notify/delivered/coord")));
	const wakes = engineEvents(coordinator).filter(
		(event) => event.text?.startsWith("Limen job") && event.text.includes(id),
	);
	assert.equal(wakes.length, 1);
});

test("matchedGithubJob matches a GitHub job without a hosted file and an old hosted one, and refuses another shape", async (t) => {
	const root = await mkdtemp(join(tmpdir(), "limen-old-hosted-"));
	t.after(() => rm(root, { recursive: true, force: true }));
	const claim = (id: number): GithubClaim => ({
		repo: "acme/widget",
		id,
		pr: 4,
		actor: "alice",
		url: "u",
		base: "a".repeat(40),
		baseRef: "main",
		head: "b".repeat(40),
	});
	const [work, review, other] = [claim(104), claim(105), claim(106)];
	const jobs = join(root, ".limen/jobs");
	await writeFiles(join(jobs, "work"), {
		"task.md": `${githubMarker(work)}\nCoordinator task: Fix it\n`,
		state: "running\n",
		role: "worker\n",
		branch: `${githubBranch(work)}\n`,
		base: `${"c".repeat(40)}\n`,
	});
	await writeFiles(join(jobs, "old-review"), {
		...HOSTED_FILES,
		"task.md": `${githubMarker(review)}\nReview PR #4\n`,
		state: "done\n",
		role: "reviewer\n",
		branch: `${githubBranch(review)}\n`,
		candidate: `${review.head}\n`,
		base: `${review.base}\n`,
	});
	await writeFiles(join(jobs, "other"), { "task.md": `${githubMarker(other)}\n`, state: "done\n", branch: "main\n" });
	assert.deepEqual(await matchedGithubJob(root, work), {
		id: "work",
		branch: githubBranch(work),
		state: "running",
		review: false,
	});
	assert.deepEqual(await matchedGithubJob(root, review), {
		id: "old-review",
		branch: githubBranch(review),
		state: "done",
		review: true,
	});
	await assert.rejects(matchedGithubJob(root, other), /^Error: conflicting job other for /);
});

test("limen group status reads a run.json that a group start with --tab wrote", async (t) => {
	const p = await plant();
	t.after(() => p.cleanup());
	const now = Date.now();
	const run = {
		id: "old-tab-group",
		root: p.root,
		feature: dirname(TICKET),
		planningSource: "committed",
		lead: "old-lead",
		startedAt: now - 60_000,
		teams: ["team-1"],
		routes: { "team-1": { engine: "pi", provider: "p", model: "m", thinking: "high" } },
		workersPerTeam: 0,
		rounds: ["draft"],
		round: 0,
		finishedAt: now,
		deadline: now + 60 * 60_000,
		reserveMs: 60_000,
		stopped: false,
		closed: false,
		mode: "tab",
		members: [],
	};
	await writeFiles(join(p.root, ".limen/groups", run.id), { "run.json": `${JSON.stringify(run)}\n` });
	const shown = limen(p, ["group", "status", run.id], { env: { PI_SESSION_ID: run.lead } });
	assert.equal(shown.status, 0, shown.stderr);
	assert.match(
		shown.stdout,
		/^Group spec\/features\/active\/F001-demo \(old-tab-group\)\nFinished after round 1 of 1 /,
	);
});
