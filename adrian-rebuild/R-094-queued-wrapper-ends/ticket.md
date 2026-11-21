<!-- PL: Ticket R-094 (D-063 (3)): wrapper joba czekającego w kolejce startu kończy się, gdy znika folder joba, zamiast
odpytywać kolejkę bez końca; sprzątanie testowej „plant” zatrzymuje także wrappery czekające w kolejce, które nie mają
jeszcze silnika; budżet 2 s testu kolejki w test/s3-finish-wake.test.ts przestaje zależeć od obciążenia maszyny.
Stan: napisany 21.11 w dzień (autopilot D-063 (4)) przy drzewie po R-093; po rundach 1 i 2 recenzji doszły
poprawki (test prawdziwego wrappera, forma testu kolejki odporna na obciążenie, folder odtworzony przez blokadę);
zamknięty 21.11. -->

# R-094 A queued wrapper ends when its job folder is gone; tests stop their wrappers

## Problem

In the gate of R-022's review round 2, the unchanged queue test "a held gate queues jobs by priority …"
(`test/s3-finish-wake.test.ts`) failed once: the job `timed`, spawned with `--timeout 2s`, ended `failed`
(`R-022-exact-job-references/outcome.md`, `assert.equal(waitJob(p, timed), "done")`). Adrian's decisions, quoted from
`plan.md` → `## Decisions`:

- D-063 (2): "The one failure … was measured, not rerun for a green result: 10 of 10 runs passed alone on R-022's
  tree and 10 of 10 at `HEAD` (through `fails-before.mjs`), so the trees do not differ. Five orphaned wrappers from
  the night's gate runs (started at 03:55, queued, their plants deleted, polling every 50 ms, about 7 % CPU each;
  labels `late`, `old`, `say half`, `orphan`, `f owned`) were stopped by the session with his consent."
- D-063 (3): "A new ticket R-094, stage 2, size S, `delegated`, `night`, after R-093 (both change `test/plant.ts`): a
  queued wrapper's `waitForStart` (`src/runtime/start-queue.ts`) ends when its job folder is gone, with a fixture
  test; the tests stop the wrappers they start even when they fail midway; the 2 s budget of the queue test does not
  depend on the machine's load."

The facts at R-093's tree:

1. `waitForStart` (`src/runtime/start-queue.ts`) loops `while (!stop.aborted)`: each poll `enqueue` writes the job's
   queue entry again when it is missing (with `mkdir … { recursive: true }` of the queue's `entries` folder), `decide`
   reads the queue, and the loop sleeps `pollMs()` (`LIMEN_START_POLL_MS`, 50 ms in a plant). Nothing in the loop
   reads the job's own folder, so a wrapper whose folder is gone polls until it is killed. After the loop, the
   wrapper (`src/runtime/wrapper.ts`) reads the record and calls `finalizeJob` when `waitForStart` returns false.
2. `launchWrapper` (`src/runtime/wrapper.ts`) starts the wrapper as `node <bin/limen>` and passes the job folder
   through the environment (`LIMEN_JOB_DIR`), so the wrapper's command line does not hold the plant's path.
3. The plant's `cleanup` (`test/plant.ts`) runs `pkill -f <plant folder>`, which ends the engines ("Engines carry the
   plant path in argv"), and then removes the plant folder. A queued wrapper has no engine yet and no plant path in
   its command line, so `pkill` misses it and the removal leaves it polling: the five wrappers of D-063 (2).
4. The queue test spawns `timed` with `--timeout 2s` and waits until it has been queued for more than 2.5 s, to show
   that "a 2s timeout counts from engine start, not the queue"; at the end `timed` starts its engine and must end
   `done` inside those 2 s, so a loaded machine (the gate runs test files in parallel; the five wrappers added about
   35 % of one CPU) can end it `failed`.

## Change

1. `src/runtime/start-queue.ts` (and `src/runtime/wrapper.ts` as needed): a queued wrapper whose job folder is gone
   stops waiting at its next poll, removes its queue entry, writes nothing into the missing folder (no record, no log,
   no `start-notice`), recreates no folder of the job, and exits; no engine starts. A fixture test in
   `test/runtime/start-queue.test.ts`: a job queued behind a held gate whose folder is removed ends within a few polls,
   with no entry left in the queue and the folder still absent.
2. `test/plant.ts`: `cleanup` also stops every wrapper the plant started, a queued one included, before it removes the
   plant folder; it runs from the suites' `after` hooks, so it runs when a test fails midway. A test in
   `test/plant.test.ts`: after `cleanup`, no process of a wrapper the plant started is alive (a queued job's included).
3. `test/s3-finish-wake.test.ts`, the queue test: `timed` still shows that a queued job's timeout counts from its
   engine start, and whether it ends `done` no longer depends on how long its engine takes on a loaded machine (the
   implementer picks how; `outcome.md` names the margin and why it holds).

## Out of scope

- A job folder moved (not deleted) while its job is queued; no command moves a queued job's folder today.
- The other `pkill -f` users and the test files' own timeouts.
- Q-11 (R-022's round-3 notes).

## Acceptance

- AC-1: `node --test test/runtime/start-queue.test.ts` → exit 0 (the fixture test of change 1).
- AC-2: `node --test test/plant.test.ts` → exit 0 (the test of change 2).
- AC-3: `node --test test/s3-finish-wake.test.ts` → exit 0.
- AC-4: `node adrian-rebuild/tools/fails-before.mjs` → exit 0, its output in `outcome.md` → `## Fails before`, which
  names every new or changed test that passes at `HEAD`, with the reason.
- AC-5: `node adrian-rebuild/tools/gate.mjs` → exit 0.
- AC-6: `npx tsc --noEmit` → exit 0; `npx biome check --error-on-warnings .` → exit 0;
  `node adrian-rebuild/tools/check.mjs` → exit 0.
- AC-7 (judgment): a queued wrapper whose folder is gone ends without writing into it; the plant's cleanup reaches a
  wrapper with no engine; the queue test still proves that the timeout counts from engine start, and its `done` does
  not hang on a wall-clock budget that a loaded machine can miss.

## Migration

None: no format on disk changes.

## Risk

- Change 1 ends a queued job without a terminal record when its folder is gone; there is no folder to hold one.
- Change 2 stops processes by what the plant recorded; it must stop only the plant's own wrappers.

## Rollback

`git revert $(git log --format=%H --grep='^R-094:' adrian-rebuild --)`.

## Decisions

- 2026-11-21 D-063 (2) and (3) (Adrian): quoted in `## Problem`.
- 2026-11-21 (main session, review round 1, `review.md` → Round 1, finding 8): the plant's cleanup stops every process
  that carries the plant's own `LIMEN_HOME` (wrappers, engines, coordinator sessions, tool children), not only
  wrappers; the Risk line's point is that no process outside the plant is touched, and the exact environment entry on
  a fresh temporary path keeps that.
- 2026-11-21 (main session, review round 1; the first round of fixes, for a fresh `rebuild-implementer`):
  - Fix 1 (finding 1): a test in the repository drives a real queued wrapper (through the plant, as `limen spawn`
    starts it) whose job folder is removed, and shows that the wrapper exits, that no engine and no setup run, and
    that the folder stays absent; with the "gone" branch of `src/runtime/wrapper.ts` falling through, it fails.
  - Fix 2 (finding 2): the queue test's proof that "a timeout counts from engine start, not the queue" takes a form
    that load cannot break, for example the reviewer's: `timed` runs an engine that blocks until its timeout ends it,
    and the test asserts that it was queued longer than its timeout and that its end comes at least the timeout after
    its engine start (load can only lengthen both); the other assertions of the test follow the job's new end. If the
    implementer finds a simpler form with the same property, it says why in `outcome.md`. No budget of the test may
    then rest on how fast an engine runs.
  - Fix 3 (finding 3): `stopProcesses` in `test/plant.ts` scans again after each kill until no process of the plant
    is left (bounded, failing `cleanup` as now when one survives).
  - Fix 4 (finding 4): the helper's exit check uses `platform.processInfo` (`src/platform/`) instead of its own `/proc`
    stat reading.
  - Fix 6 (finding 6): the fixture test's name and its bound agree.
- 2026-11-21 (main session, review round 2, `review.md` → Round 2; the second and last round of fixes, for a fresh
  `rebuild-implementer`):
  - Fix R2-1 (finding 1): `waitForStart` also ends as "gone" when the job's record is gone (a folder that the lock's
    `mkdir` recreated after a removal holds no record), and writes no `log` line into such a folder; a fixture test
    in `test/runtime/start-queue.test.ts` with a job folder that holds no record (removed, then recreated empty)
    shows that the wait ends as "gone". The empty folder that the lock may leave stays an open point (round 1,
    finding 7).
  - Fix R2-2 (finding 2): the plant's kill in `test/plant.ts` goes through `platform.signalProcess` instead of its own
    signal policy.
  - Fix R2-3 (finding 3): `docs/jobs.md` → "Stop and loss" says that a queued job whose folder is removed ends at its
    next poll, starts no engine and leaves no terminal record.
