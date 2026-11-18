/* PL: Narzędzie czasu bramki (M-10, T-11), uruchamiane przez sesję główną przy zamknięciu etapu: raz uruchamia
   `node adrian-rebuild/tools/gate.mjs`, przepuszcza jego wyjście na terminal, mierzy czas i zapisuje atomowo plik
   `--out` z polskim streszczeniem, datą, `git rev-parse HEAD`, czystością drzewa, kodem wyjścia bramki, liczbami testów
   (tests, pass, fail) i czasem w sekundach. Kończy się kodem wyjścia bramki, a kodem 4 z powodem, gdy zawiedzie git
   albo zapis pliku; do testu przyjmuje `--gate <skrypt>` zamiast gate.mjs. Stan: działa; test
   w tools/test-gate-time.mjs. */
// Usage: node adrian-rebuild/tools/gate-time.mjs --out <file> [--gate <script>]   (from the repository root)
// Exit: the gate's exit code; 2: usage error; 4: git, the file system or the gate's start failed (the reason on stderr).
import { spawn, spawnSync } from "node:child_process";
import { relative } from "node:path";
import { takeOut, writeAtomic } from "./atomic-write.mjs";
import { repoRoot } from "./gate-env.mjs";

const GATE = "adrian-rebuild/tools/gate.mjs";
const USAGE = "usage: node adrian-rebuild/tools/gate-time.mjs --out <file> [--gate <script>]";
// node --test ends with summary lines such as "ℹ tests 82" (spec reporter) or "# tests 82" (TAP).
const COUNT = /^[ℹ#] (tests|pass|fail) (\d+)$/gmu;

/** A local time as ISO 8601 with its offset, e.g. 2026-11-18T21:40:00+01:00. */
function stamp(date) {
	const pad = (value) => String(value).padStart(2, "0");
	const offset = -date.getTimezoneOffset();
	const zone = `${offset < 0 ? "-" : "+"}${pad(Math.floor(Math.abs(offset) / 60))}:${pad(Math.abs(offset) % 60)}`;
	const day = `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}`;
	return `${day}T${pad(date.getHours())}:${pad(date.getMinutes())}:${pad(date.getSeconds())}${zone}`;
}

/** git, the file system or the gate's start failed: exit 4, so that the code tells it from a failing gate (T-02). */
class EnvironmentError extends Error {}

function gitOut(root, args) {
	const result = spawnSync("git", ["-C", root, ...args], { encoding: "utf8" });
	if (result.status !== 0) {
		const why = result.error?.message ?? result.stderr.trim();
		throw new EnvironmentError(`git ${args.join(" ")} exited with ${result.status}: ${why}`);
	}
	return result.stdout;
}

/** Runs the gate once with its output passed through and kept; resolves to its exit code and output. */
function runGate(script, root) {
	return new Promise((done, fail) => {
		const child = spawn(process.execPath, [script], { cwd: root, stdio: ["ignore", "pipe", "pipe"] });
		child.stdout.setEncoding("utf8");
		child.stderr.setEncoding("utf8");
		let output = "";
		child.stdout.on("data", (chunk) => {
			process.stdout.write(chunk);
			output += chunk;
		});
		child.stderr.on("data", (chunk) => {
			process.stderr.write(chunk);
			output += chunk;
		});
		child.once("error", (error) => fail(new EnvironmentError(`cannot run the gate ${script}: ${error.message}`)));
		child.once("close", (code, signal) => done({ code: code ?? 1, signal, output }));
	});
}

/** The last value of each count line of the gate's output, as "tests 82, pass 82, fail 0". */
function counts(output) {
	const found = new Map([...output.matchAll(COUNT)].map(([, name, value]) => [name, value]));
	const names = ["tests", "pass", "fail"].filter((name) => found.has(name));
	return names.length === 0
		? "none in the gate's output"
		: names.map((name) => `${name} ${found.get(name)}`).join(", ");
}

function parseArgs(argv) {
	const { file, rest } = takeOut(argv);
	if (file === undefined) {
		throw new Error(`--out <file> is required; ${USAGE}`);
	}
	if (rest.length === 0) {
		return { file, gate: GATE };
	}
	if (rest.length === 2 && rest[0] === "--gate" && !rest[1].startsWith("--")) {
		return { file, gate: rest[1] };
	}
	throw new Error(`unexpected arguments ${rest.join(" ")}; ${USAGE}`);
}

/** The evidence file: the Polish summary (the file is generated, so the tool writes it), then the measured facts. */
function render({ started, head, clean, shown, gate, seconds }) {
	return [
		"<!-- PL: Czas bramki przebudowy zmierzony przez tools/gate-time.mjs (M-10, T-11): data, commit HEAD, czystość",
		"drzewa, kod wyjścia bramki, liczby testów i czas w sekundach. Plik jest generowany; nie edytuje się go ręcznie. -->",
		"",
		"# Gate run time",
		"",
		`- Date: ${stamp(started)}`,
		`- HEAD: \`${head}\``,
		`- Tree clean: ${clean ? "yes" : "no"}`,
		`- Gate: \`node ${shown}\``,
		`- Gate exit code: ${gate.code}${gate.signal ? ` (ended by ${gate.signal})` : ""}`,
		`- Tests: ${counts(gate.output)}`,
		`- Run time: ${seconds.toFixed(1)} s`,
		"",
	].join("\n");
}

/** One measured gate run; resolves to the gate's exit code. */
async function measure(options) {
	let root;
	try {
		root = repoRoot();
	} catch (error) {
		throw new EnvironmentError(error.message);
	}
	const head = gitOut(root, ["rev-parse", "HEAD"]).trim();
	// The state the gate runs on; a file this tool writes afterwards does not count.
	const clean = gitOut(root, ["status", "--porcelain"]).trim() === "";
	const started = new Date();
	const begin = performance.now();
	const gate = await runGate(options.gate, root);
	const seconds = (performance.now() - begin) / 1000;
	const shown = options.gate === GATE ? GATE : relative(root, options.gate) || options.gate;
	try {
		writeAtomic(options.file, render({ started, head, clean, shown, gate, seconds }));
	} catch (error) {
		throw new EnvironmentError(`cannot write ${options.file}: ${error.message} (the gate exited ${gate.code})`);
	}
	console.log(`gate-time: ${seconds.toFixed(1)} s, gate exit ${gate.code}; wrote ${options.file}`);
	return gate.code;
}

let options;
try {
	options = parseArgs(process.argv.slice(2));
} catch (error) {
	console.error(`gate-time: ${error.message}`);
	process.exit(2);
}
try {
	process.exitCode = await measure(options);
} catch (error) {
	if (!(error instanceof EnvironmentError)) {
		throw error;
	}
	console.error(`gate-time: ${error.message}`);
	process.exitCode = 4;
}
