// `limen github poll`: a failure exits with the class of its cause; GitHub is the plant's fetch sink, with no network.
// `limen github resolve`: the coordinator's no-job answer, as the poller reads it. `limen github review` and `work`:
// a refusal comes before the claim's handoff gate, and a start that fails after it takes the gate away (T-38).
import assert from "node:assert/strict";
import { generateKeyPairSync } from "node:crypto";
import { chmod, mkdir, readFile, stat, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { type TestContext, test } from "node:test";
import { withLock } from "../../src/lock.ts";
import { outputText, readOutcome } from "../final-line.ts";
import { git, limen, type Plant, plant, type Run, respond, writeRecord } from "../plant.ts";
import { snapshot } from "../snapshot.ts";

const REPO = "acme/widget";

/** The poller's settings for a plant bound to `REPO`, as the seat's unit gives them, with a stub of `id`. */
async function poller(p: Plant): Promise<Record<string, string>> {
	git(p.root, "remote", "add", "origin", `https://github.com/${REPO}.git`);
	await mkdir(join(p.root, ".limen/github/claims"), { recursive: true });
	const binding = { repo: REPO, coordinator: "coord:p1", user: "worker", connectedAt: "2026-11-19T00:00:00Z" };
	await writeFile(join(p.root, ".limen/github/binding.json"), JSON.stringify(binding));
	const state = join(p.parent, "poller");
	await mkdir(state, { mode: 0o700 });
	const key = join(p.parent, "app.pem");
	const pem = generateKeyPairSync("rsa", { modulusLength: 2048 }).privateKey.export({ type: "pkcs8", format: "pem" });
	await writeFile(key, pem, { mode: 0o600 });
	await writeFile(join(p.parent, "projects"), `${p.root}\n`);
	const workerUid = String((process.getuid?.() ?? 0) + 1);
	const id = `#!/bin/sh\n[ "$1" = -u ] && echo ${workerUid} && exit 0\necho staff\n`;
	await writeFile(join(p.bin, "id"), id, { mode: 0o755 });
	return {
		LIMEN_GITHUB_APP_ID: "1",
		LIMEN_GITHUB_KEY_FILE: key,
		LIMEN_GITHUB_PROJECTS_FILE: join(p.parent, "projects"),
		LIMEN_GITHUB_STATE_DIR: state,
		LIMEN_GITHUB_WORKER_UID: workerUid,
	};
}

test("GITHUB_NETWORK: github poll exits 3 when GitHub answers HTTP 503, after the project's own line", async (t) => {
	const p = await plant();
	t.after(() => p.cleanup());
	const env = await poller(p);
	await respond(p, [{ match: `/repos/${REPO}/installation`, status: 503, body: {} }]);
	const run = limen(p, ["github", "poll"], { env });
	assert.equal(run.status, 3, run.stderr);
	assert.deepEqual(readOutcome(run), { class: "transient", code: "GITHUB_NETWORK", next: "limen github poll" });
	const lines = outputText(run).split("\n");
	assert.ok(lines.includes(`${p.root}: GitHub GET /repos/${REPO}/installation returned HTTP 503`), run.stderr);
});

// A-018: a poll killed by a reboot or SIGKILL leaves its lock; in an older Limen every later poll failed on it with
// EEXIST. The lock here is the pid file such a poll leaves, with a pid no process has.
test("A-018: github poll takes over a poll lock whose poller is gone and goes on to GitHub", async (t) => {
	const p = await plant();
	t.after(() => p.cleanup());
	const env = await poller(p);
	await writeFile(join(p.root, ".limen/github/poll.lock"), "999999999\n");
	await respond(p, [{ match: `/repos/${REPO}/installation`, status: 503, body: {} }]);
	const run = limen(p, ["github", "poll"], { env });
	assert.equal(run.status, 3, run.stderr);
	assert.deepEqual(readOutcome(run), { class: "transient", code: "GITHUB_NETWORK", next: "limen github poll" });
});

test("A-018: github disconnect takes over a poll lock whose poller is gone and exits 0", async (t) => {
	const p = await plant();
	t.after(() => p.cleanup());
	await mkdir(join(p.root, ".limen/github"), { recursive: true });
	await writeFile(join(p.root, ".limen/github/poll.lock"), "999999999\n");
	const run = limen(p, ["github", "disconnect"]);
	assert.equal(run.status, 0, run.stderr);
	assert.match(run.stdout, /GitHub doorbell disconnected/);
});

/** `github poll` on a plant whose first GitHub request is answered HTTP 403 with `headers`. */
async function forbidden(t: TestContext, headers: Record<string, string>): Promise<Run> {
	const p = await plant();
	t.after(() => p.cleanup());
	const env = await poller(p);
	await respond(p, [{ match: `/repos/${REPO}/installation`, status: 403, body: {}, headers }]);
	return limen(p, ["github", "poll"], { env });
}

// GitHub answers an exceeded rate limit with 403 as well as 429, which T-02 puts in class 3.
test("GITHUB_NETWORK: github poll exits 3 when GitHub answers HTTP 403 with x-ratelimit-remaining 0", async (t) => {
	const run = await forbidden(t, { "x-ratelimit-remaining": "0" });
	assert.equal(run.status, 3, run.stderr);
	assert.deepEqual(readOutcome(run), { class: "transient", code: "GITHUB_NETWORK", next: "limen github poll" });
});

test("GITHUB_NETWORK: github poll exits 3 when GitHub answers HTTP 403 with a retry-after header", async (t) => {
	const run = await forbidden(t, { "retry-after": "60" });
	assert.equal(run.status, 3, run.stderr);
	assert.deepEqual(readOutcome(run), { class: "transient", code: "GITHUB_NETWORK", next: "limen github poll" });
});

// D-045 (5.2): `next` stays the same poll, and the time GitHub gives for a retry goes to the project's line on stderr,
// from `retry-after` when it is there, else from `x-ratelimit-reset` when no request remains (GitHub's own order).
test("GITHUB_NETWORK: github poll on a rate limit names the time of x-ratelimit-reset on the project's line", async (t) => {
	const run = await forbidden(t, { "x-ratelimit-remaining": "0", "x-ratelimit-reset": "1795262400" });
	assert.equal(run.status, 3, run.stderr);
	const line = outputText(run)
		.split("\n")
		.find((text) => text.includes("installation returned HTTP 403"));
	assert.match(line ?? run.stderr, /returned HTTP 403 \(rate limit\); retry after 2026-11-21T12:00:00\.000Z$/);
});

test("GITHUB_NETWORK: github poll on a rate limit names the time retry-after gives on the project's line", async (t) => {
	const before = Date.now();
	const run = await forbidden(t, { "retry-after": "60" });
	const after = Date.now();
	const at = Date.parse(/returned HTTP 403 \(rate limit\); retry after (\S+)$/m.exec(outputText(run))?.[1] ?? "");
	assert.ok(at >= before + 60_000 && at <= after + 60_000, run.stderr);
});

test("GITHUB_CONFIG: github poll exits 4 when GitHub answers HTTP 403 that is not a rate limit", async (t) => {
	const run = await forbidden(t, { "x-ratelimit-remaining": "4999" });
	assert.equal(run.status, 4, run.stderr);
	assert.deepEqual(readOutcome(run), { class: "environment", code: "GITHUB_CONFIG", next: "limen github doctor" });
	assert.match(outputText(run), /installation returned HTTP 403$/m);
});

test("GITHUB_CONFIG: github poll without its projects file setting exits 4 and names the setting", async (t) => {
	const p = await plant();
	t.after(() => p.cleanup());
	const run = limen(p, ["github", "poll"]);
	assert.equal(run.status, 4, run.stderr);
	assert.deepEqual(readOutcome(run), { class: "environment", code: "GITHUB_CONFIG", next: "limen github doctor" });
	assert.match(outputText(run), /LIMEN_GITHUB_PROJECTS_FILE/);
});

test("GITHUB_CONFIG: github poll exits 4 and names the setting when its projects file is missing", async (t) => {
	const p = await plant();
	t.after(() => p.cleanup());
	const env = { ...(await poller(p)), LIMEN_GITHUB_PROJECTS_FILE: join(p.parent, "no-projects") };
	const run = limen(p, ["github", "poll"], { env });
	assert.equal(run.status, 4, run.stderr);
	assert.deepEqual(readOutcome(run), { class: "environment", code: "GITHUB_CONFIG", next: "limen github doctor" });
	assert.match(outputText(run), /LIMEN_GITHUB_PROJECTS_FILE/);
});

/** A plant bound to `REPO` whose registered coordinator `coord:p1` is an idle Herdr agent, with claim 104; its env. */
async function coordinatorWithClaim(p: Plant): Promise<Record<string, string>> {
	git(p.root, "remote", "add", "origin", `https://github.com/${REPO}.git`);
	await mkdir(join(p.root, ".limen/github/claims"), { recursive: true });
	const binding = { repo: REPO, coordinator: "coord:p1", user: "worker", connectedAt: "2026-11-19T00:00:00Z" };
	await writeFile(join(p.root, ".limen/github/binding.json"), JSON.stringify(binding));
	await writeFile(join(p.root, ".limen/github/claims/104.json"), JSON.stringify({ repo: REPO, id: 104 }));
	const agent = JSON.stringify({ result: { agent: { pane_id: "coord:p1", agent_status: "idle" } } });
	const tools = {
		herdr: `#!/bin/sh\n[ "$1 $2 $3" = "agent get coord:p1" ] && echo '${agent}' && exit 0\nexit 1\n`,
		id: "#!/bin/sh\necho staff\n",
		sudo: "#!/bin/sh\nexit 1\n",
	};
	for (const [name, text] of Object.entries(tools)) {
		await writeFile(join(p.bin, name), text, { mode: 0o755 });
	}
	return { LIMEN_HERDR: join(p.bin, "herdr"), HERDR_ENV: "1", LIMEN_COORDINATOR: "1", HERDR_PANE_ID: "coord:p1" };
}

// The poller reads the answer only from a file with one name (`readJobFile`), so the answer never has a second one.
test("github resolve records the no-job answer under one name, and a second resolve of the claim refuses at its gate", async (t) => {
	const p = await plant();
	t.after(() => p.cleanup());
	const env = await coordinatorWithClaim(p);
	const nonce = "0".repeat(48);
	const first = limen(p, ["github", "resolve", p.root, "104", nonce, "Already fixed on main"], { env });
	assert.equal(first.status, 0, first.stderr);
	const outcome = join(p.root, ".limen/github/outcomes/104.json");
	assert.equal((await stat(outcome)).nlink, 1);
	const second = limen(p, ["github", "resolve", p.root, "104", nonce, "Another answer"], { env });
	assert.notEqual(second.status, 0, second.stdout);
	assert.match(outputText(second), /inflight\/104/);
	assert.equal(JSON.parse(await readFile(outcome, "utf8")).answer, "Already fixed on main");
});

const MODEL = ["--engine", "pi", "--provider", "p", "--model", "m", "--thinking", "high"];

const WORK = ["github", "work"] as const;

// Before R-092 the handoff gate was made before spawn's checks and never taken away.
test("BAD_ENGINE: github work with an engine spawn refuses exits 2 before the claim's handoff gate exists", async (t) => {
	const p = await plant();
	t.after(() => p.cleanup());
	const env = await coordinatorWithClaim(p);
	const before = snapshot(p.root);
	const route = ["--engine", "claude", "--provider", "p", "--model", "m", "--thinking", "high"];
	const run = limen(p, [...WORK, p.root, "104", ...route, "--task", "Fix it"], { env });
	assert.deepEqual([run.status, readOutcome(run).code, snapshot(p.root)], [2, "BAD_ENGINE", before], run.stderr);
});

test("GITHUB_ISSUE_REVIEW: github review of an issue claim exits 1 before the claim's handoff gate exists", async (t) => {
	const p = await plant();
	t.after(() => p.cleanup());
	const env = await coordinatorWithClaim(p);
	const issue = { repo: REPO, id: "issue-5", kind: "issue", pr: 5 };
	await writeFile(join(p.root, ".limen/github/claims/issue-5.json"), JSON.stringify(issue));
	const before = snapshot(p.root);
	const run = limen(p, ["github", "review", p.root, "issue-5", ...MODEL], { env });
	assert.deepEqual(
		[run.status, readOutcome(run).code, snapshot(p.root)],
		[1, "GITHUB_ISSUE_REVIEW", before],
		run.stderr,
	);
});

// A job record that carries the claim's marker but neither shape of its job conflicts: validate refuses it, before
// the gate, so no refusal comes after a write (T-38 (1)).
test("GITHUB_CONFLICT: github work on a claim that a job of another shape carries exits 1 before the claim's handoff gate exists", async (t) => {
	const p = await plant();
	t.after(() => p.cleanup());
	const env = await coordinatorWithClaim(p);
	const forged = join(p.root, ".limen/jobs/2026-11-21-forged-1a2b3c4d");
	await writeRecord(forged, { state: "done", role: "reviewer" });
	await writeFile(join(forged, "task.md"), "GitHub doorbell: acme/widget#104\nReview it.\n");
	const before = snapshot(p.root);
	const run = limen(p, [...WORK, p.root, "104", ...MODEL, "--task", "Fix it"], { env });
	assert.deepEqual([run.status, readOutcome(run).code, snapshot(p.root)], [1, "GITHUB_CONFLICT", before], run.stderr);
});

// T-38 (2): the gate is the first write of the spawn's apply, after its re-check under the jobs lock, so a wait that
// runs out on that lock ends the handoff before it writes anything.
test("LOCK_TIMEOUT: github work whose spawn waits out the jobs lock exits 3 and leaves the snapshot identical", async (t) => {
	const p = await plant();
	t.after(() => p.cleanup());
	const env = { ...(await coordinatorWithClaim(p)), LIMEN_LOCK_WAIT_MS: "100" };
	const { before, run, after } = await withLock({ file: join(p.root, ".limen", "jobs") }, async () => {
		const before = snapshot(p.root);
		const run = limen(p, [...WORK, p.root, "104", ...MODEL, "--task", "Fix it"], { env });
		return { before, run, after: snapshot(p.root) };
	});
	assert.deepEqual([run.status, readOutcome(run).code, after], [3, "LOCK_TIMEOUT", before], run.stderr);
});

// A start that fails after the gate and before a job record answers the claim takes the gate away, and the folder of
// gates it made, so a rerun needs no recovery by hand. The record fails to land in a jobs folder the test makes
// read-only; the folders a spawn's apply makes before the record (the worktree folder, the prune lock's) exist already.
test("STEP_FAILED: github work whose job record cannot be published exits 4 and takes the claim's handoff gate away", async (t) => {
	const p = await plant();
	t.after(async () => {
		await chmod(join(p.root, ".limen/jobs"), 0o755);
		await p.cleanup();
	});
	const env = await coordinatorWithClaim(p);
	await mkdir(join(p.parent, ".repo-limen-worktrees"));
	await mkdir(join(p.root, ".limen/prune"), { recursive: true });
	await chmod(join(p.root, ".limen/jobs"), 0o555);
	const before = snapshot(p.root);
	const run = limen(p, [...WORK, p.root, "104", ...MODEL, "--task", "Fix it"], { env });
	assert.deepEqual([run.status, readOutcome(run).code, snapshot(p.root)], [4, "STEP_FAILED", before], run.stderr);
});

test("github work run again after a start that failed before its job record starts the job", async (t) => {
	const p = await plant();
	t.after(() => p.cleanup());
	const env = { ...(await coordinatorWithClaim(p)), LIMEN_LOCK_WAIT_MS: "100" };
	const held = await withLock({ file: join(p.root, ".limen", "jobs") }, async () =>
		limen(p, [...WORK, p.root, "104", ...MODEL, "--task", "Fix it"], { env }),
	);
	const rerun = limen(p, [...WORK, p.root, "104", ...MODEL, "--task", "Fix it"], { env });
	assert.deepEqual([held.status, rerun.status], [3, 0], rerun.stderr);
});
