<!-- PL: Ticket R-011 etapu 1 przebudowy: narzędzie same-task (próba to cała sesja koordynatora uruchomiona bez UI
przez tryb RPC Pi, decyzja D-021) z oceną na ukrytych testach i raportem pass^k, oraz narzędzie czasu bramki (M-10,
T-11). Oba żyją w adrian-rebuild/tools/, bo mierzą przebudowę, a nie są częścią Limena; protokół RPC Pi nie jest
w źródłach repo, więc runner deklaruje go w jednym module, a krok B.2 na seacie go sprawdza. Stan: zamknięty w nocy
18.11 (dwie rundy poprawek, recenzja PASS w rundzie 3); uwagi rundy 3 czekają na decyzję Adriana (Q-6). -->

# R-011 The same-task runner and the gate-time tool

## Problem

The rebuild compares Limen before and after on the same task (gate 2 §2, H-21), but no tool runs such an attempt, so
B.2 (the "before" on `rebuild-base`), 4.8 and 9.1 cannot run. M-10 (the gate's run time at every stage tag, T-11) has
no tool either.

Relied on (quoted):
- H-21 (`audit.md` → gate 2 §4): "**H-21 — fix:** the same-task method in §2 (Measurement)." §2, Measurement: "compare
  Limen before and after the rebuild on the **same task** (identical input: commit and task file; same model and
  reasoning; clean state), several attempts (z. 17), result as pass^k. Candidate: a closed synchronizer M1 ticket that
  went through several review rounds, replayed from its parent commit, the merged change as the reference solution."
- `plan.md` → `## Measurement`, same-task method: "run again from its parent commit in a scratch clone outside the
  projects' `.limen/`, never landed; identical input (commit and ticket file), the same model and reasoning level, a
  clean state. An attempt is a whole coordinator session with a fixed owner message and a fixed reply to every owner
  question (D-021). An attempt passes when the job reaches `done` and the test files of the merged reference change
  pass on the job's tip together with the project gate. The result is pass^k (all k attempts pass), reported next to
  the number of passing attempts; k = 3 per version". "Never landed" means never landed on the real project: the
  scratch clone has no `origin`, so a land inside it stays there.
- D-021 (Adrian, 2026-11-18), in full:
  - "The runner starts the tested Limen's coordinator headless through Pi's RPC mode, sends one fixed owner message
    (Q-2's proposal: "Implement <ticket>; decide engineering questions yourself") and answers every question
    addressed to the owner with the fixed reply "Decide this yourself; I am not available." The attempt ends when the
    coordinator is idle with no running job, or at the time limit; the reference tests and the project gate then run
    on the tip of the newest `done` worker job, and M-05 is counted from the coordinator's session file."
  - "(1) Every question addressed to the owner counts as a touchpoint (T-40, z. 37), also when it gets the fixed reply.
    In the "after" version an escalation is the final result `escalated`, which only the owner channel closes (T-05
    (3))."
  - "(2) The time limit of an attempt is 1.5 times the candidate ticket's real time from the M1 records, at least 3
    hours, the same for both versions; Adrian gives the time from the records in step B.2."
  - "(3) An attempt interrupted by the subscription limit is void and runs again; it does not count as a failure."
  - "(4) The attempt runs in a clean copy of the project without `origin` (at `rebuild-base` jobs hold the GitHub
    credential, A-004). The hidden tests of the merged M1 change stay out of the agents' reach and are laid over only
    after the attempt. The final state is evaluated by: the tests, landed or not, rounds, tokens by class, time, and
    owner touchpoints."
- `plan.md` → `## Tickets`, notes, R-011: "the runner takes the project, the parent commit, the ticket file and the
  reference test paths as arguments; the rebuild session has no access to the projects, so Adrian picks the ticket
  before B.2". `## Deployment` → B.2: "once R-011 is pushed, Adrian runs it on the seat as the agents' account from a
  separate checkout of that commit, outside `/opt/limen`, and points it at the `rebuild-base` checkout in `/opt/limen`
  and at a scratch clone"; "First the seat check of R-011 (D-021): the coordinator started headless through Pi's RPC
  mode loads Limen's hooks and receives a wake".
- M-05: "Same-task pass^k, with per run: owner commands outside owner-channel actions (T-41, target 0), `sleep` calls
  and repeated `status` reads by the coordinator (T-34), share of model replies with their own Done / In progress /
  Waiting for you lines (T-15 …), reply language equal to the owner's (T-13), metaphors from the T-14 list in
  replies". M-10: "Run time of the gate at every stage tag (T-11) | gate-time tool (R-011), laptop | 79–88 s".
- T-11: "the run time of `npm run check` is recorded in `evidence/` at every stage tag and compared with the stage 0
  baseline, as a metric for gate 5.N"; Check: "a script that records the gate's run time".
- `plan.md` → `## Commands`: the gate-time tool is run by the main session only, at the close of a stage; Adrian adds
  the command strings of both tools to `.claude/settings.local.json` after this ticket's `outcome.md`. No redirection:
  a tool writes its file with `--out <file>` through `adrian-rebuild/tools/atomic-write.mjs` (D-018).

Facts of the code at `rebuild-base` the runner reads (checked by the main session's explorer, 2026-11-18):
- Job directories `.limen/jobs/<id>/` hold one file per field: `state` (`running`, `done`, `failed`, `stopped`; a job
  still setting up has no `state` yet and counts as running), `role` (`worker`, `reviewer`, …), `tip`, `started-at`,
  `finished-at` (`src/job/job.ts:25`, `src/job/record.ts:45-58`, `src/job/publication.ts:103-167`).
- Pi session transcripts are JSONL; `src/job/usage.ts` (assistant turns with `usage` fields `input`, `output`,
  `cacheRead`, `cacheWrite`) and `src/job/session-commands.ts` (bash tool calls and their results) read their format.
  Jobs keep theirs in `.limen/jobs/<id>/session/*.jsonl` (`--session-dir`, `src/runtime/engine.ts:238`).
- A quota-limit error is the text "You've hit your … limit · resets …"; the seat's `docs/seat/quota-resume.ts:20`
  matches it with `/hit your (?:[\w-]+ )?limit/i`.
- The project stub `.pi/extensions/limen.ts` finds Limen's hooks through `LIMEN_PACKAGE` or the `limen` binary on
  `PATH`; the seat extensions check `LIMEN_COORDINATOR=1`. `limen land` runs no project test (`src/commands/land.ts:148-163`),
  so "the project gate" is a command Adrian names (synchronizer: its `npm run check`).

Not in the repository: Pi's RPC protocol. The npm tarballs are fetched only in stage 2 (`## Commands`), and
`evidence/engine-sources/pi-1.5.1.md:28` names the RPC mode without its messages. The runner therefore declares the
subset it uses in one module, the fake engine implements exactly that declaration, and B.2's seat check confirms it
before any attempt counts. The declared subset is the one Pi documents for its RPC mode: `pi --mode rpc` reads one JSON
command per stdin line and writes one JSON object per stdout line; `{"type":"prompt","message":"…"}` is answered by
`{"type":"response","command":"prompt","success":true}` (or `"success":false` with `"error"`);
`{"type":"abort"}` stops a run; the events are those of JSON mode (`agent_start`, `agent_end`, `message_end`, …,
as `src/runtime/stream.ts:42-101` reads them for jobs).

## Change

All files are new and live in `adrian-rebuild/tools/`, because both tools measure the rebuild and are not part of
Limen (the same-task runner is "a measurement tool", `plan.md` → `## Terms`). They are Node ES modules with no
dependency, like the other tools there, each with a `/* PL: … */` summary.

1. `adrian-rebuild/tools/pi-rpc.mjs`: the only module that knows Pi's RPC protocol. It starts `<pi> --mode rpc
   --session-dir <dir> <engine args>` with a given cwd and environment, sends commands, yields the parsed stdout
   objects, and stops the process (stdin closed, then `SIGTERM` after 10 s, then `SIGKILL` after 10 s more). Its
   header comment lists every command, response and event it relies on and says that B.2's seat check confirms them.
   A line that is not JSON, or a `prompt` with no `response` within 60 s, is an error that names what was expected.
2. `adrian-rebuild/tools/same-task-session.mjs`: reads Pi session JSONL files in the format that `src/job/usage.ts`
   and `src/job/session-commands.ts` read: tokens by class (input, cache write, cache read, output) summed over
   assistant turns; the bash commands of the tool calls; the text of each assistant reply; whether an assistant turn
   ended on a quota-limit error (`/hit your (?:[\w-]+ )?limit/i` in its error text); and whether any tool call's
   arguments contain a given string.
3. `adrian-rebuild/tools/same-task.mjs`, the runner, with three subcommands:
   - `run --limen <dir> --project <repo> --commit <sha> --reference <sha> --ticket <path> --time-limit <minutes> --out
     <dir> [--pi <path>] -- <engine args>`:
     1. Refuses (exit 1, the reason on stderr) when `--time-limit` is below 180 (D-021 (2)), when `--out` exists, or
        when `--commit`, `--reference` or `--ticket` (a path inside the project at `--commit`) is missing. A missing
        or unknown flag is a usage error (exit 2).
     2. The clean copy (D-021 (4)): `git clone --no-local` of `--project` into `<out>/clone`; the branch `main` at
        `--commit`, checked out; every other ref and the remote `origin` removed; the reflog expired and unreachable
        objects pruned. Then `git cat-file -e <reference>` must fail in the clone, otherwise the runner refuses (exit
        1: the reference change would be in the agents' reach).
     3. The coordinator: `pi-rpc.mjs` starts Pi in the clone with `--session-dir <out>/session` and the engine args
        after `--` (Adrian's route and extension flags for the version under test; the runner adds no others). The
        environment is the runner's own with `LIMEN_COORDINATOR=1`, `LIMEN_PACKAGE=<limen>`, `<limen>/bin` first on
        `PATH`, and without `HERDR_ENV`, `HERDR_PANE_ID` and `HERDR_TAB_ID` (headless: no Herdr tabs).
     4. The owner message, sent once as a `prompt`: `Implement <ticket>; decide engineering questions yourself`
        (D-021, Q-2's wording), where `<ticket>` is the `--ticket` path.
     5. The loop. An **owner turn** is a moment when the coordinator is idle (an `agent_end` with no `agent_start`
        within a settle time of 10 s) and no job of `<out>/clone/.limen/jobs/` runs. **Progress** is a new job
        directory or a move of the clone's `main`. At an owner turn: when the runner has already sent a reply and
        there was no progress since that reply, the attempt ends (`finished`); otherwise the runner sends the fixed
        reply `Decide this yourself; I am not available.` as a `prompt` and records the turn. A `prompt` refused
        because a run started in the meantime (a wake) is not an owner turn; the loop waits again.
     6. The time limit: at `--time-limit` minutes from the owner message the runner sends `abort`, runs
        `<limen>/bin/limen stop <id> "same-task time limit"` in the clone for every running job, and ends the attempt
        as `timeout`.
     7. Void (D-021 (3)): an assistant turn of the coordinator or of any job that ended on a quota-limit error makes
        the outcome `void-limit`; a tool call of the coordinator or of any job whose arguments contain the `--project`
        path or the `--reference` SHA (its first 7 characters suffice) makes it `void-contaminated`. Both are checked
        when the attempt ends, from the session files.
     8. After the end: Pi is stopped; `<out>/result.json` is written atomically (`atomic-write.mjs`) with: the
        outcome; the arguments; the start, end and elapsed time; every owner turn (time, the coordinator's last reply
        text, whether the runner replied, whether progress followed the reply); `touchpoints`, the number of fixed
        replies (D-021 (1): every question to the owner comes at an owner turn and gets the reply, so every question
        counts); every job (id, role, state, tip, started, finished); `rounds`, the
        number of reviewer jobs; the candidate, the newest `done` worker job by finish time (id and tip), or none;
        `landed`, whether the candidate's tip is an ancestor of the clone's `main`; tokens by class for the
        coordinator and for all jobs; and the M-05 counts from the coordinator's session file: `sleep` calls (bash
        commands that run `sleep`), `status` reads (bash commands that run `limen status` or `limen jobs`), and the
        replies with a line that starts with `Done`, `In progress` or `Waiting for you`, next to the number of
        replies. Reply language and T-14 metaphors are left to the reader of the saved reply texts.
     The runner exits 0 when `result.json` is written, whatever the outcome; 4 when git, the file system or Pi fails
     (Pi exits before the end, a protocol error of item 1).
   - `evaluate <out> --tests <dir> --command "<cmd>" [--command "<cmd>" …]`: refuses (exit 1) without a candidate in
     `result.json`. Otherwise it adds a detached worktree of the clone at the candidate's tip in `<out>/eval`, copies
     every file below `--tests` over it at the same relative path (the hidden tests, laid over only now, D-021 (4)),
     runs each command with `sh -c` in that worktree, and writes `<out>/evaluation.json` atomically: the candidate,
     each command with its exit code and time, and `pass` (every command exited 0). Exit 0 when the file is written.
   - `report <out> [<out> …]`: one line per attempt (outcome, pass), then `passed P of K; pass^K: yes|no; void: V`,
     where void attempts are left out of K and named (they run again, D-021 (3)); an attempt with no
     `evaluation.json` counts as not passed, and `timeout` counts as not passed.
4. `adrian-rebuild/tools/fake-pi-rpc.mjs`: a fake Pi for the tests that speaks exactly the protocol of item 1 and plays
   a scenario file given among the engine args: on each `prompt` it starts a run (`agent_start`), performs the
   scenario's steps for that prompt (create or finish a job directory under `.limen/jobs/`, commit in the clone and
   move `main`, write a session file entry with a reply, a bash call or a quota-limit error), and ends the run
   (`agent_end`); it can also start a run on its own after a delay (a wake), or never answer a `prompt` (a protocol
   error).
5. `adrian-rebuild/tools/test-same-task.mjs` (`node --test`, temporary directories only, no network, no real wait:
   `same-task.mjs` exports its functions, and the tests give them a clock and short times; the CLI keeps the 180-minute
   floor). Each test checks one mechanism:
   - the clone has `main` at the commit, no `origin`, no other ref, and no object of the reference commit; a reference
     that is reachable from the commit is refused with exit 1;
   - a scenario of spawn, job done, "Shall I land?", land, "Nothing more." ends `finished` with two replies, two
     touchpoints (progress after the first, none after the second), `landed: true`, the candidate's tip, one round
     per reviewer job and the token sums of the sessions;
   - a scenario whose first reply is a question gets the fixed reply before anything has progressed;
   - a wake that starts a run while the runner is about to reply is not an owner turn;
   - a job that never ends reaches the time limit: `abort` is sent, `limen stop` (a fake `bin/limen` that records its
     arguments) is called for the running job, and the outcome is `timeout`;
   - a quota-limit error in a job's session gives `void-limit`; a tool call that names the reference SHA gives
     `void-contaminated`;
   - the M-05 counts: a `sleep 30` call, two `limen status` calls and a reply with a `Done` line are counted;
   - a `prompt` with no response ends with exit 4 and names the missing response;
   - `evaluate` lays the hidden test files over the candidate's tip and reports `pass: false` with the failing
     command, and `pass: true` when every command exits 0; it refuses with no candidate;
   - `report` gives `passed 2 of 3; pass^3: no; void: 1` for two passes, one failure and one void attempt;
   - the CLI refuses a `--time-limit` of 179 with exit 1 and an unknown flag with exit 2.
6. `adrian-rebuild/tools/gate-time.mjs --out <file>`: runs `node adrian-rebuild/tools/gate.mjs` once with its output
   passed through to the terminal, measures the wall time, and writes `<file>` atomically: a `<!-- PL: … -->` summary
   (the file is generated, so the script writes the summary), the date, `git rev-parse HEAD`, whether the tree was
   clean, the gate's exit code, the test count lines of the gate's output (`tests`, `pass`, `fail`), and the run time
   in seconds. It exits with the gate's exit code. For its test it accepts `--gate <script>` in place of `gate.mjs`.
7. `adrian-rebuild/tools/test-gate-time.mjs`: with a fake gate script that prints counts and exits 0, the file holds
   the SHA, the counts and a time, and the tool exits 0; with one that exits 1, the file records exit code 1 and the
   tool exits 1; the file starts with a `<!-- PL:` block.

## Out of scope

- Running any attempt, B.2 itself, and choosing the candidate ticket, the time limit and the hidden tests: Adrian, on
  the seat (`## Deployment` B.2).
- The job format of later versions: from R-021, jobs live in `record.json`; the ticket that changes the job files
  also extends the runner's job reader. The final result `escalated` of D-021 (1) arrives with the escalation of stage
  7 (R-069), which adds it to the runner.
- Reply language (T-13) and T-14 metaphors as counts: the reply texts are saved for the reader.
- Starting a coordinator for the later versions' start script (R-050): the engine args after `--` are the caller's.
- Any change to Limen's code, tests or docs; `.claude/settings.local.json` (Adrian adds the command strings).
- `context-size.mjs` and M-01.

## Acceptance

- AC-1: `node --test adrian-rebuild/tools/test-same-task.mjs` → exit 0, with every test of `## Change` item 5.
- AC-2: `node --test adrian-rebuild/tools/test-gate-time.mjs` → exit 0, with every test of item 7.
- AC-3: `node adrian-rebuild/tools/gate.mjs` → exit 0 with `fail 0` (Limen's own suite is unchanged: 82 tests).
- AC-4: `node adrian-rebuild/tools/check.mjs` → exit 0; `npx biome check --error-on-warnings adrian-rebuild` → exit 0.
- AC-5: `git status --porcelain` → only the new files of `## Change` (and the main session's files), nothing outside
  `adrian-rebuild/`.
- AC-6: `git grep -n -e '"prompt"' -e '"abort"' -e 'agent_end' -e '--mode' -- adrian-rebuild/tools` → matches only in
  `pi-rpc.mjs`, `fake-pi-rpc.mjs` and the two test files: the protocol has one module.
- AC-7 (judgment): the outcome shows each new test file failing before its tool existed (the command and the
  error), because a new tool cannot be checked by `fails-before.mjs`, which reads only `test/`.
- AC-8 (judgment): `run` gives the hidden tests no path: no argument of `run` names them, and `evaluate` is the only
  reader of `--tests`; the loop of item 3.5 decides only from events, job files and git, never from the text of a
  reply.

## Migration

none: new tools; no on-disk format or CLI of Limen changes.

## Risk

- The declared RPC subset may differ from Pi 1.5.1. Bound: one module (AC-6); a missing response is exit 4, not a
  silent pass; B.2's seat check runs first, and a mismatch is a fix ticket before any attempt counts.
- The wake may not reach a headless coordinator at `rebuild-base` (a job subscribes only through `PI_SESSION_ID` in
  the environment of `limen spawn`, `src/commands/spawn.ts:808-814`). Then the coordinator stays idle after a job ends,
  the runner sees an owner turn and replies, and the touchpoint count rises. B.2's seat check ("receives a wake")
  catches it before the baseline runs.
- The agents' account can read the projects on the seat, where the merged change lives. Bound: the contamination
  check of item 3.7 voids an attempt whose tool calls name the source path or the reference SHA; the hidden tests
  reach the seat only for `evaluate`.
- The runner does not read reply text, so it cannot tell a question from a statement: it answers every owner turn
  until the end rule holds. Every earlier reply was followed by progress (otherwise the attempt would have ended), so
  only the last reply can be one to a statement ("Nothing more to do"): `touchpoints` is exact or one too high, and
  the last owner turn's text in `result.json` tells which.
- The seat extensions in the agents' `~/.pi/agent/extensions/` load in the RPC session as in a normal coordinator;
  `coordinator-handoff.ts` opens a new session at 30 % context, whose behaviour without a UI is not known. B.2's seat
  check watches for it.

## Rollback

`git revert $(git log --format=%H --grep='^R-011:' adrian-rebuild --)`; no migration.

## Decisions

- 2026-11-18 (night run, main session): the tools live in `adrian-rebuild/tools/` as `.mjs` (D-010's TypeScript rule
  binds Limen's seat tooling in `seat/`; these measure the rebuild); the protocol subset is declared, not read from
  sources, for the reason in `## Problem`; D-021 does not say how a question is told from a statement, so the loop
  answers every owner turn until the end rule of item 3.5 holds and counts every reply (exact or one too high, see
  `## Risk`), instead of reading reply text; the M-05 counts come from the coordinator's session file, as D-021 says.
  Adrian may change any of these at gate 5.1.
- 2026-11-18 (night run, review round 1, `review.md`): fix findings 1, 2, 4, 5, 6, 7 and 8, and split the M-05 test
  into three tests (T-29); finding 3 is rejected with its reason in `review.md`. In detail: (1) a shell reserved word
  (`do`, `then`, `else`, `{`, `!`, `(`) may stand between a separator and the counted command, with a test of a
  `while … do sleep 30` loop and of a `for … do limen status` loop; (2) a second or unrequested `prompt` response ends
  with the named protocol error, not a `TypeError`, with a test; (4) the SHA contamination check ignores the `--out`
  path as the project-path check does; (5) a quota-limit error is also found in the text parts of an error turn, as
  `docs/seat/quota-resume.ts:152-156` reads it; (6) `--out`'s parent must exist (exit 1 otherwise) and `<out>` is
  created without `recursive`; (7) on exit 4 the runner runs `limen stop` for every running job, as at the time
  limit, and names a stop that failed; (8) an exception that is not a git, file-system or protocol failure exits 5
  with its stack.
- 2026-11-18 (night run, review round 2, `review.md`: PASS with six notes): the second and last round of fixes takes
  notes 2, 4 and 5; notes 1, 3 and 6 are rejected with their reasons in `review.md`. (2) A job that a `limen stop`
  could not end because it has no `state` file yet (it is still setting up or waits in the start queue) is polled
  until it has one, for at most 10 minutes, and then stopped again; a job still not stopped after that is named in
  `result.json` → `stops` and on stderr with the `limen stop` command to run; tests: a job that gets its `state` after
  the first stop is stopped by the second, and one that never gets it is named once the bound passes (a short bound in
  the test). (4) `gate-time.mjs` exits 4 with its reason when a `git` call or the write of the evidence file fails, so
  the code tells it from a failing gate; a test with an `--out` whose parent is a file. (5) A session line that is not
  JSON and is not the torn last line no longer aborts the summary: it is skipped and listed in `result.json` →
  `sessionErrors` as `file:line: <reason>`, and the result is written as usual; a test with a bad middle line.
