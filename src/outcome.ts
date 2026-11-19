// The one error type of Limen and the final JSON line of every command (T-01, T-02, D-022, D-028). This module alone
// writes the line (`finalLine`, for `main`) and alone reads it (`readOutcome`, for every caller of the CLI, T-26 (4)).

/** The exit code of each class (T-02): the exit code is the class, and the final line carries the detail. */
export const EXIT_CODES = { ok: 0, refused: 1, usage: 2, transient: 3, environment: 4, internal: 5 } as const;
export type OutcomeClass = keyof typeof EXIT_CODES;
export type FailureClass = Exclude<OutcomeClass, "ok">;

/** The identifiers of what a command created or changed, never its data (D-022); R-014 declares each command's keys. */
export type Ids = { readonly job?: string; readonly ticket?: string; readonly question?: string };
/** A command's result on success; a command that returns nothing ends with `next` "". */
export type Success = { readonly next: string; readonly ids?: Ids };
/** The final line: `code` is `0` exactly when `class` is `ok` (D-022), otherwise the failure's identifier. */
export type Outcome = {
	readonly class: OutcomeClass;
	readonly code: 0 | string;
	readonly next: string;
	readonly ids?: Ids;
};
/** What a finished CLI process left: its exit status and both streams. */
export type Output = { readonly status: number | null; readonly stdout: string; readonly stderr: string };

/** The code of a refusal the author threw as a plain `Error`: it has no type and no next command until R-082. */
export const UNTYPED = "UNTYPED";
/** The `next` of a command whose success creates exactly one job (D-022). */
export const JOB_STARTED = "End your turn; Limen wakes you when the job ends.";

const FAILURE_CLASSES: readonly string[] = ["refused", "usage", "transient", "environment", "internal"];
const CODE = /^[A-Z][A-Z0-9_]*$/;
/**
 * The format of each `ids` value: a job id, a ticket number, a question number. `github review` and `github work` can
 * name a job an earlier `makeJobId` (`src/job/job.ts`) made, so the job id takes every form it has written: a 4- or
 * 8-hex suffix, and a slug of at most 32 characters that may hold a run of dashes or end in one.
 */
const ID_FORMATS = {
	job: /^\d{4}-\d{2}-\d{2}-[a-z0-9][a-z0-9-]{0,31}-(?:[0-9a-f]{4}|[0-9a-f]{8})$/,
	ticket: /^F\d{3,}$/,
	question: /^Q-\d{3}$/,
} as const;
const KEYS: readonly string[] = ["class", "code", "next", "ids"];

type FailureFields = {
	readonly class: FailureClass;
	readonly code: string;
	readonly message: string;
	readonly next: string;
	readonly cause?: unknown;
};

/**
 * A failure with its class, its code and the next command (T-01). A refusal and a usage error name the next command;
 * only `UNTYPED`, which `failureOf` gives the author's plain errors, has none.
 */
export class LimenError extends Error {
	readonly class: FailureClass;
	readonly code: string;
	readonly next: string;
	constructor(failure: FailureFields) {
		super(failure.message, failure.cause === undefined ? undefined : { cause: failure.cause });
		if (!FAILURE_CLASSES.includes(failure.class)) {
			throw new TypeError(`LimenError class ${JSON.stringify(failure.class)} is not a failure class`);
		}
		if (!CODE.test(failure.code)) {
			throw new TypeError(`LimenError code ${JSON.stringify(failure.code)} is not an upper-case identifier`);
		}
		const named = failure.next.trim() !== "" || failure.code === UNTYPED;
		if ((failure.class === "refused" || failure.class === "usage") && !named) {
			throw new TypeError(`LimenError ${failure.code} of class ${failure.class} needs a next command`);
		}
		this.name = "LimenError";
		this.class = failure.class;
		this.code = failure.code;
		this.next = failure.next;
	}
}

/**
 * The failure a thrown value stands for: a `LimenError` as it is; a plain `Error` (the author's untyped refusals) a
 * refusal `UNTYPED`, which keeps exit code 1; anything else an internal error. Both keep the value as the cause.
 */
export function failureOf(error: unknown): LimenError {
	if (error instanceof LimenError) {
		return error;
	}
	if (error instanceof Error && Object.getPrototypeOf(error) === Error.prototype) {
		return new LimenError({ class: "refused", code: UNTYPED, message: error.message, next: "", cause: error });
	}
	const message = error instanceof Error ? error.message : String(error);
	return new LimenError({ class: "internal", code: "INTERNAL", message, next: "", cause: error });
}

/** The final line for `outcome`: `class`, `code`, `next`, then `ids` when given; an invalid outcome throws. */
export function finalLine(outcome: Outcome): string {
	const valid = checkedOutcome(outcome, "the final line");
	const ids = valid.ids === undefined ? {} : { ids: valid.ids };
	return JSON.stringify({ class: valid.class, code: valid.code, next: valid.next, ...ids });
}

/**
 * The one client function of the final line (T-26 (4)): the last non-empty line of stdout when the process exited 0,
 * of stderr otherwise, checked and returned. Text before it is for people and is never read.
 */
export function readOutcome(output: Output): Outcome {
	const stream = output.status === 0 ? "stdout" : "stderr";
	const line = output[stream]
		.split("\n")
		.filter((text) => text.trim() !== "")
		.at(-1);
	if (line === undefined) {
		throw broken(`no final line on ${stream}: it is empty`);
	}
	let parsed: unknown;
	try {
		parsed = JSON.parse(line);
	} catch (cause) {
		throw broken(`no final line on ${stream}: its last line is not JSON: ${line}`, cause);
	}
	const outcome = checkedOutcome(parsed, `the final line on ${stream}`);
	const code = EXIT_CODES[outcome.class];
	if (code !== output.status) {
		throw broken(
			`the final line has class ${outcome.class} with exit code ${code}, but the process exited ${output.status}`,
		);
	}
	return outcome;
}

/** The text for people on the stream that carries the final line: that stream without the line. */
export function outputText(output: Output): string {
	readOutcome(output);
	const stream = output.status === 0 ? output.stdout : output.stderr;
	return stream.slice(0, stream.trimEnd().lastIndexOf("\n") + 1);
}

/** A broken final line is an internal error of the process that wrote it. */
function broken(message: string, cause?: unknown): LimenError {
	return new LimenError({ class: "internal", code: "INTERNAL", message, next: "", cause });
}

function isOutcomeClass(name: unknown): name is OutcomeClass {
	return typeof name === "string" && Object.hasOwn(EXIT_CODES, name);
}

/** `value` as an outcome when it has the shape of a final line; otherwise a thrown error that names the field. */
function checkedOutcome(value: unknown, what: string): Outcome {
	if (typeof value !== "object" || value === null || Array.isArray(value)) {
		throw broken(`${what} is not an object`);
	}
	const fields = new Map(Object.entries(value));
	const unknown = [...fields.keys()].filter((key) => !KEYS.includes(key));
	if (unknown.length > 0) {
		throw broken(`${what} has the unknown key ${unknown.join(", ")}`);
	}
	const name = fields.get("class");
	if (!isOutcomeClass(name)) {
		throw broken(`${what} has the class ${JSON.stringify(name)}, not one of ${Object.keys(EXIT_CODES).join(", ")}`);
	}
	const code = checkedCode(fields.get("code"), name, what);
	const next = fields.get("next");
	if (typeof next !== "string") {
		throw broken(`${what} has a next that is not a string: ${JSON.stringify(next)}`);
	}
	const ids = fields.get("ids");
	return ids === undefined ? { class: name, code, next } : { class: name, code, next, ids: checkedIds(ids, what) };
}

function checkedCode(code: unknown, name: OutcomeClass, what: string): 0 | string {
	if (name === "ok") {
		if (code !== 0) {
			throw broken(`${what} has the code ${JSON.stringify(code)} for class ok, not 0`);
		}
		return 0;
	}
	if (typeof code !== "string" || !CODE.test(code)) {
		throw broken(`${what} has the code ${JSON.stringify(code)} for class ${name}, not an upper-case identifier`);
	}
	return code;
}

function checkedIds(ids: unknown, what: string): Ids {
	if (typeof ids !== "object" || ids === null || Array.isArray(ids)) {
		throw broken(`${what} has ids that are not an object`);
	}
	const checked: { job?: string; ticket?: string; question?: string } = {};
	for (const [key, value] of Object.entries(ids)) {
		if (key !== "job" && key !== "ticket" && key !== "question") {
			throw broken(`${what} has the unknown ids key ${key}, not one of ${Object.keys(ID_FORMATS).join(", ")}`);
		}
		if (typeof value !== "string" || !ID_FORMATS[key].test(value)) {
			throw broken(`${what} has ids.${key} ${JSON.stringify(value)}, not in the format ${ID_FORMATS[key]}`);
		}
		checked[key] = value;
	}
	return checked;
}
