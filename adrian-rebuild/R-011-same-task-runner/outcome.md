<!-- PL: Wynik ticketu R-011 (szkic implementera po rundzie recenzji 2): w adrian-rebuild/tools/ powstały narzędzie
same-task (próba jako cała sesja koordynatora przez tryb RPC Pi, czysty klon bez obiektów zmiany referencyjnej, pętla
tur właściciela, limit czasu, unieważnienia, result.json, evaluate i report), jedyny moduł protokołu RPC, czytnik sesji
Pi, fałszywy Pi do testów oraz narzędzie czasu bramki, każde z testem. Runda 1 dodała poprawki 1, 2 i 4–8 i trzy testy
M-05, a runda 2 poprawki 2, 4 i 5 (drugie zatrzymanie zadania bez pliku state, kod 4 narzędzia czasu bramki, linie
sesji spoza JSON w sessionErrors); uwagi 3 z rundy 1 oraz 1, 3 i 6 z rundy 2 odrzucone, uwaga 1 czeka na Adriana jako
otwarty punkt. Dowody: testy 35/35 i 4/4, bramka 82/82, check.mjs i Biome z kodem 0, każdy nowy test padał przed
swoją poprawką. Stan: zamknięty; bramka sesji głównej zielona, recenzja PASS w rundzie 3, cztery uwagi rundy 3 czekają
na decyzję Adriana o tickecie poprawek (Q-6). -->

# Outcome: R-011 The same-task runner and the gate-time tool

## Done

All files are new and live in `adrian-rebuild/tools/`. They are Node ES modules with no dependency, and each opens
with a `/* PL: … */` summary.

- Item 1, `pi-rpc.mjs`: the only module that knows Pi's RPC mode. Its header lists every command, response and event
  it relies on, and says that step B.2 confirms them on the seat. `startPi` starts `<pi> --mode rpc --session-dir
  <dir> <engine args>` with a given cwd and environment. `prompt` and `abort` send the commands, and `next(waitMs)`
  gives the parsed stdout objects in order. `stop` closes stdin, sends `SIGTERM` after 10 s and `SIGKILL` after 10 s
  more. Each of these is a `PiError` that names what was expected: a line that is not JSON, a `prompt` with no
  `response` within 60 s, a second or unrequested response, a response without a boolean `success`, and Pi ending on
  its own. The response that breaks the protocol is not passed on, and nothing after a failure is passed on, so the
  caller gets the named error, not a stale object (review finding 2). The runner reads events only through
  `runStarted`, `runEnded`, `promptAnswer` and `assistantReply`, so the protocol lives in this one module (AC-6).
- Item 2, `same-task-session.mjs`: reads every `*.jsonl` of a session directory in the format that
  `src/job/usage.ts` and `src/job/session-commands.ts` read. It gives the tokens by class over the assistant turns,
  the bash commands of the tool calls and the text of each assistant reply. It gives the quota-limit texts: for a
  turn with `stopReason` "error", the `errorMessage` or a text part that matches `/hit your (?:[\w-]+ )?limit/i`, as
  `limitError` in `docs/seat/quota-resume.ts:152-156` reads it (finding 5). It also lists the tool calls whose
  arguments contain a given string, after given strings are removed. A torn last line is skipped. Any other line that
  is not JSON is skipped too, and reported as `file:line: <reason>`, so one damaged line does not cost the summary of
  a whole attempt (review round 2, note 5).
- Item 3, `same-task.mjs`, with `run`, `evaluate` and `report`. It exports `runAttempt`, `makeClone`, `readJobs`,
  `isRunning`, `evaluate`, `report`, `main` and `FIXED_REPLY`. The tests give `runAttempt` short times. The CLI keeps
  the 180-minute floor, the 10 s settle time, a 2 s job poll and the 60 s response limit.
  - 3.1: `run` refuses with exit 1 and the reason on stderr in these cases: `--time-limit` is below 180; `--out`
    exists, or its parent directory does not (finding 6); `--commit` or `--reference` is not a commit of the project;
    `--ticket` is not a file of the project at `--commit`. A missing or unknown flag, or a time limit that is not a
    number, is a usage error (exit 2). The runner creates `<out>` without `recursive`, so it creates no other
    directory.
  - 3.2: `git clone --no-local --no-checkout`, then `checkout -B main <commit>`, `remote remove origin`,
    `update-ref -d` of every ref but `refs/heads/main`, `reflog expire --expire=now --expire-unreachable=now --all`
    and `gc --prune=now`. If `git cat-file -e <reference>` still succeeds in the clone, the runner refuses (exit 1)
    and removes the `<out>` it created.
  - 3.3: Pi starts in the clone with `--session-dir <out>/session` and the engine args after `--`. Its environment is
    the runner's own, with `LIMEN_COORDINATOR=1`, `LIMEN_PACKAGE=<limen>`, `<limen>/bin` first on `PATH`, and
    without `HERDR_ENV`, `HERDR_PANE_ID` and `HERDR_TAB_ID`.
  - 3.4: the owner message is sent once: `Implement <ticket>; decide engineering questions yourself`.
  - 3.5: the loop (`observe`, `answered`, `ownerTurn`, `converse`) decides only from events, job files and git. An
    owner turn is: no run active, no prompt waiting for its answer, no job running, and the settle time passed. At an
    owner turn the runner ends the attempt as `finished` when it has already replied and nothing has progressed since
    then (no new job directory, `main` not moved). Otherwise it sends `Decide this yourself; I am not available.` A
    refused prompt is not an owner turn: the loop waits for the next quiet moment.
  - 3.6: at the time limit the runner sends `abort` and runs `<limen>/bin/limen stop <id> "same-task time limit"` in
    the clone for every running job. The outcome is `timeout`. At `rebuild-base` the stop reads the job's `state`
    file, so it cannot end a job that has none yet (still setting up; a queued job already has `state` `running`,
    review round 3, note 2, which corrects the round-2 decision and the code comment). Such a job is polled until it has
    one, for at most 10 minutes, and stopped again. A job still without one is named on stderr and in `stops`, with
    the command to run: `cd <clone> && <limen>/bin/limen stop <id> "<reason>"` (review round 2, note 2).
  - 3.7: from the session files of the coordinator and of every job: a quota-limit error gives `void-limit`. A tool call
    that names the reference SHA (its first 7 characters) or the project path gives `void-contaminated`. Both name
    checks first remove the attempt's own `--out` path from the arguments (finding 4).
  - 3.8: `result.json` is written through `atomic-write.mjs`. It holds the outcome, the arguments, the start, end and
    elapsed time, and every owner turn (time, the last reply text, `replied`, `progressAfter`). It also holds
    `touchpoints` (the fixed replies), every job (id, role, state, tip, started, finished), `rounds` (reviewer jobs),
    the candidate (the newest `done` worker by finish time: id and tip, or null), `landed` (`merge-base
    --is-ancestor` of the tip and `main`), and the tokens by class for the coordinator and for all jobs. Then the
    M-05 counts (`sleepCalls`, `statusReads`, `footerReplies`, `replies`), and last `sessionErrors`, the session lines
    that could not be read.
  - Exit codes: 0 when the file is written, whatever the outcome; 4 on a git, file-system (a system error with a
    `syscall`) or Pi failure; 5, with the stack, for any other exception (finding 8, T-02). When the conversation
    fails, the runner runs `limen stop <id> "same-task runner failure"` in the clone for every running job, names the
    jobs it stopped, and names each stop that failed with its exit code and stderr (finding 7). Jobs with no `state`
    file are waited for and stopped again here as well, by the same function as at the time limit.
  - `evaluate`: refuses (exit 1) without a candidate. It adds a detached worktree of the clone at the candidate's tip
    in `<out>/eval` and copies every file below `--tests` over it at the same relative path. It runs each `--command`
    with `sh -c`, and writes `evaluation.json` (the candidate, each command with its exit code and time, `pass`).
  - `report`: prints one line per attempt, then `passed P of K; pass^K: yes|no; void: V (<void dirs>)`. Void attempts
    are left out of K. An attempt with no `evaluation.json`, and a `timeout`, count as not passed.
- Item 4, `fake-pi-rpc.mjs`: plays a scenario file given as `--scenario <file>` among the engine args, speaking only
  the declared subset. On a prompt it plays the next run: `agent_start`, then the steps, then `agent_end`. The steps
  are `spawn` (with `state: null`, a job still setting up), `finish` with a commit and `tip`, `land` by fast-forward
  of `main`, `reply`, `bash`, `garbage` (a line that is not JSON), and `limit` (in `errorMessage`, or with
  `in: "text"` in a text part); each writes to the coordinator's or a job's session file.
  - A run with `trigger: "wake"` starts on its own after a delay.
  - `refuse: true` acts out a wake that started a run just before the prompt arrived.
  - `respondTwice: true` answers twice.
  - `respond: false` never answers, but still plays the run's steps when it has any.
  - The fake records its argv, cwd, environment and every command it receives.
- Item 5, `test-same-task.mjs`: 35 tests, each checking one mechanism, with temporary directories only and no
  network. Its fake `bin/limen` records its arguments, can fail, and with `lateState` acts as `rebuild-base` does for
  a job that gets its `state` just after a stop. Two suites share one attempt each: the flow (6 tests) and the M-05
  counts (3 tests, split by review round 1, T-29).
- Item 6, `gate-time.mjs --out <file> [--gate <script>]`: checks the tree with `git status --porcelain` before the
  gate runs. It runs the gate once with its output passed through and kept, and measures the wall time. It writes the
  file atomically: a `<!-- PL: … -->` summary, the date, `git rev-parse HEAD`, whether the tree was clean, the gate's
  exit code, the last `tests`, `pass` and `fail` count lines (`ℹ` or `#` form), and the run time in seconds. It exits
  with the gate's exit code. It exits 4, with its reason on stderr, when finding the repository, a `git` call, the
  gate's start or the write of the file fails, so the code tells such a failure from a failing gate (review round 2,
  note 4).
- Item 7, `test-gate-time.mjs`: 4 tests with a fake gate in a fixture repository.

## Review round 1

Fixed as `ticket.md` → `## Decisions` lists them; each fix has a test that failed against the code before it (below).

| Finding | Change | Test |
|---|---|---|
| 1 | `LEAD` in `same-task.mjs` lets a shell reserved word (`do`, `then`, `else`, `{`, `!`, `(`) stand between the separator and the counted command | the M-05 suite: `while true; do sleep 30; done` and `for job in a b; do limen status; done` count; `echo sleep` and `git status` do not |
| 2 | `pi-rpc.mjs`: a second or unrequested response is not queued, and no object after a failure is passed on | a second response to one prompt ends with exit 4 and the named protocol error |
| 4 | the SHA check removes the `--out` path first, as the project-path check does | the reference SHA inside the attempt's own `--out` path does not contaminate it |
| 5 | `quotaLimits` reads `errorMessage` and the text parts of a turn with `stopReason` "error" | a quota-limit text in a text part of an error turn makes the attempt `void-limit` |
| 6 | `--out`'s parent must exist (exit 1); `<out>` is created without `recursive`; `makeClone` leaves directory creation to `git clone` | an `--out` whose parent does not exist is refused and creates no directory |
| 7 | on a failure of the conversation, `limen stop` for every running job (`stopJobs`, shared with the time limit), with the stopped jobs named and each failed stop named | `limen stop` runs for the running job on exit 4; a failing `limen stop` is named |
| 8 | `failure()`: 4 only for git, a system error (`syscall`) and Pi; 5 with the stack otherwise | an exception that is not a git, file-system or protocol failure exits 5 with its stack (a damaged `result.json` read by `report`) |
| 3 | rejected by the main session (`review.md`); see `## Deviations from the ticket`, item 13 | — |

## Review round 2

PASS with six notes. Fixed as `ticket.md` → `## Decisions` (review round 2) lists them; each fix has a test that failed
against the code before it (`## Fails before`). Notes 1, 3 and 6 are left as they are (`review.md` → Round 2); note 1
is an open point for Adrian below.

| Note | Change | Test |
|---|---|---|
| 2 | `stopJobs` in `same-task.mjs`, used at the time limit and after a failure: a job that had no `state` when it was stopped is polled every `pollMs` until it has one, at most `stateWaitMs` (10 minutes), and stopped again while its state is `running`. A job still without one is named on stderr and gets a `stops` entry with `exit: null`, `error: "no state file"` and `next`, the command to run | a job that gets its state after a `limen stop` failed on its missing state is stopped by a second stop; a job that never gets a state is named with the `limen stop` command once the wait bound passes (300 ms in the test) |
| 4 | `gate-time.mjs`: an `EnvironmentError` for finding the repository, a `git` call, the gate's start and the write of the file; exit 4 with the reason | a failed write of the file (an `--out` whose parent is a file) exits 4 with its reason |
| 5 | `readSession` returns `{ messages, errors }`; a line that is not JSON and not the torn last line is skipped and reported; `result.json` → `sessionErrors` lists them as `file:line: <reason>` | a session line that is not JSON in the middle of a file is listed in `sessionErrors`, and the result is written |

## Review round 3

PASS with four notes (`review.md` → Round 3). The two rounds of fixes are used, so none is fixed here; they wait for
Adrian's decision on a fix ticket before B.2 (`.night/questions.md`, Q-6): the second stop can fail while a job has
`state` but no `pid` yet (note 1); the code comment "(still setting up, or queued)" is wrong about queued jobs (note
2); a job spawned by a wake while `stopJobs` waits is not in its list (note 3, guessed); the second-stop test uses the
10-minute bound (note 4).

## Proof

Main session (the runs that count, protocol step 4), after the last change: `node adrian-rebuild/tools/gate.mjs` →
exit 0, tests 82, pass 82, fail 0 (73.5 s); `node --test adrian-rebuild/tools/test-same-task.mjs` → exit 0, tests 35,
pass 35; `node --test adrian-rebuild/tools/test-gate-time.mjs` → exit 0, tests 4, pass 4; `review-guard.mjs compare
--git` after each of the three implementer runs → within its limits. Review: PASS in round 3 (`review.md`).

Implementer, run from the repository root, after the last change:

- `node --test adrian-rebuild/tools/test-same-task.mjs` → exit 0; tests 35, suites 2, pass 35, fail 0 (10.4 s) (AC-1).
- `node --test adrian-rebuild/tools/test-gate-time.mjs` → exit 0; tests 4, pass 4, fail 0 (AC-2).
- `node adrian-rebuild/tools/gate.mjs` → exit 0; tests 82, pass 82, fail 0, cancelled 0 (88.9 s; Biome "Checked 164
  files", 157 before plus the 7 new files) (AC-3).
- `node adrian-rebuild/tools/check.mjs` → exit 0: "PL summaries: 68 files; ticket folders: 4; changes: 2 entries; 0
  errors" (AC-4).
- `npx biome check --error-on-warnings adrian-rebuild` → exit 0, "Checked 26 files" (AC-4).
- AC-5: `git status --porcelain --untracked-files=all` shows the main session's files (` M adrian-rebuild/plan.md`,
  `?? adrian-rebuild/R-011-same-task-runner/ticket.md`, `review.md`), this `outcome.md`, and `??` for the seven new
  files of `## Change`. Nothing is outside `adrian-rebuild/`, and the index is unchanged.
- AC-6: the new files are untracked, so the scan needs `--untracked` until they are committed: `git grep -n
  --untracked -l -e '"prompt"' -e '"abort"' -e 'agent_end' -e '--mode' -- adrian-rebuild/tools` →
  `fake-pi-rpc.mjs`, `pi-rpc.mjs`, `test-same-task.mjs`. The same command without `--untracked` prints nothing today,
  because no tracked tool matches.
- AC-8: `run` has no flag for the hidden tests. Only `evaluateOnce` reads `--tests`. `observe` keeps the last reply
  text only for the owner turn's record. `ownerTurn` reads the state of runs, the job directories and `git rev-parse
  refs/heads/main`.

## Fails before

`fails-before.mjs` reads only `test/`, so each new test file was run before its tool existed (AC-7):

- `node --test adrian-rebuild/tools/test-same-task.mjs`, with `fake-pi-rpc.mjs` and the test written and no
  `same-task.mjs` → exit 1:
  ```
  Error [ERR_MODULE_NOT_FOUND]: Cannot find module '/home/…/adrian-rebuild/tools/same-task.mjs' imported from
  /home/…/adrian-rebuild/tools/test-same-task.mjs
  ✖ adrian-rebuild/tools/test-same-task.mjs
  ℹ tests 1  ℹ pass 0  ℹ fail 1
  ```
- `node --test adrian-rebuild/tools/test-gate-time.mjs`, with no `gate-time.mjs` → exit 1, all 3 tests fail:
  ```
  ✖ a gate that exits 0: the file holds the SHA, the counts and a time, and the tool exits 0
    Error: ENOENT: no such file or directory, open '/tmp/gate-time-zEckhk/out-0/gate-time.md'
  ✖ a gate that exits 1: the file records exit code 1, and the tool exits 1
  ✖ the file opens with a Polish summary block
  ℹ tests 3  ℹ pass 0  ℹ fail 3
  ```

Review round 1: the extended test file, run against the code of round 0 (only the fake had its three new scenario
options), failed in exactly the nine new tests: `node --test adrian-rebuild/tools/test-same-task.mjs` → exit 1, tests
32, pass 23, fail 9. The second command, `node --test --test-name-pattern="inside the attempt's own|M-05|second
response" adrian-rebuild/tools/test-same-task.mjs`, gave the output that the first one cut off. Each failure:

```
✖ an --out whose parent directory does not exist is refused with exit 1 and creates no directory
  same-task: finished, 1 touchpoints; wrote /tmp/same-task-UnWAZv/attempt-2/missing/out/result.json   0 !== 1
✖ a quota-limit text in a text part of an error turn makes the attempt void-limit
  + 'finished'  - 'void-limit'
✖ the reference SHA inside the attempt's own --out path does not contaminate it
  + 'void-contaminated'  - 'finished'
✖ a bash call that runs sleep counts once, also inside a while … do loop, and echo sleep does not    1 !== 2
✖ a bash call that runs limen status counts once, also inside a for … do loop, and git status does not    1 !== 2
✖ a second response to one prompt ends with exit 4 and the named protocol error
  "same-task: failed: TypeError: Cannot read properties of undefined (reading 'kind')
      at answered (…/same-task.mjs:206:12)" does not match /Pi answered a prompt that was not sent/
✖ on exit 4 the runner runs limen stop in the clone for every running job
  + []  - [ { argv: [ 'stop', 'w1', 'same-task runner failure' ], cwd: '/tmp/…/attempt-15/out/clone' } ]
✖ on exit 4 a limen stop that fails is named
  'same-task: failed: Pi sent no response to a prompt within 0.3 s; …; jobs still running: w1 (…)'
  does not match /limen stop w1 failed \(exit 1\): fake limen: cannot stop/
✖ an exception that is not a git, file-system or protocol failure exits 5 with its stack
  same-task: failed: SyntaxError: Expected property name or '}' in JSON at position 2 …   4 !== 5
```

The third M-05 test (the `Done` line and the reply count) passed before and after: it only moved out of the old
combined test.

Review round 2: the new tests, run against the code of round 1 (only the fakes had their new options: the fake Pi's
`garbage` step and the fake `bin/limen`'s `lateState`):

- `node --test adrian-rebuild/tools/test-gate-time.mjs` → exit 1, tests 4, pass 3, fail 1:
  ```
  ✖ a failed write of the file exits 4 with its reason, apart from a failing gate
    Error: EEXIST: file already exists, mkdir '/tmp/gate-time-sSgEri/a-file'
        at mkdirSync (node:fs:1760:26)
        at writeAtomic (…/adrian-rebuild/tools/atomic-write.mjs:12:2)
        at …/adrian-rebuild/tools/gate-time.mjs:108:1
    1 !== 4
  ```
- `node --test --test-name-pattern="gets its state|never gets a state|not JSON in the middle"
  adrian-rebuild/tools/test-same-task.mjs` → exit 1, tests 3, pass 0, fail 3:
  ```
  ✖ a job that gets its state after a limen stop failed on its missing state is stopped by a second stop
    actual: [ [ 'stop', 'w1', 'same-task time limit' ] ]
    expected: [ [ 'stop', 'w1', 'same-task time limit' ], [ 'stop', 'w1', 'same-task time limit' ] ]
  ✖ a job that never gets a state is named with the limen stop command to run once the wait bound passes
    'same-task: limen stop w1 failed (exit 1): fake limen: cannot stop\n' +
    'same-task: timeout, 0 touchpoints; wrote /tmp/same-task-hIVVjB/attempt-2/out/result.json'
    does not match /job w1 still has no state after 0\.3 s/
  ✖ a session line that is not JSON in the middle of a file is listed in sessionErrors, and the result is written
    same-task: internal error: Error: /tmp/same-task-hIVVjB/attempt-3/out/session/fake.jsonl:2: not a JSON session
    entry (Unexpected token 'o', "not a JSON line" is not valid JSON)
        at messages (…/adrian-rebuild/tools/same-task-session.mjs:44:10)
    5 !== 0
  ```

In round 0, each mutation below was made in `same-task.mjs`, run with the test and then reverted:

| Mutation | Failing tests |
|---|---|
| no `gc --prune=now` in the clone | the clean clone (the reference commit is still there) |
| a refused reply counts as an owner turn | the wake while the runner is about to reply (2 prompts, not 3) |
| a running job does not hold back an owner turn | the time limit (`finished`, not `timeout`). In the first version the flow test passed, because its wakes came within the settle time. Its wakes now come at 3 × the settle time, and 5 of its 6 tests fail |

## Deviations from the ticket

1. Settle after a job ends. Item 3.5 measures the settle time from `agent_end`. The runner also restarts it at every
   poll that sees a running job. So after the last job ends, a wake has the settle time to arrive before the runner
   replies. Without this, the owner turn falls between the job's state flip and its wake, and the reply is a touchpoint
   too many.
2. Both voids at once: `void-contaminated` wins over `void-limit`, because a rerun must first remove the leak. The
   evidence of both is in `voidEvidence` (session, tool, what it names; session, error text).
3. The name checks of item 3.7 remove every occurrence of the `--out` path (and its real path) from the arguments
   first. Without this, an `--out` whose path starts with the project path, or holds the SHA's first 7 characters,
   would void every attempt through the clone's own absolute paths. The project-path check also looks for the
   project's real path.
4. M-05 counts:
   - A footer line counts when it starts with `Done`, `In progress` or `Waiting for you`, also after Markdown list,
     quote, heading or emphasis marks (`- `, `> `, `#`, `**`). A model often writes `**Done:**`, and a bare line
     start would miss it.
   - `sleep` and `status` reads are counted per bash call. The counted command word may follow a separator, shell
     reserved words (`do`, `then`, `else`, `{`, `!`, `(`), assignments and wrappers (`timeout 60`, `env`, `nohup`).
     For `status`, `node <path>/limen status` and `limen jobs` count too.
5. More refusals (exit 1), each with the reason: `evaluate` when `<out>/eval` exists, or when `--tests` does not
   exist; `evaluate` and `report` when `<out>` has no `result.json`; `run` when `--out`'s parent does not exist. A
   `run` refused after the clone (the reference is in reach) removes the `<out>` it created, the only directory it
   created, so the refusal leaves no trace (T-38).
6. Stricter protocol, exit 4, in two cases: Pi refuses the owner message; or Pi refuses a reply and no run starts
   within the settle time. Without the second rule, a refusal for another reason would repeat quietly until the time
   limit. With it, a difference from the declared subset fails at B.2's seat check instead of skewing the counts.
7. On a failure of the conversation (exit 4 or 5), every running job is stopped with the reason `same-task runner
   failure`, not the time limit's reason, and no `result.json` is written.
8. A `limen stop` that fails, at the time limit or after a failure, is named on stderr with its exit code and stderr.
   At the time limit it is also recorded in `stops` of `result.json`, and the attempt is still written (exit 0).
   `stops` holds one entry per call, so a job stopped a second time once it had a `state` has two entries. A job never
   stopped has a last entry with `next`. A job whose first stop failed although it had a `state` is not retried: the
   round-2 decision covers only the missing `state`.
9. `result.json` has more fields than item 3.8 lists: `end` (how the loop ended before the void check),
   `voidEvidence`, `ownerMessage`, `main`, `replies` (the coordinator's reply texts, for the T-13 and T-14 reader) and
   `stops`.
10. Pi's stderr goes to the runner's stderr. The stdout and stderr of `evaluate`'s commands go to stderr, so stdout
    holds only the tools' result lines.
11. `gate-time.mjs`: a usage error exits 2. Without `--gate`, the file names the gate as `node
    adrian-rebuild/tools/gate.mjs`. A failed write of the file comes after the gate has run, so the message also gives
    the gate's exit code.
12. More tests than item 5 lists, each for one mechanism: Pi's start (flags, cwd, environment) and the owner message
    with the fixed replies; a job directory with no `state` counts as running; and the tests of review rounds 1 and 2.
13. Review finding 3, rejected by the main session (`review.md`), so the clock stays as it is: the injected `now`
    drives only the runner's deadline and settle time. `pi-rpc.mjs` uses `Date.now()` and `setTimeout`, so the tests
    wait in real time, in timers of tens of milliseconds; the whole file runs in about 10 s. No test waits for a real
    limit (3 hours, 10 s, 60 s, 10 minutes); those are the CLI's values only.

## Measurement

- unmeasured, M-05: same-task pass^k and its per-run counts come from the attempts on the seat (B.2 on
  `rebuild-base`, then 4.8 and 9.1). Here they are checked only on the fake.
- unmeasured, M-05 (precondition): whether the declared RPC subset matches Pi 1.5.1, and whether a headless
  coordinator at `rebuild-base` loads Limen's hooks and receives a wake. Both are B.2's seat check (D-021).
- M-10: the main session runs `gate-time.mjs` at the close of the stage. I did not run it (it is the main session's
  command, `## Commands`). The gate runs of this ticket took 74.5 s, 73.2 s, 80.9 s and 88.9 s (baseline 79–88 s).

## Open points

- For Adrian (review round 2, note 1, left as it is): a question the coordinator asks while a job still runs is never
  an owner turn. It gets no fixed reply and is not counted as a touchpoint. The runner reads no reply text (AC-8), so
  it cannot tell such a question from "waiting for the job". If the coordinator then stays idle after the job ends, the
  next owner turn answers it, and that reply is counted. If the wake moves the coordinator on, the question is lost from
  `touchpoints`. The text stays in `result.json` → `replies` for the reader. Your choice is whether `touchpoints`
  stays a count of fixed replies (today, D-021 (1) as implemented), or whether a later ticket adds a count of
  questions read from the reply texts (a change of AC-8).
- guessed (from memory of Pi's public documentation, not checked against 1.5.1): Pi may answer `prompt` with
  `success: true` at once and report "a run is active" as a later second response, or it may need a
  `streamingBehavior` field. Pi may also send `extension_ui_request` objects, which wait for an answer, when an
  extension asks for a confirmation without a UI. The runner treats a second response as a protocol error (exit 4,
  now with the named error). It passes other objects on without reading them, so a waiting UI request would hold the
  coordinator until the time limit. B.2's seat check would show both.
- Command strings for `.claude/settings.local.json` (Adrian, `## Commands`): `node adrian-rebuild/tools/gate-time.mjs
  --out <file>` for the main session. The two tests already match `node --test <test file>`. `same-task.mjs` runs only
  on the seat, by Adrian.
- AC-6 as written (`git grep` without `--untracked`) can see the new files only once they are committed.
