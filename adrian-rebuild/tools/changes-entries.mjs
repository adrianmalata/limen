/* PL: Sprawdzanie wpisów changes.md według D-009 (Node, bez zależności), wydzielone z check.mjs, żeby dało się je
   testować na fiksturze. Wpis ma nagłówek „YYYY-MM-DD R-NNN tytuł”, pola What, Why, Proof, Measurement, Commit
   i Rollback; kluczem jest temat commitu: `Commit: R-NNN`, a Rollback to `git revert $(git log …)`. Wpis zapisany
   w HEAD musi mieć na gałęzi adrian-rebuild dokładnie jeden commit „R-NNN:”, który zmienia changes.md; wpis jeszcze
   niezacommitowany — zero. Stan: działa; test w tools/test-changes-entries.mjs. */
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

/** The commits that `rollbackCommand(id)` would revert, found the same way. */
export function commitsFor(id, { cwd = ".", branch = "adrian-rebuild" } = {}) {
	return git(["log", "--format=%H", `--grep=^${id}:`, branch, "--"], cwd)
		.split("\n")
		.filter(Boolean);
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

function checkFields({ id, fields }, errors) {
	for (const name of FIELDS.filter((field) => !fields[field])) {
		errors.push(`${CHANGES}: ${id}: missing field ${name}`);
	}
	if (fields.Commit !== undefined && fields.Commit !== id) {
		errors.push(`${CHANGES}: ${id}: Commit is "${fields.Commit}", expected "${id}" (D-009)`);
	}
	if (fields.Rollback !== undefined && !fields.Rollback.includes(rollbackCommand(id))) {
		errors.push(`${CHANGES}: ${id}: Rollback does not say ${rollbackCommand(id)} (D-009)`);
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
		checkFields(entry, errors);
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
