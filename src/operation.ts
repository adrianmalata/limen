// The one shape of a change command (T-38, T-25 (1)). A domain operation decides in `validate`, which gets a read view
// of the state with no write method, so a refusal (exit code 1) or a usage error (exit code 2) arises before anything
// is written: the type of the view gives that guarantee, not a convention (z. 14). `apply` then runs under a lock of
// the shared lock module (A-018), after the runner has read again every fact `validate` held: a fact that changed in
// between ends the command in STATE_CHANGED (exit code 3) before its first write, the compare-and-swap of A-019 over
// what the plan relied on, with the command's own call as `next`. What follows the first write is T-38 (3): one atomic
// effect (src/atomic-write.ts), or steps a record names and a rerun continues; a failure there never exits 1
// (`stepFailure`), and a plain `Error` of a read in validate is the environment's (`CHECK_FAILED`), never
// `UNTYPED` (T-02). A registry handler made by `operationHandler` must reach the runner;
// the shape ratchet of test/structure.test.ts reads that mark (R-082 brings the rest of the change commands here).
import { AsyncLocalStorage } from "node:async_hooks";
import { existsSync } from "node:fs";
import { readFile } from "node:fs/promises";
import { type JobRecord, jobFolders, readRecord } from "./job/record.ts";
import { type Guarded, withLock } from "./lock.ts";
import { failureOf, isRefusal, LimenError, type Refusal } from "./outcome.ts";
import { hasCode } from "./system-error.ts";

/** The code of a fact `validate` held that another process changed before `apply` (T-38 (2)). */
export const STATE_CHANGED = "STATE_CHANGED";

/**
 * What `validate` reads the state through. It has reads only, and no method that writes: the type test in
 * test/operation.test.ts fails to compile once one is added. `hold` is the one way a fact reaches `apply`'s re-check.
 */
export type StateView = {
	/** The record of the job folder `jobDir`, or undefined when it has none (src/job/record.ts). */
	readonly record: (jobDir: string) => Promise<JobRecord | undefined>;
	/** The job folders of `jobsRoot`; a project an older Limen recorded refuses (src/job/record.ts). */
	readonly jobs: (jobsRoot: string) => Promise<readonly string[]>;
	/** Whether `path` exists. */
	readonly exists: (path: string) => boolean;
	/** The text of the file `path`, or undefined when there is none; any other failure to read it throws. */
	readonly text: (path: string) => Promise<string | undefined>;
	/**
	 * What `read` answers now, kept with `what` it is: the runner asks `read` again under `apply`'s lock, and a
	 * different answer, or a refusal from it, ends the command in STATE_CHANGED before its first write.
	 */
	readonly hold: <T>(what: string, read: () => T | Promise<T>) => Promise<T>;
};

/**
 * A domain operation (T-38 (1), (2)). `validate` decides from the state alone and returns the plan, or a refusal.
 * `lock` names the lock `apply` runs under; an operation that holds no fact may have none, and then `apply` runs at
 * once. `again` is the command line that runs the operation again, the `next` of its STATE_CHANGED.
 */
export type Operation<Plan, Applied> = {
	readonly validate: (view: StateView) => Promise<Plan | Refusal>;
	readonly lock?: (plan: Plan) => Guarded;
	readonly apply: (plan: Plan) => Promise<Applied>;
	readonly again?: string | null;
};

/** A validated operation: its plan, and the `apply` that takes the lock, re-reads the held facts and writes, once. */
export type Checked<Plan, Applied> = { readonly plan: Plan; readonly apply: () => Promise<Applied> };

/** A fact `validate` held: what it is, how to read it again, and the answer it gave. */
type Held = { readonly what: string; readonly read: () => unknown; readonly answer: string };

/**
 * Runs `validate` of `operation` and returns its plan with the `apply` to run next; a refusal it returns is thrown,
 * so nothing is written. A caller that must hold a lock of its own around the writes (the group's launch lock around a
 * team's spawn) takes it between the two calls, after the refusals.
 */
export async function validated<Plan, Applied>(operation: Operation<Plan, Applied>): Promise<Checked<Plan, Applied>> {
	const run = reached.getStore();
	if (run) {
		run.reached = true;
	}
	const held: Held[] = [];
	let plan: Plan | Refusal;
	try {
		plan = await operation.validate(stateView(held));
	} catch (error) {
		throw checkFailure(error);
	}
	if (isRefusal(plan)) {
		throw plan;
	}
	let applied = false;
	return {
		plan,
		apply: async () => {
			if (applied) {
				throw internal("OPERATION_APPLIED", "an operation's apply ran twice for one validate");
			}
			applied = true;
			const lock = operation.lock?.(plan);
			if (lock === undefined) {
				// A fact with no lock to read it again under would be a check that nothing repeats.
				if (held.length > 0) {
					throw internal("OPERATION_UNLOCKED", `an operation holds ${held[0]?.what} but names no lock`);
				}
				return applyOnce(operation, plan);
			}
			try {
				return await withLock(lock, async () => {
					await readAgain(held, operation.again ?? null);
					return applyOnce(operation, plan);
				});
			} catch (error) {
				// The lock's own file is the first write; a failure to take or release it is a step's, too.
				throw withAgain(stepFailure(error), operation.again ?? null);
			}
		},
	};
}

/** The apply of `operation`, whose failure is a step's (`stepFailure`), never a refusal. */
async function applyOnce<Plan, Applied>(operation: Operation<Plan, Applied>, plan: Plan): Promise<Applied> {
	try {
		return await operation.apply(plan);
	} catch (error) {
		throw withAgain(stepFailure(error), operation.again ?? null);
	}
}

/**
 * A STATE_CHANGED that a step of apply found (a member slot taken, a gate entered since validate) names the command
 * that runs the operation again, as the re-check's own does (T-37: the same command, with its concrete values).
 */
function withAgain(error: unknown, again: string | null): unknown {
	if (!(error instanceof LimenError && error.code === STATE_CHANGED && error.next === null && again !== null)) {
		return error;
	}
	return new LimenError({ class: error.class, code: error.code, message: error.message, next: again, cause: error });
}

/**
 * A failure of a read in validate or in the re-check (T-02): git or the file system gives a plain `Error`, which is
 * the environment's failure, `CHECK_FAILED`, never `UNTYPED`; a typed failure keeps what it is. Every refusal on the
 * nine commands' paths is typed where it is thrown, so a plain `Error` here is a failed read, not a check.
 */
function checkFailure(error: unknown): unknown {
	if (!isPlainError(error)) {
		return error;
	}
	return new LimenError({
		class: "environment",
		code: "CHECK_FAILED",
		message: error.message,
		next: null,
		cause: error,
	});
}

/** Whether `error` is a plain `Error`, as Node's file system, child processes and the author's untyped throws give. */
function isPlainError(error: unknown): error is Error {
	return error instanceof Error && !(error instanceof LimenError) && Object.getPrototypeOf(error) === Error.prototype;
}

/**
 * The failure of a step after validate (T-38 (1), (3)): never a refusal, so it exits 3, 4 or 5. A typed refusal or
 * usage error there is a defect of the operation, an internal error; an untyped one, which git or the file system
 * gives as a plain `Error`, is the environment's failure; any other failure keeps its class.
 */
export function stepFailure(error: unknown): unknown {
	if (isRefusal(error)) {
		return new LimenError({
			class: "internal",
			code: "REFUSED_AFTER_VALIDATE",
			message: `${error.code} after the command's checks: ${error.message}`,
			next: null,
			cause: error,
		});
	}
	if (isPlainError(error)) {
		return new LimenError({
			class: "environment",
			code: "STEP_FAILED",
			message: error.message,
			next: null,
			cause: error,
		});
	}
	return error;
}

/**
 * The command's error after a step failed and `cleanup` undid what it could (T-01): the step's failure stays the error,
 * as `stepFailure` gives it, and a cleanup that failed too is added to its message, with both thrown values as the
 * cause, so neither hides the other.
 */
export async function cleanedUp(error: unknown, cleanup: () => Promise<void>): Promise<unknown> {
	const first = stepFailure(error);
	try {
		await cleanup();
	} catch (cleanupError) {
		const failure = failureOf(first);
		const reason = cleanupError instanceof Error ? cleanupError.message : String(cleanupError);
		return new LimenError({
			class: failure.class,
			code: failure.code,
			message: `${failure.message}\nthe cleanup after it failed too: ${reason}`,
			next: failure.next,
			cause: new AggregateError([error, cleanupError]),
		});
	}
	return first;
}

/** `validate`, then `apply` under its lock: the whole shape of T-38 for a caller that holds no lock of its own. */
export async function runOperation<Plan, Applied>(operation: Operation<Plan, Applied>): Promise<Applied> {
	return (await validated(operation)).apply();
}

/**
 * The failure of a fact that another process changed after `validate` read it (T-38 (2)): transient, so a rerun,
 * which validates again, is safe (T-02); `again` is that rerun.
 */
export function stateChanged(what: string, again: string | null = null): LimenError {
	return new LimenError({
		class: "transient",
		code: STATE_CHANGED,
		message: `${what} changed since the command checked it, so it wrote nothing; run it again`,
		next: again,
	});
}

/** Whether a handler of one command run reached the runner; `operationHandler` gives each run its own. */
const reached = new AsyncLocalStorage<{ reached: boolean }>();
/** The handlers `operationHandler` made, which the shape ratchet counts as going through the runner. */
const THROUGH_RUNNER = new WeakSet<object>();

/**
 * The registry handler of a command that goes through the runner (T-38): a success that never reached `validated` is
 * an internal error, so the mark the ratchet reads cannot stay on a handler that bypasses the shape. The handler keeps
 * its name, by which test/structure.test.ts finds the file of a command.
 */
export function operationHandler<Args extends unknown[], Result>(
	handler: (...args: Args) => Promise<Result>,
): (...args: Args) => Promise<Result> {
	const wrapped = (...args: Args): Promise<Result> =>
		reached.run({ reached: false }, async () => {
			const result = await handler(...args);
			if (!reached.getStore()?.reached) {
				throw internal("OPERATION_SKIPPED", `${handler.name} returned without running its operation`);
			}
			return result;
		});
	Object.defineProperty(wrapped, "name", { value: handler.name });
	THROUGH_RUNNER.add(wrapped);
	return wrapped;
}

/** Whether `handler` is a handler `operationHandler` made, one that goes through the runner. */
export function throughRunner(handler: object): boolean {
	return THROUGH_RUNNER.has(handler);
}

/** The view `validate` gets: the reads of the state, and `hold`, which keeps each fact for the re-check. */
function stateView(held: Held[]): StateView {
	return {
		record: (jobDir) => readRecord(jobDir),
		jobs: (jobsRoot) => jobFolders(jobsRoot),
		exists: (path) => existsSync(path),
		text: async (path) => {
			try {
				return await readFile(path, "utf8");
			} catch (error) {
				if (hasCode(error, "ENOENT")) {
					return undefined;
				}
				throw error;
			}
		},
		hold: async (what, read) => {
			const answer = await read();
			held.push({ what, read, answer: answerOf(answer) });
			return answer;
		},
	};
}

/**
 * Reads every held fact again under the lock; the first that answers otherwise, or refuses now, ends the command in
 * STATE_CHANGED. Any other failure of a read is the failure it is.
 */
async function readAgain(held: readonly Held[], again: string | null): Promise<void> {
	for (const fact of held) {
		let answer: string;
		try {
			answer = answerOf(await fact.read());
		} catch (error) {
			if (isRefusal(error)) {
				throw stateChanged(fact.what, again);
			}
			throw checkFailure(error);
		}
		if (answer !== fact.answer) {
			throw stateChanged(fact.what, again);
		}
	}
}

/** A fact's answer in a form two reads compare by: its JSON, with undefined as a word of its own. */
function answerOf(value: unknown): string {
	return value === undefined ? "undefined" : JSON.stringify(value);
}

/** An internal error of the runner's own rules (T-02, exit code 5). */
function internal(code: string, message: string): LimenError {
	return new LimenError({ class: "internal", code, message, next: null });
}
