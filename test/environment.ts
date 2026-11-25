// The environment of the test process for one test, for the tests of modules that read it in-process.
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
