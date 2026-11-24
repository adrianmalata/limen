// src/project/lanes.ts: the closing commit of a ticket close, built in a temporary index from the commit validate
// read, through the project's hooks, with the branch moved by compare-and-swap before the checkout follows (R-037).
import assert from "node:assert/strict";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { test } from "node:test";
import { runOperation, type StateView } from "../../src/operation.ts";
import { LimenError } from "../../src/outcome.ts";
import { closeOperation, type TicketClose, writeBoard } from "../../src/project/lanes.ts";
import { git, installHook, plant, TICKET } from "../plant.ts";
import { snapshot } from "../snapshot.ts";

// The close runs git in this process: neither the user's nor the system's configuration may name hooks or identities.
process.env.GIT_CONFIG_GLOBAL = "/dev/null";
process.env.GIT_CONFIG_NOSYSTEM = "1";

const DAY = "2026-11-21";
const DONE = "spec/features/done/2026-11/F001-demo";
const BOARD = "spec/build.md";

/** What the close of the plant's ticket F001 on `DAY` is asked, with no command that runs it again. */
function requestF001(root: string) {
	return { root: () => root, codes: ["F001"], reason: "landed", today: DAY, again: null };
}

/** The close of the plant's ticket F001 on `DAY`, validated and applied by the runner as `limen ticket done` runs it. */
function closeF001(root: string) {
	return runOperation(closeOperation(requestF001(root)));
}

/** The failure `promise` ends with; a close that succeeds fails the test. */
async function rejection(promise: Promise<unknown>): Promise<LimenError> {
	try {
		await promise;
	} catch (error) {
		assert.ok(error instanceof LimenError, String(error));
		return error;
	}
	assert.fail("the close succeeded");
}

test("a close commits on HEAD alone the moved ticket with its landed date and the board that limen board --write writes, and keeps another session's edit", async (t) => {
	const p = await plant();
	t.after(() => p.cleanup());
	const head = git(p.root, "rev-parse", "HEAD");
	await writeFile(join(p.root, "README.md"), "another session's edit\n");
	const closed = await closeF001(p.root);
	assert.deepEqual(closed, {
		moved: [DONE],
		commit: git(p.root, "rev-parse", "--short", "HEAD"),
		sha: git(p.root, "rev-parse", "HEAD"),
		day: DAY,
		stayed: [],
		added: undefined,
	});
	assert.deepEqual(
		[
			git(p.root, "rev-parse", "HEAD^@"),
			git(p.root, "diff-tree", "-r", "--no-commit-id", "--no-renames", "--name-status", "HEAD"),
			git(p.root, "show", `HEAD:${DONE}/ticket.md`).includes(`\nlanded: ${DAY}\n---\n`),
		],
		[head, `M\t${BOARD}\nD\t${TICKET}\nA\t${DONE}/ticket.md`, true],
	);
	// The status shows the board the checkout holds is the commit's, and `limen board --write` finds nothing to change.
	assert.deepEqual(
		[git(p.root, "status", "--porcelain"), await readFile(join(p.root, "README.md"), "utf8"), await writeBoard(p.root)],
		["M README.md", "another session's edit\n", false],
	);
});

test("HOOK_REJECTED: a pre-commit hook that rejects the closing commit ends the close with the hook's last 20 lines and leaves the snapshot identical", async (t) => {
	const p = await plant();
	t.after(() => p.cleanup());
	await installHook(p, "pre-commit", 'for n in $(seq 1 25); do echo "lint line $n"; done; exit 1');
	const before = snapshot(p.root);
	const failure = await rejection(closeF001(p.root));
	assert.deepEqual(
		[
			failure.class,
			failure.code,
			failure.next,
			/\bpre-commit\b/.test(failure.message),
			/^lint line 6$/m.test(failure.message) && /^lint line 25$/m.test(failure.message),
			/^lint line 5$/m.test(failure.message),
		],
		["environment", "HOOK_REJECTED", null, true, true, false],
		failure.message,
	);
	assert.deepEqual(snapshot(p.root), before);
});

test("a pre-commit hook under core.hooksPath sees the close's rename in the index it is given", async (t) => {
	const p = await plant();
	t.after(() => p.cleanup());
	const seen = join(p.parent, "seen.txt");
	await installHook(p, "pre-commit", `git diff --cached --name-status > "${seen}"`);
	await closeF001(p.root);
	assert.match(await readFile(seen, "utf8"), new RegExp(`^R\\d+\\t${TICKET}\\t${DONE}/ticket\\.md$`, "m"));
});

test("a commit-msg hook's edit of the message is the closing commit's message", async (t) => {
	const p = await plant();
	t.after(() => p.cleanup());
	await installHook(p, "commit-msg", `printf '\\nReviewed-by: the project hook\\n' >> "$1"`);
	await closeF001(p.root);
	assert.equal(git(p.root, "log", "-1", "--format=%B"), "Close F001: landed\n\nReviewed-by: the project hook");
});

test("STATE_CHANGED: a commit another process makes on the branch during the hooks stays the tip, and nothing of the close is written", async (t) => {
	const p = await plant();
	t.after(() => p.cleanup());
	const head = git(p.root, "rev-parse", "HEAD");
	// The other process commits through the checkout's own index, not the close's, and takes no lock of Limen's.
	await installHook(
		p,
		"pre-commit",
		'unset GIT_INDEX_FILE\ngit commit -q --no-verify --allow-empty -m "another session"',
	);
	const before = snapshot(p.root);
	const failure = await rejection(closeF001(p.root));
	const tip = git(p.root, "rev-parse", "HEAD");
	assert.deepEqual(
		[failure.class, failure.code, git(p.root, "log", "-1", "--format=%s"), git(p.root, "rev-parse", "HEAD~1")],
		["transient", "STATE_CHANGED", "another session", head],
		failure.message,
	);
	// The snapshot is the one before with HEAD at the other process's commit: its refs and the worktree list name it.
	const moved = { refs: before.refs.replaceAll(head, tip), worktrees: before.worktrees.replaceAll(head, tip) };
	assert.deepEqual(snapshot(p.root), { ...before, ...moved });
});

test("TICKETS_UNCOMMITTED: a file in the close's destination folder refuses the close before it writes, with the snapshot identical", async (t) => {
	const p = await plant();
	t.after(() => p.cleanup());
	await mkdir(join(p.root, DONE), { recursive: true });
	await writeFile(join(p.root, DONE, "outcome.md"), "another session's draft\n");
	const before = snapshot(p.root);
	const failure = await rejection(closeF001(p.root));
	assert.deepEqual(
		[failure.class, failure.code, failure.next, snapshot(p.root)],
		["refused", "TICKETS_UNCOMMITTED", "limen ticket done F001", before],
		failure.message,
	);
});

test("CHECKOUT_BEHIND: a board another session edits during the hooks stays byte for byte, the closing commit is on the branch, and the message names the read-tree that finishes the checkout", async (t) => {
	const p = await plant();
	t.after(() => p.cleanup());
	const head = git(p.root, "rev-parse", "HEAD");
	const board = `${await readFile(join(p.root, BOARD), "utf8")}another session's line\n`;
	await installHook(p, "pre-commit", `printf "another session's line\\n" >> ${BOARD}`);
	const failure = await rejection(closeF001(p.root));
	const tip = git(p.root, "rev-parse", "HEAD");
	assert.deepEqual(
		[
			failure.class,
			failure.code,
			failure.next,
			failure.message.includes(`git read-tree -m -u ${head} ${tip}`),
			git(p.root, "log", "-1", "--format=%s"),
			await readFile(join(p.root, BOARD), "utf8"),
		],
		["environment", "CHECKOUT_BEHIND", null, true, "Close F001: landed", board],
		failure.message,
	);
});

// Review round 1, F2: the message said "once the files there are committed or moved", and a commit in that state
// reverts the close, after which the read-tree it names no longer finishes it (the ticket's Risk 3).
test("CHECKOUT_BEHIND: the message tells to move the changed file aside and never to commit it", async (t) => {
	const p = await plant();
	t.after(() => p.cleanup());
	await installHook(p, "pre-commit", `printf "another session's line\\n" >> ${BOARD}`);
	const failure = await rejection(closeF001(p.root));
	assert.deepEqual(
		[
			failure.code,
			failure.message.includes(`aside, out of the checkout or to another name: ${BOARD}`),
			/committed or moved|commit (them|it|the files)\b/.test(failure.message),
		],
		["CHECKOUT_BEHIND", true, false],
		failure.message,
	);
});

// Review round 1, F3 (T-25): `ticket done` built a second operation from the close's parts, so a later change of the
// close would not have reached it; one operation takes the caller's reads instead.
test("the close operation joins its caller's reads to the plan and returns them with what the close did", async (t) => {
	const p = await plant();
	t.after(() => p.cleanup());
	const seen: string[][] = [];
	const added = async (_view: StateView, close: TicketClose) => {
		seen.push(close.tickets.map((ticket) => ticket.code));
		return { jobs: ["a finished job of F001"] };
	};
	const closed = await runOperation(closeOperation({ ...requestF001(p.root), added }));
	assert.deepEqual([seen, closed.added, closed.moved], [[["F001"]], { jobs: ["a finished job of F001"] }, [DONE]]);
});
