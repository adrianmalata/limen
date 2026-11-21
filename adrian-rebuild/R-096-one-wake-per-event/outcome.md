<!-- PL: Wynik R-096 (21.11, w dzień; ticket zamknięty): nadmiarowy wake testu kolejki pochodził z fałszywego silnika
testów, nie z dostarczania: test/fake-engine.mjs emitował agent_settled po każdej turze, także gdy w kolejce czekał
follow-up, więc hook liczył ten wake jako niepotwierdzony, zwalniał claim i wysyłał go drugi raz. Teraz jeden run
bierze wiadomości zakolejkowane w czasie jego tur i kończy się jednym agent_settled, jak Pi 1.5.1 (D-069), a nowy
test/fake-engine.test.ts pokazuje tę sekwencję deterministycznie i pada przy HEAD. Według D-068 `waitFailure` w teście
kolejki mówi, jak skończyło się czekanie, które nie odrzuciło, a pierwszy wiersz pliku nazywa trzeci mechanizm. Poprawki
rundy 1 recenzji: nagłówek fałszywego silnika mówi o procesie silnika zamiast o „run”, a test zwalnia wstrzymaną turę
asynchronicznym zapisem do FIFO, jak `release()`. -->

# R-096 outcome

## Done

(b) The fake engine settles once per run (`test/fake-engine.mjs`; D-069). The delivery code, `notify/` and
`record.json` do not change.
- A new `run(messages, reply, stopReason)` takes over the run's edges from `turn()`. It sets `idle` to false, runs a
  turn for its messages, then one turn for each batch that queued meanwhile, until the queue is empty; only then does
  it set `idle` to true and fire `agent_settled`, once. `turn()` keeps the turn itself (the messages' events,
  `turn_start`, `context`, the assistant reply cut inside its multi-byte letters, `message_end`, `turn_end`).
- `deliver` and the task's own turn at the end of the script start a `run`. A batch queued during a run also chains a
  run of its own; the busy run takes that batch first, so the chained run finds no messages and does nothing.
- The comment over `deliver` says what changed and why: a message queued while a run is busy enters that run's next
  turn, and the run settles when none is left, because Pi takes follow-ups when the agent would stop and emits
  `agent_settled` after the run (E-16).

The deterministic test (`test/fake-engine.test.ts`, new; its subject is `test/fake-engine.mjs`, T-29 (1)): "a wake
sent while a coordinator's turn runs enters the same run before the run settles, so the session hears it once".
- A plant, and a coordinator session: the fake engine with the real wake hook (`hook/wake.ts`) and a small extension
  that the test writes into the plant. The extension's first `turn_start` handler waits for one write to a FIFO and
  writes a `held` marker while it waits; later turns are not held.
- Job `early` is written by hand (`notify/ready`, `notify/subscribers/coord`, then a `done` record), so the hook wakes
  the session at its start, and that wake's turn holds. The test then writes job `late` the same way, waits until the
  session has recorded late's wake (the hook sends it as a follow-up, since a turn runs), and releases the turn.
- It waits until late's `notify/delivered/coord` exists, or its claim is blocked after two attempts; either means
  every wake of `late` is recorded. It asserts `{ wakes: [["user"], ["followUp"]], unconfirmed: false }`: one wake
  each, and no unconfirmed attempt in late's `notify/`. Nothing waits for time to pass; the order comes from the held
  turn.

(d) `waitFailure` (`test/runtime/start-queue.test.ts`; D-068) says how a wait ended that did not reject. It maps a
resolved wait to `{ ended }` and a rejection to `{ error }`; a resolved wait fails with `the wait did not fail: it ended
"<value>"` (for example `"gone"`), and a rejection of another type with `the wait failed with <error>`. Its doc comment
names the three ends.

(e) The file's opening line (T-29 (5)) names its third mechanism: "… and a record check that fails for another reason
than ENOENT ends the wait with that failure."

## Fixes of review round 1

Review round 1 was PASS with three notes (`review.md` → Round 1); the main session's decision (`ticket.md` →
`## Decisions`, the last entry) takes notes 1 and 2 as fixes.
- Fix 1 (note 1, T-18): the header of `test/fake-engine.mjs` says "one transcript line per engine process in
  --session-dir", which is the line the engine appends to `fake.jsonl` once when it starts. "Run" as a noun now names
  only Pi's agent run in that file (`run()` and the comment over `deliver`). In `test/fake-engine.test.ts` the doc
  comment of `holdExtension` says "later turns are not held" instead of "later turns run through". The test's name
  keeps "while a coordinator's turn runs", the verb, beside "the same run", the agent run; the note named only the
  fake engine's header.
- Fix 2 (note 2): `test/fake-engine.test.ts` releases the held turn with `await writeFile(…)` from
  `node:fs/promises`, the write that `release()` in `test/plant.ts` uses. The open of a FIFO with no reader then
  blocks a thread of the pool, not the test's event loop, so the test's timeout can still end the test.
- Note 3: no change (the decision).
- After the fixes: `node --test test/fake-engine.test.ts` → exit 0, 1/1; `node --test test/s3-finish-wake.test.ts` →
  exit 0, 7/7; `node adrian-rebuild/tools/fails-before.mjs test/fake-engine.test.ts` → exit 0, "test/fake-engine.test.ts
  fail at HEAD (exit 1)", the same `unconfirmed: true` diff; `npx tsc --noEmit` → exit 0;
  `npx biome check --error-on-warnings .` → exit 0, 240 files, and `… adrian-rebuild` → exit 0;
  `node adrian-rebuild/tools/check.mjs` → exit 0, 0 errors; `node adrian-rebuild/tools/gate.mjs` → exit 0, 599 tests,
  599 pass, 0 fail, 0 cancelled (116.5 s). The fixes change a comment and the release of the held turn, not what the
  load runs of `## Cause` exercise, so those were not repeated.
- The main session after the fixes: `review-guard.mjs compare --git` → exit 0; `node adrian-rebuild/tools/gate.mjs`
  → exit 0, 599 tests, 599 pass, 0 fail (118.1 s); `node adrian-rebuild/tools/fails-before.mjs
  test/fake-engine.test.ts` → exit 0, the same `unconfirmed: true` diff at `HEAD`.

## Cause

**The job, the listener and the path.** R-023's `[true, false, false, true, false, true]` is `later` with its start
notice, its finish wake and its finish wake again; `urgent` with its start notice and finish wake; `timed` with its
finish wake that carries its start line. The extra wake is `later`'s finish, injected by the `coord` session's own wake
hook, the only listener on that session in the queue test:
1. `urgent`'s finish wake opens a turn of the fake engine. While that turn runs, a later sweep of the hook sees
   `later` done: `sendCompletion(…, "own")` → `claimDelivery` (`src/job/wake-delivery.ts:50`) → `injectWake`
   (`hook/wake.ts:408`) sends the wake as a follow-up, since the session is busy. The fake engine records it and queues
   it for its next turn; the hook's pending delivery is accepted, not yet entered.
2. At `HEAD`, `turn()` of `test/fake-engine.mjs` (lines 80–102) set `idle` and fired `agent_settled` at the end of
   every turn, also with a message still queued.
3. The hook's `agent_settled` handler (`hook/wake.ts:964`) marks every pending delivery settled, and
   `confirmDeliveries` (`hook/wake.ts:693`) finds `later`'s accepted and settled but not entered, so it calls
   `recordUnconfirmed` (`src/job/wake-delivery.ts:173`): unsuccessful attempt 1/2, and the claim is removed.
4. The fake engine's next turn takes the queued copy; its `message_start` (`hook/wake.ts:928`) matches no pending
   delivery any more.
5. The next sweep finds `later` with no claim and no delivered slot, claims it again (1 attempt is under the limit of
   2) and injects it again; that copy enters a turn and is confirmed.

**Did a coordinator hear one event twice?** The test's coordinator did: both copies of the same finish wake entered a
turn of the fake engine. A coordinator on Pi 1.5.1 does not, because Pi never settles a run while one of its
follow-ups is queued: `pi-agent-core` `dist/agent-loop.js:196` ("Agent would stop here. Check for follow-up
messages") takes the follow-ups inside the same run, before `agent_end`; `pi-coding-agent` `dist/core/agent-session.js`
emits `agent_settled` once, from `_startRun`'s `finally` after its loop (line 1535, `_emitAgentSettled` at line 738);
and `prompt` defers a message that arrives while `agent_settled` is emitted to a new run (line 1696). So the delivery
code's rule (a wake not entered when its run settles is unconfirmed, and is sent again) is right for Pi; only the test
failed, through its fake engine's model of a run, not through its matching or its timing (D-069).

**The evidence under load (a).** No run failed within (a)'s limit, with temporary diagnostics in place (a trace of the
fake engine's deliveries, turn starts and settles, and of the hook's injections, `message_start` matches and
confirmed or unconfirmed claims, written to the OS temporary folder; the file's `after` copied each plant's
`fake-events.jsonl`, the traces, and each job's `log`, `record.json` and `notify/` tree there). The diagnostics were
removed afterwards, and `git show HEAD:<path> | cmp - <path>` found `hook/wake.ts`, `test/fake-engine.mjs` and
`test/s3-finish-wake.test.ts` identical to `HEAD` before this change began.
- Commands: `node adrian-rebuild/tools/gate.mjs`, and `node --test --test-timeout=180000 --test-force-exit
  test/s3-finish-wake.test.ts` started beside it. Runs: the file once alone, then six rounds of one gate run with 2, 5,
  6, 7, 4 and 4 runs of the file beside it: 6 gate runs and 29 runs of the file. Two more runs of the file (one in the
  fourth round, one in the sixth) were denied by the permission classifier and not retried. Load average 13–26 on 12
  cores.
- Results: every gate run exit 0, 598 tests, 598 pass; every run of the file 7/7. No failure.
- Records read: 35 dumps (29 runs of the file and the 6 inside the gate runs). No job had a `notify/unconfirmed`
  entry, no job's `log` had "unsuccessful wake attempt" or "dropped duplicate wake", and no session heard a wake twice.
  The fake engine's trace of the coordinator sessions: 686 wakes, 0 of them sent while a turn ran; turns 34 ms at the
  median, 68 ms at p95, 204 ms at most.
- Near misses: 7 wakes were sent 43–85 ms after a turn of the same session settled, in the queue test (`q urgent`)
  and in the stop, timeout and stall test (`b timeout`, `b stopped`). In every run of the queue test but one, `later`
  and `urgent` finished within one sweep, so both wakes entered one turn; in one run they split: `later`'s finish turn
  ran for 44 ms, and `urgent`'s finish wake was sent 85 ms after it settled. A wake sent inside such a turn is the
  sequence above.

**The deterministic test makes that sequence happen.** `test/fake-engine.test.ts` holds the turn of one finish wake
(`early`) and has the hook send another job's finish wake (`late`) during it, the `urgent`/`later` pair of the queue
test. Against `HEAD`'s fake engine it fails, 3 of 3 runs in a scratch copy before this change and once more in the
repository (the output in `## Fails before`): `late` is heard twice (`followUp`, then `user`), and its `notify/` holds
the unconfirmed attempt. With the change it passes.

**The load runs after the change** (D-069: the same commands, within the same limit; no diagnostics, the tree as it is
committed): the file once alone, then six rounds of one `node adrian-rebuild/tools/gate.mjs` run with 2, 5, 6, 7, 4
and 4 runs of `node --test --test-timeout=180000 --test-force-exit test/s3-finish-wake.test.ts` beside it: 6 gate runs
and 29 runs of the file, as before the change. Every gate run exit 0, 599 tests, 599 pass; every run of the file exit
0, 7/7. No failure; no run was denied. With the AC-5 gate run and the one after the round-1 fixes, the implementer used 8 of the 10 gate
runs (review round 2, finding 1); the main session's own gate runs belong to the protocol, not to (a)'s limit.

**(c) R-094's open point 5.** The same mechanism explains `wokeOnce`'s `1 !== 0` (`test/s3-finish-wake.test.ts:87`): in
the file's first three tests a finish wake that the hook sends while another wake's turn runs is sent once more and then
confirmed, so `extra.length` is 1. (A second unconfirmed attempt would block the claim instead, and `delivered` would
wait until the test's timeout.) The near misses of the stop, timeout and stall test are that sequence missed by 48 and
61 ms. The change and the deterministic test cover it.

## Fails before

AC-4 (D-069): `node adrian-rebuild/tools/fails-before.mjs test/fake-engine.test.ts` (`HEAD` `29722fd`) → exit 0:

```
fails-before: test/fake-engine.test.ts fail at HEAD (exit 1)
ℹ pass 0
ℹ fail 1
✖ a wake sent while a coordinator's turn runs enters the same run before the run settles, so the session hears it once (641.083854ms)
  AssertionError [ERR_ASSERTION]: Expected values to be strictly deep-equal:
  + actual - expected
    {
  +   unconfirmed: true,
  -   unconfirmed: false,
      wakes: [
        [
          'user'
        ],
        [
          'followUp',
  +       'user'
        ]
      ]
    }
```

The main session's run of the same command on the final tree → exit 0, the same assertion failing at `HEAD`
(`unconfirmed: true`, `late` heard as `followUp`, then `user`).

The same failure in the repository before the fake engine changed: `node --test test/fake-engine.test.ts` → exit 1,
pass 0, fail 1, the same diff.

The changed test that passes at `HEAD`, with its reason:
- `test/runtime/start-queue.test.ts` (items (d) and (e)): `node adrian-rebuild/tools/fails-before.mjs
  test/runtime/start-queue.test.ts` → exit 1, "pass at HEAD", 11/11. The change is diagnosis only: `waitFailure`'s
  message differs only when a wait ends otherwise than the test expects, and the opening line is a comment. The
  message was shown with a temporary mutation of `src/runtime/start-queue.ts` (in `recordGoneAt`, a record check that
  fails with another error than `ENOENT` counted as gone), restored afterwards and found identical to `HEAD` with
  `cmp`: before the change, "QUEUE_RECORD_UNREADABLE: … also when its log cannot take the line" failed with `the wait
  ended with undefined`; after it, with `the wait did not fail: it ended "gone"`.

The form without paths, for the record: `node adrian-rebuild/tools/fails-before.mjs` → exit 1, "test/runtime/
start-queue.test.ts, test/fake-engine.test.ts pass at HEAD", 12/12. It copies every new or changed file under
`test/`, the changed `test/fake-engine.mjs` too, over `HEAD`, so the new test runs against the fixed fake engine there;
D-069 sets AC-4 to the form with the test's path for this reason.

## Proof

- AC-1: `node --test test/s3-finish-wake.test.ts` → exit 0, 7 tests, 7 pass.
- AC-2: `node --test test/u4-wake-claims.test.ts` → exit 0, 3 tests, 3 pass.
- AC-3: `node --test test/job/wake-delivery.test.ts` → exit 0, 1 test, 1 pass.
- AC-4: `node adrian-rebuild/tools/fails-before.mjs test/fake-engine.test.ts` → exit 0 (`## Fails before`).
- AC-5: `node adrian-rebuild/tools/gate.mjs` → exit 0, 599 tests, 599 pass, 0 fail, 0 cancelled (113.7 s). It started
  before one comment line of `test/fake-engine.test.ts` was shortened to 120 columns; the gate runs of the load
  repeat (`## Cause`) ran on the final tree.
- The main session's `node adrian-rebuild/tools/gate.mjs` on the final tree (protocol step 4) → exit 0, 599 tests,
  599 pass, 0 fail (114.9 s).
- AC-6: `npx tsc --noEmit` → exit 0; `npx biome check --error-on-warnings .` → exit 0, 240 files;
  `node adrian-rebuild/tools/check.mjs` → exit 0, 0 errors.
- AC-8: `node --test test/runtime/start-queue.test.ts` → exit 0, 11 tests, 11 pass.
- AC-9: `node --test test/fake-engine.test.ts` → exit 0, 1 test, 1 pass.

## Deviations from the ticket

- (a) has no failing run under load; D-069 takes (a)'s runs with no failure, the near misses and the deterministic
  test as the evidence, and AC-7 is judged on that.
- AC-4 runs with the test's path (D-069).
- (b) takes its second branch in D-069's form: the cause is the fake engine's model of a run, not the test's matching
  or timing, so the fake engine changes and `test/s3-finish-wake.test.ts` does not.
- (d) and (e) have no test that fails at `HEAD`: both change only what a failing test says (D-068: "diagnosis only"),
  so `test/runtime/start-queue.test.ts` passes at `HEAD`; the mutation in `## Fails before` shows (d)'s message.

## Measurement

No M-NN applies: the change is to the test's fake engine and is measured here by the tests above. Whether Pi on the
seat settles as its source reads is the bridge contract of T-31 (2), a deployment step outside this ticket.

## Open points

1. The fake engine's case of a message that a hook sends while `agent_settled` is emitted has no test of its own: the
   run has set `idle` already, so the message starts a new run after the settled one, as Pi's `prompt` defers it to a
   new run (`agent-session.js:1696`). The wake hook's `agent_settled` handler starts a sweep that may send there; no
   test makes that order happen on purpose.
