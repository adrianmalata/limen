<!-- PL: Ticket R-026 (A-029, A-052, T-43): każdy job działa we własnym scope użytkownika systemd
`limen-job-<id>.scope`, a każde przejście do stanu końcowego zatrzymuje cały scope, także procesy odłączone przez
`setsid`. Rekord dostaje opcjonalne pole `scope` ze szczytem pamięci, czasem CPU i liczbą zabić OOM; host bez sesji
systemd użytkownika odmawia przy `limen init`. Wszystko sprawdzane na atrapach `systemd-run` i `systemctl`, a na seacie
w krokach 3.2, 3.7 i 3.8. Stan: napisany 22.11 przy `24c0957` z inwentarza `evidence/inventories/R-026.md`, gotowy na
noc. -->

# R-026 Every job runs in its own systemd user scope

## Problem

Finding A-029 (medium), the part of its Decision this ticket takes, quoted from `audit.md`: "Every job runs in its own
systemd user scope (`systemd-run --user --scope`); any terminal transition stops the whole scope, including processes
detached with `setsid`." The rest of that Decision (the sweep that reports engines outside any job scope; the
coordinators' start script) is R-060's and R-050's. Gate 2 §7 settled that today's wrappers sit in Herdr's cgroup, so
a Herdr or user-service restart can end every job at once.

Finding A-052 (low), its Decision: "`stopped` only with a recorded stop request (`limen stop`, A-020); any other signal
is `failed`, kind `signal`, with the signal name; a rise of `oom_kill` in the job scope's `memory.events` (A-029) gives
kind `oom`." This ticket records the scope's `oom_kill` count; R-028 maps it and the signals to the kinds.

T-43, quoted: "Limen sets no CPU or memory budget per job scope now: `rejected`. […] a return then uses systemd
properties of the job scope (A-029) set from a root-owned seat file." Its signal is M-09 (`## Measurement`): "Peak
CPU and memory per job scope; time two projects could not both run a job (T-43) | record fields of R-026; start-queue
waits".

`## System requirements`, quoted: "systemd user instance with lingering | scopes and timers work (`systemd-run --user
--scope true`) | R-026, R-032 | root enables lingering (3.1)". T-28 (5), quoted: "Behaviour that depends on Pi, the
bridge, Herdr or systemd: a test on the fake engine and a verification step in `plan.md` → `## Deployment`." The
stage-3 commands (`## Commands`): "scopes, units and timers are tested on fakes (T-28 (5)); `systemd-run`,
`systemctl` and `loginctl` are seat steps". Seat steps 3.2 ("`systemd-run --user --scope true` exits 0; during a trial
job, `systemd-cgls` shows the engine and its tools in the job's scope"), 3.7 ("jobs survive a Herdr restart") and 3.8
("A trial job's record holds the peak memory and CPU of its scope"). D-079: a record refuses a field it does not
know, and `record.json` changes additively (`## Stages` → conventions).

Facts at `24c0957` (the read-only inventory `adrian-rebuild/evidence/inventories/R-026.md`, taken at `9da2fde`, which
`24c0957` changes only in `adrian-rebuild/`):
1. Every job's process tree starts in `launchWrapper` (`src/runtime/launcher.ts:84-99`), called from
   `src/job/spawning.ts:685` and `src/job/continuation.ts:573`: `spawn(process.execPath, [CLI], { detached: true,
   … })`, so the wrapper leads its own process group inside the spawner's cgroup. The wrapper starts `--prepare` and
   the engine (`src/runtime/wrapper.ts:96-97`, `:196-200`) in its group. Other detached starts: `startLimen`
   (`launcher.ts:66-78`, used by `startGroupAdvance` from `finalizeJob`'s `afterEnd`, `src/job/finalize.ts:91`), the
   Herdr tab closer (`src/integrations/herdr.ts:59-62`, from `finalize.ts:108`), and the `ps` queries
   (`src/platform/linux.ts:119`).
2. The one terminal writer is `transition` (`src/job/record.ts:442-470`); finishers go through `finalizeJob`
   (`finalize.ts:35-79`): the wrapper, `limen stop` (`src/job/stopping.ts`), the reaper (`src/runtime/reap.ts:113`),
   the spawner after a failed handshake (`spawning.ts:942-960`), continue; the reserved group slot
   (`src/job/group-control.ts:606-613`) has no process. No terminal transition signals anything today.
3. A process that left the group is found only by `src/runtime/contain.ts:20-63`, a `ppid` walk from the wrapper run
   at stop (`stopping.ts:101-103`) and exhaustion (`wrapper.ts:125-136`), which writes unconfirmed pids to the job's
   `cleanup` file (`contain.ts:141-151`); a normal end, the reaper, a dead wrapper and a re-parented process escape it,
   and `test/s9-housekeeping.test.ts:115-122` accepts an orphan that is dead or named in `cleanup`.
4. The platform adapter (`src/platform/platform.ts:38-59`, `src/platform/linux.ts`) has no scope, cgroup or systemd
   member; `src/platform/requirements.ts:105-112` checks node, git, tar, ps, pi and herdr only, at `limen init`
   (`src/project/setup.ts:19`, `:60`). The A-083 scan (`test/structure.test.ts:947-952`) bans `/proc/`, a `ps`
   literal, `cpus(` and `process.kill` outside `src/platform/`, not `/sys/fs/cgroup`, `systemd-run` or `systemctl`.
   `systemctl` appears only in the system-level probes of `src/integrations/github-doctor.ts:41-42`, `:259-262`,
   `:317-318`.
5. No code reads a cgroup file; no test fakes systemd. The plant (`test/plant.ts:143-162`) links the fake engine as
   `pi` into its `bin`, sets an allow-listed environment with no user-bus variables, and uses test knobs of
   `src/config.ts:61-68` (the model of a fixed reading file: `LIMEN_START_READING`). The fake engine's `orphan` word
   starts a detached child and writes its pid to `fake-orphan` (`test/fake-engine.mjs:163-166`).
6. The record (schema 1, `RECORD_FIELDS` `record.ts:166-201`) reads an added field as it reads `migrated`
   (`record.ts:722`); `FAILURE_KINDS` holds `oom`, which nothing writes. `versions` is set while starting or running
   by a non-terminal `transition` (`spawning.ts:652-655`), the model for a field written at start.
7. Job ids match `JOB_ID` (`src/job/id.ts:20`): digits, lowercase letters and dashes only, which are valid in a unit
   name.

## Change

(a) The scope (`## Decisions` 1, 2): the platform adapter gets the scope members, the only code that runs
`systemd-run`, runs `systemctl --user` or reads `/sys/fs/cgroup`: start a detached command in a new user scope
(`systemd-run --user --scope --quiet --collect --unit=<name> -- <command>`), end a scope (`systemctl --user kill
--signal=SIGKILL <name>.scope`), and read a scope's readings. `launchWrapper` starts every wrapper through it in
`limen-job-<id>.scope`, so `--prepare`, the engine, its tools and anything they detach run in the job's scope, outside
the spawner's cgroup. A job that a job spawns gets a scope of its own the same way.

(b) Every terminal transition ends the scope: after `finalizeJob`'s transition and its `afterEnd`, the finisher ends
`limen-job-<id>.scope`, setsid'd and re-parented processes included; when the finisher is the wrapper (inside the
scope), this is its last act. Nothing a terminal transition starts dies with the scope: `startLimen` and the Herdr tab
closer start in scopes of their own (`limen-run-<token>.scope`) or are awaited before the end, a test holding each.
`src/runtime/contain.ts` and its `cleanup` entries go; stop and exhaustion keep their group signals (R-027 and R-028
rework them) and rely on the scope's end for every process outside the group.

(c) The record: an optional field `scope` (read as `migrated` is, so a record without it stays valid, D-079): `{ unit,
cgroup, memoryPeakBytes, cpuMicroseconds, oomKills }`. The wrapper sets `unit` and `cgroup` (its own path from
`/proc/self/cgroup`, which must end in `/limen-job-<id>.scope`, else the job fails as not in its scope) with the
transition to running; the finisher reads `memory.peak`, `cpu.stat` (`usage_usec`) and `memory.events` (`oom_kill`)
of that cgroup just before the terminal transition and writes them with it, or `null` for a value it cannot read (a
scope already gone). `limen show <id>` prints the three values.

(d) The requirement (T-12): `REQUIREMENTS` gains the user scope, checked by running `systemd-run --user --scope
--quiet true` (exit 0), so `limen init` refuses with exit 4 on a host without a user instance, naming lingering
(`## Deployment` 3.1); a spawn whose scope cannot start fails typed (class `environment`) and never runs unscoped.

(e) Scans and tests: the A-083 scan also bans `systemd-run`, `systemctl` with `--user` and `/sys/fs/cgroup` outside
`src/platform/`. The plant gets fakes in its `bin`: a `systemd-run` that runs the command in place (its pid kept, as a
real scope does) and marks it and every descendant as members of the named scope, `setsid` ones included; a
`systemctl` that ends every member of a scope; and a cgroup folder named by a test knob of kind `test` (as
`LIMEN_START_READING`) that holds each fake scope's `memory.peak`, `cpu.stat` and `memory.events`. Tests, each failing
at `HEAD`: a wrapper starts in `limen-job-<id>.scope`; the fake engine's `orphan` is dead after a normal end, after
`limen stop` and after the reaper ends a job whose wrapper was killed (the assertion of fact 3 loses its `cleanup`
branch); the record holds the fake readings, and `null` ones when the scope is gone; a record without `scope` reads;
`limen init` refuses with a failing `systemd-run`; a spawn whose scope cannot start fails typed; a group advance
started by a member's end still runs; the scan's fixture case.

(f) Text: `docs/jobs.md` (`:52`, `:112`, `:215`), `docs/setup.md:137`, `docs/commands.md:151`, `docs/seat/README.md`
and `docs/seat/agent-setup.md` (`:229-233`), and `templates/agents.md:78` say that each job runs in its own user scope
and that its end stops every process of the scope.

## Out of scope

- Mapping signals and `oomKills` to `failed` kinds `signal` and `oom` (R-028); the reaper's group checks (R-027);
  stall over the scope's `cpu.stat` and the peak CPU rate from its samples (R-036, M-09); the start-queue diagnosis by
  scope (R-035); keeping the user-bus variables (`XDG_RUNTIME_DIR`, `DBUS_SESSION_BUS_ADDRESS`) and the fake scope's
  marker in the environment allow-list (R-087); the coordinator's unit, outside every job scope (R-050); reporting
  engines outside job scopes (R-060); lingering and the sweep timer (R-032); `SECURITY.md` (R-081).
- A CPU or memory budget per scope (T-43, rejected for now); a `limen.slice` (YAGNI).

## Acceptance

- AC-1: `node --test test/runtime/launcher.test.ts` → exit 0.
- AC-2: `node --test test/s9-housekeeping.test.ts` → exit 0.
- AC-3: `node --test test/cli/stop.test.ts` → exit 0.
- AC-4: `node --test test/job/record.test.ts` → exit 0.
- AC-5: `node --test test/platform/requirements.test.ts` → exit 0; `node --test test/platform/linux.test.ts` → exit 0.
- AC-6: `node --test test/structure.test.ts` → exit 0.
- AC-7: `node adrian-rebuild/tools/fails-before.mjs` → exit 0, its output in `outcome.md` → `## Fails before`.
- AC-8: `node adrian-rebuild/tools/gate.mjs` → exit 0.
- AC-9: `npx biome check --error-on-warnings .` → exit 0; `node adrian-rebuild/tools/check.mjs` → exit 0.
- AC-10 (judgment): every path that starts a job's wrapper goes through the scope, every finisher of fact 2 ends the
  scope after its transition, and the fakes emulate only what `outcome.md` names, with the matching seat step.

## Migration

None. `scope` is an optional record field (older records read as before); a deployment runs with no job running
(`## Deployment` 0.2, D-079), so no wrapper of the old code meets a scope. The seat's user instance with lingering is a
system requirement, enabled by root in step 3.1 before the first job.

## Risk

- On a host whose user manager does not run, every spawn fails until lingering is on; `limen init` and the failed
  spawn name it, and steps 3.1 and 3.2 come before the projects resume.
- The final scope end is a SIGKILL with no grace for processes outside the group; the engine's own group still gets
  stop's and exhaustion's TERM first.
- The fakes cannot prove what systemd does; steps 3.2, 3.7 and 3.8 verify it on the seat (T-28 (5)).

## Rollback

`git revert $(git log --format=%H --grep='^R-026:' adrian-rebuild --)`.

## Decisions

Settled by the documents when the ticket was written (2026-11-22, the main session's reading, not a night default):
1. The wrapper runs inside the scope, not only the engine: the scope then outlives the engine until the finisher reads
   its readings (`memory.peak` is gone once the scope empties), and the wrapper leaves Herdr's cgroup too, which step
   3.7 needs.
2. The unit is `limen-job-<id>.scope` (T-18: one word per thing; the full id, T-20), so R-050, R-060, R-035 and the
   steps of `## Deployment` can tell a job's scope from any other; follow-up processes use `limen-run-<token>.scope`.
3. No unscoped fallback: a run outside its scope would lose the guarantee without a sign (z. 14), so a missing user
   instance refuses at init and fails a spawn.
4. The memory peak comes from the kernel's own `memory.peak` and CPU as the total `usage_usec`, read once at the end,
   with no sampling (fewer moving parts); the peak CPU rate comes from R-036's samples of the same `cpu.stat`.
5. `contain.ts`'s `ppid` walk goes, since the scope's end covers every process it found and those it missed (T-25:
   one mechanism per guarantee); R-008's review had left that seam to R-026 and R-027.
