<!-- PL: Recenzja ticketu R-100 (jedna definicja czasu ISO, reguły 429, sprawdzenia kodu błędu i listy folderów jobów).
Runda 1 (noc 22/23.11, przebieg 3 `night.mjs`): pierwsza odpowiedź odrzucona przez `review-verdict.mjs` za formę,
druga od świeżego recenzenta: PASS z trzema uwagami. Dwie uwagi poprawiła sesja główna w `outcome.md` (trzecia różnica
zachowania wdrożenia i łączny wynik `fails-before.mjs`), a tłumik „split pending” zostaje dla zapadki R-082, jak w
R-020, R-028 i R-035. Stan: recenzja zamknięta. -->

# R-100 review

## Round 1 (2026-11-23, night, run 3 of `night.mjs`)

- Before: the implementer's run → `review-guard.mjs compare --git` "within its limits", exit 0; the main session's
  `gate.mjs` → exit 0, 946 tests, 946 pass, 0 fail (tsc and Biome first, in `npm run check`); `fails-before.mjs` →
  exit 0 (four files in one run at `HEAD` `017a228`), recorded in `outcome.md` → `## Fails before` before the review.
- First reply: `rebuild-reviewer` with the ticket, `node_modules/.rebuild-review/R-100.diff` and `taste.md`;
  `review-guard.mjs compare` → "unchanged", exit 0; `review-verdict.mjs` → exit 1, rejected for its form (AC-10's
  answer ran over four bullet lines, so AC-10 read as missing). The review ran again with the tree unchanged.
- Second reply: a fresh `rebuild-reviewer` with the same three paths; `review-guard.mjs compare` → "unchanged", exit 0;
  `review-verdict.mjs` → "consistent", exit 0.
- Verdict: **PASS**. AC-1–AC-10 met (AC-7–AC-9 on the records); three notes. The first reply's three notes were the
  same three.

| # | Finding (short) | Decision |
|---|---|---|
| 1 | note · proven: T-27 (1) asks a ticket that changes a function with a debt suppression to remove it; `claimRecovery` changes one condition and keeps its "split pending" `biome-ignore`, listed under Open points rather than Deviations (`src/runtime/recovery.ts:10`, `:27`) | no change: the same note in R-020, R-028 (round 1, finding 7) and R-035 left it to R-082's ratchet, which the plan gives the suppressions; the ticket splits nothing, and `outcome.md` → Open points 1 names it |
| 2 | note · proven: `seat/deploy.ts` now gets its job folders sorted (`jobFolderNames`), a third difference beside the two that `outcome.md` (d) names; only the order of the running-jobs list changes (`src/job/record.ts:317-322`) | fixed by the main session in `outcome.md` (d) (D-053 (2): a PASS round whose fix touches only `outcome.md`) |
| 3 | note · proven: `test/system-error.test.ts` passes at `HEAD`, yet the `fails-before.mjs` line names it, because the tool runs every changed file in one call and reports the combined exit (`adrian-rebuild/tools/fails-before.mjs:75-86`) | fixed by the main session in `outcome.md` → `## Fails before` (D-053 (2)); the ticket's (e) does not require this file to fail |

Taste answers: T-29 yes, each new test checks one mechanism and fails for one reason; T-30 yes, the new comments give
reasons and every identifier resolves.

No fixes of code or tests; the review is closed.
