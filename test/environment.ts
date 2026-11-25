// The environment and the working directory of the test process for one test, for the tests of modules that read them
// in-process.
import { mkdir, mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import type { TestContext } from "node:test";

/**
 * Sets `values` in this process's environment for the test `t`, in test mode (`LIMEN_TEST_MODE=1`, src/config.ts), so
 * a test knob among them is read; a test that gives the marker in `values` sets its own. After the test, each name gets
 * back the value it held before, or is deleted when it held none, so a test leaves the environment as it found it.
 */
export function withEnvironment(t: TestContext, values: Readonly<Record<string, string>>): void {
	const set = { LIMEN_TEST_MODE: "1", ...values };
	const earlier = Object.fromEntries(Object.keys(set).map((name) => [name, process.env[name]]));
	Object.assign(process.env, set);
	t.after(() => {
		for (const [name, value] of Object.entries(earlier)) {
			if (value === undefined) {
				delete process.env[name];
			} else {
				process.env[name] = value;
			}
		}
	});
}

/**
 * A new project in the OS temporary folder (a folder that holds `.agents/limen`), made this process's working
 * directory for the test `t`, and its root. Code that finds its project from the working directory, as a hook's refusal
 * outside a job does (src/runtime/pi-api.ts), then writes there, never into the checkout the tests run from, which is a
 * project too (R-102 review round 1, finding 1). After the test the earlier working directory is back and the folder
 * is removed.
 */
export async function inTemporaryProject(t: TestContext, prefix: string): Promise<string> {
	const root = await mkdtemp(join(tmpdir(), prefix));
	const earlier = process.cwd();
	t.after(async () => {
		process.chdir(earlier);
		await rm(root, { recursive: true, force: true });
	});
	await mkdir(join(root, ".agents", "limen"), { recursive: true });
	process.chdir(root);
	return root;
}
