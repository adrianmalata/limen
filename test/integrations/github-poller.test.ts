// The poller's reconcile of one claim (src/integrations/github-poller.ts), with GitHub answered in the test's process:
// the replies for a claim whose job retire moved to the job archive.
import assert from "node:assert/strict";
import { mkdir, mkdtemp, realpath, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { type TestContext, test } from "node:test";
import { reconcileGithubClaim } from "../../src/integrations/github-poller.ts";
import { writeRecord } from "../plant.ts";

const REPO = "acme/widget";
const ID = "2026-11-20-pr-7-task-1a2b3c4d";
const FOLDER = `.limen/archive/2026-11/${ID}`;

/**
 * A project whose finished work job of claim 104 retire moved to the job archive with its `result`, the poller's
 * private copy of the claim with `fields`, and every request to GitHub kept in `posts` (the writes) and answered: a
 * listing with no comment, a new comment with its ID.
 */
async function archivedClaimJob(t: TestContext, fields: object) {
	const parent = await realpath(await mkdtemp(join(tmpdir(), "limen-poller-")));
	t.after(() => rm(parent, { recursive: true, force: true }));
	const root = join(parent, "project");
	const state = join(parent, "poller");
	await mkdir(join(root, ".limen/github/claims"), { recursive: true });
	await mkdir(join(state, "claims"), { recursive: true });
	const branch = "limen/github-pr-7-104";
	const landed = { sha: "1".repeat(40), at: "2026-11-20T12:00:00.000Z" };
	await writeRecord(join(root, FOLDER), { state: "done", role: "worker", base: "0".repeat(40), branch, landed });
	await writeFile(join(root, FOLDER, "task.md"), `GitHub doorbell: ${REPO}#104\nCoordinator task: Fix it\n`);
	await writeFile(join(root, FOLDER, "result"), "Fixed the crash in widget.ts.\n");
	await writeFile(join(root, FOLDER, "log"), "the job's log\n");
	const claim = { repo: REPO, id: 104, pr: 7, actor: "alice", url: "u", base: "a".repeat(40), baseRef: "main" };
	await writeFile(join(state, "claims", "104.json"), JSON.stringify({ ...claim, head: "b".repeat(40), ...fields }));
	const posts: { url: string; body: string }[] = [];
	t.mock.method(globalThis, "fetch", async (url: string, init: RequestInit = {}) => {
		const method = init.method ?? "GET";
		if (method !== "GET") {
			posts.push({ url, body: JSON.parse(String(init.body)).body });
		}
		const answer = method === "GET" ? [] : { id: 900 + posts.length };
		return new Response(JSON.stringify(answer), { status: 200, headers: { "content-type": "application/json" } });
	});
	return { root, state, posts };
}

// R-031, review round 2, G1: before the fix the poller read `result` and `log` from .limen/jobs/<id>/, so its terminal
// reply said "No result or check evidence recorded." and named `limen show <id>`, which refuses an archived job.
test("the terminal reply of a claim whose job retire moved to the job archive carries its result and names its folder", async (t) => {
	const seen = { job: ID, branch: "limen/github-pr-7-104", receipt: "done", startComment: 899 };
	const { root, state, posts } = await archivedClaimJob(t, seen);
	await reconcileGithubClaim(root, state, 104, "token");
	const [terminal] = posts;
	assert.deepEqual(
		[
			posts.map((post) => post.url),
			terminal?.body.includes("Fixed the crash in widget.ts."),
			terminal?.body.includes(`its folder in the job archive, \`${FOLDER}\``),
			terminal?.body.includes("limen show"),
		],
		[[`https://api.github.com/repos/${REPO}/issues/7/comments`], true, true, false],
		terminal?.body,
	);
});

// A job retired before the poller saw it past `starting` gets its start reply from the archive too (R-099's open
// point 2); `limen show` refuses such a job, so the reply names its folder.
test("the start reply of a claim whose job the poller first finds in the job archive names its folder, not limen show", async (t) => {
	const { root, state, posts } = await archivedClaimJob(t, { receipt: "prompt accepted" });
	await reconcileGithubClaim(root, state, 104, "token");
	const [start] = posts;
	assert.deepEqual(
		[
			posts.length,
			start?.body.startsWith("Limen started a task"),
			start?.body.includes(`its folder in the job archive, \`${FOLDER}\``),
			start?.body.includes("limen show"),
		],
		[2, true, true, false],
		start?.body,
	);
});
