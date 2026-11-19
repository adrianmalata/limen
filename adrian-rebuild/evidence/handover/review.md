<!-- PL: Recenzje narzędzia tools/handover.mjs (D-047) przez rebuild-reviewer. Runda 1: PASS z sześcioma uwagami
bez blokujących; wszystkie poprawione (czyste środowisko nowej sesji, katalog sesji tmux, kolejność startu,
przodkowie wywołującego, brak programu, rozdzielony test), każda z testem, który pada na wersji z rundy 1.
Runda 2: PASS z sześcioma uwagami; cztery poprawione (pełna lista zmiennych, nazwa brakującego gita, „stopped”
dopiero po wyjściu procesu, nieaktualny plan), dwie odrzucone. Runda 3: PASS z czterema uwagami, wszystkie
poprawione, dwie w kodzie bez czwartej recenzji (decyzja Adriana (a)). Stan: zamknięta. -->

# Handover tool review

## Round 1 (2026-11-19, day session)

- Inputs: `adrian-rebuild/evidence/handover/ticket.md`, the diff from `review-guard.mjs diff --out
  node_modules/.rebuild-review/handover.diff`, `adrian-rebuild/taste.md`. The main session implemented the tool; the
  reviewer was told to run it only through its test file.
- Main session before the review: `node --test adrian-rebuild/tools/test-handover.mjs` → exit 0, 12/12, and exit 1,
  0/12, before the tool existed; `check.mjs` and Biome → exit 0.
- Guard: `review-guard.mjs compare node_modules/.rebuild-review/handover.before` → `unchanged`, exit 0.
- Parser: `review-verdict.mjs node_modules/.rebuild-review/handover.reply <ticket.md>` → `consistent`, exit 0.
- Verdict: PASS. AC-1–AC-4 met. Taste questions: T-29 yes except one test (note 6), T-30 two comments say what and
  not why (fixed with note 5's round), T-40 and T-41 no owner step.

| # | Finding | Kind | Decision |
|---|---|---|---|
| 1 | `start` passes the caller's environment to `tmux`; a server it starts takes `CLAUDECODE`, `CLAUDE_CODE_CHILD_SESSION` and the other session variables as its global environment, and claude reads `CLAUDE_CODE_CHILD_SESSION` as being part of a session | note · observed | fix: the command is `env -u <name> … claude …` with the twelve names Claude Code 2.1 sets for its Bash tool (`SESSION_VARIABLES`), so it holds for a server started earlier too |
| 2 | The `tmux` step selects sessions by name and pane ancestry only, so a `limen-rebuild-<n>` outside the repository is closed | note · proven | fix: `#{session_path}`, resolved, must be the repository |
| 3 | `close-previous` cannot tell an older session from a newer one: the old session running it after `start` would close the new one | note · proven | fix: only a process, or a `tmux` session all of whose panes, started before the caller's own session is closed (field 22 of `/proc/<pid>/stat`); the same tick keeps it |
| 4 | Only the own session's descendants are kept, not `claude` processes among the caller's ancestors | note · guessed | fix: ancestors are never stopped, with a test of a session inside a second `claude` |
| 5 | A missing `tmux` or `git` gives "Cannot read properties of null (reading 'trim')" | note · guessed | fix: `run` throws `<program>: <error>` when the program cannot start; a test without `tmux` on `PATH` |
| 6 | One test checks the name filter and the own-pane rule (T-29) | note · proven | fix: split, and the two new rules (directory, start order) get a test each |

The main session's runs after the fixes: the new test file against the round-1 tool (copied to the scratchpad with an
empty `SESSION_VARIABLES` export) → exit 1, tests 19, pass 13, fail 6, the six new tests; against the fixed tool →
the stubborn-process test failed once at exit 0 because the fake `claude` and the session that ran the tool started in
the same clock tick (10 ms), which the tool rightly keeps; the fake `claude` now waits 30 ms after its start, and three
runs gave 19/19. The failure was in the test's setup, not in the tool (D-029).

## Round 2 (2026-11-19, day session)

- Inputs as in round 1, on the new diff; the main session's runs before it: 19/19 three times, `check.mjs` and Biome
  → exit 0.
- Guard: `compare` → `unchanged`, exit 0. Parser: `review-verdict.mjs` → `consistent`, exit 0.
- Verdict: PASS. AC-1–AC-4 met (the reviewer ran the tests, 19/19, and found no fake `claude` left and the tree
  unchanged). Taste questions: T-29 yes, with one weak point (the directory test pointed at a path that did not
  exist yet); T-30 yes except the list claim of note 1; T-40 and T-41 no owner step.

| # | Finding | Kind | Decision |
|---|---|---|---|
| 1 | `SESSION_VARIABLES` lacks four names Claude Code 2.1 adds to its Bash tool: `AI_AGENT`, `GIT_EDITOR`, `COREPACK_ENABLE_AUTO_PIN`, `NoDefaultCurrentDirectoryInExePath` | note · proven | fix: the main session repeated the comparison in its own Bash tool (the names of the Bash tool's environment that `/proc/<claude>/environ` lacks: the same sixteen) and the list holds all sixteen; the comment states that definition |
| 2 | A missing `git` ends with "not inside a git repository", not with git's name, because `repoRoot()` of `gate-env.mjs` checks only the status | note · proven | fix: the root comes from the tool's own `git`, which names a program that cannot start; a test with only the fake `tmux` on `PATH` |
| 3 | A `claude` that survives SIGTERM gets a "stopped" line on stdout and then a "still running" line on stderr | note · proven | fix: the "stopped" lines are printed after the wait, for the processes that are gone; the stubborn test checks that its pid has none |
| 4 | `## State` still says 12 tests; the D-047 entry has a line of 171 characters | note · proven | fix |
| 5 | `kill-session` ends every process in an older session's panes, also a younger one started from a shell inside it | note · observed | rejected: a session made by `start` runs `env … claude` as its pane process, with no shell; a `limen-rebuild-<n>` made by hand is outside D-047, which dates a session by its panes |
| 6 | The AC-3 record of `outcome.md` predates the last write to `plan.md` | note · observed | rejected: the main session runs `check.mjs` and Biome before the commit, and `outcome.md` records that run |
| T-29 | The directory test pointed at `elsewhere` before another test created it | weak point | fix: the test creates the directory first |

The main session's runs of round 2: the changed test file against the tool after round 1's fixes → exit 1, tests 20,
pass 17, fail 3 (the variables test, the stubborn-process test, the new missing-git test); against the fixed tool →
20/20 three times.

## Round 3 (2026-11-19, day session)

- Inputs as before, on the new diff; the main session's runs before it: 20/20 three times, `check.mjs` and Biome →
  exit 0.
- Guard: `compare` → `unchanged`, exit 0. Parser: `review-verdict.mjs` → `consistent`, exit 0.
- Verdict: PASS. AC-1–AC-4 met (20/20; the reviewer repeated the variable comparison in its own Bash tool and got
  the same sixteen names). Taste questions: T-29 yes for 19 of 20 tests, the exception is note 1; T-30 yes; T-40 and
  T-41 no owner step.

| # | Finding | Kind | Decision |
|---|---|---|---|
| 1 | The descendant rule never changes the result: a descendant of the own session starts in its tick or later, so the start-order rule already keeps it, and its test cannot fail on that rule alone | note · proven | fix (Adrian, (a)): the term is removed; the test stays, with a comment that the own session is an ancestor and its child is younger |
| 2 | A `tmux` session that ends between `list-panes` and its `kill-session` makes the run exit 4 before the `claude` step, so a previous session outside `tmux` stays | note · proven | fix (Adrian, (a)): a failed `kill-session` of a session that `has-session` no longer finds counts as closed ("was already gone"); a test that failed before the fix (21 tests, 20 pass, 1 fail) |
| 3 | The D-047 line of `## State` stands after `Active ticket: none.`, apart from the day's done items | note · proven | fix: moved to the done items |
| 4 | The auto-memory note on the handover still gives the old procedure | note · observed | fix: the note is rewritten from D-047 (outside the repository) |

Adrian chose (a) for notes 1 and 2: fixes without a fourth review, as for R-088 (`ticket.md` → `## Decisions`). The
main session's runs after them: 21/21 three times, Biome → exit 0.
