// A bare repository in a test's folder in GitHub's place for the seat's `main` watcher (seat/main-watch.ts): commits
// made in it and its `main` moved with update-ref, the watch entry that names it in a fake credentials folder as
// systemd names the files of a loaded folder, the watcher's copy, and a runner that records each program the alerts
// start and runs git for real. The address is the remote's path, so git uses its local transport and ssh never runs.
import { writeFile } from "node:fs/promises";
import { dirname, join } from "node:path";
import { type Ran, type RunOptions, runProgram } from "../../seat/program.ts";
import { git } from "../plant.ts";

/** The text of an entry's private key; its first and last lines are written in parts, so no scanner takes it for one. */
export const KEY_TEXT = [
	["-----BEGIN", "OPENSSH", "PRIVATE", "KEY-----"].join(" "),
	"not a key",
	["-----END", "OPENSSH", "PRIVATE", "KEY-----"].join(" "),
	"",
].join("\n");
/** One pinned host key line of a made-up host. */
export const KNOWN_HOSTS_TEXT = `example.test ssh-ed25519 ${"A".repeat(68)}\n`;
/** The answer of `ssh -V` on a seat with the OpenSSH client. */
export const SSH_PRESENT: Ran = { status: 0, stdout: "", stderr: "OpenSSH_test\n" };

/** One program the alerts started: its words and its options. */
export type Call = { readonly argv: readonly string[]; readonly options: RunOptions | undefined };

/** A bare repository at `path` with no commit yet. */
export function bareRemote(path: string): string {
	git(dirname(path), "init", "--bare", "-q", path);
	return path;
}

/** How many commits the tests made, so that each commit gets a message, and so an id, of its own. */
let made = 0;

/** A new commit in `remote` with an empty tree, a child of `parent` when one is given; its id. */
export function commitIn(remote: string, parent?: string): string {
	made += 1;
	const tree = git(remote, "hash-object", "-w", "-t", "tree", "/dev/null");
	const identity = ["-c", "user.name=Limen Test", "-c", "user.email=limen@example.test"];
	const parents = parent === undefined ? [] : ["-p", parent];
	return git(remote, ...identity, "commit-tree", tree, ...parents, "-m", `commit ${made}`);
}

/** Points `main` of `remote` at `tip`, whatever it held: a fast-forward, a forced update, or a new `main`. */
export function setMain(remote: string, tip: string): void {
	git(remote, "update-ref", "refs/heads/main", tip);
}

/** Deletes `main` of `remote`. */
export function deleteMain(remote: string): void {
	git(remote, "update-ref", "-d", "refs/heads/main");
}

/** The paths of the entry files of `project` in the credentials folder `credentials`. */
export function entryFiles(credentials: string, project: string) {
	return {
		address: join(credentials, `watch_${project}.address`),
		key: join(credentials, `watch_${project}.key`),
		knownHosts: join(credentials, "watch_known_hosts"),
	};
}

/** Writes the watch entry of `project`, whose repository is at `address`, and the known hosts beside it. */
export async function writeWatchEntry(credentials: string, project: string, address: string): Promise<void> {
	const files = entryFiles(credentials, project);
	await writeFile(files.address, `${address}\n`);
	await writeFile(files.key, KEY_TEXT, { mode: 0o600 });
	await writeFile(files.knownHosts, KNOWN_HOSTS_TEXT);
}

/** The watcher's copy of `project` in the alerts' state folder `state`. */
export const copyOf = (state: string, project: string) => join(state, "main", `${project}.git`);
/** The tip the copy `copy` holds. */
export const heldTip = (copy: string) => git(copy, "rev-parse", "refs/watch/main");
/** The old tips the copy `copy` keeps after forced updates, oldest first. */
export const keptTips = (copy: string) =>
	git(copy, "for-each-ref", "--format=%(objectname)", "refs/watch/forced/").split("\n").filter(Boolean);
/** The times in the names of the kept refs of the copy `copy`, oldest first. */
export const keptTimes = (copy: string) =>
	git(copy, "for-each-ref", "--format=%(refname:lstrip=3)", "refs/watch/forced/").split("\n").filter(Boolean);

/** A runner that records each program in `calls` and runs git for real; `ssh` gets the answer of `ssh()`. */
export function recordingRunner(calls: Call[], ssh: () => Ran = () => SSH_PRESENT) {
	return (argv: readonly [string, ...string[]], options?: RunOptions): Ran => {
		calls.push({ argv, options });
		return argv[0] === "ssh" ? ssh() : runProgram(argv, options);
	};
}
