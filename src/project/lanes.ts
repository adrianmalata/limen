import { existsSync, readdirSync } from "node:fs";
import { mkdir, mkdtemp, readFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { basename, dirname, join } from "node:path";
import { atomicRename, atomicWrite } from "../atomic-write.ts";
import { type Operation, type StateView, stateChanged } from "../operation.ts";
import { environmentError, failureOf, isRefusal, type LimenError, type Refusal, refused } from "../outcome.ts";
import { readTickets, type TicketRecord } from "../picture/tickets.ts";
import {
	blobText,
	changedInCheckout,
	changedPaths,
	cleanMessage,
	commitTree,
	dirtyPaths,
	editIndex,
	followCommit,
	headCommit,
	headHistory,
	type IndexEntry,
	indexEntries,
	indexEnvironment,
	indexTree,
	isGitRepository,
	moveHead,
	readTreeInto,
	runHook,
	shortCommit,
	storeBlob,
} from "./git.ts";
import { ARCHIVE, type ArchiveRow, archiveRows } from "./series.ts";

/** PROVEN names this many landed features; every month folder keeps a count line below them. */
const PROVEN_SHOWN = 10;
/** The reason `limen land` gives its closing commit, before the job's id: `Close <codes>: landed by <id>`. */
const LANDED_BY = "landed by ";
/** The lines of a rejecting hook's output that its failure holds: the end, where a hook says why. */
const HOOK_LINES = 20;
/**
 * The code of a close whose commit is on the branch while the checkout still holds the close's paths as they were
 * before it: git refused to overwrite a file there that changed after validate (R-037, Decision 17).
 */
export const CHECKOUT_BEHIND = "CHECKOUT_BEHIND";
/** The subject of a closing commit: the ticket codes joined by `, `, then its reason. */
const CLOSE_SUBJECT = /^Close [^:]+: (.*)$/;
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
	const next = await boardOf(root, text, []);
	if (next === text) {
		return false;
	}
	await atomicWrite(path, next);
	return true;
}

/**
 * The board `text` as `limen board --write` renders it from the lanes of the checkout at `root`, once each of `moves`
 * has put its ticket in `done/` with its `landed` date.
 */
async function boardOf(root: string, text: string, moves: readonly Move[]): Promise<string> {
	const tickets = (await readTickets(root)).tickets.map((ticket) => {
		const move = moves.find(({ from }) => `${from}/ticket.md` === ticket.path);
		return move ? { ...ticket, lane: "done" as const, path: `${move.to}/ticket.md`, landed: move.day } : ticket;
	});
	return renderBoard(text, tickets, archiveRows(root));
}

/** The reason `limen land` gives the close of the job `id`'s tickets, which its closing commit's subject ends with. */
export function landReason(id: string): string {
	return `${LANDED_BY}${id}`;
}
/**
 * The job whose land made a commit with `subject`, `Close <codes>: landed by <id>`, the closing commit's record of the
 * land (A-002, D-057 (4)); undefined for any other subject.
 */
export function landedJobOf(subject: string): string | undefined {
	const reason = CLOSE_SUBJECT.exec(subject)?.[1] ?? "";
	const id = reason.startsWith(LANDED_BY) ? reason.slice(LANDED_BY.length) : "";
	return /^\S+$/.test(id) ? id : undefined;
}

/** Whether `subject` is the subject of a closing commit, of `limen land` or of `limen ticket done`. */
export function isClosingSubject(subject: string): boolean {
	return CLOSE_SUBJECT.test(subject);
}

/** The ticket codes a closing commit with `subject` names, as its subject joins them; empty for any other subject. */
export function closingCodes(subject: string): string {
	return /^Close ([^:]+): /.exec(subject)?.[1] ?? "";
}

/** A commit of the history of HEAD: its full sha and its committer time in seconds. */
export type HistoryCommit = { readonly sha: string; readonly time: number };

/**
 * The closing commit of each job whose land made one in the history of HEAD of the checkout at `root`
 * (`landedJobOf`): the oldest, the first close, for a job two name, among the commits `counts` takes (every one when
 * it is not given). None in a root that is no Git repository, where a close commits nothing. The one reading of the
 * migration's markers and of a land that goes on after its close (R-103, T-25).
 */
export function landClosingCommits(
	root: string,
	counts: (commit: HistoryCommit) => boolean = () => true,
): ReadonlyMap<string, HistoryCommit> {
	const closing = new Map<string, HistoryCommit>();
	if (!isGitRepository(root)) {
		return closing;
	}
	for (const commit of headHistory(root)) {
		const id = landedJobOf(commit.subject);
		if (id !== undefined && counts(commit)) {
			closing.set(id, { sha: commit.sha, time: commit.time });
		}
	}
	return closing;
}

/**
 * The ticket codes a closing commit of `limen ticket done` closed, by its subject `Close <codes>: landed` or `Close
 * <codes>: landed <YYYY-MM-DD>`; none for any other subject, a land's among them.
 */
export function ticketDoneCodes(subject: string): readonly string[] {
	const reason = CLOSE_SUBJECT.exec(subject)?.[1] ?? "";
	if (!/^landed(?: \d{4}-\d\d-\d\d)?$/.test(reason)) {
		return [];
	}
	return closingCodes(subject)
		.split(", ")
		.map((code) => code.toUpperCase());
}

/**
 * The newest closing commit of `limen ticket done` in the history of HEAD of the checkout at `root` for each ticket
 * code it closed (`ticketDoneCodes`), which a `ticket done` run again takes for the markers it still owes (R-103).
 */
export function ticketDoneClosings(root: string): ReadonlyMap<string, HistoryCommit> {
	const closing = new Map<string, HistoryCommit>();
	if (!isGitRepository(root)) {
		return closing;
	}
	for (const commit of headHistory(root)) {
		for (const code of ticketDoneCodes(commit.subject)) {
			if (!closing.has(code)) {
				closing.set(code, { sha: commit.sha, time: commit.time });
			}
		}
	}
	return closing;
}

/** A close of active tickets as its checks decided it, before anything moves (T-38 (1)). */
export type TicketClose = {
	readonly root: string;
	/** The active tickets the codes name, in the order of the lane. */
	readonly tickets: readonly TicketRecord[];
	/** Whether the project is a Git repository, where the close is one commit. */
	readonly committed: boolean;
	/**
	 * The checkout's HEAD as validate read it, in a Git repository: the closing commit's only parent, and the one commit
	 * the branch moves from, so a HEAD that moved since validate ends the close in STATE_CHANGED (T-38 (2)).
	 */
	readonly head: string | null;
	readonly reason: string;
	readonly today: string;
};

/**
 * The close of each named active ticket, decided and not yet made: the tickets and the commit it builds on, and a
 * refusal when the board or one of their folders has uncommitted changes, since another session is editing it, or a
 * file is where a folder moves to, which the close would otherwise meet only after it began. It writes nothing. A
 * refusal names `retry`, the command to run once the paths are committed or moved: `limen ticket done` with the
 * tickets, unless the caller names its own call, as `limen land` does before its merge (R-037, review round 1, F1).
 */
export async function planTicketClose(
	root: string,
	codes: readonly string[],
	reason: string,
	today = localDay(),
	retry?: string,
): Promise<TicketClose> {
	const wanted = new Set(codes.map((code) => code.toUpperCase()));
	const tickets = (await readTickets(root)).tickets.filter(
		(ticket) => ticket.lane === "active" && wanted.has(ticket.code.toUpperCase()),
	);
	const committed = tickets.length > 0 && isGitRepository(root);
	if (committed) {
		const folders = tickets.map((ticket) => dirname(ticket.path));
		const again = retry ?? `limen ticket done ${tickets.map((ticket) => ticket.code).join(" ")}`;
		const busy = dirtyPaths(root).paths.filter(
			(path) => path === BOARD || folders.some((from) => path.startsWith(`${from}/`)),
		);
		if (busy.length) {
			throw refused(
				"TICKETS_UNCOMMITTED",
				`uncommitted changes in ${busy.join(", ")}; commit them, then run ${again}`,
				again,
			);
		}
		const occupied = folders.flatMap((from) => filesBelow(root, doneFolder(from, today)));
		if (occupied.length) {
			throw refused(
				"TICKETS_UNCOMMITTED",
				`files are where the close moves the tickets: ${occupied.join(", ")}; move them, then run ${again}`,
				again,
			);
		}
	}
	return { root, tickets, committed, head: committed ? headCommit(root) : null, reason, today };
}

/**
 * What a close did: the folders it moved, and in a Git repository its commit, short (`commit`) and full (`sha`); the
 * day it gave the tickets as their `landed` date; and each old folder that still exists, since it holds files git does
 * not track, ignored or untracked (one a hook made), which the checkout's catch-up leaves where they are (R-037,
 * Decision 19 and review round 2, G3).
 */
export type TicketsClosed = {
	readonly moved: readonly string[];
	readonly commit?: string;
	readonly sha?: string;
	readonly day: string;
	readonly stayed: readonly string[];
};

/** The line of a close's output for an old ticket folder that `TicketsClosed.stayed` names. */
export function stayedLine(folder: string): string {
	return `kept ${folder}: it holds files git does not track, which stay there`;
}

/**
 * What a command asks of the close. `root` is validate's first step, the call's own checks and then the project's
 * root, so that their refusals come before any read of the lanes. `today` is the `landed` date, the local day when
 * undefined. `again` is the command that runs the close again, the `next` of a STATE_CHANGED and a HOOK_REJECTED.
 * `retry` is the command its refusals name, `planTicketClose`'s, when the caller is not `limen ticket done`: `limen land`
 * names its own call, so a land that goes on after its merge never names a `ticket done` (R-103, review round 1, F1).
 * `added` holds the reads the caller's validate makes beside the plan, such as the jobs `limen ticket done` marks; a
 * refusal from it ends validate, and what it reads comes back with what the close did.
 */
export type CloseRequest<Added> = {
	readonly root: () => string;
	readonly codes: readonly string[];
	readonly reason: string;
	readonly today: string | undefined;
	readonly again: string | null;
	readonly retry?: string;
	readonly added?: (view: StateView, close: TicketClose) => Promise<Added | Refusal>;
};

/**
 * The close of the active tickets `request.codes` names, the one operation of `limen land` and `limen ticket done`
 * (T-25): validate holds the plan, so the runner reads it again under the lock and a change of the tickets, the board
 * or HEAD since then ends the close in STATE_CHANGED before its first write (T-38 (2)); the lock is the ticket lanes',
 * which every close takes (R-092, finding 12); apply is `applyTicketClose`.
 */
export function closeOperation<Added = undefined>(
	request: CloseRequest<Added>,
): Operation<
	TicketClose & { readonly added: Added | undefined },
	TicketsClosed & { readonly added: Added | undefined }
> {
	const { codes, reason, today, again, retry } = request;
	return {
		validate: async (view) => {
			const root = request.root();
			const close = await view.hold(`the active tickets ${codes.join(", ")} in ${root}`, () =>
				planTicketClose(root, codes, reason, today, retry),
			);
			const added = await request.added?.(view, close);
			return isRefusal(added) ? added : { ...close, added };
		},
		lock: (close) => ({ file: join(close.root, ".limen", "ticket-lanes") }),
		apply: async (close) => ({ ...(await applyTicketClose(close, again)), added: close.added }),
		again,
	};
}

/**
 * The writes of `close`: each folder to `done/<month>/` with a `landed` date, and the board. In a Git repository they
 * are one commit, `Close FNNN: <reason>`, made by `commitClose` before anything visible changes; in a root that is no
 * Git repository, a workspace's, the folders move and the board is written in place. `again` is the `next` of a
 * failure that running the close again mends.
 */
export async function applyTicketClose(close: TicketClose, again: string | null = null): Promise<TicketsClosed> {
	const { root, tickets, today } = close;
	const moves = tickets.map((ticket) => {
		const from = dirname(ticket.path);
		return { from, to: doneFolder(from, today), day: today };
	});
	if (moves.length === 0) {
		return { moved: [], day: today, stayed: [] };
	}
	if (close.head !== null) {
		return commitClose(close, close.head, moves, again);
	}
	for (const { from, to } of moves) {
		await mkdir(join(root, dirname(to)), { recursive: true });
		await atomicRename(join(root, from), join(root, to));
		const file = join(root, to, "ticket.md");
		await atomicWrite(file, withLanded(await readFile(file, "utf8"), today));
	}
	await writeBoard(root);
	return { moved: moves.map(({ to }) => to), day: today, stayed: [] };
}

/** One ticket folder a close moves: from its lane to its month in `done/`, with `day` as its `landed` date. */
type Move = { readonly from: string; readonly to: string; readonly day: string };

/**
 * The closing commit in a Git repository (A-021, A-057's pattern): built in a temporary index from `head`, through the
 * hooks `git commit -m` runs before it commits, then the branch moved from `head` by compare-and-swap, so until then
 * nothing but git's object store holds any of it; only then does the checkout follow (`followCommit`).
 */
async function commitClose(
	close: TicketClose,
	head: string,
	moves: readonly Move[],
	again: string | null,
): Promise<TicketsClosed> {
	const { root } = close;
	const scratch = await mkdtemp(join(tmpdir(), "limen-close-"));
	let made: { readonly commit: string; readonly subject: string };
	try {
		made = await closingCommit(close, head, moves, scratch, again);
	} finally {
		await rm(scratch, { recursive: true, force: true });
	}
	const { commit, subject } = made;
	const short = shortCommit(root, commit);
	const paths = changedPaths(root, head, commit);
	if (!moveHead(root, head, commit, `commit: ${subject}`)) {
		throw stateChanged(`HEAD of ${root}`, again);
	}
	try {
		followCommit(root, head, commit);
	} catch (error) {
		const codes = close.tickets.map((ticket) => ticket.code).join(", ");
		throw checkoutBehind(root, codes, { head, commit, short, paths }, error);
	}
	const stayed = moves.filter(({ from }) => existsSync(join(root, from))).map(({ from }) => from);
	return { moved: moves.map(({ to }) => to), commit: short, sha: commit, day: close.today, stayed };
}

/**
 * The closing commit's object and its subject, the branch not moved yet: the index of the folder `scratch` read from
 * `head`, each folder's entries moved with the new `ticket.md`, the board rendered after the moves, then the hooks of
 * `git commit -m` in its order and environment: `pre-commit`, the index read again for its tree, as git does, so that
 * a hook's change to it is committed, then `prepare-commit-msg` and `commit-msg` on the message file, read back after.
 */
async function closingCommit(
	close: TicketClose,
	head: string,
	moves: readonly Move[],
	scratch: string,
	again: string | null,
): Promise<{ readonly commit: string; readonly subject: string }> {
	const { root, tickets, today } = close;
	const index = join(scratch, "index");
	readTreeInto(root, index, head);
	const entries: IndexEntry[] = [];
	for (const { from, to } of moves) {
		for (const entry of indexEntries(root, index, `${from}/`)) {
			const path = `${to}${entry.path.slice(from.length)}`;
			const oid =
				entry.path === `${from}/ticket.md` ? storeBlob(root, withLanded(blobText(root, entry.oid), today)) : entry.oid;
			entries.push({ mode: "0", oid: "0".repeat(entry.oid.length), path: entry.path }, { ...entry, oid, path });
		}
	}
	for (const board of indexEntries(root, index, BOARD)) {
		const text = blobText(root, board.oid);
		const rendered = await boardOf(root, text, moves);
		if (rendered !== text) {
			entries.push({ ...board, oid: storeBlob(root, rendered) });
		}
	}
	editIndex(root, index, entries);
	const codes = tickets.map((ticket) => ticket.code).join(", ");
	const hooks = { ...indexEnvironment(index), GIT_EDITOR: ":" };
	const hook = (name: string, args: readonly string[]) => passHook(root, codes, { name, args, env: hooks }, again);
	hook("pre-commit", []);
	const tree = indexTree(root, index);
	const file = join(scratch, "COMMIT_EDITMSG");
	await atomicWrite(file, `Close ${codes}: ${close.reason}\n`);
	hook("prepare-commit-msg", [file, "message"]);
	hook("commit-msg", [file]);
	const message = cleanMessage(root, await readFile(file, "utf8"));
	// The subject goes into the reflogs as `git commit` writes it there: `commit: <subject>`.
	return { commit: commitTree(root, tree, head, message), subject: message.split("\n")[0] ?? "" };
}

/**
 * Runs the hook `name` of the closing commit of `codes`; one that exits non-zero ends the close before the branch
 * moves, as the environment's failure HOOK_REJECTED, with the end of its output, where a hook says why.
 */
function passHook(
	root: string,
	codes: string,
	hook: { readonly name: string; readonly args: readonly string[]; readonly env: NodeJS.ProcessEnv },
	again: string | null,
): void {
	const run = runHook(root, hook.name, hook.args, hook.env);
	if (run.status === 0) {
		return;
	}
	const lines = run.output.trimEnd().split("\n").slice(-HOOK_LINES);
	const said = lines.join("") === "" ? "it printed nothing" : `the end of its output:\n${lines.join("\n")}`;
	throw environmentError(
		"HOOK_REJECTED",
		`the ${hook.name} hook of ${root} rejected the closing commit of ${codes} with exit code ${run.status}, so nothing of the close was written; ${said}`,
		again,
	);
}

/**
 * The failure of a close of `codes` in the checkout at `root` whose commit `step.commit` is on the branch, while the
 * checkout still holds `step.paths` as they were at `step.head`: git refused to overwrite a file there that changed
 * after validate (z. 29). It tells to move the changed files aside, never to commit them: a commit in that state
 * reverts the close, and the read-tree then no longer finishes it (R-037's Risk 3; R-037, review round 1, F2). Its
 * `next` is null for `limen ticket done`, since what finishes it is git's, not Limen's (T-37, D-046 (1)): the message
 * names it; `limen land` names itself, whose run again finishes the checkout and records the commit (R-103).
 */
export function checkoutBehind(
	root: string,
	codes: string,
	step: { readonly head: string; readonly commit: string; readonly short: string; readonly paths: readonly string[] },
	error: unknown,
	next: string | null = null,
): LimenError {
	const changed = changedInCheckout(root, step.paths);
	const files = changed?.length ? changed.join(", ") : "git could not name them here, so see its words above";
	return environmentError(
		CHECKOUT_BEHIND,
		[
			`the closing commit ${step.short} of ${codes} is on the branch of ${root}, but the checkout still holds`,
			`these paths as they were before it: ${step.paths.join(", ")}. Git refused to bring them: ${failureOf(error).message}.`,
			`Move the files that changed since the close's checks aside, out of the checkout or to another name: ${files};`,
			"make no commit before the read-tree, since it would revert the close.",
			`Then run in ${root}: git update-index -q --refresh, then git read-tree -m -u ${step.head} ${step.commit}`,
		].join(" "),
		next,
	);
}

/** Where a close on the day `today` moves the ticket folder `from`: its month folder in `done/`. */
export function doneFolder(from: string, today: string): string {
	return `spec/features/done/${today.slice(0, 7)}/${basename(from)}`;
}

/** The files below the folder `folder` of the checkout at `root`, tracked or not, from the root; none for no folder. */
function filesBelow(root: string, folder: string): string[] {
	if (!existsSync(join(root, folder))) {
		return [];
	}
	return readdirSync(join(root, folder), { recursive: true, withFileTypes: true })
		.filter((entry) => !entry.isDirectory())
		.map((entry) => `${folder}${join(entry.parentPath, entry.name).slice(join(root, folder).length)}`)
		.sort();
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

/** The local day of `at` as `YYYY-MM-DD`: the `landed` date of a close that names none, as land's close. */
export function localDay(at = new Date()): string {
	return `${at.getFullYear()}-${String(at.getMonth() + 1).padStart(2, "0")}-${String(at.getDate()).padStart(2, "0")}`;
}
