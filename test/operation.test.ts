// The shape of a change command (src/operation.ts, T-38): a refusal in validate writes nothing, apply re-reads what
// validate held under its lock, and a fact another process changed in between ends the command in STATE_CHANGED
// (exit code 3) before its first write; the type of the read view leaves validate no write method.
import assert from "node:assert/strict";
import { existsSync } from "node:fs";
import { mkdtemp, realpath, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { type TestContext, test } from "node:test";
import { checkedSpawn, startChecked } from "../src/job/spawning.ts";
import { lockPath } from "../src/lock.ts";
import {
	cleanedUp,
	type Operation,
	operationHandler,
	runOperation,
	STATE_CHANGED,
	type StateView,
	stateChanged,
	throughRunner,
	validated,
} from "../src/operation.ts";
import { type CommandText, EXIT_CODES, failureOf, LimenError, refused } from "../src/outcome.ts";
import { ticketDoneOperation } from "../src/project/ticket-folders.ts";
import { withEnvironment } from "./environment.ts";
import { git, plant, TICKET } from "./plant.ts";
import { snapshot } from "./snapshot.ts";

/**
 * Never called; `npx tsc --noEmit` compiles it (T-38 (1)). Each line tries a write on the read view of validate, and
 * `@ts-expect-error` makes the check fail once the view gains a method of that name.
 */
export function validateThatWrites(view: StateView): void {
	// @ts-expect-error: the read view has no method that writes a file.
	view.write("record.json", "{}");
	// @ts-expect-error: the read view has no transition of a job record.
	view.transition("job", { from: ["running"] });
	// @ts-expect-error: the read view makes no folder.
	view.mkdir(".limen/jobs");
	// @ts-expect-error: the read view renames nothing.
	view.rename("a", "b");
	// @ts-expect-error: the read view removes nothing.
	view.remove("a");
	// @ts-expect-error: the read view appends to no log.
	view.append("log", "line");
}

/** An operation whose validate tries to write through the view does not compile either. */
export const writingOperation: Operation<string, string> = {
	validate: async (view) => {
		// @ts-expect-error: validate gets only reads of the state.
		await view.write("spec/build.md", "");
		return "plan";
	},
	apply: async (plan) => plan,
};

/** Whether the union `A` is the union `B`: the names are those and no other. */
type Exactly<A, B> = [A] extends [B] ? ([B] extends [A] ? true : false) : false;
/** The names of the read view, for `npx tsc --noEmit`: a method of any other name, a write of any name, fails here. */
const VIEW_NAMES: Exactly<keyof StateView, "exists" | "hold" | "jobs" | "record" | "text"> = true;

/** A folder for one test, removed after it. */
async function folder(t: TestContext): Promise<string> {
	const dir = await realpath(await mkdtemp(join(tmpdir(), "limen-operation-")));
	t.after(() => rm(dir, { recursive: true, force: true }));
	return dir;
}

/** Text a spawn reports, dropped: the tests read the job's record and the snapshot. */
const QUIET: CommandText = { line: () => {}, diagnostic: () => {} };

// T-38 (1): the guarantee is the view's whole set of names, not the six write names above; the type and the view that
// validate gets both hold exactly these five.
test("the read view validate gets has exactly the reads record, jobs, exists, text and hold", async () => {
	let names: string[] = [];
	await runOperation({
		validate: async (view) => {
			names = Object.keys(view).sort();
			return "plan";
		},
		apply: async () => {},
	});
	assert.deepEqual([VIEW_NAMES, names], [true, ["exists", "hold", "jobs", "record", "text"]]);
});

test("a refusal validate returns is thrown, and apply never runs nor takes its lock", async (t) => {
	const dir = await folder(t);
	let applied = false;
	const run = runOperation({
		validate: async () => refused("NOT_NOW", "the condition does not hold"),
		lock: () => ({ folder: dir }),
		apply: async () => {
			applied = true;
		},
	});
	await assert.rejects(run, { class: "refused", code: "NOT_NOW" });
	assert.deepEqual([applied, existsSync(lockPath({ folder: dir }))], [false, false]);
});

test("apply runs under its lock once validate's held facts read the same again", async (t) => {
	const dir = await folder(t);
	await writeFile(join(dir, "fact"), "one\n");
	const result = await runOperation({
		validate: (view) => view.hold("the fact", () => view.text(join(dir, "fact"))),
		lock: () => ({ folder: dir }),
		apply: async (plan) => [plan, existsSync(lockPath({ folder: dir }))],
	});
	assert.deepEqual(result, ["one\n", true]);
});

test("STATE_CHANGED: a held fact another process changed after validate ends the apply with exit code 3, before it writes", async (t) => {
	const dir = await folder(t);
	await writeFile(join(dir, "fact"), "one\n");
	let applied = false;
	const checked = await validated({
		validate: (view) => view.hold("the fact", () => view.text(join(dir, "fact"))),
		lock: () => ({ folder: dir }),
		apply: async () => {
			applied = true;
		},
		again: "limen ticket done F001",
	});
	await writeFile(join(dir, "fact"), "two\n");
	await assert.rejects(checked.apply(), { class: "transient", code: STATE_CHANGED, next: "limen ticket done F001" });
	assert.deepEqual([EXIT_CODES.transient, applied], [3, false]);
});

test("STATE_CHANGED: a held fact that refuses when it is read again ends the apply before it writes", async (t) => {
	const dir = await folder(t);
	let holds = true;
	let applied = false;
	const checked = await validated({
		validate: (view) =>
			view.hold("the condition", () => {
				if (!holds) {
					throw refused("NOT_NOW", "the condition does not hold");
				}
				return "holds";
			}),
		lock: () => ({ folder: dir }),
		apply: async () => {
			applied = true;
		},
	});
	holds = false;
	await assert.rejects(checked.apply(), { class: "transient", code: STATE_CHANGED });
	assert.equal(applied, false);
});

// T-38 (1), (3): a refusal arises only in validate, and a failure after the first write exits 3, 4 or 5.
test("REFUSED_AFTER_VALIDATE: a refusal that apply throws is an internal error, never exit code 1", async () => {
	const run = runOperation({
		validate: async () => "plan",
		apply: async () => {
			throw refused("NOT_NOW", "a check that belongs in validate");
		},
	});
	await assert.rejects(run, { class: "internal", code: "REFUSED_AFTER_VALIDATE" });
});

test("STEP_FAILED: an untyped failure of apply, as git or the file system gives one, is an environment failure", async () => {
	const run = runOperation({
		validate: async () => "plan",
		apply: async () => {
			throw new Error("git worktree add failed");
		},
	});
	await assert.rejects(run, { class: "environment", code: "STEP_FAILED", message: "git worktree add failed" });
});

// T-01: a cleanup after a failed step must not hide the failure that made it run.
test("a cleanup that fails after a failed step keeps the step's class, code and next and adds the cleanup's message", async () => {
	const step = new LimenError({ class: "transient", code: "LOCK_TIMEOUT", message: "the lock was held", next: null });
	const failure = await cleanedUp(step, async () => {
		throw new Error("the gate could not be removed");
	});
	assert.deepEqual(
		[failureOf(failure).class, failureOf(failure).code, failureOf(failure).message],
		["transient", "LOCK_TIMEOUT", "the lock was held\nthe cleanup after it failed too: the gate could not be removed"],
	);
});

test("a cleanup that succeeds after a failed step leaves the step's failure as it was", async () => {
	const step = new LimenError({ class: "environment", code: "GIT_FAILED", message: "git failed", next: null });
	assert.equal(await cleanedUp(step, async () => {}), step);
});

// T-02: a read of validate that git or the file system fails is the environment's failure, never UNTYPED (exit 1).
test("CHECK_FAILED: an untyped failure in validate, as a failed file read gives one, is an environment failure", async () => {
	const run = runOperation({
		validate: async () => {
			throw new Error("EACCES: permission denied, open 'run.json'");
		},
		apply: async () => {},
	});
	await assert.rejects(run, { class: "environment", code: "CHECK_FAILED", message: /EACCES/ });
});

test("CHECK_FAILED: an untyped failure of a held fact read again under the lock is an environment failure", async (t) => {
	const dir = await folder(t);
	let fails = false;
	const checked = await validated({
		validate: (view) =>
			view.hold("the fact", () => {
				if (fails) {
					throw new Error("EIO: i/o error, read");
				}
				return "one";
			}),
		lock: () => ({ folder: dir }),
		apply: async () => {},
	});
	fails = true;
	await assert.rejects(checked.apply(), { class: "environment", code: "CHECK_FAILED" });
});

// T-37: a STATE_CHANGED that a step of apply finds (a member slot taken, a gate entered) names the same command.
test("STATE_CHANGED: one that apply throws with no next names the operation's own command line in next", async () => {
	const run = runOperation({
		validate: async () => "plan",
		apply: async () => {
			throw stateChanged("the launch slots of group g");
		},
		again: "limen spawn --engine pi work",
	});
	await assert.rejects(run, { class: "transient", code: STATE_CHANGED, next: "limen spawn --engine pi work" });
});

test("OPERATION_UNLOCKED: an operation that holds a fact but names no lock is an internal error, and apply never runs", async () => {
	let applied = false;
	const checked = await validated({
		validate: (view) => view.hold("the fact", () => "one"),
		apply: async () => {
			applied = true;
		},
	});
	await assert.rejects(checked.apply(), { class: "internal", code: "OPERATION_UNLOCKED" });
	assert.equal(applied, false);
});

test("OPERATION_APPLIED: the apply of one validate runs once, and a second call is an internal error", async () => {
	const checked = await validated({ validate: async () => "plan", apply: async (plan) => plan });
	assert.equal(await checked.apply(), "plan");
	await assert.rejects(checked.apply(), { class: "internal", code: "OPERATION_APPLIED" });
});

test("OPERATION_SKIPPED: a handler marked as going through the runner that returns without it is an internal error", async () => {
	const skipping = operationHandler(async function skipping() {
		return "done";
	});
	assert.equal(throughRunner(skipping), true);
	await assert.rejects(skipping(), { class: "internal", code: "OPERATION_SKIPPED" });
	const running = operationHandler(async function running() {
		return runOperation({ validate: async () => "plan", apply: async (plan) => plan });
	});
	assert.deepEqual([await running(), running.name], ["plan", "running"]);
});

// T-38 (2): the spawn's validate read the base commit and checked the ticket at it; a commit on main in between is a
// base the check never read. The jobs lock is a file in `.limen/`, which exists, so the lock leaves no file behind.
test("STATE_CHANGED: a spawn whose base commit moved between validate and apply exits 3 and leaves the snapshot identical", async (t) => {
	const p = await plant();
	t.after(() => p.cleanup());
	withEnvironment(t, p.env);
	const route = { engine: "pi", provider: "p", model: "m", thinking: "high" };
	const request = { task: [`Implement F001. Ticket: ${TICKET}`], ...route };
	const again = `limen spawn --engine pi --provider p --model m --thinking high 'Implement F001. Ticket: ${TICKET}'`;
	const checked = await checkedSpawn(request, p.root, QUIET, { again });
	git(p.root, "commit", "-q", "--allow-empty", "-m", "another commit on main");
	const changed = snapshot(p.root);
	await assert.rejects(startChecked(checked), { class: "transient", code: STATE_CHANGED, next: again });
	assert.deepEqual(snapshot(p.root), changed);
});

test("STATE_CHANGED: a ticket done whose ticket moved between validate and apply exits 3 and moves nothing", async (t) => {
	const p = await plant();
	t.after(() => p.cleanup());
	const checked = await validated(ticketDoneOperation(["F001"], undefined, p.root, "limen ticket done F001"));
	await writeFile(join(p.root, TICKET), "# F001 · The demo plant has one ticket, edited\n");
	git(p.root, "commit", "-qam", "the ticket changed");
	const changed = snapshot(p.root);
	await assert.rejects(checked.apply(), { class: "transient", code: STATE_CHANGED, next: "limen ticket done F001" });
	assert.deepEqual(snapshot(p.root), changed);
});
