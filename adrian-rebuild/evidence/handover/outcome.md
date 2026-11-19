<!-- PL: Wynik narzędzia tools/handover.mjs (D-047): `start <n>` i `close-previous` z bezpiecznym punktem z gita,
21 testów na fałszywym tmux i fałszywych procesach claude; każdy pada przed swoją zmianą (12 przed narzędziem,
6 przed poprawkami rundy 1, 3 przed rundą 2, 1 przed rundą 3) i przechodzi po nich; check.mjs i Biome z kodem 0.
Niezmierzone:
pierwszy prawdziwy hand-off z tym narzędziem (limen-rebuild-8).
Stan: zrealizowane. -->

# Outcome: handover tool `tools/handover.mjs`

## Done

- `adrian-rebuild/tools/handover.mjs` (new): `start <n>` and `close-previous`, both behind the safe point from git
  (branch `adrian-rebuild`, `git status --porcelain` empty, `HEAD` = `refs/remotes/origin/adrian-rebuild`); exit 0
  done, 1 refused or not done, 2 usage, 4 tool failure.
  - `start <n>`: refuses an existing `limen-rebuild-<n>`; `tmux new-session -d -s limen-rebuild-<n> -c <repo> env -u
    <name> … claude --remote-control "Limen rebuild <n>" <FIRST_MESSAGE>`, without the sixteen variables of
    `SESSION_VARIABLES` (the names a Bash tool of Claude Code 2.1 has and its claude process lacks); after 2 s
    `has-session -t =<name>`.
  - `close-previous`: the caller's ancestors from `/proc/<pid>/stat`; the own session is the nearest ancestor whose
    `argv[0]` is `claude`; "older" means started before the own session (field 22; a gone process counts as older,
    the same tick does not). Kills each `tmux` session `limen-rebuild-<digits>` whose `session_path` is the
    repository, none of whose panes is an ancestor and all of whose panes are older (a session that ended before
    its `kill-session` counts as closed); then SIGTERM to each older `claude` whose `/proc/<pid>/cwd` is the
    repository and that is not an ancestor (a process the own session started is younger, so it is kept); waits up
    to 5 s; then one stdout line per process that is gone, and a survivor is named on stderr, exit 1. No `tmux`
    server ("no server running", "error connecting to") means no sessions; a program that cannot start (`git`, which
    also gives the repository root, or `tmux`) is exit 4 with its name.
- `adrian-rebuild/tools/test-handover.mjs` (new): 21 tests, one mechanism each.
- `adrian-rebuild/plan.md`: D-047; `## Commands` (the test in the checks row, both commands in the main session's
  row); `## State` (the handover note says how the next handover runs).

## Proof

| Criterion | Command | Exit | Result |
|---|---|---|---|
| AC-1 | `node --test adrian-rebuild/tools/test-handover.mjs` | 0 | tests 21, pass 21, fail 0 (three runs) |
| AC-2 | the first 12 tests, written before `handover.mjs` existed | 1 | tests 12, pass 0, fail 12 |
| AC-2 | the 19 tests of review round 1 against the first tool | 1 | tests 19, pass 13, fail 6 (the six new tests) |
| AC-2 | the 20 tests of review round 2 against the tool after round 1's fixes | 1 | tests 20, pass 17, fail 3 (the changed and new tests) |
| AC-2 | the 21 tests after review round 3 against the tool after round 2's fixes | 1 | tests 21, pass 20, fail 1 (the new race test) |
| AC-3 | `node adrian-rebuild/tools/check.mjs` | 0 | `… 0 errors` |
| AC-3 | `npx biome check --error-on-warnings adrian-rebuild` | 0 | `Checked 30 files … No fixes applied.` |

The facts of `tmux` 3.2a the tool relies on were checked on a private socket (`tmux -L`), never on the default
server: `new-session` with several arguments runs the command without a shell (an argument with backticks, quotes
and `$HOME` arrived unchanged), `=<name>` matches the exact name, and with no server `list-panes -a` exits 1 with "no
server running on …".

## Deviations

Review rounds 1 and 2 widened the tool beyond the first `## Change`: the clean environment of the new session, the
directory and start-order rules of `close-previous`, the kept ancestors and the named missing program
(`ticket.md` → `## Decisions`).

## Measurement

`unmeasured`: the first real handover with the tool (`limen-rebuild-7` → `limen-rebuild-8`): that `start` opens a
live remote-control session, and that `close-previous` in it closes `limen-rebuild-7`, which runs as `claude -r` in a
WSL window, not in `tmux`. The new session reports the tool's lines to Adrian.
