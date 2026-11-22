<!-- PL: Wynik R-028 (noc 22/23.11, zamknięty; recenzja PASS w rundach 1–3, dwie rundy poprawek): TERM do wrappera idzie raz do
jego grupy procesów, limity zostają uzbrojone, a po łasce 10 s silnik dostaje KILL na swój pid; `stopped` (albo `done`
dla `done:`) powstaje tylko z prośbą o stop zapisaną w rekordzie, inny sygnał to `failed` rodzaju `signal`, a przy
`oomKills` powyżej zera `oom`. Runda 1: test reguły `oom` sprawdza tylko tę regułę (F1), wynik forwardowanego TERM i
KILL trafia do logu joba (F2), a test „TERM nie rozbraja limitu” kończy się limitem narzędzi (F3). Runda 2: to, czy
wrapper dostał TERM, jest brane raz, gdy rozstrzyga się wynik silnika, więc TERM po końcu silnika niczego nie zmienia
(G1, test przez nowy knob testowy `LIMEN_END_GATE`), a log zapisuje własny koniec silnika, np. `engine exited with code
143` (G2). Bramka po rundzie 2 przeszła (858/858). -->

# R-028 outcome

## Done

At `HEAD` `ddea3ef` (R-027), in the working tree; the index holds nothing (the ticket moves and deletes no path).

(a) The request is in the record. `stopJob`'s writes after its first (`endJob`, `src/job/stopping.ts`) put the reason
into `stopRequested` through `transition` from `running`, for every running job with a pid, before the TERM; a job
that is no longer running then gets no signal, and the stop returns `<id> is already <state>`. A group's stop goes
through the same `stopJob`. The field's comment (`src/job/record.ts`) and `docs/jobs.md` say so; the `stop` entry's
help says "why, kept in the record; a reason that starts with done: records it done", which is now true for every
stop (Deviations).

(b) The wrapper's TERM handler (`src/runtime/wrapper.ts`): the first TERM from outside sets `termed`, aborts the start
queue's wait, sends one TERM to the wrapper's own group through the platform adapter and logs the call's result,
`SIGTERM received; TERM sent to process group <pid>` (Round 1 fixes, F2); a TERM that comes back to the wrapper, the
forwarded one or the exhaustion's, changes nothing (`groupTermed`). When the engine runs, a timer of the grace sends
KILL to the engine's pid (`platform.signalProcess`) and logs `TERM grace elapsed; KILL sent to engine <pid>`, only
while Node has not reaped the engine. No flag disarms the timeout, the tool cap, the stall watch or the 80 % steer any
more. A TERM before the engine starts ends the queue's wait at once; during the setup the forwarded TERM reaches
`--prepare`, which runs in the group, and one check of the record's request and of `termed` right before the spawn,
with no wait between the check and the spawn, ends the job, so no engine starts after the TERM.

(c) The end, in one function, `signalledEnding` (`src/runtime/wrapper.ts`), for the queue, the setup and the engine's
end: an exhaustion keeps its own failure (it ends the job itself); otherwise a record with `stopRequested` ends as
`requestedTerminal(reason)` with the reason as its detail, whoever wins; otherwise the TERM the wrapper got, or else the
signal the engine died by, ends `failed` with `killed by <SIGNAL>`, and ` while queued` or ` during setup` before the
engine starts; otherwise as before (the spawn error, `done` on exit 0, `worker exited with code <code>`).
`FAILURE_PATTERNS` (`src/job/record.ts`) maps `^killed by SIG[A-Z0-9]+\b` to `signal`; `process group interrupted` →
`signal` stays for older records.

(d) `finalizeJob` (`src/job/finalize.ts`, `recordedFailure`) records kind `oom` in place of `signal` or `reaped` when
the scope readings it writes hold `oomKills` above 0; a record without a scope keeps the plain kind; every other kind
stays.

(e) `STOP_GRACE_MS` in `src/runtime/reap.ts` is 10 s, the one grace of `limen stop`, the exhaustion, the reaper and the
forwarded TERM; the test knob `LIMEN_STOP_GRACE_MS` (`src/config.ts`, kind `test`) says "in place of 10 s".

(f) `test/fake-engine.mjs`: a SIGTERM writes one `sigterm` event to `fake-events.jsonl` (after the first event, `pid`)
and exits 143, and a second one exits 143 at once, as Pi's print mode (E-17); `deaf` turns that into `sigterm ignored`;
`die <SIGNAL>` ends the engine by that signal; `tools-on-term <n>` ignores the next SIGTERM and starts n bash tools on
it (Round 1 fixes, F3). `block` reads its FIFO through a pipe handle (Night defaults 9).

(g) Tests, each failing before the change (`## Fails before`):
- `test/runtime/wrapper.test.ts`: a TERM to the wrapper alone reaches the engine (one `sigterm`, the forwarded TERM's
  `sent` line, no KILL) and ends the job `failed`, kind `signal`, `killed by SIGTERM`; a `deaf` engine is KILLed by the
  wrapper after the grace (200 ms here), the KILL's `sent` line, `killed by SIGTERM`; a tool cap that the engine reaches
  only on the forwarded TERM ends the job kind `tool-cap` during the TERM's grace (60 s here, never waited), its line
  after the TERM's; engines that die by SIGKILL and by SIGSEGV end `failed`, kind `signal`, with that name; a SIGKILL
  with `oom_kill 1` in the fake scope's `memory.events` ends kind `oom`; a TERM while queued and one during
  `--prepare`, with no request, end `killed by SIGTERM while queued` and `… during setup`, and no engine runs; since
  round 2, a TERM after an engine that exited 0 ends the job `done` with the engine's result (G1), and the first TERM
  test reads `engine exited with code 143` before the terminal line (G2).
- `test/cli/stop.test.ts`: `limen stop` of a running job records `stopRequested` and ends `stopped` with its reason;
  a `done:` stop whose wrapper ends the job first (the new seam `signalled`) ends `done`, detail `done: accepted`.
- `test/job/finalize.test.ts`: `oom` for a `signal` and a `reaped` detail with an OOM kill, `quota` and `timeout` kept;
  the `signal` detail is `process group interrupted` (Round 1 fixes, F1).
- `test/job/record.test.ts`: `failureFrom` maps the five `killed by …` details and `process group interrupted` to
  `signal`.

(h) `docs/jobs.md`: a `stopped` row in Job states (only after a stop request) and the `failed` row's signal, `signal`
and `oom`; the Stop step (the request in the record, the 10 s grace, `limen stop <id>` instead of a manual `kill`); a
paragraph under Limits (a TERM disarms no limit). `docs/seat/README.md`: a restart of the user manager fails every
running job with kind `signal`, one alert each. The comments of the wrapper's handler and of `stopRequested` changed.

## Round 1 fixes

`ticket.md` → `## Decisions`, "review round 1" (`review.md` → Round 1), for a fresh implementer:
- F1 (finding 1, T-29 (3)). The finalize test of (d)'s `oom` rule gives its `signal` record the detail `process group
  interrupted`, the older wrapper's detail, whose pattern names it `signal` at `HEAD` too, in place of `killed by
  SIGKILL`; the `reaped`, `quota` and `timeout` records stay, so at `HEAD` the test fails only on the missing rule. Its
  comment says why the detail is the older one (`test/job/record.test.ts` checks the `killed by` pattern).
- F2 (finding 4, T-01). One local function of `src/runtime/wrapper.ts`, `signalLine`, builds the log line of each
  signal the TERM handler sends, after the call, from its `SignalResult` (`src/platform/platform.ts`):
  - the forwarded TERM: `SIGTERM received; TERM sent to process group <pid>`; `SIGTERM received; process group <pid>
    was gone` (`missing`, the expected absence of what already ended, no failure); `SIGTERM received; TERM to process
    group <pid> failed: not permitted` (`denied`);
  - the KILL after the grace: `TERM grace elapsed; KILL sent to engine <pid>`; `TERM grace elapsed; engine <pid> was
    gone`; `TERM grace elapsed; KILL to engine <pid> failed: not permitted`.

  The two lines replace `SIGTERM received; sending TERM to the process group` and `TERM grace elapsed; sending KILL to
  engine <pid>`, which the handler wrote before its calls. The exhaustion's TERM to the group keeps its line
  (`<reason>; sending TERM`) and drops its result: this ticket's diff adds `groupTermed = true` and a comment above that
  call, and the call itself is `HEAD`'s (Open points). Tests: the first TERM test of `test/runtime/wrapper.test.ts`
  asserts the forwarded TERM's `sent` line (its check that no KILL was sent now reads `TERM grace elapsed`, since
  `sending KILL` is no line of the handler any more); the `deaf` test asserts the KILL's `sent` line.
- F3 (finding 3, z. 17, T-31 (4)). A new word of `test/fake-engine.mjs`, `tools-on-term <n>`: the next SIGTERM is
  ignored (one `sigterm ignored` event) and answered with n `tool_execution_start`/`tool_execution_end` pairs on stdout,
  as `idle` writes its tool, with no hook fired; the TERM after it ends the engine as Pi's print mode (exit 143). The
  test "a TERM to the job's wrapper disarms no limit: a tool cap reached during its grace ends the job failed, kind
  tool-cap" writes `{"toolCalls":2}` to the plant's `.agents/limen/limits.json`, runs `tools-on-term 2` then `block`
  with a 60 s grace, and TERMs the wrapper alone: the forwarded TERM makes the engine start the two tools, the cap ends
  the job, and the exhaustion's TERM ends the engine. The order is one of events: the cap is reached only after the
  engine has seen the TERM the wrapper forwarded, and the handler queues its line in the same turn as that TERM, before
  the wrapper reads any of the engine's output; no timer decides it, and the 60 s grace is a bound nothing waits for. The test asserts kind `tool-cap` and the TERM's
  line before the cap's, and runs in about 1 s instead of the 5 s time limit. The time limit itself is not kept: it
  counts from the engine's start in real time, so no event can order it after the TERM (the night default of
  `ticket.md` → `## Decisions`, F3).

## Round 2 fixes

`ticket.md` → `## Decisions`, "review round 2" (`review.md` → Round 2), for a fresh implementer; the second and last
round:
- G1 (finding 1, A-019, A-052). Whether the wrapper got a TERM is taken once, in the engine's outcome itself: the
  `error` and `close` handlers that resolve it copy `termed` into the outcome (`EngineOutcome.termed`,
  `src/runtime/wrapper.ts`), and the end reads `result.termed` instead of the live flag. The record's `stopRequested`
  is read after that, as before. So a TERM that arrives after the engine ended reaches no engine and changes nothing
  in the end: an engine that exited 0 ends `done` and its `result` is written; a `limen stop` whose request the read
  finds ends as the request asks; one whose request write lands after the read ends as the engine's exit decides,
  since the engine finished first (Open points), and never `failed: killed by SIGTERM` from a TERM that reached no
  engine. Every finalize of the engine's end now gets the TERM's `shutdownDeadline`, also the `done`, exit-code and
  spawn-error ends: a stop's TERM that comes after the engine's end still has its KILL after the grace, which the
  Herdr wake must not outlast; before G1 that TERM took the signalled branch, which had the deadline.
  - The seam (D-029's pattern): a new test knob `LIMEN_END_GATE` (`src/config.ts`, kind `test`) names a file. With
    it set, `endGate` in `src/runtime/wrapper.ts`, between the engine's end (and the exhaustion's return) and the
    record's read, writes the log line `engine ended; waiting for the test gate <path>` and waits for that file to be
    created (a watch of its folder, then one check), so a test can put a TERM in that window by the order of events.
    The wrapper runs in its own process, so no in-process injection point reaches it; without the knob the function
    returns at once. `test/config.test.ts`'s inventory lists the knob (Deviations).
  - Test: "a TERM to the job's wrapper after its engine exited 0 changes nothing: the job ends done with the engine's
    result" (`test/runtime/wrapper.test.ts`): `say all done` with the knob set; the test waits for the gate's line,
    TERMs the wrapper alone, waits for the handler's `SIGTERM received` line, creates the gate file, and asserts
    `done`, no failure and the result `all done`. It waits on file events only; it runs in about 1.1 s.
- G2 (finding 4, T-28 (5)). On an end that `signalledEnding` decides (a stop request, a TERM or a signal), the wrapper
  writes one log line with the engine's own end through its ordered log writes, then awaits them, before
  `finalizeJob` writes the terminal line: `engine exited with code <n>`, `engine killed by <SIGNAL>`, or, for an
  engine that could not be spawned, `engine error: <message>` (`engineEndLine`; Deviations). Test: the first TERM test
  of `test/runtime/wrapper.test.ts` asserts `engine exited with code 143` before `] failed: killed by SIGTERM` (the
  fake engine exits 143 on TERM, (f)).
- Not fixed (`review.md` → Round 2): findings 2 and 3 (Open points) and 5 (round 1 finding 7).

## Proof

From the repository root, on the working tree (`HEAD` `ddea3ef`, index empty), 2026-11-23, after the round 2 fixes:
- AC-1: `node --test --test-timeout=180000 --test-reporter=spec test/runtime/wrapper.test.ts` → tests 11, pass 11,
  fail 0 (16.0 s; read through `grep`).
- AC-2, AC-3, AC-5: `node --test --test-timeout=180000 test/cli/stop.test.ts test/job/record.test.ts
  test/structure.test.ts test/fake-engine.test.ts test/config.test.ts test/job/finalize.test.ts` → tests 88, pass 88,
  fail 0 (stop 6, record 19, structure 42, fake engine 1, config 11, finalize 9; read through `grep`).
- AC-4: `node --test --test-timeout=180000 test/s3-finish-wake.test.ts test/s9-housekeeping.test.ts` → tests 15, pass
  15, fail 0 (read through `grep`).
- The exit code of AC-1–AC-5: the nine files in one run without a pipe, `node --test --test-timeout=180000
  --test-reporter=spec --test-reporter-destination=<a file in the system's temporary folder> …` → exit 0; this seat's
  permissions did not let the implementer read that file back, so the counts above are those of the piped runs of the
  same files on the same tree.
- AC-6: `node adrian-rebuild/tools/fails-before.mjs` is the main session's run (`## Fails before`); not run in the round
  2 fixes.
- AC-7: `node adrian-rebuild/tools/gate.mjs`, run without a pipe → exit 0: tests 858, pass 858, fail 0, cancelled 0,
  skipped 0, todo 0 (193.6 s; its output has no `✖` line and no `npm error` line). One test more than before the round
  2 fixes: G1's test is new, G2 adds an assertion to an existing test.
- AC-8: `npx biome check --error-on-warnings .` → exit 0, in the gate's `npm run check` ("Checked 262 files … No fixes
  applied."); `node adrian-rebuild/tools/check.mjs` → exit 0; `npx biome check --error-on-warnings adrian-rebuild` →
  exit 0; `npx tsc --noEmit` → exit 0.
- The ratchets of `test/structure.test.ts` hold: no `catch {` or `.catch(() => {})` added, no cast added, no write
  primitive added in `src/` (the gate reads the knob's file with `existsSync` and a watch only); `endGate`,
  `engineEndLine` and `EngineOutcome` are names no other file declares.

After the round 1 fixes, the implementer's runs on that tree: AC-1 tests 10, pass 10 (14.9 s; 19.9 s before them, when
the disarm test waited a 5 s time limit); AC-2 68/68 (stop 6, record 19, structure 42, fake engine 1); AC-3 9/9; AC-4
15/15; AC-7 exit 0 twice, 857/857 (187.9 s through `tail`; 196.8 s without a pipe).
- AC-9 (judgment): the wrapper writes `stopped` only through `signalledEnding`'s first branch, which needs the record's
  `stopRequested`; `limen stop` writes `stopped` only with its own request, written before its TERM; a group's stop
  goes through `stopJob`. A stop of a `starting` job and a group's reserved slot send no signal and still write
  `stopped` with no request: AC-9 is read within (a)'s scope, every job with a pid (Night defaults, the main session's).
  Every other end by a TERM or a signal is `failed` with `killed by <SIGNAL>`; a TERM that comes after the engine's end
  decides no end (G1). `exhaust`, `checkStall` and the steer read no TERM flag.

Before review round 1, the implementer's runs: AC-1 tests 10, pass 10 (19.9 s); AC-2 tests 6, pass 6; AC-3 9/9 and
19/19; AC-4 7/7 and 8/8; AC-5 42/42 (one earlier run failed its T-25 test on the first name of the `oom` helper,
`failureOf`, which `src/outcome.ts` declares; renamed `recordedFailure`); AC-7 exit 0, 857/857 (190.9 s; one earlier run
stopped at its Biome step on the formatting of one new test line). The main session's gate before review round 1:
exit 0, 857/857 (192.4 s).

## Fails before

AC-6, `node adrian-rebuild/tools/fails-before.mjs` (every new or changed file under `test/`, the fake engine
included, over a copy of `HEAD`) → exit 0, first line (the first implementer's run, and the main session's run on the
tree under review, before review round 1, with the same line and the same tail):

```
fails-before: test/cli/stop.test.ts, test/job/finalize.test.ts, test/job/record.test.ts, test/runtime/wrapper.test.ts fail at HEAD (exit 1)
```

Its tail showed the last two wrapper tests failing (the queued one: `actual: [ null, '' ]` against the `signal` failure
`killed by SIGTERM while queued`; the setup one: "the job ends after the TERM", `false !== true`). The main session's
run after the round 1 fixes, on the tree under review round 2: exit 0, the same first line and the same tail. The main
session's gate on that tree: exit 0, 857/857 (187.3 s).

The main session's run after the round 2 fixes, on the tree under review round 3: exit 0, with `test/config.test.ts`
added (the new knob `LIMEN_END_GATE`) and the same tail:

```
fails-before: test/cli/stop.test.ts, test/config.test.ts, test/job/finalize.test.ts, test/job/record.test.ts, test/runtime/wrapper.test.ts fail at HEAD (exit 1)
```

The main session's gate on that tree: exit 0, 858/858 (189.2 s).

The first implementer's runs at `HEAD`'s code, with the new tests in the working tree, before any change under `src/`.
The fake engine then had (f) without the change of `block` (Night defaults 9); the failures are those of the tests
before review round 1, whose third wrapper test was the time-limit form that F3 replaced.

```
$ node --test --test-timeout=180000 --test-reporter=spec test/runtime/wrapper.test.ts
✖ a TERM to the job's wrapper alone reaches its engine and ends the job failed, kind signal, killed by SIGTERM (21063.828023ms)
  AssertionError [ERR_ASSERTION]: the job ends after the TERM
✖ an engine that ignores the TERM its wrapper forwards is killed after the grace, and its job ends failed, killed by SIGTERM (21111.676136ms)
  AssertionError [ERR_ASSERTION]: the job ends after the grace
✖ a TERM to the job's wrapper disarms no limit: a time limit that runs out during its grace ends the job failed, kind timeout (21014.956619ms)
  AssertionError [ERR_ASSERTION]: the time limit ends the job
✖ an engine that dies by SIGKILL or SIGSEGV with no stop request ends its job failed, kind signal, with the signal's name (3828.279313ms)
  +     'stopped',
  +     null
  +       detail: 'worker exited with code unknown',
  +       kind: 'exit',
✖ an engine killed by SIGKILL in a scope whose memory.events counts an OOM kill ends its job failed, kind oom (1059.650709ms)
    actual: 'stopped',
    expected: 'failed',
✖ a TERM to a queued job's wrapper with no stop request ends the job failed, killed by SIGTERM while queued, and starts no engine (896.402351ms)
    actual: [ null, '' ],
    expected: [ { kind: 'signal', detail: 'killed by SIGTERM while queued', resetAt: null }, '' ],
✖ a TERM to the job's wrapper during its setup with no stop request ends the job failed, killed by SIGTERM during setup, and starts no engine (20899.807858ms)
  AssertionError [ERR_ASSERTION]: the job ends after the TERM
ℹ tests 10  ℹ pass 3  ℹ fail 7
```

At `HEAD` the TERM sets a flag and reaches no engine, so the three TERM tests and the setup test end at their 20 s
bound with the job still `running`; a SIGKILL ends `stopped`, a SIGSEGV loses its name; the queue ends `stopped`.

```
$ node --test --test-timeout=180000 --test-reporter=spec test/cli/stop.test.ts
✖ limen stop of a running job records its reason as the job's stop request and ends the job stopped with it (6357.116175ms)
    actual: [ null, null, [ '] stopped: the ticket changed' ] ],
    expected: [ 'the ticket changed', null, [ '] stopped: the ticket changed' ] ],
✖ a done: stop of a running job whose wrapper ends the job first ends it done, with the stop's reason (6165.923866ms)
    actual: [ 'done 2026-11-22-block-28da65ec: done: accepted', null, [ '] done: done: accepted' ] ],
    expected: [ '2026-11-22-block-28da65ec is already done', 'done: accepted', [ '] done: done: accepted' ] ],
ℹ tests 6  ℹ pass 4  ℹ fail 2
```

At `HEAD` no seam holds the stop, so its own finalize wins (`done <id>: …`), and the record holds no request.

```
$ node --test --test-reporter=spec test/job/finalize.test.ts
✖ finalizeJob records kind oom for a signal death or a reaped wrapper when the job's scope counted an OOM kill, and keeps quota and timeout (184.63588ms)
    actual: [ null, 'reaped', 'quota', 'timeout' ],
    expected: [ 'oom', 'oom', 'quota', 'timeout' ],
ℹ tests 9  ℹ pass 8  ℹ fail 1

$ node --test --test-reporter=spec test/job/record.test.ts
✖ failureFrom names a detail that says which signal killed the job signal, and keeps process group interrupted signal (1.200853ms)
    actual: [ { kind: null, detail: 'killed by SIGTERM', … }, … { kind: 'signal', detail: 'process group interrupted', … } ],
ℹ tests 19  ℹ pass 18  ℹ fail 1
```

The finalize run above is the test before F1: its `killed by SIGKILL` record had kind `null` at `HEAD`, a second
reason (`review.md` → Round 1, finding 1).

The fake engine's `block` (Night defaults 9), on the working tree with the change under `src/` and (f)'s first form:

```
$ node --test --test-timeout=180000 --test-reporter=spec --test-name-pattern="reaches its engine" test/runtime/wrapper.test.ts
✖ a TERM to the job's wrapper alone reaches its engine and ends the job failed, kind signal, killed by SIGTERM (11049.546222ms)
    actual: [ 'failed', { kind: 'signal', detail: 'killed by SIGTERM', resetAt: null }, [ 'sigterm' ], true ],
    expected: [ 'failed', { kind: 'signal', detail: 'killed by SIGTERM', resetAt: null }, [ 'sigterm' ], false ],
```

The engine recorded its `sigterm` and did not exit until the wrapper's KILL 10 s later; with the change of `block` the
same test passes in 1.0 s.

Round 1 fixes, 2026-11-22/23, each new test run before its fix.

F1, with `HEAD`'s form of the `failure:` line (`failureFrom(detail)`, without the rule of (d)) put into the tree's
`src/job/finalize.ts` for this one run, then put back (`git diff` shows `recordedFailure` in that line again):

```
$ node --test --test-reporter=spec --test-name-pattern="records kind oom" test/job/finalize.test.ts
✖ finalizeJob records kind oom for a signal death or a reaped wrapper when the job's scope counted an OOM kill, and keeps quota and timeout (203.010987ms)
    actual: [ 'signal', 'reaped', 'quota', 'timeout' ],
    expected: [ 'oom', 'oom', 'quota', 'timeout' ],
ℹ tests 1  ℹ pass 0  ℹ fail 1
```

The kinds are those the patterns give without the rule, so the one reason is the missing rule.

F2, on the working tree before its fix (the handler of the first implementation):

```
$ node --test --test-timeout=180000 --test-reporter=spec --test-name-pattern="reaches its engine|is killed after the grace" test/runtime/wrapper.test.ts
✖ a TERM to the job's wrapper alone reaches its engine and ends the job failed, kind signal, killed by SIGTERM (1070.906634ms)
    actual: [ 'failed', { kind: 'signal', detail: 'killed by SIGTERM', resetAt: null }, [ 'sigterm' ], false, false ],
    expected: [ 'failed', { kind: 'signal', detail: 'killed by SIGTERM', resetAt: null }, [ 'sigterm' ], true, false ],
✖ an engine that ignores the TERM its wrapper forwards is killed after the grace, and its job ends failed, killed by SIGTERM (1195.553493ms)
    actual: [ 'killed by SIGTERM', [ 'sigterm ignored' ], false ],
    expected: [ 'killed by SIGTERM', [ 'sigterm ignored' ], true ],
ℹ tests 2  ℹ pass 0  ℹ fail 2
```

Each fails only on its result line; after the fix both pass (1.0 s, 1.2 s).

F3 changes no mechanism of `src/`, so its new test passes on the tree before and after the fix. Run with `HEAD`'s
disarm put back into `exhaust` (`if (exhausted || termed)`, the flag of `HEAD`'s `if (exhausted || stopRequested)`)
for this one run, then put back (`git diff` shows `if (exhausted) {` there again):

```
$ node --test --test-timeout=180000 --test-reporter=spec --test-name-pattern="disarms no limit" test/runtime/wrapper.test.ts
✖ a TERM to the job's wrapper disarms no limit: a tool cap reached during its grace ends the job failed, kind tool-cap (20998.272255ms)
  AssertionError [ERR_ASSERTION]: the tool cap ends the job
  false !== true
ℹ tests 1  ℹ pass 0  ℹ fail 1
```

With the disarm the engine still starts its two tools on the forwarded TERM, the cap is not acted on, and the job
runs on to the 20 s bound of the test. At `HEAD` the test fails at the same bound, read from the code: `HEAD`'s wrapper
forwards no TERM, so the engine starts no tool; `fails-before.mjs` shows that run.

Round 2 fixes, 2026-11-23, each test run before its fix.

G2, on the tree after the round 1 fixes, with the new assertion and before the line:

```
$ node --test --test-timeout=180000 --test-reporter=spec --test-name-pattern="reaches its engine" test/runtime/wrapper.test.ts
✖ a TERM to the job's wrapper alone reaches its engine and ends the job failed, kind signal, killed by SIGTERM (1056.560571ms)
    actual: [ 'failed', { kind: 'signal', detail: 'killed by SIGTERM', resetAt: null }, [ 'sigterm' ], true, false, false ],
    expected: [ 'failed', { kind: 'signal', detail: 'killed by SIGTERM', resetAt: null }, [ 'sigterm' ], true, false, true ],
ℹ tests 1  ℹ pass 0  ℹ fail 1
```

It fails only on its last value, the `engine exited with code 143` line before the terminal line.

G1, with the seam (`LIMEN_END_GATE`, `endGate`) in the tree and the end's old read of the live `termed` (`termed ?
"SIGTERM" : result.signal`) put back for this one run, then put back (`git diff` shows `result.termed` in that line
again); the test in its final form:

```
$ node --test --test-timeout=180000 --test-reporter=spec --test-name-pattern="after its engine exited 0" test/runtime/wrapper.test.ts
✖ a TERM to the job's wrapper after its engine exited 0 changes nothing: the job ends done with the engine's result (1083.062236ms)
    actual: [ 'failed', { kind: 'signal', detail: 'killed by SIGTERM', resetAt: null }, '' ],
    expected: [ 'done', null, 'all done' ],
ℹ tests 1  ℹ pass 0  ℹ fail 1
```

The gate's line and the handler's line came first (the test waits for both before it creates the gate file), so the
TERM landed after the engine's end, and the old end read it: `failed: killed by SIGTERM`, no result. The same run before
any fix of the end, with the test's first form (its result expected with a final newline, which `jobFile` trims), gave
the same `actual`. After the fix the test passes (1.1 s). At `HEAD` the knob does not exist, so, read from the code,
the test fails at its 20 s bound on the gate's line ("the wrapper waits at the gate"), not on the end: the seam's case
of `review.md` → Round 1, finding 2. For the same reason `test/config.test.ts` now fails at `HEAD` too (its inventory
lists the new knob, which `HEAD`'s registry lacks), so `fails-before.mjs` will name it with the four files above.

## Night defaults

Category A of D-054 (2) (technical choices inside `## Change` that `taste.md` does not settle). The main session took
1–12 as its night defaults in `ticket.md` → `## Decisions`, with these, for Adrian to confirm in the morning:
- 1 as written: the request is written in `endJob`, not in `apply`, and a stop that finds the job ended sends no TERM.
- Category A (a): AC-9's "`stopped` is written only where the record holds a stop request" is read within (a)'s scope,
  every job with a pid, so a stop of a `starting` job and a group's reserved slot, which send no signal, keep writing
  `stopped` with no `stopRequested` (`review.md` → Round 1, finding 5; Open points).
- Review round 1: the words of F2's lines are the implementer's (13 below); (g)'s "the timeout still fires during it"
  is checked through the tool cap, the same `exhaust` path (F3, 14 below), since no order by events keeps the time
  limit.
- Review round 2 (category A (b)): G1, whether the wrapper got a TERM is taken once as the engine's outcome resolves and
  the record is read after it, its test through a seam of the wrapper's end; G2, the engine's own end in one log line
  before the terminal line of an end a TERM or a signal decides, and seat step 3.8's text changed to that line by the
  main session. The implementer's choices inside them are 15–19 below.

1. The request's write is in `endJob`, the stop's writes after its first, not in the `apply` callback: `transition`
   takes the job's lock, which `apply` holds and which is not re-entrant (`src/lock.ts`). `endJob` is the same
   operation's later steps (T-38 (3)), where the queued branch wrote it, and it also covers a job that moved from
   starting to running after `apply`. A write that finds the job no longer running returns `<id> is already <state>`
   and sends no TERM.
2. Where a TERM before the engine counts: ` while queued` in the start queue; ` during setup` from the queue's end to the
   spawn (prune, `--prepare`, the worktree check and the reading of the engine's arguments), also for a continue,
   which has no setup steps. One check right before the spawn replaces the check after `setUpJob`, which ran for a
   spawn only.
3. The handler acts on one TERM per wrapper: after it, and after the exhaustion's own TERM to the group, a TERM changes
   nothing (`groupTermed`). The exhaustion still sends its TERM when the group already had the forwarded one, as
   `limen stop`'s and the forwarded TERM both reach Pi (Decision 3).
4. The handler's log lines (A-020: "with a log line") go through the wrapper's ordered log writes (`pending`), which an
   end awaits before its terminal line; since round 1 each is written after its call and names its result (13).
5. The KILL's timer starts only when the engine runs at the TERM, is unref'd, and sends nothing once Node has reaped the
   engine (`exitCode` or `signalCode` set), so no other process that got the pid is signalled.
6. The details `killed by <SIGNAL>`, `killed by SIGTERM while queued`, `killed by SIGTERM during setup`, and the pattern
   `^killed by SIG[A-Z0-9]+\b`, placed before the older `process group interrupted` one.
7. The `oom` rule's function is `recordedFailure` in `src/job/finalize.ts` (`failureOf` is `src/outcome.ts`'s, which the
   T-25 scan refuses); it reads the readings only when the record holds a scope, as the readings are written.
8. A second seam of `StopSteps`, `signalled` (after the TERM, before the stop's terminal transition; D-029's pattern),
   so the `done:` test can let the wrapper win.
9. The fake engine's `block` opens its FIFO `O_RDWR | O_NONBLOCK` and reads it through a `net.Socket`, instead of a read
   stream, whose open waits for a writer in a thread of Node's pool; `process.exit` waits for that thread, so (f)'s
   exit 143 did not happen while a job was blocked (the run above). The protocol for tests is unchanged: one write to
   `fake-gate` releases one `block`.
10. `die <SIGNAL>` sends the signal to its own pid and then waits; `SIGTERM` there meets (f)'s handler.
11. Test bounds and values: the waits after a TERM are bounded at 20 s (`END_BOUND_MS`), so a TERM that never reaches the
    engine fails there instead of at the suite's timeout; the `deaf` test's grace is 200 ms; the tool-cap test (F3)
    uses a cap of 2 and a 60 s grace that nothing waits for.
12. The new stop test is not named `limen stop: …`: that name would make it `stop`'s success test (D-076), whose
    ratchet list is in `test/registry.test.ts`, outside `## Change` (Open points).
13. F2's words: `<why>; <TERM|KILL> sent to <target>`, `<why>; <target> was gone` and `<why>; <TERM|KILL> to <target>
    failed: not permitted`, with `<why>` `SIGTERM received` or `TERM grace elapsed` and `<target>` `process group <pid>`
    or `engine <pid>`; one local function, `signalLine`, builds them.
14. F3's word: `tools-on-term <n>` (n tool starts on the next SIGTERM, which it ignores; a bare word starts one), its
    tools written to stdout only, as `idle` does: the wrapper counts the stream, and no hook needs them; the cap of 2
    through the plant's limits file, as the tool-cap test of `test/s3-finish-wake.test.ts` sets it.
15. G1's seam is a test knob, `LIMEN_END_GATE` (`src/config.ts`, kind `test`), since the wrapper runs in a process of
    its own and D-029's in-process injection points (`src/lock.ts`, `StopSteps`) cannot reach it, and no state of the
    files holds the wrapper in that window: after its engine's end it takes the job's lock only for an `error` or
    `aborted` stop reason, which ends no job `done`. The knob names a file; `endGate` logs `engine ended; waiting for
    the test gate <path>`, then waits for the file's creation (a watch of its folder and one check after the line), with
    no bound of its own: only a test sets the knob (T-03), and `limen stop` still ends a job held there. A FIFO, as the
    fake engine's `block` uses, was not taken: its read-write open counts as a write in T-25's scan of `src/`, and a
    read-only one depends on how the kernel reports a FIFO that no writer has opened yet. The gate stands after the
    exhaustion's return and before the record's read, so it covers the whole window G1 names.
16. `termed` is copied in the outcome's own handlers (`error`, `close`), the moment the outcome resolves, not where the
    wrapper awaits it: an engine that ends during the `worker started` log write resolves the outcome before the
    wrapper reaches its `await`.
17. G2's line is written on every end that `signalledEnding` decides, a stop request's included, since a stop's TERM
    ends the engine too. Its words: `engine exited with code <n>` and `engine killed by <SIGNAL>` (G2), and a third form
    for an engine that could not be spawned, `engine error: <message>`, whose message a TERM's end would otherwise drop
    (T-01); one local function, `engineEndLine`, builds them.
18. Every finalize of the engine's end gets the TERM's `shutdownDeadline` (G1 above).
19. The G1 test's script is `say all done` (exit 0 with an assistant reply, so a `result` to keep), its gate file is in
    the plant's parent folder, and its waits are those of `within` on the job folder, bounded at `END_BOUND_MS`.

## Deviations

- `src/registry.ts:405` is unchanged: "why, kept in the record; a reason that starts with done: records it done" was
  true only for a queued job and is true now for every stop, so it already says what (a) asks.
- Beyond (f): the fake engine's `block` changed its mechanism (Night defaults 9), since (f)'s exit 143 needs it; F3 adds
  the word `tools-on-term`, which (f) does not name (`ticket.md` → `## Decisions`, F3: "a new word of
  `test/fake-engine.mjs`").
- (g)'s "a `deaf` engine is KILLed after the grace and the timeout still fires during it" and "a TERM while queued and
  during setup" are two tests each (T-29 (3)); the first wrapper test also asserts that the wrapper sends no KILL. Since
  round 1 the limit of the second test is the tool cap, not the timeout (F3). The `oom` rule and the kept kinds are one
  test, since "no change for `quota` and `timeout`" alone cannot fail before.
- A stop whose request write finds the job no longer running sends no TERM (before: a TERM, then a lost finalize).
- Round 2: G1's seam adds a test knob, `LIMEN_END_GATE`, to `src/config.ts`, and so one name to the inventory of
  `test/config.test.ts`, a test file that (g) does not name; (e)'s "makes no second knob" is about the grace, which
  keeps its one knob.
- Round 2: G2 names two forms of the line; `engineEndLine` has a third, `engine error: <message>`, for an engine that
  could not be spawned (Night defaults 17).
- Round 2: the `done`, exit-code and spawn-error ends of the engine now pass `shutdownDeadline` to `finalizeJob`, which
  G1 does not name (Night defaults 18).

## Unmeasured

- Pi 1.5.1's exit 143 on the forwarded TERM within the grace, a `limen stop` of a real job ending `stopped`, a TERM to a
  real wrapper alone ending `failed:signal` with one alert, and a real OOM kill counted in the scope's `memory.events`:
  `unmeasured` here; the seat's check is `plan.md` → `## Deployment` 3.8 (T-28 (5)).
- The failure kinds `signal` and `oom` in `limen stats` on the seat's records: `unmeasured`, M-11.

## Open points

- `review.md` → Round 1, finding 5, for gate 5.3: two ends write `stopped` with no `stopRequested`, a stop of a
  `starting` job (`src/job/stopping.ts:82`) and a group's reserved slot (`src/job/group-control.ts:612-616`); neither
  sends a signal, and (a) limits the request to jobs with a pid (the night default above).
- F2, `review.md` → Round 2, finding 2: the exhaustion's TERM to the group (`exhaust`, `src/runtime/wrapper.ts`)
  still writes `<reason>; sending TERM` before its call and drops the call's result; this ticket's diff does not change
  that call.
- F2, `review.md` → Round 2, finding 2: the `was gone` and `not permitted` lines have no test: in a plant kill(2)
  neither refuses the wrapper's signals nor misses its targets (the wrapper is a member of its own group, and Node
  reaps the engine before its pid is free), and `signalLine` is local to the wrapper.
- `review.md` → Round 2, finding 3, for gate 5.3: a TERM during the setup's prune step reaches no `--prepare`, which
  starts after it; the job then ends when the prepare ends or hits its own limit, as at `HEAD`
  (`src/runtime/job-setup.ts:30-41`).
- G1: a `limen stop` whose request write lands after the wrapper's read of the record, once the engine has ended by
  itself, ends as the engine's exit decides (`done` for exit 0, the stop then returns `<id> is already done`), with
  `stopRequested` in the record: the engine finished first (A-019). Only a read of the request inside the terminal
  transition would end it as the request asks; `finalizeJob` takes its state as a value. No test puts a write there.
- G1: the gate's wait has no bound of its own (Night defaults 15); an environment that leaked the knob into a real
  job's wrapper would hold every end there until `limen stop`.
- G2: the `engine error:` form has no test: a spawn error with a TERM before it cannot be ordered by events in a
  plant.
- R-027's finding 5: the Herdr deadline after a TERM stays `Date.now() + stopGraceMs() - 500`. `promptOriginPane`
  skips a wake whose deadline is less than 1 s away, so with the knob at 1.5 s or less a wrapper that ends its job after
  a TERM sends no Herdr wake; every plant runs with Herdr off (`LIMEN_HERDR=0`), so no test meets it, and the 10 s grace
  gives 9.5 s.
- A TERM that systemd sends the whole scope reaches the engine and the wrapper at once. Were the engine's exit 143
  handled before the wrapper's own handler ran, the end would read `worker exited with code 143`, kind `exit`. Pi
  disposes its runtime before it exits, and the handler runs at the wrapper's next turn of its event loop, so it was
  not seen; no test shows the order. Since G1 the TERM counts only when the handler ran before the engine's `close`
  event, where before it counted until the end's read of the record.
- The new stop test could be `stop`'s success test (`limen stop: …`) and take `stop` off the D-076 list in
  `test/registry.test.ts` (R-083).
- `docs/jobs.md`'s "Neither state is approval" names two states and now stands under a table of three (R-081).
- T-27 (1): `runInternalJob` keeps its two "split pending" suppressions, as R-093 and R-094 did (R-082, R-083).
- A second `limen stop` of a running job replaces the first one's `stopRequested`; the winner ends the job with the
  reason the record holds then.

From `review.md` → Round 3, not fixed (both rounds of fixes are spent; the reasons are there), for gate 5.3:
- The test knob `LIMEN_END_GATE` (`src/runtime/wrapper.ts`, `endGate`) reaches a real job only if the spawner's
  environment holds it, since nothing outside the tests sets it; if it leaked, every end that no limit exhausted would
  wait without bound after the engine's exit, and `limen status` names no test knob. A bound on the gate's wait, or a
  `limen status` warning for a set test knob, would close it.
- G1 takes the TERM's flag in the engine's `close` handler, which Node emits after `exit` once the engine's stdio
  pipes close; a TERM between the two (an engine that exited while a process that inherited its stdout still holds the
  pipe) still counts and ends `failed`, killed by SIGTERM, with no result written (guessed); taking it on `exit` would
  close that window.
