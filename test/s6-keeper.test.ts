// S6 · Spec keeper. Ticket numbers, place ids and the keeper's start rules, all through the real CLI. The strict
// ticket gate is s5's land refusal and u1's diagnostics.
import assert from "node:assert/strict";
import { existsSync, readdirSync } from "node:fs";
import { mkdir, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { after, test } from "node:test";
import { git, jobDir, jobFile, limen, plant, release, spawnJob, TICKET, waitJob } from "./plant.ts";

const p = await plant();
after(p.cleanup);
const ROUTE = ["--engine", "pi", "--provider", "p", "--model", "m", "--thinking", "high"];
const ARCHIVE =
	"path\tnumber\ttitle\tclose_month\nspec/features/done/2026-09/F012-c\tF012\tc\t2026-09\nhigh-water\tF012\n";
const lane = (name: string) =>
	existsSync(join(p.root, "spec/features", name)) ? readdirSync(join(p.root, "spec/features", name)) : [];

// The F009 job stays running until the keeper refusal below has been seen.
await mkdir(join(p.root, "spec/features/done/2026-09/F004-x"), { recursive: true });
git(p.root, "branch", "limen/f007-y");
const worker = spawnJob(p, "block\ncommit", ["--label", "F009 keeper proof"]);

test("ticket new refuses an unknown place id before any file exists, then takes the number past folders, limen branches and job labels", () => {
	const before = lane("planned");
	const refused = limen(p, ["ticket", "new", "y", "--touches", "nope"]);
	assert.match(`${refused.status} ${refused.stderr}`, /^1 .*nope/s);
	assert.deepEqual(lane("planned"), before);
	const made = limen(p, ["ticket", "new", "x", "--touches", "demo.place"]);
	assert.equal(made.stdout, "spec/features/planned/F010-x/ticket.md\n", made.stderr);
	assert.ok(existsSync(join(p.root, made.stdout.trim())));
});

test("picture build --strict --dir takes a plant root from any folder, prints the place count and writes nothing in the map folder", () => {
	const map = join(p.root, ".limen/picture");
	const before = readdirSync(map);
	const built = limen(p, ["picture", "build", "--strict", "--dir", p.root], { cwd: p.parent });
	assert.match(`${built.status} ${built.stdout}`, /^0 picture: [1-9]\d* places, \d+ edges\n$/, built.stderr);
	assert.deepEqual(readdirSync(map), before);
});

test("picture build stops on a folder with no map with an error that names both paths and nothing else", () => {
	const { status, stderr } = limen(p, ["picture", "build", "--dir", p.bin]);
	assert.deepEqual(
		[status, stderr],
		[1, `${p.bin} has no plant file (nodes/*.md with "kind: plant") and no map at ${p.bin}/.limen/picture\n`],
	);
});

test("keeper refuses a running job, then starts on a new branch at the candidate tip", async () => {
	const refused = limen(p, ["keeper", TICKET, "--job", worker, ...ROUTE]);
	assert.equal(refused.status, 1);
	assert.match(refused.stderr, new RegExp(worker));
	assert.deepEqual([git(p.root, "branch", "--list", "limen/keeper-*"), jobFile(p, worker, "state")], ["", "running"]);

	await release(jobDir(p, worker));
	assert.equal(waitJob(p, worker), "done");
	const branch = jobFile(p, worker, "branch");
	const tip = git(p.root, "rev-parse", branch);
	assert.notEqual(tip, git(p.root, "rev-parse", "main"));
	// The worker's task named the planned lane; the keeper follows the one F001 folder at the tip.
	const started = limen(p, ["keeper", "spec/features/planned/F001-demo/ticket.md", "--job", worker, ...ROUTE]);
	const keeper = started.stdout.trim().split("\n").at(-1) ?? "";
	const keeperBranch = `limen/keeper-f001-${tip.slice(0, 7)}`;
	assert.deepEqual([jobFile(p, keeper, "branch"), jobFile(p, keeper, "base")], [keeperBranch, tip]);
	assert.ok(jobFile(p, keeper, "task.md").split("\n").includes(`Ticket: ${TICKET}`));
	assert.deepEqual([git(p.root, "rev-parse", branch), waitJob(p, keeper)], [tip, "done"]);
	const again = limen(p, ["keeper", TICKET, "--job", worker, ...ROUTE]);
	assert.equal(again.status, 1);
	assert.match(again.stderr, new RegExp(keeperBranch));
});

test("cancelled and archived numbers stay taken, and readers follow", async () => {
	await mkdir(join(p.root, "spec/features/cancelled/F011-c"), { recursive: true });
	assert.match(limen(p, ["ticket", "new", "c"]).stdout, /F012-c/);
	// Branch dup takes F010 and F012 out of main's lanes; F012 goes to the archive register, still taken and closed.
	git(p.root, "checkout", "-qb", "dup");
	git(p.root, "add", "spec/features/planned");
	git(p.root, "commit", "-qm", "dup");
	git(p.root, "checkout", "-q", "main");
	await writeFile(join(p.root, "spec/features/archive.tsv"), ARCHIVE);
	assert.match(limen(p, ["ticket", "new", "a"]).stdout, /F013-a/);
	assert.match(limen(p, ["close", "F012"]).stderr, /herdr is not available/);
	assert.match(limen(p, ["board"]).stdout, /`F012-c` \(🟢 PROVEN\): c\n- 2026-09: 1 landed\. \S+archive\.tsv\n/);
	const check = limen(p, ["ticket", "check", "dup"]);
	assert.match(`${check.status} ${check.stderr}`, /^1 .*F012-c.*archive\.tsv:2/s);
});
