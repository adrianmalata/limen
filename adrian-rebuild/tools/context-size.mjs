/* PL: Skrypt pomiaru rozmiarów Limena przy dowolnym refie gita (bez checkoutu): linie i bajty na moduł oraz bajty
   i ≈tokeny (bajty/4) kontekstu każdej roli na każdy request, na prompt i raz na sesję (moduł role-context.mjs).
   Służy do mapy w etapie 1 i do porównań przed/po w etapach 4–5; z --project mierzy też pliki prawdziwego projektu
   (np. na seacie), niczego w nim nie zapisując. Wynik zapisuje atomowo (atomic-write.mjs, D-018). Stan: działa. */
// Usage: node adrian-rebuild/tools/context-size.mjs [ref] [--project <path>] [--out <file>]   (from the repo root)
import { spawnSync } from "node:child_process";
import { parseArgs } from "node:util";
import { writeAtomic } from "./atomic-write.mjs";
import { GROUP_ROLES, JOB_ROLES, measureRoles, sections } from "./role-context.mjs";

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

function roleRows(context) {
	const block = bytes(context.job.system);
	const tool = bytes(context.tool);
	const cue = bytes(context.job.cue);
	const once = bytes(context.job.once);
	const rows = [...JOB_ROLES, ...GROUP_ROLES].map((role) => {
		const own = bytes(context.preambles[role]);
		const name = GROUP_ROLES.includes(role) ? `group team (\`${role}.md\`)` : role;
		return `| ${name} | ${cell(own)} | ${cell(block)} | ${cell(tool)} | ${cell(sum(own, block, tool))} | ${cell(cue)} | ${cell(once)} |`;
	});
	const owner = context.coordinator;
	const ownerFixed = bytes(owner.system);
	const ownerCue = `${cell(bytes(owner.cue))}; wake ${cell(bytes(context.wake.cue))}`;
	rows.unshift(
		`| coordinator (owner-facing) | none | ${cell(ownerFixed)} | none | ${cell(ownerFixed)} | ${ownerCue} | none |`,
	);
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

function roleSection(context, project) {
	const fixture = project
		? "a `limen init` fixture overlaid with the guidance files of `--project`"
		: "a fresh `limen init` fixture";
	const { noteCheck, noteSteer } = context.events;
	return [
		"## Context per role",
		"",
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
		...roleRows(context),
		"",
		`Per event (job roles): note check ${cell(bytes(noteCheck))}, steer suffix ${cell(bytes(noteSteer))}.`,
		"",
		"### Limen block by part",
		"",
		...breakdown("Coordinator (owner-facing)", context.coordinator.system),
		...breakdown("Job roles", context.job.system),
	];
}

const commit = git(["rev-parse", "--short", ref]).toString("utf8").trim();
const blobs = readBlobs(trackedPaths());
const context = await measureRoles(ref, values.project);
const command = `node adrian-rebuild/tools/context-size.mjs ${ref}${values.project ? " --project <path>" : ""}`;
const text = [
	`<!-- PL: Rozmiary Limena przy refie ${ref} (${commit}), wygenerowane przez tools/context-size.mjs: kontekst każdej`,
	"roli (preambuła, blok Limena, narzędzia, cue na prompt, dodatki raz na sesję) oraz linie i bajty na moduł i plik",
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
