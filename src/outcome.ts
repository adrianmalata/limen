// The one error type of Limen and the final JSON line of every command (T-01, T-02, D-022, D-028). This module alone
// writes the line (`finalLine`, for `main`) and alone reads it (`readOutcome`, for every caller of the CLI, T-26 (4)),
// through the validators of src/boundary.ts (T-27 (2)). That module takes `LimenError` from here, so this one uses its
// exports only inside functions, never while it loads: either module can then load first.
import { at, checkValue, matching, nullOr, object, oneOf, optional, parseJson } from "./boundary.ts";
import { JOB_ID } from "./job/id.ts";

/** The exit code of each class (T-02): the exit code is the class, and the final line carries the detail. */
export const EXIT_CODES = { ok: 0, refused: 1, usage: 2, transient: 3, environment: 4, internal: 5 } as const;
export type OutcomeClass = keyof typeof EXIT_CODES;
export type FailureClass = Exclude<OutcomeClass, "ok">;

/** The identifiers of what a command created or changed, never its data (D-022); the registry declares each command's keys. */
export type Ids = { readonly job?: string; readonly ticket?: string; readonly question?: string };
export type IdKey = keyof Ids;
/**
 * A command's result on success: `next` as the final line carries it, the `ids` of what it made, and `text`, the text
 * for people that `main` prints just before the final line. A command that returns nothing ends with `next` null.
 */
export type Success = { readonly next: string | null; readonly ids?: Ids; readonly text?: string };
/**
 * Where a command's operations put the text they report as they go: `line` for stdout, `diagnostic` for a line beside
 * the result on stderr. `main` holds it and prints it in its order when the command ends, before the result's text or
 * the failure's message (D-061 (3)), so a failure keeps the report that came before it.
 */
export type CommandText = {
	readonly line: (text: string) => void;
	readonly diagnostic: (text: string) => void;
};
/**
 * The final line (T-37; D-045, D-046): `code` is null exactly when `class` is `ok`, otherwise the failure's identifier,
 * so the field has one type; `next` is a Limen command with concrete values, or null when no command follows.
 */
export type Outcome =
	| { readonly class: "ok"; readonly code: null; readonly next: string | null; readonly ids?: Ids }
	| { readonly class: FailureClass; readonly code: string; readonly next: string | null; readonly ids?: Ids };
/** What a finished CLI process left: its exit status and both streams. */
export type Output = { readonly status: number | null; readonly stdout: string; readonly stderr: string };

/** The code of a refusal the author threw as a plain `Error`: it has no type and no next command until R-082. */
export const UNTYPED = "UNTYPED";
/**
 * The text line of a command whose success creates exactly one job (D-022); it is text for the coordinator, not a
 * command, so that success's `next` is null (D-046 (3)).
 */
export const JOB_STARTED = "End your turn; Limen wakes you when the job ends.";

const FAILURE_CLASSES: readonly string[] = ["refused", "usage", "transient", "environment", "internal"];
const CODE = /^[A-Z][A-Z0-9_]*$/;
/**
 * A `next` starts as a Limen command does, with `limen`, a space and a word, so prose, `""` and `0` never pass; the
 * tests' reader of the final line parses the rest of every `next` a test reads (D-046 (3)).
 */
const NEXT = /^limen \S/;
/**
 * The format of each `ids` value: a job id of any form Limen has written (src/job/id.ts), a ticket number, a question
 * number.
 */
const ID_FORMATS = {
	job: JOB_ID,
	ticket: /^F\d{3,}$/,
	question: /^Q-\d{3}$/,
} as const;
/** The keys of the final line in their order; `ids` is the one a line may leave out (D-022). The help names them. */
export const FINAL_LINE_KEYS: ReadonlyArray<{ readonly key: string; readonly optional?: true }> = [
	{ key: "class" },
	{ key: "code" },
	{ key: "next" },
	{ key: "ids", optional: true },
];
const KEYS: readonly string[] = FINAL_LINE_KEYS.map(({ key }) => key);
const OUTCOME_CLASSES: readonly OutcomeClass[] = Object.keys(EXIT_CODES).filter(isOutcomeClass);
const ID_KEYS: readonly IdKey[] = ["job", "ticket", "question"];

type FailureFields = {
	readonly class: FailureClass;
	readonly code: string;
	readonly message: string;
	readonly next: string | null;
	readonly cause?: unknown;
};

/**
 * A failure with its class, its code and the next command (T-01). Every failure gives `next`: a Limen command with
 * concrete values, or null when no command follows, and then its message says what to do (D-045 (2), D-046 (1)).
 */
export class LimenError extends Error {
	readonly class: FailureClass;
	readonly code: string;
	readonly next: string | null;
	constructor(failure: FailureFields) {
		super(failure.message, failure.cause === undefined ? undefined : { cause: failure.cause });
		if (!FAILURE_CLASSES.includes(failure.class)) {
			throw new TypeError(`LimenError class ${JSON.stringify(failure.class)} is not a failure class`);
		}
		if (!CODE.test(failure.code)) {
			throw new TypeError(`LimenError code ${JSON.stringify(failure.code)} is not an upper-case identifier`);
		}
		if (failure.next !== null && !NEXT.test(failure.next)) {
			throw new TypeError(`LimenError ${failure.code} has the next ${JSON.stringify(failure.next)}, not a command`);
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
		return new LimenError({ class: "refused", code: UNTYPED, message: error.message, next: null, cause: error });
	}
	const message = error instanceof Error ? error.message : String(error);
	return new LimenError({ class: "internal", code: "INTERNAL", message, next: null, cause: error });
}

/** The final line for `outcome`: `class`, `code`, `next`, then `ids` when given; an invalid outcome throws. */
export function finalLine(outcome: Outcome): string {
	const valid = checkValue("the final line", outcome, finalLineOf, { uncut: true });
	if (valid instanceof LimenError) {
		throw broken(valid.message, valid);
	}
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
	// A broken line is the writer's internal error, not bad data of an owner file, so it keeps class internal; it is one
	// line, so its message shows it uncut.
	const outcome = parseJson(`the final line on ${stream}`, line, finalLineOf, { uncut: true });
	if (outcome instanceof LimenError) {
		throw broken(outcome.message, outcome);
	}
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
	return new LimenError({ class: "internal", code: "INTERNAL", message, next: null, cause });
}

function isOutcomeClass(name: unknown): name is OutcomeClass {
	return typeof name === "string" && Object.hasOwn(EXIT_CODES, name);
}

/** The validator of the final line (src/boundary.ts): `code` is null for class `ok`, otherwise an identifier. */
function finalLineOf(value: unknown, field: string): Outcome {
	const fields = object(KEYS)(value, field);
	const name = oneOf(OUTCOME_CLASSES)(fields.get("class"), at(field, "class"));
	const code = fields.get("code");
	if (name === "ok") {
		return { class: name, code: oneOf([null])(code, at(field, "code")), ...lineTail(fields, field) };
	}
	const failure = matching(CODE, "an upper-case identifier")(code, at(field, "code"));
	return { class: name, code: failure, ...lineTail(fields, field) };
}

/** The fields of the line after `code`: `next`, which is there and is null or starts as a command does, and `ids`. */
function lineTail(fields: ReadonlyMap<string, unknown>, field: string): Pick<Outcome, "next" | "ids"> {
	const next = nullOr(matching(NEXT, "a Limen command"))(fields.get("next"), at(field, "next"));
	const ids = optional(idsOf)(fields.get("ids"), at(field, "ids"));
	return ids === undefined ? { next } : { next, ids };
}

/** The validator of the line's `ids`: each key known, each value in the format of its kind. */
function idsOf(value: unknown, field: string): Ids {
	const fields = object(ID_KEYS)(value, field);
	const ids: { job?: string; ticket?: string; question?: string } = {};
	for (const [key, id] of fields) {
		const name = ID_KEYS.find((known) => known === key);
		if (name !== undefined) {
			ids[name] = matching(ID_FORMATS[name], `the format ${ID_FORMATS[name]}`)(id, at(field, name));
		}
	}
	return ids;
}
