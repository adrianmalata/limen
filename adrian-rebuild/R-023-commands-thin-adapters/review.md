<!-- PL: Recenzje ticketu R-023 (komendy jako cienkie adaptery nad operacjami domenowymi, jeden moduł uruchamiający
własne CLI Limena, słowa komend tylko w parserze, poprawne `next` dla `jobs`). Runda 1 (21.11, w dzień): PASS z pięcioma
uwagami; wszystkie idą do pierwszej rundy poprawek przez wznowionego implementera (kolejność pytania i notatek `land`
w terminalu, dwa zdania dokumentacji szersze niż kod, test i komentarz `dropsDashes`, `gitText` do src/project/git.ts,
powód w `## Fails before`). Runda 2: FAIL z jednym znaleziskiem blokującym (nowy test `spawn` przechodzi przy HEAD,
a `## Fails before` go nie wymienia) i jedną uwagą do docs/commands.md; obie w drugiej i ostatniej rundzie poprawek.
Runda 3: PASS bez uwag. Stan: zamknięta. -->

# R-023 review

## Round 1 (2026-11-21, by day)

- Before: the implementer's `BLOCKED` under D-029 (its first gate failed once on the unchanged "a held gate queues jobs
  by priority …"), settled by D-067 (1): 10 of 10 alone on this tree and 10 of 10 at `HEAD` passed; the implementer's
  second gate → 586/586. `review-guard.mjs compare --git` after each of its two runs → "the implementer's run is
  within its limits", exit 0; the main session's `gate.mjs` → 586/586, fail 0; `fails-before.mjs` → exit 0, nine files
  fail at HEAD, recorded in `outcome.md` → `## Fails before` before the review.
- Reviewer: `rebuild-reviewer` with the ticket, `node_modules/.rebuild-review/R-023.diff` and `taste.md`;
  `review-guard.mjs compare` → "unchanged", exit 0; `review-verdict.mjs` → "consistent", exit 0.
- Verdict: **PASS**. AC-1–AC-10 met.

| # | Finding (short) | Decision |
|---|---|---|
| 1 | note · proven: in a terminal, `limen land` asks its confirm question before the lines the owner reads to decide (the uncommitted-files note, the ticket check's warn lines, the test-line cap line), because they go to `out` and the wrapper prints them after the answer (`src/job/landing.ts`, `src/main.ts`) | fix: the moved functions keep their behaviour (AC-10); the lines come before the question, within D-061 (3) |
| 2 | note · proven: `docs/commands.md` says only `limen picture serve` prints while it runs, and `CONTRIBUTING.md` calls every file of `src/commands` a thin adapter, while the commands with `movedBy` still print as they go and keep their logic | fix: both say that the commands with `movedBy` are the exception until their tickets move them |
| 3 | note · observed: the drop of lone `--` words from `spawn`'s task moved into the parser field `dropsDashes`, with no test at HEAD or now; the comment at `src/job/spawning.ts` says the shared parser drops them, which holds only for the CLI path | fix: a test of the CLI path, and the comment says where the drop happens |
| 4 | note · proven: T-25 (2), `gitText`, a git primitive with I/O, is exported from `src/project/ticket-check.ts` and imported by `src/job/landing.ts`, while `src/project/git.ts` owns that concept | fix |
| 5 | note · proven: `outcome.md` → `## Fails before` names the four new fixture tests of `test/structure.test.ts` as passing at HEAD without the reason AC-7 asks for | fix: the reason (they run the test file's own scan functions on synthetic text, so they do not depend on `src/`) |

Fixes (for the resumed implementer, `ticket.md` → `## Decisions`; the first round of fixes): 1–5. Findings 1, 3 and 4
change code and tests, so they get a round (D-053 (2)).

## Round 2 (2026-11-21, by day)

- Before: the resumed implementer's first round of fixes (Fix 1–Fix 5) → `review-guard.mjs compare --git` "within its
  limits", exit 0; the main session's `gate.mjs` → 588/588, fail 0; `fails-before.mjs` → exit 0 (eleven files),
  recorded in `outcome.md` before the review.
- Reviewer: a fresh `rebuild-reviewer` with the ticket, the new `node_modules/.rebuild-review/R-023.diff` and
  `taste.md`; `review-guard.mjs compare` → "unchanged", exit 0; `review-verdict.mjs` → "consistent", exit 0.
- Verdict: **FAIL**. AC-1–AC-6 and AC-8–AC-10 met; AC-7 not met.

| # | Finding (short) | Decision |
|---|---|---|
| 1 | blocking · proven: AC-7, the new test of Fix 3 (`test/cli/spawn.test.ts`, "a spawn drops each lone -- from its task words …") passes at HEAD, and `## Fails before` neither names it nor gives the reason; the tool's line lists the file among those that "fail at HEAD" | fix: the main session confirmed it (`fails-before.mjs test/cli/spawn.test.ts` → exit 1, "pass at HEAD", 2/2): the tool's line names the files of one run that exits 1, not each file failing. `## Fails before` names the test with its reason (the drop moved from `spawn`'s own filter into the parser's `dropsDashes`, behaviour kept; the run without the field shows that the test checks the moved drop) and says how to read the tool's line |
| 2 | note · observed: `docs/commands.md` says a command prints all of its text when it ends, while in a terminal `land` writes its notes inside its confirm question, before it merges | fix: the sentence names `land`'s terminal question as carrying those lines |

Fixes (for the resumed implementer, `ticket.md` → `## Decisions`; the second and last round of fixes): 1 and 2. The
verdict is `FAIL`, so a third review round follows.

## Round 3 (2026-11-21, by day)

- Before: the resumed implementer's second round of fixes (Fix R2-1, Fix R2-2; `outcome.md` and `docs/commands.md`
  only) → `review-guard.mjs compare --git` "within its limits", exit 0; the main session's `gate.mjs` → 588/588,
  fail 0, recorded in `outcome.md` before the review; the tests are unchanged since round 2's `fails-before.mjs` run.
- Reviewer: a fresh `rebuild-reviewer` with the ticket, the new `node_modules/.rebuild-review/R-023.diff` and
  `taste.md`; `review-guard.mjs compare` → "unchanged", exit 0; `review-verdict.mjs` → "consistent", exit 0.
- Verdict: **PASS**. AC-1–AC-10 met; no findings. Its answer to T-30 names two comments that cite the criterion
  AC-10 without the ticket's ID (`src/job/landing.ts`, `test/job/landing.test.ts`), which is not an identifier kind
  of T-30 (2), so it is no finding.

The review is closed.
