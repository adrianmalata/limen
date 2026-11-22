<!-- PL: Recenzje ticketu R-024 (nowe polecenie `limen stats` i czytnik transkryptów przez walidatory). Runda 1 (noc
21/22.11): PASS z siedmioma uwagami; cztery idą do pierwszej rundy poprawek przez nowego implementera (linia modelu
w `limen show` bez tury asystenta, granice jednostek tokenów z bezpośrednim testem operacji, podział testów czytnika
po jednym mechanizmie, zdanie o `show` w docs/commands.md), trzy są przyjęte bez zmiany z powodem i jako otwarte punkty.
Runda 2: PASS z dwiema uwagami, obie do drugiej i ostatniej rundy poprawek (granica „od startu joba” liczona w
jednym czytniku, zdanie o turach w docs/commands.md). Runda 3: PASS z jedną uwagą (ścisłe walidatory pomijają
linie starszego Pi, nazywając je w `Not read`), przyjętą bez zmiany jako otwarty punkt. Stan: zamknięta. -->

# R-024 review

## Round 1 (2026-11-22, night)

- Before: the implementer's run → `review-guard.mjs compare --git` "within its limits", exit 0; the main session's
  `gate.mjs` → 684/684, fail 0; `fails-before.mjs` → exit 0, recorded in `outcome.md` → `## Fails before` before the
  review.
- Reviewer: `rebuild-reviewer` with the ticket, `node_modules/.rebuild-review/R-024.diff` and `taste.md`;
  `review-guard.mjs compare` → "unchanged", exit 0; `review-verdict.mjs` → "consistent", exit 0.
- Verdict: **PASS**. AC-1–AC-8 met.

| # | Finding (short) | Decision |
|---|---|---|
| 1 | note · observed: `limen show` of a job whose only counted entries since its start are compactions or `usage` entries prints an empty model line and "0 turns" instead of "requested <model>; no turn yet" (`src/job/usage.ts:61`, `:86-88`: `served` `[]` makes `every()` true) | fix: a defect the change adds to `show`; `modelLine` names the requested model while no assistant turn served one, with a test that fails before |
| 2 | note · observed: the fake engine writes `{"task": …}`, no Pi entry, into `session/fake.jsonl`, so `stats` over a fake-engine job names one unread line | no change in R-024: `test/fake-engine.mjs` is outside its `## Change`, no test runs `stats` over a fake job, and naming the line is the reader's rule (z. 10); an open point for gate 5.2 (`outcome.md` → Open points 3) |
| 3 | note · observed: `tokenText` picks the unit and the decimal before rounding, so 9,950–9,999 print "10.0k" and 99,500–99,999 print "100k", against its own rule (`src/job/statistics.ts:194-199`) | fix: the unit and the decimal follow the rounded value, with a test of the boundaries that fails before |
| 4 | note · observed: `docs/commands.md:197` says `show` totals "turns and compactions", while the reader counts every entry that carries a usage (branch summaries and `usage` entries too); `docs/jobs.md` is exact | fix: the sentence says what `docs/jobs.md` says |
| 5 | note · observed: the ISO-time pattern is a fourth copy (`src/job/usage.ts:31`; `record.ts`, `lock.ts`, `migration.ts`), against T-25 (2) | no change in R-024: one definition for all four is a change of `src/job/record.ts`, `src/lock.ts` and `src/job/migration.ts`, outside its `## Change`; an open point for gate 5.2 (`outcome.md` → Open points 2) |
| 6 | note · observed: usage test 1 fails at `HEAD` for two reasons (the return shape and the compaction; `HEAD`'s `since` filter already left out the parent turn), usage test 3 only for the return shape | fix with the reviewer's T-29 answer below: one mechanism per test; test 3 stays, since the return shape `{ usage, unread }` is a change of the reader's contract that it proves |
| 7 | note · guessed: T-26 (5), `projectStatistics` is tested only through the CLI | fix: a direct test of the operation in `test/job/statistics.test.ts` (T-29 (1)), which also holds finding 3's boundaries; the place is a night default (category A (b), D-054 (2)) |

Taste answers: T-18, T-19, T-30 and T-40 yes. T-29: the golden test asserts the whole output in one comparison, as
T-28 (2) and (d) require, so it stays one test; usage test 1 (the compaction and the `since` filter) and usage test 2
(the cut line, the bad usage class and the other lines still counting) are split, one mechanism each.

Fixes (for a fresh implementer, `ticket.md` → `## Decisions`; the first round of fixes): 1, 3, 4, 6 and 7. They
change code and tests, so they get a round (D-053 (2)).

## Round 2 (2026-11-22, night)

- Before: a fresh implementer's first round of fixes → `review-guard.mjs compare --git` "within its limits", exit 0;
  the main session's `gate.mjs` → 689/689, fail 0; `fails-before.mjs` → exit 0, recorded in `outcome.md` before the
  review.
- Reviewer: a fresh `rebuild-reviewer` with the ticket, the new `node_modules/.rebuild-review/R-024.diff` and
  `taste.md`; `review-guard.mjs compare` → "unchanged", exit 0; `review-verdict.mjs` → "consistent", exit 0.
- Verdict: **PASS**. AC-1–AC-8 met.

| # | Finding (short) | Decision |
|---|---|---|
| 1 | note · observed: the `show` sentence of round 1's fix 5 (`docs/commands.md:197`) can be read as counting a compaction as a turn, while `turns` counts assistant messages only | fix: the sentence names the turns (assistant messages) apart from the token totals |
| 2 | note · observed: "from the job's own start" is worked out by both callers (`Date.parse(record.startedAt ?? "") \|\| 0` in `src/job/statistics.ts:91` and `src/job/listing.ts:117`), not by the one reader | fix (T-25 (1), (b)): which entries count is the reader's policy, so the reader takes the job's recorded start and derives the bound itself, with one test of a record with no start |

Fixes (for a fresh implementer, `ticket.md` → `## Decisions`; the second and last round of fixes): 1 and 2. Fix 2
changes code, so it gets a round (D-053 (2)).

## Round 3 (2026-11-22, night)

- Before: a fresh implementer's second round of fixes → `review-guard.mjs compare --git` "within its limits", exit 0;
  the main session's `gate.mjs` → 690/690, fail 0; `fails-before.mjs` → exit 0, recorded in `outcome.md` before the
  review.
- Reviewer: a fresh `rebuild-reviewer` with the ticket, the new `node_modules/.rebuild-review/R-024.diff` and
  `taste.md`; `review-guard.mjs compare` → "unchanged", exit 0; `review-verdict.mjs` → "consistent", exit 0.
- Verdict: **PASS**. AC-1–AC-8 met.

| # | Finding (short) | Decision |
|---|---|---|
| 1 | note · guessed: the validators require `message.provider` and the four usage classes as integers, where `HEAD`'s reader defaulted them, so an assistant line of an older Pi lacking one is a `Not read` line and its tokens drop out of the totals (B.3, M-07); it is named, not silent | no change: the reader follows Pi 1.5.1's declared types (T-27 (2)) and names what it cannot read (z. 10) instead of counting made-up zeros, and no such transcript is in the repository; a third round of fixes would be Adrian's to decide. `outcome.md` → Open points 7, for gate 5.2 and B.3 |

The review is closed: round 3 is PASS and its one finding is answered with no change.
