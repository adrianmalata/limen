import { closeGroup, publishFinding, showGroupStatus, startGroup, stopGroup } from "../job/group-control.ts";
import { advanceGroup } from "../job/group-rounds.ts";
import { operationHandler } from "../operation.ts";
import type { CommandText, Success } from "../outcome.ts";
import type { Parsed } from "../parser.ts";
import { limenRoot } from "../project/git.ts";

/**
 * `limen group start`: starts the group and prints its id, through the runner of T-38; the same command line is the
 * rerun a partial start names.
 */
export const groupStartCommand = operationHandler(async function groupStartCommand(
	values: Parsed,
	cwd: string,
	out: CommandText,
): Promise<Success> {
	const request = {
		folder: values.get("folder") ?? "",
		teams: values.list("team"),
		rounds: values.get("rounds"),
		workers: values.get("workers"),
		timeout: values.get("timeout"),
		extensions: values.list("extension"),
		teamExtensions: values.list("team-extension"),
	};
	return { next: null, text: (await startGroup(request, cwd, out, values.commandLine())).id };
});
/** `limen group advance` (internal): a finished team job starts this; it moves the group only once its round ended. */
export async function groupAdvanceCommand(values: Parsed, cwd: string, out: CommandText): Promise<undefined> {
	await advanceGroup(limenRoot(cwd), values.get("group") ?? "", out);
}
/** `limen group status`: the run, its round and every member's state. */
export async function groupStatusCommand(values: Parsed, cwd: string, out: CommandText): Promise<undefined> {
	await showGroupStatus(values.get("group"), cwd, out);
}
/** `limen group publish`: a finding for every other team, or for one with `--team`. */
export async function groupPublishCommand(values: Parsed, cwd: string): Promise<Success> {
	const id = await publishFinding(values.get("group"), values.list("finding"), values.get("team"), cwd);
	return { next: null, text: id };
}
/** `limen group stop`: the lead blocks new launches and stops every member job, through the runner of T-38. */
export const groupStopCommand = operationHandler(async function groupStopCommand(
	values: Parsed,
	cwd: string,
	out: CommandText,
): Promise<undefined> {
	await stopGroup(values.get("group"), cwd, out);
});
/** `limen group close`: the lead closes a group whose members are over. */
export async function groupCloseCommand(values: Parsed, cwd: string, out: CommandText): Promise<undefined> {
	await closeGroup(values.get("group"), cwd, out);
}
