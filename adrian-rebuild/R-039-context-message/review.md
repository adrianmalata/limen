<!-- PL: Recenzja ticketu R-039 (wiadomość kontekstowa Limena: jeden moduł, `context.md` joba, wysyłka bez tury na
starcie sesji i ponownie po kompakcji, bez dopisywania do system promptu Pi). Runda 1 (noc 26/27.11): PASS przy
wszystkich kryteriach spełnionych, z ośmioma uwagami; cztery idą do rundy poprawek F1–F4 (podział trzech testów
według T-29 (3) i skrót nagłówka modułu według T-30 (1), `ticket.md` → `## Decisions` 15), cztery bez zmian z
powodem. Runda 2: PASS z trzema uwagami, wszystkie do ostatniej rundy poprawek G1–G3 (`ticket.md` → `## Decisions`
16). Runda 3: PASS z trzema uwagami; rundy poprawek wyczerpane, więc dwie idą do notatek R-110 i R-083, a trzecia
(plik tymczasowy w `.limen/` checkoutu) do Adriana. Stan: recenzja zamknięta. -->

# R-039 review

## Round 1 (2026-11-26, night run 1)

- Before: the implementer's run → `review-guard.mjs compare --git` → "within its limits", exit 0; the main session's
  `gate.mjs` → exit 0, 1329 tests, 1329 pass (306.7 s); `fails-before.mjs` on the seven files of AC-12 → exit 0;
  `node --test adrian-rebuild/tools/test-context-size.mjs` → exit 0, 3/3 (AC-7); AC-8 → exit 0; AC-9–AC-11 at the
  working tree as the ticket expects; `npx biome check --error-on-warnings .` and `check.mjs` exit 0.
- Reply: `rebuild-reviewer` with the ticket, `node_modules/.rebuild-review/R-039.diff` and `taste.md`;
  `review-guard.mjs compare` → "unchanged", exit 0; `review-verdict.mjs` → "consistent", exit 0.
- Verdict: **PASS**. AC-1–AC-15 met; eight notes, no blocking finding.

| # | Finding (short) | Decision |
|---|---|---|
| 1 | note · observed: the hook's "A-086: no handler of the hook returns a systemPrompt" also asserts the exact set of handled events, and at HEAD it failed on the missing `agent_start` handler (`test/hook/communication.test.ts:167-184`, `:92`) | fix (F1): one test, one mechanism (T-29 (3)) |
| 2 | note · observed: the spawn A-086 test checks in one assertion the context message whole and first in the view and an empty system prompt (`test/cli/spawn.test.ts:395-408`) | fix (F2): T-29 (3) |
| 3 | note · observed: the continue A-079 test joins the byte-for-byte carry at publication and the hook's rule that a continued session sends no second message (`test/cli/continue.test.ts:93-104`) | fix (F3): T-29 (3); Change item 7 lists both properties in one bullet, not in one test |
| 4 | note · observed: the T-38 test (a refused spawn leaves no `context.md`) passes at HEAD by construction (`test/cli/spawn.test.ts:387-392`) | no change: Change item 7 asks for it, and HEAD writes no `context.md` at all, so no test of this property can fail there; it guards the new write from now on (`outcome.md` → Deviations 8) |
| 5 | note · guessed: in a coordinator session the wake hook's `session_start` runs first, so an owed wake could make the session stream before the context message is sent (`hook/wake.ts:942-975`) | no change: unproven on Pi, `outcome.md` → `## Open points` 1 and seat step 4.2 |
| 6 | note · observed: `limen stats` counts every `custom_message` entry as a run's start, so a re-sent context message can move M-04 (`src/job/usage.ts:73-75`) | no change here: `outcome.md` → `## Open points` 2 (D-092) |
| 7 | note · observed: a job can write its own `context.md`, which a continuation carries (`src/job/continuation.ts:318-320`) | no change: the ticket's `## Risk`, gate 2 G2 (accepted risk); the running session re-sends the bytes it holds |
| 8 | note · observed: when a reference is missing, the golden test writes it into the tracked tree and then fails (`test/runtime/context-message.test.ts:62-67`) | no change: it fails closed, and no allowed command can pass a regeneration switch (D-016: no variable before a command); the implementer's night default, `outcome.md` → Deviations 3, for Adrian to confirm |

The reviewer's T-30 answer names the ten-line header of `src/runtime/context-message.ts:1-10`, which partly restates
A-086, A-037 and D-114 instead of giving the local reason and a pointer: fix (F4), T-30 (1).

## Round 2 (2026-11-26, night run 1)

- Before: a fresh implementer's fixes F1–F4 (`ticket.md` → `## Decisions` 15; D-026) → `review-guard.mjs compare
  --git` → "within its limits", exit 0; the main session's `gate.mjs` → exit 0, 1330 tests, 1330 pass (307.0 s);
  `fails-before.mjs test/hook/communication.test.ts test/cli/spawn.test.ts test/cli/continue.test.ts` → exit 0.
- Reply: `rebuild-reviewer` with the ticket, the new `node_modules/.rebuild-review/R-039.diff` and `taste.md`;
  `review-guard.mjs compare` → "unchanged", exit 0; `review-verdict.mjs` → "consistent", exit 0.
- Verdict: **PASS**. AC-1–AC-15 met; three notes, no blocking finding.

| # | Finding (short) | Decision |
|---|---|---|
| 1 | note · observed: the rewritten coordinator test of `test/s4-steering.test.ts` checks the model's view and the empty system prompt in one `deepEqual` and fails at HEAD on both halves; the worker test combines them too (`test/s4-steering.test.ts:74-98`) | fix (G1): T-29 (3), as F2 did for the spawn test; Change item 7 names both properties, not one test for both |
| 2 | note · observed: the doc comment of `deliverContext` restates E-13's rule in three sentences (`hook/communication.ts:141-148`) | fix (G2): T-30 (1) |
| 3 | note · observed: the `session_compact` handler returns before its payload guard when no `session_start` ran, so a wrongly shaped payload then is skipped with no refusal (`hook/communication.ts:172-176`) | fix (G3): T-32 (4), the guard first; a one-line move with its test |

## Round 3 (2026-11-26, night run 1)

- Before: a fresh implementer's fixes G1–G3 (`ticket.md` → `## Decisions` 16; D-026), with a follow-on change of
  `test/u13-guidance-reminder.test.ts` (its compaction call now carries a Pi-shaped payload, which G3's guard requires;
  `outcome.md` → Deviations 12) → `review-guard.mjs compare --git` → "within its limits", exit 0; the main session's
  `gate.mjs` → exit 0, 1333 tests, 1333 pass (309.0 s); `fails-before.mjs test/s4-steering.test.ts
  test/hook/communication.test.ts test/u13-guidance-reminder.test.ts` → exit 0.
- Reply: `rebuild-reviewer` with the ticket, the new `node_modules/.rebuild-review/R-039.diff` and `taste.md`;
  `review-guard.mjs compare` → "unchanged", exit 0; `review-verdict.mjs` → "consistent", exit 0.
- Verdict: **PASS**. AC-1–AC-15 met; three notes, no blocking finding. Both rounds of fixes are spent, so a note that
  needs code or tests goes to the ticket that rewrites that part or to the open points (D-092); there is no round 4.

| # | Finding (short) | Decision |
|---|---|---|
| 1 | note · proven: the doc comment of `deliverContext` ends "Each handler calls `forget` first", but only the `session_start` and `session_compact` handlers do (`hook/communication.ts:144`) | to R-110, which adds handlers to that file: `plan.md` → `## Tickets`, its note; `outcome.md` → Open points 7 |
| 2 | note · observed: G1's coordinator system-prompt test reads the run folder of the view test before it (file-level `coord`), so run alone it fails on a missing file (`test/s4-steering.test.ts:40`, `:80`, `:104`) | to R-083, which rewrites the `s<N>-` test files: `plan.md` → `## Tickets`, its note; `outcome.md` → Open points 8 |
| 3 | note · observed: the checkout still holds the refusal temp file that round 2's first gate run left (`.limen/refusals/…tmp`) | no change of code: `rm` is denied to the sessions, so Adrian deletes the checkout's `.limen/` (`outcome.md` → Open points 6; the morning summary) |
