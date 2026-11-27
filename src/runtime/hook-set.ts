// The one function that names a session's hooks (R-044, A-082): the job wrapper passes a job's set to Pi, and each
// hook that a session may not need asks it in its factory and registers nothing outside its set, so the project stub
// that loads them in a coordinator stays the same file (R-044 Decision 7). A coordinator gets the group hook, with its
// lead file and its one-second timer, only with the group module on (G1.10); steering acts only in a job. Which hooks
// load in a session is fixed when its factories run: at its start, at `/reload` and at `/new` (E-11).
import { transport } from "../config.ts";
import { moduleOn } from "../project/modules.ts";

/** A hook of the package, by its file `hook/<name>.ts`. */
export type Hook = "wake" | "communication" | "steering" | "group-peer" | "finish" | "rate-limit";
/**
 * A session as its hooks depend on it: the owner-facing coordinator's, with the group module on or off in its project,
 * or a job's, a group's member or not.
 */
export type HookSession =
	| { readonly session: "coordinator"; readonly group: boolean }
	| { readonly session: "job"; readonly member: boolean };

/** The hooks of `session`, in the order Pi loads them. */
export function hookSet(session: HookSession): readonly Hook[] {
	if (session.session === "coordinator") {
		return ["wake", "communication", ...(session.group ? (["group-peer"] as const) : [])];
	}
	return ["finish", "steering", "communication", "rate-limit", ...(session.member ? (["group-peer"] as const) : [])];
}

/**
 * The root whose files a session's hooks and its context message read, the module switches among them: a job's project
 * (`LIMEN_CONTEXT_ROOT`), else the session's working directory, `cwd` (`process.cwd()` in a factory, `context.cwd` in a
 * handler). It asks git nothing, so a hook's factory starts no process, and a coordinator's hooks and its message read
 * the same switches (R-044 Decision 19 F3).
 */
export function sessionRoot(cwd: string): string {
	return transport("LIMEN_CONTEXT_ROOT") || cwd;
}

/**
 * The hooks of the session this process runs, for a hook's factory, which gets no context: a job's (`LIMEN_JOB`), a
 * member when its environment names its group (`LIMEN_GROUP_ID`), else the coordinator's, with the group switch of its
 * `sessionRoot` (R-044 Decision 18 (3), Decision 19 F3).
 */
export function ownHooks(cwd: string): readonly Hook[] {
	if (transport("LIMEN_JOB") === "1") {
		return hookSet({ session: "job", member: Boolean(transport("LIMEN_GROUP_ID")) });
	}
	return hookSet({ session: "coordinator", group: moduleOn(sessionRoot(cwd), "group") });
}
