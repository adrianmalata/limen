<!-- PL: Przebieg recenzji ticketu R-011 przez subagenta rebuild-reviewer według protokołu (strażnik review-guard.mjs
przed i po, parser review-verdict.mjs). Runda 1: FAIL z jednym znaleziskiem blokującym (sleep i limen status za słowem
kluczowym powłoki nie są liczone) i siedmioma uwagami; przy każdej decyzja sesji głównej z powodem. Runda 2: PASS
z sześcioma uwagami; trzy (zatrzymanie joba bez pliku state, kod 4 w gate-time, zła linia sesji) idą do drugiej,
ostatniej rundy poprawek, trzy odrzucone z powodem. Runda 3: PASS z czterema uwagami; limit dwóch rund poprawek
wyczerpany, więc uwagi idą do Adriana (pytanie Q-6) jako ewentualny nowy ticket. Stan: recenzja zamknięta. -->

# Review: R-011 The same-task runner and the gate-time tool

## Round 1 (2026-11-18, night run)

- Inputs: `adrian-rebuild/R-011-same-task-runner/ticket.md`, the diff from `review-guard.mjs diff --out
  node_modules/.rebuild-review/R-011.diff` (2,312 lines), `adrian-rebuild/taste.md`.
- Guard: `review-guard.mjs compare node_modules/.rebuild-review/R-011.before` → `unchanged`, exit 0.
- Parser: `review-verdict.mjs node_modules/.rebuild-review/R-011.reply <ticket.md>` → `consistent`, exit 0.
- Verdict: FAIL. AC-1 to AC-8 met; one blocking finding.

| # | Finding | Kind | Decision |
|---|---|---|---|
| 1 | A `sleep` or `limen status` behind a shell keyword is not counted: `while true; do sleep 30; done` gives `sleepCalls` 0 (`same-task.mjs:35-37`, `:338-339`) | blocking · proven | fix: a reserved word (`do`, `then`, `else`, `{`, `!`, `(`) may stand between the separator and the command; a test with a `while … do sleep` loop and a `for … do limen status` loop |
| 2 | A second or unrequested `prompt` response ends with a `TypeError` stack instead of the named protocol error (`pi-rpc.mjs:116-119`, `:155-157`; `same-task.mjs:203-206`) | note · observed | fix: B.2 needs the named error; a test with a second response |
| 3 | The injected clock drives only the runner's deadline and settle time; `pi-rpc.mjs` uses `Date.now()` and `setTimeout`, so the tests wait in real time (about 6 s in all) | note · observed | no change: the waits are real timers of tens of milliseconds, the whole file runs in under 7 s; an injected timer in the protocol module would add a moving part for no gain in reliability. The ticket's "no real wait" meant no wait of the real limits (3 h, 10 s, 60 s), which holds; the outcome records it as a deviation |
| 4 | The SHA contamination check does not strip the `--out` path, which the project-path check does (`same-task.mjs:316`, `:323-325`) | note · guessed | fix: both checks ignore the `--out` path alike (cheap, and one rule) |
| 5 | Quota-limit detection reads only `errorMessage`; the seat's detector also reads the text parts of an error turn (`same-task-session.mjs:90-94`; `docs/seat/quota-resume.ts:152-156`) | note · guessed | fix: read the text parts of an error turn too, as `quota-resume.ts` does, so a limit is never counted as a failure |
| 6 | A `run` refused after the clone removes `<out>` but not the parent directories that a recursive `mkdirSync` created (T-38) | note · observed | fix: `--out`'s parent must exist (refusal, exit 1, otherwise), and `<out>` is created without `recursive` |
| 7 | On exit 4, jobs that still run in the clone are named but not stopped, so they keep using the subscription | note · observed | fix: on exit 4 the runner runs `limen stop` for every running job, as at the time limit, and names any stop that failed |
| 8 | Unexpected exceptions exit 4 with a stack, where T-02 reserves 5 for internal errors (`same-task.mjs:613-615`) | note · observed | fix: an exception that is not a git, file-system or protocol failure exits 5 with its stack |

Taste questions answered by the reviewer: T-29 (one test per mechanism, except the M-05 test, which checks three
counts: fix, it becomes three tests; the six flow tests share one attempt by design, item 5), T-30 (the cited
identifiers resolve; the T-30 scan binds these tools only by analogy), T-40 (no Limen step added), T-41 (no Limen
command added).

## Round 2 (2026-11-18, night run)

- Inputs: the same `ticket.md` (with the round-1 decisions), the diff from `review-guard.mjs diff --out
  node_modules/.rebuild-review/R-011.diff2`, `taste.md`.
- Main session before the review: `review-guard.mjs compare --git node_modules/.rebuild-review/R-011-fix1.git
  <ticket.md>` → within its limits; `node adrian-rebuild/tools/gate.mjs` → exit 0, 82/82;
  `node --test adrian-rebuild/tools/test-same-task.mjs` → 32/32; `node --test adrian-rebuild/tools/test-gate-time.mjs`
  → 3/3.
- Guard: `review-guard.mjs compare node_modules/.rebuild-review/R-011.before2` → `unchanged`, exit 0.
- Parser: `review-verdict.mjs node_modules/.rebuild-review/R-011.reply2 <ticket.md>` → `consistent`, exit 0.
- Verdict: PASS. AC-1 to AC-8 met, every round-1 fix has its code and a test that failed before it; six notes, none
  blocking.

| # | Finding | Kind | Decision |
|---|---|---|---|
| 1 | A question the coordinator asks while a job still runs is never an owner turn, so it gets no reply and is not a touchpoint (`same-task.mjs:244-247`, `:402`) | note · observed | no change: the runner reads no reply text (AC-8), so it cannot tell such a question from "waiting for the job"; the text stays in `replies` for the reader; recorded as an open point for Adrian in `outcome.md` |
| 2 | At the time limit a job with no `state` file counts as running, but `limen stop` at `rebuild-base` needs `state`, so the stop fails and the job (for example one waiting in the start queue) runs on after the runner exits (`same-task.mjs:299-313`, `rebuild-base:src/commands/stop.ts:20`) | note · observed | fix (round 2): a job a stop could not end because it has no `state` yet is stopped again once it has one, polled for at most 10 minutes; one still not stopped is named with the command to run |
| 3 | `import.meta.main` exists only from Node 24.2.0 (`same-task.mjs:690`) | note · guessed | no change: the runner runs as the agents' account, whose Node is 26 (`input/prompt.md`, target environment), and the other laptop tools use the same guard |
| 4 | In `gate-time.mjs` a failed `git` call or evidence write exits 1, the same code as a failing gate (`gate-time.mjs:26-31`, `:85-87`, `:108`) | note · observed | fix (round 2): such a failure exits 4 with its reason, so it is told from a failing gate by the code |
| 5 | A session line that is not JSON and not the torn last line makes the summary throw after the attempt ended, so a multi-hour attempt leaves no `result.json` (`same-task-session.mjs:41-44`, `same-task.mjs:474-475`) | note · guessed | fix (round 2): the line is skipped and named in `result.json` → `sessionErrors` as `file:line: <reason>`, and the result is written; a test with a bad middle line |
| 6 | The M-05 matchers read raw shell text, so a separator inside quotes starts a command (`git commit -m "wip; sleep later"` counts as `sleep`) | note · observed | no change: both versions are counted by the same rule, so the before/after comparison holds; a shell parser would add a moving part for a rare case |

Taste questions answered by the reviewer: T-29 (one mechanism per test; the flow and M-05 suites share one attempt by
design), T-30 (reasons in comments, identifiers resolve, no SHA or name), T-40 (no Limen step), T-41 (no Limen
command).

## Round 3 (2026-11-18, night run)

- Inputs: the same `ticket.md` (with the round-1 and round-2 decisions), the diff from `review-guard.mjs diff --out
  node_modules/.rebuild-review/R-011.diff3`, `taste.md`.
- Main session before the review: `review-guard.mjs compare --git node_modules/.rebuild-review/R-011-fix2.git
  <ticket.md>` → within its limits; `node adrian-rebuild/tools/gate.mjs` → exit 0, 82/82;
  `node --test adrian-rebuild/tools/test-same-task.mjs` → 35/35; `node --test adrian-rebuild/tools/test-gate-time.mjs`
  → 4/4.
- Guard: `review-guard.mjs compare node_modules/.rebuild-review/R-011.before3` → `unchanged`, exit 0.
- Parser: `review-verdict.mjs node_modules/.rebuild-review/R-011.reply3 <ticket.md>` → `consistent`, exit 0.
- Verdict: PASS. AC-1 to AC-8 met, every round-2 fix has its code and a test that failed before it; four notes, none
  blocking.

The two rounds of fixes that the protocol allows are used, so no note is fixed in R-011. A fix is a new ticket, which
Adrian decides (`.night/questions.md`, Q-6 of the night of 2026-11-18); B.2 runs only after he has read them.

| # | Finding | Kind | Decision |
|---|---|---|---|
| 1 | The second stop runs as soon as `state` reads `running`, but at `rebuild-base` the wrapper writes `pid` later and `limen stop` needs it, so the second stop can fail in that window and the job runs on, named only on stderr (`same-task.mjs:335-350`; `rebuild-base:src/commands/spawn.ts:445`, `:504`, `src/runtime/wrapper.ts:102`, `src/commands/stop.ts:32`) | note · observed | for Adrian: a fix ticket would wait for `pid` as well (or for `running` plus `pid`) before the second stop and give the failed entry its `next` |
| 2 | The comment "(still setting up, or queued)" and the round-2 decision's "waits in the start queue" are wrong: a queued job already has `state` `running`; only a job before `spawn.ts:445` has none (`same-task.mjs:323-325`) | note · observed | for Adrian: the main session's round-2 decision carried the error; the comment is corrected in the same fix ticket. The decision text in `ticket.md` stays as written, this row corrects it |
| 3 | While `stopJobs` waits (up to 10 minutes), a wake from a finalized job could start a run that spawns a job missing from the list read at its start (`same-task.mjs:329`, `:503-511`) | note · guessed | for Adrian: whether a wake reaches the headless coordinator is B.2's seat check; a fix ticket would stop Pi before the stops, or read the job list again after them |
| 4 | The second-stop test uses the CLI's 10-minute `stateWaitMs`, so a regression would make it wait 10 minutes before it fails (`test-same-task.mjs:31`, `:376`) | note · observed | for Adrian: the same fix ticket gives the test a short bound |

Taste questions answered by the reviewer: T-29 (one reason per test; the slow failure of note 4), T-30 (one comment
states a wrong fact, note 2), T-40 (no Limen step), T-41 (no Limen command), T-14 (the owner message and the fixed
reply are literal).
