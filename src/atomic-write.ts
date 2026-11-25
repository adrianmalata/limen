import { randomBytes } from "node:crypto";
import { closeSync, fsyncSync, linkSync, openSync, renameSync, rmSync, unlinkSync, writeFileSync } from "node:fs";
import { link, mkdir, open, rename, rm, unlink } from "node:fs/promises";
import { dirname, resolve } from "node:path";

// A-022, T-25 (1): the one module that writes or renames a file. A file written in place is left truncated when the
// disk fills or the writer dies, so every write goes to a temp beside its target, is synced, and replaces the target in
// one rename; the folder is synced after it, so the new name survives a crash. A new folder that a move goes into is
// made here too, with its name synced, since a move is durable only through the folders it ends in. The scan in
// test/structure.test.ts bans the write primitives outside this file.

export type WriteOptions = {
	/** The permission bits of a new file, before the umask; 0o666 by default, as `writeFile` has. */
	readonly mode?: number;
	/** Create the target only when no file has its name: fail with EEXIST, as the `wx` flag does, and change nothing. */
	readonly exclusive?: boolean;
};

/**
 * The temps of this module, `<target>.<pid>.<hex>.tmp`, and those the writers it replaced left with the same shape:
 * the old `atomicWrite` (the time in hex) and the seat registry writer (the time in decimal, whose digits are hex
 * digits too). The old temps of `saveJson`, Picture and the GitHub poller have other names, so this does not match
 * them and nothing sweeps them. A folder reader skips the names it matches.
 */
export const TEMPORARY_NAME = /\.(\d+)\.[0-9a-f]+\.tmp$/;

/** The pid of the process that writes the temp `name`; `undefined` when `TEMPORARY_NAME` does not match `name`. */
export function temporaryWriter(name: string): number | undefined {
	const writer = TEMPORARY_NAME.exec(name)?.[1];
	return writer === undefined ? undefined : Number(writer);
}

/** A new temp beside `target`. The random part keeps two writes of one process in one millisecond apart. */
export function temporaryPath(target: string): string {
	return `${target}.${process.pid}.${randomBytes(8).toString("hex")}.tmp`;
}

/**
 * Writes `data` to `path`: a temp beside it opened `wx` with `mode`, written, synced and closed, then renamed onto
 * `path` (with `exclusive`, linked onto it, which fails with EEXIST like `wx`, and the temp removed), then the folder
 * synced. The rename or the link is the commit point: a failure before it removes the temp and leaves `path` as it was;
 * every failure is rethrown with its code.
 */
export async function atomicWrite(path: string, data: string | Uint8Array, options: WriteOptions = {}): Promise<void> {
	const temporary = temporaryPath(path);
	const handle = await open(temporary, "wx", options.mode ?? 0o666);
	try {
		try {
			await handle.writeFile(data);
			await handle.sync();
		} finally {
			await handle.close();
		}
		if (options.exclusive) {
			await link(temporary, path);
			await unlink(temporary);
		} else {
			await rename(temporary, path);
		}
	} catch (error) {
		await rm(temporary, { force: true });
		throw error;
	}
	await syncFolder(dirname(path));
}

/** `atomicWrite` for a caller that cannot wait: a hook, or code that runs under a lock held by a sync function. */
export function atomicWriteSync(path: string, data: string | Uint8Array, options: WriteOptions = {}): void {
	const temporary = temporaryPath(path);
	const descriptor = openSync(temporary, "wx", options.mode ?? 0o666);
	try {
		try {
			writeFileSync(descriptor, data);
			fsyncSync(descriptor);
		} finally {
			closeSync(descriptor);
		}
		if (options.exclusive) {
			linkSync(temporary, path);
			unlinkSync(temporary);
		} else {
			renameSync(temporary, path);
		}
	} catch (error) {
		rmSync(temporary, { force: true });
		throw error;
	}
	syncFolderSync(dirname(path));
}

/** Renames `from` to `to`, a file or a folder, then syncs the folder of each, so the move survives a crash. */
export async function atomicRename(from: string, to: string): Promise<void> {
	await rename(from, to);
	await syncFolder(dirname(to));
	if (dirname(from) !== dirname(to)) {
		await syncFolder(dirname(from));
	}
}

/**
 * Makes the folder `path` with each missing folder above it, then syncs the folder that holds `path` and the one that
 * holds each folder it made, so a move into `path` that follows survives a crash with every folder it needs (R-031,
 * review round 2, G5). The folders above a holder that was there are left as they are.
 */
export async function makeDurableFolder(path: string): Promise<void> {
	const target = resolve(path);
	// The folder nearest the root that mkdir made; undefined when `target` was there.
	const first = await mkdir(target, { recursive: true });
	for (let made = target; ; made = dirname(made)) {
		await syncFolder(dirname(made));
		if (first === undefined || made === first || made === dirname(made)) {
			return;
		}
	}
}

/** `atomicRename` for a caller that cannot wait. */
export function atomicRenameSync(from: string, to: string): void {
	renameSync(from, to);
	syncFolderSync(dirname(to));
	if (dirname(from) !== dirname(to)) {
		syncFolderSync(dirname(from));
	}
}

/** Syncs the folder `path`, so the names it holds now survive a crash. */
async function syncFolder(path: string): Promise<void> {
	const handle = await open(path, "r");
	try {
		await handle.sync();
	} finally {
		await handle.close();
	}
}

function syncFolderSync(path: string): void {
	const descriptor = openSync(path, "r");
	try {
		fsyncSync(descriptor);
	} finally {
		closeSync(descriptor);
	}
}
