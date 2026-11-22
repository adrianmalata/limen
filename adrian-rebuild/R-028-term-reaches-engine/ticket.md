<!-- PL: Ticket R-028 (A-020, A-052): TERM wysłany do wrappera dociera do silnika (raz, do jego grupy procesów), limity
zostają uzbrojone, a po 10 s łaski silnik dostaje KILL. `stopped` zapisuje się tylko przy prośbie o stop zapisanej w
rekordzie (`limen stop`, także stop grupy); każdy inny sygnał to `failed` rodzaju `signal` z nazwą sygnału, a przy
`oomKills` powyżej zera rodzaj `oom`. Atrapa silnika kończy się kodem 143 na TERM, jak Pi 1.5.1 (E-17). Stan: napisany
22.11 przy `9a370ae` z inwentarza `evidence/inventories/R-028.md`; zrobiony w nocy 22/23.11 z dwiema rundami poprawek
(F1–F3, G1–G2) i domyślnymi decyzjami nocnymi do potwierdzenia przez Adriana. -->

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

- 2026-11-22, night, before the implementation (the main session; what R-027, commit `ddea3ef`, changed since the
  facts above were read at `9a370ae`; not a decision):
  - (e)'s one constant exists: `STOP_GRACE_MS` (5 s) with `stopGraceMs()` in `src/runtime/reap.ts`, which
    `src/job/stopping.ts` (the TERM's grace) and `src/runtime/wrapper.ts` (the stop's Herdr deadline and the
    exhaustion's grace) call, and the reaper's TERM of a dead wrapper's scope uses; its test knob is
    `LIMEN_STOP_GRACE_MS` (kind `test`, `src/config.ts`). So this ticket sets its value to 10 s and uses that knob,
    and makes no second knob. The wait after a KILL is `KILL_WAIT_MS` (1 s) there too.
  - R-027's open point for this ticket (`R-027-reaper-ends-scope-first/outcome.md` → Open points, finding 5): the
    stop's Herdr deadline `Date.now() + stopGraceMs() - 500` (`src/runtime/wrapper.ts`) lies in the past when the knob
    is 500 ms or less, which a test of (b) or (g) that sets the knob would meet.
  - The fake engine writes `{"event":"pid","pid":…}` as its first event in `fake-events.jsonl` (R-027); (f)'s
    `sigterm` event comes after it, when the TERM arrives.
  - The reaper's detail is now `process group gone: <checks>`; the prefix keeps kind `reaped`, so (d)'s `oom` rule
    for `reaped` reads it as before.
  - R-027's `## Out of scope` says that stop and the exhaustion "keep their group signals until R-028"; this ticket's
    `## Change` moves neither to a TERM of the job's scope, so it stands as written: stop TERMs the wrapper's group,
    the wrapper forwards one TERM to its group (b), and the winner of the transition ends the scope (R-026). That
    sentence of R-027 is an open point for gate 5.3, not a part of this ticket.
- 2026-11-22/23, night, the implementer's choices (`outcome.md` → `## Night defaults` 1–12), taken as the main
  session's night defaults (category A (b) of D-054 (2)), for Adrian to confirm in the morning; default 1 writes the
  request in `endJob` rather than in `apply` (the lock is not re-entrant), and a stop that finds the job ended sends no
  TERM. A further night default (category A (a)): AC-9's "`stopped` is written only where the record holds a stop
  request" is read within (a)'s scope, every job with a pid, so a stop of a `starting` job and a group's reserved slot,
  which send no signal, keep writing `stopped` with no `stopRequested` (`review.md` → Round 1, finding 5).
- 2026-11-22/23, night, review round 1 (`review.md` → Round 1: PASS, with notes that need code and tests): the first
  round of fixes, for a fresh `rebuild-implementer` (D-026 (2)). Each changed mechanism gets a test that fails before
  its fix (T-29: one mechanism per test); the words of F2's lines are the implementer's, a night default.
  - F1 (finding 1, T-29 (3)): the finalize test of (d)'s `oom` rule checks that rule alone: its `signal` record uses a
    detail that maps to `signal` at `HEAD` too (`process group interrupted`), so the test fails at `HEAD` only on the
    missing rule; the `quota` and `timeout` records stay in it, as the outcome's Deviations explain.
  - F2 (finding 4, T-01): every signal the wrapper's handler sends, the forwarded TERM to its group and the KILL to the
    engine's pid, leaves its result in the job's log: a `missing` target is the expected absence of a process that
    already ended, written as such, and a `denied` call is a failure line that names the signal and the target; the
    same for the exhaustion's TERM to the group where this ticket's diff changes that call, otherwise it is an open
    point. A test fails before the fix on the line of at least one result (for example the forwarded TERM's result in
    the existing TERM test).
  - F3 (finding 3, z. 17, T-31 (4)): the test that a TERM disarms no limit orders the TERM before the limit by events,
    not by time: the limit that ends the job is reached only after the engine has seen the TERM, for example a tool cap
    reached by tool starts that the deaf fake engine emits once it has ignored a TERM (a new word of
    `test/fake-engine.mjs`, if none exists), and no test waits a limit out in real time. A night default (category A
    (b)): (g)'s "the timeout still fires during it" is then checked through the tool cap, the same `exhaust` path; if
    the implementer finds an order by events that keeps the time limit, it keeps the time limit instead.
  - Not fixed (reasons in `review.md` → Round 1): findings 2, 5, 6 and 7.
  - Text: `outcome.md` gains the fixes, their failing-before runs, the night defaults above, and the open points of
    `review.md` → Round 1 (finding 5).
- 2026-11-22/23, night, review round 2 (`review.md` → Round 2: PASS, with two notes that need code): the second and
  last round of fixes, for a fresh `rebuild-implementer` (D-026 (2)); a new blocking finding after it goes to Adrian.
  The choices below are the main session's night defaults (category A (b)), for Adrian to confirm in the morning. Each
  changed mechanism gets a test that fails before its fix.
  - G1 (finding 1, A-019, A-052): whether the wrapper got a TERM is taken once, when the engine's outcome resolves, and
    the record (`stopRequested`) is read after that; a TERM that arrives after the engine ended changes nothing. So an
    engine that exited 0 before a late TERM ends as its exit decides (its `result` written), and a `limen stop` whose
    request write and TERM land while the wrapper reads the record ends as the request asks, not `failed`. The test
    puts a TERM in that window deterministically, through a seam of the wrapper's end if no other way exists (D-029's
    pattern, as `outcome.md` → Night default 8 did for stop), and fails before the fix; no test waits on time for it.
  - G2 (finding 4, T-28 (5)): on an end that a TERM or a signal decides, the wrapper writes one log line with the
    engine's own end before the terminal line, `engine exited with code <n>` or `engine killed by <SIGNAL>`, so seat
    step 3.8 can read Pi's exit 143 (E-17); the main session changed step 3.8's text to that line. A test asserts the
    line in the existing TERM test (the fake engine exits 143, (f)).
  - Not fixed (reasons in `review.md` → Round 2): findings 2, 3 and 5.
  - Text: `outcome.md` gains G1 and G2, their failing-before runs, the new gate result, and the open points of
    `review.md` → Round 2 (findings 2 and 3).
- 2026-11-23, night, after the second round of fixes: its implementer's choices (`outcome.md` → `## Night defaults`
  13–15 and its Deviations: G1's seam is the test knob `LIMEN_END_GATE`, which holds the wrapper's end until a file
  exists; G2's third form `engine error: <message>`; the TERM's `shutdownDeadline` on every end of the engine) are the
  main session's night defaults (category A (b)), for Adrian to confirm in the morning. Review round 3 (`review.md` →
  Round 3): PASS with four notes; both rounds of fixes are spent, so none is fixed here, and notes 1 and 2 are open
  points for gate 5.3 (`outcome.md` → Open points).
