<!-- PL: Recenzje ticketu R-016 (moduł granicy src/boundary.ts i zapadki JSON.parse oraz rzutowań). Runda 1: FAIL
z jedną uwagą blokującą (w outcome.md brakowało wyniku fails-before.mjs sesji głównej, błąd sesji głównej, poprawiony
przez nią) i ośmioma uwagami: pięć poprawionych przez implementera, trzy odrzucone. Runda 2: PASS z czterema uwagami,
dwie (znaki sterujące, słowo whole) w drugiej rundzie poprawek, dwie odrzucone. Runda 3: PASS z czterema uwagami;
trzy uwagi do kodu idą do R-021, jedną (streszczenie ticket.md) poprawiła sesja główna. Stan: zamknięta. -->

# R-016 review

## Round 1 (2026-11-20, day session `limen-rebuild-9`)

- Before: `review-guard.mjs compare --git` after the implementer → "within its limits", exit 0; the main session's
  `node adrian-rebuild/tools/gate.mjs` → exit 0, 302/302; `node adrian-rebuild/tools/fails-before.mjs` → exit 0 (six
  files "fail at HEAD (exit 1)"). The main session did not put that output into `outcome.md` before the review, which
  protocol step 4 asks for.
- Reviewer: `rebuild-reviewer` with the ticket, `node_modules/.rebuild-review/R-016.diff` and `taste.md`;
  `review-verdict.mjs` → "consistent", exit 0; `review-guard.mjs compare` → "unchanged", exit 0.
- Verdict: **FAIL**. AC-4 not met (the missing output); AC-1–AC-3 and AC-5–AC-8 met.

| # | Finding (short) | Decision |
|---|---|---|
| B1 | blocking: `outcome.md` → `## Fails before` does not hold the main session's `fails-before.mjs` output | fixed by the main session (its run's line, at the head of the section) |
| 1 | The exported validators throw the private `Mismatch` when called outside `checkValue` or `parseJson` (`src/boundary.ts:30`, `:138`) | rejected |
| 2 | A final line that is not JSON shows only 40 characters in the `INTERNAL` message; `0c22548` showed the whole line (`src/boundary.ts:23`, `:60-63`) | fix |
| 3 | The field is printed raw while the value is escaped; a key with a newline splits a job-log line (`src/boundary.ts:67`, `:115`) | fix |
| 4 | `duration` takes only a JSON string (`["20m"]` is now ignored) (`src/boundary.ts:224-233`) | rejected |
| 5 | Three new function names repeat names of other files: `outcomeOf`, `printable`, `number` | fix |
| 6 | One test name holds two identifiers, `T-27` and `BAD_DATA` (`test/boundary.test.ts:166`) | fix |
| 7 | The import test matches only `import … from "…"` (`test/boundary.test.ts:235`) | fix |
| 8 | Two errors of `readOutcome` do not use the file, field and expectation form; the exit-code mismatch does not name the stream (`src/outcome.ts:126`, `:136`) | rejected |

Fixes (for the resumed implementer, `ticket.md` → `## Decisions`): 2, 3, 5, 6, 7, and the implementer's open point 1
(the empty field segment).

Rejected, with reasons:
- 1: `Mismatch` is the module's internal signal: the validators are the building blocks of a schema, and the only
  entry points that run a schema (`checkValue`, `parseJson`, `eachField`) turn it into the typed `BAD_DATA` error; no
  caller runs a validator alone, and a caller that did would get `INTERNAL` through `failureOf`, which is the right
  class for a programming error.
- 4: the documented forms of `prepare` and `toolStall` are strings (`docs/jobs.md`); `outcome.md` records it as
  deviation 3, and the ticket's Risk covers a stricter validator.
- 8: both messages are as at `0c22548` (the reviewer: "not a regression"), and neither is bad data of a file: the
  exit-code mismatch and the empty stream are faults of the command that wrote the line, so they keep their own form.

## Round 2 (2026-11-20, day session `limen-rebuild-9`)

- Before: `review-guard.mjs compare --git` after the fix round → "within its limits", exit 0; the main session's gate
  → exit 0, 307/307; `fails-before.mjs` → exit 0 (the same six files), recorded in `outcome.md` before the review.
- Reviewer: a fresh `rebuild-reviewer`. Its first reply was rejected by `review-verdict.mjs` because the evidence of
  finding 1 held the raw line separator U+2028, which split the line; the same reviewer sent it again with every such
  character named as U+XXXX and nothing else changed → "consistent", exit 0; `review-guard.mjs compare` → "unchanged".
- Verdict: **PASS**. AC-1–AC-8 met; the six fixes of round 1 hold. Four findings, all notes.

| # | Finding (short) | Decision |
|---|---|---|
| 1 | `JSON.stringify` escapes only the C0 controls: DEL, the C1 controls and U+2028/U+2029 reach a message raw, in the field and the value (`src/boundary.ts:65`, `:67`, `:76`) | fix |
| 2 | `whole` has three meanings in `src/boundary.ts` (the top-level value, the uncut option, numberIn's local) (T-18) | fix |
| 3 | `at` shares its name with two local arrow functions of `src/picture/picture-model.ts` | rejected |
| 4 | The test of one identifier per test name checks the test file, not `src/boundary.ts` (T-29 (1)) | rejected |

Fixes (the second and last round of fixes; code, so review round 3 follows): 1 and 2 (`ticket.md` → `## Decisions`).

Rejected, with reasons:
- 3: T-25 concerns functions a module defines; the two `at` of `src/picture/picture-model.ts` are local arrow
  functions inside other functions, which no other module can call; `outcome.md` keeps it as an open point for the
  T-25 scan.
- 4: the test guards the names of this file's own tests, which finding 6 of round 1 asked for; the scan over every test
  file is T-29's (R-083), and `outcome.md` keeps it as an open point.

## Round 3 (2026-11-20, day session `limen-rebuild-9`)

- Before: `review-guard.mjs compare --git` after the second fix round → "within its limits", exit 0; the main
  session's gate → exit 0, 310/310; `fails-before.mjs` → exit 0 (the same six files), recorded in `outcome.md`.
- Reviewer: a fresh `rebuild-reviewer`, asked to check round 2's fixes and the absence of regressions;
  `review-verdict.mjs` → "consistent", exit 0; `review-guard.mjs compare` → "unchanged", exit 0.
- Verdict: **PASS**. AC-1–AC-8 met; both fixes of round 2 hold. Four findings, all notes.

| # | Finding (short) | Decision |
|---|---|---|
| 1 | The comment at `src/boundary.ts:65` says `JSON.stringify` leaves C0 controls raw; it escapes them (the code is right) | to R-021 |
| 2 | The 40-character cut runs after the escaping and counts UTF-16 units, so a cut value can end in a broken escape or a lone surrogate (`src/boundary.ts:79`) | to R-021 |
| 3 | Format characters (category Cf, such as U+202E) reach a message raw; they split no line but can change how a terminal shows it | to R-021 |
| 4 | The PL summary of `ticket.md` still says the ticket is in round-1 fixes | fixed by the main session |

After two rounds of fixes no third round runs (`## Agents`, step 6). As with R-014's round 4 (D-044), the non-blocking
notes on code go to the next ticket that changes the module: R-021 moves the records onto `src/boundary.ts`, and its
note in `plan.md` → `## Tickets` holds findings 1–3. Finding 4 is the main session's file.
