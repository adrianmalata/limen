<!-- PL: Wynik R-035 (A-036, D-090) z nocy 22/23.11, szkic implementera z pierwszą rundą poprawek po recenzji 1. Plik
bramki dostał `diagnoseAfter` (30 min) i `failAfter` (2 h); po pierwszym progu kolejka raz zapisuje diagnozę (odczyt
bramki i po trzy największe jednostki menedżera użytkownika wg pamięci i CPU, z klasą `job <id>` albo `unattributed`) w
nowym polu rekordu `queueWait` i w advisory, które budzi koordynatora, a job czeka dalej; po drugim wrapper kończy job
`failed` rodzaju `queue`. Alerty wysyłają nowe zdarzenie `<projekt> queue <id>`, trzymają listę przeczytanych projektów
(nowy projekt nic starego nie wysyła) i liczą nieczytelny projekt raz. Poprawki F1–F4: nazwy jednostek i komunikat
błędu odczytu cytowane jako dane, podział dwóch testów, test kolejki niezależny od formatu rankingu i dwa komentarze.
Bramka 926/926, recenzja PASS w rundach 1 i 2; domyślne decyzje nocne do potwierdzenia rano. -->

# R-035 outcome

## What was done

(a) Gate file. `src/runtime/start-queue.ts`: `start-gate.json` takes `diagnoseAfter` and `failAfter`, read by
`duration` as `settle` is, defaults `30m` and `2h`. `startGate()` now returns `{ gate, limits, ignored }` (type
`GateFile`): `limits` is `{ diagnoseAfterMs, failAfterMs }` and keeps its defaults when the file is `"off"`, since a seat
rule can still hold a job (`## Out of scope`, first item). A `failAfter` not above `diagnoseAfter` (the values in force,
defaults included) is one bad value: both thresholds keep their defaults and `ignored` gets one `BAD_DATA` that names the
field the file gave, e.g. `start-gate.json: failAfter: expected a duration above diagnoseAfter (2h), got "1h"` or
`start-gate.json: diagnoseAfter: expected a duration below failAfter (2h by default), got "3h"`; the gate's other values
stay, as with its other bad values. The unknown-field message now lists all five fields.

(b) Thresholds in the poll. `pollQueue` reads the gate file on each poll as before and, after a decision that does not
start the job, calls `atThresholds`: the wait counts from `queued.since` (`entry.queuedAt`). Past `failAfterMs` the wait
ends with the new `QueueEnd` `{ failed: "queued for <wait> without a start: <detail>" }`, where `<detail>` is the poll's
decision text (the gate reading, the settle, or the rule that holds it). Past `diagnoseAfterMs`, once per job
(`Wait.diagnosed`, read from the record at the start of the wait), `diagnose` samples the gate reading (`readLoad`)
between two readings of the units (`src/runtime/queue-diagnosis.ts`), and one transition writes `queueWait.diagnosedAt`,
`queueWait.diagnosis` and `advisory = { text: "queued for <wait> without a start: <diagnosis>", at }`; the job's log
gets the same line as `start queue: …`; the job keeps waiting. The wake hook delivers the advisory as it does any
advisory of a running job (`hook/wake.ts`, unchanged). `src/runtime/wrapper.ts`: on `{ failed }` the wrapper ends the job
with `finalizeJob(…, "failed", detail)`, unless the record holds a stop request, which wins as in `endBeforeEngine`
(A-052); no engine starts. `src/job/record.ts`: `FAILURE_PATTERNS` gains `^queued for \S+ without a start` → `queue`.

(c) `queueWait`. `src/job/record.ts`: the type `QueueWait = { since, diagnosedAt, diagnosis, leftAt }`, an optional field
of the record (D-079) with its validator `queueWaitOf`, and two helpers: `waitOf(record)` (the `queueWait`, else the one
`queued` began) and `queueLeft(record, at)` (`queued: null` and the wait with `leftAt`). Every writer that clears
`queued` uses `queueLeft`: `leaveQueue` when the job starts or is stopped in the queue, and `finalizeJob` for any finisher
(`limen stop`, the reaper, the wrapper after a `failed` end). So every job that queued keeps its wait after `queued` is
cleared.

(d) Diagnosis. New platform member `userUnits()` (`src/platform/platform.ts`, `src/platform/linux.ts`): the user manager
is the wrapper's own cgroup cut after `user@<uid>.service`; every `.scope` and `.service` folder below it (slices walked,
units not entered, since a unit's children count in its own files) with `memory.current` and the `usage_usec` of
`cpu.stat`, sorted by name; a folder that is gone (ENOENT) holds no unit, any other error goes on; undefined outside a
user manager. `LIMEN_CGROUP_ROOT` and `LIMEN_CGROUP` give the tests a fake hierarchy. New module
`src/runtime/queue-diagnosis.ts`: `queueDiagnosis(reading)` and the pure `usageText(before, after, windowMs, cores)`:
`<reading>; largest by memory: "<unit>" (<class>) <n> MiB, …; largest by CPU: "<unit>" (<class>) <n>%, …`, three per
ranking, CPU as the share of the whole machine over the reading's window; the class is `job <id>` for
`limen-job-<id>.scope` (`jobOfScope`, `src/runtime/launcher.ts`, beside `jobScope`, checked against `JOB_ID`) and
`unattributed` otherwise. A read of the units that fails gives `<reading>; units: not read: "<error>"`. The unit's name
and the error are quoted as data (F1, `## Round 1 fixes`).

(e) Alerts. `seat/alerts.ts`: a new event `queue`, from `queueWait.diagnosedAt`, line `<project> queue <job id>`, key
`<root>/<id>/queue`; a 2 h failure is `failed:queue` through the `failed` event. The summary counts each kind:
`read 2 projects: 0 failed jobs, 1 long start-queue wait`. `seat/units.ts`: Description `Limen alerts: one ntfy line for
each failed job and long start-queue wait` (golden test updated; the line is 85 characters).

(f) D-090 (1). The state folder keeps `projects` (sorted roots, mode 0600) beside `reported`. `recordFirstReads`: a
project whose jobs this run listed and that is not in the list has its present events written to `reported`, none sent,
then joins the list; the summary line is `first read of N projects: M events recorded as reported, none sent (A-054)`.
No `reported` file is a first run (every project new); `reported` with no `projects` (R-033's state) counts every project
of the run as read. `reported` is written before `projects`; the list only grows.

(g) D-090 (2). `scanProjects` checks `seen` for an unreadable root too, so it counts once and has one problem line
however many registries list it.

(i) Text. `docs/jobs.md` (Values; a new item "A long wait"), `templates/agents.md:80` with its new hash in
`templates/.history/agents.md`, `docs/seat/README.md` (the alerts paragraph, the state files, the first read, the run
after `limen init`), `docs/seat/agent-setup.md` (153, 174, 180, 181), `docs/remote.md` (58, 81), `src/project/summary.ts`
(`Alerts not working (n); no alert reaches the phone until each is fixed:`, with `test/cli/status.test.ts`), and the
header, the event comment, the summary lines and the install's line in `seat/alerts.ts`.

Files: `src/runtime/start-queue.ts`, `src/runtime/queue-diagnosis.ts` (new), `src/runtime/wrapper.ts`,
`src/runtime/launcher.ts`, `src/job/record.ts`, `src/job/finalize.ts`, `src/platform/platform.ts`,
`src/platform/linux.ts`, `src/project/summary.ts`, `seat/alerts.ts`, `seat/units.ts`, `templates/agents.md`,
`templates/.history/agents.md`, `docs/jobs.md`, `docs/commands.md`, `docs/remote.md`, `docs/seat/README.md`,
`docs/seat/agent-setup.md`; tests `test/runtime/start-queue.test.ts`, `test/runtime/queue-diagnosis.test.ts` (new),
`test/runtime/wrapper.test.ts`, `test/platform/linux.test.ts`, `test/job/record.test.ts`, `test/job/finalize.test.ts`,
`test/seat/alerts.test.ts`, `test/seat/units.test.ts`, `test/cli/status.test.ts`, `test/plant.ts` (`within` moved here
from `test/runtime/wrapper.test.ts`, its second user being the start-queue test, T-25 (2)).

## Proof

Round 1, before the fixes; this round's runs are in `## Round 1 fixes` → Proof.

- `node adrian-rebuild/tools/gate.mjs` → exit 0: tests 920, pass 920, fail 0 (900 at HEAD + 20 new); `tsc --noEmit` and
  `biome check --error-on-warnings .` inside it clean. It ran once more after the last test change (the diagnosis test
  writes `last-start` before the open reading, so no poll can find the gate open with nothing settling): exit 0, 920/920.
- `node --test test/runtime/start-queue.test.ts` → exit 0, 16/16 (AC-1).
- `node --test test/seat/alerts.test.ts` → exit 0, 41/41; `node --test test/seat/units.test.ts` → exit 0, 6/6 (AC-2).
- `node --test test/platform/linux.test.ts` → exit 0, 19/19; `node --test test/boundary.test.ts` → exit 0, 33/33 (AC-3).
- `node --test test/job/record.test.ts` → exit 0, 28/28 (AC-4); `test/s3-finish-wake.test.ts` and
  `test/structure.test.ts` (AC-4, AC-5) passed inside the gate run.
- `node --test test/runtime/queue-diagnosis.test.ts` → exit 0, 4/4; `node --test test/job/finalize.test.ts` → exit 0,
  10/10; `node --test test/runtime/wrapper.test.ts` → exit 0, 12/12.
- `npx tsc --noEmit` → exit 0; `npx biome check --error-on-warnings .` → exit 0 (267 files).
- `node adrian-rebuild/tools/check.mjs` → exit 0 (`0 errors`, 224 PL summaries); `npx biome check --error-on-warnings
  adrian-rebuild` → exit 0 (34 files).

## Fails before

The implementer's runs at the working tree with the tests written and no source change (the main session's
`fails-before.mjs` output goes here for AC-6):

- `node --test --test-reporter=spec test/runtime/start-queue.test.ts` → 8 of 16 fail: the diagnosis test (`the wait gets
  its diagnosis`: `actual: false`, after the 5 s bound), the failAfter test (`outcome: 'still waiting'`), the start test
  (`wait: undefined`), the two new gate-file tests (`diagnoseAfter: expected one of the fields cpuIdle, memoryFree or
  settle, got "1m"`; `limits: undefined`), and three changed tests that now expect `limits` in `startGate()`'s result
  (T-03, `"off"`, defaults); the unknown-field message in the last of them lists the two new fields.
- `node --test test/runtime/queue-diagnosis.test.ts` → the file fails: `ERR_MODULE_NOT_FOUND` for
  `src/runtime/queue-diagnosis.ts` (the new module).
- `node --test test/platform/linux.test.ts` → 2 of 19 fail: `TypeError: linux.userUnits is not a function`.
- `node --test test/job/record.test.ts` → 3 of 28 fail: `kind: null` for `queued for 2h1m without a start: …`; the
  record with `queueWait` refused (`BAD_DATA` at `queueWait`, the unknown field), so the BAD_DATA test names `queueWait`
  instead of `queueWait.leftAt`.
- `node --test test/job/finalize.test.ts` → 1 of 10 fails: `actual: { queued: null, wait: undefined }`.
- `node --test test/seat/units.test.ts` → 1 of 6 fails: the golden Description line.
- `node --test test/seat/alerts.test.ts` → 5 of 41 fail: the first-run line (`first run: 2 failures recorded as
  reported`), the queue event (`actual: 4`: the record with `queueWait` cannot be read), D-090 (1) with a project
  registered later (`sent: ledger failed:quota 2026-11-17-f002-work-b-1a2b3c4d`, the old failure), D-090 (1) with R-033's
  state (`ENOENT … state/projects`), and D-090 (2) (`lines: 2`, `could not read 2 registered projects`).
- `node --test --test-name-pattern=failAfter test/runtime/wrapper.test.ts` → 1 of 1 fails after 20.9 s: `the job ends
  once its wait passes failAfter`, `actual: false`.
- `test/cli/status.test.ts`: two golden lines changed with `src/project/summary.ts:190`; not run before the change (a
  text change, no mechanism).

AC-6, the main session's `node adrian-rebuild/tools/fails-before.mjs` (every new or changed file under `test/`, over a
copy of `HEAD` `34a40d0`) on the tree under review round 1 → exit 0, first line:

```
fails-before: test/cli/status.test.ts, test/job/finalize.test.ts, test/job/record.test.ts, test/platform/linux.test.ts, test/runtime/start-queue.test.ts, test/runtime/wrapper.test.ts, test/seat/alerts.test.ts, test/seat/units.test.ts, test/runtime/queue-diagnosis.test.ts fail at HEAD (exit 1)
```

Its tail showed D-090 (2)'s alerts test failing (`could not read 2 registered projects` against `1`) and the unit's
golden Description failing. The main session's gate on that tree: exit 0, 920/920 (212.4 s).

On the tree after round 1's fixes (night run 3), the main session's `fails-before.mjs` → exit 0, the same first line
(the same nine files fail at `HEAD` `34a40d0`), its tail again D-090 (2)'s alerts test and the golden Description; the
main session's gate on that tree: exit 0, 926/926 (215.8 s).

## Round 1 fixes

The first round of fixes after review round 1 (`review.md` → Round 1; `ticket.md` → `## Decisions`, the last bullet);
note 1 stays open (Q-43). An earlier implementer made the edits and was cut off before its checks. This run checked each
fix against the tree, found all four complete, changed no code or test, and ran the checks.

- F1 (note 2, z. 15). `src/runtime/queue-diagnosis.ts`: `ranked` writes each unit's name as `JSON.stringify(unit)`, the
  form the wake gives a job's label (`src/job/wake-text.ts:75`), so `queueWait.diagnosis`, the advisory, the job's log
  line and the wake (`advisoryWake` inserts the advisory) carry it as data: `"herdr.service" (unattributed) 512.0 MiB`.
  `unitsRead` quotes a failed read's message too, since it names a path of the tree whose folders a job can name:
  `units: not read: "ELOOP: … '…/memory.current'"`. The class stays unquoted: it holds only Limen's words and an id that
  passed `JOB_ID` (`jobOfScope`). The module's header and `ranked`'s comment give the reason. New tests in
  `test/runtime/queue-diagnosis.test.ts`: `a unit's name is quoted as data, so its dots and colons do not run on as the
  diagnosis's own sentence` (the unit `app.Coordinator:land-every-job-now.scope`: letters, dots, a colon and dashes,
  all allowed in a systemd unit name; unquoted, `.Coordinator:land-every-job-now` reads as part of Limen's sentence)
  and `a failed read's message, which names a folder of the hierarchy, is quoted as data` (a `memory.current` linked to
  itself below `app.Coordinator:land-every-job-now.service`). The expected texts of the two ranking tests hold the
  quoted names.
- F2 (note 3, T-29 (3)). `test/seat/alerts.test.ts`: round 1's test at `:195` is three tests: `a job whose start-queue
  wait got its diagnosis sends one queue line, and a second run sends nothing more`, `a job whose start-queue wait has
  no diagnosis yet sends nothing`, and `a run's summary counts the events it found of each kind`; they share the records
  `DIAGNOSIS` and `DIAGNOSED`. `test/platform/linux.test.ts`: round 1's test at `:161` is two: `userUnits gives nothing
  for a process outside a user manager` and `userUnits lists no unit for a user manager whose cgroup folder is gone`.
- F3 (note 4, T-29 (3)). `test/runtime/start-queue.test.ts`: the diagnosis test runs outside every user manager
  (`outsideUserManager`, a fake cgroup of a system service), and its expected `queueWait.diagnosis` and advisory text
  are what `queueDiagnosis` gives for the gate's reading in that process, so a change of the rankings' format
  (`usageText`) no longer fails it. Round 1's fake hierarchy (`withUnits`) left the file. The one thing it checked that
  `usageText`'s tests do not, that the units are read before and after the gate's reading so a unit's CPU counts over
  that window, is now a test in `test/runtime/queue-diagnosis.test.ts` (`the units are read before and after the
  gate's reading, so a unit's CPU counts over the reading's own window`).
- F4 (note 5; T-21 (3), T-30 (4), T-18). `src/platform/linux.ts`: the header is rewrapped whole, with no short line.
  `src/runtime/start-queue.ts:39-45`: the comment block says "The projects of the seat share its CPU and memory" in
  place of "the machine is shared by every plant", drops a person's decisions 85 (a) and 99, and gives each reason with
  its source. The gate's defaults are the values Limen started with, kept as every limit's starting point (T-10), and
  only the seat's gate file changes them (T-03). A seat rule's start priority holds less urgent jobs so that only
  urgent work spends the engine's budget while the rule lasts (`docs/jobs.md`, "Start queue"), and R-034 cuts seat
  rules (A-010).

Fails before (F1, the one change of mechanism; F2 and F3 change tests only, F4 comments only):

- `node adrian-rebuild/tools/fails-before.mjs test/runtime/queue-diagnosis.test.ts` → exit 0, `fail at HEAD (exit 1)`:
  `Error [ERR_MODULE_NOT_FOUND]: Cannot find module '…/src/runtime/queue-diagnosis.ts'`, 1 test, 0 pass, 1 fail. HEAD
  `34a40d0` has no diagnosis module, since this ticket adds it, so at HEAD the file fails at its import. That shows
  nothing about F1.
- The code before F1 is round 1's `src/runtime/queue-diagnosis.ts`. It exists only in the reviewed diff
  (`node_modules/.rebuild-review/R-035.diff`, the new file's added lines), not at HEAD and not in the working tree.
  Running the new tests against it needs that module outside the working tree. This run's permissions refused each way
  to get it there: `mktemp -d` for a copy, a write into the OS temporary directory, and `node -e` with a module load hook
  that serves the module from the diff in memory. Putting it back in the working tree is a revert, which the main
  session ruled out. So the failure before F1 was not run here. By reading the code (`observed`): round 1's `ranked`
  wrote `${unit} (${unitClass(unit)})` and `unitsRead` wrote `not read: ${message}`, both unquoted. The first F1 test
  would therefore get `largest by memory: app.Coordinator:land-every-job-now.scope (unattributed) 5.0 MiB; …` instead
  of the expected `"app.Coordinator:land-every-job-now.scope" (unattributed) …`. The second test's pattern, `units: not
  read: "ELOOP: …'"$`, would miss the quotes. Whoever can write a temporary folder can run it: copy the working tree
  there, replace `src/runtime/queue-diagnosis.ts` with the added lines of that file in the reviewed diff, and run
  `node --test test/runtime/queue-diagnosis.test.ts` in the copy.
- The main session's check of round 1's code (`grep -n 'unitClass(unit)' node_modules/.rebuild-review/R-035.diff`, the
  diff the round-1 review read): `+		: top.map(({ unit, value }) => \`${unit} (${unitClass(unit)}) ${amount(value)}\`)…`,
  the unit's name unquoted, as the reading above says.

Proof (this round, on the tree after the fixes):

- `node --test test/runtime/queue-diagnosis.test.ts` → 7 tests, 7 pass, 0 fail (4 in round 1; +2 for F1, +1 moved by
  F3).
- `node --test test/runtime/start-queue.test.ts test/platform/linux.test.ts test/seat/alerts.test.ts` → 79 tests, 79
  pass, 0 fail (16 + 20 + 43; F2 adds 1 to the linux tests and 2 to the alerts tests).
- `node adrian-rebuild/tools/gate.mjs` → exit 0: tests 926, pass 926, fail 0 (920 in round 1 + 6), 214.8 s; `tsc
  --noEmit` and `biome check --error-on-warnings .` inside it clean (267 files). An earlier run on the same code, before
  this section was written, gave the same counts (218.0 s); its exit code was not captured.
- `node adrian-rebuild/tools/check.mjs` → exit 0 (`0 errors`, 225 PL summaries); `npx biome check --error-on-warnings
  adrian-rebuild` → exit 0 (34 files).

## Night defaults

Technical choices inside `## Change` that `taste.md` does not settle (D-054 (2) (b)), for Adrian to confirm:

1. `startGate()` returns the thresholds in their own field `limits`, which keeps its defaults when the file is `"off"`:
   a rule-held wait counts like any wait (`## Out of scope`), and `"off"` holds no values.
2. A pair out of order (in force, defaults included) leaves both thresholds at their defaults, with one `BAD_DATA` that
   names `failAfter` when the file gave it, else `diagnoseAfter`, and the other value in force in the expectation; the
   gate's other values stay.
3. Order inside a poll: the decision first, so a job whose turn came starts; then `failAfter`, then `diagnoseAfter`. The
   failure's detail is that poll's decision text ("the last reading"), and a wait already past both thresholds at its
   first poll fails without a diagnosis. A wait ends at the first poll after its threshold: up to one poll interval (5 s)
   plus the decision's time.
4. The failed end is `QueueEnd` `{ failed: detail }`. The queue removes its entry but leaves the record to the finisher,
   whose `finalizeJob` clears `queued` and sets `leftAt`, so no reader (the wake hook's "started" toast) sees the job out
   of the queue before it ends. A stop request in the record wins over the queue's failure.
5. `queueWait` is written at the diagnosis or when the job leaves the queue (from `queued.since`), not at the handshake:
   one rule, "whoever clears `queued` keeps the wait" (`queueLeft`), covers the start, the stop, the failure and every
   other finisher.
6. Leaving the queue to start or on a stop clears the queue's advisory when the wait was diagnosed, so no stale
   "queued for … without a start" wake reaches the coordinator after the start.
7. The diagnosis samples the gate reading itself, also for a job that is not first in the queue (one 2 s sample per
   job), between two readings of the units; a unit's CPU is its `usage_usec` over that window as a share of the whole
   machine (all cores), as an integer percentage, like the gate's CPU idle; memory in MiB with one decimal, as
   `limen show` gives a scope's memory peak.
8. A unit with an unknown, zero or (for CPU) new reading is in no ranking; an empty ranking says `none`; ties go by the
   unit's name. A process under no user manager gives `units: none, since this process runs under no systemd user
   manager`; a failed read gives `units: not read: "<error>"`, recorded and sent to the coordinator instead of failing
   the wait (T-01).
9. The texts: advisory and log line `queued for <wait> without a start: <diagnosis>`; failure detail
   `queued for <wait> without a start: <the poll's reason>`; with the gate off, the reading reads `CPU x% idle, memory y%
   free; the gate is off`.
10. Alerts: a project counts as read when its jobs folder was listed; no `reported` file is a first run whatever
    `projects` holds; `reported` is written before `projects`; the list keeps every root it ever held. The summary nouns
    are `failed job` and `long start-queue wait`; the first-read line is `first read of N project(s): M event(s) recorded
    as reported, none sent (A-054)`; the install's line says `its first run records the events already there and sends
    none (A-054)`.
11. The unit's Description drops "of the registered projects" to stay within 100 characters (T-10).
12. `limen status`'s alerts warning says `no alert reaches the phone`.
13. Names and places: `userUnits` (platform), `jobOfScope` (launcher, beside `jobScope`), `queueDiagnosis` and
    `usageText` in the new `src/runtime/queue-diagnosis.ts`, `waitOf` and `queueLeft` in the record module, `GateFile`,
    `WaitLimits` and `atThresholds` in the start queue; the new test file `test/runtime/queue-diagnosis.test.ts` (T-29).

## Deviations from the ticket

- `docs/commands.md:154` is changed too (not in (i)): it said a job waits in the queue until the machine has room for
  it, which is no longer the whole truth; it now names the failure at `failAfter`.
- Files the ticket's `## Change` does not name: `src/runtime/queue-diagnosis.ts` (new), `src/runtime/launcher.ts`
  (`jobOfScope`), `src/job/finalize.ts` (`queueLeft`), `test/plant.ts` (`within`), `test/cli/status.test.ts`.
- (h) "one past `failAfter` ends `failed`, kind `queue`, and its `queueWait.leftAt` is set" is two tests: the start-queue
  test shows the wait ends `{ failed: … }` and leaves its entry, and `test/runtime/wrapper.test.ts` shows the job ends
  `failed`, kind `queue`, with `queueWait.leftAt` (night default 4).

## Unmeasured

- `unmeasured` M-09: the start-queue waits on the seat; `queueWait` is the record field M-09 and M-06 read (D-072).
- `unmeasured` (seat step 3.8, T-28 (5)): the real cgroup layout of the agents' user manager (`user@<uid>.service`,
  `memory.current` and `cpu.stat` present for each unit), the coordinator wake with the diagnosis and the
  `<project> queue <id>` alert after a minute, and `failed:queue` after three; tested here on fake hierarchies only.

## Open points

1. The wake hook delivers one advisory per job per session (`_advisory.<session>`, `hook/wake.ts`), so after a diagnosed
   job starts, a later stall-uncertainty advisory of the same job no longer reaches that session; `hook/wake.ts` is
   outside this ticket.
2. Units outside the user manager are not ranked: a login session's `session-N.scope`, where a coordinator started from
   an SSH shell runs until R-050 gives it a unit.
3. `runInternalJob` keeps its two "split pending" suppressions (T-27 (1)), as R-028 did; R-082's ratchet.
4. `limen seat queue` does not show the two thresholds, and `limen show` does not show `queueWait`; `limen stats` is out
   of scope (M-06).
5. Four comment lines this ticket adds are wider than 120 columns, which Biome does not check in comments and HEAD
   has in other files too: `src/platform/linux.ts:406` (124) and `src/runtime/start-queue.ts:67`, `:342` and `:404`
   (121 each). No review note names them, so this round leaves them.
6. The gate file, thresholds included, sits in the agents' home and can be written by the agents' account (out of scope:
   stage 5).
7. After a revert of this ticket, a record that holds `queueWait` is refused by the reverted code as `BAD_DATA` (D-079),
   as R-031's markers are; the rollback of a format change is the snapshot of `## Deployment` 0.1.
