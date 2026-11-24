<!-- PL: Ticket R-037 (połowa podziału D-094 (3) o commicie zamknięcia; A-021, A-057, T-38, notatka do ustalenia 12
recenzji R-092): commit zamknięcia ticketów, wspólny dla `limen land` i `limen ticket done`, powstaje w tymczasowym
indeksie z oczekiwanego commita, przechodzi przez hooki projektu, które uruchamia `git commit -m`, a gałąź przesuwa
się jednym compare-and-swap; drzewo robocze i indeks checkoutu zmieniają się dopiero potem. Każde zamknięcie bierze
blokadę ticket-lanes, land odmawia brudnego ticketu przed merge'em i nie kończy się już kodem 0 po nieudanym
zamknięciu. Stan: napisany 23.11 przy `ca67568` z inwentarza `evidence/inventories/R-037.md`; pytania rozstrzygnięte
dokumentami w `## Decisions`; fakty sprawdzone ponownie
24.11 przy `bb0ae2b` (Decisions 14–16); w realizacji (`active`). -->

# R-037 The closing commit of land and `ticket done` is atomic

## Problem

Finding A-021, its Decision quoted from `audit.md`: "Land is a sequence of steps recorded in the record (`merged`,
`closed`, `cleaned`); a repeated `limen land <id>` continues from the last completed step; each step is idempotent; the
branch is deleted only after a successful closing commit. The closing commit (ticket move, board, `limen spec fix`,
generated `outcome.md`) is built atomically (temporary git index, `main` updated only from the expected value). Every
error ends with exit ≠ 0, a message and the exact next command. The closing commit goes through the project's
pre-commit hooks." Its evidence: with a pre-commit hook that rejects, land prints `land: tickets stay active:
pre-commit: lint failed`, exits 0, and leaves `R  spec/features/active/F001-auth/ticket.md ->
spec/features/done/2026-11/F001-auth/ticket.md` and `M  spec/build.md` staged in the main checkout.

Finding A-057, its Decision: "rejected (compliant) — Atomic job publication; the pattern carries over to the closing
commit of land (A-021)." The pattern (`src/job/publication.ts:88-121`): every file is written where nothing reads it
(`.limen/.publishing-<id>`), then one atomic rename puts it in place; a failure removes the hidden part.

Plan decisions and rules the change relies on:
- D-094 (3): "R-037 keeps the atomic closing commit (`applyTicketClose`, shared by land and `ticket done`: a temporary
  index, `main` moved from the expected value, the project's hooks, the ticket-lanes lock for every close, the refusals
  before the first write; R-092's finding 12); the new R-103 takes land as recorded steps (`merged`, `closed`,
  `cleaned`, a rerun that continues), the `cleaned` step's Herdr close, the `close` cut, `ticket done`'s markers as a
  step (the D-092 note) and step 3.9, depends on R-037".
- T-38: "(1) A domain operation is `validate(): Plan | Refusal`, then `apply(plan)` … a refusal (exit code 1) and a
  usage error (exit code 2) arise only in `validate`. (2) `apply` repeats the conditions under the shared lock (A-018)
  and writes by compare-and-swap (A-019); a state that changed since `validate` ends the command before the first
  write with exit code 3. (3) Failures after the first write (exit codes 3, 4, 5): a single effect is atomic (A-022);
  several effects are steps in the record, continued when the command runs again (the pattern of A-021). (4) The
  refusal tests of T-28 (1) use one shared state-snapshot function". Its Why: "land moved ticket folders before its
  commit, A-021".
- T-28 (3): operations that cannot be undone or that move data, "the closing commit of land, `ticket done`" among
  them, get "a test of running them again and a test that nothing is lost (z. 29, A-002)".
- T-02: "1 refusal: a code-checked condition is not met, with the reason and the next command; … 3 transient failure:
  a lock after its wait limit …; safe to retry; 4 environment failure: git, the file system, permissions, a missing
  tool". T-01: a failure is never silent. T-25: one module per guarantee.
- The note in `## Tickets` (R-092 review round 1, finding 12): "only `ticket done` takes the ticket-lanes lock;
  `land`'s `closeTickets` runs its plan and apply without it, so its re-check does not exclude a concurrent `ticket
  done`".
- D-039: R-037's criteria include "the command registry holds no entry with `movedBy` naming this ticket" (`close`);
  D-096 (1) (2026-11-23, amending D-094 (3)): "R-101 cuts `limen close` (exit 2, `next: limen seat sweep`; `movedBy:
  "R-101"` until then)".
- D-070 (2): "a ticket that rewrites such a command [on T-38's ratchet] converts it". D-075: "the `irreversible` marks
  of `ticket done` and land's closing commit come with R-065 and R-037". D-092: non-blocking notes go to the ticket that
  rewrites that part.
- z. 14: a guard a hook gives can be bypassed by an indirect write; z. 29: nothing is lost.

Facts at `ca67568` (the read-only inventory `adrian-rebuild/evidence/inventories/R-037.md`, made at `6d17130`; `git diff
6d17130 HEAD -- src hook bin seat test templates docs` is empty; the main session checked the ones it quotes):
1. `applyTicketClose` (`src/project/lanes.ts:174-196`) writes the working tree first: per ticket a plain `mkdir` of
   the month folder (`:183`), `atomicRename` of the folder (`:184`) and `atomicWrite` of `ticket.md` with `landed`
   (`:185-186`), then `writeBoard` (`:189`), then `commitPaths` (`src/project/git.ts:498-507`), which runs `git add -A
   -- <paths>` in the main checkout's own index and then `git commit --quiet -m … -- <paths>`. A failure of the commit
   leaves the moves and the staged paths. `commitPaths` has no other caller.
2. `planTicketClose` (`lanes.ts:131-157`) refuses `TICKETS_UNCOMMITTED` when the board or a closed ticket's folder has
   uncommitted changes; it does not look at the destination folders, and its plan holds no commit.
3. `ticket done` runs `ticketDoneOperation` (`src/project/ticket-folders.ts:124-161`) through the runner: validate
   holds `planTicketClose`'s plan and the jobs it will mark; the lock is `.limen/ticket-lanes` (`:157`); apply is
   `applyTicketClose` (`:158`). Its `landed` markers come after the runner returns (`:114-117`).
4. Land (`src/job/landing.ts:48-111`) is not an operation of the runner (it is on T-38's ratchet `OUTSIDE_RUNNER`,
   `test/structure.test.ts:185`). It merges (`:85`), writes the `landed` marker (`:98-100`), deletes the branch
   (`:104-106`), and only then closes the tickets through `closeTickets` (`lanes.ts:202-209`: plan then apply, no
   lock), catching every error into the line `land: tickets stay active: <message>` and exit 0 (`landing.ts:113-130`).
   `TICKETS_UNCOMMITTED` is first checked there, after the merge. Its registry entry (`src/registry.ts:433-451`)
   declares `BAD_REPO`, `MERGE_FAILED`, `NOT_A_PROJECT` and `PICTURE_NOT_A_FOLDER` and says (`:446-447`) "a ticket
   close that fails leaves the tickets active and says so, without a refusal".
5. The git primitives of abandon's save build a commit without the checkout's index and run no hook: `worktreeTree`
   (`git.ts:480-485`, `GIT_INDEX_FILE`), `commitTree` (`:486-489`), `createBranchOnce` (`:491-493`, an `update-ref`
   that only creates). There is no compare-and-swap of an existing branch and no hook runner. Abandon makes its
   temporary index in a folder of its own in the system's temporary folder and removes it after
   (`src/job/abandoning.ts:194-195`, `:211-213`). Limen requires git 2.36 by a feature probe
   (`src/platform/requirements.ts:24-30`); `git hook run` came with 2.36.
6. `close` carries `movedBy: "R-037"` (`src/registry.ts:687`; `test/registry.test.ts:40`). `src/project/git.ts:290-292`
   says of `MERGE_FAILED` "land is R-037's, which types it further".
7. No test covers a closing commit that fails, in land or in `ticket done`, a rerun after it, or land racing `ticket
   done` (inventory section 6).

## Change

(a) The closing commit (`applyTicketClose`, `src/project/lanes.ts`) in a Git root writes nothing visible before it
exists and the branch has moved to it:
1. The plan (`TicketClose`) holds the commit the close builds on, `head` (the checkout's HEAD as validate read it),
   beside the tickets; validate holds it, so a HEAD that moved before `apply`'s re-check ends in `STATE_CHANGED`
   (T-38 (2)).
2. In a temporary index in a folder of its own (as abandon's, removed after), read from `head`: each ticket folder's
   entries move to `spec/features/done/<YYYY-MM>/<folder>/`, its `ticket.md` gets the `landed` date (a new blob), and
   the board gets NOW and PROVEN as `limen board --write` would render them after the move (a new blob, only when it
   changes). Nothing is written in the working tree or the checkout's index.
3. The hooks that `git commit -m <message>` runs before it commits, in its order and with its environment
   (`GIT_INDEX_FILE` the temporary index, `GIT_EDITOR=:`), through `git hook run --ignore-missing`, which follows
   `core.hooksPath`: `pre-commit`; then the index is read again, as git does, so a hook's change to it is committed;
   `prepare-commit-msg <file> message`; `commit-msg <file>`; the message is read back from the file. A hook that exits
   non-zero ends the close with class `environment`, code `HOOK_REJECTED`, a message naming the hook and holding the
   last 20 lines of its output, and nothing written outside git's object store.
4. `commit-tree` of the index's tree with `head` as its only parent, then the checked-out branch moves from `head` to
   the new commit in one compare-and-swap (`git update-ref -m "commit: <subject>" HEAD <new> <head>`). A branch that
   moved meanwhile (a commit made during the hooks by a process that does not take the lock) ends the close in
   `STATE_CHANGED` (class `transient`), the other commit stays the tip, and nothing of the close is written.
5. Then the checkout follows as `git merge --ff-only` would move it: a two-way `git read-tree -m -u <head> <new>`,
   which keeps every other uncommitted or staged file and refuses to overwrite a file of the close that changed after
   validate. Its failure ends with class `environment`, a message that the closing commit is on the branch and which
   paths stay behind, and `next` the `git read-tree -m -u <head> <new>` that finishes it.
6. The result is as today: the folders moved, the commit short and full, the day. The subject stays `Close <codes>:
   <reason>`, so land's `Close <codes>: landed by <id>` is the one the migration reads (`landedJobOf`).
`commitPaths` goes. A root that is no Git repository (a workspace root) keeps today's moves and board write, with no
commit.

(b) `planTicketClose` refuses `TICKETS_UNCOMMITTED` also when a destination folder `spec/features/done/<YYYY-MM>/<folder>/`
holds a file in the working tree (tracked or not), before any write.

(c) One close operation (T-25): validate holds the plan of (a) 1, the lock is the ticket-lanes lock, apply is (a).
`ticket done`'s operation is that operation with its job reads added; its markers after the commit stay as they are
(R-103).

(d) Land (`src/job/landing.ts`), unless `--keep-open`:
- before its merge, it plans the close of the job's tickets on the target's lanes and refuses `TICKETS_UNCOMMITTED`
  (exit 1) before any write; its registry entry declares the code, and the comment of `src/registry.ts:446-447`
  changes;
- after the branch lines, it runs the close operation of (c) through the runner, under the ticket-lanes lock (R-092's
  finding 12);
- a failure of that close ends land with exit ≠ 0 and no `land: tickets stay active` line: its class and code are the
  close's, except that a refusal of the close's validate at that point, after land's own check, is `STATE_CHANGED`
  (exit 3); the message says that the job landed, its tickets stay active and nothing of the close was written; `next`
  is `limen ticket done <codes>`. The lines land printed before (the merge, `landed …`, the branch lines) stay in its
  text.
The merge, the marker, the branch delete, their order and land's other refusals stay as they are (R-103).

(e) `close`'s `movedBy` becomes `"R-101"` (`src/registry.ts`, `test/registry.test.ts`; D-096 (1)), unless R-101 has
cut `close` already. The comment `src/project/git.ts:290-292` names R-103.

(f) Tests, each failing before the change:
- `test/project/lanes.test.ts` (new, after its module, T-29): a close's commit has `head` as its only parent, holds the
  moves, the `landed` dates and the board `limen board --write` writes after the move, and leaves `git status
  --porcelain` empty except for another session's uncommitted file elsewhere, which stays byte for byte; `HOOK_REJECTED:
  …` a rejecting `pre-commit` leaves the shared snapshot (`test/snapshot.ts`) identical; a `pre-commit` under
  `core.hooksPath` sees the rename in its index (`git diff --cached --name-status`), and a `commit-msg` hook's edit of
  the message is the commit's message; `STATE_CHANGED: …` a `pre-commit` that commits on the branch leaves that commit
  the tip and nothing of the close in the snapshot but that commit; `TICKETS_UNCOMMITTED: …` a file in a destination
  folder refuses with the snapshot identical; a board edited during the hooks stays byte for byte, the closing commit
  is on the branch, and the error's `next` is the `git read-tree` that finishes the checkout.
- `test/cli/ticket.test.ts`: `ticket done` with a rejecting `pre-commit` exits 4 `HOOK_REJECTED` with the snapshot
  identical, and run again once the hook passes it closes the tickets in one commit with a clean status (T-28 (3): run
  again, nothing lost).
- `test/cli/land.test.ts`: `TICKETS_UNCOMMITTED: …` land of a job whose ticket folder has uncommitted changes exits 1
  before its merge with the snapshot identical; land whose closing commit a `pre-commit` rejects exits 4
  `HOOK_REJECTED` with `next` `limen ticket done F001`, the merge and the marker stay, the tickets stay active with
  nothing staged, and that `limen ticket done F001` then exits 0 with a clean status; `LOCK_TIMEOUT: …` with the
  ticket-lanes lock held by a live process and `LIMEN_LOCK_WAIT_MS` small, land exits 3 with `next` `limen ticket
  done F001` and closes nothing.
- `test/project/git.test.ts`: the new git primitives (the compare-and-swap refuses a moved branch; the two-way
  read-tree keeps an unrelated uncommitted file and refuses to overwrite a changed one; the hook run returns a hook's
  exit and output, and a missing hook passes).
- `test/registry.test.ts`: `MOVED` has `close: "R-101"` while `close` exists; no entry names R-037.

(g) Text that becomes false: `docs/commands.md:242` (the close's refusal before the merge, the failure's exit and
`next`, the hooks), `:253` (`ticket done`'s close the same), the comments `src/project/lanes.ts:12`, `:170-172`,
`:198-201`, `src/project/ticket-folders.ts:95-102`, `src/job/landing.ts:1-4`, `:96-97`, `:112`, `src/registry.ts:446-447`.

## Out of scope

- Everything D-094 (3) gives R-103: land as recorded steps (`merged`, `closed`, `cleaned`) on the runner and a rerun
  that continues, the branch deleted after the closing commit, land's other untyped refusals, the `cleaned` step's
  Herdr close, `ticket done`'s markers as a step (the D-092 note), seat step 3.9; and land's `irreversible` mark
  (`## Decisions` 9). The `close` cut and the sweep's close of leftover tabs are R-101's (D-096 (1)).
- `ticket done`'s `irreversible` mark (D-075: R-065); `ticket start` and `ticket drop` (R-065), which will build their
  commits through (a); a generated `outcome.md` (R-065) and `limen spec fix` (R-066) in the closing commit.
- Land's exit 0 with `land: no active ticket for …; nothing closed` (A-070, R-065).
- The `post-commit` hook (`## Decisions` 2).
- A workspace root that is no Git repository (`## Decisions` 11); `limen board --write`, which writes the board with no
  lock and no commit.

## Acceptance

- AC-1: `node --test test/project/lanes.test.ts` → exit 0.
- AC-2: `node --test test/cli/ticket.test.ts` → exit 0; `node --test test/cli/land.test.ts` → exit 0.
- AC-3: `node --test test/s5-land.test.ts` → exit 0; `node --test test/operation.test.ts` → exit 0.
- AC-4: `node --test test/project/git.test.ts` → exit 0; `node --test test/registry.test.ts` → exit 0.
- AC-5: `node --test test/structure.test.ts` → exit 0; `node --test test/cli/migrate.test.ts` → exit 0.
- AC-6: `git grep -q 'movedBy: "R-037"' -- src/registry.ts` → exit 1.
- AC-7: `git grep -q 'commitPaths' -- src` → exit 1.
- AC-8: `node adrian-rebuild/tools/fails-before.mjs` → exit 0, its output in `outcome.md` → `## Fails before`.
- AC-9: `node adrian-rebuild/tools/gate.mjs` → exit 0.
- AC-10: `npx biome check --error-on-warnings .` → exit 0; `node adrian-rebuild/tools/check.mjs` → exit 0.
- AC-11 (judgment): no close writes the working tree, the checkout's index or a ref before its commit exists; the
  branch moves only from the commit validate held; every hook `git commit -m` runs before it commits runs on the
  close's index; every close takes the ticket-lanes lock; land refuses an uncommitted ticket folder or board before its
  merge and never exits 0 after a close that failed.

## Migration

None: no format on disk changes. The closing commit's subject, tree and the record's markers are as before; land's
exit after a failed close changes from 0 to its failure's class (tested). A checkout that a land of an older Limen
left with staged moves is refused by land (`target … has staged changes`) and by `ticket done` (`TICKETS_UNCOMMITTED`)
as today.

## Risk

- The hooks see the working tree as it was before the close, since nothing visible is written before the commit (a
  `git commit -- <paths>` shows them the committed paths in the working tree). A hook that reads the close's files from
  the working tree, such as a formatter of staged Markdown, rejects every close in that project with `HOOK_REJECTED`
  and its output; the fix is in the hook.
- A long hook holds the ticket-lanes lock; another close waits for it up to 60 s, then ends in `LOCK_TIMEOUT`
  (transient, safe to run again).
- A kill between the branch's move and the checkout's read-tree leaves the checkout's index and working tree behind
  the branch on the close's paths, with no error printed: `git status` shows the close reversed as staged, and a commit
  of that would revert it. `git read-tree -m -u <head> <new>` finishes it; R-103's recorded `closed` step continues it.
- The closing commit no longer runs a `post-commit` hook.
- On a git older than 2.36 with a shim that only provides `worktree list -z`, every close ends in `GIT_FAILED` with
  nothing written.

## Rollback

`git revert $(git log --format=%H --grep='^R-037:' adrian-rebuild --)`. No format changed, so nothing on the seat or
in the projects needs undoing.

## Decisions

Settled by the documents when the ticket was written (2026-11-23, the main session's reading, not a night default;
the inventory's questions in `evidence/inventories/R-037.md` → section 10). Items 1, 2, 8 and 9 are named for Adrian's
attention at gate 5.3.
1. How the commit is built (questions 5 and 6): nothing visible is written before the commit exists and the branch has
   moved to it, the pattern of A-057, whose Decision carries it over to the closing commit, and T-38's "by
   construction"; so no rollback of renames (A-021's Direction) is needed, and a failure or a kill before the branch
   moves leaves nothing. The cost is the first Risk: the hooks see the working tree before the close.
2. Which hooks (question 5): the three that `git commit -m` runs before it commits and that can stop it, so the
   closing commit bypasses no guard of the project (z. 14) and no project rule that applies to the closing commit today
   stops applying; `post-commit` cannot stop a commit and git ignores its status, so it is not run (YAGNI).
3. The expected value (question 5): HEAD as validate held it; the runner's re-check under the lock and the
   compare-and-swap of the branch cover a move before and after the re-check (T-38 (2)), both `STATE_CHANGED`.
4. The checkout's catch-up (question 5): git's own fast-forward of a checkout, which keeps the files of another session
   beside it, as land's merge does (`checkCheckoutBeside`), and refuses to overwrite a file that changed during the
   hooks (z. 29).
5. The lock (question 8, finding 12): every close runs one close operation with the ticket-lanes lock (D-094 (3),
   T-25); land's other locks and their order are R-103's.
6. Refusals before the first write (question 7): the close's `TICKETS_UNCOMMITTED` comes before land's merge, and the
   destination folders join it (a file there would otherwise stop the close after other writes). "No active ticket"
   keeps exit 0 (A-070, R-065).
7. Land's failed close (question 9): exit ≠ 0 with a message and the exact next command (A-021's Decision); until
   R-103 makes `limen land <id>` continue, the next command that works is `limen ticket done <codes>`, since the failed
   close left the tickets active and clean. Land itself is not converted to the runner here: R-103 rewrites it as
   recorded steps (D-094 (3)), which is the rewrite D-070 (2) means.
8. The class of a rejecting hook: `environment` (exit 4), code `HOOK_REJECTED`. It is not a refusal, since it comes
   after validate (T-38 (1)), and the project's hook is outside Limen, as git is (T-02).
9. The `irreversible` marks (questions 11 and 12): T-28 (3)'s tests of running again and of losing nothing for the
   closing commit are this ticket's (`## Change` (f)); land's registry mark needs a test that a rerun of land continues,
   which is R-103's (D-094 (3)), so the mark that D-075 gave R-037 goes to R-103 (a note in `## Tickets` → R-103);
   `ticket done`'s stays R-065's (D-075).
10. The commit's content and its record (questions 15 and 16): the moves, the `landed` dates and the board, as today;
    R-065's generated `outcome.md` and R-066's `limen spec fix` join it through (a); the subject stays, because the
    migration reads `Close <codes>: landed by <id>`; the full commit is returned as today, for R-103's `closed` step.
11. A workspace root that is no Git repository (question 17): no commit to make atomic, so its moves stay as they are;
    no project on the seat is known to be one, and steps for it would be R-103's pattern.
12. The other questions (1–4, 8 on the runner, 10, 13, 18, 19) are R-103's (D-094 (3), D-096 (3)); question 14 (the
    `close` cut) is R-101's (D-096 (1)); question 20 is D-094.
13. No requirement probe for `git hook run`: the probe of git 2.36's feature covers the version, and a git without
    the subcommand fails the close loudly (`GIT_FAILED`) with nothing written (T-01).

2026-11-24, the facts at `HEAD` (`bb0ae2b`; protocol step 2, D-025). 25 commits ran after the ticket was written at
`ca67568` (R-029, R-032, R-034, R-036 among them); of the files the ticket names only five changed, and the change is
the same:
14. The pattern's `publishJob` is `src/job/publication.ts:90-123` (was `:88-121`); land's registry entry is
    `src/registry.ts:434-452` (was `:433-451`), its comment still `:446-447`, word for word; `close`'s
    `movedBy: "R-037"` is `src/registry.ts:685` (was `:687`) and `close: "R-037"` is `test/registry.test.ts:42` (was
    `:40`); land on T-38's ratchet `OUTSIDE_RUNNER` is `test/structure.test.ts:186` (was `:185`). The git probe of fact
    5 is still `src/platform/requirements.ts:24-30` (`GIT_FEATURE` `:28`, `NEWER_GIT` `:30`).
15. `src/project/lanes.ts`, `src/project/git.ts`, `src/job/landing.ts`, `src/project/ticket-folders.ts` and
    `src/job/abandoning.ts` are unchanged since `ca67568`, so facts 1–5 and 7 and the places of (h) hold as written.
16. The grep criteria at `HEAD`: AC-6 (`git grep -q 'movedBy: "R-037"' -- src/registry.ts`) exits 0 on the one line
    `src/registry.ts:685`, which (e) changes; AC-7 (`git grep -q 'commitPaths' -- src`) exits 0 on
    `src/project/git.ts:498` and `src/project/lanes.ts:7`, `:194`, each of which the change removes; both are in the
    ticket's scope (D-025). `test/project/lanes.test.ts` (AC-1) does not exist yet; the change creates it.

2026-11-24, the implementer's `BLOCKED` (before any write), settled by the documents (the main session's reading; not
asked, since T-37 and D-046 decide it):
17. (a) 5 and the (f) test named `git read-tree -m -u <head> <new>` as the error's `next`, which T-37, D-045 (5.1) and
    D-046 (1) and (3) forbid ("`next` is always a Limen command or `null`"; `LimenError` refuses any other,
    `src/outcome.ts:54`, `:99-101`). So the failure of the checkout's read-tree after the branch has moved is class
    `environment` with a new code (the implementer's name, `CHECKOUT_BEHIND`, goes to gate 5.3 with the other new
    wordings) and `next` `null`; its message says that the closing commit `<short>` is on the branch, lists the close's
    paths the checkout still holds from before it (`git diff --name-only <head> <new>`), and gives the commands that
    finish it, the refresh of choice 1 and `git read-tree -m -u <head> <new>`. The (f) test checks that the message holds
    the read-tree command and that `next` is `null`.
18. Land, (d): that one failure keeps its message, with land's own prefix, and `next` `null`. Land does not put
    `limen ticket done <codes>` in its `next` and does not say that nothing of the close was written: after the move the
    closing commit is on the branch, and that rerun would refuse `TICKETS_UNCOMMITTED` (D-046 (1): a successor is a
    command that continues, not one that refuses). Every failure before the branch moves keeps (d) as written. The rerun
    that continues after the move is R-103's recorded `closed` step (D-094 (3), D-096 (3) (f)).
19. The implementer's technical choices 1–4, 6 and 7 hold as it gave them (the index refreshed before the read-tree;
    `git stripspace` for the message; a git with no `hook` subcommand is `GIT_FAILED`, Decision 13; `HOOK_REJECTED` of
    `ticket done` with the call's own command line as `next`, D-046 (1); the in-process test project with git's global
    and system configuration off; the two-snapshot land tests). Choice 5 with one addition (z. 29, T-01): after the
    read-tree, an old ticket folder that still exists (it holds ignored or untracked files only, which a two-way
    read-tree does not move) is named in a line of the close's output, and its files stay. If a reader of the lanes
    (the board, `ticket check`, the number scan) would read such a folder as an active ticket or fail on it, the
    implementer replies `BLOCKED` with the evidence instead of widening the change.

2026-11-24, protocol step 4 (the main session; `outcome.md` → `## Proof`):
20. The main session's first gate failed on `test/group-extensions.test.ts:92` alone, under a load average of 17;
    Adrian chose the diagnosis (D-029's question, option 1): the file alone passed 4 of 4, and the gate run once more
    passed 1106 of 1106. The gate took 512 s and 568 s with this change, against 245–260 s through R-036, while this
    change's own tests take about 2 s each. Review question: does the close add a fixed wait, a lock wait or a
    retry with a delay on a path that land, `ticket done` or other commands take in the tests?

2026-11-24, review round 1 (`review.md` → Round 1; FAIL on finding 1 alone; the main session's reading, from D-046 (1),
Decision 18, T-25 and D-092), the findings to fix:
- F1 (blocking): land's refusals before its merge (`TICKETS_UNCOMMITTED` and the destination-folder refusal) carry
  `next` `limen land <id>`, the refused call with its job (D-046 (1)), and a message that says to commit the named
  paths and land again; never `limen ticket done`, since nothing has merged and that close would leave the job's work
  unlanded. Test: `test/cli/land.test.ts:162` asserts that `next` and the snapshot unchanged; it fails at `HEAD`.
- F2 (note 2): the `CHECKOUT_BEHIND` message tells to move the changed files it lists aside (out of the checkout or
  to another name), then run the refresh and `git read-tree -m -u <head> <new>`; it never says to commit them, since a
  commit in that state reverts the close (Risk 3). Its test asserts the move and no commit in the text.
- F3 (note 4, T-25, (c)): `ticket done` runs `closeOperation` itself, its job reads added through a parameter of it,
  so one operation holds the close's validate, lock and apply for both commands.
- F4 (note 5): `outcome.md` → `## Open points` names, for gate 5.3, that `git commit-tree` does not read
  `commit.gpgSign`, so a project that signs commits would get unsigned closing commits, and that `## Deployment` reads
  `git config --get commit.gpgSign` in both projects before `a0.3.0`; no code change.
- Note 3 answers Decision 20 (no wait added; the gate's time is M-10's); note 6 goes to R-103's notes.

2026-11-24, review round 2 (`review.md` → Round 2; PASS with six notes; the main session's reading), the findings to
fix, the last round (`## Agents`, step 6):
- G1 (note 1): the comment `src/registry.ts:446-447` says what land does when the close fails after the merge: the
  close's class with `limen ticket done <codes>`, except a refusal there (`STATE_CHANGED`) and `CHECKOUT_BEHIND`
  (`next` null).
- G2 (note 2, T-30): the two pointers name the ticket: "R-037, review round 1, F1" (`src/job/landing.ts:132`) and
  "R-037, review round 1, F2" (`src/project/lanes.ts:419`).
- G3 (note 5): `stayedLine` says the old folder holds files git does not track (ignored or untracked), which stay
  there; its test asserts those words.
- G4 (notes 3 and 4): `outcome.md` → `## Fails before` opens with the main session's run after round 1 (six files,
  `test/job/landing.test.ts` noted as a change of its request only), then the earlier ones; `## Deviations from the
  ticket` numbered in order.
- G5 (T-29): the land destination-folder test takes the month from the close (or fixes the close's date) instead of
  computing it itself, so a run across a month boundary cannot fail it.
