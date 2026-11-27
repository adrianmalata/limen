<!-- PL: Recenzja ticketu R-040 (każdy tekst Limena tylko z pakietu, rejestr w trzech plikach według odbiorcy, dryf i
`templates/.history/` wycięte, `templates/agents.md` → `templates/manual.md`). Runda 1 (noc 26/27.11, przebieg 4):
PASS przy wszystkich kryteriach spełnionych, z sześcioma uwagami; trzy idą do rundy poprawek F1–F3 (dwa komentarze
według T-30 i jedno zdanie `docs/commands.md`, `ticket.md` → `## Decisions` 13), trzy bez zmian z powodem (jedna do
notatek R-046, jedna jako nocna decyzja dla Adriana). Runda 2: PASS z dwiema uwagami (G1 w ostatniej rundzie
poprawek, zapis bramki przez sesję główną); runda 3: PASS z pięcioma uwagami, które idą do otwartych punktów i do
notatek R-044 i R-045 (D-092). Stan: recenzja zamknięta. -->

# R-040 review

## Round 1 (2026-11-27, night run 4)

- Before: a fresh implementer after the cut run 1 (D-102 (4): `review-guard.mjs compare --git` → "within its limits"
  before it and after it, exit 0); the main session's `gate.mjs` → exit 0, 1351 tests, 1351 pass (307.7 s), no `gate:`
  line; `fails-before.mjs` on the eight files of AC-15 → exit 0.
- Reply: `rebuild-reviewer` with the ticket, `node_modules/.rebuild-review/R-040.diff` and `taste.md`;
  `review-guard.mjs compare` → "unchanged", exit 0; `review-verdict.mjs` → "consistent", exit 0.
- Verdict: **PASS**. AC-1–AC-18 met; six notes, no blocking finding.

| # | Finding (short) | Decision |
|---|---|---|
| 1 | note · observed: the two "a changed `AGENTS.md` is kept" tests pass at HEAD, which lists only byte-identical copies (`test/project/leftovers.test.ts:110`, `test/cli/init.test.ts:143`) | no change: `## Change` item 9 asks for "a changed `AGENTS.md` kept", and HEAD already keeps it, so no test of that property can fail there; it guards item 7's boundary ("a changed one never") from now on, as R-039's round 1 note 4 did (`outcome.md` → Deviations 12) |
| 2 | note · observed: the comment on `PROJECT_FILES` says "The project files Limen still reads", but Limen also reads `.agents/limen/reminders.md` and `spec/build.md` (`src/project/leftovers.ts:14-16`) | fix (F1): T-30 (1); the comment says what the list is, item 7's project context and owner files, not every file Limen reads |
| 3 | note · observed: `docs/commands.md:190` says the list holds `.agents/limen/<role>.md`, changed or not, while the code lists only the ten roles of `ROLE_COPIES` (`src/project/leftovers.ts:33-44`) | fix (F2): the sentence names the package's roles and the cut `picture` and `scout`, as item 7 does |
| 4 | note · observed: the doc comment on `guidance()` gives a circular reason ("which every message that holds it holds too"), false for a worker, whose message has no specs register (`hook/communication.ts:444-447`) | fix (F3): T-30 (1), the local reason and a pointer |
| 5 | note · observed: a missing package text throws a raw `ENOENT`, so spawn ends with exit 5, while T-02 puts the file system under exit 4 (`src/runtime/context-message.ts:71-73`) | no change, night default for Adrian at gate 5.4: the package's own file is part of Limen's code, so its absence is a broken install, an unexpected exception with its stack in the log (T-02's class 5); T-02's class 4 is the environment around Limen (git, the project's file system, permissions, a missing tool); the ticket sets no class (`outcome.md` → Deviations 2) |
| 6 | note · observed: the message heads the manual "Coordinator manual" while its first line still reads "Agent shop manual" (`templates/manual.md:1`, T-18) | no change here: literal wording is R-046's (`## Out of scope`); the note goes to R-046's notes in `plan.md` → `## Tickets` |

## Round 2 (2026-11-27, night run 4)

- Before: a fresh implementer's fixes F1–F3 (`ticket.md` → `## Decisions` 13; D-026) → `review-guard.mjs compare
  --git` → "within its limits", exit 0; the main session's `gate.mjs` → exit 0, 1351 tests, 1351 pass (305.0 s), no
  `gate:` line. Comments and documentation only, so no `fails-before.mjs` run.
- Reply: `rebuild-reviewer` with the ticket, `node_modules/.rebuild-review/R-040-2.diff` and `taste.md`;
  `review-guard.mjs compare` → "unchanged", exit 0; `review-verdict.mjs` → "consistent", exit 0.
- Verdict: **PASS**. AC-1–AC-18 met; two notes, no blocking finding.

| # | Finding (short) | Decision |
|---|---|---|
| 1 | note · proven: the claim F1 removed from the comment on `PROJECT_FILES` stays in the same file and in its test ("a file Limen still reads"), though no Limen code reads `CLAUDE.md` (`src/project/leftovers.ts:51`, `test/project/leftovers.test.ts:58-59`, `:233`) | fix (G1): T-30 (1); the last round of fixes, by a fresh implementer (`ticket.md` → `## Decisions` 14) |
| 2 | note · observed: `outcome.md` records no gate run after F1–F3 | fixed by the main session (D-053 (2)): `outcome.md` → `## Proof` holds the 305.0 s run |

## Round 3 (2026-11-27, night run 4)

- Before: a fresh implementer's fix G1 (`ticket.md` → `## Decisions` 14; D-026) → `review-guard.mjs compare --git` →
  "within its limits", exit 0; the main session's `gate.mjs` → exit 0, 1351 tests, 1351 pass (306.9 s), no `gate:`
  line. A comment and a test name only, so no `fails-before.mjs` run.
- Reply: `rebuild-reviewer` with the ticket, `node_modules/.rebuild-review/R-040-3.diff` and `taste.md`;
  `review-guard.mjs compare` → "unchanged", exit 0; `review-verdict.mjs` → "consistent", exit 0.
- Verdict: **PASS**. AC-1–AC-18 met; five notes, no blocking finding. Both rounds of fixes are spent, so a note that
  needs code or tests goes to the ticket that rewrites that part or to the open points (D-092); there is no round 4.

| # | Finding (short) | Decision |
|---|---|---|
| 1 | note · proven: a test comment calls the specs register "the text every role's message holds", the reason F3 removed from the hook (`test/hook/communication.test.ts:364`) | no change here (D-092): `outcome.md` → Open points 4 |
| 2 | note · proven: `resolvePreamble` accepts any `templates/<name>.md`, so `--role manual` and the like load a text that is no role; present at HEAD with `--role agents` (`src/job/spawning.ts:123-125`) | no change here (D-092): the note of R-044 and R-045 in `plan.md` → `## Tickets` (the role table as the one list of job roles) |
| 3 | note · observed: the only recorded `check.mjs` run predates F1–F3 and G1 | closed by the main session at the commit (protocol step 7): `outcome.md` → `## Proof` |
| 4 | note · observed: `test/project/leftovers.test.ts` fails at HEAD at load, not test by test; the same mechanism fails at HEAD in the status and init tests | no change: recorded in `outcome.md` → `## Fails before`; the reviewer's T-29 answer accepts it |
| 5 | note · observed: `src/project/inherit.ts` keeps its name though nothing in it inherits (T-25 (1)); AC-7–AC-9 name the path | no change here (D-092): `outcome.md` → Open points 5 |
