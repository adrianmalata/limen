// The one module policy (T-25 (1), G1.10): the six optional modules by their command word (T-18), whether one is on in
// a project, and the refusal of a command or a job of a module that is off. A module is off unless the project's
// limits file switches it on (src/project/limits.ts); an off module contributes no prompt text, no hook and no command
// or job (R-044). This module reads that one file only: it starts no process and writes nothing, so the context
// message's builder and the hooks read it as freely as a command does. The root of a project at a working directory,
// which takes git, is src/project/git.ts's.
import { refused } from "../outcome.ts";
import { PLANT_LIMITS, plantLimits } from "./limits.ts";

/**
 * The modules in their order, the order of the help and of a message's module parts. `research` and `quality` have no
 * command yet (R-078, R-079); their roles and texts exist, so their switches do.
 */
export const MODULES = ["github", "group", "picture", "workspace", "research", "quality"] as const;
export type Module = (typeof MODULES)[number];

/** How a message heads a module's part, "<Title> module" (T-18: "the GitHub module"). */
const TITLES: Readonly<Record<Module, string>> = {
	github: "GitHub",
	group: "Group",
	picture: "Picture",
	workspace: "Workspace",
	research: "Research",
	quality: "Quality",
};

/** Whether `word`, such as a registry entry's object, names a module. */
export function isModule(word: string): word is Module {
	return MODULES.some((name) => name === word);
}

/** The heading's name of `module`'s part of a message: "GitHub module", "Group module". */
export function moduleTitle(module: Module): string {
	return `${TITLES[module]} module`;
}

/** The modules the limits file of the project at `root` switches on, read at each call (R-044 Decision 12). */
export function modulesOn(root: string): ReadonlySet<Module> {
	return plantLimits(root).modules;
}

/** Whether `module` is on in the project at `root`. */
export function moduleOn(root: string, module: Module): boolean {
	return modulesOn(root).has(module);
}

/**
 * Refuses with MODULE_OFF while `module` is off in the project at `root`. No command switches a module on before the
 * owner channel (R-055), so `next` is null and the line names the file and the field (T-03, z. 12).
 */
export function requireModule(root: string, module: Module): void {
	if (!moduleOn(root, module)) {
		throw refused(
			"MODULE_OFF",
			`the ${module} module is off in this project; the owner switches it on in ${PLANT_LIMITS} ("modules": {"${module}": true})`,
		);
	}
}
