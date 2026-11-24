/**
 * The deployment's check of the seat sweep's user units (D-010, R-032 (g)): `seat/deploy.ts` runs it as a process from
 * the new checkout, so it renders the units with that checkout's code, for that checkout's `bin/limen`, into a new
 * folder of the OS temporary folder, and runs `systemd-analyze verify` on them. It writes nothing in any home: the
 * agents' account installs the units itself (`limen seat sweep --install`, plan step 3.1), so a unit change of a later
 * tag is that tag's seat step (R-032 Decision 5).
 *
 *   node seat/sweep-units.ts      from the checkout, as root, at each deployment
 */
import { spawnSync } from "node:child_process";
import { existsSync, realpathSync } from "node:fs";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { atomicWrite } from "../src/atomic-write.ts";
import { renderUnit, sweepUnits } from "../src/platform/systemd-units.ts";
import { printable, reason, type SeatOutcome } from "./tool-outcome.ts";

/** How long `systemd-analyze verify` may take: it loads both units and every unit they name. */
const VERIFY_TIMEOUT_MS = 30_000;

/** What the check needs: the checkout whose units it renders, and the folder of its temporary folder. */
export type SweepUnitsInput = { readonly checkout: string; readonly temporary: string };

/** The check's exit code and its text; only the entry point sets the code. */
export async function verifySweepUnits(input: SweepUnitsInput): Promise<SeatOutcome> {
	const folder = await mkdtemp(join(input.temporary, "limen-sweep-units-"));
	try {
		const units = sweepUnits(input.checkout).map((unit) => ({ path: join(folder, unit.file), text: renderUnit(unit) }));
		for (const unit of units) {
			await atomicWrite(unit.path, unit.text, { mode: 0o644 });
		}
		const result = spawnSync("systemd-analyze", ["verify", ...units.map((unit) => unit.path)], {
			encoding: "utf8",
			timeout: VERIFY_TIMEOUT_MS,
		});
		const names = units.map((unit) => unit.path.slice(folder.length + 1)).join(" and ");
		if (result.error === undefined && result.status === 0) {
			return { code: 0, stdout: `verified ${names} of ${input.checkout}\n`, stderr: "" };
		}
		const said = `${result.stdout ?? ""}${result.stderr ?? ""}`.trim();
		const cause = result.error?.message ?? (result.signal ? `ended by ${result.signal}` : `exit ${result.status}`);
		const stderr = `systemd-analyze verify failed for ${names} (${cause})${said ? `:\n${said}` : ""}\n`;
		return { code: 4, stdout: "", stderr: printable(stderr, "keep") };
	} catch (error) {
		return { code: 4, stdout: "", stderr: printable(`cannot verify the sweep units: ${reason(error)}\n`, "keep") };
	} finally {
		await rm(folder, { recursive: true, force: true });
	}
}

// As in seat/deploy.ts: the entry point compares the real path of the script Node started, so a start through a
// symlinked path runs the tool too, and an import by a test runs nothing.
const started = process.argv[1];
if (started !== undefined && existsSync(started) && realpathSync(started) === fileURLToPath(import.meta.url)) {
	const outcome = await verifySweepUnits({
		checkout: dirname(dirname(fileURLToPath(import.meta.url))),
		temporary: tmpdir(),
	});
	process.stdout.write(outcome.stdout);
	process.stderr.write(outcome.stderr);
	process.exitCode = outcome.code;
}
