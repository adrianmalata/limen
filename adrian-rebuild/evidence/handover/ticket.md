<!-- PL: Specyfikacja narzędzia tools/handover.mjs w kształcie ticket.md, dla recenzji rebuild-reviewer (D-047;
narzędzie przebudowy bez numeru R-NNN, jak night.mjs). `start <n>` zakłada w tmux nową sesję główną z pierwszą
wiadomością promptu, tylko w bezpiecznym punkcie; `close-previous` zamyka każdą starszą sesję przebudowy (sesje tmux
`limen-rebuild-<n>` i procesy `claude` w repozytorium), żeby Adrian nie robił tego ręcznie. Stan: zrealizowane;
trzy rundy recenzji w review.md (poprawki w Decisions), wynik w outcome.md. -->

# Handover tool: `tools/handover.mjs` with its test

## Problem

D-033 hands a day session over to a new remote-control session, started in `tmux` with the first message of the
rebuild prompt, after which "the old session ends through EndConversation". Two incidents of 2026-11-19 show that
prose does not end it (z. 14, z. 21):
- `limen-rebuild-6` was still alive in `tmux` at 17:41, after its handover at 17:40 and its `EndConversation`: the
  conversation ended, the `claude` process did not. A woken old session would work on the same tree as the new one.
- Adrian resumed `limen-rebuild-7`'s conversation with `claude -r` in a WSL window while its first process still ran
  in `tmux` with the implementer of R-091, so one conversation ran in two processes. The auto-mode classifier
  refused the main session's `tmux kill-session` of its duplicate, and Adrian closed it by hand.

Adrian (2026-11-19): "Proszę uzupełnij automat hand offu o czyszczenie »poprzedniej sesji«, bo nie będę tego ciągle
robił ręcznie". He added `"Bash(node adrian-rebuild/tools/handover.mjs *)"` to `.claude/settings.local.json`.

Facts checked on the laptop (2026-11-19, a private `tmux -L` socket, tmux 3.2a): `new-session -d -s <name> -c <dir>
<cmd> <arg>…` runs `<cmd>` with its arguments as given, without a shell (backticks, quotes and `$HOME` arrive
unchanged); `has-session -t =<name>` and `kill-session -t =<name>` match the exact name (`=limen-rebuild-1` does not
match `limen-rebuild-12`); with no server, `list-panes -a` exits 1 with "no server running on …". A `claude` process
has `claude` as the first word of `/proc/<pid>/cmdline` and the directory it was started in as `/proc/<pid>/cwd`; a
subagent runs inside its session's process.

## Change

1. `adrian-rebuild/tools/handover.mjs` (new), run from the repository root:
   - The safe point, checked by both commands from git, not from prose: the branch is `adrian-rebuild`, `git status
     --porcelain` is empty, and `HEAD` equals `refs/remotes/origin/adrian-rebuild`. Otherwise exit 1, naming the
     unmet condition, with nothing started or closed.
   - `start <n>` (`n` a positive integer, else exit 2): refuses (exit 1) when a `tmux` session `limen-rebuild-<n>`
     exists; runs `tmux new-session -d -s limen-rebuild-<n> -c <repo> claude --remote-control "Limen rebuild <n>"
     <FIRST_MESSAGE>`, with `FIRST_MESSAGE` imported from `night.mjs`; after 2 s checks `tmux has-session -t
     =limen-rebuild-<n>` and exits 0 with the session's name, or 1 when the session is gone.
   - `close-previous`: the caller's own session is the nearest ancestor of the tool's process whose command is
     `claude`. It closes every `tmux` session named `limen-rebuild-<digits>` none of whose panes is an ancestor of the
     tool (`tmux kill-session -t =<name>`), then sends SIGTERM to every process whose command is `claude` and whose
     working directory is the repository, except the caller's own session and its descendants. A process still alive
     5 s after SIGTERM is named, and the exit is 1; otherwise 0. Each closed session and stopped process is one line
     of stdout; with none, the line says so. No `tmux` server is not an error.
2. `adrian-rebuild/tools/test-handover.mjs` (new), written first: a fake `tmux` on `PATH` (sessions from a state
   file, every call logged), fake `claude` processes (Node with `argv0` `claude`), a scratch repository with a bare
   `origin`. One test per mechanism (T-29).
3. `plan.md`: D-047 (amends D-033), the tool's commands in `## Commands`, the handover note in `## State`.

## Out of scope

- Claude processes of other users and outside the repository; `SIGKILL`.
- Reading the context share, the push notification and the decision when to hand over (D-033, the model's).

## Acceptance

- AC-1: `node --test adrian-rebuild/tools/test-handover.mjs` → exit 0.
- AC-2: the same test file against a tree without `handover.mjs` → exit 1 (the tests fail before the tool exists).
- AC-3: `node adrian-rebuild/tools/check.mjs` → exit 0; `npx biome check --error-on-warnings adrian-rebuild` → exit 0.
- AC-4 (judgment): `close-previous` cannot close the caller's own session or a process outside the repository, and
  closes nothing when the safe point does not hold; `start` passes the first message without a shell.

## Migration

none: a rebuild tool.

## Risk

- Another `claude` that Adrian runs in the repository at the same moment is stopped too; the rebuild has one main
  session, so D-047 names every other `claude` in the repository a previous session.
- A previous session in its last turn after its handover commit is stopped mid-turn; it writes nothing after the
  handover (D-033), and a write would fail the safe point first.

## Rollback

`git revert` of the commit `D-047: …`; the handover goes back to D-033's prose.

## Decisions

- 2026-11-19 (Adrian, in the day session): the handover closes the previous session by itself, not by hand.
- 2026-11-19 (main session, review round 1, `review.md`): all six notes are fixed, each with a test that fails on
  the round-1 tool: (1) `start` runs `env -u <name> … claude …`, so the new session starts without the variables
  that Claude Code 2.1 sets for its Bash tool (`SESSION_VARIABLES`), whichever `tmux` server runs it; (2) a `tmux`
  session is closed only when its `#{session_path}` is the repository; (3) only what started before the caller's own
  session is closed (field 22 of `/proc/<pid>/stat`, compared with the own session's; the same tick keeps it), so an
  old session that runs `close-previous` after `start` leaves the new one; (4) the caller's ancestors are never
  stopped; (5) a program that cannot start (`tmux` or `git` missing) ends with exit 4 and its name; (6) the
  session-selection test is split into one test per rule. AC-4 now also reads: `close-previous` cannot close a
  session or process younger than the caller's own session, nor a `tmux` session outside the repository.
- 2026-11-19 (main session, review round 2, the last round of fixes): (1) `SESSION_VARIABLES` holds the sixteen
  names a Bash tool of Claude Code 2.1 has and the claude process lacks, `AI_AGENT`, `GIT_EDITOR`,
  `COREPACK_ENABLE_AUTO_PIN` and `NoDefaultCurrentDirectoryInExePath` included; (2) the repository root comes from
  the tool's own `git`, so a missing `git` is named; (3) a process is reported as stopped only once it is gone; (4) the
  directory test uses a directory that exists. Notes 5 and 6 are rejected with reasons (`review.md`).
- 2026-11-19 (Adrian, after review round 3, choice (a)): the round's two code notes are fixed without a fourth
  review: the descendant term goes (a process the own session started is younger, so the start-order rule keeps it),
  and a `tmux` session that ended before its `kill-session` counts as closed, so the `claude` step still runs; each
  with its test (`review.md` → Round 3).
