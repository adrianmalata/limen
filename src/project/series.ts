// Ticket numbers. A plant has taken a number when a ticket folder in any lane, a row of its archive register, a local
// `limen/*` branch or a job label names it.
import { spawnSync } from "node:child_process";
import { readdirSync, readFileSync, realpathSync } from "node:fs";
import { basename, join, resolve } from "node:path";
import { readOptional } from "./inherit.ts";

/** One row of the register of tickets a plant moved out of its lanes. */
export type ArchiveRow = {
	/** Line in the register, from 1. */
	readonly line: number;
	readonly path: string;
	/** The ticket the row archives; empty when its path names no `FNNN-slug` folder, as in the high-water row. */
	readonly code: string;
	readonly number: number;
	readonly title: string;
	/** The lane the ticket left, such as done; the folder above its month folder, or above the ticket folder. */
	readonly lane: string;
	readonly month: string;
};

/** The plant's tracked archive register: a header line, then one tab-separated row per archived ticket. */
export const ARCHIVE = "spec/features/archive.tsv";
const COLUMNS = ["path", "number", "title", "close_month", "archive_date", "last_commit", "manifest_digest"];

const ticketCode = (number: number) => `F${String(number).padStart(3, "0")}`;

/** Calls `create` with the next code, above every number the checkout and the plant have taken; returns its result. */
export function withNextTicketCode<T>(root: string, plant: string, create: (code: string) => T): T {
	return create(ticketCode(highestTaken([root, plant]) + 1));
}

/** Codes a ticket outside the plant's own lanes holds: its archive rows. */
export function takenElsewhere(root: string): ReadonlyMap<string, string> {
	const taken = new Map<string, string>();
	for (const row of archiveRows(real(root))) {
		if (row.code && !taken.has(row.code)) {
			taken.set(row.code, `${ARCHIVE}:${row.line}`);
		}
	}
	return taken;
}

/** The rows of the plant's archive register; none when it has no register. */
export function archiveRows(root: string): ArchiveRow[] {
	let text: string;
	try {
		text = readFileSync(join(root, ARCHIVE), "utf8");
	} catch (error) {
		if ((error as NodeJS.ErrnoException).code === "ENOENT") {
			return [];
		}
		throw error;
	}
	const lines = text.split(/\r?\n/);
	const head = lines[0]?.split("\t").map((name) => name.trim()) ?? [];
	const names = head.includes("number") ? head : COLUMNS;
	const rows: ArchiveRow[] = [];
	for (const [index, line] of lines.entries()) {
		if (!line.trim() || (index === 0 && names === head)) {
			continue;
		}
		const cells = line.split("\t");
		const cell = (name: string) => cells[names.indexOf(name)]?.trim() ?? "";
		const path = cell("path").replace(/\/+$/, "");
		const code = /^(F\d+)-/.exec(basename(path))?.[1] ?? "";
		const number = Number(/^F?(\d+)$/i.exec(cell("number"))?.[1] ?? code.slice(1));
		const folders = path.split("/");
		const dated = /^\d{4}-\d\d$/.test(folders.at(-2) ?? "");
		const lane = folders.at(dated ? -3 : -2) ?? "";
		const month = cell("close_month") || (dated ? (folders.at(-2) ?? "") : "");
		rows.push({ line: index + 1, path, code, number: number || 0, title: cell("title"), lane, month });
	}
	return rows;
}

/** Ticket folders in every lane, month folders included: `spec/features/<lane>/[<month>/]FNNN-slug`. */
function ticketFolders(root: string): { readonly code: string; readonly path: string }[] {
	const found: { code: string; path: string }[] = [];
	const visit = (path: string, depth: number) => {
		for (const name of subdirectories(join(root, path))) {
			const code = /^(F\d+)-/.exec(name)?.[1];
			if (code) {
				found.push({ code, path: `${path}/${name}` });
			} else if (depth < 2) {
				visit(`${path}/${name}`, depth + 1);
			}
		}
	};
	visit("spec/features", 0);
	return found;
}

/** The highest number the plants have taken, each plant once. */
function highestTaken(plants: readonly string[]): number {
	let highest = 0;
	for (const plant of new Set(plants.map(real))) {
		// A number can live only on a branch or in a job before its folder reaches this checkout (the two F778 tickets).
		const branches = spawnSync("git", ["for-each-ref", "--format=%(refname:short)", "refs/heads/limen/"], {
			cwd: plant,
			encoding: "utf8",
		});
		const jobs = join(plant, ".limen", "jobs");
		const labels = subdirectories(jobs).map((id) => `${id}\n${readOptional(join(jobs, id, "label")) ?? ""}`);
		const named = `${branches.stdout ?? ""}\n${labels.join("\n")}`.matchAll(/\bf(\d{3,4})\b/gi);
		for (const number of [
			...ticketFolders(plant).map((folder) => folder.code.slice(1)),
			...archiveRows(plant).map((row) => row.number),
			...[...named].map((match) => match[1]),
		]) {
			highest = Math.max(highest, Number(number));
		}
	}
	return highest;
}

function subdirectories(path: string): string[] {
	try {
		return readdirSync(path, { withFileTypes: true })
			.filter((entry) => entry.isDirectory())
			.map((entry) => entry.name);
	} catch (error) {
		if ((error as NodeJS.ErrnoException).code === "ENOENT") {
			return [];
		}
		throw error;
	}
}

function real(path: string): string {
	try {
		return realpathSync(path);
	} catch {
		return resolve(path);
	}
}
