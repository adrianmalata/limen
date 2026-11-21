<!-- PL: Recenzje ticketu R-019 (jeden moduł blokad src/lock.ts z tożsamością procesu i czekaniem do 60 s). Runda 1
(noc 20/21.11): PASS z sześcioma uwagami; dwie idą do poprawek świeżego implementera (boot id w rekordzie blokady
sprawdzany jak UUID, jedna linia nagłówka w test/cli/ticket.test.ts), cztery odrzucone z powodem. Runda 2: PASS z
czterema uwagami, wszystkie poprawione w drugiej, ostatniej rundzie (born do 20 cyfr, jedna definicja blokady polla,
dwa komentarze, nagłówek testu). Runda 3: PASS z czterema uwagami; jedną (zdanie w plan.md) poprawiła sesja główna,
trzy w kodzie i testach czekają na decyzję Adriana (pytanie nocne Q-9). Stan: zamknięta. -->

# R-019 review

## Round 1 (2026-11-21, night run)

- Before: `review-guard.mjs compare --git` after the implementer → "the implementer's run is within its limits",
  exit 0; the main session's `gate.mjs` → exit 0, 427/427; `fails-before.mjs` → exit 0 (eight files), recorded in
  `outcome.md` before the review.
- Reviewer: `rebuild-reviewer` with the ticket, `node_modules/.rebuild-review/R-019.diff` and `taste.md`;
  `review-verdict.mjs` → "consistent", exit 0; `review-guard.mjs compare` → "unchanged", exit 0.
- Verdict: **PASS**. AC-1–AC-15 met (AC-4's `github poll` tests judged by the gate's run, as the ticket's Risk says).

| # | Finding (short) | Decision |
|---|---|---|
| 1 | `recordOf` accepts any string as `bootId`, while `parseBootId` accepts only a UUID, so a lock file a job can write puts text of any length into the `LOCK_TIMEOUT` and `LOCK_LOST` messages (`src/lock.ts`) | fix |
| 2 | `github disconnect` removes the binding before it takes the lock; its `LOCK_TIMEOUT` no longer says the binding is already gone (`src/commands/github.ts`) | rejected |
| 3 | After a failed operation, `releaseAfterFailure` swallows every release failure, `LOCK_LOST` included, with no record (T-01) (`src/lock.ts`) | rejected |
| 4 | A taker that dies after `moveAside` and before its claim's release leaves `<lock>.takeover.<token>` for good (guessed) | rejected |
| 5 | `LOCK_TIMEOUT`'s `next` is empty, unlike Change 1; recorded as night default 3, for Adrian to confirm | no change |
| 6 | `test/cli/ticket.test.ts` opens with two header comment lines, where T-29 (5) asks for one | fix |

Fixes (for a fresh implementer, `ticket.md` → `## Decisions`): 1, 6.

Rejected, with reasons:
- 2: exit 3 is the class "transient, safe to retry" (T-02), and running `github disconnect` again is safe: the
  binding's removal is idempotent and the lock's owner is named in the message. Moving the removal under the lock
  changes the command's order of effects beyond this ticket's `## Change`.
- 3: Change 1 says "An error of the operation passes through unchanged", as `withSeatLock` did at `HEAD`; the swallowed
  release after a failure is the one `catch {` moved from `src/project/seat.ts`, so T-01's ratchet (R-082) still counts
  it, and recording side failures is R-082's.
- 4: guessed, and the reviewer notes the leftovers block nothing; a dead claim is itself a lock of the module, so a
  later takeover of the same token is taken over in turn. Cleaning litter is the sweep's (R-031, R-032).
- 5: no change; `ticket.md` → `## Decisions` (2026-11-21, night defaults) records it.

## Round 2 (2026-11-21, night run)

- Before: a fresh `rebuild-implementer` made fixes 1 and 6 (`BOOT_ID`, the new `BAD_DATA` test failing before the
  fix: "the operation ran under a lock that took over the damaged record"); `review-guard.mjs compare --git` → "within
  its limits", exit 0; the main session's `gate.mjs` → exit 0, 428/428; `fails-before.mjs` → exit 0 (the same eight
  files).
- Reviewer: a fresh `rebuild-reviewer` with the same three paths; `review-verdict.mjs` → "consistent", exit 0;
  `review-guard.mjs compare` → "unchanged", exit 0.
- Verdict: **PASS**. AC-1–AC-15 met.

| # | Finding (short) | Decision |
|---|---|---|
| 1 | `born` still accepts any number of digits and goes into the `LOCK_TIMEOUT` and `LOCK_LOST` messages, so round 1's "not text of any length" does not hold yet (`src/lock.ts`) | fix |
| 2 | Two new comments say "HEAD", which turns false at R-019's commit (T-30) (`test/cli/github.test.ts`, `test/lock.test.ts`) | fix |
| 3 | `test/platform/linux.test.ts` opens with two header comment lines (T-29 (5)), as round 1's finding 6 was | fix |
| 4 | The poll lock is defined twice, by the poller and by `github disconnect` (T-25) (`src/commands/github.ts`, `src/integrations/github-poller.ts`) | fix |

Fixes (for a fresh implementer, `ticket.md` → `## Decisions`): 1–4. This is the second and last round of fixes
(`## Agents`, step 6).

## Round 3 (2026-11-21, night run)

- Before: a fresh `rebuild-implementer` made fixes 1–4 (`born` at most 20 digits, with a test failing before the fix:
  "the operation ran under a lock that took over the damaged record"; `withPollLock` in the poller module, called by
  `github disconnect`; the two comments; the header line); `review-guard.mjs compare --git` → "within its limits",
  exit 0; the main session's `gate.mjs` → exit 0, 429/429; `fails-before.mjs` → exit 0 (the same eight files).
- Reviewer: a fresh `rebuild-reviewer` with the same three paths; `review-verdict.mjs` → "consistent", exit 0;
  `review-guard.mjs compare` → "unchanged", exit 0.
- Verdict: **PASS**. AC-1–AC-15 met.

| # | Finding (short) | Decision |
|---|---|---|
| 1 | `hasCode` (`src/lock.ts`) is a renamed copy of the adapter's `isCode` (`src/platform/linux.ts`), against T-25 (2) | not fixed: Q-9 |
| 2 | The `LOCK_LOST` test asserts the code but not the class `environment` (T-02's Check) (`test/lock.test.ts`) | not fixed: Q-9 |
| 3 | A new comment points to "the ticket's Migration" without naming R-019 (T-30 (2)) (`test/lock.test.ts`) | not fixed: Q-9 |
| 4 | Change 8 says the D-031 sentence goes; the diff replaced it with a history sentence (`plan.md` → `## Agents`, step 4) | fixed by the main session |

The two rounds of fixes are used, so notes 1–3, which touch code and tests, are not fixed in R-019; whether they get a
fix ticket is `.night/questions.md` → Q-9, with no ticket blocked (the precedent of R-011's round 3, Q-6 and D-027).
Note 4 touches only the main session's sentence in `plan.md`, which it removed, as Change 8 says.
