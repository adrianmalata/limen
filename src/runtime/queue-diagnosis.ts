// The diagnosis of a long wait in the seat's start queue (A-036): the gate reading, then the three largest units of the
// agents' user manager by current memory and the three largest by CPU over the reading's window, each named by its unit
// and its class: `job <id>` for a job's scope, and `unattributed` for any other unit until the coordinator gets a unit
// of its own (R-050). The start queue writes it into the job's record and into the advisory that wakes its coordinator;
// the phone gets only the alerts' fixed line (A-066), and `limen status` the rest. A job can name a unit and the
// folders of its tree, so every text the diagnosis takes from the tree is quoted as data in Limen's sentence (z. 15).
import { platform, type UnitUsage } from "../platform/platform.ts";
import { jobOfScope } from "./launcher.ts";

/** How many units each ranking names. */
const RANKED = 3;
const MIB = 1_048_576;

/**
 * The diagnosis. `reading` samples the gate's reading over its window and gives its text; the units are read before
 * and after it, so each unit's CPU counts over that same window. A read of the units that fails ends no wait: the
 * diagnosis names the failure in place of the rankings, so the record and the wake carry it (T-01).
 */
export async function queueDiagnosis(reading: () => Promise<string>): Promise<string> {
	const before = await unitsRead();
	const started = performance.now();
	const gate = await reading();
	const windowMs = performance.now() - started;
	const after = await unitsRead();
	if (typeof before === "string" || typeof after === "string") {
		return `${gate}; units: ${typeof before === "string" ? before : after}`;
	}
	return `${gate}; ${usageText(before, after, windowMs, platform.coreTimes().length)}`;
}

/**
 * The units of the user manager, or why there are none to rank: no user manager, or the failure of their read, whose
 * message names the path it failed on and so is quoted.
 */
function unitsRead(): Promise<readonly UnitUsage[] | string> {
	return platform.userUnits().then(
		(units) => units ?? "none, since this process runs under no systemd user manager",
		(error: unknown) => `not read: ${JSON.stringify(error instanceof Error ? error.message : String(error))}`,
	);
}

/** A unit with the value a ranking orders it by. */
type Ranked = { readonly unit: string; readonly value: number };

/**
 * The two rankings: the largest units by memory in `after`, and by CPU from `before` to `after` over `windowMs` on
 * `cores` cores, as a share of the whole machine as the gate reads its CPU. A unit whose reading is unknown, or new in
 * the window, or at zero, is in no ranking: it is no consumer this reading can name.
 */
export function usageText(
	before: readonly UnitUsage[],
	after: readonly UnitUsage[],
	windowMs: number,
	cores: number,
): string {
	const memory = after.flatMap(({ unit, memoryBytes }) =>
		memoryBytes !== null && memoryBytes > 0 ? [{ unit, value: memoryBytes }] : [],
	);
	const earlier = new Map(before.map(({ unit, cpuMicroseconds }) => [unit, cpuMicroseconds]));
	const cpu = after.flatMap(({ unit, cpuMicroseconds }) => {
		const start = earlier.get(unit);
		const used = cpuMicroseconds !== null && start !== undefined && start !== null ? cpuMicroseconds - start : 0;
		return used > 0 ? [{ unit, value: machineShare(used, windowMs, cores) }] : [];
	});
	const byCpu = windowMs * cores > 0 ? ranked(cpu, (share) => `${Math.round(share)}%`) : "not sampled";
	return `largest by memory: ${ranked(memory, (bytes) => `${(bytes / MIB).toFixed(1)} MiB`)}; largest by CPU: ${byCpu}`;
}

/**
 * The CPU time `usedMicroseconds` that a cgroup used over `windowMs` on `cores` cores, as a percentage of the whole
 * machine, as the start gate reads its CPU: the one unit of a CPU share, which the peak of a job's scope also uses
 * (src/runtime/stalled-tool.ts, T-18).
 */
export function machineShare(usedMicroseconds: number, windowMs: number, cores: number): number {
	return (100 * usedMicroseconds) / (windowMs * 1_000 * cores);
}

/**
 * The `RANKED` largest of `values`, each as `"<unit>" (<class>) <amount>`, ties by the unit's name; "none" for none.
 * The unit's name is quoted as the wake quotes a job's label (src/job/wake-text.ts); its class needs no quotes, since
 * it holds only Limen's words and an id that passed the job id's pattern (`jobOfScope`).
 */
function ranked(values: readonly Ranked[], amount: (value: number) => string): string {
	const top = [...values].sort((a, b) => b.value - a.value || a.unit.localeCompare(b.unit)).slice(0, RANKED);
	return top.length === 0
		? "none"
		: top.map(({ unit, value }) => `${JSON.stringify(unit)} (${unitClass(unit)}) ${amount(value)}`).join(", ");
}

/** The class of a unit (A-036): the job whose scope it is, or unattributed. */
function unitClass(unit: string): string {
	const job = jobOfScope(unit);
	return job === undefined ? "unattributed" : `job ${job}`;
}
