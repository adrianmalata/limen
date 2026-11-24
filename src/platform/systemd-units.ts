// Systemd units as typed data, the one renderer of the text systemd reads (D-010), and the install of the seat sweep's
// user units on the agents' account (A-024, R-032). A unit is its header line and a list of sections, each a list of
// directives; a value that would start a line of its own is refused. The placement of unit files is one policy here
// (T-25 (1)): read every file, write atomically only what differs, verify, and put the old files back on a failure, so
// a second placement changes nothing that is in place. The seat's alerts (seat/units.ts, seat/alerts.ts) render and
// place their system units through it; the sweep's install places its user units in the folder the user manager
// reads, then reloads the manager and enables the timer. The calls to systemd are the platform adapter's.
import { existsSync } from "node:fs";
import { readFile, rm } from "node:fs/promises";
import { basename, join } from "node:path";
import { atomicWrite, makeDurableFolder } from "../atomic-write.ts";
import { environmentError } from "../outcome.ts";
import { hasCode } from "../system-error.ts";
import { type ManagerCall, platform } from "./platform.ts";

/** One `Key=value` line of a section. */
export type Directive = readonly [key: string, value: string];
export type UnitSection = {
	readonly name: "Unit" | "Service" | "Timer" | "Install";
	readonly directives: readonly Directive[];
};
/** A unit file: its name under the unit folder, the comment that is its first line, and its sections in order. */
export type UnitDefinition = {
	readonly file: string;
	readonly header: string;
	readonly sections: readonly UnitSection[];
};

export const SWEEP_SERVICE = "limen-sweep.service";
export const SWEEP_TIMER = "limen-sweep.timer";
/** The first line of each sweep unit: who writes it, and that a second write of the same text changes nothing. */
const SWEEP_HEADER = "# Written by limen seat sweep --install, which writes it again only when its text changes.";
/** Root's Node, which the alerts' unit runs too (seat/units.ts): a program the agents' account cannot replace
 * (A-025). */
const NODE = "/usr/bin/node";
/**
 * The longest run of the sweep before systemd stops it (D-056 (4)): above a lock's 60 s wait (src/lock.ts), the 10 s
 * confirmation of a dead job and the 11 s and 10 s bounds of each of several jobs it cannot end, one after another.
 */
const SWEEP_TIMEOUT_SEC = "300";
const KEY = /^[A-Z][A-Za-z]*$/;
/** A package root that `ExecStart` holds as one word: an absolute path with no space, quote or backslash. */
const ONE_WORD_PATH = /^\/[^\s"'\\]*$/;
/** The width of every line Limen generates (T-10). */
const LINE_LIMIT = 100;

/**
 * The sweep's service and timer (A-024, R-032): a oneshot run of `limen seat sweep` by absolute paths (T-26 (4)), the
 * package's own `bin/limen` under root's Node, every minute from boot, stopped after `SWEEP_TIMEOUT_SEC`.
 */
export function sweepUnits(packageRoot: string): readonly UnitDefinition[] {
	const root = packageRoot.replace(/\/+$/, "");
	if (!ONE_WORD_PATH.test(root)) {
		throw new Error(`the package root ${JSON.stringify(packageRoot)} is no absolute path ExecStart holds as one word`);
	}
	return [
		{
			file: SWEEP_SERVICE,
			header: SWEEP_HEADER,
			sections: [
				{
					name: "Unit",
					directives: [["Description", "Limen seat sweep: end the dead jobs of every registered project"]],
				},
				{
					name: "Service",
					directives: [
						["Type", "oneshot"],
						["ExecStart", `${NODE} ${root}/bin/limen seat sweep`],
						["TimeoutStartSec", SWEEP_TIMEOUT_SEC],
					],
				},
			],
		},
		{
			file: SWEEP_TIMER,
			header: SWEEP_HEADER,
			sections: [
				{ name: "Unit", directives: [["Description", "Run the Limen seat sweep every minute"]] },
				{
					name: "Timer",
					directives: [
						["OnBootSec", "1min"],
						["OnUnitActiveSec", "1min"],
						["AccuracySec", "1s"],
						["Unit", SWEEP_SERVICE],
					],
				},
				{ name: "Install", directives: [["WantedBy", "timers.target"]] },
			],
		},
	];
}

/** The text of `unit`: its header line, then each section with its directives, sections apart by one empty line. */
export function renderUnit(unit: UnitDefinition): string {
	if (!unit.header.startsWith("# ") || /\p{Cc}/u.test(unit.header) || [...unit.header].length > LINE_LIMIT) {
		throw new Error(
			`${unit.file}: the header ${JSON.stringify(unit.header)} is not one comment line of 100 characters`,
		);
	}
	const sections = unit.sections.map(({ name, directives }) =>
		[`[${name}]`, ...directives.map((directive) => directiveLine(unit.file, directive))].join("\n"),
	);
	return `${unit.header}\n${sections.join("\n\n")}\n`;
}

/** `Key=value`; a key of another form, an empty value or a control character in it would change what systemd reads. */
function directiveLine(file: string, [key, value]: Directive): string {
	if (!KEY.test(key) || value === "" || /\p{Cc}/u.test(value)) {
		throw new Error(`${file}: the directive ${JSON.stringify(key)}=${JSON.stringify(value)} cannot be written`);
	}
	return `${key}=${value}`;
}

/** A unit file to place: where it goes and its text. */
export type UnitFile = { readonly path: string; readonly text: string };
/** The verification of unit files by the manager that loads them, and its name in the message of a failure. */
export type UnitVerifier = { readonly name: string; readonly verify: (paths: readonly string[]) => ManagerCall };
/** A unit file a placement wrote, with its text before, or undefined when it was not there. */
type Placed = { readonly path: string; readonly earlier: string | undefined };

/**
 * The one policy that places unit files (T-25 (1), D-010), for the sweep's user units and the alerts' system units
 * (seat/alerts.ts): it reads the text of every file first, writes each one whose text differs, atomically, and when it
 * wrote one verifies them all with `verifier`; a failed write or a failed verification puts each file it wrote back as
 * it was. Returns the paths it wrote, none when every text was in place. Each failure is an environment failure (exit
 * 4) with `again` as its next: UNIT_FILE_UNREADABLE before any write, UNIT_FILE_UNWRITTEN and UNITS_INVALID after one.
 */
export async function placeUnitFiles(
	files: readonly UnitFile[],
	verifier: UnitVerifier,
	again: string | null,
): Promise<readonly string[]> {
	const before: (string | undefined)[] = [];
	for (const file of files) {
		before.push(await currentText(file.path, again));
	}
	const changed: Placed[] = [];
	for (const [index, file] of files.entries()) {
		const earlier = before[index];
		if (earlier !== file.text) {
			changed.push({ path: file.path, earlier });
			await writeUnit(file, changed, again);
		}
	}
	if (changed.length > 0) {
		const verified = verifier.verify(files.map((file) => file.path));
		if (verified.kind === "failed") {
			const back = await putBack(changed);
			const names = files.map((file) => basename(file.path)).join(" and ");
			throw environmentError(
				"UNITS_INVALID",
				`${verifier.name} failed for ${names}: ${verified.detail}; ${back}`,
				again,
			);
		}
	}
	return changed.map((unit) => unit.path);
}

/** The commands that run the install and the removal again, the `next` of each of their failures. */
const INSTALL_AGAIN = "limen seat sweep --install";
const UNINSTALL_AGAIN = "limen seat sweep --uninstall";

/**
 * Places the sweep's units of this version in the user manager's unit folder (`placeUnitFiles`, verified as that
 * manager loads them), reloads the manager and enables the timer at once; the lines that say what it did. The reload
 * runs also when no unit changed: one that failed before left the written units unloaded, and this run finds them
 * unchanged.
 */
export async function installSweepUnits(packageRoot: string): Promise<string[]> {
	const folder = platform.userUnitFolder();
	const units = sweepUnits(packageRoot).map((unit) => ({ path: join(folder, unit.file), text: renderUnit(unit) }));
	await makeDurableFolder(folder);
	const verifier = { name: "systemd-analyze --user verify", verify: platform.verifyUserUnits };
	const written = await placeUnitFiles(units, verifier, INSTALL_AGAIN);
	managerStep(platform.reloadUserManager(), "reloading the user manager", INSTALL_AGAIN);
	managerStep(platform.enableUserTimer(SWEEP_TIMER), `enabling ${SWEEP_TIMER}`, INSTALL_AGAIN);
	const state = written.length === 0 ? `unchanged in ${folder}` : `written in ${folder} and verified`;
	return [
		`${SWEEP_SERVICE} and ${SWEEP_TIMER} ${state}; reloaded`,
		`${SWEEP_TIMER} enabled: the sweep runs every minute`,
	];
}

/**
 * Disables the timer at once, removes both sweep units and reloads the user manager; the lines that say what it did.
 * Every step runs again on a rerun, so a run after one that stopped half-way finishes it (T-38 (3), review round 2,
 * note 11): with the files gone the disable and the reload still run. A disable that fails once the timer's file is
 * gone and the timer is not active had nothing left to do, as systemd refuses to disable a unit with no file; while
 * the file is there or the timer runs, its failure ends the removal.
 */
export async function uninstallSweepUnits(): Promise<string[]> {
	const folder = platform.userUnitFolder();
	const present = [SWEEP_SERVICE, SWEEP_TIMER].filter((file) => existsSync(join(folder, file)));
	const disabled = platform.disableUserTimer(SWEEP_TIMER);
	const disableLeft = present.includes(SWEEP_TIMER) || platform.userUnitState(SWEEP_TIMER, "is-active") === "active";
	if (disableLeft) {
		managerStep(disabled, `disabling ${SWEEP_TIMER}`, UNINSTALL_AGAIN);
	}
	for (const file of present) {
		await rm(join(folder, file), { force: true });
	}
	managerStep(platform.reloadUserManager(), "reloading the user manager", UNINSTALL_AGAIN);
	const removed =
		present.length === 0
			? `neither ${SWEEP_SERVICE} nor ${SWEEP_TIMER} was in ${folder}`
			: `removed ${present.join(" and ")} from ${folder}`;
	return [`${removed}; ${SWEEP_TIMER} is not active; reloaded`];
}

/** The text of a unit file, or undefined when there is none; any other failure to read it ends the placement (T-01). */
async function currentText(path: string, again: string | null): Promise<string | undefined> {
	try {
		return await readFile(path, "utf8");
	} catch (error) {
		if (hasCode(error, "ENOENT")) {
			return undefined;
		}
		throw environmentError("UNIT_FILE_UNREADABLE", `cannot read ${path}: ${reasonOf(error)}`, again);
	}
}

/** Writes one unit; when that fails, the units written before it go back as they were, and the failure goes on. */
async function writeUnit(file: UnitFile, changed: readonly Placed[], again: string | null): Promise<void> {
	try {
		await atomicWrite(file.path, file.text, { mode: 0o644 });
	} catch (error) {
		const back = await putBack(changed.filter((unit) => unit.path !== file.path));
		throw environmentError("UNIT_FILE_UNWRITTEN", `cannot write ${file.path}: ${reasonOf(error)}; ${back}`, again);
	}
}

/** Puts each unit back as it was, or removes one that was not there; the words that say how that went. */
async function putBack(units: readonly Placed[]): Promise<string> {
	const left: string[] = [];
	for (const { path, earlier } of units) {
		try {
			if (earlier === undefined) {
				await rm(path, { force: true });
			} else {
				await atomicWrite(path, earlier, { mode: 0o644 });
			}
		} catch (error) {
			left.push(`${path} (${reasonOf(error)})`);
		}
	}
	return left.length === 0
		? "the units are back as they were"
		: `these units could not be put back: ${left.join(", ")}`;
}

const reasonOf = (error: unknown) => (error instanceof Error ? error.message : String(error));

/** A call to the user manager that failed ends the install or the removal with exit 4, naming the step (T-02). */
function managerStep(call: ManagerCall, doing: string, again: string): void {
	if (call.kind === "failed") {
		throw environmentError("USER_MANAGER_FAILED", `${doing} failed: ${call.detail}`, again);
	}
}
