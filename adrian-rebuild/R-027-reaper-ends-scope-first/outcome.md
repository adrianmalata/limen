<!-- PL: Wynik R-027 (noc 22/23.11, zamknięty; recenzja PASS w rundach 1 i 2, jedna runda poprawek): żniwiarz najpierw
odczytuje odczyty scope, potem wysyła TERM do całego scope (albo, dla rekordu bez scope, do grupy wrappera), czeka
łaskę, wysyła KILL i dopiero gdy scope albo grupa zniknęły, zapisuje `failed` ze szczegółem `process group gone: <co
sprawdzono>`; gdy nie znikają albo stanu nie da się odczytać, job zostaje `running` z jedną linią `reap: … not ended:
…` na próbę. Adapter platformy ma `scopeState` i `signalScope`, a `endScope` stoi na nich; jedna łaska 5 s
(`stopGraceMs`, pokrętło `LIMEN_STOP_GRACE_MS`) służy stopowi, wyczerpaniu i żniwiarzowi, a jedno czekanie 1 s po KILL
(`KILL_WAIT_MS`) żniwiarzowi, stopowi i nieudanemu startowi wrappera. Runda 1 poprawek: błąd nieudanego wywołania
sygnału trafia do linii żniwiarza (F1), test głuchego silnika jest podzielony na dwa (F2), a 1 s po KILL ma jedną
definicję (F3); testy padały przed zmianą, bramka przeszła (846/846). -->

# R-027 outcome

## Done

(a) Platform (`src/platform/platform.ts`, `src/platform/linux.ts`):
- `scopeState(unit, cgroup)` → `active`, `gone` or `failed` with the call's first stderr line, without a signal: a
  missing cgroup folder or `systemctl --user is-active --quiet` exit 3 is `gone`, exit 0 is `active`, any other failure
  is `failed` (`callFailure`). This is now the one place of the rule for `gone`.
- `signalScope(unit, "SIGTERM" | "SIGKILL")` → `sent` or `failed` with the detail: `systemctl --user kill
  --signal=<signal> <unit>`. New types `ScopeState`, `ScopeSignal`, `ScopeSignalResult`.
- `endScope` is `scopeState`, then `signalScope(unit, "SIGKILL")` when active; its results are unchanged.
- The tests' `systemctl` (`test/plant.ts`) emulates `--user kill --signal=SIGTERM <name>.scope`: SIGTERM to each member,
  the scope's folder kept; with no member it is "not loaded" (exit 1) and the folder goes, as for SIGKILL.

(b) The reaper (`src/runtime/reap.ts`). `reapDeadJobs` keeps its confirmation and its recovery claim; under the claim it
reads the record again and acts only on a `running` record that is still not live, through `endDeadJob`:
1. `ownerCheck` gives the owner state with its reason (`no wrapper pid recorded`, `wrapper <pid> has no start time
   recorded`, `… ran in another boot`, `… is not running`, `… is another process now`); `ownerState` is its state, so
   every other caller is unchanged.
2. `readScope` (now exported from `src/job/finalize.ts`) reads the scope's readings first; they go to `finalizeJob`
   through its new option `readings`, so the terminal record holds them though the KILL removed the scope's folder.
3. A record with `scope`: `terminateScope` reads the state; `active` gets TERM, a wait of at most `stopGraceMs()` for
   `gone` (read every 100 ms), then KILL and a wait of at most 1 s. A record without `scope`: `terminateGroup` does the
   same on the wrapper's process group (`signalProcessGroup`, `waitForProcessGroup`), with the start-time check of
   A-005 (see `## Night defaults` 2).
4. Gone → `finalizeJob(jobDir, "failed", "process group gone: <owner reason>; <scope|group> <was gone|ended after
   TERM|ended after KILL>", { readings })`, e.g. `process group gone: wrapper 4242 is not running; scope
   limen-job-<id>.scope ended after TERM`. The prefix keeps kind `reaped` (`FAILURE_PATTERNS`, unchanged).
5. Not gone, or its state cannot be read → no terminal write: one line `reap: <unit or group <pid>> not ended:
   <reason>`, the record untouched (identity, readings, no `terminal` claim), and the job leaves `seen`, so the next
   attempt needs a new confirmation.

(c) One grace: `STOP_GRACE_MS = 5_000` and `stopGraceMs()` in `src/runtime/reap.ts`, which `src/job/stopping.ts`
(the literal `5_000` of its TERM grace) and `src/runtime/wrapper.ts` (its `STOP_GRACE_MS`, removed; the stop's Herdr
deadline and the exhaustion's grace) now call. The test knob `LIMEN_STOP_GRACE_MS` (kind `test`, `src/config.ts`, read
through `testKnob`) shortens it; `test/config.test.ts`'s inventory lists it.

(d) `ownerState` lost its unused `query` parameter.

(e) Tests:
- `git mv test/u9-process-identity.test.ts test/runtime/reap.test.ts`, its header naming `src/runtime/reap.ts`; the five
  moved tests stay, the `pid-only` record of "A-056: the reaper ends … unknown …" now has a scope (as every running
  record has since R-026), because a pid without a start time and without a scope now stays running (`## Night
  defaults` 2). New there:
  - "A-005: a job whose wrapper was killed alone stays running until its scope is gone, then ends failed with what was
    checked": the engine in the scope reads the record's state at its TERM (`running`), exits; the record is `failed`
    with the full detail line.
  - "A-005: the reaper ends a scope whose engine ignores TERM by KILL once the grace passed" and "the record of a
    reaped job holds the scope's readings taken before the TERM, though the KILL removed the scope's folder", both on
    the helper `deafJob` (`LIMEN_STOP_GRACE_MS` 200); one test before the round of fixes (F2).
  - "a reap whose TERM to the scope fails names that failure in the line that ends the job" (F1, a `systemctl` that
    fails only the SIGTERM call, `failingTerm`).
  - "a reap whose scope the user manager cannot read leaves the job running with one log line per attempt, and tries
    again once confirmed" (a failing `systemctl`, the helper `failingSystemctl` that `pathWithFailingScopeEnd` now uses).
  - "A-005: the reaper ends a running job without a scope by its wrapper's process group, which outlived the wrapper".
  - "the reaper leaves running a job without a scope whose wrapper's pid runs a process it cannot tell from the wrapper".
- `test/s9-housekeeping.test.ts` (the killed-wrapper test): the fake engine writes `{"event":"pid","pid":…}` first in
  `fake-events.jsonl` (`test/fake-engine.mjs`; `engineEvents` types `pid`); the test asserts the reaped job's engine is
  dead and that the failure is `{kind: "reaped", detail: "process group gone: wrapper <pid> is not running; scope <unit>
  ended after TERM"}`.
- `test/platform/linux.test.ts`: five tests of `scopeState` and `signalScope` on the tests' systemd (active with no
  signal; gone with no process, and with no folder and no call; failed with the manager's line; SIGTERM to every
  process; the manager's words for a scope with no process); its header names the module.
- `test/plant.ts`: `scopeProcess(t, cgroup, setup, args)`, a process of a tests' scope that runs a setup (a signal
  handler) and reports how it ended; `test/job/finalize.test.ts` uses it instead of its own `scopeMember` (T-25 (2)).
- `test/runtime/wrapper.test.ts`: the exhaustion test sets `LIMEN_STOP_GRACE_MS` 200, so no test waits the 5 s (T-31
  (4)); it took 2.0 s instead of over 5 s.

(f) Text: `docs/jobs.md` (Recovery, dead wrapper), `templates/agents.md:202` with the new hash
`ff13d173…` first in `templates/.history/agents.md`, `docs/herdr-status.md` (the owner check and the meaning of `dead`),
the comments of `src/runtime/reap.ts` (header, `liveJob`, `reapDeadJobs`), `src/runtime/pruning.ts` (`jobKeeps`),
`src/job/finalize.ts` (header, the option) and `src/platform/*.ts` (headers, members).

## Round 1 fixes

`ticket.md` → `## Decisions`, "review round 1" (`review.md` → Round 1), for a fresh implementer:
- F1 (finding 2, T-01). `terminateScope` (`src/runtime/reap.ts`) keeps each signal call that fails as a note
  `<signal> failed: <detail>` and puts the notes after whatever then decides the ending: the terminal detail
  (`process group gone: wrapper 4242 is not running; scope <unit> ended after KILL; SIGTERM failed: <detail>`) or the
  `reap: <unit> not ended: <reason>; SIGTERM failed: <detail>` line. One step, `signalled`, sends both TERM and KILL,
  so a SIGKILL call that fails before a state read reports the scope gone is kept the same way. A KILL whose call failed
  had no wait after it, so its reason is `still active; SIGKILL failed: <detail>` instead of the call's detail alone.
  New test in `test/runtime/reap.test.ts`: "a reap whose TERM to the scope fails names that failure in the line that
  ends the job"; its local helper `failingTerm` writes a `systemctl` that fails `--user kill --signal=SIGTERM` with
  `Failed to kill unit <unit>: Connection timed out` and passes every other call to the tests' systemctl.
- F2 (finding 3, T-29 (3)). The deaf-engine test is two tests on one setup, `deafJob`: "A-005: the reaper ends a scope
  whose engine ignores TERM by KILL once the grace passed" (the TERM was ignored, the engine ended by SIGKILL, the line
  says `ended after KILL`) and "the record of a reaped job holds the scope's readings taken before the TERM, though the
  KILL removed the scope's folder" (the record's `scope` with `SCOPE_READINGS`, the folder gone).
- F3 (finding B, T-25 (1)). `KILL_WAIT_MS` is exported from `src/runtime/reap.ts`; `src/job/stopping.ts` waits it
  after its KILL instead of its literal `1_000`, and so does the failed handshake of `src/job/spawning.ts`
  (`waitForHandshake`, the other literal 1 s wait after a KILL in `src/`). `grep -rn -A2 SIGKILL src` shows each wait
  after a KILL on `KILL_WAIT_MS`; the `1_000` before the handshake's KILL is that step's TERM grace, and the one of
  `probeVersion` is a timeout before a KILL, so both stay.

## Proof

From the repository root, on the working tree (`HEAD` `cda9da5`; index: only the move
`test/u9-process-identity.test.ts` → `test/runtime/reap.test.ts`), after the round 1 fixes:
- AC-1: `node --test test/runtime/reap.test.ts` → exit 0 (tests 12, pass 12).
- AC-2: `node --test --test-timeout=180000 test/s9-housekeeping.test.ts` → exit 0 (tests 8, pass 8).
- AC-3: `node --test test/platform/linux.test.ts` → exit 0 (tests 17, pass 17).
- AC-4: `node --test test/job/finalize.test.ts` → exit 0 (tests 8, pass 8); `node --test test/cli/stop.test.ts`
  (run together with `test/runtime/wrapper.test.ts`) → exit 0 (tests 7, pass 7).
- AC-5: `node --test test/structure.test.ts` → exit 0 (tests 42, pass 42).
- AC-7: `node adrian-rebuild/tools/gate.mjs` → exit 0; tests 846, pass 846, fail 0, cancelled 0, skipped 0 (183.9 s).
  An earlier run after the fixes, before the name of one local of `terminateScope` and this file's text, gave 846/846
  too (178.5 s). Before the round of fixes: 844/844 (180.9 s); the two new tests are F1's and F2's second one. The
  main session's own runs: 844/844 before review round 1 (183.4 s), 846/846 after the round 1 fixes (181.3 s).
- AC-8: `npx biome check --error-on-warnings .` → exit 0 ("Checked 262 files … No fixes applied."); `node
  adrian-rebuild/tools/check.mjs` → exit 0 ("0 errors"); `npx biome check --error-on-warnings adrian-rebuild` → exit 0;
  `npx tsc --noEmit` → exit 0.
- Also `node --test test/config.test.ts` → exit 0 (tests 11, pass 11).
- The ratchets of `test/structure.test.ts` hold: no `catch {` or `.catch(() => {})` added (one `.catch` with a body left
  `finalize.ts` for `readScope`'s `.then(…, …)`).
- AC-9 (judgment): the reaper's only terminal write is `finalizeJob` in `endDeadJob`, reached only from a `gone`
  ending; `terminateScope` and `terminateGroup` give `gone` only for a scope `scopeState` reads as gone, a group
  `processGroupAlive` finds empty, a record with no pid, another boot, or a pid held by a process with another start
  time (the group then ended before that process got the pid). The log line names the wrapper's pid, why it is dead,
  how the scope or group ended, and each signal call that failed (F1). The grace has one definition (`STOP_GRACE_MS`,
  `stopGraceMs()`), and so has the wait after a KILL (`KILL_WAIT_MS`, F3).

## Fails before

AC-6, the main session's runs on the tree under review, before review round 1 and again after the round 1 fixes,
`node adrian-rebuild/tools/fails-before.mjs` → exit 0, each with the same first line:

```
fails-before: test/config.test.ts, test/job/finalize.test.ts, test/platform/linux.test.ts, test/runtime/reap.test.ts,
test/runtime/wrapper.test.ts, test/s9-housekeeping.test.ts fail at HEAD (exit 1)
```

The implementer's runs at `HEAD`'s code, with the new tests in the working tree, before any change under `src/`
(2026-11-22):

```
$ node --test test/runtime/reap.test.ts
✖ A-005: a job whose wrapper was killed alone stays running until its scope is gone, then ends failed with what was checked
  +   atTerm: 'no TERM',
  +   engine: 'SIGKILL',
  -   atTerm: 'running',
  -   engine: 'exit 0',
  +     'failed: process group gone'
  -     'failed: process group gone: wrapper 1249888 is not running; scope limen-job-2026-11-22-killed-1a2b3c4d.scope ended after TERM'
✖ A-005: the reaper ends a scope whose engine ignores TERM by KILL once the grace passed, and keeps the earlier readings
  +     'failed: process group gone'
  -     'failed: process group gone: wrapper 1249913 is not running; scope limen-job-2026-11-22-deaf-1a2b3c4d.scope ended after KILL'
  +   ignored: false,
  -   ignored: true,
✖ a reap whose scope the user manager cannot read leaves the job running with one log line per attempt, and tries again once confirmed
  +   claim: true,
  +   first: [],
  +   lines: [],
  (the record: state 'failed', failure { kind: 'reaped', detail: 'process group gone' }, a transition to failed)
✖ A-005: the reaper ends a running job without a scope by its wrapper's process group, which outlived the wrapper
  +     'failed: process group gone'
  +   group: true,
  +   member: 'present'
✖ the reaper leaves running a job without a scope whose wrapper's pid runs a process it cannot tell from the wrapper
  +   lines: [],
  +   state: 'failed'
ℹ tests 10  ℹ pass 5  ℹ fail 5
```
The five moved tests passed at `HEAD` (behaviour that stays).

```
$ node --test test/platform/linux.test.ts
✖ scopeState … (all three)   TypeError [Error]: linux.scopeState is not a function
✖ signalScope … (both)       TypeError [Error]: linux.signalScope is not a function
ℹ tests 17  ℹ pass 12  ℹ fail 5
```

```
$ node --test --test-timeout=180000 test/s9-housekeeping.test.ts
✖ a killed wrapper is reaped at once, its engine dead; the orphan of a job that ends, is stopped or is reaped is dead after its end; each wakes the coordinator once
  +   detail: 'process group gone',
  -   detail: 'process group gone: wrapper 1251484 is not running; scope limen-job-2026-11-22-orphan-e6eb3d2d.scope ended after TERM',
ℹ tests 8  ℹ pass 7  ℹ fail 1
```
At `HEAD` that test fails on the failure's detail, before its new engine assertion: since R-026 `HEAD`'s finisher
kills the scope after the terminal record, so the engine is dead at `HEAD` too once `limen show` returns. The order
(the engine ended while the record is still `running`) is what the first new test of `test/runtime/reap.test.ts`
shows. `test/config.test.ts` fails at `HEAD` on the inventory (no `LIMEN_STOP_GRACE_MS`); `test/job/finalize.test.ts`
and `test/runtime/wrapper.test.ts` changed only their helper and the knob and pass at `HEAD`.

Round 1 fixes. F1, the new test run on the working tree before its fix (the reaper of the first implementation),
2026-11-22:

```
$ node --test --test-name-pattern="TERM to the scope fails" test/runtime/reap.test.ts
✖ a reap whose TERM to the scope fails names that failure in the line that ends the job (156.568728ms)
  AssertionError [ERR_ASSERTION]: Expected values to be strictly deep-equal:
  + actual - expected
    [
  +   'failed: process group gone: wrapper 1373092 is not running; scope limen-job-2026-11-22-noterm-1a2b3c4d.scope ended after KILL'
  -   'failed: process group gone: wrapper 1373092 is not running; scope limen-job-2026-11-22-noterm-1a2b3c4d.scope ended after KILL; SIGTERM failed: Failed to kill unit limen-job-2026-11-22-noterm-1a2b3c4d.scope: Connection timed out'
    ]
ℹ tests 1  ℹ pass 0  ℹ fail 1
```

At `HEAD` the same test fails too (its file fails as a whole, `fails-before.mjs` above): `HEAD`'s reaper writes
`failed: process group gone` with no checks and sends no TERM. F2 and F3 change no mechanism. F2 splits a test: the
first of its two tests fails at `HEAD` (the implementer's run above shows the combined test failing there only on
`ignored` and the detail, its KILL part), and the second, on the readings, passes at `HEAD`, whose finisher also read
them before it ended the scope; it guards the order the reaper keeps now. F3 keeps the value (1 s), so no test can fail
before it; its proof is the `grep` of `## Round 1 fixes`.

## Night defaults

Category A of D-054 (2) (technical choices inside `## Change` that `taste.md` does not settle), for the main session to
confirm or move into `ticket.md` → `## Decisions`:
1. The checks' words: `<owner reason>; scope <unit> <how>` or `; group <pid> <how>`, the owner reason as in `## Done`
   (b) 1, and `no process group to end` for a record with neither scope nor pid. They name the wrapper's pid, why it is
   taken as dead, and what ended the scope or group, in the three words of (b) 3.
2. A record without `scope`: its group is signalled only when no process holds the wrapper's pid. A process there with
   another start time proves the job's group ended before it (Linux gives no new process a pid that a live group still
   holds), so the group `was gone`, with no signal; another boot likewise. A process there whose start time the record
   lacks (born null) may be the wrapper or a stranger leading its own group, and a pid the system cannot describe tells
   nothing, so either is "its state cannot be read" of (b) 4: no signal, the job stays `running` with `reap: group
   <pid> not ended: pid <pid> runs a process that may be the wrapper` (or `the system does not describe pid <pid>`).
   This keeps the reaper from ever signalling a group it cannot attribute (z. 14); the cost is that a migrated
   `running` record with a reused pid and no start time stays `running`, with a log line per attempt, until R-032's
   sweep escalates it. It is why the moved `pid-only` record got a scope.
3. A TERM or KILL whose call fails is followed by one state read: `gone` counts as ended by that step, `failed` gives
   its detail, still `active` goes on to KILL, or, after KILL, ends as not ended with the KILL's detail. A group signal
   that is `denied` ends the attempt as not ended at once. Since the round 1 fixes (F1, `ticket.md` → `## Decisions`),
   each failed call's detail also follows the ending's words in the line (`…; SIGTERM failed: <detail>`), and a KILL
   whose call failed ends as `still active; SIGKILL failed: <detail>`.
4. After an attempt that did not end the scope or group, the job leaves `seen`, so the next attempt waits for a new
   confirmation ("a later pass tries again after its confirmation"); with the hook's 500 ms tick and 10 s confirmation
   that is one line about every 10 s per stuck job.
5. The grace's module is `src/runtime/reap.ts`, beside `waitForProcessGroup` that stop and spawn already import from
   there; the knob's name is `LIMEN_STOP_GRACE_MS`. The KILL's wait (1 s) and the poll (100 ms, also
   `waitForProcessGroup`'s) are constants there; stop keeps its own literal 1 s wait after its KILL. The round 1 fixes
   (F3) replaced that literal, and the failed handshake's of `src/job/spawning.ts`, with the exported `KILL_WAIT_MS`.
6. `scopeProcess` moved to `test/plant.ts`, and `test/job/finalize.test.ts` uses it (T-25 (2): a second user moves a
   helper to the module of its concept).
7. `templates/.history/agents.md` dates the new hash 2026-11-22, the night's start; the commit may carry 2026-11-23.

## Deviations

- Beyond the listed tests: the s9 test also asserts the failure's kind and detail (the one end-to-end check of the
  checks through `bin/limen` and the fake engine), and `test/runtime/wrapper.test.ts` sets the new knob (c)'s purpose:
  "so no test waits the grace". `test/job/finalize.test.ts` changed its helper only.
- `docs/jobs.md` gives no number for the grace, so R-028's 10 s leaves it true.
- Round 1 fixes: F3 also changes `src/job/spawning.ts` (`waitForHandshake`), since F3 leaves no other literal of the
  wait after a KILL in `src/`; F1 changes the words of one existing line, a KILL whose call failed with the scope still
  active (`still active; SIGKILL failed: <detail>` instead of the call's detail alone), so that every failed call is
  named the same way. F1 has one test, as the ticket asks: the SIGKILL case runs through the same step (`signalled`).

## Unmeasured

- The real systemd's `is-active` and `kill --signal=SIGTERM` on a job's scope, and the reap of a wrapper killed alone:
  `unmeasured` here, no M-NN; the seat's check is `plan.md` → `## Deployment` 3.2 (T-28 (5)).

## Open points

- Until R-032, a reap inside `limen status`, `limen show` or the wake hook's tick waits up to the grace and 1 s more
  per live scope, polling `systemctl --user is-active` (a synchronous call) every 100 ms (the ticket's Risk).
- R-028 sets A-020's 10 s in `STOP_GRACE_MS` (`src/runtime/reap.ts`) and gives stop and the exhaustion the scope's
  TERM; `docs/jobs.md` needs no change then.
- `ownerCheck` caches a dead identity's reason as `ownerState` cached the verdict; the group path never trusts that
  cache and reads the pid again before a signal.

From `review.md` → Round 1, not fixed in this ticket (the reasons are there):
- Finding 4, for gate 5.3: `is-active` exit 3, kept from R-026 by (a)'s "the rules `endScope` uses today"
  (`src/platform/linux.ts`, `scopeState`), also covers a `deactivating` scope, which may still hold processes; it sits
  next to R-032's note on the paths that trust a scope's end.
- Finding 5, for R-028's implementer: `stopGraceMs() - 500` (`src/runtime/wrapper.ts`, the stop's Herdr deadline)
  lies in the past when `LIMEN_STOP_GRACE_MS` is 500 ms or less; only the exhaustion test sets the knob (200), and that
  path skips the line. R-028 changes the stop's path and the grace (10 s).
- Finding A, for gate 5.3: a reaper that runs inside the reaped job's own scope (an engine whose wrapper was killed
  alone runs `limen show`) gets its own TERM before any write, so the job stays `running` until another reaper runs;
  `HEAD` wrote `failed` first. R-032 moves reaping into the seat's sweep, outside every job scope (T-04).
- Finding C, for gate 5.3 (its mechanism and place only): the reaper signals the unit that the record names, a field
  of R-026 whose validator accepts any `.scope` name (`src/job/record.ts`), in a file the job's account can write;
  `HEAD`'s finisher already sent SIGKILL to that unit, so the exposure is not new.

From `review.md` → Round 2, not fixed (the reason is there):
- For gate 5.3 (wording): when the scope's SIGTERM call fails and the state read after it finds the scope gone, the
  detail reads `scope <unit> ended after TERM; SIGTERM failed: <detail>`, an ending "after TERM" for a TERM the call
  reports as not sent (`src/runtime/reap.ts`, `terminateScope`); the failure itself is named (F1).
