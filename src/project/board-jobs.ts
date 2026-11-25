// `limen board`: the board with each active ticket's running or last job; with `--write` it rewrites NOW and PROVEN in
// spec/build.md from the ticket folders.
import { readFile } from "node:fs/promises";
import { join } from "node:path";
import { jobFeatures } from "../job/job.ts";
import { shownState } from "../job/listing.ts";
import { jobFolders, readRecord } from "../job/record.ts";
import { formatAge } from "../job/view.ts";
import { readTickets } from "../picture/tickets.ts";
import { commitList, limenRoot, unlandedBranches, workspaceRepository } from "./git.ts";
import { readOptional } from "./inherit.ts";
import { renderBoard, writeBoard } from "./lanes.ts";
import { archiveRows } from "./series.ts";

interface BoardJob {
	readonly id: string;
	readonly label: string;
	readonly state: string;
	readonly features: ReadonlySet<string>;
	readonly branch: string;
	readonly repository: string;
	readonly startedAt: number;
	readonly finishedAt: number;
}

/** The board of the project at `cwd` with each active ticket's jobs, or with `write` the rewrite of NOW and PROVEN. */
export async function projectBoard(cwd: string, write: boolean): Promise<string> {
	const root = limenRoot(cwd);
	const text = await readFile(join(root, "spec/build.md"), "utf8").catch((error: NodeJS.ErrnoException) => {
		if (error.code === "ENOENT") {
			return undefined;
		}
		throw error;
	});
	if (write) {
		if (text === undefined) {
			throw new Error(`no board at ${root}/spec/build.md; limen init writes one`);
		}
		const changed = await writeBoard(root);
		return `spec/build.md: NOW and PROVEN ${changed ? "rewritten from the lanes" : "already match the lanes"}`;
	}
	const board = renderBoard(text ?? "# Build\n", (await readTickets(root)).tickets, archiveRows(root));
	return [
		withJobs(board, await readJobs(root)).trimEnd(),
		...(text !== undefined && board !== text
			? ["\nspec/build.md is behind the lanes; limen board --write rewrites NOW and PROVEN."]
			: []),
	].join("\n");
}

/** Puts each active ticket's jobs under its NOW line, and lists running jobs that name no active ticket. */
function withJobs(board: string, jobs: readonly BoardJob[]): string {
	const now = Date.now();
	const lines = board.split("\n");
	const start = lines.indexOf("## NOW");
	const next = lines.findIndex((line, index) => index > start && /^#{1,2}\s/.test(line));
	const end = next < 0 ? lines.length : next;
	const codes = lines.slice(start, end).flatMap((line) => /^- `(F\d+)-/.exec(line)?.[1] ?? []);
	const shown = new Map(codes.map((code) => [code, ticketJobs(jobs.filter((job) => job.features.has(code)))]));
	const landed = landedJobs([...shown.values()].flatMap((show) => (show.last?.state === "done" ? [show.last] : [])));
	const section = lines.slice(start, end).flatMap((line) => {
		const code = /^- `(F\d+)-/.exec(line)?.[1] ?? "";
		const show = shown.get(code);
		if (show?.running.length) {
			return [
				line,
				...show.running.map(
					(job) => `  - running: ${job.label} (\`${job.id}\`, started ${formatAge(now - job.startedAt)})`,
				),
			];
		}
		const last = show?.last;
		if (!last) {
			return [line];
		}
		const ended = `${last.label} (\`${last.id}\`, ${formatAge(now - last.finishedAt)})`;
		if (last.state !== "done") {
			return [line, `  - last job ${last.state}: ${ended}`];
		}
		if (landed.has(last.id)) {
			return [
				line,
				`  - last job landed: ${ended}; nothing runs. If the ticket is finished: limen ticket done ${code}`,
			];
		}
		return [line, `  - last job done, not landed: ${ended}; limen land ${last.id}`];
	});
	const loose = jobs.filter((job) => job.state === "running" && ![...job.features].some((code) => shown.has(code)));
	const trailing = section.at(-1) === "" ? [""] : [];
	const body = trailing.length ? section.slice(0, -1) : section;
	const extra = loose.map((job) => `- ${job.label} (\`${job.id}\`, started ${formatAge(now - job.startedAt)})`);
	if (extra.length) {
		extra.unshift("", "Running without an active ticket:");
	}
	return [...lines.slice(0, start), ...body, ...extra, ...trailing, ...lines.slice(end)].join("\n");
}

/** A ticket's running jobs; with none, the job that finished last. */
function ticketJobs(jobs: readonly BoardJob[]): { readonly running: readonly BoardJob[]; readonly last?: BoardJob } {
	const running = jobs.filter((job) => job.state === "running");
	const last = running.length ? undefined : jobs.toSorted((a, b) => b.finishedAt - a.finishedAt)[0];
	return last ? { running, last } : { running };
}

/** IDs of done jobs whose branch is in HEAD by ancestry or patch, or is gone. */
function landedJobs(done: readonly BoardJob[]): ReadonlySet<string> {
	const landed = new Set<string>();
	for (const repository of new Set(done.map((job) => job.repository))) {
		const own = done.filter((job) => job.repository === repository && job.branch);
		const unlanded = unlandedBranches(
			repository,
			own.map((job) => job.branch),
		);
		for (const job of own) {
			if (!unlanded.has(job.branch)) {
				landed.add(job.id);
			}
		}
	}
	return landed;
}

async function readJobs(root: string): Promise<BoardJob[]> {
	const jobsRoot = join(root, ".limen", "jobs");
	const ids = await jobFolders(jobsRoot);
	return Promise.all(
		ids.map(async (id) => {
			const dir = join(jobsRoot, id);
			const record = await readRecord(dir);
			const state = shownState(record);
			const label = record?.label ?? "";
			const branch = record?.branch ?? "";
			const task = (readOptional(join(dir, "task.md")) ?? "").trim();
			const repository = record?.repo ? workspaceRepository(root, record.repo) : root;
			// A running job has not recorded its commits yet; read the ones its branch holds beyond this checkout.
			const log =
				state === "running" && branch
					? (commitList(repository, "HEAD", branch) ?? "")
					: (record?.commits ?? []).join("\n");
			const [started, finished] = [record?.startedAt ?? "", record?.finishedAt ?? ""];
			const subjects = log.split("\n").map((line) => line.replace(/^\S+ /, ""));
			return {
				id,
				label: label || id,
				state,
				features: jobFeatures(label, id, task, subjects),
				branch,
				repository,
				startedAt: Date.parse(started) || 0,
				finishedAt: Date.parse(finished) || 0,
			};
		}),
	);
}
