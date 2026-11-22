<!-- PL: Ticket R-030 (A-001): niewylądowana praca zakończonego joba przeżywa. Prune nigdy nie usuwa brudnego
worktree ani worktree joba z niewylądowanymi commitami, dopóki job nie zostanie rozwiązany; nowe `limen abandon <id>`
zapisuje stan na gałęzi `limen/abandon/<id>`, dopiero wtedy usuwa worktree i zamyka kartę Herdr joba; spawn workera
odmawia (`UNLANDED_WORK`), dopóki taki job istnieje, a `limen status` je wymienia. Stan: napisany 22.11 przy `9da2fde`
z inwentarza `evidence/inventories/R-030.md`, tego samego dnia sprawdzony ponownie z `taste.md` (T-04, T-18, T-19).
Po rundach 1 i 2 recenzji (22.11) `## Decisions` ma poprawki F1–F8 (m.in. zagnieżdżone repo przy abandon, naprawa
przez spawn na gałęzi kandydata) i G1–G9 (m.in. ta sama ochrona przy land, ucieczka znaków sterujących w ścieżkach);
po rundzie 3 decyzja Adriana D-087 daje trzecią rundę poprawek H1–H3 (gitlink do commitu spoza bazy obiektów repo
zatrzymuje worktree), a po rundzie 4 decyzja D-088 daje czwartą rundę z jedną poprawką I1 (jedna funkcja „worktree
trzyma stan, którego repo nie pomieści” dla prune, land, `--retire` i abandon). -->

# R-030 Unlanded work survives: `limen abandon`, a guarded prune, a refusing spawn

## Problem

Finding A-001 (critical), its Decision quoted from `audit.md`: "fix — Prune never touches the worktree of a finished
job with unlanded work (changes or commits outside `main`) until it is resolved. Resolutions: `limen continue <id>` in
the same worktree, or `limen abandon <id>`, which first commits the state (changes and untracked files, not ignored
ones) to `limen/abandon/<id>` and then removes the worktree. A new worker spawn in the project refuses while an
unresolved job with unlanded work exists, naming both commands. Fix `docs/jobs.md:44`, `templates/agents.md:224`."

Its evidence: "`jobKeeps` keeps only `return !isTerminal(state) || retainedGroupJob(jobDir);`. No
`worktreeState`/`dirtyPaths` check runs before `detach` renames the worktree to `.pruned-<uuid>` and `emptyTrash`
runs `rm -r`. Every spawn runs this in `setUpJob` […], and the seat timer runs it daily." An experiment: a failed job
with an untracked file, then `limen prune` → `pruned 1 finished worktree`, exit 0, the file gone.

`## Deployment` 3.6, quoted: "`limen status` lists finished jobs with unlanded work; resolve each with `limen continue
<id>` or `limen abandon <id>` before the next spawn (R-030)". A plan note (`## Tickets`): "R-030: from R-068 on, a job
in `needs-decision` does not block worker spawns for other tickets (T-05 (5))." T-28 (3), quoted: "Operations that
cannot be undone or that move data […]: also a test of running them again and a test that nothing is lost (z. 29,
A-002)." The neighbour R-031 adds the `landed` and `abandoned` markers to the record and moves retired records to an
archive (A-002's Decision); R-032 brings the sweep and read-only reads. T-18, quoted: "closing Herdr tabs is part of
the `cleaned` step of `land`, `ticket done`, `ticket drop` and `abandon`"; T-19 gives the summary of `abandon`: "give
up on a job and keep its work on a branch". T-04, quoted: "Read commands […] never write and never wait."

Facts at `9da2fde` (the read-only inventory `adrian-rebuild/evidence/inventories/R-030.md`; the main session checked
the ones it quotes):
1. `src/runtime/pruning.ts:59` is the keep rule above; no dirty or unlanded check exists in `pruning.ts`. Its callers:
   `limen prune` (`src/commands/prune.ts:17`), `--retire` (`prune.ts:79-101`: `unlandedBranches`,
   `deleteLandedBranches`, `rm` of the record folder), every spawn's setup (`src/runtime/job-setup.ts:30`,
   `pruneForJob`), `limen land` (`src/job/landing.ts:93`, `deleteLandedBranches`), and the seat's daily timer
   (disabled on the seat since 2026-11-17). `deleteLandedBranch` detaches the finished worktree that holds the branch
   with no dirty check (`pruning.ts:117-123`). Removal is a rename to `.pruned-<uuid>` (`:264-268`), `git worktree
   prune`, then `rm` (`:271-277`), under the `.limen/prune` lock.
2. `src/project/git.ts`: `worktreeState` (`:339`, clean, dirty, none; any other failure reads as dirty), `dirtyPaths`
   (`:291`, untracked files included, ignored ones not), `unlandedBranches` (`:89`, commits not reachable from `HEAD`
   of the given repository's primary checkout, `:106`; no code names `main`), `commitList` (`:325`). Plain `git add -A`
   leaves ignored files out; nothing in `src/` commits inside a job worktree today.
3. The record holds `branch`, `worktree`, `role`, `repo`, `group`, `state` and `migrated` (history only); the branch is
   `limen/<id>` unless `--branch` (`src/job/spawning.ts:416`); a review job records the reviewed branch and gets a
   detached worktree (`spawning.ts:747`). `transition` writes nothing once a record is terminal (`record.ts:448`).
4. `limen continue` takes the parent's branch and worktree (`src/job/continuation.ts:503-513`); it refuses
   `JOB_NOT_FINISHED` for a parent that is not terminal (`:410`).
5. Spawn validates under the jobs lock (`spawning.ts:276`, `validateSpawn` `:290-365`), holds git facts with
   `view.hold(…)` (a changed fact gives `STATE_CHANGED`), and its role is `options.review ? "reviewer" : (group?.role
   ?? options.role ?? "worker")` (`:312`). Worker spawns: `limen spawn`, GitHub work, group workers.
6. `limen status` (`src/project/summary.ts:78`) lists done and failed or stopped jobs with an unlanded branch from the
   last 7 days only (`:218`), never reads a worktree's state, and misses a dirty zero-commit failed job.
7. `test/s9-housekeeping.test.ts:80-83` asserts that prune removes the worktree of `unmerged`, a done job with an
   unlanded commit. No test prunes a dirty failed job.
8. Text that becomes false: `docs/jobs.md:44` ("A failed job keeps its worktree and transcript."), `:134`, `:138-142`,
   `:152`, `:154` ("Uncommitted files that prune removed are lost."); `templates/agents.md:201` (A-001's `:224`: "The
   branch and worktree survive."), `:104` (the prune line), `:202` ("Bad candidate: do not merge; remove its
   worktree and branch with Git."); `docs/commands.md:201`, `:221-230`.

## Change

Terms (`## Decisions` 1–3). A finished job has **unlanded work** when its worktree exists and `git status
--porcelain` lists anything (tracked changes, deletions, untracked files; not ignored ones), or when its own branch
exists and holds commits not reachable from `HEAD` of its repository's primary checkout (the test of fact 2). A review
job's branch is the candidate's, so its unlanded work is only a dirty worktree. A worktree belongs to the newest
record that names it; an older record on the same worktree (a continued parent) carries nothing, and neither does a
member of an open group (the group holds it, as prune does today). The work is **resolved** when it lands, when a newer
job takes the worktree (`limen continue`), or when the branch `limen/abandon/<id>` exists.

(a) Prune (`src/runtime/pruning.ts`): `pruneFinishedWorktrees` and `deleteLandedBranch` never remove a dirty worktree,
whatever job names it or none, and never remove the worktree of a job with unresolved unlanded work; each kept
worktree prints one line, `kept <worktree> (job <id>): unlanded work` (z. 10). `--retire` skips a job with unresolved
unlanded work. The spawn's setup prune follows the same rule.

(b) `limen abandon <id>`: a new `change` command of object `job`, marked `irreversible`, through the runner (validate,
then apply) with its refusals declared in its registry entry:
- `JOB_NOT_FINISHED` for a job that is not terminal, `next` `limen stop <id>`;
- `JOB_IN_GROUP` for a member of an open group, `next` `null`, the message naming the group;
- `JOB_CONTINUED` when a newer record holds the worktree, `next` `limen abandon <newer id>`;
- `NO_UNLANDED_WORK` when the job has none and no `limen/abandon/<id>` exists, `next` `limen prune`.
Its steps: (1) unless `limen/abandon/<id>` exists, a commit of the worktree's whole state on top of the worktree's
`HEAD`, made through a temporary index (`GIT_INDEX_FILE`; `read-tree HEAD`, `add -A`, `write-tree`, `commit-tree`), so
no project hook runs and the job's own branch does not move, and the branch created by `update-ref
refs/heads/limen/abandon/<id> <commit> ""` (create-only, so two runs cannot both write it); a job whose worktree is
gone gets the branch at its own branch's tip; (2) the worktree, if it is still there and its state equals the
commit's tree, is removed by prune's own removal (rename, `git worktree prune`, emptying the trash); a worktree that
changed after the commit is kept and named; (3) the job's Herdr tab, if one is open, is closed through the existing
tab closer (T-18: closing Herdr tabs is part of abandon's `cleaned` step); (4) it prints the branch and the commit. Run
again after a stop between (1) and (3), it finishes the remaining steps; run again after all of them, it prints the
branch and exits 0. The commit uses the repository's configured identity; its message is `limen abandon <id>`. Its
registry summary is T-19's wording: "give up on a job and keep its work on a branch".

(c) Spawn: every spawn of role `worker` (`limen spawn`, with `--branch` too, GitHub work, group workers) refuses with
`UNLANDED_WORK` while any job of the project has unresolved unlanded work; the check runs in `validateSpawn` under the
jobs lock, with the git facts held, so a change before apply gives `STATE_CHANGED`. The message names each such job
with what is unlanded and both `limen continue <id>` and `limen abandon <id>`; `next` is `limen status`. Reviewer,
keeper and team-coordinator spawns do not refuse: they work on a candidate.

(d) `limen status`: a section "Unlanded work (spawn refuses until each is continued or abandoned)" lists every finished
job with unresolved unlanded work, whatever its age and migrated records included, each with its changed-file count,
its unlanded-commit count and the two commands. It reads each worktree with `git --no-optional-locks status`, as
`worktreeState` does, so the listing refreshes no index (T-04; R-032 makes `status` a read).

(e) Text: `docs/jobs.md` (`:44`, `:134`, `:138-142`, `:152`, `:154`), `templates/agents.md` (`:201`, `:104`, `:202`:
a bad candidate is abandoned with `limen abandon <id>`), and `docs/commands.md` (`:201`, `:221-230`, and the sections
generated from the registry) say what the code does after (a)–(d).

(f) Tests, each failing before the change where it tests a mechanism: prune keeps a dirty failed job's worktree (A-001's
experiment) and a done job's worktree with an unlanded commit (the assertion of fact 7 reverses); a dirty zero-commit
failed job and a done job with an unlanded commit each make a worker spawn refuse with `UNLANDED_WORK`, the shared
snapshot unchanged; a reviewer spawn passes; `limen abandon` saves changed, deleted and untracked files (not ignored
ones) on `limen/abandon/<id>`, leaves the job's branch where it was and removes the worktree; its run-again and
nothing-lost tests (T-28 (3)); each refusal's `CODE:` test; `limen continue` resolves its parent; `limen status` lists
the jobs; the migration fixture below. Test files whose spawns leave unlanded work before a further spawn resolve it
(abandon or land) where the test is not about it.

## Out of scope

- The `landed` and `abandoned` markers in the record and the archive (R-031); `--retire`'s zero-commit rule (A-002,
  R-031); the sweep, its timer and read-only reads (R-032); the `needs-decision` exception (R-068).
- Unregistered folders in the worktree root (no job, no git state to read); deleting `limen/abandon/<id>` branches
  (a human's, A-002).

## Acceptance

- AC-1: `node --test test/s9-housekeeping.test.ts` → exit 0.
- AC-2: `node --test test/cli/abandon.test.ts` → exit 0.
- AC-3: `node --test test/cli/spawn.test.ts` → exit 0.
- AC-4: `node --test test/cli/status.test.ts` → exit 0; `node --test test/cli/continue.test.ts` → exit 0.
- AC-5: `node --test test/registry.test.ts` → exit 0; `node --test test/help.test.ts` → exit 0.
- AC-6: `node adrian-rebuild/tools/fails-before.mjs` → exit 0, its output in `outcome.md` → `## Fails before`.
- AC-7: `node adrian-rebuild/tools/gate.mjs` → exit 0.
- AC-8: `npx biome check --error-on-warnings .` → exit 0; `node adrian-rebuild/tools/check.mjs` → exit 0.
- AC-9 (judgment): no path of `src/` removes a job worktree without the check of (a), and abandon removes a worktree
  only after its state is on `limen/abandon/<id>`.

## Migration

No format changes. Existing finished jobs with unlanded work, migrated records included, are listed by `limen status`
and make worker spawns refuse until each is continued or abandoned (`## Deployment` 3.6). The fixture test: a plant
with a migrated failed record whose worktree holds an untracked file and a migrated stopped record whose worktree is
gone but whose branch holds a commit; `limen status` lists both, a worker spawn refuses, `limen abandon` resolves each,
and the spawn then passes.

## Risk

- On the seat, every old unlanded job blocks worker spawns until resolved; that is the decision, and 3.6 resolves them
  before the projects resume.
- A dirty worktree of a landed job is now kept and blocks spawns until abandoned; leftover files after a land may be
  lost work, so they are not deleted silently.
- Many end-to-end tests spawn after a job that leaves commits; they resolve the work or land it, which the reviewer
  checks did not weaken what they test.

## Rollback

`git revert $(git log --format=%H --grep='^R-030:' adrian-rebuild --)`; `limen/abandon/<id>` branches made meanwhile
stay and hold the saved work.

## Decisions

Settled by the documents when the ticket was written (2026-11-22, the main session's reading, not a night default):
1. "Outside `main`" is read as land reads it: commits not reachable from `HEAD` of the job's repository's primary
   checkout (`unlandedBranches`), which is `main` on the seat; a branch with no such commit has nothing to lose.
2. Before R-031's markers a terminal record cannot be written (fact 3), so "resolved" is read from git: the work landed,
   a newer record took the worktree, or `limen/abandon/<id>` exists. R-031 may replace the branch test with its
   `abandoned` marker.
3. A `done` candidate with unlanded commits is unlanded work too (the Decision names "changes or commits"), so it blocks
   worker spawns until it lands, is continued or is abandoned; reviewer and keeper spawns stay free, since they work on
   it. With `maxJobs` 1 the coordinator works one ticket at a time anyway (A-014).
4. Abandon commits through a temporary index and a create-only ref, so a project's commit hooks cannot refuse the save,
   the job's branch keeps its tip, and two runs cannot both write the branch; it is `irreversible` because it removes
   the worktree (ignored files go with it).
5. The refusal's `next` is `limen status`, which lists every blocking job with both commands; it prefers neither
   resolution, since only the coordinator or Adrian can choose between continuing and abandoning.
6. Read again on 2026-11-22 against `taste.md`, at Adrian's request: abandon closes the job's Herdr tab (T-18), its
   summary is T-19's wording, and the status listing reads worktrees without optional locks (T-04). Abandon's steps
   are found again from git state when it runs again (the branch, the worktree, the tab), not recorded in the record,
   because a terminal record cannot be written before R-031 (T-38 (3) asks that a rerun continue).

Review round 1 (2026-11-22, by day; `review.md` → Round 1): the findings to fix, for the first round of fixes by the
resumed implementer. Each is the main session's reading of the ticket and of the sources it names, not a night default:
- F1 (the blocking finding; AC-9, T-28 (3)): abandon removes a worktree only when the saved commit holds all of its
  state. Step (2) also keeps and names the worktree when the commit's tree holds a gitlink (mode `160000`) that the
  worktree's `HEAD` tree does not hold at the same object, or when any nested repository in the worktree (a registered
  submodule or an unregistered folder with its own `.git`) has changes or untracked files of its own; the branch is
  still written, and the kept line names the nested path. A test: the reviewer's probe (a failed job's worktree with
  `vendor/lib` holding its own commit and an untracked `wip.txt`); `limen abandon` keeps the worktree and `wip.txt`
  survives; it fails before the fix.
- F2 ((a): "never remove a dirty worktree, whatever job names it or none"): prune visits its candidates deepest first
  and keeps a worktree that still holds another registered worktree below it after the pass; abandon keeps and names a
  worktree that holds another registered worktree. A test: the reviewer's probe (a clean done job's worktree with a
  registered worktree under its ignored `.limen/` and an untracked file there); prune keeps both and prints a `kept`
  line; it fails before the fix.
- F3 (the repair loop of `templates/agents.md:146` and `:200`, `docs/jobs.md:91` and `:115`; A-015, A-035 and A-073
  name repair spawns; the ticket's "resolved … when a newer job takes the worktree"): a worker spawn whose `--branch`
  is the own branch of an unresolved job takes over that job's work (spawn reuses its worktree, `spawning.ts:787-798`,
  or makes a new one on the branch when the worktree is gone; Deviation 1 moves the branch's commits to the newest
  record), so that job does not make it refuse; every other unresolved job still does. The manual's lines stay as they
  are. Tests: the reviewer's probe (a done candidate, its done review, then a repair spawn with `--branch <its branch>`)
  passes; the same repair spawn while another job has unresolved unlanded work refuses with `UNLANDED_WORK` naming only
  that other job. The first fails before the fix.
- F4 (step (2): "removed by prune's own removal"): abandon removes a worktree only when prune itself could remove it: a
  registered worktree, not the primary checkout, not locked in Git, under the Limen worktree root; otherwise it keeps
  and names it (`docs/commands.md:238`: "A Git-locked worktree stays"), and empties only the trash it made. A test: a
  Git-locked worktree stays after `limen abandon`, with the branch written.
- F5 ((a), z. 10: "each kept worktree prints one line"): one line form for every kept worktree, `kept <worktree> (job
  <id>): <reason>`, from prune, the setup prune, land and `prune --retire` (which prints it too); the reason is
  `unlanded work` for prune, land and `--retire`, and names the cause for abandon (changed after the save, a nested
  repository, a registered worktree inside, locked, outside the worktree root). This replaces Deviation 3.
- F6 (Deviation 8; T-01): a worktree that `git status` cannot read still fails closed (`GIT_FAILED`, exit 4), and the
  message names the worktree's path and its job id before git's own text. A test of the message.
- F7 (T-30): the comment at `test/s5-land.test.ts:41` says what the tests do now.
- F8 ((e): text says what the code does): `docs/herdr-status.md:15` names `--retire`'s skip of jobs with unlanded work.
- Accepted as written (`outcome.md` → Deviations): 1 (consistent with F3), 2, 4, 5, 6, 7 and 9. The main session adds
  the Herdr verification of T-28 (5) to `plan.md` → `## Deployment` 3.6 and the ticket's row (API `herdr`, Seat 3.6).

Review round 2 (2026-11-22, by day; `review.md` → Round 2, verdict PASS with ten notes): the findings to fix, for the
second and last round of fixes by the resumed implementer; again the main session's reading, not a night default:
- G1 ((a) names `deleteLandedBranch`; note 1, proven): `deleteLandedBranch` (land and `prune --retire`) keeps a
  worktree that holds another registered worktree below it, by the same test as prune and abandon (one function, T-25).
  A test: the F2 probe through `limen land <id>`; the inner worktree and its untracked file survive; it fails before the
  fix.
- G2 ((a), z. 10: "each kept worktree prints one line"; note 2, proven): a held worktree inside another held worktree
  prints its own `kept` line too. A test, failing before the fix.
- G3 (F5: "the reason … names the cause"; note 3, proven): a worktree kept only because a registered worktree lies
  below it prints that cause (`holds the registered worktree <path>`), not `unlanded work`; `docs/commands.md:236` and
  `docs/jobs.md:138` say so. A test of the line, failing before the fix.
- G4 (note 5): a test of F1's second cause, a gitlink at `HEAD`'s commit whose nested repository has changes of its
  own; the worktree stays and the line names the nested path.
- G5 (F3: "takes over that job's work"; note 6): a worker spawn with `--branch` takes over an unresolved job only when
  it reuses that job's worktree or the job's worktree is gone; a job whose worktree is there without that branch checked
  out still makes the spawn refuse. A test, failing before the fix.
- G6 (z. 15; note 7): a path that `limen abandon`, prune and land print in a `kept` line (a nested repository's path,
  an inner worktree's path) goes through one escaping of control characters, as `JSON.stringify` writes them, so a name
  a job chose cannot add a line to the output the coordinator reads; an existing helper of `src/` is reused if one
  does this. A test with a nested folder whose name holds a newline, failing before the fix.
- G7 (T-30; note 8): the comment at `src/job/unlanded.ts:199` and `outcome.md` → Unmeasured count the Git processes
  right (one `rev-list` per unlanded branch).
- G8 ((e); note 9): `docs/commands.md:192` shows the repo suffix that `unlandedLines` adds for a workspace repository.
- G9 (note 10): `outcome.md` → Deviations numbered in order.
- Accepted: Deviation 10 (note 4): a nested repository in an ignored folder goes with the worktree, as A-001's Decision
  saves "changes and untracked files, not ignored ones" and Decision 4 says ignored files go with it; a nested
  repository with no commit fails closed (`GIT_FAILED`, nothing written). Deviation 11 stays as G2 narrows it (a clean
  inner worktree of a kept one stays without a line of its own).

Review round 3 (2026-11-22, by day; `review.md` → Round 3, verdict FAIL with one blocking finding). Adrian's decision
(2026-11-22, "rekomendacja", Q-38 option 1 → `plan.md` → D-087): a third round of fixes for this ticket only, on
D-044's pattern; review round 4 checks only H1–H3 and the absence of regressions, a new blocking finding goes to
Adrian, and there is no fifth round:
- H1 (the blocking finding; F1's rule "abandon removes a worktree only when the saved commit holds all of its state",
  AC-9, T-28 (3)): `limen abandon` keeps and names the worktree when a gitlink (mode `160000`) of the saved tree points
  to a commit that the project repository's object store lacks (`git cat-file -e <oid>` in the job's repository), also
  when the worktree's `HEAD` holds that gitlink at the same commit; the branch is still written, and the kept line names
  the nested path (escaped as G6 says). The rule fails safe: a gitlink it cannot check keeps the worktree. The header
  of `src/job/abandoning.ts`, the comment of `nestedWork` and `docs/jobs.md:149` say what the code does. A test: the
  reviewer's probe of round 3 (a failed job whose worktree holds `vendor/lib` with its own commit, committed as a
  gitlink in the worktree; `limen abandon` keeps the worktree, and the nested commit is still there); it fails before
  the fix.
- H2 ((e); round 3, note 2): `docs/commands.md:158` states G5's condition (the spawn takes over a job only when it
  reuses that job's worktree or the job's worktree is gone).
- H3 (round 3, note 3): `outcome.md` → Done (f) gives one test count for `test/cli/abandon.test.ts`, the true one.

Review round 4 (2026-11-22, by day; `review.md` → Round 4, verdict FAIL with a new blocking finding: the worktree that
H1 keeps is removed by the next prune, since `limen/abandon/<id>` resolves the job and the worktree looks clean).
Adrian's decision (2026-11-22, "zgodnie z rekomendacją", Q-39 option 1 → `plan.md` → D-088): a fourth round of fixes
with one item; review round 5 checks only I1 and the absence of regressions, and a new blocking finding goes to Adrian:
- I1 ((a): "never remove a dirty worktree, whatever job names it or none"; AC-9; T-28 (3); T-25: one definition): one
  function decides whether a worktree holds state the project's repository cannot hold, and prune, the setup prune,
  land, `prune --retire` and abandon all use it. A worktree whose `HEAD` tree, index or working tree holds a gitlink
  (mode `160000`) to a commit that the project's object store lacks (`hasObject`) is kept like a dirty one, whatever
  job names it and whether or not the job is resolved, with a `kept <worktree> (job <id>): <reason>` line whose reason
  names the nested path (escaped as G6 says). The check fails safe: a gitlink it cannot check keeps the worktree.
  `docs/jobs.md` (`:138`, `:149`) and `docs/commands.md` say so. Tests: round 4's probe (H1's setup, `limen abandon`,
  then `limen prune`: the worktree and the nested commit survive, and prune prints the `kept` line) and the same
  worktree of a job through `limen land` (kept, the nested commit survives), each failing before the fix.
- Round 4's note 2 (a nested repository's other branches, stash and reflog) goes to R-031's notes in `plan.md` →
  `## Tickets`; note 3 (`docs/jobs.md:138`) was fixed by the main session.
