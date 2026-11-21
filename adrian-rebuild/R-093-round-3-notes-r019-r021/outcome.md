<!-- PL: Wynik R-093 (szkic implementera z poprawkami rundy 1, 21.11): jeden helper `hasCode` w nowym module
`src/system-error.ts` zastępuje cztery kopie (blokada, moduł rekordu, adapter Linux, a w rundzie 1 także `isExist`
w steer-inbox.ts), nagłówek modułu nie wymienia już wywołujących, test LOCK_LOST sprawdza klasę `environment` i kod
wyjścia 4, a komentarz wskazuje R-019. Migracja zostawia plik `born` folderu bez użytecznego `pid` i raportuje
`kept born: no usable pid`, także gdy rekord bierze tożsamość właściciela grupy. Hook czyści mapę uszkodzonych plików
na starcie sesji i kluczuje ją folderem joba; odczyty `progress.json` w linii statusu i w fali zakończenia idą przez
strażnika uszkodzeń, a fala advisory nie czyta już rekordu sama. W rundzie 1 pierwszy wiersz test/hook/wake.test.ts
mówi, co plik sprawdza (uszkodzone rekordy i pliki postępu, czyszczenie na starcie sesji), a wcześniejszy test
uszkodzonego rekordu używa helperów `hookProject` i `startCoordinator` zamiast własnej kopii ich przygotowania.
Podręcznik koordynatora bez „or no pid yet”, `writeRecord` i `editRecord` w test/plant.ts zapisują przez
`atomicWrite`; bramka po poprawkach rundy 1: 511/511 (także w przebiegu sesji głównej). Recenzja runda 2: PASS,
a jej jedyną uwagę (pełna lista kopii sprawdzenia kodu błędu w Open points) poprawiła sesja główna. Stan: zamknięty. -->

# R-093 outcome

## Done

1. One error-code helper (change 1): `hasCode(error, code)` lives once, exported from the new module
   `src/system-error.ts`, which imports nothing. Its three local copies are gone: `isCode` in `src/platform/linux.ts`
   (3 calls), `hasCode` in `src/lock.ts` (5 calls) and `hasCode` in `src/job/record.ts` (5 calls); each file imports
   the one helper. Why a new module: see `## Choices` 1.
2. `test/lock.test.ts`, the `LOCK_LOST` test (change 2): it asserts `[error.class, error.code,
   EXIT_CODES[error.class]]` equal to `["environment", "LOCK_LOST", 4]`, with a comment naming T-02.
3. `test/lock.test.ts`, the comment above the old-forms tests (change 3): "(R-019's Migration, D-056 (3))".
4. `src/job/migration.ts` (change 4): `OldValues.keep(name, why)` keeps a file that holds text no field takes;
   `identityOf` calls it for `born` when the folder has no usable `pid` (missing, empty, or not a pid), before it takes
   the group owner's identity or `null`. The folder's `born` file stays, and the report line gets `kept born: no
   usable pid`. A folder with a usable `pid` reads `born` as before (`kept born: not in clock ticks` for another text).
   An interrupted migration (`finishFolder`) keeps the file too, since it filters by the same `kept` notes.
5. `hook/wake.ts` (change 5): the module-level map `damaged` is keyed by the job folder (`damaged.set(job, …)`), and
   the `session_start` handler clears it next to `reportedDamage`, which now holds job folders too. `damagedRecords`
   is `damagedFiles`; its line names the job by its folder's name.
6. `hook/wake.ts` and `src/job/wake-text.ts` (change 6):
   - `progressOf(job)` reads `progress.json` through `undamaged`; `jobDisplay` (`lastTool`) and `pulseOf`
     (`activity`) use it, so a damaged file counts as no progress, the status line still shows every job, and the
     damage is named once.
   - `completionWake` takes an optional progress reader (default `readProgressSync`); the hook passes `progressOf`,
     so a damaged `progress.json` leaves out only the "produced nothing" fact, and the wake still goes.
     `src/integrations/coordinator-wake.ts` keeps the default.
   - `advisoryWake` takes the record its caller read (`record: JobRecord`) and ends with `jobEnding(job, record)`, so
     it reads no record of its own; the hook passes the record `sendAdvisory` read through `recordOf`.
   - The damage line reads `limen: a file of job <id> is damaged: <message>` (was "the record of job"), since the
     map now holds progress files too; the message starts with the file's path.
7. `templates/agents.md` (change 7): `starting` is "(spawn still preparing it)". `templates/.history/agents.md` starts
   with `00fa4649ecf14571a88325f007b7e6f5aefceed764134966df0efdb366a97558 2026-11-21`, the SHA-256 of the new file.
8. `test/plant.ts` (change 8): `writeRecord` and `editRecord` write `record.json` through `atomicWrite` of
   `src/atomic-write.ts`.

Tests added (7) or changed (2):

- `test/cli/migrate.test.ts`: "a born without a usable pid stays in its file, the record has no identity, and the
  report names it"; "a born without a usable pid stays in its file when the record takes the group owner's identity".
- `test/hook/wake.test.ts`: "a record repaired after the hook named its damage is not named again after a new session
  start" (change 5); "a damaged progress.json: the status line still shows every running job, and the hook names the
  damage once" (change 6); "a finished job whose progress.json is damaged still gets its completion wake, and the
  hook names the damage once" (change 6, the completion wake's read). Changed: the existing test "a damaged record
  before a finished job: …" expects the new wording of the damage line.
- `test/job/wake-text.test.ts`: "advisoryWake ends with the record its caller read, not with the job's record file".
- `test/plant.test.ts`: "a reader running while the plant writes record.json reads only whole records": a child
  process reads the record through `readRecordSync` in a loop while the test makes 300 writes, alternating
  `writeRecord` and `editRecord`; every read must take the record.
- `test/lock.test.ts`: the `LOCK_LOST` test (change 2).

## Round 1 fixes

The two fixes of `ticket.md` → `## Decisions` → "2026-11-21 (main session, review round 1; the first round of fixes,
for a fresh `rebuild-implementer`)": Fix 1 and Fix 6. The rest of the change stays as it was.

1. **Fix 1: the fourth copy of the error-code helper goes** (review note 1, T-25 (2)). `isExist` in
   `src/job/steer-inbox.ts`, a named copy of the helper's body with the code fixed to `EEXIST`, is gone;
   `enqueueSteer` calls `hasCode(error, "EEXIST")`, imported from `src/system-error.ts`. The header comment of
   `src/system-error.ts` no longer lists the modules that call it (T-30); it keeps only the reason why the helper lives
   in a module that imports nothing (the platform adapter cannot import `src/outcome.ts`, `## Choices` 1). The
   behaviour does not change, so no test is new: the check is the existing steering test of
   `test/s4-steering.test.ts`, "a running worker gets each steer once and in order; an ended one refuses a late steer
   and writes nothing", which runs `limen steer` and so `enqueueSteer` (`## Proof`). No test makes two writers take
   the same steer number, so the `EEXIST` branch itself runs in no test; that an exclusive write onto an existing file
   fails with the code `EEXIST` is checked by `test/atomic-write.test.ts` ("an exclusive atomicWrite onto an existing
   file fails with EEXIST and leaves the file and its folder as they were").
2. **Fix 6: the hook's test file says what it covers, and its earlier damaged-record test uses the file's helpers**
   (review note 6, T-29 (5)).
   - The first line of `test/hook/wake.test.ts` is one sentence on what the file tests: "hook/wake.ts: the guard on
     the `limen` command's arguments, nothing done before `limen migrate`, and damaged records and progress files,
     which stop no wake and no status line, are named once, and are forgotten at a session start."
   - The test "a damaged record before a finished job: the finished job's wake still comes, and the hook names the
     damage once" takes its project from `hookProject` and its hook from `startCoordinator`, instead of its own copy
     of their setup (the temporary folder, the environment, the fake `pi`, the session start). It reads the damage
     lines through `damageNotes` and waits for two more sweeps with `sweeps(coordinator, 2)` instead of a fixed
     1.2 s (`## Round 1 choices` 1). The helpers moved above it in the file; its fixtures (the damaged and the
     finished record, the subscriptions) are as before.

## Proof

### After the round-1 fixes

The implementer's runs after the round-1 fixes, from the repository root:

- `node adrian-rebuild/tools/gate.mjs` → exit 0; `tests 511`, `pass 511`, `fail 0`, `cancelled 0`, `skipped 0`,
  `duration_ms 100617` (the fixes add and remove no test). Its `npm run check` ran `tsc --noEmit` and `biome check
  --error-on-warnings .` ("Checked 213 files … No fixes applied.") before the tests.
- `npx tsc --noEmit` → exit 0.
- `npx biome check --error-on-warnings adrian-rebuild` → exit 0 ("Checked 32 files … No fixes applied.").
- `node adrian-rebuild/tools/check.mjs` → exit 0 ("… PL summaries: 157 files; ticket folders: 27; changes: 25
  entries; 0 errors"), run with this `outcome.md` and the ticket's `review.md` in place.
- Fix 1: `git grep -n --untracked -E 'function (hasCode|isCode|isExist)\(' -- src hook seat bin test` → one line,
  `src/system-error.ts:6`; `git grep -n --untracked isExist -- src hook seat bin test` → exit 1 (no match);
  `node --test test/s4-steering.test.ts` → exit 0, 4/4.
- Fix 6: `node --test test/hook/wake.test.ts` → exit 0, 6/6, in 6 of 6 runs (and in the gate). The rewritten test still checks its mechanism: on a
  copy of this tree in the OS temporary folder whose `damagedFiles` (`hook/wake.ts`) names every damaged file on
  every sweep (its filter by `reported` removed), `node --test --test-name-pattern="a damaged record before a finished
  job" test/hook/wake.test.ts` → exit 1, `fail 1`, `actual: 3`, `expected: 1`.
- AC-2, AC-3, AC-6 and AC-8 (the four `git grep` criteria) → exit 1 each (no match). The files of AC-1, AC-4, AC-5,
  AC-7 and AC-9 ran in the gate above, every test passing.

### The change before round 1

All from the repository root, on the tree before the round-1 fixes:

- `node adrian-rebuild/tools/gate.mjs` → exit 0; `tests 511`, `pass 511`, `fail 0`, `cancelled 0`, `skipped 0`,
  `duration_ms 101657` (504 at `HEAD` plus the 7 new tests).
- `npx tsc --noEmit` → exit 0.
- `npx biome check --error-on-warnings .` → exit 0 ("Checked 213 files … No fixes applied.").
- `npx biome check --error-on-warnings adrian-rebuild` → exit 0 ("Checked 32 files … No fixes applied.").
- `node adrian-rebuild/tools/check.mjs` → exit 0 ("… PL summaries: 156 files; ticket folders: 27; changes: 25
  entries; 0 errors"), run with this `outcome.md` in place.
- AC-1 `node --test test/lock.test.ts` → exit 0, 21/21.
- AC-2 `git grep -n 'function hasCode' -- src/lock.ts` → exit 1 (no match). Also `git grep -n --untracked -E
  'function (hasCode|isCode)\(' -- src hook seat bin test` → one line, `src/system-error.ts:6`.
- AC-3 `git grep -n "the ticket's Migration" -- test/lock.test.ts` → exit 1 (no match).
- AC-4 `node --test test/cli/migrate.test.ts` → exit 0, 20/20.
- AC-5 `node --test test/hook/wake.test.ts` → exit 0, 6/6; `node --test test/integrations/coordinator-wake.test.ts`
  → exit 0, 1/1.
- AC-6 `git grep -n 'or no pid yet' -- templates/agents.md` → exit 1 (no match).
- AC-7 `node --test test/plant.test.ts` → exit 0, 3/3; `node --test test/cli/stop.test.ts` → exit 0, 2/2, in 6 of 6
  runs (R-022's review round 2 saw its race test fail in 2 of 6 runs with `test/plant.ts` of `HEAD`). The new plant
  test alone (`--test-name-pattern="reads only whole records"`) → exit 0 in 5 of 5 runs, about 1.4 s each.
- AC-8 `git grep -n 'writeFile(join(dir, "record.json")' -- test/plant.ts` → exit 1 (no match).
- AC-9 `node --test test/structure.test.ts` → exit 0, 32/32.
- `node --test test/job/wake-text.test.ts` → exit 0, 2/2.
- Load order: `node --input-type=module -e "await import('./src/<module>')"` for `src/platform/linux.ts`,
  `src/platform/platform.ts`, `src/outcome.ts`, `src/lock.ts`, `src/job/record.ts`, `src/boundary.ts` and
  `src/system-error.ts` → each loads (`## Choices` 1).

## Fails before

### Round 1 fixes

Neither fix changes a mechanism, so neither has a test written before it:

- Fix 1 changes no behaviour: the same check of the error's code, now through the one helper. Its check is the
  existing steering test (`## Round 1 fixes` 1), which passes at `HEAD` and on this tree.
- Fix 6 changes only `test/hook/wake.test.ts`. `node adrian-rebuild/tools/fails-before.mjs test/hook/wake.test.ts`
  (`HEAD` `e106bf6`) → exit 0:

  ```
  fails-before: test/hook/wake.test.ts fail at HEAD (exit 1)
  ```

  Its tail names the last three failures, as before the fixes. The rewritten test alone, on a copy of `HEAD` in the
  OS temporary folder (`git archive HEAD`, this tree's `test/hook/wake.test.ts` over it, `node --test
  --test-name-pattern="a damaged record before a finished job" test/hook/wake.test.ts`) → exit 1, `fail 1`, only on
  the wording of the damage line, as before the fixes:

  ```
  AssertionError [ERR_ASSERTION]: The input did not match the regular expression /a file of job 2026-11-21-damaged-0001 is damaged: .*2026-11-21-damaged-0001\/record\.json: /. Input:
    actual: 'limen: the record of job 2026-11-21-damaged-0001 is damaged: …/.limen/jobs/2026-11-21-damaged-0001/record.json: id: expected a job ID, got nothing',
  ```

  Its count (one damage line after two more sweeps) holds at `HEAD`: the mechanism it checks predates this ticket.

### The change before round 1

`node adrian-rebuild/tools/fails-before.mjs` (implementer, after the gate; `HEAD` `e106bf6`) → exit 0:

```
fails-before: test/cli/migrate.test.ts, test/hook/wake.test.ts, test/job/wake-text.test.ts, test/lock.test.ts, test/plant.test.ts fail at HEAD (exit 1)
```

Its 40-line tail names only the last two failures ("a finished job whose progress.json is damaged …" and
"advisoryWake ends with the record its caller read …"), so each file was also run alone:

- `node adrian-rebuild/tools/fails-before.mjs test/cli/migrate.test.ts` → exit 0; `tests 20`, `pass 18`, `fail 2`:
  both new `born` tests, each on `Error: ENOENT: no such file or directory, open
  '…/.limen/jobs/2026-11-03-born-2b3c4d5e/born'` (and `…-3c4d5e6f/born`): `HEAD` removes the file.
- `node adrian-rebuild/tools/fails-before.mjs test/job/wake-text.test.ts` → exit 0; `tests 2`, `pass 1`, `fail 1`:
  `Error [LimenError]: …/record.json: expected JSON, got "{ not json\n"` with `code: 'BAD_DATA'`: at `HEAD`
  `advisoryWake` reads the record file itself.
- `node adrian-rebuild/tools/fails-before.mjs test/plant.test.ts` (this copies only the test file, so `HEAD`'s
  `test/plant.ts` writes) → exit 0 in 5 of 5 runs; the new test fails each time on `AssertionError [ERR_ASSERTION]:
  649 of 8453 reads failed` (then 1548 of 8883, 578 of 8417, 1491 of 8576, 555 of 8149), each listed error
  `…/record.json: expected JSON, got ""`, the error of the race test of `test/cli/stop.test.ts`.
- `node adrian-rebuild/tools/fails-before.mjs test/hook/wake.test.ts` → exit 0. Its tail shows only the last two
  failures, so the file also ran on a copy of `HEAD` in the OS temporary folder (`git archive HEAD`, this tree's
  `test/hook/wake.test.ts` over it, `node --test test/hook/wake.test.ts`) → exit 1, `fail 4` of 6:
  - "a damaged record before a finished job: …" (changed): only the wording, `'limen: the record of job
    2026-11-21-damaged-0001 is damaged: …'` against `/a file of job … is damaged: …/`. The mechanism it checks
    passes at `HEAD`.
  - "a record repaired after the hook named its damage …": `Expected values to be strictly deep-equal` with
    `actual` two lines in the new session, `'limen: the record of job 2026-11-21-repaired-0003 is damaged: …'` and
    the earlier test's `'limen: the record of job 2026-11-21-damaged-0001 is damaged: …'`, from another project's
    folder, against `[]`.
  - "a damaged progress.json: the status line still shows every running job, …": `the condition did not hold in
    time`: no status line `limen 2 · …` was set in 10 s, since the progress read threw out of every tick.
  - "a finished job whose progress.json is damaged still gets its completion wake, …": `the condition did not hold
    in time`: no wake was sent in 10 s.
- `node adrian-rebuild/tools/fails-before.mjs test/lock.test.ts` → exit 1 ("pass at HEAD"), `tests 21`, `pass 21`.

New or changed tests that pass at `HEAD`, and why:

- `test/lock.test.ts` → "LOCK_LOST: a release leaves a lock …": `HEAD` already throws `LOCK_LOST` with class
  `environment`; the change adds the assertion that T-02's Check asks for, not a mechanism. The comment of change 3
  is not a test.
- `test/plant.test.ts` → "a reader running while the plant writes record.json reads only whole records", in the run of
  `fails-before.mjs` without paths only: that run copies every changed file under `test/`, `test/plant.ts` (the fix)
  included, over `HEAD`. With the test file alone over `HEAD` it fails in 5 of 5 runs (above).

## Choices

Technical choices inside `## Change` that `taste.md` does not settle:

1. The owner of `hasCode` is a new module, `src/system-error.ts`, which imports nothing. Change 1 leaves the module
   to the implementer. Tried first: `src/outcome.ts` (Limen's error module, which the lock and the record module
   import already). Then loading `src/platform/linux.ts` first, as `test/platform/linux.test.ts` does, fails with
   `ReferenceError: Cannot access 'linux' before initialization` at `src/platform/platform.ts:62`: `linux.ts` →
   `outcome.ts` → `boundary.ts` → `job/job.ts` → `project/series.ts` → `lock.ts` → `platform.ts` → `linux.ts`, and
   `platform.ts` reads `linux` before `linux.ts` has run. `src/platform/platform.ts` as owner has the same cycle
   (`platform.ts` imports the value `linux`). The name `hasCode` is kept from the lock and record modules (10 calls
   against `isCode`'s 3).
2. The damage line says "a file of job <id>", since a damaged `progress.json` now goes through the same map; the
   message after it starts with the file's path, so the line names which file.
3. The advisory wake takes the record from its caller instead of a guard around the call: the hook already read that
   record through `recordOf`, so the second read goes and nothing is left to guard. `jobEnding` keeps its default read
   for its other callers.
4. The completion wake takes a progress reader as an optional last parameter; the hook passes `progressOf`.
   Alternatives: a field of `CompletionRoute` (which says how a wake travels, not how it reads) or a progress value
   (where `undefined` would mean both "none" and "not given").
5. `damaged` stays a module-level map, cleared in `session_start` next to `reportedDamage`, as the ticket says;
   alternative: move it into the hook's factory, which would need passing it to the module-level readers.
6. The reason text is `no usable pid`, in the form of the other `kept` reasons.
7. Test places by T-29: the hook's tests in `test/hook/wake.test.ts`, the unit test of `advisoryWake` in
   `test/job/wake-text.test.ts`, the migration's in `test/cli/migrate.test.ts`, the plant's in `test/plant.test.ts`.

## Round 1 choices

1. Fix 6: the earlier damaged-record test waits with `sweeps(coordinator, 2)` for the two more sweeps its comment
   names, instead of a fixed 1.2 s, and filters its notes with `damageNotes`. Both are helpers of the same file that
   the later tests use; a fixed wait counts no sweep, so under load it could end after fewer than two. Each status
   line the hook sets comes from a sweep (`updateStatus`), apart from the mute command and a watcher error, which the
   test does not cause. Alternative: keep the 1.2 s wait and use only the two helpers the decision names.
2. Fix 1: the header of `src/system-error.ts` keeps one reason, why the helper lives in a module that imports nothing,
   and names the platform adapter only as the subject of that reason. Alternative: drop the reason too, which would
   leave the new module's place unexplained (T-30: a comment says why).
3. Fix 6: the first line of `test/hook/wake.test.ts` is one sentence over two lines, as other test files open
   (`test/plant.test.ts`, `test/cli/stop.test.ts`); one line of 120 columns could not name its four subjects.

## Deviations from the ticket

- `src/job/record.ts` held a third copy of the helper (`hasCode`, from R-021), which the ticket's Problem does not
  name. Change 1 ("no local copy remains") and AC-13 ("one definition of the error-code helper") cover it, so it went
  too.
- `src/system-error.ts` is a new file that `## Change` does not name; Change 1 leaves the module to the implementer.
- "The advisory read": the ticket's Problem 6 names the `toolCalls` read of `jobProducedNothing` (in
  `completionWake`), while D-062 (6) and R-021's review round 3, note 4, name the advisory wake's record read
  (`src/job/wake-text.ts` lines 20 and 149 at `0e4e588`: `jobEnding`'s default read, called by `advisoryWake`). Both
  are changed: the advisory wake reads no record, and the completion wake's progress read goes through the guard.
  The test of the second is one more than Change 6 asks for, since it changes a mechanism.
- `test/job/wake-text.test.ts`, which AC-5 does not name, holds the unit test of `advisoryWake` (T-29).
- AC-13's "no test helper writes a job file non-atomically" is read within Change 8's scope (the plant's
  `writeRecord` and `editRecord`, D-054 (2) (a)): see `## Open points`.
- Fix 6 (round 1): the earlier damaged-record test also uses `damageNotes` and `sweeps`, two helpers of the file that
  the decision does not name (`## Round 1 choices` 1).

## Measurement

- unmeasured: the coordinator manual's size after change 7, four words fewer (M-01).
- The seat's folders with a `born` and no usable `pid`: the report of `## Deployment` 2.1 lists each `kept born`
  line; no M-NN applies.
- A damaged `progress.json` in a coordinator session on the seat: covered by the hook's tests on a fake `pi`; no
  M-NN applies.

## Open points

- Test helpers outside `test/plant.ts` still write job files with a plain `writeFile`, each before any reader runs:
  `recorded` in `test/job/record.test.ts`, `oldFolder` in `test/cli/migrate.test.ts` (files of the older record),
  and the damaged fixtures of `test/hook/wake.test.ts` and `test/job/reference.test.ts`, which must be raw text.
  Whether AC-13 asks for these too is for the main session; `ticket.md` → `## Decisions` (review round 1) settles
  that they are outside it.
- Inline copies of the same check stay outside the one helper: `whenAbsent` in `src/job/migration.ts:203`,
  `src/commands/watch.ts:101`, `seat/deploy.ts:344`, `src/platform/requirements.ts:38`, `miss` in
  `src/project/git.ts:346`, the code read of `src/project/git.ts:364`, the two-code check of
  `src/runtime/recovery.ts:26`, `errorCode` in `src/integrations/herdr.ts` (lines 35–42, used as `errorCode(error) ===
  "tab_not_found"`), and the checks of `.code` on an error typed as `NodeJS.ErrnoException` (a cast or a typed `catch`
  parameter). `git grep -n -E '"code" in [a-zA-Z]+' -- src hook seat bin` lists the nine `"code" in` sites, the
  helper's own among them (review round 2). The scan of T-25's later ticket is out of scope.
- The hook's tick still has reads that can throw for another reason than `BAD_DATA`: the `start-notice` read
  (`readFileSync` in the hook's `text`) and the `notify/` receipt reads of `src/job/wake-delivery.ts`; the listings
  of `.limen/jobs/` in the hook stay out of scope (R-022's open points).
