// The job of a claim (src/integrations/github-claims.ts): the review fetch checks the PR's base and head on the remote
// and fetches both commits with no ref and no FETCH_HEAD, a stale handoff gate is taken over only under the jobs lock,
// after a read there finds what validate found, and a review's branch that fails after the job record ends that job.
import assert from "node:assert/strict";
import { existsSync } from "node:fs";
import { mkdir, mkdtemp, realpath, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { type TestContext, test } from "node:test";
import { checkedClaimJob, fetchPinnedReview, startCheckedClaim } from "../../src/integrations/github-claims.ts";
import { jobFolders, readRecord } from "../../src/job/record.ts";
import { type CommandText, EXIT_CODES, failureOf } from "../../src/outcome.ts";
import { withEnvironment } from "../environment.ts";
import { git, type Plant, plant, pullRequestOrigin, repository, writeRecord } from "../plant.ts";
import { snapshot } from "../snapshot.ts";

/** A remote whose `main` is the base and whose `refs/pull/4/head` is one commit past it, and a clone of its base. */
async function remoteWithPull(t: TestContext) {
	const parent = await realpath(await mkdtemp(join(tmpdir(), "limen-review-")));
	t.after(() => rm(parent, { recursive: true, force: true }));
	withEnvironment(t, { GIT_CONFIG_GLOBAL: "/dev/null", GIT_CONFIG_NOSYSTEM: "1" });
	const remote = join(parent, "remote");
	await repository(remote);
	const base = git(remote, "rev-parse", "main");
	const root = join(parent, "clone");
	git(parent, "clone", "-q", remote, root);
	git(remote, "checkout", "-qb", "pull");
	git(remote, "commit", "-q", "--allow-empty", "-m", "the pull request");
	const head = git(remote, "rev-parse", "pull");
	git(remote, "update-ref", "refs/pull/4/head", head);
	git(remote, "checkout", "-q", "main");
	return { root, remote, review: { pr: 4, base, baseRef: "main", head } };
}

test("a review whose PR head is still the claim's fetches its commits and writes no ref and no FETCH_HEAD", async (t) => {
	const { root, review } = await remoteWithPull(t);
	const before = snapshot(root);
	fetchPinnedReview(root, review);
	assert.equal(git(root, "cat-file", "-t", review.head), "commit");
	assert.deepEqual([snapshot(root), existsSync(join(root, ".git/FETCH_HEAD"))], [before, false]);
});

test("GITHUB_HEAD_MOVED: a review whose PR head moved on the remote refuses and leaves the snapshot identical", async (t) => {
	const { root, remote, review } = await remoteWithPull(t);
	git(remote, "checkout", "-q", "pull");
	git(remote, "commit", "-q", "--allow-empty", "-m", "a later push");
	git(remote, "update-ref", "refs/pull/4/head", git(remote, "rev-parse", "pull"));
	git(remote, "checkout", "-q", "main");
	const before = snapshot(root);
	assert.throws(() => fetchPinnedReview(root, review), { class: "refused", code: "GITHUB_HEAD_MOVED" });
	assert.deepEqual(snapshot(root), before);
});

test("GITHUB_BASE_MOVED: a review whose PR base moved on the remote refuses and leaves the snapshot identical", async (t) => {
	const { root, remote, review } = await remoteWithPull(t);
	git(remote, "commit", "-q", "--allow-empty", "-m", "main moved");
	const before = snapshot(root);
	assert.throws(() => fetchPinnedReview(root, review), { class: "refused", code: "GITHUB_BASE_MOVED" });
	assert.deepEqual(snapshot(root), before);
});

const REPO = "acme/widget";
const QUIET: CommandText = { line: () => {}, diagnostic: () => {} };
const ROUTE = { engine: "pi", provider: "p", model: "m", thinking: "high" };

/**
 * A plant bound to `REPO` with claim 104, whose coordinator, `coord:p1`, is this test process: the environment of the
 * Herdr pane, and stubs of `id` and `sudo` for an account outside the sudo group. With `pr`, claim 104 is the comment
 * claim of that pull request, whose base and head a local remote serves in GitHub's place (`pullRequestOrigin`).
 */
async function claimPlant(t: TestContext, pr?: number): Promise<Plant> {
	const p = await plant();
	t.after(() => p.cleanup());
	git(p.root, "remote", "add", "origin", `https://github.com/${REPO}.git`);
	await mkdir(join(p.root, ".limen/github/claims"), { recursive: true });
	const binding = { repo: REPO, coordinator: "coord:p1", user: "worker", connectedAt: "2026-11-19T00:00:00Z" };
	await writeFile(join(p.root, ".limen/github/binding.json"), JSON.stringify(binding));
	const origin = pr === undefined ? undefined : await pullRequestOrigin(p, pr);
	const url = `https://github.com/${REPO}/pull/${pr}#issuecomment-104`;
	const claim = origin
		? { repo: REPO, id: 104, pr, base: origin.base, baseRef: "main", head: origin.head, actor: "octocat", url }
		: { repo: REPO, id: 104 };
	await writeFile(join(p.root, ".limen/github/claims/104.json"), JSON.stringify(claim));
	await writeFile(join(p.bin, "id"), "#!/bin/sh\necho staff\n", { mode: 0o755 });
	await writeFile(join(p.bin, "sudo"), "#!/bin/sh\nexit 1\n", { mode: 0o755 });
	const coordinator = { HERDR_ENV: "1", LIMEN_COORDINATOR: "1", HERDR_PANE_ID: "coord:p1" };
	withEnvironment(t, { ...p.env, ...(origin ? { PATH: origin.path } : {}), ...coordinator });
	return p;
}

/** The handoff gate of claim 104 in the plant `p`. */
const gateOf = (p: Plant) => join(p.root, ".limen/github/inflight/104");

const AGAIN = (p: Plant) =>
	`limen github work ${p.root} 104 --engine pi --provider p --model m --thinking high --task Fix`;

// A live handoff is never taken over: a rerun's validate can read it between its gate and its job record, which that
// handoff writes under the jobs lock. The rerun reads the gate as stale, waits for the lock, and its apply finds the
// record there, so it writes nothing and takes no gate over (T-38 (2)).
test("STATE_CHANGED: github work whose stale gate gets a job record of the claim between validate and apply exits 3 and takes nothing over", async (t) => {
	const p = await claimPlant(t);
	await mkdir(gateOf(p), { recursive: true });
	const checked = await checkedClaimJob("work", p.root, "104", { model: ROUTE, task: "Fix" }, QUIET, AGAIN(p));
	const live = join(p.root, ".limen/jobs/2026-11-22-live-1a2b3c4d");
	await writeRecord(live, { state: "starting", role: "worker" });
	await writeFile(join(live, "task.md"), `GitHub doorbell: ${REPO}#104\nCoordinator task: Fix\n`);
	const changed = snapshot(p.root);
	await assert.rejects(startCheckedClaim(checked, QUIET), {
		class: "transient",
		code: "STATE_CHANGED",
		next: AGAIN(p),
	});
	assert.deepEqual(snapshot(p.root), changed);
});

// The apply reads the claim's copy again under the jobs lock, as validate read it: a copy that names a job by then
// (the poller saw the job's record) makes the gate no stale gate, so the rerun writes nothing (T-38 (2)).
test("STATE_CHANGED: github work whose stale gate's claim copy names a job between validate and apply exits 3 and takes nothing over", async (t) => {
	const p = await claimPlant(t);
	await mkdir(gateOf(p), { recursive: true });
	const checked = await checkedClaimJob("work", p.root, "104", { model: ROUTE, task: "Fix" }, QUIET, AGAIN(p));
	const copy = { repo: REPO, id: 104, job: "2026-11-20-pr-104-task-1a2b3c4d", receipt: "done" };
	await writeFile(join(p.root, ".limen/github/claims/104.json"), JSON.stringify(copy));
	const changed = snapshot(p.root);
	await assert.rejects(startCheckedClaim(checked, QUIET), {
		class: "transient",
		code: "STATE_CHANGED",
		next: AGAIN(p),
	});
	assert.deepEqual(snapshot(p.root), changed);
});

// The review's branch is a step after the job's record (T-38 (3)), made once the jobs lock is let go: a branch of that
// name that another process makes between the record and the step fails the step, so the job ends `failed` with git's
// reason, and the gate stays, since a job record carries the claim and a rerun names that job.
test("GIT_FAILED: github review whose branch another process makes after the job record ends the job failed, keeps the gate and exits 4", async (t) => {
	const p = await claimPlant(t, 7);
	const { plan } = await checkedClaimJob("review", p.root, "104", { model: ROUTE }, QUIET);
	if (plan.kind !== "start") {
		assert.fail(`validate named job ${plan.id}`);
	}
	const { spawn } = plan;
	const apply = async () => {
		const record = await spawn.apply();
		git(p.root, "branch", record.branch, "main");
		return record;
	};
	const failure = await startCheckedClaim({ plan: { ...plan, spawn: { plan: spawn.plan, apply } } }, QUIET).then(
		() => assert.fail("the review started"),
		(error: unknown) => failureOf(error),
	);
	const jobs = join(p.root, ".limen/jobs");
	const records = await Promise.all((await jobFolders(jobs)).map((id) => readRecord(join(jobs, id))));
	assert.deepEqual(
		[EXIT_CODES[failure.class], failure.code, records.map((record) => record?.state), existsSync(gateOf(p))],
		[4, "GIT_FAILED", ["failed"], true],
	);
	assert.match(records[0]?.failure?.detail ?? "", /a branch named 'limen\/github-pr-7-104' already exists/);
});

// A failed start's cleanup, under the jobs lock, can take the stale gate away after the rerun's validate read it; the
// rerun then enters a gate it makes itself, and its text says no gate was removed (T-01: the text says what happened).
test("a rerun of github work whose stale gate is gone by its apply starts the job and reports no removed gate", async (t) => {
	const p = await claimPlant(t);
	await mkdir(gateOf(p), { recursive: true });
	const lines: string[] = [];
	const out: CommandText = { line: (text) => lines.push(text), diagnostic: () => {} };
	const checked = await checkedClaimJob("work", p.root, "104", { model: ROUTE, task: "Fix" }, out, AGAIN(p));
	await rm(gateOf(p), { recursive: true });
	const started = await startCheckedClaim(checked, out);
	assert.deepEqual(
		[lines.filter((line) => line.startsWith("removed the handoff gate")), existsSync(gateOf(p))],
		[[], true],
		`job ${started.ids?.job}`,
	);
});
