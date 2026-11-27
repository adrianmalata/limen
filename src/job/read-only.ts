// The one effect check of a read-only role's job (A-081, T-25 (1)): its start state, which its wrapper takes after
// setup and before the engine and keeps in the job folder as `start-state.json`, and what its worktree and its own
// branch changed since, which the job's end compares (src/job/finalize.ts). The role's tool list is a mistake and noise
// guard, since bash can still write; this check is the guarantee (z. 14). A write outside the worktree and the branch,
// such as another ref or a file elsewhere, is not seen (R-045, Out of scope). The check fails closed: a state it cannot
// read is `unproven`, never `same` (R-045 Decision 12).
import { createHash } from "node:crypto";
import {
	closeSync,
	constants,
	existsSync,
	fstatSync,
	lstatSync,
	openSync,
	readFileSync,
	readlinkSync,
	readSync,
} from "node:fs";
import { readFile } from "node:fs/promises";
import { join } from "node:path";
import { atomicWrite } from "../atomic-write.ts";
import { arrayOf, at, matching, nullOr, object, optional, parseJson, shownField, string } from "../boundary.ts";
import { environmentError, LimenError } from "../outcome.ts";
import { branchTip, headCommit, type StatusEntry, statusEntries } from "../project/git.ts";
import { jobRole } from "../runtime/roles.ts";
import { hasCode } from "../system-error.ts";
import type { JobRecord } from "./record.ts";

/** The file of a job folder that holds its start state; a continuation carries its parent's (R-045 Decision 14). */
export const START_STATE_FILE = "start-state.json";
/** At most this many changed paths a difference names; it counts them all. */
const SHOWN_PATHS = 5;
/** A commit id as git prints it: SHA-1, or SHA-256 in a repository that uses it. */
const COMMIT = /^(?:[0-9a-f]{40}|[0-9a-f]{64})$/;
/** The two-letter code of a `git status --porcelain` entry. */
const STATUS_CODE = /^[ MTADRCU?!]{2}$/;
/** A read of a listed path that follows no symlink and does not wait on a pipe (the record's guarded read, too). */
const HASH_FLAGS = constants.O_RDONLY | constants.O_NOFOLLOW | constants.O_NONBLOCK;
/** How much of a file one read takes while its content is hashed. */
const HASH_CHUNK = 64 * 1024;

/**
 * One path `git status` lists, with its content (R-045 Decision 17 F3): a SHA-256 of a file's bytes, `link:` and one
 * of a symlink's target, `directory` for a folder (a nested repository, which status lists whole), `special` for any
 * other kind, or `missing` for a deleted path. So a second write to a path already dirty at the start, which keeps its
 * status entry, is still a difference.
 */
export type ListedPath = StatusEntry & { readonly hash: string };

/**
 * A worktree's state as the check compares it (R-045 Decision 11): its HEAD commit, the tip of the job's own branch
 * (null when the branch does not exist), or null for a job with no branch of its own, and every path `git status`
 * lists, ignored files left out (R-045 Decision 7), with its content (`ListedPath`).
 */
export type StartState = {
	readonly head: string;
	readonly branch: { readonly name: string; readonly tip: string | null } | null;
	readonly status: readonly ListedPath[];
};

/** What a read-only role's job changed: nothing, the difference, or `unproven: …` when it could not be compared. */
export type Effect = { readonly kind: "same" } | { readonly kind: "changed" | "unproven"; readonly detail: string };

/**
 * The state of the checkout `worktree` now, with the tip of `branch` when the job has a branch of its own and the
 * content of each listed path. A worktree that is missing, or is no Git checkout, and any Git failure throw the
 * environment's error (exit 4): git never runs where it would read a repository above the worktree. A path that cannot
 * be read throws its own error.
 */
export function startState(worktree: string, branch: string | undefined): StartState {
	if (!(worktree && existsSync(join(worktree, ".git")))) {
		throw environmentError("WORKTREE_MISSING", "it is missing or is not a Git checkout");
	}
	const head = headCommit(worktree);
	const tip = branch === undefined ? undefined : (branchTip(worktree, branch) ?? null);
	const status = statusEntries(worktree).map((entry) => ({ ...entry, hash: contentHash(join(worktree, entry.path)) }));
	return { head, branch: branch === undefined || tip === undefined ? null : { name: branch, tip }, status };
}

/**
 * What changed from `start` to `now`, as one line of the job's log and failure, or null when nothing did: `HEAD moved
 * <12 hex>..<12 hex>`, `branch <name> moved <12 hex>..<12 hex>` (`none` for a branch that does not exist), and `<n>
 * paths changed: <at most five paths>`, joined by `; `. A name or a path the job chose is escaped as the log escapes
 * text (`shownField`), so it cannot add a line to what the coordinator reads.
 */
export function difference(start: StartState, now: StartState): string | null {
	const parts: string[] = [];
	if (start.head !== now.head) {
		parts.push(`HEAD moved ${shortTip(start.head)}..${shortTip(now.head)}`);
	}
	const before = start.branch;
	const after = now.branch?.name === before?.name ? (now.branch?.tip ?? null) : null;
	if (before && before.tip !== after) {
		parts.push(`branch ${shownField(before.name)} moved ${shortTip(before.tip)}..${shortTip(after)}`);
	}
	const paths = statusChanges(start.status, now.status);
	if (paths.length > 0) {
		const shown = paths.slice(0, SHOWN_PATHS).map(shownField).join(", ");
		parts.push(`${paths.length} ${paths.length === 1 ? "path" : "paths"} changed: ${shown}`);
	}
	return parts.length > 0 ? parts.join("; ") : null;
}

/**
 * Takes and writes the start state of the job of `jobDir` when its role is read-only and the folder holds none yet, as
 * a continuation's holds its parent's; returns why it could not be taken (the worktree, git, or a read of a path its
 * status lists), which ends the job before its engine with kind `launch` (R-045 Decision 12, D-095), and undefined
 * otherwise. The reason is escaped as `unprovenEffect` escapes its words.
 */
export async function recordStartState(
	jobDir: string,
	record: Pick<JobRecord, "role" | "worktree" | "branch">,
): Promise<string | undefined> {
	if (!jobRole(record.role)?.readOnly || existsSync(join(jobDir, START_STATE_FILE))) {
		return undefined;
	}
	const worktree = record.worktree ?? "";
	const state = takenState(worktree, ownBranch(record));
	if (typeof state === "string") {
		return shownField(`the start state of the worktree ${worktree} could not be taken: ${state}`);
	}
	await atomicWrite(join(jobDir, START_STATE_FILE), `${JSON.stringify(state)}\n`);
	return undefined;
}

/**
 * What the job of `jobDir`, whose record is `record`, changed since its start state, when its role is read-only;
 * undefined for a role that writes. A start state that is missing or cannot be read, a worktree git cannot read at the
 * end, a listed path that cannot be read, and any other error of the check are `unproven`, never `same`, and never a
 * rejection (R-045 Decision 12, Decision 17 F4); the words after `unproven: ` are escaped (`unprovenEffect`).
 */
export async function readOnlyEffect(
	jobDir: string,
	record: Pick<JobRecord, "role" | "worktree">,
): Promise<Effect | undefined> {
	if (!jobRole(record.role)?.readOnly) {
		return undefined;
	}
	// A check that throws would reject every end of the job (finalizeJob), so what it could not read is unproven instead.
	return comparedState(jobDir, record).catch((error: unknown): Effect => unprovenEffect(failureWords(error)));
}

/** `readOnlyEffect` of a read-only role's job: its start state against the state of its worktree now. */
async function comparedState(jobDir: string, record: Pick<JobRecord, "role" | "worktree">): Promise<Effect> {
	const start = await readStartState(jobDir);
	if (typeof start === "string") {
		return unprovenEffect(start);
	}
	const worktree = record.worktree ?? "";
	const now = takenState(worktree, start.branch?.name);
	if (typeof now === "string") {
		return unprovenEffect(`the worktree ${worktree} cannot be read: ${now}`);
	}
	const changed = difference(start, now);
	return changed === null ? { kind: "same" } : { kind: "changed", detail: changed };
}

/** The start state the job folder `parentDir` holds, as the bytes a continuation publishes; undefined for none. */
export function carriedStartState(parentDir: string): Uint8Array | undefined {
	const file = join(parentDir, START_STATE_FILE);
	return existsSync(file) ? readFileSync(file) : undefined;
}

/**
 * The branch the job owns: its record's, except a reviewer's, whose branch names its candidate while its worktree is
 * detached at it, so its HEAD stands for it (R-045 Decision 11).
 */
function ownBranch(record: Pick<JobRecord, "role" | "branch">): string | undefined {
	return record.role === "reviewer" ? undefined : (record.branch ?? undefined);
}

/**
 * `startState` of `worktree`, or the words of the failure that kept it from being read: git's, or a listed path's, so
 * a state that cannot be read ends the job before its engine at the start and is unproven at the end (Decision 12).
 */
function takenState(worktree: string, branch: string | undefined): StartState | string {
	try {
		return startState(worktree, branch);
	} catch (error) {
		return failureWords(error);
	}
}

/**
 * The effect of a check that could not read `words`: `unproven: ` and the words escaped as the log escapes text
 * (`shownField`), as a difference's paths are (R-045 Decision 18 G1). An error's words can hold a path the job chose,
 * and the detail reaches the job's failure, its log and the `limen stop` line, so no newline or control character in
 * it adds a line to what the coordinator reads.
 */
function unprovenEffect(words: string): Effect {
	return { kind: "unproven", detail: `unproven: ${shownField(words)}` };
}

/** The words of a failure: an error's message, or the thrown value as text. */
function failureWords(error: unknown): string {
	return error instanceof Error ? error.message : String(error);
}

/**
 * The content of the listed path `file` as `ListedPath` names it. Each file is read in chunks through one guarded
 * descriptor, so a large file takes no more memory than a chunk and a path that became a pipe never blocks the read.
 */
function contentHash(file: string): string {
	const stats = lstatSync(file, { throwIfNoEntry: false });
	if (stats === undefined) {
		return "missing";
	}
	if (stats.isSymbolicLink()) {
		return `link:${createHash("sha256").update(readlinkSync(file)).digest("hex")}`;
	}
	if (!stats.isFile()) {
		return stats.isDirectory() ? "directory" : "special";
	}
	const descriptor = openSync(file, HASH_FLAGS);
	try {
		if (!fstatSync(descriptor).isFile()) {
			return "special";
		}
		const hash = createHash("sha256");
		const chunk = Buffer.alloc(HASH_CHUNK);
		for (let read = readSync(descriptor, chunk); read > 0; read = readSync(descriptor, chunk)) {
			hash.update(chunk.subarray(0, read));
		}
		return hash.digest("hex");
	} finally {
		closeSync(descriptor);
	}
}

/** The start state of the job folder `jobDir`, or why it cannot be read: missing, unreadable or damaged (BAD_DATA). */
async function readStartState(jobDir: string): Promise<StartState | string> {
	const file = join(jobDir, START_STATE_FILE);
	const read = await readFile(file, "utf8").then(
		(text) => ({ text }),
		(error: unknown) => ({
			unread: hasCode(error, "ENOENT") ? `${file} is missing` : `${file} cannot be read: ${error}`,
		}),
	);
	if ("unread" in read) {
		return read.unread;
	}
	const state = parseJson(file, read.text, startStateOf);
	return state instanceof LimenError ? state.message : state;
}

/** The first 12 hex digits of a commit, or `none` for a branch that does not exist. */
function shortTip(commit: string | null): string {
	return commit === null ? "none" : commit.slice(0, 12);
}

/**
 * The paths whose entry of `git status` or whose content differs between `start` and `now`, each once: those of an
 * entry that is new, then those of one that is gone.
 */
function statusChanges(start: readonly ListedPath[], now: readonly ListedPath[]): readonly string[] {
	const key = (entry: ListedPath) => JSON.stringify([entry.code, entry.path, entry.from ?? null, entry.hash]);
	const before = new Set(start.map(key));
	const after = new Set(now.map(key));
	const added = now.filter((entry) => !before.has(key(entry)));
	const gone = start.filter((entry) => !after.has(key(entry)));
	return [...new Set([...added, ...gone].map((entry) => entry.path))];
}

// The validators of the start state (src/boundary.ts), functions so that the order in which the modules load does not
// matter.

function startStateOf(value: unknown, field: string): StartState {
	const fields = object(["head", "branch", "status"])(value, field);
	return {
		head: matching(COMMIT, "a commit id")(fields.get("head"), at(field, "head")),
		branch: nullOr(branchOf)(fields.get("branch"), at(field, "branch")),
		status: arrayOf(statusEntryOf)(fields.get("status"), at(field, "status")),
	};
}
function branchOf(value: unknown, field: string): { readonly name: string; readonly tip: string | null } {
	const fields = object(["name", "tip"])(value, field);
	return {
		name: string(fields.get("name"), at(field, "name")),
		tip: nullOr(matching(COMMIT, "a commit id"))(fields.get("tip"), at(field, "tip")),
	};
}
function statusEntryOf(value: unknown, field: string): ListedPath {
	const fields = object(["code", "path", "from", "hash"])(value, field);
	const entry = {
		code: matching(STATUS_CODE, "a status code of two letters")(fields.get("code"), at(field, "code")),
		path: string(fields.get("path"), at(field, "path")),
		hash: string(fields.get("hash"), at(field, "hash")),
	};
	const from = optional(string)(fields.get("from"), at(field, "from"));
	return from === undefined ? entry : { ...entry, from };
}
