<!-- PL: Recenzja ticketu R-098 (`limen stats` na lądowanie i na turę koordynatora), noc 24/25.11. Runda 1: odpowiedź
przyjęta przez `review-verdict.mjs` za pierwszym razem, FAIL na jednym znalezisku blokującym (rekord zmigrowany, który
`ticket done` oznaczył później, dostaje czas prowadzenia do północy, czyli liczbę zgadniętą) i siedem uwag; poprawki
F1–F7 w `ticket.md` → `## Decisions` (F5 to domyślna decyzja nocy: części czasu prowadzenia są rozłączne), jedna
uwaga odrzucona z powodem. Runda 2: PASS z siedmioma uwagami; poprawki G1–G3, trzy uwagi tekstowe poprawione przez
sesję główną, jedna odrzucona. Runda 3: pierwsza odpowiedź odrzucona za formę, druga PASS z trzema uwagami; dwie
kodowe idą do punktów otwartych i notatek R-103 (D-092), jedną tekstową poprawiła sesja główna. Stan: zamknięta. -->

# R-098 review

## Round 1 (2026-11-25, the night of D-102, run 1)

- Before: the implementer's run → `review-guard.mjs compare --git` → "within its limits", exit 0; the main session's
  `gate.mjs` → exit 0, 1137 tests, 1137 pass, 0 fail (267.8 s); `fails-before.mjs` → exit 0 at `HEAD` `02492cb` (five
  files).
- Reply: `rebuild-reviewer` with the ticket, `node_modules/.rebuild-review/R-098.diff` and `taste.md`;
  `review-guard.mjs compare` → "unchanged", exit 0; `review-verdict.mjs` → "consistent", exit 0.
- Verdict: **FAIL**. AC-1–AC-4 met (run in the review), AC-5–AC-7 on the records, AC-8 not met (finding 1); one
  blocking finding, seven notes.

| # | Finding (short) | Decision |
|---|---|---|
| 1 | blocking · proven: a migrated record that `limen ticket done` marks after the migration gets `at` = the ticket's day at midnight (`src/job/landing.ts:283`; `ownsLandedWork` has no `migrated` exclusion, `:288-291`), and `leadTimeOf` treats only a record without `migrated` as day-only (`src/job/statistics.ts:256`), so it prints a lead time to midnight, a guessed number, and the land is missing from `Not read` | fix (F1) |
| 2 | note · proven · T-01: `sessionFiles` now returns undefined for `ENOTDIR` too, so a job whose `session` is a file shows 0 tokens in `show` and `stats` with nothing on `Not read`; at `HEAD` only `ENOENT` meant no transcript (`src/job/usage.ts:72`, `:142`) | fix (F2): the job transcript keeps `HEAD`'s rule; only `--sessions` refuses a path that is a file (Deviation 6) |
| 3 | note · observed: a lead-time part's median leaves out the lands that lack the part with no count (the golden's `queue 0 h 10` is the median of 1 of 3 lands) | fix (F3): AC-8 says a part the records cannot give is `—` or named on `Not read`, so `Not read` names, per part, the lands whose part is unknown |
| 4 | note · proven: no test prints a `—` lead-time part (`test/cli/stats.test.ts:423` is the only `Lead time per land` assertion) | fix (F4) |
| 5 | note · guessed: a record without `migrated` and without `queueWait` reads as queue 0, while the record type says a record from before R-035 has none either (`src/job/record.ts:205-208`, `src/job/statistics.ts:282-284`) | rejected: R-021's migration came with a0.2.0 and R-035's `queueWait` with a0.3.0 (stage 3), so a record a0.2.0 wrote may have queued with no `queueWait`; but a record joins a land only as a landed job, its `parent` chain or a reviewer of its branch, and the projects stand from a0.1.1 until a0.3.0 (D-012), so no land of a0.2.0 exists and no later land reaches back to one of its jobs; outcome open point 2 names it for gate 5.3 |
| 6 | note · observed: `job runs` and `review` include each job's queue wait (the wrapper moves a job to `running` before `waitForStart`, `src/runtime/wrapper.ts:141`, `:147`), so the parts overlap `queue`; outcome open point 1 | fix (F5, a night default): (b) and M-06 ask for a split, whose parts do not overlap |
| 7 | note · observed · T-25: the new private `readJobs` (`src/job/statistics.ts:150`) has the name of `readJobs` in `src/project/board-jobs.ts:127` | fix (F6) |
| 8 | note · observed · T-29 (5): the header line of `test/cli/stats.test.ts` names only the counts by route and role, the failures and `Not read` | fix (F7) |

## Round 2 (2026-11-25, the night of D-102, run 1)

- Before: a fresh `rebuild-implementer` made F1–F7 → `review-guard.mjs compare --git` → "within its limits", exit 0;
  the main session's `gate.mjs` → exit 0, 1142 tests, 1142 pass, 0 fail (272.1 s); `fails-before.mjs` → exit 0 at
  `HEAD` `02492cb` (five files).
- Reply: a fresh `rebuild-reviewer` with the same three paths; `compare` → "unchanged", exit 0; `review-verdict.mjs` →
  "consistent", exit 0.
- Verdict: **PASS**. AC-1–AC-4 met (run in the review), AC-5–AC-7 on the records, AC-8 judged met; no blocking
  finding, seven notes.

| # | Finding (short) | Decision |
|---|---|---|
| 1 | note · observed: M-04 can take a turn of the land's own run: `startsRun` takes every `user` or `custom_message` entry as a new run, while a Limen message during an active run joins that run (E-16); the comment's "after a run" is a condition the code does not check (`src/job/usage.ts:58-60`) | the comment is fixed (G3); the limit is recorded as `outcome.md` → Open point 5 (the main session's text): a session file does not tell the two apart, and the ticket's (d) defines the turn this way |
| 2 | note · proven: with F5 a migrated record's run part is unknown, so every B.3 land prints `queue`, `job runs` and `review` as `—` and M-06's "before" is the total alone; Open point 1 does not say so (`src/job/statistics.ts:291-295`, `:310-312`) | fixed as text by the main session: Open point 1 states the cost of F5 for B.3 and what option (a) would give, for Adrian's choice in the morning |
| 3 | note · proven: M-03 can miss a `ticket done` land on the first day of the sessions: its `at` is the day at 00:00 UTC, which `landsWithin` compares with the span's first entry (`src/job/statistics.ts:336-341`, `src/job/landing.ts:283`) | fix (G1): a day-only land's time is its day, so it is compared by day |
| 4 | note · proven: `-h` counts as a land for M-04: the parser takes `-h` as help, `HELP` matches only `--help` (`src/parser.ts:359`, `src/job/statistics.ts:54`) | fix (G2) |
| 5 | note · observed: (e)'s "the lands of the records not found in the sessions" is implemented as the lands outside the sessions' span, a reading `outcome.md` → Deviations does not list (`src/job/statistics.ts:149`, `:649`) | fixed as text by the main session: Deviation 9 |
| 6 | note · observed · T-29: the F4 test checks the `—` parts and F3's `Not read` items together and failed for two reasons on the round-0 tree (`test/cli/stats.test.ts:1252-1272`) | rejected: F4 asks for that combination, one output of the read command (T-28 (2)), and F3's own items are pinned by the goldens too |
| 7 | note · observed: the edit of the header comment left a line of 134 characters (`src/job/statistics.ts:11`) | fix (G3) |

## Round 3 (2026-11-25, the night of D-102, run 1)

- Before: a fresh `rebuild-implementer` made G1–G3 → `review-guard.mjs compare --git` → "within its limits", exit 0;
  the main session's text fix of `docs/jobs.md:53` (a `ticket done` land compared with the span by its local day, the
  implementer's open point 1); its `gate.mjs` → exit 0, 1144 tests, 1144 pass, 0 fail (273.9 s); `fails-before.mjs` →
  exit 0 at `HEAD` `02492cb` (five files).
- Reply 1: a fresh `rebuild-reviewer` with the same three paths, PASS with two notes; `compare` → "unchanged", exit 0;
  `review-verdict.mjs` → exit 1, rejected for its form (a finding line `note · proven: …` with no ` · ` after the
  evidence class), so the review ran again on the same tree. Its notes: the name `coordinatorLines` (as reply 2's
  note 1) and the span's printed UTC days against G1's local days (`outcome.md` → Open point 7).
- Reply 2: a fresh `rebuild-reviewer` with the same three paths; `compare` → "unchanged", exit 0; `review-verdict.mjs`
  → "consistent", exit 0.
- Verdict: **PASS**. AC-1–AC-4 met (run in the review), AC-5–AC-7 on the records, AC-8 judged met (the main golden's
  numbers checked by hand); no blocking finding, three notes. The rounds of fixes are spent (D-092).

| # | Finding (short) | Decision |
|---|---|---|
| 1 | note · proven · T-25: the new private `coordinatorLines` has the name of a private function of `src/project/summary.ts:461`, as `readJobs` had before F6; the T-25 scan covers only two modules (`src/job/statistics.ts:561`, `test/structure.test.ts:327-342`) | code, the rounds spent: `outcome.md` → Open point 6 for gate 5.3, since no ticket rewrites the module (D-092) |
| 2 | note · observed · T-25 (2): the `ticket done` marker's time is built in `src/job/landing.ts:283` and matched by `DAY_ONLY` in `src/job/statistics.ts:51`, with no shared definition; a change of the writer fails no stats test | code, the rounds spent: R-103's notes in `plan.md` → `## Tickets` (D-092), since R-103 rewrites the marker steps of land and `ticket done` |
| 3 | note · proven: `outcome.md:255`, a prose line of Open point 2, runs to about 147 characters | fixed by the main session (D-053 (2)) |
