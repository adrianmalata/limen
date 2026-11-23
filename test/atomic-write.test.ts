// src/atomic-write.ts: the one module that writes or renames a file or makes a durable folder, with its temp names, on
// temporary folders.
import assert from "node:assert/strict";
import { chmodSync, mkdirSync, mkdtempSync, readdirSync, readFileSync, rmSync, statSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { basename, dirname, join } from "node:path";
import test, { type TestContext } from "node:test";
import {
	atomicRename,
	atomicRenameSync,
	atomicWrite,
	atomicWriteSync,
	makeDurableFolder,
	TEMPORARY_NAME,
	temporaryPath,
	temporaryWriter,
} from "../src/atomic-write.ts";

/** A new folder in the OS temporary folder, removed after the test `t`. */
function folder(t: TestContext): string {
	const path = mkdtempSync(join(tmpdir(), "limen-atomic-write-"));
	t.after(() => rmSync(path, { recursive: true, force: true }));
	return path;
}

/** The code of the error `run` rejects with, or `undefined` when it settles. */
async function codeOf(run: () => Promise<unknown>): Promise<unknown> {
	return run().then(
		() => undefined,
		(error: unknown) => (error instanceof Error && "code" in error ? error.code : error),
	);
}

/** The code of the error `run` throws, or `undefined` when it returns. */
function syncCodeOf(run: () => unknown): unknown {
	try {
		run();
		return undefined;
	} catch (error) {
		return error instanceof Error && "code" in error ? error.code : error;
	}
}

const root = process.getuid?.() === 0;

test("atomicWrite replaces the target's content and leaves only the target in its folder", async (t) => {
	const dir = folder(t);
	const target = join(dir, "state");
	writeFileSync(target, "running\n");
	await atomicWrite(target, "done\n");
	assert.equal(readFileSync(target, "utf8"), "done\n");
	assert.deepEqual(readdirSync(dir), ["state"]);
});

test("atomicWrite gives a new target the mode it is asked for", async (t) => {
	const target = join(folder(t), "claim.json");
	await atomicWrite(target, "{}\n", { mode: 0o600 });
	assert.equal(statSync(target).mode & 0o777, 0o600);
});

test("an exclusive atomicWrite creates a missing target with its whole content", async (t) => {
	const dir = folder(t);
	await atomicWrite(join(dir, "ready"), Buffer.from("1\n"), { exclusive: true });
	assert.equal(readFileSync(join(dir, "ready"), "utf8"), "1\n");
	assert.deepEqual(readdirSync(dir), ["ready"]);
});

test("an exclusive atomicWrite onto an existing file fails with EEXIST and leaves the file and its folder as they were", async (t) => {
	const dir = folder(t);
	const target = join(dir, "0001");
	writeFileSync(target, "first steer\n");
	const before = statSync(target);
	assert.equal(await codeOf(() => atomicWrite(target, "second steer\n", { exclusive: true })), "EEXIST");
	assert.equal(readFileSync(target, "utf8"), "first steer\n");
	assert.equal(statSync(target).ino, before.ino);
	assert.deepEqual(readdirSync(dir), ["0001"]);
});

test("a failed atomicWrite removes its temp, rethrows the error with its code and leaves the target as it was", async (t) => {
	const dir = folder(t);
	// A rename of a file onto a folder fails, after the temp is written.
	mkdirSync(join(dir, "result", "kept"), { recursive: true });
	assert.equal(await codeOf(() => atomicWrite(join(dir, "result"), "final message\n")), "EISDIR");
	assert.deepEqual(readdirSync(dir), ["result"]);
	assert.deepEqual(readdirSync(join(dir, "result")), ["kept"]);
});

test("atomicWrite syncs the target's folder after the rename, so a folder it cannot open fails the write with EACCES", async (t) => {
	if (root) {
		t.skip("root opens every folder");
		return;
	}
	const dir = join(folder(t), "job");
	mkdirSync(dir);
	// Write and search, but no read: the temp, its rename and the target are allowed; opening the folder is not.
	chmodSync(dir, 0o300);
	try {
		assert.equal(await codeOf(() => atomicWrite(join(dir, "state"), "done\n")), "EACCES");
	} finally {
		chmodSync(dir, 0o700);
	}
	// The rename came first: a sync before it would have failed with no target written.
	assert.equal(readFileSync(join(dir, "state"), "utf8"), "done\n");
	assert.deepEqual(readdirSync(dir), ["state"]);
});

test("atomic writes to one target in the same millisecond do not collide on their temp names", async (t) => {
	const dir = folder(t);
	const target = join(dir, "activity");
	const values = Array.from({ length: 40 }, (_, index) => `tool ${index}\n`);
	await Promise.all(values.map((value) => atomicWrite(target, value)));
	assert.ok(values.includes(readFileSync(target, "utf8")));
	assert.deepEqual(readdirSync(dir), ["activity"]);
});

test("temporaryPath names a sibling of the target that temporaryWriter reads this process's pid from, new on every call", () => {
	const first = temporaryPath("/jobs/a1/state");
	const second = temporaryPath("/jobs/a1/state");
	assert.equal(dirname(first), "/jobs/a1");
	assert.ok(basename(first).startsWith("state."), first);
	assert.ok(TEMPORARY_NAME.test(first), first);
	assert.equal(temporaryWriter(basename(first)), process.pid);
	assert.notEqual(first, second);
});

test("temporaryWriter reads the writer's pid of an older atomicWrite temp and none from other names", () => {
	assert.equal(temporaryWriter("state.4242.19a3b2c4d5e.tmp"), 4242);
	assert.equal(temporaryWriter("projects.17.1763600000000.tmp"), 17);
	assert.equal(temporaryWriter("group-owner.json.1b4e28ba-2fa1-11d2-883f-0016d3cca427.tmp"), undefined);
	assert.equal(temporaryWriter("activity.tmp"), undefined);
	assert.equal(temporaryWriter("state"), undefined);
});

test("atomicWriteSync replaces the target's content and leaves only the target in its folder", (t) => {
	const dir = folder(t);
	const target = join(dir, "result");
	writeFileSync(target, "first handoff\n");
	atomicWriteSync(target, "second handoff\n");
	assert.equal(readFileSync(target, "utf8"), "second handoff\n");
	assert.deepEqual(readdirSync(dir), ["result"]);
});

test("an exclusive atomicWriteSync onto an existing file fails with EEXIST and leaves the file and its folder as they were", (t) => {
	const dir = folder(t);
	const target = join(dir, "ready");
	writeFileSync(target, "1\n");
	const before = statSync(target);
	assert.equal(
		syncCodeOf(() => atomicWriteSync(target, "2\n", { exclusive: true })),
		"EEXIST",
	);
	assert.equal(readFileSync(target, "utf8"), "1\n");
	assert.equal(statSync(target).ino, before.ino);
	assert.deepEqual(readdirSync(dir), ["ready"]);
});

test("atomicWriteSync gives a new target the mode it is asked for", (t) => {
	const target = join(folder(t), "rule.json");
	atomicWriteSync(target, "{}\n", { mode: 0o600 });
	assert.equal(statSync(target).mode & 0o777, 0o600);
});

test("an exclusive atomicWriteSync creates a missing target with its whole content", (t) => {
	const dir = folder(t);
	atomicWriteSync(join(dir, "ended.3"), Buffer.from("2026-11-20 done\n"), { exclusive: true });
	assert.equal(readFileSync(join(dir, "ended.3"), "utf8"), "2026-11-20 done\n");
	assert.deepEqual(readdirSync(dir), ["ended.3"]);
});

test("a failed atomicWriteSync removes its temp, rethrows the error with its code and leaves the target as it was", (t) => {
	const dir = folder(t);
	mkdirSync(join(dir, "owner", "kept"), { recursive: true });
	assert.equal(
		syncCodeOf(() => atomicWriteSync(join(dir, "owner"), "4242\n")),
		"EISDIR",
	);
	assert.deepEqual(readdirSync(dir), ["owner"]);
	assert.deepEqual(readdirSync(join(dir, "owner")), ["kept"]);
});

test("atomicWriteSync syncs the target's folder after the rename, so a folder it cannot open fails the write with EACCES", (t) => {
	if (root) {
		t.skip("root opens every folder");
		return;
	}
	const dir = join(folder(t), "claim");
	mkdirSync(dir);
	chmodSync(dir, 0o300);
	try {
		assert.equal(
			syncCodeOf(() => atomicWriteSync(join(dir, "live"), "closed\n")),
			"EACCES",
		);
	} finally {
		chmodSync(dir, 0o700);
	}
	// The rename came first: a sync before it would have failed with no target written.
	assert.equal(readFileSync(join(dir, "live"), "utf8"), "closed\n");
	assert.deepEqual(readdirSync(dir), ["live"]);
});

test("atomicRename moves a folder onto a missing name", async (t) => {
	const dir = folder(t);
	mkdirSync(join(dir, "claims", "0001"), { recursive: true });
	writeFileSync(join(dir, "claims", "0001", "text"), "steer\n");
	mkdirSync(join(dir, "delivered"));
	await atomicRename(join(dir, "claims", "0001"), join(dir, "delivered", "0001"));
	assert.deepEqual(readdirSync(join(dir, "claims")), []);
	assert.equal(readFileSync(join(dir, "delivered", "0001", "text"), "utf8"), "steer\n");
});

test("atomicRename onto a folder that is not empty fails with its code and leaves both folders", async (t) => {
	const dir = folder(t);
	mkdirSync(join(dir, "prepared"));
	writeFileSync(join(dir, "prepared", "mine"), "");
	mkdirSync(join(dir, "recovery"));
	writeFileSync(join(dir, "recovery", "theirs"), "");
	const code = await codeOf(() => atomicRename(join(dir, "prepared"), join(dir, "recovery")));
	assert.ok(code === "ENOTEMPTY" || code === "EEXIST", String(code));
	assert.deepEqual(readdirSync(join(dir, "prepared")), ["mine"]);
	assert.deepEqual(readdirSync(join(dir, "recovery")), ["theirs"]);
});

test("atomicRename syncs the source's folder as well as the target's, so a source folder it cannot open fails with EACCES", async (t) => {
	if (root) {
		t.skip("root opens every folder");
		return;
	}
	const dir = folder(t);
	mkdirSync(join(dir, "claims", "0002"), { recursive: true });
	mkdirSync(join(dir, "delivered"));
	chmodSync(join(dir, "claims"), 0o300);
	try {
		assert.equal(
			await codeOf(() => atomicRename(join(dir, "claims", "0002"), join(dir, "delivered", "0002"))),
			"EACCES",
		);
	} finally {
		chmodSync(join(dir, "claims"), 0o700);
	}
	assert.deepEqual(readdirSync(join(dir, "delivered")), ["0002"]);
});

test("atomicRenameSync moves a folder onto a missing name", (t) => {
	const dir = folder(t);
	mkdirSync(join(dir, "claims", "0003"), { recursive: true });
	mkdirSync(join(dir, "delivered"));
	atomicRenameSync(join(dir, "claims", "0003"), join(dir, "delivered", "0003"));
	assert.deepEqual(readdirSync(join(dir, "claims")), []);
	assert.deepEqual(readdirSync(join(dir, "delivered")), ["0003"]);
});

test("atomicRenameSync syncs the source's folder as well as the target's, so a source folder it cannot open fails with EACCES", (t) => {
	if (root) {
		t.skip("root opens every folder");
		return;
	}
	const dir = folder(t);
	mkdirSync(join(dir, "claims", "0004"), { recursive: true });
	mkdirSync(join(dir, "delivered"));
	chmodSync(join(dir, "claims"), 0o300);
	try {
		assert.equal(
			syncCodeOf(() => atomicRenameSync(join(dir, "claims", "0004"), join(dir, "delivered", "0004"))),
			"EACCES",
		);
	} finally {
		chmodSync(join(dir, "claims"), 0o700);
	}
	assert.deepEqual(readdirSync(join(dir, "claims")), []);
	assert.deepEqual(readdirSync(join(dir, "delivered")), ["0004"]);
});

test("makeDurableFolder makes a missing folder with each missing folder above it", async (t) => {
	const dir = folder(t);
	await makeDurableFolder(join(dir, "archive", "2026-11"));
	assert.deepEqual([readdirSync(dir), readdirSync(join(dir, "archive", "2026-11"))], [["archive"], []]);
	assert.deepEqual(readdirSync(join(dir, "archive")), ["2026-11"]);
});

test("makeDurableFolder syncs the folder that holds the new folder, so a holder it cannot open fails with EACCES", async (t) => {
	if (root) {
		t.skip("root opens every folder");
		return;
	}
	const dir = join(folder(t), "archive");
	mkdirSync(dir);
	chmodSync(dir, 0o300);
	try {
		assert.equal(await codeOf(() => makeDurableFolder(join(dir, "2026-11"))), "EACCES");
	} finally {
		chmodSync(dir, 0o700);
	}
	// The folder came first: a sync before it would have failed with no folder made.
	assert.deepEqual(readdirSync(dir), ["2026-11"]);
});

test("makeDurableFolder syncs the folder above each folder it made, so one it cannot open above a new holder fails with EACCES", async (t) => {
	if (root) {
		t.skip("root opens every folder");
		return;
	}
	const dir = join(folder(t), ".limen");
	mkdirSync(dir);
	chmodSync(dir, 0o300);
	try {
		assert.equal(await codeOf(() => makeDurableFolder(join(dir, "archive", "2026-11"))), "EACCES");
	} finally {
		chmodSync(dir, 0o700);
	}
	assert.deepEqual(readdirSync(join(dir, "archive")), ["2026-11"]);
});

test("makeDurableFolder syncs no folder above a holder that was there, so one it cannot open there does not fail it", async (t) => {
	if (root) {
		t.skip("root opens every folder");
		return;
	}
	const dir = join(folder(t), ".limen");
	mkdirSync(join(dir, "archive"), { recursive: true });
	chmodSync(dir, 0o300);
	try {
		assert.equal(await codeOf(() => makeDurableFolder(join(dir, "archive", "2026-11"))), undefined);
	} finally {
		chmodSync(dir, 0o700);
	}
	assert.deepEqual(readdirSync(join(dir, "archive")), ["2026-11"]);
});
