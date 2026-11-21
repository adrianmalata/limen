// The command registry: one entry per command with every field of R-014, and the wrapper that holds an entry to its ids.
import assert from "node:assert/strict";
import { readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { test } from "node:test";
import { fileURLToPath } from "node:url";
import { main } from "../src/main.ts";
import { OLD_FLAGS } from "../src/old-names.ts";
import { parse } from "../src/parser.ts";
import { type Entry, GROUPS, REGISTRY } from "../src/registry.ts";

const SRC = fileURLToPath(new URL("../src", import.meta.url));
const COMMANDS = join(SRC, "commands");
const OBJECTS = ["job", "owner", "project", "ticket", "seat", "github", "group", "picture", "workspace"];
const TYPES = ["job", "ticket", "text", "path", "branch", "word"];
// D-039 and D-042: the commands a subsequent ticket moves or cuts, each with that ticket.
const MOVED = {
	prune: "R-032",
	close: "R-037",
	keeper: "R-066",
	sweep: "R-032",
	rule: "R-034",
	"rule set": "R-034",
	"rule end": "R-034",
	"rule timer": "R-034",
	"group wait": "R-077",
};
// Change 1: the entries that return identifiers, with their keys; every other entry returns none (D-022).
const IDS = { spawn: ["job"], continue: ["job"], keeper: ["job"], "github review": ["job"], "github work": ["job"] };
const TICKET_IDS = { "ticket new": ["ticket"] };

const byName = (name: string): Entry | undefined => REGISTRY.find((entry) => entry.name === name);

test("T-19: every exported command handler under src/commands/ is the handler of a registry entry", async () => {
	const handlers = new Set(REGISTRY.map((entry) => entry.handler));
	const loose: string[] = [];
	for (const file of readdirSync(COMMANDS).filter((name) => name.endsWith(".ts"))) {
		const exports: Record<string, unknown> = await import(join(COMMANDS, file));
		for (const [name, value] of Object.entries(exports)) {
			if (name.endsWith("Command") && typeof value === "function" && !handlers.has(value as Entry["handler"])) {
				loose.push(`${file}: ${name}`);
			}
		}
	}
	assert.deepEqual(loose, []);
});

test("T-19: every registry entry has every field of R-014 with an allowed value", () => {
	assert.equal(new Set(REGISTRY.map((entry) => entry.name)).size, REGISTRY.length, "entry names are unique");
	for (const entry of REGISTRY) {
		const problems = [
			/^[a-z][a-z-]*(?: [a-z][a-z-]*)?$/.test(entry.name) ? "" : "name",
			OBJECTS.includes(entry.object) ? "" : "object",
			entry.kind === "read" || entry.kind === "change" ? "" : "kind",
			(entry.visibility === "internal") === Boolean(entry.caller?.trim()) ? "" : "visibility and caller",
			entry.summary.trim() && !entry.summary.endsWith(".") ? "" : "summary",
			entry.example.startsWith(`limen ${entry.name}`) ? "" : "example",
			entry.movedBy === undefined || /^R-\d{3}$/.test(entry.movedBy) ? "" : "movedBy",
			typeof entry.handler === "function" ? "" : "handler",
			...entry.schema.map((part) => {
				if ("positional" in part) {
					return TYPES.includes(part.type) && part.about.trim() ? "" : `positional ${part.positional}`;
				}
				return "flag" in part && !part.about.trim() ? `flag ${part.flag}` : "";
			}),
		].filter(Boolean);
		assert.deepEqual(problems, [], entry.name);
	}
});

test("D-022: an entry declares the ids keys of R-014 and no others", () => {
	const declared = Object.fromEntries(
		REGISTRY.filter((entry) => entry.ids.length).map((entry) => [entry.name, entry.ids]),
	);
	assert.deepEqual(declared, { ...IDS, ...TICKET_IDS });
});

test("T-18: a top-level entry acts on a job, the owner or the project, and a subcommand on its group, unless it is moved", () => {
	const misplaced = REGISTRY.filter((entry) => entry.movedBy === undefined)
		.filter((entry) => {
			const [first, sub] = entry.name.split(" ");
			return sub === undefined ? !["job", "owner", "project"].includes(entry.object) : entry.object !== first;
		})
		.map((entry) => `${entry.name} acts on ${entry.object}`);
	assert.deepEqual(misplaced, []);
});

test("D-039: the moved entries are exactly the commands a subsequent ticket moves, with that ticket", () => {
	const moved = REGISTRY.filter((entry) => entry.movedBy !== undefined);
	assert.ok(moved.length > 0, "no entry is moved any more: remove the field movedBy and this exception");
	assert.deepEqual(Object.fromEntries(moved.map((entry) => [entry.name, entry.movedBy])), MOVED);
});

// T-28 (3): each command marked irreversible, with its test file and the titles of its tests of running it again and
// of losing nothing.
const IRREVERSIBLE = {
	migrate: {
		file: "test/cli/migrate.test.ts",
		again: "a second run has nothing to do, exits 0 and changes nothing",
		kept: "a valid older job becomes a record holding every value of its files, and its content files stay",
	},
};

test("T-28 (3): the irreversible entries are changes with tests of running them again and of losing nothing", () => {
	const marked = REGISTRY.filter((entry) => entry.irreversible).map((entry) => entry.name);
	assert.deepEqual(marked, Object.keys(IRREVERSIBLE));
	for (const [name, { file, again, kept }] of Object.entries(IRREVERSIBLE)) {
		assert.equal(byName(name)?.kind, "change", name);
		const text = readFileSync(fileURLToPath(new URL(`../${file}`, import.meta.url)), "utf8");
		for (const title of [again, kept]) {
			assert.ok(text.includes(`test(${JSON.stringify(title)},`), `${file} has no test "${title}"`);
		}
	}
});

test("T-18: an entry that acts on one job takes a required job, except spawn, which creates it", () => {
	const without = REGISTRY.filter((entry) => entry.object === "job" && entry.name !== "spawn")
		.filter((entry) => !entry.schema.some((part) => "positional" in part && part.type === "job" && !part.optional))
		.map((entry) => entry.name);
	assert.deepEqual(without, []);
});

/** The words of a shell line: a double-quoted part is one word. */
function words(line: string): string[] {
	return [...line.matchAll(/"([^"]*)"|(\S+)/g)].map((match) => match[1] ?? match[2] ?? "");
}

test("D-041: every example in the registry goes through the real parser of its entry", () => {
	for (const entry of REGISTRY) {
		const [limen, ...rest] = words(entry.example);
		assert.equal(limen, "limen", entry.name);
		const length = entry.name.split(" ").length;
		assert.equal(rest.slice(0, length).join(" "), entry.name, entry.example);
		assert.doesNotThrow(() => parse(entry, rest.slice(length)), entry.example);
	}
});

test("T-19: every group a public entry belongs to has a header, and every module a summary for its line", () => {
	const objects = new Set(REGISTRY.filter((entry) => entry.visibility === "public").map((entry) => entry.object));
	const missing = [...objects].filter((object) => {
		const group = GROUPS.find((candidate) => candidate.object === object);
		return !group || !("module" in group ? group.summary : group.header).trim();
	});
	assert.deepEqual(missing, []);
});

test("every removed flag of src/old-names.ts is a removed part of its command's schema", () => {
	const absent = OLD_FLAGS.filter(
		(old) => !byName(old.command)?.schema.some((part) => "removed" in part && part.removed === old.name.slice(2)),
	).map((old) => `${old.command} ${old.name}`);
	assert.deepEqual(absent, []);
});

test("T-25: no file in src/ reads process.argv, and no command handler takes the raw words", () => {
	const found: string[] = [];
	for (const file of readdirSync(SRC, { recursive: true, encoding: "utf8" }).filter((name) => name.endsWith(".ts"))) {
		const text = readFileSync(join(SRC, file), "utf8");
		if (text.includes("process.argv") || /export (?:async )?function \w+Command\(args\b/.test(text)) {
			found.push(file);
		}
	}
	assert.deepEqual(found, []);
});

test("UNDECLARED_IDS: a handler that returns an ids key its entry does not declare ends with exit code 5", async (t) => {
	const probe: Entry = {
		name: "probe",
		object: "project",
		kind: "read",
		visibility: "public",
		summary: "a probe",
		schema: [],
		ids: [],
		example: "limen probe",
		handler: async () => ({ next: "", ids: { job: "2026-11-19-probe-a1b2c3d4" } }),
	};
	const errors: string[] = [];
	t.mock.method(console, "error", (line: unknown) => errors.push(String(line)));
	t.mock.method(console, "log", () => {});
	// No rule timer starts from this in-process run (src/commands/rule.ts, endDueRules).
	const herdr = process.env.LIMEN_HERDR;
	process.env.LIMEN_HERDR = "0";
	t.after(() => {
		if (herdr === undefined) {
			delete process.env.LIMEN_HERDR;
		} else {
			process.env.LIMEN_HERDR = herdr;
		}
	});
	await main(["probe"], process.cwd(), [probe]);
	const code = process.exitCode;
	process.exitCode = 0;
	assert.equal(code, 5);
	assert.deepEqual(JSON.parse(errors.at(-1) ?? "{}"), { class: "internal", code: "UNDECLARED_IDS", next: "" });
});
