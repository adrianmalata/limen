// The table of the package's job roles (R-044, A-081 "the role definition"): each role a job's record names, with the
// module it belongs to, or none, and the tools, skills and read-only flag of its engine (R-045). A job of a module's
// role starts only while its module is on (G1.10): spawn and continue check it in their validate (src/job/spawning.ts,
// src/job/continuation.ts), the two functions every job start passes, with the workspace module for a job in a
// workspace repository (`requireJobModules`). The table is the one list of job roles, so a role outside it starts no
// job (`resolvePreamble`, src/job/spawning.ts), and a project file cannot widen a role (T-03).
import { type Module, requireModule } from "../project/modules.ts";

/**
 * What a session's engine is given (A-081, E-5, E-6): Pi's `--tools` allowlist, which also filters the tools a hook
 * registers, so a job's list names `finish`, and is never empty, since a session with no Pi tool gets Claude Code's own
 * back; the package-relative paths of the `SKILL.md` files it loads beside `--no-skills`; and whether its job may leave
 * its worktree and its own branch only as it found them (src/job/read-only.ts).
 */
export type SessionTools = {
	readonly tools: readonly string[];
	readonly skills: readonly string[];
	readonly readOnly: boolean;
};

/** One job role: its name, the role a record names and its preamble `templates/<name>.md`, its module and its tools. */
export type JobRole = SessionTools & { readonly name: string; readonly module?: Module };

/**
 * A role that only reads: Pi's defaults less `edit` and `write`, so `bash` stays for a reviewer's checks, a
 * researcher's fetches and the sources a judge follows (R-045 Decision 3). The list is a noise guard, since bash can
 * still write; the check of the job's end is the guarantee (A-081, z. 14).
 */
const READS: SessionTools = { tools: ["read", "bash", "finish"], skills: [], readOnly: true };
/** A role that writes its work: Pi's defaults and Limen's `finish`, named, so no settings file changes them (T-03). */
const WRITES: SessionTools = { tools: ["read", "bash", "edit", "write", "finish"], skills: [], readOnly: false };

/**
 * The job roles of the package. `coordinator` is a group's team (`templates/coordinator.md`), not the owner-facing
 * coordinator, which is no job; `group-member` is the contract every member reads (src/job/group-packet.ts). The
 * quality role writes its findings file, so it writes (R-045 Decision 1).
 */
export const JOB_ROLES: readonly JobRole[] = [
	{ name: "worker", ...WRITES },
	{ name: "reviewer", ...READS },
	{ name: "judge", module: "research", ...READS },
	{ name: "researcher", module: "research", ...READS },
	{ name: "quality", module: "quality", ...WRITES },
	{ name: "keeper", ...WRITES },
	{ name: "coordinator", module: "group", ...WRITES },
	{ name: "group-member", module: "group", ...WRITES },
];

/**
 * The owner-facing coordinator's session (D-123): Pi's four default tools and no skill. It is no table key, since the
 * table's `coordinator` is a group's team; R-050's start script applies it, and until then the coordinator, started by
 * hand, keeps Pi's defaults.
 */
export const COORDINATOR_SESSION: SessionTools = {
	tools: ["read", "bash", "edit", "write"],
	skills: [],
	readOnly: false,
};

/** The table's entry of `role`, the role a record or a spawn names; undefined for a role outside the table. */
export function jobRole(role: string | null | undefined): JobRole | undefined {
	return JOB_ROLES.find((entry) => entry.name === role);
}

/** Refuses with MODULE_OFF a job of `role` while its module is off in the project at `root`; any other role passes. */
export function requireRoleModule(root: string, role: string): void {
	const module = jobRole(role)?.module;
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
