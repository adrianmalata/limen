// A local ntfy server for the tests of the seat's alerts and of their `main` watcher, reached through the test knob
// LIMEN_ALERTS_URL, so a test sees every line the alerts send and chooses the status they get back.
import assert from "node:assert/strict";
import { once } from "node:events";
import { createServer } from "node:http";
import type { TestContext } from "node:test";
import { withEnvironment } from "../environment.ts";

export type Post = { readonly path: string; readonly body: string; readonly title: string | undefined };
/** A local ntfy server: what it was sent, and the status it answers with, 200 until a test changes it. */
export type Ntfy = { readonly posts: Post[]; answer: number };

/** Starts a local ntfy server and points the alerts at it through their test knob for the test `t`. */
export async function ntfy(t: TestContext): Promise<Ntfy> {
	const server: Ntfy = { posts: [], answer: 200 };
	const http = createServer((request, response) => {
		const body: Buffer[] = [];
		request.on("data", (chunk: Buffer) => body.push(chunk));
		request.on("end", () => {
			const title = request.headers.title ?? request.headers["x-title"];
			server.posts.push({
				path: request.url ?? "",
				body: Buffer.concat(body).toString("utf8"),
				title: Array.isArray(title) ? title.join(",") : title,
			});
			response.statusCode = server.answer;
			response.end("{}");
		});
	});
	http.listen(0, "127.0.0.1");
	await once(http, "listening");
	t.after(() => http.close());
	const address = http.address();
	assert.ok(address !== null && typeof address === "object", "the server listens on a port");
	withEnvironment(t, { LIMEN_ALERTS_URL: `http://127.0.0.1:${address.port}` });
	return server;
}
