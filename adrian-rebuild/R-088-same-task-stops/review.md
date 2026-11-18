<!-- PL: Recenzje ticketu R-088 przez rebuild-reviewer. Runda 1 (18.11): FAIL z jednym znaleziskiem blokującym
(fałszywy komentarz o zadaniu w kolejce w teście) i ośmioma uwagami; sesja główna poprawia komentarze, nagłówek PL,
dodaje testy linii „no pid” i kolejności Pi przed zadaniami przy kodzie 4, a dwie zgadywane uwagi odrzuca
z powodem. Runda 2: FAIL na komentarzu o tym, kiedy wrapper zapisuje pid; w drugiej, ostatniej rundzie poprawek
komentarz mówi, że każde zadanie ze spawn dostaje pid od razu, a test kolejności gra zadanie z pid. Runda 3: PASS;
dwie poprawki komentarzy Adrian przyjął bez czwartej recenzji. Stan: zamknięty. -->

# Review: R-088 The same-task runner leaves no job running after an attempt

## Round 1 (2026-11-18, day session)

- Inputs: `adrian-rebuild/R-088-same-task-stops/ticket.md`, the diff from `review-guard.mjs diff --out
  node_modules/.rebuild-review/R-088.diff`, `adrian-rebuild/taste.md`. The main session implemented it (`pair`).
- Main session before the review: `node --test adrian-rebuild/tools/test-same-task.mjs` → 37/37;
  `node adrian-rebuild/tools/gate.mjs` → exit 0, 96/96; `check.mjs` and Biome → exit 0.
- Guard: `review-guard.mjs compare node_modules/.rebuild-review/R-088.before` → `unchanged`, exit 0.
- Parser: `review-verdict.mjs node_modules/.rebuild-review/R-088.reply <ticket.md>` → `consistent`, exit 0.
- Verdict: FAIL. AC-1 to AC-5 met; one blocking finding, eight notes. The reviewer reran the final tests against
  `HEAD`'s `same-task.mjs`, served from memory by a module load hook, with no change to the tree: the two new tests
  fail there (one `stop` instead of two; `piClosed` `[false]`).

| # | Finding | Kind | Decision |
|---|---|---|---|
| 1 | `test-same-task.mjs:375` still says a worker with no `state` is "still setting up, or queued"; a queued job has `state` and `pid` (note 2, T-30) | blocking · proven | fix: the comment says "before `spawn` writes it; a queued job has one" |
| 2 | The `TIMING` comment says `stateWaitMs` bounds the wait for `state` only (`same-task.mjs:32-33`); the name says less than it covers (T-18) | note · proven | fix the comment; the name stays, as the ticket's Change keeps it (a rename would touch every caller and test for no change of behaviour) |
| 3 | The `stopJobs` comment cites only the early pid write (`wrapper.ts:102`); a job that does not queue gets its pid after setup (`wrapper.ts:255`) | note · proven | fix: both writes cited |
| 4 | `## Fails before` comes from a run of an earlier test version | note · proven | fix: the outcome cites the reviewer's rerun of the final tests against `HEAD` |
| 5 | Line 8 of the PL header is 142 columns wide | note · proven | fix: rewrapped |
| 6 | No test of the "still has no pid" line, and none of Pi before the jobs on the failure path | note · observed | fix: two tests |
| 7 | `result.json` → `jobs[]` now carries `pid` (`summarize` uses `readJobs`) | note · observed | accepted and recorded in the outcome: an added field that `evaluate` and `report` do not read |
| 8 | A `limen spawn` that Pi's bash tool is still running may outlive Pi and create a job after the single read of the job list | note · guessed | rejected: guessed; B.2 checks the runner's stderr for a job left running after every attempt (`## Deployment` B.2), and a second read would still race a spawn slower than it |
| 9 | If Pi's `close` never comes, no job is stopped | note · guessed | rejected: `pi.stop` ends with SIGKILL, after which the child's `close` follows; the old order waited for the same `close` in `finally` |

Taste questions answered by the reviewer: T-29 (each new test fails for one reason), T-30 (three comments: notes 1–3),
T-40 (no owner step), T-41 (no command).

## Round 2 (2026-11-18, day session)

- Inputs: the same `ticket.md` (with the round-1 decision), the diff from `review-guard.mjs diff --out
  node_modules/.rebuild-review/R-088.diff2`, `taste.md`.
- Main session before the review: `test-same-task.mjs` → 39/39; `gate.mjs` → exit 0, 96/96; `check.mjs` and Biome →
  exit 0.
- Guard: `review-guard.mjs compare node_modules/.rebuild-review/R-088.before2` → `unchanged`, exit 0.
- Parser: `review-verdict.mjs node_modules/.rebuild-review/R-088.reply2 <ticket.md>` → `consistent`, exit 0.
- Verdict: FAIL. AC-1 to AC-5 met; one blocking finding, two notes. The reviewer ran all four new tests against
  `HEAD`'s code (a module load hook, no change to the tree): each fails at one assertion.

| # | Finding | Kind | Decision |
|---|---|---|---|
| 1 | The `stopJobs` comment says a job gets its `pid` at once only when it queues, otherwise after setup; at `rebuild-base` every wrapper `spawn` starts gets `LIMEN_SETUP_KEEP` and writes it at once, and the late write is for a wrapper with neither setup nor queue, after its engine starts (`same-task.mjs:332-333`; `rebuild-base:src/commands/spawn.ts:355`, `src/runtime/wrapper.ts:100-103`, `:255-256`) | blocking · proven | fix (round 2 of fixes): the comment says so; the main session checked `spawn.ts:355` and `spawn.ts:581` (`LIMEN_SETUP_KEEP` empty without setup; corrected from "continue.ts:581" after review round 3) |
| 2 | `## Fails before` can cite the reviewer's run of the two round-1 tests against `HEAD` | note · proven | fix in `outcome.md` |
| 3 | The time-limit order test plays a job without `pid`, so a regression in the `pid` handling would fail it for a second reason (`test-same-task.mjs:424`) | note · observed | fix: it plays a set-up job with `state` and `pid` (`RUNNING_AT_TIME_LIMIT`) |

Taste questions answered by the reviewer: T-29 (one reason per test, note 3), T-30 (one false clause, note 1), T-40
(no owner step), T-41 (no command).

## Round 3 (2026-11-18, day session)

- Inputs: the same `ticket.md` (with the round-1 and round-2 decisions), the diff from `review-guard.mjs diff --out
  node_modules/.rebuild-review/R-088.diff3`, `taste.md`.
- Main session before the review: `test-same-task.mjs` → 39/39; `gate.mjs` → exit 0, 96/96; `check.mjs` and Biome →
  exit 0.
- Guard: `review-guard.mjs compare node_modules/.rebuild-review/R-088.before3` → `unchanged`, exit 0.
- Parser: `review-verdict.mjs node_modules/.rebuild-review/R-088.reply3 <ticket.md>` → `consistent`, exit 0.
- Verdict: PASS. AC-1 to AC-5 met; the four new tests fail at `HEAD` at one assertion each (the reviewer's run); four
  notes, none blocking.

| # | Finding | Kind | Decision |
|---|---|---|---|
| 1 | One line of the `stopJobs` comment is 160 columns wide (`same-task.mjs:335`; T-27) | note · proven | Adrian (a third round): fix without a fourth review; rewrapped |
| 2 | "setting up" in the `isRunning` comment reads as the wrapper's setup, which the `stopJobs` comment names, and which runs after `state` (T-18) | note · proven | Adrian (a third round): fix without a fourth review; the comment says `state` comes after the worktree and before the wrapper |
| 3 | The outcome is stale for round 3 | note · proven | fix in the main session's record |
| 4 | The round-2 decision cites `continue.ts:581`; the line is `spawn.ts:581` | note · proven | fix in this file (round 2, row 1) |

After the two comment fixes: `node --test adrian-rebuild/tools/test-same-task.mjs` → 39/39; Biome and `check.mjs` →
exit 0. The one other line over 120 columns in `same-task.mjs` (the M-05 comment) dates from R-011 and is outside
this ticket.

Taste questions answered by the reviewer: T-29 (one reason per test), T-30 (the comments say why; the `stopJobs`
comment is long), T-18 (two meanings of "setup", note 2), T-40 (no owner step), T-41 (no command).
