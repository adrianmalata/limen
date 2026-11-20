import { existsSync, mkdirSync, readdirSync, readFileSync, rmSync } from "node:fs";
import { readdir, rm } from "node:fs/promises";
import { join } from "node:path";
import { atomicWriteSync } from "../atomic-write.ts";
import { exception, transport } from "../config.ts";
import { SESSION_ID } from "../job/job.ts";
import { textFile } from "../job/record.ts";
import { processInfo } from "../runtime/contain.ts";
import type { PiContext } from "../runtime/pi-api.ts";

/** What the registration reads of the coordinator's Pi context, which the wake hook has checked. */
export type CoordinatorSession = Pick<PiContext, "sessionManager">;

/**
 * The coordinator's registration, written by the wake hook. The session registers under `.limen/coordinators/<session>`
 * with its pid, pane, start time and process start time, so `limen rule` can find the live coordinator panes and the
 * sweep can remove the registration once the process is gone, when no code runs in the dead process.
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
		void processInfo(process.pid)
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
	const outcome = await processInfo(pid);
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
