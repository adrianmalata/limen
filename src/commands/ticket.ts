import { existsSync, mkdirSync } from "node:fs";
import { readFile } from "node:fs/promises";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { atomicWriteSync } from "../atomic-write.ts";
import { transport } from "../config.ts";
import { LimenError, type Success } from "../outcome.ts";
import type { Parsed } from "../parser.ts";
import { readPicture } from "../picture/picture-build.ts";
import { ID_PATTERN } from "../picture/picture-model.ts";
import { currentBranch, limenRoot, repoRoot } from "../project/git.ts";
import { closeTickets } from "../project/lanes.ts";
import { withNextTicketCode } from "../project/series.ts";
import { landTicketCheck } from "./land.ts";

const PLACE_ID = ID_PATTERN;

/** `limen ticket new`: writes a ticket with the next free number; its success names it in `ids.ticket`. */
export async function ticketNewCommand(values: Parsed, cwd: string): Promise<Success> {
	const title = values.get("title") ?? "";
	if (/[\r\n]/.test(title) || !title.trim()) {
		throw new Error("a ticket's title is one line that says what becomes true");
	}
	const lane = values.get("lane") ?? "planned";
	const touches = values.get("touches")?.split(",") ?? [];
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
	const written = withNextTicketCode(root, plant, (code) => {
		const path = join("spec", "features", lane, `${code}-${slug}`, "ticket.md");
		const text = `---\n${touches.length ? `touches:\n${touches.map((id) => `  - ${id}\n`).join("")}` : ""}opened: ${opened}\n---\n\n# ${code} · ${normalizedTitle}\n\n${template.slice(start).replace("## Outcome\n", `## Outcome\n\n${outcome}\n`)}`;
		mkdirSync(join(base, lane), { recursive: true });
		mkdirSync(join(root, dirname(path)));
		atomicWriteSync(join(root, path), text, { exclusive: true });
		return { path, code };
	});
	console.log(written.path);
	return { next: "", ids: { ticket: written.code } };
}

/** `limen ticket done`: the close `limen land` makes, for work that landed by a hand merge or needed no code. */
export async function ticketDoneCommand(values: Parsed, cwd: string): Promise<undefined> {
	const codes = values.list("tickets");
	const on = values.get("on");
	if (on && !/^\d{4}-\d\d-\d\d$/.test(on)) {
		throw new Error("--on takes the landed date as YYYY-MM-DD");
	}
	const root = limenRoot(cwd);
	const closed = await (on ? closeTickets(root, codes, `landed ${on}`, on) : closeTickets(root, codes, "landed"));
	const missing = codes.filter((code) => !closed.moved.some((path) => path.includes(`/${code.toUpperCase()}-`)));
	for (const path of closed.moved) {
		console.log(`closed ${path}${closed.commit ? ` in ${closed.commit}` : ""}`);
	}
	if (missing.length) {
		throw new Error(`no active ticket for ${missing.join(", ")} in ${root}/spec/features/active/`);
	}
}

/**
 * `limen ticket check`: the land gate on demand, so a hand merge or a keeper can check a branch before it reaches the
 * plant branch. A failing ticket is a refusal (D-028): its lines go to stderr, then the refusal that `main` ends with.
 */
export async function ticketCheckCommand(values: Parsed, cwd: string): Promise<undefined> {
	const named = values.get("branch");
	if (named?.startsWith("-")) {
		throw new Error(`a branch name does not start with -: ${named}`);
	}
	const repository = repoRoot(cwd);
	const plant = transport("LIMEN_CONTEXT_ROOT") ?? limenRoot(cwd);
	const target = currentBranch(plant);
	const branch = named ?? currentBranch(repository);
	if (branch === target) {
		throw new Error(
			`ticket check compares a branch with ${target}; name the branch to check: limen ticket check BRANCH`,
		);
	}
	const job =
		branch.startsWith("limen/") && existsSync(join(plant, ".limen", "jobs", branch.slice("limen/".length)))
			? branch.slice("limen/".length)
			: "<id>";
	const gate = await landTicketCheck(repository, plant, branch, target, job);
	for (const line of gate.lines) {
		(gate.ok ? console.log : console.error)(line);
	}
	if (!gate.ok) {
		throw new LimenError({
			class: "refused",
			code: "TICKET_CHECK_FAILED",
			message: `ticket check: changed tickets on ${branch} fail against ${target}`,
			next: `fix the tickets listed above, then run limen ticket check ${branch}`,
		});
	}
	console.log(
		`ticket check: ${gate.tickets.length} changed ticket${gate.tickets.length === 1 ? "" : "s"} on ${branch} pass against ${target}`,
	);
}
