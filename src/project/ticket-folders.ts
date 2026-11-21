// The ticket folders under spec/features/ (T-26 (2)): `limen ticket new` writes one with the next free number, and
// `limen ticket done` closes active ones as `limen land` does. Ticket operations stay in src/project/ until R-061.
import { existsSync, mkdirSync } from "node:fs";
import { readFile } from "node:fs/promises";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { atomicWriteSync } from "../atomic-write.ts";
import { transport } from "../config.ts";
import type { CommandText, Success } from "../outcome.ts";
import { readPicture } from "../picture/picture-build.ts";
import { ID_PATTERN } from "../picture/picture-model.ts";
import { limenRoot, repoRoot } from "./git.ts";
import { closeTickets } from "./lanes.ts";
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
 * `limen ticket done`: the close `limen land` makes, for work that landed by a hand merge or needed no code. Says each
 * closed ticket in `out`; a number with no active ticket refuses after the others closed.
 */
export async function closeDoneTickets(
	codes: readonly string[],
	on: string | undefined,
	cwd: string,
	out: CommandText,
): Promise<void> {
	if (on && !/^\d{4}-\d\d-\d\d$/.test(on)) {
		throw new Error("--on takes the landed date as YYYY-MM-DD");
	}
	const root = limenRoot(cwd);
	const closed = await (on ? closeTickets(root, codes, `landed ${on}`, on) : closeTickets(root, codes, "landed"));
	const missing = codes.filter((code) => !closed.moved.some((path) => path.includes(`/${code.toUpperCase()}-`)));
	for (const path of closed.moved) {
		out.line(`closed ${path}${closed.commit ? ` in ${closed.commit}` : ""}`);
	}
	if (missing.length) {
		throw new Error(`no active ticket for ${missing.join(", ")} in ${root}/spec/features/active/`);
	}
}
