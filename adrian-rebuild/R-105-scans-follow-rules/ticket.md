<!-- PL: Ticket R-105 (T-04, T-26, D-107, D-116): skan T-04 czyta dziś tylko bezpośrednie importy, a wszystkie 9
poleceń odczytu dochodzi przechodnio do funkcji przejścia stanu; skan idzie więc po domknięciu przechodnim, `ownerState`,
`startingJob`, `queuedText`, `isDayOnly` i część odczytu kolejki startowej przechodzą do modułów bez przejść, dwa
mieszane pliki poleceń zostają ratchetem z ticketami końcowymi R-058 i R-065, a skan obejmuje też prymitywy czekania
(D-116 (1)). Skan uruchomień T-26 łapie też `platform.startInScope` i `startOutsideJob`. Stan: napisany 26.11 przy
`c2513a9` z inwentarza `evidence/inventories/R-105.md`; `ready` za R-104. -->

# R-105 The T-04 and T-26 scans follow what their rules name

## Problem

T-04's Rule: "Read commands […] never write and never wait"; its Check: "a test asserts that every read command
leaves `.limen/` byte-identical and returns without waiting; a test runs them on a read-only copy of `.limen/`; the
command registry marks each command read or change, and read commands do not import the state-transition functions";
its dated line of D-107 (3): "a read may take a bounded reading of an outside system, each bound named here: `limen
status`'s Herdr and systemd probes (2–5 s each, among them two 3 s probes of user units, R-032) and `limen seat
queue`'s 2 s sample of the machine; the read test keeps these as its exceptions." T-26's Check: "a scan finds no launch
of Limen's own CLI (spawn or exec of `limen`) in `src/`". The note in `## Tickets` (D-107; R-032 `outcome.md` → Open
point 1 and `ticket.md` → Decision 16; R-026 `outcome.md` → Open point 3): "T-04's scan reads direct imports only, while
read commands reach state-transition functions through their imports […], so the scan follows the transitive closure,
with `ownerState` and `queuedText` moved into modules with no transition and the mixed command files kept as a ratchet
naming their end tickets; T-26's launch scan sees `node:child_process` only, so a start through `platform.startInScope`
outside `launcher.ts` passes." D-116 (Adrian, 2026-11-26): "(1) Q-69: R-105's transitive scan also covers T-04's
"never wait": no wait primitive (a lock taken with a wait, a `sleep`, a loop over `setTimeout`) is reachable from a
read command, except the bounded readings that T-04 names by D-107 (3), each a named exception; no wall-clock test. (2)
Q-70: R-105's ratchet names R-058 as the end of `src/commands/github.ts` and R-065 as the end of
`src/commands/ticket.ts` […]. (3) Q-71: R-105 depends on R-104, since both change `src/runtime/start-queue.ts`." The
plan's ratchet convention: "A scan that cannot hold at once over the author's code […] starts as a ratchet: a baseline
count in the repo that may only fall". T-25 (1) and (2); T-29 (1), (3), (6).

Facts at `c3bbc5c` (the read-only inventory `evidence/inventories/R-105.md`; R-104 runs first and changes
`readEntries` and `entryState` in `src/runtime/start-queue.ts`, so the night re-reads those lines at its HEAD, D-025):
1. The T-04 scan (`test/structure.test.ts:1097-1133`) takes the registry's `kind: "read"` commands (9: `show`,
   `status`, `stats`, `ticket check`, `seat queue`, `github status`, `github doctor`, `github ensure`, `picture serve`),
   maps each handler to its file, and reads that file and the `src/` modules it imports directly, one level, for the
   names of `STATE_TRANSITIONS` (`:1082-1096`: `transition`, `finalizeJob`, `writeMarker`, `publishRecord`,
   `reapDeadJobs`, `confirmDeadJobs`, `writeStuck`, `writeOwedWake`), skipping `import type`. It has no exceptions: R-102
   removed `READS_WITH_TRANSITIONS` (`a26d5f4`), so the R-102 note on the `rule` exception is stale. Its parser is
   `importsOf` (`test/imports.ts:28-67`, the TypeScript syntax tree); `importedFile` (`test/structure.test.ts:1399-1402`)
   resolves `./` and `../` paths, and every relative import of `src/` ends in `.ts"`; `src/` has no dynamic `import(`
   (`test/structure.test.ts:83-96`).
2. All 9 reads reach a transition transitively (inventory 3.2): `show` and `status` through `src/job/listing.ts:7` →
   `src/runtime/reap.ts` and `listing.ts:8` → `src/runtime/start-queue.ts`; `status` also through
   `src/project/summary.ts:14` → `src/job/group-cabinet.ts:11` → `reap.ts`; `stats` through `src/job/statistics.ts:18`
   (`isDayOnly`) → `src/job/landing.ts` (`writeMarker`), added by R-103; `seat queue` through
   `src/runtime/queue-report.ts:6-15` → `start-queue.ts`; `ticket check` through `src/commands/ticket.ts:5` →
   `src/project/ticket-folders.ts:10` → `landing.ts`; the three `github` reads through the mixed `src/commands/github.ts`
   → `src/integrations/github-claims.ts:23` → `src/job/spawning.ts`; `picture serve` through `src/picture/activity.ts:7` →
   `reap.ts` (`ownerState`, `startingJob`).
3. `ownerState` with `OwnerState`, `ownerCheck`, `deadBecause`, `otherBoot` and its cache (`reap.ts:37-87`) and
   `startingJob` (`:97-99`) are read by `listing.ts`, `group-cabinet.ts`, `group-rounds.ts`, `src/commands/keeper.ts`,
   `activity.ts`, `hook/wake.ts:64`, `src/job/migration.ts`, `src/runtime/pruning.ts`, `seat/deploy.ts` and inside
   `reap.ts`; tests `test/runtime/reap.test.ts:127`, `:150` test `ownerState` alone. `queuedText`
   (`start-queue.ts:670-675`) has one caller, `listing.ts:140`. `isDayOnly`, `dayOnlyTime`, `DAY_ONLY`
   (`landing.ts:511-524`) are read by `statistics.ts`, `landing.ts:543` and two tests. The queue's read half is the
   eight names `queue-report.ts:7-14` imports and their helpers (`SAMPLE_MS`, `queueDir`, `lastReading`, `readEntries`,
   `parseEntry`, `entryState`).
4. The T-26 launch scan (`test/structure.test.ts:1583-1608`) counts a call whose callee is a `node:child_process`
   starter (`STARTERS`, `:1520-1529`) and whose argument names the CLI. `platform.startInScope`
   (`src/platform/linux.ts:169-196`) is called only at `src/runtime/launcher.ts:101` and `:134-135`;
   `startOutsideJob(command, args, options)` (`launcher.ts:95-102`) is exported and called by `src/integrations/herdr.ts:61`.
   A start through either outside the launcher passes the scan.
5. The read test (`test/registry.test.ts:827-860`) runs every read command on a read-only `.limen/` and seat `.limen/`
   (`readOnly`, `:817-825`), so a read that took a lock under them would fail there; it checks no time. Timers in a
   read's closure today: `delay` in `src/integrations/herdr.ts:116` (a retry), `src/lock.ts:231` (the lock's poll),
   `start-queue.ts:174` (the 2 s sample), `:317` and `:695`.

## Change

1. The T-04 scan walks the transitive closure of each read command's handler file over `importsOf`, a queue and a
   seen set (cycles end there): `import type` is skipped, `import { type X, f }` is followed, a namespace or star import
   of a `src/` file and an import of a file git does not know are findings; it finds (a) every import of a name of
   `STATE_TRANSITIONS`, to which `recordRefusal` and `recordRateLimit` (`src/job/record.ts:1165`, `:1175`) are added, and
   (b) every wait primitive: an import of `setTimeout` from `node:timers/promises`, a `setTimeout` or `setInterval` call
   awaited through a promise, and an import of `withLock` or `moveLockedFolder` from `src/lock.ts`. The walk is a pure
   function with a fixture test, one mechanism each: two levels deep, a cycle, `export … from`, `import type` skipped,
   an inline `type` specifier followed, a namespace import found, a `node:` import skipped, a wait primitive found.
2. The findings are compared both ways (an unlisted finding and a stale entry both fail) with two lists in the test:
   - the mixed command files, each with its end ticket (D-116 (2)): `src/commands/ticket.ts` → R-065,
     `src/commands/github.ts` → R-058; nothing else;
   - the wait exceptions, each with its reason: the bounded readings T-04 names (the 2 s sample of `seat queue`; the
     Herdr and systemd probes of `limen status`), and a module whose wait primitive serves only its change operations,
     named with the operation (for example a record writer's lock in `src/job/record.ts`); such a lock entry is backed
     at run time by the read test, whose read-only `.limen/` refuses any lock a read takes (fact 5).
3. The moves, so that `show`, `status`, `stats`, `seat queue` and `picture serve` reach no transition: `ownerState`,
   `OwnerState`, `ownerCheck`, `otherBoot` and `startingJob` into the new module `src/runtime/liveness.ts` (whether the
   process a record names still runs; `reap.ts` keeps the reaper), its callers repointed and the two tests moved to
   the new file `test/runtime/liveness.test.ts`; `queuedText` into `src/job/listing.ts`, its one caller; `isDayOnly`,
   `dayOnlyTime` and `DAY_ONLY` into `src/job/record.ts`, the module of the `landed` marker (T-25 (2)); the queue's read
   half (fact 3) into the new module `src/runtime/queue-reading.ts`, which `start-queue.ts` and `queue-report.ts` import,
   with the tests of those functions in the new file `test/runtime/queue-reading.test.ts`. R-104's liveness rule moves
   with `readEntries` unchanged. The comments that name the old places follow (T-30).
4. The T-26 scan: no call of `platform.startInScope` outside `src/runtime/launcher.ts` (none today), and
   `startOutsideJob` joins the starters `cliLaunches` reads; a fixture case of each fails at HEAD.
5. `## Tickets` notes of R-058 and R-065 hold their criterion (D-116 (2), already written); the stale R-102 note on the
   `rule` exception is the main session's to correct in the ticket's commit.

## Out of scope

- A wall-clock test of the reads (D-116 (1)).
- Splitting `src/commands/github.ts`, `src/integrations/github-claims.ts` and `src/commands/ticket.ts`: R-058 and R-065.
- That a read's process loads every command's module through `src/main.ts`'s `REGISTRY`: the scan proves the read
  path's own module graph, not the process.

## Acceptance

- AC-1: `node --test test/structure.test.ts` → exit 0.
- AC-2: `node --test test/registry.test.ts` → exit 0.
- AC-3: `node --test test/runtime/reap.test.ts` → exit 0; `node --test test/runtime/liveness.test.ts` → exit 0.
- AC-4: `node --test test/runtime/start-queue.test.ts` → exit 0; `node --test test/runtime/queue-reading.test.ts` →
  exit 0; `node --test test/runtime/wrapper.test.ts` → exit 0.
- AC-5: `node --test test/cli/status.test.ts` → exit 0; `node --test test/cli/show.test.ts` → exit 0;
  `node --test test/cli/stats.test.ts` → exit 0; `node --test test/cli/sweep.test.ts` → exit 0.
- AC-6: `node --test test/job/statistics.test.ts` → exit 0; `node --test test/cli/ticket.test.ts` → exit 0;
  `node --test test/hook/wake.test.ts` → exit 0.
- AC-7: `git grep -q 'runtime/reap.ts"' -- src/job/listing.ts src/job/group-cabinet.ts src/picture/activity.ts hook/wake.ts` → exit 1.
- AC-8: `git grep -q 'landing.ts"' -- src/job/statistics.ts` → exit 1.
- AC-9: `git grep -q 'imports directly' -- test/structure.test.ts` → exit 1.
- AC-10: `git grep -q 'R-065' -- test/structure.test.ts` → exit 0; `git grep -q 'R-058' -- test/structure.test.ts` →
  exit 0.
- AC-11: `node adrian-rebuild/tools/fails-before.mjs` → exit 0, its output in `outcome.md` → `## Fails before`.
- AC-12: `node adrian-rebuild/tools/gate.mjs` → exit 0.
- AC-13: `npx biome check --error-on-warnings .` → exit 0; `node adrian-rebuild/tools/check.mjs` → exit 0.
- AC-14 (judgment): the T-04 scan follows every module a read command's handler loads, cycles included; outside its two
  lists it finds nothing; each list entry names its end ticket or its reason, and a stale entry fails; each wait
  exception is a bounded reading T-04 names or a wait of a change operation, named.
- AC-15 (judgment): a start of Limen's CLI through `platform.startInScope` or `startOutsideJob` outside
  `src/runtime/launcher.ts` fails the T-26 scan, shown by a fixture case.

## Migration

None: no format on disk or command changes; the moves are internal.

## Risk

- Module granularity: a module in a read's closure whose wait serves only a change operation is listed by reason, which
  the reviewer judges; a read that calls it would still pass the scan, and only the read test's read-only `.limen/`
  catches a lock.
- `hook/wake.ts` stops loading `reap.ts` and `finalize.ts` in the coordinator's Pi process (inventory 3.4), which D-094
  (1) wanted; the wake tests cover it.

## Rollback

`git revert $(git log --format=%H --grep='^R-105:' adrian-rebuild --)`; no migration to reverse.

## Decisions

Settled when the ticket was written (2026-11-26): D-116 (Q-69–Q-71, Adrian); the main session's reading of the
inventory's technical questions (`evidence/inventories/R-105.md` → section 9), not night defaults:
1. `seat queue`'s path is cut by moving the queue's read half (Q1 (a)): T-04's Check, and R-032 Decision 16 meant
   `seat queue` to pass.
2. `isDayOnly` and its form move to `src/job/record.ts` (Q2 (a)), T-25 (2).
3. `src/commands/picture.ts` gets no ratchet entry (Q4 (a)): after the move it has no finding, and a stale entry fails.
4. The ratchet is a record of command file → end ticket, failing both ways (Q5 (a)), as `READS_WITH_TRANSITIONS` was
   (`a26d5f4`).
5. T-26: `startInScope` only in the launcher, `startOutsideJob` among the starters (Q6 (b)).
6. The new modules' names (`liveness.ts`, `queue-reading.ts`) and the moves of Q7 (a) and Q8 (a) are internal names and
   places (D-054 (2) (b)); the structure test keeps basenames unique.
7. `recordRefusal` and `recordRateLimit` join the transition names (Q9 (a)).
8. The wait half follows D-116 (1) at module granularity (Q10 settled by D-116): an entry for a change operation's
   wait is named with that operation, and for a lock it is backed at run time by the read test's read-only folders
   (fact 5), since a module-level scan cannot tell which function of a module a read calls.
