// The one lock module (T-25 (1), A-017, A-018, A-087). A lock is one file whose content is its owner's record (the pid,
// its start time, the boot id, a random token and since when it holds the lock), linked into place whole by
// atomicWrite's exclusive write, so no process ever sees a lock without its owner. An owner is gone when its boot, its
// pid, or the start time under that pid is gone; an owner the system cannot describe is kept. A gone owner's lock is
// taken over under a claim on the record found dead, which is itself a lock of this module, and is moved aside only
// while it still holds that record, so a lock taken after "found dead" is never moved (D-029). A wait is bounded at
// 60 s and ends in LOCK_TIMEOUT, class transient (T-02). Only this file names a lock file: a scan in
// test/structure.test.ts bans the name elsewhere.
import { createHash, randomBytes, randomUUID } from "node:crypto";
import { type FileHandle, mkdir, open, readFile, rm } from "node:fs/promises";
import { dirname, join } from "node:path";
import { setTimeout as delay } from "node:timers/promises";
import { atomicRename, atomicWrite } from "./atomic-write.ts";
import { at, either, matching, numberIn, object, optional, parseJson } from "./boundary.ts";
import { testKnob } from "./config.ts";
import { LimenError } from "./outcome.ts";
import { BOOT_ID, type ProcessQueryOutcome, platform } from "./platform/platform.ts";
import { hasCode } from "./system-error.ts";

/** The longest wait for a lock that a live owner holds (D-056 (2)). */
const WAIT_MS = 60_000;
/** How often a waiting call reads the lock again. */
const CHECK_MS = 25;
/**
 * The age past which a lock folder of an older Limen without its owner file counts as abandoned: that Limen made the
 * folder first and wrote the owner file after it, so a fresh folder may still get its owner.
 */
const UNOWNED_MS = 5_000;
/** Reads of the lock in one attempt: a lock can go between two reads, or be taken over in one, before it is taken. */
const ROUNDS = 3;
/** The largest pid kill(2) takes; a larger number in an owner file is damaged data. */
const MAX_PID = 2_147_483_647;
/**
 * A start time in clock ticks: at most 20 digits, the width of the largest 64-bit count, so a lock file cannot put text
 * of any length into the LOCK_TIMEOUT and LOCK_LOST messages that name it.
 */
const BORN = /^\d{1,20}$/;
const TOKEN = /^[0-9a-f]{32}$/;
const ISO_TIME = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z$/;
const RECORD_FIELDS = ["pid", "born", "bootId", "token", "since"];

/** What a lock guards: a folder, whose lock is `<folder>/.lock`, or a file, whose lock is `<file>.lock`. */
export type Guarded = { readonly folder: string } | { readonly file: string };

/** The owner's record, the whole content of a lock file; `born` and `bootId` are absent when the system gave none. */
export type LockRecord = {
	readonly pid: number;
	/** The owner's start time in clock ticks since boot (`ProcessInfo.born`, `BORN`), which a reused pid lacks. */
	readonly born?: string;
	/** The owner's boot id, in the shape `platform.bootId()` gives (`BOOT_ID`), so a message that names it stays short. */
	readonly bootId?: string;
	/** Random: it names this one holding, so a release and a takeover act only on the lock they read. */
	readonly token: string;
	/** When the owner took the lock, as an ISO time. */
	readonly since: string;
};

/**
 * A step at which a test pauses a call (D-029): `found-dead` after the call found the owner gone and before it takes
 * the lock over, `busy` before each wait on a live owner.
 */
export type LockStep = "found-dead" | "busy";

export type LockOptions = {
	/**
	 * `wait`, the default, waits for a live owner at most 60 s. `skip` makes one attempt, which still takes over an
	 * abandoned lock, and returns undefined while a live owner holds it.
	 */
	readonly mode?: "wait" | "skip";
	/** The permission bits of the lock file before the umask; 0o666 by default, as `atomicWrite` gives. */
	readonly fileMode?: number;
	/** The injection point of the tests (D-029). Limen's own callers never pass it, and no setting does (T-03). */
	readonly pause?: (step: LockStep, lock: string) => Promise<void>;
};

/** What the system says now about an owner's pid: the current boot, the process with that pid, and whether it answers. */
export type Observed = {
	readonly bootId: string | undefined;
	readonly process: ProcessQueryOutcome;
	/** Whether the pid answers signal 0: a process has it, also one of another user. */
	readonly answers: boolean;
};

/** A lock this process holds. */
type Held = { readonly path: string; readonly token: string };

/**
 * What a lock's path holds: a record of this module, a pid of an older Limen (in a file, or in the `owner` file of a
 * folder), or neither (an older Limen's folder without its owner file, or an empty file). `identity` tells this exact
 * lock from any later one at the same path.
 */
type Owned =
	| { readonly form: "record"; readonly record: LockRecord; readonly identity: string }
	| { readonly form: "pid"; readonly pid: number; readonly folder: boolean; readonly identity: string }
	| { readonly form: "unowned"; readonly ageMs: number; readonly folder: boolean; readonly identity: string };

/** A lock that another owner holds, or `undefined` when it changed under every read of the attempt. */
type Busy = { readonly busy: Owned | undefined };

/** The path of the lock of `guarded`; the paths are those of the locks before this module. */
export function lockPath(guarded: Guarded): string {
	return "folder" in guarded ? `${guarded.folder}/.lock` : `${guarded.file}.lock`;
}

/**
 * Runs `operation` while this process holds the lock of `guarded`, then releases it. An error of the operation passes
 * through unchanged; a failed release fails the call.
 */
export function withLock<T>(
	guarded: Guarded,
	operation: () => Promise<T>,
	options: LockOptions & { readonly mode: "skip" },
): Promise<T | undefined>;
export function withLock<T>(
	guarded: Guarded,
	operation: () => Promise<T>,
	options?: LockOptions & { readonly mode?: "wait" },
): Promise<T>;
export function withLock<T>(
	guarded: Guarded,
	operation: () => Promise<T>,
	options: LockOptions = {},
): Promise<T | undefined> {
	return lockedAt(lockPath(guarded), operation, options);
}

/**
 * Whether the owner of a lock is gone (A-017): its pid answers no signal, its boot is not the current one, or the
 * process under its pid has another start time. What the system cannot describe is not gone: a process it reports as
 * unavailable, or one absent from the process list whose pid still answers (another user's, under `hidepid`). Without
 * a boot id on either side, the pid and the start time decide. An older Limen's owner holds only a pid, which is gone
 * only when no process has it (D-056 (3)).
 */
export function ownerGone(owner: LockRecord | number, observed: Observed): boolean {
	if (!observed.answers) {
		return true;
	}
	if (typeof owner === "number") {
		return false;
	}
	const otherBoot = owner.bootId !== undefined && observed.bootId !== undefined && owner.bootId !== observed.bootId;
	const running = observed.process;
	const otherStart = running.kind === "present" && owner.born !== undefined && running.process.born !== owner.born;
	return otherBoot || otherStart;
}

/** `withLock` on the lock file `path`: a lock of a caller, or a claim of a takeover. */
async function lockedAt<T>(path: string, operation: () => Promise<T>, options: LockOptions): Promise<T | undefined> {
	const held = await acquire(path, options);
	if (held === undefined) {
		return undefined;
	}
	let value: T;
	try {
		value = await operation();
	} catch (error) {
		await releaseAfterFailure(held);
		throw error;
	}
	// A lock that stays in place blocks every later caller for its wait, so a failed release fails this call.
	await release(held);
	return value;
}

/** Takes the lock `path`: at once when it is free or abandoned, else after its owner releases it (`wait`). */
async function acquire(path: string, options: LockOptions): Promise<Held | undefined> {
	await mkdir(dirname(path), { recursive: true });
	const bound = waitBound();
	const deadline = Date.now() + bound;
	while (true) {
		const tried = await tryToTake(path, options);
		if ("token" in tried) {
			return tried;
		}
		if (options.mode === "skip") {
			return undefined;
		}
		if (Date.now() >= deadline) {
			throw timedOut(path, tried.busy, bound);
		}
		await options.pause?.("busy", path);
		await delay(CHECK_MS);
	}
}

/** One attempt: creates the lock when the path is free, after taking over an abandoned one; else what holds it. */
async function tryToTake(path: string, options: LockOptions): Promise<Held | Busy> {
	let owned: Owned | undefined;
	for (let round = 0; round < ROUNDS; round++) {
		owned = await readLock(path);
		if (owned === undefined) {
			const held = await createLock(path, options.fileMode);
			if (held !== undefined) {
				return held;
			}
			continue;
		}
		if (!(await abandoned(owned))) {
			return { busy: owned };
		}
		await options.pause?.("found-dead", path);
		if (!(await takeOver(path, owned, options.fileMode))) {
			return { busy: owned };
		}
	}
	return { busy: owned };
}

/**
 * Creates the lock `path` with this process's record, whole or not at all: a temp linked onto the path, which fails
 * with EEXIST while a lock is there (R-018). Undefined when another lock is there.
 */
async function createLock(path: string, fileMode: number | undefined): Promise<Held | undefined> {
	const own = await platform.processInfo(process.pid);
	const bootId = platform.bootId();
	const record: LockRecord = {
		pid: process.pid,
		...(own.kind === "present" ? { born: own.process.born } : {}),
		...(bootId === undefined ? {} : { bootId }),
		token: randomBytes(16).toString("hex"),
		since: new Date().toISOString(),
	};
	try {
		await atomicWrite(path, `${JSON.stringify(record)}\n`, {
			exclusive: true,
			...(fileMode === undefined ? {} : { mode: fileMode }),
		});
	} catch (error) {
		if (hasCode(error, "EEXIST")) {
			return undefined;
		}
		throw error;
	}
	return { path, token: record.token };
}

/**
 * Moves the abandoned lock `found` aside (A-087, D-029). The claim `<lock>.takeover.<key>`, keyed by the record found
 * dead, lets one process at a time take that record over, and a claim whose taker died is taken over the same way.
 * Under the claim the lock is read again and moved only while it still holds `found`: a lock taken since then has
 * another token, so it stays. False when another process holds the claim.
 */
async function takeOver(path: string, found: Owned, fileMode: number | undefined): Promise<boolean> {
	const taken = await lockedAt(
		`${path}.takeover.${claimKey(found)}`,
		async () => {
			if ((await readLock(path))?.identity === found.identity) {
				const moved = `${path}.abandoned.${randomUUID()}`;
				await moveAside(path, moved);
				await rm(moved, { recursive: true, force: true });
			}
			return true;
		},
		{ mode: "skip", ...(fileMode === undefined ? {} : { fileMode }) },
	);
	return taken === true;
}

/** Renames the lock to its unique name `moved`; a lock already gone is what the move wanted. */
async function moveAside(path: string, moved: string): Promise<void> {
	try {
		await atomicRename(path, moved);
	} catch (error) {
		if (!hasCode(error, "ENOENT")) {
			throw error;
		}
	}
}

/** The key of a claim on `found`: its token, or a digest of what an older Limen's lock held. */
function claimKey(found: Owned): string {
	if (found.form === "record") {
		return found.record.token;
	}
	return createHash("sha256").update(found.identity).digest("hex").slice(0, 32);
}

/** Removes the lock only while it still holds this holder's token; another lock there stays, and the call fails. */
async function release(held: Held): Promise<void> {
	const now = await readLock(held.path);
	if (now?.form !== "record" || now.record.token !== held.token) {
		const holds = now === undefined ? "it is gone" : `it holds ${describeOwner(now)}`;
		throw new LimenError({
			class: "environment",
			code: "LOCK_LOST",
			message: `${held.path} no longer holds the lock this process took (token ${held.token}): ${holds}; it was removed or replaced while it was held, so it stays as it is`,
			next: "",
		});
	}
	await rm(held.path, { force: true });
}

/**
 * The release after a failed operation. The operation's error is the one the caller needs, so a failed release does not
 * replace it; the lock holds this process's record, so the next caller takes it over once this process has ended.
 */
async function releaseAfterFailure(held: Held): Promise<void> {
	try {
		await release(held);
	} catch {
		// The operation's error follows.
	}
}

/** Whether `owned` is abandoned: an owner that is gone, or an older Limen's folder without an owner past its age. */
async function abandoned(owned: Owned): Promise<boolean> {
	if (owned.form === "unowned") {
		return owned.ageMs > UNOWNED_MS;
	}
	const pid = owned.form === "record" ? owned.record.pid : owned.pid;
	const observed: Observed = {
		bootId: platform.bootId(),
		process: await platform.processInfo(pid),
		answers: platform.processAlive(pid),
	};
	return ownerGone(owned.form === "record" ? owned.record : owned.pid, observed);
}

/**
 * What the lock `path` holds now, or undefined when nothing is there. The file is read through one handle, so its
 * status and its text belong to the same file; a folder is an older Limen's lock, whose owner file is read inside it.
 */
async function readLock(path: string): Promise<Owned | undefined> {
	let handle: FileHandle;
	try {
		handle = await open(path, "r");
	} catch (error) {
		if (hasCode(error, "ENOENT")) {
			return undefined;
		}
		throw error;
	}
	try {
		const info = await handle.stat();
		const folder = info.isDirectory();
		const text = folder ? await ownerText(path) : await handle.readFile("utf8");
		if (text === undefined) {
			return undefined;
		}
		const identity = [folder ? "folder" : "file", info.dev, info.ino, info.mtimeMs, text].join(" ");
		if (text.trim() === "") {
			return { form: "unowned", ageMs: Date.now() - info.mtimeMs, folder, identity };
		}
		const owner = parseJson(folder ? join(path, "owner") : path, text, ownerOf);
		if (owner instanceof LimenError) {
			throw owner;
		}
		if (typeof owner === "number") {
			return { form: "pid", pid: owner, folder, identity };
		}
		return { form: "record", record: owner, identity };
	} finally {
		await handle.close();
	}
}

/** The text of an older Limen's owner file in the lock folder: "" while it is missing, undefined once the folder went. */
async function ownerText(folder: string): Promise<string | undefined> {
	try {
		return await readFile(join(folder, "owner"), "utf8");
	} catch (error) {
		if (hasCode(error, "ENOENT")) {
			return "";
		}
		if (hasCode(error, "ENOTDIR")) {
			return undefined;
		}
		throw error;
	}
}

/** The validator of a lock record (src/boundary.ts, T-27 (2)). */
function recordOf(value: unknown, field: string): LockRecord {
	const fields = object(RECORD_FIELDS)(value, field);
	const pid = numberIn({ integer: true, min: 1, max: MAX_PID })(fields.get("pid"), at(field, "pid"));
	const born = optional(matching(BORN, "a start time of at most 20 digits"))(fields.get("born"), at(field, "born"));
	const bootId = optional(matching(BOOT_ID, "a lower-case UUID"))(fields.get("bootId"), at(field, "bootId"));
	const token = matching(TOKEN, "32 hexadecimal digits")(fields.get("token"), at(field, "token"));
	const since = matching(ISO_TIME, "an ISO time")(fields.get("since"), at(field, "since"));
	return { pid, ...(born === undefined ? {} : { born }), ...(bootId === undefined ? {} : { bootId }), token, since };
}

/**
 * A lock's content: a record of this module, or the bare pid an older Limen wrote, which JSON reads as a number. A
 * function, not a value built at load: src/boundary.ts reaches this module through src/job/job.ts and
 * src/project/series.ts, so either can load first.
 */
function ownerOf(value: unknown, field: string): LockRecord | number {
	return either(recordOf, numberIn({ integer: true, min: 1, max: MAX_PID }))(value, field);
}

/** The wait bound: 60 s, or the test knob `LIMEN_LOCK_WAIT_MS` (src/config.ts) in milliseconds. */
function waitBound(): number {
	const raw = Number(testKnob("LIMEN_LOCK_WAIT_MS"));
	return Number.isFinite(raw) && raw > 0 ? raw : WAIT_MS;
}

/** The end of a wait (T-02: transient, safe to retry): the lock, its owner and what to do, with no next command. */
function timedOut(path: string, owned: Owned | undefined, boundMs: number): LimenError {
	return new LimenError({
		class: "transient",
		code: "LOCK_TIMEOUT",
		message: `${path} is still held after ${boundMs / 1000} s by ${describeOwner(owned)}; ${hint(path, owned)}`,
		next: "",
	});
}

/** The owner of `owned` in words: its pid, start time, boot and since when; for an older Limen's lock, what it lacks. */
function describeOwner(owned: Owned | undefined): string {
	if (owned === undefined) {
		return "an owner that changed under every read";
	}
	if (owned.form === "record") {
		const { pid, born, bootId, since } = owned.record;
		return `pid ${pid} (start time ${born ?? "unknown"} in clock ticks since boot, boot ${bootId ?? "unknown"}, holding it since ${since})`;
	}
	const kind = owned.folder ? "folder" : "file";
	if (owned.form === "pid") {
		return `pid ${owned.pid}, named by a lock ${kind} of an older Limen with no start time or boot id`;
	}
	return `no owner: a lock ${kind} of an older Limen without one, ${Math.round(owned.ageMs / 1000)} s old`;
}

/** What to do about a lock still held: wait for its owner, or, for an older Limen's pid that may be reused, remove it. */
function hint(path: string, owned: Owned | undefined): string {
	if (owned?.form === "record") {
		return `run the command again once that process has ended; see it with ps -p ${owned.record.pid} -o pid,lstart,args`;
	}
	if (owned?.form === "pid") {
		return `a reused pid keeps such a lock: if ps -p ${owned.pid} -o pid,lstart,args shows no Limen command, remove ${path} by hand and run the command again`;
	}
	return "run the command again";
}
