import { existsSync, mkdirSync, readdirSync, readFileSync, rmSync } from "node:fs";
import { readdir, readFile, rm } from "node:fs/promises";
import { dirname, join, resolve } from "node:path";
import { atomicWrite, atomicWriteSync } from "../atomic-write.ts";
import { parseJson } from "../boundary.ts";
import { exception, transport } from "../config.ts";
import { SESSION_ID } from "../job/job.ts";
import { type Refusal, refusalDetail, refusalOf, textFile } from "../job/record.ts";
import { LimenError } from "../outcome.ts";
import { platform } from "../platform/platform.ts";
import type { PiContext } from "../runtime/pi-api.ts";
import { hasCode } from "../system-error.ts";

/** The file of a session's folder that holds the newest refusal of a Limen hook in that session (T-32 (4)). */
const REFUSAL = "refusal.json";

/** The project of a coordinator's session that runs in `cwd`: the nearest folder up that holds `.agents/limen`. */
export function coordinatorProject(cwd: string): string | undefined {
	let dir = resolve(cwd);
	for (;;) {
		if (existsSync(join(dir, ".agents", "limen"))) {
			return dir;
		}
		const parent = dirname(dir);
		if (parent === dir) {
			return undefined;
		}
		dir = parent;
	}
}

/** What the registration reads of the coordinator's Pi context, which the wake hook has checked. */
export type CoordinatorSession = Pick<PiContext, "sessionManager">;

/**
 * The coordinator's registration, written by the wake hook. The session registers under `.limen/coordinators/<session>`
 * with its pid, pane, start time and process start time, so `limen rule` can find the live coordinator panes and the
 * sweep can remove the registration once the process is gone, when no code runs in the dead process. The same folder
 * holds the newest refusal of a Limen hook in the session (`writeCoordinatorRefusal`), which goes with it.
 */
export function coordinatorRegistration() {
	let dir: string | undefined;
	const write = (name: string, value: string) => {
		if (!dir) {
			return;
		}
		try {
			atomicWriteSync(join(dir, name), `${value}\n`);
		} catch {
			// The registration is advisory; a missing file only makes `limen rule` skip or misjudge this pane.
		}
	};
	// The process start time tells the sweep a reused pid from this process.
	const recordBorn = () => {
		if (!dir || existsSync(join(dir, "born"))) {
			return;
		}
		void platform
			.processInfo(process.pid)
			.then((outcome) => {
				if (outcome.kind === "present") {
					write("born", outcome.process.born);
				}
			})
			.catch(() => {});
	};
	return {
		start(project: string, context: CoordinatorSession): void {
			if (transport("LIMEN_JOB") === "1") {
				return;
			}
			const pane = process.env.HERDR_ENV === "1" ? (process.env.HERDR_PANE_ID?.trim() ?? "") : "";
			if (exception("LIMEN_COORDINATOR") !== "1" && !pane) {
				return;
			}
			const id = context.sessionManager.getSessionId();
			if (!SESSION_ID.test(id)) {
				return;
			}
			const base = join(project, ".limen", "coordinators");
			try {
				// A resumed session in a new process starts a fresh registration: the old pid and start time describe another process.
				const previous = readOptional(join(base, id, "pid"));
				if (previous && previous !== String(process.pid)) {
					rmSync(join(base, id), { recursive: true, force: true });
				}
				mkdirSync(join(base, id), { recursive: true });
				// One process holds one registration: a switched session ends the old one cleanly.
				for (const name of readdirSync(base)) {
					if (name !== id && readOptional(join(base, name, "pid")) === String(process.pid)) {
						rmSync(join(base, name), { recursive: true, force: true });
					}
				}
				rmSync(join(base, id, "shutdown"), { force: true });
			} catch {
				return;
			}
			dir = join(base, id);
			write("pid", String(process.pid));
			write("pane", pane);
			write("started-at", new Date().toISOString());
			recordBorn();
		},
		shutdown(): void {
			write("shutdown", new Date().toISOString());
			dir = undefined;
		},
	};
}

/** The sweep removes the registration of every coordinator whose process died, so `.limen/coordinators/` does not grow. */
export async function removeDeadCoordinators(root: string): Promise<void> {
	const base = join(root, ".limen", "coordinators");
	for (const name of await readdir(base).catch(() => [] as string[])) {
		const dir = join(base, name);
		if ((await registeredProcess(dir)) === "dead") {
			await rm(dir, { recursive: true, force: true });
		}
	}
}

export type LiveCoordinator = { readonly session: string; readonly pane: string; readonly startedAt: number };

/**
 * The coordinators of one project that run now in a Herdr pane: a registration with a pane, no `shutdown` mark, and a
 * live process, as the sweep judges it.
 */
export async function liveCoordinators(root: string): Promise<readonly LiveCoordinator[]> {
	const base = join(root, ".limen", "coordinators");
	const live: LiveCoordinator[] = [];
	for (const session of await readdir(base).catch(() => [] as string[])) {
		const dir = join(base, session);
		const pane = await textFile(join(dir, "pane"));
		if (!pane || existsSync(join(dir, "shutdown")) || (await registeredProcess(dir)) !== "live") {
			continue;
		}
		live.push({ session, pane, startedAt: Date.parse(await textFile(join(dir, "started-at"))) || 0 });
	}
	return live;
}

/**
 * A registration's process: live when its pid runs with the recorded start time, or before one is recorded; dead when
 * it does not run; unknown without a pid or when the process query fails.
 */
async function registeredProcess(dir: string): Promise<"live" | "dead" | "unknown"> {
	const pid = Number(await textFile(join(dir, "pid")));
	if (!Number.isSafeInteger(pid) || pid <= 0) {
		return "unknown";
	}
	const outcome = await platform.processInfo(pid);
	if (outcome.kind === "unavailable") {
		return "unknown";
	}
	const born = await textFile(join(dir, "born"));
	return outcome.kind === "present" && (!born || outcome.process.born === born) ? "live" : "dead";
}

function readOptional(path: string): string {
	try {
		return readFileSync(path, "utf8").trim();
	} catch {
		return "";
	}
}

/**
 * Writes `refusal`, a Limen hook's refusal of a Pi value in this coordinator's session, as the newest refusal of the
 * folder this process registered under the project of `cwd` (T-32 (4)): one process holds one registration, so its
 * pid and its start time name the folder also when the context that would name the session is what the hook refused.
 * They are matched as the sweep's liveness check reads them (`registeredProcess`): the pid, and the start time once the
 * folder records one, so a dead session's folder whose pid this process reused takes nothing (A-058). The file goes
 * with the folder when the sweep removes a dead session's registration. A session that registered no folder, as one
 * with neither `LIMEN_COORDINATOR` nor a Herdr pane, gets none, and Pi's message in its chat is the one trace.
 */
export async function writeCoordinatorRefusal(cwd: string, refusal: Refusal): Promise<void> {
	const root = coordinatorProject(cwd);
	if (!root) {
		return;
	}
	const own = await platform.processInfo(process.pid);
	const born = own.kind === "present" ? own.process.born : undefined;
	const base = join(root, ".limen", "coordinators");
	for (const session of await folderNames(base)) {
		const recorded = readOptional(join(base, session, "born"));
		const ours = readOptional(join(base, session, "pid")) === String(process.pid) && (!recorded || recorded === born);
		if (ours) {
			await atomicWrite(join(base, session, REFUSAL), `${JSON.stringify(refusal)}\n`);
			return;
		}
	}
}

/** A coordinator session's newest refusal of a Limen hook, as `limen status` shows it: when, and what was refused. */
export type SessionRefusal = { readonly session: string; readonly at: string | null; readonly detail: string };

/**
 * The newest refusal of a Limen hook in each coordinator session of the project at `root` whose folder holds one, by
 * session; a damaged file shows its BAD_DATA message as its detail. It reads and writes nothing else (T-04).
 */
export async function coordinatorRefusals(root: string): Promise<SessionRefusal[]> {
	const base = join(root, ".limen", "coordinators");
	const found: SessionRefusal[] = [];
	for (const session of (await folderNames(base)).sort()) {
		const file = join(base, session, REFUSAL);
		const text = await readFile(file, "utf8").catch((error: unknown) => {
			if (hasCode(error, "ENOENT") || hasCode(error, "ENOTDIR")) {
				return undefined;
			}
			throw error;
		});
		if (text === undefined) {
			continue;
		}
		const refusal = parseJson(file, text, refusalOf);
		found.push(
			refusal instanceof LimenError
				? { session, at: null, detail: refusal.message }
				: { session, at: refusal.at, detail: refusalDetail(refusal) },
		);
	}
	return found;
}

/** The names in the folder `base`, none when it does not exist. */
async function folderNames(base: string): Promise<string[]> {
	return readdir(base).catch((error: unknown) => {
		if (hasCode(error, "ENOENT")) {
			return [];
		}
		throw error;
	});
}
