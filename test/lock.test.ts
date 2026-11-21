// src/lock.ts: the one lock module, on locks in temporary folders held by the test process and by child processes.
import assert from "node:assert/strict";
import { spawn } from "node:child_process";
import { once } from "node:events";
import fs, { existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, utimesSync, writeFileSync } from "node:fs";
import { syncBuiltinESMExports } from "node:module";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test, { type TestContext } from "node:test";
import { type Guarded, type LockRecord, lockPath, ownerGone, withLock } from "../src/lock.ts";
import { EXIT_CODES, LimenError } from "../src/outcome.ts";
import { platform } from "../src/platform/platform.ts";
import { withEnvironment } from "./environment.ts";

const LOCK_MODULE = new URL("../src/lock.ts", import.meta.url).href;
/** A pid above every Linux pid_max, so no process ever has it. */
const GONE_PID = 999_999_999;
const TOKEN = "a".repeat(32);
const SINCE = "2026-11-20T00:00:00.000Z";
const OTHER_BOOT = "00000000-0000-4000-8000-000000000000";

/** A new folder in the OS temporary folder, removed after the test `t`. */
function folder(t: TestContext): string {
	const path = mkdtempSync(join(tmpdir(), "limen-lock-"));
	t.after(() => rmSync(path, { recursive: true, force: true }));
	return path;
}

/** The lock of a file `registry` in a new folder. */
function registry(t: TestContext): Guarded {
	return { file: join(folder(t), "registry") };
}

/** The boot id field of a record written on this boot, when the system gives one. */
function thisBoot(): { readonly bootId?: string } {
	const bootId = platform.bootId();
	return bootId === undefined ? {} : { bootId };
}

/** The record the test process would write for itself. */
async function ownRecord(): Promise<LockRecord & { readonly born: string }> {
	const own = await platform.processInfo(process.pid);
	if (own.kind !== "present") {
		throw new Error(`the test process has no identity: ${own.kind}`);
	}
	return { pid: process.pid, born: own.process.born, ...thisBoot(), token: TOKEN, since: SINCE };
}

/** A record on this boot whose pid no process has. */
function deadRecord(token = TOKEN): LockRecord {
	return { pid: GONE_PID, born: "1", ...thisBoot(), token, since: SINCE };
}

function writeRecord(path: string, record: LockRecord): void {
	writeFileSync(path, `${JSON.stringify(record)}\n`);
}

/** The error `run` rejects with, or `undefined` when it settles. */
async function rejection(run: () => Promise<unknown>): Promise<unknown> {
	return run().then(
		() => undefined,
		(error: unknown) => error,
	);
}

type Holder = {
	readonly pid: number;
	/** True from the moment the child holds the lock until `release` is called. */
	readonly holds: boolean;
	/** Lets the child's operation end, then resolves with the child's exit code once it has released and exited. */
	release(): Promise<number | null>;
};

/** A child process that takes the lock of `guarded` through the module and holds it until `release`. */
async function holder(t: TestContext, guarded: Guarded): Promise<Holder> {
	const script = [
		`import { withLock } from ${JSON.stringify(LOCK_MODULE)};`,
		"await withLock(JSON.parse(process.argv[1]), async () => {",
		'\tprocess.stdout.write("holding\\n");',
		"\tprocess.stdin.resume();",
		'\tawait new Promise((resolve) => process.stdin.once("end", resolve));',
		"});",
	].join("\n");
	const child = spawn(process.execPath, ["--input-type=module", "--eval", script, JSON.stringify(guarded)], {
		stdio: ["pipe", "pipe", "pipe"],
	});
	t.after(() => child.kill("SIGKILL"));
	let stderr = "";
	child.stderr.on("data", (chunk) => (stderr += chunk));
	const exited = once(child, "exit").then(([code]) => (typeof code === "number" ? code : null));
	const holding = once(child.stdout, "data");
	const first = await Promise.race([holding.then(() => "holding"), exited.then(() => "exited")]);
	if (first !== "holding" || child.pid === undefined) {
		throw new Error(`the holder did not take the lock: ${stderr}`);
	}
	const state = { pid: child.pid, holds: true };
	return {
		get pid() {
			return state.pid;
		},
		get holds() {
			return state.holds;
		},
		release: async () => {
			state.holds = false;
			child.stdin.end();
			return exited;
		},
	};
}

test("a held lock keeps a second process out until its holder releases it", async (t) => {
	const guarded = registry(t);
	const other = await holder(t, guarded);
	const waiting = Promise.withResolvers<void>();
	const ran: string[] = [];
	const mine = withLock(
		guarded,
		async () => {
			ran.push(other.holds ? "while the other process holds it" : "after its release");
		},
		{
			pause: async (step) => {
				if (step === "busy") {
					waiting.resolve();
				}
			},
		},
	);
	await Promise.race([waiting.promise, mine]);
	assert.equal(await other.release(), 0);
	await mine;
	assert.deepEqual(ran, ["after its release"]);
});

test("a lock file appears only by a link of a file that already holds the owner's whole record", async (t) => {
	const guarded = registry(t);
	const path = lockPath(guarded);
	const promises = fs.promises;
	const originals = {
		link: promises.link,
		rename: promises.rename,
		open: promises.open,
		writeFile: promises.writeFile,
		appendFile: promises.appendFile,
		mkdir: promises.mkdir,
	};
	// What the lock's path held at the moment each call made it exist, and every other call that wrote it.
	const created: string[] = [];
	const wrote: string[] = [];
	const target = (to: unknown) => typeof to === "string" && to === path;
	Reflect.set(promises, "link", async (from: string, to: string) => {
		if (target(to)) {
			created.push(existsSync(path) ? "onto an existing file" : readFileSync(from, "utf8"));
		}
		return originals.link(from, to);
	});
	Reflect.set(promises, "rename", async (from: string, to: string) => {
		if (target(to)) {
			created.push(existsSync(path) ? "onto an existing file" : readFileSync(from, "utf8"));
		}
		return originals.rename(from, to);
	});
	Reflect.set(promises, "open", async (file: string, flags?: string, mode?: number) => {
		if (target(file) && flags !== undefined && flags !== "r") {
			wrote.push(`open ${flags}`);
		}
		return originals.open(file, flags, mode);
	});
	for (const name of ["writeFile", "appendFile", "mkdir"] as const) {
		Reflect.set(promises, name, async (file: unknown, ...rest: unknown[]) => {
			if (target(file)) {
				wrote.push(name);
			}
			return Reflect.apply(originals[name], promises, [file, ...rest]);
		});
	}
	syncBuiltinESMExports();
	t.after(() => {
		Object.assign(promises, originals);
		syncBuiltinESMExports();
	});
	let inside = "";
	await withLock(guarded, async () => {
		inside = readFileSync(path, "utf8");
	});
	assert.deepEqual({ created, wrote }, { created: [inside], wrote: [] });
	const own = await ownRecord();
	const { token, since, ...owner } = JSON.parse(inside);
	assert.deepEqual(owner, { pid: own.pid, born: own.born, ...thisBoot() });
	assert.match(token, /^[0-9a-f]{32}$/);
	assert.ok(Date.parse(since) <= Date.now(), since);
});

test("a lock whose owner pid no process has is taken over", async (t) => {
	const guarded = registry(t);
	writeRecord(lockPath(guarded), deadRecord());
	assert.equal(await withLock(guarded, async () => "ran", { mode: "skip" }), "ran");
});

test("A-017: a lock whose owner pid now runs a process with another start time is taken over", async (t) => {
	const guarded = registry(t);
	const own = await ownRecord();
	writeRecord(lockPath(guarded), { ...own, born: String(Number(own.born) + 1) });
	assert.equal(await withLock(guarded, async () => "ran", { mode: "skip" }), "ran");
});

test("a lock written on another boot is taken over, even when its pid and start time match a live process", async (t) => {
	assert.ok(platform.bootId(), "this system gives a boot id");
	const guarded = registry(t);
	writeRecord(lockPath(guarded), { ...(await ownRecord()), bootId: OTHER_BOOT });
	assert.equal(await withLock(guarded, async () => "ran", { mode: "skip" }), "ran");
});

test("an owner whose process the system reports as unavailable is kept, never taken for gone", () => {
	const record = { ...deadRecord(), pid: 4242, bootId: OTHER_BOOT };
	assert.equal(ownerGone(record, { bootId: OTHER_BOOT, process: { kind: "unavailable" }, answers: true }), false);
});

test("an owner whose pid the process list lacks but which still answers signal 0 is kept, never taken for gone", () => {
	const record = { ...deadRecord(), pid: 4242, bootId: OTHER_BOOT };
	assert.equal(ownerGone(record, { bootId: OTHER_BOOT, process: { kind: "absent" }, answers: true }), false);
});

test("LOCK_TIMEOUT: a wait on a live owner ends after its bound as a transient error that names the lock and its owner", async (t) => {
	withEnvironment(t, { LIMEN_LOCK_WAIT_MS: "100" });
	const guarded = registry(t);
	const other = await holder(t, guarded);
	const record = JSON.parse(readFileSync(lockPath(guarded), "utf8"));
	const error = await rejection(() => withLock(guarded, async () => "ran"));
	assert.equal(await other.release(), 0);
	assert.ok(error instanceof LimenError, String(error));
	assert.deepEqual([error.class, error.code], ["transient", "LOCK_TIMEOUT"]);
	const named = [lockPath(guarded), `pid ${record.pid}`, record.born, record.bootId, record.since];
	assert.deepEqual(
		named.filter((part) => !error.message.includes(part)),
		[],
		error.message,
	);
});

test("skip returns without running the operation while a live owner holds the lock", async (t) => {
	const guarded = registry(t);
	const other = await holder(t, guarded);
	const ran: string[] = [];
	const skipped = await withLock(guarded, async () => ran.push("ran"), { mode: "skip" });
	assert.equal(await other.release(), 0);
	assert.deepEqual([skipped, ran], [undefined, []]);
});

test("LOCK_LOST: a release leaves a lock that no longer holds the holder's token, and fails the call", async (t) => {
	const guarded = registry(t);
	const path = lockPath(guarded);
	const foreign = `${JSON.stringify(deadRecord("b".repeat(32)))}\n`;
	const error = await rejection(() =>
		withLock(guarded, async () => {
			writeFileSync(path, foreign);
		}),
	);
	assert.equal(readFileSync(path, "utf8"), foreign);
	assert.ok(error instanceof LimenError, String(error));
	// T-02: a lock that another process removed or replaced is a failure of the environment, exit 4.
	assert.deepEqual([error.class, error.code, EXIT_CODES[error.class]], ["environment", "LOCK_LOST", 4]);
});

/**
 * Asserts that a call on the lock of a dead owner's record whose `field` holds `value` ends with BAD_DATA naming the
 * lock file and that field, without running its operation and without touching the lock.
 */
async function refusesDamagedRecord(t: TestContext, field: "born" | "bootId", value: string): Promise<void> {
	const guarded = registry(t);
	const path = lockPath(guarded);
	const damaged = `${JSON.stringify({ ...deadRecord(), [field]: value })}\n`;
	writeFileSync(path, damaged);
	const ran: string[] = [];
	const error = await rejection(() => withLock(guarded, async () => ran.push("ran")));
	assert.deepEqual(ran, [], "the operation ran under a lock that took over the damaged record");
	assert.ok(error instanceof LimenError, String(error));
	assert.deepEqual(
		[error.code, "file" in error && error.file, "field" in error && error.field, readFileSync(path, "utf8")],
		["BAD_DATA", path, field, damaged],
	);
}

// A record's boot id and start time go into the LOCK_TIMEOUT and LOCK_LOST messages, so a lock file may hold neither at
// any length: a boot id is the UUID that bootId() gives, and a start time in clock ticks has at most 20 digits.
test("BAD_DATA: a lock record whose bootId is not a UUID ends the call with an error that names the lock file and the field", (t) =>
	refusesDamagedRecord(t, "bootId", `${OTHER_BOOT}${" and more".repeat(100)}`));

test("BAD_DATA: a lock record whose born has more than 20 digits ends the call with an error that names the lock file and the field", (t) =>
	refusesDamagedRecord(t, "born", "1".repeat(21)));

test("a claim on a dead lock whose taker died is taken over too, so the takeover goes on", async (t) => {
	withEnvironment(t, { LIMEN_LOCK_WAIT_MS: "300" });
	const guarded = registry(t);
	writeRecord(lockPath(guarded), deadRecord(TOKEN));
	writeRecord(`${lockPath(guarded)}.takeover.${TOKEN}`, deadRecord("c".repeat(32)));
	assert.equal(await withLock(guarded, async () => "ran"), "ran");
});

// The forms an older Limen wrote (R-019's Migration, D-056 (3)): a folder with an owner file, a file with a pid.
test("a lock folder of an older Limen whose owner file names a live pid is kept", async (t) => {
	const guarded = { folder: folder(t) };
	mkdirSync(lockPath(guarded));
	writeFileSync(join(lockPath(guarded), "owner"), `${process.pid}\n`);
	assert.equal(await withLock(guarded, async () => "ran", { mode: "skip" }), undefined);
	assert.equal(readFileSync(join(lockPath(guarded), "owner"), "utf8"), `${process.pid}\n`);
});

test("a lock folder of an older Limen whose owner file names a gone pid is taken over and removed", async (t) => {
	const guarded = { folder: folder(t) };
	mkdirSync(lockPath(guarded));
	writeFileSync(join(lockPath(guarded), "owner"), `${GONE_PID}\n`);
	assert.equal(await withLock(guarded, async () => "ran", { mode: "skip" }), "ran");
	assert.equal(existsSync(lockPath(guarded)), false);
});

test("a lock file of an older Limen that holds a live pid is kept", async (t) => {
	const guarded = registry(t);
	writeFileSync(lockPath(guarded), `${process.pid}\n`);
	assert.equal(await withLock(guarded, async () => "ran", { mode: "skip" }), undefined);
	assert.equal(readFileSync(lockPath(guarded), "utf8"), `${process.pid}\n`);
});

test("a lock file of an older Limen that holds a gone pid is taken over", async (t) => {
	const guarded = registry(t);
	writeFileSync(lockPath(guarded), `${GONE_PID}\n`);
	assert.equal(await withLock(guarded, async () => "ran", { mode: "skip" }), "ran");
});

test("a lock folder of an older Limen without an owner file is kept while it is fresh", async (t) => {
	const guarded = { folder: folder(t) };
	mkdirSync(lockPath(guarded));
	assert.equal(await withLock(guarded, async () => "ran", { mode: "skip" }), undefined);
	assert.equal(existsSync(lockPath(guarded)), true);
});

test("a lock folder of an older Limen without an owner file is taken over once it is more than 5 s old", async (t) => {
	const guarded = { folder: folder(t) };
	mkdirSync(lockPath(guarded));
	const old = new Date(Date.now() - 6_000);
	utimesSync(lockPath(guarded), old, old);
	assert.equal(await withLock(guarded, async () => "ran", { mode: "skip" }), "ran");
});

test("LOCK_TIMEOUT: a wait on an owner file of an older Limen names the file to remove by hand", async (t) => {
	withEnvironment(t, { LIMEN_LOCK_WAIT_MS: "50" });
	const guarded = registry(t);
	writeFileSync(lockPath(guarded), `${process.pid}\n`);
	const error = await rejection(() => withLock(guarded, async () => "ran"));
	assert.ok(error instanceof LimenError && error.code === "LOCK_TIMEOUT", String(error));
	assert.ok(error.message.includes(`remove ${lockPath(guarded)} by hand`), error.message);
});

// The interleaving of A-087: process A has found the lock dead and pauses there; process B takes the same dead lock
// over and holds it; then A goes on. A lock that an older Limen's takeover saw by its inode and its empty owner could be
// moved away from under B, so two processes held it and one registration was lost.
test("D-029: a call paused after it found the lock dead leaves alone the lock another process took over meanwhile", async (t) => {
	const guarded = registry(t);
	writeRecord(lockPath(guarded), deadRecord());
	const foundDead = Promise.withResolvers<void>();
	const goOn = Promise.withResolvers<void>();
	const waiting = Promise.withResolvers<void>();
	const ran: string[] = [];
	let other: Holder | undefined;
	const first = withLock(
		guarded,
		async () => {
			ran.push(other?.holds ? "while the other process holds it" : "after its release");
		},
		{
			pause: async (step) => {
				if (step === "found-dead") {
					foundDead.resolve();
					await goOn.promise;
				} else {
					waiting.resolve();
				}
			},
		},
	);
	await foundDead.promise;
	other = await holder(t, guarded);
	goOn.resolve();
	await Promise.race([waiting.promise, first]);
	assert.equal(await other.release(), 0, "the other process released its own lock");
	await first;
	assert.deepEqual(ran, ["after its release"]);
});
