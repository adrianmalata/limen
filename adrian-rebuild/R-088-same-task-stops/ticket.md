<!-- PL: Ticket R-088 etapu 1 przebudowy (pair, w dzień, D-027): poprawki narzędzia same-task z uwag rundy 3
recenzji R-011, przed pomiarem B.2. Drugi stop joba czeka na `state` i `pid`, Pi zatrzymuje się przed stopami jobów,
komentarz o jobie w kolejce mówi prawdę, a test drugiego stopu ma krótki limit. Stan: zamknięty commitem R-088
(18.11). -->

# R-088 The same-task runner leaves no job running after an attempt

## Problem

The four notes of round 3 of R-011's review (`R-011-same-task-runner/review.md` → Round 3), quoted:
1. "The second stop runs as soon as `state` reads `running`, but at `rebuild-base` the wrapper writes `pid` later and
   `limen stop` needs it, so the second stop can fail in that window and the job runs on, named only on stderr
   (`same-task.mjs:335-350`; `rebuild-base:src/commands/spawn.ts:445`, `:504`, `src/runtime/wrapper.ts:102`,
   `src/commands/stop.ts:32`)".
2. "The comment "(still setting up, or queued)" and the round-2 decision's "waits in the start queue" are wrong: a
   queued job already has `state` `running`; only a job before `spawn.ts:445` has none (`same-task.mjs:323-325`)".
3. "While `stopJobs` waits (up to 10 minutes), a wake from a finalized job could start a run that spawns a job
   missing from the list read at its start (`same-task.mjs:329`, `:503-511`)" (guessed).
4. "The second-stop test uses the CLI's 10-minute `stateWaitMs`, so a regression would make it wait 10 minutes before
   it fails (`test-same-task.mjs:31`, `:376`)".

Relied on:
- D-027 (Adrian, 2026-11-18): "the four round-3 notes of R-011's review get a fix ticket before B.2: R-088, stage 1,
  size S, by day: `pair`, so it runs in a day session and never in a night run".
- `plan.md` → `## Tickets`, notes, R-088: "wait for `pid` as well before the second stop, stop Pi before the job stops
  (or read the job list again after them), correct the comment on a queued job's `state`, and give the test of the
  second stop a short bound (D-027)."
- At `rebuild-base`, `limen stop` reads `state`, then `pid`, and refuses a running job without a valid pid
  (`src/commands/stop.ts:32`: "running job … has no valid pid").
- D-021 (4) and `## Deployment` B.2: an attempt runs in a clean copy, and "After every attempt, the runner's stderr
  names no job left running (R-088, D-027)".
- T-29: one test, one mechanism; T-30: a comment states a true reason.

## Change

1. `adrian-rebuild/tools/same-task.mjs`:
   - `readJobs` also reads each job's `pid` file.
   - `stopJobs`: every running job is stopped once, as today; a job whose stop failed while it had no `state` or no
     `pid` is polled until it has both (state `running` and a pid), then stopped again; one that is gone or no longer
     running drops out; one that still lacks them after `timing.stateWaitMs` is named with the command to run, as
     today, and the message says which file is missing.
   - The comment on `stopJobs` (and on `isRunning`) says that a job has no `state` before `spawn` writes it and no
     `pid` before its wrapper writes it, and that a queued job has both.
   - `timeUp` and `stopAfterFailure` stop Pi (`pi.stop` with the attempt's `termMs` and `killMs`) before they stop the
     jobs, so that no wake can start a coordinator run that spawns a job the list misses; the `finally` that stops Pi
     again stays and is harmless for a stopped Pi.
2. `adrian-rebuild/tools/test-same-task.mjs`, written first:
   - The fake `limen` takes its options as an object; its late-setup mode writes both `state` and `pid` when it
     acts out a job that finishes setting up, and a new mode writes only the `pid` (a job with `state` but no `pid`).
   - New: "a job that has its state but no pid when the time limit comes is stopped again once its pid exists"
     (fails before: no second stop).
   - New: "at the time limit Pi is stopped before any job is stopped" (the fake Pi records its stdin's close; the fake
     `limen` records whether that record exists at each call; fails before: Pi was only aborted).
   - The test of the second stop passes a short `stateWaitMs`, so a regression fails within seconds.
3. `adrian-rebuild/tools/fake-pi-rpc.mjs`: on its stdin's close it records `{ "closed": true }` before it exits.

## Out of scope

- The behaviour of `limen stop` itself (stage 3 rewrites stop and the record).
- The evaluation, the report and the RPC protocol module (`pi-rpc.mjs`).

## Acceptance

- AC-1: `node --test adrian-rebuild/tools/test-same-task.mjs` → exit 0.
- AC-2: the two new tests fail on the code before the change (run with the tests in place and the code unchanged;
  recorded in `outcome.md` under `## Fails before`).
- AC-3: `node adrian-rebuild/tools/check.mjs` → exit 0; `npx biome check --error-on-warnings adrian-rebuild` → exit 0.
- AC-4: `node adrian-rebuild/tools/gate.mjs` → exit 0.
- AC-5 (judgment): after the change no job stop runs while Pi can still start a run, and the comments on `stopJobs`
  and `isRunning` state the facts of note 2.

## Migration

none: a rebuild tool; no on-disk format of Limen changes.

## Risk

- Stopping Pi before the jobs ends the coordinator's last turn earlier than an abort did; the progress check after the
  time limit reads the clone, not Pi, so it is unchanged.
- A job whose wrapper never writes `pid` (it died during setup) is named after `stateWaitMs`, as a job without `state`
  is today; B.2 watches stderr for such a line (`## Deployment` B.2).

## Rollback

`git revert $(git log --format=%H --grep='^R-088:' adrian-rebuild --)`; no migration.

## Decisions

- 2026-11-18 (main session, while implementing): one late mode of the fake `limen` serves both windows (a missing
  `state` or a missing `pid`; it writes whichever is missing), instead of a second mode. With `pid` read by
  `readJobs`, every fake job without a `pid` file looked like one in the window before the wrapper's write, so a
  test whose fake stop fails waited the CLI's ten minutes; the fake Pi now writes a `pid` for a set-up job (a step's
  `pid: null` acts out the window), and the tests' common timing has `stateWaitMs` of 3 s, so no test can wait ten
  minutes (note 4 for every test, not only the second-stop test).
- 2026-11-18 (main session, review round 1, `review.md`): fix the test's comment on a queued job (blocking), the
  `TIMING` comment, the `stopJobs` comment (both pid writes), the PL header's width and the outcome's `## Fails
  before`; add a test of the "still has no pid" line and one of Pi stopped before the jobs at exit 4. `stateWaitMs`
  keeps its name; `jobs[]` in `result.json` carrying `pid` is accepted; notes 8 and 9 (guessed) are rejected with
  their reasons in `review.md`.
- 2026-11-18 (main session, review round 2, the second and last round of fixes): the `stopJobs` comment says that a
  wrapper that owes setup or queues writes its `pid` at once, which covers every job `spawn` starts
  (`LIMEN_SETUP_KEEP`), and that one with neither writes it after its engine starts; the time-limit order test plays
  a set-up job with `state` and `pid`; the outcome cites the reviewer's run against `HEAD`.
- 2026-11-18 (Adrian, after review round 3, a third round of fixes): the two comment notes (the 160-column line of
  the `stopJobs` comment; "setting up" in the `isRunning` comment) are fixed without a fourth review; the tests,
  Biome and `check.mjs` run again.
