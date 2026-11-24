<!-- PL: Wynik R-037 (implementer, 24.11, przy `bb0ae2b`): commit zamknięcia ticketów, wspólny dla `limen land`
i `limen ticket done`, powstaje w tymczasowym indeksie z HEAD, które przeczytał validate, przechodzi przez hooki
`pre-commit`, `prepare-commit-msg` i `commit-msg`, a gałąź przesuwa się jednym compare-and-swap; dopiero potem
checkout dogania commit dwukierunkowym `git read-tree -m -u` (z odświeżeniem indeksu), a jego odmowa to
`CHECKOUT_BEHIND` z `next` null. Każde zamknięcie bierze blokadę ticket-lanes, plan odmawia też pliku w folderze
docelowym, land odmawia `TICKETS_UNCOMMITTED` przed merge'em z `next` `limen land <id>` i po nieudanym
zamknięciu kończy się kodem jego klasy z `next` `limen ticket done <kody>`; `close` ma `movedBy` R-101. Runda 1
recenzji: F1 (`next` odmowy landu przed merge'em), F2 (komunikat `CHECKOUT_BEHIND` każe odsunąć pliki, nie
commitować), F3 (`ticket done` uruchamia samo `closeOperation`), F4 (punkt otwarty o `commit.gpgSign`). Runda 2
(PASS, ostatnia runda poprawek): G1 i G2 (komentarze), G3 (linia o plikach, których git nie śledzi), G4 (porządek tego
pliku), G5 (test landu bierze miesiąc z funkcji zamknięcia). Runda 3: PASS z trzema uwagami; wskaźniki w teście landu
trafiają do notatek R-103. Stan: zamknięty (`done`). -->

# R-037 outcome

## Done

(a) The closing commit (`src/project/lanes.ts`). `TicketClose` holds `head`, the checkout's HEAD as validate read it
(`null` outside a Git repository), so the runner's re-check under the lock ends a moved HEAD in `STATE_CHANGED`.
`applyTicketClose(close, again)` in a Git repository calls `commitClose`:
1. `closingCommit` makes a folder of its own in the system's temporary folder (`limen-close-*`, removed after) and an
   index file there read from `head` (`readTreeInto`). Each ticket folder's entries move to
   `spec/features/done/<YYYY-MM>/<folder>/` with their modes and objects; `ticket.md` gets a new blob with the `landed`
   date; the board gets a new blob, only when it changes, rendered by `boardOf` as `limen board --write` renders it
   once the moves are made (`writeBoard` now uses the same function). One `update-index -z --index-info` writes them.
2. The hooks `git commit -m` runs before it commits, in its order, with `GIT_INDEX_FILE` the temporary index and
   `GIT_EDITOR=:`, through `git hook run --ignore-missing` (`runHook`, which follows `core.hooksPath`): `pre-commit`;
   then `write-tree` of the index as the hook left it; `prepare-commit-msg <file> message`; `commit-msg <file>`. The
   message file (`COMMIT_EDITMSG` in the temporary folder) is read back and cleaned with `git stripspace`, as
   `git commit -m` does by default. A hook that exits non-zero ends the close with class `environment`, code
   `HOOK_REJECTED`, a message that names the hook and its exit code and holds the last 20 lines of its output
   (`HOOK_LINES`), and `next` the call's `again` (Decision 19, choice 4); nothing is written outside git's object
   store. A git without `hook` is `GIT_FAILED` (Decision 13).
3. `commit-tree` of that tree with `head` as its only parent, then `moveHead`: `git update-ref -m "commit: <subject>"
   HEAD <new> <head>`. A HEAD that moved meanwhile ends the close in `STATE_CHANGED` (transient, `next` `again`), and
   the other commit stays the tip.
4. Then `followCommit`: `git update-index -q --refresh` (as `git merge --ff-only` refreshes first; without it a file
   whose time stamp changed but not its content made the read-tree refuse, Decision 19, choice 1), then the two-way
   `git read-tree -m -u <head> <new>`. Its failure is class `environment`, the new code `CHECKOUT_BEHIND`, `next`
   `null` (Decision 17): the message names the closing commit on the branch, the close's paths the checkout still holds
   from before it, git's words, the files there that changed since the checks, to move aside and never to commit
   (review round 1, F2), and the two commands that finish it.
5. The result is as before, the folders moved, the commit short and full, the day, plus `stayed`: each old ticket
   folder that still exists after the read-tree because it holds files git ignores; both commands print
   `kept <folder>: it holds files git does not track, which stay there` for it (Decision 19; review round 2, G3). The subject stays `Close <codes>:
   <reason>`. `commitPaths` and `closeTickets` are gone. A root that is no Git repository keeps today's moves in place
   and board write, with no commit.
   New git primitives in `src/project/git.ts`: `indexEnvironment` (also used by `worktreeTree`), `IndexEntry`,
   `readTreeInto`, `indexEntries`, `editIndex`, `indexTree`, `storeBlob`, `blobText`, `runHook`, `cleanMessage`,
   `moveHead`, `followCommit`, `changedInCheckout` (review round 1, F2), `changedPaths`, `shortCommit`.

(b) `planTicketClose` also refuses `TICKETS_UNCOMMITTED` when a file, tracked or not, is in a destination folder
`spec/features/done/<YYYY-MM>/<folder>/` (`filesBelow`). Both refusals name `retry`: `limen ticket done <codes>` by
default, the land's own call before its merge (review round 1, F1).

(c) One close operation: `closeOperation(request)` in `lanes.ts`, whose `CloseRequest` names `root` (validate's first
step: the call's own checks, then the project's root), `codes`, `reason`, `today`, `again` and an optional `added`, the
caller's reads beside the plan. Validate holds the plan and then runs `added`, whose refusal ends it; the lock is
`.limen/ticket-lanes`; apply is `applyTicketClose`, and what `added` read comes back as `added` with the result.
`ticketDoneOperation` (`src/project/ticket-folders.ts`) is that operation, with `BAD_DATE` in `root` and
`NO_ACTIVE_TICKET` and the job reads in `added` (review round 1, F3); its markers after the commit are unchanged.

(d) Land (`src/job/landing.ts`), unless `--keep-open`: `closingTickets` reads the job's tickets before the question and
the merge and runs `planTicketClose`, so `TICKETS_UNCOMMITTED` (exit 1) comes before any write, with `next` the land's
own command line (`LandRequest.again`, from `src/commands/land.ts`; review round 1, F1); the registry entry declares
it, and its comment changed. After the branch lines `closeLandedTickets` runs `closeOperation` through the
runner (`validated`, then `apply`), under the ticket-lanes lock. `landFailure` turns a failed close into land's failure:
a refusal of validate there is `STATE_CHANGED` (transient) with the refusal's own `next`; `CHECKOUT_BEHIND` keeps its
message, with `job <id> landed onto <target>; ` before it, and `next` `null` (Decision 18); any other failure keeps its
class and code, says `job <id> landed onto <target>, but its tickets stay active and nothing of their close was
written: <the close's message>`, and has `next` `limen ticket done <codes>`. The line `land: tickets stay active` is
gone. The merge, the marker, the branch delete and their order are unchanged.

(e) `close`'s `movedBy` is `"R-101"` (`src/registry.ts`, `test/registry.test.ts`'s `MOVED`); the comment of
`mergeBranch` in `src/project/git.ts` names R-103.

(f) Tests: `test/project/lanes.test.ts` (new, 9 tests with round 1's two), 4 new tests in `test/project/git.test.ts`, 2
in `test/cli/ticket.test.ts`, 4 in `test/cli/land.test.ts` (with round 1's), and `MOVED` in `test/registry.test.ts`; the shared helper
`installHook` in `test/plant.ts` writes a hook into a folder beside the plant's repository that `core.hooksPath` names.

(g) Text: `docs/commands.md` (the land paragraph on the close, at line 246, and the `ticket done` paragraph, at line
257, which now describes the closing commit, its hooks and its failures), and the comments of `src/project/lanes.ts`
(the `LANDED_BY` line, `applyTicketClose`, the removed `closeTickets`), `src/project/ticket-folders.ts`
(`closeDoneTickets`, `ticketDoneOperation`), `src/job/landing.ts` (the header, the marker's comment,
`closeLandedTickets`) and `src/registry.ts` (land's refusals).

## Fixes of review round 1

Each test was written first and run before its fix; the runs are in `## Fails before` → "Review round 1".

- F1 (blocking): land's refusals before its merge name the land again. `planTicketClose` takes `retry`, the command its
  two `TICKETS_UNCOMMITTED` refusals name in their message and `next`; `limen land` passes its own command line
  (`values.commandLine()` into `LandRequest.again`, through `closingTickets`), so the message says `commit them, then
  run limen land <id>` (or `move them, …` for a file where a ticket moves) and `next` is `limen land <id>`. The refusal
  of the close's validate after the merge keeps `limen ticket done <codes>` (Decision 18). Tests: the land test of an
  uncommitted ticket folder asserts `next` `limen land <id>` and the message; a new land test does the same for a file
  in the destination folder.
- F2 (note 2): the `CHECKOUT_BEHIND` message lists the files of the close that changed in the checkout since the checks
  (`changedInCheckout`: `git diff --name-only` and `git ls-files --others` over the close's paths), says to move them
  aside, out of the checkout or to another name, and to make no commit before the read-tree, since one would revert the
  close; then the refresh and `git read-tree -m -u <head> <new>`. "committed or moved" is gone. Test: a new lanes test
  asserts `aside, out of the checkout or to another name: spec/build.md` and no "committed or moved" or "commit them".
- F3 (note 4): `ticket done` runs `closeOperation` itself (`(c)` above); `holdTicketClose` and `closeLock` are no longer
  exported parts. Test: a new lanes test runs the operation with an `added` read and asserts that it saw the plan's
  tickets and that the result returns what it read with the move.
- F4 (note 5): `## Open points` → 5; no code change.
- Note 3 (Decision 20's question): the close adds no fixed wait, no sleep and no retry with a delay; the one wait is
  the ticket-lanes lock's, which no test holds but the `LOCK_TIMEOUT` test, with `LIMEN_LOCK_WAIT_MS` 100. A close
  runs about 15 more git processes than before (`read-tree`, `ls-files` per ticket and for the board, `cat-file` and
  `hash-object` per changed blob, `update-index`, three `hook run`, `write-tree`, `stripspace`, `commit-tree`,
  `rev-parse --short`, `diff`, `update-ref`, `update-index --refresh`, `read-tree -m -u`, against `add`, `commit` and
  two `rev-parse`), and validate one more (`rev-parse HEAD`, twice with the re-check). Note 6 goes to R-103's notes.

## Fixes of review round 2

The last round of fixes (`## Agents`, step 6). G3's and G5's tests were written first and run before their fixes;
the runs are in `## Fails before` → "Review round 2".

- G1 (note 1): the comment of land's refusals in `src/registry.ts` says what land does when the close fails after the
  merge: the close's class with `limen ticket done <codes>`, except a refusal there, which is `STATE_CHANGED`, and
  `CHECKOUT_BEHIND`, whose `next` is null since its commit is on the branch (Decision 18).
- G2 (note 2, T-30): the two pointers name the ticket: "R-037, review round 1, F1" (`src/job/landing.ts`,
  `closingTickets`) and "R-037's Risk 3; R-037, review round 1, F2" (`src/project/lanes.ts`, `checkoutBehind`).
- G3 (note 5): `stayedLine` says `kept <folder>: it holds files git does not track, which stay there`, true for an
  ignored file and for an untracked one a hook made; the comment of `TicketsClosed.stayed` and `docs/commands.md` say
  the same. Test: the `ticket done` test of an ignored file asserts the new words.
- G4 (notes 3 and 4): `## Fails before` opens with the main session's run after round 1, then the earlier ones, then
  round 2's; `## Deviations from the ticket` is numbered in order.
- G5 (T-29): the land test of a file in the destination folder takes the folder from the close itself:
  `src/project/lanes.ts` exports the close's day (`localDay(at)`, formerly the private `localDate`) and its destination
  (`doneFolder(from, day)`, formerly `destination`), and the test plants the file in the destination of the day now
  and of the day an hour later, so the land, seconds later, meets a file there in whichever month it closes.
- Note 6 (a hook's output in land's message) has no change: `## Open points` → 6.

## Proof

- The main session's runs (protocol step 4, after `compare --git` → "within its limits", exit 0):
  - `node adrian-rebuild/tools/gate.mjs` → exit 1: tests 1106, pass 1105, fail 1 (511.9 s; load average 17.08 right
    after it, on 6 cores): `test/group-extensions.test.ts:92` "Pi teams keep common and private selections through
    workers, reviews and continuation" failed after 14.6 s; its message was not kept (the command filtered the output,
    and the test removes its folders). A finding by D-029, not run again for a green gate: Adrian chose the diagnosis
    (2026-11-24, option 1). The test runs groups, spawn and continue, not land or `ticket done`; of this change it loads
    only `src/registry.ts` and `src/project/git.ts`.
  - The diagnosis: `node --test test/group-extensions.test.ts` → exit 0, 4 of 4 (the test 13.8 s; load average 1.71
    before it), so the failure is one occurrence under load, and `waitJob`'s 120 s bound was not what ended it.
  - `node adrian-rebuild/tools/gate.mjs` → exit 0: tests 1106, pass 1106, fail 0, cancelled 0 (568.1 s; load average
    14.40 right after it). `node adrian-rebuild/tools/fails-before.mjs` → exit 0 (`## Fails before`).
  - The gate's time: 150.8 s at `a0.2.0` (`evidence/gate-time-a0.2.0.md`), 245–260 s through R-036, 380 s in the
    implementer's run and 512–568 s in the main session's; this change's own land and `ticket done` tests take about
    2 s each. The cause is not found here; M-10 measures the gate at the close of the stage.
  - After the fixes of review round 1 (`compare --git` → "within its limits", exit 0): `node
    adrian-rebuild/tools/gate.mjs` → exit 0, tests 1109, pass 1109, fail 0, cancelled 0 (281.8 s; load average 5.26
    before it and 15.41 right after it; the implementer's run of the same tree took 263 s, so the earlier 512–568 s
    came with a loaded machine, not with this change); `node adrian-rebuild/tools/fails-before.mjs` → exit 0, six files
    failing at `HEAD` `bb0ae2b` (`test/job/landing.test.ts` added).
  - After the fixes of review round 2 (`compare --git` → "within its limits", exit 0): `node
    adrian-rebuild/tools/gate.mjs` → exit 0, tests 1109, pass 1109, fail 0, cancelled 0 (278.0 s);
    `node adrian-rebuild/tools/fails-before.mjs` → exit 0, the same six files.
- The implementer's runs: `node adrian-rebuild/tools/gate.mjs` (AC-9) → exit 0: `tests 1106`, `pass 1106`, `fail 0`, `cancelled 0`, `skipped 0`
  (`duration_ms 379768`), with `tsc --noEmit` and `biome check --error-on-warnings .` before the tests. One run, after
  the last source change.
- The implementer's runs after the fixes of review round 1:
  - `node adrian-rebuild/tools/gate.mjs` (AC-9) → exit 0: `tests 1109`, `pass 1109`, `fail 0`, `cancelled 0`,
    `skipped 0` (`duration_ms 263358`); one run, after the last source change of round 1.
  - `node --test test/project/lanes.test.ts test/project/git.test.ts test/cli/land.test.ts test/cli/ticket.test.ts
    test/job/landing.test.ts test/operation.test.ts test/s5-land.test.ts test/registry.test.ts test/structure.test.ts
    test/cli/migrate.test.ts` (AC-1–AC-5) → exit 0, 172 of 172 pass.
  - `git grep -q 'movedBy: "R-037"' -- src/registry.ts` (AC-6) → exit 1; `git grep -q 'commitPaths' -- src` (AC-7) →
    exit 1.
  - `node adrian-rebuild/tools/check.mjs` (AC-10) → exit 0, `0 errors`; `npx biome check --error-on-warnings .` → exit
    0 (`Checked 280 files … No fixes applied.`); `npx biome check --error-on-warnings adrian-rebuild` → exit 0.
- The implementer's runs after the fixes of review round 2:
  - `node --test test/cli/ticket.test.ts test/cli/land.test.ts test/project/lanes.test.ts test/job/landing.test.ts
    test/registry.test.ts test/structure.test.ts` → exit 0, 114 of 114 pass.
  - `node adrian-rebuild/tools/gate.mjs` (AC-9) → exit 0: `tests 1109`, `pass 1109`, `fail 0`, `cancelled 0`,
    `skipped 0` (`duration_ms 266984`); one run, after the last source change of round 2.
  - `git grep -q 'movedBy: "R-037"' -- src/registry.ts` (AC-6) → exit 1; `git grep -q 'commitPaths' -- src` (AC-7) →
    exit 1.
  - `node adrian-rebuild/tools/check.mjs` (AC-10) → exit 0, `0 errors`; `npx biome check --error-on-warnings .` → exit
    0 (`Checked 280 files … No fixes applied.`); `npx biome check --error-on-warnings adrian-rebuild` → exit 0.

The implementer's runs before review round 1:

- `node --test test/project/lanes.test.ts` (AC-1) → exit 0, 7 of 7 pass.
- `node --test test/cli/ticket.test.ts test/cli/land.test.ts` (AC-2) → exit 0, 21 of 21 pass (12 and 9).
- `node --test test/cli/land.test.ts test/s5-land.test.ts test/operation.test.ts test/registry.test.ts
  test/job/landing.test.ts test/cli/migrate.test.ts` (AC-2, AC-3, AC-4, AC-5 in part) → exit 0, 93 of 93 pass.
- `node --test test/project/git.test.ts` (AC-4) → exit 0, 7 of 7 pass (with `lanes.test.ts` in one run: 14 of 14 after
  the fix of the test below).
- `node --test test/structure.test.ts` (AC-5) → exit 0, 50 of 50 pass.
- `git grep -q 'movedBy: "R-037"' -- src/registry.ts` (AC-6) → exit 1.
- `git grep -q 'commitPaths' -- src` (AC-7) → exit 1.
- `node adrian-rebuild/tools/check.mjs` (AC-10) → exit 0, `0 errors`.
- `npx biome check --error-on-warnings .` (AC-10) → exit 0, `Checked 280 files … No fixes applied.`

## Fails before

AC-8, the main session's last run, after the fixes of review round 2 (review round 3, note 3): `node
adrian-rebuild/tools/fails-before.mjs` → exit 0, first line: `fails-before: test/cli/land.test.ts, test/cli/ticket.test.ts,
test/job/landing.test.ts, test/project/git.test.ts, test/registry.test.ts, test/project/lanes.test.ts fail at HEAD (exit
1)`. Since G5, `test/cli/land.test.ts` fails at `HEAD` on its import of `doneFolder` and `localDay` as a whole file
(review round 3, note 2, accepted as Deviation 6); its tests' own reasons are the implementer's runs below.

The main session's run after the fixes of review round 1 (`## Proof`): `node adrian-rebuild/tools/fails-before.mjs`
→ exit 0, six files failing at HEAD `bb0ae2b`: the five below and `test/job/landing.test.ts`, whose only change is the
`again` field of its `LandRequest`, which the code at HEAD ignores, so that file passes there and the run fails on the
other five.

AC-8, the main session's run at HEAD `bb0ae2b`: `node adrian-rebuild/tools/fails-before.mjs` → exit 0, first line:
`fails-before: test/cli/land.test.ts, test/cli/ticket.test.ts, test/project/git.test.ts, test/registry.test.ts,
test/project/lanes.test.ts fail at HEAD (exit 1)`.

`node adrian-rebuild/tools/fails-before.mjs test/project/lanes.test.ts test/project/git.test.ts test/cli/ticket.test.ts
test/cli/land.test.ts test/registry.test.ts`, the implementer's run with the tests written and no source change
(HEAD `bb0ae2b`) → exit 0, first line: `fails-before: test/project/lanes.test.ts, test/project/git.test.ts,
test/cli/ticket.test.ts, test/cli/land.test.ts, test/registry.test.ts fail at HEAD (exit 1)`; among its output the
registry's `close: 'R-037'` against `close: 'R-101'`.

The same files run directly on the working tree with no source change (git 2.56.1 on PATH, D-060), each new test's
reason:
- `test/project/lanes.test.ts` → the file fails: `SyntaxError: The requested module '../../src/project/lanes.ts' does
  not provide an export named 'closeOperation'`.
- `test/project/git.test.ts` → the file fails: `SyntaxError: The requested module '../../src/project/git.ts' does not
  provide an export named 'followCommit'`.
- `TICKETS_UNCOMMITTED: land of a job whose ticket folder has uncommitted changes …` → `actual: [ 0, { class: 'ok',
  code: null, next: null }, … ]` against `[ 1, { class: 'refused', code: 'TICKETS_UNCOMMITTED', next: 'limen ticket
  done F001' }, … ]`: land merged, moved `main` and deleted the job's branch.
- `HOOK_REJECTED: land whose closing commit a pre-commit hook rejects …` → `actual: [ 0, { class: 'ok', … }, [ …,
  'M  spec/build.md\nR  spec/features/active/F001-demo/ticket.md -> spec/features/done/2026-11/F001-demo/ticket.md\n'
  ], true ]`: A-021's staged leftovers and the `land: tickets stay active` line.
- `LOCK_TIMEOUT: land while a live process holds the ticket-lanes lock …` → `actual: [ 0, { class: 'ok', … } … ]`
  against `[ 3, { class: 'transient', code: 'LOCK_TIMEOUT', next: 'limen ticket done F001' } … ]`.
- `HOOK_REJECTED: ticket done whose pre-commit hook rejects …` → `actual: [ 4, { class: 'environment', code:
  'GIT_FAILED', next: null }, { … status: 'M  spec/build.md\nR  spec/features/active/F001-demo/ticket.md -> …' } ]`.
- `ticket done leaves a file git ignores in the ticket's old folder …` → `ENOENT: … open
  '…/spec/features/active/F001-demo/.ticket.md.swp'`: the rename took the ignored file along.
- `D-039: the moved entries are exactly the commands a subsequent ticket moves …` → `close: 'R-037'` against
  `close: 'R-101'`.

Review round 1, the implementer's runs with each test written before its fix (HEAD `bb0ae2b`):
- `node --test test/project/lanes.test.ts test/cli/land.test.ts test/job/landing.test.ts`, the tests written and no fix
  → exit 1, 11 of 20 fail. F1: both land tests, the message `uncommitted changes in
  spec/features/active/F001-demo/notes.md; commit them, then run limen ticket done F001` and `files are where the close
  moves the tickets: spec/features/done/2026-11/F001-demo/outcome.md; move them, then run limen ticket done F001`, each
  with `next: 'limen ticket done F001'` against `limen land <id>`. F3: every lanes test, `TypeError [Error]: Cannot read
  properties of undefined (reading 'join')` in `closeOperation`'s validate, which took positional arguments, given the
  request object.
- `node --test test/project/lanes.test.ts` after F3's change and before F2's → exit 1, 2 of 9 fail: F2's test,
  `actual: [ 'CHECKOUT_BEHIND', false, true ]` against `[ 'CHECKOUT_BEHIND', true, false ]` (the message said "Once the
  files there are committed or moved"); and the first test, whose result has the new field `added: undefined`, which
  its expected value then gained.

Review round 2, the implementer's runs with G3's and G5's tests written before their fixes (HEAD `bb0ae2b`):
- `node --test test/cli/ticket.test.ts test/cli/land.test.ts`, the tests written and no fix → exit 1, 2 fail. G5: the
  file `test/cli/land.test.ts` fails, `SyntaxError: The requested module '../../src/project/lanes.ts' does not provide
  an export named 'doneFolder'`. G3: `ticket done leaves a file git ignores in the ticket's old folder …` → its line was
  `kept spec/features/active/F001-demo: it holds files git ignores, which stay there`, so the assertion of the new
  words gave `false` against `true`.
- After the fixes: `node adrian-rebuild/tools/fails-before.mjs test/cli/ticket.test.ts test/cli/land.test.ts` → exit 0,
  first line: `fails-before: test/cli/ticket.test.ts, test/cli/land.test.ts fail at HEAD (exit 1)` (at HEAD
  `land.test.ts` lacks `doneFolder`, and `ticket.test.ts` lacks `installHook`, since `test/plant.ts` was not named).

One test of mine was wrong at the first run after the change: the `STATE_CHANGED` test's expected snapshot replaced
the old HEAD with the other process's commit in `refs` only, while the snapshot's `worktrees` names HEAD too. The test
now replaces it in both; the close itself behaved as the test meant (the other commit the tip, nothing of the close in
the tree).

## Deviations from the ticket

1. Decisions 17–19 settle the read-tree failure (`CHECKOUT_BEHIND`, `next` `null`), land's handling of it, and the
   implementer's technical choices 1–7; the code follows them. The new texts for gate 5.3: the code `CHECKOUT_BEHIND`
   and its message, the `HOOK_REJECTED` message, the line `kept <folder>: it holds files git does not track, which stay
   there`,
   and land's `job <id> landed onto <target>, but its tickets stay active and nothing of their close was written: …`.
2. Land skips the close's `apply`, and with it the lock, when the plan its validate made after the merge holds no
   active ticket: nothing would be written, and a `LOCK_TIMEOUT` there would have no `limen ticket done` to name. It
   prints `land: no active ticket for …; nothing closed` and exits 0, as before (A-070, R-065).
3. A validate failure after the merge that is no refusal (a git read that fails) names `limen ticket done` with the
   tickets that were active before the merge, or `null` when none was; (d) names `<codes>` without saying whose.
4. `ticket.test.ts` holds one test beyond (f), for Decision 19's line; `test/plant.ts` gains `installHook`, which three
   test files use (T-25 (2)).
5. Review round 1, F1: of land's two refusals before the merge, the one of a file in a destination folder says `move
   them, then run limen land <id>`, not "commit": a committed file there is still in the folder and refuses again.
6. Review round 2, G5: the close's `localDay` and `doneFolder` are exported so that a test takes the land's month from
   them; their code is unchanged.

## Unmeasured

None of M-01–M-13 measures the closing commit. What only the seat shows is the projects' own hooks (the Risk: a hook
that reads the close's files from the working tree would reject every close with `HOOK_REJECTED`); no metric covers
it, so it stays an open point for the deployment, not an `unmeasured` metric.

## Open points

1. Decision 19's check of the lane readers, done before the change: no reader reads an old folder that holds only
   files git does not track as a ticket or fails on it. `readTickets` (`src/picture/tickets.ts:49-58`, used by the board,
   `planTicketClose` and `ticket check`'s tip) skips a folder with no `ticket.md`; the number scan (`ticketFolders`,
   `src/project/series.ts:88-101`) counts the folder's F number, which the done folder holds anyway; `ticket check`
   reads the branch's git trees (`duplicateTicketErrors`, `src/project/ticket-check.ts:164-189`), where the folder is
   not.
2. A `commit-msg` hook that empties the message gives a commit with an empty message, where `git commit` would abort;
   no hook of the seat's projects is known to do that.
3. Whether the seat's projects have hooks that read staged files from the working tree (the ticket's first Risk) is
   unknown here; a deployment step that lists `core.hooksPath` and `.git/hooks` of both projects would tell.
4. `TicketClose.committed` now equals `head !== null`; it stays, since `ticket done`'s validate reads it.
5. For gate 5.3 (review round 1, note 5, F4): `git commit-tree` does not read `commit.gpgSign`, so a project that signs
   its commits would get unsigned closing commits from land and `ticket done`. No project is known to sign;
   `## Deployment` is to read `git config --get commit.gpgSign` in both projects before `a0.3.0`, a step this ticket
   does not write (`plan.md` is the main session's).
6. Review round 2, note 6, no change: `HOOK_REJECTED` carries up to 20 lines of a project hook's output into land's
   message after the merge of the job's files, as `git commit`'s stderr reached land's line before; an observation for
   the gate 5.3 summary.
