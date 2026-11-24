// The ticket folders under spec/features/ (T-26 (2)): `limen ticket new` writes one with the next free number, and
// `limen ticket done` closes active ones as `limen land` does. Ticket operations stay in src/project/ until R-061.
import { existsSync, mkdirSync } from "node:fs";
import { readFile } from "node:fs/promises";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { atomicWriteSync } from "../atomic-write.ts";
import { transport } from "../config.ts";
import { markTicketJobs, type TicketJob, ticketDoneJobs } from "../job/landing.ts";
import { type Operation, runOperation } from "../operation.ts";
import { type CommandText, refused, type Success, usageError } from "../outcome.ts";
import { readPicture } from "../picture/picture-build.ts";
import { ID_PATTERN } from "../picture/picture-model.ts";
import { limenRoot, repoRoot } from "./git.ts";
import { closeOperation, stayedLine, type TicketClose, type TicketsClosed } from "./lanes.ts";
import { withNextTicketCode } from "./series.ts";

const PLACE_ID = ID_PATTERN;

/** What `limen ticket new` was asked: the title, the lane it starts in, and the map places it touches. */
export type NewTicket = { readonly title: string; readonly lane: string; readonly touches: readonly string[] };

/** Writes a ticket with the next free number; its success names it in `ids.ticket` and its path in the text. */
export async function newTicket(request: NewTicket, cwd: string): Promise<Success> {
	const { title, lane, touches } = request;
	if (/[\r\n]/.test(title) || !title.trim()) {
		throw new Error("a ticket's title is one line that says what becomes true");
	}
	if (!touches.every((id) => PLACE_ID.test(id)) || new Set(touches).size !== touches.length) {
		throw new Error("--touches takes map module ids joined by commas, each once");
	}
	const slug = title
		.toLowerCase()
		.normalize("NFKD")
		.replace(/[^a-z0-9]+/g, "-")
		.replace(/^-|-$/g, "");
	if (!slug) {
		throw new Error("a ticket's title needs a letter or a digit, for the name of its folder");
	}
	const root = repoRoot(cwd);
	const plant = transport("LIMEN_CONTEXT_ROOT") ?? root;
	if (touches.length) {
		await checkTouches(root, plant, touches);
	}
	const base = join(root, "spec", "features");
	const now = new Date();
	const opened = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}-${String(now.getDate()).padStart(2, "0")}`;
	const normalizedTitle = title.trim();
	const outcome = /[.!?]$/.test(normalizedTitle) ? normalizedTitle : `${normalizedTitle}.`;
	const template = await readFile(join(base, "_template", "ticket.md"), "utf8").catch(
		(error: NodeJS.ErrnoException) => {
			if (error.code !== "ENOENT") {
				throw error;
			}
			return readFile(
				fileURLToPath(new URL("../../templates/spec/features/_template/ticket.md", import.meta.url)),
				"utf8",
			);
		},
	);
	const start = template.indexOf("## Outcome\n");
	if (start < 0) {
		throw new Error("ticket template needs an ## Outcome section");
	}
	const written = await withNextTicketCode(root, plant, async (code) => {
		const path = join("spec", "features", lane, `${code}-${slug}`, "ticket.md");
		const text = `---\n${touches.length ? `touches:\n${touches.map((id) => `  - ${id}\n`).join("")}` : ""}opened: ${opened}\n---\n\n# ${code} · ${normalizedTitle}\n\n${template.slice(start).replace("## Outcome\n", `## Outcome\n\n${outcome}\n`)}`;
		mkdirSync(join(base, lane), { recursive: true });
		mkdirSync(join(root, dirname(path)));
		atomicWriteSync(join(root, path), text, { exclusive: true });
		return { path, code };
	});
	return { next: null, ids: { ticket: written.code }, text: written.path };
}

/** The map places `touches` names exist: the modules and the plant of the map the strict check and the land read. */
async function checkTouches(root: string, plant: string, touches: readonly string[]): Promise<void> {
	const local = join(root, ".limen", "picture");
	const dir = existsSync(local) ? local : join(plant, ".limen", "picture");
	const map = await readPicture(dir);
	if (map.diagnostics.some((item) => item.level === "error")) {
		throw new Error(`the map at ${dir} has errors; run limen picture build --dir ${dir} --strict to see them`);
	}
	// The same places the strict check and the land gate accept: modules and the plant.
	const places = new Set(map.nodes.filter((node) => node.kind === "module").map((node) => node.id));
	if (map.project.rootId) {
		places.add(map.project.rootId);
	}
	const unknown = touches.find((id) => !places.has(id));
	if (unknown) {
		throw new Error(`unknown map place id "${unknown}"; choose the id: of a module or plant file in ${dir}/nodes/`);
	}
}

/**
 * `limen ticket done`: the close `limen land` makes, for work that landed by a hand merge or needed no code, as an
 * operation of T-38 (src/operation.ts). Its validate refuses a number with no active ticket, and a ticket or board with
 * uncommitted changes or a file where a ticket moves, before any folder moves (D-061); it also reads there the
 * finished jobs of those tickets, so a refusal of that read comes before the commit too. It is the one close
 * operation of src/project/lanes.ts, whose apply runs under the lock of the ticket lanes once the tickets, their jobs
 * and HEAD are still the ones validate read: one closing commit through the project's hooks, then the checkout. It
 * says each closed ticket in `out`, then writes the `landed` marker, with its closing commit, on those jobs that
 * hold no unlanded work (A-002).
 */
export async function closeDoneTickets(
	codes: readonly string[],
	on: string | undefined,
	cwd: string,
	out: CommandText,
	again: string | null = null,
): Promise<void> {
	const closed = await runOperation(ticketDoneOperation(codes, on, cwd, again));
	for (const path of closed.moved) {
		out.line(`closed ${path}${closed.commit ? ` in ${closed.commit}` : ""}`);
	}
	for (const folder of closed.stayed) {
		out.line(stayedLine(folder));
	}
	if (closed.sha && closed.commit) {
		const { sha, commit, day } = closed;
		await markTicketJobs(limenRoot(cwd), closed.added ?? [], { sha, commit, day }, out);
	}
}

/**
 * The operation of `limen ticket done`: the one close operation of src/project/lanes.ts (T-25), with the call's date
 * checked first and the reads of the jobs it marks added; `again` is its command line, the `next` of a STATE_CHANGED
 * and a HOOK_REJECTED.
 */
export function ticketDoneOperation(
	codes: readonly string[],
	on: string | undefined,
	cwd: string,
	again: string | null,
): Operation<
	TicketClose & { readonly added: readonly TicketJob[] | undefined },
	TicketsClosed & { readonly added: readonly TicketJob[] | undefined }
> {
	return closeOperation({
		root: () => {
			if (on && !/^\d{4}-\d\d-\d\d$/.test(on)) {
				throw usageError("BAD_DATE", "--on takes the landed date as YYYY-MM-DD");
			}
			return limenRoot(cwd);
		},
		codes,
		reason: on ? `landed ${on}` : "landed",
		today: on,
		again,
		added: async (view, close) => {
			const missing = codes.filter((code) => !close.tickets.some((ticket) => sameCode(ticket.code, code)));
			if (missing.length) {
				return refused(
					"NO_ACTIVE_TICKET",
					`no active ticket for ${missing.join(", ")} in ${close.root}/spec/features/active/`,
				);
			}
			// Only a close that commits marks jobs; the read refuses, as NOT_MIGRATED, before anything moves (R-031, review
			// round 2, G4).
			const closing = close.tickets.map((ticket) => ticket.code);
			return close.committed
				? await view.hold(`the finished jobs of ${closing.join(", ")} in ${close.root}`, () =>
						ticketDoneJobs(close.root, closing, view),
					)
				: [];
		},
	});
}

/** Whether two ticket numbers name one ticket, whatever their case. */
function sameCode(left: string, right: string): boolean {
	return left.toUpperCase() === right.toUpperCase();
}
