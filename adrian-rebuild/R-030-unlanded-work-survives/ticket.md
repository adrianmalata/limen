<!-- PL: Ticket R-030 (A-001): niewylądowana praca zakończonego joba przeżywa. Prune nigdy nie usuwa brudnego
worktree ani worktree joba z niewylądowanymi commitami, dopóki job nie zostanie rozwiązany; nowe `limen abandon <id>`
zapisuje stan na gałęzi `limen/abandon/<id>` i dopiero wtedy usuwa worktree; spawn workera odmawia (`UNLANDED_WORK`),
dopóki taki job istnieje, a `limen status` je wymienia. Stan: napisany 22.11 przy `9da2fde` z inwentarza
`evidence/inventories/R-030.md`, gotowy na noc. -->

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
archive (A-002's Decision); R-032 brings the sweep and read-only reads.

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
changed after the commit is kept and named; (3) it prints the branch and the commit. Run again after a stop between (1)
and (2), it finishes (2); run again after both, it prints the branch and exits 0. The commit uses the repository's
configured identity; its message is `limen abandon <id>`.

(c) Spawn: every spawn of role `worker` (`limen spawn`, with `--branch` too, GitHub work, group workers) refuses with
`UNLANDED_WORK` while any job of the project has unresolved unlanded work; the check runs in `validateSpawn` under the
jobs lock, with the git facts held, so a change before apply gives `STATE_CHANGED`. The message names each such job
with what is unlanded and both `limen continue <id>` and `limen abandon <id>`; `next` is `limen status`. Reviewer,
keeper and team-coordinator spawns do not refuse: they work on a candidate.

(d) `limen status`: a section "Unlanded work (spawn refuses until each is continued or abandoned)" lists every finished
job with unresolved unlanded work, whatever its age and migrated records included, each with its changed-file count,
its unlanded-commit count and the two commands.

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
