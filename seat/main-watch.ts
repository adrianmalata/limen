/**
 * The seat's `main` watcher (A-006, D-110 (1), D-117): a step of the alerts' run (seat/alerts.ts) that keeps, on the
 * alerts' own account, a bare copy of `main` of each watched repository and tells a new commit from a forced update
 * or a deletion of `main` on the remote. The alerts send these as `<project> main:forced <tip>` and
 * `<project> main:deleted <tip>`, and a remote that no run could reach in 15 runs in a row as
 * `<project> main:unwatched`, through their one sender and record of what was sent.
 *
 * What is watched, and where, comes only from root's entries: the folder `/etc/limen/watch` (seat/units.ts), which
 * systemd hands the service as the credentials `watch_<project>.address`, `watch_<project>.key` and
 * `watch_known_hosts` (R-106 Decision 8). The agents' registry only names a registered project with no entry, so
 * nothing the agents' account writes decides it (D-117 (3), z. 14). Each check is decided by git's exit codes alone,
 * and no git call can move the held tip by force or remove it: the tip moves only by `update-ref` with its old value,
 * and each old tip a forced update leaves stays under a kept ref, so the copy loses no history it held (D-117 (4)).
 */
import type { Stats } from "node:fs";
import { lstat, mkdir, readdir, readFile, rm } from "node:fs/promises";
import { join } from "node:path";
import { atomicWrite } from "../src/atomic-write.ts";
import { isIsoTime } from "../src/boundary.ts";
import { hasCode } from "../src/system-error.ts";
import { failed, type Ran, type Runner, why } from "./program.ts";
import { absent } from "./registries.ts";
import { counted, modeOf, reason, SeatFailure, shapeOf } from "./tool-outcome.ts";
import { WATCH_CREDENTIAL } from "./units.ts";

/** The kinds of the watcher's events, which the alerts' one list of events names (seat/alerts.ts). */
export type MainKind = "forced" | "deleted" | "unwatched";
/**
 * An event: its project; its kind; the time of its occurrence, which keys it in the alerts' record of what was sent, so
 * each forced update, deletion or run of failures rings once and a tip rung before rings again (R-106 Decision 9): the
 * kept ref's time of a forced update, the start of a deletion, or the first failed run of `unwatched`; and the held tip
 * its line names, none for `unwatched`.
 */
export type MainEvent = {
	readonly project: string;
	readonly kind: MainKind;
	readonly at: string;
	readonly tip: string | undefined;
};
/** What one watch found: its events, its lines for the run's output, and its local failures, each an exit 4. */
export type Watch = { readonly events: MainEvent[]; readonly said: string[]; readonly problems: string[] };
export type WatchInput = {
	/** The service's credentials folder, `$CREDENTIALS_DIRECTORY`. */
	readonly credentials: string;
	/** The service's state folder, `$STATE_DIRECTORY`; the copies and the counts of failed runs live in its `main/`. */
	readonly state: string;
	/** Where git and ssh are found. */
	readonly path: string | undefined;
	readonly run: Runner;
	/** The time of this run: a kept ref's name and the start of a run of failures hold it. */
	readonly now: Date;
	/** The base names of the projects the agents' registries hold, which only the line of a missing entry reads. */
	readonly registered: readonly string[];
};

/** The characters of a tip that an alert and the run's output show (D-117 (5), D-084). */
export const TIP_CHARACTERS = 12;
/** The runs in a row that cannot reach a remote before it rings `unwatched` (D-117 (2): D-100's 15 minutes). */
const UNWATCHED_AFTER = 15;
/** A credential of the watch folder is named after the credential, `_`, and the file (R-106 Decision 8 (1)). */
const PREFIX = `${WATCH_CREDENTIAL}_`;
const KNOWN_HOSTS = "known_hosts";
/** A project's name, its folder's base name: the name of its entry files and of its copy and its count. */
const PROJECT = /^[A-Za-z0-9][A-Za-z0-9._-]{0,63}$/;
/** A commit id of a SHA-1 or a SHA-256 repository. */
const OID = /^(?:[0-9a-f]{40}|[0-9a-f]{64})$/;
const HELD = "refs/watch/main";
const KEPT = "refs/watch/forced/";
const REMOTE_MAIN = "refs/heads/main";
/** Each git call's own bound (R-106 Decision 8 (5)): a read of the remote's refs, a fetch, a call on the copy alone. */
const LIST_TIMEOUT_MS = 20_000;
const FETCH_TIMEOUT_MS = 60_000;
const LOCAL_TIMEOUT_MS = 10_000;
/** ssh's own bound on the connection, in seconds, below the bound of the git call around it. */
const CONNECT_TIMEOUT_S = 10;
/** The PATH of a run whose environment names none. */
const FALLBACK_PATH = "/usr/bin:/bin";

/** A local failure of the watch, a file or a git call on the copy, which ends the run with exit 4 (T-01, T-02). */
class WatchFailure extends Error {}

type EntryKind = "address" | "key" | "known_hosts";
/** The paths of one project's entry files, each when the folder holds it. */
type ProjectFiles = { readonly address?: string; readonly key?: string };
/** The files of an entry folder by their names after its prefix: each project's, the known hosts, and the others. */
type EntryFolder = {
	readonly projects: ReadonlyMap<string, ProjectFiles>;
	readonly knownHosts: string | undefined;
	readonly unknown: readonly string[];
	readonly paths: readonly string[];
};
/** A watched project: its name, its remote's address, and the paths of its key and of the known hosts. */
type Entry = { readonly project: string; readonly address: string; readonly key: string; readonly knownHosts: string };

/**
 * One run's watch of every entry. A file of the credentials that is no entry file, a missing or malformed entry file,
 * or a missing git or ssh is a problem; the other entries are still watched, each in turn (z. 10).
 */
export async function watchMain(input: WatchInput): Promise<Watch> {
	const watch: Watch = { events: [], said: [], problems: [] };
	let found: EntryFolder;
	try {
		found = await entryFolder(input.credentials, PREFIX);
	} catch (error) {
		watch.problems.push(`cannot watch main: cannot list ${input.credentials}: ${reason(error)}`);
		return watch;
	}
	for (const project of new Set(input.registered.filter((name) => !found.projects.has(name)))) {
		watch.said.push(`main of ${project}: registered, but no watch entry (${PREFIX}${project}.address and .key)`);
	}
	for (const path of found.unknown) {
		watch.problems.push(
			`cannot watch main: ${path} is no entry file (<project>.address, <project>.key, ${KNOWN_HOSTS})`,
		);
	}
	if (found.projects.size === 0) {
		return watch;
	}
	const entries = await completeEntries(found, input.credentials, watch.problems);
	if (entries.length === 0 || !toolsRun(input, watch.problems)) {
		return watch;
	}
	const folder = await copiesFolder(input, watch);
	if (folder === undefined) {
		return watch;
	}
	for (const entry of entries) {
		await asProblem(watch.problems, `cannot watch main of ${entry.project}`, () =>
			watchProject(entry, input, folder, watch),
		);
	}
	return watch;
}

/** `work`'s value, or undefined once its watch failure is a problem after `context`; any other error goes on. */
async function asProblem<T>(problems: string[], context: string, work: () => Promise<T>): Promise<T | undefined> {
	try {
		return await work();
	} catch (error) {
		if (!(error instanceof WatchFailure)) {
			throw error;
		}
		problems.push(`${context}: ${error.message}`);
		return undefined;
	}
}

/** The files of `folder` whose names start with `prefix`, each by what its name says it is. */
async function entryFolder(folder: string, prefix: string): Promise<EntryFolder> {
	const names = (await readdir(folder)).filter((name) => name.startsWith(prefix)).sort();
	const projects = new Map<string, ProjectFiles>();
	const unknown: string[] = [];
	let knownHosts: string | undefined;
	for (const name of names) {
		const path = join(folder, name);
		const named = entryName(name.slice(prefix.length));
		if (named === undefined) {
			unknown.push(path);
		} else if (named.kind === "known_hosts") {
			knownHosts = path;
		} else {
			const files = projects.get(named.project) ?? {};
			projects.set(named.project, named.kind === "address" ? { ...files, address: path } : { ...files, key: path });
		}
	}
	return { projects, knownHosts, unknown, paths: names.map((name) => join(folder, name)) };
}

/** What the file name `name` of an entry folder names: a project's address or key, the known hosts, or nothing. */
function entryName(
	name: string,
): { readonly kind: "address" | "key"; readonly project: string } | { readonly kind: "known_hosts" } | undefined {
	if (name === KNOWN_HOSTS) {
		return { kind: "known_hosts" };
	}
	const dot = name.lastIndexOf(".");
	const [project, suffix] = [name.slice(0, dot), name.slice(dot + 1)];
	return dot > 0 && PROJECT.test(project) && (suffix === "address" || suffix === "key")
		? { kind: suffix, project }
		: undefined;
}

/** Why the text of an entry file of `kind` is not well formed; undefined when it is. */
function malformed(kind: EntryKind, text: string): string | undefined {
	if (kind === "address") {
		const line = addressOf(text);
		return line === "" || /[\s\p{Cc}]/u.test(line) || line.startsWith("-")
			? "holds no address: one line of one word that does not start with -"
			: undefined;
	}
	if (kind === "key") {
		return /^-----BEGIN [A-Z0-9 ]*PRIVATE KEY-----\r?\n/.test(text)
			? undefined
			: "holds no private key: its first line is no line -----BEGIN … PRIVATE KEY-----";
	}
	const lines = text.split("\n").map((line) => line.trim());
	return lines.some((line) => line !== "" && !line.startsWith("#")) ? undefined : "holds no host key line";
}

/** The address an address file holds: its one line, without the newline that ends it. */
const addressOf = (text: string) => (text.endsWith("\n") ? text.slice(0, -1) : text);

/**
 * The complete and well-formed entries of `found` (R-106 Decision 8 (4)): each project with its address and its key,
 * and the known hosts beside them. A file that is missing, no regular file or malformed is a problem, and its project
 * is not watched; with no known hosts no project is.
 */
async function completeEntries(found: EntryFolder, credentials: string, problems: string[]): Promise<Entry[]> {
	const knownHosts = join(credentials, `${PREFIX}${KNOWN_HOSTS}`);
	const hosts = await asProblem(problems, "cannot watch main", () =>
		entryText(found.knownHosts, knownHosts, "known_hosts"),
	);
	if (hosts === undefined) {
		return [];
	}
	const entries: Entry[] = [];
	for (const [project, files] of found.projects) {
		const entry = await asProblem(problems, `cannot watch main of ${project}`, async () => {
			const expected = (kind: EntryKind) => join(credentials, `${PREFIX}${project}.${kind}`);
			const address = addressOf(await entryText(files.address, expected("address"), "address"));
			await entryText(files.key, expected("key"), "key");
			return { project, address, key: files.key ?? expected("key"), knownHosts };
		});
		if (entry !== undefined) {
			entries.push(entry);
		}
	}
	return entries;
}

/** The text of the entry file at `path`, a regular file well formed for `kind`; `expected` names a missing one. */
async function entryText(path: string | undefined, expected: string, kind: EntryKind): Promise<string> {
	if (path === undefined) {
		throw new WatchFailure(`${expected} is missing`);
	}
	const info = await statOf(path);
	if (!info?.isFile()) {
		throw new WatchFailure(`${path} is no regular file`);
	}
	let text: string;
	try {
		text = await readFile(path, "utf8");
	} catch (error) {
		throw new WatchFailure(`cannot read ${path}: ${reason(error)}`);
	}
	const wrong = malformed(kind, text);
	if (wrong !== undefined) {
		throw new WatchFailure(`${path} ${wrong}`);
	}
	return text;
}

/** What is at `path`, not following a link; undefined when nothing is. */
async function statOf(path: string): Promise<Stats | undefined> {
	try {
		return await lstat(path);
	} catch (error) {
		if (absent(error)) {
			return undefined;
		}
		throw new WatchFailure(`cannot read ${path}: ${reason(error)}`);
	}
}

/** Whether git and ssh run (T-12); a seat without one fails every entry alike, so it is named once. */
function toolsRun(input: WatchInput, problems: string[]): boolean {
	for (const argv of [
		["git", "--version"],
		["ssh", "-V"],
	] as const) {
		const ran = input.run(argv, { env: { PATH: input.path ?? FALLBACK_PATH }, timeoutMs: LOCAL_TIMEOUT_MS });
		if (failed(ran)) {
			problems.push(`cannot watch main: ${argv[0]} cannot run (${why(ran)})`);
			return false;
		}
	}
	return true;
}

/** The folder of the copies and the counts, made when absent; undefined once a failure to make it is a problem. */
async function copiesFolder(input: WatchInput, watch: Watch): Promise<string | undefined> {
	const folder = join(input.state, "main");
	try {
		await mkdir(folder, { recursive: true, mode: 0o700 });
		return folder;
	} catch (error) {
		watch.problems.push(`cannot watch main: cannot make ${folder}: ${reason(error)}`);
		return undefined;
	}
}

/**
 * One project's copy: its bare repository, its count of failed runs, the start of a deletion of `main` it still sees,
 * and how git reaches its remote.
 */
type Copy = {
	readonly bare: string;
	readonly failures: string;
	readonly deleted: string;
	readonly address: string;
	readonly run: Runner;
	readonly env: NodeJS.ProcessEnv;
};
/** What the remote's `main` is: a tip that is in the copy now, gone, or out of reach, with why. */
type Reach =
	| { readonly kind: "tip"; readonly tip: string }
	| { readonly kind: "gone" }
	| { readonly kind: "unreachable"; readonly why: string };
/** The runs in a row that could not reach a remote, and the time the first of them ran. */
type Streak = { readonly runs: number; readonly since: string };
/** An old tip the copy keeps after a forced update, and the time its kept ref names. */
type Kept = { readonly at: string; readonly tip: string };

/**
 * One run's watch of `entry`: its copy, made on the first run; the remote's `main`; the change of the held tip; and the
 * events of the copy's state. Each kept ref raises `forced` and a deletion still seen raises `deleted` in every run,
 * each under the time of its occurrence, and the alerts' record of what was sent sends each occurrence once, so a send
 * that failed goes out on a later run (R-106 Decision 8 (3), 9).
 */
async function watchProject(entry: Entry, input: WatchInput, folder: string, watch: Watch): Promise<void> {
	const copy = copyOf(entry, input, folder);
	const streak = await readStreak(copy.failures);
	const deletion = await readDeletion(copy.deleted);
	await makeCopy(copy);
	const held = heldTip(copy);
	const kept = keptTips(copy);
	const remote = reach(copy, held);
	const say = (line: string) => watch.said.push(`main of ${entry.project}: ${line}`);
	const event = (kind: MainKind, at: string, tip?: string): MainEvent => ({ project: entry.project, kind, at, tip });
	const current: MainEvent[] = [];
	if (remote.kind === "unreachable") {
		const failures = await countFailure(copy, streak, input.now);
		const rings = failures.runs >= UNWATCHED_AFTER;
		const since = rings ? `; unwatched since ${failures.since}` : "";
		say(`the remote cannot be reached, ${counted(failures.runs, "run")} in a row (${remote.why})${since}`);
		current.push(...(rings ? [event("unwatched", failures.since)] : []));
	} else {
		await removeState(copy.failures, streak);
		if (remote.kind === "gone") {
			say(held === undefined ? "the remote has no main, and no tip is held yet" : `gone; ${short(held)} stays held`);
			if (held !== undefined) {
				current.push(event("deleted", deletion ?? (await startDeletion(copy, input.now)), held));
			}
		} else {
			await removeState(copy.deleted, deletion);
			const moved = follow(copy, held, remote.tip, input.now);
			say(moved.said);
			kept.push(...(moved.kept === undefined ? [] : [moved.kept]));
		}
	}
	watch.events.push(...kept.map(({ at, tip }) => event("forced", at, tip)), ...current);
}

/** The copy of `entry` in `folder`, reached with the entry's key alone. */
function copyOf(entry: Entry, input: WatchInput, folder: string): Copy {
	return {
		bare: join(folder, `${entry.project}.git`),
		failures: join(folder, `${entry.project}.failures`),
		deleted: join(folder, `${entry.project}.deleted`),
		address: entry.address,
		run: input.run,
		env: gitEnvironment(entry, input.path),
	};
}

/** git's whole environment for `entry`: so no agent, no system or user configuration and no prompt reach it. */
function gitEnvironment(entry: Entry, path: string | undefined): NodeJS.ProcessEnv {
	return {
		PATH: path ?? FALLBACK_PATH,
		GIT_CONFIG_NOSYSTEM: "1",
		GIT_CONFIG_GLOBAL: "/dev/null",
		GIT_TERMINAL_PROMPT: "0",
		GIT_SSH_COMMAND: sshCommand(entry),
	};
}

/**
 * The ssh that git runs for `entry`: the entry's key alone, no agent and no configuration file, the pinned host keys
 * alone, never asking and never writing them, and a bound on the connection. git runs it through the shell, so each
 * path is one quoted word.
 */
function sshCommand(entry: Entry): string {
	return [
		"ssh -F /dev/null",
		`-i ${shellWord(entry.key)}`,
		"-o IdentitiesOnly=yes -o IdentityAgent=none",
		`-o ${shellWord(`UserKnownHostsFile=${entry.knownHosts}`)}`,
		"-o GlobalKnownHostsFile=/dev/null -o StrictHostKeyChecking=yes -o UpdateHostKeys=no",
		`-o BatchMode=yes -o ConnectTimeout=${CONNECT_TIMEOUT_S}`,
	].join(" ");
}

/** `text` as one word of the shell, in single quotes. */
const shellWord = (text: string) => `'${text.replaceAll("'", `'\\''`)}'`;
const short = (tip: string) => tip.slice(0, TIP_CHARACTERS);
/** The last line of `text`, which says why git failed. */
const lastLine = (text: string) => text.trim().split("\n").at(-1) ?? text;

/** One git call on the copy, with its bound. */
function git(copy: Copy, args: readonly string[], timeoutMs = LOCAL_TIMEOUT_MS): Ran {
	return copy.run(["git", `--git-dir=${copy.bare}`, ...args], { env: copy.env, timeoutMs });
}

/** A git call on the copy that must succeed; its output. */
function gitOutput(copy: Copy, args: readonly string[]): string {
	const ran = git(copy, args);
	if (failed(ran)) {
		throw new WatchFailure(`git ${args[0]} failed: ${lastLine(why(ran))}`);
	}
	return ran.stdout;
}

/** The copy as a bare repository with no working tree and no templates, made on the first run. */
async function makeCopy(copy: Copy): Promise<void> {
	const info = await statOf(copy.bare);
	if (info?.isDirectory()) {
		return;
	}
	if (info !== undefined) {
		throw new WatchFailure(`${copy.bare} is no folder`);
	}
	// `--template=`: git copies no file of the seat's template folder, so no hook lands in the copy for the watcher's git
	// calls to run (`update-ref` runs the `reference-transaction` hook).
	const ran = copy.run(["git", "init", "--bare", "--quiet", "--template=", copy.bare], {
		env: copy.env,
		timeoutMs: LOCAL_TIMEOUT_MS,
	});
	if (failed(ran)) {
		throw new WatchFailure(`git init failed: ${lastLine(why(ran))}`);
	}
}

/** The tip the copy holds, undefined before its first hold. */
function heldTip(copy: Copy): string | undefined {
	const ran = git(copy, ["rev-parse", "--verify", "--quiet", HELD]);
	if (ran.error === undefined && ran.status === 1) {
		return undefined;
	}
	const tip = ran.stdout.trim();
	if (failed(ran) || !OID.test(tip)) {
		throw new WatchFailure(`git rev-parse ${HELD} failed: ${lastLine(why(ran))}`);
	}
	return tip;
}

/** The old tips the copy keeps after forced updates, each with its kept ref's time, oldest first. */
function keptTips(copy: Copy): Kept[] {
	const lines = gitOutput(copy, ["for-each-ref", "--format=%(objectname) %(refname)", KEPT]).split("\n");
	return lines.filter(Boolean).map((line) => {
		const [tip = "", ref = ""] = line.split(" ");
		if (!OID.test(tip) || !ref.startsWith(KEPT)) {
			throw new WatchFailure(`git for-each-ref ${KEPT} named no kept commit: ${line}`);
		}
		return { at: ref.slice(KEPT.length), tip };
	});
}

/**
 * The remote's `main`, decided by exit codes (R-106 Decision 1): `ls-remote --exit-code` exits 2 when it is gone and
 * 0 with its tip, and any other end is out of reach. A tip the copy lacks is fetched as an object, with no ref, no
 * tag and no FETCH_HEAD written, so no fetch can move the held tip; a fetch that fails is out of reach too.
 */
function reach(copy: Copy, held: string | undefined): Reach {
	const listed = git(copy, ["ls-remote", "--exit-code", copy.address, REMOTE_MAIN], LIST_TIMEOUT_MS);
	if (listed.error === undefined && listed.status === 2) {
		return { kind: "gone" };
	}
	if (failed(listed)) {
		return { kind: "unreachable", why: lastLine(why(listed)) };
	}
	const line = listed.stdout.split("\n").find((each) => each.endsWith(`\t${REMOTE_MAIN}`));
	const tip = line?.slice(0, line.indexOf("\t"));
	if (tip === undefined) {
		return { kind: "gone" };
	}
	if (!OID.test(tip)) {
		return { kind: "unreachable", why: `ls-remote named no commit for ${REMOTE_MAIN}` };
	}
	if (tip === held) {
		return { kind: "tip", tip };
	}
	// `--no-auto-gc`: after a fetch git may start `gc --auto` in the background, which would outlive the run of the
	// oneshot service, and systemd ends every process of the service when the run ends, so the gc would stop midway.
	const fetch = ["fetch", "--quiet", "--no-tags", "--no-write-fetch-head", "--no-auto-gc", "--refmap="];
	const fetched = git(copy, [...fetch, copy.address, tip], FETCH_TIMEOUT_MS);
	return failed(fetched) ? { kind: "unreachable", why: lastLine(why(fetched)) } : { kind: "tip", tip };
}

/**
 * Moves the held tip to the remote's `tip`: the first hold, which raises nothing; a fast-forward; or a forced update,
 * whose old tip first goes to a kept ref named by the run's time (D-117 (4)). Returns the run's line and a kept tip.
 */
function follow(copy: Copy, held: string | undefined, tip: string, now: Date): { said: string; kept?: Kept } {
	if (held === undefined) {
		update(copy, HELD, tip, "");
		return { said: `holds main at ${short(tip)}` };
	}
	if (held === tip) {
		return { said: `at ${short(tip)}, as held` };
	}
	const ancestor = git(copy, ["merge-base", "--is-ancestor", held, tip]);
	if (ancestor.error === undefined && ancestor.status === 0) {
		update(copy, HELD, tip, held);
		return { said: `followed from ${short(held)} to ${short(tip)}` };
	}
	if (ancestor.error !== undefined || ancestor.status !== 1) {
		throw new WatchFailure(`git merge-base failed: ${lastLine(why(ancestor))}`);
	}
	// The ISO time's basic form, since a ref name holds no `:`.
	const at = now.toISOString().replaceAll("-", "").replaceAll(":", "");
	update(copy, `${KEPT}${at}`, held, "");
	update(copy, HELD, tip, held);
	return {
		said: `forced from ${short(held)} to ${short(tip)}; the old tip stays as ${KEPT}${at}`,
		kept: { at, tip: held },
	};
}

/** Sets `ref` to `value` only while it holds `old`, or while it does not exist when `old` is empty (git update-ref). */
function update(copy: Copy, ref: string, value: string, old: string): void {
	gitOutput(copy, ["update-ref", ref, value, old]);
}

/** The text of the copy's state file at `path`; undefined when there is none. */
async function stateText(path: string): Promise<string | undefined> {
	try {
		return await readFile(path, "utf8");
	} catch (error) {
		if (absent(error)) {
			return undefined;
		}
		throw new WatchFailure(`cannot read ${path}: ${reason(error)}`);
	}
}

/** Writes `text` as the copy's state file at `path`, which only the service reads. */
async function writeState(path: string, text: string): Promise<void> {
	try {
		await atomicWrite(path, text, { mode: 0o600 });
	} catch (error) {
		throw new WatchFailure(`cannot write ${path}: ${reason(error)}`);
	}
}

/** Removes the copy's state file at `path`, which this run read as `held`; with none read, there is none to remove. */
async function removeState(path: string, held: unknown): Promise<void> {
	if (held === undefined) {
		return;
	}
	try {
		await rm(path, { force: true });
	} catch (error) {
		throw new WatchFailure(`cannot remove ${path}: ${reason(error)}`);
	}
}

/** The count of failed runs at `path`, `<runs> <ISO time of the first>`; undefined when there is none. */
async function readStreak(path: string): Promise<Streak | undefined> {
	const text = await stateText(path);
	if (text === undefined) {
		return undefined;
	}
	const [runs, since, ...rest] = text.trim().split(" ");
	const count = Number(runs);
	if (rest.length > 0 || !Number.isSafeInteger(count) || count < 1 || since === undefined || !isIsoTime(since)) {
		throw new WatchFailure(`${path} holds no count of failed runs; remove it, and the count starts again`);
	}
	return { runs: count, since };
}

/** One more failed run in a row, the first of a new run of failures when there is no count. */
async function countFailure(copy: Copy, streak: Streak | undefined, now: Date): Promise<Streak> {
	const next = { runs: (streak?.runs ?? 0) + 1, since: streak?.since ?? now.toISOString() };
	await writeState(copy.failures, `${next.runs} ${next.since}\n`);
	return next;
}

/**
 * The start of the deletion of the remote's `main` at `path`, an ISO time, which keys its `deleted` event (R-106
 * Decision 9); undefined while no run saw `main` gone since a run last saw it.
 */
async function readDeletion(path: string): Promise<string | undefined> {
	const text = await stateText(path);
	if (text === undefined) {
		return undefined;
	}
	const since = text.trim();
	if (!isIsoTime(since)) {
		throw new WatchFailure(`${path} holds no start of a deletion; remove it, and a deletion still seen rings again`);
	}
	return since;
}

/** A deletion of `main` first seen in this run: its start, kept until a run sees `main` again. */
async function startDeletion(copy: Copy, now: Date): Promise<string> {
	const since = now.toISOString();
	await writeState(copy.deleted, `${since}\n`);
	return since;
}

/**
 * Root's check of the watch folder at the install (R-106 Decision 8 (1), (4)), as the topic file is checked: when it
 * is there, a folder of root's with mode 0700, whose every file is a well-formed entry file of root's with mode 0600,
 * no link and no folder (systemd skips a link and loads no folder of a folder); each project with its address and
 * its key, and the known hosts beside them. Returns the line that says what it checked; a refusal exits 1, and a read
 * that fails 4.
 */
export async function checkWatchFolder(folder: string, rootUid: number, again: string): Promise<string> {
	const fix = `as root, make ${folder} root's with mode 0700 and each entry file in it root's with mode 0600 (install -o root -g root -m 0600), then ${again}`;
	const refuse = (what: string) => new SeatFailure(1, `refused: ${what}`, fix);
	const info = await installStat(folder, again);
	if (info === undefined) {
		return `no watch folder ${folder} yet: the install makes it, and no main is watched until root writes its entries`;
	}
	if (!info.isDirectory() || info.uid !== rootUid || modeOf(info) !== "0700") {
		throw refuse(
			`the watch folder ${folder} must be a folder of root's with mode 0700; it is ${shapeOf(info, rootUid)}`,
		);
	}
	let found: EntryFolder;
	try {
		found = await entryFolder(folder, "");
	} catch (error) {
		throw new SeatFailure(4, `cannot read the watch folder ${folder}: ${reason(error)}`, `fix it, then ${again}`);
	}
	for (const path of found.paths) {
		const file = await installStat(path, again);
		if (file === undefined || !file.isFile() || file.uid !== rootUid || modeOf(file) !== "0600") {
			const shape = file === undefined ? "gone" : shapeOf(file, rootUid);
			throw refuse(`the watch entry file ${path} must be a regular file of root's with mode 0600; it is ${shape}`);
		}
	}
	await checkEntries(found, folder, refuse, again);
	return found.projects.size === 0
		? `no watch entry in ${folder}: no main is watched`
		: `checked ${counted(found.projects.size, "watch entry", "watch entries")} in ${folder}`;
}

/** The install's check of the names and the texts of the files of `found`, whose folder is `folder`. */
async function checkEntries(
	found: EntryFolder,
	folder: string,
	refuse: (what: string) => SeatFailure,
	again: string,
): Promise<void> {
	const [unknown] = found.unknown;
	if (unknown !== undefined) {
		throw refuse(`${unknown} is no entry file: <project>.address, <project>.key or ${KNOWN_HOSTS}`);
	}
	const texts: [string, EntryKind][] = [];
	for (const [project, files] of found.projects) {
		for (const kind of ["address", "key"] as const) {
			const path = files[kind];
			if (path === undefined) {
				throw refuse(`the watch entry of ${project} has no ${join(folder, `${project}.${kind}`)}`);
			}
			texts.push([path, kind]);
		}
	}
	if (found.projects.size > 0) {
		if (found.knownHosts === undefined) {
			throw refuse(`the watch entries have no ${join(folder, KNOWN_HOSTS)} beside them`);
		}
		texts.push([found.knownHosts, "known_hosts"]);
	}
	for (const [path, kind] of texts) {
		let text: string;
		try {
			text = await readFile(path, "utf8");
		} catch (error) {
			throw new SeatFailure(4, `cannot read ${path}: ${reason(error)}`, `fix it, then ${again}`);
		}
		const wrong = malformed(kind, text);
		if (wrong !== undefined) {
			throw refuse(`the watch entry file ${path} ${wrong}`);
		}
	}
}

/** What is at `path` for root's install, not following a link; undefined when nothing is; a failed read exits 4. */
async function installStat(path: string, again: string): Promise<Stats | undefined> {
	try {
		return await lstat(path);
	} catch (error) {
		if (absent(error)) {
			return undefined;
		}
		throw new SeatFailure(4, `cannot read ${path}: ${reason(error)}`, `fix it, then ${again}`);
	}
}

/**
 * Makes the watch folder, root's with mode 0700, when it is absent, so the source of the service's credential `watch`
 * exists from the first deployment on and a seat with no entries runs as before; whether it made it.
 */
export async function makeWatchFolder(folder: string, again: string): Promise<boolean> {
	try {
		await mkdir(folder, { mode: 0o700 });
		return true;
	} catch (error) {
		if (hasCode(error, "EEXIST")) {
			return false;
		}
		throw new SeatFailure(4, `cannot make the watch folder ${folder}: ${reason(error)}`, `fix it, then ${again}`);
	}
}
