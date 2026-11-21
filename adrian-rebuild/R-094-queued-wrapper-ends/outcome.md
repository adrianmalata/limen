<!-- PL: Wynik R-094 (szkic po drugiej rundzie poprawek, 21.11): `waitForStart` zwraca, jak skończyło się czekanie w
kolejce startu (`started`, `stopped`, `gone`); gdy nie ma rekordu joba (folder usunięty albo odtworzony pusty przez
blokadę), wrapper kończy przy następnym odpytaniu bez setupu i silnika i nie pisze do folderu, co pokazują testy w
test/runtime/start-queue.test.ts i test/runtime/wrapper.test.ts. `cleanup` testowej „plant” zabija SIGKILL-em przez
`platform.signalProcess` każdy proces ze środowiskiem `LIMEN_HOME` tej plant i listuje procesy ponownie, aż nie
zostanie żaden. Test kolejki w test/s3-finish-wake.test.ts dowodzi liczenia timeoutu od startu silnika przedziałami,
które obciążenie może tylko wydłużyć, a docs/jobs.md opisuje koniec joba w kolejce bez folderu; bramka 515/515
(także w przebiegu sesji głównej). Recenzja runda 3: PASS; trzy uwagi o kodzie i testach czekają na pytanie Q-12.
Stan: zamknięty. -->

# R-094 outcome

## Done

1. A queued wrapper ends when its job folder is gone (change 1).
   - `src/runtime/start-queue.ts`: `waitForStart` returns how the wait ended, the new type `QueueEnd` =
     `"started" | "stopped" | "gone"`, instead of a boolean. It checks that the job's record (`record.json`, by
     `recordPath`) exists before each poll, again after the poll's decision, and after each record change of the poll
     (round 2, fix R2-1). The folder can go while the wrapper sleeps or samples the load (`readLoad` samples for 2 s on
     the seat); and a folder removed while a record change takes the job's lock comes back empty, because `acquire` in
     `src/lock.ts` runs `mkdir(dirname(lock), { recursive: true })`. Round 1 checked only the folder, so such a wrapper
     wrote its `queued:` line into the recreated folder and polled on until it was killed (`review.md` → Round 2,
     finding 1). When the record is gone it returns `"gone"` at once: no `start-notice`, no log line, no record change.
     Its `finally` still removes the queue entry, and it skips the `queued: null` transition then, because the job has
     no record and the lock of that transition could create the folder again.
   - `src/runtime/wrapper.ts`: `runInternalJob` returns at `"gone"` without `finalizeJob`, so it ends the job with no
     record and starts no setup and no engine; `"stopped"` is finalized as before.
   - `test/runtime/start-queue.test.ts`: two fixture tests run `waitForStart` in-process behind a held gate (a fixed
     reading of 10 % CPU idle), polling every 20 ms, through one helper, `whileQueued`, which waits for the wait's
     `queued:` log line and stops the wait before the seat folder goes. The first removes the job folder and asserts
     that the wait ends with `"gone"`, the queue entry is gone and the folder is still absent (round 1's test with the
     same assertions; round 2 moved its setup into the helper, which the second shares). The second (round 2,
     fix R2-1) removes the folder and creates it again, empty, in one synchronous step, so the wait, which runs in the
     same process, never sees the folder missing; it asserts that the wait ends with `"gone"`, the entry is gone and
     the folder holds no file. Their bound is 250 polls (5 s) and only ends the test of a wait that never returns; the
     names claim no number of polls (round 1, fix 6). A passing run returns at the first poll after the change (52 ms
     and 46 ms for the whole tests alone).
   - `test/runtime/wrapper.test.ts` (new, round 1, fix 1): a real wrapper, started by `limen spawn` in a plant, queued
     behind a closed gate; the test removes its job folder after its `queued:` log line and waits, at most 10 s, until
     the wrapper and its process group have ended. It asserts that the wrapper exited, that the folder is still absent,
     and that the worktree of a job that finished before is still there. Each assertion is a witness: setup's first
     step prunes finished worktrees (`src/runtime/job-setup.ts`), so the worktree shows that no setup ran; the engine
     runs in the wrapper's process group and the fake engine writes its records into the job folder, so the empty
     group and the absent folder show that no engine ran.
2. The plant's `cleanup` stops every process the plant started (change 2).
   - `test/plant.ts`: `cleanup` first runs `stopProcesses(parent)`. It lists `/proc` and takes every process whose
     environment holds the entry `LIMEN_HOME=<plant folder>` (the plant sets that test knob, and the wrapper, the engine
     and every process they start inherit it, `src/config.ts`) and that the platform adapter does not report `absent`
     (`platform.processInfo`, `src/platform/`: gone or a zombie; round 1, fix 4). It sends each one SIGKILL through
     `platform.signalProcess` (round 2, fix R2-2), waits 20 ms, and lists the processes again, until a listing finds
     none (round 1, fix 3): a process can start another one between the listing and its signal, and that one inherits
     the plant's environment too. The adapter maps `ESRCH` to `missing`, a process that exited after the listing and
     needs no signal, and `EPERM` to `denied`, which fails `cleanup` at once with the pids of that round (`## Choices`
     9). A process of the plant still running after 10 s fails `cleanup` with its pids, and the folder stays for
     inspection. Then `pkill -f <plant folder>` runs as before, for a process with the plant path in its argv but not
     the plant's environment, and then the folder is removed. SIGKILL, not SIGTERM: a stopped process holds a SIGTERM
     until it continues (`## Open points` 1), and a wrapper that ends normally writes into the folder `cleanup` removes
     next. The helper's own `/proc/<pid>/stat` reading (`processExited`) and its own `kill`, which copied the adapter's
     handling of `ESRCH`, are gone.
   - `test/plant.test.ts`: a test with a running job (its engine at `block`) and a queued job (the gate closed, its
     poll 600 s, so it cannot notice by itself that its folder is gone) asserts that both wrappers run before `cleanup`
     and that neither runs after it. Its `t.after` signals, for a `cleanup` that misses one, only a live process whose
     start time equals the record's `identity.born`.
   - Every test file already called `cleanup` from its `after` or `t.after` hook (all 78 call sites before this
     ticket); the two new tests call it from `t.after` too, so it runs when a test fails midway.
3. The queue test no longer rests on a wall-clock budget (change 3; round 1, fix 2): `test/s3-finish-wake.test.ts`,
   "a held gate queues jobs by priority …".
   - `timed` runs `block` with `--timeout 2s` (`TIMED_TIMEOUT_MS`, back to `HEAD`'s value). Its engine blocks until
     the timeout ends it, so `timed` now ends `failed`, with the failure kind `timeout`.
   - Before the release, the test waits until more than the timeout has passed since `timed`'s first `queued:` log
     line. After the job, it asserts that `timed` waited longer than the timeout in the queue (from its first
     `queued:` line to its `start queue: started` line) and that it ended at least the timeout after its engine
     started (from its `worker started` line to the record's `finishedAt`). Why that holds under any load: `## Margin`.
   - The other assertions follow the new end: `waitJob(p, timed)` gives `failed`; the comment at the SIGSTOP names
     `timed`, which now ends by its timeout while its listener sleeps, before its start notice; the start order reads
     the same log helper (`logged`), and the wakes stay as they were (`timed`'s one finish wake carries its start line).
4. `docs/jobs.md` → "Start queue" → "Stop and loss" (round 2, fix R2-3) says that a queued job whose folder is removed
   ends at its next poll: its wrapper leaves the queue and exits, no engine starts, and no terminal record is left,
   since the folder that would hold it is gone.

## Margin

There is no budget left that an engine's speed could miss. Both intervals the test asserts are lower bounds that load
can only lengthen:

- Queued: the test writes to `timed`'s pipe only once more than 2 s have passed since `timed`'s first `queued:` line,
  and `timed` cannot leave the queue before that write, so its `start queue: started` line comes later still. A slow
  machine only delays the write and the start.
- Ran: the wrapper starts its timer after it logs `worker started` (`src/runtime/wrapper.ts`: the log line, then
  `setTimeout(…, timeoutMs)`), and the record's `finishedAt` is written after the timer fired, the escaped processes
  were listed (`ps`), the group got its TERM and `finalizeJob` took the lock. A slow machine only delays each step.
  The bound is `>=` because the timer can fire up to a millisecond early on its rounded loop clock; the steps between
  the timer and `finishedAt` take far longer than that.

The test still fails when the queue counts against the timeout (`## Proof`): the wrong timer fires at once, and the
job ends 18–25 ms after its engine started.

Wall time of the queue test: 6.1 s at `HEAD` with `HEAD`'s form (the draft's measure); with this form 7.0 s and 7.5 s
alone, 7.0 s at `HEAD` in the `fails-before` run, and 12.1 s in the gate (four files in parallel). The draft's 5 s
timeout had made it 8.2 s alone.

## Proof

All from the repository root, on the final tree of round 2:

- `node adrian-rebuild/tools/gate.mjs` → exit 0; `tests 515`, `pass 515`, `fail 0`, `cancelled 0`, `skipped 0`,
  `duration_ms 103773.58816` (511 at `HEAD`, the draft's 2 new tests, round 1's wrapper test and round 2's fixture
  test). Its `npm run check` ran `tsc --noEmit` and `biome check --error-on-warnings .` ("Checked 214 files … No fixes
  applied.") before the tests. An earlier run of round 2, before a change of one doc comment
  (`QueueEnd`'s), gave the same: exit 0, 515/515.
- `node adrian-rebuild/tools/check.mjs` → exit 0 ("… PL summaries: 160 files; ticket folders: 28; changes: 26
  entries; 0 errors"), run with this `outcome.md` in place.
- `npx biome check --error-on-warnings adrian-rebuild` → exit 0 ("Checked 32 files … No fixes applied.").
- `npx tsc --noEmit` → exit 0; `npx biome check --error-on-warnings .` → "Checked 214 files … No fixes applied." (both
  inside the gate's `npm run check`).
- AC-1 `node --test test/runtime/start-queue.test.ts` → exit 0, 6/6.
- AC-2 `node --test test/plant.test.ts` → exit 0, 4/4.
- AC-3 `node --test test/s3-finish-wake.test.ts` → exit 0, 7/7.
- `node --test test/runtime/wrapper.test.ts` → exit 0, 1/1.
- AC-4 `node adrian-rebuild/tools/fails-before.mjs` → exit 0 (`## Fails before`).
- Round 2, fix R2-1, the new fixture test written first and run on round 1's tree (the folder check only):
  `node --test test/runtime/start-queue.test.ts` → exit 1, `tests 6`, `pass 5`, `fail 1`:

  ```
  ✖ a job queued behind a held gate whose folder is recreated without its record stops waiting, leaves the queue and writes nothing into the folder (5026.75495ms)
    AssertionError [ERR_ASSERTION]: Expected values to be strictly deep-equal:
    + actual - expected

      {
        entry: false,
        files: [],
    +   outcome: 'still waiting'
    -   outcome: 'gone'
      }
  ```

  The recreated folder exists, so round 1's check let the wait poll on to the test's bound. After the fix the same
  command → exit 0, 6/6.
- Round 2, fix R2-1, the check after a record change (a scratch script in the session's temporary folder, not a
  repository test; `## Open points` 3): the script queues a job in-process as the fixture does, but reads its load
  from a pipe, and holds the job's lock (`withLock` of `src/lock.ts`) while it writes the reading. The wait decides,
  sees its record, and waits for the lock in its record change; 300 ms later the script removes the folder, creates
  it again empty, and returns, so the wait takes the lock in the recreated folder. The script prints how the wait
  ended and the folder's files. On the final tree, 5 of 5 runs: `{"outcome":"gone","files":[]}`. With the three lines
  of the check after the record change removed for the run: 5 of 5 `{"outcome":"gone","files":["log"]}` (the wait
  wrote its `queued:` line into the recreated folder and ended at the next poll). With round 1's
  `src/runtime/start-queue.ts` for the run: 3 of 3 `{"outcome":"still waiting","files":["log"]}`, the symptom of
  `review.md` → Round 2, finding 1. The file was restored after each run (`cmp` with a copy: identical) before the
  final gate run. The script's own lock release then throws `LOCK_LOST`, as its lock went with the folder.
- Round 2, fix R2-2: no new test. The plant test of change 2, the wrapper test and the gate run `cleanup` through
  `platform.signalProcess` and pass; the `denied` path needs a process of the plant that the test's user may not
  signal (`## Open points` 6).
- Round 1, fix 1, the wrapper test with the `"gone"` branch of `src/runtime/wrapper.ts` removed for the run (the three
  lines `if (queueEnd === "gone") { return; }`, so a gone job falls through to setup): `node --test
  test/runtime/wrapper.test.ts` → `pass 0`, `fail 1`, in 3 of 3 runs of the final form (and 4 of 4 of the earlier
  form of `## Choices` 5):

  ```
  ✖ a queued wrapper whose job folder is removed exits without running its setup or its engine and recreates no folder (1575.304177ms)
    AssertionError [ERR_ASSERTION]: Expected values to be strictly deep-equal:
    + actual - expected

      {
        exited: true,
        folder: false,
    +   prunedWorktree: true
    -   prunedWorktree: false
      }
  ```

  The setup ran and pruned the finished job's worktree, then its first log write into the missing folder threw, so
  the wrapper ended through `failInternalJob` (no record, nothing written) before any engine. The lines were restored
  before the gate run (the file's diff is the draft's again, blob `f045c99`). Round 2 does not change that file.
- Round 1, fix 2, the queue test with `src/runtime/wrapper.ts` changed for the run so that the time in the queue counts
  against the timeout (`configuredTimeout` minus `Date.now() - Date.parse(queued.since)`): `node --test
  --test-timeout=180000 --test-force-exit test/s3-finish-wake.test.ts` → `pass 6`, `fail 1`, the queue test:
  `AssertionError: queued 2761 ms, ran 18 ms`, `actual: { failure: null, queued: true, ran: false }` (the negative
  limit's text, "timeout after -761ms", has no failure kind). With the remaining time clamped to at least 1 ms
  (`Math.max(1, …)`), the same command, run twice: the queue test failed in both for one reason, `queued 2960 ms, ran
  25 ms` and `queued 2763 ms, ran 18 ms`, `actual: { failure: 'timeout', queued: true, ran: false }`; the second run
  → `pass 6`, `fail 1`, and the first showed one more failure (`## Open points` 5). The line was restored before the
  gate run.
- Round 1, fix 3 (a scratch script in the OS temporary folder, not a repository test): a plant process that forks a
  child every few milliseconds while `cleanup` runs. Against a copy of the draft's single listing (kill the listed
  pids, wait for them), a child of the plant survived in 6 of 10 runs; against round 1's `cleanup`, in 0 of 10. Every
  survivor was killed by the script. Round 2 changes only how the signal is sent (fix R2-2), not the listing.
- After every run above, `pgrep -af limen-plant` found only the process of `## Open points` 1, which predates this
  ticket.

## Fails before

`node adrian-rebuild/tools/fails-before.mjs` (every new or changed file under `test/` laid over `HEAD`) → exit 0:

```
fails-before: test/plant.test.ts, test/runtime/start-queue.test.ts, test/s3-finish-wake.test.ts, test/runtime/wrapper.test.ts fail at HEAD (exit 1)
      entry: false,
      files: [],
  +   outcome: 'still waiting'
  -   outcome: 'gone'
    }
  
      at file:///tmp/fails-before-9hEecK/test/runtime/start-queue.test.ts:123:10
      at async whileQueued (file:///tmp/fails-before-9hEecK/test/runtime/start-queue.test.ts:61:3)
…
    actual: { outcome: 'still waiting', entry: false, files: [] },
    expected: { outcome: 'gone', entry: false, files: [] },
…
test at test/runtime/wrapper.test.ts:41:1
✖ a queued wrapper whose job folder is removed exits without running its setup or its engine and recreates no folder (12629.557856ms)
  AssertionError [ERR_ASSERTION]: Expected values to be strictly deep-equal:
  + actual - expected
  
    {
  +   exited: false,
  -   exited: true,
      folder: false,
      prunedWorktree: false
    }
…
    actual: { exited: false, folder: false, prunedWorktree: false },
    expected: { exited: true, folder: false, prunedWorktree: false },
```

The tool prints the last 40 lines, so its output starts inside the second failure and holds no counts. The same run
through a copy of the tool that prints every line (a scratch file: the tool's code with only its import path and its
line limit changed) → exit 0, `tests 18`, `pass 15`, `fail 3`, the failures:

```
✖ a job queued behind a held gate whose folder is removed stops waiting, leaves the queue and recreates nothing (5108.909192ms)
✖ a job queued behind a held gate whose folder is recreated without its record stops waiting, leaves the queue and writes nothing into the folder (5099.012699ms)
✖ a queued wrapper whose job folder is removed exits without running its setup or its engine and recreates no folder (12667.485363ms)
```

At `HEAD` no poll reads the job's folder or record, so both in-process waits run to their bound, and the real wrapper
polls until the test's 10 s bound; the plant's new `cleanup`, laid over `HEAD` with it, ends that wrapper.

Two new or changed tests pass in that run, each for its reason:

- "cleanup stops every wrapper the plant started, a queued one with no engine included" (`test/plant.test.ts`): its
  subject is `test/plant.ts`, which the tool lays over `HEAD` too, so that run tests the new `cleanup`. The draft's
  run laid over `HEAD` alone, `node adrian-rebuild/tools/fails-before.mjs test/plant.test.ts` → exit 0, `pass 3`,
  `fail 1` (`no wrapper of the plant runs after cleanup`, `actual: [false, false]`, `expected: [true, true]`); neither
  that test nor `HEAD`'s `test/plant.ts` changed since, so this round did not run it again.
- "a held gate queues jobs by priority …" (`test/s3-finish-wake.test.ts`): `HEAD`'s wrapper already counts the timeout
  from engine start; the round changes the test's form, not the mechanism, so it passes at `HEAD` as after. The
  mutation in `## Proof` shows that it fails when the queue counts against the timeout.

## Choices

1. The plant finds its processes by its environment (`LIMEN_HOME=<plant folder>`, the exact entry), not by the
   records' `identity.pid`: a wrapper whose folder is gone, or a job folder outside the plant's root (a workspace, a
   second checkout), has no record cleanup can read, while every process of the plant carries the plant's
   `LIMEN_HOME`. A process cannot hold that entry by chance: the folder is a fresh `mkdtemp` path. The test process is
   skipped by its pid. A process the adapter reports `unavailable` still counts as running, so cleanup signals it
   again until it is `absent` or the 10 s pass.
2. The fixture tests and the wrapper test wait for the `queued:` log line, not for the record's `queued.detail`: a
   first draft removed the folder when the record changed, while the wrapper still held the job's lock, and the
   release threw `LOCK_LOST` (`## Open points` 2). The log line follows the transition, so the lock is free and the
   wrapper sleeps to its poll.
3. `test/plant.test.ts` keeps its own `exited`: the test's check stays independent of the helper it tests, and the test
   runs on `HEAD`'s `test/plant.ts` (`## Fails before`).
4. The plant test makes the queued job's poll 600 s (`LIMEN_START_POLL_MS` for that spawn): with change 1 a queued
   wrapper ends by itself soon after its folder goes, so a 50 ms poll would let the test pass without change 2 in
   some runs.
5. The wrapper test is a new file, `test/runtime/wrapper.test.ts`, named after the module whose branch it checks
   (T-29 (1)). It reads the wrapper's end through `ownerState` (`src/runtime/reap.ts`), the production check of a
   recorded identity, and its group through `platform.processGroupAlive`. It waits for the group as well as the
   wrapper: in one run of an earlier form, which read the group once right after the wrapper's exit, the exited wrapper
   was still a member of its group (a zombie not yet reaped), so that form could fail with no engine.
6. The queue test measures the queue from the first `queued:` log line, not from the record's `startedAt` or
   `queued.since`: the line comes after both, so the interval is a lower bound of the time in the queue; `queued` is
   `null` in the terminal record. It measures the run from the `worker started` line, which comes before the timer.
7. The timeout is 2 s again: no budget rests on it now, and it sets only how long the test waits (about twice the
   timeout).
8. Round 2, fix R2-1: the wait asks whether `record.json` exists (`existsSync(recordPath(jobDir))`, as
   `src/job/migration.ts` does), not whether the folder exists and not through `readRecord`. A removed folder has no
   record, so one check covers both cases of the fix; a record that exists but is damaged is not "gone" and is left to
   the record's readers, which report it; and the check reads no file, so a poll costs one `stat` more, not a parse.
   It runs before the poll, after the decision and after the record change, the three points where the record can
   have gone since the last one: the sleep, the load's sample, and the lock of the change.
9. Round 2, fix R2-2: a `denied` signal fails `cleanup` once every pid of the round got its signal, instead of
   waiting for the 10 s bound, because a later round cannot signal that process either; the error names the pids and
   the plant, and the folder stays, as for a process that outlives the bound. Round 1's `kill` threw on `EPERM` at
   once as well.

## Deviations from the ticket

- Change 2 says "stops every wrapper the plant started"; `cleanup` stops every process of the plant (wrappers,
  engines, coordinator sessions a test started, tool children), each one named by the plant's own `LIMEN_HOME`. The
  boundary is the plant, as `pkill -f <plant folder>` drew it before; no process of another plant or of the seat is
  touched (the Risk line). Accepted in `ticket.md` → `## Decisions` (review round 1, finding 8).
- Change 3: `timed` now ends `failed` by its timeout instead of `done` (`ticket.md` → `## Decisions`, fix 2).
- `src/lock.ts` creates a lock's folder when it takes the lock; this ticket does not change it (`## Open points` 3).
- Round 2 adds none: fixes R2-1, R2-2 and R2-3 are made as `ticket.md` → `## Decisions` gives them.

## Measurement

No M-NN applies: the changes are measured here (the tests, the mutations and `## Margin`). The queue test's share of
the gate's run time is part of M-10 at the stage's close.

## Open points

1. A leftover process from before this ticket: pid 1509615, `node …/limen-plant-SAR0bR/bin/pi --session-dir …`, the
   `coord` session of `test/s3-finish-wake.test.ts` (`PI_SESSION_ID=coord`, `LIMEN_HOME` under the gate's private
   temporary folder), started at 07:14:49 on 2026-11-21, state `T` (stopped), 0.0 % CPU, its plant folder gone. The
   queue test stops that session with SIGSTOP and continues it after `waitJob(p, timed)`; the test failed in between
   (R-022's gate, `timed` ended `failed`), so the session stayed stopped, and a stopped process holds the SIGTERM of
   `session.kill()` and of `pkill`. The new `cleanup` ends such a process with SIGKILL. This run left it as it is;
   `kill -KILL 1509615` ends it.
2. A job folder removed while its wrapper holds the job's lock (during a record write) makes the lock's release throw
   `LOCK_LOST`; the wrapper then ends through `failInternalJob`, which finds no record and writes nothing, and exits
   with code 1. It still starts no engine; only the path is an error instead of `"gone"`.
3. Review round 1, finding 7, race 1: `transition` checks that the folder exists before it takes the lock, and
   `acquire` (`src/lock.ts`) creates the lock's folder; a removal between the two leaves an empty job folder with no
   record. Since round 2 (fix R2-1) the wait no longer stays alive in such a folder and writes nothing into it: the
   record check after the change ends it as `"gone"` before its log line, and the check before each poll ends it at
   the next poll. The empty folder itself can stay; it is an open point by `ticket.md` → `## Decisions` (round 2, fix
   R2-1), for gate 5.2. The check after the change has no repository test: the removal must land between
   `transition`'s existence check and the lock's `mkdir`, which run in one step of the wrapper, and
   `src/job/record.ts`, outside the ticket's change, gives `transition` no injection point; the evidence is the
   scratch run of `## Proof`, which holds the job's lock from outside to keep the record change waiting.
4. Review round 1, finding 7, race 2: a removal between the start decision (`decide`, which writes `last-start` and
   removes the entry under the queue's lock) and the record check after it makes `waitForStart` return `"gone"` for a
   job that never starts, while `last-start` says one started, so the next job waits one settle interval more. Not
   fixed here (`review.md` → Round 1); for gate 5.2.
5. A failure seen once, in a mutation run: during round 1's fix 2 runs with the clamped mutation
   (`src/runtime/wrapper.ts` counting the queue against the timeout, which in this file's plant touches every job,
   since the plant's gate is on and every job passes through the queue for a few milliseconds), one run showed, before
   the queue test's entry in the reporter's list of failures, a second failure: an `AssertionError` with `1 !== 0`
   (`actual: 1`, `expected: 0`, `strictEqual`, `generatedMessage: false`). The file's only such assertion is
   `wokeOnce`'s "<name> woke its session once" (`test/s3-finish-wake.test.ts`, line 87), used by the first three tests
   and the last one; listed before the queue test, it was most likely one of the first three. The test's name and
   message were above the 30 lines that `tail` kept, so which test and which job are not known. The next run with the
   same mutation (run to read the whole output of the queue test's failure) failed only the queue test; the unchanged
   tree passed the file 7/7 before and after, round 1's gate 514/514 and the `fails-before` run its four `wokeOnce`
   tests; round 2's gate (515/515) and its run of the file (7/7) passed them as well. The mutation shortened the jobs' timeouts by their few milliseconds in the queue (the 3 s `b timeout` and the
   90-minute default), which should not change a wake count, so this may be a double wake that predates this ticket.
6. The re-listing of round 1's fix 3 has no repository test: a process that starts between the listing and its signal
   cannot be made to start there without an injection point in the helper, and a test that relies on a fork landing
   in that window would fail by chance. The evidence is the scratch run of `## Proof` (6 of 10 against 0 of 10). The
   `denied` path of round 2's fix R2-2 has none either: it needs a process that carries the plant's `LIMEN_HOME` and
   that the test's user may not signal, which only another user, or a privilege change the gate does not have, can
   make.
