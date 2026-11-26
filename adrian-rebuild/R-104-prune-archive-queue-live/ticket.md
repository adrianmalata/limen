<!-- PL: Ticket R-104 (D-107 (4) i (5), A-002, A-024, T-25): dzienny prune sweepa przenosi do
`.limen/archive/unregistered/` każdy folder katalogu worktree, którego Git nie rejestruje, także z `.git` (dziś taki
czysty folder jest kasowany); pod lockiem jobów bierze locki folderów jedną próbą, jak retire; pusty
`.limen/jobs/<id>/` obok wycofanego joba nie wywraca już dziennych kroków; wpis kolejki startowej jest żywy tylko dla
joba zarejestrowanego projektu. Stan: napisany 26.11 przy `cbe6f1a` z inwentarza `evidence/inventories/R-104.md`;
`ready` na noc. -->

# R-104 The sweep's daily prune archives every unregistered folder and waits on no job's lock; a queue entry is live only for a project's job

## Problem

D-107 (4), quoted: "Q-58: the daily prune moves every folder of the worktree root that Git does not register into
`.limen/archive/unregistered/`, `.git` or not, so nothing Git does not hold elsewhere is deleted (z. 29); this amends
D-097 (4) (d) and is R-104's"; D-107 (5): "Q-59: a start-queue entry counts as live only when its job folder is one of
the project's jobs, in R-104, which is M." The note in `## Tickets`: "a lock taken after a retire can leave an empty
`.limen/jobs/<id>/`, which fails the daily prune until the month changes (a test that plants the empty folder first);
prune's moves take a folder's lock in one attempt under the jobs lock, as retire does". A-001's rule, kept: "No removal
takes a worktree that `git status` shows dirty, whatever job names it" (`src/runtime/pruning.ts:5-6`,
`docs/jobs.md:139`). T-25 (1) and (2): one definition of a policy; a function without a policy moves to the module that
owns the concept when a second module needs it. T-18: one word per thing.

Facts at `c3bbc5c` (the read-only inventory `evidence/inventories/R-104.md`):
1. `pruneFinishedWorktrees` (`src/runtime/pruning.ts:105-114`) runs `archiveUnstarted` (`:276-301`), then the worktree
   pass per repository (`:404-423`). A candidate Git does not register and that holds no `.git` moves to
   `.limen/archive/unregistered/<name>-<time>/` (`:464-468`, `:484-490`); one with a `.git` that is clean, or that Git
   cannot read (`worktreeChanges` returns `undefined`, `src/project/git.ts:320-329`), is renamed to `.pruned-<uuid>` and
   deleted with all it holds (`:470-475`, `:642-652`), line `pruned <path> (job none): directory is not a registered
   Git worktree`. A dirty one is kept as held (`heldCandidates`, `:501-518`).
2. Under the jobs lock (`:295`) prune waits up to 60 s for each folder's lock: `moveUnstarted` →
   `moveLockedFolder(jobDir, to, again)` (`:324`), the worktree lock (`:336`), `movePublications` (`:349`); no `mode:
   "skip"` in the file. Retire takes its folder's lock in one attempt (`src/runtime/retiring.ts:149`; header `:5-8`) and
   prints `kept job <id> for the next daily retire: another process holds its lock` (`heldLine`, `:48-50`). A
   `LOCK_TIMEOUT` is transient, exit 3 (`src/lock.ts:22`, `:227-229`).
3. The empty folder: the writers of a record check the folder, then take its lock (`src/job/record.ts:655-660`,
   `:696-700`, `:821-828`; `src/job/stopping.ts:58`); `acquire`'s `mkdir` (`src/lock.ts:216`) makes the folder again
   when a retire moved it in between, and the release removes only `.lock`. Prune lists it as never started and moves it
   to `<month of now>/<id>` (`pruning.ts:360-364`); when retire put the job in the same month (`retiring.ts:83`), the
   rename fails, `STEP_FAILED`, exit 4 (`src/operation.ts:185-192`). No stamp is written, so the daily steps run every
   minute and the worktree pass waits too (`src/runtime/sweeping.ts:316-331`), until the UTC month changes.
4. The queue: `readEntries` (`src/runtime/start-queue.ts:565-591`) is already the one rule for the waiting wrapper
   (`liveEntries`, `:594-600`; `:491`, `:519`), `limen seat queue` (`queueEntries`, `:603-605`) and the sweep
   (`removeDeadEntries`, `:612-618`); line `:584` counts an entry live on a live `pid` and a `running` record at
   `entry.jobDir`, of any path. The registry is `registeredProjects()` (`src/project/seat.ts:12-16`). The unit fixtures of
   `test/runtime/start-queue.test.ts` plant jobs at `<home>/repo/.limen/jobs/<id>` with no `projects` file (`:50-85`,
   `:467-478`).

## Change

1. `src/runtime/pruning.ts`, unregistered folders: the branch that deletes today becomes the move into
   `.limen/archive/unregistered/<name>-<time>/`, `.git` and all, for a folder Git does not register, with a `.git` or
   not; the held checks still come first, so a dirty clone stays with its `kept` line. One reason for every such move:
   `the directory is not a registered Git worktree` (today's deletion reason).
2. `src/runtime/pruning.ts`, locks: every lock prune takes under the jobs lock (a never-started job's folder, the
   worktree lock, a publication's folder) is taken in one attempt (`mode: "skip"`); a held one stays for the next daily
   run with a line, and the step succeeds. `PruneResult` gains `held`; one line function, in the module that owns the
   concept, serves retire and prune (`kept job <id> for the next daily prune: another process holds its lock`, beside
   retire's); the sweep prints prune's held lines as it prints retire's.
3. `src/runtime/pruning.ts`, the empty folder: a folder with no record whose month target is taken moves to
   `.limen/archive/unregistered/<id>-<time>/`, so nothing is deleted and the daily steps succeed.
4. `src/runtime/start-queue.ts`: an entry is live only when, besides today's rule, its `jobDir` is
   `<root>/.limen/jobs/<entry.id>` for a root of `registeredProjects()`, compared as real paths; the waiting wrapper
   judges only the other entries by this rule, so its own entry never blocks it.
5. Tests, each failing at HEAD (`test/runtime/pruning.test.ts`, `test/cli/sweep.test.ts`, `test/runtime/start-queue.test.ts`):
   a clean unregistered clone with its `.git`, and one whose `.git` names a gone gitdir, are archived byte for byte; a
   never-started job's folder and a publication's folder held by another process are kept with a line and moved at the
   next prune (test mode with `LIMEN_LOCK_WAIT_MS` 200, as `test/cli/sweep.test.ts:819`); the daily prune with a held
   folder writes the stamp; a retired job at `.limen/archive/<this month>/<id>/` beside an empty `.limen/jobs/<id>/`
   leaves the daily sweep exit 0 with the stamp and the archived job byte for byte; an entry whose folder is no job of a
   registered project is left out by `queueEntries`, removed by `removeDeadEntries`, and does not hold a registered
   project's queued job. The start-queue fixtures register `<home>/repo` in `<home>/.limen/projects`; the prune lines of
   `test/runtime/pruning.test.ts:167` and `:184` take the one reason.
6. Docs: `docs/commands.md:309` (the unregistered folder with a `.git` or not, one attempt at each lock, the held line),
   `docs/jobs.md:143` and `:149` (the folder of the worktree root Git does not register), `docs/jobs.md:191` (an entry
   whose folder is no job of a registered project does not block the queue); the comments the inventory lists in
   section 6 follow (T-30).

## Out of scope

- The swallowed `readFile(...).catch(() => undefined)` of each queue entry (`start-queue.ts:579`): R-082's note.
- The read half of `src/runtime/start-queue.ts` and `queuedText`: R-105 (D-116 (3) orders R-105 after this ticket).
- Writers that make a missing job folder through the lock (inventory Q5 (c)): the move of item 3 covers what they leave.
- A check of the entry's `pid` against the record's `identity` (inventory Q6 (b)): beyond D-107 (5).

## Acceptance

- AC-1: `node --test test/runtime/pruning.test.ts` → exit 0.
- AC-2: `node --test test/cli/sweep.test.ts` → exit 0.
- AC-3: `node --test test/runtime/start-queue.test.ts` → exit 0.
- AC-4: `node --test test/runtime/retiring.test.ts` → exit 0; `node --test test/s9-housekeeping.test.ts` → exit 0.
- AC-5: `git grep -q 'mode: "skip"' -- src/runtime/pruning.ts` → exit 0.
- AC-6: `git grep -q 'and holds no .git' -- src/runtime/pruning.ts test/runtime/pruning.test.ts` → exit 1.
- AC-7: `git grep -q 'worktree root with no checkout' -- docs/jobs.md` → exit 1.
- AC-8: `git grep -q 'registeredProjects' -- src/runtime/start-queue.ts` → exit 0.
- AC-9: `node adrian-rebuild/tools/fails-before.mjs` → exit 0, its output in `outcome.md` → `## Fails before`.
- AC-10: `node adrian-rebuild/tools/gate.mjs` → exit 0.
- AC-11: `npx biome check --error-on-warnings .` → exit 0; `node adrian-rebuild/tools/check.mjs` → exit 0.
- AC-12 (judgment): the daily prune deletes nothing Git does not hold elsewhere; no move under the jobs lock waits for
  another lock; an empty job folder beside a retired job leaves the daily steps a success; every reader of the start
  queue counts an entry live only for a job of a registered project.

## Migration

None: no record field or queue entry changes; `.limen/archive/unregistered/` keeps R-101's `<name>-<time>/` layout, and
`archivedJobs` reads only month names (`src/job/record.ts:352`, `:457-460`), so a folder with a `.git` there is no job.

## Risk

- A held folder waits a day for the next daily run (as retire's do); a lock held every day keeps it there, named by its
  line each time.
- A queued job's own entry is judged by the old rule only, so a job of a project the seat does not register still
  starts in its turn; its entry no longer counts ahead of other projects' jobs.

## Rollback

`git revert $(git log --format=%H --grep='^R-104:' adrian-rebuild --)`. What was archived stays in the archive; the old
code would delete an unregistered clean clone again, wait 60 s on locks, and count foreign entries live.

## Decisions

Settled by the documents when the ticket was written (2026-11-26, the main session's reading, not a night default; the
inventory's questions in `evidence/inventories/R-104.md` → section 9):
1. Only the branch that deletes today becomes a move; the held checks stay first (Q1 (a)): D-107 (4)'s "so nothing Git
   does not hold elsewhere is deleted", and a kept folder is not deleted; A-001's rule stays.
2. One reason for every moved unregistered folder (Q2 (a)): T-18.
3. The worktree lock under the jobs lock is taken in one attempt too (Q3 (a)): R-101 `outcome.md` → Open point 6, "one
   rule for every move under the jobs lock", and retire's header; it is not taken before the jobs lock, since spawn takes
   the jobs lock first.
4. `PruneResult` gains `held`, with one line function for prune and retire (Q4 (a)): T-25 (2).
5. A folder with no record whose month target is taken moves to `.limen/archive/unregistered/` (Q5 (a)): D-097 (4)
   (d)'s "move", so no `rmdir`.
6. "One of the project's jobs" is `<root>/.limen/jobs/<id>` for a registered root, as real paths (Q6 (a)): D-107 (5).
7. The waiting wrapper judges only the other entries by the rule (Q7 (a)): Q-59's harm is holding other jobs' starts.
