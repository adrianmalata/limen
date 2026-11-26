<!-- PL: Wynik R-111 (implementer i sesja główna, 26.11, przy `32718c8`): hook budzenia rozlicza budzenie tylko przez
`agent_settled` biegu, do którego weszło (A-089); sweep przy bezczynnej sesji wysyła najwyżej jedno budzenie, a resztę
wysyła sweep z `before_agent_start` jako follow-upy (A-090); budzenie, które nie weszło do żadnego biegu, liczy się
jako niepotwierdzone po 30 s ciszy. Atrapa odtwarza lukę `prompt` z Pi (E-21): drugi start pada z tekstem Pi i robi
settle wewnątrz pierwszego biegu. Nowe testy padają na HEAD (`fails-before.mjs`). Runda 1 recenzji: PASS z czterema
uwagami; poprawki F1–F3 w testach (kolejność zapisu zadania i ograniczone czekanie, nowy test drugiej połowy granicy,
asercja osobnego biegu dla każdego budzenia), każda z dowodem na kopii z jedną mutacją. Bramka zielona (1287/1287). Runda 2: PASS z dwiema uwagami (jedna bez zmian
z powodem, druga do punktów otwartych); recenzja zamknięta. -->

# R-111 outcome

## Done

1. `hook/wake.ts`, settle by entry (A-089): the `agent_settled` handler sets `settled` only on the deliveries in
   `activeDeliveries`, those whose `message_start` came since the previous settle; a wake that has not entered stays
   pending with its claim. `confirmDeliveries` is unchanged. `settled` and `activeDeliveries` carry a comment on which
   settle sets them (T-30).
2. `hook/wake.ts`, the backstop (T-01): `countLostWakes()` runs in every sweep, after the sweep's `await` and before its
   sends. When the session reads idle and no run has started (`before_agent_start`) or settled for `CLAIM_STALE_MS`
   (`runSeenAt`, reset at `session_start`), each pending delivery that is accepted, has not entered and was sent at
   least `CLAIM_STALE_MS` ago (`sentAt`, new field) goes through `recordUnconfirmed` with its own reason
   `wake entered no run while the session stayed idle for 30 s` (`LOST_WAKE`), and its `blocked` toast at the second
   count. The same sweep then sends it again (attempt 1 removed the claim). `src/job/wake-delivery.ts` is unchanged.
3. `hook/wake.ts`, one starter per idle sweep (A-090): `injectWake(message, announce)` returns `false` once the sweep
   has sent a wake while the session read idle, so `claimDelivery` releases the claim with no attempt; the completion
   and advisory toasts moved into `announce`, so only a sent wake gets one. Sends while busy stay `deliverAs:
   "followUp"`. A `before_agent_start` handler, through `recorded`, sets `runSeenAt` and requests a sweep when the
   session reads busy; `sweep()` sets `sweepAgain` when one is in flight, and `finishSweep`'s `finally` runs one more
   sweep then. The comment of `hook/wake.ts:420` is replaced by the new rule.
4. `test/fake-engine.mjs`, E-21 (T-28 (5)): `promptMessage` is async and awaits `preparePrompt` (Pi's `_preparePrompt`,
   which awaits `inputHandlers`, Pi's `_runInputHandlers` with no handler) before it reads `reserved`, so two user
   sends of one stretch both start a run. `startRun` counts the run that holds the agent (`holders`, pi-agent-core's
   `activeRun`); a start while one holds it goes to `secondStart`: busy, `before_agent_start`, no `message_start`,
   `agent_settled` with `aborted: false` (which marks the session idle while the first run goes on), then
   `Extension error (<runtime>): Agent is already processing a prompt. Use steer() or followUp() to queue messages, or
   wait for completion.` on stderr. Custom messages still start their run at the send (`:1972`). Each rule cites its
   Pi 1.5.1 line; the file's opening comment says so. The old busy-send error keeps its text.
5. Tests:
   - `test/fake-engine.test.ts`: "E-21: two sends made in one stretch while the session is idle start two runs; the
     second fails with Pi's text and settles inside the first", on a test extension whose command `/race` makes both
     sends. The file's `again()` now appends the engine's stderr to `stderr.txt` in the test's folder instead of
     dropping it; its opening line names the error channel.
   - `test/hook/wake.test.ts`, on the fake (`p.bin/pi --extension hook/wake.ts --extension <test>.mjs`, one notes
     extension that records each run's start, each user message that enters and each settle): "A-089: wakes sent while
     a settle is held each enter their own run, settled by it, and wake the session once" (the extension also holds
     the first `agent_settled` on a FIFO while three planted done jobs are woken) and "A-090: two wakes due in one
     sweep while the coordinator is idle enter one run, the second as a follow-up, each once" (two done jobs before the
     session starts). Every wait of both ends at 60 s with a failure naming what it waited for (`waitFor`).
   - `test/hook/wake.test.ts`, in process (`startCoordinator`), on `t.mock.timers` (`Date`, `setInterval`,
     `setTimeout`), waiting only by `setImmediate` turns, no test knob: "a wake that enters no run is counted
     unconfirmed, with its reason in the job's log, once the session has been quiet for 30 s" (the send's half of the
     bound) and "a wake that enters no run is not counted while a run settled less than 30 s ago, and is counted once
     that settle is 30 s old" (the run's half, review round 1).
   - The file's opening lines name the three mechanisms (T-29 (5)).
6. `docs/herdr-status.md:132-135`: "… gets an assistant answer without error or abort, and the run it entered has
   settled."

## Fixes of review round 1

Review round 1 (`review.md`) was PASS with four notes; F1–F3 (`ticket.md` → `## Decisions` 9), all in
`test/hook/wake.test.ts`, each shown on a copy of `git archive HEAD` in the session's temporary folder with this
change laid over it and one mutation (no git write):
- F1 (finding 1): `jobFor` writes the subscriber before `notify/ready`, so a planted job is never routable while
  unsubscribed: a sweep between the two writes found a routable job of no session, past its fallback grace, and sent
  a fallback wake, which `heard()` never records. Every wait of the A-089 and A-090 tests is `waitFor(dir, what,
  check)` over `within` from `test/plant.ts`, bounded at 60 s, failing with `<what>: not within 60 s`. Proof: with a
  1.5 s pause between the two writes, the old order (ready, then the subscriber) ends the A-089 test at its bound:
  exit 1, "AssertionError [ERR_ASSERTION]: every wake of a, b and c recorded, and every run settled: not within 60 s"
  (66.7 s, no hang); the new order with the same pause passes, exit 0 (6.9 s).
- F2 (finding 2): new test "a wake that enters no run is not counted while a run settled less than 30 s ago, and is
  counted once that settle is 30 s old": the wake is sent at 0 s, a run it did not enter settles at 15 s
  (`agent_settled` fired), at 44.999 s (the wake 45 s old, the settle 29.999 s) nothing is counted, at 45 s the line
  is in the job's log. Both backstop tests share `mockClock` (now two stale ages behind the real clock, since this
  test jumps 45 s), `nextSweep` and `logLines`. Proof: with `|| now - runSeenAt < CLAIM_STALE_MS` removed from
  `hook/wake.ts:776`, the new test fails, exit 1, `early: ['wake entered no run while the session stayed idle for 30
  s; unsuccessful wake attempt 1/2']` against `early: []`, while the send's-half test still passes (tests 2, pass 1,
  fail 1).
- F3 (finding 3): the A-089 test asserts each wake's own run from the notes extension: `runs: ['start early', 'enter
  early', 'settled', 'start a', 'enter a', 'settled', 'start b', …, 'enter c', 'settled']`, beside the wake counts and
  `unconfirmed`; its wait also needs every started run settled (`runsSettled`). Proof: with a fake whose send deferred
  behind another deferred send is queued as a follow-up instead (so a, b and c enter one run), the round-0
  assertions hold (`wakes: [1, 1, 1]`, `unconfirmed: []`) and the test fails, exit 1, on `runs: [… 'start a', 'enter
  a', 'enter b', 'enter c', 'settled']`.
- Finding 4: no change; `## Open points` 8.

## Proof

All from the repository root at `32718c8` with the change in the working tree.

| Command | Exit | Tests |
|---|---|---|
| `node --test test/hook/wake.test.ts` (AC-1) | 0 | 20/20 after round 1 (19/19 before; the 4 new tests alone 3 times: 4/4 each time) |
| `node --test test/fake-engine.test.ts` (AC-2) | 0 | 23/23 |
| `node --test test/s3-finish-wake.test.ts` (AC-3) | 0 | 9/9 |
| `node --test test/u4-wake-claims.test.ts` (AC-4) | 0 | 3/3 |
| `node --test test/job/wake-delivery.test.ts` (AC-4) | 0 | 3/3 |
| `node --test test/runtime/pi-api.test.ts` (AC-4) | 0 | 29/29 |
| `node adrian-rebuild/tools/fails-before.mjs test/fake-engine.test.ts` (AC-5) | 0 | below |
| `node adrian-rebuild/tools/fails-before.mjs test/hook/wake.test.ts test/fake-engine.mjs` (AC-6) | 0 | below |
| `git grep -q 'A-089: ' -- test/hook/wake.test.ts`; `'A-090: '`; `git grep -q 'E-21' -- test/fake-engine.mjs` (AC-7) | 0, 0, 0 | — |
| `git grep -q 'later injects, and any inject while busy, are followUp' -- hook/wake.ts` (AC-8) | 1 | — |
| `git grep -q 'before_agent_start' -- hook/wake.ts` (AC-9) | 0 | — |
| `git grep -q 'and Pi settles' -- docs/herdr-status.md` (AC-10) | 1 | — |
| `npx tsc --noEmit` (AC-11) | 0 | — |
| `npx biome check --error-on-warnings .` (AC-12) | 0 | 286 files |
| `node adrian-rebuild/tools/gate.mjs` (AC-13) | 0 | 1287/1287 after round 1, 295 s (1286/1286 before) |
| `node adrian-rebuild/tools/check.mjs` | 0 | "0 errors" |
| `npx biome check --error-on-warnings adrian-rebuild` | 0 | 35 files |

## Gate runs

1. `node adrian-rebuild/tools/gate.mjs` → exit 0: `ℹ tests 1286`, `ℹ pass 1286`, `ℹ fail 0`, `duration_ms 295458`.
   No test failed in any run of this ticket outside the new tests before the hook change.
2. After the fixes of review round 1: `node adrian-rebuild/tools/gate.mjs` → exit 0: `ℹ tests 1287`, `ℹ pass 1287`,
   `ℹ fail 0`, `duration_ms 294500`.
3. The main session's runs (they count, protocol step 4): after the implementer's first run, `gate.mjs` → exit 0,
   1286/1286, 299.8 s, with `fails-before.mjs` AC-5 and AC-6 → exit 0; after the fixes of review round 1, `gate.mjs`
   → exit 0, 1287/1287, 298.9 s, with AC-6 → exit 0. No test failed in any of them.

## Fails before

The test written first, before the fake changed: `node --test --test-name-pattern='E-21' test/fake-engine.test.ts` →
exit 1, `tests 1, pass 0, fail 1`:

```
✖ E-21: two sends made in one stretch while the session is idle start two runs; the second fails with Pi's text and settles inside the first
  + actual - expected
    { entered: [ 'first', + 'second', '/race\nsay done' ],
  +   errors: [], idleAtFirstEnd: false, settledInsideFirst: [],
  -   errors: [ 'Extension error (<runtime>): Agent is already processing a prompt. …' ], idleAtFirstEnd: true,
  -   settledInsideFirst: [ { idle: true, settled: false } ],
      starts: [ '/race\nsay done', 'first', - 'second' ] }
```

The wake tests, written before the hook changed and run with the new fake on HEAD's hook:
`node --test --test-name-pattern='A-089|A-090|enters no run' test/hook/wake.test.ts` → exit 1, `tests 3, pass 0,
fail 3`: A-089 `unconfirmed: ['2026-11-26-b-0003', '2026-11-26-c-0004']` (the first deferred run's settle counted the
other two); A-090 `run: ['start one', 'start two']` and both jobs unconfirmed (two runs started, the second settled
inside the first); the backstop `log: []` (nothing counted).

AC-5, `node adrian-rebuild/tools/fails-before.mjs test/fake-engine.test.ts` → exit 0:

```
fails-before: test/fake-engine.test.ts fail at HEAD (exit 1)
✖ E-21: two sends made in one stretch while the session is idle start two runs; the second fails with Pi's text and settles inside the first (159.746112ms)
  AssertionError [ERR_ASSERTION]: Expected values to be strictly deep-equal:
  … (the diff above)
    actual: { starts: [ '/race\nsay done', 'first' ], entered: [ 'first', 'second', '/race\nsay done' ], settledInsideFirst: [], idleAtFirstEnd: false, errors: [] },
```

AC-6, `node adrian-rebuild/tools/fails-before.mjs test/hook/wake.test.ts test/fake-engine.mjs` → exit 0. The tool
prints the last 40 lines, which hold the end of the A-090 failure and the whole backstop failure:

```
fails-before: test/hook/wake.test.ts fail at HEAD (exit 1)
  …
    actual: { run: [ 'start one', 'start two', 'settled' ], wakes: [ [Array], [Array] ], unconfirmed: [ '2026-11-26-one-0005', '2026-11-26-two-0006' ] },
    expected: { run: [ 'start one', 'enter one', 'enter two', 'settled' ], wakes: [ [Array], [Array] ], unconfirmed: [] },
  …
✖ a wake that enters no run is counted unconfirmed, with its reason in the job's log, once the session has been quiet for 30 s (80.979015ms)
    actual: { early: false, log: [] },
    expected: { early: false, log: [ 'wake entered no run while the session stayed idle for 30 s; unsuccessful wake attempt 1/2' ] },
```

Because the tail cuts the first names, the same check was made by hand on a copy of `git archive HEAD` in the
session's temporary folder with the same files laid over it (no git write), listing every test:
- `test/hook/wake.test.ts` with the new `test/fake-engine.mjs` → exit 1, `tests 19, pass 16, fail 3`; the failures
  are exactly "A-089: …", "A-090: …" and "a wake that enters no run …"; the 16 earlier tests pass.
- `test/fake-engine.test.ts` → exit 1, `tests 23, pass 22, fail 1`; the failure is exactly "E-21: …".

After the fixes of review round 1 (A-089's assertion and waits, A-090's waits, the new backstop test, `jobFor`):
- AC-6 again, `node adrian-rebuild/tools/fails-before.mjs test/hook/wake.test.ts test/fake-engine.mjs` → exit 0,
  "fail at HEAD (exit 1)"; its 40-line tail holds the end of the send's-half failure (`actual: { early: [], log: []
  }`) and the whole failure of the new test:

  ```
  ✖ a wake that enters no run is not counted while a run settled less than 30 s ago, and is counted once that settle is 30 s old (69.202354ms)
      actual: { early: [ 'wake turn errored, aborted or remained unconfirmed; unsuccessful wake attempt 1/2' ], log: [ 'wake turn errored, aborted or remained unconfirmed; unsuccessful wake attempt 1/2' ] },
      expected: { early: [], log: [ 'wake entered no run while the session stayed idle for 30 s; unsuccessful wake attempt 1/2' ] },
  ```

  (at HEAD the other run's settle counted the wake that had not entered: A-089 itself).
- The same file on the copy, every test listed → exit 1, `tests 20, pass 16, fail 4`; the failures are exactly the
  four new tests, the 16 earlier tests pass:
  - "A-089: …": `runs: ['start early', 'enter early', 'settled', 'start a', 'enter a', 'settled']`, `wakes: [1, 2, 2]`,
    `unconfirmed: ['2026-11-26-b-0003', '2026-11-26-c-0004']`;
  - "A-090: …": `run: ['start one', 'start two', 'settled', 'enter one', 'start one', 'settled', 'start two',
    'settled', 'settled']`, each wake sent twice, both jobs unconfirmed;
  - "a wake that enters no run is counted …": `early: [], log: []`;
  - "a wake that enters no run is not counted while a run settled …": the default reason's line, as above.

## Deviations from the ticket

1. The `before_agent_start` handler requests the sweep only while the session reads busy (Change item 3 says it
   requests a sweep). Pi marks the run busy before it emits the event (`agent-session.js:1488`, `:1552`), so in Pi the
   condition always holds. The fake prepares its task's run at its start, while the session is idle (R-038's model),
   so its `before_agent_start` reads idle there; a sweep then could make a second idle send while the starter of the
   session-start sweep still waits in its gap (E-21), which would depend on microtask counts. The comment states the
   reason without naming the fake.
2. "A sweep requested while one is in flight runs once more after it" holds for every request (timer, watch event,
   settle, `/limen on`, run start), as the ticket words it: at most one more sweep after one in flight.
3. `test/fake-engine.test.ts`'s `again()` keeps the engine's stderr in `stderr.txt` (was `stdio: "ignore"`), so the
   E-21 test can read Pi's error text; no existing assertion changed.
4. The A-089 and A-090 tests also stop waiting at a job's first unconfirmed attempt (`heard`), so they fail at HEAD
   at once instead of waiting for later re-sends; both also wait until every run the notes extension saw start has
   settled (`runsSettled`), since it notes a settle after the hook's handler (the first run of the A-090 test, before
   such a wait, failed only on that missing line while the mechanism held). Each wait ends at 60 s (F1).
5. Review round 1: `jobFor`, which the in-process tests share, writes the subscriber before `notify/ready` (F1); the
   backstop tests' clock starts two stale ages behind the real one (was one), for the 45 s of the new test (F2).

No existing test changed its assertion; no existing test failed with the new fake and the fixed hook.

## Unmeasured

- The behaviour on real Pi 1.5.1: E-21's tick order is traced from the sources and reproduced by the fake, not run on
  Pi; the one-starter rule, settle by entry and the backstop on the seat. Seat step 4.14 in `## Deployment` checks
  it; `## Measurement` → M-08 counts the owner touchpoints a blocked wake claim causes (`unmeasured`, the main
  session's choice of metric).

## Open points

1. Out of scope, as the ticket says: the fake's deferred loop goes on after a throwing action, where Pi drops the rest
   (E-20's last clause). With E-21 the fake now has such an action: a deferred send that loses the race
   (`secondStart` reports and returns); in Pi its throw would end `_emitAgentSettled`'s loop and drop the later
   deferred sends.
2. A race between the hook's one starter and an owner's prompt made in the same microtask gap remains: both start
   runs, the loser is dropped, and its settle inside the winner's run can settle a wake that entered and is not yet
   answered (counted unconfirmed), or leave a dropped starter to the backstop after 30 s. The hook cannot see it.
3. A settle held open longer than `CLAIM_STALE_MS` by another extension can let the backstop count a deferred wake
   that would still enter (ticket Risk); the wake is then counted once and sent again, a visible attempt.
4. Fake-only scheduling, reached by no test: a second start waits one microtask so that both `before_agent_start`
   events come in Pi's order; when the winner is itself chained behind an earlier run's settle tail, the loser runs
   before the winner begins. The fake's `abort()` returns at once when a loser's settle has marked the session idle
   while the winner runs, where Pi's abort would stop the winner.
5. The E-21 test asserts the order Pi fixes and leaves open whether the second start's settle comes before or after
   the first run's user `message_start`, which Pi's trace leaves open too (the fake puts the settle first).
6. The backstop tests start the mocked clock two `CLAIM_STALE_MS` behind the real one (`mockClock`), because the
   claim recovery of `src/job/wake-delivery.ts` compares `Date.now()` with file times; without it the 30 s and 45 s
   jumps would make the claim look stale to that recovery as well.
7. For the main session (reserved paths): `plan.md` E-16 cites `hook/wake.ts:442-446` ("`sendUserMessage` when idle,
   `deliverAs: "followUp"` when busy"), now at other lines and with the one-starter rule; R-038's `outcome.md` item 2
   says the fake reserves a run at the send, which R-111 changes for user messages.
8. `adrian-rebuild/tools/fails-before.mjs` prints only the last 40 lines of the run at HEAD (review round 1, finding
   4), so with four failing tests in `test/hook/wake.test.ts` its output names only the last one and the end of the
   one before it; `## Fails before` above holds the run of every test at HEAD on the same copy (20 tests, the 4 new
   ones fail).
9. Review round 2, finding 2 (guessed): the A-089 test releases the held settle by writing its FIFO
   (`test/hook/wake.test.ts:595`), which blocks with no bound of its own if the engine died after its sends; the
   test's `--test-timeout` (180 s in `npm test` and the gate) ends it as a failure. For R-083, whose scan covers
   waiting in tests (T-31 (4)).
10. Item 7's E-16 citation is updated by the main session; R-038's `outcome.md` stays the record of R-038.
