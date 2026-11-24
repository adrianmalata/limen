<!-- PL: Ticket R-101 (dzienna połowa podziału D-094 (1); A-024, A-002, D-096 (1), D-097 (4), notatki D-092): prune,
retire i zamykanie pozostawionych kart Herdr stają się dziennymi krokami `limen seat sweep` (raz na dobę na projekt,
ze znacznikiem czasu po udanym przebiegu); `limen prune` i `limen close` odmawiają (exit 2, `next: limen seat sweep`),
prune przy starcie joba znika, a nic, czego Git nie trzyma gdzie indziej, nie jest kasowane: rekordy, które nie
wystartowały, foldery bez rekordu, `.publishing-<id>` i obce foldery w katalogu worktree idą do archiwum. Do tego
gitlinki, `jobKeeps`, wyścigi retire i dwie nazwy `abandonedOf`. Stan: napisany 24.11 przy drzewie R-032 (przed jego
commitem), z inwentarza `evidence/inventories/R-032.md` odświeżonego przez agenta tylko do odczytu; decyzje w
`## Decisions`. -->

# R-101 Prune, retire and leftover Herdr tabs are steps of the sweep; nothing is deleted

## Problem

Finding A-024, its Decision quoted from `audit.md`: "One seat timer `limen-sweep` on the agents' account across all
registered projects: every minute the reaper (A-005), quota resume (A-016) and owed wakes; daily prune and `--retire`.
…" (the minute half is R-032's, done). Finding A-002: "`--retire` takes only jobs with a marker, never from the git
graph, and moves the record to `.limen/archive/YYYY-MM/<id>/` with one `rename`; only an explicit human command deletes
the archive. … The daily sweep runs `--retire` (§6)."

Plan decisions the change relies on:
- D-094 (1): "the new R-101 takes the daily steps: prune and retire as steps of the sweep, the `prune` command's removal
  (its old name), the archive instead of deletion (z. 29), the gitlink notes (D-088), `.publishing-<id>`, `jobKeeps`,
  the retire races (the poller's reads, the job's own lock, after owed wakes and alerts) and `abandonedOf`; so R-032's
  notes in `## Tickets` on those subjects are R-101's."
- D-096 (1): "the daily step of `limen seat sweep` that closes leftover Herdr tabs (T-18 (1)) is R-101's: it closes the
  recorded tabs (`herdr/`, `herdr/diff/`) of the finished jobs whose features are all closed (the rule of today's
  `limen close FNNN`, for every closed feature), the coordinator's own tab skipped; R-101 cuts `limen close` (exit 2,
  `next: limen seat sweep` …), gains API `herdr`, and step 3.9 checks that the sweep's unit reaches Herdr; R-103 keeps
  the `cleaned` step."
- D-097 (4), settled for R-101 (items marked (A) were named for Adrian's attention and stand):
  (a) "the daily steps (prune, retire, the leftover Herdr tabs) run inside the minute run of `limen seat sweep`, per
  project, when that project's last successful daily run is more than 24 h old, from a time stamp in the project's
  `.limen/` written after its daily steps succeed (absent: due; a failed step writes none, so the next minute tries
  again, T-02); a manual run runs what the timer runs";
  (b) "`limen prune` exits 2 with `next: limen seat sweep` (its `movedBy` goes); `--dry-run` goes with the command,
  since an archive move can be undone (z. 29); `abandon`'s `NO_UNLANDED_WORK` names `limen seat sweep`";
  (c) "(A) the setup prune at a job's start (`src/runtime/job-setup.ts`, `pruneForJob`, `LIMEN_SETUP_KEEP`) goes, so
  the sweep is prune's one caller (T-26 (2), T-04); R-103's `cleaned` step removes a landed job's worktree";
  (d) "(A) "nothing is deleted" means nothing Git does not hold elsewhere: a clean worktree … and a landed branch whose
  tip is in the target's history … are removed as today; a record that never started, a folder with no record and
  `.limen/.publishing-<id>` (past the 10-minute grace, its spawner gone, under the worktree lock) move to
  `.limen/archive/<YYYY-MM>/<id>/` (the month of `startedAt`, else of the move) under the jobs lock with a read again,
  as retire moves; and a folder in the worktree root that Git does not register and that has no `.git`, which
  `prunePass` deletes today with all it holds …, moves into the project's archive under a folder whose name is no
  month, so no reader takes it for a job";
  (e) "`jobKeeps` keeps a terminal job's worktree while its scope is not ended";
  (f) "the gitlink notes (D-088) change the shared `unsavedGitlink` for every caller (T-25): a gitlink counts only where
  a nested `.git` is there, a candidate whose `HEAD` has no commit is named in the failure, and `-z` entries are read
  whole";
  (g) "(A) retire takes a job whose `landed` or `abandoned` marker is at least 24 h old, so the owed wakes and alerts of
  a job's end go out first …, with no new state";
  (h) "retire also takes the job's own lock …; the GitHub poller, when its read of `result` or `log` misses, finds the
  job once more, in the archive too, so its reply does not say "No result"";
  (i) "the two `abandonedOf` functions get two names (T-25, T-18), chosen by the ticket";
  (j) "`seat sweep` is not `irreversible` …; retire and the archive moves get tests of running again and of nothing
  lost (T-28 (3))";
  (k) "the leftover Herdr tabs as D-096 (1), closed synchronously with `closeJobTab`'s bound and one retry, a tab that
  does not close a line and the step recorded …; `limen close` exits 2 with `next: limen seat sweep`";
  (l) "`docs/seat/limen-prune.*` go, and the prune text of the docs and of `templates/agents.md` (its new first hash in
  `templates/.history/agents.md`) follows."
- Notes in `## Tickets` that D-094 (1) gives to R-101 (headed "R-032"): the `starting` record with no pid and
  `.publishing-<id>` (D-080; R-099 open points 7, 8); the gitlink notes (D-088; R-030 round 5, notes 2–4); `jobKeeps`
  while a terminal job's scope may be active (R-027 Out of scope; the rest of that note is done by R-032); the poller's
  reads, `abandonedOf`, retire's lock and the owed wakes (D-092; Q-42; R-031 round 3 and open points 3, 4);
  `removeUnstartedRecords` deletes (D-092; R-031 open point 1). And R-101's own note (R-032 review round 3, note 7):
  two tests of `test/cli/sweep.test.ts` claim more than their mechanism (`:217` registers a second project no assertion
  reads; `:374` also asserts the reap).
- Rules: T-18 (old names exit 2 naming the new form; one word per thing), T-25, T-26 (2), T-28 (3), T-01, T-02, z. 29
  (archive instead of delete), D-079 (optional record fields), D-039 (no `movedBy` naming this ticket).

Facts at the working tree of R-032 (before its commit; the R-032 inventory's section 3 was made at `6d17130`, and a
read-only agent re-located it; `src/runtime/pruning.ts` is unchanged since then):
1. `src/runtime/pruning.ts` (549 lines): `pruneForJob` `:75-88`, `pruneFinishedWorktrees` `:89-104` (calls
   `removeUnstartedRecords` at `:95`), `jobKeeps` `:110-120` (`:111-113` keeps a non-terminal job or a retained group
   job, not a terminal job with a live scope), `deleteLandedBranches` `:138-154`, `removeUnstartedRecords` `:278-305`
   (`rm(jobDir, { recursive: true, force: true })` at `:299`), `pruneRepositoryWorktrees` `:313-334`, `prunePass`
   `:351-376`, `removalCandidates` `:437-462`, `trashPath` and `emptyTrash` `:528-538`.
2. Callers: `src/commands/prune.ts:3`, `src/runtime/job-setup.ts:6` and `:30` (`pruneForJob`, gated by
   `LIMEN_SETUP_KEEP`, `src/config.ts:41-44`, set at `src/job/spawning.ts:273`, `:481`), `src/runtime/retiring.ts:15`,
   `:45`, `src/job/landing.ts:25`, `:104`, `src/job/abandoning.ts:25`, `:208`, `:240-242`. `sweeping.ts` calls neither
   prune nor retire.
3. Registry: `prune` `src/registry.ts:577-593` with `movedBy: "R-101"` (`:591`; `test/registry.test.ts:41`,
   `:289-294`); `close` `:667-687` with `movedBy: "R-037"` (`:685`); `src/commands/close.ts:6-8` calls
   `closeFeatureTabs`. Old names: `OLD_NAMES` (`src/old-names.ts:59`), R-032's `sweep` entry (`:157-164`) the pattern.
4. Retire (`src/runtime/retiring.ts`): `retireMarkedJobs` `:36-57` under `jobsLock` only (`:55`), `markedJobs`
   `:63-75`, `moveJobs` `:110-126`. The archive: `archiveMonth` (`src/job/record.ts:379-381`), `archivedJobs`
   (`:387-396`) skips folders whose name is no month.
5. `.limen/.publishing-<id>`: built at `src/job/publication.ts:90`, renamed under the worktree lock at `:116`, removed
   only in the `catch` at `:117-119`; `jobFolderNames` (`record.ts:331-339`) hides it.
6. Gitlinks: `unsavedGitlink` `src/project/git.ts:346-363`; `indexGitlinks` `:366-368` splits entries at a tab;
   `gitlinks` `:380-386`.
7. Readers that race a retire: the GitHub poller (`src/integrations/github-poller.ts:307`, `:405`, `:413` "No result or
   check evidence recorded.", `:428-432`); `abandonedOf` twice: the record field's validator (`src/job/record.ts:1082`,
   used at `:1139`) and the migration's evidence (`src/job/migration.ts:258`, used at `:218`).
8. Herdr: `closeFeatureTabs` (`src/integrations/herdr.ts:180-213`) throws plain `Error`s, skips the caller's
   `HERDR_TAB_ID`, closes a recorded tab only when Herdr lists it with the job's label (`:197`), uses `call`'s default
   bound (180 s) with no retry, and does not ask whether the job finished; `closeJobTab` (`:61-87`: a 10 s bound, one
   retry after 1 s) returns `void` and writes only the job's log. Places are recorded by `recordPlace` (`:389-397`)
   under `herdr/` and `herdr/diff/`; every place is a tab Limen created (`createTab`, modes `watch`, `log`, `diff`).
   `closedJobFeatures` (`src/job/job.ts:173-176`) counts a job only when all its named features are closed.
9. `abandon`'s `NO_UNLANDED_WORK` names `limen prune` (`src/job/abandoning.ts:176-180`; `test/cli/abandon.test.ts:537-545`).
10. The sweep: `sweepProject` (`src/runtime/sweeping.ts:192-216`), projects in parallel (`:146`), one
    `TimeoutStartSec=300` for the run (`src/platform/systemd-units.ts:40`); `.limen/last-sweep` is the wake hook's
    tick stamp (`hook/wake.ts:717`), not a sweep stamp. The unit's `PATH` is R-034's (D-097 (5) (j)).
11. Text: `docs/seat/limen-prune.service`, `docs/seat/limen-prune.timer` (named by `docs/seat/README.md:7`, `:66-68`
    and `docs/seat/agent-setup.md:192-199`); prune text in `docs/jobs.md:137`, `:143-145`, `docs/commands.md:64`,
    `:233-244`, `templates/agents.md:105`, `docs/remote.md:60`, `:71`, `docs/herdr-status.md:15`, `:72`,
    `docs/groups.md:95`; comments `src/runtime/pruning.ts:2`, `src/integrations/github-claims.ts:345`,
    `hook/wake.ts:1233`.

## Change

(a) Daily steps in `sweepProject`, after the minute steps: when the project's stamp `.limen/daily-sweep` (an ISO time,
written atomically) is absent or more than 24 h old, the run does prune, retire and the leftover tabs, in that order,
and writes the stamp only when all three succeed; a failed step is named, writes no stamp, and the next minute tries
again. A manual `limen seat sweep` runs what the timer runs.

(b) Prune (`src/runtime/pruning.ts`), with the sweep as its one caller besides land and abandon:
- removes as today what Git holds elsewhere: a clean worktree and a landed branch whose tip is in the target's history;
- moves, never deletes: a record that never started whose spawner is gone, a folder with no record, and
  `.limen/.publishing-<id>` past the 10-minute grace with its spawner gone (under the worktree lock), each into
  `.limen/archive/<YYYY-MM>/<id>/` (the month of `startedAt`, else of the move) under the jobs lock with a read again;
  a folder in the worktree root that Git does not register and that holds no `.git` moves into the project's archive
  under a folder whose name is no month (`.limen/archive/unregistered/<name>-<time>/`);
- `jobKeeps` also keeps a terminal job's worktree while its scope is not ended (`holdsProcesses`' cgroup reading, T-25);
- `unsavedGitlink` (for every caller): a gitlink counts only where a nested `.git` is there, a candidate whose `HEAD`
  has no commit is named in the failure, and `-z` entries are read whole.
- The setup prune goes: `pruneForJob` from `src/runtime/job-setup.ts` and the knob `LIMEN_SETUP_KEEP` (`src/config.ts`,
  its setters in `src/job/spawning.ts`).

(c) Retire (`src/runtime/retiring.ts`) takes a job whose `landed` or `abandoned` marker is at least 24 h old, under the
jobs lock and the job's own lock; the GitHub poller, when its read of `result` or `log` misses, finds the job once more
(in the archive too) before it replies.

(d) Leftover tabs: for every finished job whose features are all closed (`closedJobFeatures`), its recorded tabs
(`herdr/`, `herdr/diff/`) that Herdr lists with the job's label are closed, synchronously with `closeJobTab`'s bound and
one retry; `closeJobTab` returns whether the tab closed, and a tab that does not close is an output line while the step
counts as done. The label check skips every tab that is not the job's, the coordinator's among them; a manual run from
a Herdr pane also skips its own `HERDR_TAB_ID`. Herdr not available is one line, and the step is done.

(e) Old names and registry: `limen prune` and `limen close` exit 2 (`REMOVED`) with `next: "limen seat sweep"`
(`OLD_NAMES`, as R-032's `sweep`), their entries, `src/commands/prune.ts` and `src/commands/close.ts` go (`git rm`), and
`--dry-run` with them; `abandon`'s `NO_UNLANDED_WORK` names `limen seat sweep`. No entry has `movedBy: "R-101"`. Help and
the generated sections of `docs/commands.md` follow.

(f) The two `abandonedOf`: the record field's validator becomes `abandonedMarker` and the migration's evidence
`abandonEvidence` (T-18), each with its callers.

(g) Cuts and text: `git rm` of `docs/seat/limen-prune.service` and of `docs/seat/limen-prune.timer`; the text of fact 11 follows
(`templates/agents.md` with its new first hash in `templates/.history/agents.md`).

(h) Tests, each failing before the change:
- `test/cli/sweep.test.ts`: the daily steps run when the stamp is absent or old and not when it is fresh; a failed step
  writes no stamp; a second run within 24 h does no daily step; R-032's two tests of note 7 check one mechanism each.
- `test/runtime/pruning.test.ts` (new, or the cases in `test/cli/sweep.test.ts` if the implementer keeps them there):
  each archive move of (b), with a test that nothing is lost (the moved folder's files byte-identical) and that a
  second run moves nothing; `jobKeeps` with a live scope; the three gitlink cases.
- `test/cli/prune.test.ts`: becomes the old-name test of `prune`, or its cases move to `test/cli/sweep.test.ts`
  (`git rm` named in `outcome.md`).
- `test/cli/old-names.test.ts`: `prune` and `close` exit 2 naming `limen seat sweep`.
- `test/cli/abandon.test.ts`: `NO_UNLANDED_WORK` names `limen seat sweep`.
- Retire: a marker younger than 24 h is kept; a retire runs under the job's lock; the poller's second lookup in the
  archive.
- Herdr: a closed feature's finished job's tab closes; a tab with another label stays; a tab that does not close is a
  line and the step is done.
- `test/registry.test.ts`: no `movedBy: "R-101"`; `test/structure.test.ts`: no `LIMEN_SETUP_KEEP`.

## Out of scope

- Land's `cleaned` step and its tab close (R-103); `limen diff` and `limen open` (R-103).
- The quota resume and owed wakes (R-034), the seat rules (R-102), foreign timers (R-060).
- Deleting the archive: only an explicit human command does (A-002); no such command comes here.

## Acceptance

- AC-1: `node --test test/cli/sweep.test.ts` → exit 0; `node --test test/cli/old-names.test.ts` → exit 0.
- AC-2: `node --test test/cli/abandon.test.ts` → exit 0; `node --test test/registry.test.ts` → exit 0.
- AC-3: `node --test test/structure.test.ts` → exit 0; `node --test test/help.test.ts` → exit 0.
- AC-4: `git grep -q 'movedBy: "R-101"' -- src/registry.ts` → exit 1.
- AC-5: `git ls-files --error-unmatch docs/seat/limen-prune.service` → exit 1; `git ls-files --error-unmatch
  src/commands/close.ts` → exit 1.
- AC-6: `git grep -q 'LIMEN_SETUP_KEEP' -- src` → exit 1.
- AC-7: `node adrian-rebuild/tools/fails-before.mjs` → exit 0, its output in `outcome.md` → `## Fails before`.
- AC-8: `node adrian-rebuild/tools/gate.mjs` → exit 0.
- AC-9: `npx biome check --error-on-warnings .` → exit 0; `node adrian-rebuild/tools/check.mjs` → exit 0.
- AC-10 (judgment): the sweep is the one caller of prune and retire besides land and abandon; nothing Git does not
  hold elsewhere is deleted (every other removal is a move into the archive, tested byte for byte); the daily steps
  run once a day per project and again after a failure; leftover tabs of closed features close, and no tab that is
  not the job's.

## Migration

- `limen prune` and `limen close` exit 2 and name `limen seat sweep` (`test/cli/old-names.test.ts`); the seat's old
  `limen-prune` timers were disabled on 2026-11-17, and step 3.1 checks that none is listed.
- `.limen/daily-sweep` is new; absent means due. The `unregistered/` archive folder is new and has no month name, so
  `archivedJobs` skips it.
- Folders a previous prune would have deleted are moved from the first daily run on; nothing to migrate.

## Risk

- The first daily run after the deployment does a whole prune and retire in one minute run (`TimeoutStartSec=300`); a
  run cut there writes no stamp and goes on at the next minute.
- Retire's 24 h wait keeps finished folders one day longer in `.limen/jobs/`.
- Herdr unreachable from the unit (`PATH`, D-097 (5) (j)) leaves tabs open with one line a day; step 3.9 checks it.

## Rollback

`git revert $(git log --format=%H --grep='^R-101:' adrian-rebuild --)`. Folders moved into the archive stay there and
are read as before (`archivedJobs`); the `unregistered/` folder is ignored by the old code; `.limen/daily-sweep` is
ignored by the old code.

## Decisions

Settled by the documents when the ticket was written (2026-11-24, the main session's reading; D-097 (4) settles the
mechanism; items 2 and 4 are named for Adrian's attention at gate 5.3):
1. The stamp's name, `.limen/daily-sweep`, because `.limen/last-sweep` is the wake hook's tick stamp (fact 10).
2. The coordinator's tab (D-096 (1)): skipped by today's label check, since every recorded place is a tab Limen created
   for a job and a reused tab id carries another label; a timer has no `HERDR_TAB_ID`, so that skip remains only for a
   manual run from a pane.
3. The archive folder of an unregistered worktree folder is `.limen/archive/unregistered/<name>-<time>/` (D-097 (4) (d):
   "a folder whose name is no month").
4. The names of the two `abandonedOf` (D-097 (4) (i)): `abandonedMarker` (the record field) and `abandonEvidence` (the
   migration), each saying what it reads.
5. Herdr from the unit: R-034 sets the unit's `PATH` (D-097 (5) (j)); both land in a0.3.0, so step 3.9 checks the
   tab close after both, and R-101 needs no `PATH` of its own.
6. `close`'s `movedBy` is `R-037` at this tree; R-037 (earlier in the protocol order) or this ticket removes it with the
   entry, and AC-4 checks only `R-101`.
