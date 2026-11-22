<!-- PL: Recenzje ticketu R-028 (TERM do wrappera dociera do silnika; sygnał bez prośby o stop to porażka). Runda 1
(noc 22/23.11): PASS z siedmioma uwagami. Do pierwszej rundy poprawek idą: test reguły `oom` sprawdzający tylko tę
regułę (T-29), wynik każdego sygnału z handlera zapisany w logu (T-01) i test „TERM nie rozbraja limitu” bez wyścigu
z limitem czasu (z. 17, T-31 (4)). Zapis prośby w `endJob`, zawężenie AC-9 do zakresu (a) i zostawione wyłączenia
T-27 przyjęte jako domyślne decyzje nocne albo bez zmiany. Runda 2: PASS; do drugiej i ostatniej rundy poprawek idą
wyścig późnego TERM po końcu silnika (G1) i linia z własnym końcem silnika dla kroku 3.8 (G2). Runda 3: PASS z
czterema uwagami (knob testowy `LIMEN_END_GATE`, okno między `exit` a `close`), bez zmiany kodu, jako otwarte punkty
bramki 5.3. Stan: recenzja zamknięta. -->

# R-028 review

## Round 1 (2026-11-22/23, night, run 1 of `night.mjs`, started 21:10)

- Before: the implementer's run → `review-guard.mjs compare --git` "within its limits", exit 0; the main session's
  `gate.mjs` → exit 0, 857 tests, 857 pass, 0 fail (tsc and Biome first, in `npm run check`); `fails-before.mjs` →
  exit 0 (four files fail at `HEAD` `ddea3ef`), recorded in `outcome.md` → `## Fails before` before the review.
- Reply: `rebuild-reviewer` with the ticket, `node_modules/.rebuild-review/R-028.diff` and `taste.md`;
  `review-guard.mjs compare` → "unchanged", exit 0; `review-verdict.mjs` → "consistent", exit 0.
- Verdict: **PASS**. AC-1–AC-9 met (AC-7 and AC-8 on the records); seven notes.

| # | Finding (short) | Decision |
|---|---|---|
| 1 | note · proven: the finalize test of the `oom` rule fails at `HEAD` for two reasons, the missing `killed by` pattern (kind `null`) and the missing rule (`reaped`); a `signal` detail that maps at `HEAD` (`process group interrupted`) would check the rule alone (`test/job/finalize.test.ts:105`) | fix (F1) |
| 2 | note · proven: the `done:` stop test fails at `HEAD` because the seam `signalled` does not exist there, so the stop's own finalize wins; its failure before does not show the old wrapper ending `stopped`, though on the tree it checks that mechanism (`test/cli/stop.test.ts:125`) | no change: the wrapper can win a stop's transition in a test only through that seam (`outcome.md` → Night default 8), which `HEAD` lacks, so no form of this test fails at `HEAD` on the old end alone; the mechanism is checked on the tree, and the first stop test (the request written, `stopped` with its reason) fails at `HEAD` on the request |
| 3 | note · guessed: the test that a TERM disarms no limit races a 5 s time limit, counted from the engine's start, against the test's wait for `block`; under the gate's load the limit could fire before the TERM, and the test waits about 5 s of real time (T-31 (4)) (`test/runtime/wrapper.test.ts:215`) | fix (F3): a test that can fail once under load stops a night (D-029, z. 17) |
| 4 | note · observed: the handler drops the results of the forwarded group TERM and of the engine's KILL, so a `denied` or `missing` result leaves only the "sending …" line (T-01); the exhaustion's TERM has the same pattern (`src/runtime/wrapper.ts:94`, `:104`, `:179`) | fix (F2), as R-027's F1 did for the reaper's signals |
| 5 | note · observed: two ends write `stopped` with no `stopRequested`, a stop of a `starting` job and a group's reserved slot; neither sends a signal, and (a) limits the request to jobs with a pid (`src/job/stopping.ts:82`, `src/job/group-control.ts:612-616`) | no change: AC-9's "`stopped` is written only where the record holds a stop request" is read within (a)'s scope, every job with a pid, which is every end by a signal (category A (a) of D-054 (2), a night default for Adrian to confirm); both ends are an open point for gate 5.3 |
| 6 | note · observed: (a) says "apply writes"; the request is written in `endJob`, through `transition` under the job's lock, since `apply` holds that lock and it is not re-entrant (`outcome.md` → Night default 1) | no change: a night default (category A (b)); `endJob` is the same operation's later steps (T-38 (3)), and a stop that finds the job ended sends no TERM |
| 7 | note · observed: `runInternalJob` changed but keeps its two "split pending" suppressions (T-27 (1)); R-020 set the precedent and the plan gives the ratchet to R-082 (`src/runtime/wrapper.ts:32-33`) | no change: R-082's ratchet |

Taste answers: T-29 yes for the wrapper tests, the first stop test and the record test, with findings 1 and 2; T-30
yes; T-40 no step waits for the owner.

Also recorded (the main session): the implementer ran `fails-before.mjs`, which `## Commands` lists for the main
session only; the run reads a temporary copy of `HEAD` and changed nothing that `compare --git` checks, and the main
session's own run is the one AC-6 counts.

Fixes (for a fresh implementer, `ticket.md` → `## Decisions`; the first round of fixes): F1–F3.

## Round 2 (2026-11-22/23, night, run 1 of `night.mjs`)

- The first round of fixes: a fresh implementer (`DONE`; F1–F3, F3 through the tool cap and the new fake-engine word
  `tools-on-term <n>`); `compare --git` → "within its limits", exit 0.
- Before: the main session's `gate.mjs` → exit 0, 857 tests, 857 pass, 0 fail; `fails-before.mjs` → exit 0 (the same
  four files), recorded in `outcome.md` → `## Fails before`.
- Reply: a fresh `rebuild-reviewer` with the three paths; `review-guard.mjs compare` → "unchanged", exit 0;
  `review-verdict.mjs` → "consistent", exit 0.
- Verdict: **PASS**. AC-1–AC-9 met (AC-7 and AC-8 on the records); five notes.

| # | Finding (short) | Decision |
|---|---|---|
| 1 | note · observed: a TERM that arrives after the engine exited by itself but before the wrapper decides the end sets `termed`, so an engine that exited 0 ends `failed: killed by SIGTERM` and its `result` is not written; and since `termed` is read after the record, a `limen stop` whose request write and TERM land during that read also ends `failed`; taking `termed` once when the outcome resolves, then reading the record, closes both (`src/runtime/wrapper.ts:368-386`) | fix (G1): a wrong terminal state and a lost result (priority 1); the stop case is new with this ticket, since the end now reads the record |
| 2 | note · observed: F2's `was gone` and `failed: not permitted` lines have no test, and the exhaustion's TERM still logs before its call and drops its result, a call line unchanged from `HEAD` (`src/runtime/wrapper.ts:175-178`, `:429-434`) | no change: F2 allows both as open points (the plant cannot make kill(2) refuse or miss), and `outcome.md` records them |
| 3 | note · observed: a TERM during the setup's prune step reaches no `--prepare`, which starts after it; the job then ends when the prepare ends or hits its own limit, as at `HEAD` (`src/runtime/job-setup.ts:30-41`) | no change: (b)'s "still ends the setup" holds as before; an open point for gate 5.3 |
| 4 | note · observed: seat step 3.8 expects "its log shows Pi's exit 143 within the grace", but the wrapper logs no exit code on a TERM end, only `killed by SIGTERM` (`adrian-rebuild/plan.md:1886-1888`, `src/runtime/wrapper.ts:385-388`) | fix (G2): the wrapper logs the engine's own end; the main session changed step 3.8's text to that line |
| 5 | note · observed: `runInternalJob` keeps its two `split pending` suppressions (T-27 (1)) | no change: round 1 finding 7 |

Taste answers: T-29 mostly yes (F1 and F3 hold; three wrapper tests fail at `HEAD` first on the missing forwarded TERM,
the shapes (g) and F3 prescribe; the `done:` stop test is round 1 finding 2); T-30 yes; T-40 no step waits for the
owner.

Fixes (for a fresh implementer, `ticket.md` → `## Decisions`; the second and last round of fixes): G1 and G2.

## Round 3 (2026-11-23, night, run 1 of `night.mjs`)

- The second round of fixes: a fresh implementer (`DONE`; G1 through the test knob `LIMEN_END_GATE`, a seam that holds
  the wrapper's end until a file exists; G2 with a third form `engine error: <message>`; the TERM's
  `shutdownDeadline` on every end of the engine); `compare --git` → "within its limits", exit 0.
- Before: the main session's `gate.mjs` → exit 0, 858 tests, 858 pass, 0 fail; `fails-before.mjs` → exit 0 (five
  files, `test/config.test.ts` added for the new knob), recorded in `outcome.md` → `## Fails before`.
- Reply: a fresh `rebuild-reviewer` with the three paths; `review-guard.mjs compare` → "unchanged", exit 0;
  `review-verdict.mjs` → "consistent", exit 0.
- Verdict: **PASS**. AC-1–AC-9 met (AC-7 and AC-8 on the records); four notes.

| # | Finding (short) | Decision |
|---|---|---|
| 1 | note · observed: the test knob `LIMEN_END_GATE` reaches a real job only if the spawner's environment holds it (nothing outside the tests sets it); if a shell exported it, every end that no limit exhausted would wait without bound after the engine's exit, a gate in a missing folder would end the job `failed` without its result, and `limen status` names no test knob (`src/runtime/wrapper.ts:466-476`, `src/config.ts:241-286`) | no change: both rounds of fixes are spent, and the exposure is that of every test knob (they all pass from the spawner's environment, `src/config.ts`); G1 needed a seam, since the wrapper runs in its own process (D-029's pattern); an open point for gate 5.3 (a bound on the wait, or a `limen status` warning for a set test knob) |
| 2 | note · guessed: G1 takes the TERM's flag in the engine's `close` handler, which Node emits after `exit` once its stdio pipes close; a TERM between the two still counts and ends `failed` with no result; taking it on `exit` would close that window (`src/runtime/wrapper.ts:265-268`) | no change: G1's wording is met; a guessed window narrower than the one G1 closed; an open point for gate 5.3 |
| 3 | note · observed: a stop whose request write lands after the end's read of the record ends as the engine's exit decides, with `stopRequested` left in a `done` or `failed` record; this fits A-019 and is in `outcome.md` → Open points | no change: the engine finished first (A-019) |
| 4 | note · observed: `runInternalJob` keeps its two `split pending` suppressions (T-27 (1)) | no change: round 1 finding 7 |

Taste answers: T-29 yes, with the known exceptions (the G1 test fails at `HEAD` on the missing gate line, the seam case
of round 1 finding 2); T-30 yes; T-40 no step waits for the owner (the gate waits only with the test knob set).

The review is closed: PASS in rounds 1–3, two rounds of fixes.
