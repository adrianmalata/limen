<!-- PL: Wynik R-104 (noc 27/28.11, przy `dab4449`; recenzja PASS w rundach 1 i 2, decyzja 9 to domyślna nocna do
potwierdzenia, a sprawa folderu z nieistniejącym gitdirem czeka jako Q-104): dzienny prune przenosi do `.limen/archive/unregistered/`
każdy folder korzenia worktree, którego Git nie rejestruje, z `.git` albo bez; locki pod lockiem jobów bierze jedną
próbą i nazywa zatrzymany folder linią `kept job … for the next daily prune`; pusty folder joba, którego miejsce w
miesiącu archiwum zajmuje wycofany job, idzie do `archive/unregistered/`; wpis kolejki startowej jest żywy tylko dla
joba zarejestrowanego projektu. Test folderu z nieistniejącym gitdirem jest, wg decyzji 9, strażnikiem (`GIT_FAILED`,
folder bajt w bajt); bramka 1498/1498. Runda poprawek 1 (F1–F4 z decyzji 10): komentarz `dailySteps` zawinięty do
120 kolumn, `heldCandidates` nazywa się `keptCandidates`, opis `QueueReader` nazywa regułę kolejki, a nagłówki trzech
plików testów wróciły do tekstu z HEAD; bramka po rundzie znów 1498/1498. -->

# R-104 outcome

Status: done. The question of the earlier run (a folder whose `.git` names a gitdir that is gone) is answered by
`ticket.md` → `## Decisions` item 9; its test is now a guard that passes at HEAD.

## Done

1. `src/runtime/pruning.ts`, unregistered folders (Change 1, Decisions 1 and 2): the worktree pass removes only a
   registered worktree. Every folder of the worktree root that Git does not register moves whole, `.git` and all, into
   `.limen/archive/unregistered/<name>-<time>/` (`archiveUnregistered`, through the new `unregisteredTarget`), with the
   one reason `the directory is not a registered Git worktree` (the constant `UNREGISTERED`). The held checks still
   come first (`keptCandidates`, `heldCandidates` before review round 1), so a dirty clone stays with its `kept` line,
   and a Git failure of a candidate still fails the step with `GIT_FAILED`.
2. `src/runtime/pruning.ts`, locks (Change 2, Decisions 3 and 4): under the jobs lock, a never-started job's folder
   and a publication's folder are moved by `moveLockedFolder(…, { mode: "skip" })`, and the worktree lock of the
   publications is taken by `withLock(worktreeGuard(…), …, { mode: "skip" })`. A folder whose lock another process
   holds, and every publication while the worktree lock is held, stays and is named in the new `PruneResult.held`.
   `heldLine(id, step)` moved from `src/runtime/retiring.ts` to `src/runtime/pruning.ts`, beside `keptLine`, and
   serves both steps: `kept job <id> for the next daily prune: another process holds its lock` and retire's line,
   unchanged. `src/runtime/sweeping.ts` prints prune's held lines as it prints retire's, and the step succeeds.
3. `src/runtime/pruning.ts`, the empty folder (Change 3, Decision 5): `unstartedTarget` sends a folder of
   `.limen/jobs/` with no record whose month place already exists to `.limen/archive/unregistered/<id>-<time>/`.
4. `src/runtime/start-queue.ts` (Change 4, Decisions 6 and 7): `readEntries` counts an entry live only when, besides
   today's rule, its `jobDir` is `<root>/.limen/jobs/<entry.id>` for an absolute root of `registeredProjects()`,
   compared as real paths (`projectJob`, `realPath`: ENOENT is "no such job", any other error goes on, T-01); the id
   must be a plain visible folder name. The registry check runs before the record read, so no record outside the
   registered projects is read. A waiting wrapper passes its own id (`liveEntries(own)`), and its own entry is judged
   by today's rule alone. `queueEntries` and `removeDeadEntries` apply the rule to every entry.
5. Tests (Change 5): see `## Fails before`. The start-queue fixture `seat()` registers `<home>/repo` in
   `<home>/.limen/projects`; the two prune lines of `test/runtime/pruning.test.ts` take the one reason. The test of a
   folder whose `.git` names a gitdir that is gone follows Decision 9: "a folder of the worktree root whose .git names
   a gitdir that is gone fails the prune with GIT_FAILED, the message names the folder, and the folder stays byte for
   byte" (`test/runtime/pruning.test.ts:230`). It runs `heldCandidates` (now `keptCandidates`, renamed only) and
   `worktreeChanges`, which this ticket does not change (`src/project/git.ts` has no diff; at HEAD `prunePass` reads `heldCandidates(pass)` at
   `src/runtime/pruning.ts:447`, before its moves at `:465` and `:470`), so it passes at HEAD: a guard, not a
   fails-before test.
6. Docs (Change 6): `docs/commands.md:313` (the prune's bullet: every unregistered folder, the empty folder beside a
   retired job, one attempt at each lock under the jobs lock, the held line), `docs/jobs.md:143` and `:149` (every
   folder of the worktree root Git does not register, the empty folder), `docs/jobs.md:191` (an entry whose folder is
   no job of a registered project, and the own-entry rule). The comments of inventory section 6 follow:
   `src/runtime/pruning.ts` (header, `pruneFinishedWorktrees`, `archiveUnstarted`, `moveUnstarted`,
   `movePublications`, `prunePass`, `PrunePass.root`, `archiveUnregistered`), `src/job/record.ts`
   (`unregisteredArchive`), `src/runtime/start-queue.ts` (`readEntries`, `entryState`), `src/runtime/sweeping.ts`
   (`dailySteps`), `src/runtime/retiring.ts` (`RetireResult`).
7. Review round 1 fixes (`ticket.md` → `## Decisions` item 10, `review.md` → Round 1):
   - F1: the doc comment of `dailySteps` (`src/runtime/sweeping.ts:274-276`) is rewrapped at 120 columns.
   - F2: `heldCandidates` is `keptCandidates` in `src/runtime/pruning.ts`, with its caller in `prunePass` (the local
     `held` and `inHeld` are `keep` and `inKept`) and the comments there ("a kept one inside it", "a kept candidate");
     the local `held` of `unlandedWorktrees` is `unlanded`, so "held" in the module names only a folder whose lock
     another process holds (`PruneResult.held`, `heldLine`). A rename only, no behaviour change.
   - F3: the `QueueReader` doc (`src/runtime/start-queue.ts:560-564`) names the rule as the `readEntries` doc does:
     the wrapper's own entry by its wrapper and its job alone, every other entry also by whether its folder is a job of
     a registered project.
   - F4: the opening comments of `test/runtime/pruning.test.ts`, `test/cli/sweep.test.ts` and
     `test/runtime/start-queue.test.ts` are their text at `HEAD` again; the diff no longer touches them.
8. Review round 2's two notes, both on the docs, fixed by the main session (D-053 (2); `review.md` → Round 2):
   `docs/commands.md` → the prune's bullet says an unregistered folder that a job's record names is archived with that
   job's reason, else with `the directory is not a registered Git worktree`; `docs/jobs.md` → Start queue says that
   another waiting wrapper or the sweep removes the entry of a job of a project the seat does not register, which its
   wrapper writes again at its next poll, so such a job may wait past its turn.

## Proof

Run on the working tree at `dab4449` with this ticket's change.

| Command | Exit | Result |
|---|---|---|
| `node --test test/runtime/pruning.test.ts` (AC-1) | 0 | 15/15 |
| `node --test test/cli/sweep.test.ts` (AC-2) | 0 | 44/44 |
| `node --test test/runtime/start-queue.test.ts` (AC-3) | 0 | 24/24 |
| `node --test test/runtime/retiring.test.ts` (AC-4) | 0 | 3/3 |
| `node --test test/s9-housekeeping.test.ts` (AC-4) | 0 | 8/8 |
| `git grep -q 'mode: "skip"' -- src/runtime/pruning.ts` (AC-5) | 0 | 3 lines (`:352`, `:368`, `:390`) |
| `git grep -q 'and holds no .git' -- src/runtime/pruning.ts test/runtime/pruning.test.ts` (AC-6) | 1 | no line |
| `git grep -q 'worktree root with no checkout' -- docs/jobs.md` (AC-7) | 1 | no line |
| `git grep -q 'registeredProjects' -- src/runtime/start-queue.ts` (AC-8) | 0 | 2 lines (`:34`, `:589`) |
| `node adrian-rebuild/tools/fails-before.mjs` (AC-9) | 0 | the three changed test files fail at HEAD |
| `node adrian-rebuild/tools/gate.mjs --out node_modules/.rebuild-review/R-104.gate` (AC-10) | 0 | 1498/1498, `fail 0`, `duration_ms 349687` |
| `npx biome check --error-on-warnings .` (AC-11) | 0 | 301 files, no fixes |
| `node adrian-rebuild/tools/check.mjs` (AC-11) | 0 | 0 errors |
| `npx tsc --noEmit` | 0 | no output |

The exit codes of AC-5 to AC-8 are read from `git grep -n` with the same patterns and paths: a listed line is exit 0,
no line is exit 1.

After the review round 1 fixes (Done, 7), on the working tree at `dab4449`:

| Command | Exit | Result |
|---|---|---|
| `node adrian-rebuild/tools/gate.mjs --out node_modules/.rebuild-review/R-104.gate` (AC-10) | 0 | 1498/1498, `fail 0`, `duration_ms 345791` |
| `node adrian-rebuild/tools/check.mjs` (AC-11) | 0 | 0 errors |
| `npx biome check --error-on-warnings .` (AC-11) | 0 | 301 files, no fixes |

The line numbers of AC-5 and AC-8 above are those after the fixes; `git grep -n` lists the same lines.

## Fails before

`node adrian-rebuild/tools/fails-before.mjs` → exit 0, the main session's run of protocol step 4 after its gate
(1498/1498, 347.6 s); its first line:

```text
fails-before: test/cli/sweep.test.ts, test/runtime/pruning.test.ts, test/runtime/start-queue.test.ts fail at HEAD (exit 1)
```

The last of the 40 lines it shows (the end of the failure list, `test/runtime/start-queue.test.ts`):

```text
test at test/runtime/start-queue.test.ts:539:1
✖ a queued job of a registered project starts while an entry whose folder is no job of a registered project is first in start order (5047.792095ms)
  AssertionError [ERR_ASSERTION]: Expected values to be strictly equal:
  + actual - expected

  + 'still waiting'
  - 'started'
```

Each new or changed test at HEAD's code (the earlier run, `node --test --test-reporter=tap <file>` on HEAD's source with
the tests already written; the one test changed since is a guard, below):

- `test/runtime/pruning.test.ts`, 6 of 15 fail:
  - the two existing tests of an unregistered folder with no `.git`: `ERR_ASSERTION`, the line ends in `… and holds
    no .git` (the reason changes);
  - the clean clone: `ERR_ASSERTION`, `pruned …/clone (job none): directory is not a registered Git worktree`, the
    archive empty (the clone was deleted);
  - the held record that never started, the held publication's folder, and the held worktree lock in a project with
    no Git repository: `LOCK_TIMEOUT` after the 200 ms test wait.
  - Guard, passes at HEAD (Decision 9): the folder whose `.git` names a gitdir that is gone. At HEAD the prune already
    fails there with `GIT_FAILED` (`gitfile does not point to a valid repository`), naming the folder, before anything
    moves (Done, 5).
- `test/cli/sweep.test.ts`, the 2 new tests fail: the held folder, exit 3, `LOCK_TIMEOUT` on
  `.limen/jobs/2026-11-24-leftover-1a2b3c4d/.lock`, no stamp; the empty folder beside a retired job, exit 4,
  `STEP_FAILED`, `ENOTEMPTY: directory not empty, rename '…/.limen/jobs/2026-11-23-retired-1a2b3c4d' ->
  '…/.limen/archive/2026-11/2026-11-23-retired-1a2b3c4d'`.
- `test/runtime/start-queue.test.ts`, 3 of 24 fail: `queueEntries` lists the foreign entry; `removeDeadEntries` keeps
  it (`true !== false`); the registered project's queued job is `still waiting` behind it. The guard of Decision 7, "a
  queued job of a project the seat does not register starts in its turn", passes at HEAD by design (Deviations, 1).

## Deviations from the ticket

1. Two tests beyond Change 5's list. "prune keeps a publication's left folder while another process holds the worktree
   lock, in a project with no Git repository, …" checks Decision 3 and fails at HEAD with `LOCK_TIMEOUT`; it uses a
   project with no Git repository because the worktree pass, outside the jobs lock, still waits for that lock. "a
   queued job of a project the seat does not register starts in its turn" guards Decision 7 and passes at HEAD: with
   the rule applied to the wrapper's own entry, that job would never be first and would wait until `failAfter`.
2. Placement of the one line function (Decision 4, a technical choice): `heldLine(id, step)` lives in
   `src/runtime/pruning.ts` beside `keptLine`, the line of a kept worktree that prune and retire already share;
   `retiring.ts` no longer defines it.
3. A publication held because another process holds the worktree lock gets the same held line, "another process holds
   its lock", although the lock is the worktree lock, not the folder's own: one line for every held folder (Change 2).
4. `src/job/record.ts` (`unregisteredArchive`'s comment) changed: inventory section 6 lists it, and Change 6 says those
   comments follow.

Change 5's test of a folder whose `.git` names a gitdir that is gone asserts what Decision 9 gives, not an archive;
that is the ticket's own decision, not a deviation.

## Night defaults

For Adrian to confirm in the morning (D-054 (2) (a)): `ticket.md` → Decision 9, the test of a folder whose `.git` names
a gitdir that is gone asserts the prune's `GIT_FAILED` and the folder byte for byte, as at `HEAD`, instead of an
archive; the case itself is Q-104 (`.night/questions.md`).

## Unmeasured

- M-10: the gate's run time on this laptop was 350 s with 1498 tests; the stage's measurement is taken at its tag.
- M-09: on the seat, an entry whose folder is no registered project's job no longer holds other jobs' starts; the queue
  waits are measured at 9.1.

## Open points

1. The guard of Decision 9 reads the words of the laptop's Git 2.56.1. On a Git that prints `not a git repository`
   for such a `.git`, `worktreeChanges` returns no checkout, so the folder is not held, Change 1 moves it into
   `.limen/archive/unregistered/` (nothing is deleted there either), and this guard fails. The seat's Git version is
   not known here. Q-104 (`.night/questions.md`) settles the case for both wordings; it does not stop this ticket.
2. `docs/commands.md:313` and `docs/jobs.md:143` and `:149` say that every folder of the worktree root that Git does not
   register moves into the archive; `docs/commands.md:313` names one Git failure that fails the step instead (a
   `HEAD` with no commit). A folder whose `.git` names a gitdir that is gone also fails the step with `GIT_FAILED` on
   Git 2.56.1, at HEAD and after this ticket, and the docs do not name it. They are left as they are, since what they
   should say depends on Q-104's answer and on the Git version (Open point 1).
3. While such a folder is there on a Git with the new wording, the daily prune fails every minute (`<root> (daily
   prune)`, `GIT_FAILED`, no stamp), at HEAD and after this ticket; a person moves the folder away to end it.
