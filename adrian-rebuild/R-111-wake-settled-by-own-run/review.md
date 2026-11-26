<!-- PL: Recenzja ticketu R-111 (budzenie rozliczane tylko przez własny bieg, jeden starter na bezczynny sweep,
licznik budzeń, które nie weszły do biegu, atrapa odtwarzająca E-21). Runda 1 (26.11, w dzień): PASS przy wszystkich
kryteriach spełnionych, z czterema uwagami; trzy idą do rundy poprawek F1–F3 w testach (`ticket.md` → `## Decisions`
9), jedna bez zmian z powodem. Runda 2: PASS z dwiema uwagami, jedna bez zmian z powodem, druga do punktów otwartych
`outcome.md`; bez rundy 3. Stan: recenzja zamknięta. -->

# R-111 review

## Round 1 (2026-11-26, by day, `limen-rebuild-41`)

- Before: the implementer's run → `review-guard.mjs compare --git` → "within its limits", exit 0; the main session's
  `gate.mjs` → exit 0, 1286 tests, 1286 pass (299.8 s); `fails-before.mjs test/fake-engine.test.ts` → exit 0 (AC-5);
  `fails-before.mjs test/hook/wake.test.ts test/fake-engine.mjs` → exit 0 (AC-6); AC-7–AC-10 at the working tree as
  the ticket expects; `npx tsc --noEmit`, `npx biome check --error-on-warnings .` and `check.mjs` exit 0.
- Reply: `rebuild-reviewer` with the ticket, `node_modules/.rebuild-review/R-111.diff` and `taste.md`;
  `review-guard.mjs compare` → "unchanged", exit 0; `review-verdict.mjs` → "consistent", exit 0.
- Verdict: **PASS**. AC-1–AC-14 met; four notes, no blocking finding.

| # | Finding (short) | Decision |
|---|---|---|
| 1 | note · observed: the A-089 test can hang instead of failing: `jobFor` writes the done record, then `notify/ready`, then the subscriber, so a timer sweep between the last two writes sends a fallback wake, and `heard()` never holds (`test/hook/wake.test.ts:307-310`, `:540`, `:490-492`) | fix (F1): a hang in the gate stops a ticket (D-029), and the night starts after this ticket |
| 2 | note · observed: the backstop test never fires `before_agent_start` or `agent_settled`, so the bound's half "no run started or settled for `CLAIM_STALE_MS`" (`hook/wake.ts:776`) is never exercised | fix (F2): Change item 2 names both halves, and one of them has no test |
| 3 | note · observed: the A-089 test's name says the wakes "each enter their own run", but it asserts only the wake counts and `notify/unconfirmed` (`test/hook/wake.test.ts:526`, `:545-548`) | fix (F3): the name is a sentence about the behaviour it checks (T-29 (2)) |
| 4 | note · observed: `fails-before.mjs` prints only the last 40 lines, so AC-6's output does not name the A-089 test | no change: `outcome.md` → `## Fails before` holds the implementer's run of all 19 tests at HEAD (3 fail: A-089, A-090 and the backstop); the tool's tail goes to `outcome.md` → `## Open points` |

## Round 2 (2026-11-26, by day, `limen-rebuild-41`)

- Before: the resumed implementer's fixes F1–F3 (`ticket.md` → `## Decisions` 9) → `review-guard.mjs compare --git` →
  "within its limits", exit 0; the main session's `gate.mjs` → exit 0, 1287 tests, 1287 pass (298.9 s);
  `fails-before.mjs test/hook/wake.test.ts test/fake-engine.mjs` → exit 0 (AC-6).
- Reply: `rebuild-reviewer` with the ticket, the new `node_modules/.rebuild-review/R-111.diff` and `taste.md`;
  `review-guard.mjs compare` → "unchanged", exit 0; `review-verdict.mjs` → "consistent", exit 0.
- Verdict: **PASS**. AC-1–AC-14 met; two notes, no blocking finding. The round is closed by the main session's own
  edits of `outcome.md` and `plan.md` (D-053 (2)), so there is no round 3.

| # | Finding (short) | Decision |
|---|---|---|
| 1 | note · observed: the new run's-half backstop test waits on an `agent_settled`, so at HEAD it fails because a foreign settle counts the wake, not for the missing run bound alone (`test/hook/wake.test.ts:706`) | no change: the test checks what its name says ("not counted while a run settled less than 30 s ago") on the changed code, and the implementer's mutation proof (the run half of `hook/wake.ts:776` removed → this test fails, the send half's test passes) shows it fails for that bound alone there; a settle, not a start, is the case its name and Change item 2 name |
| 2 | note · guessed: the FIFO write that releases the held settle has no bound of its own if the engine died (`test/hook/wake.test.ts:595`) | to `outcome.md` → `## Open points` 9: the test's `--test-timeout` (180 s) ends it as a failure, not a silent pass; R-083's scan covers waiting in tests (T-31 (4)) |
