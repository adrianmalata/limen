import * as fs from "node:fs";
import { homedir } from "node:os";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { atomicWrite } from "../atomic-write.ts";
import { testKnob } from "../config.ts";
import { withLock } from "../lock.ts";

const PACKAGE_ROOT = fileURLToPath(new URL("../..", import.meta.url));
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
export async function installSeatSweep(): Promise<void> {
	const path = join(home(), "Library", "LaunchAgents", "limen-sweep.plist");
	const values = [process.execPath, join(PACKAGE_ROOT, "bin", "limen"), "sweep"]
		.map((value) => `<string>${xml(value)}</string>`)
		.join("");
	const plist = `<?xml version="1.0" encoding="UTF-8"?>\n<!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN" "http://www.apple.com/DTDs/PropertyList-1.0.dtd">\n<plist version="1.0"><dict><key>Label</key><string>works.earendil.limen-sweep</string><key>ProgramArguments</key><array>${values}</array><key>StartInterval</key><integer>60</integer></dict></plist>\n`;
	fs.mkdirSync(dirname(path), { recursive: true });
	fs.writeFileSync(path, plist);
	console.log(
		`wrote ${path}\nnode ${process.execPath}\nlimen ${join(PACKAGE_ROOT, "bin", "limen")}\nMoving this checkout requires running limen sweep --install again.`,
	);
}
export async function uninstallSeatSweep(): Promise<void> {
	const path = join(home(), "Library", "LaunchAgents", "limen-sweep.plist");
	fs.rmSync(path, { force: true });
	console.log(`removed ${path}`);
}
const xml = (value: string) => value.replaceAll("&", "&amp;").replaceAll("<", "&lt;").replaceAll(">", "&gt;");
