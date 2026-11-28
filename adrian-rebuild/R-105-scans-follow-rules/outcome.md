<!-- PL: Wynik R-105 (noc 28.11, przy `278430e`; recenzja PASS w rundach 1–3, decyzja 10 to domyślne nocne do
potwierdzenia): skan T-04 idzie po domknięciu przechodnim importów
każdego polecenia odczytu (czysta funkcja `readReach` z testami na fiksturach) i szuka nazw przejść stanu oraz prymitywów
czekania; dwie listy porównywane w obie strony: pliki mieszane `ticket.ts` → R-065 i `github.ts` → R-058 oraz moduły z
czekaniem nazwanym przyczyną. `ownerState` i spółka przeszły do `src/runtime/liveness.ts`, `queuedText` do
`listing.ts`, `isDayOnly` do `record.ts`, połowa odczytu kolejki do `src/runtime/queue-reading.ts`; skan T-26 łapie też
`startOutsideJob` i każde `startInScope`. Runda poprawek 1 (decyzja 11, F1–F3): cztery osobne testy porównania,
`own()` i `OTHER_BOOT` raz w `test/plant.ts`, każdy import z `timers/promises` jako czekanie i alias `startOutsideJob`
w skanie T-26, dwa nowe przypadki fikstur padające na skanie sprzed rundy. Runda poprawek 2 (decyzja 12, G1–G2):
fikstura modułu blokad ma osobny przypadek dla `withLock` i `moveLockedFolder`, każdy padający po usunięciu swojej nazwy
z `LOCK_WAITS`, a `test/lock.test.ts` bierze `OTHER_BOOT` z `test/plant.ts`. Bramka 1519/1519. -->

# R-105 outcome

Status: draft of the implementer, for the main session's gate, review and commit.

## Done

1. The T-04 scan (Change 1, `test/structure.test.ts`): `readReach` (`:1187`) walks the transitive closure of each read
   command's handler file over `importsOf`, with a queue and a seen set, so a cycle ends. It skips `import type` and
   `node:` modules, follows `import { type X, f }` and `export … from`, and finds (a) every import of a name of
   `STATE_TRANSITIONS`, which gains `recordRefusal` and `recordRateLimit`; (b) every wait of `moduleWaits` (`:1125`):
   an import of `setTimeout` from `node:timers/promises` (every import of that module since round 1, item 6), a
   `setTimeout` or `setInterval` called inside a `new Promise(…)`, and an import of `withLock` or `moveLockedFolder`
   from `src/lock.ts`; and (c) as `hidden`, a
   namespace or star import of a `src/` file, an import of a file that is no git-known file of `src/`, and a module the
   code computes. `importReach` judges one import. The old one-level `readTransitions` is gone, and with it the
   sentence "imports directly" (AC-9).
2. The two lists (Change 2): `MIXED_COMMAND_FILES` (`:1217`), `src/commands/ticket.ts` → R-065 and
   `src/commands/github.ts` → R-058, nothing else; `READ_WAITS` (`:1228`), ten modules, each with its reason: the 2 s
   sample of `limen seat queue` (`src/runtime/queue-reading.ts`, D-107 (3)), and nine waits of change operations,
   each named (`src/integrations/herdr.ts`, `src/job/group-cabinet.ts`, `src/job/record.ts`, `src/job/reference.ts`,
   `src/lock.ts`, `src/operation.ts`, `src/platform/linux.ts`, `src/project/seat.ts` as Decision 9 names it,
   `src/project/series.ts`). `unlistedTransitions` and `unlistedWaits` compare both ways: an unlisted finding and a
   stale entry both fail. Two tests hold them: "T-04: no read command's handler reaches a state-transition function
   through its imports, but those of the mixed command files" (`:1314`) and "T-04: no read command's handler reaches
   a wait through its imports, but the named bounded readings and waits of change operations" (`:1319`). A mixed
   file's entry covers what its read commands reach, transitions and waits alike, and is stale when they reach no
   transition (Night defaults, 2).
3. The moves (Change 3):
   - `src/runtime/liveness.ts` (new): `OwnerState`, `ownerState`, `ownerCheck`, `otherBoot`, `startingJob`, with the
     private `OwnerCheck`, `deadBecause` and the `gone` cache. `src/runtime/reap.ts` keeps the reaper,
     `processIdentity`, `liveJob`, `holdsProcesses`, `scopeHolds` and imports the four it uses. Callers repointed:
     `src/job/listing.ts`, `src/job/group-cabinet.ts`, `src/job/group-rounds.ts`, `src/commands/keeper.ts`,
     `src/picture/activity.ts`, `hook/wake.ts`, `src/job/migration.ts`, `src/runtime/pruning.ts`, `seat/deploy.ts`,
     `test/runtime/wrapper.test.ts`, `test/runtime/reap.test.ts`. The two tests of `ownerState` alone moved to
     `test/runtime/liveness.test.ts` (new), with `own()` and `OTHER_BOOT` from `test/plant.ts` since round 1 (item 6).
   - `queuedText` into `src/job/listing.ts`, its one caller, unexported.
   - `isDayOnly`, `dayOnlyTime` and `DAY_ONLY` into `src/job/record.ts`, beside `Landed`; `src/job/landing.ts` and
     `src/job/statistics.ts`, `test/cli/ticket.test.ts` and `test/job/statistics.test.ts` import them there.
   - `src/runtime/queue-reading.ts` (new): the eight names `queue-report.ts` imports (`GATE_FILE`, `gateOpen`,
     `ignoredText`, `queueEntries`, `readingText`, `readLoad`, `settleLeft`, `startGate`), their types (`StartGate`,
     `WaitLimits`, `Reading`, `Entry`, `GateFile`) and helpers (`SAMPLE_MS`, `queueDir`, `lastReading`, `readEntries`
     with R-104's `liveEntry`, `projectJob` and `realPath` unchanged, `parseEntry`, `entryState`, `percent`,
     `memoryFree`, `waitLimits` and the gate's defaults). `order` is exported as `startOrder`, since the waiting
     wrapper's `decide` needs it too. `src/runtime/start-queue.ts` and `src/runtime/queue-report.ts` import it, and so
     do `test/boundary.test.ts` and `test/plant.ts`. The six `startGate` tests and the two `queueEntries` tests moved to
     `test/runtime/queue-reading.test.ts` (new); the fixtures both test files need (`queueSeat`, `threeQueueEntries`,
     `foreignQueueEntry`, `seatOfQueueEntries`) moved to `test/plant.ts` (Deviations, 3).
   - Comments that named the old places follow (T-30): the headers of `reap.ts`, `start-queue.ts`, `queue-report.ts`,
     `test/runtime/reap.test.ts` and `test/runtime/start-queue.test.ts`, `src/job/statistics.ts:275`, and the R-016
     note of the `JSON_PARSE` ratchet (`test/structure.test.ts:207`).
4. The T-26 scan (Change 4): `STARTERS` (`:1881`) gains `startOutsideJob`, and `cliLaunches` (`:1950`) counts every
   call of `startInScope` (`SCOPE_START`, `:1895`), whatever its object starts; the launcher stays outside the scan.
   Two fixture tests: "the launch scan finds a start of bin/limen through the launcher's startOutsideJob, and skips
   one of another program" (`:2004`) and "the launch scan finds every call of the platform's startInScope, whatever
   its object starts" (`:2022`). The real-tree test (`:1979`) is renamed "… starts Limen's own CLI or a process in a
   user scope of the platform's".
5. Change 5 is the main session's (the `## Tickets` notes and the stale R-102 note); nothing here.
6. Review round 1 fixes (`ticket.md` → Decision 11; nothing else changed):
   - F1: the two comparison fixtures are four tests, each calling one function: "the comparison with the mixed command
     files finds each transition and hidden import that no entry covers" (`:1467`), "the comparison with the wait
     exceptions finds each wait that neither a mixed command file nor an exception covers" (`:1474`), "the comparison
     with the mixed command files finds an entry whose read commands reach no transition" (`:1481`) and "the
     comparison with the wait exceptions finds an entry that no read command outside the mixed command files reaches"
     (`:1486`). The two tests of unlisted findings share their findings (`COMPARED`, `:1458`) and the mixed file
     (`COMPARED_MIXED`, `:1453`).
   - F2: `own()` and `OTHER_BOOT` are defined once in `test/plant.ts` (`:660`, `:669`; `own` throws as the file's other
     helpers do, where the copies asserted), and `test/runtime/reap.test.ts` and `test/runtime/liveness.test.ts`
     import them; the plant's header names `own`.
   - F3: `moduleWaits` counts every import from `node:timers/promises` or `timers/promises` (`TIMER_PROMISES`,
     `:1104`) but `import type`: each name it takes, `default` included, as "imports <name> from <module>", and a
     namespace or star import as "imports every name of <module>". The launch scan follows a starter imported under
     another name: `starterAliases` (`:1926`) maps each local name of an `import { <starter> as <name> }` to the
     starter, and `startedName` (`:1939`) reads a call of that bare name as the starter's, so `cliLaunches` reports it
     by the starter's name. The new fixture cases: "the read walk finds a wait in every import from
     node:timers/promises or timers/promises, whatever its form or name" (`:1407`) and "the launch scan finds a start
     of bin/limen through startOutsideJob imported under another name" (`:2013`); both fail on the scan before the
     round (`## Proof` → Review round 1). The real tree's findings do not change: every import of the module in `src/`
     takes `setTimeout`, and no file of `src/` imports a starter under another name.
7. Review round 2 fixes (`ticket.md` → Decision 12; nothing else changed):
   - G1: the fixture "the read walk finds a wait in an import of withLock or moveLockedFolder from the lock module" is
     one case per name of `LOCK_WAITS` (`test/structure.test.ts:1438-1449`): "the read walk finds a wait in an import of
     withLock from the lock module" and "… of moveLockedFolder …". Each imports its name beside `lockPath` and an inline
     `type Guarded`, which stay no wait. The names are written out in the test, not read from `LOCK_WAITS`, so a name
     that leaves the set fails its own case; both runs are in `## Proof` → Review round 2. The places after `:1438`
     named in items 1–6 moved down by three lines.
   - G2: `test/lock.test.ts` imports `OTHER_BOOT` from `test/plant.ts` (`:14`) and its own copy is gone, so the value
     is defined once.

After the moves `show`, `status`, `stats`, `seat queue` and `picture serve` reach no transition, and `hook/wake.ts`
no longer loads `reap.ts` or `finalize.ts`: its direct modules (`wake-delivery.ts`, `wake-text.ts`, `old-names.ts`,
`coordinator-refusals.ts`, `mistake-guard.ts`, `pi-api.ts`, `herdr.ts`, `git.ts`, `seat.ts`, `record.ts`, `job.ts`,
`liveness.ts`) import none of the seven modules that import `reap.ts`, read by `grep` over their import lines.

## Proof

The first run, on the working tree at `278430e` with this ticket's change (before review round 1):

| Command | Exit | Result |
|---|---|---|
| `node --test test/structure.test.ts` (AC-1) | 0 | 67/67 |
| `node --test test/registry.test.ts` (AC-2) | 0 | 34/34 |
| `node --test test/runtime/reap.test.ts` (AC-3) | 0 | 13/13 |
| `node --test test/runtime/liveness.test.ts` (AC-3) | 0 | 2/2 |
| `node --test test/runtime/start-queue.test.ts` (AC-4) | 0 | 16/16 |
| `node --test test/runtime/queue-reading.test.ts` (AC-4) | 0 | 8/8 |
| `node --test test/runtime/wrapper.test.ts` (AC-4) | 0 | 34/34 |
| `node --test test/cli/status.test.ts` (AC-5) | 0 | 31/31 |
| `node --test test/cli/show.test.ts` (AC-5) | 0 | 4/4 |
| `node --test test/cli/stats.test.ts` (AC-5) | 0 | 18/18 |
| `node --test test/cli/sweep.test.ts` (AC-5) | 0 | 44/44 |
| `node --test test/job/statistics.test.ts` (AC-6) | 0 | 7/7 |
| `node --test test/cli/ticket.test.ts` (AC-6) | 0 | 15/15 |
| `node --test test/hook/wake.test.ts` (AC-6) | 0 | 26/26 |
| `git grep -q 'runtime/reap.ts"' -- src/job/listing.ts src/job/group-cabinet.ts src/picture/activity.ts hook/wake.ts` (AC-7) | 1 | no line |
| `git grep -q 'landing.ts"' -- src/job/statistics.ts` (AC-8) | 1 | no line |
| `git grep -q 'imports directly' -- test/structure.test.ts` (AC-9) | 1 | no line |
| `git grep -q 'R-065' -- test/structure.test.ts` (AC-10) | 0 | `:1208`, and the comparison fixtures |
| `git grep -q 'R-058' -- test/structure.test.ts` (AC-10) | 0 | `:1209` |
| `node adrian-rebuild/tools/fails-before.mjs` (AC-11) | 0 | the nine changed test files fail at HEAD |
| `node adrian-rebuild/tools/gate.mjs --out node_modules/.rebuild-review/R-105.gate` (AC-12) | 0 | 1514/1514, `fail 0`, `duration_ms 348174` |
| `npx biome check --error-on-warnings .` (AC-13) | 0 | 305 files, no fixes |
| `node adrian-rebuild/tools/check.mjs` (AC-13) | 0 | 0 errors |
| `npx tsc --noEmit` | 0 | no output |

The exit codes of AC-7 to AC-10 are read from `git grep -n` with the same patterns and paths: a listed line is exit 0,
no line is exit 1. The gate count is R-104's 1498 plus this ticket's 16 net new tests in `test/structure.test.ts`
(one T-04 test became two, eleven walk fixtures, two comparison fixtures, two launch fixtures); the moved tests keep
their count.

### Review round 1

The new fixture cases of F3, written first and run on the scan as it was before the round (`moduleWaits` and
`cliLaunches` unchanged): `node --test --test-name-pattern="whatever its form or name|imported under another name"
test/structure.test.ts` → exit 1, 0/2, each with nothing found:

```text
✖ the read walk finds a wait in every import from node:timers/promises or timers/promises, whatever its form or name (8.559448ms)
✖ the launch scan finds a start of bin/limen through startOutsideJob imported under another name (2.94287ms)
ℹ tests 2
ℹ pass 0
ℹ fail 2

✖ the read walk finds a wait in every import from node:timers/promises or timers/promises, whatever its form or name (8.559448ms)
  AssertionError [ERR_ASSERTION]: Expected values to be strictly deep-equal:
  + actual - expected

  + []
  - [
  -   'src/job/a.ts: wait: imports scheduler from timers/promises',
  -   'src/job/a.ts: wait: imports setInterval from timers/promises',
  -   'src/job/b.ts: wait: imports default from node:timers/promises',
  -   'src/job/c.ts: wait: imports every name of timers/promises',
  -   'src/job/d.ts: wait: imports every name of node:timers/promises'
  - ]

✖ the launch scan finds a start of bin/limen through startOutsideJob imported under another name (2.94287ms)
  AssertionError [ERR_ASSERTION]: Expected values to be strictly deep-equal:
  + actual - expected

  + []
  - [
  -   'src/job/a.ts:3: startOutsideJob'
  - ]
```

F1 and F2 move and split tests and change no mechanism, so no test of theirs is new to fail before. After the round,
on the same working tree:

| Command | Exit | Result |
|---|---|---|
| `node --test test/structure.test.ts` (AC-1) | 0 | 71/71 |
| `node --test test/runtime/liveness.test.ts test/runtime/reap.test.ts` (AC-3) | 0 | 15/15 (2 and 13) |
| `git grep -q 'imports directly' -- test/structure.test.ts` (AC-9) | 1 | no line |
| `git grep -q 'R-065' -- test/structure.test.ts` (AC-10) | 0 | `:1218`, and the comparison fixtures (`:1453`, `:1483`) |
| `git grep -q 'R-058' -- test/structure.test.ts` (AC-10) | 0 | `:1219` |
| `node adrian-rebuild/tools/gate.mjs --out node_modules/.rebuild-review/R-105.gate` (AC-12) | 0 | 1518/1518, `fail 0`, `duration_ms 346238` |
| `npx biome check --error-on-warnings .` (AC-13) | 0 | 305 files, no fixes |
| `node adrian-rebuild/tools/check.mjs` (AC-13) | 0 | 0 errors |
| `npx tsc --noEmit` | 0 | no output |

The gate count is the first run's 1514 plus four: the two comparison fixtures became four tests (F1), and F3 added
two fixture cases. The exit codes of AC-9 and AC-10 are read as in the first run.

### Review round 2

G1 changes no mechanism, so the proof that each case checks its name is a run with that name taken out of
`LOCK_WAITS`, made in the working tree and undone after each run (the set is again `["withLock", "moveLockedFolder"]`).
With `new Set(["withLock"])`, `node --test test/structure.test.ts` → exit 1, 71/72, the one failure the new case:

```text
✖ the read walk finds a wait in an import of moveLockedFolder from the lock module (1.062937ms)
  AssertionError [ERR_ASSERTION]: Expected values to be strictly deep-equal:
  + actual - expected

  + []
  - [
  -   'src/job/a.ts: wait: imports moveLockedFolder from src/lock.ts'
  - ]
```

Every other test passed in that run, the real-tree wait test included: the two modules of `src/` that import
`moveLockedFolder` import `withLock` beside it (`src/runtime/pruning.ts:28`, `src/runtime/retiring.ts:18`), so before
this round nothing failed when `moveLockedFolder` left the set (review round 2, note 1). With `new Set(["moveLockedFolder"])` → exit 1, 70/72: the `withLock` case fails with
`+ []` against `- [ 'src/job/a.ts: wait: imports withLock from src/lock.ts' ]`, and so does the real-tree test "T-04: no
read command's handler reaches a wait through its imports, …", whose six lock entries (`src/job/group-cabinet.ts`,
`src/job/record.ts`, `src/job/reference.ts`, `src/operation.ts`, `src/project/seat.ts`, `src/project/series.ts`) turn
stale. G2 moves a constant and changes no mechanism. After the round, on the restored tree:

| Command | Exit | Result |
|---|---|---|
| `node --test test/structure.test.ts` (AC-1) | 0 | 72/72 |
| `node --test test/lock.test.ts` | 0 | 21/21 |
| `node adrian-rebuild/tools/gate.mjs --out node_modules/.rebuild-review/R-105.gate` (AC-12) | 0 | 1519/1519, `fail 0`, `duration_ms 352860` |
| `npx biome check --error-on-warnings .` (AC-13) | 0 | 305 files, no fixes |
| `node adrian-rebuild/tools/check.mjs` (AC-13) | 0 | 0 errors |
| `npx tsc --noEmit` | 0 | no output |

The gate count is round 1's 1518 plus one: the lock fixture became two cases (G1).

## Fails before

`node adrian-rebuild/tools/fails-before.mjs` → exit 0, the main session's runs of protocol step 4 after its gate
(1514/1514, 349.2 s) and again after review round 1's fixes and their gate (1518/1518, 348.1 s), each with this first
line:

```text
fails-before: test/boundary.test.ts, test/cli/ticket.test.ts, test/job/statistics.test.ts, test/runtime/reap.test.ts, test/runtime/start-queue.test.ts, test/runtime/wrapper.test.ts, test/structure.test.ts, test/runtime/liveness.test.ts, test/runtime/queue-reading.test.ts fail at HEAD (exit 1)
```

and after review round 2's fixes and their gate (1519/1519, 348.3 s), the final tree, with `test/lock.test.ts` (G2)
among them (it fails at `HEAD` through `test/plant.ts`, whose shared fixtures import the new
`src/runtime/queue-reading.ts`):

```text
fails-before: test/boundary.test.ts, test/cli/ticket.test.ts, test/job/statistics.test.ts, test/lock.test.ts, test/runtime/reap.test.ts, test/runtime/start-queue.test.ts, test/runtime/wrapper.test.ts, test/structure.test.ts, test/runtime/liveness.test.ts, test/runtime/queue-reading.test.ts fail at HEAD (exit 1)
```

The tests of the mechanism, at HEAD's code:

- "T-04: no read command's handler reaches a state-transition function through its imports, but those of the mixed
  command files", the first run of the new test on HEAD's `src/` (`node --test test/structure.test.ts`, before any
  move), fails with 20 unlisted findings over the five reads, the mixed entries not stale:

  ```text
  +   unlisted: [
  +     'picture serve: src/job/finalize.ts imports transition',
  +     'picture serve: src/runtime/reap.ts imports finalizeJob',
  +     'picture serve: src/runtime/reap.ts imports writeStuck',
  +     'seat queue: src/job/finalize.ts imports transition',
  +     'seat queue: src/runtime/reap.ts imports finalizeJob',
  +     'seat queue: src/runtime/reap.ts imports writeStuck',
  +     'seat queue: src/runtime/start-queue.ts imports transition',
  +     'show: src/job/finalize.ts imports transition',
  +     'show: src/runtime/reap.ts imports finalizeJob',
  +     'show: src/runtime/reap.ts imports writeStuck',
  +     'show: src/runtime/start-queue.ts imports transition',
  +     'stats: src/job/finalize.ts imports transition',
  +     'stats: src/job/landing.ts imports writeMarker',
  +     'stats: src/job/publication.ts imports publishRecord',
  +     'stats: src/runtime/reap.ts imports finalizeJob',
  +     'stats: src/runtime/reap.ts imports writeStuck',
  +     'status: src/job/finalize.ts imports transition',
  +     'status: src/runtime/reap.ts imports finalizeJob',
  +     'status: src/runtime/reap.ts imports writeStuck',
  +     'status: src/runtime/start-queue.ts imports transition'
  +   ]
  ```

- "T-04: no read command's handler reaches a wait through its imports, …", the end of the `fails-before.mjs` output
  above (with the final `READ_WAITS`):

  ```text
    {
  +   stale: [
  +     'src/runtime/queue-reading.ts'
  +   ],
  +   unlisted: [
  +     'picture serve: src/runtime/reap.ts calls setTimeout in a promise',
  +     'seat queue: src/runtime/reap.ts calls setTimeout in a promise',
  +     'seat queue: src/runtime/start-queue.ts imports setTimeout from node:timers/promises',
  +     'show: src/runtime/reap.ts calls setTimeout in a promise',
  +     'show: src/runtime/start-queue.ts imports setTimeout from node:timers/promises',
  +     'stats: src/runtime/pruning.ts imports moveLockedFolder from src/lock.ts',
  +     'stats: src/runtime/pruning.ts imports withLock from src/lock.ts',
  +     'stats: src/runtime/reap.ts calls setTimeout in a promise',
  +     'status: src/runtime/reap.ts calls setTimeout in a promise',
  +     'status: src/runtime/start-queue.ts imports setTimeout from node:timers/promises'
  +   ]
  -   stale: [],
  -   unlisted: []
    }
  ```

- `test/runtime/liveness.test.ts` and `test/runtime/queue-reading.test.ts`
  (`node adrian-rebuild/tools/fails-before.mjs <file>`, exit 0 each): `ERR_MODULE_NOT_FOUND`, `Cannot find module
  '…/src/runtime/liveness.ts'` and `'…/src/runtime/queue-reading.ts'`. The other six changed test files fail at HEAD
  only on their repointed imports (a moved test or a moved name), not on a new mechanism.
- The walk's eleven fixtures, the two comparison fixtures and the two launch fixtures run the scan their own file
  defines, so `fails-before.mjs`, which lays the whole new `test/structure.test.ts` over HEAD, runs them on the new
  scan and they pass there. The two launch fixtures fail on HEAD's scan by its source: HEAD's `STARTERS`
  (`git show HEAD:test/structure.test.ts`, lines 1519-1527) has no `startOutsideJob`, and HEAD's `cliLaunches` (lines
  1558-1579) counts a call only when its callee is in `STARTERS`, so both fixtures give `[]` where they expect one line.
  Not run: a copy of HEAD's scan with the two fixtures, written outside the repository, was refused by the night's
  permissions (Write outside the repository).
- Review round 1: the two new fixture cases of F3 were run on the scan before the round, in the working tree, before
  `moduleWaits` and `cliLaunches` changed; both fail there with nothing found (`## Proof` → Review round 1).

## Deviations from the ticket

1. Change 2 lists "the Herdr and systemd probes of `limen status`" among the wait exceptions. Change 1 (b)'s three
   forms do not find them: they are `spawnSync` calls with a `timeout` (`src/project/summary.ts:470`, 5 s, and
   `:533`, 2 s; `platform.userUnitState`, `UNIT_QUESTION_TIMEOUT_MS` 3 s, `src/platform/linux.ts:62`), so an entry for
   them would match no finding, and Change 2's own rule fails a stale entry. `READ_WAITS` holds only what the scan
   finds; the `limen status` modules it does find (`herdr.ts`'s retry, `linux.ts`'s scope-start poll) are waits of
   change operations, named so.
2. Tests beyond Change 1's fixture list, one mechanism each (T-29 (3)): an import of a file git does not know; the wait
   fixture split into its three forms; the tests of the comparison, since review round 1 four, one per function and
   result (the unlisted findings and the stale entries of `unlistedTransitions` and of `unlistedWaits`).
3. `test/plant.ts` changed, a file the ticket does not name: the start-queue fixtures that
   `test/runtime/start-queue.test.ts` and the new `test/runtime/queue-reading.test.ts` both need moved there, renamed
   for that module (`seat` → `queueSeat`, `threeEntries` → `threeQueueEntries`, `foreignEntry` → `foreignQueueEntry`,
   `homeOf` → `seatOfQueueEntries`), instead of a copy in each file (T-25 (2)). Its header names them.
4. The T-26 real-tree test's name grew by "or a process in a user scope of the platform's", since it now also fails on
   any `startInScope` call outside the launcher.
5. New doc comments on moved code that had none: `queueDir`, `lastReading`, `startOrder` (`src/runtime/queue-reading.ts`).

## Night defaults

For Adrian to confirm in the morning (D-054 (2) (b), technical choices inside `## Change`; the main session took them
into `ticket.md` → Decision 10):

1. The walk lives in `test/structure.test.ts` beside the other scans and their fixtures, not in `test/imports.ts`
   (inventory section 6 left the place open).
2. A mixed command file's entry covers its read commands' waits as well as their transitions, so `READ_WAITS` lists
   only what the clean reads reach; when R-058 or R-065 removes its entry, the waits those reads still reach must then
   be named there or cut.
3. `order` of the start queue is exported from `queue-reading.ts` as `startOrder`.
4. The shared start-queue fixtures live in `test/plant.ts` (Deviations, 3).

## Unmeasured

- M-10: the gate's run time on this laptop was 348 s with 1514 tests, 346 s with 1518 after review round 1, and 353 s
  with 1519 after review round 2; the stage's measurement is taken at its tag.

## Open points

1. A walk over modules cannot tell which function of a module a read calls (Decision 8): a read that called a
   function of `src/job/record.ts` that takes the job's lock would still pass the wait scan, since the module is
   listed, and only the read test's read-only `.limen/` catches the lock. The ten `READ_WAITS` reasons were read from
   each module's own uses of its wait primitive at this tree (`grep -n "withLock\|groupLock\|delay(" …`), not proven
   by a test per function.
2. `moduleWaits` reads the three forms of Change 1 (b), the first widened in review round 1 to every import from
   `node:timers/promises` or `timers/promises`; a synchronous wait (`Atomics.wait`, a `spawnSync` of `sleep`) would
   still pass it. None is in `src/` today.
3. Closed in review round 2 (G2): the third `OTHER_BOOT`, in `test/lock.test.ts`, is now imported from
   `test/plant.ts`.
