import * as fs from "node:fs";
import { homedir } from "node:os";
import { join, resolve } from "node:path";
import { atomicWrite } from "../atomic-write.ts";
import { testKnob } from "../config.ts";
import { withLock } from "../lock.ts";

const home = () => testKnob("LIMEN_HOME") || homedir();
/** The seat's own folder: one per machine, shared by every plant. */
export const seatDir = () => join(home(), ".limen");
export const projectsFile = () => join(seatDir(), "projects");
export const registeredProjects = () => [
	...new Set(
		(fs.existsSync(projectsFile()) ? fs.readFileSync(projectsFile(), "utf8") : "").split(/\r?\n/).filter(Boolean),
	),
];
/**
 * Reads, changes and writes the registry while this process holds its lock (A-087, A-022): one writer at a time, and
 * the new list replaces the old one whole. Returns the list as it is after the change.
 */
export async function updateRegisteredProjects(
	update: (projects: readonly string[]) => readonly string[],
): Promise<readonly string[]> {
	return withLock({ file: projectsFile() }, async () => {
		const before = registeredProjects(),
			after = [...new Set(update(before))];
		if (before.length === after.length && before.every((project, index) => project === after[index])) {
			return before;
		}
		await atomicWrite(projectsFile(), after.length ? `${after.join("\n")}\n` : "");
		return after;
	});
}
export async function registerProject(root: string): Promise<void> {
	const project = resolve(root);
	await updateRegisteredProjects((projects) => (projects.includes(project) ? projects : [...projects, project]));
}
