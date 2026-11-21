<!-- PL: Ticket R-096 (D-067): przyczyna nadmiarowego wake'a w teście kolejki „a held gate queues jobs by priority …”
(test/s3-finish-wake.test.ts) zostaje znaleziona i usunięta. Implementer odtwarza błąd pod obciążeniem bramki, ustala,
czy koordynator naprawdę słyszy jedno zdarzenie dwa razy, czy zawodzi tylko test, i dodaje deterministyczny test,
który pada przed zmianą. Napisany 21.11 przy 29722fd; D-068 dodał dwa punkty testu kolejki, a D-069 przyjął
dowód deterministyczny (przyczyna w fałszywym silniku testów). Stan: zamknięty. -->

# R-096 One wake per event: the extra wake of the held-gate queue test, found and removed

## Problem

Adrian's decision, quoted from `plan.md` → `## Decisions`:

- D-067 (1): "A new ticket R-096, stage 2, size S, `delegated`, `night`, after R-023 and R-095 (R-095 changes the
  queue's and the plant's tests), before the tag `a0.2.0`: the cause of the extra wake in this test, found and
  removed, whether a coordinator really hears an event twice (the wake delivery) or only the test's timing fails, with
  a reproduction under the gate's load that fails before the change; the third symptom of the same test (D-063 (2):
  `timed` ended `failed`; R-094's `outcome.md` → Open points: `wokeOnce` `1 !== 0`)."

The symptoms, each seen once and never alone:

1. R-023's implementer's gate (2026-11-21, `R-023-commands-thin-adapters/outcome.md`): "a held gate queues jobs by
   priority …" (`test/s3-finish-wake.test.ts:216`) failed at line 273, the "started after" marks of the coord
   session's wakes of `later`, `urgent` and `timed`: actual `[true, false, false, true, false, true]`, expected
   `[true, false, true, false, true]`, one wake too many. The file alone passed 10 of 10 on that tree and 10 of 10 at
   its `HEAD`; the next gate passed 586/586.
2. R-022's round-2 gate (D-063 (2)): the same test, the job `timed` ended `failed` while the test then expected
   `done`. R-094 (change 3) rewrote the test so that `timed` ends by its timeout and no assertion rests on a wall-clock
   budget; that symptom is context, not this ticket's target.
3. R-094's mutation run (`R-094-queued-wrapper-ends/outcome.md` → Open points 5): an `AssertionError` `1 !== 0` from
   `wokeOnce`'s "<name> woke its session once" (`test/s3-finish-wake.test.ts:87`), most likely in one of the file's
   first three tests; which test and which job are not known. R-094 suspected a double wake older than its change.

Facts at `29722fd` that the search starts from (none of them is known to be the cause):

1. `wakes` (`test/s3-finish-wake.test.ts:64`) counts every event of a session's `fake-events.jsonl` whose text starts
   with "Limen job" and contains the job id; line 273 maps each such wake of the three jobs to whether it contains
   ") started after ".
2. The test stops the coord session with `SIGSTOP` (line 249) until `waitJob(p, timed)` returns, then sends `SIGCONT`
   (line 253); `timed`'s finish wake then carries its missed start line (`missedStartNotice`,
   `src/job/wake-text.ts`).
3. A claim is made, accepted and confirmed by `claimDelivery` and `confirmClaim` (`src/job/wake-delivery.ts`); a claim
   older than `CLAIM_STALE_MS` (30 s, line 10) whose `live` heartbeat is older too is recovered by `recoverClaim`, and
   the hook protects its own pending claims (`hook/wake.ts`, `protected` at line 418; `recoverClaims` at lines 480,
   573 and 632).
4. The file alone runs 27–30 s; the gate runs every test file with `--test-concurrency=4` (`package.json`, `check`).
5. The delivery's own tests are `test/u4-wake-claims.test.ts` and `test/job/wake-delivery.test.ts`.

## Change

(a) The cause. The implementer reproduces the extra wake under the gate's load (the gate itself, or the file run
beside load it makes through the allowed commands) and reads the records of a failing run (the sessions'
`fake-events.jsonl`, the jobs' `notify/` trees and `log`) to tell which job got the extra wake, which listener
injected it and through which path. Temporary diagnostics stay in a scratch copy or are removed before the report,
with the restored files compared to `HEAD` (`cmp`). Hard limit (z. 1): at most 10 gate runs and 30 runs of the file
for the reproduction; when none fails, the implementer stops with `BLOCKED: <what it ran, what it read>`.

(b) The removal, by what (a) finds:
- When a coordinator hears one event twice (the wake delivery is wrong), the fix is in the delivery code where the
  cause is, with a repository test that makes the same sequence happen without relying on the machine's load (a test
  knob through `testKnob` (`src/config.ts`), a held lock as in R-095 (c), or an injected clock), in the delivery's own
  test file or a new one under `test/` that mirrors `src/` (T-29 (1)).
- When only the test fails (its matching or its timing), the test changes so that its assertion holds under any load
  and still checks one start notice and one finish wake per job, with a test or a fixture that shows the failing case
  deterministically before the change.
Either way, the deterministic test fails at `HEAD`.

(c) R-094's open point 5. `outcome.md` says whether the cause of (a) also explains the `wokeOnce` `1 !== 0`; when it
does, (b)'s fix and test cover it; when it does not, the point stays open for gate 5.2 with what (a) learned about it.

## Out of scope

- R-094's open points 2, 3, 4 and 6 (gate 5.2) and the hook's other reads (R-093's open points).
- The text of the wakes and the start queue's decisions, except where the cause sits in them.
- Renaming `test/s3-finish-wake.test.ts` (T-29 (6): the ticket that rewrites its module renames it).

## Acceptance

- AC-1: `node --test test/s3-finish-wake.test.ts` → exit 0.
- AC-2: `node --test test/u4-wake-claims.test.ts` → exit 0.
- AC-3: `node --test test/job/wake-delivery.test.ts` → exit 0.
- AC-4 (as D-069 sets it): `node adrian-rebuild/tools/fails-before.mjs test/fake-engine.test.ts` → exit 0, its output
  in `outcome.md` → `## Fails before`, which also names every new or changed test that passes at `HEAD`, with the
  reason.
- AC-5: `node adrian-rebuild/tools/gate.mjs` → exit 0.
- AC-6: `npx tsc --noEmit` → exit 0; `npx biome check --error-on-warnings .` → exit 0;
  `node adrian-rebuild/tools/check.mjs` → exit 0.
- AC-7 (judgment): `outcome.md` → `## Cause` names the job, the listener and the path of the extra wake, with the
  evidence of a failing run under load (the command, the number of runs, the failures, the records read), says whether
  a coordinator heard one event twice, and shows that (b)'s deterministic test makes that same sequence happen; the
  load run after the change, with the same command and number of runs, has no failure of the test; (c) is answered
  (the load evidence in D-069's form).
- AC-8 (D-068): `node --test test/runtime/start-queue.test.ts` → exit 0.
- AC-9 (D-069): `node --test test/fake-engine.test.ts` → exit 0.

## Migration

None expected. A fix that changes the shape of `notify/` or of `record.json` is a plan change: the implementer stops
with `BLOCKED`.

## Risk

- A delivery fix may trade an extra wake for a lost one, which is worse: a coordinator left idle. Every existing test
  of a wake heard once and of the retry after an unconfirmed wake keeps passing (AC-1–AC-3, AC-5).
- The reproduction is by chance; the deterministic test of (b) is the proof, the load runs are evidence only.

## Rollback

`git revert $(git log --format=%H --grep='^R-096:' adrian-rebuild --)`.

## Decisions

- 2026-11-21 D-067 (1) (Adrian): quoted in `## Problem`.
- 2026-11-21 D-068 (Adrian, "Zgodnie z rekomendacją"; Q-17, option 1): R-095's round-3 notes 2 and 3
  (`R-095-round-3-notes-r022-r094/review.md` → Round 3) join this ticket as two items, with AC-8 below:
  - (d) `waitFailure` (`test/runtime/start-queue.test.ts`) reports how a wait ended that did not reject (its
    resolved value, e.g. `"gone"`), not "the wait ended with undefined" (diagnosis only);
  - (e) the file's opening line names its third mechanism, a record check that fails (T-29 (5)).
  - AC-8 in `## Acceptance`.
- 2026-11-21 D-069 (Adrian, "zgodnie z rekomendacjami"; Q-18 on the implementer's `BLOCKED` of about 18:23):
  within (a)'s limit no run failed under load (6 gate runs, all 598/598, and 29 runs of the file beside them, 7/7
  each; two file runs denied by the permission classifier, not retried), and the implementer found the cause with a
  deterministic scratch test (3 of 3 fail at HEAD): `turn()` of `test/fake-engine.mjs` fires `agent_settled` after
  every turn, also while a follow-up is queued, so `confirmDeliveries` (`hook/wake.ts`) counts the wake unconfirmed,
  releases its claim, and the next sweep injects it again; Pi 1.5.1 drains follow-ups inside one run
  (`pi-agent-core` `agent-loop.js`, "Agent would stop here. Check for follow-up messages") and emits
  `agent_settled` once after the run (`pi-coding-agent` `agent-session.js`, `_emitAgentSettled`). Option 1:
  - (b) takes its second branch in this form: the fake engine emits one `agent_settled` per run, after the turns of
    every batch queued during the run, as Pi does; the delivery code does not change. A new
    `test/fake-engine.test.ts` (its subject is `test/fake-engine.mjs`, T-29 (1)) makes the sequence happen.
  - AC-4 runs as `node adrian-rebuild/tools/fails-before.mjs test/fake-engine.test.ts` → exit 0 (the form without
    paths copies the fixed fake engine over HEAD, so the new test would pass there).
  - AC-7: the load evidence is (a)'s runs with no failure, the 7 near misses and the deterministic test; the load
    runs are repeated after the change with the same commands, within the same limit; (c) is answered by the same
    mechanism.
  - AC-9 in `## Acceptance`.
- 2026-11-21 (main session, after review round 1): AC-4's form of D-069 and AC-8 and AC-9 move into `## Acceptance`,
  since `review-verdict.mjs` reads only that section; the reviewer had answered all three from this section.
- 2026-11-21 (main session, review round 1, `review.md` → Round 1; the first round of fixes, for the resumed
  `rebuild-implementer`):
  - Fix 1 (finding 1, T-18): the word "run" names only Pi's agent run in `test/fake-engine.mjs`; the header's "one
    transcript line per run in --session-dir" names what it means, one line per engine process.
  - Fix 2 (finding 2): `test/fake-engine.test.ts` releases the held turn with the async write that `release()` in
    `test/plant.ts` uses, so a FIFO with no reader cannot block the test process beyond its timeout.
