<!-- PL: Recenzja ticketu R-110 (kontynuacja zachowuje wiadomość kontekstową rodzica; powiadomienia o zmianach i skrót
tablicy tylko po zmianie). Runda 1 (28.11, noc): pierwsza odpowiedź odrzucona przez `review-verdict.mjs` (FAIL bez
znaleziska blokującego), druga: PASS, kryteria AC-1–AC-11 spełnione; uwagi obu odpowiedzi: pięć do poprawki jako
F1–F5 w decyzji 21, reszta do punktów otwartych i do notatki R-048. Runda 2: PASS, G1–G2 (testy `resolvePreamble` w
`test/runtime/roles.test.ts`, nagłówki dwóch plików testów); runda 3: PASS, dwie uwagi o `outcome.md` poprawione przez
główną sesję. Stan: recenzja zamknięta po trzech rundach. -->

# R-110 review

## Round 1 (2026-11-28, night run)

- Before: the implementer's run → `review-guard.mjs compare --git` → "within its limits", exit 0. The main session's
  `gate.mjs --out node_modules/.rebuild-review/R-110.gate` → exit 0, 1588/1588 (365.5 s); AC-5's `fails-before.mjs` →
  exit 0 (the four files).
- First reply: `rebuild-reviewer`; `review-guard.mjs compare` → "unchanged"; `review-verdict.mjs` → exit 1, "FAIL
  without a blocking finding" (its line 1 was `FAIL`, followed by "Correction: line 1 is PASS"), so the reply was
  rejected and the review ran again (protocol step 5). Its notes are taken with the second reply's.
- Second reply: a fresh `rebuild-reviewer` with the ticket, `node_modules/.rebuild-review/R-110.diff` and `taste.md`;
  `review-guard.mjs compare` → "unchanged", exit 0; `review-verdict.mjs` → "consistent", exit 0.
- Verdict: **PASS**. AC-1–AC-11 met; no blocking finding. Taste questions: T-29, yes for the tests that fail at
  `HEAD`, the guards of Deviations 1 aside; T-30, mostly yes, one comment misplaced; T-40, no.

| # | Finding (short) | Decision |
|---|---|---|
| 1 | note · observed (both replies): a job's audience is built in three places (spawn, continuation, hook), and the hook loads the spawn module for one role lookup (T-25 (2)) | fix: F1 (`ticket.md` → Decision 21), one function, `resolvePreamble` out of the spawn module |
| 2 | note · proven/observed (both replies): `docs/setup.md:185` reads as if a job's vision edit gave a notice; `:189` says the digest comes after any board change | fix: F2 |
| 3 | note · observed (first reply): three hook tests ignore the first run's result, so they pass at `HEAD` | fix: F3, they assert the first run's message |
| 4 | note · observed (first reply): the opening comment of `test/hook/communication.test.ts` grows to two lines (T-29 (5)) | fix: F4 |
| 5 | note · observed (second reply): the `A-037 "(coordinator and jobs)"` comment sits above `NOTICE_MESSAGE` | fix: F5 |
| 6 | note · guessed (first reply): a `</limen-board>` line in the board closes the digest's tag early | no change: the board reaches `main` only through land, and the same text went unwrapped into the system prompt at `aa721d7`; `outcome.md` → Open points |
| 7 | note · observed (second reply): a project file whose body holds a later part's heading after a blank line splits the held part | no change: only a path reaches the model, so the cost is one notice of noise; `outcome.md` → Open points |
| 8 | note · observed (first reply): a continuation reads bridge isolation from the child's route, the frozen message being the parent's | no change: no effect while `BRIDGE_ISOLATED` is off; a note for R-048 in `plan.md` → `## Tickets` |
| 9 | note · observed (second reply): the T-36 test and the guards of Deviations 1 pass at `HEAD` | no change: each guards the "only on a change" half or the no-process rule, and its positive counterpart fails at `HEAD`; F3 turns three of them into tests that fail there |

A round of fixes follows (code, tests and docs, D-053 (2)): a fresh `rebuild-implementer` (D-026) with `ticket.md` and
this file.

## Round 2 (2026-11-28, night run)

- Before: a fresh `rebuild-implementer` made F1–F5 (`DONE`; `jobAudience` and `resolvePreamble` in
  `src/runtime/roles.ts`; F3's three tests failed with the new handlers silenced); `review-guard.mjs compare --git` →
  "within its limits", exit 0. The main session's `gate.mjs --out node_modules/.rebuild-review/R-110.gate` → exit 0,
  1588/1588 (357.0 s); AC-5's `fails-before.mjs` → exit 0 (the four files).
- Reply: `rebuild-reviewer` with the ticket, the new `node_modules/.rebuild-review/R-110.diff` and `taste.md`;
  `review-guard.mjs compare` → "unchanged", exit 0; `review-verdict.mjs` → "consistent", exit 0.
- Verdict: **PASS**. AC-1–AC-11 met; three notes, no blocking finding. Taste questions: T-29, yes apart from the
  guards by design; T-30, yes; T-40, no.

| # | Finding (short) | Decision |
|---|---|---|
| 1 | note · observed: `test/job/spawning.test.ts` now tests only `resolvePreamble`, which lives in `src/runtime/roles.ts` (T-29 (1), (6)) | fix: G1 (`ticket.md` → Decision 22, `## Change` item 9): the tests move to `test/runtime/roles.test.ts`, the file goes with `git rm` |
| 2 | note · observed: the R-048 note names one direction of the isolation mismatch only | fixed by the main session in `plan.md` → `## Tickets` (both directions) |
| 3 | note · observed: the opening comments of `test/cli/continue.test.ts` and `test/s4-steering.test.ts` grow (T-29 (5)) | fix: G2, back to their text at `HEAD` |

The last round of fixes follows (tests, D-053 (2)): a fresh `rebuild-implementer` (D-026) with `ticket.md` and this
file.

## Round 3 (2026-11-28, night run)

- Before: a fresh `rebuild-implementer` made G1–G2 (`DONE`; `git rm -f test/job/spawning.test.ts`, since the file
  held round 1's uncommitted edits, `outcome.md` → Deviations 7); `review-guard.mjs compare --git` → "within its
  limits", exit 0. The main session's `gate.mjs --out node_modules/.rebuild-review/R-110.gate` → exit 0, 1588/1588
  (361.8 s); AC-5's `fails-before.mjs` → exit 0 (the four files).
- Reply: `rebuild-reviewer` with the ticket, the new `node_modules/.rebuild-review/R-110.diff` and `taste.md`;
  `review-guard.mjs compare` → "unchanged", exit 0; `review-verdict.mjs` → "consistent", exit 0.
- Verdict: **PASS**. AC-1–AC-11 met; two notes, no blocking finding. Taste questions: T-29, mostly yes (F3's
  first-run assertions are a precondition of the same mechanism); T-30, yes; T-40, no.

| # | Finding (short) | Decision |
|---|---|---|
| 1 | note · proven: `## Fails before` says "both times" after three runs | fixed by the main session (D-053 (2), `outcome.md` only) |
| 2 | note · observed: at `HEAD` two of AC-5's files fail on an import, so their mechanism is shown only by the outcome's separate runs | fixed by the main session in `outcome.md` → `## Fails before`, which says so and points at those runs |

The review is closed after three rounds.
