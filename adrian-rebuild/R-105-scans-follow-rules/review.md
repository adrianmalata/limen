<!-- PL: Recenzja ticketu R-105 (skany T-04 i T-26 idą za tym, co nazywają ich reguły). Runda 1 (28.11, noc): PASS,
kryteria AC-1–AC-15 spełnione, pięć uwag bez znaleziska blokującego; trzy (rozdzielenie dwóch testów porównania,
wspólne pomocniki testów, pełniejsze formy czekania i alias w skanach) idą do poprawki jako F1–F3 w decyzji 11, jedną
(nieaktualna notatka R-102) poprawiła główna sesja, jedna zostaje bez zmiany. Runda 2: PASS, G1–G2 (osobny przypadek
każdej nazwy blokady, `OTHER_BOOT` z `test/plant.ts`); runda 3: PASS, uwagę o `outcome.md` poprawiła główna sesja.
Stan: recenzja zamknięta po trzech rundach. -->

# R-105 review

## Round 1 (2026-11-28, night run)

- Before: the implementer's run → `review-guard.mjs compare --git` → "within its limits", exit 0. The main session's
  `gate.mjs --out node_modules/.rebuild-review/R-105.gate` → exit 0, 1514/1514 (349.2 s); `fails-before.mjs` → exit 0
  (nine test files). The implementer's four night-default proposals went into `ticket.md` → Decision 10.
- Reply: `rebuild-reviewer` with the ticket, `node_modules/.rebuild-review/R-105.diff` and `taste.md`;
  `review-guard.mjs compare` → "unchanged", exit 0; `review-verdict.mjs` → "consistent", exit 0.
- Verdict: **PASS**. AC-1–AC-15 met; five notes, no blocking finding. Taste questions: T-29, yes but for the two
  comparison fixtures (note 1); T-30, the new comments say why.

| # | Finding (short) | Decision |
|---|---|---|
| 1 | note · proven: the two comparison fixtures each check `unlistedTransitions` and `unlistedWaits` in one `deepEqual` (T-29 (3)) | fix: F1 (`ticket.md` → Decision 11) |
| 2 | note · observed: at `HEAD` the wait scan test fails on two differences, both from the moves not yet made | no change: both come from the one mechanism the test checks, the scan over the moved modules |
| 3 | note · proven: `own()` and `OTHER_BOOT` exist identically in `test/runtime/reap.test.ts` and `test/runtime/liveness.test.ts` (T-25 (2)) | fix: F2, defined once in `test/plant.ts` |
| 4 | note · observed: a namespace import of `node:timers/promises`, the specifier without `node:`, its `setInterval` or `scheduler.wait`, and an aliased `startOutsideJob` pass the scans | fix: F3, every import from `timers/promises` counts, and the launch scan follows the alias |
| 5 | note · observed: Change 5's correction of the stale R-102 note is not in the tree yet | fixed by the main session in `plan.md` → `## Tickets` notes (Change 5 gives it to the main session) |

A round of fixes follows (tests, D-053 (2)): a fresh `rebuild-implementer` (D-026) with `ticket.md` and this file.

## Round 2 (2026-11-28, night run)

- Before: a fresh `rebuild-implementer` made F1–F3 (`DONE`; the two new fixtures failed on the scan before the
  round); `review-guard.mjs compare --git` → "within its limits", exit 0. The main session's `gate.mjs --out
  node_modules/.rebuild-review/R-105.gate` → exit 0, 1518/1518 (348.1 s); `fails-before.mjs` → exit 0 (the same nine
  files).
- Reply: `rebuild-reviewer` with the ticket, the new `node_modules/.rebuild-review/R-105.diff` and `taste.md`;
  `review-guard.mjs compare` → "unchanged", exit 0; `review-verdict.mjs` → "consistent", exit 0.
- Verdict: **PASS**. AC-1–AC-15 met; three notes, no blocking finding. Taste questions: T-29, yes but for the lock
  fixture's name (note 1); T-30, yes.

| # | Finding (short) | Decision |
|---|---|---|
| 1 | note · proven: the lock fixture imports only `withLock`, so `moveLockedFolder` could leave `LOCK_WAITS` with every test passing | fix: G1 (`ticket.md` → Decision 12), one case per name |
| 2 | note · observed: `## Fails before` is from the run before round 1 | fixed by the main session: `outcome.md` names its run after round 1's gate as well |
| 3 | note · proven: a third copy of `OTHER_BOOT` stays in `test/lock.test.ts:20` | fix: G2, imported from `test/plant.ts` |

The last round of fixes follows (tests, D-053 (2)): a fresh `rebuild-implementer` (D-026) with `ticket.md` and this
file.

## Round 3 (2026-11-28, night run)

- Before: a fresh `rebuild-implementer` made G1–G2 (`DONE`; each lock case failed with its name taken out of the
  set); `review-guard.mjs compare --git` → "within its limits", exit 0. The main session's `gate.mjs --out
  node_modules/.rebuild-review/R-105.gate` → exit 0, 1519/1519 (348.3 s); `fails-before.mjs` → exit 0 (ten files, now
  with `test/lock.test.ts`).
- Reply: `rebuild-reviewer` with the ticket, the new `node_modules/.rebuild-review/R-105.diff` and `taste.md`;
  `review-guard.mjs compare` → "unchanged", exit 0; `review-verdict.mjs` → "consistent", exit 0.
- Verdict: **PASS**. AC-1–AC-15 met; one note, no blocking finding. Taste questions: T-29, yes; T-30, yes.

| # | Finding (short) | Decision |
|---|---|---|
| 1 | note · proven: `## Fails before` lists nine files from before G2; a run on the final tree names ten, with `test/lock.test.ts` | fixed by the main session (D-053 (2), `outcome.md` only): its run after round 2's gate is recorded with ten files |

The review is closed after three rounds.
