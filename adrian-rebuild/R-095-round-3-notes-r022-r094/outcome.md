<!-- PL: Wynik R-095 (21.11, w dzień, po dwóch rundach poprawek): raport `limen
migrate` mówi, że token wspólny dla jednego joba z .limen/jobs/ i folderów z .limen/unmigrated/ wskazuje ten job, a te
foldery nie mają referencji do R-031 (także w --dry-run i w docs/jobs.md); `keeper` czyta każdy job raz, po
rozwiązanym id; `recordGone` uznaje za brak tylko ENOENT, a inny błąd kończy czekanie błędem QUEUE_RECORD_UNREADABLE
z przyczyną w logu joba, którego nie zastępuje ani nieudany zapis logu, ani nieudane usunięcie wpisu kolejki (oba
trafiają do komunikatu); dwa testy w procesie trzymają blokadę joba (i kolejki) i pokazują oba sprawdzenia „gone”;
hook `after` testu plant sygnalizuje przez `platform.signalProcess`; `fileOf` rozwiązuje import jak Node. Bramka
598/598. Stan: zamknięty; runda 3 recenzji PASS, jej uwagę o dokumentacji poprawiła sesja główna, a dwie uwagi
o testach czekają na pytanie Q-17. -->

# R-095 outcome

## Done

(a) The report of `limen migrate` tells the two kinds of shared tokens apart (`src/job/migration.ts`).
- `tokenReport` takes the folders of `.limen/jobs/` and of `.limen/unmigrated/` apart. It still groups every folder by
  the hex characters that end its id, but a group of an 8-hex token with exactly one folder in `.limen/jobs/` and the
  rest in `.limen/unmigrated/` goes to the new field `unmigratedShares` of `MigrationReport`; every other group keeps
  `collisions` and its line. The resolver (`src/job/reference.ts`) counts a token's owners among `.limen/jobs/` only,
  so that token names the job.
- `reportLines` prints each such token as `token 1a2b3c4d names job <job id>; it also ends <folder ids> in
  .limen/unmigrated/, which no reference names until R-031`. The line of a token that several folders of
  `.limen/jobs/` share is unchanged: `token … is shared by …: only their full ids name them`.
- `migrateProject` builds the two lists as the run leaves the folders: a folder the run moves, or with `--dry-run`
  would move, counts only below `.limen/unmigrated/`, so a dry run prints the same token lines as the real run.
- `test/cli/migrate.test.ts`: two fixture tests on a done job and a folder without a state that share the token
  `1a2b3c4d`, one for `limen migrate` and one for `limen migrate --dry-run`; both assert the new line.
- R-022's `## Migration` was corrected by the main session before this run (a reserved path); this run did not touch
  it.

(b) `keeper` reads each job once by its resolved id (`src/commands/keeper.ts`).
- `finishedJobs` lists the queries in their order (the `--job` words, then the group's members), resolves each one,
  and skips a resolved id it already read, so a job named by its token and as a member of `--group` stands once in
  the keeper's task and counts once among the jobs that need one `--candidate`. The order of the queries stays, and
  each job is still resolved, read and checked for a live owner in that order. `referenceWord` is no longer imported
  here.
- `test/cli/keeper.test.ts` (new): a done job with a branch and no process identity, and a group record that names it
  as a member; `limen keeper <ticket> --job 1a2b3c4d --group g1 --candidate <branch>` starts a keeper whose `task.md`
  holds one `Job: <id>` line. `--candidate` is given, so the test fails for the double read alone and not for the
  candidate rule.

(c) Tests of the two "gone" checks of `waitForStart` after the poll's decision and after its record change
(`test/runtime/start-queue.test.ts`, in-process). Both hold the job's lock with `withLock` while they remove the
record; both also use the queue's lock (`## Choices` 1).
- Helpers: `queuedJob` (the seat, the reading, the queued record; `whileQueued` now builds on it), and `withLocksHeld`,
  which takes the job's lock, then the queue's lock, starts the wait, runs a step with both held and a step with the
  job's lock alone, and returns how the wait ended once both are released.
- After the decision: the gate is open (80 % CPU idle), so the wait's decision ends in `groupLock` on the queue's lock,
  which the test holds. The test waits for the `reading` file (written after the poll's first record check), removes
  the record, releases the queue's lock, and reads the wait's end while it still holds the job's lock. Under the
  queue's lock the wait finds its entry's record gone and loses the start; the check after the decision returns
  `"gone"`. Without that check the wait goes on to its record change and waits for the job's lock, so the test reads
  `"still waiting"`.
- After the record change: the same start, but under the queue's lock the test damages the job's own queue entry, so
  the wait removes it there, loses the start and goes on to record its place, where it waits for the job's lock. The
  test waits for the entry's removal (the wait holds the queue's lock), takes the queue's lock again (the wait has
  left its decision and the check after it), removes the record, and releases both locks. The check after the change
  returns `"gone"` and nothing is written into the folder; without it the wait writes its `queued:` line into `log`.

(d) `recordGone` reads absence as `ENOENT` only (`src/runtime/start-queue.ts`).
- The check is `recordGoneAt(jobDir, checked)`: `statSync` of the record; `ENOENT` (through `hasCode`,
  `src/system-error.ts`) is absence; any other error is a `LimenError` of class `environment` (exit 4), code
  `QUEUE_RECORD_UNREADABLE`, `next` null, message `the record <path> cannot be checked, so the queued job does not
  start: <cause>`, with the system error as `cause`. It is noted in `checked` and thrown, so the wait ends with it.
- `leaveQueue` (the wait's `finally`, split out to keep `waitForStart` within the complexity limit) removes the entry
  as before; after a failed check it skips the `queued: null` change, which would read the record that could not be
  read and replace the cause with its own error. The log line of the failure is written by `loggedFailure` (round 1,
  Fix 1, below), which round 2 replaced with `failureAfterCleanup` (Fix R2-2).
- `test/runtime/start-queue.test.ts`: "QUEUE_RECORD_UNREADABLE: …" replaces the queued job's record with a symbolic
  link to itself in one synchronous step, so the next check fails with `ELOOP`; it asserts the rejection (class
  `environment`, the code) and the log line with `ELOOP`. `whileQueued` now settles the wait in its `finally` instead
  of awaiting it, since a test may expect a rejection; each test still reads the wait's end in its own check.

(e) The plant test's `after` hook signals through `platform.signalProcess` (`test/plant.test.ts`). A process that
exits after the check is `missing` and needs no signal, so `cleanup` still runs; a `denied` signal is collected and
fails the test after `cleanup` has run.

(f) `fileOf` (`test/final-line.test.ts`) resolves a module path as Node's resolver does: a path that starts with `/`,
`./` or `../` against the file; any other specifier that parses as a URL on its own (`URL.canParse`) by the URL rules
alone, so `file:<path with no //>` names a path from the filesystem root; the query and the fragment are cut; and the
path is normalized (`path.normalize`), so `../src//outcome.ts` names `src/outcome.ts`. Its comment says this. Two
fixture cases in `REFUSED`: `../src//outcome.ts`, and `file:` followed by the absolute path of `src/outcome.ts`
without its leading `/` (built from `OUTCOME` at run time, so no path of this machine is in the file). Node's own
resolution of both forms was checked in the OS temporary folder (`node` on a module that imports
`file:<root path without />/target.mjs` and `..//target.mjs`: both load `…/target.mjs`).

## Round 1 fixes

`review.md` → Round 1, findings 1 and 2; `ticket.md` → `## Decisions` (Fix 1 and Fix 2).

1. Fix 1 (finding 1, T-01): a log that cannot take the failure's line no longer replaces `QUEUE_RECORD_UNREADABLE`
   (`src/runtime/start-queue.ts`).
   - Before, `leaveQueue` appended the line in the wait's `finally` with no guard, so a failed append (a job folder
     without search permission, or a `log` that is not a file) threw its raw system error from the `finally`, and that
     error replaced the check's failure: the class, the code and the cause were lost.
   - Now `waitForStart` catches the check's own failure (the object noted in `checked.failure`; every other error
     passes through unchanged) and throws what `loggedFailure` returns. `loggedFailure` appends `start queue:
     <message>` to the job's log and returns the same failure. When the append fails, it returns a `LimenError` with
     the same class, code, `next` and `cause` (the system error of the check) whose message ends with `; the job's log
     could not take this line either: <the append's error>`. So, as `releaseAfterFailure` (`src/lock.ts`) keeps an
     operation's error, the wait still rejects with `QUEUE_RECORD_UNREADABLE` and its cause, and the append's error
     is not lost either (T-01). `leaveQueue` no longer writes to the log.
   - To keep `waitForStart` within the cognitive-complexity limit of 25, its poll loop moved, unchanged, into
     `pollQueue(entry, since, stop, checked)`. `waitForStart` reads the record, builds the entry, and holds the
     `try`/`catch`/`finally`. The initial `readRecord` stays outside the `try`, as before.
   - `test/runtime/start-queue.test.ts`, the new test "QUEUE_RECORD_UNREADABLE: a queued job whose record check fails
     ends its wait with that failure also when its log cannot take the line": in one synchronous step it replaces the
     record with a link to itself (the check fails with `ELOOP`) and the `log` file with a folder (the append fails
     with `EISDIR`). It asserts that the wait rejects with a `LimenError` of class `environment`, code
     `QUEUE_RECORD_UNREADABLE`, a cause with the code `ELOOP`, and a message that names the `EISDIR` of the log.
   - Because the loop moved, both mutation runs of (c) were repeated on this tree: without the check after the
     decision, its test fails with `still waiting` (1 of 1 runs); without the check after the record change, its test
     fails with `files: [ 'log' ]` (5 of 5 runs); each time the other test passes.
2. Fix 2 (finding 2): `docs/jobs.md` → the migration paragraph says that the report lists every token two ids share,
   that a token one job shares only with folders of `.limen/unmigrated/` still names that job and those folders have
   no reference until R-031, and that the jobs of every other shared token, and of an older id, are named by their
   full id.

## Round 2 fixes

`review.md` → Round 2, findings 1–3; `ticket.md` → `## Decisions` → "review round 2" (Fix R2-1–R2-3). All in
`src/runtime/start-queue.ts` and `docs/jobs.md`, with one new test.

1. Fix R2-1 (finding 1, T-30): the doc comment of `waitForStart` now says that a record check that fails for another
   reason than absence ends the wait with that failure, and that its cause is kept in the job's log, or, when the log
   cannot take the line, in the failure's message, which then names that error too.
2. Fix R2-2 (finding 2, T-01): a failed removal of the queue entry no longer replaces `QUEUE_RECORD_UNREADABLE`.
   - Before, `leaveQueue` in the wait's `finally` removed the entry with no guard, also after a failed check, so an
     error other than `ENOENT` (`EACCES` on the queue's `entries/`, or an entry that is a folder) replaced the
     check's failure.
   - Now the cleanup after a failed check is one function, `failureAfterCleanup` (it replaces round 1's
     `loggedFailure`). It removes the entry, then appends the failure's line to the job's log; `stepError` runs each
     step and turns its error into a phrase. When both steps succeed it returns the check's own failure. When a step
     fails it returns a `LimenError` with the same class, code, `next` and cause, whose message adds `its queue entry
     could not be removed either: <error>` and/or `the job's log could not take this line either: <error>`. So the
     wait still rejects with `QUEUE_RECORD_UNREADABLE` and its cause, and no step's error is lost.
   - `leaveQueue` returns at once after a failed check: the check's failure is thrown the moment it is noted, so the
     wait ends on it and `failureAfterCleanup` has cleaned up. On every other end the removal is the unguarded
     `rm(…, { force: true })` of `HEAD`, followed by the `queued: null` change unless the record is gone.
   - `test/runtime/start-queue.test.ts`, the new test "QUEUE_RECORD_UNREADABLE: a queued job whose record check fails
     ends its wait with that failure also when its queue entry cannot be removed": in one synchronous step it makes the
     record a link to itself (`ELOOP`) and replaces the queue entry with a folder, which `rm` without recursion refuses
     (`ERR_FS_EISDIR`). It asserts a `LimenError` of class `environment`, code `QUEUE_RECORD_UNREADABLE`, a cause with
     the code `ELOOP`, and `its queue entry could not be removed either: ` in the message. The three
     `QUEUE_RECORD_UNREADABLE` tests now share the helpers `breakRecord`, `waitFailure`, `failureFacts` and
     `CHECK_FAILED`; their assertions are unchanged.
3. Fix R2-3 (finding 3, T-19): `docs/jobs.md` → Start queue → "Stop and loss" now has a sentence for a queued job whose
   record the queue cannot check (an error other than a missing file, such as no permission). It says that the job
   ends as an environment failure, `QUEUE_RECORD_UNREADABLE`: the wrapper leaves the queue, no engine starts, and the
   job's log holds the cause. When the log cannot take that line either, the failure's message names both errors.

## Review round 3 (the main session's fix, D-053 (2))

Round 3 was PASS; its finding 1 showed that no reader sees the class or the code of `QUEUE_RECORD_UNREADABLE` (the
log line holds the message, the wrapper finalizes with the message, and its stdio is ignored). The main session made
the sentence of `docs/jobs.md` → "Stop and loss" say what a reader sees: the wait ends, the wrapper leaves the queue
and exits 1, no engine starts, and the job's log holds the cause in a `start queue:` line when the log can take it.
The gap itself is open point 4. After the edit, the tests that read `docs/`: `node --test test/help.test.ts` → exit 0
(10/10), `node --test test/structure.test.ts` → exit 0 (40/40), `node --test test/config.test.ts` → exit 0 (11/11).

## Proof

All from the repository root, on this tree (HEAD `0546c7c` plus this change).

After the round 2 fixes:

- `node adrian-rebuild/tools/gate.mjs` → exit 0; tests 598, suites 0, pass 598, fail 0, cancelled 0, skipped 0,
  todo 0 (duration 112,446 ms). One run, no failure.
- AC-3 `node --test test/runtime/start-queue.test.ts` → exit 0; tests 11, pass 11, fail 0 (three runs, 11/11 each).
- `npx tsc --noEmit` → exit 0; `npx biome check --error-on-warnings .` → exit 0 ("Checked 239 files … No fixes
  applied."); `node adrian-rebuild/tools/check.mjs` → exit 0 ("… PL summaries: 168 files; ticket folders: 30;
  changes: 29 entries; 0 errors"); `npx biome check --error-on-warnings adrian-rebuild` → exit 0 ("Checked 32 files
  … No fixes applied.").
- AC-8 `node adrian-rebuild/tools/fails-before.mjs` → exit 0, the same line as before the fixes (`## Fails before`).

After the round 1 fixes:

- `node adrian-rebuild/tools/gate.mjs` → exit 0; tests 597, suites 0, pass 597, fail 0, cancelled 0, skipped 0,
  todo 0 (duration 114,269 ms). One run, no failure.
- AC-3 `node --test test/runtime/start-queue.test.ts` → exit 0; tests 10, pass 10, fail 0 (four runs, 10/10 each).
- `npx tsc --noEmit` → exit 0; `npx biome check --error-on-warnings .` → exit 0 ("Checked 239 files … No fixes
  applied."); `node adrian-rebuild/tools/check.mjs` → exit 0 ("… PL summaries: 168 files; ticket folders: 30;
  changes: 29 entries; 0 errors"); `npx biome check --error-on-warnings adrian-rebuild` → exit 0.
- AC-8 `node adrian-rebuild/tools/fails-before.mjs` → exit 0, the same line as before the fixes (`## Fails before`).

Before the round 1 fixes:

- AC-1 `node --test test/cli/migrate.test.ts` → exit 0; tests 22, pass 22, fail 0.
- AC-2 `node --test test/cli/keeper.test.ts` → exit 0; tests 1, pass 1, fail 0.
- AC-3 `node --test test/runtime/start-queue.test.ts` → exit 0; tests 9, pass 9, fail 0 (also five runs in a row,
  9/9 each).
- AC-4 `node --test test/plant.test.ts` → exit 0; tests 4, pass 4, fail 0.
- AC-5 `node --test test/final-line.test.ts` → exit 0; tests 35, pass 35, fail 0.
- AC-6 `git grep -n 'process.kill' -- test/plant.test.ts` → exit 1, no output.
- AC-7 `git grep -n 'existsSync(recordPath' -- src/runtime/start-queue.ts` → exit 1, no output.
- AC-8 `node adrian-rebuild/tools/fails-before.mjs` → exit 0 (`## Fails before`).
- AC-9 `node adrian-rebuild/tools/gate.mjs` → exit 0; tests 596, suites 0, pass 596, fail 0, cancelled 0, skipped 0,
  todo 0 (duration 113,628 ms). One run, no failure.
- AC-10 `npx tsc --noEmit` → exit 0; `npx biome check --error-on-warnings .` → exit 0 ("Checked 239 files … No fixes
  applied."), both also inside the gate; `node adrian-rebuild/tools/check.mjs` → exit 0 ("… PL summaries: 167 files;
  ticket folders: 30; changes: 29 entries; 0 errors").
- `npx biome check --error-on-warnings adrian-rebuild` → exit 0 ("Checked 32 files … No fixes applied.").

The mutation runs of (c): each check taken out of `src/runtime/start-queue.ts` by hand, the two tests run, the check
put back (the file is unchanged against this tree, `git diff` reviewed).

- Without the check after the decision: `node --test --test-name-pattern='record goes while'
  test/runtime/start-queue.test.ts` → exit 1; "a job whose record goes while its wait decides …" fails after 5,070 ms
  with `actual: { outcome: 'still waiting', files: [] }`, `expected: { outcome: 'gone', files: [] }`; the other test
  passes. Run once on `HEAD`'s code and once on this tree's.
- Without the check after the record change: the same command → exit 1; "a job whose record goes while its wait's
  record change waits for the job's lock …" fails with `actual: { outcome: 'gone', files: [ 'log' ] }`, `expected:
  { outcome: 'gone', files: [] }`; the other test passes. 6 of 6 runs on `HEAD`'s code and 10 of 10 on this tree's
  failed so.

## Fails before

The main session's run after the second round of fixes (AC-8, AC-9, 2026-11-21): `node adrian-rebuild/tools/gate.mjs`
→ exit 0, 598 tests, 598 pass, 0 fail, 0 cancelled; `review-guard.mjs compare --git` → exit 0;
`node adrian-rebuild/tools/fails-before.mjs` → exit 0, the same five files.

The main session's run after the first round of fixes (AC-8, AC-9, 2026-11-21): `node adrian-rebuild/tools/gate.mjs`
→ exit 0, 597 tests, 597 pass, 0 fail, 0 cancelled; `review-guard.mjs compare --git` → exit 0;
`node adrian-rebuild/tools/fails-before.mjs` → exit 0, the same five files.

The main session's earlier run (AC-8, 2026-11-21, after its gate `node adrian-rebuild/tools/gate.mjs` → exit 0, 596 tests,
596 pass, 0 fail, 0 cancelled; `review-guard.mjs compare --git` → exit 0): `node adrian-rebuild/tools/fails-before.mjs`
→ exit 0, the same line as below. The tool's line names the files of one run at `HEAD` that exits 1, not each file
failing on its own; the tests that pass at `HEAD` are named below with their reasons.

The implementer's run: `node adrian-rebuild/tools/fails-before.mjs` (`HEAD` `0546c7c`) → exit 0:

```
fails-before: test/cli/migrate.test.ts, test/final-line.test.ts, test/plant.test.ts, test/runtime/start-queue.test.ts, test/cli/keeper.test.ts fail at HEAD (exit 1)
```

Its 40-line tail names the last two failures: "--dry-run reports a token one job would share only with folders of
.limen/unmigrated/ as the run does" (the old `token 1a2b3c4d is shared by …` line) and "QUEUE_RECORD_UNREADABLE: …"
(`Missing expected rejection.`). Each file alone:

- `node adrian-rebuild/tools/fails-before.mjs test/cli/migrate.test.ts` → exit 0: both new tests fail, each on the
  old line `token 1a2b3c4d is shared by 2026-11-16-done-1a2b3c4d, 2026-11-16-orphan-1a2b3c4d: only their full ids
  name them`.
- `node adrian-rebuild/tools/fails-before.mjs test/cli/keeper.test.ts` → exit 0; tests 1, fail 1: the task holds
  `Job: 2026-11-21-f001-demo-1a2b3c4d` twice.
- `node adrian-rebuild/tools/fails-before.mjs test/runtime/start-queue.test.ts` → exit 0; tests 9, pass 8, fail 1:
  "QUEUE_RECORD_UNREADABLE: …" with `Missing expected rejection.` (`existsSync` read `ELOOP` as absence and the wait
  ended `"gone"`).

New or changed tests that pass at `HEAD`, with the reason:

- `test/runtime/start-queue.test.ts`, the two tests of (c): they cover checks that `HEAD` already has (R-094). That
  each fails when its check is taken out is shown by the mutation runs in `## Proof`. The two older tests of the file
  changed only through the helpers (`queuedJob`, the `finally` of `whileQueued`) and pass at `HEAD` as before.
- `test/plant.test.ts`, "cleanup stops every wrapper the plant started …": (e) changes only its `after` hook, which
  signals a wrapper that `cleanup` missed; no run of the test reaches the `ESRCH` it fixes without a forced race. Its
  check is AC-6. `node adrian-rebuild/tools/fails-before.mjs test/plant.test.ts` → exit 1 ("pass at HEAD"; tests 4,
  pass 4).
- `test/final-line.test.ts`, the two new fixture cases of (f): `fileOf` is in the test file, so `fails-before.mjs`
  copies the fixed function with them and they pass (`node adrian-rebuild/tools/fails-before.mjs
  test/final-line.test.ts` → exit 1; tests 35, pass 35). Before `fileOf` was changed, the same file with the two cases
  added and `HEAD`'s `fileOf` → `node --test test/final-line.test.ts` exit 1; tests 35, pass 33, fail 2:

  ```
  ✖ D-046 (3): the scan of test files refuses a named import whose path has an empty segment, which reaches the readers of src/outcome.ts
  ✖ D-046 (3): the scan of test files refuses a named import of a file: URL with no //, which names a path from the filesystem root, which reaches the readers of src/outcome.ts
  ```

  (The second case's name was then shortened to "… of a file: URL with no // that names src/outcome.ts from the
  filesystem root …"; its source is unchanged.)

The first runs before the change, on `HEAD`'s source with this tree's tests:

- `node --test --test-name-pattern='names that job' test/cli/migrate.test.ts` → exit 1; fail 1: the report holds
  `token 1a2b3c4d is shared by 2026-11-16-done-1a2b3c4d, 2026-11-16-orphan-1a2b3c4d: only their full ids name them`.
- `node --test test/cli/keeper.test.ts` → exit 1; fail 1: `actual: [ 'Job: 2026-11-21-f001-demo-1a2b3c4d', 'Job:
  2026-11-21-f001-demo-1a2b3c4d' ]`.
- `node --test test/runtime/start-queue.test.ts` → exit 1; tests 9, pass 8, fail 1: "QUEUE_RECORD_UNREADABLE: …",
  `Missing expected rejection.`

### Round 1 fixes

- Fix 1, its test written first and run on this tree before the fix (`leaveQueue` still appended the line with no
  guard): `node --test --test-name-pattern='log cannot take the line' test/runtime/start-queue.test.ts` → exit 1;
  tests 1, pass 0, fail 1:

  ```
  ✖ QUEUE_RECORD_UNREADABLE: a queued job whose record check fails ends its wait with that failure also when its log cannot take the line (68.528994ms)
    AssertionError [ERR_ASSERTION]: the wait ended with Error: EISDIR: illegal operation on a directory, open '/tmp/limen-start-gate-egWZjA/repo/.limen/jobs/2026-11-21-queued-1a2b3c4d/log'
  ```

  After the fix the same command → exit 0, pass 1.
- `node adrian-rebuild/tools/fails-before.mjs test/runtime/start-queue.test.ts` (`HEAD` `0546c7c`) → exit 0; tests 10,
  pass 8, fail 2: both `QUEUE_RECORD_UNREADABLE` tests (at `HEAD` the check reads `ELOOP` as absence, so the wait
  ends `"gone"`).
- `node adrian-rebuild/tools/fails-before.mjs` → exit 0:

  ```
  fails-before: test/cli/migrate.test.ts, test/final-line.test.ts, test/plant.test.ts, test/runtime/start-queue.test.ts, test/cli/keeper.test.ts fail at HEAD (exit 1)
  ```

- Fix 2 changes only `docs/jobs.md`, which no test reads.

### Round 2 fixes

- Fix R2-2, its test written first and run on this tree before the fix (`leaveQueue` still removed the entry with no
  guard after a failed check): `node --test test/runtime/start-queue.test.ts` → exit 1; tests 11, pass 10, fail 1:

  ```
  ✖ QUEUE_RECORD_UNREADABLE: a queued job whose record check fails ends its wait with that failure also when its queue entry cannot be removed (47.046784ms)
    AssertionError [ERR_ASSERTION]: the wait ended with SystemError [ERR_FS_EISDIR]: Path is a directory: rm returned EISDIR (is a directory) /tmp/limen-start-gate-MOy4GL/.limen/start-queue/entries/2026-11-21-queued-1a2b3c4d.json
  ```

  After the fix the same command → exit 0; tests 11, pass 11.
- `node adrian-rebuild/tools/fails-before.mjs test/runtime/start-queue.test.ts` (`HEAD` `0546c7c`) → exit 0; its tail
  names the two newest `QUEUE_RECORD_UNREADABLE` tests failing (at `HEAD` the check reads `ELOOP` as absence, so the
  wait ends `"gone"`).
- `node adrian-rebuild/tools/fails-before.mjs` → exit 0:

  ```
  fails-before: test/cli/migrate.test.ts, test/final-line.test.ts, test/plant.test.ts, test/runtime/start-queue.test.ts, test/cli/keeper.test.ts fail at HEAD (exit 1)
  ```

- Fix R2-1 changes a comment and Fix R2-3 only `docs/jobs.md`; no test reads either.

## Choices

Technical choices inside `## Change` that `taste.md` does not settle (night-style defaults, D-054 (2) (b), for the main
session to confirm):

1. (c) also uses the queue's lock. Holding the job's lock alone cannot reach the check after the decision: `decide`
   takes no job lock, and a decision that does not start goes on to the record change, whose check meets the same
   removal, so taking the check out changes nothing a test can see. The queue's lock stops the wait inside its
   decision (in `groupLock`, gate open), and the job's lock, held to the end, is what makes a wait without the check
   unable to end. For the check after the record change, the test must remove the record after the check of the
   decision; the queue's lock, taken again after the wait released it, is that signal: from that release to the
   record change the wait does no file operation, and taking the lock takes this test several. A different order in
   one run would only let a mutant pass, never fail the test on the real code: if the record went before the check of
   the decision, that check ends the wait with the same result.
2. (d): the code is `QUEUE_RECORD_UNREADABLE` (an area prefix and what failed, as `LOCK_TIMEOUT`, `NOT_MIGRATED`),
   class `environment` (T-02: the file system), `next` null (no Limen command repairs a file system). The check stays
   synchronous (`statSync`), as `existsSync` was, so no check gives the event loop a turn between the decision and
   the record change. `stat` follows a symbolic link as `existsSync` did, so a dangling link still reads as absent.
3. (d)'s test uses `ELOOP` (a record that links to itself): it needs no permissions, holds also for root, and leaves
   the folder writable, so the log line can be asserted. With `EACCES` on the folder no log line can be written; that
   case is Fix 1's, whose test makes the log a folder instead (`EISDIR`), for the same reasons.
4. (a)'s line wording: `token T names job J; it also ends F in .limen/unmigrated/, which no reference names until
   R-031` (one form for one or several folders).
5. (a): the dry run counts the folders it would move below `.limen/unmigrated/`, so its token lines match the real
   run's; without it the dry run printed the old line for the same fixture (checked by taking the filter out: the
   dry-run test failed with the folder listed twice).
6. Fix 1: where `releaseAfterFailure` drops the release's error, `loggedFailure` keeps the append's error in the
   message of the failure it returns, since T-01 lets no error vanish; the failure keeps its class, code, `next` and
   cause, so its callers see `QUEUE_RECORD_UNREADABLE` either way. It is a new `LimenError` only when the append
   failed; otherwise the wait rejects with the check's own object. (Round 2 keeps this rule in `failureAfterCleanup`.)
7. Fix R2-2: the removal of the entry and the log line after a failed check are one cleanup with one rule (the
   failure keeps its class, code and cause; each failed step joins its message), in `failureAfterCleanup`, rather than
   a guard in `leaveQueue` beside round 1's in the `catch`; `leaveQueue` keeps `HEAD`'s unguarded removal for every
   other end of the wait, as the decision asks. The entry goes before the log line, so the line is the same whether
   or not the removal failed.

## Deviations from the ticket

- (a) gained a second fixture test, for `--dry-run` (`## Choices` 5); the ticket names one. Accepted in review round 1
  (`ticket.md` → `## Decisions`).
- (c) uses the queue's lock besides the job's lock (`## Choices` 1).
- The plant test asserts after `cleanup` that no signal was `denied` (item (e)). Accepted in review round 1.
- Round 1: `waitForStart`'s poll loop moved, unchanged, into `pollQueue`, for the complexity limit (`## Round 1
  fixes` 1).
- None else. R-022's `ticket.md` was not touched (the main session's correction).

## Measurement

Nothing here is `unmeasured`: every change is checked by a test or a criterion in the repository.

## Open points

1. The token lines of the other mixed cases keep today's wording: a token shared by two or more jobs and a folder of
   `.limen/unmigrated/`, or only by folders of `.limen/unmigrated/`, still reads "only their full ids name them",
   which is not true of the unmigrated folders (no reference names them). The `older id … : only its full id names it`
   line has the same gap for an older id below `.limen/unmigrated/`. `## Migration` of the ticket says the report gains
   one kind of line, so they stay for R-031.
2. After a `QUEUE_RECORD_UNREADABLE`, the wrapper's own handler (`failInternalJob` → `finalizeJob`) still tries to end
   the job and needs the same record; with an unreadable record that fails too, as before this ticket. The job's log
   holds the cause (this ticket); the end of such a job is the reaper's and outside the scope.
3. `fileOf` normalizes the path but does not resolve symbolic links, which Node's resolver does (`realpath`); a link
   to `src/outcome.ts` inside `test/` would pass the scan. No such link exists.
4. (Review round 3, finding 1.) The class and the code of `QUEUE_RECORD_UNREADABLE` reach no reader: the log line
   holds the message (`src/runtime/start-queue.ts`), `failInternalJob` finalizes with the message
   (`src/runtime/wrapper.ts`), and `failureFrom` gives such a detail the kind `null` (`src/job/record.ts`); for the
   typed errors of R-082.
