// The review fetch of `limen github review` (src/integrations/github-claims.ts): it checks the PR's base and head on the
// remote and fetches both commits with no ref and no FETCH_HEAD, so a refusal after it leaves no ref (T-38).
import assert from "node:assert/strict";
import { existsSync } from "node:fs";
import { mkdtemp, realpath, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { type TestContext, test } from "node:test";
import { fetchPinnedReview } from "../../src/integrations/github-claims.ts";
import { withEnvironment } from "../environment.ts";
import { git, repository } from "../plant.ts";
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
