// docs/seat/bell.ts: the seat's bell rings once for each terminal job record, and never for a record the migration wrote;
// it runs when started through a symlinked path too.
import assert from "node:assert/strict";
import { spawn } from "node:child_process";
import { once } from "node:events";
import { mkdir, mkdtemp, readFile, rm, symlink, writeFile } from "node:fs/promises";
import { createServer } from "node:http";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";
import { ringBell } from "../../docs/seat/bell.ts";
import { writeRecord } from "../plant.ts";

const FINISHED = "2026-11-21T10:00:00.000Z";

test("the bell rings once for a terminal record without its receipt, and leaves the receipt", async (t) => {
	const root = await mkdtemp(join(tmpdir(), "limen-bell-"));
	t.after(() => rm(root, { recursive: true, force: true }));
	const jobs = join(root, ".limen", "jobs");
	await writeRecord(join(jobs, "done-job"), { state: "done", label: "the work", finishedAt: FINISHED });
	await writeRecord(join(jobs, "running-job"), { state: "running", label: "busy" });
	await writeRecord(join(jobs, "heard-job"), { state: "failed", finishedAt: FINISHED });
	await mkdir(join(jobs, "heard-job", "notify"));
	await writeFile(join(jobs, "heard-job", "notify", "bell"), "failed\n");
	const sent: string[] = [];
	const send = async (text: string) => {
		sent.push(text);
		return true;
	};
	assert.deepEqual(await ringBell(root, send), ["limen: the work is done (done-job)"]);
	assert.equal(await readFile(join(jobs, "done-job", "notify", "bell"), "utf8"), "done\n");
	assert.deepEqual(await ringBell(root, send), [], "a second run rings nothing");
	assert.deepEqual(sent, ["limen: the work is done (done-job)"]);
});

test("the bell started through a symlinked path rings, as through its own path", async (t) => {
	const root = await mkdtemp(join(tmpdir(), "limen-bell-"));
	t.after(() => rm(root, { recursive: true, force: true }));
	await writeRecord(join(root, ".limen", "jobs", "done-job"), {
		state: "done",
		label: "the work",
		finishedAt: FINISHED,
	});
	const linked = join(root, "bell.ts");
	await symlink(fileURLToPath(new URL("../../docs/seat/bell.ts", import.meta.url)), linked);
	const posted: string[] = [];
	const server = createServer((request, response) => {
		const body: Buffer[] = [];
		request.on("data", (chunk: Buffer) => body.push(chunk));
		request.on("end", () => {
			posted.push(`${request.url} ${Buffer.concat(body).toString("utf8")}`);
			response.end("ok");
		});
	});
	server.listen(0, "127.0.0.1");
	await once(server, "listening");
	t.after(() => server.close());
	const address = server.address();
	assert.ok(address !== null && typeof address === "object", "the server listens on a port");
	const bell = spawn(process.execPath, [linked, root], {
		env: { PATH: process.env.PATH, NTFY_TOPIC: "topic", NTFY_URL: `http://127.0.0.1:${address.port}` },
		stdio: "ignore",
	});
	assert.deepEqual(await once(bell, "exit"), [0, null]);
	assert.deepEqual(posted, ["/topic limen: the work is done (done-job)"]);
});

test("D-057: the bell never rings for a terminal record the migration wrote", async (t) => {
	const root = await mkdtemp(join(tmpdir(), "limen-bell-"));
	t.after(() => rm(root, { recursive: true, force: true }));
	const migrated = join(root, ".limen", "jobs", "old-job");
	await writeRecord(migrated, { state: "done", finishedAt: FINISHED, migrated: { at: FINISHED } });
	const sent: string[] = [];
	assert.deepEqual(
		await ringBell(root, async (text) => {
			sent.push(text);
			return true;
		}),
		[],
	);
	assert.deepEqual(sent, []);
});
