<!-- PL: Ticket R-107 (E-18, A-029, D-112 (1)): `systemctl --user is-active` z systemd 259 na seacie wychodzi kodem 4
dla unitu, którego menedżer nie zna (scope, który się nie zaczął albo został zebrany), a `scopeState` uznaje tylko kod
3, więc koniec joba bez scope'u loguje fałszywe „was not ended: exit code 4”, a sweep liczy `stuck` aż do alertu. Kody
3 i 4 dostają jedną regułę, w której decyduje wypisane słowo; fałszywy `systemctl` planta odpowiada jak systemd 259.
Stan: napisany 26.11 przy `cbe6f1a` z inwentarza `evidence/inventories/R-107.md`; `ready` na noc. -->

# R-107 The exit 4 of systemd 259's `is-active` reads as not active

## Problem

E-18 (`plan.md` → `## Engine facts`), quoted: "On the seat's systemd 259 (259.9-0ubuntu0.1), `is-active` of a name that
never existed, and of a transient scope that ended and was collected, prints `inactive` and exits 4, not 3 as
`src/platform/linux.ts` (`NOT_ACTIVE = 3`, line 52 at `a0.3.0`) assumes." D-112 (1): "the exit 4 of systemd 259's
`is-active` (E-18) → R-107 […] each S, `delegated`, `night`, in stage 4 with no dependency inside it". The note in
`## Tickets`: "Exits 3 and 4 both read as not active; a fake `systemctl` test returns 4." A-029's Decision, the part
that bears: "Every job runs in its own systemd user scope […]; any terminal transition stops the whole scope". A-005's
Decision: "only then `failed`, with a log of what it checked". T-01: "An expected absence (`ENOENT`, a dead process) is
an explicit condition, never a catch-all." T-25 (1): one module for a policy. T-28 (5): systemd behaviour gets a seat
step (4.13). D-118 (1): step 4.13 reads the job logs, not the sweep's journal.

Facts at `c3bbc5c` (the read-only inventory `evidence/inventories/R-107.md`; `git log a0.3.0..HEAD` of these files is
empty, so the lines are also `a0.3.0`'s):
1. `scopeState(unit, cgroup)` (`src/platform/linux.ts:232-249`) is "the one place of that rule; the end of a scope
   reads it here too" (`:237-238`): a known cgroup whose folder is missing is `gone` with no call (`:240-242`); then
   `systemctl --user is-active <unit>` (`:243`); exit `NOT_ACTIVE` (3, `:51-52`) is `gone` when the printed word is in
   `ENDED_STATES` (`inactive`, `failed`, `:53-57`), else `active`; every other exit goes to `callFailure`
   (`:247-248`, `:327-336`), so exit 4 with `inactive` on stdout and nothing on stderr is `failed`, detail
   `exit code 4`.
2. A record with no `scope` reaches the call: inside `Scope` the cgroup is required (`src/job/record.ts:149-152`), so
   these are the jobs that ended before their wrapper ran. Path 1, the end: `endJobScope` (`src/job/finalize.ts:185-194`)
   appends `scope <unit> was not ended: exit code 4` to the job's log (`:190`) and calls `onScopeNotEnded` (the
   wrapper's SIGKILL to its own group, `src/runtime/wrapper.ts:219`). Path 2, the sweep: `endLeftoverScopes`
   (`src/runtime/reap.ts:265-301`) reads `failed` (`:276`), `terminateScope` returns `not ended` (`:327`), `notEnded`
   (`:245-254`) logs `reap: <unit> not ended: exit code 4` and raises `stuck.attempts`; from 3 attempts
   (`STUCK_ESCALATION`, `src/job/record.ts:843-852`) the alerts send `stuck` (`seat/alerts.ts:111-116`) and `limen
   status` lists the job. Both lines go to the job's `log` (`appendLimenLog`, `src/job/record.ts:1183-1186`), never to
   the sweep's output.
3. The other reader, `unitAnswer` (`linux.ts:275-279`, as `userUnitState` and `systemUnitState`), returns the word
   only on exit 0, so its callers (`limen status`, `seat sweep --status` and `--uninstall`, the GitHub doctor) do not
   change with exit 4. Its "says no" versus "could not ask" is R-060's note (D-107 (1)), not this ticket's.
4. The plant's fake `systemctl` (`test/plant.ts:177-222`) answers `is-active` with `inactive` and exit 3 when no member
   lives (`:206-210`), "as systemd does for a scope that ended or never started" (`:180-182`), which E-18 refutes. The
   one-test fake `answeringSystemctl(parent, word, status)` (`test/platform/linux.test.ts:264-279`) makes its folder
   `systemctl-<word>` with a plain `mkdirSync`, so one test cannot use the same word twice. The existing test
   `finalizeJob of a job whose scope never started sends no kill and logs no failed end of its scope`
   (`test/job/finalize.test.ts:205-214`) passes today only because the plant answers 3.

## Change

1. `src/platform/linux.ts`: the one rule reads exits 3 and 4 alike: for either, the printed word decides (`inactive` or
   `failed` → `gone`, any other word → `active`, read again at the next sweep); every other exit stays a failure
   through `callFailure`. `NOT_ACTIVE` becomes a named set of the two exits with a comment that cites E-18 (systemd 259
   exits 4 for a unit it does not hold); the comments at `:51`, `:54` and `:234` that say "exits 3" follow (T-30).
   `unitAnswer` does not change.
2. `test/platform/linux.test.ts`: a test that `scopeState(UNIT, undefined)` under a fake answering `inactive` with exit 4
   is `gone` (at HEAD `failed`, `exit code 4`); `answeringSystemctl` takes the exit in its folder's name, so the exit-3
   and exit-4 cases can sit side by side; the test that a failing call gives the manager's first stderr line stays.
3. `test/plant.ts`: the fake `systemctl` answers as systemd 259: a scope whose cgroup folder is missing (never started,
   or collected after a `kill`) gets `inactive` and exit 4; a folder with no member keeps `inactive` and exit 3; its
   comment cites E-18. With it, `test/job/finalize.test.ts:205-214` fails at HEAD (the end logs `was not ended: exit
   code 4`) and passes after item 1, which proves path 1 at the module that writes the line.
4. A test in `test/runtime/reap.test.ts` of path 2: `endLeftoverScopes` over a terminal record with no scope and one
   planted `stuck` attempt, under the plant's exit 4, clears `stuck` and logs no `not ended` line (a gone scope clears
   it, `src/runtime/reap.ts:276-281`); at HEAD it logs `reap: … not ended: exit code 4` and raises the attempts to 2.

## Out of scope

- `unitAnswer`'s "says no" versus "could not ask" and `--uninstall`'s rerun after a timer file removed by hand: R-060
  (D-107 (1)).
- What systemd 259 exits for a scope it still holds in `deactivating` or `failed`: the word rule covers it as for exit
  3; not seen on the seat (the inventory's Unverified 1).
- `limen status`'s timer probes and the GitHub doctor (fact 3).

## Acceptance

- AC-1: `node --test test/platform/linux.test.ts` → exit 0.
- AC-2: `node --test test/job/finalize.test.ts` → exit 0.
- AC-3: `node --test test/runtime/reap.test.ts` → exit 0; `node --test test/cli/sweep.test.ts` → exit 0.
- AC-4: `git grep -q 'E-18' -- src/platform/linux.ts test/plant.ts` → exit 0.
- AC-5: `node adrian-rebuild/tools/fails-before.mjs test/plant.ts test/platform/linux.test.ts test/job/finalize.test.ts test/runtime/reap.test.ts` → exit 0, its output in `outcome.md` → `## Fails before` (the changed plant is copied with the
  tests, so the unchanged `finalize.test.ts` runs on it).
- AC-6: `node adrian-rebuild/tools/gate.mjs` → exit 0.
- AC-7: `npx biome check --error-on-warnings .` → exit 0; `node adrian-rebuild/tools/check.mjs` → exit 0.
- AC-8 (judgment): exits 3 and 4 share one rule in one function, in which the printed word decides; every other exit
  is still a failure with its detail (T-01); no caller of `unitAnswer` changes.

## Migration

None: no format on disk changes. A record that already holds `stuck` from an exit 4 reads `gone` at the next sweep,
which clears it (`src/runtime/reap.ts:276-281`), as for exit 3.

## Risk

- If systemd also exits 4 for a real call failure with `inactive` on stdout, that failure reads as `gone`; the word
  test is then the only guard (the inventory's Unverified 2). A bus failure prints an error on stderr and no state word
  (`test/platform/linux.test.ts:235-242` keeps that case a failure).

## Rollback

`git revert $(git log --format=%H --grep='^R-107:' adrian-rebuild --)`; no migration to reverse.

## Decisions

Settled by the documents when the ticket was written (2026-11-26, the main session's reading, not a night default; the
inventory's questions in `evidence/inventories/R-107.md` → section 9):
1. Exits 3 and 4 share one rule and the printed word decides (Q1 (a)): the note says "Exits 3 and 4 both read as not
   active", and the word rule exists because a `deactivating` scope may still hold processes (R-027 review round 1,
   finding 4, cited at `test/platform/linux.test.ts:281`); one rule in one place (T-25).
2. The plant's fake answers as systemd 259 as well (Q2 (b)): the whole suite then meets the seat's answer, and the
   finalize test proves the end path that wrote the false line (T-31: the fake shows what the engine does).
3. Seat step 4.13 reads the job logs (Q3, D-118 (1)); `## Deployment` 4.13 is already amended.
