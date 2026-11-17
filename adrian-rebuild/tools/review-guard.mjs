/* PL: Strażnik recenzji z etapu 5 (Node, bez zależności). `snapshot` zapisuje stan drzewa roboczego: HEAD, wszystkie
   refy, `git status --porcelain` i skrót SHA-256 treści każdego zmienionego i nieśledzonego pliku; `compare <plik>`
   kończy się kodem 1, gdy stan po recenzji różni się od zapisanego, więc recenzja, która cokolwiek zmieniła, jest
   nieważna (gwarancja w kodzie, nie w prompcie). `diff` wypisuje pełny diff ticketu względem HEAD razem z plikami
   nieśledzonymi, który dostaje recenzent. Tryb `--git` porównuje tylko HEAD i refy, więc wokół pracy implementera
   wykrywa commit i push, a zmiany w drzewie i w indeksie (git rm, git mv) przepuszcza. Stan: działa; test
   w tools/test-review-guard.sh. */
// Usage (from the repository root):
//   node adrian-rebuild/tools/review-guard.mjs snapshot > <file>   before the review; <file> outside the repository
//   node adrian-rebuild/tools/review-guard.mjs compare <file>      after the review; exit 1 when anything changed
//   node adrian-rebuild/tools/review-guard.mjs diff > <file>       the ticket's diff for the reviewer
//   snapshot --git / compare --git <file>: HEAD and refs only, around the implementer's run (it may git rm, git mv)
// Files ignored by git (node_modules, the gate's TMPDIR) are outside the guard: they are not part of a change.
import { spawnSync } from "node:child_process";
import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";

function git(args, { allowExit = [0] } = {}) {
	const result = spawnSync("git", args, { maxBuffer: 1 << 30 });
	if (!allowExit.includes(result.status)) {
		process.stderr.write(result.stderr);
		throw new Error(`git ${args.join(" ")} exited with ${result.status}`);
	}
	return result.stdout;
}

/** Paths from `git status --porcelain -z`; a rename entry carries its source path as the next field. */
function changedPaths(statusZ) {
	const fields = statusZ.toString("utf8").split("\0").filter(Boolean);
	const paths = [];
	for (let index = 0; index < fields.length; index += 1) {
		const entry = fields[index];
		paths.push(entry.slice(3));
		if (entry[0] === "R" || entry[0] === "C") {
			index += 1;
		}
	}
	return paths;
}

function digest(path) {
	try {
		return createHash("sha256").update(readFileSync(path)).digest("hex");
	} catch (error) {
		if (error.code === "ENOENT") {
			return "deleted";
		}
		throw error;
	}
}

function refs() {
	return [
		`head ${git(["rev-parse", "HEAD"]).toString("utf8").trim()}`,
		...git(["for-each-ref", "--format=ref %(refname) %(objectname)"]).toString("utf8").trim().split("\n"),
	];
}

function snapshot(gitOnly) {
	if (gitOnly) {
		return `${refs().join("\n")}\n`;
	}
	const status = git(["status", "--porcelain=v1", "-z", "--untracked-files=all"]);
	const index = createHash("sha256")
		.update(git(["diff", "--cached", "--binary"]))
		.digest("hex");
	const lines = [
		...refs(),
		`index ${index}`,
		...status
			.toString("utf8")
			.split("\0")
			.filter(Boolean)
			.map((entry) => `status ${entry}`),
		...changedPaths(status).map((path) => `file ${digest(path)} ${path}`),
	];
	return `${lines.join("\n")}\n`;
}

function compare(file, gitOnly) {
	const before = readFileSync(file, "utf8").split("\n");
	const after = snapshot(gitOnly).split("\n");
	const removed = before.filter((line) => !after.includes(line));
	const added = after.filter((line) => !before.includes(line));
	if (removed.length === 0 && added.length === 0) {
		console.log("review-guard: working tree, index and refs unchanged");
		return 0;
	}
	for (const line of removed) {
		console.error(`- ${line}`);
	}
	for (const line of added) {
		console.error(`+ ${line}`);
	}
	console.error("review-guard: the tree changed during the review; the review is void");
	return 1;
}

function diff() {
	process.stdout.write(git(["diff", "HEAD", "--binary"]));
	const untracked = git(["ls-files", "--others", "--exclude-standard", "-z"]).toString("utf8").split("\0");
	for (const path of untracked.filter(Boolean)) {
		// `--no-index` exits 1 when the files differ, which is always the case against /dev/null.
		process.stdout.write(git(["diff", "--no-index", "--binary", "/dev/null", path], { allowExit: [1] }));
	}
	return 0;
}

const [command, ...rest] = process.argv.slice(2);
const gitOnly = rest.includes("--git");
const [file] = rest.filter((arg) => arg !== "--git");
if (command === "snapshot") {
	process.stdout.write(snapshot(gitOnly));
} else if (command === "compare" && file) {
	process.exitCode = compare(file, gitOnly);
} else if (command === "diff") {
	process.exitCode = diff();
} else {
	console.error("usage: review-guard.mjs snapshot [--git] | compare [--git] <file> | diff");
	process.exitCode = 2;
}
