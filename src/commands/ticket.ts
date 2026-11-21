import type { CommandText, Success } from "../outcome.ts";
import type { Parsed } from "../parser.ts";
import { checkBranchTickets } from "../project/ticket-check.ts";
import { closeDoneTickets, newTicket } from "../project/ticket-folders.ts";

/** `limen ticket new`: writes a ticket with the next free number; its success names it in `ids.ticket`. */
export function ticketNewCommand(values: Parsed, cwd: string): Promise<Success> {
	const request = {
		title: values.get("title") ?? "",
		lane: values.get("lane") ?? "planned",
		touches: values.get("touches")?.split(",") ?? [],
	};
	return newTicket(request, cwd);
}

/** `limen ticket done`: the close `limen land` makes, for work that landed by a hand merge or needed no code. */
export async function ticketDoneCommand(values: Parsed, cwd: string, out: CommandText): Promise<undefined> {
	await closeDoneTickets(values.list("tickets"), values.get("on"), cwd, out);
}

/** `limen ticket check`: the land gate on demand, for the tickets a branch changes. */
export async function ticketCheckCommand(values: Parsed, cwd: string, out: CommandText): Promise<undefined> {
	await checkBranchTickets(values.get("branch"), cwd, out);
}
