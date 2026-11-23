<!-- PL: Specyfikacja poprawki narzędzia fails-before.mjs (punkt otwarty 3 z outcome.md R-018, `## State` → Next 3),
w kształcie ticket.md, dla recenzji rebuild-reviewer (narzędzie przebudowy bez numeru R-NNN, jak handover.mjs w D-047
i ticket-rules.mjs w D-054). Kopia HEAD powstaje w prywatnym TMPDIR bramki zamiast w katalogu tymczasowym systemu, więc
testy pollera GitHuba nie padają na HEAD z powodu miejsca uruchomienia. Stan: napisany 23.11; zmiana i recenzja w
outcome.md i review.md. -->

# `fails-before.mjs` makes its copy of HEAD under the gate's private TMPDIR

## Problem

R-018's `outcome.md` → Open points 3 (2026-11-20): "`fails-before.mjs` puts its copy of `HEAD` under the OS temporary
folder of the calling process (`/tmp`, mode 1777), not under the gate's private `TMPDIR`. There the poller refuses its
own module path (`privatePath(modulePath, …)`, `src/integrations/github-poller.ts:781`), so the five `github poll` tests
of `test/cli/github.test.ts` fail at `HEAD` with `unsafe owner or permissions on /tmp` whenever that file is among the
changed tests. … It makes `test/cli/github.test.ts` "fail at `HEAD`" for a reason other than this ticket's test". The
plan's `## State` → `Next` 3 gives the fix: "`fails-before.mjs` makes its copy of HEAD under the gate's private temp
folder rather than `/tmp` …, with its test and a review by `rebuild-reviewer`, as D-047 and D-054 were".

Facts at `f86549e`: `headWith` creates the copy with `mkdtempSync(join(tmpdir(), "fails-before-"))`
(`adrian-rebuild/tools/fails-before.mjs:46`); the tests then run there with `gateEnv(repo, base)`
(`:73-78`), whose `TMPDIR` is the private folder `<XDG_CACHE_HOME or ~/.cache>/limen-rebuild-gate`, mode 700
(`adrian-rebuild/tools/gate-env.mjs:40-44`). So the tests' cwd and their `TMPDIR` differ, and the cwd lies in a folder
other users can write.

## Change

- `fails-before.mjs` builds the gate's environment once, before the copy, and makes the copy's folder with
  `mkdtempSync` in that environment's `TMPDIR`; the same environment runs the tests. The folder is filled inside the
  `try` whose `finally` removes it, so a failure while the copy is made leaves nothing behind (review round 1, note 2).
- `adrian-rebuild/tools/test-fails-before.mjs` gets a test that fails before the change: with `XDG_CACHE_HOME` set to a
  folder of the test, a fixture test records its working directory and its `TMPDIR` into a file the outer test names
  and then fails (so the tool exits 0); the outer test asserts that the real path of the folder that held the copy is
  the real path of that `TMPDIR` (review round 1, note 3). A second test makes the copy fail (a listed test path that
  is not in the working tree) with the OS temporary folder set to the gate's private folder, and asserts a non-zero
  exit and no `fails-before-*` folder left there (review round 2, note 1).
- The Polish summary of `fails-before.mjs` names the private TMPDIR.

## Out of scope

- `gate-env.mjs` and `gate.mjs` (unchanged); the other tools that use the OS temporary folder for fixtures
  (`test-*.mjs`), whose fixtures need no private folder.

## Acceptance

- AC-1: `node --test adrian-rebuild/tools/test-fails-before.mjs` → exit 0.
- AC-2: `npx biome check --error-on-warnings .` → exit 0; `node adrian-rebuild/tools/check.mjs` → exit 0.
- AC-3 (judgment): the copy of HEAD and the tests' `TMPDIR` are the same private folder; the new test fails before the
  change (its run is in `outcome.md`).

## Risk

- The private folder is in the user's cache folder, so a copy of HEAD (about 10 MB at `f86549e`) fills `~/.cache` for
  the run's length instead of `/tmp`; the copy is removed in `finally`, as before. A run killed before `finally` leaves
  its `fails-before-*` folder there, where no reboot clears it, as the gate's own tests leave `limen-tree-*` and
  `limen-live-*` folders (review round 1, note 2); nothing sweeps them, since a sweep at the start would remove the
  copy of a second run going on at the same time.

## Rollback

`git revert` of the commit that changes `adrian-rebuild/tools/fails-before.mjs`.
