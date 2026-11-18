<!-- PL: Wynik ticketu R-005: wycięte zadania hosted (`--tab`), czyli nadzorca hosted, dowód
własności panelu, niepewność własności, hook `hosted.ts` i wszystkie gałęzie hosted w uruchamianiu, zatrzymywaniu,
odzyskiwaniu i czytnikach stanu. Moduł GitHub i grupy uruchamiają zadania detached z limitami i kartą logu, `--tab`
na `spawn`, `continue` i `group start` odmawia jednym wierszem z nowej tabeli `OLD_FLAGS`, a jedyna notatka
uruchomionego zadania nazywa się `advisory`. Plik podaje dowody (bramka, testy padające przed zmianą, usunięte
testy), odstępstwa i punkty otwarte. Recenzja rundy 1: FAIL; cztery poprawki (zdanie w docs/remote.md, zdanie o
trybie w templates/agents.md, przypadek u14 bez notatki, SHA w nagłówku u10) naniesione, bramka 102/102. Recenzja
rundy 2: PASS. Stan: zamknięty (18.11). -->

# Outcome: R-005 Cut hosted `--tab` jobs; the GitHub module and groups run detached

## Review round 1 fixes

`review.md` → round 1 and `ticket.md` → `## Decisions` (the last entry):

1. `docs/remote.md:167`: "No detached fallback, automatic approval, or merge." is "No automatic job, approval, or
   merge."
2. `templates/agents.md:84`: "The name does not pick the spawn mode." went. The first line of
   `templates/.history/agents.md` holds the new SHA-256 (`dac1ddbc…`, 2026-11-18) in place of this ticket's earlier
   `0399cc4d…`, which no commit carried; changed with Edit (D-016). `templates/agents.md` is now 43,268 bytes.
3. `test/u14-task-note.test.ts`: a new test, "a job that ends without a note gets a check that tells it to rebuild
   the note from its task", loads `hook/finish.ts` for a job with no `note.md`, sends `agent_before_settle` and asserts
   the whole first line `[limen] No note exists in <job>/note.md. Read <job>/task.md and reconstruct the end checks
   and the easy-to-miss rule. Do not assume they are proven.` and the detached ending (no "Then call finish again").
   It passes at `HEAD` too, because the text is unchanged. Proof that it fails when the text is absent: in a scratch
   copy of `HEAD` (outside the repository) with this test file and `hook/finish.ts` laid over it and "No note exists
   in" changed to "No note in" in `src/job/task-note.ts`, `node --test <copy>/test/u14-task-note.test.ts` → exit 1,
   1 of 2 fails (this test, on the first-line `assert.equal`).
4. `test/u10-git-status.test.ts`: the header comment no longer holds `43c01cf`; a `// regression: 43c01cf` line stands
   above the test (T-29 (4), T-30 (3)).

Runs after the fixes, from the repository root:
- `npx biome check --error-on-warnings test/u14-task-note.test.ts test/u10-git-status.test.ts` → exit 0;
  `node --test test/u14-task-note.test.ts test/u10-git-status.test.ts` → exit 0, 3 of 3.
- `node adrian-rebuild/tools/gate.mjs` → exit 0; tests 102, pass 102, fail 0, cancelled 0, skipped 0 (62.5 s). One run.
- `node adrian-rebuild/tools/check.mjs` → exit 0, 0 errors. `npx biome check --error-on-warnings adrian-rebuild` →
  exit 0.
- `git grep -i -E 'detached fallback|spawn mode' -- docs templates src README.md` → no match.

Finding 4 (S10 under `/tmp`) was rejected with its reason in `review.md`; nothing changed for it.

## Done

- Item 1: `git rm` of `src/runtime/supervisor.ts`, `src/runtime/hosted-binding.ts`, `src/runtime/hosted-uncertainty.ts`
  and `hook/hosted.ts`; `git mv test/s2-hosted.test.ts test/s2-herdr.test.ts`.
- Item 2, `src/integrations/herdr.ts`: `HostedAgentStatus`, `openHostedTab`, `startHostedPi` and every hosted helper
  of `:181-473` (`errorCode` stays: `closeJobTab` uses it), and `agentTarget` are gone, with the `engine.ts` import
  that only they used. `createTab` has no `env` option and passes no `--env`. `HerdrPlace["mode"]` is
  `"watch" | "log" | "diff"`; `readPlace` reads any other mode, an old record's `hosted` included, as no place, so
  `limen open` of such a job opens a log view. `openJobPlace` no longer reads `hosted`: a running job gets a watch
  tab, a finished one a log tab.
- Item 3, launch and lifecycle:
  - `src/commands/spawn.ts`: `chooseHostedLaunch`, `SpawnOptions.tab`/`.detached`, `SpawnLaunch.hosted`, the hosted
    branch of `launchSpawnedJob`, `startHostedJob`, `startHosted` and the `agentName` field are gone; every spawn,
    a group member's too, goes through `startDetachedJob`, unchanged. `waitForHandshake` lost its `owner` parameter,
    which only `startHosted` set; its two messages keep the text the default gave ("detached wrapper …").
  - `src/commands/continue.ts`: `chooseHostedContinue`, `ContinueOptions.tab`/`.detached`,
    `ContinuationRecord.hosted` and `.id` (its only reader was the `agentName` line), the hosted parameter and branch
    of `launchContinuation`, the `agentName`/`continueTask` fields and `startHostedContinuation` are gone; every
    continuation, of an old hosted job too, is detached.
  - `src/runtime/recovery.ts` keeps only `claimRecovery`. `src/runtime/reap.ts` lost the `herdr/agent` liveness, the
    hosted recovery and `writeHostedResult`; a dead owner is finalized `failed: process group gone` as before.
  - `src/runtime/wrapper.ts`: `launchHostedSupervisor` and `LIMEN_HOSTED` (with its comment) in the stripped list are
    gone; the wrapper no longer passes `jsonMode`. `src/main.ts`: the `LIMEN_INTERNAL_HOSTED` dispatch and its
    `failInternalJob` condition are gone. `src/commands/rule.ts` no longer unsets `LIMEN_INTERNAL_HOSTED`.
  - `src/commands/stop.ts`: the hosted branch and `stopHosted` are gone, with the `herdr.ts` import and
    `processGroupAlive`.
  - `src/runtime/engine.ts`: `herdrKind`, `EngineArgv.jsonMode` and `herdrStateExtensions` are gone; `argvFor` always
    starts with `--mode json`, as the wrapper's argv did. `test/u5-engine-stream.test.ts` dropped `jsonMode`.
  - `src/job/job.ts` lost `hostedAgentName`; `src/job/group-cabinet.ts` lost `ownsLiveChildren`, the `herdr/agent`
    check of `memberLive`, the three hosted names of `JOB_ENVIRONMENT` and `GroupRun.mode`; `src/job/publication.ts`
    lost `hostedNote`, `agentName`, `continueTask` and the `hosted`, `agent-name` and `continue` files, and its comment
    says "A job exports its id"; `src/job/record.ts` no longer removes `ownership-uncertainty`; `hook/finish.ts` no
    longer writes `session-ended` or skips the settle check on `LIMEN_HOSTED`, and its doc speaks of one kind of job.
- Item 4, readers: `src/commands/jobs.ts` lost the `hosted` field, the hosted log summary (`activitySummary`), the
  uncertainty warning, the `agent` evidence and `agentStatus` in the text and in the record; its advisory line reads
  `fields.advisory`, which was the whole warning of a detached job. `src/job/view.ts` lost `hosted`, `agentStatus`
  and `noteKind`; a running row shows `advisory` in yellow (the colour `ownership` had). `src/commands/status.ts` no
  longer reads `herdr/agent`; the set it fills is `workerTabs` (tabs only), and the coordinator filter lost the
  `pane_id` test that only a hosted agent's pane could meet; a running line ends `advisory: <note>`.
  `src/commands/sweep.ts` lost the uncertainty event; the advisory event's headline is ` · advisory`.
  `hook/wake.ts` lost every `_uncertainty` path; the advisory wake is sent only for a non-empty `advisory` file, as at
  `HEAD`, its toast reads `limen: <label> · advisory (<id>)` and its Herdr notification title
  `limen: <label> · advisory` (at `HEAD`: `is idle` for the detached note). `src/picture/activity.ts` lost the
  `hosted` field of `JobFiles` and `LiveJob` and the `tool-detail` read; `commandDetail` reads the log only.
  `src/job/wake-delivery.ts`: `receiptFamily` returns `"_advisory" | "_start" | "_completion"`; a slot that starts
  with `_uncertainty.` belongs to the `_advisory` family, so an old receipt is never a completion.
- Item 5, the GitHub module: `startGithubJob` spawns without `--tab`; the error reads "spawn returned without a
  matching job record"; the comment and the coordinator prompt say "job" and "task", and "Do not start detached"
  became "Do not start a job with limen spawn, and do not approve, merge or push". `matchedGithubJob` reads no
  `hosted` and no `herdr/agent` and returns no `started`: the marker plus a review or work shape matches, any other
  shape still throws `conflicting job`. `src/integrations/github-poller.ts` lost the "never started" notice; the start
  reply follows the first match, then the terminal reply when the job already ended. Texts: "no job has been observed
  … no job was started", "Limen started a review|task for …", "Limen review|task job … ended", "No job was started"
  (twice), "poller and workers must have different Unix users". `github review` and `github work` gained no flag.
- Item 6, groups: `src/commands/group.ts` lost `BOTH_MODES`, the `mode` option, the `tab` mode check and the `mode`
  write; team coordinators get no mode flag; the three refusals say "a limen job" and "a job". A repeated
  `--detached` now gets the generic `INVALID_START` (Deviations 2). `src/commands/group-rounds.ts` continues a member
  with no mode flag. `GroupRun.mode` is gone from the type; `readRun` still parses any `run.json` (it never checked
  the field).
- Item 7, the flag: `src/old-names.ts` has `OLD_FLAGS` (`OldFlag` = `OldName` + `command`), `removedFlag(command,
  flag)` and `refuseRemovedFlags(command, values)` (Deviations 1). `spawn`, `continue` and `group start` keep `tab`
  in their parse tables and call `refuseRemovedFlags` right after parsing; a repeated `--tab` gets the same line
  through `removedFlag` in the `repeated` rule. `--label --tab` still labels the job `--tab`. `--detached` stays in
  the three tables and changes nothing; a comment there and the help and docs say so.
- Item 8, help, docs and templates: `src/main.ts` help (`[--detached]` on `group start` and `continue`, the `--tab`
  line gone, the `--detached` line says it changes nothing, `continue` is "detached, also in Herdr", `github
  review|work` are "a review|task job"), `README.md` (the finish check, and Herdr gives each job a log tab),
  `CONTRIBUTING.md`, `docs/commands.md` (a **Detached.** paragraph), `docs/groups.md`, `docs/herdr-status.md` (role
  spaces, the hosted pane paragraph, the two highlight lines, agent names, the coordinator follow time,
  "supervisor" → "wrapper", the blocked advisory), `docs/jobs.md` (the Limits table has one column, the stalled-tool
  paragraph, the ownership and platform paragraphs and the three "How it works" bullets gone, **Job notes** describes
  `advisory`, the seat notification example is `· advisory`), `docs/remote.md` (the GitHub job is an ordinary
  detached job with the limits and the queue), `docs/setup.md`, `docs/seat/README.md:23`, `templates/agents.md`
  (one mode paragraph instead of the two-mode table, the label rule without agent names, no "Hosted weaker
  guarantees", the GitHub paragraph, the first-map spawn without `--tab`, the steer and dead-wrapper bullets),
  `templates/worker.md`, `templates/reviewer.md:5` and `templates/communication.md:53-56`. Where a text sent a person
  into a worker's pane, it names `limen steer` and `limen continue`. `templates/.history/{agents,worker,reviewer,
  communication}.md` each got the new SHA-256 as a new first line with the date 2026-11-18, written with Edit
  (D-016).
- Item 9, tests: `## Tests removed with the cut` and `## Fails before`.

## Proof

Implementer's runs, from the repository root:

- `node adrian-rebuild/tools/gate.mjs` before the change (HEAD `3666127` plus the main session's `plan.md` edit) →
  exit 0; tests 96, pass 96, fail 0, cancelled 0, skipped 0 (65.9 s).
- After the change, one run → exit 0; tests 101, pass 101, fail 0, cancelled 0, skipped 0 (60.7 s).
- `npx tsc --noEmit` → exit 0. `npx biome check --error-on-warnings .` → exit 0 (160 files).
- `node adrian-rebuild/tools/check.mjs` → exit 0, 0 errors. `npx biome check --error-on-warnings adrian-rebuild` →
  exit 0.
- `node adrian-rebuild/tools/fails-before.mjs` (all new and changed test files) → exit 0: "test/cli/old-names.test.ts,
  test/cli/status.test.ts, test/group-extensions.test.ts, test/s1-spawn.test.ts, test/s10-doorbell.test.ts,
  test/s2-herdr.test.ts, test/u10-git-status.test.ts, test/u11-live-activity.test.ts, test/u14-task-note.test.ts,
  test/u5-engine-stream.test.ts, test/cli/old-hosted.test.ts fail at HEAD (exit 1)". Per file: `## Fails before`.
- AC-1: `git ls-files -- src/runtime/supervisor.ts src/runtime/hosted-binding.ts src/runtime/hosted-uncertainty.ts
  hook/hosted.ts test/s2-hosted.test.ts | grep -q .` → exit 1.
- AC-2: the ticket's `git grep -q -i -E 'hosted|--tab\b|…|noteKind' -- src hook bin templates test docs README.md
  CONTRIBUTING.md SECURITY.md package.json` with its five exclusions → exit 1 (also over the working tree before
  `git add`).
- AC-3: `git grep -q -E 'readHostedUncertainty|…|session-ended' -- src hook test bin` → exit 1 (also with
  `--untracked`).
- AC-4, AC-5: `node --test test/cli/old-names.test.ts test/cli/old-hosted.test.ts` → exit 0; 8 of 8 and 4 of 4
  pass (plain shell; also with the gate's private `TMPDIR` and its git shim on `PATH`).
- AC-6: `node --test test/s10-doorbell.test.ts`, run with the gate's private `TMPDIR` and its git shim on `PATH` →
  exit 0, 1 of 1. With the shell's default `TMPDIR` (`/tmp`, mode 1777) S10 cannot pass at any commit: the poller
  refuses its state directory below a world-writable directory (`privatePath`, `src/integrations/github-poller.ts`).
- All three files also pass inside the gate run.
- The other changed files, run the same way: `test/cli/status.test.ts` 6 of 6, `test/group-extensions.test.ts` 4 of
  4, `test/s2-herdr.test.ts` 2 of 2, `test/s1-spawn.test.ts` 3 of 3, `test/u5-engine-stream.test.ts` 3 of 3,
  `test/u10-git-status.test.ts` 1 of 1, `test/u11-live-activity.test.ts` 5 of 5, `test/u14-task-note.test.ts` 2 of 2.

## Fails before

The new and changed tests were written before any source change. Each new test file was run alone at `HEAD` with
`node adrian-rebuild/tools/fails-before.mjs <file>`; each → exit 0 (fails at `HEAD`). Shortened: stack frames, the
plant's temporary paths and the log lines of the job are left out.

`test/cli/old-names.test.ts` (2 of 8 fail; the five old tests and "spawn --label --tab …" pass):

```
✖ spawn, continue and group start refuse --tab with one removal line and leave no job, worktree, branch or group
    [ 'spawn', true,
  +     'hosted spawn requires Herdr (HERDR_ENV=1); use --detached for an ordinary job\n'
  -     'limen spawn --tab was removed with hosted jobs (R-005); jobs run detached with a Herdr log tab; correct one with limen steer\n' ],
    [ 'continue', true,
  +     'continue requires <id|suffix|label> "follow-up instruction"\n'
  -     'limen continue --tab was removed with hosted jobs (R-005); … limen steer\n' ],
    [ 'group start', true,
  +     'group start requires the interactive Herdr coordinator pane (LIMEN_COORDINATOR=1) … a hosted limen job never registers as lead\n'
  -     'limen group start --tab was removed with hosted jobs (R-005); … limen steer\n' ]
✖ every old flag has a feature, a ticket and a pointer, and --detached is not an old flag
  TypeError [Error]: OLD_FLAGS is not iterable
```

`test/cli/old-hosted.test.ts` (2 of 4 fail):

```
✖ limen status and limen jobs <id> show an old terminal hosted job as they show it without its hosted files
  AssertionError [ERR_ASSERTION]: Expected values to be strictly deep-equal:
          '  model requested openai-codex/gpt-6-astra:high; no turn yet\n' +
  +       '  hosted (weaker guarantees)\n' +
          '  versions:\n' +
✖ matchedGithubJob matches a GitHub job without a hosted file and an old hosted one, and refuses another shape
  Error: conflicting job work for GitHub doorbell: acme/widget#104; inspect it before retrying
```

`test/cli/status.test.ts` (1 of 6 fails; the five leftover tests pass):

```
✖ limen status names a running job's note by its file, advisory
  AssertionError [ERR_ASSERTION]:   noted (2026-11-18-noted-6091aeee) · 0m · think · ownership: tool stall observation uncertain: CPU or process identity unavailable
```

`test/group-extensions.test.ts` (1 of 4 fails):

```
✖ a group started inside Herdr with no mode flag runs each team job detached, with a log tab
  AssertionError [ERR_ASSERTION]: 2026-11-18-f001-team-1-fixture-draft-102e9b28
  'hosted' !== 'watch'
```

`test/s10-doorbell.test.ts`: under `fails-before.mjs` it fails at `HEAD` with `1 !== 0` at the first `limen github
poll`, which says nothing of this change: the tool unpacks `HEAD` below the system temp directory, and the poller
refuses its own code below a group- or world-writable directory (as in R-004's Open points 3). So the new S10 was also
run against the unchanged source in the working tree (only test files changed at that point), with the gate's
private `TMPDIR` and git shim on `PATH`: `node --test test/s10-doorbell.test.ts` → exit 1:

```
✖ S10: only an authorized request rings the doorbell, the App replies once each way and never approves
  AssertionError [ERR_ASSERTION]: the log tab of a detached job
  'hosted' !== 'watch'
```

Passing at `HEAD` by design, each a guard rather than a proof of the change:
- in `test/cli/old-hosted.test.ts`, "an old hosted job's _uncertainty receipt is no completion …" (at `HEAD` the
  `_uncertainty` family exists, so the receipt is no completion either; the test guards the Risk that removing the
  family turns it into one) and "limen group status reads a run.json that a group start with --tab wrote" (`mode:
  "tab"` was a valid value at `HEAD`);
- in `test/cli/old-names.test.ts`, "spawn --label --tab reads --tab as the label and starts the job" (it guards that
  the refusal comes after parsing, not from a scan of the arguments).

Changed files that pass at `HEAD` alone: `node adrian-rebuild/tools/fails-before.mjs test/s2-herdr.test.ts
test/s1-spawn.test.ts test/u5-engine-stream.test.ts test/u10-git-status.test.ts test/u11-live-activity.test.ts
test/u14-task-note.test.ts` → exit 1, "pass at HEAD", 16 of 16 (rerun by the main session after the round-1 fixes). Each only loses hosted cases, fixtures or names:
`s2-herdr` (two hosted tests and the hosted fake Herdr verbs gone, one message), `s1-spawn` (the `LIMEN_HOSTED` case
gone), `u5-engine-stream` (`jsonMode` gone from the slots; at `HEAD` the missing field reads as false and adds nothing
the assertion reads), `u10-git-status` (the `noteHostedIdle` test gone), `u11-live-activity` (the hosted folder gone,
test renamed), `u14-task-note` (the `LIMEN_HOSTED=1` half gone; its new detached no-note case guards a text that is unchanged at `HEAD`).

## Tests removed with the cut

Before 96 tests, after 102: 4 removed, 10 added (the tenth in review round 1: "a job that ends without a note gets a
check that tells it to rebuild the note from its task", `test/u14-task-note.test.ts`).

Removed:
1. "limen highlight marks what Limen writes into Herdr; live panes and open tabs follow it on and off"
   (`test/s2-hosted.test.ts:175`; it spawned `--tab` and read the hosted pane's metadata; R-006 cuts `highlight`).
2. "hosted Pi stop records stopped once and closes the job's tab" (`test/s2-hosted.test.ts:205`).
3. "hosted Pi teams keep common and private selections through workers, reviews and continuation", the `hosted=true`
   run of the loop in `test/group-extensions.test.ts:90`.
4. "an idle group member closes after its turn in a tree that is no checkout (F1083); a lone job stays open"
   (`test/u10-git-status.test.ts:24`, `noteHostedIdle`).

With them went the fake Herdr's hosted verbs and state (`agent start/get/list/send-keys`, `pane process-info`,
`procs`, `agents`, `engineArgv`, `pane`, `state`, `saveState`, the `WAKE` hook path) in `test/s2-herdr.test.ts`, the
hosted fake Herdr, the `fixture(hosted)` parameter, `GROUP_FAKE_PI` and the `hook/hosted.ts` count in
`test/group-extensions.test.ts`, and the `noteHostedIdle` import in `test/u10-git-status.test.ts`.

Added:
- `test/cli/old-names.test.ts`: "spawn, continue and group start refuse --tab with one removal line and leave no job,
  worktree, branch or group"; "spawn --label --tab reads --tab as the label and starts the job"; "every old flag has
  a feature, a ticket and a pointer, and --detached is not an old flag".
- `test/cli/old-hosted.test.ts` (new): "limen status and limen jobs <id> show an old terminal hosted job as they show
  it without its hosted files"; "an old hosted job's _uncertainty receipt is no completion: its pending completion wake
  still reaches its session"; "matchedGithubJob matches a GitHub job without a hosted file and an old hosted one, and
  refuses another shape"; "limen group status reads a run.json that a group start with --tab wrote".
- `test/cli/status.test.ts`: "limen status names a running job's note by its file, advisory".
- `test/group-extensions.test.ts`: "a group started inside Herdr with no mode flag runs each team job detached, with a
  log tab".

Changed, not removed:
- `test/s2-herdr.test.ts` (renamed): the opening lines describe the Herdr scenarios; the flagless spawn test's message
  is "a log-tail tab"; the fake Herdr records tabs without `--env`.
- `test/group-extensions.test.ts`: the detached run is "Pi teams keep common and private selections through workers,
  reviews and continuation" (was "detached Pi teams …"); its fake Herdr opens log tabs only.
- `test/s10-doorbell.test.ts`: `github work` runs a detached job on the fake engine to `done` and the test asserts its
  `herdr/mode` is `watch`; the fake Herdr's worker verbs are gone; the forged record has no `hosted` or `herdr/agent`.
- `test/s1-spawn.test.ts`: the caller environment and the leak check lost `LIMEN_HOSTED`.
- `test/u11-live-activity.test.ts`: "the reader reads a job folder by its owner, its log and its session" (was "…
  detached and hosted job folders the same way") lost the hosted folder, its row and the `hosted` fixture field.
- `test/u14-task-note.test.ts`: the `LIMEN_HOSTED=1` half is gone; the check is sent once, so the count is 2 parts
  (was 3).
- `test/u10-git-status.test.ts` and `test/u5-engine-stream.test.ts`: see above.

## Deviations from the ticket

1. `src/old-names.ts` has one function more than item 7 names: `refuseRemovedFlags(command, values)`. AC-2 forbids
   `--tab` in `src` outside `src/old-names.ts`, so a command cannot write `removedFlag("spawn", "--tab")` or
   `flag === "--tab"`. Each command calls `refuseRemovedFlags` after parsing, and its `repeated` rule asks
   `removedFlag(command, flag)`; the next cut ticket that removes a flag adds a table entry and changes no command.
   The comment on `dashValues` in `spawn.ts` uses `--label --review` as its example.
2. `limen group start … --detached --detached` exited 1 with the old "choose either hosted tabs or detached jobs" line;
   it now exits 1 with `INVALID_START` ("invalid or repeated group start argument"), as every other repeated flag of
   `group start` does. That line named `--tab`, so it could not stay. `spawn` keeps accepting a repeated `--detached`.
3. `src/commands/status.ts`: beyond the `herdr/agent` read (`:168`, `:180`, `:245-246`), the coordinator filter lost
   `workers.has(agent.pane_id)` and the set is named `workerTabs`, because after the cut it holds only tab IDs and no
   pane ID can be in it.
4. `hook/wake.ts`: the Herdr notification of an advisory reads `limen: <label> · advisory`, not `limen: <label> is
   advisory`; the toast reads the same way. `notifyHerdr` names the headline in one line; the terminal titles are
   unchanged. The `noExcessiveCognitiveComplexity` suppression of `sendAdvisory` and of `reapDeadJobs` went because
   Biome reported both as unused after the cut (`suppressions/unused`, a warning that fails `--error-on-warnings`).
5. `CONTRIBUTING.md:24` lists the hooks as `wake`, `communication`, `steering`, `finish`, `group-peer`: removing
   `hosted` alone would have left a list that was already missing two of the five files in `hook/`.
6. `templates/agents.md:119` (coordinator agent names) lost "never `limen-fNNN-`, that is a worker": only hosted
   workers had such names (`hostedAgentName`). `templates/agents.md:163` (the first map) lost `--tab` and its fallback
   sentence, because AC-2 scans `templates/`; `templates/picture.md`, `docs/picture.md` and
   `src/project/picture-tick.ts:19` keep theirs (Out of scope, R-007).

## Measurement

- unmeasured, M-01: the role texts shrink: `templates/agents.md` 45,384 → 43,268 bytes, `templates/worker.md`
  7,075 → 6,374, `templates/reviewer.md` 3,320 → 3,244, `templates/communication.md` 15,504 → 15,485. M-01 is measured
  by the main session when it closes the stage.
- M-10 (gate run time): 60.7 s in the run above (65.9 s before the change); recorded at the close of the stage.
- unmeasured: seat steps 1.2 (a detached job opens its log tab in the real Herdr, and `limen spawn --tab` refuses with
  the reason) and 1.3 (one `@limen` mention runs as a detached job). No M-NN covers them; the fake Herdr of
  `test/s2-herdr.test.ts`, `test/group-extensions.test.ts` and `test/s10-doorbell.test.ts` cannot prove Herdr's API.

## Open points

1. For Adrian, before a0.1.0 is deployed (`plan.md` → `## Deployment` 1.0): `limen status` in both projects must list
   no running job. A hosted job still running at deployment would lose its supervisor's checks: the reaper would end it
   `failed: process group gone` once its supervisor dies, `limen stop` would signal only the supervisor's group, and
   Pi would stay in its Herdr pane. Gate 2 §1 counted 0 hosted jobs in both projects.
2. `src/job/wake-text.ts:153` still tells the coordinator, in an advisory wake, "or open the tab and exit if you mean
   the session to end", which assumed a hosted pane. The ticket keeps the advisory's wake text (Out of scope); a
   later ticket that rewrites the wake (A-008, stage 5) can drop it.
3. `src/project/picture-tick.ts:19` tells a coordinator to start the first map with `limen spawn --role picture --tab
   …`, which now refuses with the R-005 line; `docs/picture.md:63-77` and `templates/picture.md:5` describe the
   interactive first map. R-007 cuts them next, before any deployment.
4. Workers that a team coordinator spawns get no log tab (the wrapper drops `HERDR_*`); `docs/groups.md` now says so.
   Out of scope, unchanged from `group start --detached` at `HEAD`.
5. `picture/viewer/live.js:350` reads `j.hosted`, which the live data no longer has, so every job reads "not in a
   visible tab" (R-007).
6. T-27: `reconcile` (`src/integrations/github-poller.ts`), `runInternalJob`, `claimRecovery` and the S10 test keep
   their "split pending" suppressions; this ticket removes lines from them and splits nothing (the ratchet is R-082
   and R-083).
7. The refusal wording is the main session's, for Adrian to confirm at gate 5.1 (`ticket.md` → `## Decisions`).
