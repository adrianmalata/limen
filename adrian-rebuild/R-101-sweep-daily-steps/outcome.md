<!-- PL: Wynik R-101 (szkic implementera, noc 24/25.11, dokończony po przerwanym przebiegu z drzewa roboczego, potem
rundy poprawek 1 i 2): prune, retire i zamykanie pozostawionych kart Herdr to dzienne kroki `limen seat sweep`, raz na
dobę na projekt, ze znacznikiem `.limen/daily-sweep` zapisywanym tylko po udanym przebiegu; `limen prune` i `limen
close` kończą się kodem 2 z `next: limen seat sweep`. Nic, czego Git nie trzyma gdzie indziej, nie jest kasowane, a
folder archiwum bez rekordu lub ze `starting` nie blokuje już ponownego `github review`/`work` (F1) i nie wchodzi do
liczb `limen stats` (G2). Runda 1 dodała też escapowanie linii prune i retire, pominięcie znikniętego `.publishing-*`,
retire bez czekania na blokadę joba i błędy nazwane raz na projekt; runda 2 escapuje też linie zamykania kart (G1) i
poprawia `CONTRIBUTING.md` (G3). Bramka: 1178/1178; recenzja PASS w rundach 2 i 3, punkty otwarte 3–7 na bramkę 5.3
i dla R-103. Stan: zamknięty. -->

# R-101 outcome

## Done

- **(a) Daily steps in `sweepProject`** (`src/runtime/sweeping.ts`). After the minute steps, `dailySteps` runs when
  `dailyDue` finds the project's `.limen/daily-sweep` absent, unreadable as a time, at least 24 h old, or in the future
  (a clock set back). It runs prune, retire and the close of leftover tabs in that order, each whether or not an earlier
  one failed (as the minute steps do), prints their lines, and only when all three succeed writes the stamp atomically
  (`atomicWrite`, the bare ISO time) and prints `ran the daily steps of <root>`. A failed step is named
  `<root> (daily <step>)` and writes no stamp, so the next minute tries again. A manual `limen seat sweep` runs the same
  code. `sweeping.ts` is the one importer of `pruneFinishedWorktrees` and `retireMarkedJobs` in `src/`, `hook/` and
  `seat/` (land and abandon keep using `deleteLandedBranches`, `removalBlock`, `removeWorktree`, `removeTrash`).
- **(b) Prune** (`src/runtime/pruning.ts`).
  - Removes, as before, a clean worktree no job keeps and (through land and retire) a landed branch.
  - Moves, never deletes: a record that never started whose spawner is gone, a folder of `.limen/jobs/` with no record,
    and `.limen/.publishing-<id>` past the 10-minute grace with its spawner gone, each to
    `.limen/archive/<YYYY-MM>/<id>/` (month of `startedAt`, else of the move), under the jobs lock with a read again,
    and each under the folder's own lock (`moveLockedFolder`, new in `src/lock.ts`); a publication also under the
    worktree lock. Line: `archived <path> to <folder> (job <id>): <reason>`, its paths and name escaped (round 1, F3).
  - A folder of the worktree root that Git does not register and that holds no `.git` moves to
    `.limen/archive/unregistered/<name>-<ISO time with : and . as ->/` (`unregisteredArchive` in `src/job/record.ts`,
    Decision 3); `archivedJobs` skips it, since its name is no month. A folder already gone since the listing is skipped.
  - `jobKeeps` keeps a terminal job's worktree while its scope holds processes (`scopeHolds`, split out of
    `holdsProcesses` in `src/runtime/reap.ts`, T-25).
  - `unsavedGitlink` (`src/project/git.ts`, every caller): a gitlink counts only where a nested `.git` is there; a
    checkout whose `HEAD` tree cannot be read (no commit) fails with `GIT_FAILED` naming the worktree; `-z` entries are
    split only at their first tab (`zEntries`).
  - The setup prune is gone: `pruneForJob` and its call in `src/runtime/job-setup.ts`; `LIMEN_SETUP_KEEP` is replaced
    by `LIMEN_SETUP` (value `1`, kind `transport`, reader `wrapper`, set only by spawn in `src/job/spawning.ts`, read by
    `src/runtime/wrapper.ts` and `setUpJob`), Decision 7. `keepPaths` and `plannedLandedBranches` (the dry run) went.
- **(c) Retire** (`src/runtime/retiring.ts`): takes a job whose `landed` or `abandoned` marker is at least 24 h old
  (`RETIRE_AFTER_MS`), under the jobs lock and, through `moveLockedFolder`, the job's own lock, taken with one attempt
  (round 1, F5), the marker read again under it; `dryRun` went with the command. **Poller**
  (`src/integrations/github-poller.ts`, `finishedEvidence`): when the read of `result` or `log` comes back empty, it
  looks the job up once more (in the archive too) and reads it where that finds it, and the reply names the job as last
  found.
- **(d) Leftover tabs** (`src/integrations/herdr.ts`, `closeLeftoverTabs`): for every finished job whose named features
  are all closed (`closedJobFeatures`), each recorded tab (`herdr/`, `herdr/diff/`) that Herdr's `tab get` lists with the
  job's label (equal, or followed by ` · `) closes through `closeJobTab` (10 s bound, one retry), which now returns
  whether the tab closed. A tab that does not close is a line and the step is done; a run's own `HERDR_TAB_ID` is
  skipped; no Herdr is one line counting the tabs left. `closeFeatureTabs` went.
- **(e) Old names and registry.** `OLD_NAMES` gains `prune` and `close` (exit 2, `REMOVED`, `next: limen seat sweep`,
  lines `limen prune became the daily prune and retire of limen seat sweep (R-101)` and `limen close became the daily
  close of leftover Herdr tabs in limen seat sweep (R-101)`); both registry entries and their handlers went;
  `NO_UNLANDED_WORK` names `limen seat sweep`. The `seat sweep` summary is now "end dead jobs, resume quota jobs, prune
  and retire daily; --install runs it every minute"; help golden and the generated sections of `docs/commands.md` follow.
- **(f)** `abandonedMarker` (record validator, `src/job/record.ts`) and `abandonEvidence` (`src/job/migration.ts`).
- **(g)** Text of fact 11 and Decision 9: `docs/commands.md`, `docs/jobs.md`, `docs/herdr-status.md`, `docs/groups.md`,
  `docs/remote.md`, `docs/seat/README.md` (the prune section now says how a seat drops the old units),
  `docs/seat/agent-setup.md` (phase 8 is the sweep timer), comments in `src/runtime/pruning.ts`,
  `src/integrations/github-claims.ts`, `hook/wake.ts`; `templates/agents.md` (the `close` and `prune` bullets and the
  step 7 sentence) with its new first hash `a69dba76…` in `templates/.history/agents.md`.
- **(h) Tests.** `test/cli/sweep.test.ts`: stamp absent, old, fresh; second run within 24 h; a failed step (unreadable
  archive) writes no stamp and the next run succeeds; the retire cases of the old `test/cli/prune.test.ts` moved here
  (marker aged 25 h); R-032 note 7 (the start-queue test registers no second project, and the unlistable start-queue
  test asserts no reap). New `test/runtime/pruning.test.ts` (each archive move, byte for byte in base64, and a second
  prune that moves nothing; a live scope keeps the worktree; the three gitlink cases), `test/runtime/retiring.test.ts`
  (a marker under 24 h stays; the job's lock held elsewhere keeps the job), `test/integrations/herdr.test.ts` (closed
  feature's tabs close, open feature's stay, another label stays, a run's own tab stays, a tab that will not close is a
  line, no Herdr is one line); `test/integrations/github-poller.test.ts` (retire between lookup and reads);
  `test/cli/old-names.test.ts`, `test/cli/abandon.test.ts`, `test/registry.test.ts`, `test/structure.test.ts` (the
  sweep the one importer; no `LIMEN_SETUP_KEEP` in `src/`), `test/runtime/job-setup.test.ts` (a spawn prunes nothing),
  `test/config.test.ts`, `test/help.test.ts`.

### Review round 1 (F1–F6 of `ticket.md` → `## Decisions`)

- **F1** (`src/integrations/github-review.ts`, `markedJob`): a folder of the job archive whose task starts with the
  claim's marker counts only when its record is there and past `starting`; a `starting` record in `.limen/jobs/` still
  counts (a live handoff). The predicate is `everRan` in `src/job/job.ts`, beside `isTerminal`: the daily prune's local
  `started` in `src/runtime/pruning.ts` was the same function, so it moved to the module of job states at its second
  use (T-25 (2)) and prune calls it too. The comments of `claimHasJob` and `markedJob` and `docs/remote.md:163` say so.
  The other readers of `archivedJobs` were checked by reading: `src/job/statistics.ts` (`readProjectJobs`, `readJob`)
  counts an archived folder with no record under `Not read: … folder with no record` and a `starting` record as a
  record of its route and role, the same path as a folder of `.limen/jobs/` (`test/cli/stats.test.ts:144` covers the
  folder with no record); `src/job/reference.ts` (`newJobId`) reads only the folder names, for the token draw. Neither
  reads a record it could fail on beyond what `.limen/jobs/` gives it, and no change was needed there.
- **F2** (`test/s9-housekeeping.test.ts`, first test): it checks the prune it names. The running record whose wrapper is
  gone (`gone`), which the sweep's reap finalized before the prune, left it; the order of the reap and the daily prune
  has its own test in `test/cli/sweep.test.ts` ("the daily prune removes the clean worktree of a dead running job that
  the same run's reap finalized"), and the reap itself stays checked by that file's first test. The daily retire's
  assertions (a hand-merged job, no `landed` marker, keeps its record and branch; the unmerged and live jobs stay) went
  to the A-002 retire test of `test/cli/sweep.test.ts`, which now also plants a job whose branch a human merged and
  checks that its record and its branch stay; "both stay" was the same no-marker rule, which that test checks.
- **F3** (`src/runtime/pruning.ts`, `src/runtime/retiring.ts`): `pruneLine` (the `pruned` and the `archived` line) and
  `keptLine` escape every path and job name through `shownField`; retire's lines are built in `src/runtime/retiring.ts`
  (`retiredLine`, `heldLine`), escaped the same way, and the sweep prints them. `docs/commands.md` → Daily steps says
  so.
- **F4** (`src/runtime/pruning.ts`, `leftPublications`): the stat of a `.publishing-*` folder is
  `statSync(…, { throwIfNoEntry: false })`, and a folder gone by then is skipped, as the worktree-root move skips one.
- **F5** (`src/lock.ts`, `src/runtime/retiring.ts`, `src/runtime/sweeping.ts`): `moveLockedFolder` takes
  `mode: "skip"`, one attempt as `withLock` makes it, and returns undefined while a live owner holds the folder's lock;
  retire passes it, keeps such a job in `.limen/jobs/`, returns it in `held`, and the sweep prints `kept job <id> for
  the next daily retire: another process holds its lock`; the step succeeds and the stamp is written. Prune's own
  moves still wait (Open points 6). `docs/commands.md` and `docs/jobs.md` say so.
- **F6** (`src/runtime/sweeping.ts`, `runFailure`): each failure of `sweepProject` carries its project's root, and the
  key of "named once" is the root, the message and the code, so the same failure of two projects is two lines.

### Review round 2 (G1–G3 of `ticket.md` → `## Decisions`)

- **G1** (`src/integrations/herdr.ts`, `closeLeftoverTabs`): every line the step prints names the tab and the job
  through one prefix, `the leftover Herdr tab <tab> of job <id>`, whose recorded tab id and job name go through
  `shownField` (imported from `src/boundary.ts`, as `src/runtime/pruning.ts` does), and the `tab get` failure line shows
  Herdr's error text through `shownField` too; the `closed …` and `… did not close; its log says why` lines keep their
  words. The function's comment says why; `docs/commands.md` → Daily steps names the tab lines beside the prune and
  retire lines. New test in `test/integrations/herdr.test.ts`: a recorded log tab id holding a newline whose close Herdr
  refuses twice, and a recorded diff tab id holding an ESC whose `tab get` fails with a text holding a newline, each
  give one line with `\n` and `\u001b` escaped.
- **G2** (`src/job/statistics.ts`, `readProjectJobs`): each folder carries whether it is the archive's; a folder of the
  job archive whose record is absent or `starting` (`everRan` false) is skipped, so it is neither a row of the jobs
  table nor a `folder with no record` of `Not read`; an archived record that does not parse still counts as one. A
  folder of `.limen/jobs/` is read as at `HEAD`. The module's header comment, the function's comment, the comment of
  `everRan` (`src/job/job.ts`) and `docs/jobs.md` (the `limen stats` sentence of the record paragraph and the job
  archive paragraph) say so. New test in `test/cli/stats.test.ts`: a project with one done job, its `limen stats`
  output; then a `starting` record whose spawner is gone and a folder with no record in `.limen/jobs/`; `limen seat
  sweep` (exit 0) moves both into the job archive; `limen stats` prints the same output as before.
- **G3** (`CONTRIBUTING.md:19`): the list of commands whose registry entry names a later ticket in `movedBy` is
  `rule`, `keeper`, `group wait`, as in `docs/commands.md:11`.

## Index (staged by the implementer)

`git rm`: `src/commands/prune.ts`, `src/commands/close.ts`, `test/cli/prune.test.ts`, `docs/seat/limen-prune.service`,
`docs/seat/limen-prune.timer`. No `git mv`. Review rounds 1 and 2 staged nothing.

## Proof

Review round 2 (the implementer's runs, 2026-11-25):

- `node adrian-rebuild/tools/gate.mjs` → exit 0; tests 1178, pass 1178, fail 0, cancelled 0, skipped 0 (278.0 s; tsc
  and Biome inside it): the 1176 of round 1 and the two new tests of G1 and G2.
- `node adrian-rebuild/tools/check.mjs` → exit 0, `0 errors`.
- `npx biome check --error-on-warnings .` → exit 0 (282 files).
- Each new test, run on the working tree before its fix (`node --test` alone; each run's output was piped through
  `tail`, so the counts below are `node --test`'s own summary and its exit code was not captured):
  - G1: `node --test test/integrations/herdr.test.ts` → 6 tests, 5 pass, 1 fail: "each line of a leftover tab that
    stays open shows the recorded tab id and Herdr's error text escaped, on one line" got the raw lines
    `'the leftover Herdr tab w1:t1\n' + 'retired 2026-11-24-fake-5e6f7a8b to /tmp of job 2026-11-24-f012-demo-1a2b3c4d
    did not close; its log says why'` (a forged second line) and `'the leftover Herdr tab w1:t2\x1B[2J of job … stays
    open: herdr tab get failed (daemon gone\n' + 'closed the leftover Herdr tab w1:t9)'`, against the escaped `\\n` and
    `\\u001b`. After the fix: 6 tests, 6 pass.
  - G2: `node --test --test-name-pattern="as before they were left" test/cli/stats.test.ts` → 1 test, 0 pass, 1 fail:
    the sweep exited 0 and moved both folders into the archive (that assertion passed), then `limen stats` printed
    `Jobs by route and role (2 records, 2026-10-01 to 2026-10-02)`, the worker row with `jobs 2  done 1` and `Not read:
    1 folder with no record (limen status --all)`, against the output before: `1 record, 2026-10-02 to 2026-10-02`,
    `jobs 1  done 1`, no `Not read` line. After the fix: `node --test test/cli/stats.test.ts` → 18 tests, 18 pass.
  - G3 changes text only.

Review round 1 (the implementer's runs, 2026-11-25):

- `node adrian-rebuild/tools/gate.mjs` → exit 0; tests 1176, pass 1176, fail 0, cancelled 0, skipped 0 (286.4 s, the
  run after the last edit, of comments; the run before it, 277.0 s, gave the same counts; tsc and Biome inside it): the
  1170 of the first run and the six new tests of F1–F6.
- `node adrian-rebuild/tools/check.mjs` → exit 0, `0 errors`.
- `npx biome check --error-on-warnings .` → exit 0 (282 files).
- Each new or changed test of a fixed mechanism, run on the working tree before its fix (`node --test` alone, which on
  this laptop needs no gate environment for these files):
  - F1: `node --test --test-name-pattern="daily prune archived what a crashed handoff left" test/cli/github.test.ts` →
    exit 1, 1 test, 0 pass, 1 fail: the sweep archived the left folder (that assertion passed), then the rerun failed
    with `claim 104 already entered a handoff with no job that answers it yet; …`,
    `{"class":"refused","code":"GITHUB_HANDOFF_GATE","next":"limen status --all"}`, `1 !== 0`.
  - F3: `node --test --test-name-pattern="escaped, on one line" test/runtime/pruning.test.ts` → exit 1, 1 fail: the
    actual line was `archived …/.repo-limen-worktrees/leftover\n` + `retired 2026-11-24-fake-1a2b3c4d to …` with a raw
    newline, a forged `retired` line. Its first run before the fix used a name with a `/`, which made a nested folder;
    the corrected test was run again against the old `pruneLine` body, put back for that one run, with the same
    failure, and the fix restored after it.
  - F4: `node --test --test-name-pattern="between the listing and its stat" test/runtime/pruning.test.ts` → exit 1,
    1 fail: `Error: ENOENT: no such file or directory, stat '…/.limen/.publishing-2026-11-24-renamed-1a2b3c4d'`.
  - F5: `node --test --test-name-pattern="lock another process holds" test/cli/sweep.test.ts` → exit 1, 1 fail: `…
    (daily retire): …/.limen/jobs/2026-11-23-held-1a2b3c4d/.lock is still held after 0.2 s by pid … (LOCK_TIMEOUT)`,
    `{"class":"transient","code":"LOCK_TIMEOUT","next":"limen seat sweep"}`, `3 !== 0`.
  - F6: `node --test --test-name-pattern="fail with the same message are both named" test/cli/sweep.test.ts` → exit 1,
    1 fail: the run named only `…/repo (daily stamp): EISDIR: illegal operation on a directory, read (STEP_FAILED)`,
    `[4, true, false]` against `[4, true, true]`.
  - Changed after its fix, not run before it: "retire moves a job's folder only under the job's own lock, …" in
    `test/runtime/retiring.test.ts` now expects the job in `held`; before F5 retire waits 60 s there and rejects with
    `LOCK_TIMEOUT`, so its `withLock` rejects. The F5 proof is the sweep test above.
  - F2 changes tests only. Its new order test fails at `HEAD`, whose sweep prunes nothing; on the working tree before
    F2 the mechanism was already there, so it passed.
- After the fixes, each of these files alone: `test/cli/github.test.ts` (its claim and archive tests),
  `test/runtime/pruning.test.ts` (10/10), `test/runtime/retiring.test.ts` (2/2), `test/s9-housekeeping.test.ts` (8/8),
  `test/structure.test.ts`, `test/registry.test.ts` and `test/help.test.ts` (96/96) → all pass.

The first run (before review round 1):

- `node adrian-rebuild/tools/gate.mjs` → exit 0; tests 1170, pass 1170, fail 0, skipped 0 (tsc and Biome inside it).
- `node adrian-rebuild/tools/check.mjs` → exit 0, `0 errors`.
- `npx biome check --error-on-warnings .` → exit 0 (282 files).
- AC-1–AC-3: inside the gate run; also run alone: `node --test test/cli/sweep.test.ts test/cli/old-names.test.ts
  test/cli/abandon.test.ts test/structure.test.ts` and the unit files → all pass.
- AC-4: `git grep -n 'movedBy: "R-101"' -- src/registry.ts` prints nothing (no match). AC-6: `git grep -n
  LIMEN_SETUP_KEEP -- src` prints nothing. AC-5: `git ls-files --error-unmatch docs/seat/limen-prune.service` and
  `… src/commands/close.ts` → exit 1 (`did not match any file(s) known to git`).
- The implementer's own run of `node adrian-rebuild/tools/fails-before.mjs` → exit 0: the one run of the 18 new and
  changed test files `fail at HEAD (exit 1)` (e.g. `R-101: no file of src/ names LIMEN_SETUP_KEEP` lists `src/config.ts`,
  `src/job/spawning.ts`, `src/runtime/job-setup.ts`, `src/runtime/wrapper.ts`; the importer scan finds
  `src/commands/prune.ts` instead of `src/runtime/sweeping.ts`).

## Fails before

AC-7, the main session's last run, after the fixes of review round 2 (2026-11-25, 06:23): `node
adrian-rebuild/tools/fails-before.mjs` → exit 0, first line as the run below with `test/cli/stats.test.ts` (G2) added,
19 files, and the same tail; the main session's gate before it: `node adrian-rebuild/tools/gate.mjs` → exit 0, tests
1178, pass 1178, fail 0 (277.0 s).

The main session's run after the fixes of review round 1 (2026-11-25, 05:55): `node
adrian-rebuild/tools/fails-before.mjs` → exit 0, with the same first line and tail as the run below; the main
session's gate before it: `node adrian-rebuild/tools/gate.mjs` → exit 0, tests 1176, pass 1176, fail 0 (275.7 s). Since
F1, `test/cli/github.test.ts` holds a new test (the rerun after a daily prune), so only `test/s5-land.test.ts` changes
comments alone. Each fix's own test that failed before it: `## Proof` (the implementer's runs of rounds 1 and 2).

The main session's run after the implementer's first `DONE` (2026-11-25, 04:55): `node
adrian-rebuild/tools/fails-before.mjs` → exit 0, first line: `fails-before: test/cli/abandon.test.ts,
test/cli/github.test.ts, test/cli/old-names.test.ts, test/cli/status.test.ts, test/cli/sweep.test.ts,
test/config.test.ts, test/help.test.ts, test/integrations/github-poller.test.ts, test/registry.test.ts,
test/runtime/job-setup.test.ts, test/runtime/wrapper.test.ts, test/s5-land.test.ts, test/s6-keeper.test.ts,
test/s9-housekeeping.test.ts, test/structure.test.ts, test/integrations/herdr.test.ts, test/runtime/pruning.test.ts,
test/runtime/retiring.test.ts fail at HEAD (exit 1)`. The tail of its output is `test/structure.test.ts` at `HEAD`: the
importer scan finds `src/commands/prune.ts` where it expects `src/runtime/sweeping.ts`, and `R-101: no file of src/
names LIMEN_SETUP_KEEP` lists `src/config.ts`, `src/job/spawning.ts`, `src/runtime/job-setup.ts` and
`src/runtime/wrapper.ts`. The tool runs the 18 files in one `node --test` and reports that run's exit, so it shows
that the set fails at `HEAD`, not that each file does: two of them change only comments (`test/s5-land.test.ts`,
`test/cli/github.test.ts`, Deviation 5) and are not expected to fail there.

The main session's gate after `DONE`: `node adrian-rebuild/tools/gate.mjs` → exit 0, tests 1170, pass 1170, fail 0
(279 s).

## Deviations from the ticket

1. Output of the daily steps: a `kept` line that prune printed is not printed again by retire (both keep the same
   worktree); without it the sweep would name a worktree twice.
2. `runFailure` names one failure (same message and code) once per project, where it failed first: a damaged record
   now fails the reap and the three daily steps, and the run lists it once, as the existing comment and tests ask
   ("named once"); since review round 1 (F6) the key holds the project's root, so another project's same failure is a
   line of its own.
3. The stamp holds the bare ISO time with no newline (`Date.parse` reads it as is); a stamp with a future time counts
   as due, so a clock set back does not hold the daily steps off.
4. With no leftover tab the close step consults no Herdr and prints nothing; a `tab get` that fails other than
   `tab_not_found` is a line (`… stays open: herdr tab get failed (…)`) and the step is done (T-01).
5. Tests outside (h)'s list changed because they called the cut commands or the setup prune:
   `test/s9-housekeeping.test.ts` (runs `limen seat sweep` with the stamp removed; the running record with no process
   is now reaped by the sweep first and its clean worktree pruned, as `docs/commands.md` says "the sweep's reap
   finalizes it first"), `test/cli/status.test.ts` (ages the `abandoned` marker 25 h, then sweeps),
   `test/s6-keeper.test.ts` (`closedFeatures` reads the archive register instead of `limen close F012`),
   `test/runtime/wrapper.test.ts` (the queued wrapper's skipped setup is seen by its `--prepare` mark, since the
   setup no longer prunes), comments in `test/s5-land.test.ts` and `test/cli/github.test.ts`.
6. `test/structure.test.ts` → `MATCHER_EXCEPTIONS` gains the tab-label comparison of `closeLeftoverTabs` (a Herdr tab's
   label against the label Limen gave the job's tab, no job reference; T-20 scan), beside the existing Herdr entry.
7. Kept from the cut run, checked and finished: `moveLockedFolder` in `src/lock.ts` (the lock moves with the folder and
   is released at its new place), `readRecordOf` and `unregisteredArchive` in `src/job/record.ts`, `PUBLISHING` in
   `src/job/publication.ts`, `scopeHolds` in `src/runtime/reap.ts`, and the new and changed tests listed above.

Review round 1 (choices inside F1–F6 that the fixes did not name):

8. F1: `everRan` (`src/job/job.ts`) replaces prune's local `started`, the same predicate, at its second use (T-25 (2)).
   `docs/remote.md:163` gains one sentence: a folder of the job archive with no record or a `starting` one is none of
   the facts that hold a gate.
9. F3: `keptLine` escapes the job name too, not only the path, so every path and name of a prune or retire line goes
   through `shownField`; for a job id of Limen's form the line is unchanged. Land and abandon print `keptLine` too and
   get the same escaping.
10. F5: the line's words, `kept job <id> for the next daily retire: another process holds its lock`, are mine. `held`
    is a new field of `RetireResult`, and `moveLockedFolder` returns undefined for a busy lock only in `skip` mode,
    as `withLock` does; prune's calls keep the wait (Open points 6).
11. F6: the test makes both projects fail with one message through a stamp that is a folder (`EISDIR`, whose message
    names no path), since the failures of a project's records name their paths.
12. F2: the first test of `test/s9-housekeeping.test.ts` lost its `gone` record and its retire assertions; the hand
    merge moved into the A-002 retire test of `test/cli/sweep.test.ts`, whose name now lists that case, and the order of
    the reap and the daily prune got a test of its own there. The `crashedReview` helper of `test/cli/github.test.ts`
    holds the crash that its earlier test did inline, so the new F1 test shares it.

Review round 2 (choices inside G1–G3 that the fixes did not name):

13. G2's test: "the same before and after a daily prune" is read as the counts before the start left its folders
    against the counts after the prune moved them. A folder of `.limen/jobs/` is read as at `HEAD` (G2), so between the
    crash and the prune the `starting` record is a job of its row and the folder with no record is on `Not read`, and a
    run of `limen stats` right before the prune differs from one after it; the counts before the folders were left are
    `HEAD`'s counts after its prune deleted them, which G2 names as the target ("a count after a daily prune equals
    `HEAD`'s", `review.md` → Round 2, note 3).
14. G2: an archived folder whose record does not parse still counts on `Not read` as `record that does not parse`: the
    `everRan` rule needs a state it can read, and the daily prune never moves such a record, since its read fails the
    step first, so none of this change's moves leaves one in the archive.
15. G1: the job's name is escaped as G1 asks, though a record reads only when its id is the folder's name and of
    `SESSION_ID`'s form (`src/job/record.ts`, `recordFrom`), so `closeLeftoverTabs`, which takes only folders whose
    record reads, never sees a job name with a control character, and the test puts them in the tab ids and
    Herdr's error text only. The test checks both lines of a tab that stays open (refused close, failed `tab get`) in
    one test, one mechanism, the escape. For it the fake Herdr gained `unread` (a `tab get` that fails with a given
    text), and `project()` of `test/integrations/herdr.test.ts` takes the fake's misbehaviour as one options object
    instead of two positional arguments, its three callers with it.

## Unmeasured

- That the sweep's unit reaches Herdr and that the real Herdr's `tab get` lists the label as the fake does
  (`result.tab.label`, the shape `hook/wake.ts` reads too): only on the seat, `## Deployment` step 3.9 (D-096 (1)); no
  M-NN of `## Measurement` covers it.
- The first daily run on a seat with many leftovers inside `TimeoutStartSec=300` (Risk 1): seat only; no M-NN.
- The coordinator's manual (`templates/agents.md`: the `close` and `prune` bullets go, "Cleanup is no command of
  yours" comes): its size is M-01 (from stage 4, `context-size.mjs`), and whether the coordinator still names `limen
  prune` or `limen close` is M-05's count of owner commands (T-41); the role text sits in Pi's system prompt, which the
  bridge drops (E-1), as for the role texts of stage 1 (the main session's text).

## Open points

1. `test/cli/github.test.ts`'s `github poll` tests fail when run with `node --test` outside the gate, because the
   poller refuses a module path under `/tmp` ("unsafe owner or permissions on /tmp"); they pass in the gate's private
   `TMPDIR` (R-018 open point 3). Not caused by this change.
2. Decision 7 (`LIMEN_SETUP`) is a night default for Adrian to confirm.
3. For Adrian at gate 5.3 (review round 1, finding 2; the main session's text): a folder in the worktree root that Git
   does not register but that holds a `.git` is still deleted, as at `HEAD` (detached to `.pruned-*`, then
   `emptyTrash`): one whose `.git` Git cannot read (`worktreeChanges` returns nothing for it, D-097 (4) (d)'s own reason
   for the move) and a clean independent clone with commits only there. D-097 (4) (d) confines the move to a folder
   with no `.git`, so this ticket keeps that list. Options: (a) every unregistered folder of the worktree root moves to
   `.limen/archive/unregistered/`, `.git` or not (recommended: nothing Git does not hold elsewhere is deleted, z. 29,
   at the cost of archive space); (b) only one whose `.git` Git cannot read moves, a clean clone is still deleted; (c)
   as now.
4. For gate 5.3 (review round 1, finding 6, guessed): taking a job's lock creates the job's folder when it is missing
   (`src/lock.ts`, acquire), so a writer that checks the folder and locks right after a retire may leave an empty
   `.limen/jobs/<id>/`; the next prune would move it to `archive/<month of now>/<id>`, where the retired job already is
   in the same month, and that daily prune fails, named, every minute until the month changes (retire and the tab
   close still run). Not reproduced.
5. For Adrian at gate 5.3 (review round 1, T-18 answer): the `seat sweep` summary of the golden help is the
   implementer's wording (Deviation 7) and leaves out the daily close of leftover tabs, which `docs/commands.md` names.
6. For gate 5.3 (review round 1, F5's pattern, observed in the code, not reproduced): the daily prune's moves of a
   record that never started and of a publication's left folder still take the folder's own lock with the 60 s wait
   while they hold the jobs lock (`moveLockedFolder` without `skip`, `src/runtime/pruning.ts`, `moveUnstarted` and
   `movePublications`), so a writer that holds such a lock could keep spawns' token draws waiting there and fail the
   daily prune with `LOCK_TIMEOUT`. F5 names retire only, so prune keeps the wait. Options: (a) prune takes those locks
   with one attempt too and leaves such a folder for the next daily run, as retire does (recommended: one rule for
   every move under the jobs lock); (b) as now.
7. For R-103 (review round 3, note 1, guessed, not reproduced; the main session's text, D-092): the close of leftover
   tabs asks Herdr on every daily run about each recorded tab of every finished job of closed features still in
   `.limen/jobs/`, closed long ago or not, through a blocking `spawnSync` with the 10 s bound, so a Herdr that hangs
   instead of failing costs 10 s per tab, and about 30 such tabs pass the unit's 300 s; the run is cut, writes no stamp,
   and the next minute repeats it. The ticket's Risk names only an unreachable Herdr. Retire takes landed and abandoned
   jobs out of `.limen/jobs/` after 24 h, so the set grows only with finished jobs that are neither. R-103, whose
   `cleaned` step rewrites the tab close (`plan.md` → `## Tickets` → notes), is where a closed or gone tab stops being
   asked again and the step gets a total bound.
