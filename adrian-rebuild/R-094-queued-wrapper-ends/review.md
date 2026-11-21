<!-- PL: Recenzje ticketu R-094 (wrapper w kolejce kończy się, gdy znika folder joba; sprzątanie plant zatrzymuje
wrappery; budżet testu kolejki niezależny od obciążenia). Runda 1 (21.11, autopilot D-063 (4)): PASS z ośmioma
uwagami; pięć idzie do poprawki przez świeżego implementera (test prawdziwego wrappera, forma testu odporna na
obciążenie, ponowne skanowanie procesów, jedna kopia sprawdzenia procesu, nazwa testu), odchylenie od linii Risk jest
przyjęte w ticket.md, a dwie uwagi nie są poprawiane tutaj (z powodem). Runda 2: PASS z trzema uwagami, wszystkie
w drugiej i ostatniej rundzie poprawek (folder odtworzony przez blokadę, `platform.signalProcess`, docs/jobs.md).
Runda 3: PASS z czterema uwagami; streszczenie tego pliku poprawiła sesja główna, trzy uwagi o kodzie i testach
czekają na pytanie Q-12. Stan: zamknięta. -->

# R-094 review

## Round 1 (2026-11-21, by day, autopilot of D-063 (4))

- Before: `review-guard.mjs compare --git` after the implementer → "the implementer's run is within its limits",
  exit 0; the main session's `gate.mjs` → 513/513, fail 0; `fails-before.mjs` → "test/plant.test.ts,
  test/runtime/start-queue.test.ts, test/s3-finish-wake.test.ts fail at HEAD (exit 1)", 15 pass and 1 fail (the
  folder test, `outcome: 'still waiting'`), recorded in `outcome.md` before the review.
- Reviewer: `rebuild-reviewer` with the ticket, `node_modules/.rebuild-review/R-094.diff` and `taste.md`;
  `review-guard.mjs compare` → "unchanged", exit 0; `review-verdict.mjs` → "consistent", exit 0.
- Verdict: **PASS**. AC-1–AC-7 met.

| # | Finding (short) | Decision |
|---|---|---|
| 1 | note · proven: no repository test covers the wrapper's own "gone" branch (`src/runtime/wrapper.ts`); the fixture calls `waitForStart` in-process, and only a scratch script showed a real wrapper exit | fix: the branch that keeps setup and the engine from running is the change's point (D-063 (3)) |
| 2 | note · observed: change 3 still rests on a wall-clock budget (5 s against a measured worst run of 0.96 s), while the one real overrun's cause is unknown; a form that load cannot break exists: an engine that blocks until its timeout ends it, with the end at least the timeout after the engine start | fix: D-063 (3) asks that the budget not depend on the machine's load, and load can only lengthen that interval |
| 3 | note · proven: `stopProcesses` (`test/plant.ts`) reads `/proc` once, so a process forked after the scan is missed unless its command line holds the plant path | fix: scan again until no process of the plant is left |
| 4 | note · proven: T-25, `processExited` in `test/plant.ts` is one more copy of the `/proc` stat zombie check, while `platform.processInfo` gives `absent` for a gone or zombie process | fix |
| 5 | note · proven: T-27 (1), `runInternalJob` keeps its two "split pending" suppressions | rejected by precedent: R-082 and R-083 handle the ratchet (`R-093-round-3-notes-r019-r021/review.md`, finding 4) |
| 6 | note · proven: the fixture test's name says "within a few polls", while its bound is 250 polls (5 s) | fix: the name says what the test shows, or the bound is the few polls the name claims |
| 7 | note · proven: two races inside one poll remain: a removal between the folder check and `transition` lets the lock's `mkdir` recreate an empty job folder; a removal between the start decision and the check writes `last-start` for a job that never starts (one settle interval of delay for the next job) | not fixed here: no Limen command removes a queued job's folder (`ticket.md` → `## Out of scope` covers a moved one), the window is one poll, and the effects are an empty folder or one settle interval; `src/lock.ts` is outside the ticket's change; both stay in `outcome.md` → Open points for gate 5.2 |
| 8 | note · observed: cleanup kills every process that carries the plant's `LIMEN_HOME`, not only wrappers "by what the plant recorded", as the ticket's Risk line says | accepted: the boundary is one plant (an exact environment entry on a fresh temporary path), which is what the Risk line protects; recorded in `ticket.md` → `## Decisions` |

Fixes (for a fresh implementer, `ticket.md` → `## Decisions`; the first round of fixes): 1, 2, 3, 4 and 6. They change
tests and test helpers, so they get a round (D-053 (2)).

## Round 2 (2026-11-21, by day, autopilot of D-063 (4))

- Before: the fresh implementer's run of fixes 1, 2, 3, 4 and 6 → `review-guard.mjs compare --git` "within its
  limits", exit 0; the main session's `gate.mjs` → 514/514, fail 0; `fails-before.mjs` printed "fails-before:
  test/plant.test.ts, test/runtime/start-queue.test.ts, test/s3-finish-wake.test.ts, test/runtime/wrapper.test.ts
  fail at HEAD (exit 1)", recorded in `outcome.md` before the review.
- Reviewer: `rebuild-reviewer` with the ticket, `node_modules/.rebuild-review/R-094.diff` and `taste.md`;
  `review-guard.mjs compare` → "unchanged", exit 0; `review-verdict.mjs` → "consistent", exit 0.
- Verdict: **PASS**. AC-1–AC-7 met.

| # | Finding (short) | Decision |
|---|---|---|
| 1 | note · observed: round 1's race 1 goes further: when the folder is removed between `transition`'s existence check and the lock's `mkdir`, the folder is created again, the folder check stays false, and the wrapper polls until killed (the D-063 symptom), writing `log` into the recreated folder | fix: the wait also ends as "gone" when the job's record is gone, so a folder the lock recreated cannot keep the wrapper alive |
| 2 | note · proven: T-25, `kill` in `test/plant.ts` copies the platform's signal policy, while `platform.signalProcess` maps `ESRCH` and `EPERM` | fix |
| 3 | note · observed: `docs/jobs.md` → "Stop and loss" does not say that a queued job whose folder is removed ends at its next poll and leaves no terminal record | fix (with the round, since 1 and 2 change code) |

Fixes (for a fresh implementer, `ticket.md` → `## Decisions`; the second and last round of fixes): 1, 2 and 3. Fixes 1
and 2 change code and a test helper, so they get a round (D-053 (2)).

## Round 3 (2026-11-21, by day, autopilot of D-063 (4))

- Before: the round-2 implementer's run of fixes R2-1–R2-3 → `review-guard.mjs compare --git` "within its limits",
  exit 0; the main session's `gate.mjs` → 515/515, fail 0; `fails-before.mjs` printed "fails-before:
  test/plant.test.ts, test/runtime/start-queue.test.ts, test/s3-finish-wake.test.ts, test/runtime/wrapper.test.ts
  fail at HEAD (exit 1)", recorded in `outcome.md` before the review.
- Reviewer: `rebuild-reviewer` with the ticket, `node_modules/.rebuild-review/R-094.diff` and `taste.md`;
  `review-guard.mjs compare` → "unchanged", exit 0; `review-verdict.mjs` → "consistent", exit 0.
- Verdict: **PASS**. AC-1–AC-7 met.

| # | Finding (short) | Decision |
|---|---|---|
| 1 | note · observed: the "gone" checks after the poll's decision and after its record change (`src/runtime/start-queue.ts`) have no repository test; both fixture tests act while the wait sleeps | not fixed here: the two rounds of fixes are used; `.night/questions.md` → Q-12 |
| 2 | note · observed: T-01, `recordGone` uses `existsSync`, which reads any stat error as absence, so an `EACCES` or `EIO` ends the wrapper with exit 0, no log line and the cause lost | not fixed here: Q-12 |
| 3 | note · observed: the new plant test's `after` hook signals with a bare `process.kill`, which throws on `ESRCH` and skips `cleanup` (`test/plant.test.ts`) | not fixed here: Q-12 |
| 4 | note · proven: the Polish summary of this file still said that round 2 was waiting | fixed by the main session (D-053 (2)) |

The review is closed: round 3 is PASS, its one finding on `review.md` is fixed, and the three on code and tests wait
for Adrian's answer to Q-12; no ticket is blocked.
