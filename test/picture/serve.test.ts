// `servePicture` serves job activity only: `/activity.json` and `/events` from a jobs root, with no map anywhere.
import assert from "node:assert/strict";
import { once } from "node:events";
import { mkdir, mkdtemp, rm, writeFile } from "node:fs/promises";
import { type IncomingMessage, request } from "node:http";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { after, before, test } from "node:test";
import { servePicture } from "../../src/picture/picture-serve.ts";

/** Every request gives up after this long, so a server that never answers fails the test instead of hanging it. */
const BOUND_MS = 5_000;
const JOB = "2026-11-18-f007-served-1a2b3c4d";

type Served = Awaited<ReturnType<typeof servePicture>>;

/** A folder outside any repository with one finished job under `.limen/jobs/`; nothing else, so no map exists. */
async function jobsRoot(): Promise<string> {
	const root = await mkdtemp(join(tmpdir(), "limen-serve-"));
	const job = join(root, ".limen", "jobs", JOB);
	await mkdir(job, { recursive: true });
	const now = Date.now();
	const files = {
		state: "done\n",
		label: "F007 served job\n",
		engine: "pi\n",
		role: "worker\n",
		"started-at": `${new Date(now - 60_000).toISOString()}\n`,
		"finished-at": `${new Date(now).toISOString()}\n`,
	};
	for (const [name, text] of Object.entries(files)) {
		await writeFile(join(job, name), text);
	}
	return root;
}

/**
 * Opens one GET with the given Host header and resolves with the response once its headers arrive. No agent, so no
 * pooled connection outlives the test.
 */
function open(port: number, path: string, host = `127.0.0.1:${port}`): Promise<IncomingMessage> {
	const { promise, resolve, reject } = Promise.withResolvers<IncomingMessage>();
	const signal = AbortSignal.timeout(BOUND_MS);
	const sent = request({ host: "127.0.0.1", port, path, headers: { host }, agent: false, signal });
	sent.on("response", resolve);
	sent.on("error", reject);
	sent.end();
	return promise;
}

/** The whole body of a response that ends. */
async function body(response: IncomingMessage): Promise<string> {
	response.setEncoding("utf8");
	let text = "";
	for await (const chunk of response) {
		text += chunk;
	}
	return text;
}

/** Reads an event stream until its first named event is complete: the event name and its data. */
function firstEvent(response: IncomingMessage): Promise<{ readonly event: string; readonly data: string }> {
	const { promise, resolve, reject } = Promise.withResolvers<{ readonly event: string; readonly data: string }>();
	response.setEncoding("utf8");
	let text = "";
	response.on("data", (chunk: string) => {
		text += chunk;
		// Blocks end with a blank line; the stream opens with a `retry:` block that names no event.
		const named = text
			.split("\n\n")
			.slice(0, -1)
			.find((block) => block.startsWith("event: "));
		if (named) {
			const [event = "", data = ""] = named.split("\n").map((line) => line.slice(line.indexOf(": ") + 2));
			resolve({ event, data });
		}
	});
	response.on("error", reject);
	response.on("end", () => reject(new Error(`the stream ended before its first event: ${JSON.stringify(text)}`)));
	return promise;
}

let root = "";
let served: Served | undefined;
let port = 0;

before(async () => {
	root = await jobsRoot();
	served = await servePicture({ jobsRoot: join(root, ".limen", "jobs"), port: 0 });
	port = Number(new URL(served.url).port);
});

after(async () => {
	await served?.close();
	await rm(root, { recursive: true, force: true });
});

test("GET / answers 404: the server serves no page", async () => {
	const response = await open(port, "/");
	await body(response);
	assert.equal(response.statusCode, 404);
});

test("GET /activity.json answers 200 with the job of the jobs root although no map exists", async () => {
	const response = await open(port, "/activity.json");
	const snapshot = JSON.parse(await body(response)) as { jobs: Array<{ id: string; state: string }> };
	assert.deepEqual(
		[response.statusCode, response.headers["content-type"], snapshot.jobs.map((job) => [job.id, job.state])],
		[200, "application/json; charset=utf-8", [[JOB, "done"]]],
	);
});

test("GET /events answers an event stream whose first event is activity with the job", async () => {
	const response = await open(port, "/events");
	const first = await firstEvent(response);
	response.destroy();
	const snapshot = JSON.parse(first.data) as { jobs: Array<{ id: string }> };
	assert.deepEqual(
		[response.statusCode, response.headers["content-type"], first.event, snapshot.jobs.map((job) => job.id)],
		[200, "text/event-stream; charset=utf-8", "activity", [JOB]],
	);
});

test("a request with another Host answers 403", async () => {
	const response = await open(port, "/activity.json", "rebound.example:80");
	await body(response);
	assert.equal(response.statusCode, 403);
});

test("close() ends an open event stream and stops listening", async (t) => {
	const own = await jobsRoot();
	t.after(() => rm(own, { recursive: true, force: true }));
	const server = await servePicture({ jobsRoot: join(own, ".limen", "jobs"), port: 0 });
	const ownPort = Number(new URL(server.url).port);
	const stream = await open(ownPort, "/events");
	await firstEvent(stream);
	// `once` rejects on the stream's error, so a connection the bound cuts fails here instead of waiting.
	const ended = once(stream, "end");
	await server.close();
	await ended;
	await assert.rejects(open(ownPort, "/activity.json"), { code: "ECONNREFUSED" });
});
