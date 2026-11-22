// The boundary parsing module (T-27 (2)): data from outside Limen's code, such as an owner file, a seat file or the
// final line of a command, becomes a typed value here through hand-written validators, or a typed error that names
// the file, the field and the expectation (T-01). It is the one module that parses JSON; a scan in
// test/structure.test.ts holds every other site to a count that only falls, until R-082 brings it to zero.
//
// src/outcome.ts reads the final line through this module, and this module takes `LimenError` from it. So that either
// of the two can load first, neither uses the other's exports while it loads: here `LimenError` appears only inside
// functions.
import { parseDuration } from "./job/job.ts";
import { LimenError } from "./outcome.ts";

/**
 * A hand-written validator: `value`, found at `field` of the whole value, as a `T`. `field` is a path such as
 * `toolCalls` or `ids.job`, and empty for the whole value. A value of another shape throws a mismatch, which
 * `checkValue` and `parseJson` turn into the typed error.
 */
export type Validator<T> = (value: unknown, field: string) => T;

/** Data from outside that a validator refused: a `LimenError` that also names the file, the field and the expectation. */
export type BadData = LimenError & { readonly file: string; readonly field: string; readonly expected: string };

/** At most this many characters of a refused value go into the message. */
const SHOWN = 40;
const DURATION = "a duration such as 90s, 20m or 2h";

/**
 * What a validator wanted at a field and what it found there. Validators run only through `checkValue` and
 * `parseJson`, which turn it into the typed error, so no caller of this module gets one.
 */
class Mismatch extends Error {
	readonly field: string;
	readonly expected: string;
	readonly got: unknown;
	constructor(field: string, expected: string, got: unknown) {
		super(`${field}: expected ${expected}`);
		this.name = "Mismatch";
		this.field = field;
		this.expected = expected;
		this.got = got;
	}
}

function mismatch(field: string, expected: string, got: unknown): never {
	throw new Mismatch(field, expected, got);
}

/** The value `validator` gives, or the mismatch it threw; any other error goes on, since it is not about the data. */
function attempt<T>(validator: Validator<T>, value: unknown, field: string): T | Mismatch {
	try {
		return validator(value, field);
	} catch (error) {
		if (error instanceof Mismatch) {
			return error;
		}
		throw error;
	}
}

/**
 * How a message shows the value it got. A data file can be long, so its values are cut after `SHOWN` characters; a
 * source that is one line a command wrote, such as the final line, is shown `uncut`.
 */
type Shown = { readonly uncut?: true };

/**
 * What `escaped` turns into a `\uXXXX` escape. `JSON.stringify` already escapes the C0 controls (U+0000 to U+001F), a
 * quote and a backslash, and leaves DEL, the C1 controls, U+2028 and U+2029 raw, so `escaped` takes those; it also
 * takes the format characters (`\p{Cf}`, such as U+202E), which can change how a terminal shows the rest of a line.
 */
const RAW = /[\p{Cc}\p{Cf}\p{Zl}\p{Zp}]/gu;

/**
 * `text` with each character of `RAW` as `\uXXXX` escapes, one per UTF-16 unit, so a character beyond U+FFFF becomes
 * its surrogate pair: no line terminator, control or format character reaches a log line raw.
 */
function escaped(text: string): string {
	return text.replace(RAW, (char) =>
		[...Array(char.length).keys()]
			.map((index) => `\\u${char.charCodeAt(index).toString(16).padStart(4, "0")}`)
			.join(""),
	);
}

/**
 * The pieces a cut never splits: the two escapes of one character beyond U+FFFF (a high and a low surrogate), one
 * escape of `JSON.stringify` or `escaped`, else one code point.
 */
const PIECE = /\\u[dD][89abAB][0-9a-fA-F]{2}\\u[dD][c-fC-F][0-9a-fA-F]{2}|\\u[0-9a-fA-F]{4}|\\[\s\S]|[\s\S]/gu;

/** `text` cut after at most `SHOWN` characters, at the end of a piece, so no escape or surrogate pair is split. */
function cut(text: string): string {
	let kept = "";
	for (const [piece] of text.matchAll(PIECE)) {
		if (kept.length + piece.length > SHOWN) {
			return `${kept}…`;
		}
		kept += piece;
	}
	return kept;
}

/**
 * The value a validator refused, as its JSON with the characters of `RAW` escaped (`escaped`), cut after `SHOWN`
 * characters unless `uncut`.
 */
function shownValue(value: unknown, { uncut }: Shown): string {
	const text = escaped(value === undefined ? "nothing" : (JSON.stringify(value) ?? String(value)));
	return !uncut && text.length > SHOWN ? cut(text) : text;
}

/**
 * A field's path escaped as the value is, without the quotes, so that a key from the data with a newline or another
 * control character keeps a log line one line. The `kept` lines of prune, land and abandon show a path a job chose,
 * such as a nested repository's, through it too (R-030), so that path cannot add a line to what the coordinator reads.
 */
export function shownField(field: string): string {
	return escaped(JSON.stringify(field).slice(1, -1));
}

/**
 * The typed error, class `environment` and code `BAD_DATA`: `<file>: <field>: expected <expected>, got <value>`, or
 * `<file>: expected <expected>, got <value>` when the field is the whole value.
 */
function badData(
	file: string,
	refused: { readonly field: string; readonly expected: string; readonly got: unknown },
	shown: Shown,
	cause?: unknown,
): BadData {
	const { field, expected, got } = refused;
	const place = field === "" ? "" : `${shownField(field)}: `;
	const message = `${file}: ${place}expected ${expected}, got ${shownValue(got, shown)}`;
	const error = new LimenError({ class: "environment", code: "BAD_DATA", message, next: null, cause });
	return Object.assign(error, { file, field, expected });
}

/**
 * The typed error for a value that a type guard outside this module refused at `field`. The guards of Pi's events
 * (src/runtime/pi-api.ts) return the value itself, with its getters and methods, which a validator here would copy,
 * so they check it with their own predicates and give a refusal this same error.
 */
export function refusedValue(
	file: string,
	refused: { readonly field: string; readonly expected: string; readonly got: unknown },
): BadData {
	return badData(file, refused, {});
}

/** "a", "a or b", "a, b or c". */
function alternatives(items: readonly string[]): string {
	return items.length > 1 ? `${items.slice(0, -1).join(", ")} or ${items.at(-1)}` : items.join("");
}

function knownFields(known: readonly string[]): string {
	return `one of the fields ${alternatives(known)}`;
}

/**
 * `text` from `file`, a path or a name, parsed as JSON and checked by `validator`: the typed value, or the typed error.
 * A text that is not JSON gives an empty field and the expectation "JSON".
 */
export function parseJson<T>(file: string, text: string, validator: Validator<T>, shown: Shown = {}): T | BadData {
	let parsed: unknown;
	try {
		parsed = JSON.parse(text);
	} catch (cause) {
		return badData(file, { field: "", expected: "JSON", got: text }, shown, cause);
	}
	return checkValue(file, parsed, validator, shown);
}

/** A value from `file` that is already parsed, found at `field` (the whole value by default), checked by `validator`. */
export function checkValue<T>(
	file: string,
	value: unknown,
	validator: Validator<T>,
	options: Shown & { readonly field?: string } = {},
): T | BadData {
	const checked = attempt(validator, value, options.field ?? "");
	return checked instanceof Mismatch ? badData(file, checked, options) : checked;
}

/**
 * The fields of an object from `file`, each optional and read on its own by its validator in `readers`: the value of
 * each valid field, and the typed error of each invalid or unknown one, so that one bad field does not discard the
 * others. `limits.json` and `start-gate.json` keep this policy.
 */
export function eachField<K extends string, T>(
	file: string,
	fields: ReadonlyMap<string, unknown>,
	readers: Readonly<Record<K, Validator<T>>>,
): { readonly values: Partial<Record<K, T>>; readonly ignored: readonly BadData[] } {
	const values: Partial<Record<K, T>> = {};
	const ignored: BadData[] = [];
	for (const [key, value] of fields) {
		if (!isField(readers, key)) {
			ignored.push(badData(file, { field: key, expected: knownFields(Object.keys(readers)), got: value }, {}));
		} else {
			const read = checkValue(file, value, readers[key], { field: key });
			if (read instanceof LimenError) {
				ignored.push(read);
			} else {
				values[key] = read;
			}
		}
	}
	return { values, ignored };
}

function isField<K extends string>(readers: Readonly<Record<K, unknown>>, key: string): key is K {
	return Object.hasOwn(readers, key);
}

/** The path of `key` inside `field`: `ids.job`, or `toolCalls` at the top. */
export function at(field: string, key: string): string {
	return field === "" ? key : `${field}.${key}`;
}

/** Any string. */
export function string(value: unknown, field: string): string {
	return typeof value === "string" ? value : mismatch(field, "a string", value);
}

/** A string that `pattern` matches; `expected` says what it stands for. */
export function matching(pattern: RegExp, expected: string): Validator<string> {
	return (value, field) =>
		typeof value === "string" && pattern.test(value) ? value : mismatch(field, expected, value);
}

type Bounds = { readonly integer?: true; readonly min?: number; readonly max?: number };

/** A finite number, or with `integer` a safe integer, within `min` and `max` where they are given. */
export function numberIn(bounds: Bounds): Validator<number> {
	const { integer, min, max } = bounds;
	const expected = `${integer ? "an integer" : "a number"}${rangeText(bounds)}`;
	return (value, field) => {
		const numeric = typeof value === "number" && (integer ? Number.isSafeInteger(value) : Number.isFinite(value));
		const within = numeric && (min === undefined || value >= min) && (max === undefined || value <= max);
		return within ? value : mismatch(field, expected, value);
	};
}

/** " from 0 to 100", " of at least 1", " of at most 9", or nothing. */
function rangeText({ min, max }: Bounds): string {
	if (min !== undefined && max !== undefined) {
		return ` from ${min} to ${max}`;
	}
	if (min !== undefined) {
		return ` of at least ${min}`;
	}
	return max === undefined ? "" : ` of at most ${max}`;
}

/** One of the literals `values`; null among them stands for a field that holds nothing (z. 10). */
export function oneOf<const T extends string | number | null>(values: readonly T[]): Validator<T> {
	const listed = alternatives(values.map((item) => JSON.stringify(item)));
	const expected = values.length > 1 ? `one of ${listed}` : listed;
	return (value, field) => {
		const found = values.find((item) => item === value);
		return found === undefined ? mismatch(field, expected, value) : found;
	};
}

/** A field that may be absent; when it is present, `validator` reads it. */
export function optional<T>(validator: Validator<T>): Validator<T | undefined> {
	return (value, field) => (value === undefined ? undefined : validator(value, field));
}

/** A field that holds null where nothing is known (z. 10), or a value that `validator` reads. */
export function nullOr<T>(validator: Validator<T>): Validator<T | null> {
	return (value, field) => {
		if (value === null) {
			return null;
		}
		const read = attempt(validator, value, field);
		if (!(read instanceof Mismatch)) {
			return read;
		}
		throw read.field === field ? new Mismatch(field, `null or ${read.expected}`, value) : read;
	};
}

/** True or false. */
export function boolean(value: unknown, field: string): boolean {
	return typeof value === "boolean" ? value : mismatch(field, "true or false", value);
}

/** An array whose every item `validator` reads; an item it refuses is named by its index, as `list.1`. */
export function arrayOf<T>(validator: Validator<T>): Validator<T[]> {
	return (value, field) =>
		Array.isArray(value)
			? value.map((item, index) => validator(item, at(field, String(index))))
			: mismatch(field, "an array", value);
}

/** An object, not null and not an array, as its fields by name; with `known`, a field outside it is refused. */
export function object(known?: readonly string[]): Validator<ReadonlyMap<string, unknown>> {
	return (value, field) => {
		if (typeof value !== "object" || value === null || Array.isArray(value)) {
			return mismatch(field, "an object", value);
		}
		const fields = new Map(Object.entries(value));
		if (known !== undefined) {
			const extra = [...fields.keys()].find((key) => !known.includes(key));
			if (extra !== undefined) {
				return mismatch(at(field, extra), knownFields(known), fields.get(extra));
			}
		}
		return fields;
	};
}

/**
 * A value that `first` or else `second` accepts. When neither does, the expectation names both; a mismatch inside a
 * field of the value goes on as it is, since that validator took the value for its kind.
 */
export function either<A, B>(first: Validator<A>, second: Validator<B>): Validator<A | B> {
	return (value, field) => {
		const one = attempt(first, value, field);
		if (!(one instanceof Mismatch)) {
			return one;
		}
		const two = attempt(second, value, field);
		if (!(two instanceof Mismatch)) {
			return two;
		}
		const deeper = [two, one].find((found) => found.field !== field);
		throw deeper ?? new Mismatch(field, `${one.expected} or ${two.expected}`, value);
	};
}

/** The `--timeout` form of `parseDuration` (`src/job/job.ts`), such as 90s, 20m or 2h, as milliseconds. */
export function duration(value: unknown, field: string): number {
	if (typeof value !== "string") {
		return mismatch(field, DURATION, value);
	}
	try {
		return parseDuration(value);
	} catch {
		return mismatch(field, DURATION, value);
	}
}
