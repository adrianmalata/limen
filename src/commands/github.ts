import {
	connectDoorbell,
	disconnectDoorbell,
	doorbellStatus,
	ensureRegisteredCoordinator,
	type GithubJobRoute,
	handOffClaim,
	recordNoJobAnswer,
} from "../integrations/github-claims.ts";
import { githubDoctor } from "../integrations/github-doctor.ts";
import { pollGithub } from "../integrations/github-poller.ts";
import type { CommandText, Success } from "../outcome.ts";
import type { Parsed } from "../parser.ts";
import { repoRoot } from "../project/git.ts";

/** `limen github connect`: binds origin to this Herdr coordinator. */
export async function githubConnectCommand(_values: Parsed, cwd: string): Promise<Success> {
	return { next: null, text: await connectDoorbell(repoRoot(cwd)) };
}
/** `limen github disconnect`: removes the binding. */
export async function githubDisconnectCommand(_values: Parsed, cwd: string): Promise<Success> {
	return { next: null, text: await disconnectDoorbell(repoRoot(cwd)) };
}
/** `limen github status`: the binding and the newest local handoff copy. */
export async function githubStatusCommand(_values: Parsed, cwd: string): Promise<Success> {
	return { next: null, text: await doorbellStatus(repoRoot(cwd)) };
}
/** `limen github doctor`: the seat's safety checks for the GitHub module. */
export async function githubDoctorCommand(_values: Parsed, cwd: string, out: CommandText): Promise<undefined> {
	await githubDoctor(repoRoot(cwd), out);
}
/** `limen github poll`: one polling pass as the isolated App user. */
export async function githubPollCommand(_values: Parsed, _cwd: string, out: CommandText): Promise<undefined> {
	await pollGithub(out);
}
/** `limen github ensure [<registered-root>]`: the registered coordinator is live and interactive. */
export async function githubEnsureCommand(values: Parsed, cwd: string): Promise<Success> {
	return { next: null, text: await ensureRegisteredCoordinator(values.get("root"), cwd) };
}
/** `limen github deliver`: the poller rings the coordinator with one claim. */
export function githubDeliverCommand(values: Parsed, _cwd: string, out: CommandText): Promise<Success | undefined> {
	const nonce = values.get("nonce") ?? "";
	return handOffClaim("deliver", values.get("root") ?? "", values.get("claim") ?? "", { nonce }, out);
}
/** `limen github review`: the coordinator starts a review job for a pull request claim. */
export function githubReviewCommand(values: Parsed, _cwd: string, out: CommandText): Promise<Success | undefined> {
	const job = { model: jobRoute(values) };
	return handOffClaim("review", values.get("root") ?? "", values.get("claim") ?? "", { job }, out);
}
/** `limen github work`: the coordinator starts a task job for a claim. */
export function githubWorkCommand(values: Parsed, _cwd: string, out: CommandText): Promise<Success | undefined> {
	const task = values.get("task") ?? "";
	const job = task.trim() ? { model: jobRoute(values), task } : undefined;
	return handOffClaim("work", values.get("root") ?? "", values.get("claim") ?? "", { job }, out);
}
/** `limen github resolve`: the coordinator records a no-job answer for a claim. */
export async function githubResolveCommand(values: Parsed): Promise<Success> {
	const text = await recordNoJobAnswer(
		values.get("root") ?? "",
		values.get("claim") ?? "",
		values.get("nonce") ?? "",
		values.get("answer") ?? "",
	);
	return { next: null, text };
}

/** The model route of a GitHub job, from its four required flags. */
function jobRoute(values: Parsed): GithubJobRoute {
	return {
		engine: values.get("engine") ?? "",
		provider: values.get("provider") ?? "",
		model: values.get("model") ?? "",
		thinking: values.get("thinking") ?? "",
	};
}
