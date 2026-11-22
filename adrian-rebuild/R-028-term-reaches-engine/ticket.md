<!-- PL: Ticket R-028 (A-020, A-052): TERM wysłany do wrappera dociera do silnika (raz, do jego grupy procesów), limity
zostają uzbrojone, a po 10 s łaski silnik dostaje KILL. `stopped` zapisuje się tylko przy prośbie o stop zapisanej w
rekordzie (`limen stop`, także stop grupy); każdy inny sygnał to `failed` rodzaju `signal` z nazwą sygnału, a przy
`oomKills` powyżej zera rodzaj `oom`. Atrapa silnika kończy się kodem 143 na TERM, jak Pi 1.5.1 (E-17). Stan: napisany
22.11 przy `9a370ae` z inwentarza `evidence/inventories/R-028.md`, gotowy na noc. -->

# R-028 SIGTERM reaches the engine; a signal without a stop request is a failure

## Problem

Finding A-020 (medium), its Decision, quoted from `audit.md`: "On SIGTERM the wrapper forwards TERM to the engine's
process group, keeps the limits armed, sends KILL after a 10 s grace, then records `stopped` through the transition
function with a log line. `docs/jobs.md:234` points to `limen stop <id>` instead of a manual `kill`."

Finding A-052 (low), its Decision: "`stopped` only with a recorded stop request (`limen stop`, A-020); any other signal
is `failed`, kind `signal`, with the signal name; a rise of `oom_kill` in the job scope's `memory.events` (A-029) gives
kind `oom`." Its scenario: "The OOM killer SIGKILLs the engine. The coordinator sees `stopped` (as if someone asked)".
The plan's note in `## Tickets` (R-026 → Out of scope): "R-028 maps a signal with `oomKills` above 0 to kind `oom`
(A-052)". A-019's Decision: "the first finisher wins, the loser returns without writing".

T-31 (3), quoted: "Fake scenarios for every failure kind of A-016 (… timeout, stall, exit, signal, oom) on an
artificial clock"; T-31 (4): no real waiting in tests; T-28 (4) and (5): a fix comes with a test that fails before it,
and behaviour that depends on Pi or systemd also with a step in `## Deployment`. Engine fact E-17 (`plan.md` →
`## Engine facts`): Pi 1.5.1's print mode, which Limen runs (`--mode json`), exits 143 on SIGTERM and 129 on SIGHUP.

Facts at `9a370ae` (the read-only inventory `adrian-rebuild/evidence/inventories/R-028.md`; the main session checked
the ones it quotes):
1. The wrapper's only signal handler (`src/runtime/wrapper.ts:69-77`) sets `stopRequested = true` and aborts the start
   queue's wait; it signals nothing. The flag disarms the timeout, the tool cap and the stall verdict (`exhaust`
   returns at `:132-135`), the stall check (`:299`) and the 80 % steer (`:318`).
2. The engine is spawned without `detached` (`:206-210`), so it is in the wrapper's process group; a TERM to the
   wrapper's pid reaches only the wrapper, and the engine then runs with no bound until a finisher ends the scope.
3. The end (`:336-351`): `exhausted` first; then `stopRequested || result.signal === "SIGTERM" || result.signal ===
   "SIGKILL"` → `finalizeJob(jobDir, "stopped", "process group interrupted", …)`, so an OOM kill (SIGKILL) and any
   lone TERM record `stopped` with no failure; then `result.error`; code 0 → `done`; anything else →
   `failed: worker exited with code <code ?? "unknown">`, so SIGSEGV, SIGABRT, SIGINT and SIGHUP lose their name.
4. `limen stop` (`src/job/stopping.ts:35-122`) writes only the log line `stop requested: <reason>` for a running job
   (`:56-61`); the field `stopRequested` is written only for a queued job (`:95-98`), and its comment says so
   (`src/job/record.ts:150-151`). Stop then TERMs the wrapper's group, waits 5 s, KILLs, and finalizes with
   `requestedTerminal(reason)` (`src/job/finalize.ts:28-29`: `done` for a reason that starts with `done:`). When the
   wrapper wins the transition, its detail replaces the stop's reason, and a `done:` stop ends `stopped`.
5. `finalizeJob` sets `failure: state === "failed" ? failureFrom(detail) : null` (`src/job/finalize.ts:90`);
   `failureFrom` maps the detail by `FAILURE_PATTERNS` (`src/job/record.ts:608-615`), whose `process group
   interrupted` → `signal` never fires, since that detail is written with `stopped`. `FAILURE_KINDS` already holds
   `signal` and `oom` (`:65-78`). The scope's `oomKills` is read (`src/platform/linux.ts:361-372`) and recorded
   (`finalize.ts:69-75`, `:95`), and mapped to nothing.
6. The fake engine (`test/fake-engine.mjs`) has no TERM handler, so it dies by the signal where Pi exits 143; `deaf`
   ignores TERM; no word ends the engine by another signal. The grace is 5 s in stop (`stopping.ts:104`) and in the
   exhaustion (`wrapper.ts:23`); R-027 makes these one constant.
7. Readers of the kind: `limen stats` (`src/job/statistics.ts:216-225`) and the alerts (`seat/alerts.ts:79-84`,
   `failed:<kind>` for `failed` only). No test sends TERM to a job's wrapper or asserts kind `signal` or `oom`.

## Change

(a) The request is in the record: `limen stop`'s apply writes `stopRequested` (its reason) for every job with a pid
before its TERM, through `transition` under the job's lock as the queued branch does today; the field's comment, the
`stop` entry's help (`src/registry.ts:405`) and `docs/jobs.md` say so. A group stop goes through the same `stopJob`.

(b) The wrapper's TERM handler: it remembers that the wrapper got a TERM, forwards one TERM to its own process group
(the engine and its non-detached children; the TERM that comes back to the wrapper changes nothing), keeps the
timeout, the tool cap, the stall watch and the steer armed (no flag disarms them), and after the grace of (e) sends
KILL to the engine's pid through the platform adapter, so the wrapper lives to record the end (R-026, Deviation 1).
A TERM that arrives before the engine starts still ends the start-queue wait and the setup, and no engine starts after
it.

(c) The end, decided in one place: an exhaustion keeps its own failure; otherwise a record with `stopRequested` ends as
`requestedTerminal(reason)` with the reason as its detail, whoever wins (so a `done:` stop ends `done`); otherwise a
TERM the wrapper got, or a signal the engine died by, ends `failed` with the detail `killed by <SIGNAL>` (the name the
wrapper got, else the engine's), with ` while queued` or ` during setup` before the engine starts; otherwise as today.
A new `FAILURE_PATTERNS` entry maps `killed by SIG…` to `signal`; `process group interrupted` → `signal` stays for
older records.

(d) `finalizeJob` records kind `oom` in place of `signal` or `reaped` when the scope readings it writes hold `oomKills`
above 0; every other kind stays.

(e) The grace is 10 s (A-020), one constant for `limen stop`, the exhaustion, the reaper and the forwarded TERM; where
R-027 made it one constant, this ticket changes its value, otherwise it makes it one. A test knob of `src/config.ts`
(kind `test`) shortens it, so no test waits it (T-31 (4)).

(f) The fake engine exits 143 on TERM, as Pi's print mode does (E-17), and writes one `sigterm` event to
`fake-events.jsonl` first; `deaf` keeps ignoring TERM; a new word `die <SIGNAL>` ends it by that signal.

(g) Tests, each failing before the change: in `test/runtime/wrapper.test.ts`, a TERM to the wrapper alone reaches the
engine and ends the job `failed`, kind `signal`, `killed by SIGTERM`; a `deaf` engine is KILLed after the grace and the
timeout still fires during it; an engine that dies by SIGKILL or SIGSEGV with no request ends `failed`, kind `signal`,
with that name; the same with `oom_kill 1` in the fake scope's `memory.events` ends kind `oom`; a TERM while queued
and during setup with no request. In `test/cli/stop.test.ts`, a stop of a running job writes `stopRequested` and ends
`stopped` with its reason, and a `done:` stop ends `done` when the wrapper wins. In `test/job/finalize.test.ts`, the
`oom` rule for `signal` and `reaped`, and no change for `quota` and `timeout`. In `test/job/record.test.ts`, the new
pattern.

(h) Text that becomes false: `docs/jobs.md:39-44` (a `stopped` row: only after a stop request; a signal otherwise is
`failed`, kind `signal`, or `oom`), `:114` (the 10 s grace), the line that points to `limen stop <id>` instead of a
manual `kill` (A-020), `:179-190` (a TERM does not disarm the limits); `docs/seat/README.md:80` (a restart of the user
manager now fails every running job with kind `signal`, one alert each); the comments of `src/runtime/wrapper.ts:72-73`
and `src/job/record.ts:150`.

## Out of scope

- How every cause is recorded: a kind set by its detector instead of text patterns, the quota reset time,
  `engine-error` from hooks, and the details with a null kind (R-029, A-016 (1)).
- The reaper's TERM and KILL of a dead wrapper's scope (R-027); a TERM before the handler is installed (the spawner's
  handshake fails such a job, `src/job/spawning.ts:980-1007`).
- An engine that exits 143 or 129 with no TERM to the wrapper (a TERM sent to Pi alone): it stays kind `exit`, its
  detail naming the code.

## Acceptance

- AC-1: `node --test test/runtime/wrapper.test.ts` → exit 0.
- AC-2: `node --test test/cli/stop.test.ts` → exit 0.
- AC-3: `node --test test/job/finalize.test.ts` → exit 0; `node --test test/job/record.test.ts` → exit 0.
- AC-4: `node --test test/s3-finish-wake.test.ts` → exit 0; `node --test test/s9-housekeeping.test.ts` → exit 0.
- AC-5: `node --test test/structure.test.ts` → exit 0.
- AC-6: `node adrian-rebuild/tools/fails-before.mjs` → exit 0, its output in `outcome.md` → `## Fails before`.
- AC-7: `node adrian-rebuild/tools/gate.mjs` → exit 0.
- AC-8: `npx biome check --error-on-warnings .` → exit 0; `node adrian-rebuild/tools/check.mjs` → exit 0.
- AC-9 (judgment): `stopped` is written only where the record holds a stop request; every signal end without one is
  `failed` with the signal's name; no limit is disarmed by a TERM.

## Migration

None. `stopRequested`, `signal` and `oom` exist in the record's schema; older `stopped` records keep their state, and
their `process group interrupted` detail still maps to `signal` if one is ever written `failed`.

## Risk

- A systemd stop of a job's scope, or a restart of the agents' user manager, now ends each running job `failed`,
  kind `signal`, and the alerts send one line per job (A-066: failures reach the owner).
- A stop of an engine that ignores TERM takes up to 10 s instead of 5 s.

## Rollback

`git revert $(git log --format=%H --grep='^R-028:' adrian-rebuild --)`.

## Decisions

Settled by the documents when the ticket was written (2026-11-22, the main session's reading, not a night default):
1. A stop request is one in the record: A-052 says "a recorded stop request (`limen stop`, A-020)", and A-020's own fix
   points to `limen stop <id>` instead of a manual `kill`. A-020's "records `stopped`" is the end of a TERM that
   `limen stop` sent with its request; a TERM with no request is a failure, kind `signal`.
2. The request lives in `stopRequested`, which exists, so the schema does not change; the log line stays.
3. The forwarded TERM goes to the group, as A-020 says; Pi kills its tracked children on every signal and exits at
   once on a second one (E-17), so a TERM that `limen stop` already sent to the group does no harm when the wrapper
   forwards its own. The KILL after the grace goes to the engine's pid, not the group, so the wrapper still records
   the end (R-026, Deviation 1).
4. One grace of 10 s (A-020; T-25), shared with stop, the exhaustion and the reaper.
5. With the limits armed, a limit that fires during a stop's grace races the stop, and the first finisher wins
   (A-019).
6. The wrapper's own TERM decides "a signal" for Pi, which exits 143 rather than dying by the signal; the engine's exit
   code is not read as a signal, since a TERM sent to Pi alone is no wrapper event (Out of scope).
7. Every signal the engine dies by without a request is `signal` with its name (A-052: "any other signal"), not only
   TERM and KILL.
8. A detail pattern, not a kind argument: R-029 replaces the patterns with kinds set by their detectors, and this
   ticket stays inside the wrapper's end.
9. `oom` replaces `signal` and `reaped` only: an OOM kill shows as a signal death of the engine or as a reaped wrapper;
   a `quota`, `timeout`, `tool-cap` or `stall` end keeps its kind, so R-034's resume of `quota` jobs and the limit
   kinds stay true when a tool's process was OOM-killed earlier in the job.
10. T-28 (5): Pi's exit on TERM is engine behaviour, so the row's API is `pi` and seat step 3.8 names the trials (a
    stop ends `stopped`; a TERM to the wrapper alone ends `failed:signal` with one alert).
