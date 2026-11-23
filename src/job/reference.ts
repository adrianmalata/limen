// The one resolver of job references (T-20, T-25 (1)): the only code that turns a job argument into a job, and the
// only code that names a new job. A reference is exact: the full id of a folder in `.limen/jobs/`, or the final token
// of 8 hex characters (src/job/id.ts) that exactly one such id ends with as `-<token>`. Resolving reads only the folder
// names (src/job/record.ts), so a record that cannot be read stops no other job's resolution. Every other form exits 2
// (D-061 (1)); the jobs an approximate match would have found appear only as hints in its message, and `next` is the
// command with the one candidate's token, or `limen status --all` for several or none (D-061). A token is unique from
// the job's creation: it is drawn under one lock until the job's folder exists, against the folders of `.limen/jobs/`,
// `.limen/unmigrated/` and the job archive (D-061, T-20 (1)), and retire moves a job into the archive under the same
// lock (src/runtime/retiring.ts). A job of the archive has no reference: the resolver reads `.limen/jobs/` only.
import { join } from "node:path";
import { transport } from "../config.ts";
import { type Guarded, withLock } from "../lock.ts";
import { LimenError } from "../outcome.ts";
import type { Parsed } from "../parser.ts";
import { limenRoot } from "../project/git.ts";
import { JOB_ID, TOKEN, tokenOf } from "./id.ts";
import { jobToken, makeJobId } from "./job.ts";
import { archivedJobs, type JobRecord, jobFolderNames, jobFolders, readRecord } from "./record.ts";

/** A shorter hint matches no id suffix and no label prefix, as the matcher before the resolver did. */
const HINT_LENGTH = 3;
/** The most candidates a refusal lists; it counts the rest. */
const CANDIDATES = 10;
const ALL = "limen status --all";

/** A job argument: the word given and, from a command line, that command with another word in its place. */
export type JobArgument = { readonly word: string; readonly retry?: (word: string) => string };
/** A job argument, or the full id of a job that Limen itself names, such as a group's member. */
export type JobReference = string | JobArgument;
/** A job a refusal lists: how a command names it, its line, and the time it was created. */
type Candidate = { readonly reference: string; readonly line: string; readonly at: string };

/** The job argument `name` of a parsed command line; `word` is one value of a repeatable flag. */
export function jobArgument(values: Parsed, name = "job", word = values.get(name) ?? ""): JobArgument {
	return { word, retry: (to) => values.commandWith(name, word, to) };
}

/** The word of `reference`, as the command was given it. */
export function referenceWord(reference: JobReference): string {
	return typeof reference === "string" ? reference : reference.word;
}

/**
 * The job `reference` names exactly, and its folder; a usage error (exit 2) for any other form. With `control`, a
 * group member names only a job of its own team (JOB_OTHER_TEAM, a refusal); `read` resolves any job.
 */
export async function resolveJob(
	cwd: string,
	reference: JobReference,
	access: "read" | "control",
): Promise<{ readonly id: string; readonly jobDir: string }> {
	const jobsRoot = `${limenRoot(cwd)}/.limen/jobs`;
	const argument = typeof reference === "string" ? { word: reference } : reference;
	const word = argument.word.trim();
	const ids = await jobFolders(jobsRoot);
	const owners = TOKEN.test(word) ? ids.filter((id) => tokenOf(id) === word) : [];
	const id = ids.includes(word) ? word : owners.length === 1 ? owners[0] : undefined;
	if (id === undefined) {
		throw await refusal(jobsRoot, ids, word, owners, argument.retry);
	}
	const jobDir = `${jobsRoot}/${id}`;
	const group = transport("LIMEN_GROUP_ID");
	if (access === "control" && group) {
		const record = await readRecord(jobDir);
		if (record?.group !== group || record?.team !== transport("LIMEN_TEAM_ID")) {
			throw new LimenError({
				class: "refused",
				code: "JOB_OTHER_TEAM",
				message: `group members cannot stop, steer, continue, watch, or land another team's job (${id}); they can read it`,
				next: `limen show ${referenceOf(id, ids)}`,
			});
		}
	}
	return { id, jobDir };
}

/**
 * The lock under which a new job of the project at `root` gets its token and its folder (T-20 (1)). Spawn and continue
 * hold it as the lock of their operation's `apply` (src/operation.ts), so their re-check and their publication share it.
 */
export function jobsLock(root: string): Guarded {
	return { file: join(root, ".limen", "jobs") };
}

/**
 * Names a new job of the project at `root` for a caller that holds `jobsLock(root)` until the job's folder exists: draws
 * its token until no folder of `.limen/jobs/`, of `.limen/unmigrated/` or of the job archive ends in it. `draw` is the
 * tests' source of tokens; Limen's callers never pass it.
 */
export async function newJobId(
	root: string,
	label: string,
	options: { readonly draw?: () => string } = {},
): Promise<string> {
	const jobs = join(root, ".limen", "jobs");
	const names = [
		...(await jobFolderNames(jobs)),
		...(await jobFolderNames(join(root, ".limen", "unmigrated"))),
		...(await archivedJobs(root)).map((job) => job.id),
	];
	const taken = new Set(names.flatMap((name) => tokenOf(name) ?? []));
	const draw = options.draw ?? jobToken;
	let token = draw();
	while (taken.has(token)) {
		token = draw();
	}
	return makeJobId(label, token);
}

/**
 * Names a new job of the project at `root` under `jobsLock(root)` and runs `create` with the id, which must make the
 * job's folder before the lock is released, so two jobs never take the same token.
 */
export async function withNewJobId<T>(
	root: string,
	label: string,
	create: (id: string) => Promise<T>,
	options: { readonly draw?: () => string } = {},
): Promise<T> {
	return withLock(jobsLock(root), async () => create(await newJobId(root, label, options)));
}

/** The usage error for `word`, which names no job exactly, with the jobs an approximate match would have found. */
async function refusal(
	jobsRoot: string,
	ids: readonly string[],
	word: string,
	owners: readonly string[],
	retry: ((word: string) => string) | undefined,
): Promise<LimenError> {
	const candidates = await hints(jobsRoot, ids, word, owners);
	const [only] = candidates;
	const next = candidates.length === 1 && only && retry ? retry(only.reference) : ALL;
	const { code, problem } = problemOf(word, owners);
	const lines = candidates.length ? ["jobs it may mean, newest first:", ...listed(candidates)] : ["no job matches it"];
	return new LimenError({ class: "usage", code, message: [problem, ...lines].join("\n"), next });
}

/** The code and the first line of the refusal of `word`: a token several ids share, a well-formed id or token, or neither. */
function problemOf(word: string, owners: readonly string[]): { readonly code: string; readonly problem: string } {
	const exact = "name the job by its full id or its 8-character token";
	if (owners.length > 1) {
		const problem = `the token ${word} ends the ids of ${owners.length} jobs, so it names none; name the job by its full id`;
		return { code: "JOB_TOKEN_SHARED", problem };
	}
	if (TOKEN.test(word) || JOB_ID.test(word)) {
		return { code: "JOB_NOT_FOUND", problem: `no job of this project has the id or token ${JSON.stringify(word)}` };
	}
	const given = word === "" ? "a job reference is empty" : `${JSON.stringify(word)} is not an exact job reference`;
	return { code: "JOB_NOT_EXACT", problem: `${given}; ${exact}` };
}

/**
 * The jobs an approximate match would have found for `word`: the ids that share its token, an id that ends in it or a
 * label equal to it, and, for 3 or more characters, a label that starts with it in any case. A record that cannot be
 * read has no label to compare, so its id, the one fact the resolver has for it, makes it a candidate, listed as
 * damaged; it never counts toward several candidates for a word that does not match that id.
 */
async function hints(
	jobsRoot: string,
	ids: readonly string[],
	word: string,
	owners: readonly string[],
): Promise<Candidate[]> {
	const long = word.length >= HINT_LENGTH;
	const found: Candidate[] = [];
	for (const id of ids) {
		const byId = owners.includes(id) || (long && id.endsWith(word));
		const record = await recordOrDamage(`${jobsRoot}/${id}`);
		const label = record === "damaged" ? null : (record?.label ?? null);
		const byLabel = label !== null && (label === word || (long && label.toLowerCase().startsWith(word.toLowerCase())));
		if (!(byId || byLabel)) {
			continue;
		}
		const reference = referenceOf(id, ids);
		const facts = record === "damaged" ? "damaged record" : `${label ?? "(no label)"}  ${record?.state ?? "no record"}`;
		const at = record === "damaged" ? id : (record?.transitions[0]?.at ?? id);
		found.push({ reference, line: `  ${reference}  ${facts}`, at });
	}
	return found;
}

/** The candidates' lines, newest first, at most `CANDIDATES` of them, and how many more there are. */
function listed(candidates: readonly Candidate[]): string[] {
	const sorted = [...candidates].sort((left, right) => (left.at < right.at ? 1 : left.at > right.at ? -1 : 0));
	const shown = sorted.slice(0, CANDIDATES).map((candidate) => candidate.line);
	const more = sorted.length - shown.length;
	return more > 0 ? [...shown, `  and ${more} more; ${ALL} lists every job`] : shown;
}

/** The record of a job folder, or `damaged` when it cannot be read as one (BAD_DATA, src/job/record.ts). */
async function recordOrDamage(jobDir: string): Promise<JobRecord | undefined | "damaged"> {
	try {
		return await readRecord(jobDir);
	} catch (error) {
		if (error instanceof LimenError && error.code === "BAD_DATA") {
			return "damaged";
		}
		throw error;
	}
}

/** How a command names `id`: by its token when no other id ends in it, else by the full id (T-20 (6)). */
function referenceOf(id: string, ids: readonly string[]): string {
	const token = tokenOf(id);
	return token !== undefined && ids.filter((other) => tokenOf(other) === token).length === 1 ? token : id;
}
