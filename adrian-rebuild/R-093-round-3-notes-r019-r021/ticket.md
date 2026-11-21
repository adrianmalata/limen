<!-- PL: Ticket R-093: poprawki uwag z rund 3 recenzji R-019 i R-021 (D-062) oraz zapis rekordu w helperze testów
(D-063 (1)): jeden helper kodu błędu zamiast kopii w src/lock.ts, test LOCK_LOST sprawdza też klasę, komentarz wskazuje
R-019; migracja zachowuje `born` bez użytecznego `pid`; hook czyści mapę uszkodzonych rekordów na starcie sesji
i chroni odczyty `progress.json`; podręcznik koordynatora bez „or no pid yet”; `writeRecord` i `editRecord`
w test/plant.ts zapisują atomowo. Stan: napisany 21.11 w dzień (autopilot D-063 (4)) przy drzewie po R-022; gotowy
(delegated). -->

# R-093 The round-3 notes of R-019 and R-021: the migration keeps `born`, guarded hook reads

## Problem

R-019 and R-021 closed with review PASS in round 3, after the protocol's two rounds of fixes; seven proven notes of
those rounds were left (`adrian-rebuild/R-019-one-lock-module/review.md` → Round 3, notes 1–3;
`adrian-rebuild/R-021-one-record-per-job/review.md` → Round 3, notes 1, 3, 4, 5). R-022's review round 2 found one
more, in R-021's test helper. Adrian's decisions, quoted from `plan.md` → `## Decisions`:

- D-062: "the three round-3 notes of R-019's review and the four of R-021's get one fix ticket, R-093, stage 2, size
  S, `delegated`, `night` … It is done before the tag `a0.2.0`, because `## Deployment` 2.1 runs R-021's migration on
  the seat." Its items (1)–(7) are the changes 1–7 below.
- D-063 (1): "R-093 gets item (8): the test plant's `writeRecord` and `editRecord` (`test/plant.ts`) write
  `record.json` through the atomic-write module, with a test that a read during the plant's write never sees a
  partial file. The race test of `test/cli/stop.test.ts` … passes then. R-093 runs right after R-022, before R-089
  and R-023."

The facts at R-022's tree:

1. `hasCode(error, code)` in `src/lock.ts` (defined near the end of the file, used five times) has the body of
   `isCode(error, code)` in `src/platform/linux.ts` (also local to its module). T-25 (2): a pure helper that a second
   module needs lives once, in the module that owns it.
2. The test "LOCK_LOST: a release leaves a lock that no longer holds the holder's token, and fails the call"
   (`test/lock.test.ts`) asserts `error.code === "LOCK_LOST"` but not the class `environment` (exit 4), which T-02's
   Check asks of a failure path.
3. The comment above the old-forms tests of `test/lock.test.ts` says "(the ticket's Migration, D-056 (3))", which
   names no ticket once committed (T-30 (2)).
4. In `src/job/migration.ts`, `identityOf` reads `born` through `values.field`, which consumes the file; when the
   folder has no usable `pid`, the identity comes from the group owner or is `null`, so a valid `born` is dropped and
   its file removed with no `kept born` line, against the module's rule that a value its field cannot hold keeps its
   file and is reported (`kept born: …`, as for a `born` not in clock ticks). Before R-021, `finalizeJob` removed
   `pid` before `born`, so finished folders of this shape exist on the seat.
5. `hook/wake.ts`: the module-level map `damaged` (job id → message) only grows; `reportedDamage` is cleared at a
   session start, so the next `damagedRecords` call reports again every record the process ever found damaged, a
   repaired one too; and it is keyed by the bare job id rather than the job folder.
6. `hook/wake.ts`: `jobDisplay` (the `lastTool` read for the status line) and `pulseOf` (the `activity` read) call
   `readProgressSync` on every tick outside `undamaged`, so one damaged `progress.json` throws out of the tick, stops
   the status line and hides the damage report (wakes still come); the advisory read of `src/job/wake-text.ts`
   (`readProgressSync(job)?.toolCalls` in its `producedNothing` caller) is unguarded too.
7. `templates/agents.md`, the pulse list: "`starting` (spawn still preparing it, or no pid yet)", while a running
   record without a pid now shows `unknown` (R-021).
8. `test/plant.ts`: `writeRecord` and `editRecord` write `record.json` with a plain `writeFile`, so a reader can see an
   empty or cut file; the race test "a stop that read a starting job, whose wrapper then won the race to running, …"
   of `test/cli/stop.test.ts` reads it through `finalizeJob` while the test rewrites it, and failed in two of six runs
   in R-022's review round 2 (`BAD_DATA … expected JSON, got ""`; `Unterminated string in JSON`). Production writes
   go through `src/atomic-write.ts` only (R-018), so the defect is the helper's.

## Change

1. One error-code helper: `isCode` and `hasCode` become one exported function in the module that owns it (the
   implementer picks the module; `src/platform/` imports nothing from `src/lock.ts`, so the adapter or a module both
   can import is the likely owner); both callers use it; no local copy remains.
2. `test/lock.test.ts`: the `LOCK_LOST` test also asserts the class `environment` (and so exit 4).
3. `test/lock.test.ts`: the comment names "R-019's Migration" instead of "the ticket's Migration".
4. `src/job/migration.ts`: a `born` that no identity of the record takes (no usable `pid`) keeps its file and the
   report gets a `kept born: <why>` line; a fixture test in `test/cli/migrate.test.ts` of a finished folder with `born`
   and no usable `pid`, with and without a group owner.
5. `hook/wake.ts`: the damaged map is keyed by the job folder and cleared together with `reportedDamage` at a session
   start; a test that a repaired record is not reported again after a new session start.
6. `hook/wake.ts` and `src/job/wake-text.ts`: the per-tick `readProgressSync` reads of `jobDisplay` and `pulseOf`, and
   the advisory read, go through the damage guard (a damaged `progress.json` gives the reader's "none" value and one
   damage line); a test with one damaged `progress.json` in which the status line still shows the other jobs and the
   damage is reported once.
7. `templates/agents.md`: "or no pid yet" removed from `starting`; `templates/.history/agents.md` gets its new first
   line, as `test/structure.test.ts` requires.
8. `test/plant.ts`: `writeRecord` and `editRecord` write `record.json` through `atomicWrite` of `src/atomic-write.ts`;
   a test in `test/plant.test.ts` that a reader running during a plant write never reads a partial `record.json`.

## Out of scope

- The listings of `.limen/jobs/` outside `src/job/record.ts` (`hook/wake.ts`, `src/job/wake-delivery.ts`,
  `seat/deploy.ts`; R-022's `outcome.md` → Open points).
- A queued wrapper that never ends when its job folder is gone, and the 2 s budget of the queue test: R-094.
- R-022's round-3 notes 3 and 4 (`.night/questions.md` → Q-11) unless Adrian's answer adds them here before this
  ticket starts; then they are recorded in `## Decisions`.
- A duplicate-function-name scan (T-25's later ticket).

## Acceptance

- AC-1: `node --test test/lock.test.ts` → exit 0 (the `LOCK_LOST` test asserts the class).
- AC-2: `git grep -n 'function hasCode' -- src/lock.ts` → exit 1 (no match).
- AC-3: `git grep -n "the ticket's Migration" -- test/lock.test.ts` → exit 1 (no match).
- AC-4: `node --test test/cli/migrate.test.ts` → exit 0 (the `born` fixtures of change 4).
- AC-5: `node --test test/hook/wake.test.ts` → exit 0; `node --test test/integrations/coordinator-wake.test.ts` →
  exit 0 (the tests of changes 5 and 6, in whichever of the two files the implementer puts them, T-29).
- AC-6: `git grep -n 'or no pid yet' -- templates/agents.md` → exit 1 (no match).
- AC-7: `node --test test/plant.test.ts` → exit 0; `node --test test/cli/stop.test.ts` → exit 0.
- AC-8: `git grep -n 'writeFile(join(dir, "record.json")' -- test/plant.ts` → exit 1 (no match).
- AC-9: `node --test test/structure.test.ts` → exit 0 (the template history and the scans).
- AC-10: `node adrian-rebuild/tools/fails-before.mjs` → exit 0, its output in `outcome.md` → `## Fails before`, which
  names every new or changed test that passes at `HEAD`, with the reason.
- AC-11: `node adrian-rebuild/tools/gate.mjs` → exit 0.
- AC-12: `npx tsc --noEmit` → exit 0; `npx biome check --error-on-warnings .` → exit 0;
  `node adrian-rebuild/tools/check.mjs` → exit 0.
- AC-13 (judgment): one definition of the error-code helper; a `born` the record cannot hold is kept and reported; no
  per-tick read of a job file in the hook can throw out of the tick; no test helper writes a job file non-atomically.

## Migration

None: no format on disk changes. Change 4 changes what `limen migrate` keeps; it has not run on the seat yet
(`## Deployment` 2.1 runs it after `a0.2.0`), so no migrated project needs a fix.

## Risk

- Change 4 keeps more files in migrated folders; the report names each, as for any value its field cannot hold.
- Change 6 hides nothing: a damaged `progress.json` is reported once per session instead of stopping the tick.

## Rollback

`git revert $(git log --format=%H --grep='^R-093:' adrian-rebuild --)`.

## Decisions

- 2026-11-21 D-062 and D-063 (1) (Adrian): quoted in `## Problem`.
