<!-- PL: Recenzje ticketu R-001 przez rebuild-reviewer. Runda 1 (18.11, sesja dzienna): werdykt PASS, wszystkie
kryteria spełnione, osiem uwag bez blokujących; cztery idą do poprawki przez wznowionego implementera (linia
`dropped` od razu po każdym usunięciu, test nakładania się wpisów rejestru, test o jednym powodzie, opis sekcji
przy `status --all`), jedną poprawia sesja główna w outcome.md, dwie są odrzucone z powodem, a niestabilny test
wyścigu spoza R-001 trafia do `## State`. Runda 2: PASS, trzy uwagi; poprawka komentarza reguły nakładania idzie
do drugiej, ostatniej rundy poprawek, a brak testu CLI dla przerwanego usuwania jest przyjętą luką. Runda 3:
PASS z jedną uwagą (głośny ENOTDIR, przyjęty według T-01). Stan: zamknięty. -->

# Review: R-001 Leftover files of cut features are listed and can be dropped

## Round 1 (2026-11-18, day session)

- Inputs: `adrian-rebuild/R-001-leftover-files/ticket.md` (with the D-025 decision), the diff from
  `review-guard.mjs diff --out node_modules/.rebuild-review/R-001.diff`, `adrian-rebuild/taste.md`.
- Main session before the review: `review-guard.mjs compare --git node_modules/.rebuild-review/R-001.git <ticket.md>`
  → within its limits; `node adrian-rebuild/tools/gate.mjs` → exit 0, 93/93; `node adrian-rebuild/tools/fails-before.mjs`
  → exit 0 (the three new test files fail at HEAD).
- Guard: `review-guard.mjs compare node_modules/.rebuild-review/R-001.before` → `unchanged`, exit 0.
- Parser: `review-verdict.mjs node_modules/.rebuild-review/R-001.reply <ticket.md>` → `consistent`, exit 0.
- Verdict: PASS. AC-1 to AC-9 met; eight notes, none blocking.

| # | Finding | Kind | Decision |
|---|---|---|---|
| 1 | A removal that fails part-way prints no line for the entries already removed: `dropLeftovers` removes all, and `init` prints the `dropped` lines only after it returns; HEAD printed each line after its `rm` (`src/project/leftovers.ts:35-38`, `src/commands/init.ts:24-30`) | note · proven | fix: each `dropped` line is printed right after its removal, with a test (`ticket.md` → `## Decisions`, round 1) |
| 2 | Overlapping entries stop the drop: an entry equal to or under an earlier one throws ENOENT after the earlier removal; the registry test checks only path syntax (`src/project/leftovers.ts:22-29`, `:36`) | note · proven | fix: the registry test also rejects an entry that equals or lies under another entry or a `TRACKED` path, or contains a `TRACKED` path, with the rule tested on bad examples, so R-002 cannot add one |
| 3 | `limen status` fails when a project has a regular file at a `TRACKED` path and the package lacks that template (`src/project/leftovers.ts:45-49`) | note · proven | rejected: a missing packaged template is a broken install, a failure on the main path that T-01 makes loud; the outcome lists it as a deviation |
| 4 | The first unit test also fails if the sort breaks (`test/project/leftovers.test.ts:59-66`) | note · proven | fix: the fixture registry is given in path order, so only the sort test checks the sort (T-29) |
| 5 | The docs place the section "before the `Older` line", which `status --all` does not print (`docs/commands.md:61`) | note · proven | fix: the docs name both places (before `Older:`, or before `Coordinator tabs:` with `--all`) |
| 6 | `outcome.md` has no `## Fails before` section (protocol step 4) | note · proven | fix by the main session when it writes the final `outcome.md` |
| 7 | Gate run 3 failed on the lock-contention test `test/s9-housekeeping.test.ts:135` and passed on the same tree in run 4 | note · observed | not R-001's: R-001 changes no code that the test runs; recorded in `plan.md` → `## State` for Adrian |
| 8 | An edit to a `TRACKED` copy between the comparison and `rmSync` would be deleted unseen (`src/project/leftovers.ts:34-36`) | note · guessed | rejected: one synchronous call, the same order as HEAD, and the drop is an explicit command run after the list is read (`## Deployment` 1.1) |

Taste questions answered by the reviewer: T-29 (one test with two reasons, note 4), T-30 (every comment gives a reason
and resolves), T-40 (no owner step), T-41 (no new command).

## Round 2 (2026-11-18, day session)

- Inputs: the same `ticket.md` (with the round-1 decision), the diff from `review-guard.mjs diff --out
  node_modules/.rebuild-review/R-001.diff2`, `taste.md`.
- Main session before the review: `review-guard.mjs compare --git node_modules/.rebuild-review/R-001-fix1.git
  <ticket.md>` → within its limits; `node adrian-rebuild/tools/gate.mjs` → exit 1 once (93/96: two tests of
  `test/s2-hosted.test.ts` and the lock-contention test of `test/s9-housekeeping.test.ts:135`, none running R-001's
  code; the implementer's process was still ending, guessed as the cause), then exit 0, 96/96 on the same tree;
  `node adrian-rebuild/tools/fails-before.mjs` → exit 0.
- Guard: `review-guard.mjs compare node_modules/.rebuild-review/R-001.before2` → `unchanged`, exit 0.
- Parser: `review-verdict.mjs node_modules/.rebuild-review/R-001.reply2 <ticket.md>` → `consistent`, exit 0.
- Verdict: PASS. AC-1 to AC-9 met; three notes, none blocking.

| # | Finding | Kind | Decision |
|---|---|---|---|
| 1 | The init side of fix 1 has no test with a failing removal; a return to printing after `dropLeftovers` returns would pass every test (`src/commands/init.ts:24`, `test/project/leftovers.test.ts:123-132`) | note · proven | accepted gap: `init` passes only the print callback, whose order the unit test proves; a failing removal through the CLI needs a permission trick that does not hold under root, or a test knob that T-03 keeps out |
| 2 | `## State` does not yet record the lock-contention flake, and lists R-001 as `blocked` | note · proven | the main session updates `## State` in step 7, with the commit |
| 3 | The overlap rule's comment gives as its reason a double listing and a failing second removal, but an entry that holds a changed tracked copy would silently delete the overlay that Change item 3 keeps (`test/project/leftovers.test.ts:58-61`, `src/project/leftovers.ts:22`, `:43`) | note · proven | fix (round 2 of fixes): the comment names both harms, the silent deletion of a kept overlay first (T-30) |

Taste questions answered by the reviewer: T-29 (each round-1 test fails for one reason), T-30 (one comment's reason
is incomplete, note 3), T-40 (no owner step), T-41 (no new command).

## Round 3 (2026-11-18, day session)

- Inputs: the same `ticket.md` (with the round-1 and round-2 decisions), the diff from `review-guard.mjs diff --out
  node_modules/.rebuild-review/R-001.diff3`, `taste.md`.
- Main session before the review: `review-guard.mjs compare --git node_modules/.rebuild-review/R-001-fix2.git
  <ticket.md>` → within its limits; `node adrian-rebuild/tools/gate.mjs` → exit 0, 96/96 (the round-2 delta is two
  comments).
- Guard: `review-guard.mjs compare node_modules/.rebuild-review/R-001.before3` → `unchanged`, exit 0.
- Parser: `review-verdict.mjs node_modules/.rebuild-review/R-001.reply3 <ticket.md>` → `consistent`, exit 0.
- Verdict: PASS. AC-1 to AC-9 met; the round-2 fix is in both comments; one note, not blocking.

| # | Finding | Kind | Decision |
|---|---|---|---|
| 1 | `limen status` ends with an unhandled ENOTDIR in a project whose `.agents` or `.agents/limen` is a regular file: the "any other `lstat` error propagates" choice also covers the `TRACKED` paths (`src/project/leftovers.ts:58`) | note · proven | accepted, no code change: `limen init` always makes `.agents/limen/` a directory, and T-01 wants the failure loud; the deviation line of `outcome.md` now names the `TRACKED` paths too |

Taste questions answered by the reviewer: T-29 (each test fails for one reason), T-30 (every new comment says why;
the round-2 fix is in both places), T-40 (no owner step), T-41 (no new command), T-18 (no banned word in the new
text).
