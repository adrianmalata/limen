<!-- PL: Specyfikacja hooka tools/decision-guard.mjs w kształcie ticket.md, dla recenzji rebuild-reviewer (D-083;
narzędzie przebudowy bez numeru R-NNN, jak handover.mjs). Hook PreToolUse blokuje pytanie o decyzję (push z `Q-NN`
albo zapis `.night/questions.md`), dopóki sesja od poprzedniego pytania nie przeczyta albo nie przeszuka każdego z
czterech źródeł; dowodzi szukania, nie jego użycia. Stan: zrealizowane; trzy rundy recenzji (PASS) w review.md,
uwagi rundy 3 poprawione bez czwartej rundy (D-086), wynik w outcome.md. -->

# Decision guard: `tools/decision-guard.mjs` with its test

## Problem

On 2026-11-22 the main session asked Adrian Q-33 (R-033, the alerts account's name) with a recommendation that the
documents had already settled against: gate 2 §0.5 keeps account names out of tracked files, and G2 has Adrian
choose them before the seat changes. Adrian asked that the search of the sources before a decision question be
enforced, preferably by a hook (Q-35). D-083 (option 1): a hook plus the session's memory; the memory rule
(`feedback-search-sources-before-asking`) states the content, the hook proves the search (z. 14, z. 21).

Facts checked on the laptop (2026-11-22, this session's transcript and the 40 transcripts of the project folder,
53,393 lines, Claude Code 2.1):
- The session transcript is JSONL, every line a JSON object (no other line in the 40 files). A tool call is an entry
  `type: "assistant"` whose `message.content` holds one block `{ type: "tool_use", id, name, input }`; its result is
  a later entry `type: "user"` with a block `{ type: "tool_result", tool_use_id, is_error? }`. Entries
  `api-request-blob` repeat the same blocks and are not the conversation. Subagents write their own files
  (`<session>/subagents/agent-*.jsonl`); entries carry `isSidechain`.
- A Bash command with a non-zero exit, a denied command and a missing file all give `is_error: true`; a `grep`
  without a match gives `is_error` absent (`returnCodeInterpretation: "No matches found"`).
- While a command runs, its own `tool_use` was not yet in the transcript file (a marker in the command: 0 matches;
  2 matches one call later). So the hook cannot count on the current call being there, or on its absence.
- Not checked (no hook was installed): that a call blocked by a hook gets `is_error: true`. If it does not, a blocked
  question counts as asked and the session must search again: the guard blocks more, never less.

## Change

1. `adrian-rebuild/tools/decision-guard.mjs` (new), a `PreToolUse` hook; the hook input arrives on stdin as JSON
   (`tool_name`, `tool_input`, `transcript_path`):
   - A decision question is a `PushNotification` whose `message` names a question id (`\bQ-\d+\b`), or a `Write` or
     `Edit` whose `file_path` is `adrian-rebuild/.night/questions.md`. Any other call exits 0 without reading the
     transcript.
   - The four sources: `adrian-rebuild/input/gate-2-decisions.md`, `adrian-rebuild/taste.md`,
     `adrian-rebuild/input/zasady-budowy-harnessu.md`, `adrian-rebuild/plan.md`. A path names a source when it
     resolves to it from the repository root (the tool's own location, `adrian-rebuild/tools/../..`).
   - The session's calls are the `tool_use` blocks of `assistant` entries that are not `isSidechain`, in transcript
     order, first occurrence per id; a call counts once its `tool_result` (in a `user` entry) is in and is not an
     error. The part after the final newline may still be being written and is left out; any other line that is not
     blank and not a JSON object (an array is not one) might have held a question, so it is a boundary like one.
     The previous decision question is the last counted call that is a decision question, or the last boundary;
     none means the start of the transcript.
   - A source is searched by a counted call after the previous question: `Read` with `file_path` naming it; `Grep`
     with `path` naming it; `Bash` whose command has a simple command that is `grep`, `git grep`, `sed` with a flag
     group holding `n` and none holding `i` or `--in-place` (`sed -i` writes), or `cat`, with a file argument naming
     the source. For grep and sed the pattern or script is no file: it is the first positional word, unless `-e`,
     `-f`, `--regexp`, `--file` or `--expression` gave it; the next word after an option that takes an argument
     (grep and git grep: `e f m A B C d D`; sed: `e f l`) ending its flag group, or after a long pattern option
     without `=`, is that option's argument; `--` ends the options; any other long option without `=` takes the
     next word too (`--include '*.mjs'`), a reading that can only miss a search, never count one (D-086).
   - A small lexer splits the command at unquoted `;`, `|`, `&`, `(`, `)` and newlines, removes quotes (`\"` and
     `\\` are escapes in double quotes) and drops the target of `>` or `>>`, so a quoted `;` or `|` in a pattern
     (`sed -n '1,5p;9,12p'`, `grep 'a\|b'`) does not split a command. After a `<<` it stops at the next newline: the
     heredoc body is input, not commands, and stopping can only miss a search. It reads the commands a session runs
     (D-016); it is no full shell parser.
   - Every source searched: exit 0. Otherwise exit 2, and one stderr line names the sources not searched and what
     counts as a search. On a decision question, an unreadable transcript is exit 2 with the error's code; a hook
     input that is not JSON, or has no string `tool_name` and object `tool_input`, is exit 2 for every call, since a
     changed input format would otherwise pass every call. Block messages carry no path. Claude Code runs the tool on
     any exit other than 2, so the guard fails closed only through exit 2.
2. `adrian-rebuild/tools/test-decision-guard.mjs` (new), written first: fixture transcripts, the tool run as Claude
   Code runs it (stdin JSON, exit code, stderr). D-083's five cases, then one test per mechanism (T-29).
3. `plan.md`: the test in `## Commands`, the note in `## State`.

## Out of scope

- Whether the session used what it read (the memory rule, D-083); a question asked only in plain text without a
  push (no tool call to hold).
- A write of `questions.md` through Bash (a redirect, `tee`): D-083 names `Write` and `Edit`, and the night
  allow-list has no command that writes there.
- Where a read lands inside `plan.md`: D-083 names the four files; the hook does not check that a `Read` range or a
  `sed -n` range covers `## Decisions`.
- The `hooks` block of `.claude/settings.local.json`: Adrian writes it (D-016); the session gives it to him.

## Acceptance

- AC-1: `node --test adrian-rebuild/tools/test-decision-guard.mjs` → exit 0.
- AC-2: the same test file against a tree without `decision-guard.mjs` → exit 1 (the tests fail before the tool
  exists).
- AC-3: `node adrian-rebuild/tools/check.mjs` → exit 0; `npx biome check --error-on-warnings adrian-rebuild` → exit 0.
- AC-4 (judgment): a readable hook input that is not a decision question is never blocked; a decision question
  passes only when a completed, non-error call of the main session searched each source after the previous completed
  question; every failure of the guard on a decision question blocks, and so does an unreadable hook input.

## Migration

none: a rebuild tool.

## Risk

- By day, marking a `questions.md` entry resolved is an `Edit` of `questions.md`, so it needs the four searches first
  and counts as a question; D-083 names every `Write` or `Edit` of the file.
- A Claude Code release that changes the transcript or the hook input format makes every decision question block
  (the input: every call), with the reason in the message (fail closed); the fix is the parser here.
- The guard fails closed only when node runs it: a hook command that cannot find the file exits 1 and the call runs.
  The `hooks` block names the tool through `"$CLAUDE_PROJECT_DIR"`, so a change of the shell's directory does not
  lose it.

## Rollback

`git revert` of the commit `D-083: …`, and Adrian removes the `hooks` block from `.claude/settings.local.json`.

## Decisions

- 2026-11-22 (Adrian, D-083): the hook and its five test cases as D-083 states them.
- 2026-11-22 (main session, before the review): a trial on this session's own transcript showed that a split by a
  regular expression missed `sed -n '635,700p;1288,1320p' adrian-rebuild/taste.md` and `grep -n '…\|…'
  adrian-rebuild/taste.md`, the session's commonest forms; the lexer above replaces it, with two tests that fail
  on the split (quoted separators, `sed -i`) and one for the lexer's escapes in double quotes.
- 2026-11-22 (main session, review round 1, `review.md`): notes 1–7, 9 and 10 are fixed, each new behaviour with a
  test that fails on the round-1 tool (7 tests): (1) grep's pattern and sed's script are not files; (2) the lexer
  stops at the newline after `<<`; (3) any sed flag group with `i`, or `--in-place`, is no search; (4) a line that is
  not JSON before the final newline is a boundary, the part after it is left out; (5) tests for the separators `(`,
  `)`, `;`, `|`, `&` and newline, the `\\` escape and the first occurrence per id; (6) `## Commands` and `## State`;
  (7) the test of the Bash forms is split, one form per test, each on the Reads of the other three sources; (9) a hook
  input without `tool_name` or `tool_input` blocks; (10) block messages carry no path or stack. Note 8 is recorded
  under the facts above (not checked; it fails safe). Note 11 goes into the `hooks` block (`$CLAUDE_PROJECT_DIR`).
  30 one-at-a-time mutations of the round-1-fixed tool each fail at least one test. Round 2 counted 8 such tests,
  not 7: two for note 1 (grep, git grep) and two for note 9 (`tool_name`, `tool_input`).
- 2026-11-22 (main session, review round 2, the last round of fixes, `review.md`): notes 1–4 are fixed: (1) an
  option table for grep and sed, `-e` and the long pattern options, `--` (`option`, `fileWords`), with five tests
  that fail on the round-2 tool (measured: the round-2 tool rebuilt from its review diff fails 6 of the 62 tests,
  these five and note 3's) and four that pin the rest of the table; (2) a test for `--in-place`; (3) a JSON line
  that is not an object is a boundary (a test that fails on the round-2 tool); a blank line cannot have held a
  question and stays skipped (a test pins it), and `## Change` now says so; (4) the count above. Note 5 is rejected:
  no input reaches the internal-error branch, and a test would need fault injection in the tool, a moving part for a
  branch that only keeps a defect fail-closed. 41 one-at-a-time mutations of the round-2-fixed tool each fail at
  least one test.
- 2026-11-22 (Adrian, after review round 3: "zgodnie z rekomendacjami"; Q-36 a, Q-37 a; D-086): round 3's two notes
  are fixed by the main session without a fourth review: (1) any long option without `=` takes the next word as its
  argument, with a test that fails on the round-3 tool (`--include '*.mjs'`) and the pin of `--color` turned into
  one for `--color=auto`; the `--in-place` test now uses `--in-place=.bak`, since the new rule alone also blocks
  `--in-place 1p`; (2) the wide line of `## Change` is wrapped. 42 one-at-a-time mutations each fail a test.
