// `limen status` lists the leftover files of cut features in the project it reports on, the Limen variables of its
// environment that it no longer reads or reads only until a ticket, names a running job's note, lists the finished
// jobs whose unlanded work makes a worker spawn refuse (A-001) and the branches of abandoned work (A-002), warns when
// the alerts do not run (A-066), names a hook's refusal in a coordinator's session (T-32 (4)), shows a dead job without
// ending it (T-04), and names the jobs the seat sweep cannot end and a sweep that does not run (R-032).
import assert from "node:assert/strict";
import { copyFileSync, existsSync, mkdirSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { test } from "node:test";
import { fileURLToPath } from "node:url";
import { platform } from "../../src/platform/platform.ts";
import { outputText, readOutcome } from "../final-line.ts";
import {
	editRecord,
	git,
	jobDir,
	jobRecord,
	limen,
	type Plant,
	plant,
	release,
	repository,
	spawnJob,
	until,
	waitJob,
	writeRecord,
} from "../plant.ts";
import { snapshot } from "../snapshot.ts";

const AGENTS_TEMPLATE = fileURLToPath(new URL("../../templates/agents.md", import.meta.url));
const STUB_TEMPLATE = fileURLToPath(new URL("../../templates/limen-extension.ts", import.meta.url));
const ALERTS_TOOL = fileURLToPath(new URL("../../seat/alerts.ts", import.meta.url));
const HEADER = "Leftover files (1); check them, then run limen init --drop-leftovers:";

test("limen status lists an AGENTS.md identical to the package's template as a leftover file before Older", async (t) => {
	const p = await plant();
	t.after(() => p.cleanup());
	copyFileSync(AGENTS_TEMPLATE, join(p.root, "AGENTS.md"));
	const run = limen(p, ["status"]);
	assert.equal(run.status, 0, run.stderr);
	const lines = run.stdout.split("\n");
	assert.ok(lines.includes(HEADER), run.stdout);
	const at = lines.indexOf(HEADER);
	assert.deepEqual(lines.slice(at, at + 3), [
		HEADER,
		"  AGENTS.md (identical copy of the package's templates/agents.md)",
		"Older: 0 records (limen status --all)",
	]);
});

test("limen status lists a .limen/finish-webhook.env left by the cut finish webhooks as a leftover file", async (t) => {
	const p = await plant();
	t.after(() => p.cleanup());
	writeFileSync(join(p.root, ".limen/finish-webhook.env"), "a credential the cut feature left\n");
	const run = limen(p, ["status"]);
	assert.equal(run.status, 0, run.stderr);
	const lines = run.stdout.split("\n");
	assert.ok(lines.includes(HEADER), run.stdout);
	const at = lines.indexOf(HEADER);
	assert.deepEqual(lines.slice(at, at + 2), [HEADER, "  .limen/finish-webhook.env (finish webhooks (R-002))"]);
});

test("limen status lists a spec/linear.md left by the cut Linear mirror as a leftover file", async (t) => {
	const p = await plant();
	t.after(() => p.cleanup());
	writeFileSync(join(p.root, "spec/linear.md"), "# Linear mirror\nTeam: T\nProject: P\n");
	const run = limen(p, ["status"]);
	assert.equal(run.status, 0, run.stderr);
	const lines = run.stdout.split("\n");
	assert.ok(lines.includes(HEADER), run.stdout);
	const at = lines.indexOf(HEADER);
	assert.deepEqual(lines.slice(at, at + 2), [HEADER, "  spec/linear.md (the Linear mirror (R-003))"]);
});

test("limen status lists a .omp/extensions/limen.ts left by the cut OMP engine as a leftover file", async (t) => {
	const p = await plant();
	t.after(() => p.cleanup());
	// The extension stub that `limen init` copied for OMP coordinators before the cut.
	mkdirSync(join(p.root, ".omp/extensions"), { recursive: true });
	copyFileSync(STUB_TEMPLATE, join(p.root, ".omp/extensions/limen.ts"));
	const run = limen(p, ["status"]);
	assert.equal(run.status, 0, run.stderr);
	const lines = run.stdout.split("\n");
	assert.ok(lines.includes(HEADER), run.stdout);
	const at = lines.indexOf(HEADER);
	assert.deepEqual(lines.slice(at, at + 2), [HEADER, "  .omp/extensions/limen.ts (the OMP engine (R-004))"]);
});

test("limen status lists a .limen/planning-source left by the cut private planning as a leftover file", async (t) => {
	const p = await plant();
	t.after(() => p.cleanup());
	// The planning source that the removed `limen planning private` stored.
	writeFileSync(join(p.root, ".limen/planning-source"), "private\n");
	const run = limen(p, ["status"]);
	assert.equal(run.status, 0, run.stderr);
	const lines = run.stdout.split("\n");
	assert.ok(lines.includes(HEADER), run.stdout);
	const at = lines.indexOf(HEADER);
	assert.deepEqual(lines.slice(at, at + 2), [HEADER, "  .limen/planning-source (private planning (R-006))"]);
});

test("limen status lists the files the cut Picture viewer, map jobs and map watch left, the marked watch hook included", async (t) => {
	const p = await plant();
	t.after(() => p.cleanup());
	// What `picture build`, `picture tick` and `picture watch on` wrote before the cut; the hook carries the watch's marker.
	writeFileSync(join(p.root, ".limen/picture/map.html"), "<!doctype html>\n");
	writeFileSync(join(p.root, ".limen/picture/job"), "2026-11-18-map-1a2b3c4d\n");
	writeFileSync(join(p.root, ".limen/picture/tick.lock"), "4242\n");
	writeFileSync(join(p.root, ".limen/picture-watch.log"), "2026-11-18T10:00:00Z refs/heads/main moved to 0123abc\n");
	mkdirSync(join(p.root, ".git/hooks"), { recursive: true });
	writeFileSync(
		join(p.root, ".git/hooks/reference-transaction"),
		'#!/bin/sh\n# limen picture watch {"branch":"main"}\nexit 0\n',
		{ mode: 0o755 },
	);
	const run = limen(p, ["status"]);
	assert.equal(run.status, 0, run.stderr);
	const header = "Leftover files (5); check them, then run limen init --drop-leftovers:";
	const lines = run.stdout.split("\n");
	assert.ok(lines.includes(header), run.stdout);
	const at = lines.indexOf(header);
	assert.deepEqual(lines.slice(at, at + 6), [
		header,
		"  .git/hooks/reference-transaction (the map watch (R-007))",
		"  .limen/picture-watch.log (the map jobs (R-007))",
		"  .limen/picture/job (the map jobs (R-007))",
		"  .limen/picture/map.html (the Picture viewer (R-007))",
		"  .limen/picture/tick.lock (the map jobs (R-007))",
	]);
});

test("limen status does not list a reference-transaction hook without the map watch's marker", async (t) => {
	const p = await plant();
	t.after(() => p.cleanup());
	// The project's own hook: Limen did not write it, so it is never listed or dropped.
	mkdirSync(join(p.root, ".git/hooks"), { recursive: true });
	writeFileSync(join(p.root, ".git/hooks/reference-transaction"), "#!/bin/sh\n# the project's own hook\nexit 0\n", {
		mode: 0o755,
	});
	const run = limen(p, ["status"]);
	assert.equal(run.status, 0, run.stderr);
	assert.deepEqual(
		run.stdout.split("\n").filter((line) => line.startsWith("Leftover files")),
		[],
	);
});

test("limen status prints no Leftover files section when the project has no leftover", async (t) => {
	const p = await plant();
	t.after(() => p.cleanup());
	const run = limen(p, ["status"]);
	assert.equal(run.status, 0, run.stderr);
	assert.deepEqual(
		run.stdout.split("\n").filter((line) => line.startsWith("Leftover files")),
		[],
	);
});

const UNREAD = "Environment settings Limen no longer reads (1); remove them:";
const UNTIL = "Environment variables read until a ticket replaces them (1):";

test("limen status names a setting of its environment that it no longer reads and a variable it reads until a ticket", async (t) => {
	const p = await plant();
	t.after(() => p.cleanup());
	const run = limen(p, ["status"], { env: { LIMEN_PREPARE: "pnpm install", LIMEN_WORKER_MODEL: "p/m" } });
	assert.equal(run.status, 0, run.stderr);
	const lines = run.stdout.split("\n");
	const at = lines.indexOf(UNREAD);
	assert.deepEqual(lines.slice(at, at + 5), [
		UNREAD,
		"  LIMEN_PREPARE: the spawn flag --prepare",
		UNTIL,
		"  LIMEN_WORKER_MODEL: until R-062",
		"Older: 0 records (limen status --all)",
	]);
});

test("limen status prints neither environment section when its environment holds no such variable", async (t) => {
	const p = await plant();
	t.after(() => p.cleanup());
	const run = limen(p, ["status"]);
	assert.equal(run.status, 0, run.stderr);
	assert.deepEqual(
		run.stdout.split("\n").filter((line) => line.startsWith("Environment ")),
		[],
	);
});

test("limen status names a running job's note by its file, advisory", async (t) => {
	const p = await plant();
	t.after(() => p.cleanup());
	const id = spawnJob(p, "block", ["--label", "noted"]);
	const dir = jobDir(p, id);
	await until(dir, () => existsSync(join(dir, "fake-blocked-1")));
	// The note the detached wrapper writes when it cannot observe a tool stall (src/runtime/wrapper.ts).
	const text = "tool stall observation uncertain: CPU or process identity unavailable";
	await editRecord(dir, () => ({ advisory: { text, at: new Date().toISOString() } }));
	const run = limen(p, ["status"]);
	await release(dir);
	assert.equal(run.status, 0, run.stderr);
	const line = run.stdout.split("\n").find((entry) => entry.startsWith(`  noted (${id})`)) ?? run.stdout;
	assert.ok(line.endsWith(" · advisory: tool stall observation uncertain: CPU or process identity unavailable"), line);
});

test("limen status: --all prints the summary without the 7-day window and under it one row for each job", async (t) => {
	const p = await plant();
	t.after(() => p.cleanup());
	const old = spawnJob(p, "say old", ["--label", "old"]);
	const recent = spawnJob(p, "say recent", ["--label", "recent"]);
	assert.deepEqual([waitJob(p, old), waitJob(p, recent)], ["done", "done"]);
	// A job that ended eight days ago is outside the window of the plain summary.
	await editRecord(jobDir(p, old), () => ({ finishedAt: new Date(Date.now() - 8 * 86_400_000).toISOString() }));
	assert.ok(limen(p, ["status"]).stdout.includes("Older: 1 record (limen status --all)"));
	const run = limen(p, ["status", "--all"]);
	assert.equal(run.status, 0, run.stderr);
	const lines = outputText(run).split("\n");
	const rows = (id: string) => lines.filter((line) => line.includes(` · id ${id} · `)).length;
	assert.deepEqual(
		[lines[0]?.startsWith("Plant "), lines.some((line) => line.startsWith("Older:")), lines.includes("Jobs (2):")],
		[true, false, true],
	);
	assert.deepEqual([rows(old), rows(recent)], [1, 1]);
});

// A-001: the section lists what makes a worker spawn refuse, so its age does not hide a job, as the 7-day window does.
test("limen status lists every finished job with unlanded work, whatever its age, with what it holds and both commands", async (t) => {
	const p = await plant();
	t.after(() => p.cleanup());
	// A worker spawn refuses while a finished job holds unlanded work, so the job with a commit commits after the last spawn.
	const clean = spawnJob(p, "say clean", ["--label", "clean"]);
	assert.equal(waitJob(p, clean), "done");
	const old = spawnJob(p, "block\ncommit", ["--label", "old"]);
	await until(jobDir(p, old), () => existsSync(join(jobDir(p, old), "fake-blocked-1")));
	const failed = spawnJob(p, "fail 3", ["--label", "failed"]);
	assert.equal(waitJob(p, failed), "failed");
	await release(jobDir(p, old));
	assert.equal(waitJob(p, old), "done");
	writeFileSync(join(jobRecord(p, failed)?.worktree ?? "", "wip.txt"), "half-done edit\n");
	await editRecord(jobDir(p, old), () => ({ finishedAt: new Date(Date.now() - 8 * 86_400_000).toISOString() }));
	const run = limen(p, ["status"]);
	assert.equal(run.status, 0, run.stderr);
	const lines = run.stdout.split("\n");
	const at = lines.indexOf("Unlanded work (spawn refuses until each is continued or abandoned):");
	assert.ok(at > 0, run.stdout);
	const listed = [failed, old].sort();
	const holds = {
		[failed]: "failed · 1 changed file, 0 unlanded commits",
		[old]: "done · 0 changed files, 1 unlanded commit",
	};
	assert.deepEqual(
		lines.slice(at + 1, at + 7),
		listed.flatMap((id) => [
			`  ${id} · ${holds[id]}`,
			`    limen continue ${id} "instruction"`,
			`    limen abandon ${id}`,
		]),
	);
	assert.ok(!lines[at + 7]?.startsWith("  "), run.stdout);
});

// A-002: Limen never deletes a limen/abandon/<id> branch, so status names each one until a person deletes it, also once
// retire moved its job's record to the job archive; before R-031 status named none.
test("limen status lists each limen/abandon/<id> branch of the project with its commit", async (t) => {
	const p = await plant();
	t.after(() => p.cleanup());
	const id = spawnJob(p, "commit");
	assert.equal(waitJob(p, id), "done");
	const abandoned = limen(p, ["abandon", id]);
	assert.equal(abandoned.status, 0, abandoned.stderr);
	const branch = `limen/abandon/${id}`;
	const run = limen(p, ["status"]);
	assert.equal(run.status, 0, run.stderr);
	const lines = run.stdout.split("\n");
	const at = lines.indexOf("Abandoned work (Limen keeps each branch until a person deletes it):");
	assert.ok(at > 0, run.stdout);
	assert.deepEqual(
		[lines[at + 1], lines[at + 2]?.startsWith("  ")],
		[`  ${branch} · ${git(p.root, "rev-parse", "--short", branch)}`, false],
		run.stdout,
	);
});

// Review round 1, F2: before the fix status listed a workspace repository's abandon branches only while a record in
// .limen/jobs/ named that repository, so the retire of the job's record hid its branch.
test("limen status in a workspace lists the abandon branch of a workspace repository after retire moved its job", async (t) => {
	const p = await plant();
	t.after(() => p.cleanup());
	const workspace = join(p.parent, "workspace");
	await repository(join(workspace, "api"));
	assert.equal(limen(p, ["workspace", "init"], { cwd: workspace }).status, 0);
	const id = spawnJob(p, "commit", ["--repo", "api"], { cwd: workspace });
	assert.equal(waitJob(p, id, { cwd: workspace }), "done");
	const abandoned = limen(p, ["abandon", id], { cwd: workspace });
	assert.equal(abandoned.status, 0, abandoned.stderr);
	// The daily retire of the seat sweep takes a job whose marker is at least 24 hours old (R-101).
	const old = new Date(Date.now() - 25 * 60 * 60_000).toISOString();
	await editRecord(join(workspace, ".limen", "jobs", id), (record) =>
		record.abandoned ? { abandoned: { ...record.abandoned, at: old } } : {},
	);
	const swept = limen(p, ["seat", "sweep"], { cwd: workspace });
	assert.equal(swept.status, 0, swept.stderr);
	assert.equal(existsSync(join(workspace, ".limen", "jobs", id)), false);
	const branch = `limen/abandon/${id}`;
	const run = limen(p, ["status"], { cwd: workspace });
	assert.equal(run.status, 0, run.stderr);
	const lines = run.stdout.split("\n");
	const at = lines.indexOf("Abandoned work (Limen keeps each branch until a person deletes it):");
	assert.ok(at > 0, run.stdout);
	const short = git(join(workspace, "api"), "rev-parse", "--short", branch);
	assert.equal(lines[at + 1], `  ${branch} · ${short} · repo api`, run.stdout);
});

// Review round 1, F6: work Git cannot read never reads as none, and the failure says which worktree and whose it is;
// before the fix the message held only Git's own words.
test("limen status exits 4 with GIT_FAILED when git cannot read a finished job's worktree, and names the worktree and its job", async (t) => {
	const p = await plant();
	t.after(() => p.cleanup());
	const id = spawnJob(p, "fail 3");
	assert.equal(waitJob(p, id), "failed");
	const worktree = jobRecord(p, id)?.worktree ?? "";
	// A corrupt index makes `git status` fail with an error that is not "not a git repository".
	writeFileSync(join(git(worktree, "rev-parse", "--absolute-git-dir"), "index"), "garbage\n");
	const run = limen(p, ["status"]);
	assert.deepEqual(
		[run.status, readOutcome(run).class, readOutcome(run).code],
		[4, "environment", "GIT_FAILED"],
		run.stderr,
	);
	const message = outputText(run);
	assert.ok(message.startsWith(`the worktree ${worktree} of job ${id} cannot be read: `), message);
	assert.match(message, /index file/);
});

/**
 * The plant's PATH with a systemctl first that says `timer` for `is-active limen-alerts.timer` and `service` for
 * `is-failed limen-alerts.service`, with systemd's exit codes, and passes every other call to the plant's own.
 */
function pathWithAlerts(p: Plant, timer: "active" | "inactive", service: "failed" | "inactive"): string {
	const folder = join(p.parent, `alerts-${timer}-${service}`);
	mkdirSync(folder);
	const script = [
		"#!/bin/sh",
		'case "$*" in',
		`"is-active limen-alerts.timer") echo ${timer}; [ ${timer} = active ] && exit 0; exit 3 ;;`,
		`"is-failed limen-alerts.service") echo ${service}; [ ${service} = failed ] && exit 0; exit 1 ;;`,
		"esac",
		`exec ${join(p.bin, "systemctl")} "$@"`,
	];
	writeFileSync(join(folder, "systemctl"), `${script.join("\n")}\n`, { mode: 0o755 });
	return `${folder}:${p.env.PATH}`;
}

/** The lines of `stdout` from the alerts' warning on, up to the next line that is not part of it. */
function alertsBlock(stdout: string): string[] {
	const lines = stdout.split("\n");
	const at = lines.findIndex((line) => line.startsWith("Alerts not working"));
	if (at < 0) {
		return [];
	}
	const end = lines.findIndex((line, index) => index > at && !line.startsWith("  "));
	return lines.slice(at, end < 0 ? undefined : end);
}

// A-066: the alerts are the owner's only escalation path, so status says when they do not run.
test("A-066: limen status warns that limen-alerts.timer is not active and names the install command", async (t) => {
	const p = await plant();
	t.after(() => p.cleanup());
	const run = limen(p, ["status"], { env: { PATH: pathWithAlerts(p, "inactive", "inactive") } });
	assert.equal(run.status, 0, run.stderr);
	assert.deepEqual(alertsBlock(run.stdout), [
		"Alerts not working (1); no alert reaches the phone until each is fixed:",
		"  limen-alerts.timer is not active; as root, install the alerts:",
		`    node ${ALERTS_TOOL} install --account <account>`,
	]);
});

test("A-066: limen status warns that limen-alerts.service failed and names where to read why", async (t) => {
	const p = await plant();
	t.after(() => p.cleanup());
	const run = limen(p, ["status"], { env: { PATH: pathWithAlerts(p, "active", "failed") } });
	assert.equal(run.status, 0, run.stderr);
	assert.deepEqual(alertsBlock(run.stdout), [
		"Alerts not working (1); no alert reaches the phone until each is fixed:",
		"  limen-alerts.service failed; as root, read why:",
		"    journalctl -u limen-alerts.service",
	]);
});

test("limen status prints no alerts warning when the timer is active and the service has not failed", async (t) => {
	const p = await plant();
	t.after(() => p.cleanup());
	const run = limen(p, ["status"], { env: { PATH: pathWithAlerts(p, "active", "inactive") } });
	assert.equal(run.status, 0, run.stderr);
	assert.deepEqual(alertsBlock(run.stdout), []);
	assert.ok(run.stdout.includes("Older: 0 records"), run.stdout);
});

/** A coordinator session's folder `session` in the plant's project, holding a hook's refusal with `message`. */
function plantRefusal(p: Plant, session: string, message: string): void {
	const folder = join(p.root, ".limen", "coordinators", session);
	mkdirSync(folder, { recursive: true });
	const refusal = { event: "message_end", field: "message", message, at: "2026-11-24T14:10:00.000Z" };
	writeFileSync(join(folder, "refusal.json"), `${JSON.stringify(refusal)}\n`);
}

/** The lines of `limen status` that name a coordinator session's refusal. */
const refusalLines = (stdout: string) => stdout.split("\n").filter((line) => line.startsWith("Coordinator session "));

const REFUSED = "Pi event message_end: message: expected an object, got nothing";

// T-32 (4), D-055 (2): Pi shows a hook's refusal only in the coordinator's chat, so status names it while the session's
// folder holds it.
test("limen status shows a hook's refusal in a coordinator's session on one line, with the session, the time and the detail", async (t) => {
	const p = await plant();
	t.after(() => p.cleanup());
	plantRefusal(p, "coord-1", REFUSED);
	const run = limen(p, ["status"]);
	assert.equal(run.status, 0, run.stderr);
	assert.deepEqual(refusalLines(run.stdout), [
		`Coordinator session coord-1, 2026-11-24T14:10:00.000Z: a Limen hook refused ${REFUSED}`,
	]);
});

test("T-04: limen status reads a coordinator session's refusal and writes nothing: the project's state snapshot stays identical", async (t) => {
	const p = await plant();
	t.after(() => p.cleanup());
	plantRefusal(p, "coord-1", REFUSED);
	const before = snapshot(p.root);
	const run = limen(p, ["status"]);
	assert.equal(run.status, 0, run.stderr);
	assert.deepEqual(snapshot(p.root), before);
});

// R-029 review round 1, note 6: a planted refusal file and its folder are text from outside Limen that reaches the
// coordinator, so a newline in either is escaped and adds no line (R-030's lines do the same through shownField).
test("limen status escapes a newline in a coordinator session's name and in its refusal's message, so the refusal stays one line", async (t) => {
	const p = await plant();
	t.after(() => p.cleanup());
	plantRefusal(p, "coord\nInjected session", "Pi event message_end: message\nInjected line");
	const run = limen(p, ["status"]);
	assert.equal(run.status, 0, run.stderr);
	assert.deepEqual(
		[refusalLines(run.stdout), run.stdout.includes("\nInjected")],
		[
			[
				"Coordinator session coord\\nInjected session, 2026-11-24T14:10:00.000Z: a Limen hook refused Pi event message_end: message\\nInjected line",
			],
			false,
		],
	);
});

/** A wrapper that is gone: a pid no process holds, under this boot, as a wrapper killed alone leaves it. */
const DEAD = { pid: 2_147_483_646, born: "1", bootId: platform.bootId() ?? null };

// T-04, R-032 (d): a read shows a dead job's state without writing it; only the seat sweep finalizes it.
test("a running job whose wrapper is dead shows wrapper dead; limen-sweep will finalize in its status row, and status leaves it running", async (t) => {
	const p = await plant();
	t.after(() => p.cleanup());
	const id = "2026-11-24-dead-1a2b3c4d";
	await writeRecord(jobDir(p, id), {
		state: "running",
		label: "dead one",
		branch: "limen/dead-one",
		identity: DEAD,
		startedAt: new Date().toISOString(),
	});
	writeFileSync(join(jobDir(p, id), "task.md"), "block\n");
	writeFileSync(join(jobDir(p, id), "log"), "");
	const before = snapshot(p.root);
	const run = limen(p, ["status"], { env: { LIMEN_REAP_CONFIRM_MS: "1" } });
	assert.equal(run.status, 0, run.stderr);
	const row = run.stdout.split("\n").find((line) => line.startsWith(`  dead one (${id})`)) ?? "";
	assert.deepEqual(
		[row.includes(" · wrapper dead; limen-sweep will finalize"), jobRecord(p, id)?.state, snapshot(p.root)],
		[true, "running", before],
		run.stdout,
	);
});

/** The lines of `stdout` from the section that starts with `header` on, up to the next line that is not part of it. */
function block(stdout: string, header: string): string[] {
	const lines = stdout.split("\n");
	const at = lines.findIndex((line) => line.startsWith(header));
	if (at < 0) {
		return [];
	}
	const end = lines.findIndex((line, index) => index > at && !line.startsWith("  "));
	return lines.slice(at, end < 0 ? undefined : end);
}

// R-032 (b), T-02: the sweep counts its failed attempts in the record; the third in a row is the owner's to see.
test("R-032: limen status names each job the sweep failed to end three times in a row, with the last reason and since when", async (t) => {
	const p = await plant();
	t.after(() => p.cleanup());
	const since = "2026-11-24T10:00:00.000Z";
	const detail = "limen-job-x.scope not ended: Failed to connect to bus";
	const jobs = { "2026-11-24-twice-1a2b3c4d": 2, "2026-11-24-thrice-5e6f7a8b": 3 };
	for (const [id, attempts] of Object.entries(jobs)) {
		await writeRecord(jobDir(p, id), {
			state: "running",
			label: id,
			identity: DEAD,
			startedAt: since,
			stuck: { since, attempts, detail },
		});
	}
	const run = limen(p, ["status"]);
	assert.equal(run.status, 0, run.stderr);
	assert.deepEqual(block(run.stdout, "Jobs the sweep cannot end"), [
		"Jobs the sweep cannot end (1):",
		`  2026-11-24-thrice-5e6f7a8b: ${detail} (since ${since})`,
	]);
});

/**
 * The plant's PATH with a systemctl first that says `timer` for `--user is-active limen-sweep.timer` and `service` for
 * `--user is-failed limen-sweep.service`, with systemd's exit codes, and passes every other call to the plant's own.
 */
function pathWithSweep(p: Plant, timer: "active" | "inactive", service: "failed" | "inactive"): string {
	const folder = join(p.parent, `sweep-${timer}-${service}`);
	mkdirSync(folder);
	const script = [
		"#!/bin/sh",
		'case "$*" in',
		`"--user is-active limen-sweep.timer") echo ${timer}; [ ${timer} = active ] && exit 0; exit 3 ;;`,
		`"--user is-failed limen-sweep.service") echo ${service}; [ ${service} = failed ] && exit 0; exit 1 ;;`,
		"esac",
		`exec ${join(p.bin, "systemctl")} "$@"`,
	];
	writeFileSync(join(folder, "systemctl"), `${script.join("\n")}\n`, { mode: 0o755 });
	return `${folder}:${p.env.PATH}`;
}

// A-024, R-032 (f): without the sweep no dead job is finalized, so status says when it does not run, as for the alerts.
test("R-032: limen status warns that limen-sweep.timer is not active and names the install on the agents' account", async (t) => {
	const p = await plant();
	t.after(() => p.cleanup());
	const run = limen(p, ["status"], { env: { PATH: pathWithSweep(p, "inactive", "inactive") } });
	assert.equal(run.status, 0, run.stderr);
	assert.deepEqual(block(run.stdout, "Sweep not working"), [
		"Sweep not working (1); no dead job is finalized until each is fixed:",
		"  limen-sweep.timer is not active; on the agents' account, install the sweep:",
		"    limen seat sweep --install",
	]);
});

test("R-032: limen status warns that limen-sweep.service failed and names where to read why", async (t) => {
	const p = await plant();
	t.after(() => p.cleanup());
	const run = limen(p, ["status"], { env: { PATH: pathWithSweep(p, "active", "failed") } });
	assert.equal(run.status, 0, run.stderr);
	assert.deepEqual(block(run.stdout, "Sweep not working"), [
		"Sweep not working (1); no dead job is finalized until each is fixed:",
		"  limen-sweep.service failed; read why:",
		"    journalctl --user -u limen-sweep.service",
	]);
});

test("limen status prints no sweep warning when the timer is active and the service has not failed", async (t) => {
	const p = await plant();
	t.after(() => p.cleanup());
	const run = limen(p, ["status"], { env: { PATH: pathWithSweep(p, "active", "inactive") } });
	assert.equal(run.status, 0, run.stderr);
	assert.deepEqual(block(run.stdout, "Sweep not working"), []);
});
