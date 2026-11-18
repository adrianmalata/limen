<!-- PL: Wynik zmiany tools/night.mjs według D-026: subagenci w nocy tylko na pierwszym planie przez zmienną
CLAUDE_CODE_DISABLE_BACKGROUND_TASKS=1, powód końca cannot-wait, wyjście stream-json i liczba wywołań narzędzi sesji
głównej na commit w logu przebiegu, liczona przez nowy moduł tools/tool-calls.mjs jako kanał poboczny. Dowody: testy
padały przed zmianą, po dwóch rundach poprawek jest 29/29 i 14/14, bramka 96/96, check.mjs i Biome z kodem 0. Stan:
zamknięte commitem D-026 (18.11, sesja główna); recenzja PASS w rundach 2 i 3, przebieg w review.md. -->

# Outcome: night runner with foreground subagents and tool calls per commit (D-026)

## Done

- `adrian-rebuild/tools/night.mjs`:
  - `claude -p` runs with `--output-format stream-json --verbose`, and `spawn` gets `env: { ...process.env,
    CLAUDE_CODE_DISABLE_BACKGROUND_TASKS: "1" }` (the constant `FOREGROUND`); nothing else in the environment changes.
  - `cannot-wait` is a known reason.
  - Before each run the runner takes the size of the run's log (`sizeOf`); after the run, `countLines` reads the bytes
    from that offset, gives them to `countToolCalls`, and the runner appends and prints one line per segment:
    `night: run <n>: main-session tool calls: <k>, up to the commit "<subject>"`, `…, up to a commit without -m`,
    `…, after the last commit`, or `…, no commit in this run` when the run made no commit. The lines come before the
    line that reads `status.json`. The count is a side channel (review round 1): `countLinesOrFailure` turns any
    failure into `night: run <n>: tool calls not counted (<error>)`, and the run goes on to the status.
  - The PL summary and the usage comment say so.
- New `adrian-rebuild/tools/tool-calls.mjs`, the only reader of `stream-json`: `countToolCalls(text)` with
  `countCalls` (an `assistant` event: each new `tool_use` block counts once by `id`; a Bash `git commit` call is
  remembered with its subject) and `commitsDone` (a `user` event: a remembered commit whose `tool_result` is not
  `is_error: true` ends a segment). Events with a `parent_tool_use_id` are skipped; lines that are not JSON objects
  are skipped. The subject is the first line of a heredoc message (`-m "$(cat <<'EOF'` …), else the first `-m`
  argument, where `-m` may end a group of short flags (`-am`), else `null` (review round 1).
- Tests: `adrian-rebuild/tools/test-night.mjs` (29 tests: the argument test changed, seven new) and new
  `adrian-rebuild/tools/test-tool-calls.mjs` (14 tests, one rule each). The environment test sets the variable to
  `0` in its own process for the run, so it fails without the mechanism also inside a night session.
- `adrian-rebuild/plan.md` → `## Commands`: `node --test adrian-rebuild/tools/test-tool-calls.mjs` for the main session
  and the implementer.

## Proof

| Criterion | Command | Exit | Result |
|---|---|---|---|
| AC-1 | `node --test adrian-rebuild/tools/test-night.mjs` | 0 | tests 29, pass 29, fail 0 (after round 2) |
| AC-2 | `node --test adrian-rebuild/tools/test-tool-calls.mjs` | 0 | tests 14, pass 14, fail 0 (after round 2) |
| AC-4 | `node adrian-rebuild/tools/check.mjs` | 0 | `… PL summaries: 74 files; … 0 errors` |
| AC-4 | `npx biome check --error-on-warnings adrian-rebuild` | 0 | `Checked 28 files … No fixes applied.` |
| — | `node adrian-rebuild/tools/gate.mjs` | 0 | tests 96, pass 96, fail 0 (no Limen code changed) |

`check.mjs`, Biome and the gate ran again after round 2 with the same results (exit 0; 0 errors; 28 files; 96/96).
Known limitation (review round 3, not fixed): inside double quotes the count removes every backslash, while the shell
keeps one before most characters, so a rare subject with a backslash gets a slightly different label in the count
line; the count itself is unaffected.

The first Biome run after the change failed (an assignment in an expression in the new test's id helper; a cognitive
complexity of 29 in `countToolCalls`); the helper got its own function and `countToolCalls` was split into
`countCalls` and `commitsDone`. Both test files then passed again.

## Fails before

AC-3: the tests were written first and run on the unchanged `night.mjs`, without `tool-calls.mjs`:

- `node --test adrian-rebuild/tools/test-night.mjs` → exit 1, tests 27, pass 22, fail 5:
  ```
  ✖ claude gets the first message in night mode, dontAsk and no --dangerously-skip-permissions
      + 'json'   - 'stream-json',   - '--verbose'
  ✖ D-026: claude runs with CLAUDE_CODE_DISABLE_BACKGROUND_TASKS=1, so every subagent runs in the foreground
      (actual null, expected '1')
  ✖ D-026: the reason cannot-wait ends the night with exit 0 and no retry
  ✖ D-026: after a run the log gets the main session's tool calls per commit, and the same lines are printed
      AssertionError: night: run 1: main-session tool calls: 2, up to the commit "R-001: a"
  ✖ D-026: the count reads only what this run appended to a log that an earlier night of the same day began
      The input did not match the regular expression /night: run 1: main-session tool calls: 1, no commit in this run\n/
  ```
  The sixth new test, "the repository's Claude Code settings do not set the variable", passes before and after: it is
  the guard of D-026 (1) that the variable stays out of the settings, and the settings never named it.
- `node --test adrian-rebuild/tools/test-tool-calls.mjs` → exit 1: `ERR_MODULE_NOT_FOUND` for
  `adrian-rebuild/tools/tool-calls.mjs`.

Review round 1, the new tests run before their fixes:
- `test-night.mjs` → tests 28, pass 27, fail 1: `✖ D-026: a count that fails is written into the log, and the night
  still ends by its status` (the night ended with exit 4 on the ENOENT of the removed log).
- `test-tool-calls.mjs` → tests 13, pass 11, fail 2:
  ```
  ✖ the subject of a heredoc message is its first line
      + "$(cat <<'EOF'\nR-006: Cut private planning\n\nThe body "   - 'R-006: Cut private planning'
  ✖ -m at the end of a group of short flags gives the subject
      + null   - 'R-007: Cut the viewer'
  ```
  The separator test (`;` and `|`) passed before its round: it covers code of this change that `HEAD` does not have,
  so it fails at `HEAD` with the missing module. The environment test with the variable set to `0` gets `0` from a
  runner without the mechanism, as it got `null` before round 1.

## Judgment criteria

AC-5 (judgment): `night.mjs` imports only `node:` modules and `./tool-calls.mjs`, runs no `git` and starts only the
`claude` command; it writes only the lock, the temporary lock file and the run logs under `adrian-rebuild/.night/`.

## Deviations from the ticket

- AC-3 covers the tests of a mechanism. The settings test is a guard of D-026 (1), already true at `HEAD`, so it
  passes before the change by design (`ticket.md` → `## Decisions`, review round 1).
- Item 1's "a log that cannot be read is a failure of the runner (exit 4)" is replaced by the side channel of review
  round 1: the failure is a line in the log, and the end of the night depends only on `status.json`.

## Measurement

Unmeasured here: whether a real `claude -p` with the variable keeps every subagent in the foreground, and whether the
real `stream-json` events have the fields the count reads. The first night run with this runner confirms both: the
log shows no `run_in_background` subagent and the count lines match the run's commits (the day session compares them).

## Review round 2

- The line of a failed count names the error's code (`ENOENT`), not its message, which holds the log's absolute path;
  the day session copies these lines into `plan.md`, which must hold no home path. Test: "the line of a failed count
  names the error's code, not a path …", failing before the fix (the line held the path under the fixture's root).
- A single-quoted `-m` keeps its backslashes, as the shell does. Test: "a single-quoted -m keeps its backslashes …",
  failing before the fix (`+ 'R-008: ab'`).
- After the fixes: `test-night.mjs` 29/29, `test-tool-calls.mjs` 14/14.

## Open points

None: the generic allow rule `node --test *` covers the new test command (review round 2).
