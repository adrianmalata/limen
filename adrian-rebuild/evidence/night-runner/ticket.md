<!-- PL: Specyfikacja narzędzia tools/night.mjs w kształcie ticket.md, dla recenzji rebuild-reviewer przed pierwszą
nocą (D-019; narzędzie nie ma numeru R-NNN, bo poprzedza tickety etapu 5, jak hook z etapu 0). Zawiera wymagania
Adriana z 17.11.2026, kryteria akceptacji jako polecenia i uzupełnienie trybu nocnego o zmiany niezacommitowane.
Stan: zrealizowane w commicie „D-019”; przebieg recenzji w review.md, wynik w outcome.md. -->

# Night runner: `tools/night.mjs` with its test

## Problem

The night mode of the rebuild prompt (v6, "Tryb nocny", D-011) needs a runner that restarts `claude -p` after a
usage-window limit, "written with a test before the first night (like the stage-0 hook)", and D-016 (1) requires
`--permission-mode dontAsk`. Quoted from the prompt: "Gdy przebieg się kończy, a `status.json` nie ma powodu końca
z tego przebiegu, czeka i uruchamia go ponownie: najwyżej 3 razy na noc i nigdy po godzinie końca. O powodzie decyduje
pole w pliku, nie tekst wyjścia (z. 2). Bez `--dangerously-skip-permissions`." The prompt does not say how a run
resumed in the middle of a ticket treats uncommitted changes, and it does not fix the format of `status.json`.

Relied on:
- A-017, Decision: "fix — The lock owner file holds `{pid, start time, boot_id}`; any mismatch = takeover of an
  abandoned lock; waiting is bounded to 60 s, then an error naming the lock file, the owner and a hint". The runner
  does not wait for a lock: a held lock is a refusal.
- D-016 (1): "`tools/night.mjs` runs `claude -p` with `--permission-mode dontAsk`, so a command off the list is refused
  and a write to a protected path is denied". `## Commands` holds no clock command (`date` is not on the list), so a
  session cannot write a reliable time into a file.
- D-018: atomic writes through `atomic-write.mjs` for the tools' result files (the runner's logs are append-only
  streams, not result files).
- z. 1 (two exits: a deterministic success, a hard limit with escalation), z. 2 (the end is read from a field, never
  from the text of the output), z. 12 (an error names the file and the next step), z. 14 (guarantees in code).

## Change

- New `adrian-rebuild/tools/night.mjs` and `adrian-rebuild/tools/test-night.mjs` (fake `claude`, artificial clock).
- `.gitignore`: `adrian-rebuild/.night/`.
- `adrian-rebuild/plan.md`: D-019 in `## Decisions` (the runner, the `status.json` format, the supplement to the night
  mode on uncommitted changes); `## Commands` and `## State` updated.
- Adrian's requirements (2026-11-17), as built:
  1. `node adrian-rebuild/tools/night.mjs --until HH:MM [--claude <path>]`, started by Adrian in a terminal. `--until`
     is local time; the end is the next HH:MM, and an HH:MM more than 18 hours ahead has passed (Adrian's answer).
  2. Exit 1 with a message before any run: no or a passed `--until`; `adrian-rebuild/input/prompt.md` does not contain
     the first message exactly (one constant in `night.mjs`); a live `night.mjs` holds the lock
     `adrian-rebuild/.night/lock` (pid, process start time, boot id; any mismatch is abandoned and taken over, A-017).
     One more refusal, the main session's addition: the `claude` command cannot be found.
  3. Each run records its start, runs `claude -p "<first message> Tryb nocny do HH:MM." --permission-mode dontAsk
     --output-format json` from the repository root with stdin on `/dev/null`, never `--dangerously-skip-permissions`,
     stdout and stderr appended to `adrian-rebuild/.night/<date>-run-<n>.log`.
  4. Only the field `reason` of `adrian-rebuild/.night/status.json` decides: a known reason in a file modified after the
     run started ends the night with exit 0. Otherwise a retry after 30, then 60, then 120 minutes, at most 3 retries,
     never a start at or after the end; an end without a reason is exit 3 and a line in the last run's log. A failure
     of the runner itself is exit 4 (review round 1).
  5. `night.mjs` runs no git command and writes nothing outside `adrian-rebuild/.night/`.
  6. The supplement in D-019: a resumed run that finds uncommitted changes continues the ticket that `## State` names
     (gate, review) and never reverts work silently; when it cannot tell which ticket the changes belong to, an entry
     in `.night/questions.md` and the end with the reason `dirty-tree`.

## Out of scope

- Changes to `adrian-rebuild/input/prompt.md` (Adrian's file; the supplement lives in D-019) and to
  `.claude/settings.local.json`.
- A signal handler: Ctrl-C in the terminal stops both processes, and the lock left behind is abandoned, so the next
  start takes it over.
- Any git check of the tree by the runner (requirement 5); the session handles a dirty tree (requirement 6).

## Acceptance

- AC-1: `node --test adrian-rebuild/tools/test-night.mjs` → exit 0, one mechanism per test (T-29 (3)), with tests
  for: status `done` → exit 0 without a retry; the `claude` arguments (`dontAsk`, no
  `--dangerously-skip-permissions`); stdin on `/dev/null`; the repository root as the working directory; both output
  streams in the run log; the lock released at the end; runs without a status → retries after 30, 60 and 120
  minutes; always interrupted → exit 3 after 3 retries and a line in the log; no retry at `--until`, none after it,
  and none when a wait wakes up after it; a status from before the run and an unknown reason do not count; `--until`
  passed → exit 1; `--until` not HH:MM → refused; no `--until` → exit 1; a different first message → exit 1; no
  `claude` → exit 1; a held lock → exit 1; an abandoned lock (reused pid, another boot, dead owner) is taken over; a
  failure of the runner → exit 4.
- AC-2: `node adrian-rebuild/tools/check.mjs` → exit 0.
- AC-3: `npx biome check --error-on-warnings adrian-rebuild` → exit 0.
- AC-4: `grep -nx 'adrian-rebuild/.night/' .gitignore` → one line.
- AC-5 (judgment): `night.mjs` starts no process other than `claude`, and writes only below `adrian-rebuild/.night/`.
- AC-6 (judgment): D-019 states the dirty-tree rule and the `status.json` format, and both match `night.mjs`.

## Migration

none: a new tool; `adrian-rebuild/.night/` is new and ignored.

## Risk

- A `kill` of the runner's pid alone (not Ctrl-C, which reaches the whole process group) leaves `claude` running; a
  new runner would take the lock over as abandoned and start a second session on the same tree.
- A clock change (suspend of the laptop) delays a retry; the runner checks the end again after every wait.
- Two runners started at the same moment on an abandoned lock: one may remove the lock the other has just taken
  between its second read and its removal (a window of microseconds); both would run. Accepted: Adrian starts the
  runner by hand, once a night, and a rename of the lock before the check only moves the window to the restore of a
  live lock.
- A `claude -p` that hangs keeps the night and the lock until Adrian ends it in the morning. Accepted: the runner
  never kills a session, because a session past the end is finishing its ticket (night mode), and a kill in the
  middle of a ticket is the interruption the dirty-tree rule repairs; the hang is visible in the run log.

## Rollback

`git revert $(git log --format=%H --grep='^D-019:' adrian-rebuild --)`

## Decisions

- 2026-11-17 (Adrian): `--until` is the next HH:MM; an HH:MM more than 18 hours ahead counts as passed.
- 2026-11-17 (main session): the time of a status is the file's modification time, set by the kernel, because no
  session has a clock command; the field `reason` alone decides (z. 2, z. 14).
- 2026-11-17 (review round 1, `review.md`): to fix — split the tests to one mechanism each (blocking, T-29 (3)); add
  the tests "no retry at `--until`", "a wait that wakes up after the end starts no run" and "another boot id"; exit
  4 for a failure of the runner itself; D-019 names the questions file of D-011. Rejected with reasons in `## Risk`:
  the takeover race and the unbounded run. No change: `## State` names `review.md`, which the commit contains.
