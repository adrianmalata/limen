// U7: every spawn names and bounds its job here: a job id from its label and its token, and an explicit timeout that
// fits Node's timer. The resolver of job references is test/job/reference.test.ts.
import assert from "node:assert/strict";
import test from "node:test";
import { makeJobId, parseDuration } from "../src/job/job.ts";

test("a job id hoists the feature number, keeps a bounded slug, and ends in a random suffix", () => {
	const shape = /^\d{4}-\d{2}-\d{2}-([a-z0-9-]+)-[0-9a-f]{8}$/;
	const slug = (label: string) => shape.exec(makeJobId(label))?.[1];
	assert.deepEqual([slug("Review F927 candidate"), slug("!!!")], ["f927-review-candidate", "job"]);
	const long = slug("an extremely long label that keeps going well past the slug bound");
	assert.ok(long && long.length <= 32 && !long.endsWith("-"), long);
	assert.notEqual(makeJobId("same"), makeJobId("same"));
});

test("a timeout needs a unit, is positive, and fits Node's maximum timer", () => {
	const valid = [
		["500ms", 500],
		["90s", 90_000],
		["20m", 1_200_000],
		["2h", 7_200_000],
		["596h", 2_145_600_000],
	] as const;
	for (const [value, ms] of valid) {
		assert.equal(parseDuration(value), ms, value);
	}
	for (const value of ["20", "0s", "-1m", "1.5h", "597h", "999999999999999999h", "1d", ""]) {
		assert.throws(() => parseDuration(value), value);
	}
});
