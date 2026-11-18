<!-- PL: Wynik ticketu R-088: narzędzie same-task zatrzymuje Pi przed zadaniami, a zadanie bez `state` albo `pid`
zatrzymuje ponownie, gdy ma oba; komentarze mówią, kiedy zadanie nie ma tych plików, a testy mają krótki limit
czekania, więc regresja pada w sekundach. Dowody: cztery nowe testy padają na kodzie z HEAD, po zmianie jest 39/39,
bramka 96/96, check.mjs i Biome z kodem 0; recenzja PASS w rundzie 3. Stan: zamknięty commitem R-088. -->

# Outcome: R-088 The same-task runner leaves no job running after an attempt

## Done

- `adrian-rebuild/tools/same-task.mjs`:
  - `readJobs` reads each job's `pid` too.
  - `stopJobs`: every running job is stopped once; a job whose stop failed while it lacked `state` or `pid`
    (`missingForStop`) is polled until it is `running` with a `pid`, then stopped again; one that is gone or no longer
    running drops out; one still lacking a file after `stateWaitMs` is named with the command to run, and the line and
    the stop record say which file is missing (`no state` or `no pid`).
  - The comments on `isRunning` and `stopJobs` say when a job has no `state` (before `spawn` writes it) and no `pid`
    (before its wrapper writes it), and that a queued job has both (note 2).
  - `timeUp` and `stopAfterFailure` stop Pi (`stopPi`: `pi.stop` with the attempt's `termMs` and `killMs`) before the
    jobs (note 3); `stopAfterFailure` takes `pi`; the `finally` that stops Pi again is harmless for a stopped Pi (the
    attempts end with exit 0 and 4 as before).
- `adrian-rebuild/tools/fake-pi-rpc.mjs`: records `{ "closed": true }` when its stdin closes; a set-up job gets a
  `pid` file unless the step says `pid: null`.
- `adrian-rebuild/tools/test-same-task.mjs`:
  - The fake `limen` takes `{ exit, late, record }` and records `piClosed` at each call; its late mode writes the
    missing `state` and `pid`.
  - The common timing has `stateWaitMs: 3000` (note 4, for every test).
  - New: "a job that has its state but no pid when the time limit comes is stopped again once its pid exists" and
    "at the time limit Pi is stopped before any job is stopped, so no wake can spawn a job the stops miss"; after
    review round 1 also "a job that never gets a pid is named as lacking its pid once the wait bound passes" and "on
    exit 4 Pi is stopped before any job is stopped".
  - Two tests compare only `argv` and `cwd` of the fake `limen`'s calls, since the calls now also carry `piClosed`.
  - The comment on the scenario without `state` no longer says a queued job lacks it (review round 1).
- `result.json` → `jobs[]` now carries each job's `pid`, since `summarize` uses `readJobs`; `evaluate` and `report` do
  not read it (review round 1, accepted).

## Proof

| Criterion | Command | Exit | Result |
|---|---|---|---|
| AC-1 | `node --test adrian-rebuild/tools/test-same-task.mjs` | 0 | tests 39, pass 39, fail 0 (12.5 s; again after the comment fixes of round 3) |
| AC-3 | `node adrian-rebuild/tools/check.mjs` | 0 | `… ticket folders: 6; … 0 errors` |
| AC-3 | `npx biome check --error-on-warnings adrian-rebuild` | 0 | `Checked 28 files … No fixes applied.` |
| AC-4 | `node adrian-rebuild/tools/gate.mjs` | 0 | tests 96, pass 96, fail 0 |

The first run after the change did not end within 300 s and was stopped: with `pid` read, the fake jobs had no `pid`
file, so the test "on exit 4 a limen stop that fails is named" waited the CLI's 10 minutes for one. The fake Pi then
got its `pid` file and the tests' timing a 3 s bound (`ticket.md` → `## Decisions`).

## Fails before

AC-2: the tests in place, `same-task.mjs` unchanged → `node --test adrian-rebuild/tools/test-same-task.mjs` → exit 1,
tests 37, pass 35, fail 2:

```
✖ a job that has its state but no pid when the time limit comes is stopped again once its pid exists
    actual: [ [ 'stop', 'w1', 'same-task time limit' ] ],
    expected: [ [ 'stop', 'w1', 'same-task time limit' ], [ 'stop', 'w1', 'same-task time limit' ] ],
✖ at the time limit Pi is stopped before any job is stopped, so no wake can spawn a job the stops miss
    actual: [ false ],
    expected: [ true ],
```

That run was before the fake Pi wrote `pid` files. The reviewer of round 1 ran the final tests against `HEAD`'s
`same-task.mjs`, served from memory by a module load hook with no change to the tree: tests 5 (filtered by name),
pass 3, fail 2, the same two failures (one `stop` instead of two; `piClosed` `[false]` instead of `[true]`).

The reviewer of round 2 ran all four new tests against `HEAD`'s `same-task.mjs` in the same way: all four fail, each
at one assertion ("stopped again once its pid exists": one `stop` instead of two; "at the time limit Pi is stopped
before": `piClosed` `[false]`; "never gets a pid": no "still has no pid" line, only `limen stop w1 failed (exit 1)`;
"on exit 4 Pi is stopped before": `piClosed` `[false]`). After round 2 the time-limit order test plays a job with its
`state` and `pid`; at `HEAD` it fails on the same `piClosed` `[false]`, as the test "a job that never ends reaches
the time limit" did before its comparison was narrowed to `argv` and `cwd`.

## Judgment criteria

AC-5 (judgment): `timeUp` awaits `stopPi` before `stopJobs`, and `stopAfterFailure` does the same inside its `try`,
so no job stop runs while Pi can start a run; the comments on `isRunning` and `stopJobs` state the facts of note 2.

## Deviations from the ticket

- One late mode of the fake `limen` instead of two, and the fake Pi's `pid` file with the common 3 s bound
  (`ticket.md` → `## Decisions`).
- Two comment fixes after review round 3, by Adrian's decision, without a fourth review (`ticket.md` →
  `## Decisions`).

## Measurement

Unmeasured here: that the real `limen stop` at `rebuild-base` and the real Pi behave as the fakes do. B.2 checks it
on the seat: after every attempt the runner's stderr names no job left running (`plan.md` → `## Deployment` B.2).

## Open points

None.
