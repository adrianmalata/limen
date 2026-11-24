<!-- PL: Wynik R-032 (szkic implementera, 24.11, przy `8b1ec4c`): `limen sweep` staje się `limen seat sweep` przez
runner T-38 (żniwiarz, koniec pozostałych scope'ów zakończonych jobów, rejestracje koordynatorów, dzwonek Herdr, raz na
przebieg martwe wpisy kolejki startowej; projekt, który pada, jest nazwany, a przebieg kończy się najgorszą klasą),
z odmową `SWEEP_IN_JOB` wewnątrz scope'u joba i instalatorem jednostek użytkownika w adapterze platformy
(`src/platform/systemd-units.ts`: linger, zapis atomowy, `systemd-analyze --user verify`, przywrócenie, reload, enable).
`status`, `show`, `seat queue` i tick hooka wake już nie sprzątają; martwy job pokazuje `wrapper dead; limen-sweep will
finalize`, pole `stuck` liczy nieudane próby, a od trzeciej z rzędu alert `stuck` i sekcja `limen status`.
`seat/deploy.ts` weryfikuje jednostki nowego checkoutu w katalogu tymczasowym. Poprawki rundy 1 recenzji (F1–F9): jedna
polityka umieszczania plików jednostek (także dla alertów), menedżer użytkownika z własnego uid i `NO_USER_MANAGER`
przy braku jego folderu, `holdsProcesses` z `cgroup.events` (bramka wdrożenia jako root), błędy pojedynczych rekordów
i kroków nie zatrzymują reszty, `systemd-analyze` jako wymaganie, testy brakujących mechanizmów. Poprawki rundy 2
(G1–G4): `CONTRIBUTING.md`, ponowne `--uninstall` kończy przerwane przeładowanie, rozdzielone testy instalacji,
nieczytelny folder kolejki startowej jest błędem przebiegu. Bramka sesji głównej: 1030/1030; recenzja PASS w trzech
rundach, uwagi rundy 3 w notatkach R-082 i R-101 oraz w punkcie otwartym 6. Stan: zamknięty (24.11). -->

# R-032 outcome

## Done

(a) `limen seat sweep` (`src/commands/sweep.ts`, a thin `operationHandler`; the domain is the new
`src/runtime/sweeping.ts`). Its `validate` reads the flags (two or three of them: usage error `SWEEP_FLAGS`, `next`
`limen seat sweep --help`), refuses a run inside a job's scope (`SWEEP_IN_JOB`, class `refused`: a segment of the
process's own cgroup that `jobOfScope` reads as a job's scope) and, for `--install`, checks lingering (`NO_LINGER`).
A run, over every registered project in parallel (`updateRegisteredProjects`, as before): `confirmDeadJobs`; then
`endLeftoverScopes` against one listing of the user manager's units per run (`platform.userUnits()`), which ends the
live scope of each finished job as the reaper ends one (TERM, the grace, KILL, under the job's recovery claim) and
skips a job whose wrapper still lives (the wrapper ends its own scope last); then `removeDeadCoordinators` and the
Herdr ring, moved unchanged from the old command (its `console.error` is now `out.diagnostic`, its errno cast
`hasCode`). Once per run: `removeDeadEntries` of the start queue. A job that fails to read or to end and a step that fails
are caught per job and per step (review round 1, F7); once all are done the run throws one `LimenError` with the class and code of the worst failure (by exit code, each through
`stepFailure`, so none is a refusal), a message `the sweep did not finish …:` with one `<where>: <message> (<code>)`
line per failure, and `next` `limen seat sweep`. A run whose account's user manager has no cgroup folder names that as
`NO_USER_MANAGER` (F5) and still does every other step. The output ends with `swept <n> project(s)`.

(b) `scopeState` (`src/platform/linux.ts`) runs `systemctl --user is-active <unit>` without `--quiet` and reads exit 3
as ended only when the printed word is `inactive` or `failed`; `deactivating` and every other word are `active`, so
the job is attempted again at the next run. `src/job/record.ts` gets the optional field `stuck` (`since`, `attempts`,
`detail`; validator `stuckOf`; left out of `Fields`, so no transition sets it), its one writer `writeStuck` beside
`writeMarker` (under the job's lock, any state, no state change, no write when the field stays as it was),
`STUCK_ESCALATION = 3` and `escalatedStuck`. The reaper (`src/runtime/reap.ts`) writes `stuck` one attempt longer at
each failed attempt of step 1 (`notEnded`, with the log line it always wrote), a running record whose group it cannot
attribute included (the `pid … runs a process that may be the wrapper` case), and at each failed attempt of step 2;
an attempt that ends the processes removes it, and a finished record that keeps one is cleared at the next run. From
the third attempt in a row the alerts send `stuck` (a new `EVENTS` entry of `seat/alerts.ts`, summary noun `stuck
job`) and `limen status` shows `Jobs the sweep cannot end (N):` with `  <id>: <detail> (since <time>)`, the detail
through `shownField`.

(c) `holdsProcesses` (`src/runtime/reap.ts`): a starting job as `liveJob` reads it; a running job while its wrapper
lives or the cgroup of its recorded scope is populated (`cgroupPopulated`, by review round 1, F6; a cgroup that does
not read counts as held, z. 14).
The four callers use it: `seat/deploy.ts` (`runningJobs`), `src/job/migration.ts` (`folderLive`), and spawn's
`noteRunningJobs` and `liveJobUsesBranch`. The reaper keeps `liveJob`. A finished record's leftover scope is step 2's,
not these callers' (Decision 17's reading of (c), which names the wrapper and "its record's scope").

(d) `status` and `show` no longer call `confirmDeadJobs` (`src/project/summary.ts`, `src/job/detail.ts`); both are
kind `read`, out of `OUTSIDE_RUNNER`, with `refuses` `refusals(IN_PROJECT)` and `refusals(IN_PROJECT, JOB_WORD)`. The
wake hook's tick calls no reaper; it keeps its stamp and its deliveries, and still delivers only after the code that
started it returns (`await Promise.resolve()` where the reap's `await` was, so `/limen on` notifies before a held wake,
as `test/s3-finish-wake.test.ts` (F042) requires). `finishSweep` lost its `split pending` suppression: its two loops
moved into `observeAdvisories` and `observeEach`, and Biome passes without it. `seat queue`'s report moved to
`src/runtime/queue-report.ts` and reads `queueEntries`, which leaves a dead or malformed entry in place; the waiting
wrappers' `liveEntries` still removes one. A dead running job shows `wrapper dead; limen-sweep will finalize`
(`DEAD_WRAPPER`, `src/job/job.ts`) in its status row, in `show`'s detail for people and in the compact text.

(e) The unit model and the installer are `src/platform/systemd-units.ts` (Decision 15): `UnitDefinition` with its
`header`, `renderUnit` (which also refuses a header that is not one comment line of at most 100 characters),
`sweepUnits(packageRoot)` (refuses a package root `ExecStart` would split), `installSweepUnits` and
`uninstallSweepUnits`. The platform interface gains `lingers` (the file under `/var/lib/systemd/linger`, test knob
`LIMEN_LINGER_DIR`, registered in `src/config.ts`), `userUnitFolder`, `verifyUserUnits`, `reloadUserManager`,
`enableUserTimer`, `disableUserTimer` and `userUnitState` (bounded at 3 s, as the system-unit probes, whose timeout
constant is now one, `UNIT_QUESTION_TIMEOUT_MS`). `userUnits` lists the manager of the process's own uid, from a login
session too (Decision 17, as F5 reads it), and gives nothing when that manager has no folder. `seat/units.ts` keeps `alertsUnits`, imports `renderUnit` and gives `alertsUnitFiles` (name and
rendered text), which `seat/alerts.ts` writes; it re-exports nothing. The LaunchAgent installer is gone from
`src/project/seat.ts`, and its T-25 exception from `test/structure.test.ts` (the list is empty).

(f) `sweepLines()` (`src/project/summary.ts`, beside `alertsLines`): the two probes and the lines of (f); `limen
status` prints them after the alerts', and `--status` prints them or `limen-sweep.timer is active`.

(g) `seat/deploy.ts` exports `VERIFICATIONS` with one entry, `sweep units`: `node seat/sweep-units.ts` from the new
checkout. The new `seat/sweep-units.ts` renders both units for that checkout into a new folder of the OS temporary
folder, runs `systemd-analyze verify` on them (exit 4 with what it said on a failure) and removes the folder; it
writes no home.

(h) Registry: `seat sweep` (group `seat`, kind `change`, no `movedBy`, flags `--install`, `--uninstall`, `--status`,
`refuses` `SWEEP_FLAGS`, `SWEEP_IN_JOB`, example `limen seat sweep --status`); `sweep` is an `OLD_NAMES` entry
(`REMOVED`, `next` `limen seat sweep`, "was renamed to limen seat sweep (R-032)"); `prune`'s `movedBy` is `"R-101"`;
`group-control.ts` names `limen seat sweep`. The help and both generated sections of `docs/commands.md` follow.

(i) Tests: `test/cli/sweep.test.ts` rewritten (23 tests after round 2); `test/platform/systemd-units.test.ts` new (10, the
renderer and the placement tests among them); `test/seat/units.test.ts` keeps the alerts' golden texts unchanged and lost the renderer test;
`test/platform/linux.test.ts` (+8: `deactivating`, `inactive`/`failed`, linger, the unit folder, `userUnitState`, a
login session's units, another uid's session, a missing manager folder; two expected call forms updated);
`test/runtime/reap.test.ts` (+3 for `holdsProcesses` and `folderLive`; the unreadable-scope test now asserts
`stuck`); `test/platform/requirements.test.ts` (+1, `systemd-analyze`); `test/registry.test.ts` (the T-04 read test runs on a
`.limen/` and a seat folder made read-only, with a dead running job and its dead start-queue entry, and asserts the
job stays running; the D-045 and D-039 tests; `MOVED`); `test/structure.test.ts` (the T-04 import scan of Decision
16 with `rule` → R-102 as its one listed exception; `OUTSIDE_RUNNER`; no write exception; the `ERRNO_TYPED` line of
the old command gone); `test/cli/status.test.ts` (+5), `test/cli/show.test.ts` (+1), `test/hook/wake.test.ts` (+1),
`test/seat/alerts.test.ts` (+1, and the summary line), `test/runtime/start-queue.test.ts` (+2),
`test/seat/deploy.test.ts` (+4: `VERIFICATIONS`, the check's success and failure, and the gate with a dead wrapper's
populated scope), `test/s9-housekeeping.test.ts` (reaps and contends through `limen seat sweep`), `test/cli/group.test.ts`,
`test/cli/old-names.test.ts` (`NEXTS`), `test/help.test.ts`, `test/config.test.ts`. `test/plant.ts`: the tests'
systemctl takes `--user is-active <unit>` and prints the state word, and a plant's processes carry `LIMEN_CGROUP` of
a login session of the tests' user manager, so a sweep's listing reads the tests' cgroup folder on any machine.

(j) Text: `docs/commands.md` (the exit table, the `REMOVED` list, the prune note, `### Seat sweep` rewritten),
`docs/jobs.md` (seat notifications, the start queue's dead entries, the dead-wrapper recovery row),
`templates/agents.md` (the dead-wrapper line; new first hash in `templates/.history/agents.md`),
`docs/herdr-status.md`, `docs/groups.md`, `docs/seat/README.md` (a `## Sweep` section beside the alerts'), and the
comments the ticket lists.

## Fixes of review round 1

`ticket.md` → `## Decisions` → "2026-11-24, review round 1"; note 2 (T-10) rejected there and left as it was.

- F1 (T-25 (1)): `placeUnitFiles` (`src/platform/systemd-units.ts`) is the one placement policy of unit files: it reads
  every file first (a read that fails ends it before any write, `UNIT_FILE_UNREADABLE`), writes atomically only what
  differs, verifies all of them through the caller's verifier when it wrote one, and puts each written file back on a
  failed write (`UNIT_FILE_UNWRITTEN`) or verification (`UNITS_INVALID`, the message
  `<verifier> failed for <a> and <b>: <detail>; <what the put back did>`). The sweep's install passes
  `systemd-analyze --user verify`; `seat/alerts.ts` `placeUnits` passes `systemd-analyze verify` through its runner and
  maps a failure to its `SeatFailure` (exit 4, its own next text), keeping only its folder, the reload, the enable and
  the ACLs; its `currentText`, `writeUnit` and `putBack` are gone. The sweep's verification code is `UNITS_INVALID` now
  (was `SWEEP_UNITS_INVALID`). Tests: three of `placeUnitFiles` in `test/platform/systemd-units.test.ts` (what it writes
  and verifies, the put back, the read before any write); the alerts' tests and golden texts unchanged and green.
- F2: `docs/commands.md` names the eleven commands of the runner (`abandon` and `seat sweep` added).
- F3: `## Fails before` below states the reasons as the reviewer found them.
- F4: `test/cli/sweep.test.ts` gains: a run with no registered project still removes a dead start-queue entry (a removal
  per project would not run); a finished job whose leftover scope will not end, and a running job with no scope whose
  pid has no start time while a live process holds it, each get `stuck` 1, 2, 3 over three runs and appear under
  `Jobs the sweep cannot end` only after the third.
- F5: `userManagerOf` (`src/platform/linux.ts`) takes the process's own uid: `user-<uid>.slice/user@<uid>.service`, the
  path above the slice from the process's cgroup when that lies in the slice, else `/user.slice`; a session cgroup of
  another uid never names that uid's manager. `userUnits` gives undefined, never `[]`, when that manager has no cgroup
  folder, so the run names `NO_USER_MANAGER` and does its other steps. `endLeftoverScopes` clears `stuck` only when the
  run reads the scope gone (`scopeState`), for a job the listing names and for any finished job with `stuck`; a missing
  listing entry is no end. The plant and `fakeSystemd` make the tests' manager folder (`fakeManager`, test/plant.ts),
  and the tests of `userUnits` and of the queue's diagnosis use the test's own uid. Tests: a session cgroup of another
  uid and a missing manager folder (`test/platform/linux.test.ts`); a run with the manager folder gone exits 4
  `NO_USER_MANAGER`, still reaps, and keeps a finished job's `stuck` (`test/cli/sweep.test.ts`).
- F6: `holdsProcesses` reads the cgroup of the record's scope through the new platform member `cgroupPopulated`
  (`cgroup.events`: `populated 1` holds, `populated 0` or a missing folder holds none, anything that does not read holds,
  z. 14), asking no user manager, so the deployment's gate, which runs as root, gets the answer an agents' process
  gets. Tests: `test/runtime/reap.test.ts` (a populated cgroup holds while a fake systemctl says `inactive`; populated and
  then empty; unreadable holds, a gone folder holds none) and `test/seat/deploy.test.ts` (the gate refuses a dead
  wrapper's populated scope with that fake systemctl on PATH).
- F7: `reapDeadJobs`, `endLeftoverScopes` and the ring read each job folder alone (`jobFolderNames`; a folder of an
  older Limen is `notMigrated` of that folder, a record that does not read its `BAD_DATA`) and return each failure with
  its folder; `sweepProject` runs each step in its own catch, so a failed coordinator removal no longer skips the ring;
  the run names every failure once (the same line from two steps is one) and exits with the worst class. Test: a
  damaged record beside a dead job: the dead job is reaped, the run exits 4 `BAD_DATA` naming the damaged folder. The
  older-Limen test now names the job folder.
- F8: the doc comment of `runningJobs` (`seat/deploy.ts`) is rewrapped, and every new or changed comment line of the
  change is within 120 characters.
- F9: `systemd-analyze` is a declared requirement (`src/platform/requirements.ts`, after `systemd-run`), checked by
  `limen init` and the coordinator start with the others; the plant gives a fake one (`SYSTEMD_ANALYZE`, test/plant.ts),
  so no test reaches the machine's. Test: `test/platform/requirements.test.ts` (declared, and `MISSING_TOOL` when it is
  not on PATH). The summary of `seat sweep` reads "end dead jobs and notify about job ends nobody heard of; --install
  runs it every minute" (help, `docs/commands.md` and the golden help follow).

## Fixes of review round 2

`ticket.md` → `## Decisions` → "2026-11-24, review round 2". Each code change's test was also run against the code
of round 1 (the two functions put back as they were, then restored and compared byte for byte): both fail there for
the expected reason.

- G1: `CONTRIBUTING.md` no longer lists `sweep` among the commands whose entry has `movedBy`.
- G2 (T-38 (3)): `uninstallSweepUnits` runs every step again on a rerun: with the files gone it still calls the disable
  and the reload, so a reload that failed once is done by the next run. A disable that fails once the timer's file is
  gone and the timer is not active had nothing left to do (systemd refuses to disable a unit with no file); while the
  file is there or the timer runs, its failure still ends the removal (`USER_MANAGER_FAILED`). The tests' user manager
  now refuses that disable as systemd does and can fail one reload (`failNextReload`). Test: "--uninstall run again
  after one whose reload failed disables the timer and reloads the user manager, with no unit left"; with the round-1
  code its second run did not reload.
- G3 (T-29): the test of one run's removal of a dead start-queue entry is named for what it checks ("… and says how many
  it removed"); the once-per-run proof stays the test with no registered project. The install test is two tests: "--install
  writes both units, verifies them, reloads the user manager and enables the timer" and "--install run again writes and
  verifies nothing, and reloads the user manager and enables the timer as before".
- G4 (T-01): `removeDeadEntries` reads the queue folder strictly (`readEntries(true)`): a missing folder is an empty
  queue, and any other failure to list it is the run's failure, named `the start queue: <message> (STEP_FAILED)`, with
  the other steps done (as F7). The waiting wrappers and `limen seat queue` keep the catch-all for R-082. Test: "a
  start-queue folder the sweep cannot list fails the run with its reason, and the dead job is still reaped" (skipped as
  root); with the round-1 code the run exited 0.

`docs/commands.md` says that `--uninstall` run again finishes what an earlier run left.

## Proof

From the repository root, on the working tree (`HEAD` `8b1ec4c`, index unchanged), 2026-11-24, after the fixes of review
round 2:
- AC-11: `node adrian-rebuild/tools/gate.mjs` → exit 0: tests 1030, pass 1030, fail 0, cancelled 0, skipped 0, todo 0
  (244.5 s; no `✖` line; its Biome step "Checked 274 files … No fixes applied."). After round 1: exit 0, 1027 of 1027;
  before it: exit 0, 1015 of 1015 (an earlier run during that work also exited 0 with 1015 of 1015, with
  `hook/wake.ts` changed while it ran).
- AC-12: `npx biome check --error-on-warnings .` → exit 0 ("Checked 274 files … No fixes applied."); `node
  adrian-rebuild/tools/check.mjs` → exit 0 ("0 errors"); `npx biome check --error-on-warnings adrian-rebuild` → exit
  0; `npx tsc --noEmit` → exit 0.
- The main session's own runs (protocol step 4, the ones that count): after the first draft `gate.mjs` → exit 0, 1015
  of 1015 (295.3 s); after round 1's fixes → exit 0, 1027 of 1027 (270.7 s); after round 2's fixes → exit 0, 1030 of
  1030, 0 skipped (264.4 s); `fails-before.mjs` → exit 0 after each, the last with the twenty files of `## Fails
  before`. Review (`review.md`): PASS in rounds 1–3, no blocking finding; `review-guard.mjs compare` "unchanged" and
  `review-verdict.mjs` "consistent" for each counted reply.
- AC-1–AC-8, each file alone with `node --test --test-timeout=180000 <file>`, AC-9 as written: see `### Proof by
  criterion` below.
- AC-10: `node adrian-rebuild/tools/fails-before.mjs` → exit 0 (`## Fails before`).
- AC-13 (judgment): `limen seat sweep` is the only caller of `confirmDeadJobs`, `reapDeadJobs` and
  `endLeftoverScopes` (`grep -rln "confirmDeadJobs\|reapDeadJobs\|endLeftoverScopes" src hook seat`: only
  `src/runtime/reap.ts` and `src/runtime/sweeping.ts`); the T-04 import scan and the T-04 read test hold for every
  read command; the run refuses inside a job scope before any write (`SWEEP_IN_JOB` test: snapshot equal, no
  systemctl call); `deactivating` is not ended (linux test); a finished job's live scope ends (sweep test); `stuck`
  counts 1, 2, 3 with one `since` for a running job, a finished job's leftover scope and a pid with no start time, the
  alerts send from the third, status lists from the third; `--install` exits 4 without a linger file and writes
  nothing, and a second install writes and verifies nothing.

### Proof by criterion

After the fixes of review round 1, each `node --test --test-timeout=180000 <file>` run alone (the laptop's git 2.56.1 is
on PATH, D-060):
- AC-1: `test/cli/sweep.test.ts` → exit 0, tests 23, pass 23, fail 0 (after round 2); `test/cli/old-names.test.ts` → exit 0, tests
  35, pass 35, fail 0.
- AC-2: `test/platform/systemd-units.test.ts` → exit 0, tests 10, pass 10, fail 0; `test/seat/units.test.ts` → exit 0,
  tests 5, pass 5, fail 0.
- AC-3: `test/platform/linux.test.ts` → exit 0, tests 28, pass 28, fail 0; `test/runtime/reap.test.ts` → exit 0,
  tests 15, pass 15, fail 0.
- AC-4: `test/registry.test.ts` → exit 0, tests 32, pass 32, fail 0; `test/structure.test.ts` → exit 0, tests 50,
  pass 50, fail 0.
- AC-5: `test/cli/status.test.ts` → exit 0, tests 27, pass 27, fail 0; `test/cli/show.test.ts` → exit 0, tests 3,
  pass 3, fail 0.
- AC-6: `test/hook/wake.test.ts` → exit 0, tests 8, pass 8, fail 0; `test/runtime/start-queue.test.ts` → exit 0,
  tests 18, pass 18, fail 0.
- AC-7: `test/seat/alerts.test.ts` → exit 0, tests 45, pass 45, fail 0; `test/seat/deploy.test.ts` → exit 0, tests
  32, pass 32, fail 0.
- AC-8: `test/help.test.ts` → exit 0, tests 10, pass 10, fail 0; `test/s9-housekeeping.test.ts` → exit 0, tests 8,
  pass 8, fail 0.
- AC-9: `git grep -q 'movedBy: "R-032"' -- src/registry.ts` → exit 1.
- Besides: `test/platform/requirements.test.ts` → exit 0, tests 6, pass 6, fail 0.

## Fails before

AC-10, `node adrian-rebuild/tools/fails-before.mjs` (every new or changed file under `test/`, `test/plant.ts`
included, over a copy of `HEAD`), after the fixes of review round 2 → exit 0 (the same twenty files as after round 1;
`test/cli/sweep.test.ts` alone → exit 0, "fail at HEAD"), first line:

```
fails-before: test/cli/group.test.ts, test/cli/old-names.test.ts, test/cli/show.test.ts, test/cli/status.test.ts, test/cli/sweep.test.ts, test/config.test.ts, test/help.test.ts, test/hook/wake.test.ts, test/platform/linux.test.ts, test/platform/requirements.test.ts, test/registry.test.ts, test/runtime/queue-diagnosis.test.ts, test/runtime/reap.test.ts, test/runtime/start-queue.test.ts, test/s9-housekeeping.test.ts, test/seat/alerts.test.ts, test/seat/deploy.test.ts, test/seat/units.test.ts, test/structure.test.ts, test/platform/systemd-units.test.ts fail at HEAD (exit 1)
```

File by file (`node adrian-rebuild/tools/fails-before.mjs <file>`), each → exit 0 ("fail at HEAD") but two:
`test/cli/sweep.test.ts`, `test/platform/systemd-units.test.ts`, `test/platform/linux.test.ts`,
`test/platform/requirements.test.ts`, `test/runtime/reap.test.ts`, `test/registry.test.ts`, `test/structure.test.ts`,
`test/cli/status.test.ts`, `test/cli/show.test.ts`, `test/hook/wake.test.ts`, `test/seat/alerts.test.ts`,
`test/runtime/start-queue.test.ts`, `test/seat/deploy.test.ts`, `test/s9-housekeeping.test.ts`, `test/help.test.ts`,
`test/config.test.ts`, `test/cli/group.test.ts`, `test/seat/units.test.ts` (the per-file runs of the first draft, and
of `test/registry.test.ts`, `test/structure.test.ts`, `test/cli/status.test.ts`, `test/cli/show.test.ts` and
`test/platform/requirements.test.ts` again after the fixes). The two that pass at `HEAD`:
- `test/cli/old-names.test.ts` → exit 1: its one change is the `sweep` line of `NEXTS`, which its tests read only for
  an entry `OLD_NAMES` holds, and `HEAD` holds none; the old name's refusal is proved by `test/cli/sweep.test.ts` →
  "REMOVED: limen sweep exits 2, says it was renamed and names limen seat sweep", which fails at `HEAD` (the old
  `limen sweep --install` ran).
- `test/runtime/queue-diagnosis.test.ts` → exit 1: its change makes its fake hierarchy follow the test's uid (F5), so the
  tests pass on any uid; it proves no new mechanism.

Why the tests of T-04 fail at `HEAD` (F3, as the reviewer found them):
- The T-04 read test of `test/registry.test.ts` fails at its guard, before it runs any command: at `HEAD` `status` and
  `show` are `change` commands, so the list of reads lacks them ("an exception names a read command that the test runs
  or names as not run, or status or show is no read", actual `['status', 'show']`). It does not reach the read-only
  `.limen/`.
- The T-04 import scan of `test/structure.test.ts` names `seat queue` alone at `HEAD` (`seat queue:
  src/runtime/start-queue.ts imports transition`): `status` and `show` are no reads there, so the scan does not read
  their modules.
- That `status` and `show` no longer write is proved by their dead-job tests: "a running job whose wrapper is dead
  shows wrapper dead; limen-sweep will finalize in its status row, and status leaves it running"
  (`test/cli/status.test.ts`) and "the detail of a running job whose wrapper is dead says wrapper dead; limen-sweep will
  finalize, and show leaves it running" (`test/cli/show.test.ts`). At `HEAD` `show` reaped the job (observed: actual
  `[0, false, 'failed']`, the detail line `FAILED demo …`); `status` calls the same `confirmDeadJobs` at `HEAD`
  (`src/project/summary.ts:88`), which ends that job, so its record is `failed` and the snapshot differs (read from the
  code: the per-file run's output keeps only its last 40 lines, which hold another failing test of the file).

What else fails at `HEAD`, by mechanism: the sweep tests (no `seat sweep` command); the unit tests (no
`src/platform/systemd-units.ts`, no `placeUnitFiles`, no `alertsUnitFiles`); `deactivating`, linger, the unit folder,
`userUnitState`, a session of another uid and a missing manager folder (no such members, or the slice's uid; an empty
listing; `is-active --quiet` read exit 3 as gone); `holdsProcesses` and `cgroupPopulated`; the hook's tick (it reaped
the dead job); the `stuck` alert; `seat queue`'s read (it removed both dead entries); `VERIFICATIONS` (empty) and the
deploy gate (a dead wrapper's populated scope did not count); the `systemd-analyze` requirement (not declared); the help
and `docs/commands.md`; the config inventory (no `LIMEN_LINGER_DIR`); `limen sweep` in the group stop's `next`.

## Deviations

1. Names, by Decision 15: `src/platform/systemd-units.ts` and `test/platform/systemd-units.test.ts` instead of
   `src/platform/units.ts` and `test/platform/units.test.ts`; `seat/units.ts` imports the renderer for
   `alertsUnitFiles` and re-exports nothing.
2. The T-04 import scan reads one level, by Decision 16, with `rule` listed until R-102, and `seat queue`'s report in
   `src/runtime/queue-report.ts`.
3. The technical defaults of Decision 17 as listed there, with F5's reading of the user manager in place of the login
   session's slice; besides them: the unit model carries each unit's header line (`UnitDefinition.header`), since the
   alerts' and the sweep's first lines differ; the deploy check is `seat/sweep-units.ts`; the run's failure keeps the
   worst failure's class and code (no code of its own); a run under no user manager is `NO_USER_MANAGER` and does the
   other steps; the placement's failures are `UNIT_FILE_UNREADABLE`, `UNIT_FILE_UNWRITTEN` and `UNITS_INVALID`, the
   install's manager calls `USER_MANAGER_FAILED` (class `environment`); `--uninstall` with neither unit in the folder
   changes nothing and says so.
4. `reapDeadJobs` lost its `ids` parameter, which only the hook's tick passed, and returns the jobs it could not read
   or end (F7).
5. The hook keeps its old order by an `await Promise.resolve()` where the reap's `await` was (see (d)); without it a
   tick started by `/limen on` delivered a held wake before the command's notice.
6. Review round 1, F1: the alerts' placement now reads both unit files before it writes either (it read and wrote them
   one after the other), so a read that fails leaves both as they were; its messages and exit codes are as before.
7. Review round 2, G2: a rerun of `--uninstall` with the files gone still calls the disable, as the decision says, but
   does not fail on it while the timer is not active: systemd refuses to disable a unit with no file, so a strict
   disable would make every rerun exit 4 and never reach the reload G2 asks for. While the timer's file is there or the
   timer runs, a failed disable still ends the removal.

## Unmeasured

No metric of `plan.md` → `## Measurement` covers these; seat step 3.1 checks them on the seat:
- The engine fact behind (b): `systemctl --user is-active` prints `deactivating` (exit 3) for a scope systemd is still
  stopping; the tests' systemctl prints the word, the real one is not run here.
- The kernel fact behind F6: a job's scope has `cgroup.events` with `populated 1` while a process is in it and
  `populated 0` once none is, and root reads it under the agents' user manager
  (`/sys/fs/cgroup/user.slice/user-<uid>.slice/user@<uid>.service/app.slice/limen-job-<id>.scope/cgroup.events`), so
  `seat/deploy.ts` refuses while a dead wrapper's engine runs. The tests write the file themselves.
- `systemd-analyze --user verify` and `systemd-analyze verify` of the real units (the tests use fakes), the install on
  the agents' account with lingering, the first run in the journal (`journalctl --user -u limen-sweep.service` ending
  with a final line of class `ok`), and the `herdr is not available` line of the unit's `PATH` (`## Risk`).
- `userUnits` on the seat: the agents' manager at `user-<uid>.slice/user@<uid>.service` from the timer's service and
  from a real SSH or Herdr shell.

## Open points

1. Decision 16: the transitive closure of the read commands' imports still reaches state-transition functions,
   for gate 5.3: `status` and `show` through `src/job/listing.ts` → `src/runtime/reap.ts` (`ownerState` beside the
   reaper, which imports `finalizeJob`) and → `src/runtime/start-queue.ts` (`queuedText` beside `transition`);
   `seat queue` through `src/runtime/queue-report.ts` → `src/runtime/start-queue.ts`; `ticket check`, `github status`,
   `github doctor`, `github ensure`, `rule` and `picture serve` through command files that hold change commands too
   (`src/commands/ticket.ts`, `src/commands/github.ts`, `src/commands/rule.ts`, `src/commands/picture.ts`) and their
   modules (`src/job/landing.ts` → `writeMarker`, `src/job/publication.ts` → `publishRecord`, `src/job/spawning.ts`
   and `src/job/watching.ts` → `transition`). The read test is the behavioural guarantee meanwhile.
2. `endDueRules` (`src/main.ts`) still runs before every command, read commands included, and can end a due seat rule;
   it goes with the seat rules (D-070 (2), D-097 (6) (a), R-102). The T-04 read test has no due rule.
3. `diff` and `open` still record their Herdr tab's place (R-103, `## Out of scope`), so `limen <command> --help` still
   shows no kind (D-041 (6)).
4. The bounded probes of `limen status` grew by two user-unit probes (3 s each), the waits that `## Decisions` 9 leaves
   to gate 5.3.
5. `--install` inside a job's scope is not refused: (a) names the run, which signals scopes; an install there writes the
   same units into the agents' home.
6. Review round 3, note 6 (guessed; no planned ticket rewrites the installer, D-092): `--uninstall`'s tolerance of a
   failed disable reads `userUnitState(timer, "is-active")`, which is undefined both for `inactive` and for a probe
   that failed, and a timer whose file was removed by hand while it runs stops every rerun at the disable, before the
   reload, with nothing that stops the timer (`src/platform/systemd-units.ts:197-200`). Round 3's notes 5 and 7 are in
   `plan.md` → `## Tickets`, the notes of R-082 and R-101.
