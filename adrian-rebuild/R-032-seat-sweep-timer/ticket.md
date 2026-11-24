<!-- PL: Ticket R-032 (minutowa połowa podziału D-094 (1); A-024, A-017, T-04, T-18, D-045, D-056 (4), notatki D-092):
`limen sweep` staje się `limen seat sweep` na timerze użytkownika co minutę (instalator systemd z lingeringiem i
`TimeoutStartSec`, weryfikacja przy wdrożeniu), żniwiarz wychodzi ze `status`, `show` i ticku hooka wake, które
stają się poleceniami odczytu; sweep kończy pozostałe scope'y zakończonych jobów, czyta `deactivating` jako
niezakończony, nie działa wewnątrz scope'u joba i eskaluje job, którego nie umie zakończyć (pole `stuck`, alert i
linia `limen status`). Stan: napisany 23.11 przy `06d8d75` z inwentarza `evidence/inventories/R-032.md`; pytania
rozstrzygnięte dokumentami w `## Decisions`; w realizacji od 24.11 (dzień, `8b1ec4c`, pozycje faktów po R-029 na
końcu `## Decisions`). -->

# R-032 `limen seat sweep` runs on a timer; read commands never write or wait

## Problem

Finding A-024, its Decision quoted from `audit.md`: "One seat timer `limen-sweep` on the agents' account across all
registered projects: every minute the reaper (A-005), quota resume (A-016) and owed wakes; daily prune and `--retire`.
`limen sweep --install` on Linux installs systemd user units (no root), idempotently, with `--uninstall` and
`--status`; it checks lingering and, if off, prints the command for root and exits ≠ 0. It installs nothing on other
accounts." Finding A-017, the part not done by R-019: "oneshot units get `TimeoutStartSec`."

Plan decisions and rules the change relies on:
- D-094 (1): "R-032 keeps the minute sweep: `limen seat sweep` on a user timer, the reap moved out of `status`, `show`
  and the wake hook, `status` and `show` read only, the reaper's notes (a `deactivating` scope, a reaper inside the
  reaped scope, the escalation of a job that cannot be reaped, the `liveJob` callers), the systemd installer with
  lingering and `TimeoutStartSec`, deploy's verification, step 3.1; the new R-101 takes the daily steps: prune and
  retire as steps of the sweep, the `prune` command's removal (its old name), the archive instead of deletion (z. 29),
  the gitlink notes (D-088), `.publishing-<id>`, `jobKeeps`, the retire races … and `abandonedOf`".
- T-04: "Read commands (`status`, `show`, `diff`, `seat queue`, `stats`, …) never write and never wait. They compute a
  dead job's state and show it without writing it, e.g. "wrapper dead since …; limen-sweep will finalize". The
  housekeeping before every `limen` call goes. Only `limen-sweep` (A-024) and explicit state-changing commands, a
  manual `limen sweep` included, clean up and finalize." Check: "every read command leaves `.limen/` byte-identical
  and returns without waiting; a test runs them on a read-only copy of `.limen/`; … read commands do not import the
  state-transition functions."
- T-18: the group `seat` holds `seat queue` and `seat sweep`; an old name exits 2 and names the new form in `next`.
  T-26 (4): "systemd timers calling `limen` by an absolute path". T-02: "Timers retry 3 at their next run and ring only
  after several in a row; 2, 4 and 5 ring at once". T-25: one module per policy. T-38: a change command runs through
  `operationHandler` (`src/operation.ts`), refusals before the first write. T-01: a failure is never silent.
- D-045 (6.2), (6.3): `status` and `show` become `read`, and the test that every `read` command leaves the project's
  files and `.limen/` unchanged passes for them. D-039: "the command registry holds no entry with `movedBy` naming
  this ticket". D-056 (4): the units set `TimeoutStartSec`, "so that a unit that waits on a lock (R-019's 60 s bound)
  is not stopped first". D-010: units "generated from typed definitions, with golden tests"; the deployment script
  runs `systemd-analyze verify`. D-023: R-032 replaces the LaunchAgent installer with the systemd installer. D-036:
  `seat/deploy.ts` is checked by its tests. D-041 (6): "The kind is not shown by `limen <command> --help` until read
  commands write nothing (T-04, R-032)".
- Notes in `## Tickets` (D-092, D-093): (R-027 review round 1, findings 4 and A) "`scopeState` reads `is-active` exit 3
  as gone, also for a `deactivating` scope, which may still hold processes …; and a reaper that runs inside the reaped
  job's own scope … gets its own TERM before any write … The sweep reaps from outside every job scope and reads a
  `deactivating` scope as not yet ended"; (R-027 Night default 2, Q-44) a `running` record with no `scope` whose pid
  has no start time while a live process holds it stays `running`, and "the sweep escalates such a job (an alert and a
  `limen status` line)"; (R-027 Out of scope) "the gate of `seat/deploy.ts`, the migration's `folderLive` and the
  other `liveJob` callers treat a dead wrapper with a live engine as not running; a terminal job whose scope end
  failed keeps its processes … The sweep checks the scope of every job it reads, and escalates a job whose scope
  cannot be ended."

Facts at `06d8d75` (the read-only inventory `adrian-rebuild/evidence/inventories/R-032.md`, made at `6d17130`; `git
diff 6d17130 HEAD -- src hook bin seat test templates docs` is empty; the main session checked the ones it quotes):
1. `limen status` and `limen show` reap before they read: `confirmDeadJobs` (`src/runtime/reap.ts:292-300`) from
   `src/project/summary.ts:85` and `src/job/detail.ts:15`; it sleeps 10 s when a `running` job is not live, then each
   dead job gets a TERM, a 10 s grace and a KILL with 1 s, and its finisher's Herdr wake (15 s). Both are kind `change`
   (`src/registry.ts:464-477`, `:541-554`) and sit in T-38's `OUTSIDE_RUNNER` (`test/structure.test.ts:167-194`). The
   wake hook's tick reaps every 500 ms (`reapDeadJobs`, `hook/wake.ts:752`), in the coordinator's Pi process.
2. `limen sweep` (`src/commands/sweep.ts`, 111 lines; registry `src/registry.ts:737-752`, top level, `movedBy:
   "R-032"`) reaps, removes dead coordinator registrations, and rings Herdr for unheard ends when the wake hook has not
   stamped `.limen/last-sweep` for 5 min; `--install` writes a macOS LaunchAgent (`src/project/seat.ts:40-56`), the
   one write exception of the T-25 scan "until R-032" (`test/structure.test.ts:384-393`). The seat has no sweep unit,
   and its old `limen-prune` timers were disabled on 2026-11-17.
3. The reaper (`src/runtime/reap.ts`): `endDeadJob` (`:170-182`) ends the scope first (R-027) and writes `failed` only
   once the scope or group is gone; a failed attempt leaves only a `reap: … not ended: …` log line (`:177`).
   `scopeState` (`src/platform/linux.ts:310-320`) reads `is-active` exit 3 as `gone`, which `deactivating` also gives.
   The terminal transition ends the scope again (`endJobScope`, `src/job/finalize.ts:158-167`); a failure there logs
   `scope <unit> was not ended: …` and nothing reads it again. The platform's `userUnits` (`linux.ts:415-443`) lists
   every scope of the user manager from the cgroup tree, with no `systemctl` call.
4. `liveJob` (`reap.ts:99-104`) is live for a `running` record only while its wrapper lives; its four callers outside
   the reaper (`seat/deploy.ts:297`, `src/job/migration.ts:285`, `src/job/spawning.ts:617`, `:960`) thus treat a dead
   wrapper whose scope still holds the engine as not running.
5. `seat/units.ts` holds the alerts' units as typed data with `renderUnit` (`:89-94`), golden tests
   (`test/seat/units.test.ts:47`), `TimeoutStartSec=120` and a timer of `OnBootSec=1min`, `OnUnitActiveSec=1min`,
   `AccuracySec=1s`; `seat/` imports from `src/`, never the reverse (`git grep -n -E "from ['\"][./]*seat/" -- src hook
   bin` finds no line). `seat/deploy.ts` has `VERIFICATIONS = []` (`:68-69`), each `{name, argv, timeoutMs}` run from the new
   checkout. The A-083 scan bans `systemctl` and `systemd-run` outside `src/platform/` in `src/` and `hook/`.
   `limen init` probes the user scope and names `loginctl enable-linger <account>`; no code reads the linger state.
6. `status` shows the alerts' trouble in a section from two system-unit probes (`alertsLines`,
   `src/project/summary.ts:184-205`): "Alerts not working (N); no alert reaches the phone until each is fixed:".
   The alerts read records only (`EVENTS`, `seat/alerts.ts:82-100`: `failed:<kind>` and `queue`), so an escalation
   they send needs a record field.
7. `seat queue` removes dead or malformed entries of the start queue (`liveEntries`, `src/runtime/start-queue.ts:582-602`)
   and, with a gate set, samples the CPU for 2 s (`readLoad`, `:164-174`). `diff` and `open` in Herdr record the tab's
   place under the job folder (`src/integrations/herdr.ts:102-133`, `:389-397`).
8. `next` values that name `limen sweep`: `src/job/group-control.ts:660-661`. `prune` also has `movedBy: "R-032"`
   (`src/registry.ts:593`), which R-101 now owns (D-094 (1)).

## Change

(a) `limen seat sweep` replaces `limen sweep` (group `seat`, kind `change`, no `movedBy`), through `operationHandler`
(T-38). One run, over every registered project, in parallel, each project finished before the run ends (z. 10):
1. the reap of every dead `running` job, as `confirmDeadJobs` does today (R-027's scope-first end);
2. the end of every live job scope whose record is terminal: the run lists the live `limen-job-*.scope` units once
   (`userUnits`) and ends each such scope as the reaper ends one (TERM, grace, KILL);
3. the removal of dead coordinator registrations and the Herdr ring, as today;
4. once per run, not per project: the removal of the start queue's dead or malformed entries (moved out of
   `seat queue`, item (d)).
The run's exit is the worst class of its projects (T-02); a project that fails is named with its reason and does not
stop the others. A `limen seat sweep` that runs inside a job scope (its own cgroup is a `limen-job-*.scope`) refuses
with class `refused`, code `SWEEP_IN_JOB`, before any write: the sweep never signals the scope it runs in.

(b) The reaper's fixes: `scopeState` reads a `deactivating` scope as not ended (the job is attempted again at the next
run). A job whose processes the sweep cannot end gets an optional record field `stuck` (`since`, `attempts`,
`detail`; written as `advisory` is, never through a terminal transition) at each failed attempt of step 1 or 2,
including a `running` record whose state cannot be read (no `scope`, a pid with no start time held by a live
process). From the third attempt in a row (T-02's "ring only after several in a row") it is escalated: the alerts send
an event `stuck` (a new entry of `EVENTS`, `seat/alerts.ts`), and `limen status` shows a section
`Jobs the sweep cannot end (N):` with one line `<id>: <detail> (since <time>)` per job.

(c) The four `liveJob` callers of fact 4 ask whether a job holds any process: its wrapper lives, or its record's scope
is not ended; the reaper keeps asking about the wrapper alone, since it ends the scope of a dead wrapper.

(d) Read commands write and wait for no housekeeping: `status` and `show` no longer reap (kind `read`; they leave
`OUTSIDE_RUNNER`, and their `refuses` keep only what their own reads throw); the wake hook's tick no longer reaps (it
keeps its deliveries and its `.limen/last-sweep` stamp); `seat queue` skips a dead or malformed entry without removing
it. A dead `running` job shows, in `show` and in its `status` row, `wrapper dead; limen-sweep will finalize`.

(e) The installer, in the platform adapter (A-083) with the unit model moved from `seat/units.ts` to
`src/platform/units.ts` (T-25; `seat/units.ts` keeps `alertsUnits` and imports the renderer):
- `limen seat sweep --install` checks lingering (the file `/var/lib/systemd/linger/<account>`); when it is off, it
  exits 4 (`environment`, code `NO_LINGER`) and its message names `loginctl enable-linger <account>` for root.
  Otherwise it writes `limen-sweep.service` and `limen-sweep.timer` into the user unit folder systemd reads
  (`$XDG_CONFIG_HOME/systemd/user`, else `~/.config/systemd/user`) atomically and only when they differ, verifies them
  with `systemd-analyze --user verify` (a failure puts the old files back, as the alerts' install does), runs
  `systemctl --user daemon-reload` and `systemctl --user enable --now limen-sweep.timer`. Running it again changes
  nothing.
- The service: `Type=oneshot`, `ExecStart=/usr/bin/node <package root>/bin/limen seat sweep` (the alerts' node,
  `seat/units.ts:22`; the package root of the running CLI, `/opt/limen` on the seat), `TimeoutStartSec=300`. The timer:
  `OnBootSec=1min`, `OnUnitActiveSec=1min`, `AccuracySec=1s`, `WantedBy=timers.target`.
- `--uninstall` disables the timer (`--now`), removes both files and reloads. `--status` prints the sweep's lines of
  (f), or `limen-sweep.timer is active` when there is none, and exits 0. The three flags exclude each other (a usage
  error, class `usage`).
- The LaunchAgent installer goes (`src/project/seat.ts:40-56` and its T-25 exception).

(f) `limen status` names a sweep that does not run, as it names the alerts (fact 6), from two user-unit probes of the
platform adapter, each bounded at 3 s: `Sweep not working (N); no dead job is finalized until each is fixed:` with
`limen-sweep.timer is not active; on the agents' account, install the sweep:` and `limen seat sweep --install`, or
`limen-sweep.service failed; read why:` and `journalctl --user -u limen-sweep.service`.

(g) `seat/deploy.ts` gets a verification (R-012's `VERIFICATIONS`, run from the new checkout as a process): it renders
the sweep's units with the new checkout's code into a temporary folder and runs `systemd-analyze verify` on them; it
writes nothing in any home. Tested by `test/seat/deploy.test.ts` (D-036).

(h) Registry and old names: the `seat sweep` entry with its three flags; `limen sweep` exits 2 (`REMOVED`) with `next:
"limen seat sweep"` (the `queue` pattern of `src/old-names.ts`); `group-control.ts:660-661` names `limen seat sweep`;
`prune`'s `movedBy` becomes `"R-101"`. Help and the generated sections of `docs/commands.md` follow the registry.

(i) Tests, each failing before the change:
- `test/cli/sweep.test.ts`: a run reaps a dead job of each of two projects; ends a live fake scope of a terminal job;
  writes `stuck` at each failed attempt and escalates from the third; refuses `SWEEP_IN_JOB` inside a job scope;
  removes a dead start-queue entry; a project that fails does not stop the other; `--install`, `--uninstall` and
  `--status` against the fake systemd (a missing linger file exits 4); `limen sweep` exits 2 naming `limen seat sweep`.
- `test/platform/units.test.ts` (new, after its module): golden sweep units; `test/seat/units.test.ts`: the alerts'
  golden units unchanged.
- `test/platform/linux.test.ts`: `deactivating` is not ended; the linger read; the user-unit probes.
- `test/runtime/reap.test.ts`: the callers of (c) count a dead wrapper with a live scope as live.
- `test/registry.test.ts`: the T-04 read test runs on a project with a dead `running` job and leaves its snapshot
  unchanged for every `read` command, `status` and `show` among them, and they run on a read-only copy of `.limen/`;
  `status` and `show` are `read`; no entry has `movedBy: "R-032"`.
- `test/structure.test.ts`: the modules of `read` commands import no state-transition function (T-04's Check);
  `OUTSIDE_RUNNER` without `show` and `status`; no LaunchAgent exception.
- `test/cli/status.test.ts`, `test/cli/show.test.ts`: a dead job is shown with the line of (d) and not reaped; the
  sections of (b) and (f). `test/hook/wake.test.ts`: the tick does not end a dead job. `test/seat/alerts.test.ts`: the
  `stuck` event from the third attempt only. `test/runtime/start-queue.test.ts`: `seat queue` removes nothing.
- `test/s9-housekeeping.test.ts` and the other tests that reaped through `limen show` reap through `limen seat sweep`.

(j) Text that becomes false: `docs/commands.md` (generated sections, `:19`, `:240`, `:323-329`), `docs/jobs.md:216-218`,
`:228`, `templates/agents.md:202` (with its new first hash in `templates/.history/agents.md`),
`docs/herdr-status.md:64-66`, `:104`, `docs/groups.md:93`, `docs/seat/README.md` (the sweep's install beside the
alerts'), the comments `src/registry.ts:467`, `:473`, `:544`, `:550`, `:742-748`, `src/commands/sweep.ts:17`,
`src/job/detail.ts:9`, `src/platform/platform.ts:10-11`, `src/job/group-control.ts:652-661`, `seat/units.ts:1-6`,
`:27`, `seat/deploy.ts:68`, `test/registry.test.ts:278-279`, `:770-771`, `test/structure.test.ts:167-171`, `:384`.
Seat step 3.1 in `plan.md` → `## Deployment` already names the new checks (the main session wrote it with this
ticket).

## Out of scope

- The daily steps and everything D-094 (1) gives R-101: prune and retire as steps of the sweep, the `prune` command
  and its old name, the setup prune at a job's start, the archive of never-started records and of
  `.limen/.publishing-<id>` (with the `starting` record left by a crash, R-099's open point 7), `jobKeeps`, the gitlink
  notes, the retire races, `abandonedOf`, `docs/seat/limen-prune.*` and the prune text of the docs.
- Quota resume and owed wakes (R-034), the seat rules (R-102), foreign timers and engines (R-060), leftover Herdr tabs
  (T-18 (1), R-101 by D-096 (1)), `hold` steps (T-22).
- `diff` and `open`, which record their Herdr tab's place (fact 7): the place serves the closing of the job's tabs,
  which R-103's `cleaned` step rewrites (a note in `## Tickets` → R-103); and so the kind in `limen <command> --help`
  (D-041 (6)) waits for it.
- `seat queue`'s 2-second CPU sample and the bounded Herdr and systemd probes of `status` (T-04's "never wait"; an open
  point for gate 5.3, `## Decisions` 9).
- The registry rewrite of `updateRegisteredProjects`, which drops the alerts' ACL when a registered folder is gone
  (R-033's open point 5, for gate 5.3).
- `TimeoutStartSec` of `docs/seat/limen-github.service` (A-017's other oneshot unit; the doorbell's units are seat
  code that R-059 types).

## Acceptance

- AC-1: `node --test test/cli/sweep.test.ts` → exit 0; `node --test test/cli/old-names.test.ts` → exit 0.
- AC-2: `node --test test/platform/systemd-units.test.ts` → exit 0 (Decision 15); `node --test test/seat/units.test.ts` → exit 0.
- AC-3: `node --test test/platform/linux.test.ts` → exit 0; `node --test test/runtime/reap.test.ts` → exit 0.
- AC-4: `node --test test/registry.test.ts` → exit 0; `node --test test/structure.test.ts` → exit 0.
- AC-5: `node --test test/cli/status.test.ts` → exit 0; `node --test test/cli/show.test.ts` → exit 0.
- AC-6: `node --test test/hook/wake.test.ts` → exit 0; `node --test test/runtime/start-queue.test.ts` → exit 0.
- AC-7: `node --test test/seat/alerts.test.ts` → exit 0; `node --test test/seat/deploy.test.ts` → exit 0.
- AC-8: `node --test test/help.test.ts` → exit 0; `node --test test/s9-housekeeping.test.ts` → exit 0.
- AC-9: `git grep -q 'movedBy: "R-032"' -- src/registry.ts` → exit 1.
- AC-10: `node adrian-rebuild/tools/fails-before.mjs` → exit 0, its output in `outcome.md` → `## Fails before`.
- AC-11: `node adrian-rebuild/tools/gate.mjs` → exit 0.
- AC-12: `npx biome check --error-on-warnings .` → exit 0; `node adrian-rebuild/tools/check.mjs` → exit 0.
- AC-13 (judgment): only `limen seat sweep` and explicit change commands finalize a job; no read command and no hook
  tick reaps; the sweep never signals the scope it runs in, reads a `deactivating` scope as not ended, ends the
  leftover scopes of terminal jobs and escalates, from the third attempt in a row, a job it cannot end; the installer
  refuses without lingering and changes nothing when run again.

## Migration

- `limen sweep` exits 2 and names `limen seat sweep` (tested in `test/cli/old-names.test.ts`); a script or unit that
  called it changes by hand (none on the seat: no sweep unit exists there, fact 2).
- `stuck` is optional when read (D-079's additive pattern).
- Units: seat step 3.1 installs them on the agents' account; nothing is removed on the seat (the LaunchAgent was never
  written on Linux).

## Risk

- A reap now waits for the next minute's run (at most about 70 s with the confirmation), so a dead job's end and its
  coordinator's wake come later than when `status` reaped them.
- A run killed at `TimeoutStartSec` mid-reap leaves the job `running`; the next run attempts it again, and its
  `stuck` counts the attempts.
- The unit's `PATH` is the user manager's default, so a `herdr` outside it makes the finisher's Herdr wake skip with a
  log line (`herdr is not available`); seat step 3.1 reads the journal of the first run.

## Rollback

`git revert $(git log --format=%H --grep='^R-032:' adrian-rebuild --)`. Before the revert's deployment, on the agents'
account: `systemctl --user disable --now limen-sweep.timer`, then remove `limen-sweep.service` and `limen-sweep.timer`
from the user unit folder and `systemctl --user daemon-reload`. After a revert, a record with `stuck` is `BAD_DATA`
(D-079); the rollback of a format change is the snapshot of `## Deployment` 0.1.

## Decisions

Settled by the documents when the ticket was written (2026-11-23, the main session's reading, not a night default;
the inventory's questions in `evidence/inventories/R-032.md` → section 9). Items 4, 6, 8 and 9 are named for Adrian's
attention at gate 5.3.
1. Unit kind (question 1): user units on the agents' account, as A-024's Decision says; the reaper's `systemctl
   --user` needs that account's user manager.
2. Cadence (question 2): one timer every minute; the daily steps are R-101's, which gates them inside the run. A
   manual `limen seat sweep` runs what the timer runs (T-04).
3. `ExecStart` (question 3): `limen` by an absolute path (T-26 (4)) with the root-owned `/usr/bin/node` that the
   alerts' unit runs (`seat/units.ts:22`); the generator lives in the platform adapter, since `src/` imports nothing
   from `seat/` and the A-083 scan keeps `systemctl` there.
4. `TimeoutStartSec=300` (question 4): above the 60 s lock bound (D-056 (4)) plus the 10 s confirmation and the 11 s
   and 10 s call bounds of several stuck jobs, one after another; a run it kills is attempted again a minute later.
5. Install and verify (question 5): the linger state is a file systemd keeps, read with no call; the install mirrors
   the alerts' (atomic, verify, restore, reload, enable); deploy verifies the units rendered by the new checkout and
   writes no other account's home (A-024: "It installs nothing on other accounts"), so a unit change of a later tag is
   that tag's seat step.
6. `limen status` names a sweep that does not run (question 6), as it names the alerts (T-01); `--status`, which
   A-024's Decision lists, prints the same lines. The wording follows the alerts' section (T-18).
7. The wake hook's tick (question 7) stops reaping: D-094 (1).
8. The dead job's line (question 8) is T-04's example without "since …": the time of death is recorded nowhere, and
   the line states no time it cannot know (z. 2). `docs/jobs.md:228` and `templates/agents.md:202` say the sweep
   finalizes it within a minute and `limen seat sweep` does it at once.
9. Other read commands (question 9): `seat queue`'s removal of dead entries is housekeeping, so it moves to the sweep
   (T-04: reads never write); its 2-second sample and `status`'s bounded probes are waits T-04's words forbid but its
   Why ("the author's read commands reap jobs and can wait 10 s") does not name, so whether a read may take a bounded
   reading is Adrian's at gate 5.3. `diff` and `open` go to R-103 (`## Out of scope`).
10. The setup prune (question 10) and questions 11, 13, 14 and 15 are R-101's (D-094 (1)).
11. The reaper's notes (question 12): `deactivating` and the in-scope refusal as (a) and (b); the leftover scopes of
    terminal jobs are found by one listing per run (`userUnits`), not one call per record; the escalation needs a
    record field because the alerts read only records (fact 6), and it waits for three attempts in a row (T-02).
    `liveJob` keeps its meaning for the reaper, and its other callers ask the wider question (T-25: one function each).
12. The run (question 16) goes through the runner (T-38); no step of the minute sweep is `irreversible`; a failed
    project is reported, the others finish (z. 10).
13. Today's steps (question 17) stay: the Herdr ring and `notify/seat/` (the alerts send failures to the phone, the ring
    tells a coordinator in Herdr), and the registry's update (its ACL is R-033's open point 5).
14. The steps of later tickets (question 18) are `## Out of scope`; the split (question 19) is D-094 (1).

Started on 2026-11-24 at `8b1ec4c` (the main session, by day). R-029 (`b0c033b`) landed after the ticket was written
and changed `src/`, `hook/` and `test/` (`git diff --stat 06d8d75 8b1ec4c -- src hook seat test`), so some positions
of the facts moved; the main session found them at `8b1ec4c`: `confirmDeadJobs` from `src/project/summary.ts:88` (was
`:85`), `alertsLines` at `src/project/summary.ts:193`, the tick's `reapDeadJobs` at `hook/wake.ts:753`, `endJobScope`
at `src/job/finalize.ts:168`, the `liveJob` callers at `src/job/spawning.ts:618` and `:964`, `OUTSIDE_RUNNER` at
`test/structure.test.ts:174`, the LaunchAgent exception at `test/structure.test.ts:385`; the rest are where the facts
say. R-029 added the failure kinds `launch` and `internal` (D-095) and the record's failure fields, so the reap and the
new `stuck` field follow `src/job/record.ts` at `8b1ec4c`.

2026-11-24, the implementer's `BLOCKED` (the main session's reading, settled by the documents; items 15 and 16 are
named for Adrian's attention at gate 5.3):
15. Names. `src/platform/units.ts` beside `seat/units.ts`, and `test/platform/units.test.ts` beside
    `test/seat/units.test.ts`, break the unique-basename rule of `test/structure.test.ts:26`, which AC-4 and AC-11
    run, so the ticket's names were wrong. The unit model is `src/platform/systemd-units.ts`, its test
    `test/platform/systemd-units.test.ts` (named after what it holds, T-25 (1); no `git mv`, the fewer moving parts at
    the same effect). AC-2's first command reads `node --test test/platform/systemd-units.test.ts` → exit 0.
    `seat/units.ts` keeps `alertsUnits` and imports the renderer, as (e) says; it does not re-export it, and a test
    of the renderer itself moves to the new test file, with the alerts' golden texts unchanged.
16. The T-04 import scan of (i) reads "the modules of `read` commands": each `read` command's handler file and the
    `src/` modules it imports directly import no state-transition function (`transition`, `finalizeJob`,
    `writeMarker`, `publishRecord`, `reapDeadJobs`, `confirmDeadJobs`, and the new `writeStuck`). `rule` is an exception
    with its end ticket R-102 named in the test (R-102 moves it); `seat queue`'s report leaves
    `src/runtime/start-queue.ts` for a module of its own, so it passes. The transitive closure (through
    `src/runtime/reap.ts`'s `ownerState`, `start-queue.ts` and command files that hold read and change commands) is not
    this ticket's (D-025): an open point of `outcome.md` for gate 5.3, with the paths found. The behavioural guarantee
    is the T-04 read test of (i) (`test/registry.test.ts`, a read-only copy of `.limen/` with a dead `running` job).
17. The implementer's technical defaults stand: `scopeState` reads the word `systemctl --user is-active` prints, and
    only `inactive` or `failed` is ended (an engine fact `outcome.md` names for seat step 3.1); `writeStuck` in
    `src/job/record.ts` beside `writeMarker`, under the job's lock, never changing the state, clearing `stuck` once an
    attempt ends the job's processes (so "three in a row" counts), and a terminal record that keeps `stuck` is cleared
    at the next run; `userUnits` also finds the user manager from a login-session cgroup (a manual run, Decision 2);
    `LIMEN_LINGER_DIR` is a new test knob registered in `src/config.ts` as the others are (T-03, so R-087's test mode
    covers it; R-087's count of 13 knobs grows by one) and `LIMEN_CGROUP` is the existing one; the deploy check of (g)
    is a small process in `seat/` run from the new checkout; exclusive flags are the usage error `SWEEP_FLAGS`; the
    command stays in `src/commands/sweep.ts`; `finishSweep`'s "split pending" suppression goes if Biome allows.

2026-11-24, review round 1 (`review.md` → Round 1; PASS, the findings to fix, each with a test that fails without it
where it changes code):
- F1 (note 1, T-25 (1)): the unit-file install policy (read the current text, write only what differs, verify, put
  back on failure) has one module, `src/platform/systemd-units.ts`; `seat/alerts.ts` imports it for its system units
  and keeps only what differs (its folder, the system manager's verify, reload and enable, the ACLs). The alerts'
  tests and golden texts stay green and unchanged in meaning.
- F2 (note 3): `docs/commands.md:24` names every command that runs through `operationHandler` (`abandon` and
  `seat sweep` among them), with the count that follows.
- F3 (note 4): `outcome.md` → `## Fails before` states why the T-04 read test (its kind guard at `HEAD`) and the
  import scan (`seat queue` alone at `HEAD`) fail there, and which tests prove that `status` and `show` no longer
  write (their dead-job tests).
- F4 (note 5): a test that fails when the start queue's dead entries are removed once per project instead of once per
  run; tests that a failed step-2 end and a `running` record with no `scope` whose pid has no start time while a live
  process holds it each write `stuck` (attempts counted) and escalate from the third attempt.
- F5 (note 6): the user manager is the one of the process's own uid (`user-<uid>.slice/user@<uid>.service`, with
  `LIMEN_CGROUP` in tests), never the session slice's; a manager whose folder does not exist is no manager
  (`NO_USER_MANAGER`, the run's other steps go on), never an empty listing; `stuck` is cleared only on an end the run
  observed. Tests: a session cgroup of another uid; a missing manager folder.
- F6 (note 7): `holdsProcesses` does not depend on the caller's user manager, since the deployment gate runs as root:
  for a record with a `scope` (whose `cgroup` is always recorded) the answer is the cgroup folder's (`cgroup.events`
  `populated 1` holds, `populated 0` or a missing folder holds none, an unreadable one holds, z. 14), read through the
  platform adapter; `outcome.md` names the `cgroup.events` fact for seat step 3.1. Test: a fake user manager that
  answers `inactive` while the cgroup is populated.
- F7 (note 8): in a project's run, a record that fails to read (`BAD_DATA`, `NOT_MIGRATED`) and a step that fails are
  named with their reasons and stop neither the project's other jobs nor its other steps (the ring runs after a failed
  coordinator removal); the run's exit is the worst class, as for projects (z. 10, T-01). Test: a project with one
  damaged record and one dead job: the dead job is reaped and the run names the damaged record and exits with its
  class.
- F8 (note 9): the doc comment at `seat/deploy.ts:282` is rewrapped within 120 characters.
- F9 (note 10 and the T-18 remark): `systemd-analyze` is a declared requirement of the platform adapter, checked by
  `limen init` and the coordinator start as the others are (T-12 (2)); the `seat sweep` summary says in plain words
  what "unheard ends" meant (T-18).
- Rejected: note 2 (T-10, a `limen status` line over 100 characters): R-073 carries T-10 for `limen status`, whose
  lines already exceed 100 (as R-029 round 1, note 1).

2026-11-24, review round 2 (`review.md` → Round 2; PASS, F1–F9 done; the second and last round of fixes, each change
of code with a test that fails without it):
- G1 (note 10): `CONTRIBUTING.md:19` no longer lists `sweep` among the commands whose entry has `movedBy`.
- G2 (note 11, T-38 (3)): a rerun of `--uninstall` finishes what an earlier run left undone: with neither file there,
  it still disables the timer and reloads the user manager, so a reload that failed once is done by the next run.
  Test: a first `--uninstall` whose reload fails, then a second that reloads.
- G3 (note 12, T-29): `test/cli/sweep.test.ts:216` checks what its name says (or is named for what it checks, with the
  once-per-run proof left to the F4 test), and `:444` becomes two tests: the first install, and a second install
  that writes and verifies nothing.
- G4 (note 13, T-01): on the sweep's path, `removeDeadEntries` reads a missing start-queue folder as an empty queue and
  names any other failure to read it as the run's failure (the worst class, the other steps go on, as F7); the read
  paths keep their catch-all for R-082. Test: an unreadable start-queue folder fails the run with its reason.
