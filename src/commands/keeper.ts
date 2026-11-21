import { execFileSync } from "node:child_process";
import { existsSync } from "node:fs";
import { mkdtemp, readdir, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { atomicWrite } from "../atomic-write.ts";
import { transport } from "../config.ts";
import { readRun } from "../job/group-cabinet.ts";
import { isTerminal } from "../job/job.ts";
import { type JobRecord, readRecord } from "../job/record.ts";
import { type JobReference, jobArgument, referenceWord, resolveJob } from "../job/reference.ts";
import { startSpawn } from "../job/spawning.ts";
import type { CommandText, Success } from "../outcome.ts";
import type { Parsed } from "../parser.ts";
import { branchCommit, branchExists, commitHasFile, limenRoot, workspaceRepository } from "../project/git.ts";
import { landTicketCheck, TICKET_PATH } from "../project/ticket-check.ts";
import { ownerState } from "../runtime/reap.ts";

type Route = { readonly engine: string; readonly provider: string; readonly model: string; readonly thinking: string };
type KeeperOptions = {
	readonly ticket: string;
	readonly jobs: readonly JobReference[];
	readonly candidate?: string;
	readonly group?: string;
	readonly route: Route;
	readonly timeout: string;
};

type KeeperJob = {
	readonly id: string;
	readonly jobDir: string;
	readonly record: JobRecord | undefined;
	readonly state: string;
	readonly branch: string;
	readonly repo: string;
};

const DEFAULT_TIMEOUT = "20m";

/**
 * After the work: a short job on its own branch at the candidate tip fixes the ticket, board and map links. Its
 * success is the keeper job's start, which `main` reports once.
 */
export async function keeperCommand(values: Parsed, cwd: string, out: CommandText): Promise<Success> {
	if (transport("LIMEN_GROUP_ID")) {
		throw new Error(
			"group members cannot start a keeper; the owner-facing lead starts one after it merges the team branches",
		);
	}
	const options = keeperOptions(values);
	const code = TICKET_PATH.exec(options.ticket)?.[1];
	if (!code) {
		throw new Error(`keeper needs a ticket path like spec/features/active/FNNN-slug/ticket.md, not ${options.ticket}`);
	}
	const root = limenRoot(cwd);
	const jobs = await finishedJobs(root, options);
	const [first] = jobs;
	if (!first) {
		throw new Error("keeper requires --job ID or --group GROUP-ID");
	}
	if (!options.candidate && jobs.length > 1) {
		throw new Error("several jobs need one candidate; pass --candidate <integration branch>");
	}
	const candidate = options.candidate ?? first.branch;
	if (!candidate) {
		throw new Error(`job ${first.id} has no recorded branch; pass --candidate BRANCH`);
	}
	const repository = first.repo ? workspaceRepository(root, first.repo) : root;
	if (!branchExists(repository, candidate)) {
		throw new Error(`candidate branch ${candidate} does not exist`);
	}
	const tip = branchCommit(repository, candidate);
	const ticket = ticketAtTip(repository, tip, options.ticket, code, candidate);
	const keeperBranch = `limen/keeper-${code.toLowerCase()}-${tip.slice(0, 7)}`;
	if (branchExists(repository, keeperBranch)) {
		throw new Error(`keeper branch ${keeperBranch} already exists; land or delete it first`);
	}

	const gate = await landTicketCheck(repository, root, candidate, "HEAD", first.id);
	// The fix line names limen keeper; the keeper itself must not start another one.
	const gateLines = gate.lines.filter((line) => !line.startsWith("fix: ")).map((line) => `  ${line}`);
	const map = `${root}/.limen/picture`;
	const blocks = await Promise.all(jobs.map((job) => jobBlock(repository, job)));
	const packet = [
		`Spec keeper for ${code}. Fix the ticket, board and map links for this work; commit on this branch.`,
		"",
		`Ticket: ${ticket}`,
		"Board: spec/build.md",
		`Map: ${existsSync(map) ? map : "none"}`,
		`Group: ${options.group ?? "none"}`,
		`Candidate: ${candidate} at ${tip}`,
		`Changed tickets: ${gate.tickets.length > 0 ? gate.tickets.join(", ") : "none"}`,
		"Land check now:",
		...(gate.ok && gate.lines.length === 0 ? ["no error"] : gateLines),
		"",
		...blocks,
		"",
	].join("\n");

	execFileSync("git", ["branch", keeperBranch, tip], { cwd: repository, stdio: "ignore" });
	const scratch = await mkdtemp(join(tmpdir(), "limen-keeper-"));
	try {
		const packetFile = `${scratch}/task.md`;
		await atomicWrite(packetFile, packet);
		return await startSpawn(
			{
				task: [],
				...options.route,
				role: "keeper",
				branch: keeperBranch,
				timeout: options.timeout,
				label: `spec keeper · ${code}`,
				taskFile: packetFile,
				repo: first.repo || undefined,
			},
			cwd,
			out,
		);
	} catch (error) {
		execFileSync("git", ["branch", "-D", keeperBranch], { cwd: repository, stdio: "ignore" });
		throw error;
	} finally {
		await rm(scratch, { recursive: true, force: true });
	}
}

function keeperOptions(values: Parsed): KeeperOptions {
	const jobs = values.list("job").map((word) => jobArgument(values, "job", word));
	const group = values.get("group");
	if (jobs.length === 0 && !group) {
		throw new Error("keeper requires --job ID or --group GROUP-ID");
	}
	const candidate = values.get("candidate");
	return {
		ticket: values.get("ticket") ?? "",
		jobs,
		route: {
			engine: values.get("engine") ?? "",
			provider: values.get("provider") ?? "",
			model: values.get("model") ?? "",
			thinking: values.get("thinking") ?? "",
		},
		timeout: values.get("timeout") ?? DEFAULT_TIMEOUT,
		...(candidate ? { candidate } : {}),
		...(group ? { group } : {}),
	};
}

/** The jobs the keeper reads. A group's keeper reads every member; the lead names the group, not each member. */
async function finishedJobs(root: string, options: KeeperOptions): Promise<KeeperJob[]> {
	// A job named twice is read once: by the word it was given, or the member's id.
	const queries = new Map(options.jobs.map((query) => [referenceWord(query), query]));
	if (options.group) {
		for (const member of (await readRun(root, options.group)).members) {
			queries.set(member.id, queries.get(member.id) ?? member.id);
		}
	}
	const jobs: KeeperJob[] = [];
	for (const query of queries.values()) {
		const { id, jobDir } = await resolveJob(root, query, "control");
		const record = await readRecord(jobDir);
		// The process the record names still finishes the job after its terminal record; it counts as live.
		if (record && (!isTerminal(record.state) || (await ownerState(record.identity)) === "alive")) {
			throw new Error(`job ${id} is still running. A keeper never commits beside a live job. Wait for it, or stop it.`);
		}
		jobs.push({
			id,
			jobDir,
			record,
			state: record?.state ?? "",
			branch: record?.branch ?? "",
			repo: record?.repo ?? "",
		});
	}
	return jobs;
}

/** A ticket moved to another lane leaves its old path in the job's task. Follow the one folder with that number. */
function ticketAtTip(repository: string, tip: string, ticket: string, code: string, candidate: string): string {
	if (commitHasFile(repository, tip, ticket)) {
		return ticket;
	}
	const tree = execFileSync("git", ["ls-tree", "-r", "--name-only", tip, "--", "spec/features"], {
		cwd: repository,
		encoding: "utf8",
		maxBuffer: 64 * 1024 * 1024,
	});
	const moved = tree.split("\n").filter((path) => TICKET_PATH.exec(path)?.[1] === code);
	const [only] = moved;
	if (moved.length !== 1 || !only) {
		const found = moved.length > 0 ? `; ${code} is at ${moved.join(", ")}` : "";
		throw new Error(`ticket ${ticket} is missing at ${candidate} (${tip.slice(0, 7)})${found}`);
	}
	console.log(`ticket moved: ${ticket} -> ${only}`);
	return only;
}

async function jobBlock(repository: string, job: KeeperJob): Promise<string> {
	const { label, base, worktree } = job.record ?? { label: "", base: "", worktree: "" };
	const jobTip = job.branch && branchExists(repository, job.branch) ? branchCommit(repository, job.branch) : "none";
	const sessions = await readdir(`${job.jobDir}/session`).catch(() => [] as string[]);
	const session = sessions
		.filter((name) => name.endsWith(".jsonl"))
		.sort()
		.at(-1);
	return [
		`Job: ${job.id}`,
		`  Label: ${label || job.id}`,
		`  State: ${job.state || "missing"}`,
		`  Branch: ${job.branch || "none"} (base ${base || "none"}, tip ${jobTip})`,
		`  Worktree: ${worktree || "none"}`,
		`  Session: ${session ? `${job.jobDir}/session/${session}` : "none"}`,
		`  Task: ${job.jobDir}/task.md`,
	].join("\n");
}
