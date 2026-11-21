<!-- PL: Ticket R-095 (D-065, D-066): poprawki uwag z rund 3 recenzji R-022, R-094 i R-089. Raport `limen migrate`
mówi, że token wspólny dla joba w .limen/jobs/ i folderu w .limen/unmigrated/ wskazuje ten job; `keeper` usuwa
duplikaty po id joba; testy sprawdzają oba „gone” w `waitForStart`, który za brak uznaje tylko ENOENT; hook `after`
testu plant sygnalizuje przez platformę; `fileOf` rozwiązuje import jak Node. Stan: napisany 21.11 w dzień przy
drzewie R-023; gotowy (ready), także do nocy. -->

# R-095 The round-3 notes of R-022 and R-094: the shared-token report, `keeper`'s de-duplication, the record check

## Problem

Adrian's decisions, quoted from `plan.md` → `## Decisions`:

- D-065 (1): "Q-11 and Q-12, option 1 each: one fix ticket R-095, stage 2, size S, `delegated`, `night` (a night run
  may take it), depending on R-022 and R-094, before the tag `a0.2.0`. Its `ticket.md` is written at the HEAD it
  starts from, from this entry and the two `review.md` → Round 3. The changes: (a) R-022's note 1: the report of
  `limen migrate` and R-022's `## Migration` say what the resolver does with a token shared by a job in
  `.limen/jobs/` and a folder in `.limen/unmigrated/` (the token names the job; the unmigrated folder has no reference
  until R-031); (b) R-022's note 2: `keeper` de-duplicates by the resolved job id, so its comment "A job named twice
  is read once" holds, with a test of a job given by token and by its group; (c) R-094's note 1: an in-process test of
  the two "gone" checks of `waitForStart` after the poll's decision and after its record change (the test holds the
  job's lock with `withLock`); (d) R-094's note 2 (T-01): absence means `ENOENT` only, and any other error of the
  record check ends the wait as an environment failure with its cause in the log; (e) R-094's note 3: the plant
  test's `after` hook signals through `platform.signalProcess`."
- D-066: "R-089's round-3 notes 1 and A go to R-095 as item (f): `fileOf` (`test/final-line.test.ts`) resolves an
  import as Node's own resolver does (the path normalized, so `../src//outcome.ts` names `src/outcome.ts`; a `file:`
  URL by the URL rules, so one with no `//` names a path from the filesystem root), with a fixture case for each
  form, and its comment says what it does. R-095 keeps size S."

The review notes, quoted from the `review.md` files → Round 3:

- R-022, finding 3: "the migration reports a token shared by a job in `.limen/jobs/` and a folder in
  `.limen/unmigrated/` as one that only full ids name, as `## Migration` says, while `resolveJob` counts owners only
  among `.limen/jobs/`, so that job's token still resolves; no wrong job can be named (`src/job/migration.ts`,
  `src/job/reference.ts`)".
- R-022, finding 4: "the new comment in `src/commands/keeper.ts` says "A job named twice is read once", while the
  de-duplication is by word, so a job given by its token and as a member of `--group` is resolved twice (T-30)".
- R-094, finding 1: "the "gone" checks after the poll's decision and after its record change
  (`src/runtime/start-queue.ts`) have no repository test; both fixture tests act while the wait sleeps".
- R-094, finding 2: "T-01, `recordGone` uses `existsSync`, which reads any stat error as absence, so an `EACCES` or
  `EIO` ends the wrapper with exit 0, no log line and the cause lost".
- R-094, finding 3: "the new plant test's `after` hook signals with a bare `process.kill`, which throws on `ESRCH`
  and skips `cleanup` (`test/plant.test.ts`)".
- R-089, finding 1: "`fileOf` (`test/final-line.test.ts`) resolves a `file:` URL with no `//` against the test file,
  while Node resolves it from the filesystem root, so its comment is wrong for that form and such an import of an
  absolute path passes the scan"; finding A: "`fileOf` keeps an empty path segment, so `../src//outcome.ts` passes the
  scan while Node loads `src/outcome.ts` from it".

Facts at R-023's tree (`0546c7c`):

1. `tokenReport` (`src/job/migration.ts`) groups the folder names of `.limen/jobs/` and `.limen/unmigrated/` by token,
   and `reportLines` prints each group as "token … is shared by …: only their full ids name them"; `resolveJob`
   (`src/job/reference.ts`) counts a token's owners among `.limen/jobs/` only. `test/cli/migrate.test.ts` asserts the
   line for two folders of `.limen/jobs/`.
2. `finishedJobs` (`src/commands/keeper.ts`, a command with `movedBy`) keys its queries by `referenceWord(query)` and
   a group member by its id, then resolves each query.
3. `waitForStart` (`src/runtime/start-queue.ts`) checks `recordGone` before each poll, after the poll's decision and
   after the record change of a `queued` transition; `recordGone` is `!existsSync(recordPath(jobDir))`.
   `test/runtime/start-queue.test.ts` calls `waitForStart` in-process.
4. The `after` hook of "cleanup stops every wrapper the plant started …" (`test/plant.test.ts`) calls
   `process.kill(pid, "SIGKILL")`; `platform.signalProcess` (`src/platform/platform.ts`) returns a `SignalResult`.
5. `fileOf` (`test/final-line.test.ts`) is `new URL(module, pathToFileURL(file))` with the query and fragment cut;
   its comment says a `file:` URL resolves "against the file".

## Change

(a) The report of `limen migrate` (`src/job/migration.ts`) tells two kinds of shared tokens apart: a token shared by
folders of `.limen/jobs/` keeps its line ("only their full ids name them"); a token shared by one job of
`.limen/jobs/` and folders of `.limen/unmigrated/` gets a line saying that the token names that job and that the
unmigrated folders have no reference until R-031. A fixture test in `test/cli/migrate.test.ts`. The main session
corrects R-022's `## Migration` (`adrian-rebuild/R-022-exact-job-references/ticket.md`) with a dated line in this
ticket's commit.

(b) `keeper` (`src/commands/keeper.ts`) resolves each query first and reads each job once by its resolved id, so its
comment holds; a test in the new `test/cli/keeper.test.ts` names one job by its token and through its group and shows
that it is read once.

(c) In-process tests in `test/runtime/start-queue.test.ts` of the two "gone" checks of `waitForStart` after the poll's
decision and after its record change: the test holds the job's lock with `withLock` (`src/lock.ts`) while it removes
the record, so the wait meets the removal at that check; each fails when its check is taken out.

(d) `recordGone` reads absence as `ENOENT` only (through `hasCode`, `src/system-error.ts`); any other error of the
record check ends the wait as an environment failure (T-01) with its cause in the job's log, with a test. The
implementer picks the code by T-01's naming (a night default if a night run takes the ticket, D-054 (2)).

(e) The `after` hook of the plant test signals through `platform.signalProcess`.

(f) `fileOf` (`test/final-line.test.ts`) resolves a module path as Node's resolver does: a specifier that parses as a
URL on its own is read by the URL rules without the test file as base (a `file:` URL with no `//` names a path from
the filesystem root), any other relative or absolute path against the file, and the path is normalized (so
`../src//outcome.ts` names `src/outcome.ts`); the query and fragment stay cut. A fixture case for each of the two
forms; the comment says what the function does.

## Out of scope

- The archive of `.limen/unmigrated/` (R-031) and any change of the resolver's rule.
- The other inline error-code checks (the scan ticket of T-25) and the hook's other reads (R-093's open points).
- The extra wake of "a held gate queues jobs by priority …" (R-096).

## Acceptance

- AC-1: `node --test test/cli/migrate.test.ts` → exit 0 (a).
- AC-2: `node --test test/cli/keeper.test.ts` → exit 0 (b).
- AC-3: `node --test test/runtime/start-queue.test.ts` → exit 0 (c, d).
- AC-4: `node --test test/plant.test.ts` → exit 0 (e).
- AC-5: `node --test test/final-line.test.ts` → exit 0 (f).
- AC-6: `git grep -n 'process.kill' -- test/plant.test.ts` → exit 1 (one line at R-023's tree).
- AC-7: `git grep -n 'existsSync(recordPath' -- src/runtime/start-queue.ts` → exit 1 (one line at R-023's tree).
- AC-8: `node adrian-rebuild/tools/fails-before.mjs` → exit 0, its output in `outcome.md` → `## Fails before`, which
  names every new or changed test that passes at `HEAD`, with the reason.
- AC-9: `node adrian-rebuild/tools/gate.mjs` → exit 0.
- AC-10: `npx tsc --noEmit` → exit 0; `npx biome check --error-on-warnings .` → exit 0;
  `node adrian-rebuild/tools/check.mjs` → exit 0.
- AC-11 (judgment): the comments of `keeper`'s de-duplication and of `fileOf`, and the report line of (a), say what
  the code does (T-30).

## Migration

None: no on-disk format changes; the report of `limen migrate` gains one kind of line.

## Risk

- (d) turns an unreadable record from a quiet exit 0 into a failed job; the cause in the log is the point (T-01).
- (b) changes the order in which `keeper` reads its jobs only if the implementer reorders it; the order of the
  queries stays.

## Rollback

`git revert $(git log --format=%H --grep='^R-095:' adrian-rebuild --)`.

## Decisions

- 2026-11-21 D-065 (1) and D-066 (Adrian): quoted in `## Problem`.
- 2026-11-21 (main session, review round 1, `review.md` → Round 1, finding 4): the dry run's count of the folders
  it would move as unmigrated, with its fixture test, and the plant test's assertion after `cleanup` that no signal
  was `denied` are accepted additions to items (a) and (e).
- 2026-11-21 (main session, review round 1; the first round of fixes, for the resumed `rebuild-implementer`):
  - Fix 1 (finding 1, T-01): when `waitForStart` ends on `QUEUE_RECORD_UNREADABLE`, a failure of the log append in
    its cleanup (`leaveQueue`, `src/runtime/start-queue.ts`) does not replace that error: the wait still rejects with
    `QUEUE_RECORD_UNREADABLE` and its cause, as `releaseAfterFailure` (`src/lock.ts`) keeps an operation's error; a
    test shows it with a log that cannot be written, failing without the fix.
  - Fix 2 (finding 2): `docs/jobs.md`'s sentence on the tokens the migration report lists says that a token one job
    shares only with folders of `.limen/unmigrated/` names that job, and that the unmigrated folders have no reference
    until R-031.
- 2026-11-21 (main session, review round 2, `review.md` → Round 2; the second and last round of fixes, for the
  resumed `rebuild-implementer`):
  - Fix R2-1 (finding 1, T-30): the doc comment of `waitForStart` says where the cause of a failed record check is
    kept: in the job's log, or, when the log cannot take the line, in the error's message.
  - Fix R2-2 (finding 2, T-01): a failure of the queue entry's `rm` in the `finally` of `waitForStart` does not replace
    `QUEUE_RECORD_UNREADABLE` when the wait ends on it (the same rule as Fix 1); a test shows it with an entry that
    cannot be removed, failing without the fix. When the wait ends otherwise, the `rm` behaves as at HEAD.
  - Fix R2-3 (finding 3): `docs/jobs.md` → Start queue → "Stop and loss" says that a record the queue cannot check
    ends the job as an environment failure (`QUEUE_RECORD_UNREADABLE`), with its cause in the job's log.
