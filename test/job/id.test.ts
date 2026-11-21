// src/job/id.ts: the form of a job id and its token holds for the ids and tokens src/job/job.ts makes.
import assert from "node:assert/strict";
import test from "node:test";
import { JOB_ID, TOKEN, tokenOf } from "../../src/job/id.ts";
import { jobToken, makeJobId } from "../../src/job/job.ts";

/** Labels at the edges of the slug: a feature number to hoist, other characters, nothing left, and a cut at 32. */
const LABELS = [
	"F001 implementation",
	"Review r2 · F017",
	"F1234 a longer feature number",
	"UPPER case 123",
	"a naïve café label",
	"-leading and trailing-",
	"!!!",
	"",
	"abcdefghij abcdefghij abcdefghi abc",
	"an extremely long label that keeps going well past the slug bound",
];

// makeJobId does not read src/job/id.ts, so only this check finds a change on one side that the other does not follow.
test("every id makeJobId makes from a label and a drawn token is a JOB_ID that ends in that token", () => {
	const wrong = LABELS.flatMap((label) => {
		const token = jobToken();
		const id = makeJobId(label, token);
		return JOB_ID.test(id) && tokenOf(id) === token ? [] : [{ label, id }];
	});
	assert.deepEqual(wrong, []);
});

test("every token jobToken draws is a TOKEN", () => {
	const wrong = Array.from({ length: 64 }, () => jobToken()).filter((token) => !TOKEN.test(token));
	assert.deepEqual(wrong, []);
});
