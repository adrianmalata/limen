<!-- PL: Ticket R-005 etapu 1 przebudowy: wycięcie zadań hosted (`limen spawn --tab`, agent w panelu Herdr bez limitu
czasu i wywołań narzędzi) zgodnie z decyzją bramki 2 G1.8 i A-023. Moduł GitHub i grupy uruchamiają zadania tylko
jako detached (z limitami czasu i narzędzi oraz kartą logu w Herdr), a `--tab` odmawia jednym wierszem z tabeli
starych nazw. Stan: zamknięty (18.11; recenzja PASS w rundzie 2). -->

# R-005 Cut hosted `--tab` jobs; the GitHub module and groups run detached

## Problem

Limen runs a job in one of two modes. A detached job is a supervised wrapper process with a wall-clock limit (90 min
by default), a tool-start cap (900) and stalled-tool containment; inside Herdr it also opens a read-only log tab. A
hosted job (`limen spawn --tab`, `limen continue --tab`, `limen group start --tab`) runs Pi interactively in a Herdr
pane, watched by the hosted supervisor, which logs "hosted supervisor started (no outer timeout or tool-call cap;
quiet-tool observation never signals processes)" (`src/runtime/supervisor.ts:128`), and which closes a clean idle
session as `done` (A-023). The GitHub module starts every review and task hosted (`src/commands/github.ts:404-427`)
and accepts only a job record with a `hosted` file (`src/integrations/github-review.ts:146`). A group started inside
Herdr without a mode flag is hosted too (`src/commands/spawn.ts:240`, `src/commands/continue.ts:183`), and its rounds
continue a member with `--tab` when the parent has a `hosted` file (`src/commands/group-rounds.ts:154`, `:163`).
Hosted jobs on the seat: 0 in both projects (gate 2 §1).

Relied on:
- G1.8 (gate 2): "Hosted `--tab` | cut; the doorbell moves to detached jobs, groups are detached only". G1.1 and G1.2:
  the GitHub doorbell and groups are kept, as modules.
- A-023, Decision: "fix (via G1.8) — Cut with hosted mode; the doorbell uses detached jobs with time and tool limits."
- A-014 (gate 2): one job at a time per project (`maxJobs` 1), so a GitHub job waits in the seat's start queue like
  any other job that is not a group member (`src/runtime/wrapper.ts:95-96`).
- `plan.md` → `## Stages`, stage 1: "Cut commands and flags refuse with a pointer (`--tab`, …)"; conventions: "a CLI
  change makes the old form exit with code 2 and name the new form in `next` (…; before R-013, a non-zero exit with
  the replacement in the message)"; "Tests removed together with a cut feature are named in the outcome; the gate
  condition is 'no new failure', not a fixed test count."
- T-18, Migration: "an old name exits with code 2 (T-02) and names the new one in `next`; a ticket in the last stage of
  the plan removes the table of old names" (R-085). R-003 → `ticket.md` → `## Decisions`: the refusals of removed
  names live in `src/old-names.ts` (`OLD_NAMES`, `OLD_ENGINES`), so R-085 removes one file. T-18 also: one word per
  thing, code identifiers included.
- `plan.md` → `## Tickets`, notes, R-005: "the GitHub module's review today reads the job's `hosted` file and gives up
  without it (`src/integrations/github-review.ts:146`); hosted jobs: 0 in both projects (gate 2 §1)".
- `plan.md` → `## Deployment`: 1.0 "Check by hand that no job runs (`limen status` in both projects)" before a0.1.0 is
  deployed; 1.2 "A detached job still opens its log tab in Herdr, and `limen spawn --tab` refuses with the reason
  (R-005)"; 1.3 "The GitHub module, only if it is connected: one `@limen` mention runs as a detached job (R-005)".
- R-004 → `ticket.md` → `## Decisions`: a test of a feature that the next ticket of stage 1 cuts goes with the
  earlier ticket, because no deployment happens between them (a0.1.0 is deployed at the close of stage 1).
- D-025: a criterion checks only the ticket's scope, as an exit code; a scan over the tree is this ticket's own only
  when every match it finds at the parent is one the ticket removes (checked at `HEAD` = `3666127` for AC-2: 50 files,
  each named in `## Change`; `src/project/picture-tick.ts` and `docs/picture.md` are excluded, see Out of scope).
- D-029: a test that fails even once without a change of the code it runs is a finding; nobody runs it again for a
  green gate.

## Change

Line numbers are at `3666127`. "Goes" means the code is deleted together with every import, helper, constant, type,
parameter, environment name and comment that only the removed code used.

1. Delete with `git rm`: `src/runtime/supervisor.ts` (the hosted supervisor), `src/runtime/hosted-binding.ts` (pane
   ownership proof), `src/runtime/hosted-uncertainty.ts` (ownership uncertainty), `hook/hosted.ts` (the Pi extension
   inside the hosted pane). Rename with `git mv`: `test/s2-hosted.test.ts` → `test/s2-herdr.test.ts`.
2. `src/integrations/herdr.ts`: the hosted functions go: `HostedAgentStatus` (`:16`), `openHostedTab` (`:73-102`),
   `startHostedPi` (`:104-179`), `assertHostedStartActive`, `restoreCoordinatorFocus`, `hostedAgentAlive`,
   `hostedTerminalReason`, `locateHostedAgent`, `SHELL_NAMES`/`waitForShell`, the status and fault caches,
   `hostedAgentStatus`, `noteHostedFault`, `hostedLaunchParent`, `hostedForegroundPid`, `stopHostedAgent`,
   `reportHostedStall`, `restoreHostedPane` (`:181-473`), `agentTarget` (`:869-882`); `createTab` loses its `env`
   option and `--env` arguments (`:708`, `:724`, `:734`); the place `mode` union and `readPlace` (`:14`, `:903`) drop
   `hosted`, and `readPlace` reads an unknown mode (an old record's `hosted`) as no place, so `limen open` opens a log
   view; `openJobPlace` (`:629`, `:638-640`) stops reading `hosted`. The detached log tab, the diff tab, the coordinator
   panes, the wake, the highlight and the seat notification keep their functions unchanged.
3. Launch and lifecycle:
   - `src/commands/spawn.ts`: `chooseHostedLaunch` (`:237-251`), the `tab` option and the `hosted` launch field, the
     hosted branch of `launchSpawnedJob` (`:436-439`), `startHostedJob` (`:442-461`) and `startHosted` (`:512-577`)
     go; `agentName` (`:419`) goes. Every spawn is detached (`startDetachedJob`, `:462-511`, unchanged), a group member
     too. `coordinatorTab` (`:176`, `:421`) stays.
   - `src/commands/continue.ts`: `chooseHostedContinue` (`:180-191`), the `tab` option, `ContinuationRecord.hosted`,
     the hosted plumbing and branch (`:202`, `:247`, `:268`, `:274`, `:285-288`), `agentName` and `continueTask`
     (`:455`) and `startHostedContinuation` (`:481-509`) go; every continuation is detached, including one of an old
     hosted job.
   - `src/runtime/recovery.ts`: `recoveryTarget`, `recoverHostedOwner` and `prepareRecoveredOwner` (`:59-129`) go;
     `claimRecovery` stays. `src/runtime/reap.ts`: the hosted liveness by `herdr/agent` (`:22-25`), the hosted
     recovery (`:109-121`) and `writeHostedResult` with the hosted reason (`:130-137`) go; "process group gone" stays.
   - `src/runtime/wrapper.ts`: `launchHostedSupervisor` (`:41-43`) and `LIMEN_HOSTED` in the stripped environment list
     (`:181-183`) go. `src/main.ts`: the `LIMEN_INTERNAL_HOSTED` dispatch (`:28`, `:160-163`, `:185`) goes;
     `src/commands/rule.ts:155` stops unsetting it.
   - `src/commands/stop.ts`: the hosted branch (`:27-31`) and `stopHosted` (`:73-95`) go.
   - `src/runtime/engine.ts`: `herdrKind`, `jsonMode` (always true once hosted goes) and `herdrStateExtensions`
     (`:13`, `:21`, `:37`, `:99-101`, `:121`, `:169-180`) go, and `test/u5-engine-stream.test.ts:16` drops `jsonMode`.
   - `src/job/job.ts:138-148` (`hostedAgentName`), `src/job/group-cabinet.ts` (`ownsLiveChildren` `:389-404`, the
     hosted check of `memberLive` `:375-378`, the hosted environment names `:307-309`), `src/job/publication.ts`
     (`hostedNote` `:57-62`, the `agentName`, `continueTask`, `hosted`, `agent-name` and `continue` files `:79`,
     `:86`, `:125-128`, `:147`, `:157-159`), `src/job/record.ts:58` (the `ownership-uncertainty` removal) and
     `hook/finish.ts` (the `LIMEN_HOSTED` skip `:79-81`, and the `session-ended` write `:71`, which only the hosted
     supervisor read).
4. Readers of job state: `src/commands/jobs.ts` (the `hosted` field, the hosted log tail, the uncertainty warning, the
   `agent` evidence and `agentStatus`, in text and JSON: `:18`, `:232`, `:242`, `:298-300`, `:323-379`, `:412`,
   `:471-476`, `:519-520`, `:608-614`), `src/commands/status.ts` (`herdr/agent` as `pane`, `:168`, `:180`,
   `:245-246`), `src/commands/sweep.ts` (the uncertainty event, `:9`, `:68`, `:78-87`), `src/job/view.ts` (`hosted`
   and `agentStatus`, `:23-24`, `:211-213`, `:263-265`), `hook/wake.ts` (the `_uncertainty` delivery: `:52-56`,
   `:557-568`, `:583-589`, `:607-616`, `:634-648`, `:722`, `:796`) and `src/picture/activity.ts` (the `hosted` field and
   the `tool-detail` read that only `hook/hosted.ts` wrote, `:25`, `:66`, `:114`, `:333-364`, `:390-401`; the data
   model stays by G1.4). `src/job/wake-delivery.ts:319-325`: the `_uncertainty` family goes from the type, but a slot
   that starts with `_uncertainty.` (an old job's receipt) is never read as a completion delivery.
   - `noteKind` (`src/job/view.ts:90-98`) goes: its kinds `blocked`, `errored` and `idle` named hosted stall notes,
     and `ownership` was the fallback that now labels every detached note. The one note of a running job is the
     detached `advisory` (`src/runtime/wrapper.ts:249-266`), so `limen status`, `limen jobs`, the sweep's headline and
     the wake name it `advisory` (the file's name, T-18), in yellow where a kind was painted.
5. GitHub module:
   - `src/commands/github.ts`: `startGithubJob` spawns without `--tab` (`:406`); the error at `:427` reads "spawn
     returned without a matching job record"; the comment at `:173` and the coordinator prompt (`:255`, `:262`,
     `:268`) say "job" for "hosted job" and "hosted task", and "Do not start detached" becomes an instruction not to
     start a job with `limen spawn`; `src/main.ts:146-147` likewise.
   - `src/integrations/github-review.ts`: `matchedGithubJob` stops reading `hosted` and `herdr/agent` (`:129-133`,
     `:146`, `:149`, `:154`) and drops `started`: a record that carries the claim's marker matches when its shape is a
     review or a work job, so a detached GitHub job and an old hosted one both match, and any other shape still throws
     "conflicting job".
   - `src/integrations/github-poller.ts`: the "never started" notice (`:326-338`) goes; the start reply follows the
     first match, and a job that ended before the poll gets the start reply and then the terminal reply with its
     evidence. The texts at `:315`, `:345`, `:365`, `:579`, `:607` and `:748` say "job" or "workers" for "hosted job",
     "hosted review/task" and "hosted workers", and "no detached fallback was started" and "No detached job was
     started" become "no job was started".
   - The GitHub job gets the detached defaults (90 min, 900 tool starts, stalled-tool containment) and the start queue;
     `github review` and `github work` gain no new flag.
6. Groups: `src/commands/group.ts` loses `--tab` and the `tab` and `auto` modes (`:52-92`, `:222-226`); the group run
   no longer writes `mode` to `run.json` (`:340`, `GroupRun.mode` in `src/job/group-cabinet.ts:47`), and a `run.json`
   written before that, with any `mode`, still reads; team coordinators are spawned with no mode flag (`:357`); the
   refusals at `:139`, `:188`, `:193` say "a limen job" for "a hosted limen job". `src/commands/group-rounds.ts:154`,
   `:163`: a round continues a member with no mode flag, whatever the parent's files hold.
7. The flag: `--tab` stays in the parse specs of `spawn`, `continue` and `group start` and is refused after parsing,
   before anything is written, so `--label --tab` still parses as a label (`src/commands/spawn.ts:656-659`).
   `src/old-names.ts` gets a third table, `OLD_FLAGS`, with `removedFlag(command, flag)` and the entries `spawn
   --tab`, `continue --tab` and `group start --tab`, each `{ feature: "hosted jobs", ticket: "R-005", instead: "jobs
   run detached with a Herdr log tab; correct one with limen steer" }`, giving the line `limen spawn --tab was
   removed with hosted jobs (R-005); jobs run detached with a Herdr log tab; correct one with limen steer`.
   `--detached` stays accepted on the three commands and changes nothing (Decisions); help and docs say so.
8. Help, docs and templates say nothing of hosted jobs and nothing the code does not do: `src/main.ts` (`:100`,
   `:109-115`, `:146-147`), `README.md:96`, `CONTRIBUTING.md` (`:21`, `:24`), `docs/commands.md`, `docs/groups.md`,
   `docs/herdr-status.md` (with its highlight lines that name the hosted pane), `docs/jobs.md` (the Limits table loses
   its Hosted column; the note kinds become `advisory`), `docs/remote.md`, `docs/setup.md`, `docs/seat/README.md:23`
   (Herdr's Pi integration serves the coordinator pane), `templates/agents.md`, `templates/worker.md`,
   `templates/reviewer.md:5` and `templates/communication.md:53-56`, with the first line of each changed
   `templates/.history/<name>` set to the new template's SHA-256, as `test/structure.test.ts:33-46` requires (written
   with Edit, D-016). Where a text sent a person into a worker's pane, it names `limen steer` and `limen continue`.
9. Tests:
   - Go with the cut: `test/s2-herdr.test.ts` (renamed) loses "hosted Pi stop records stopped once and closes the job's
     tab" (`:205`), the highlight test (`:175`, which runs a hosted pane; R-006 cuts `highlight` next) and the fake
     Herdr's hosted verbs (`agent start/get/list/send-keys`, `pane process-info`, `:45-60`, `:85-89`); "a flagless
     spawn in Herdr is detached" (`:118`) and the rule pings (`:134`) stay. `test/group-extensions.test.ts`: the
     `hosted=true` variant (`:90-91`) with its fixture parameter and fake Herdr (`:14-59`, `:82`).
     `test/u10-git-status.test.ts:24` (`noteHostedIdle`) with its import and header; `:12` stays.
     `test/u14-task-note.test.ts:55-63` (the `LIMEN_HOSTED=1` half of `:24`). `test/u11-live-activity.test.ts`: the
     hosted folder and row of `:85` (`:95`, `:102`) and the `hosted` fixture field (`:33`).
   - Changed: `test/s10-doorbell.test.ts`: `github work` runs a detached job on the fake engine to `done`; the fake
     Herdr's worker verbs (`:34`, `:50-55`) go; the forged record (`:172-179`) has no `hosted` or `herdr/agent`.
     `test/s1-spawn.test.ts:59-90`: the `LIMEN_HOSTED` case goes from the environment check.
   - New tests, written first and failing at `HEAD`:
     - `test/cli/old-names.test.ts`: `limen spawn --tab work`, `limen continue <id> --tab` and `limen group start
       <feature> --tab` each exit non-zero with the line of item 7 on stderr and leave no job folder, worktree, branch
       or group folder; `limen spawn --label --tab work` starts a job labelled `--tab`.
     - `test/cli/old-hosted.test.ts` (old records, the migration of item 9 under Migration): `limen status` and `limen
       jobs <id>` read an old terminal hosted job (`hosted`, `agent-name`, `herdr/agent`, `herdr/mode` = `hosted`,
       `engine-binding`, `ownership-uncertainty`, a `notify/delivered/_uncertainty.1._fallback` receipt) without an
       error, and a pending completion wake of that job is still delivered (the `_uncertainty` receipt is not a
       completion); `matchedGithubJob` returns a detached GitHub work job (no `hosted`) and an old hosted one; a group
       `run.json` with `"mode": "tab"` reads in `limen group status`.
     - A group started inside Herdr (`HERDR_ENV=1`) with no mode flag runs its team coordinator detached, with a log
       tab (`test/group-extensions.test.ts` or `test/s8-groups.test.ts`).
     - A running job with a detached `advisory` shows `advisory` in `limen status` (at `HEAD`: `ownership`).

## Out of scope

- `src/project/picture-tick.ts:19` and `docs/picture.md:63-77` (the first map started with `--tab`), `templates/picture.md`
  and `picture/viewer/live.js:350`: R-007 cuts the map jobs and the viewer next, before any deployment; AC-2 excludes
  the two scanned files.
- `--detached` as a flag: R-005 keeps it accepted; R-014 sets the CLI with Adrian.
- Workers spawned by a detached team coordinator open no log tab, because a detached job's environment drops
  `HERDR_*` (`src/runtime/wrapper.ts:187-192`): unchanged, as `group start --detached` behaves at `HEAD` (G1.8:
  "groups are detached only").
- `limen highlight` itself (R-006); typed refusals with code 2 and `next` (R-013); the `GroupRun` and job record
  schema (R-021).
- The detached advisory text "tool stall observation uncertain: …" and its wake text: only its kind label changes.

## Acceptance

- AC-1: `git ls-files -- src/runtime/supervisor.ts src/runtime/hosted-binding.ts src/runtime/hosted-uncertainty.ts
  hook/hosted.ts test/s2-hosted.test.ts | grep -q .` → exit 1.
- AC-2: `git grep -q -i -E 'hosted|--tab\b|LIMEN_AGENT_NAME|LIMEN_CONTINUE_FILE|LIMEN_STALL_RERING_MS|ownership-uncertainty|noteKind'
  -- src hook bin templates test docs README.md CONTRIBUTING.md SECURITY.md package.json ':!src/old-names.ts'
  ':!test/cli/old-names.test.ts' ':!test/cli/old-hosted.test.ts' ':!src/project/picture-tick.ts' ':!docs/picture.md'`
  → exit 1. At `HEAD` every file it matches is one this ticket changes or deletes (D-025).
- AC-3: `git grep -q -E 'readHostedUncertainty|HOSTED_UNCERTAINTY|hostedUncertaintyText|startHostedPi|openHostedTab|stopHostedAgent|herdrStateExtensions|jsonMode|herdrKind|session-ended'
  -- src hook test bin` → exit 1. At `HEAD` it matches only files of items 1–4 and 9.
- AC-4: `node --test test/cli/old-names.test.ts` → exit 0.
- AC-5: `node --test test/cli/old-hosted.test.ts` → exit 0.
- AC-6: `node --test test/s10-doorbell.test.ts` → exit 0.
- AC-7: `node adrian-rebuild/tools/fails-before.mjs` → exit 0: the new and changed test files fail at `HEAD`; the
  outcome names each changed file that passes at `HEAD` alone and why.
- AC-8: `node adrian-rebuild/tools/gate.mjs` → exit 0 with `fail 0`; the outcome names every test removed with the cut
  and the count before and after.
- AC-9: `node adrian-rebuild/tools/check.mjs` → exit 0; `npx biome check --error-on-warnings adrian-rebuild` → exit 0.
- AC-10 (judgment): a detached spawn, continue, stop, steer, reap, sweep, the wake of a detached job (start, advisory,
  completion) and a detached group behave as at `HEAD`: every removed branch was taken only for a hosted job, and no
  remaining condition changed for a detached one, except the kind label of item 4 and the group default of item 6.
- AC-11 (judgment): the help, docs and templates of item 8 say nothing of hosted jobs and nothing the code does not do;
  the GitHub prompt keeps every instruction it had except the mode.

## Migration

- CLI: `--tab` on `spawn`, `continue` and `group start` refuses with the line of item 7 and writes nothing (AC-4).
  `--detached` keeps working.
- On disk: hosted mode wrote nothing outside job folders, so no path goes into `LEFTOVERS`. An old terminal hosted
  job's extra files (`hosted`, `agent-name`, `continue`, `herdr/agent`, `herdr/mode` = `hosted`, `engine-launch`,
  `engine-binding`, `engine-session`, `engine-pid`, `ownership-uncertainty`, `tool-detail`, `last-turn-tools`,
  `session-ended`, `_uncertainty` receipts) are ignored by every reader; `limen continue` of such a job starts a
  detached continuation; an old GitHub record still matches its claim, so the poller's reconcile does not throw on
  every poll; an old `run.json` with `mode` still reads (AC-5).
- A hosted job still running at deployment would lose its supervisor's checks and leave Pi in its pane; step 1.0
  checks that no job runs before a0.1.0 is deployed, and the outcome names it.
- On the seat: steps 1.2 and 1.3 (Herdr's real API for the detached log tab, and one `@limen` mention as a detached
  job).

## Risk

- Herdr: the detached log tab (`openWatchTab`, `createTab` without `--env`) keeps its calls; only the hosted verbs go.
  The fake Herdr in the tests cannot prove the real one; step 1.2 does.
- A GitHub task that ran for hours as a hosted job now stops at 90 minutes and 900 tool starts and waits in the start
  queue behind another job of its project; the terminal reply carries the reason. A request that needs more is re-run
  with a narrower task.
- Removing the `_uncertainty` family could make an old receipt count as a completion and drop a completion wake; item
  4 and AC-5 guard it.
- A group started inside Herdr without a flag had visible member panes; now its team coordinators have log tabs, and
  their workers have none (Out of scope).
- A removed export that another module still needs breaks the build; the gate's `tsc --noEmit` catches it.

## Rollback

`git revert $(git log --format=%H --grep='^R-005:' adrian-rebuild --)`. Jobs started detached under R-005 stay
readable after the revert, because detached records are unchanged.

## Decisions

- 2026-11-18 (main session): `--detached` stays an accepted flag that changes nothing, because R-014 sets the whole CLI
  with Adrian; refusing it now would change three internal callers and the tests for a flag that R-014 may remove
  anyway.
- 2026-11-18 (main session): the GitHub module drops the `started` signal and its "never started" notice instead of
  replacing `herdr/agent` with another marker: a detached job's state is `running` from spawn (`src/commands/spawn.ts:427`),
  and a launch that fails ends in a terminal state whose reply carries the evidence, so one reply fewer covers it.
- 2026-11-18 (main session): the one remaining note kind is named `advisory` after its file (T-18); the kinds
  `blocked`, `errored`, `idle` and `ownership` went with hosted mode. The refusal wording of item 7 is the main
  session's, for Adrian at gate 5.1.
- 2026-11-18 (main session): the highlight test of `test/s2-hosted.test.ts:175` goes here rather than move to a
  detached job, because it asserts the hosted pane's metadata, and R-006 cuts `highlight` before any deployment
  (R-004's precedent).
- 2026-11-18 (main session, review round 1, `review.md`): fix four findings. (1) `docs/remote.md:167`: the sentence
  "No detached fallback, automatic approval, or merge." names no mode, e.g. "No automatic job, approval, or merge."
  (2) `templates/agents.md:84`: "The name does not pick the spawn mode." goes, and the first line of
  `templates/.history/agents.md` follows. (3) `test/u14-task-note.test.ts`: a detached case with no `note.md` asserts
  the "No note exists … reconstruct" text of `src/job/task-note.ts:78`, which only the removed hosted half asserted.
  (5) `test/u10-git-status.test.ts:1-2`: the commit SHA leaves the header comment, to a `// regression: 43c01cf` line
  or nowhere (T-30 (3)). Rejected with its reason in `review.md`: S10 under `/tmp` (finding 4).
