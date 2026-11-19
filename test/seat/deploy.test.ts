// seat/deploy.ts on fixtures: a bare origin, a clone of it as the checkout, and a password file whose home has a registry.
import assert from "node:assert/strict";
import { spawn, spawnSync } from "node:child_process";
import { writeFileSync } from "node:fs";
import { mkdir, mkdtemp, realpath, rm, symlink, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test, { type TestContext } from "node:test";
import { fileURLToPath } from "node:url";
import { runDeploy, type Verification } from "../../seat/deploy.ts";
import { git } from "../plant.ts";

// The deployment's git gets this process's environment (`deployTo`), so the laptop's own git configuration must not
// reach the fixtures.
process.env.GIT_CONFIG_GLOBAL = "/dev/null";
process.env.GIT_CONFIG_NOSYSTEM = "1";

const SCRIPT = fileURLToPath(new URL("../../seat/deploy.ts", import.meta.url));
const NOW = Date.parse("2026-11-19T06:30:00Z");
const TAG = "deployed-2026-11-19-063000";
const JOB = "2026-11-19-demo-1a2b3c4d";
const MISSING = "0123456789abcdef0123456789abcdef01234567";
/** The bound of one verification and of one run of the real entry point. */
const BOUND_MS = 60_000;

type Fixture = {
	readonly dir: string;
	/** The checkout the script deploys into; detached at `older`. */
	readonly repo: string;
	readonly passwd: string;
	/** The registry of the agents' account, the only home of `passwd` that has one. */
	readonly registry: string;
	/** A project listed in the registry, with a finished job. */
	readonly project: string;
	/** A folder with no `.limen/`, listed in the registry after the project. */
	readonly tools: string;
	readonly older: string;
	/** Pushed to origin's `adrian-rebuild` after the clone, so only the script's fetch brings it. */
	readonly newer: string;
	/** On origin's branch `side`, which the clone has, and not on `adrian-rebuild`. */
	readonly side: string;
};

function commit(work: string, file: string, text: string): string {
	writeFileSync(join(work, file), text);
	git(work, "add", file);
	git(work, "commit", "-q", "-m", file);
	return git(work, "rev-parse", "HEAD");
}

async function fixture(t: TestContext): Promise<Fixture> {
	const dir = await realpath(await mkdtemp(join(tmpdir(), "limen-deploy-")));
	t.after(() => rm(dir, { recursive: true, force: true }));
	const [work, origin, repo] = [join(dir, "work"), join(dir, "origin.git"), join(dir, "repo")];
	await mkdir(work);
	git(work, "init", "-q", "-b", "adrian-rebuild");
	git(work, "config", "user.email", "limen@example.test");
	git(work, "config", "user.name", "Limen Test");
	const older = commit(work, "README.md", "older\n");
	git(work, "checkout", "-q", "-b", "side");
	const side = commit(work, "side.txt", "side\n");
	git(work, "checkout", "-q", "adrian-rebuild");
	git(dir, "clone", "-q", "--bare", work, origin);
	git(dir, "clone", "-q", "--branch", "adrian-rebuild", origin, repo);
	git(repo, "checkout", "-q", "--detach", older);
	const newer = commit(work, "newer.txt", "newer\n");
	git(work, "push", "-q", origin, "adrian-rebuild");
	const [home, project, tools] = [join(dir, "agents"), join(dir, "project"), join(dir, "tools")];
	const done = join(project, ".limen", "jobs", "2026-11-18-done-0a0b0c0d");
	await Promise.all([mkdir(join(home, ".limen"), { recursive: true }), mkdir(done, { recursive: true }), mkdir(tools)]);
	await writeFile(join(done, "state"), "done\n");
	// The second line is a junk registration: a folder with no `.limen/`.
	const registry = join(home, ".limen", "projects");
	await writeFile(registry, `${project}\n${tools}\n`);
	const passwd = join(dir, "passwd");
	await writeFile(passwd, `root:x:0:0:root:${join(dir, "root")}:/bin/sh\nagents:x:1000:1000::${home}:/bin/sh\n`);
	return { dir, repo, passwd, registry, project, tools, older, newer, side };
}

function deployTo(
	f: Fixture,
	sha: string,
	verifications: readonly Verification[] = [],
	env: NodeJS.ProcessEnv = process.env,
) {
	return runDeploy({ args: [sha], repo: f.repo, passwd: f.passwd, now: () => NOW, verifications, env });
}
const head = (f: Fixture) => git(f.repo, "rev-parse", "HEAD");
const tags = (f: Fixture) => git(f.repo, "tag", "--list");
const fetched = (f: Fixture) => git(f.repo, "rev-parse", "origin/adrian-rebuild");

async function jobFolder(f: Fixture, files: Readonly<Record<string, string>>): Promise<void> {
	const dir = join(f.project, ".limen", "jobs", JOB);
	await mkdir(dir);
	for (const [name, text] of Object.entries(files)) {
		await writeFile(join(dir, name), text);
	}
}

test("a job its spawner still sets up refuses the deployment before the fetch, naming the job and its label", async (t) => {
	const f = await fixture(t);
	await jobFolder(f, { starting: `${process.pid}\n`, label: "demo job\n" });
	const run = await deployTo(f, f.newer);
	assert.deepEqual([run.code, head(f), tags(f), fetched(f)], [1, f.older, "", f.older], run.stderr);
	assert.ok(run.stderr.split("\n").includes(`${f.project}  ${JOB}  demo job`), run.stderr);
});

test("a job whose wrapper's process group is alive refuses the deployment before the fetch", async (t) => {
	const f = await fixture(t);
	const wrapper = spawn(process.execPath, ["-e", `setTimeout(() => {}, ${BOUND_MS})`], {
		detached: true,
		stdio: "ignore",
	});
	wrapper.unref();
	try {
		await jobFolder(f, { state: "running\n", pid: `${wrapper.pid}\n` });
		const run = await deployTo(f, f.newer);
		assert.deepEqual([run.code, head(f), tags(f), fetched(f)], [1, f.older, "", f.older], run.stderr);
		assert.ok(run.stderr.split("\n").includes(`${f.project}  ${JOB}`), run.stderr);
	} finally {
		wrapper.kill("SIGKILL");
	}
});

test("a commit of another branch of origin is refused, naming the branch, and HEAD and the tags stay", async (t) => {
	const f = await fixture(t);
	const run = await deployTo(f, f.side);
	assert.deepEqual([run.code, head(f), tags(f)], [1, f.older, ""], run.stderr);
	assert.match(run.stderr, /origin\/adrian-rebuild/);
});

test("a commit the checkout does not have is refused, naming the branch, and HEAD and the tags stay", async (t) => {
	const f = await fixture(t);
	const run = await deployTo(f, MISSING);
	assert.deepEqual([run.code, head(f), tags(f)], [1, f.older, ""], run.stderr);
	assert.match(run.stderr, /origin\/adrian-rebuild/);
});

test("a newer commit of the branch is fetched, checked out detached and tagged once", async (t) => {
	const f = await fixture(t);
	const run = await deployTo(f, f.newer);
	assert.equal(run.code, 0, run.stderr);
	assert.deepEqual(
		[head(f), git(f.repo, "rev-parse", "--abbrev-ref", "HEAD"), git(f.repo, "tag", "--points-at", f.newer), tags(f)],
		[f.newer, "HEAD", TAG, TAG],
	);
	for (const part of [f.newer, f.older, TAG, "/reload"]) {
		assert.ok(run.stdout.includes(part), `${part} is not in: ${run.stdout}`);
	}
});

test("a failed verification returns the checkout to the previous commit and exits 4 with no tag", async (t) => {
	const f = await fixture(t);
	const fails: Verification = { name: "fails", argv: [process.execPath, "-e", "process.exit(3)"], timeoutMs: BOUND_MS };
	const run = await deployTo(f, f.newer, [fails]);
	assert.deepEqual([run.code, head(f), tags(f)], [4, f.older, ""], run.stderr);
	assert.ok(run.stderr.includes(`verification "fails" failed`), run.stderr);
	assert.ok(run.stderr.includes(`back at the previous commit ${f.older}`), run.stderr);
});

test("a verification runs as its own process in the new checkout", async (t) => {
	const f = await fixture(t);
	const reads: Verification = {
		name: "reads newer.txt",
		argv: [process.execPath, "-e", 'process.getBuiltinModule("node:fs").accessSync("newer.txt")'],
		timeoutMs: BOUND_MS,
	};
	const run = await deployTo(f, f.newer, [reads]);
	assert.deepEqual([run.code, head(f), tags(f)], [0, f.newer, TAG], run.stderr);
});

test("deploying the commit the checkout already holds runs every step and tags it", async (t) => {
	const f = await fixture(t);
	const run = await deployTo(f, f.older);
	assert.deepEqual(
		[run.code, head(f), fetched(f), git(f.repo, "tag", "--points-at", f.older)],
		[0, f.older, f.newer, TAG],
		run.stderr,
	);
});

test("a changed tracked file in the checkout refuses the deployment and lists the file", async (t) => {
	const f = await fixture(t);
	await writeFile(join(f.repo, "README.md"), "changed\n");
	const run = await deployTo(f, f.newer);
	assert.deepEqual([run.code, head(f), tags(f)], [1, f.older, ""], run.stderr);
	assert.ok(run.stderr.split("\n").includes(" M README.md"), run.stderr);
});

test("no project registry under any home directory refuses the deployment with exit 4 before the fetch", async (t) => {
	const f = await fixture(t);
	await writeFile(f.passwd, `root:x:0:0:root:${join(f.dir, "root")}:/bin/sh\n`);
	const run = await deployTo(f, f.newer);
	assert.deepEqual([run.code, head(f), tags(f), fetched(f)], [4, f.older, "", f.older], run.stderr);
	assert.match(run.stderr, /no project registry/);
});

test("the entry point exits 2 and asks for the full SHA without an argument and with a short SHA", () => {
	for (const args of [[], ["abc1234"]]) {
		const run = spawnSync(process.execPath, [SCRIPT, ...args], { encoding: "utf8", timeout: BOUND_MS });
		assert.equal(run.status, 2, `${args.join(" ")}: ${run.stderr}`);
		assert.match(run.stderr, /full 40-character commit SHA/);
	}
});

test("a job label with control characters is printed escaped, and the refusal holds no raw control character", async (t) => {
	const f = await fixture(t);
	await jobFolder(f, { starting: `${process.pid}\n`, label: "demo \u001b]0;owned\u0007 job\n" });
	const run = await deployTo(f, f.newer);
	assert.equal(run.code, 1, run.stderr);
	assert.doesNotMatch(run.stderr.replaceAll("\n", ""), /\p{Cc}/u);
	assert.ok(run.stderr.split("\n").includes(`${f.project}  ${JOB}  demo \\x1b]0;owned\\x07 job`), run.stderr);
});

test("a git that cannot start fails the deployment with exit 4, not the network's 3, and HEAD stays", async (t) => {
	const f = await fixture(t);
	const noGit = join(f.dir, "no-git");
	await mkdir(noGit);
	const run = await deployTo(f, f.newer, [], { ...process.env, PATH: noGit });
	assert.deepEqual([run.code, head(f), tags(f), fetched(f)], [4, f.older, "", f.older], run.stderr);
	assert.match(run.stderr, /cannot run git/);
});

test("a GIT_DIR in the script's environment does not move the deployment to another repository", async (t) => {
	const f = await fixture(t);
	const other = join(f.dir, "other");
	await mkdir(other);
	git(other, "init", "-q", "-b", "main");
	git(other, "config", "user.email", "limen@example.test");
	git(other, "config", "user.name", "Limen Test");
	const otherHead = commit(other, "other.txt", "other\n");
	const run = await deployTo(f, f.newer, [], { ...process.env, GIT_DIR: join(other, ".git") });
	assert.deepEqual([run.code, head(f), git(other, "rev-parse", "HEAD")], [0, f.newer, otherHead], run.stderr);
});

test("a deployment prints each registry and each project it checked before the deployed line", async (t) => {
	const f = await fixture(t);
	const run = await deployTo(f, f.newer);
	assert.equal(run.code, 0, run.stderr);
	const lines = run.stdout.split("\n");
	assert.deepEqual(lines.slice(0, 3), [
		`checked registry ${f.registry}: 1 project`,
		`  ${f.project}: 0 running jobs`,
		`  ${f.tools}: not a project (no .limen/)`,
	]);
	assert.ok(lines[3]?.startsWith(`deployed ${f.newer} `), run.stdout);
});

/** Registries that hold no project: the registry's text, and the lines the list gives below the registry's own line. */
const NO_PROJECT: readonly {
	readonly name: string;
	readonly text: (f: Fixture) => string;
	readonly listed: (f: Fixture) => readonly string[];
}[] = [
	{ name: "an empty registry", text: () => "", listed: () => [] },
	{
		name: "a registry of a non-absolute line only",
		text: () => "relative/project\n",
		listed: () => ["  relative/project: skipped (not an absolute path)"],
	},
	{
		name: "a registry of a root with no .limen/",
		text: (f) => `${f.tools}\n`,
		listed: (f) => [`  ${f.tools}: not a project (no .limen/)`],
	},
];

test("a registry that holds no project refuses the deployment with exit 4 before the fetch, naming the registry", async (t) => {
	for (const { name, text } of NO_PROJECT) {
		const f = await fixture(t);
		await writeFile(f.registry, text(f));
		const run = await deployTo(f, f.newer);
		assert.deepEqual([run.code, head(f), tags(f), fetched(f)], [4, f.older, "", f.older], `${name}: ${run.stderr}`);
		assert.ok(run.stderr.includes(f.registry), `${name}: ${run.stderr}`);
	}
});

test("a refusal for no project also prints the list", async (t) => {
	for (const { name, text, listed } of NO_PROJECT) {
		const f = await fixture(t);
		await writeFile(f.registry, text(f));
		const run = await deployTo(f, f.newer);
		assert.equal(run.code, 4, `${name}: ${run.stderr}`);
		assert.equal(run.stdout, [`checked registry ${f.registry}: 0 projects`, ...listed(f), ""].join("\n"), name);
	}
});

test("a registry that cannot be read refuses the deployment with exit 4 before the fetch, naming its path", async (t) => {
	const f = await fixture(t);
	// A folder in the registry's place fails the read with EISDIR for every user, root included.
	await rm(f.registry);
	await mkdir(f.registry);
	const run = await deployTo(f, f.newer);
	assert.deepEqual([run.code, head(f), tags(f), fetched(f)], [4, f.older, "", f.older], run.stderr);
	assert.ok(run.stderr.includes(`cannot read ${f.registry}`), run.stderr);
});

test("a refusal for a running job also prints the list of what was checked", async (t) => {
	const f = await fixture(t);
	await jobFolder(f, { starting: `${process.pid}\n`, label: "demo job\n" });
	const run = await deployTo(f, f.newer);
	assert.equal(run.code, 1, run.stderr);
	assert.deepEqual(run.stdout.split("\n"), [
		`checked registry ${f.registry}: 1 project`,
		`  ${f.project}: 1 running job`,
		`  ${f.tools}: not a project (no .limen/)`,
		"",
	]);
});

test("a registry line with a control character is printed escaped in the list", async (t) => {
	const f = await fixture(t);
	await writeFile(f.registry, `${f.project}\n${f.dir}/odd \u001b]0;owned\u0007\rdir\n`);
	const run = await deployTo(f, f.newer);
	assert.equal(run.code, 0, run.stderr);
	assert.doesNotMatch(run.stdout.replaceAll("\n", ""), /\p{Cc}/u);
	const escaped = `  ${f.dir}/odd \\x1b]0;owned\\x07\\x0ddir: not a project (no .limen/)`;
	assert.ok(run.stdout.split("\n").includes(escaped), run.stdout);
});

test("a registered root whose .limen cannot be read refuses the deployment with exit 4 before the fetch, naming it", async (t) => {
	const f = await fixture(t);
	const loop = join(f.dir, "loop");
	await mkdir(loop);
	// A symlink to itself fails every stat with ELOOP, for every user, root included.
	await symlink(".limen", join(loop, ".limen"));
	await writeFile(f.registry, `${f.project}\n${loop}\n`);
	const run = await deployTo(f, f.newer);
	assert.deepEqual([run.code, head(f), tags(f), fetched(f)], [4, f.older, "", f.older], run.stderr);
	assert.ok(run.stderr.includes(`cannot read ${join(loop, ".limen")}: ELOOP`), run.stderr);
});
