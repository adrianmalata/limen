<!-- PL: Recenzje ticketu R-020 (adapter platformy Linux w src/platform/ i deklarowane wymagania systemowe sprawdzane
przy limen init). Runda 1: PASS z ośmioma uwagami; sześć idzie do poprawek wznowionego implementera (sonda gita przez
--git-dir zamiast -C, test sondy ps, jednakowe next dla NODE_VERSION, docs/setup.md, typowany błąd tylko przy starcie
gita, podział testu parsera ps), dwie odrzucone z powodem (trzecia kopia wyszukiwania w PATH do R-049, TypeError
blokady seata znika w R-019). Runda 2: FAIL z dwiema uwagami blokującymi, obie w outcome.md (test, który przechodzi
przy HEAD, i przebieg check.mjs na obecnym drzewie), poprawione przez sesję główną. Runda 3: PASS bez uwag. Stan: zamknięta. -->

# R-020 review

## Round 1 (2026-11-20, day session `limen-rebuild-12`)

- Before: `review-guard.mjs compare --git` after the implementer → "within its limits", exit 0 (twice: before and
  after D-060's Change 7, each after a new snapshot); the main session's `gate.mjs` → exit 0, 394/394, no shim;
  `fails-before.mjs` → exit 0 (eight files), recorded in `outcome.md` before the review.
- Reviewer: `rebuild-reviewer` with the ticket, `node_modules/.rebuild-review/R-020.diff` and `taste.md`;
  `review-verdict.mjs` → "consistent", exit 0; `review-guard.mjs compare` → "unchanged", exit 0.
- Verdict: **PASS**. AC-1–AC-9 met.

| # | Finding (short) | Decision |
|---|---|---|
| 1 | The git probe reaches its bare repository with `-C`, so under `safe.bareRepository=explicit` a git with `-z` is refused as `MISSING_FEATURE` (`src/platform/requirements.ts`) | fix |
| 2 | The `ps` probe has no test of its own | fix |
| 3 | `NODE_VERSION` has two `next` values and two messages: `bin/limen` and `nodeFailure` | fix |
| 4 | `onPath` is a third copy of the PATH lookup, beside the engine's and Herdr's (T-25) | rejected |
| 5 | `docs/setup.md` lists only Node and Git and old versions of Pi and Herdr | fix |
| 6 | `removeAbandonedLock` ends `withSeatLock` with a `TypeError` for a pid `kill(2)` rejects (`src/project/seat.ts`) | rejected |
| 7 | Every `spawnSync` error of the central `git()` becomes `MISSING_TOOL`, also one after git started, such as `EPIPE` (`src/project/git.ts`) | fix |
| 8 | The `ps` parser test covers several mechanisms (T-29 (3)) (`test/platform/linux.test.ts`) | fix |

Fixes (for the resumed implementer, `ticket.md` → `## Decisions`): 1, 2, 3, 5, 7, 8.

Rejected, with reasons:
- 4: the three lookups serve three owners (the requirements, the engine's preflight, Herdr's binary); R-049 merges
  the engine's `pi` check into the declared requirements, where one lookup can serve all three, and `outcome.md` →
  Open points keeps it. Merging now would change `src/runtime/engine.ts` and `src/integrations/herdr.ts`, outside
  this ticket's `## Change`.
- 6: R-019 (next in the night's order) replaces the seat lock with the lock module of D-056, whose owner file holds a
  checked identity; a fix here would be rewritten within the day. The deviation is in `outcome.md` (5).

## Round 2 (2026-11-20, day session `limen-rebuild-12`)

- Before: `review-guard.mjs compare --git` after the resumed implementer (a new snapshot after the main session's
  edit of `ticket.md`) → "within its limits", exit 0; the main session's `gate.mjs` → exit 0, 401/401, skipped 0;
  `fails-before.mjs` → exit 0 (eight files), recorded in `outcome.md` before the review.
- Reviewer: the round 1 `rebuild-reviewer`, resumed with the new diff; `review-verdict.mjs` → "consistent", exit 0;
  `review-guard.mjs compare` → "unchanged", exit 0.
- Verdict: **FAIL**. AC-5 not met, AC-8 unknown; the other criteria met; round 1's fixes hold.

| # | Finding (short) | Decision |
|---|---|---|
| 1 | AC-5: the new `safe.bareRepository` test passes at `HEAD`, and `## Fails before` does not name it or say why | fix (main session, `outcome.md`) |
| 2 | AC-8: the recorded `check.mjs` run predates the current tree | fix (main session, `outcome.md`) |
| 3 | `outcome.md` → `## Done` item 7 gives the round 1 test counts | fix (main session, `outcome.md`) |
| 4 | Fix 3 edits `bin/limen`, which `## Out of scope` names, and `## Deviations` does not list it | fix (main session, `outcome.md`) |

All four touch only `outcome.md`, the main session's file (protocol step 7), so the main session fixed them: the two
tests that pass at `HEAD` (the `safe.bareRepository` and `E2BIG` tests) with their reasons, the `ps` refusal test's
note, a `check.mjs` run on the current tree (0 errors, 143 PL summaries), the counts of item 7 and deviation 8. A FAIL
round needs another round (D-053 (2) covers PASS rounds only): round 3 by the same reviewer.

## Round 3 (2026-11-20, day session `limen-rebuild-12`)

- Before: the main session's fixes of round 2 in `outcome.md` only; the code is unchanged since round 2 (gate 401/401).
- Reviewer: the same `rebuild-reviewer`, resumed with the new diff; `review-verdict.mjs` → "consistent", exit 0;
  `review-guard.mjs compare` → "unchanged", exit 0.
- Verdict: **PASS**. AC-1–AC-9 met. Findings: none.
