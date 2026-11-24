/* PL: Test reguł wierszy ticketów i plików ticket.md (tools/ticket-rules.mjs, D-054) na napisach, bez repozytorium.
   Sprawdza status `ready` z ticket.md albo wpisem decyzji, `Run` = `night` ticketu pair z zapisanymi wyborami,
   wyciąganie poleceń kryteriów (tylko „`polecenie` → exit”) i dopasowanie poleceń do allow-listy Claude Code
   według faktów z nocnych logów: goły program pasuje do reguły z „ *”, każda część złożonego polecenia osobno,
   `$`, przekierowanie i reguła deny odrzucają; ścieżka w jednym spanie z `git rm` albo `git mv` w `## Change`
   ticketu `ready` lub `active` jest błędem (D-099). Stan: działa. */
// Usage: node --test adrian-rebuild/tools/test-ticket-rules.mjs
import assert from "node:assert/strict";
import { test } from "node:test";
import { checkReady, checkRuns, criteria, loadPermissions, refusal, STATUS, section } from "./ticket-rules.mjs";

const settings = (allow, deny = []) =>
	loadPermissions(JSON.stringify({ permissions: { allow: allow.map((rule) => `Bash(${rule})`), deny } }));
const listed = settings(
	[
		"git status *",
		"git grep *",
		"sort *",
		"node --test *",
		"node adrian-rebuild/tools/fails-before.mjs *",
		"git apply --include=*",
	],
	["Bash(* --no-verify*)"],
);

const row = (fields) => ({
	ID: "R-017",
	Stage: "2",
	Depends: "—",
	Mode: "delegated",
	Run: "night",
	Status: "planned",
	...fields,
});
const ticketText = (acceptance, decisions = "") =>
	`# R-017 Title\n## Problem\n## Change\n## Out of scope\n## Acceptance\n${acceptance}\n## Migration\n## Risk\n## Rollback\n## Decisions\n${decisions}`;
const file = (text) => new Map([["R-017", { path: "adrian-rebuild/R-017-x/ticket.md", text }]]);
const decisions =
	"- 2026-11-20 D-055 (Adrian): R-017 keeps its name.\n  More text.\n- 2026-11-20 D-056 (Adrian): other.\n";

test("A command that an allow rule matches is let through", () => {
	assert.equal(refusal("node --test test/boundary.test.ts", listed), undefined);
});

test("A trailing ' *' of a rule also matches the bare command, as the night logs show", () => {
	assert.equal(refusal("node adrian-rebuild/tools/fails-before.mjs", listed), undefined);
});

test("A trailing ' *' of a rule needs a space before the rest of the command", () => {
	assert.match(refusal("git statusx", listed), /no allow rule/);
});

test("A star inside a rule matches any text", () => {
	assert.equal(refusal("git apply --include=src/a.ts node_modules/.rebuild-review/R-017.diff", listed), undefined);
});

test("A command that no allow rule matches is refused with its part named", () => {
	assert.match(refusal("git --version", listed), /git --version.*no allow rule/);
	assert.match(refusal("TMPDIR=/x node --test a.test.ts", listed), /no allow rule/);
});

test("Every part of a compound command must match a rule", () => {
	assert.equal(refusal("git grep -n a -- src | sort -u", listed), undefined);
	assert.match(refusal("git status --short && npm publish", listed), /npm publish/);
	assert.match(refusal("git status --short; npm publish", listed), /npm publish/);
});

test("A single & splits the command, so the part after it must match a rule too", () => {
	assert.match(refusal("git status --short & npm publish", listed), /`npm publish` matches no allow rule/);
});

test("An operator inside quotes does not split the command", () => {
	assert.equal(refusal("git grep -n -E 'jg|jevgrep; x' -- src", listed), undefined);
	assert.equal(refusal('git grep -n "a && b" -- src', listed), undefined);
});

test("A deny rule refuses a command that an allow rule matches", () => {
	assert.match(refusal("git status --no-verify", listed), /deny rule/);
});

test("A variable or command expansion outside single quotes is refused", () => {
	const echo = settings(["echo *", "git grep *"]);
	assert.match(refusal('echo "exit $?"', echo), /expansion/);
	assert.match(refusal("echo $(git rev-parse HEAD)", echo), /expansion/);
	assert.equal(refusal("git grep -n 'end$' -- src", echo), undefined);
});

test("A redirection is refused (D-016)", () => {
	assert.match(refusal("node --test a.test.ts > out.txt", listed), /redirection/);
	assert.match(refusal("node --test a.test.ts 2>&1", listed), /redirection/);
});

test("An unbalanced quote is refused", () => {
	assert.match(refusal("git grep -n 'open -- src", listed), /quote/);
});

test("Only the Bash rules of the settings are read", () => {
	const permissions = loadPermissions(
		JSON.stringify({ permissions: { allow: ["Edit(/**)", "Agent(rebuild-reviewer)", "Bash(ls *)"], deny: [] } }),
	);
	assert.equal(permissions.allow.length, 1);
});

test("Settings that are not valid JSON throw", () => {
	assert.throws(() => loadPermissions("{"));
});

test("An ask rule refuses, since dontAsk mode refuses what it would ask", () => {
	const asking = loadPermissions(
		JSON.stringify({ permissions: { allow: ["Bash(git *)"], ask: ["Bash(git push *)"] } }),
	);
	assert.match(refusal("git push origin adrian-rebuild", asking), /ask rule Bash\(git push \*\)/);
	assert.equal(refusal("git status", asking), undefined);
});

test("A bare Bash rule stands for every command", () => {
	const all = loadPermissions(JSON.stringify({ permissions: { allow: ["Bash"] } }));
	assert.equal(refusal("npm publish", all), undefined);
	const none = loadPermissions(JSON.stringify({ permissions: { allow: ["Bash(git *)"], deny: ["Bash"] } }));
	assert.match(refusal("git status", none), /deny rule Bash/);
});

test("A criterion's commands are the backticked spans followed by → exit", () => {
	const text = ticketText(
		"- AC-1: `node adrian-rebuild/tools/fails-before.mjs` → exit 0; `outcome.md` → `## Fails before` holds it.",
	);
	assert.deepEqual(criteria(text)[0].commands, ["node adrian-rebuild/tools/fails-before.mjs"]);
});

test("A criterion's wrapped lines are joined, so a wrapped command is read whole", () => {
	const text = ticketText("- AC-1: `node --test a.test.ts` → exit 0; `git grep -n x --\n  src` → exit 1 (wrapped).");
	assert.deepEqual(criteria(text)[0].commands, ["node --test a.test.ts", "git grep -n x -- src"]);
});

test("A criterion line without its colon still counts, so its command is checked", () => {
	const text = ticketText("- AC-1: `ls` → exit 0\n- AC-2 `node seat/deploy.ts` → exit 2");
	assert.deepEqual(criteria(text)[1], { id: "AC-2", judgment: false, commands: ["node seat/deploy.ts"] });
});

test("A criterion marked (judgment) is a judgment, and the others are not", () => {
	const text = ticketText("- AC-1: `ls` → exit 0\n- AC-2 (judgment): `src/a.ts` → reads well.");
	assert.deepEqual(
		criteria(text).map(({ id, judgment }) => ({ id, judgment })),
		[
			{ id: "AC-1", judgment: false },
			{ id: "AC-2", judgment: true },
		],
	);
});

test("The status column accepts ready, with or without the decisions it names", () => {
	for (const status of ["ready", "ready (D-055)", "ready (D-055, D-056)", "planned", "dropped (by Adrian)"]) {
		assert.match(status, STATUS);
	}
	for (const status of ["ready ()", "ready (R-016)", "ready(D-055)", "Ready"]) {
		assert.doesNotMatch(status, STATUS);
	}
});

test("A ready ticket whose dependencies are done needs its ticket.md", () => {
	const tickets = [row({ Status: "ready (D-055)" })];
	assert.match(checkReady(tickets, { files: new Map(), decisions }).join("\n"), /R-017.*ticket\.md/);
	assert.deepEqual(checkReady(tickets, { files: file(ticketText("- AC-1: `ls` → exit 0")), decisions }), []);
});

test("A ready ticket whose dependencies are not done needs its ticket.md or a named decision entry", () => {
	const tickets = (status) => [row({ ID: "R-016", Status: "planned" }), row({ Depends: "R-016", Status: status })];
	const check = (status) => checkReady(tickets(status), { files: new Map(), decisions }).join("\n");
	assert.equal(check("ready (D-055)"), "");
	assert.match(check("ready"), /R-017.*ready \(D-NNN\)/);
	assert.match(check("ready (D-056)"), /D-056 does not name R-017/);
	assert.match(check("ready (D-099)"), /D-099 is no entry/);
	assert.equal(checkReady(tickets("ready"), { files: file(ticketText("")), decisions }).join(""), "");
});

test("A criterion of a ready or active ticket names a command with its exit code", () => {
	const text = ticketText("- AC-1: the test fails before the change.\n- AC-2 (judgment): reads well.");
	for (const status of ["ready", "active"]) {
		const errors = checkReady([row({ Status: status })], { files: file(text), decisions });
		assert.deepEqual(errors.length, 1);
		assert.match(errors[0], /AC-1.*no command/);
	}
});

test("A criterion command of a ready or active ticket must pass the allow-list when it is given", () => {
	const text = ticketText("- AC-1: `node --test a.test.ts` → exit 0; `node seat/deploy.ts` → exit 2");
	for (const status of ["ready", "active"]) {
		const errors = checkReady([row({ Status: status })], { files: file(text), decisions, permissions: listed });
		assert.deepEqual(errors.length, 1);
		assert.match(errors[0], /R-017-x\/ticket\.md: AC-1: `node seat\/deploy\.ts`.*no allow rule/);
	}
	assert.deepEqual(checkReady([row({ Status: "ready" })], { files: file(text), decisions }), []);
});

test("D-099 (2): a ready or active ticket names each deleted or moved path of ## Change in its own backticks", () => {
	const withChange = (change) => ticketText("- AC-1: `ls` → exit 0").replace("## Change\n", `## Change\n${change}\n`);
	const joined = withChange("(h) Cuts: `git rm docs/seat/quota-resume.ts`; and `git mv a/b.ts c/d.ts`.");
	for (const status of ["ready", "active"]) {
		const errors = checkReady([row({ Status: status })], { files: file(joined), decisions });
		assert.deepEqual(errors.length, 2);
		assert.match(errors[0], /R-017-x\/ticket\.md: ## Change: `git rm docs\/seat\/quota-resume\.ts`.*own backticks/);
	}
	const apart = withChange("(h) Cuts: `docs/seat/quota-resume.ts` with `git rm`; `picture/` with `git rm -r`.");
	assert.deepEqual(checkReady([row({ Status: "ready" })], { files: file(apart), decisions }), []);
	assert.deepEqual(checkReady([row({ Status: "done" })], { files: file(joined), decisions }), []);
});

test("Tickets of other statuses keep their criteria unchecked", () => {
	const text = ticketText("- AC-1: `node seat/deploy.ts` → exit 2\n- AC-2: no command here.");
	for (const status of ["planned", "blocked", "done", "dropped (by Adrian)"]) {
		assert.deepEqual(checkReady([row({ Status: status })], { files: file(text), decisions, permissions: listed }), []);
	}
});

test("Run follows from the mode and the dependencies of the stage", () => {
	const tickets = [
		row({ ID: "R-016" }),
		row({ ID: "R-017", Mode: "pair", Run: "day-after", Depends: "R-016" }),
		row({ ID: "R-018", Mode: "pair", Run: "day" }),
	];
	assert.deepEqual(checkRuns(tickets, new Map()), []);
	assert.match(checkRuns([row({ Run: "day" })], new Map()).join(""), /R-017: Run is "day".*"night"/);
});

test("A delegated ticket may not depend on a pair ticket of its stage (D-011)", () => {
	const pairFirst = [row({ ID: "R-016", Mode: "pair", Run: "day" }), row({ Depends: "R-016" })];
	assert.match(checkRuns(pairFirst, new Map()).join(""), /R-017: delegated, but depends on the pair ticket/);
});

test("A ticket on a cycle of dependencies is an error", () => {
	const cycle = [row({ ID: "R-016", Depends: "R-017" }), row({ Depends: "R-016" })];
	assert.match(checkRuns(cycle, new Map()).join(""), /lies on a cycle/);
});

test("A pair ticket after a night pair ticket of its stage runs day-after", () => {
	const answered = { path: "adrian-rebuild/R-016-x/ticket.md", text: ticketText("", "- 2026-11-20 (Adrian): 1a.\n") };
	const files = new Map([["R-016", answered]]);
	const tickets = (run) => [
		row({ ID: "R-016", Mode: "pair", Run: "night" }),
		row({ Mode: "pair", Run: run, Depends: "R-016" }),
	];
	assert.deepEqual(checkRuns(tickets("day-after"), files), []);
	assert.match(checkRuns(tickets("day"), files).join(""), /R-017: Run is "day".*"day-after"/);
});

test("A pair ticket may run at night once its ticket.md records its choices (D-054 (3))", () => {
	const pair = [row({ Mode: "pair", Run: "night" })];
	const answered = file(ticketText("", "- 2026-11-20 (Adrian, the variants sheet): 1a 2b.\n"));
	assert.deepEqual(checkRuns(pair, answered), []);
	assert.match(checkRuns(pair, new Map()).join(""), /R-017: Run is "night".*D-054 \(3\)/);
	assert.match(checkRuns(pair, file(ticketText("", "none yet\n"))).join(""), /D-054 \(3\)/);
});

test("section ignores a heading inside a fenced block", () => {
	const text = "## A\none\n```\n## B\n```\ntwo\n## C\nthree\n";
	assert.equal(section(text, "A"), "one\n```\n## B\n```\ntwo\n");
	assert.equal(section(text, "B"), "");
});
