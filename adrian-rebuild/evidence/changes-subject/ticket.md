<!-- PL: Specyfikacja zmiany narzędzia `tools/changes-entries.mjs` według D-138, w kształcie ticket.md dla recenzji
rebuild-reviewer; bez numeru R-NNN, bo dotyczy narzędzi przebudowy. Commit ticketu jest rozpoznawany po temacie,
a linia Rollback zostaje w postaci z D-009, chyba że `--grep` trafia też w commit o innym temacie; wtedy wymagana jest
postać dokładna z `awk`. Stan: napisany 27.11 przez sesję główną `limen-rebuild-44`; recenzja w review.md, wynik
w outcome.md. -->

# A ticket's commit is found by its subject, and a colliding Rollback is exact (D-138)

## Problem

D-009 (`plan.md` → `## Decisions`), quoted: "a `changes.md` entry is keyed by the commit subject … `- Rollback: git
revert $(git log --format=%H --grep='^R-NNN:' adrian-rebuild --)` … `check.mjs` checks that `adrian-rebuild` has exactly
one commit with the subject `R-NNN:`".

D-138 (`plan.md` → `## Decisions`, Adrian, 2026-11-27, "rekomendacja", Q-103 option (b)), quoted: "(1)
`tools/changes-entries.mjs` finds a ticket's commit by its subject, as D-009 words it … (2) An entry's Rollback keeps
D-009's form while every commit its `--grep` finds has a subject that starts with `R-NNN:`; otherwise it is `git revert
$(git log --format='%H %s' adrian-rebuild -- | awk '$2 == "R-NNN:" {print $1}')`, which `check.mjs` requires and names in
its error."

Facts at `e645561`:
1. `commitsFor` (`adrian-rebuild/tools/changes-entries.mjs:25-29`) runs `git log --format=%H --grep=^<id>: <branch> --`;
   `--grep` matches any line of a commit message, so a body line that starts with the ID counts as the ticket's commit.
2. `git show -s --format=%b b6365c8` holds a line that starts with `R-045:`, and `f749fae` one that starts with
   `R-105:`; both commits are published, so their messages stay. No other commit on `adrian-rebuild` holds a body line
   that starts with an ID other than its subject's (a scan of every commit's body, 2026-11-27).
3. `checkFields` (`:47-61`) requires the Rollback to include `rollbackCommand(id)`; `checkEntries` (`:67-99`) requires
   zero commits for an entry not in HEAD and exactly one, carrying the entry, for one in HEAD. So R-045's entry fails
   before its commit ("1 commit(s) "R-045:" exist, but the entry is not in HEAD") and would fail after it (two commits).

Rules: z. 1 (a hard check, no false success), z. 14 (the guarantee in code), T-25 (1) (one module for the rule).

## Change

1. `adrian-rebuild/tools/changes-entries.mjs`:
   - `commitsFor(id)` returns the commits of the branch whose subject starts with `<id>:` (from `git log
     --format=%H%x09%s <branch> --`), the commits D-009 keys the entry by;
   - a new exported `exactRollbackCommand(id)` returns D-138's `awk` form;
   - a new exported `expectedRollback(id, { cwd, branch })`: `rollbackCommand(id)` when every commit that its `--grep`
     finds is among `commitsFor(id)`, else `exactRollbackCommand(id)`;
   - `checkFields` requires the Rollback to include `expectedRollback(id)` and names it in its error;
   - the Polish summary and the comments follow.
2. `adrian-rebuild/tools/test-changes-entries.mjs`: in its fixture repository, a commit whose subject is another one and
   whose body has a line `R-002: …` (a second ticket, since the fixture's R-001 already has two commits); with it, an
   entry not yet committed whose Rollback is D-009's form is an error that names the exact form, the exact form passes,
   and after the commit `R-002: …` that carries the entry it passes with exactly one commit counted; the fixture's other
   tests keep their results. The `awk` command, run in the fixture, prints only the ticket's commit.
3. `check.mjs` is unchanged: it calls `checkEntries`.

## Out of scope

- The 63 entries already in `changes.md`: each one's `--grep` finds only its own commit, so their lines stay valid.
- The rebuild prompt's format text (`input/prompt.md`, Adrian's file): its form stays right for every ticket but a
  colliding one, where `check.mjs` names the line to write.

## Acceptance

- AC-1: `node --test adrian-rebuild/tools/test-changes-entries.mjs` → exit 0.
- AC-2 (judgment): the new tests fail on the module at `e645561` (the main session ran them there; `outcome.md` →
  Fails before).
- AC-3: `node adrian-rebuild/tools/check.mjs` → exit 0 on the working tree once R-045's entry names the exact form.
- AC-4: `npx biome check --error-on-warnings adrian-rebuild` → exit 0.
- AC-5 (judgment): a ticket whose ID starts no body line of another commit keeps D-009's form and its check unchanged.

## Migration

None.

## Risk

- `awk` is a system tool on the seat and the laptop; the command runs only when someone reverts a ticket.

## Rollback

`git revert` of the `Tools:` commit that holds this folder.

## Decisions

- 2026-11-27 D-138 (Adrian: "rekomendacja", Q-103 option (b)); quoted in `## Problem`.
- 2026-11-27, review round 1 (FAIL; `review.md`), the fixes, by the main session: F1 Biome's formatting of
  `expectedRollback`; F2 `commitsFor` counts a commit whose subject's first word, split as `awk` splits it, is
  `<id>:`, so the exact Rollback reverts exactly the counted commits; F3 the last test split in two (the count after
  the commit; the `awk` selection); F4 `## Change` item 2 names R-002, and the test comment names no SHA (T-30 (3));
  F5 `outcome.md` with the main session's Fails before run, and D-138's order: the `Tools:` commit follows R-045's,
  which carries D-138.

