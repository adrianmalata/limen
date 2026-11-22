/**
 * The project registries of the seat (T-25): `<home>/.limen/projects` of each home directory in the password file,
 * since `limen init` registers a project in the registry of the account that runs it and root has none of its own,
 * and the kind of each registry line. `seat/deploy.ts` reads them as root and refuses what it cannot read;
 * `seat/alerts.ts` reads them on the alerts account, skips the homes that account cannot enter and names the rest.
 */
import { readFile, stat } from "node:fs/promises";
import { isAbsolute, join } from "node:path";
import { hasCode } from "../src/system-error.ts";

/** A registry line: a root that holds `.limen/`, an absolute path that does not, or a line that is not a path. */
export type LineKind = "project" | "not a project" | "skipped";
export type ReadLine = { readonly root: string; readonly kind: LineKind };
/** A registered root whose `.limen` the reading account cannot stat: `path` and the error say why. */
export type UnreadableLine = {
	readonly root: string;
	readonly kind: "unreadable";
	readonly path: string;
	readonly error: unknown;
};
export type RegistryLine = ReadLine | UnreadableLine;

/**
 * What one registry holds for the reading account: none (`absent`); a registry in a folder the account cannot enter
 * (`closed`), which is not its to read; one it can see but cannot read (`unreadable`); or its lines (`read`).
 */
export type RegistryRead =
	| { readonly kind: "absent" }
	| { readonly kind: "closed"; readonly error: unknown }
	| { readonly kind: "unreadable"; readonly error: unknown }
	| { readonly kind: "read"; readonly lines: readonly RegistryLine[] };

/** Whether `error` says a path does not exist: no such file, or a file where a folder of the path should be. */
export function absent(error: unknown): boolean {
	return hasCode(error, "ENOENT") || hasCode(error, "ENOTDIR");
}

/** The registry an account whose home is `home` keeps, as `limen init` writes it there. */
export function registryOf(home: string): string {
	return join(home, ".limen", "projects");
}

/** The registry of each distinct absolute home directory of the password file's text `passwd`, in its order. */
export function registryPaths(passwd: string): string[] {
	const homes = new Set(
		passwd
			.split("\n")
			.map((line) => line.split(":")[5] ?? "")
			.filter((home) => isAbsolute(home)),
	);
	return [...homes].map(registryOf);
}

/**
 * The registry at `path`. A read refused with `EACCES` is `closed` when the account cannot even stat the file, as for
 * another account's private home, and `unreadable` when it can: the file is there, but its read right is not.
 */
export async function readRegistry(path: string): Promise<RegistryRead> {
	let text: string;
	try {
		text = await readFile(path, "utf8");
	} catch (error) {
		if (absent(error)) {
			return { kind: "absent" };
		}
		if (hasCode(error, "EACCES") && (await closedTo(path))) {
			return { kind: "closed", error };
		}
		return { kind: "unreadable", error };
	}
	return { kind: "read", lines: await registryLines(text) };
}

/** Whether a stat of `path` is refused with `EACCES`: a folder on its path is closed to the reading account. */
async function closedTo(path: string): Promise<boolean> {
	try {
		await stat(path);
		return false;
	} catch (error) {
		return hasCode(error, "EACCES");
	}
}

/**
 * Each distinct line of a registry with its kind. An empty line holds no root and is left out, as Limen's own reader
 * does (`registeredProjects`); a relative path would resolve against the reader's working folder, so it is skipped.
 */
async function registryLines(text: string): Promise<readonly RegistryLine[]> {
	const lines: RegistryLine[] = [];
	for (const root of new Set(text.split(/\r?\n/).filter(Boolean))) {
		lines.push(isAbsolute(root) ? await rootLine(root) : { root, kind: "skipped" });
	}
	return lines;
}

/** An absolute root is a project when it holds a `.limen/` folder, as `limen init` makes; a missing root holds none. */
async function rootLine(root: string): Promise<RegistryLine> {
	const limen = join(root, ".limen");
	try {
		return { root, kind: (await stat(limen)).isDirectory() ? "project" : "not a project" };
	} catch (error) {
		if (absent(error)) {
			return { root, kind: "not a project" };
		}
		return { root, kind: "unreadable", path: limen, error };
	}
}
