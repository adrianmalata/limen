// `limen picture serve`, the one streaming command (D-061 (3)): it serves this project's job activity until it is
// stopped, so a failed read while it serves is printed when it happens.
import { createServer, type IncomingMessage, type Server, type ServerResponse } from "node:http";
import { dirname, join } from "node:path";
import { gitCommonDir, repoRoot } from "../project/git.ts";
import { activityReader } from "./activity.ts";

const HOST = "127.0.0.1";
const SERVE_PORT = 4747;
const ACTIVITY = "/activity.json";
const EVENTS = "/events";
const READ_MS = 1_000;
const PING_MS = 15_000;

export type ServeOptions = {
	readonly jobsRoot: string;
	readonly port: number;
};

/**
 * Serves the job activity of the project at `cwd` on 127.0.0.1 at `port` (4747 when not given); returns the line that
 * says where. A job worktree serves the same jobs as the primary checkout.
 */
export async function serveActivity(cwd: string, port = String(SERVE_PORT)): Promise<string> {
	if (!/^\d{1,5}$/.test(port) || Number(port) > 65_535) {
		throw new Error(`invalid picture serve port ${JSON.stringify(port)}; give a number from 0 to 65535`);
	}
	const served = await servePicture({ jobsRoot: primaryJobs(cwd), port: Number(port) });
	return `picture: serving ${served.url}activity.json and /events; Ctrl-C stops`;
}

/**
 * The `.limen/jobs` of the primary checkout of the repository at `cwd`, so a job worktree serves the same jobs as the
 * primary checkout. `repoRoot` gives its own error outside a repository; inside one, Git always names the shared folder.
 */
function primaryJobs(cwd: string): string {
	const common = gitCommonDir(repoRoot(cwd));
	if (common === undefined) {
		throw new Error(`git rev-parse --git-common-dir failed in ${cwd}`);
	}
	return join(dirname(common), ".limen", "jobs");
}

/**
 * Serves the job activity of `jobsRoot` on 127.0.0.1: `/activity.json` answers the current snapshot, and `/events`
 * pushes it over Server-Sent Events. Activity is read once a second and sent only when it changed; the server reads
 * only the job folders and the group records beside them, never a map, and every other path answers 404.
 */
export async function servePicture(options: ServeOptions): Promise<{ url: string; close(): Promise<void> }> {
	const read = activityReader(options.jobsRoot);
	const first = await read();
	let snapshot = JSON.stringify(first);
	// Everything but the clock: a snapshot goes out only when a job or a group tree changed.
	let jobs = JSON.stringify([first.jobs, first.groups]);
	let reading = false;
	const clients = new Set<ServerResponse>();
	const refresh = async () => {
		if (reading) {
			return;
		}
		reading = true;
		try {
			const next = await read();
			snapshot = JSON.stringify(next);
			const changed = JSON.stringify([next.jobs, next.groups]);
			if (changed !== jobs) {
				jobs = changed;
				for (const client of clients) {
					client.write(`event: activity\ndata: ${snapshot}\n\n`);
				}
			}
		} catch (error) {
			console.error(`picture serve: reading jobs failed: ${error instanceof Error ? error.message : String(error)}`);
		} finally {
			reading = false;
		}
	};
	const server = createServer();
	const port = await listen(server, options.port);
	server.on("request", (request: IncomingMessage, response: ServerResponse) => {
		respond(request, response, port, () => snapshot, clients).catch((error: unknown) => {
			if (!response.headersSent) {
				response.writeHead(500, { "content-type": "text/plain; charset=utf-8" });
			}
			response.end(error instanceof Error ? error.message : String(error));
		});
	});
	const reader = setInterval(() => {
		void refresh();
	}, READ_MS);
	// A named event, not an SSE comment: the page sees it and can tell a stalled feed from a quiet one.
	const pinger = setInterval(() => {
		for (const client of clients) {
			client.write(`event: ping\ndata: {"at":"${new Date().toISOString()}"}\n\n`);
		}
	}, PING_MS);
	return {
		url: `http://${HOST}:${port}/`,
		close: async () => {
			clearInterval(reader);
			clearInterval(pinger);
			for (const client of clients) {
				client.end();
			}
			await new Promise<void>((resolve) => server.close(() => resolve()));
		},
	};
}

async function respond(
	request: IncomingMessage,
	response: ServerResponse,
	port: number,
	snapshot: () => string,
	clients: Set<ServerResponse>,
): Promise<void> {
	// Another site that rebinds its name to 127.0.0.1 sends its own Host; only this address may read job activity.
	if (request.headers.host !== `${HOST}:${port}` && request.headers.host !== `localhost:${port}`) {
		response.writeHead(403, { "content-type": "text/plain; charset=utf-8" }).end("wrong host\n");
		return;
	}
	const path = new URL(request.url ?? "/", `http://${HOST}`).pathname;
	if (request.method !== "GET" || ![ACTIVITY, EVENTS].includes(path)) {
		response.writeHead(404, { "content-type": "text/plain; charset=utf-8" }).end("not found\n");
		return;
	}
	if (path === ACTIVITY) {
		response
			.writeHead(200, { "content-type": "application/json; charset=utf-8", "cache-control": "no-store" })
			.end(`${snapshot()}\n`);
		return;
	}
	response.writeHead(200, {
		"content-type": "text/event-stream; charset=utf-8",
		"cache-control": "no-store",
		connection: "keep-alive",
	});
	response.write(`retry: 2000\n\nevent: activity\ndata: ${snapshot()}\n\n`);
	clients.add(response);
	request.on("close", () => clients.delete(response));
}

async function listen(server: Server, port: number): Promise<number> {
	await new Promise<void>((resolve, reject) => {
		server.once("error", (error: NodeJS.ErrnoException) =>
			reject(error.code === "EADDRINUSE" ? new Error(`port ${port} on ${HOST} is in use; pass another --port`) : error),
		);
		server.listen(port, HOST, () => resolve());
	});
	const address = server.address();
	return typeof address === "object" && address ? address.port : port;
}
