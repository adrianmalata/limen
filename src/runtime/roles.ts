// The table of the package's job roles (R-044, A-081 "the role definition"): each role a job's record names, with the
// module it belongs to, or none. A job of a module's role starts only while its module is on (G1.10): spawn and
// continue check it in their validate (src/job/spawning.ts, src/job/continuation.ts), the two functions every job start
// passes, with the workspace module for a job in a workspace repository (`requireJobModules`). R-045 adds each role's
// tools, skills and read-only flag to the same entries.
import { type Module, requireModule } from "../project/modules.ts";

/** One job role: its name, the role a record names and its preamble `templates/<name>.md`, and its module. */
export type JobRole = { readonly name: string; readonly module?: Module };

/**
 * The job roles of the package. `coordinator` is a group's team (`templates/coordinator.md`), not the owner-facing
 * coordinator, which is no job; `group-member` is the contract every member reads (src/job/group-packet.ts).
 */
export const JOB_ROLES: readonly JobRole[] = [
	{ name: "worker" },
	{ name: "reviewer" },
	{ name: "judge", module: "research" },
	{ name: "researcher", module: "research" },
	{ name: "quality", module: "quality" },
	{ name: "keeper" },
	{ name: "coordinator", module: "group" },
	{ name: "group-member", module: "group" },
];

/** Refuses with MODULE_OFF a job of `role` while its module is off in the project at `root`; any other role passes. */
export function requireRoleModule(root: string, role: string): void {
	const module = JOB_ROLES.find((entry) => entry.name === role)?.module;
	if (module !== undefined) {
		requireModule(root, module);
	}
}

/**
 * Refuses with MODULE_OFF a job that needs a module that is off in the project at `root` (G1.10, AC-16): its role's
 * module, and the workspace module for a job in a workspace repository (`repo`). Spawn, continue and the keeper call it
 * before their first write (T-38; R-044 Decision 19 F5, Decision 20 G1).
 */
export function requireJobModules(
	root: string,
	job: { readonly role: string; readonly repo?: string | undefined },
): void {
	requireRoleModule(root, job.role);
	if (job.repo) {
		requireModule(root, "workspace");
	}
}
