<!-- PL: Wynik R-031 (A-002) z nocy 22/23.11. Rekord dostał znaczniki `landed` i `abandoned` z jednym pisarzem po
stanie końcowym; land, `ticket done`, abandon i migracja je piszą, a `prune --retire` przenosi tylko oznaczone joby
bez niewylądowanej pracy jednym `rename` do `.limen/archive/<RRRR-MM>/`. Po rundach 1 i 2 recenzji wdrożono poprawki
F1–F11 i G1–G6, każdą zmianę mechanizmu z testem, który przed nią nie przechodził; bramka sesji głównej 900/900,
recenzja PASS w rundach 2 i 3. Decyzje nocne 1–26 czekają na Adriana, otwarte punkty na bramkę 5.3, a dwie uwagi
rundy 3 na odpowiedź na Q-42. -->

# R-031 outcome

## What was done

(a), (b) Record and marker writer (`src/job/record.ts`): two optional fields, `landed: {sha, at}` and
`abandoned: {branch, commit, at}`, in `RECORD_FIELDS`, with validators (a full 40-hex commit, a one-word branch, an ISO
time); a record without them reads as before (D-079). `writeMarker(jobDir, marker)` is the one write after a terminal
state: under the job's lock it refuses a folder without a record or a record that is not terminal
(`MARKER_NOT_FINISHED`), writes the marker once, returns the record unchanged when the same marker (same commit, and
branch) is there, keeping the first time, and refuses one with another commit (`MARKER_DIFFERS`). `Fields` no longer
admits the markers, so `transition` cannot write them. The record module also lists the job archive: `archivedJobs(root)`
(`.limen/archive/<YYYY-MM>/<id>/`, month folders by name) and `archiveMonth(root, at)`.

(c) `limen land` (`src/job/landing.ts`) writes `landed` with `HEAD` of the target right after the merge and before
`deleteLandedBranches`. `limen ticket done` (`src/project/ticket-folders.ts` → `markTicketJobs` in
`src/job/landing.ts`), after its commit, writes `landed` with the closing commit and `<day>T00:00:00.000Z` (`--on`, or
the day) on each finished job without a `landed` marker whose `jobFeatures` (label, id, `task.md`, the subjects of the
record's `commits`) name a ticket it closed and that holds no unlanded work by `jobStandings` (new, one pass in
`src/job/unlanded.ts`); it prints `marked job <id> landed in <commit>`, or `job <id> stays without a landed marker: it
holds unlanded work (limen status)`. `commitPaths` returns the full and the short SHA; `applyTicketClose` returns the
codes, the day and both SHAs. The land reason and its parser are one definition in `src/project/lanes.ts`
(`landReason`, `landedJobOf`).

(d) `limen abandon` (`src/job/abandoning.ts`) writes `abandoned` (the branch, its commit, the time) once no worktree is
left: after it removed the worktree, or when there was none; a kept worktree gets no marker. Step (1) reads
`limen/abandon/<id>` directly, so a run again after a stop still finds its save. A new kept cause: a nested repository
of the saved commit whose branches, tags, stash or reflog (`git rev-list --no-walk --branches --tags --reflog`,
`namesUnsavedCommit` in `src/project/git.ts`) name a commit the project's object store lacks. `src/job/unlanded.ts`
takes a job as resolved by its `abandoned` marker, no longer by the branch's existence.

(e) `prune --retire`: the domain operation is the new `src/runtime/retiring.ts`; `src/commands/prune.ts` is its
adapter. It takes only finished jobs with a marker, outside an open group, that hold no unlanded work; deletes a landed
job's own branch through `deleteLandedBranches` only when the branch holds no commit outside HEAD; then, under the jobs
lock (`jobsLock`, `.limen/jobs.lock`), reads each record again and moves the folder with `atomicRename` to
`.limen/archive/<YYYY-MM>/<id>/` (the UTC month of `landed.at`, else `abandoned.at`), making the month's folder.
`limen/abandon/<id>` branches and an abandoned job's own branch stay. Lines: `retired <id> to .limen/archive/…`,
`would retire <id> to …` with `--dry-run`, `retired N job(s)`, `no finished jobs to retire`, and the `kept` line of
each finished job with unlanded work. The registry's summary and flag lines say "retire" and "the job archive"; the
golden help and the generated part of `docs/commands.md` follow.

(f) Archive readers, each through `archivedJobs`: the token draw (`newJobId`, `src/job/reference.ts`), `limen stats`
(`src/job/statistics.ts`), and the GitHub claim's job lookup (`markedJob`, which now returns `{id, jobDir}`, so
`matchedGithubJob` and `claimHasJob` read the archived folder). The scan `JOB_FOLDER_READERS` in
`test/structure.test.ts` now names these four readers with the listings each must import from the record module.
Every other reader keeps reading `.limen/jobs/` only: the resolver (`resolveJob`, so `show`, `continue`, `land`,
`abandon`, `diff`, `open`, `steer`, `stop`, `watch`, `unwatch` and `keeper` refuse an archived job with
`JOB_NOT_FOUND`), `limen status` and `status --all` (`src/project/summary.ts`), the unlanded-work reading behind spawn's
`UNLANDED_WORK` (`src/job/unlanded.ts`), prune and the setup prune (`src/runtime/pruning.ts`), the reaper and
`limen sweep` (`src/runtime/reap.ts`, `src/commands/sweep.ts`), the hooks (`hook/wake.ts`, `hook/communication.ts`),
the alerts (`seat/alerts.ts`) and `seat/deploy.ts`, the board's jobs (`src/project/board-jobs.ts`), the activity feed
(`src/picture/activity.ts`, `src/picture/picture-serve.ts`), the group modules (`src/job/group-*.ts`), steer delivery
and watching (`src/job/steer-delivery.ts`, `src/job/watching.ts`), `src/job/detail.ts`, `src/job/task-note.ts`,
`src/job/spawning.ts`, `src/job/continuation.ts`, `src/operation.ts`, `src/config.ts`, `src/integrations/herdr.ts`,
the poller's own reads (`src/integrations/github-poller.ts`, beside `matchedGithubJob`), `src/project/planning.ts`,
`src/project/series.ts`, `src/project/setup.ts`, and the folder steps of the migration.

(g) `limen status` prints `Abandoned work (Limen keeps each branch until a person deletes it):` with one line
`  <branch> · <short commit>[ · repo <repo>]` per `limen/abandon/<id>` branch of the project's repository and, in a
workspace, of each immediate child Git repository (since F2, from Git alone; before it, of each workspace repository a
record named); `branchesBelow` returns each branch with its short commit.

(h) `limen migrate` has a marker step (`src/job/migration.ts`): over the records the folder steps leave (with
`--dry-run`, the ones they would write), each finished one with no marker gets `landed` when the history of HEAD of the
project's repository holds `Close <codes>: landed by <id>` (`landedJobOf`; the commit and its committer time; the
oldest such commit), and `abandoned` when `limen/abandon/<id>` exists in its repository and its worktree is gone (the
branch, its commit, that commit's committer time); both through `writeMarker`. The report names each marker
(`job <id>: [would ]mark landed (<sha>, <at>)`, `… mark abandoned (<branch> at <commit>, <at>)`), each finished job
left without one with why, and a count line; it keeps its refusal while jobs run, its dry run writes nothing and sets
`next` to `limen migrate` when a marker would be written, and a second run writes nothing.

(i) Tests: listed under `## Fails before`.

(j) Text: `docs/jobs.md` (the record, the stats sentence, the migration, Finished jobs, the resolution of unlanded
work, the prune table, a new paragraph on the job archive, abandon's paragraph, continue), `docs/herdr-status.md`,
`docs/commands.md` (land, abandon, prune, status's new section, ticket done, the generated help lines),
`docs/remote.md`, `templates/agents.md` with its new first hash in `templates/.history/agents.md`, and the comments of
`src/job/unlanded.ts`, `src/job/reference.ts`, `src/job/abandoning.ts`, `src/job/migration.ts` (the token report and
the report line, which drops "until R-031"), `src/integrations/github-claims.ts` and `hook/wake.ts`.

## Fixes of review round 1 (F1–F11)

The first round of fixes (`ticket.md` → `## Decisions`, 2026-11-23; `review.md` → Round 1), by a fresh implementer.
Each mechanism change has a test written first and run against the tree before its fix (`## Fails before` → Round 1).

- F1 (finding 1): `readDoneJob` (`src/job/landing.ts`) returns the record's `landed`; `landJob` writes the marker only
  when the record holds none and goes on with the branch delete and the ticket close as before, so a land run again
  after the target moved exits 0 and keeps the first land's marker. The comment above the write says so and names
  R-031, Decision 4. Test: `test/cli/land.test.ts`, "land run again after a new commit on the target exits 0 and keeps
  the landed marker of the first land".
- F2 (finding 2): `abandonLines` (`src/project/summary.ts`) reads no record: it lists the abandon branches of the
  project's repository and, in a workspace, of each immediate child Git repository, from the new
  `workspaceRepositories` (`src/project/git.ts`: each child folder with a `.git` that is its repository's top level,
  the check `workspaceRepository` makes for `--repo`). Test: `test/cli/status.test.ts`, "limen status in a workspace
  lists the abandon branch of a workspace repository after retire moved its job".
- F3 (finding 4): with the worktree gone and no marker, `branchTips` (`src/job/abandoning.ts`) also holds whether
  `limen/abandon/<id>` holds the tip of the job's own branch (`isAncestor`, new in `src/project/git.ts`, `git
  merge-base --is-ancestor`); when it does not, validate refuses `ABANDON_BRANCH_LACKS_WORK` (class `refused`, exit 1,
  `next` null), declared in the registry's `abandon` entry, and nothing is written. Test: `test/cli/abandon.test.ts`,
  "ABANDON_BRANCH_LACKS_WORK: abandon of a job with no worktree whose limen/abandon/<id> lacks its branch's tip exits 1
  and leaves the snapshot identical".
- F4 (finding 6): `reportLines` (`src/job/migration.ts`) ends with "nothing to do: every job folder holds a record"
  only when no folder changed and the marker step writes, or with `--dry-run` would write, no marker (`marksAny`, which
  `migrateProjectAt`'s `next` reads too); otherwise with the folder counts. Test: `test/cli/migrate.test.ts`, "the
  report's last line gives the folder counts, not nothing to do, when the marker step writes or would write a marker".
- F5 (finding 7): `deleteLandedBranch` (`src/runtime/pruning.ts`) is split into `landedBranchDecision`, the rules, and
  the delete; the new `plannedLandedBranches` runs the same rules with no lock, no `git worktree prune` and no delete.
  `retireMarkedJobs` (`src/runtime/retiring.ts`) runs it in a dry run, so `--dry-run` names only the jobs the run moves
  and prints the `kept` line of each worktree the run keeps. Test: `test/cli/prune.test.ts`, "prune --retire --dry-run
  names no job whose landed branch the run keeps with its worktree, and names the worktree".
- F6 (finding 9): `markedJob` (`src/integrations/github-review.ts`) returns `MarkedJob`, which says whether the folder
  is in the job archive; for an archived job of another shape `GITHUB_CONFLICT` names the folder from the project's
  root and has `next` null; for a job in `.limen/jobs/` it is unchanged (`limen show <id>`). Test:
  `test/cli/github.test.ts`, "GITHUB_CONFLICT: github work on a claim that an archived job of another shape carries
  names its folder and no command".
- F7 (finding 10): `Standing` (`src/job/unlanded.ts`) carries the record's `abandoned` marker instead of a boolean;
  abandon of a marked job plans the source `marked`, whose apply writes nothing and makes no branch, and prints `job
  <id> is abandoned: its work is on <branch> at <commit>`, or `… its work was on <branch> at <commit>; that branch is
  gone` (or `… is at <tip> now`), and exits 0. Tests: `test/cli/abandon.test.ts`, "abandon run again after a person
  deleted limen/abandon/<id> says that the branch is gone, makes none and exits 0", and the changed expectation of "a
  second abandon after all its steps prints the branch, exits 0 and changes nothing".
- F8 (finding 11): `docs/jobs.md` (the job archive paragraph) says "the GitHub module".
- F9 (finding 12): `src/job/landing.ts` (the marker write: R-031, Decision 4; `markTicketJobs`: A-002; R-031,
  Decision 3) and `src/runtime/retiring.ts` (R-031, Decision 6) name the ticket; the header of `src/job/abandoning.ts`
  and of `src/job/record.ts` give the reason and the source in two sentences each; the steps of abandon are numbered in
  the comment of `applyAbandon`, which the other comments of the file cite.
- F10 (finding 13): `namesUnsavedCommit` (`src/project/git.ts`) checks the listed commits in one `git cat-file
  --batch-check` of the project's repository; a check that fails, answers for another number of commits or names one
  `missing` counts as lacking. No new test: its behaviour is unchanged, and the four nested-repository tests of
  `test/cli/abandon.test.ts` pass.
- F11 (T-19): the `--retire` flag line of `src/registry.ts` is `retire each job marked landed or abandoned, unless it
  holds unlanded work` (88 characters with its indent in `limen prune --help`). No new test: a text, under the width
  test of `test/help.test.ts`. The golden `limen --help` and the generated part of `docs/commands.md` show the
  command's summary line only, not its flag lines, so neither changes.
- Text the fixes made false or incomplete: `docs/commands.md` (land keeps the first marker on a run again; status reads
  Git alone; abandon of a marked job; the retire dry run), `docs/jobs.md` (the dry-run row, `ABANDON_BRANCH_LACKS_WORK`
  in abandon's refusals, abandon run on a marked job) and `docs/remote.md` (`GITHUB_CONFLICT`'s `next`).

## Fixes of review round 2 (G1–G6)

The second and last round of fixes (`ticket.md` → `## Decisions`, 2026-11-23; `review.md` → Round 2), by a fresh
implementer. Each mechanism change has a test written first and run against the tree before its fix (`## Fails before`
→ Round 2).

- G1 (note 1): `matchedGithubJob` (`src/integrations/github-review.ts`) gives a job it found in the job archive the
  field `archived`, its folder from the project's root; for a job in `.limen/jobs/` its result is as before. The
  poller's `reconcile` (`src/integrations/github-poller.ts`) reads `result` and `log` from that folder, and the new
  `inspection` names the folder, `its folder in the job archive, \`<folder>\``, in place of `limen show <id>` in the
  terminal reply and also in the start reply (night default 21). Tests: `test/integrations/github-poller.test.ts`
  (new), "the terminal reply of a claim whose job retire moved to the job archive carries its result and names its
  folder" and "the start reply of a claim whose job the poller first finds in the job archive names its folder, not
  limen show".
- G2 (note 2): the migration's `abandonedOf` (`src/job/migration.ts`) writes `abandoned` only when `limen/abandon/<id>`
  holds the tip of the job's own branch, by `holdsTip`, new in `src/job/unlanded.ts` and now also the check of abandon's
  `branchTips` (F3), so both use one rule (T-25). Otherwise the step records the branch in `MarkerStep.unsaved`, writes
  no marker, and the report's line reads `job <id>: left without a marker: no closing commit of land names it, and
  limen/abandon/<id> at <commit> does not hold <tip>, the tip of its branch <branch>`. Test: `test/cli/migrate.test.ts`,
  "the marker step writes no abandoned marker when limen/abandon/<id> lacks the tip of the job's branch, and names why".
- G3 (note 3): the F1 test of `test/cli/land.test.ts` asserts, before it runs land again, that the first land wrote
  `landed` with the merge, `HEAD` of the target then. Test only; it passes on this tree, and it fails on any tree where
  the first land writes no marker (at `HEAD`, as before: `test/cli/land.test.ts` is among the files that fail there).
- G4 (note 4): `markTicketJobs` is split. `ticketDoneJobs` (`src/job/landing.ts`), the read, lists the finished jobs of
  the tickets with whether each holds unlanded work, through a `JobReader`. `ticket done`'s validate
  (`src/project/ticket-folders.ts`) calls it through its view and holds the answer, only for a close that commits, so
  `NOT_MIGRATED` and any other refusal of the read comes before anything moves, and the runner reads it again under
  the ticket-lanes lock before the commit. `markTicketJobs`, the write, marks the jobs of that plan after the commit,
  with the same lines as before. Test: `test/cli/ticket.test.ts`, "NOT_MIGRATED: ticket done in a project with a job
  folder of an older Limen exits 4 and moves nothing".
- G5 (note 5): `makeDurableFolder` (new in `src/atomic-write.ts`) makes a folder with each missing folder above it,
  then syncs the folder that holds it and the folder above each folder it made. Retire's `moveJobs`
  (`src/runtime/retiring.ts`) calls it on the month's folder before the rename, so the month's name in
  `.limen/archive/` is synced every time and the archive's name in `.limen/` when the archive is new. Tests: four in
  `test/atomic-write.test.ts` in the form of its folder-sync tests (a missing folder and its parents made; a holder it
  cannot open fails with EACCES after the folder was made; a folder above a new holder it cannot open fails with
  EACCES; a folder above a holder that was there is not opened), and `test/cli/prune.test.ts`, "prune --retire syncs
  the job archive's folder before the move, so an archive folder it cannot open moves no job".
- G6 (note 6): the header of `src/runtime/retiring.ts` and the R-031 part of the header of `src/job/migration.ts`
  give the reason and the source in two sentences and one sentence, without the steps. The comment of `moveJobs` names
  the reason of the sync.
- Text the fixes made incomplete: `docs/jobs.md` (the migration's `abandoned` condition and its reason line; the
  archive paragraph: the synced month folder, and the GitHub module reading a job's files there), `docs/commands.md`
  (`ticket done` reads its jobs before its commit and refuses `NOT_MIGRATED`), `docs/remote.md` (the replies of an
  archived job), and the header comments of `src/atomic-write.ts` and `test/atomic-write.test.ts`.

## Proof

After the round 2 fixes (G1–G6), from the repository root:
- `node adrian-rebuild/tools/gate.mjs`, run alone, not piped → exit 0: `tsc --noEmit`, then `biome check
  --error-on-warnings .` (`Checked 265 files … No fixes applied.`), then the tests: `ℹ tests 900`, `ℹ pass 900`,
  `ℹ fail 0`, `ℹ cancelled 0`, `ℹ skipped 0` (`duration_ms 213650`); 891 before the fixes, and nine new tests (two in
  `test/integrations/github-poller.test.ts`, four in `test/atomic-write.test.ts`, one each in
  `test/cli/migrate.test.ts`, `test/cli/ticket.test.ts` and `test/cli/prune.test.ts`).
- `node adrian-rebuild/tools/check.mjs` → exit 0 (`PL summaries: 223 files; ticket folders: 44; changes: 41 entries;
  0 errors`), with this file in place.
- `npx biome check --error-on-warnings .` → exit 0 (`Checked 265 files … No fixes applied.`), after `npx biome format
  --write` of `src/job/migration.ts` and `test/cli/prune.test.ts` (line breaks only);
  `npx biome check --error-on-warnings adrian-rebuild` → exit 0 (`Checked 34 files … No fixes applied.`).
- Single files before the gate: `node --test` of `test/cli/abandon.test.ts`, `migrate`, `land`, `prune`, `ticket`,
  `test/atomic-write.test.ts`, `test/integrations/github-poller.test.ts`, `test/cli/old-hosted.test.ts` and
  `test/s9-housekeeping.test.ts` together → 114/114; `test/structure.test.ts`, `test/registry.test.ts` and
  `test/help.test.ts` together → 83/83; `test/cli/ticket.test.ts` with `test/operation.test.ts` → 27/27; `npx tsc
  --noEmit` → exit 0.

After the round 1 fixes (F1–F11), from the repository root:
- `node adrian-rebuild/tools/gate.mjs`, run alone → exit 0: `tsc --noEmit`, then `biome check --error-on-warnings .`
  (`Checked 264 files … No fixes applied.`), then the tests: `ℹ tests 891`, `ℹ pass 891`, `ℹ fail 0`, `ℹ cancelled
  0`, `ℹ skipped 0` (`duration_ms 214399`); 884 before the fixes, and seven new tests.
- `node adrian-rebuild/tools/check.mjs` → exit 0 (`PL summaries: 223 files; ticket folders: 44; changes: 41 entries;
  0 errors`), with this file in place.
- `npx biome check --error-on-warnings adrian-rebuild` → exit 0 (`Checked 34 files … No fixes applied.`).
- Single files before the gate: `node --test` of `test/cli/abandon.test.ts`, `land`, `status`, `prune`, `migrate`,
  `ticket`, `stats`, `test/help.test.ts`, `test/registry.test.ts`, `test/job/record.test.ts`,
  `test/job/reference.test.ts` and `test/s9-housekeeping.test.ts` together → 184/184; `test/structure.test.ts` →
  42/42; `node --test --test-name-pattern="GITHUB_CONFLICT|job archive|GITHUB_HANDOFF_GATE" test/cli/github.test.ts`
  → 7/7.

Before the round 1 fixes:
- `node adrian-rebuild/tools/gate.mjs`: `tsc --noEmit && biome check --error-on-warnings . && node --test …` ran
  through; the test run reported `ℹ tests 884`, `ℹ pass 884`, `ℹ fail 0` (`duration_ms 230037`). The run was piped
  through `tail`, so its exit code was not read directly; every step of the `&&` chain completed and no test failed.
  Two later edits were comment reflows in `src/job/abandoning.ts` and `src/job/record.ts`, after which
  `npx biome check --error-on-warnings .` and `npx tsc --noEmit` exited 0 again. The main session's own run on the
  final tree, before review round 1: exit 0, 884/884.
- `node adrian-rebuild/tools/check.mjs` → exit 0 (`PL summaries: 222 files; … 0 errors`, with this file in place).
- `npx biome check --error-on-warnings .` → exit 0 (`Checked 264 files … No fixes applied.`).
- Single files after the change (outside the gate's environment): `test/job/record.test.ts` 25/25;
  `test/cli/migrate.test.ts` 26/26; `test/cli/prune.test.ts` and `test/help.test.ts` 13/14 before the docs line, then
  green in the gate; `test/s9-housekeeping.test.ts` 8/8; `test/cli/abandon.test.ts`, `land`, `ticket` together 38/38
  after the I1 expectation below. Outside the gate, the 8 `github poll` tests of `test/cli/github.test.ts` fail with
  `unsafe owner or permissions on /tmp`, the private `TMPDIR` that `gate-env.mjs` sets; they pass in the gate.

## Fails before

### Round 2 fixes

Each command ran with the new or changed test in the tree and the code of the tree under review round 2 (before its
fix):

- G1: `node --test test/integrations/github-poller.test.ts` → 2 fail. The terminal reply: `actual: [ [
  'https://api.github.com/repos/acme/widget/issues/7/comments' ], false, false, true ]`, `expected: [ [ … ], true,
  true, false ]`; its body held `No result or check evidence recorded.` and `Inspect on the owning seat: \`limen show
  2026-11-20-pr-7-task-1a2b3c4d\``. The start reply: `actual: [ 2, true, false, true ]`, `expected: [ 2, true, true,
  false ]`; its body held `On its owning seat: \`limen show 2026-11-20-pr-7-task-1a2b3c4d\``.
- G2: `node --test --test-name-pattern="lacks the tip of the job's branch" test/cli/migrate.test.ts` → 1 fail: the
  run printed `job 2026-11-17-hand-3c4d5e6f: mark abandoned (limen/abandon/2026-11-17-hand-3c4d5e6f at f1459f0…,
  2026-11-23T02:38:23.000Z)` and `markers: 0 landed and 1 abandoned written; 0 finished jobs left without one`, and the
  record held the marker (`actual: [ { branch: 'limen/abandon/…', commit: 'f1459f0…', at: … }, false ]`, `expected:
  [ undefined, true ]`).
- G3: `node --test --test-name-pattern="land run again after a new commit" test/cli/land.test.ts` → 1/1 pass: a test
  only, which the F1 fix already meets (see `## Fixes of review round 2`).
- G4: `node --test --test-name-pattern="NOT_MIGRATED: ticket done" test/cli/ticket.test.ts` → 1 fail: the run exited 4
  with `{"class":"environment","code":"NOT_MIGRATED","next":"limen migrate --dry-run"}`, but the snapshot differed:
  `spec/features/active/F001-demo/ticket.md` was gone, `spec/features/done/2026-11/F001-demo/ticket.md` was there, and
  `spec/build.md` had another digest (the close was committed before the refusal).
- G5: `node --test --test-name-pattern="syncs the job archive's folder" test/cli/prune.test.ts` → 1 fail: `actual: [
  true, false, true, false ]`, `expected: [ false, true, false, true ]` (retire exited 0 and moved the job into the
  archive whose folder it never opened). `node --test test/atomic-write.test.ts` → the file fails to load:
  `SyntaxError: The requested module '../src/atomic-write.ts' does not provide an export named 'makeDurableFolder'`.
- G6: text.

### Round 1 fixes

Each command ran with the new or changed test in the tree and the code of the round under review (before its fix):

- F1: `node --test --test-name-pattern="land run again after a new commit" test/cli/land.test.ts` → 1 fail: the second
  land exited 5, `{"class":"internal","code":"MARKER_DIFFERS","next":null}`, `job … holds the landed marker 485fb5b…,
  not c31b616…` (`actual: [5, {sha: '485fb5b…'}]`, `expected: [0, …]`).
- F2: `node --test --test-name-pattern="in a workspace lists the abandon branch" test/cli/status.test.ts` → 1 fail:
  after the retire the status of the workspace printed no `Abandoned work` section (`actual: false, expected: true`
  for the header's index).
- F3: `node --test --test-name-pattern="ABANDON_BRANCH_LACKS_WORK" test/cli/abandon.test.ts` → 1 fail: abandon exited
  0 with `{class: 'ok', code: null}` and changed the snapshot (it marked the job with the hand-made branch's commit).
- F4: `node --test --test-name-pattern="last line gives the folder counts" test/cli/migrate.test.ts` → 1 fail: both
  runs ended with `nothing to do: every job folder holds a record`.
- F5: `node --test --test-name-pattern="names no job whose landed branch" test/cli/prune.test.ts` → 1 fail: the dry
  run printed `would retire 2026-11-23-commit-05c2fc4b to .limen/archive/2026-11/2026-11-23-commit-05c2fc4b`, while
  the run printed the `kept … it holds the registered worktree …` line and `no finished jobs to retire`.
- F6: `node --test --test-name-pattern="an archived job of another shape" test/cli/github.test.ts` → 1 fail: `next`
  was `limen show 2026-11-21-forged-1a2b3c4d`, and the message `conflicting job … for GitHub doorbell:
  acme/widget#104; inspect it before retrying` named no folder.
- F7: `node --test --test-name-pattern="ABANDON_BRANCH_LACKS_WORK|says that the branch is gone|a second abandon after
  all its steps" test/cli/abandon.test.ts` → the two F7 tests fail: after the branch was deleted, abandon made it
  again and exited 5, `{"class":"internal","code":"MARKER_DIFFERS","next":null}` (`holds the abandoned marker … at
  baed3c4…, not … at 98b8232…`); the second run printed `job … is saved on limen/abandon/… at …` instead of the
  `is abandoned` line.
- F8, F9, F11: text; F10: no behaviour change (see `## Fixes of review round 1`).

### Before the change (the first implementation)

Each command ran with the new tests in the tree and `src/` still at `HEAD` (before any source change):

- `node --test test/job/record.test.ts` → the file fails to load: `SyntaxError: The requested module
  '../../src/job/record.ts' does not provide an export named 'archivedJobs'` (also `writeMarker`).
- `node --test --test-name-pattern="job archive" test/job/reference.test.ts test/cli/stats.test.ts` → 2 fail:
  the draw took `cafebabe` (`actual: [ [ 'cafebabe' ], false ]`); stats read `1 record` and one job of 30 min with no
  tokens, against `2 records`, `1 h 00`, `1.0k`, `2.0k`.
- `node --test --test-name-pattern="job archive names that job|abandon/<id> branch of the project|marker step|markers
  the migration|second run after the marker" test/cli/github.test.ts test/cli/status.test.ts test/cli/migrate.test.ts`
  → 5 fail: github work started a new job `2026-11-23-pr-7-task-104-29ab2d9a` instead of naming the archived one;
  the migration wrote no marker (`[ [ undefined, undefined ], … ]`), its dry run gave `next` `null`; status printed no
  `Abandoned work` section.
- `node --test --test-name-pattern="nested repository has" test/cli/abandon.test.ts` → 3 fail: each printed
  `removed its worktree …` instead of the kept line.
- `node --test test/cli/prune.test.ts` → 4 fail: the failed job and the job with a deleted branch were retired by the
  graph; the landed job's folder was deleted (`[ false, false, [ 'retired 1 job', '' ] ]`); the abandoned job stayed.
- `node --test --test-name-pattern="landed marker|writes landed|without a marker" test/cli/land.test.ts
  test/cli/ticket.test.ts` → 3 fail: no `landed` field, and ticket done printed no line about the job.
- `node --test --test-name-pattern="abandoned marker" test/cli/abandon.test.ts` (the earlier implementer's three
  tests) → 3 fail: no `abandoned` field; the kept job was not listed; a hand-made `limen/abandon/<id>` took the job off
  `Unlanded work`.
- Not run alone at `HEAD`, failing there by construction: the changed line of `test/s9-housekeeping.test.ts:115`
  (retire deleted the hand-merged job's record), the changed golden line of `test/help.test.ts`, the changed
  `SHARED_WITH_UNMIGRATED` of `test/cli/migrate.test.ts`, the changed I1 expectation of `test/cli/abandon.test.ts`, and
  the scan of `test/structure.test.ts` (`src/job/reference.ts` lacks `archivedJobs`). `test/registry.test.ts` only drops
  `prune` from `WITHOUT_SUCCESS_TEST` because `test/cli/prune.test.ts` now holds `limen prune: …`; it holds no
  mechanism test and passes at `HEAD` once that file is laid over.

AC-9, the main session's `node adrian-rebuild/tools/fails-before.mjs` (every new or changed file under `test/`, over a
copy of `HEAD`) on the tree under review round 1 → exit 0, first line:

```
fails-before: test/cli/abandon.test.ts, test/cli/github.test.ts, test/cli/land.test.ts, test/cli/migrate.test.ts, test/cli/stats.test.ts, test/cli/status.test.ts, test/cli/ticket.test.ts, test/help.test.ts, test/job/record.test.ts, test/job/reference.test.ts, test/registry.test.ts, test/s9-housekeeping.test.ts, test/structure.test.ts, test/cli/prune.test.ts fail at HEAD (exit 1)
```

Its tail showed `test/s9-housekeeping.test.ts:232` failing (spawn refused `UNLANDED_WORK` for a job that R-030's
reading took as unresolved) and the scan of `test/structure.test.ts:1134` failing (`src/job/reference.ts`,
`src/job/statistics.ts` and `src/integrations/github-review.ts` lack `archivedJobs`). The main session's gate on that
tree: exit 0, 884/884 (203.6 s).

The main session's run after the round 1 fixes, on the tree under review round 2: exit 0, the same first line (the
same 14 files) and the same tail. The main session's gate on that tree: exit 0, 891/891 (211.7 s).

The main session's run after the round 2 fixes, on the tree under review round 3: exit 0, with
`test/atomic-write.test.ts` and the new `test/integrations/github-poller.test.ts` added (16 files) and the same tail:

```
fails-before: test/atomic-write.test.ts, test/cli/abandon.test.ts, test/cli/github.test.ts, test/cli/land.test.ts, test/cli/migrate.test.ts, test/cli/stats.test.ts, test/cli/status.test.ts, test/cli/ticket.test.ts, test/help.test.ts, test/job/record.test.ts, test/job/reference.test.ts, test/registry.test.ts, test/s9-housekeeping.test.ts, test/structure.test.ts, test/cli/prune.test.ts, test/integrations/github-poller.test.ts fail at HEAD (exit 1)
```

The main session's gate on that tree: exit 0, 900/900 (211.6 s).

## Night defaults

For Adrian to confirm in the morning (D-054 (2), category A (b): technical choices inside `## Change` that `taste.md`
does not settle):
1. Abandon writes `abandoned` whenever no worktree is left after it: also when the job's worktree was gone before it
   ran (the branch at the job's tip holds all there is). Read literally, "only when it removed the worktree" would leave
   such a job unresolvable for ever, against A-001's resolution by `limen abandon`; (h) uses the same condition, and the
   existing test "migrated finished jobs with unlanded work … limen abandon resolves each" needs it.
2. "The same value" of a marker is the same commit (and, for `abandoned`, branch); its `at` is not compared, and the
   first time stays, so every rerun writes nothing.
3. The two refusals of `writeMarker` are class `internal` (exit 5), codes `MARKER_NOT_FINISHED` and `MARKER_DIFFERS`,
   not declared in the registry: Limen's callers check both conditions first, so either means a record changed outside
   Limen.
4. `ticket done` marks only jobs that could hold landed work of their own: terminal, not a review (`role` reviewer),
   not a group member (`group` set), not a continued parent (standing `taken`), with at least one recorded commit, and
   no `landed` marker yet; its features are land's (`jobFeatures`), with the record's `commits` as the subjects, since a
   hand-merged branch has no commits outside HEAD left to read. Its `at` is midnight UTC of the day.
5. Retire's month is that of `landed.at`, else `abandoned.at`.
6. Retire deletes a landed job's own branch only while `unlandedBranches` finds no commit of it outside HEAD: the graph
   serves only as a guard of the branch deletion (`deleteLandedBranches` trusts its caller), never to choose a job. A
   job whose branch stays because its worktree is kept is not moved.
7. Retire prints the `kept` line for every finished job with unlanded work and a worktree, not only for marked ones,
   so the test at `test/s9-housekeeping.test.ts:146` stays unchanged.
8. The retire operation is a module of its own, `src/runtime/retiring.ts` (T-26 (2): the seat module holds prune and
   retire), and `src/commands/prune.ts` is its adapter; `pruning.ts` is over 500 lines already.
9. The migration reads closing commits from `git log HEAD` of the project's root (land commits its close there), takes
   the oldest for an id, and gives `abandoned` the committer time of the branch's commit, which is the save's time when
   abandon made the commit; its lines come before the final summary line, which says "nothing to do: …" only when no
   folder changed and no marker is written (since F4; night default 16).
10. The nested check runs `git rev-list --no-walk --branches --tags --reflog` in each nested repository that the saved
    commit records as a gitlink and that has a `.git`; a listing that fails counts as lacking (fail safe). It comes
    after `unsavedNested`, so R-030's H1 cause keeps its words.
11. Texts: the status header and line, the ticket-done lines, the migration lines, the retire lines, the kept cause
    `the nested repository <path> holds a branch, tag, stash or reflog entry at a commit that the project's repository
    lacks`, and the help: `remove finished worktrees; --retire moves landed and abandoned jobs to the job archive`,
    `--retire`: `retire each finished job marked landed or abandoned: move it to the job archive`, `--dry-run`: `with
    --retire: list the jobs it would retire, and move none`.
12. Place of the new tests (T-29): the retire tests in a new `test/cli/prune.test.ts`; the marker writer and the
    archive listing in `test/job/record.test.ts`.

Added by the round 1 fixes (the same category; the two defaults of the review round itself, AC-12's first clause and
F2's reading of (g), are in `ticket.md` → `## Decisions`):
13. F3: the save holds the job's work when the tip of the job's own branch is the abandon branch's commit or one of its
    ancestors (`git merge-base --is-ancestor`); every commit of the job's unlanded work is reachable from that tip, so
    this one check covers them. It runs only for a record with no marker whose worktree is gone, as F3 says; a job with
    no own branch has no commit to check. With the worktree there, the tree comparison of step (2) already keeps it.
14. F3: the code is `ABANDON_BRANCH_LACKS_WORK`, class `refused` (exit 1), and `next` is null: `limen abandon <id>`
    would refuse again until a person moves the branch, and `next` never names a command that refuses (T-37, D-046
    (1)); the message names the branch, its commit, the tip and `git branch -m`.
15. F7: the line of a marked job has three forms by where the marker's branch points now: at the marker's commit (`its
    work is on …`), gone (`…; that branch is gone`), or elsewhere (`…; that branch is at <tip> now`), since Limen never
    moves or deletes it and a false "is on" would mislead (z. 10). The run still closes the job's Herdr tab, the step a
    stop may have left, which changes nothing when it is closed.
16. F4: with markers written, or with `--dry-run` to be written, and no folder changed, the last line is the folder
    count line, `0 migrated, 0 moved to .limen/unmigrated, 0 finished, <n> already records`, the line a run that changed
    a folder already ends with; the marker count line above it says what was written.
17. F5: the dry run decides each landed branch by the run's own rules (`landedBranchDecision`) without the worktree
    lock, `git worktree prune` or any delete; it also prints the `kept` line of each worktree the run would keep, and
    its count of deleted branches stays 0, so it prints no `deleted … landed branch` line.
18. F6: the message for an archived job is `conflicting job <id> for <marker> in the job archive, <folder>; inspect that
    folder before retrying`, the folder from the project's root; a job in `.limen/jobs/` keeps its message and `next`.
19. F2: `workspaceRepositories` takes the immediate child folders with a `.git` whose `git rev-parse --show-toplevel` is
    the folder itself, hidden names included, as `workspaceRepository` accepts them; it lives in `src/project/git.ts`
    beside `workspaceRepository`.
20. F11: the flag line is `retire each job marked landed or abandoned, unless it holds unlanded work`; "the job archive"
    stays in the command's summary, which `limen prune --help` prints right above it, so the line fits in 100
    characters with its indent.

Added by the round 2 fixes (the same category):
21. G1: the start reply also names the archived job's folder instead of `limen show <id>`, through the same
    `inspection` as the terminal reply. G1 names the terminal reply; the start reply of a job the poller first finds in
    the archive (the R-099 case) named the same refusing command, which this ticket's archive lookup made reachable.
    The words are `its folder in the job archive, \`<folder>\``, the folder from the project's root, as F6's message.
22. G1: `matchedGithubJob` adds `archived` only for a job in the archive, so its result for a job in `.limen/jobs/`,
    which `test/cli/old-hosted.test.ts` compares whole and `promptCoordinator` prints, stays as it was.
23. G1: the tests call `reconcileGithubClaim`, the poller's own test seam, in the test's process with `fetch` mocked,
    in a new `test/integrations/github-poller.test.ts` (T-29 (1)), not through `limen github poll`: the poll refuses a
    key file below a world-writable folder, so its CLI tests pass only inside the gate's private `TMPDIR`, and these
    tests must run alone too.
24. G2: in the migration the job's own branch is the record's `branch`, unless the job is a review, as
    `src/job/unlanded.ts` reads it, without abandon's rule that the record be the newest on that branch: the step reads
    the records the folder steps leave, which a dry run has not written. A newer job on the same branch normally adds
    commits to it, so there the check asks the save to hold those too. A job whose own branch is gone gets the marker,
    as F3 has it (night default 13). The check is one function, `holdsTip` in `src/job/unlanded.ts`, which abandon now calls
    too.
25. G4: the jobs are read in validate through the view and held (`view.hold`), so the runner reads them again under
    the ticket-lanes lock before the commit, and a job whose standing changed in between ends the command in
    `STATE_CHANGED` with nothing written. Only a close that commits reads them, since only it marks jobs; the read is
    the one that the marker write used to make after the commit, so the jobs it marks and the lines it prints are
    unchanged.
26. G5: `makeDurableFolder` always syncs the folder that holds the target, here `.limen/archive/` with the month's name,
    also when the month's folder was there, since an earlier run may have made it and failed before its sync; above
    that it syncs only the folders above the ones it made, so `.limen/` only when the archive is new. The retire test
    asserts a non-zero exit, the job's record still in `.limen/jobs/`, and `EACCES` on stderr, not the exit class:
    prune's file system failures exit 1 `UNTYPED`, as its registry entry is moved by R-032 and its untyped failures are
    R-082's.

## Deviations from the ticket

- `test/cli/abandon.test.ts`, "a worktree abandon kept for a nested commit the project lacks survives the next prune":
  the prune's line is now `kept … (job <id>): unlanded work`, not R-030's nested cause, since a kept worktree leaves the
  job unresolved (D-088); the worktree and the nested commit still survive.
- `test/s9-housekeeping.test.ts:54`: the cleanup at its end removes the live job's scratch worktree by hand and
  abandons only the unmerged job; abandon kept the live job's worktree for the registered worktree inside it, which no
  longer resolves the job.
- Changed signatures beyond the named lines: `commitPaths` returns `{sha, short}`, `applyTicketClose` and
  `closeTickets` return `TicketsClosed`, `branchesBelow` returns a map with each short commit, `markedJob` returns
  `{id, jobDir}`; new git readers `namesUnsavedCommit`, `headHistory`, `committerTime`.
- Round 1 fixes: `Standing`'s `abandoned` is the record's marker, not a boolean (F7); `markedJob` returns `MarkedJob`,
  `{id, jobDir, archived}` (F6); new exports `workspaceRepositories` and `isAncestor` (`src/project/git.ts`) and
  `plannedLandedBranches` (`src/runtime/pruning.ts`); the local type `Abandoned` of `src/job/abandoning.ts` is renamed
  `Applied`, since it met the record's `Abandoned`. The changed expectation of the existing test "a second abandon
  after all its steps prints the branch, exits 0 and changes nothing" follows F7's line. The docs lines listed under
  `## Fixes of review round 1` go beyond F8, because the fixes made them false or incomplete.
- Round 2 fixes: the start reply of an archived job changes with the terminal one (night default 21), beyond G1's
  words. `matchedGithubJob` may return `archived`; `markTicketJobs` takes the jobs `ticketDoneJobs` (new, with the
  type `TicketJob`) read, and `ticketDoneOperation`'s plan and result carry them; `TicketsClosed` loses `codes`, which
  round 1 added for `markTicketJobs` and which nothing reads now; new exports `makeDurableFolder`
  (`src/atomic-write.ts`), `holdsTip` (`src/job/unlanded.ts`) and the type `UnsavedBranch` (`src/job/migration.ts`),
  and `MarkerStep` gains `unsaved`; abandon's `branchTips` calls `holdsTip` instead of `isAncestor`. The docs lines
  listed under `## Fixes of review round 2` and the header comment of `src/atomic-write.ts` go beyond G1–G6, because
  the fixes made them incomplete.

## Unmeasured

- `limen stats` over the job archive on the seat's real records: unmeasured here (M-03, M-06, M-07, M-11; `## Deployment`
  B.3 and 9.1).
- The marker step of `limen migrate` on the seat's projects (`## Deployment` 3.6): unmeasured here; its report is the
  evidence there.
- G5: that the synced names of the archive survive a real crash or power loss is unmeasured; no metric of
  `## Measurement` covers it, and the tests prove only that the syncs run before the move.
- G1: the replies the seat's poller posts on GitHub for a retired job are unmeasured here (no M-NN); the tests answer
  GitHub in the test's process.

## Open points

For gate 5.3, as review round 1 assigned them (`review.md` → Round 1, findings 3, 5 and 8):
1. Finding 3: `prune` still deletes the folder of a record that never started and whose spawner is gone, and a folder
   without a record (`removeUnstartedRecords`, `src/runtime/pruning.ts`), which this ticket does not touch; AC-12's
   first clause is read within the ticket's scope (the night default of `ticket.md` → `## Decisions`), and Adrian
   confirms that reading or gives the path a ticket.
2. Finding 5: `ticket done` writes its markers after its commit, outside its operation; since G4 its validate reads
   the jobs, so a refusal of that read comes before the commit, but a failure of a marker write itself still exits
   with its error after the commit, leaves the jobs unmarked and unretired with nothing lost, and a rerun refuses
   `NO_ACTIVE_TICKET`, while the migration reads only land's closing subjects, so such a job stays without a marker
   until a later ticket.
3. Finding 8: retire renames a job's folder under the jobs lock but not the job's own lock, so a `writeMarker` beside it
   can race the move; a write that loses fails loud (the lock's `mkdir` makes a folder with no record, which
   `writeMarker` refuses) and the archived record keeps its marker. R-032 makes retire a timer step, where the race is
   routine.

Still open from the first implementation:
4. The hooks, `limen sweep` and the alerts read `.limen/jobs/` only, so a job retired before its completion wake or its
   alert went out loses them. Markers come after the coordinator acted on a job, so the window is small; R-032, which
   makes retire a step of the daily sweep, may order it after the owed wakes.

Closed by the round 1 fixes: the abandon run again after a person deleted `limen/abandon/<id>` (F7), and the second
read of each record by `limen status` (F2, which reads Git alone for the abandon branches).

From the round 2 fixes:
5. T-27 (1): the poller's `reconcile` (`src/integrations/github-poller.ts`) keeps its two "split pending"
   suppressions; G1 changes three lines in it and splits nothing, as R-003 and R-028 kept theirs (R-082, R-083).
6. A sync that fails in retire (G5) exits 1 `UNTYPED`, the path of every file system failure of prune until R-032
   and R-082, and leaves the month's new folder empty in the archive, which no reader counts as a job; the job stays
   in `.limen/jobs/`, and a rerun moves it.

From review round 3 (`review.md` → Round 3; both rounds of fixes were spent, so neither is fixed here; Q-42 in
`.night/questions.md` asks where they go):
7. Note 1: the poller reads a job's record and then its `result` and `log` without a lock, so a retire between the
   two reads still sends the read to `.limen/jobs/<id>/` after the move, and the one terminal reply says "No result or
   check evidence recorded." with `limen show <id>`; G1 closed only the case of a job first found in the archive.
8. Note 3: `abandonedOf` names two functions with two meanings, the validator of the record's `abandoned` field
   (`src/job/record.ts`) and the migration's evidence of an abandon (`src/job/migration.ts`), against T-25 and T-18;
   no check fails yet, since the scan of duplicate function names is not in `npm run check`.

Review: FAIL in round 1 (three blocking findings), PASS in rounds 2 and 3, with two rounds of fixes by fresh
implementers; the first reply of rounds 2 and 3 was rejected by `review-verdict.mjs` for its form and given again by
a fresh reviewer with the tree unchanged. The main session fixed round 3's two text notes (`docs/jobs.md`,
`docs/commands.md`, this file) with no further round (D-053 (2)).
