/* PL: Strażnik etapu 5 (Node, bez zależności). `snapshot`/`compare` wokół recenzji: HEAD, refy, indeks, `git status`
   i skrót SHA-256 każdego zmienionego i nieśledzonego pliku; każda zmiana unieważnia recenzję. `snapshot --git` /
   `compare --git <plik> <ticket.md>` wokół pracy implementera (D-015): HEAD, refy, `.git/config`, `.git/hooks/`
   i pliki `adrian-rebuild/input/` bez zmian; w indeksie wyłącznie usunięcia i przeniesienia ścieżek z `## Change`
   ticketu; żadna zmieniona ścieżka z listy zakazanej (pliki sesji głównej, `.claude/agents/`, `tools/` poza ścieżkami
   z `## Change`). `diff` wypisuje diff ticketu dla recenzenta. Stan: działa; test w tools/test-review-guard.mjs. */
// Usage (from the repository root; keep snapshot files in the ignored node_modules/.rebuild-review/):
//   node adrian-rebuild/tools/review-guard.mjs snapshot > <file>                 before the review
//   node adrian-rebuild/tools/review-guard.mjs compare <file>                    after it; exit 1 when anything changed
//   node adrian-rebuild/tools/review-guard.mjs snapshot --git > <file>           before the implementer's run
//   node adrian-rebuild/tools/review-guard.mjs compare --git <file> <ticket.md>  after it; exit 1 on a violation
//   node adrian-rebuild/tools/review-guard.mjs diff > <file>                     the ticket's diff for the reviewer
import { spawnSync } from "node:child_process";
import { createHash } from "node:crypto";
import { existsSync, readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";

// Paths only the main session changes (plan.md → ## Agents, protocol step 3).
const FORBIDDEN = [
	/^adrian-rebuild\/(plan|changes|audit|taste)\.md$/,
	/^adrian-rebuild\/R-\d{3}-[^/]+\/(ticket|review)\.md$/,
	/^\.claude\/agents\//,
	/^adrian-rebuild\/input\//,
];
const TOOLS = "adrian-rebuild/tools/";

function git(args, { allowExit = [0] } = {}) {
	const result = spawnSync("git", args, { maxBuffer: 1 << 30 });
	if (!allowExit.includes(result.status)) {
		process.stderr.write(result.stderr);
		throw new Error(`git ${args.join(" ")} exited with ${result.status}`);
	}
	return result.stdout;
}

/** `git status --porcelain=v1 -z` as [status, path, source?]: a rename is `XY <path>\0<source>`. */
function statusEntries() {
	const fields = git(["status", "--porcelain=v1", "-z", "--untracked-files=all"]).toString("utf8").split("\0");
	const list = [];
	for (let index = 0; index < fields.length; index += 1) {
		const field = fields[index];
		if (field && /^[RC]/.test(field)) {
			list.push([field.slice(0, 2), field.slice(3), fields[index + 1]]);
			index += 1;
		} else if (field) {
			list.push([field.slice(0, 2), field.slice(3)]);
		}
	}
	return list;
}

/** `git diff --cached --name-status -z -M` as [status, path, source?]: a rename is `R<score>\0<source>\0<path>`. */
function indexEntries() {
	const fields = git(["diff", "--cached", "--name-status", "-z", "-M", "HEAD"]).toString("utf8").split("\0");
	const list = [];
	for (let index = 0; index + 1 < fields.length; index += 2) {
		const status = fields[index];
		if (/^[RC]/.test(status)) {
			list.push([status, fields[index + 2], fields[index + 1]]);
			index += 1;
		} else {
			list.push([status, fields[index + 1]]);
		}
	}
	return list;
}

/** A path only the main session may change, or any path under tools/ (allowed later when `## Change` names it). */
function reserved(path) {
	return path.startsWith(TOOLS) || FORBIDDEN.some((pattern) => pattern.test(path));
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

/** Every file below `dir`, relative to the working directory; none when it does not exist. */
function filesBelow(dir) {
	if (!existsSync(dir)) {
		return [];
	}
	return readdirSync(dir, { recursive: true, withFileTypes: true })
		.filter((entry) => entry.isFile())
		.map((entry) => join(entry.parentPath, entry.name))
		.sort();
}

function refs() {
	return [
		`head ${git(["rev-parse", "HEAD"]).toString("utf8").trim()}`,
		...git(["for-each-ref", "--format=ref %(refname) %(objectname)"]).toString("utf8").trim().split("\n"),
	];
}

/** Files outside git's view that the implementer must not touch: git's config and hooks, and the local inputs. */
function protectedFiles() {
	const gitDir = git(["rev-parse", "--git-dir"]).toString("utf8").trim();
	const paths = [join(gitDir, "config"), ...filesBelow(join(gitDir, "hooks")), ...filesBelow("adrian-rebuild/input")];
	return paths.map((path) => `protected ${digest(path)} ${path}`);
}

function snapshot(gitOnly) {
	const status = statusEntries();
	const paths = status.flatMap(([, path, source]) => (source ? [path, source] : [path]));
	if (gitOnly) {
		const touched = paths.filter(reserved).map((path) => `reserved ${digest(path)} ${path}`);
		return `${[...refs(), ...protectedFiles(), ...touched].join("\n")}\n`;
	}
	const index = createHash("sha256")
		.update(git(["diff", "--cached", "--binary"]))
		.digest("hex");
	const lines = [
		...refs(),
		`index ${index}`,
		...status.map(([code, path, source]) => `status ${code} ${path}${source ? ` <- ${source}` : ""}`),
		...paths.map((path) => `file ${digest(path)} ${path}`),
	];
	return `${lines.join("\n")}\n`;
}

/** Lines that differ between two snapshots, as `- before` and `+ after`. */
function difference(file, now) {
	const before = readFileSync(file, "utf8").split("\n");
	const after = now.split("\n");
	return [
		...before.filter((line) => !after.includes(line)).map((line) => `- ${line}`),
		...after.filter((line) => !before.includes(line)).map((line) => `+ ${line}`),
	];
}

/** The paths that the ticket's `## Change` names in backticks; a directory ends with `/`. */
export function changePaths(ticket) {
	const section = ticket.split(/^## /m).find((block) => block.startsWith("Change\n")) ?? "";
	return [...section.matchAll(/`([^`\s]+)`/g)].map(([, path]) => path).filter((path) => /\/|\.\w+$/.test(path));
}

function covered(path, allowed) {
	return allowed.some((entry) => path === entry || path.startsWith(entry.endsWith("/") ? entry : `${entry}/`));
}

/** D-015: in the index only deletions and moves of the paths that `## Change` names. */
function indexViolations(allowed) {
	const violations = [];
	for (const [status, path, source] of indexEntries()) {
		const deletion = status === "D" && covered(path, allowed);
		const move = status.startsWith("R") && covered(path, allowed) && covered(source, allowed);
		if (!deletion && !move) {
			const what = source ? `${source} -> ${path}` : path;
			violations.push(`index: ${status} ${what} is not a deletion or move that ## Change names`);
		}
	}
	return violations;
}

/** A difference line that is a change of a tools/ file that `## Change` names, which the implementer may make. */
function allowedChange(line, allowed) {
	const path = line.match(/^[-+] reserved \S+ (.+)$/)?.[1];
	return path?.startsWith(TOOLS) === true && covered(path, allowed);
}

function compare(file, gitOnly, ticketFile) {
	const allowed = gitOnly ? changePaths(readFileSync(ticketFile, "utf8")) : [];
	const changes = difference(file, snapshot(gitOnly)).filter((line) => !allowedChange(line, allowed));
	const violations = gitOnly ? indexViolations(allowed) : [];
	for (const line of [...changes, ...violations]) {
		console.error(line);
	}
	if (changes.length === 0 && violations.length === 0) {
		console.log(gitOnly ? "review-guard: the implementer's run is within its limits" : "review-guard: unchanged");
		return 0;
	}
	console.error(gitOnly ? "review-guard: the implementer's run is void (z. 14)" : "review-guard: the review is void");
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

if (import.meta.main) {
	const [command, ...rest] = process.argv.slice(2);
	const gitOnly = rest.includes("--git");
	const [file, ticketFile] = rest.filter((arg) => arg !== "--git");
	if (command === "snapshot") {
		process.stdout.write(snapshot(gitOnly));
	} else if (command === "compare" && file && (!gitOnly || ticketFile)) {
		process.exitCode = compare(file, gitOnly, ticketFile);
	} else if (command === "diff") {
		process.exitCode = diff();
	} else {
		console.error(
			"usage: review-guard.mjs snapshot [--git] | compare <file> | compare --git <file> <ticket.md> | diff",
		);
		process.exitCode = 2;
	}
}
