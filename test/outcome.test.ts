// src/outcome.ts: the final line, the one error type and the client function, alone and through bin/limen.
import assert from "node:assert/strict";
import { readdirSync } from "node:fs";
import { join } from "node:path";
import { after, before, test } from "node:test";
import { EXIT_CODES, failureOf, finalLine, LimenError, type Output, outputText, readOutcome } from "../src/outcome.ts";
import { readOutcome as readChecked, outputText as textChecked } from "./final-line.ts";
import { limen, type Plant, plant } from "./plant.ts";

const JOB = "2026-11-19-f001-demo-1a2b3c4d";
const OK = '{"class":"ok","code":null,"next":null}';

test("finalLine writes class, code and next in that order and leaves ids out when none are given", () => {
	assert.equal(
		finalLine({ next: "limen --help", code: "BAD_FLAG", class: "usage" }),
		'{"class":"usage","code":"BAD_FLAG","next":"limen --help"}',
	);
	assert.equal(finalLine({ class: "ok", code: null, next: null }), OK);
});

test("finalLine writes ids last, after next", () => {
	assert.equal(
		finalLine({ ids: { job: JOB }, next: null, code: null, class: "ok" }),
		`{"class":"ok","code":null,"next":null,"ids":{"job":"${JOB}"}}`,
	);
});

// `github review` and `github work` can name a job an earlier `makeJobId` made, so ids.job takes each form it wrote.
const OLDER_JOB_IDS: ReadonlyArray<readonly [string, string]> = [
	["a 4-hex suffix, as before 2026-08-14 (label: say hi)", "2026-08-13-say-hi-1a2b"],
	[
		"a slug cut at 32 characters that ends in a dash, as until 2026-10-06 (label: fix the wake when the jobs ends at once)",
		"2026-08-20-fix-the-wake-when-the-jobs-ends--0a1b2c3d",
	],
	[
		"a run of dashes where the feature number left the label, as from 2026-09-04 to 2026-10-06 (label: Wake retry F031 in hosted jobs)",
		"2026-09-10-f031-wake-retry---in-hosted-jobs-0a1b2c3d",
	],
];
for (const [form, job] of OLDER_JOB_IDS) {
	test(`finalLine writes and readOutcome reads a job id with ${form}`, () => {
		const line = finalLine({ class: "ok", code: null, next: null, ids: { job } });
		assert.deepEqual(readOutcome({ status: 0, stdout: `${line}\n`, stderr: "" }).ids, { job });
	});
}

test("failureOf keeps a LimenError as it is", () => {
	const error = new LimenError({
		class: "transient",
		code: "GITHUB_NETWORK",
		message: "m",
		next: "limen github doctor",
	});
	assert.equal(failureOf(error), error);
});

test("failureOf makes a plain Error an untyped refusal with exit code 1 and a null next", () => {
	const failure = failureOf(new Error('no job matches "x"'));
	assert.deepEqual(
		[failure.class, failure.code, failure.message, failure.next, EXIT_CODES[failure.class]],
		["refused", "UNTYPED", 'no job matches "x"', null, 1],
	);
});

test("failureOf makes a TypeError an internal error with exit code 5 and a null next, and keeps it as the cause", () => {
	const error = new TypeError("x.y is not a function");
	const failure = failureOf(error);
	assert.deepEqual(
		[failure.class, failure.code, failure.message, failure.next, EXIT_CODES[failure.class], failure.cause],
		["internal", "INTERNAL", "x.y is not a function", null, 5, error],
	);
});

test("failureOf makes a thrown string an internal error", () => {
	const failure = failureOf("broken");
	assert.deepEqual([failure.class, failure.code, failure.message], ["internal", "INTERNAL", "broken"]);
});

test("LimenError refuses a code that is not an upper-case identifier", () => {
	assert.throws(
		() => new LimenError({ class: "refused", code: "bad-code", message: "m", next: "limen status" }),
		/code/,
	);
});

// D-045 (2), D-046 (1)-(2): a failure with no successor has next null; any other next is a Limen command.
test("LimenError takes a null next for a refusal, a usage error and an internal error", () => {
	const nexts = (["refused", "usage", "internal"] as const).map(
		(name) => new LimenError({ class: name, code: "NO_SUCCESSOR", message: "m", next: null }).next,
	);
	assert.deepEqual(nexts, [null, null, null]);
});

for (const next of ["", " ", "fix it, then run limen status", "limen"]) {
	test(`LimenError refuses the next ${JSON.stringify(next)}, which is neither null nor a Limen command`, () => {
		assert.throws(() => new LimenError({ class: "refused", code: "BAD_NEXT", message: "m", next }), /next/);
	});
}

test("readOutcome returns the final line of stdout after text for people when the process exited 0", () => {
	const line = `{"class":"ok","code":null,"next":"limen status","ids":{"job":"${JOB}"}}`;
	const output = { status: 0, stdout: `${JOB}\nstarted demo\n${JOB}\n${line}\n\n`, stderr: "warning: on stderr\n" };
	assert.deepEqual(readOutcome(output), { class: "ok", code: null, next: "limen status", ids: { job: JOB } });
});

test("readOutcome returns the final line of stderr after the message when the process failed", () => {
	const output = {
		status: 2,
		stdout: "",
		stderr: 'unknown command "x"\n{"class":"usage","code":"UNKNOWN_COMMAND","next":"limen --help"}\n',
	};
	assert.deepEqual(readOutcome(output), { class: "usage", code: "UNKNOWN_COMMAND", next: "limen --help" });
});

const REFUSED: ReadonlyArray<readonly [string, Output, RegExp]> = [
	[
		"a missing final line",
		{ status: 0, stdout: "started demo\n", stderr: "" },
		/^the final line on stdout: expected JSON, got "started demo"$/,
	],
	["an empty stream", { status: 1, stdout: OK, stderr: "\n" }, /no final line on stderr/],
	[
		"a line that is not JSON",
		{ status: 0, stdout: '{"class":"ok",\n', stderr: "" },
		/^the final line on stdout: expected JSON, got /,
	],
	[
		"a line that is not an object",
		{ status: 0, stdout: "[0]\n", stderr: "" },
		/^the final line on stdout: expected an object, got \[0\]$/,
	],
	["an unknown class", { status: 1, stdout: "", stderr: '{"class":"failed","code":"X","next":null}\n' }, /class/],
	[
		"code null with a failure class",
		{ status: 1, stdout: "", stderr: '{"class":"refused","code":null,"next":null}\n' },
		/code/,
	],
	[
		"code 0 on a success",
		{ status: 0, stdout: '{"class":"ok","code":0,"next":null}\n', stderr: "" },
		/^the final line on stdout: code: expected null, got 0$/,
	],
	[
		"a word for the code of a success",
		{ status: 0, stdout: '{"class":"ok","code":"OK","next":null}\n', stderr: "" },
		/code/,
	],
	[
		"a code that is not an identifier",
		{ status: 1, stdout: "", stderr: '{"class":"refused","code":"x y","next":null}\n' },
		/code/,
	],
	["a missing next", { status: 0, stdout: '{"class":"ok","code":null}\n', stderr: "" }, /next/],
	["an empty next", { status: 0, stdout: '{"class":"ok","code":null,"next":""}\n', stderr: "" }, /next/],
	["a next of 0", { status: 0, stdout: '{"class":"ok","code":null,"next":0}\n', stderr: "" }, /next/],
	[
		"a next that is prose",
		{ status: 0, stdout: '{"class":"ok","code":null,"next":"End your turn."}\n', stderr: "" },
		/^the final line on stdout: next: expected null or a Limen command, got "End your turn\."$/,
	],
	["an unknown key", { status: 0, stdout: '{"class":"ok","code":null,"next":null,"data":1}\n', stderr: "" }, /data/],
	[
		"an unknown ids key",
		{ status: 0, stdout: '{"class":"ok","code":null,"next":null,"ids":{"group":"g"}}\n', stderr: "" },
		/group/,
	],
	[
		"a malformed job id",
		{ status: 0, stdout: '{"class":"ok","code":null,"next":null,"ids":{"job":"1a2b3c4d"}}\n', stderr: "" },
		/job/,
	],
	[
		"a malformed ticket",
		{ status: 0, stdout: '{"class":"ok","code":null,"next":null,"ids":{"ticket":"F12"}}\n', stderr: "" },
		/ticket/,
	],
	[
		"a malformed question",
		{ status: 0, stdout: '{"class":"ok","code":null,"next":null,"ids":{"question":"Q-1"}}\n', stderr: "" },
		/question/,
	],
	["a class whose exit code differs from the status", { status: 1, stdout: "", stderr: `${OK}\n` }, /exit code 0/],
];
for (const [what, output, names] of REFUSED) {
	test(`readOutcome refuses ${what} with an error that names it`, () => {
		assert.throws(
			() => readOutcome(output),
			(error: unknown) => {
				assert.ok(error instanceof LimenError, String(error));
				assert.deepEqual([error.class, error.code], ["internal", "INTERNAL"]);
				assert.match(error.message, names);
				return true;
			},
		);
	});
}

// The 40-character cut serves the values of data files; a broken final line is one line a command wrote, shown whole.
test("readOutcome shows a final line that is not JSON whole in its message", () => {
	const line = '{"class":"ok","code":null,"next":"limen status --all","ids":{"job":"2026-11-19-f001-demo-1a2b3c4d"}';
	assert.throws(
		() => readOutcome({ status: 0, stdout: `${line}\n`, stderr: "" }),
		(error: unknown) => {
			assert.ok(error instanceof LimenError, String(error));
			assert.equal(error.message, `the final line on stdout: expected JSON, got ${JSON.stringify(line)}`);
			return true;
		},
	);
});

test("outputText gives the text for people on the stream of the final line, without that line", () => {
	assert.equal(outputText({ status: 0, stdout: `one\ntwo\n${OK}\n`, stderr: "" }), "one\ntwo\n");
	assert.equal(outputText({ status: 0, stdout: `${OK}\n`, stderr: "" }), "");
});

let p: Plant;
before(async () => {
	p = await plant();
});
after(() => p.cleanup());

test("limen --help ends its stdout with the success line and exits 0", () => {
	const run = limen(p, ["--help"]);
	assert.equal(run.status, 0, run.stderr);
	assert.deepEqual(readChecked(run), { class: "ok", code: null, next: null });
	assert.match(textChecked(run), /^limen: /);
});

test("UNKNOWN_COMMAND: an unknown command exits 2 with its code in the last line of stderr", () => {
	const run = limen(p, ["nosuch"]);
	assert.equal(run.status, 2, run.stderr);
	assert.deepEqual(readChecked(run), { class: "usage", code: "UNKNOWN_COMMAND", next: "limen --help" });
	assert.match(textChecked(run), /^unknown command "nosuch"\n/);
});

test("BAD_ARGUMENT: spawn with an unknown flag exits 2 before it writes anything", () => {
	const jobs = readdirSync(join(p.root, ".limen/jobs"));
	const run = limen(p, ["spawn", "--nosuch", "work"]);
	assert.equal(run.status, 2, run.stderr);
	assert.deepEqual(readChecked(run), { class: "usage", code: "BAD_ARGUMENT", next: "limen spawn --help" });
	assert.equal(textChecked(run).split("\n")[0], "limen spawn: unknown flag --nosuch");
	assert.deepEqual(readdirSync(join(p.root, ".limen/jobs")), jobs);
});

test("JOB_NOT_FOUND: show of a well-formed id that names no job exits 2 with limen status --all in next", () => {
	const run = limen(p, ["show", "2026-11-18-none-1a2b3c4d"]);
	assert.equal(run.status, 2, run.stderr);
	assert.deepEqual(readChecked(run), { class: "usage", code: "JOB_NOT_FOUND", next: "limen status --all" });
	assert.equal(
		textChecked(run),
		'no job of this project has the id or token "2026-11-18-none-1a2b3c4d"\nno job matches it\n',
	);
});

test("UNTYPED: a refusal that carries no type of its own exits 1 with code UNTYPED", () => {
	// A group member's land is one of the author's untyped refusals (R-082 types them).
	const run = limen(p, ["land", "2026-11-18-none-1a2b3c4d"], { env: { LIMEN_GROUP_ID: "g1" } });
	assert.equal(run.status, 1, run.stderr);
	assert.deepEqual(readChecked(run), { class: "refused", code: "UNTYPED", next: null });
	assert.equal(textChecked(run), "group members cannot land; the owner-facing lead owns landing\n");
});

test("limen status ends its stdout with the success line", () => {
	const run = limen(p, ["status"]);
	assert.equal(run.status, 0, run.stderr);
	assert.deepEqual(readChecked(run), { class: "ok", code: null, next: null });
});

test("ticket new returns the number of the ticket it wrote in ids.ticket", () => {
	const run = limen(p, ["ticket", "new", "ids name the ticket"]);
	assert.equal(run.status, 0, run.stderr);
	const folders = readdirSync(join(p.root, "spec/features/planned"));
	const folder = folders.find((name) => name.endsWith("-ids-name-the-ticket")) ?? folders.join(", ");
	assert.match(folder, /^F\d{3,}-ids-name-the-ticket$/);
	const ticket = folder.slice(0, folder.indexOf("-"));
	assert.deepEqual(readChecked(run), { class: "ok", code: null, next: null, ids: { ticket } });
});
