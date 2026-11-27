import { spawnSync } from "node:child_process";
import { createHash, createSign, randomBytes } from "node:crypto";
import { mkdir, readdir, readFile, realpath, stat } from "node:fs/promises";
import { dirname, isAbsolute, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { atomicWrite } from "../atomic-write.ts";
import { exception } from "../config.ts";
import { readJobFile } from "../job/record.ts";
import { withLock } from "../lock.ts";
import { type CommandText, EXIT_CODES, failureOf, LimenError } from "../outcome.ts";
import { moduleOn } from "../project/modules.ts";
import { runLimen } from "../runtime/launcher.ts";
import {
	claimId,
	claimPath,
	GITHUB_ANSWER_MAX,
	type GithubBinding,
	type GithubClaim,
	githubDir,
	githubSubject,
	HANDOFF_NONCE_BYTES,
	matchedGithubJob,
	originRepository,
	readBinding,
} from "./github-review.ts";

const API = "https://api.github.com";
const PAGE = 100;
type Comment = {
	id: number;
	body: string | null;
	created_at: string;
	html_url: string;
	issue_url: string;
	user: { login: string } | null;
};
type Pull = {
	number: number;
	state: string;
	html_url: string;
	title?: string;
	body?: string | null;
	base: { sha: string; ref: string; repo: { full_name: string } };
	head: { sha: string };
};
type Issue = {
	number: number;
	state: string;
	title?: string;
	body?: string | null;
	repository_url: string;
	pull_request?: object;
	created_at: string;
	html_url: string;
	user: { login: string } | null;
};
// The comment ID, or `issue-<number>` for an issue body. `command` is absent when the body itself is the request.
type Trigger = { id: number | string; pr: number; actor: string; url: string; command?: string };

function mentionsLimen(body: string): boolean {
	let fence: string | undefined;
	for (const line of body.replace(/<!--[\s\S]*?(?:-->|$)/g, "").split("\n")) {
		const marker = /^\s*(`{3,}|~{3,})/.exec(line)?.[1];
		if (marker) {
			if (!fence) {
				fence = marker;
			} else if (marker[0] === fence[0] && marker.length >= fence.length) {
				fence = undefined;
			}
			continue;
		}
		if (fence || /^\s*>/.test(line) || /^( {4}|\t)/.test(line)) {
			continue;
		}
		const plain = line.replace(/`+[^`]*`+/g, "");
		if (/(^|\s)(?:@limen|\/limen)(?=$|[\s.,!?;:])/i.test(plain)) {
			return true;
		}
	}
	return false;
}

function sameRepo(repo: string, expected: string): boolean {
	return repo.toLowerCase() === expected.toLowerCase();
}

function boundedContext(text: string, limit: number, label: string, link: string): string {
	return text.length > limit ? `${text.slice(0, limit)}\n[${label} truncated; see ${link}]` : text;
}

const DOCTOR = "limen github doctor";
const reason = (cause: unknown) => (cause instanceof Error ? cause.message : String(cause));
/**
 * The network or GitHub's own state (T-02: transient, safe to retry at the timer's next run). `next` is the same poll:
 * `limen github doctor` checks only local settings, which are fine on a 429 or a 5xx (D-045 (5.2)).
 */
function networkFailure(message: string, cause?: unknown): LimenError {
	return new LimenError({ class: "transient", code: "GITHUB_NETWORK", message, next: "limen github poll", cause });
}

/**
 * When GitHub lets the poller retry, by its own order: the `retry-after` header (seconds, or an HTTP date), else, when
 * no request remains, the `x-ratelimit-reset` header (epoch seconds); undefined when it names no time.
 */
function retryTime(response: Response): Date | undefined {
	const after = response.headers.get("retry-after")?.trim();
	const reset = response.headers.get("x-ratelimit-reset")?.trim() ?? "";
	const spent = response.headers.get("x-ratelimit-remaining") === "0";
	let at = Number.NaN;
	if (after !== undefined) {
		at = /^\d+$/.test(after) ? Date.now() + Number(after) * 1000 : Date.parse(after);
	} else if (spent && /^\d+$/.test(reset)) {
		at = Number(reset) * 1000;
	}
	// A time past what a Date holds is no time either, so the message never fails on it.
	const date = new Date(at);
	return Number.isNaN(date.getTime()) ? undefined : date;
}

/** The network failure of a request GitHub answered with 429, a 5xx or a rate limit, with its retry time if it gives one. */
function retryLater(failure: string, response: Response): LimenError {
	const at = retryTime(response);
	return networkFailure(at === undefined ? failure : `${failure}; retry after ${at.toISOString()}`);
}
/** A missing or invalid setting or credential of the poller (T-02: environment); `limen github doctor` names it. */
function configFailure(message: string, cause?: unknown): LimenError {
	return new LimenError({ class: "environment", code: "GITHUB_CONFIG", message, next: DOCTOR, cause });
}

/** GitHub answers an exceeded rate limit with 403 as well as 429, and T-02 puts a rate limit in class 3. */
function rateLimit403(response: Response): boolean {
	return (
		response.status === 403 &&
		(response.headers.get("x-ratelimit-remaining") === "0" || response.headers.has("retry-after"))
	);
}

/**
 * The one request function (D-028): a rejected fetch, 429, 5xx and a 403 that is a rate limit are the network; 401
 * and any other 403 a credential.
 */
async function api<T>(path: string, token: string, method = "GET", body?: object): Promise<T> {
	const what = `GitHub ${method} ${path.split("?")[0]}`;
	const response = await fetch(`${API}${path}`, {
		method,
		headers: {
			Authorization: `Bearer ${token}`,
			Accept: "application/vnd.github+json",
			"X-GitHub-Api-Version": "2022-11-28",
			...(body ? { "Content-Type": "application/json" } : {}),
		},
		...(body ? { body: JSON.stringify(body) } : {}),
		signal: AbortSignal.timeout(15_000),
	}).catch((cause: unknown) => {
		throw networkFailure(`${what} failed: ${reason(cause)}`, cause);
	});
	if (!response.ok) {
		const failure = `${what} returned HTTP ${response.status}`;
		if (response.status === 429 || response.status >= 500) {
			throw retryLater(failure, response);
		}
		if (rateLimit403(response)) {
			throw retryLater(`${failure} (rate limit)`, response);
		}
		if (response.status === 401 || response.status === 403) {
			throw configFailure(failure);
		}
		throw new Error(failure);
	}
	return response.status === 204 ? (undefined as T) : ((await response.json()) as T);
}

// GitHub answers HTTP 404 for a missing resource or a hidden collaborator; either ends the handoff quietly.
async function found<T>(path: string, token: string): Promise<T | undefined> {
	try {
		return await api<T>(path, token);
	} catch (error) {
		if (String(error).includes("HTTP 404")) {
			return undefined;
		}
		throw error;
	}
}

async function installationToken(repo: string, jwt: string): Promise<string> {
	const installation = await api<{ id: number }>(`/repos/${repo}/installation`, jwt);
	const result = await api<{ token: string }>(`/app/installations/${installation.id}/access_tokens`, jwt, "POST", {
		repositories: [repo.split("/")[1]],
	});
	if (!result.token) {
		throw configFailure(`GitHub did not issue an installation token for ${repo}`);
	}
	return result.token;
}
async function privatePath(path: string, allowed: readonly number[]): Promise<void> {
	const real = await realpath(path);
	for (let parent = dirname(real); ; parent = dirname(parent)) {
		const info = await stat(parent);
		if (!allowed.includes(info.uid) || (info.mode & 0o022) !== 0) {
			throw configFailure(`unsafe owner or permissions on ${parent}`);
		}
		if (parent === dirname(parent)) {
			break;
		}
	}
}

async function appJwt(): Promise<string> {
	const id = exception("LIMEN_GITHUB_APP_ID");
	const path = exception("LIMEN_GITHUB_KEY_FILE");
	if (!id || !/^\d+$/.test(id) || !path || !isAbsolute(path)) {
		throw configFailure("poller needs LIMEN_GITHUB_APP_ID and absolute LIMEN_GITHUB_KEY_FILE");
	}
	const key = await stat(path).catch((cause: unknown) => {
		throw configFailure(`the App key LIMEN_GITHUB_KEY_FILE is not readable: ${reason(cause)}`, cause);
	});
	await privatePath(path, [0, process.getuid?.() ?? -1]);
	if (key.uid !== process.getuid?.() || !key.isFile() || (key.mode & 0o077) !== 0) {
		throw configFailure("App key must be a mode-0600 regular file owned by the poller Unix user");
	}
	const now = Math.floor(Date.now() / 1000);
	const header = Buffer.from(JSON.stringify({ alg: "RS256", typ: "JWT" })).toString("base64url");
	const payload = Buffer.from(JSON.stringify({ iat: now - 60, exp: now + 540, iss: id })).toString("base64url");
	const signature = createSign("RSA-SHA256")
		.update(`${header}.${payload}`)
		.sign(await readFile(path))
		.toString("base64url");
	return `${header}.${payload}.${signature}`;
}

async function mirror(root: string, claim: GithubClaim): Promise<void> {
	await atomicWrite(claimPath(root, claim.id), `${JSON.stringify({ ...claim, outcomeNonce: undefined })}\n`, {
		mode: 0o660,
	});
}

async function persist(root: string, state: string, claim: GithubClaim): Promise<void> {
	await atomicWrite(join(state, "claims", `${claim.id}.json`), `${JSON.stringify(claim)}\n`, { mode: 0o600 });
	await mirror(root, claim); // worker-readable handoff, never an input to App posting
}

async function existingReceipt(repo: string, pr: number, marker: string, token: string): Promise<number | undefined> {
	for (let page = 1; ; page++) {
		const comments = await api<
			Array<{ id: number; body: string | null; performed_via_github_app: { id: number } | null }>
		>(`/repos/${repo}/issues/${pr}/comments?per_page=${PAGE}&page=${page}`, token);
		const found = comments.find(
			(comment) =>
				comment.performed_via_github_app?.id === Number(exception("LIMEN_GITHUB_APP_ID")) &&
				comment.body?.includes(marker),
		);
		if (found) {
			return found.id;
		}
		if (comments.length < PAGE) {
			return undefined;
		}
	}
}

async function reply(
	root: string,
	state: string,
	claim: GithubClaim,
	token: string,
	kind: "start" | "terminal" | "notice",
	body: string,
): Promise<void> {
	const field = kind === "start" ? "startComment" : kind === "terminal" ? "terminalComment" : "noticeComment";
	if (claim[field]) {
		return;
	}
	const marker = `<!-- limen-github ${claim.repo.toLowerCase()} ${claim.id} ${kind} -->`;
	const prior = await existingReceipt(claim.repo, claim.pr, marker, token);
	const posted =
		prior ??
		(
			await api<{ id: number }>(`/repos/${claim.repo}/issues/${claim.pr}/comments`, token, "POST", {
				body: `${body}\n\n${marker}`,
			})
		).id;
	claim[field] = posted;
	await persist(root, state, claim);
}

// The test seam also reads authority from the private store; a checkout claim is never an input.
export async function reconcileGithubClaim(
	root: string,
	state: string,
	id: number | string,
	token: string,
): Promise<void> {
	let claim: GithubClaim;
	try {
		claim = JSON.parse(await readFile(join(state, "claims", `${id}.json`), "utf8")) as GithubClaim;
	} catch (error) {
		if ((error as NodeJS.ErrnoException).code === "ENOENT") {
			return;
		}
		throw error;
	}
	await reconcile(root, state, claim, token);
}

// biome-ignore lint/complexity/noExcessiveCognitiveComplexity: split pending: GitHub claim reconcile
// biome-ignore lint/complexity/noExcessiveLinesPerFunction: same split as the line above
async function reconcile(root: string, state: string, claim: GithubClaim, token: string): Promise<void> {
	const found = await matchedGithubJob(root, claim);
	if (claim.receipt === "resolved") {
		await reply(
			root,
			state,
			claim,
			token,
			"terminal",
			`A seat-recorded answer for ${githubSubject(claim)} without starting a job (shared worker/coordinator account; answer text is not independently authenticated):\n\n${claim.answer ?? "No answer recorded."}\n\nNo review approval or merge occurred.`,
		);
		return;
	}
	if (!found) {
		if (
			claim.receipt === "prompt accepted" ||
			claim.receipt?.startsWith("handoff attempted; outcome unconfirmed") ||
			claim.receipt?.startsWith("pending: no matching job record")
		) {
			const binding = await readBinding(root);
			const outcome = await readJobFile(join(githubDir(root), "outcomes", `${claim.id}.json`))
				.then(
					(text) =>
						JSON.parse(text) as { repo: string; id: number; coordinator: string; nonce: string; answer: string },
				)
				.catch(() => undefined);
			if (binding && claim.outcomeNonce && outcome?.nonce === claim.outcomeNonce) {
				const repositoriesMatch =
					typeof outcome.repo === "string" &&
					sameRepo(outcome.repo, claim.repo) &&
					sameRepo(binding.repo, claim.repo) &&
					sameRepo(originRepository(root, true), claim.repo);
				const requestMatches =
					repositoriesMatch && outcome.id === claim.id && outcome.coordinator === binding.coordinator;
				const answerUsable =
					requestMatches &&
					typeof outcome.answer === "string" &&
					outcome.answer.trim() &&
					outcome.answer.length <= GITHUB_ANSWER_MAX;
				if (answerUsable) {
					claim.answer = outcome.answer.trim();
					claim.receipt = "resolved";
					await persist(root, state, claim);
					await reply(
						root,
						state,
						claim,
						token,
						"terminal",
						`A seat-recorded answer for ${githubSubject(claim)} without starting a job (shared worker/coordinator account; answer text is not independently authenticated):\n\n${claim.answer}\n\nNo review approval or merge occurred.`,
					);
					return;
				}
			}
		}
		if (
			claim.receipt?.startsWith("pending: coordinator unavailable") &&
			Date.now() - Date.parse(claim.attemptedAt ?? "") > 30_000
		) {
			const binding = await readBinding(root);
			if (binding && sameRepo(binding.repo, claim.repo) && sameRepo(originRepository(root, true), claim.repo)) {
				await handoff(root, state, binding, claim, token);
			}
		}
		if (
			(claim.receipt?.startsWith("handoff attempted; outcome unconfirmed") || claim.receipt === "prompt accepted") &&
			Date.now() - Date.parse(claim.attemptedAt ?? "") > 90_000
		) {
			claim.receipt = "pending: no matching job record; inspect coordinator before retry";
			await persist(root, state, claim);
			await reply(
				root,
				state,
				claim,
				token,
				"notice",
				`Limen request for ${githubSubject(claim)} is pending: handoff to the Herdr coordinator is unconfirmed and no job has been observed. Inspect this seat's .limen/github/claims/${claim.id}.json; no job was started.`,
			);
		}
		return;
	}
	if (!claim.job || claim.receipt !== found.state) {
		claim.job = found.id;
		claim.branch = found.branch;
		claim.receipt = found.state;
		await persist(root, state, claim);
	}
	await reply(
		root,
		state,
		claim,
		token,
		"start",
		`Limen started a ${found.review ? "review" : "task"} for ${githubSubject(claim)}${found.review ? ` at pinned head \`${claim.head}\` against base \`${claim.base}\`` : " from the registered repository"}. Job: \`${found.id}\`; branch: \`${found.branch}\`. On its owning seat: ${inspection(found)}. This is not an approval.`,
	);
	if (!found.state || found.state === "running") {
		return;
	}
	const { job, result, log } = await finishedEvidence(root, claim, found);
	const evidence =
		result.trim().slice(0, 1600) ||
		log.trim().split("\n").slice(-10).join("\n").slice(0, 1600) ||
		"No result or check evidence recorded.";
	await reply(
		root,
		state,
		claim,
		token,
		"terminal",
		`Limen ${job.review ? "review" : "task"} job \`${job.id}\` ended with state **${job.state}**. This is job termination, not review approval or a merge.\n\nRecorded evidence/result:\n\n\`\`\`text\n${evidence.replaceAll("```", "''' ")}\n\`\`\`\n\nInspect on the owning seat: ${inspection(job)}.`,
	);
}

/** The claim's job as `matchedGithubJob` finds it. */
type FoundJob = NonNullable<Awaited<ReturnType<typeof matchedGithubJob>>>;

/**
 * The `result` and the end of the `log` of the claim's finished job, read in its folder where `found` places it, since
 * retire may have moved the job to the job archive since it ended. When either read misses, the job is looked up once
 * more, in the job archive too, and read where that finds it, since a retire between the lookup and the reads moved
 * its folder (D-097 (4) (h)). Returns the reads with the job as last found, whose folder the reply names.
 */
async function finishedEvidence(
	root: string,
	claim: GithubClaim,
	found: FoundJob,
): Promise<{ readonly job: FoundJob; readonly result: string; readonly log: string }> {
	const read = async (job: FoundJob) => {
		const dir = join(root, job.archived ?? join(".limen/jobs", job.id));
		const [result, log] = await Promise.all([
			readJobFile(join(dir, "result")),
			readJobFile(join(dir, "log"), 65_536, true),
		]);
		return { job, result, log };
	};
	const first = await read(found);
	if (first.result !== "" && first.log !== "") {
		return first;
	}
	const again = await matchedGithubJob(root, claim);
	return again !== undefined && again.archived !== found.archived ? read(again) : first;
}

/**
 * Where a person inspects the claim's job on its seat: `limen show`, or for a job in the job archive, which `limen
 * show` refuses, its folder there, so no reply names a command that refuses (T-37; R-031, review round 2, G1).
 */
function inspection(found: { readonly id: string; readonly archived?: string }): string {
	return found.archived === undefined
		? `\`limen show ${found.id}\``
		: `its folder in the job archive, \`${found.archived}\``;
}

export { accept as acceptGithubComment };

async function authorized(binding: GithubBinding, login: string, token: string): Promise<boolean> {
	const permission = await found<{ permission: string }>(
		`/repos/${binding.repo}/collaborators/${encodeURIComponent(login)}/permission`,
		token,
	);
	return Boolean(permission && ["admin", "write", "maintain"].includes(permission.permission));
}

async function accept(
	root: string,
	state: string,
	binding: GithubBinding,
	comment: Comment,
	token: string,
): Promise<void> {
	if (
		!comment.body ||
		!mentionsLimen(comment.body) ||
		!comment.user ||
		Date.parse(comment.created_at) < Date.parse(binding.connectedAt)
	) {
		return;
	}
	if (!Number.isSafeInteger(comment.id) || comment.id < 1) {
		throw new Error("GitHub comment has an invalid ID");
	}
	const pr = Number(/\/issues\/(\d+)$/.exec(comment.issue_url)?.[1]);
	if (!Number.isSafeInteger(pr) || pr < 1) {
		return;
	}
	if (!(await authorized(binding, comment.user.login, token))) {
		return;
	}
	// GitHub answers 404 on /pulls/<n> for an issue. The issue API also returns pull requests, so it re-checks.
	const pull = await found<Pull>(`/repos/${binding.repo}/pulls/${pr}`, token);
	const issue = pull ? undefined : await found<Issue>(`/repos/${binding.repo}/issues/${pr}`, token);
	const thread = pull ?? issue;
	if (thread?.state !== "open" || thread.number !== pr) {
		return;
	}
	if (pull) {
		if (!sameRepo(pull.base.repo.full_name, binding.repo)) {
			return;
		}
		if (
			!/^[0-9a-f]{40}$/.test(pull.head.sha) ||
			!/^[0-9a-f]{40}$/.test(pull.base.sha) ||
			!/^[\w./-]+$/.test(pull.base.ref)
		) {
			throw new Error("GitHub returned invalid PR refs");
		}
	} else {
		if (issue?.pull_request) {
			return;
		}
		if (!issue || !sameRepo(issue.repository_url, `${API}/repos/${binding.repo}`)) {
			return;
		}
	}
	await request(
		root,
		state,
		binding,
		{ id: comment.id, pr, actor: comment.user.login, url: comment.html_url, command: comment.body },
		thread,
		token,
	);
}

// The body as first read decides: an open issue, not a pull request, opened after connect by a write-or-higher author. The title never counts.
async function acceptIssue(
	root: string,
	state: string,
	binding: GithubBinding,
	issue: Issue,
	token: string,
): Promise<void> {
	if (
		issue.pull_request ||
		issue.state !== "open" ||
		!issue.body ||
		!mentionsLimen(issue.body) ||
		!issue.user ||
		Date.parse(issue.created_at) < Date.parse(binding.connectedAt)
	) {
		return;
	}
	if (!Number.isSafeInteger(issue.number) || issue.number < 1) {
		throw new Error("GitHub issue has an invalid number");
	}
	if (!sameRepo(issue.repository_url, `${API}/repos/${binding.repo}`)) {
		return;
	}
	if (!(await authorized(binding, issue.user.login, token))) {
		return;
	}
	await request(
		root,
		state,
		binding,
		{ id: `issue-${issue.number}`, pr: issue.number, actor: issue.user.login, url: issue.html_url },
		issue,
		token,
	);
}

// biome-ignore lint/complexity/noExcessiveCognitiveComplexity: split pending: GitHub API request
async function request(
	root: string,
	state: string,
	binding: GithubBinding,
	trigger: Trigger,
	thread: Pull | Issue,
	token: string,
): Promise<void> {
	const pull = "base" in thread ? thread : undefined;
	const pr = trigger.pr;
	const path = join(state, "claims", `${trigger.id}.json`);
	let claim: GithubClaim;
	try {
		claim = JSON.parse(await readFile(path, "utf8")) as GithubClaim;
	} catch (error) {
		if ((error as NodeJS.ErrnoException).code !== "ENOENT") {
			throw error;
		}
		const link = `https://github.com/${binding.repo}/${pull ? "pull" : "issues"}/${pr}`;
		const discussion: string[] = [];
		for (const endpoint of [
			`/repos/${binding.repo}/issues/${pr}/comments`,
			...(pull ? [`/repos/${binding.repo}/pulls/${pr}/comments`, `/repos/${binding.repo}/pulls/${pr}/reviews`] : []),
		]) {
			let entries: Array<{ id: number; body: string | null; user: { login: string } | null }>;
			try {
				entries = await api<typeof entries>(`${endpoint}?per_page=${PAGE}`, token);
			} catch (error) {
				if (!endpoint.includes("/issues/") && /HTTP (403|404)/.test(String(error))) {
					discussion.push(`[${endpoint.split("/").at(-1)} unavailable via App; see ${link}]`);
					continue;
				}
				throw error;
			}
			let used = 0;
			for (const entry of entries) {
				if (endpoint.includes("/issues/") && entry.id === trigger.id) {
					continue;
				}
				const body = entry.body ?? "";
				const line = `${entry.user?.login ?? "unknown"}: ${body.slice(0, 1200)}${body.length > 1200 ? " [comment excerpt truncated]" : ""}`;
				if (used + line.length > 3500) {
					discussion.push(`[Further ${endpoint.split("/").at(-1)} omitted; see ${link}]`);
					break;
				}
				discussion.push(line);
				used += line.length;
			}
			if (entries.length === PAGE) {
				discussion.push(`[More ${endpoint.split("/").at(-1)} may exist; first ${PAGE} fetched at ${link}]`);
			}
		}
		const excerpt = discussion.join("\n");
		claim = {
			repo: binding.repo,
			id: trigger.id,
			pr,
			actor: trigger.actor,
			url: trigger.url,
			...(pull ? { base: pull.base.sha, baseRef: pull.base.ref, head: pull.head.sha } : { kind: "issue" as const }),
			title: boundedContext(thread.title ?? "", 500, pull ? "PR title" : "Issue title", link),
			body: boundedContext(thread.body ?? "", 6000, pull ? "PR body" : "Issue body", link),
			discussion: boundedContext(excerpt, 12000, "Discussion", link),
			outcomeNonce: randomBytes(HANDOFF_NONCE_BYTES).toString("hex"),
			...(trigger.command === undefined
				? {}
				: { command: boundedContext(trigger.command, 4000, "Triggering comment", trigger.url) }),
		};
		await atomicWrite(path, `${JSON.stringify(claim)}\n`, { exclusive: true, mode: 0o600 }); // authoritative claim before handoff
		await mirror(root, claim);
	}
	if (claim.receipt || claim.job) {
		await reconcile(root, state, claim, token);
		return;
	}
	await handoff(root, state, binding, claim, token);
}

async function handoff(
	root: string,
	state: string,
	binding: GithubBinding,
	claim: GithubClaim,
	token: string,
): Promise<void> {
	claim.outcomeNonce ??= randomBytes(HANDOFF_NONCE_BYTES).toString("hex");
	claim.attemptedAt = new Date().toISOString();
	claim.receipt = "pending: coordinator unavailable";
	await persist(root, state, claim);
	// The CLI runs as the coordinator's account, which reaches its Herdr client; the launcher reads its final line, and
	// a run with no valid final line counts as failed (T-26 (4)).
	const as = {
		cli: exception("LIMEN_GITHUB_LIMEN_BIN") || "/opt/limen/bin/limen",
		user: binding.user,
		timeout: 20_000,
	};
	const ensure = runLimen(["github", "ensure", root], as);
	if (ensure.outcome.class !== "ok") {
		await reply(
			root,
			state,
			claim,
			token,
			"notice",
			`Limen could not reach the registered Herdr coordinator for ${githubSubject(claim)}. The request remains pending on its owning seat (.limen/github/claims/${claim.id}.json). No job was started.`,
		);
		return;
	}
	// Record an ambiguous attempt before invoking Herdr. Never blindly prompt twice after this point.
	claim.receipt = "handoff attempted; outcome unconfirmed";
	await persist(root, state, claim);
	const delivered = runLimen(["github", "deliver", root, String(claim.id), claim.outcomeNonce], as);
	if (delivered.outcome.class !== "ok") {
		// The receipt keeps Herdr's own words from the failure's message, for the person who inspects the claim.
		const { stderr } = delivered.output;
		claim.receipt = /(?:bare.shell|not an available shell|agent_not_found|target_not_found)/i.test(stderr)
			? "pending: coordinator unavailable (Herdr refused prompt before acceptance)"
			: `handoff attempted; outcome unconfirmed (${(stderr || delivered.error?.message || "unavailable").trim().slice(0, 250)})`;
		await persist(root, state, claim);
		await reply(
			root,
			state,
			claim,
			token,
			"notice",
			`Limen could not confirm delivery to the Herdr coordinator for ${githubSubject(claim)}. The request remains pending for inspection on its owning seat (.limen/github/claims/${claim.id}.json). No job was started.`,
		);
		return;
	}
	claim.receipt = "prompt accepted";
	await persist(root, state, claim);
	await reconcile(root, state, claim, token);
}

// Issue bodies keep their own cursor: the creation time and number of the last issue read. A failed read leaves it in place.
// `since` filters on update time, never earlier than creation, so every issue opened after the cursor is listed again.
export async function pollGithubIssues(
	root: string,
	state: string,
	binding: GithubBinding,
	token: string,
): Promise<void> {
	const cursorPath = join(state, "issue-cursor.json");
	const cursor = await readFile(cursorPath, "utf8").then(
		(text) => JSON.parse(text) as { number: number; createdAt: string },
		() => ({ number: 0, createdAt: binding.connectedAt }),
	);
	const since = new Date(Date.parse(cursor.createdAt) - 1000).toISOString().replace(/\.\d{3}Z$/, "Z");
	for (let page = 1; ; page++) {
		const issues = await api<Issue[]>(
			`/repos/${binding.repo}/issues?state=all&sort=created&direction=asc&since=${encodeURIComponent(since)}&per_page=${PAGE}&page=${page}`,
			token,
		);
		for (const issue of issues) {
			const created = Date.parse(issue.created_at);
			const mark = Date.parse(cursor.createdAt);
			if (created < mark || (created === mark && issue.number <= cursor.number)) {
				continue;
			}
			await acceptIssue(root, state, binding, issue, token);
			cursor.number = issue.number;
			cursor.createdAt = issue.created_at;
			await atomicWrite(cursorPath, `${JSON.stringify(cursor)}\n`, { mode: 0o600 });
		}
		if (issues.length < PAGE) {
			break;
		}
	}
}

async function project(root: string, stateDir: string, jwt: string): Promise<void> {
	const binding = await readBinding(root);
	if (!binding || !sameRepo(originRepository(root, true), binding.repo)) {
		return;
	}
	const state = join(stateDir, createHash("sha256").update(root).digest("hex"));
	await mkdir(join(state, "claims"), { recursive: true, mode: 0o700 });
	for (const dir of [state, join(state, "claims")]) {
		const info = await stat(dir);
		if (info.uid !== process.getuid?.() || (info.mode & 0o077) !== 0 || !info.isDirectory()) {
			throw new Error(`unsafe poller claim directory ${dir}`);
		}
	}
	await withPollLock(root, () => pollProject(root, state, binding, jwt));
}

/**
 * Runs `operation` under the poll lock of the project at `root`, the one definition of that lock (T-25) for the poll
 * and `github disconnect`: one poll of a project at a time, and a disconnect waits for it (A-018). The lock of a poller
 * that died is taken over, a live one is waited for at most 60 s. Group-readable and -writable, as before: the
 * poller's account and the coordinator's share `.limen/github/`.
 */
export function withPollLock<T>(root: string, operation: () => Promise<T>): Promise<T> {
	return withLock({ file: join(githubDir(root), "poll") }, operation, { fileMode: 0o660 });
}

/** One project's poll under its lock: the claims it holds, then new comments and issues since its cursor. */
async function pollProject(root: string, state: string, binding: GithubBinding, jwt: string): Promise<void> {
	if ((await readBinding(root))?.connectedAt !== binding.connectedAt) {
		return; // disconnect won the race
	}
	const identity = spawnSync("id", ["-u", binding.user], { encoding: "utf8" });
	const groups = spawnSync("id", ["-nG", binding.user], { encoding: "utf8" });
	if (
		identity.status !== 0 ||
		Number(identity.stdout.trim()) !== Number(exception("LIMEN_GITHUB_WORKER_UID")) ||
		groups.status !== 0 ||
		/\b(?:sudo|wheel|admin)\b/.test(groups.stdout)
	) {
		throw new Error("registered coordinator has unsafe Unix privileges; disconnect until its sudo access is removed");
	}
	const token = await installationToken(binding.repo, jwt); // a token scoped to this installed repository only
	const claimsDir = join(state, "claims");
	for (const entry of await readdir(claimsDir)) {
		if (!entry.endsWith(".json") || claimId(entry.slice(0, -5)) === undefined) {
			continue;
		}
		const claim = JSON.parse(await readFile(join(claimsDir, entry), "utf8")) as GithubClaim;
		if (sameRepo(claim.repo, binding.repo)) {
			await reconcile(root, state, claim, token);
		}
	}
	// Keep a durable cursor, with one second overlap for comments sharing a GitHub timestamp.
	const cursorPath = join(state, "cursor.json");
	const cursor = await readFile(cursorPath, "utf8").then(
		(text) => JSON.parse(text) as { id: number; createdAt: string },
		() => ({ id: 0, createdAt: binding.connectedAt }),
	);
	const since = new Date(Math.max(Date.parse(binding.connectedAt), Date.parse(cursor.createdAt) - 1000))
		.toISOString()
		.replace(/\.\d{3}Z$/, "Z");
	for (let page = 1; ; page++) {
		const comments = await api<Comment[]>(
			`/repos/${binding.repo}/issues/comments?sort=created&direction=asc&since=${encodeURIComponent(since)}&per_page=${PAGE}&page=${page}`,
			token,
		);
		for (const comment of comments) {
			if (comment.id <= cursor.id) {
				continue;
			}
			await accept(root, state, binding, comment, token);
			cursor.id = comment.id;
			cursor.createdAt = comment.created_at;
			await atomicWrite(cursorPath, `${JSON.stringify(cursor)}\n`, { mode: 0o600 });
		}
		if (comments.length < PAGE) {
			break;
		}
	}
	await pollGithubIssues(root, state, binding, token);
}

/**
 * One polling pass over every registered project. A project whose github module is off is skipped with a line that
 * names it (R-044). A project's failure goes to `out` on its own line and the pass goes on; then the most severe failure
 * (the highest exit code) fails the poll, with its class, code and next (D-028).
 */
export async function pollGithub(out: CommandText): Promise<void> {
	const registry = exception("LIMEN_GITHUB_PROJECTS_FILE");
	if (!registry || !isAbsolute(registry) || process.getuid?.() === 0) {
		throw configFailure("github poll requires an isolated non-root poller and absolute LIMEN_GITHUB_PROJECTS_FILE");
	}
	const stateDir = exception("LIMEN_GITHUB_STATE_DIR");
	if (!stateDir || !isAbsolute(stateDir)) {
		throw configFailure("github poll requires absolute LIMEN_GITHUB_STATE_DIR");
	}
	const stateInfo = await stat(stateDir).catch((cause: unknown) => {
		throw configFailure(`the poller state directory LIMEN_GITHUB_STATE_DIR is not readable: ${reason(cause)}`, cause);
	});
	if (!stateInfo.isDirectory() || stateInfo.uid !== process.getuid?.() || (stateInfo.mode & 0o077) !== 0) {
		throw configFailure("poller state directory must be private and poller-owned");
	}
	await privatePath(stateDir, [0, process.getuid?.() ?? -1]);
	const workerUid = Number(exception("LIMEN_GITHUB_WORKER_UID"));
	if (!Number.isSafeInteger(workerUid) || workerUid <= 0) {
		throw configFailure("poller requires LIMEN_GITHUB_WORKER_UID");
	}
	if (process.getuid?.() === workerUid) {
		throw configFailure("poller and workers must have different Unix users");
	}
	const modulePath = await realpath(fileURLToPath(import.meta.url));
	const file = await stat(modulePath);
	if ((file.mode & 0o022) !== 0 || file.uid === workerUid) {
		throw configFailure("poller code must not be writable by the worker account");
	}
	await privatePath(modulePath, [0, process.getuid?.() ?? -1]);
	const jwt = await appJwt();
	const listed = await readFile(registry, "utf8").catch((cause: unknown) => {
		throw configFailure(`the projects file LIMEN_GITHUB_PROJECTS_FILE is not readable: ${reason(cause)}`, cause);
	});
	const projects = [...new Set(listed.split("\n").filter(Boolean))];
	const failures: Array<{ readonly thrown: unknown; readonly failure: LimenError }> = [];
	for (const root of projects) {
		try {
			// One project's switch does not stop the others: the pass skips a project whose module is off (R-044
			// Decision 5). A limits file it cannot read throws LIMITS_UNREADABLE (src/project/limits.ts), which the
			// catch below names as that project's failure, never as a project switched off.
			if (resolve(root) === root && !moduleOn(root, "github")) {
				out.line(`${root}: skipped: the github module is off in this project`);
			} else if (resolve(root) === root) {
				await project(root, stateDir, jwt);
			}
		} catch (error) {
			out.diagnostic(`${root}: ${reason(error)}`);
			failures.push({ thrown: error, failure: failureOf(error) });
		}
	}
	const [worst] = failures.toSorted((a, b) => EXIT_CODES[b.failure.class] - EXIT_CODES[a.failure.class]);
	if (worst) {
		// The thrown value is the cause, so an internal error keeps its own stack.
		throw new LimenError({
			class: worst.failure.class,
			code: worst.failure.code,
			message: `github poll failed for ${failures.length} of ${projects.length} projects, each on its line above`,
			next: worst.failure.next,
			cause: worst.thrown,
		});
	}
}
