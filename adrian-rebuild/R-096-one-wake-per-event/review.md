<!-- PL: Recenzje ticketu R-096 (nadmiarowy wake testu kolejki; przyczyna w fałszywym silniku testów, D-069). Runda 1
(21.11, w dzień): PASS z trzema uwagami; dwie idą do pierwszej rundy poprawek przez wznowionego implementera (słowo
„run” w nagłówku test/fake-engine.mjs, asynchroniczny zapis do FIFO w nowym teście), trzecia jest przyjęta bez zmiany
z powodem. Pierwszą odpowiedź narzędzie review-verdict odrzuciło, bo AC-8 i AC-9 stały tylko w `## Decisions`; po
przeniesieniu ich do `## Acceptance` ta sama odpowiedź jest spójna. Runda 2: PASS z jedną uwagą o liczbie przebiegów
bramki w outcome.md, poprawioną przez sesję główną. Stan: zamknięta. -->

# R-096 review

## Round 1 (2026-11-21, by day)

- Before: the implementer's run (with D-068 and D-069) → `review-guard.mjs compare --git` "within its limits",
  exit 0; the main session's `gate.mjs` → 599/599, fail 0; `fails-before.mjs test/fake-engine.test.ts` → exit 0,
  recorded in `outcome.md` → `## Fails before` before the review.
- Reviewer: `rebuild-reviewer` with the ticket, `node_modules/.rebuild-review/R-096.diff` and `taste.md`;
  `review-guard.mjs compare` → "unchanged", exit 0.
- `review-verdict.mjs` → exit 1 on the first check: the reply answered AC-1–AC-9, while `ticket.md` → `## Acceptance`
  held AC-1–AC-7, since D-068 and D-069 had put AC-8, AC-9 and AC-4's new form in `## Decisions`. The main session
  moved them into `## Acceptance` (`ticket.md` → `## Decisions`, dated), with no change of their content, and the same
  reply then checked "consistent", exit 0. The round-2 review runs on the corrected ticket.
- Verdict: **PASS**. AC-1–AC-9 met.

| # | Finding (short) | Decision |
|---|---|---|
| 1 | note · proven: T-18, "run" names two things in `test/fake-engine.mjs`: the header's "one transcript line per run in --session-dir" (one line per engine process) and the new `run()` (Pi's agent run, several per process) | fix (T-18): the header names the engine process |
| 2 | note · observed: `test/fake-engine.test.ts` releases the held turn with a synchronous `writeFileSync` to the FIFO, which blocks the test process with no timeout able to fire if the engine has no reader; `release()` in `test/plant.ts` uses the async `writeFile` | fix: the same async write as `release()`; a few characters, and a hung gate is a failure without its cause |
| 3 | note · observed: the new test sees one settle per run only through the hook's confirm-and-resend rule, not by counting `agent_settled` events, so a change to that rule would change what it proves about the fake engine | no change: D-069 asks the test to make the sequence of the failure happen, and the hook's rule is the consumer whose behaviour the fake engine must model; a change to that rule runs this test too and must keep it green or rewrite it |

Fixes (for the resumed implementer, `ticket.md` → `## Decisions`; the first round of fixes): 1 and 2. Both change a
test file, so they get a round (D-053 (2)).

## Round 2 (2026-11-21, by day)

- Before: the resumed implementer's first round of fixes → `review-guard.mjs compare --git` "within its limits",
  exit 0; the main session's `gate.mjs` → 599/599, fail 0; `fails-before.mjs test/fake-engine.test.ts` → exit 0,
  recorded in `outcome.md` before the review.
- Reviewer: a fresh `rebuild-reviewer` with the corrected ticket, the new `node_modules/.rebuild-review/R-096.diff`
  and `taste.md`; `review-guard.mjs compare` → "unchanged", exit 0; `review-verdict.mjs` → "consistent", exit 0.
- Verdict: **PASS**. AC-1–AC-9 met.

| # | Finding (short) | Decision |
|---|---|---|
| 1 | note · proven: `outcome.md` → `## Cause` says the change took 7 of the 10 gate runs, while the round of fixes added one more implementer gate run, so the count is 8, still within the limit | fixed by the main session (D-053 (2)): the sentence says 8 of 10 and that the main session's own gate runs belong to the protocol, not to (a)'s limit |

The review is closed: round 2 is PASS and its one finding touches only `outcome.md`, so no further round runs.
