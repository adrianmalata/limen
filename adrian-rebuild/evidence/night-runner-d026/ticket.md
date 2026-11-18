<!-- PL: Specyfikacja zmiany nocnego przebiegu tools/night.mjs według D-026 (nocne pytanie Q-5), w kształcie ticket.md
dla recenzji rebuild-reviewer; zmiana nie ma numeru R-NNN, bo dotyczy narzędzia przebudowy, jak D-019. Obejmuje
zmienną CLAUDE_CODE_DISABLE_BACKGROUND_TASKS=1 w środowisku claude -p, powód końca cannot-wait, strumień stream-json
i liczenie wywołań narzędzi sesji głównej na commit w nowym module tools/tool-calls.mjs. Stan: zrealizowane
w commicie D-026 (18.11, sesja dzienna); przebieg recenzji w review.md, wynik w outcome.md. -->

# Night runner: foreground subagents and tool calls per commit (D-026)

## Problem

In the night run of 2026-11-18 a resumed subagent worked in the background, and the main session kept its turn open by
running `npx tsc --noEmit` about 150 times (night question Q-5). The runner does not stop background work, and the
morning summary has no count of the main session's tool calls, so such a loop shows only as an estimate.

Relied on:
- D-026 (Adrian, 2026-11-18), quoted: "(1) `night.mjs` sets `CLAUDE_CODE_DISABLE_BACKGROUND_TASKS=1` in the
  environment of `claude -p` (per the Claude Code docs, Claude then waits for every subagent; it also disables
  background commands, which a night run should not have). The variable is not in `.claude/settings.local.json`, so
  that by day background work runs as before." "(3) (…) the session updates `## State` and ends with the reason
  `cannot-wait` in `status.json` (…), which `night.mjs` accepts as a known reason." "(4) (…) a run uses
  `--output-format stream-json --verbose`, and after the run the runner appends to its log one line per commit with
  the number of the main session's tool calls (events without a parent tool call) since the previous commit, and the
  commit's subject; calls after the last commit form one more line. (…) The stream's format is the one of the Claude
  Code docs; the first night run with it confirms it." Check: "`tools/test-night.mjs` asserts that the environment of
  `claude -p` holds `CLAUDE_CODE_DISABLE_BACKGROUND_TASKS=1`, that `.claude/settings.local.json` and
  `.claude/settings.json` do not, that `cannot-wait` ends the night with exit 0, and the count per commit on a fake
  stream."
- D-019: the runner runs no git command and writes nothing outside `adrian-rebuild/.night/`; the end is decided by the
  field `reason` of a `status.json` modified after the run started; a failure of the runner itself exits 4.
- T-25 (1): code with a policy has exactly one module, named after its responsibility; T-29: one test, one mechanism.

## Change

1. `adrian-rebuild/tools/night.mjs`:
   - `claude -p` runs with `--output-format stream-json --verbose` instead of `--output-format json`, and with
     `CLAUDE_CODE_DISABLE_BACKGROUND_TASKS=1` added to the runner's own environment (`spawn`'s `env`); nothing else
     in the environment changes.
   - `cannot-wait` joins the known reasons.
   - Before a run the runner notes the size of the run's log; after the run it reads the bytes appended since then and
     appends one `night: run <n>: …` line per segment that `countToolCalls` returns, and prints the same lines. A log
     that cannot be read is a failure of the runner (exit 4), as for every other write of the runner.
   - The PL summary and the usage comment say so.
2. New `adrian-rebuild/tools/tool-calls.mjs`, the only module that reads Claude Code's `stream-json` output:
   `countToolCalls(text)` returns the segments `[{ calls, commit }]`.
   - A line that is not a JSON object is skipped (the log also holds stderr and the runner's own lines).
   - A tool call is a `tool_use` block in the `content` of an event of `type` `assistant` whose `parent_tool_use_id`
     is `null` or absent (the main session; a subagent's events carry the id of the call that started it), counted
     once per block `id`.
   - A tool call of `name` `Bash` whose `input.command` runs `git commit` (at the start or after `&&`, `;` or `|`) ends
     the segment when its `tool_result` (an event of `type` `user`) arrives without `is_error: true`; the segment's
     `commit` is the first `-m` argument of the command (in double or single quotes), or `null` when the command has
     none. A failed commit ends no segment.
   - The calls after the last commit form a last segment with `commit` `undefined`; a run with no tool call returns
     one segment with `calls` 0.
3. Tests, written first and failing before the change:
   - `adrian-rebuild/tools/test-night.mjs`: the arguments of `claude` (`stream-json`, `--verbose`); the environment
     of `claude` holds `CLAUDE_CODE_DISABLE_BACKGROUND_TASKS=1`; `.claude/settings.local.json` and
     `.claude/settings.json` of the repository, where they exist, do not name the variable; a status `cannot-wait` ends
     the night with exit 0 and no retry; a fake stream with two commits writes three count lines into the run's log,
     and a log that already held an earlier night's run of the same number counts only the new bytes.
   - New `adrian-rebuild/tools/test-tool-calls.mjs`: one test per rule of item 2 (subagent events not counted, a
     block counted once, a failed commit ends no segment, the subject from `-m`, a command without `-m`, lines that are
     not JSON, the last segment, an empty stream).
4. `adrian-rebuild/plan.md`: `## Commands` names `node --test adrian-rebuild/tools/test-tool-calls.mjs` for the main
   session; `## State`.

## Out of scope

- The protocol text of D-026 (already in `## Agents`) and the definition files in `.claude/agents/`.
- Parsing anything else of the stream (tokens, the final `result` event).
- A count per ticket by ticket ID: the segment is the commit, whose subject starts with the ticket ID (D-009).

## Acceptance

- AC-1: `node --test adrian-rebuild/tools/test-night.mjs` → exit 0.
- AC-2: `node --test adrian-rebuild/tools/test-tool-calls.mjs` → exit 0.
- AC-3: the new tests of item 3 fail on the code before the change: run on the unchanged `night.mjs` and without
  `tool-calls.mjs`, recorded in `outcome.md` with their output.
- AC-4: `node adrian-rebuild/tools/check.mjs` → exit 0; `npx biome check --error-on-warnings adrian-rebuild` → exit 0.
- AC-5 (judgment): `night.mjs` still runs no git command and writes only under `adrian-rebuild/.night/` (D-019).

## Migration

none: the runner's files in `.night/` keep their names; the run log now holds `stream-json` lines instead of one JSON
object, and no tool reads the log except the new count.

## Risk

- The format of `stream-json` comes from the Claude Code docs, not from a run here (no real `claude -p` runs in this
  session): if a field differs, the count is wrong, but the end of the night still depends only on `status.json`. The
  first night run confirms the format; the day session compares the count with the run's log.
- A stdout line and a stderr line written at the same moment could interleave in the log; such a line is not JSON and
  is skipped, so the count can only fall short.
- `CLAUDE_CODE_DISABLE_BACKGROUND_TASKS=1` also disables background Bash commands; the night protocol uses none.

## Rollback

`git revert` of the commit `D-026: …`; no migration.

## Decisions

- 2026-11-18 (main session): the count lives in its own module (T-25), so that the tests of `night.mjs` keep their
  imports and each new test fails alone before the change; the segment is the commit, as D-026 (4) says.
- 2026-11-18 (main session, review round 1, `review.md`):
  - AC-3 covers the tests of a mechanism; the settings test is a guard of D-026 (1) that holds at HEAD too, so it
    passes before the change by design.
  - The environment test sets `CLAUDE_CODE_DISABLE_BACKGROUND_TASKS=0` in its own process for the run, so it fails
    without the mechanism also inside a night session.
  - The commit rule gets a test for `;` and `|`; the subject of a heredoc message (`-m "$(cat <<'EOF'` …) is its first
    line, and `-m` may end a group of short flags (`-am`); each with a test that fails before.
  - The count is a side channel (T-01): a failure appends `night: run <n>: tool calls not counted (<error>)` and the
    run goes on to read `status.json`, so the end of the night depends only on the status; this replaces item 1's
    "a log that cannot be read is a failure of the runner (exit 4)". A test where the log is gone after the run fails
    before.
- 2026-11-18 (main session, review round 2, the second and last round of fixes): the failure line names the error's
  code (or name), never its message, which would put the log's absolute path into `## State`; a single-quoted subject
  keeps its backslashes. Each with a test that fails before.
