<!-- PL: Recenzje zmiany tools/night.mjs według D-026 przez rebuild-reviewer. Runda 1 (18.11): FAIL z jednym
znaleziskiem blokującym (AC-3 obejmował test-strażnika ustawień, który nie może paść przed zmianą, bez wpisu
w odstępstwach) i sześcioma uwagami; sesja główna poprawia zapis AC-3, test środowiska, testy separatorów, temat
z heredoc i -am oraz liczenie jako kanał poboczny, który nie przerywa nocy. Runda 2: PASS z trzema uwagami;
w drugiej, ostatniej rundzie poprawek linia błędu liczenia podaje kod zamiast ścieżki, a temat w pojedynczych
cudzysłowach zachowuje ukośniki. Runda 3: PASS z trzema uwagami bez zmiany kodu (dwie odrzucone z powodem, jedna
to poprawka zapisu w outcome.md). Stan: zamknięte commitem D-026. -->

# Review: night runner with foreground subagents and tool calls per commit (D-026)

## Round 1 (2026-11-18, day session)

- Inputs: `adrian-rebuild/evidence/night-runner-d026/ticket.md`, the diff from `review-guard.mjs diff --out
  node_modules/.rebuild-review/D-026.diff`, `adrian-rebuild/taste.md`. The main session implemented the change.
- Main session before the review: `node --test adrian-rebuild/tools/test-night.mjs` → 27/27;
  `node --test adrian-rebuild/tools/test-tool-calls.mjs` → 10/10; `node adrian-rebuild/tools/gate.mjs` → exit 0,
  96/96; `check.mjs` and Biome → exit 0.
- Guard: `review-guard.mjs compare node_modules/.rebuild-review/D-026.before` → `unchanged`, exit 0.
- Parser: `review-verdict.mjs node_modules/.rebuild-review/D-026.reply <ticket.md>` → `consistent`, exit 0.
- Verdict: FAIL. AC-3 not met; one blocking finding, six notes.

| # | Finding | Kind | Decision |
|---|---|---|---|
| 1 | AC-3 covers the settings test, which passes before the change (it guards a fact already true at HEAD), and the outcome records no deviation (`outcome.md:61-62`, `:73`) | blocking · proven | fix: `ticket.md` → `## Decisions` narrows AC-3 to the tests of a mechanism and names the settings test a guard; the outcome records it |
| 2 | The environment test passes without the mechanism when the test process already has the variable, as a night session's commands do (`test-night.mjs:143-147`) | note · observed | fix: the test sets the variable to `0` in its own process for the run and restores it |
| 3 | No test covers the `;` and `|` separators of the commit rule (`tool-calls.mjs:7`) | note · proven | fix: one test for both separators |
| 4 | The outcome says "six new" tests; there are five new and one changed | note · proven | fix in `outcome.md` |
| 5 | `## State` is not updated in the diff (item 4) | note · observed | in the commit, as for D-019 |
| 6 | A heredoc commit (`-m "$(cat <<'EOF' …)"`) gives the raw shell text as its subject, and combined flags (`-am "…"`) give `null` (`tool-calls.mjs:9`) | note · guessed | fix: the subject is the first line of a heredoc message, and `-m` may end a group of short flags; a test for each, failing before |
| 7 | `countLines` runs before `readReason`, so a count that throws ends the night with exit 4 and skips the status and the retries, against the ticket's Risk (`night.mjs:275`, `:310-313`) | note · guessed | fix: the count is a side channel; a failure writes `night: run <n>: tool calls not counted (<error>)` into the log and the run goes on to the status; a test where the log is gone after the run, failing before |

Taste questions answered by the reviewer: T-29 (one reason per test, the settings test is a guard; the `[1,2]` input
does not exercise the array check), T-30 (two comments say what, not why), T-40 (no owner step), T-41 (no command).
The array check was dead code (an array has no `type`), so round 1 removed it from `event()`.

## Round 2 (2026-11-18, day session)

- Inputs: the same `ticket.md` (with the round-1 decision), the diff from `review-guard.mjs diff --out
  node_modules/.rebuild-review/D-026.diff2`, `taste.md`.
- Main session before the review: `test-night.mjs` → 28/28; `test-tool-calls.mjs` → 13/13; `gate.mjs` → exit 0,
  96/96; `check.mjs` and Biome → exit 0.
- Guard: `review-guard.mjs compare node_modules/.rebuild-review/D-026.before2` → `unchanged`, exit 0.
- Parser: `review-verdict.mjs node_modules/.rebuild-review/D-026.reply2 <ticket.md>` → `consistent`, exit 0.
- Verdict: PASS. AC-1 to AC-5 met; three notes, none blocking.

| # | Finding | Kind | Decision |
|---|---|---|---|
| 1 | The failure line holds `error.message`, whose file-system text names the log's absolute path, a home path that a copy into `## State` would publish (`night.mjs:295`) | note · observed | fix (round 2 of fixes): the line names `error.code` (or the error's name); a test that the line holds no path under the root, failing before |
| 2 | The outcome's open point on the allow-list is settled: the generic `node --test *` rule covers the command | note · proven | fix in `outcome.md`: no open point |
| 3 | A single-quoted `-m` loses its backslashes, which the shell keeps (`tool-calls.mjs:38`) | note · proven | fix: only a double-quoted subject is unescaped; a test, failing before |

Taste questions answered by the reviewer: T-29 (each round-1 test fails for one reason), T-30 (the new comments give
reasons; two still say what), T-40 (no owner step), T-41 (no command).

## Round 3 (2026-11-18, day session)

- Inputs: the same `ticket.md` (with the round-1 and round-2 decisions), the diff from `review-guard.mjs diff --out
  node_modules/.rebuild-review/D-026.diff3`, `taste.md`.
- Main session before the review: `test-night.mjs` → 29/29; `test-tool-calls.mjs` → 14/14; `gate.mjs` → exit 0,
  96/96; `check.mjs` and Biome → exit 0.
- Guard: `review-guard.mjs compare node_modules/.rebuild-review/D-026.before3` → `unchanged`, exit 0.
- Parser: `review-verdict.mjs node_modules/.rebuild-review/D-026.reply3 <ticket.md>` → `consistent`, exit 0.
- Verdict: PASS. AC-1 to AC-5 met; three notes, none blocking. Both rounds of fixes are used, so no code changes.

| # | Finding | Kind | Decision |
|---|---|---|---|
| 1 | The side-channel test matches `\(ENOENT\)` exactly, so one defect (a message instead of the code) fails two tests (`test-night.mjs:251`) | note · proven | rejected: the overlap is one assertion; the exact form is the line's contract, and a third round of fixes is Adrian's |
| 2 | `outcome.md` is stale by one round (28 and 13 tests, "after round 1") | note · proven | fix in the main session's record: 29 and 14, and the reruns after round 2 |
| 3 | Inside double quotes the count removes every backslash, the shell only some (`tool-calls.mjs:41-42`) | note · proven | rejected: it changes only the label of a count line for a rare subject; recorded as a known limitation in `outcome.md` |

Taste questions answered by the reviewer: T-29 (one overlap, note 1), T-30 (one comment states the shell rule too
broadly, note 3), T-40 (no owner step), T-41 (no command).
