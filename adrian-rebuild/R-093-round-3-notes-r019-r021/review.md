<!-- PL: Recenzje ticketu R-093 (poprawki uwag z rund 3 recenzji R-019 i R-021 oraz atomowy zapis rekordu w helperze
testów). Runda 1 (21.11, autopilot D-063 (4)): PASS z sześcioma uwagami; do poprawki przez świeżego implementera idą
dwie (kopia helpera kodu błędu `isExist` w steer-inbox.ts z listą wywołujących w nagłówku src/system-error.ts oraz
nagłówek i powtórzony setup testu hooka), zakres AC-13 (4) zapisuje sesja główna w ticket.md, a trzy pozostałe nie są
poprawiane tutaj (z powodem). Runda 2 (po poprawkach): PASS z jedną uwagą o niepełnej liście kopii sprawdzenia kodu
błędu w outcome.md, którą poprawiła sesja główna (D-053 (2)). Stan: zamknięta. -->

# R-093 review

## Round 1 (2026-11-21, by day, autopilot of D-063 (4))

- Before: `review-guard.mjs compare --git` after the implementer → "the implementer's run is within its limits",
  exit 0; the main session's `gate.mjs` → 511/511, fail 0; `fails-before.mjs` → exit 0 (five files:
  `test/cli/migrate.test.ts`, `test/hook/wake.test.ts`, `test/job/wake-text.test.ts`, `test/lock.test.ts`,
  `test/plant.test.ts`), recorded in `outcome.md` before the review.
- Reviewer: `rebuild-reviewer` with the ticket, `node_modules/.rebuild-review/R-093.diff` and `taste.md`;
  `review-guard.mjs compare` → "unchanged", exit 0; `review-verdict.mjs` → "consistent", exit 0.
- Verdict: **PASS**. AC-1–AC-13 met.

| # | Finding (short) | Decision |
|---|---|---|
| 1 | note · proven: `isExist` (`src/job/steer-inbox.ts`) is a named copy of the error-code helper's body with the code fixed to `EEXIST`; `outcome.md` calls it an inline copy | fix (T-25 (2), Change 1's "no local copy remains"); with it, the header of `src/system-error.ts` stops listing the modules that call it, a "what" that the fix itself would make stale (T-30, the reviewer's taste answer) |
| 2 | note · proven: AC-13 (4) read as the plant's helpers, as Change 8 and D-063 (1) frame it; taken literally it also covers `recorded` (`test/job/record.test.ts`) and the new `runningJob` (`test/hook/wake.test.ts`), which write into a fresh folder before any reader starts; the reading is stated only in `outcome.md` | the main session records the reading in `ticket.md` → `## Decisions`; no code change |
| 3 | note · proven: the hook's new `progressOf` has the name of the record module's private validator `progressOf`; `recordOf` already shares a name across three files | not fixed here: the duplicate-function-name scan of T-25's later ticket settles the names of all of them (`ticket.md` → `## Out of scope`); renaming one would leave its sibling `recordOf` with the same clash |
| 4 | note · proven: T-27 (1), the "split pending" suppressions of `limenWake` and `finishSweep` stay though the diff changes both | rejected by precedent: R-082 and R-083 handle the ratchet (`R-002-cut-finish-webhooks/review.md`, line 23) |
| 5 | note · proven: the hook's `start-notice` read can still throw a non-damage I/O error out of the tick | not fixed here: the code predates the diff, and Change 6's guard covers damaged files; an I/O error other than damage is an environment failure (T-02); it stays in `outcome.md` → Open points for gate 5.2 |
| 6 | note · observed: the first line of `test/hook/wake.test.ts` still says only that "a damaged record does not stop the wakes", and the new helpers `hookProject` and `startCoordinator` repeat the earlier test's setup instead of serving it | fix (T-29 (5)) |

Fixes (for a fresh implementer, `ticket.md` → `## Decisions`; the first round of fixes): 1 and 6. They change code and
tests, so they get a round (D-053 (2)).

## Round 2 (2026-11-21, by day, autopilot of D-063 (4))

- Before: the fresh implementer's run of fixes 1 and 6 → `review-guard.mjs compare --git` "within its limits", exit 0;
  the main session's `gate.mjs` → 511/511, fail 0; `fails-before.mjs` printed "fails-before: test/cli/migrate.test.ts,
  test/hook/wake.test.ts, test/job/wake-text.test.ts, test/lock.test.ts, test/plant.test.ts fail at HEAD (exit 1)",
  the same five files as before round 1.
- Reviewer: `rebuild-reviewer` with the ticket, `node_modules/.rebuild-review/R-093.diff` and `taste.md`;
  `review-guard.mjs compare` → "unchanged", exit 0; `review-verdict.mjs` → "consistent", exit 0.
- Verdict: **PASS**. AC-1–AC-13 met.

| # | Finding (short) | Decision |
|---|---|---|
| 1 | note · proven: `outcome.md` → Open points, the list kept for T-25's later ticket, leaves out three inline code checks: `errorCode` in `src/integrations/herdr.ts`, the two-code check of `src/runtime/recovery.ts:26` and `src/project/git.ts:364` | fixed by the main session in `outcome.md` (D-053 (2)); no further round |

The review is closed: round 2 is PASS, and its one finding touched only `outcome.md`.
