import { existsSync } from "node:fs";
import { mkdir, readFile } from "node:fs/promises";
import { basename, dirname, join } from "node:path";
import { atomicRename, atomicWrite } from "../atomic-write.ts";
import { refused } from "../outcome.ts";
import { readTickets, type TicketRecord } from "../picture/tickets.ts";
import { commitPaths, dirtyPaths, isGitRepository } from "./git.ts";
import { ARCHIVE, type ArchiveRow, archiveRows } from "./series.ts";

/** PROVEN names this many landed features; every month folder keeps a count line below them. */
const PROVEN_SHOWN = 10;
const BOARD = "spec/build.md";
const GENERATED = (lane: string) =>
	`<!-- Generated from spec/features/${lane}/ by limen land, limen ticket done and limen board --write. Edit the tickets, not these lines. -->`;

/** One line per active ticket, newest number first, with an open owner ask or known problem from its front matter. */
export function nowLines(tickets: readonly TicketRecord[]): string[] {
	return tickets
		.filter((ticket) => ticket.lane === "active")
		.sort((a, b) => number(b) - number(a))
		.map((ticket) => {
			const ask = ticket.needsAdam ? `; needs Adam since ${ticket.needsAdam.on}: ${ticket.needsAdam.ask}` : "";
			const wrong = ticket.wrong ? `; wrong since ${ticket.wrong.on}: ${ticket.wrong.problem}` : "";
			return `- \`${folder(ticket)}\` (🟠 ACTIVE): ${ticket.title}${ask}${wrong}`;
		});
}

/**
 * The last landed features by `landed` date (month folder when it has none), then one count line per month. Archived
 * done tickets count by their close month, and a month's line names the register when it holds some of them.
 */
export function provenLines(tickets: readonly TicketRecord[], archived: readonly ArchiveRow[]): string[] {
	const present = new Set(tickets.map((ticket) => ticket.code));
	const done = [
		...tickets
			.filter((ticket) => ticket.lane === "done")
			.map((ticket) => ({
				month: ticket.path.split("/")[3] ?? "",
				date: ticket.landed,
				number: number(ticket),
				line: `- \`${folder(ticket)}\` (🟢 PROVEN): ${ticket.title}${ticket.landed ? `; landed ${ticket.landed}` : ""}`,
				archived: false,
			})),
		...archived
			.filter((row) => row.code && row.lane === "done" && !present.has(row.code))
			.map((row) => ({
				month: row.month,
				date: null,
				number: row.number,
				line: `- \`${basename(row.path)}\` (🟢 PROVEN): ${row.title}`,
				archived: true,
			})),
	].sort((a, b) => (b.date ?? b.month).localeCompare(a.date ?? a.month) || b.number - a.number);
	const months = new Map<string, { count: number; folder: boolean; register: boolean }>();
	for (const { month, archived: register } of done) {
		const seen = months.get(month) ?? { count: 0, folder: false, register: false };
		months.set(month, { count: seen.count + 1, folder: seen.folder || !register, register: seen.register || register });
	}
	return [
		...done.slice(0, PROVEN_SHOWN).map((entry) => entry.line),
		...[...months]
			.sort(([a], [b]) => b.localeCompare(a))
			.map(([month, seen]) => {
				const where = [seen.folder ? `spec/features/done/${month}/` : "", seen.register ? ARCHIVE : ""];
				return `- ${month}: ${seen.count} landed. ${where.filter(Boolean).join(" and ")}`;
			}),
	];
}

/** The board text with NOW and PROVEN rebuilt from the lanes; every other line stays as written. */
export function renderBoard(text: string, tickets: readonly TicketRecord[], archived: readonly ArchiveRow[]): string {
	const now = nowLines(tickets);
	const proven = provenLines(tickets, archived);
	const board = replaceSection(
		text,
		"NOW",
		[GENERATED("active"), ...(now.length ? ["", ...now] : [])],
		["NEXT", "PROVEN"],
	);
	return replaceSection(board, "PROVEN", [GENERATED("done"), ...(proven.length ? ["", ...proven] : [])], []);
}

/** Rewrites NOW and PROVEN in the project's board. A project without a board gets none. Returns whether it changed. */
export async function writeBoard(root: string): Promise<boolean> {
	const path = join(root, BOARD);
	if (!existsSync(path)) {
		return false;
	}
	const text = await readFile(path, "utf8");
	const next = renderBoard(text, (await readTickets(root)).tickets, archiveRows(root));
	if (next === text) {
		return false;
	}
	await atomicWrite(path, next);
	return true;
}

/** A close of active tickets as its checks decided it, before anything moves (T-38 (1)). */
export type TicketClose = {
	readonly root: string;
	/** The active tickets the codes name, in the order of the lane. */
	readonly tickets: readonly TicketRecord[];
	/** Whether the project is a Git repository, where the close is one commit. */
	readonly committed: boolean;
	readonly reason: string;
	readonly today: string;
};

/**
 * The close of each named active ticket, decided and not yet made: the tickets, and a refusal when the board or one of
 * their folders has uncommitted changes, since another session is editing it. It writes nothing.
 */
export async function planTicketClose(
	root: string,
	codes: readonly string[],
	reason: string,
	today = localDate(),
): Promise<TicketClose> {
	const wanted = new Set(codes.map((code) => code.toUpperCase()));
	const tickets = (await readTickets(root)).tickets.filter(
		(ticket) => ticket.lane === "active" && wanted.has(ticket.code.toUpperCase()),
	);
	const committed = tickets.length > 0 && isGitRepository(root);
	if (committed) {
		const folders = tickets.map((ticket) => dirname(ticket.path));
		const busy = dirtyPaths(root).paths.filter(
			(path) => path === BOARD || folders.some((from) => path.startsWith(`${from}/`)),
		);
		if (busy.length) {
			const named = tickets.map((ticket) => ticket.code).join(" ");
			throw refused(
				"TICKETS_UNCOMMITTED",
				`uncommitted changes in ${busy.join(", ")}; commit them, then run limen ticket done ${named}`,
				`limen ticket done ${named}`,
			);
		}
	}
	return { root, tickets, committed, reason, today };
}

/**
 * The writes of `close`: each folder to `done/<month>/` with a `landed` date, then the board. In a Git repository the
 * moves and the board are one commit, `Close FNNN: <reason>`. Returns the folders it moved and the commit.
 */
export async function applyTicketClose(
	close: TicketClose,
): Promise<{ readonly moved: readonly string[]; readonly commit?: string }> {
	const { root, tickets, today } = close;
	if (tickets.length === 0) {
		return { moved: [] };
	}
	const folders = tickets.map((ticket) => dirname(ticket.path));
	const moved: string[] = [];
	for (const from of folders) {
		const to = `spec/features/done/${today.slice(0, 7)}/${basename(from)}`;
		await mkdir(join(root, dirname(to)), { recursive: true });
		await atomicRename(join(root, from), join(root, to));
		const file = join(root, to, "ticket.md");
		await atomicWrite(file, withLanded(await readFile(file, "utf8"), today));
		moved.push(to);
	}
	const board = (await writeBoard(root)) ? [BOARD] : [];
	if (!close.committed) {
		return { moved };
	}
	const message = `Close ${tickets.map((ticket) => ticket.code).join(", ")}: ${close.reason}`;
	return { moved, commit: commitPaths(root, [...folders, ...moved, ...board], message) };
}

/**
 * Moves each named active ticket to `done/<month>/` with a `landed` date and rebuilds the board, as `limen land`
 * closes its tickets: `planTicketClose`, then `applyTicketClose`.
 */
export async function closeTickets(
	root: string,
	codes: readonly string[],
	reason: string,
	today = localDate(),
): Promise<{ readonly moved: readonly string[]; readonly commit?: string }> {
	return applyTicketClose(await planTicketClose(root, codes, reason, today));
}

function replaceSection(text: string, heading: string, body: readonly string[], before: readonly string[]): string {
	const lines = text.split("\n");
	const block = [`## ${heading}`, "", ...body, ""];
	const start = lines.findIndex((line) => line.trim() === `## ${heading}`);
	if (start < 0) {
		// A board without the section gets it before the first named neighbour, or at its end.
		const at = lines.findIndex((line) => before.some((name) => line.trim() === `## ${name}`));
		if (at < 0) {
			return `${text.trimEnd()}\n\n${block.join("\n")}`;
		}
		return [...lines.slice(0, at), ...block, ...lines.slice(at)].join("\n");
	}
	const next = lines.findIndex((line, index) => index > start && /^#{1,2}\s/.test(line));
	const rest = next < 0 ? [] : lines.slice(next);
	return [...lines.slice(0, start), ...block, ...rest].join("\n");
}

/** Sets `landed` in the ticket's front matter, adding the front matter when the ticket has none. */
function withLanded(text: string, date: string): string {
	const close = text.startsWith("---\n") ? text.indexOf("\n---", 3) : -1;
	if (close < 0) {
		return `---\nlanded: ${date}\n---\n\n${text}`;
	}
	const head = text.slice(0, close).replace(/\nlanded:.*$/m, "");
	return `${head}\nlanded: ${date}${text.slice(close)}`;
}

function folder(ticket: TicketRecord): string {
	return basename(dirname(ticket.path));
}

function number(ticket: TicketRecord): number {
	return Number(ticket.code.slice(1));
}

function localDate(): string {
	const now = new Date();
	return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}-${String(now.getDate()).padStart(2, "0")}`;
}
