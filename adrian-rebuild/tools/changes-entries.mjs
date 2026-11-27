/* PL: Sprawdzanie wpisów changes.md według D-009 i D-138 (Node, bez zależności), wydzielone z check.mjs, żeby dało się
   je testować na fiksturze. Wpis ma nagłówek „YYYY-MM-DD R-NNN tytuł”, pola What, Why, Proof, Measurement, Commit
   i Rollback; kluczem jest temat commitu: `Commit: R-NNN`. Wpis zapisany w HEAD musi mieć na gałęzi adrian-rebuild
   dokładnie jeden commit z tematem „R-NNN:”, który zmienia changes.md; wpis jeszcze niezacommitowany — zero. Rollback
   to `git revert $(git log --grep …)` z D-009, a gdy ten `--grep` trafia też w commit o innym temacie (linia „R-NNN:”
   w treści), dokładna postać z `awk` po temacie (D-138). Stan: działa; test w tools/test-changes-entries.mjs. */
import { spawnSync } from "node:child_process";

export const CHANGES = "adrian-rebuild/changes.md";
const FIELDS = ["What", "Why", "Proof", "Measurement", "Commit", "Rollback"];

function git(args, cwd) {
	const result = spawnSync("git", args, { cwd, maxBuffer: 1 << 28 });
	if (result.status !== 0) {
		throw new Error(`git ${args.join(" ")} exited with ${result.status}: ${result.stderr.toString("utf8").trim()}`);
	}
	return result.stdout.toString("utf8");
}

/** The rollback command of D-009; `--` ends the revisions, because `adrian-rebuild` is also a directory of the repo. */
export function rollbackCommand(id, branch = "adrian-rebuild") {
	return `git revert $(git log --format=%H --grep='^${id}:' ${branch} --)`;
}

/**
 * D-138's rollback command, for a ticket whose D-009 `--grep` also finds another commit: it reverts only the commits
 * whose subject's first word is `<id>:`.
 */
export function exactRollbackCommand(id, branch = "adrian-rebuild") {
	return `git revert $(git log --format='%H %s' ${branch} -- | awk '$2 == "${id}:" {print $1}')`;
}

/**
 * The commits of `branch` whose subject's first word is `<id>:`, the commits D-009 keys an entry by (D-138 (1)): the
 * words split as `awk` splits them, so `exactRollbackCommand` reverts exactly the commits counted here.
 */
export function commitsFor(id, { cwd = ".", branch = "adrian-rebuild" } = {}) {
	return git(["log", "--format=%H %s", branch, "--"], cwd)
		.split("\n")
		.map((line) => line.trim().split(/[ \t]+/))
		.filter((words) => words[1] === `${id}:`)
		.map((words) => words[0]);
}

/**
 * The Rollback an entry must name (D-138 (2)): D-009's while every commit its `--grep` finds is a commit of the ticket,
 * since `--grep` matches any line of a message, so a body line `<id>: …` of another commit would be reverted too.
 */
export function expectedRollback(id, { cwd = ".", branch = "adrian-rebuild" } = {}) {
	const ticket = new Set(commitsFor(id, { cwd, branch }));
	const grepped = git(["log", "--format=%H", `--grep=^${id}:`, branch, "--"], cwd)
		.split("\n")
		.filter(Boolean);
	return grepped.every((commit) => ticket.has(commit)) ? rollbackCommand(id, branch) : exactRollbackCommand(id, branch);
}

/** The entries of a changes.md text: `## YYYY-MM-DD R-NNN <title>` and its `- Field: value` lines; fences skipped. */
export function parseEntries(text) {
	return text
		.replace(/^```[\s\S]*?^```/gm, "")
		.split(/^## /m)
		.slice(1)
		.map((block) => {
			const heading = block.slice(0, block.indexOf("\n"));
			const fields = Object.fromEntries(
				[...block.matchAll(/^- (\w+): (.+)$/gm)].map(([, name, value]) => [name, value]),
			);
			return { heading, id: heading.match(/^\d{4}-\d{2}-\d{2} (R-\d{3}) \S/)?.[1], fields };
		});
}

function checkFields({ id, fields }, errors, { cwd, branch }) {
	for (const name of FIELDS.filter((field) => !fields[field])) {
		errors.push(`${CHANGES}: ${id}: missing field ${name}`);
	}
	if (fields.Commit !== undefined && fields.Commit !== id) {
		errors.push(`${CHANGES}: ${id}: Commit is "${fields.Commit}", expected "${id}" (D-009)`);
	}
	const rollback = expectedRollback(id, { cwd, branch });
	if (fields.Rollback !== undefined && !fields.Rollback.includes(rollback)) {
		errors.push(`${CHANGES}: ${id}: Rollback does not say ${rollback} (D-009, D-138)`);
	}
	const measurement = /^(measured|unmeasured \(plan\.md → Measurement: M-\d{2}.*\))$/;
	if (fields.Measurement !== undefined && !measurement.test(fields.Measurement)) {
		errors.push(`${CHANGES}: ${id}: Measurement is not "measured" or "unmeasured (plan.md → Measurement: M-NN)"`);
	}
}

/**
 * Errors of every entry. `text` is the working copy, `headText` the copy at HEAD; `folders` are the ticket folder
 * names; `done` holds the IDs whose plan status is `done`.
 */
export function checkEntries({ text, headText, folders, done, cwd = ".", branch = "adrian-rebuild" }) {
	const errors = [];
	const committed = new Set(parseEntries(headText).map(({ id }) => id));
	const seen = new Set();
	for (const entry of parseEntries(text)) {
		const { heading, id } = entry;
		if (id === undefined) {
			errors.push(`${CHANGES}: heading "${heading}" is not "YYYY-MM-DD R-NNN <title>"`);
			continue;
		}
		if (seen.has(id)) {
			errors.push(`${CHANGES}: ${id} has more than one entry`);
		}
		seen.add(id);
		checkFields(entry, errors, { cwd, branch });
		if (!folders.some((folder) => folder.startsWith(`${id}-`))) {
			errors.push(`${CHANGES}: ${id}: no ticket folder adrian-rebuild/${id}-<slug>/`);
		}
		if (!done.has(id)) {
			errors.push(`${CHANGES}: ${id} is not a done ticket of plan.md`);
		}
		const commits = commitsFor(id, { cwd, branch });
		if (!committed.has(id) && commits.length > 0) {
			errors.push(
				`${CHANGES}: ${id}: ${commits.length} commit(s) "${id}:" exist, but the entry is not in HEAD (D-009)`,
			);
		} else if (committed.has(id) && commits.length !== 1) {
			errors.push(`${CHANGES}: ${id}: ${commits.length} commits "${id}:" on ${branch}, expected exactly one (D-009)`);
		} else if (committed.has(id) && !git(["show", "--name-only", "--format=", commits[0]], cwd).includes(CHANGES)) {
			errors.push(`${CHANGES}: ${id}: commit ${commits[0]} does not carry the entry (D-009)`);
		}
	}
	return errors;
}
