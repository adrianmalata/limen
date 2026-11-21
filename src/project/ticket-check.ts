// The strict check of the tickets a branch changes (T-26 (2)): `limen land` runs it before it merges, a keeper reads it
// into its task, and `limen ticket check` runs it on demand. Ticket operations stay in src/project/ until R-061.
import { execFileSync, spawnSync } from "node:child_process";
import { existsSync } from "node:fs";
import { mkdtemp, readFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { transport } from "../config.ts";
import { type CommandText, LimenError } from "../outcome.ts";
import { limenCommand } from "../parser.ts";
import { readPicture } from "../picture/picture-build.ts";
import { checkTickets, readTickets } from "../picture/tickets.ts";
import { currentBranch, gitText, limenRoot, repoRoot } from "./git.ts";
import { takenElsewhere } from "./series.ts";

export const TICKET_PATH = /^spec\/features\/(?:[^/]+\/)*(F\d+)-[^/]+\/ticket\.md$/;

/**
 * `limen ticket check`: the land gate on demand, so a hand merge or a keeper can check a branch before it reaches the
 * plant branch. A failing ticket is a refusal (D-028): its lines go to stderr, then the refusal that `main` ends with.
 */
export async function checkBranchTickets(named: string | undefined, cwd: string, out: CommandText): Promise<void> {
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
		(gate.ok ? out.line : out.diagnostic)(line);
	}
	if (!gate.ok) {
		// D-045 (5.1): the fix is prose, so it is the line after the refusal's own; `next` checks the same branch again.
		throw new LimenError({
			class: "refused",
			code: "TICKET_CHECK_FAILED",
			message: `ticket check: changed tickets on ${branch} fail against ${target}\nfix the tickets listed above`,
			next: limenCommand("ticket check", { positionals: [branch] }),
		});
	}
	out.line(
		`ticket check: ${gate.tickets.length} changed ticket${gate.tickets.length === 1 ? "" : "s"} on ${branch} pass against ${target}`,
	);
}

/**
 * The strict ticket check for tickets that `branch` adds, changes or moves against `target`, read at the branch tip.
 * `lines` is print-ready: the no-map note, warnings, errors, then the keeper command when the check refuses.
 */
export async function landTicketCheck(
	repository: string,
	root: string,
	branch: string,
	target = "HEAD",
	job = "<id>",
): Promise<{ readonly ok: boolean; readonly tickets: readonly string[]; readonly lines: readonly string[] }> {
	const changed = changedTickets(repository, branch, target);
	const tickets = [...changed.keys()];
	if (tickets.length === 0) {
		return { ok: true, tickets, lines: [] };
	}
	const lines: string[] = [];
	const placeIds = await checkPictureSources(repository, root, branch, tickets, lines);
	const tip = await mkdtemp(join(tmpdir(), "limen-land-"));
	try {
		extractTicketsAtTip(repository, branch, tip);
		const read = await readTickets(tip);
		const diagnostics = [...read.diagnostics, ...(placeIds ? checkTickets(read.tickets, placeIds) : [])].filter(
			(d) => d.source !== null && changed.has(d.source),
		);
		const failing = diagnostics.filter((d) => d.level === "error");
		const errors = failing.map((d) => `error ${d.source}:${d.line ?? 1}: ${d.message}`);
		let bad = failing[0]?.source ?? undefined;
		for (const duplicate of duplicateTicketErrors(repository, root, branch, changed)) {
			errors.push(duplicate.error);
			bad ??= duplicate.path;
		}
		for (const d of diagnostics) {
			if (d.level === "warn") {
				lines.push(`warn ${d.source}:${d.line ?? 1}: ${d.message}`);
			}
		}
		lines.push(...errors);
		if (errors.length === 0) {
			return { ok: true, tickets, lines };
		}
		bad ??= tickets[0];
		lines.push(
			`fix: limen keeper ${bad} --job ${job} --engine <engine> --provider <provider> --model <model> --thinking <level>`,
		);
		return { ok: false, tickets, lines };
	} finally {
		await rm(tip, { recursive: true, force: true });
	}
}
/** Ticket paths the branch adds, changes or moves against the target, with the first letter of their Git status. */
function changedTickets(repository: string, branch: string, target: string): Map<string, string> {
	const changed = new Map<string, string>();
	for (const row of gitText(repository, ["diff", "--name-status", "-M", `${target}...${branch}`]).split("\n")) {
		const [status = "", ...paths] = row.split("\t");
		const path = paths.at(-1) ?? "";
		if (/^[AMR]/.test(status) && TICKET_PATH.test(path)) {
			changed.set(path, status[0] ?? "");
		}
	}
	return changed;
}
/**
 * Warns about picture sources that name a changed ticket's feature but do not exist at the branch. Returns the place
 * ids tickets may touch, or undefined when the project has no picture map.
 */
async function checkPictureSources(
	repository: string,
	root: string,
	branch: string,
	tickets: readonly string[],
	lines: string[],
): Promise<ReadonlySet<string> | undefined> {
	const map = `${root}/.limen/picture`;
	if (!existsSync(map)) {
		lines.push(`land: no picture map at ${map}; touches place ids not checked`);
		return;
	}
	const model = await readPicture(map);
	const placeIds = new Set([
		...model.nodes.filter((node) => node.kind === "module").map((node) => node.id),
		...(model.project.rootId ? [model.project.rootId] : []),
	]);
	const codes = new Map(tickets.map((path) => [TICKET_PATH.exec(path)?.[1] ?? "", path]));
	for (const record of [...model.nodes, ...model.edges, ...model.features, ...model.journeys]) {
		for (const source of record.sources) {
			const current = codes.get(/\/(F\d+)-/.exec(source)?.[1] ?? "");
			if (current && !gitOk(repository, ["cat-file", "-e", `${branch}:${source.replace(/\/$/, "")}`])) {
				const at =
					(await readFile(join(map, record.source), "utf8")).split("\n").findIndex((line) => line.includes(source)) + 1;
				lines.push(
					`warn ${map}/${record.source}:${at || 1}: source "${source}" does not exist at ${branch}; fix: change it to ${current}`,
				);
			}
		}
	}
	return placeIds;
}
/** Writes the branch's tickets into `tip`. */
function extractTicketsAtTip(repository: string, branch: string, tip: string): void {
	const archive = execFileSync("git", ["archive", branch, "--", ":(glob)spec/features/**/ticket.md"], {
		cwd: repository,
		maxBuffer: 256 * 1024 * 1024,
	});
	execFileSync("tar", ["-x", "-C", tip], { input: archive });
}
/** An added ticket whose F number another ticket at the branch or the plant's archive already uses. */
function duplicateTicketErrors(
	repository: string,
	root: string,
	branch: string,
	changed: ReadonlyMap<string, string>,
): { readonly path: string; readonly error: string }[] {
	const duplicates: { readonly path: string; readonly error: string }[] = [];
	const all = gitText(repository, ["ls-tree", "-r", "--name-only", branch, "--", "spec/features"]).split("\n");
	const elsewhere = takenElsewhere(root);
	for (const [path, status] of changed) {
		if (status !== "A") {
			continue;
		}
		const code = TICKET_PATH.exec(path)?.[1] ?? "";
		const other =
			all.find((candidate) => candidate !== path && TICKET_PATH.exec(candidate)?.[1] === code) ?? elsewhere.get(code);
		if (!other) {
			continue;
		}
		duplicates.push({
			path,
			error: `error ${path}:1: ${code} is also used by ${other}; fix: move this ticket to a free F number (limen ticket new picks one)`,
		});
	}
	return duplicates;
}

function gitOk(cwd: string, args: readonly string[]): boolean {
	return spawnSync("git", args, { cwd, stdio: "ignore" }).status === 0;
}
