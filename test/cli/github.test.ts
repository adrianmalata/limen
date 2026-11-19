// `limen github poll`: a failure exits with the class of its cause; GitHub is the plant's fetch sink, with no network.
import assert from "node:assert/strict";
import { generateKeyPairSync } from "node:crypto";
import { mkdir, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { type TestContext, test } from "node:test";
import { outputText, readOutcome } from "../../src/outcome.ts";
import { git, limen, type Plant, plant, type Run, respond } from "../plant.ts";

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
	assert.deepEqual(readOutcome(run), { class: "transient", code: "GITHUB_NETWORK", next: "limen github doctor" });
	const lines = outputText(run).split("\n");
	assert.ok(lines.includes(`${p.root}: GitHub GET /repos/${REPO}/installation returned HTTP 503`), run.stderr);
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
	assert.deepEqual(readOutcome(run), { class: "transient", code: "GITHUB_NETWORK", next: "limen github doctor" });
});

test("GITHUB_NETWORK: github poll exits 3 when GitHub answers HTTP 403 with a retry-after header", async (t) => {
	const run = await forbidden(t, { "retry-after": "60" });
	assert.equal(run.status, 3, run.stderr);
	assert.deepEqual(readOutcome(run), { class: "transient", code: "GITHUB_NETWORK", next: "limen github doctor" });
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
