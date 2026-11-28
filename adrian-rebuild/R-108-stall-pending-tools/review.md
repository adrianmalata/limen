<!-- PL: Recenzja ticketu R-108 (reguła zawieszenia śledzi każde oczekujące narzędzie wiadomości). Runda 1 (28.11,
noc): PASS, kryteria AC-1–AC-10 spełnione, sześć uwag bez znaleziska blokującego; dwie (jedna definicja tekstu
wywołania narzędzia, nagłówek pliku testów jak przy HEAD) idą do poprawki jako F1–F2 w decyzji 9, cztery zostają bez
zmiany z powodem. Runda 2: PASS, uwagę o `outcome.md` poprawiła główna sesja, nagłówki dwóch plików testów idą do
R-083. Stan: recenzja zamknięta po dwóch rundach. -->

# R-108 review

## Round 1 (2026-11-28, night run)

- Before: the implementer's run → `review-guard.mjs compare --git` → "within its limits", exit 0. The main session's
  `gate.mjs --out node_modules/.rebuild-review/R-108.gate` → exit 0, 1561/1561 (349.8 s); `fails-before.mjs` → exit 0
  (`test/runtime/stalled-tool.test.ts`, `test/runtime/wrapper.test.ts`, `test/u5-engine-stream.test.ts`).
- Reply: `rebuild-reviewer` with the ticket, `node_modules/.rebuild-review/R-108.diff` and `taste.md`;
  `review-guard.mjs compare` → "unchanged", exit 0; `review-verdict.mjs` → "consistent", exit 0.
- Verdict: **PASS**. AC-1–AC-10 met; six notes, no blocking finding. Taste questions: T-29, each new test fails for one
  reason; T-30, the comments in the code say why.

| # | Finding (short) | Decision |
|---|---|---|
| 1 | note · proven: an end whose id names no pending call does not restart the window | no change: Pi 1.5.1 sends the same `toolCallId` on a call's start and end, so it cannot happen; `outcome.md` → Open point 3 |
| 2 | note · observed: the wrapper test would pass if an end removed nothing, since the bash call is the last started either way | no change: the wrapper test checks one mechanism, that an end no longer turns the rule off (it fails at `HEAD` with kind `timeout`); removal by id is the unit tests' mechanism in `test/runtime/stalled-tool.test.ts`, one test each, and Change 4 fixes the fake's order |
| 3 | note · observed: the text that joins a tool's name and detail is written in two modules (T-25 (2)) | fix: F1 (`ticket.md` → Decision 9), one function in `src/runtime/stream.ts` |
| 4 | note · observed: `runInternalJob` keeps its two "split pending" suppressions (T-27 (1)) | no change: Change 3 and fact 6 leave them to R-082, as R-028, R-035 and R-036 did; `outcome.md` → Open point 4 |
| 5 | note · observed: the opening comment of `test/runtime/wrapper.test.ts` grows by a line (T-29 (5)) | fix: F2, back to its text at `HEAD` |
| 6 | note · observed: an empty `toolCallId` counts as no id | no change: Decision 4's fail-open rule covers it, the parser test checks it, `outcome.md` → Deviations 1 |

A round of fixes follows (code and tests, D-053 (2)): a fresh `rebuild-implementer` (D-026) with `ticket.md` and this
file.

## Round 2 (2026-11-28, night run)

- Before: a fresh `rebuild-implementer` made F1–F2 (`DONE`; F1's unit test failed at import before the change);
  `review-guard.mjs compare --git` → "within its limits", exit 0. The main session's `gate.mjs --out
  node_modules/.rebuild-review/R-108.gate` → exit 0, 1562/1562 (347.1 s); `fails-before.mjs` → exit 0 (the same three
  files).
- Reply: `rebuild-reviewer` with the ticket, the new `node_modules/.rebuild-review/R-108.diff` and `taste.md`;
  `review-guard.mjs compare` → "unchanged", exit 0; `review-verdict.mjs` → "consistent", exit 0.
- Verdict: **PASS**. AC-1–AC-10 met; two notes, no blocking finding. Taste questions: T-29, yes, F2 done; T-30, yes.

| # | Finding (short) | Decision |
|---|---|---|
| 1 | note · observed: the opening comments of `test/u5-engine-stream.test.ts` and `test/runtime/stalled-tool.test.ts` grow from 2 lines to 3, the form F2 reverted | no change in this ticket: T-29 (6) gives the header's rewrite to the ticket that rewrites the test file; the note goes to R-083 in `plan.md` → `## Tickets`, which renames the stream's test file (Decision 7) |
| 2 | note · observed: `## Fails before` records no main-session run on the final tree | fixed by the main session (D-053 (2), `outcome.md` only): its run after round 1's gate is recorded, with why each file fails at `HEAD` |

The review is closed after two rounds.
