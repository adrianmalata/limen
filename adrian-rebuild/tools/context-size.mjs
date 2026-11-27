/* PL: Skrypt pomiaru rozmiarów Limena przy dowolnym refie gita (bez checkoutu): linie i bajty na moduł oraz bajty
   i ≈tokeny (bajty/4) kontekstu każdej roli z szablonów refa (moduł role-context.mjs). Dla refa z wiadomością
   kontekstową (od R-039) kolumny to "Context message" i "Cue" (M-01 po etapie 4); dla starszego refa zostają kolumny
   promptu systemowego: na każdy request, na prompt i raz na sesję; rozmiary notatki zadania (start, sprawdzenie,
   dopisek do steera) podaje tylko dla refa sprzed R-042, który ją wyciął. Służy do mapy w etapie 1 i do porównań
   przed/po w etapach 4–5; z --project mierzy też pliki prawdziwego projektu (np. na seacie), niczego w nim nie
   zapisując. Wynik zapisuje atomowo (atomic-write.mjs, D-018). Stan: działa; test w tools/test-context-size.mjs. */
// Usage: node adrian-rebuild/tools/context-size.mjs [ref] [--project <path>] [--out <file>]   (from the repo root)
import { spawnSync } from "node:child_process";
import { parseArgs } from "node:util";
import { writeAtomic } from "./atomic-write.mjs";
import { GROUP_ROLES, measureRoles, sections } from "./role-context.mjs";

const { values, positionals } = parseArgs({
	allowPositionals: true,
	options: { project: { type: "string" }, out: { type: "string" } },
});
const ref = positionals[0] ?? "HEAD";
const suffix = values.project ? "-project" : "";
const output = values.out ?? `adrian-rebuild/evidence/context-size-${ref.replaceAll("/", "-")}${suffix}.md`;

/** Top-level areas measured as code; a module is the area itself or, for two-level areas, its first subfolder. */
const AREAS = ["src", "hook", "bin", "templates", "test", "picture", "docs/seat", ".pi", ".omp", ".agents"];
const TWO_LEVEL = new Set(["src", "picture"]);

function git(args, input) {
	const result = spawnSync("git", args, { input, maxBuffer: 1 << 30 });
	if (result.status !== 0) {
		throw new Error(`git ${args.join(" ")} failed: ${result.stderr}`);
	}
	return result.stdout;
}

/** Paths of every blob at `ref` under the given areas. */
function trackedPaths() {
	return git(["ls-tree", "-r", "--name-only", "-z", ref, "--", ...AREAS])
		.toString("utf8")
		.split("\0")
		.filter(Boolean);
}

/** Reads blobs at `ref` in one `git cat-file --batch` call; returns path → Buffer. */
function readBlobs(paths) {
	const out = git(["cat-file", "--batch"], paths.map((path) => `${ref}:${path}\n`).join(""));
	const blobs = new Map();
	let offset = 0;
	for (const path of paths) {
		const headerEnd = out.indexOf(10, offset);
		const header = out.subarray(offset, headerEnd).toString("utf8").split(" ");
		const size = Number(header[2]);
		blobs.set(path, out.subarray(headerEnd + 1, headerEnd + 1 + size));
		offset = headerEnd + 1 + size + 1;
	}
	return blobs;
}

function moduleOf(path) {
	const parts = path.split("/");
	if (path.startsWith("docs/seat/")) {
		return "docs/seat";
	}
	return TWO_LEVEL.has(parts[0]) && parts.length > 2 ? `${parts[0]}/${parts[1]}` : parts[0];
}

const lineCount = (buffer) => buffer.reduce((count, byte) => count + (byte === 10 ? 1 : 0), 0);
const tokens = (bytes) => Math.round(bytes / 4);

function moduleRows(blobs) {
	const modules = new Map();
	for (const [path, buffer] of blobs) {
		const name = moduleOf(path);
		const entry = modules.get(name) ?? { files: 0, lines: 0, bytes: 0 };
		entry.files += 1;
		entry.lines += lineCount(buffer);
		entry.bytes += buffer.length;
		modules.set(name, entry);
	}
	return [...modules].sort(([a], [b]) => a.localeCompare(b));
}

function moduleSection(blobs) {
	const rows = moduleRows(blobs);
	const total = rows.reduce((sum, [, entry]) => sum + entry.lines, 0);
	const lines = ["## Lines per module", "", "| Module | Files | Lines | Bytes |", "|---|---|---|---|"];
	for (const [name, { files, lines: count, bytes }] of rows) {
		lines.push(`| \`${name}\` | ${files} | ${count} | ${bytes} |`);
	}
	lines.push(`| **total** | ${blobs.size} | ${total} | |`, "");
	return lines;
}

function fileSection(blobs) {
	const lines = ["## Lines per file", "", "| File | Lines | Bytes | ≈Tokens |", "|---|---|---|---|"];
	for (const [path, buffer] of [...blobs].sort(([a], [b]) => a.localeCompare(b))) {
		lines.push(`| \`${path}\` | ${lineCount(buffer)} | ${buffer.length} | ${tokens(buffer.length)} |`);
	}
	lines.push("");
	return lines;
}

const bytes = (text) => (text === undefined ? undefined : Buffer.byteLength(text, "utf8"));
const cell = (size) => (size === undefined ? "absent" : `${size} B ≈${tokens(size)}`);
const sum = (...sizes) => sizes.reduce((total, size) => total + (size ?? 0), 0);

/** A job role's name in a row: a group team by its template, since its role is `coordinator`. */
const roleName = (role) => (GROUP_ROLES.includes(role) ? `group team (\`${role}.md\`)` : role);
/** The coordinator's cue and, after it, the cue of a wake. */
const ownerCue = (context) => `${cell(bytes(context.coordinator.cue))}; wake ${cell(bytes(context.wake.cue))}`;

/** The rows of a ref before R-039: what Limen added to Pi's system prompt, and the cue. */
function systemRows(context) {
	const block = bytes(context.job.system);
	const tool = bytes(context.tool);
	const cue = bytes(context.job.cue);
	const once = bytes(context.job.once);
	const rows = context.roles.map((role) => {
		const own = bytes(context.preambles[role]);
		return `| ${roleName(role)} | ${cell(own)} | ${cell(block)} | ${cell(tool)} | ${cell(sum(own, block, tool))} | ${cell(cue)} | ${cell(once)} |`;
	});
	const ownerFixed = bytes(context.coordinator.system);
	rows.unshift(
		`| coordinator (owner-facing) | none | ${cell(ownerFixed)} | none | ${cell(ownerFixed)} | ${ownerCue(context)} | none |`,
	);
	return rows;
}

/** The rows of a ref from R-039 on: each role's context message, and the cue. */
function messageRows(context) {
	const cue = cell(bytes(context.job.cue));
	const rows = context.roles.map(
		(role) => `| ${roleName(role)} | ${cell(bytes(context.messages[`job ${role}`]))} | ${cue} |`,
	);
	rows.unshift(`| coordinator (owner-facing) | ${cell(bytes(context.messages.coordinator))} | ${ownerCue(context)} |`);
	return rows;
}

/** Top-level parts are the `## Label (path)` blocks the hook adds; headings inside an included file nest under it. */
function breakdown(title, system) {
	const groups = [];
	for (const { label, text } of sections(system)) {
		if (/\(.+\)$/.test(label) || !groups.length) {
			groups.push({ label, size: 0, parts: [] });
		}
		const group = groups.at(-1);
		group.size += bytes(text);
		group.parts.push({ label, size: bytes(text) });
	}
	const lines = [`#### ${title}`, "", "| Part | Size |", "|---|---|"];
	for (const { label, size, parts } of groups) {
		lines.push(`| **${label}** | ${cell(size)} |`);
		lines.push(...parts.slice(1).map((part) => `| ↳ ${part.label} | ${cell(part.size)} |`));
	}
	return [...lines, ""];
}

/** The section of a ref before R-039, whose hooks appended Limen's text to Pi's system prompt. */
function systemSection(context, fixture) {
	return [
		`Measured on ${fixture} by calling the ref's own \`hook/communication.ts\` and \`hook/finish.ts\` with a stub engine`,
		"API (as `test/fake-engine.mjs` does). Only text Limen adds is counted. Not measured, because it lives outside the",
		"repo: the engine's base prompt and built-in tool schemas, skills, the engine's own `AGENTS.md` loading, the bridge.",
		`Search cue (\`jg\` on PATH): ${context.search ? "present" : "absent here, so not counted"}.`,
		"",
		"- **Preamble**: the role file passed as `--append-system-prompt`, in every request.",
		"- **Limen block**: appended to the system prompt by the communication hook, rebuilt before every prompt.",
		"- **Limen tools**: the `finish` tool schema (name, description, parameters as JSON).",
		"- **Fixed per request** = preamble + Limen block + Limen tools.",
		"- **Per prompt**: the hidden `limen-project-context` cue message added before each prompt; it stays in history.",
		"- **Once per session**: added to the first cue only (a job's note start).",
		"",
		"| Role | Preamble | Limen block | Limen tools | Fixed per request | Per prompt | Once per session |",
		"|---|---|---|---|---|---|---|",
		...systemRows(context),
		"",
		...eventLine(context),
		"### Limen block by part",
		"",
		...breakdown("Coordinator (owner-facing)", context.coordinator.system),
		...breakdown("Job roles", context.job.system),
	];
}

/** The section of a ref from R-039 on, whose standing text is each session's context message (M-01). */
function messageSection(context, fixture) {
	const [first] = context.roles;
	return [
		`Measured on ${fixture} by calling the ref's own \`src/runtime/context-message.ts\` for each role, with the`,
		"preamble its spawn resolves, and its `hook/communication.ts` and `hook/finish.ts` with a stub engine API (as",
		"`test/fake-engine.mjs` does). Only text Limen adds is counted. Not measured, because it lives outside the repo:",
		"the engine's base prompt and built-in tool schemas, skills, the engine's own `AGENTS.md` loading, the bridge.",
		"",
		"- **Context message**: the hidden `limen-context` message a session opens with, sent once at its start and again",
		"  after a compaction removed it; a job's is the `context.md` its spawn publishes.",
		"- **Cue**: the hidden `limen-project-context` message added before each prompt; it stays in history.",
		"",
		"| Role | Context message | Cue |",
		"|---|---|---|",
		...messageRows(context),
		"",
		`The \`finish\` tool schema of a job (name, description, parameters as JSON): ${cell(bytes(context.tool))}.`,
		...(context.events ? [`The job's note start, added to its first cue only: ${cell(bytes(context.job.once))}.`] : []),
		"",
		...eventLine(context),
		"### Context message by part",
		"",
		...breakdown("Coordinator (owner-facing)", context.messages.coordinator),
		...(first === undefined ? [] : breakdown(`Job role ${roleName(first)}`, context.messages[`job ${first}`])),
	];
}

/** The sizes of the job's per-event texts of the task note; none for a ref from R-042 on, which cut it. */
function eventLine({ events }) {
	if (!events) {
		return [];
	}
	const { noteCheck, noteSteer } = events;
	return [`Per event (job roles): note check ${cell(bytes(noteCheck))}, steer suffix ${cell(bytes(noteSteer))}.`, ""];
}

function roleSection(context, project) {
	const fixture = project
		? "a `limen init` fixture overlaid with the guidance files of `--project`"
		: "a fresh `limen init` fixture";
	const body = context.form === "message" ? messageSection(context, fixture) : systemSection(context, fixture);
	return ["## Context per role", "", ...body];
}

const commit = git(["rev-parse", "--short", ref]).toString("utf8").trim();
const blobs = readBlobs(trackedPaths());
const context = await measureRoles(ref, values.project);
const command = `node adrian-rebuild/tools/context-size.mjs ${ref}${values.project ? " --project <path>" : ""}`;
const text = [
	`<!-- PL: Rozmiary Limena przy refie ${ref} (${commit}), wygenerowane przez tools/context-size.mjs: kontekst każdej`,
	context.form === "message"
		? "roli (wiadomość kontekstowa, cue na prompt) oraz linie i bajty na moduł i plik"
		: "roli (preambuła, blok Limena, narzędzia, cue na prompt, dodatki raz na sesję) oraz linie i bajty na moduł i plik",
	"dla kodu, hooków, promptów ról, testów i rozszerzeń seata. Tokeny liczone jako bajty/4.",
	"Stan: wygenerowany; nie edytować ręcznie. -->",
	"",
	`# Sizes at \`${ref}\` (\`${commit}\`)`,
	"",
	`Generated by \`${command}\`. ≈Tokens = bytes / 4.`,
	"",
	...roleSection(context, values.project),
	...moduleSection(blobs),
	...fileSection(blobs),
].join("\n");
writeAtomic(output, text);
console.log(`wrote ${output}: ${blobs.size} files`);
