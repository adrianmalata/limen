<!-- PL: Wynik R-030 (22.11, zamknięty po pięciu rundach recenzji i czterech rundach poprawek: F1–F8, G1–G9, H1–H3
i I1, dwie ostatnie z decyzji Adriana D-087 i D-088):
niewylądowana praca zakończonego joba przeżywa. `src/job/unlanded.ts` jest jedynym odczytem tej pracy; prune (od
najgłębszych), `land` i `prune --retire` jej nie usuwają i wypisują jedną linię `kept <worktree> (job <id>): <powód>`,
spawn workera odmawia `UNLANDED_WORK` (spawn naprawczy w worktree joba przejmuje jego pracę), a `limen status` ma
sekcję „Unlanded work”. `limen abandon <id>` zapisuje stan na `limen/abandon/<id>` i usuwa worktree tylko, gdy gałąź
ma całą jego treść i prune mógłby go usunąć; worktree z commitem zagnieżdżonego repozytorium, którego nie ma w
magazynie obiektów projektu, zostaje przy każdym usuwaniu (jedna funkcja), a ścieżki w liniach `kept` mają uciekane
znaki sterujące; bramka 787/787, check.mjs i Biome z kodem 0. -->

# R-030 outcome

## Done

(The definitions) `src/job/unlanded.ts` (new) is the one reading of unlanded work (T-25 (1)) that prune, spawn,
`limen status` and `limen abandon` share:
- `jobStanding(root, id, reader)` and `unlandedWork(root, reader)`, where the reader is a validate's `StateView` or the
  records themselves. A record's standing is `unfinished` (not terminal), `group` (a member of an open group, named
  `<feature> (<id>)`), `taken` (a newer record names the same worktree: `by` is that record), or `finished` with its
  `Work` and whether `limen/abandon/<id>` exists.
- `Work`: the worktree when a checkout is there, the paths `git status` lists in it (`worktreeChanges`, below), and the
  job's own branch when this record is the newest non-reviewer record that names the branch in its repository, with the
  count of its commits outside HEAD when `unlandedBranches` (the ancestry and patch-id test of fact 2) says the branch
  is unlanded (0 otherwise; round 1, F3, needs the branch name of a job with only a dirty worktree too). A review job
  never holds a branch. "Newest" is the later `startedAt` (else the first transition), then the later id.
- Resolved: the branch landed (no commit outside HEAD) and the worktree is clean or gone; a newer record took the
  worktree; or `limen/abandon/<id>` exists (read once per repository with `for-each-ref`, `branchesBelow`).
- `unlandedSummary(work)`: `<n> changed file(s), <m> unlanded commit(s)`, the wording spawn and status share.
- `src/project/git.ts`: `worktreeChanges(cwd, job)` (`git --no-optional-locks status --porcelain -z
  --untracked-files=all`, undefined when no checkout is there, any other Git failure `GIT_FAILED`, exit 4, with the
  message `the worktree <path> of job <id> cannot be read: <git's words>`, round 1, F6), `dirtyPaths` now shares its
  parser; `gitlinks(cwd, treeish)` (the mode-160000 entries of `ls-tree -r`, round 1, F1);
  `commitsOutsideHead`, `branchTip`, `branchesBelow`, `treeOf`, `worktreeTree` (through `GIT_INDEX_FILE`: `read-tree
  HEAD`, `add -A`, `write-tree`), `commitTree` (`commit-tree … -p <HEAD> -m …`) and `createBranchOnce` (`update-ref
  refs/heads/<branch> <commit> ""`, create-only). `git()` and `requireGit()` take an optional environment.

(a) Prune (`src/runtime/pruning.ts`):
- `pruneFinishedWorktrees` returns `{ removed, kept }`. Under the worktree lock, `prunePass` (round 1, F2) first reads,
  before anything moves, which candidates hold unlanded work: the worktree of a job with unresolved unlanded work
  (`unlandedWork`) or one where `worktreeChanges` lists anything, whatever job names it or none. Then it visits the
  candidates deepest first: what a kept job keeps stays, with what is inside it; a held candidate stays, with what is
  inside it; a candidate that still holds a registered worktree below it once those were decided stays too (its rename
  would take that worktree with it); the rest are moved out of reach. Each kept worktree gives one line, `keptLine`:
  `kept <worktree> (job <id>): unlanded work` (`job none` when no record names it). `limen prune` prints the removal
  lines, then the kept lines, then its summary line as before; the setup prune of a spawn (`pruneForJob`) writes the
  kept lines to the new job's log. `removalCandidates` returns the candidates and every registered worktree, and the
  rule of what prune may remove is one function, `removable` (not the primary checkout, not locked, below the worktree
  root outside its dot entries).
- `deleteLandedBranch` (land, `--retire`) keeps a branch whose holding worktree `git status` shows dirty, and returns
  that worktree with its job (`BranchResult.worktree`); land prints `keptLine` for it (round 1, F5); the check runs
  inside its `try`, so a Git failure keeps the branch and the worktree and says why. `BranchUse.worktrees` maps each
  path to the job that left it.
- `--retire` (`src/commands/prune.ts`) skips every job that `unlandedWork` lists, and prints `keptLine` for the
  worktree of each job it keeps so and for each worktree `deleteLandedBranches` kept, with or without `--dry-run`
  (round 1, F5).
- For abandon: `removalBlock(repository, path)` (round 1, F2 and F4) says why prune could not remove a worktree (Git
  does not register it, it is the primary checkout, Git locks it, it lies outside the worktree root, or it holds
  another registered worktree), through `removable`; `removeWorktree(repository, path)` is prune's rename to
  `.pruned-<uuid>` and `git worktree prune`, failing loudly, and returns that trash path; `removeTrash(path)` deletes
  one trash entry as `emptyTrash` deletes each. `worktreeGuard(jobsRoot)` (`src/job/publication.ts`) names the lock
  `worktreeLock` takes, for an operation's `lock`.

(b) `limen abandon <id>` (`src/commands/abandon.ts`, a thin adapter through `operationHandler`; `src/job/abandoning.ts`):
- Registry entry after `stop`: object `job`, kind `change`, public, summary "give up on a job and keep its work on a
  branch" (T-19), schema `[JOB]`, no `ids`, `irreversible: true`, example `limen abandon a1b2c3d4`, refuses `IN_PROJECT`,
  `OWN_JOB` and its own `JOB_CONTINUED`, `JOB_IN_GROUP`, `JOB_NOT_FINISHED`, `NO_UNLANDED_WORK`.
- Validate (no writes): `resolveJob(…, "control")`, then holds the job's standing with the tips of `limen/abandon/<id>`
  and of its own branch. Refusals: `JOB_NOT_FINISHED` (`next` `limen stop <id>`), `JOB_IN_GROUP` (`next` null, the
  message names the group), `JOB_CONTINUED` (`next` `limen abandon <newer id>`), `NO_UNLANDED_WORK` when it holds
  nothing and no `limen/abandon/<id>` exists (`next` `limen prune`).
- Apply, under the worktree lock: (1) unless the branch exists, `commitTree(worktreeTree(worktree, <temp index>),
  HEAD of the worktree, "limen abandon <id>")` and `createBranchOnce(repository, limen/abandon/<id>, commit)`; with no
  worktree, the branch at the job's own branch's tip. The temporary index lives in `mkdtemp(<os tmpdir>/limen-abandon-)`
  and is removed after. (2) The worktree, if it is there, is removed with `removeWorktree` unless `keptBecause` names
  a cause: `worktreeTree` of it differs from the tree of the branch's commit; a nested repository holds what the commit
  does not (`nestedWork`, round 1, F1: a gitlink of the commit's tree that the worktree's HEAD tree does not hold at the
  same commit, or a nested repository whose own `git status` lists anything); a nested commit the project's object store
  lacks, also at HEAD's commit (round 3, H1; since round 4, I1, `unsavedNested`, the rule every removal shares); or
  `removalBlock` (round 1, F2, F4). The
  branch is written either way. After the lock: `removeTrash` of the one trash entry this run made (round 1, F4), then
  (3) `settleJobTab(jobDir)`, the closer that finalize uses (T-18). (4) The text: `saved job <id> on limen/abandon/<id>
  at <commit>` (or `job <id> is saved on … at …` when an earlier run made it), then `removed its worktree <path>` or
  `kept <path> (job <id>): <cause>` (round 1, F5), the cause one of `it changed after the save, so limen/abandon/<id>
  does not hold its state`, `the nested repository <path> holds commits|changes that limen/abandon/<id> does not`, `it
  holds the registered worktree <path>`, `Git locks it`, `it is the primary checkout`, `it is outside the worktree
  root <root>`, `Git does not register it as a worktree`. Run again after all steps it prints the saved line alone and
  exits 0; `next` is null.

(c) Spawn (`src/job/spawning.ts`): `validateSpawn` calls `checkNoUnlandedWork` for role `worker` only, after the ticket
check and before the member slot. It holds `unlandedWork(root, view)` with `view.hold`, so a job that leaves work before
apply ends the spawn in `STATE_CHANGED`; with any work it throws `UNLANDED_WORK` (class refused, `next` `limen status`)
whose message is:

```
a finished job holds unlanded work; a worker spawn refuses until each is continued or abandoned:
  <id> (<state>): <n> changed files, <m> unlanded commits
    limen continue <id> "instruction", or limen abandon <id>
```

Reviewer (`--review`), keeper and team-coordinator spawns skip it. `UNLANDED_WORK` is declared in spawn's `refuses`.
A worker spawn with `--branch` on the own branch of an unresolved job (the repair spawn of `templates/agents.md`,
A-015, A-035) leaves that job out of the check (round 1, F3): it reuses the job's worktree, or makes one on the branch
when it is gone, and its record is then the newest on both, so it takes the work over; every other unresolved job still
makes it refuse. The manual's lines are unchanged.

(d) `limen status` (`src/project/summary.ts`): after `Needs a decision`, when any job holds unlanded work, the section

```
Unlanded work (spawn refuses until each is continued or abandoned):
  <id> · <state> · <n> changed files, <m> unlanded commits[ · repo <repo>]
    limen continue <id> "instruction"
    limen abandon <id>
```

whatever the job's age, migrated records included; the worktrees are read with `--no-optional-locks`.

(e) Text: `docs/jobs.md` (the `failed` row, `### Finished jobs` with a paragraph on unlanded work, the prune table with a
row for `limen abandon`, a paragraph on abandon and its refusals, `### Continue a finished job`), `docs/commands.md`
(the spawn refusal, the status section, the `Land and clean up` usage block and its paragraphs on land, abandon and
prune, the setup prune sentence, and the registry sections regenerated from the registry), `templates/agents.md` (the
`limen status` line, a new `limen abandon` line, the prune line with the refusal and the retire skip, "Dead wrapper"
and "Bad candidate"), and `templates/.history/agents.md` (the new hash, dated 2026-11-22, as R-026 did). Round 1: the
same paragraphs of `docs/jobs.md` and `docs/commands.md` say what F1–F6 changed (the deepest-first prune, the one
`kept` line of land and `--retire`, abandon's causes for keeping a worktree, the repair spawn, the message of a worktree
Git cannot read), and `docs/herdr-status.md` says that `--retire` skips a job with unlanded work and prints a `kept`
line for its worktree (F8).

(Review round 1) The fixes F1–F8 of `ticket.md` → `## Decisions` → "Review round 1":
- F1 (`src/job/abandoning.ts` `nestedWork`, `src/project/git.ts` `gitlinks`): abandon keeps and names the worktree when
  the commit's tree holds a gitlink that the worktree's HEAD tree does not hold at the same commit, or when a nested
  repository's own `git status` lists anything; the branch is still written.
- F2 (`src/runtime/pruning.ts` `prunePass`, `removalBlock`): prune visits its candidates deepest first, reads which hold
  unlanded work before anything moves, and keeps a candidate that still holds a registered worktree below it; abandon
  keeps and names a worktree that holds another registered worktree.
- F3 (`src/job/spawning.ts` `checkNoUnlandedWork`, `src/job/unlanded.ts` `Work.branch`): a worker spawn with `--branch`
  on the own branch of an unresolved job leaves that job out of its check; the others still refuse it.
- F4 (`removalBlock`, `removable`, `removeWorktree`, `removeTrash`): abandon removes only a registered worktree that is
  not the primary checkout, not locked and under the worktree root, and deletes only the trash entry it made.
- F5 (`keptLine` with an optional cause, `BranchResult`, `src/job/landing.ts`, `src/commands/prune.ts`): one line
  `kept <worktree> (job <id>): <reason>` from prune, the setup prune, land, `--retire` and abandon; Deviation 3 goes.
- F6 (`worktreeChanges(cwd, job)`): `GIT_FAILED` as before, with the worktree and its job named before Git's words.
- F7: the comment above `done` in `test/s5-land.test.ts` says that the first test starts the jobs the others land.
- F8: `docs/herdr-status.md` names `--retire`'s skip.

(Review round 2) The fixes G1–G9 of `ticket.md` → `## Decisions` → "Review round 2":
- G1 (`src/runtime/pruning.ts` `registeredBelow`, `deleteLandedBranch`): land and `--retire` keep a worktree that holds
  another registered worktree below it, by the one test that prune (`prunePass`) and abandon (`removalBlock`) use now
  too (T-25).
- G2 (`prunePass`): a held worktree inside another held one prints its own `kept` line; a clean one inside a held one
  still stays without a line (Deviation 11, narrowed).
- G3 (`registeredBelow`): a worktree kept only because a registered worktree lies below it says so: `kept <worktree>
  (job <id>): it holds the registered worktree <path>`, from prune, land and `--retire` as from abandon;
  `docs/commands.md` and `docs/jobs.md` say so.
- G4: a test of F1's second cause (no code change).
- G5 (`src/job/unlanded.ts` `Takeover`, `takesOver`; `src/job/spawning.ts`): a worker spawn with `--branch` takes over an
  unresolved job only when it reuses that job's worktree (the spawn's worktree choice is `reuse` at that path) or the
  job's worktree is gone; a job whose worktree is there without the branch checked out still makes the spawn refuse.
- G6 (`src/boundary.ts` `shownField`, now exported and reused): `keptLine` escapes the worktree's path, and
  `registeredBelow` and abandon's `nestedWork` escape the paths their causes name, as `JSON.stringify` writes control
  characters (with the further escapes `shownField` adds for DEL, C1, U+2028, U+2029 and format characters), so a
  folder name a job chose cannot add a line (z. 15). `docs/jobs.md` says so.
- G7: the comment of `branchFacts` (`src/job/unlanded.ts`) and `## Unmeasured` count the Git processes right.
- G8: `docs/commands.md` shows the ` · repo <repo>` suffix of the status line of a workspace job.
- G9: `## Deviations` is numbered in order, Deviation 10 marked accepted.

(Review round 3) The fixes H1–H3 of `ticket.md` → `## Decisions` → "Review round 3" (D-087):
- H1 (`src/project/git.ts` `hasObject`, `src/job/abandoning.ts` `nestedWork`): abandon also keeps and names the worktree
  when a gitlink of the saved tree names a commit that the job's repository's object store lacks (`git cat-file -e
  <oid>` there), also when the worktree's HEAD records that gitlink at the same commit, as when the job committed a
  clean embedded repository itself; the cause is `the nested repository <path> holds commits that limen/abandon/<id>
  does not`, the path escaped (G6), and the branch is still written. `hasObject` answers yes only on exit 0, so a
  gitlink it cannot check keeps the worktree. The header of `src/job/abandoning.ts`, the comment of `nestedWork` and
  the abandon paragraph of `docs/jobs.md` say so.
- H2: `docs/commands.md` ("Unlanded work first") states G5's condition: the spawn takes over a job only when it reuses
  that job's worktree or the job's worktree is gone.
- H3: (f) gives one test count for `test/cli/abandon.test.ts`, the true one.

(Review round 4) The fix I1 of `ticket.md` → `## Decisions` → "Review round 4" (D-088):
- One function decides whether a worktree holds state the project's repository cannot hold: `unsavedGitlink(cwd,
  repository)` (`src/project/git.ts`) gives the first nested repository whose commit the project's object store lacks
  (`hasObject`): a gitlink (mode 160000) of the worktree's HEAD tree (`gitlinks`) or of its index (`ls-files -s`, the
  new `indexGitlinks`), or the commit a nested `.git` at such a path has checked out (its working tree). A commit it
  cannot check, or a nested `.git` whose HEAD it cannot read, counts as lacking, so it fails safe. `unsavedNested(path,
  repository)` (`src/runtime/pruning.ts`) turns it into the cause `the nested repository <path> holds a commit that the
  project's repository lacks`, the path escaped (G6).
- Every removal uses it, so such a worktree is kept like a dirty one, whatever job names it and whether or not the job
  is resolved: prune and the setup prune (`heldCandidates`, split out of `prunePass` with `passJob` to stay under
  Biome's complexity limit; it runs only on a checkout Git reads and only when `git status` shows it clean), land and
  `prune --retire` (`keptHolder`, split out of `deleteLandedBranch`: dirty, then `unsavedNested`, then
  `registeredBelow`), and abandon (`keptBecause`: after `nestedWork`, which no longer calls `hasObject` itself, so the
  object-store rule has one definition). Each prints `kept <worktree> (job <id>): <cause>`.
- The header of `src/job/abandoning.ts`, the comment of `nestedWork`, `docs/jobs.md` (the "Unlanded work stays"
  paragraph, keeping the main session's sentence on G5's condition, and the abandon paragraph) and `docs/commands.md`
  (prune, land and abandon) say so.
- `nestedJob` moved from `test/cli/abandon.test.ts` to `test/plant.ts`, with an option `done` (the job ends done, so
  it can land), since the land test uses it too.

(f) Tests:
- `test/s9-housekeeping.test.ts`: the first test now spawns the two commit jobs after the other spawns, merges `landed`
  before the prune and asserts that prune keeps `unmerged`'s worktree with its `kept` line (fact 7 reversed); at its end
  it abandons `unmerged` and `live` (whose worktree holds the files of the nested `limen init`), since the next tests
  spawn workers. New: "prune keeps the worktree of a failed job that holds an untracked file and says why" (A-001's
  experiment) and "prune --retire keeps the record, branch and worktree of a landed job whose worktree holds an
  untracked file" (round 1, F5: it also asserts the `kept` line); from round 1 (F2): "prune keeps a clean finished
  worktree that holds a registered worktree with an untracked file, and keeps both" (the reviewer's probe; since G3 the
  outer line names the registered worktree as its cause); from round 2: "prune names the registered worktree below as
  the cause when it keeps a clean worktree only for it" (G3, a locked inner worktree) and "prune names a dirty worktree
  inside another dirty one with a kept line of its own" (G2).
- `test/cli/abandon.test.ts` (new, 18 tests): the success test `limen abandon: …`, the nothing-lost test (every changed,
  deleted and untracked file byte for byte, no ignored file), the run-again test (snapshot unchanged), a rerun after a
  stop between (1) and (2), a rerun that keeps a worktree changed after the save (its line now `kept <worktree> (job
  <id>): …`), the Herdr tab close with a fake Herdr, the four `CODE:` tests with the shared snapshot, the migration
  fixture of `## Migration`, and, from round 1: "abandon keeps and names a worktree whose nested repository holds a
  commit and an untracked file the save does not" (F1, the reviewer's `vendor/lib` probe), "abandon keeps and names a
  worktree that holds another registered worktree" (F2), "abandon keeps and names a Git-locked worktree, and still
  writes its branch" (F4); from round 2: "abandon keeps and names a worktree whose nested repository, at the commit
  HEAD records, holds changes of its own" (G4) and "abandon escapes a control character in the nested repository's
  path, so its kept line stays one line" (G6, a folder `vendor/li<newline>b`); from round 3: "abandon keeps and names
  a worktree whose nested repository's commit, recorded at HEAD, the project's object store lacks" (H1, the round-3
  reviewer's probe: `vendor/lib` with its own commit, committed as a gitlink in the worktree, no untracked file; the
  worktree stays, the nested commit is still in its `.git`, and the branch is written). The nested repositories of F1,
  G4, G6 and H1 come from one helper, `nestedJob`, whose options say whether the job commits the gitlink, whether the
  nested repository is a clone of the project (so its commit is in the project's object store too) and whether it
  holds an untracked file; since H1, G4 uses such a clone, so that its line still names the changes of the nested
  repository and not its commits. Since I1 the H1 test expects the shared cause, `the nested repository vendor/lib holds
  a commit that the project's repository lacks`. From round 4 (I1): "a worktree abandon kept for a nested commit the
  project lacks survives the next prune, which names it" (round 4's probe: H1's setup, `limen abandon`, then `limen
  prune`, which prints the `kept` line; the nested commit is still there).
- `test/cli/spawn.test.ts`: two `UNLANDED_WORK:` tests (a dirty zero-commit failed job; a done job with an unlanded
  commit, with `--branch`), each with the shared snapshot; a reviewer spawn beside unlanded work starts; from round 1
  (F3): "a repair spawn on a reviewed candidate's own branch starts and takes over the candidate's worktree" (the
  reviewer's probe) and "UNLANDED_WORK: a repair spawn on a candidate's own branch beside another job with unlanded work
  exits 1, names only that job and leaves the snapshot identical"; from round 2 (G5): "UNLANDED_WORK: a spawn on the own
  branch of a job whose dirty worktree has the branch no longer checked out exits 1 and leaves the snapshot identical".
- `test/cli/status.test.ts`: the section's golden lines for a dirty failed job and an 8-day-old done job with a commit;
  from round 1 (F6): "limen status exits 4 with GIT_FAILED when git cannot read a finished job's worktree, and names
  the worktree and its job" (a corrupt index).
- `test/cli/continue.test.ts`: a continuation takes its parent's work: a worker spawn starts while it runs, and status
  names the continuation alone afterwards.
- `test/cli/land.test.ts`: land keeps the worktree with an untracked file, and its branch, and says why (round 1, F5:
  the line is `kept <worktree> (job <id>): unlanded work`, and the test checks that the branch is still there); from
  round 2 (G1): "land keeps a landed job's clean worktree that holds a registered worktree with an untracked file, and
  names it"; from round 4 (I1): "land keeps a landed job's clean worktree whose nested repository holds a commit the
  project lacks, and names it" (a done job that committed a clean `vendor/lib` as a gitlink; the nested commit is still
  there).
- `test/registry.test.ts` (`IRREVERSIBLE` gets abandon; `JOB_NOT_FINISHED` leaves `WITHOUT_CODE_TEST`),
  `test/help.test.ts` (the help golden), `test/structure.test.ts` (T-20 (4) counts 11 job commands).
- Resolved where the test is not about it: `test/s1-spawn.test.ts` (abandons the detached job of its second test),
  `test/s3-finish-wake.test.ts` (the two jobs that commit block until all three spawned, then are released and
  abandoned at the end), `test/s5-land.test.ts` (`startCandidates`: after the first test's refusals the failed job is
  abandoned and the candidates `a`, `ticket` and `b` start while `running` still runs, then all four are released;
  `amend` commits in the job's own worktree when it is there, else in a worktree of its own as before).

## Proof

All from the repository root. The main session's own runs on the final tree (they count, not the implementer's):
`node adrian-rebuild/tools/gate.mjs` → exit 0, 787/787 (184.7 s); `node adrian-rebuild/tools/fails-before.mjs` →
exit 0 (the twelve files below); `npx biome check --error-on-warnings .` → exit 0; `node adrian-rebuild/tools/check.mjs`
→ exit 0. Review: FAIL, PASS, FAIL, FAIL, PASS in rounds 1–5 (`review.md`); rounds 3 and 4 of fixes by Adrian's
D-087 and D-088. After round 5 the main session fixed two text notes in `docs/jobs.md` (`:138`, G5's condition; `:147`,
the three causes of a kept worktree). The implementer's runs:
- `node adrian-rebuild/tools/gate.mjs` → exit 0; tests 787, pass 787, fail 0, cancelled 0, skipped 0 (752 before this
  ticket, per R-026; 19 new tests, 7 more from round 1, 6 from round 2, 1 from round 3 and 2 from round 4), `duration_ms 181679` (AC-7).
- `node adrian-rebuild/tools/check.mjs` → exit 0, "… 0 errors" (AC-8).
- `npx biome check --error-on-warnings .` → exit 0, "Checked 258 files … No fixes applied." (AC-8); `npx tsc --noEmit`
  → exit 0.
- `npx biome check --error-on-warnings adrian-rebuild` → exit 0 (after this file).
- AC-1 `node --test test/s9-housekeeping.test.ts` → exit 0 (8/8).
- AC-2 `node --test test/cli/abandon.test.ts` → exit 0 (18/18).
- AC-3 `node --test test/cli/spawn.test.ts` → exit 0 (22/22).
- AC-4 `node --test test/cli/status.test.ts` → exit 0 (14/14); `node --test test/cli/continue.test.ts` → exit 0 (13/13).
- `node --test test/cli/land.test.ts` → exit 0 (4/4).
- AC-5 `node --test test/registry.test.ts` → exit 0 (31/31); `node --test test/help.test.ts` → exit 0 (10/10).
- AC-6 `node adrian-rebuild/tools/fails-before.mjs` → exit 0 (below).
- AC-9 (judgment): the removal paths of `src/` are `prunePass` (the unlanded, dirty and nested-commit check of
  `heldCandidates`, read before anything moves, and the registered-worktree check, deepest first, before `detach`),
  `deleteLandedBranch` (the dirty, nested-commit and registered-worktree check of `keptHolder` before `detach`; its callers, land and `--retire`, pass only landed branches, and `--retire`
  skips jobs with unlanded work), `removeUnstartedRecords` (removes only records; their worktrees go through `prunePass`) and `removeWorktree`,
  whose one caller, abandon, runs it only after the branch exists, only while the worktree's tree equals the branch's
  and no nested repository holds more (`nestedWork`, `unsavedNested`), and only for a worktree that prune itself could
  remove (`removalBlock`).

## Fails before

`node adrian-rebuild/tools/fails-before.mjs` → exit 0:

```
fails-before: test/cli/continue.test.ts, test/cli/land.test.ts, test/cli/spawn.test.ts, test/cli/status.test.ts,
test/help.test.ts, test/registry.test.ts, test/s1-spawn.test.ts, test/s3-finish-wake.test.ts, test/s5-land.test.ts,
test/s9-housekeeping.test.ts, test/structure.test.ts, test/cli/abandon.test.ts fail at HEAD (exit 1)
```

Per test, the same copy of `HEAD` with the new tests laid over it (a scratch script that builds it as
`fails-before.mjs` does and runs the files in the gate's environment):
- `test/s9-housekeeping.test.ts`, 3 of 5 fail: the first test (`AssertionError: pruned …/2000-01-stale-aaaaaaaa …`: the
  prune output has no `kept` line, because `unmerged`'s worktree was removed); "prune keeps the worktree of a failed job
  …" (`ENOENT: … /2026-11-22-say-partial-b44a221f/wip.txt`: A-001's experiment, the file is gone); "prune --retire
  keeps …" (`ENOENT: … /2026-11-22-commit-3ebad3c5/notes.txt`).
- `test/cli/abandon.test.ts`, 11 of 11 fail: `unknown command "abandon"`, exit 2 (`UNKNOWN_COMMAND`); the migration
  fixture fails first at the status listing (`Needs a decision (0):` where the section is expected).
- `test/cli/spawn.test.ts`, 2 of 19 fail: both `UNLANDED_WORK:` tests (`0 !== 1`, the spawn starts with class `ok`).
  The reviewer test passes at `HEAD`, since nothing refused a spawn there; it guards that the new refusal does not
  reach reviewers.
- `test/cli/status.test.ts`, 1 of 13 fails: the new test (the status has no `Unlanded work` section).
- `test/cli/continue.test.ts`, 1 of 13 fails: the new test, at its status assertion (no section, so no line names the
  continuation).
- `test/cli/land.test.ts`, 1 of 2 fails: the new test (the output has no `kept branch` line; the worktree went).
- `test/registry.test.ts`: "T-28 (3): the irreversible entries …" (no `abandon` entry); `test/help.test.ts`: the general
  help golden (no `abandon` line); `test/structure.test.ts`: T-20 (4) (`count: 10` against 11).
- `test/s1-spawn.test.ts`, `test/s3-finish-wake.test.ts` and `test/s5-land.test.ts` fail at `HEAD` because their new
  `limen abandon` calls meet `UNKNOWN_COMMAND` (s5's later tests follow from its first); they are not tests of this
  mechanism.

### Review round 1

Before the fixes, each new test of round 1 ran on a copy of `HEAD` with the round-1 diff the reviewer read
(`node_modules/.rebuild-review/R-030.diff`, `git apply` exit 0) and the current test files laid over it, in the gate's
environment (a scratch script); all 9 tests that F1–F6 add or change fail there (tests 9, pass 0, fail 9):
- F1 "abandon keeps and names a worktree whose nested repository …": `ENOENT: … /2026-11-22-fail-3-7fd7a750/
  vendor/lib/wip.txt`: the worktree went with the nested repository's untracked file (and its own commit).
- F2 "prune keeps a clean finished worktree that holds a registered worktree …": `ENOENT: …
  /2026-11-22-say-clean-39f0d990/.limen/inner/wip.txt`; "abandon keeps and names a worktree that holds another
  registered worktree": the output says `removed its worktree …` and the inner worktree is gone.
- F3 "a repair spawn on a reviewed candidate's own branch …": `spawn failed (1): a finished job holds unlanded work …`;
  "UNLANDED_WORK: a repair spawn … names only that job …": `2 finished jobs hold unlanded work …` (the candidate is
  named too).
- F4 "abandon keeps and names a Git-locked worktree …": `removed its worktree …`, and the worktree is gone.
- F5: the land test (the output has `kept branch …`, not the `kept <worktree>` line) and the retire test (`no finished
  jobs to retire`, with no `kept` line).
- F6 "limen status exits 4 with GIT_FAILED …": the message is Git's alone (`fatal: …/index: index file smaller than
  expected`).

`node adrian-rebuild/tools/fails-before.mjs` after round 1 → exit 0, the same twelve files fail at `HEAD`.

### Review round 2

The same way, over `HEAD` with the round-2 diff the reviewer read (`node_modules/.rebuild-review/R-030-2.diff`, `git
apply` exit 0) and the current test files laid over it (tests 7, pass 1, fail 6):
- G1 "land keeps a landed job's clean worktree that holds a registered worktree …": the output has no `kept` line (the
  worktree went, the registered one inside with it).
- G2 "prune names a dirty worktree inside another dirty one …": the inner worktree's line is missing (the summary line
  stands where it is expected).
- G3 "prune names the registered worktree below as the cause …" and the F2 test with its new expectation: the line ends
  in `unlanded work`, not `it holds the registered worktree …/.limen/inner`.
- G5 "UNLANDED_WORK: a spawn on the own branch of a job whose dirty worktree has the branch no longer checked out …":
  `0 !== 1`, the spawn started on a new worktree of that branch and changed the snapshot.
- G6 "abandon escapes a control character …": the kept line breaks in two at the newline of `vendor/li<newline>b`.
- G4 "abandon keeps and names a worktree whose nested repository, at the commit HEAD records, holds changes of its own"
  passes there, as the review decided (a new test of the code of F1).

`node adrian-rebuild/tools/fails-before.mjs` after round 2 → exit 0, the same twelve files fail at `HEAD`.

### Review round 3

The same way, over `HEAD` with the round-3 diff the reviewer read (`node_modules/.rebuild-review/R-030-3.diff`, `git
apply` exit 0) and the current `test/cli/abandon.test.ts` laid over it, the tests of H1 and G4 (tests 2, pass 1, fail
1):
- H1 "abandon keeps and names a worktree whose nested repository's commit, recorded at HEAD, the project's object store
  lacks": `AssertionError`, the line is `removed its worktree …/2026-11-22-fail-3-cae23938`, not the `kept … (job …):
  the nested repository vendor/lib holds commits that limen/abandon/… does not` line; the worktree and the nested
  commit, which lived only in its `.git`, were gone.
- G4, now on a nested clone of the project, passes there too: its cause is the nested repository's untracked file,
  which the round-3 code already caught.

`node adrian-rebuild/tools/fails-before.mjs` after round 3 → exit 0, the same twelve files fail at `HEAD`.

### Review round 4

The same way, over `HEAD` with the round-4 diff the reviewer read (`node_modules/.rebuild-review/R-030-4.diff`, `git
apply` exit 0) and the current `test/cli/abandon.test.ts`, `test/cli/land.test.ts` and `test/plant.ts` laid over it,
the two tests of I1 and the H1 test (tests 3 and `test/plant.ts`, which holds none; pass 1, fail 3):
- "a worktree abandon kept for a nested commit the project lacks survives the next prune, which names it":
  `AssertionError`, prune printed `pruned …/2026-11-22-fail-3-3dce1ac1 (job 2026-11-22-fail-3-3dce1ac1): job failed`
  and no `kept` line: the worktree and the nested commit were gone.
- "land keeps a landed job's clean worktree whose nested repository holds a commit the project lacks, and names it":
  `AssertionError`, land's output (`Updating 65bf202..1d14059 …`) has no `kept` line: it removed the worktree.
- The H1 test fails there only at its new expectation of the shared cause (the round-4 code wrote `… holds commits
  that limen/abandon/<id> does not` and kept the worktree, as H1 did).

`node adrian-rebuild/tools/fails-before.mjs` after round 4 → exit 0, the same twelve files fail at `HEAD`.

## Deviations

1. Branch ownership (an interpretation): the ticket defines who holds a worktree (the newest record that names it). The
   job's branch commits count for the newest non-reviewer record that names the branch in its repository, so a spawn
   with `--branch limen/<id>` after the worktree was gone (a new worktree on the same branch) moves the branch's work to
   the new job, as a continuation moves both.
2. A group record that `jobMembership` refuses to read (gone, malformed, the job not on its roster) counts as no open
   group in `unlanded.ts` (`openGroup` turns that refusal into "none"), so the job's work counts and nothing is lost;
   prune's own `jobKeeps` still throws on it as before. Status, which already swallowed such errors, keeps working.
3. Replaced in round 1 by F5: land and `--retire` print the one `kept <worktree> (job <id>): unlanded work` line.
4. Step (1) makes its commit also when the worktree is clean (the tree equals HEAD's), as the ticket says ("a commit of
   the worktree's whole state on top of the worktree's HEAD"); `git log` of the branch then shows `limen abandon <id>`
   on top of the job's tip.
5. The setup prune writes its `kept` lines only to the new job's log, not to the log of the job whose worktree stays
   (removal lines go to both, as before): one line in the kept job's log per later spawn would grow it with no news.
6. `limen prune`'s summary line is unchanged (`no finished worktrees` / `pruned N finished worktrees`); it counts
   removals only, and the `kept` lines come before it.
7. Abandon closes the job's tab through `settleJobTab`, which reads the place in `herdr/` (the watch or log tab); a diff
   tab that `limen diff` opened (`herdr/diff`) stays, as at a job's end.
8. `worktreeChanges` fails with `GIT_FAILED` (exit 4) on a worktree Git cannot read, where `worktreeState` reads that as
   dirty: in spawn, status, abandon and prune the command fails and removes nothing (T-01); in `deleteLandedBranch` the
   failure becomes the kept reason. Since round 1 (F6) the message names the worktree and its job first.
9. The message and status lines write `limen continue <id> "instruction"`: `continue` needs an instruction, and
   `"instruction"` is the word the help's usage line shows; it is prose, not a `next`.
10. Accepted in review round 2 (note 4): a nested repository with no commit makes `git add -A` fail, so abandon's
   step (1) fails with `GIT_FAILED` (exit 4) and writes nothing; a nested repository in an ignored folder is not in the
   commit and goes with the worktree as ignored files do (A-001's Decision saves "not ignored ones"; Decision 4),
   unless it is a registered worktree, which F2 keeps.
11. Round 1 (F2), narrowed in round 2 (G2): a clean worktree inside a worktree that stays for its unlanded work stays
   with it without a line of its own, as one inside a kept job's worktree does; a dirty one there prints its own line.

## Unmeasured

- `unmeasured` M-10: the gate's run time grows with 35 tests, and every worker spawn and setup prune now reads `git
  status` of each finished worktree that is there (and, for a clean one prune or land would remove, `ls-tree -r`,
  `ls-files -s`, and a `cat-file -e` per gitlink and a `rev-parse` per nested repository), plus, per repository, at
  most four Git processes for the branches, one `rev-list` for each unlanded branch and one `for-each-ref` for the
  abandoned ones; measured at the stage close.
- `unmeasured` M-06: lead time may include the time a coordinator spends resolving unlanded jobs before a spawn; 9.1.
- The seat's effect (how many old jobs block worker spawns) is `## Deployment` 3.6, not a metric.

## Open points

- T-28 (5): the main session added the check of a real tab close to `## Deployment` 3.6 (review round 1, finding 8).
- `templates/.history/agents.md` dates the new hash 2026-11-22, the day of the commit expected.
- `src/commands/prune.ts`'s `--dry-run` usage refusal is still an untyped `Error` (R-032's command), unchanged.
- To R-031's notes (`plan.md` → `## Tickets`, D-088; review round 4, note 2): the nested-repository test reads only the
  gitlink's commit and the nested status, never its other branches, stash or reflog.
- To R-032's notes (D-088; review round 5, notes 2–4): a gitlink with no nested `.git` keeps its worktree (a project
  with a registered submodule removes no worktree; nothing is lost); a clean candidate with no commit at `HEAD` fails
  the whole prune with Git's words only; a gitlink path with a tab is cut in the `kept` line.
