<!-- PL: Wynik R-102 (szkic implementera, noc 24/25.11): reguły seata zniknęły w całości: `limen rule` z podpoleceniami,
`endDueRules` przed każdym poleceniem, wstrzymanie startu przez regułę, blok reguł w turze koordynatora, nagłówek tablicy
i linie `seat queue`; `limen rule …` kończy się kodem 2 (`REMOVED`, `next: null`) ze zdaniem o automatycznym wznowieniu.
Rejestracja koordynatora zniknęła z nimi; odmowa hooka w sesji koordynatora trafia do `.limen/refusals/<pid>-<born>.json`,
`limen status` pokazuje każdy plik jako `Coordinator process …` (zepsuty plik jako własną linię BAD_DATA), a sweep usuwa
plik procesu, który nie żyje; `.limen/coordinators` jest wpisem LEFTOVERS. Runda 1 recenzji (F1–F5): testy hooków
działają w tymczasowym projekcie i nie piszą już do `.limen/refusals/` repo, sweep usuwa tylko zwykłe pliki, zły folder
`.limen/refusals` to jedna linia BAD_DATA, test kolejki s3 rozdzielony na mechanizmy. Runda 2 (G1–G2): komentarz testu
hooka nie wspomina już rejestracji, a pierwszy test hooka rozdzielony na odmowę strażnika i plik odmowy. Bramka:
1189/1189; runda 3 (w dzień) PASS, jej uwaga o kolejce startu to punkt otwarty 9. Stan: zamknięte. -->

# R-102 outcome

## Done

- **(a) The cut.** `git rm` of `src/commands/rule.ts` and `src/project/seat-rules.ts`. With them:
  - `src/registry.ts`: the import of the four handlers, `RULE`, and the entries `rule`, `rule set`, `rule end` and
    `rule timer` (each `movedBy: "R-102"`).
  - `src/main.ts`: `endDueRules` and its `try`/`catch {` before every handler.
  - `src/runtime/start-queue.ts`: `holdingRules`, `heldText`, `heldDecision` (the kind `rules …`), the hold in
    `enterStartQueue`, in `decide` and in the re-check under the queue lock, and the second `queued:` log line on a
    rule change; a detached job now waits only for the gate, the settle and the jobs ahead. `enterStartQueue` queues
    exactly while the gate is on. The header comment and the docs of `startGate` and `waitForStart` follow.
  - `hook/communication.ts`: `RULE_TEXT_CHARS` and the `Seat-wide rules from limen rule` block of the coordinator's
    turn cue.
  - `src/project/board-jobs.ts`: the `## RULES` header of the printed board.
  - `src/runtime/queue-report.ts`: the held lines under each job and "unless a rule holds them" in the gate-off line.
  - `src/help.ts`: the subcommand branch of `commandHelp`, whose only case was `rule`; with it gone `commandHelp` was
    `entryHelp`, so it went and `src/main.ts` calls `entryHelp` (Deviation 1). `groupEntries` stays for `groupHelp`
    and `src/main.ts`.
- **(b) The refusal.** `src/old-names.ts` gains one `OLD_NAMES` entry `rule` (feature `seat rules`, ticket `R-102`,
  `next: null`, D-046 (1)). The parser matches an old name as a word prefix, so `limen rule`, `limen rule set …`,
  `limen rule end …` and `limen rule timer …` all exit 2 with `REMOVED` and the line below, before any command is
  looked up, and write nothing (`## Words for gate 5.3`).
- **(c) The registration goes.** `coordinatorRegistration` (its `start` at `session_start` and `shutdown` at
  `session_shutdown` in `hook/wake.ts`), `liveCoordinators`, `registeredProcess`, `removeDeadCoordinators` and the
  type `CoordinatorSession`. `src/project/leftovers.ts` gains `{ path: ".limen/coordinators", feature: "seat rules
  (R-102)" }`.
- **(d) One refusal file per hook process.** `git mv src/integrations/coordinator-registration.ts
  src/integrations/coordinator-refusals.ts` (the module keeps `coordinatorProject`):
  - `writeCoordinatorRefusal(cwd, refusal)`: reads the process's own start time through the platform adapter
    (`platform.processInfo(process.pid)`); when it has one, writes `<project>/.limen/refusals/<pid>-<born>.json`
    atomically (`atomicWrite`, after a `mkdir` of the folder), the newest refusal of that process; with no start time,
    or outside a project, it writes nothing and Pi's chat message stays the trace. No registration is needed, so a
    session with neither `LIMEN_COORDINATOR` nor a Herdr pane gets its file too.
  - `coordinatorRefusals(root)`: every entry of `.limen/refusals/` by name, the temps of a write in progress
    (`TEMPORARY_NAME`) skipped, each read through the new `readRefusalFile` of `src/job/record.ts`, the record's
    guarded read (`O_NOFOLLOW`, a regular file with one name, at most 64 KiB, then `refusalOf`). A directory, a link, a
    damaged file and a name that is no `<pid>-<born>.json` each give their BAD_DATA message; an error the guarded read
    does not type, such as `EACCES`, becomes a BAD_DATA message too (`expected a file Limen can read, got …`), so the
    rest of `limen status` prints (R-029 round 3, note (2)). A missing folder is no refusal.
  - `removeDeadRefusals(root)`: a step of `sweepProject` in the place of `removeDeadCoordinators`; removes the file of
    a pid that has no process (`absent`) or whose process has another start time; `unavailable` keeps the file, and a
    name that is no refusal file's is left for `limen status` to name. A failure to list the folder other than ENOENT
    is the step's failure (the old step swallowed it).
  - `src/project/summary.ts`: `refusalLines` shows `Coordinator process <pid>, <at|time unknown>: <detail>`, the
    detail through `shownField`; `pid` is `unknown` for a name that names none (Deviation 9).
  - `src/runtime/pi-api.ts`: imports from the new module; its comments name the process's refusal file.
- **(e) Scans and ratchets.** `test/structure.test.ts`: `ISO_TIME_EXCEPTIONS` goes (it held only `rule.ts`; the scan
  and its fixture test lose the exception), the `ERRNO_TYPED` line of `seat-rules.ts` goes, `READS_WITH_TRANSITIONS`
  goes (its only key was `rule`; the T-04 import scan now asserts an empty list), `SWALLOWED` becomes `81 - 6` and
  `18 - 1`, `UNTYPED_THROWS` `106 - 4`, `JSON_PARSE` and `CASTS.runtime` lose the removed sites too (Deviation 3), the
  three `JOB_NAME_EXCEPTIONS` of the registration go with no replacement and the scan's fixture takes the GitHub
  doctor's kept `state` (Deviation 5). `test/registry.test.ts`: no `MOVED` or `WITHOUT_SUCCESS_TEST` entries for
  `rule`, the D-045 test without `rule`, the two comments that named `endDueRules` rewritten.
- **(f) Tests.** `test/s2-herdr.test.ts` loses the rule test (and `limenAsync`, `spawnSync`, `outputText`, which only it
  used); `test/s3-finish-wake.test.ts`'s queue test keeps the gate's priority order without the rule (Deviation 6);
  `test/s4-steering.test.ts` loses the `RULE` marker, its `rule.json` and both assertions; the comments of
  `test/cli/group.test.ts`, `test/job/group-control.test.ts` and `test/hook/communication.test.ts` no longer name
  rules. New or changed, each run before the change in `## Proof`:
  - `test/cli/old-names.test.ts`: "REMOVED: limen rule and each of its old subcommands exit 2 with the removal line and
    leave the seat folder without rules/" (four forms, the snapshot of the project and of `../.limen` identical, no
    `rules/`).
  - `test/integrations/coordinator-refusals.test.ts` (moved with `git mv`, rewritten): the refusal goes to the file of
    this process's pid and start time with no registration folder; the sweep's step removes the file of an ended
    process and of this pid with another start time and keeps this process's.
  - `test/cli/status.test.ts`: the refusal line from `.limen/refusals/`; the T-04 snapshot test on the new file; the
    newline test with a newline in a file's name and in a message; a directory and a malformed file each give a
    BAD_DATA line while `Older: …` still prints.
  - `test/runtime/pi-api.test.ts`: a coordinator session with no `LIMEN_COORDINATOR` and no pane writes its refusal to
    `.limen/refusals/<its pid>-<digits>.json`, and no `.limen/coordinators` appears.
  - `test/project/leftovers.test.ts`: `.limen/coordinators` is listed with the feature `seat rules (R-102)`.
  - `test/hook/communication.test.ts`: a coordinator's turn cue holds no seat-rules block and no rule text when the
    seat folder holds an active `rules/week/rule.json`.
  - `test/runtime/start-queue.test.ts`: with the gate off a job does not enter the queue, and with the gate open and no
    job ahead a queued job starts, each while the seat folder holds an old rule with start priority 1.
- **(g) Docs.** `docs/commands.md`: the moved list of the final-line section, the generated public and internal
  sections, the internal commands' intro, the `REMOVED` `next` paragraph (Deviation 8), the status refusal paragraph
  (the file, the line, the BAD_DATA line, the leftover), the queued reason and `seat queue`, `### Seat-wide rules`
  removed, the sweep's step. `docs/jobs.md`: the priority budget without a rule (the start priority has no
  replacement), the budget reading the owner's, the gate-off sentence and the long wait. `docs/seat/README.md`: the
  sweep's step. `CONTRIBUTING.md`: the `movedBy` list. `templates/agents.md`: the paragraphs `Seat-wide rules` (`:64`)
  and `Priority budget` (`:66`) removed (Deviation 7), new first hash
  `90489174f1d07b59e1a80e2163697efad090e859545c5295322c81d8aeefab68 2026-11-25` in `templates/.history/agents.md`.
  Comments: `src/atomic-write.ts` (`TEMPORARY_NAME` no longer names the seat rules writer), `src/runtime/launcher.ts`
  (`startLimen` serves the group's next round alone), `src/runtime/sweeping.ts`, `src/job/record.ts`.

Review round 1 (`ticket.md` → `## Decisions` → F1–F5):

- **F1** (no test writes into the checkout). The two tests whose hook call reaches `keepRefusal` outside a job, the
  ones that wrote the six files (their contents name the `tool_call` refusal of `hook/group-peer.ts` and the `command
  limen` refusal of `hook/wake.ts`), run in a temporary project of their own: `test/environment.ts` gains
  `inTemporaryProject(t, prefix)`, a new folder holding `.agents/limen` in the OS temporary folder made the process's
  working directory for the test, with the earlier one back and the folder removed after it. `test/hook/wake.test.ts`'s
  first test runs there and also asserts that its refusal lands there, as `.limen/refusals/<this pid>-<digits>.json`
  holding the event `command limen` and the field `args`; `test/hook/group-peer.test.ts`'s refusal test runs there
  with `LIMEN_JOB` empty, so it takes the outside-a-job path whatever the environment of the run holds.
- **F2** (`src/integrations/coordinator-refusals.ts`): `removeDeadRefusals` lists the folder with its entries' types
  and takes regular files only; a directory or a link named `<pid>-<n>.json` stays for `limen status`'s BAD_DATA line.
- **F3** (`src/integrations/coordinator-refusals.ts`): one reader of the folder, `refusalEntries`, serves both
  functions: absent is no entry, a link or another kind of file in its place is BAD_DATA (`expected a folder`, read
  by `lstat`, so no reader follows a link out of the project), and any other failure goes on. `coordinatorRefusals`
  turns any failure of that reading into one entry, `Coordinator process unknown, time unknown: <the BAD_DATA
  message>`, so the rest of `limen status` prints; the sweep's step fails on it as a step of its project, as it failed
  on a regular file there before. The conversion of an untyped error into the BAD_DATA message is one function,
  `typedRefusal`, for a file and for the folder. `src/project/summary.ts`'s comment and `docs/commands.md` (the status
  refusal paragraph and the sweep's step) say both.
- **F4** (T-29 (3)): the queue test of `test/s3-finish-wake.test.ts` checks the gate's priority order only ("a held
  gate starts its queued jobs by priority, then by queue time, and a dead wrapper or a stopped job ahead holds none").
  The other three mechanisms each got a test, since none of the suite checked them elsewhere:
  - the start notice, two tests in `test/s3-finish-wake.test.ts`, where the coordinator session runs the real hook: "a
    queued job tells its session once that it started, and then its finish wakes the session once" and "a queued job
    that ends before its session hears that it started carries the start in its one finish wake";
  - the timeout counted from the engine's start, in `test/runtime/wrapper.test.ts`, the wrapper's file: "a queued
    job's timeout counts from its engine's start, so a job that waited longer than it in the queue runs for the whole
    timeout";
  - the queued stop finalized once, in `test/cli/stop.test.ts`: "limen stop of a job that waits in the start queue
    ends it stopped with its reason, in one terminal line".
  `logged` of the s3 file moved to `test/plant.ts` as `loggedAt`, since two files read a log line's time now (T-25 (2)).
- **F5** (`src/runtime/sweeping.ts`): the header comment is wrapped at 120 columns, its line 6 (121) as well as line 10.

Review round 2 (`ticket.md` → `## Decisions` → G1–G2; both in `test/hook/wake.test.ts`):

- **G1** (T-30): the comment above the migration test says that until `limen migrate` ran the hook reads no job and
  writes nothing at session start (D-057 (6)), no longer that it "neither registers the coordinator".
- **G2** (T-29 (3)): the first wake-hook test is two. "the limen command refuses arguments that are not a string with
  BAD_DATA naming them" (`HEAD`'s name again) checks only the guard's refusal; "outside a job the limen command keeps its
  refusal in this process's refusal file in its project" checks only F1's file, `.limen/refusals/<this pid>-<digits>.json`
  in its temporary project holding the event `command limen` and the field `args`, and takes the rejection itself as
  given (`assert.rejects` with no predicate). Each runs in a temporary project of its own (`inTemporaryProject`), since
  both reach `keepRefusal`; the comment above them says so for both.

## Index (staged by the implementer)

`git rm`: `src/commands/rule.ts`, `src/project/seat-rules.ts`. `git mv`:
`src/integrations/coordinator-registration.ts` → `src/integrations/coordinator-refusals.ts`,
`test/integrations/coordinator-registration.test.ts` → `test/integrations/coordinator-refusals.test.ts`. Nothing else is
staged; the contents of the two moved files are working-tree changes.

## Proof

Review round 2 (the implementer's runs, 2026-11-25, on the tree after G1–G2):

- G1 is a comment and G2 splits a test whose two halves both passed before the split, so no test was run to fail
  first: the mechanisms are there, and `fails-before.mjs` still runs `test/hook/wake.test.ts` at `HEAD`, where the new
  refusal-file test fails (`HEAD`'s hook writes a refusal only into a registration folder of this pid).
- `node --test test/hook/wake.test.ts` → tests 16, pass 16, fail 0 (one more than round 1: the split).
- `node adrian-rebuild/tools/gate.mjs` → exit 0: tests 1189, pass 1189, fail 0, cancelled 0, skipped 0, 301.1 s (one
  test more than round 1's 1188, the split); tsc and `Checked 280 files … No fixes applied.` inside it.
- `ls -la --time-style=full-iso .limen/refusals` after that gate run lists the same six files, the newest
  `2288775-43478364.json` of 07:21:10.317, so the run wrote nothing into the checkout (F1).
- `node adrian-rebuild/tools/check.mjs` → exit 0, `0 errors`; `npx biome check --error-on-warnings .` → exit 0
  (`Checked 280 files … No fixes applied.`); `npx biome check --error-on-warnings adrian-rebuild` → exit 0.
- `git status --short`: the index holds the same two `git rm` and two `git mv`; this round staged nothing.

Review round 1 (the implementer's runs, 2026-11-25, on the fixed tree):

- Before each fix of a mechanism, its new test, written first, on the working tree of the first `DONE`:
  - F2: `node --test --test-name-pattern="takes only regular files" test/integrations/coordinator-refusals.test.ts` →
    exit 1, 1 fail: `[SystemError [ERR_FS_EISDIR]: Path is a directory: rm returned EISDIR (is a directory)
    /tmp/limen-refusals-…/.limen/refusals/<dead pid>-1.json]`, the step's `rm` on the directory. After the fix the file
    passes, 3/3.
  - F3: `node --test --test-name-pattern="is a regular file as one BAD_DATA line" test/cli/status.test.ts` → exit 1,
    1 fail: `limen status` itself exited 1 with `ENOTDIR: not a directory, scandir '…/repo/.limen/refusals'` and
    `{"class":"refused","code":"UNTYPED","next":null}` (`1 !== 0`). After the fix: `node --test
    --test-name-pattern="refusal|BAD_DATA line" test/cli/status.test.ts` → 5/5.
  - F1 changes tests only, and its changed test was not run before its fix on the working tree: without the new
    working directory the refusal lands in the checkout's `.limen/refusals/`, the write F1 forbids. Its "before" is the
    review's evidence, two files per gate run whose contents are the two refusals of these tests (`tool_call` /
    `toolName` and `command limen` / `args`, read with `cat`). At `HEAD` the changed wake test fails on its new
    assertion, since `HEAD`'s hook writes a refusal only into a registration folder of this pid, which the temporary
    project lacks; `fails-before.mjs` runs it there. After the fix: `node --test test/hook/wake.test.ts
    test/hook/group-peer.test.ts` → 17/17, and `ls -la --time-style=full-iso .limen/refusals` lists the same six files
    before that run, after it and after the gate below (the newest `2288775-43478364.json`, 07:21:10.317).
  - F4 changes tests only; the mechanisms are there, so the new tests pass before and after: `node --test
    test/s3-finish-wake.test.ts` → 9/9; `node --test --test-name-pattern="timeout counts from its engine"
    test/runtime/wrapper.test.ts` → 1/1; `node --test --test-name-pattern="waits in the start queue"
    test/cli/stop.test.ts` → 1/1.
  - F5: `grep -n -E "^//.{119,}$" src/runtime/sweeping.ts` → no line.
- `node --test test/structure.test.ts` → 52/52; `npm run typecheck` → exit 0.
- `node adrian-rebuild/tools/gate.mjs` → exit 0: tests 1188, pass 1188, fail 0, cancelled 0, skipped 0, 335.8 s (six
  tests more than the first run: F2, F3, two of F4 in the s3 file, the wrapper test and the stop test). Run once more
  after a comment of `ProcessRefusal` changed, on the final tree → exit 0, 1188/1188, 408.3 s; the listing of
  `.limen/refusals/` after it is still the six files.
- `node adrian-rebuild/tools/check.mjs` → exit 0, `0 errors`; `npx biome check --error-on-warnings .` → exit 0
  (`Checked 280 files … No fixes applied.`), after `npx biome format --write test/cli/status.test.ts` wrapped the new
  test's expected line.
- `git status --short`: the index holds the same two `git rm` and two `git mv` as before; this round staged nothing.

The first run (before review round 1), on the tree of the first `DONE`:

- `node adrian-rebuild/tools/gate.mjs`, run twice on the same tree: the first run, its output piped through `tail`,
  gave tests 1182, pass 1182, fail 0, cancelled 0, skipped 0, 272.2 s (tsc and Biome inside it, since `npm run check`
  runs them before the tests); the second, its output discarded, → exit 0, run only to read the exit status the pipe
  had hidden.
- `node adrian-rebuild/tools/check.mjs` → exit 0, `0 errors` (also after this outcome was written).
- `npx biome check --error-on-warnings .` → exit 0 (`Checked 280 files … No fixes applied.`); `npx biome check
  --error-on-warnings adrian-rebuild` → exit 0.
- `npm run typecheck` → exit 0.
- Alone, on the final tree: `node --test test/cli/old-names.test.ts test/registry.test.ts test/help.test.ts` → 80
  tests, 80 pass; `node --test test/structure.test.ts` → 52/52; `node --test
  test/integrations/coordinator-refusals.test.ts test/cli/status.test.ts test/runtime/pi-api.test.ts
  test/project/leftovers.test.ts test/hook/communication.test.ts test/runtime/start-queue.test.ts` → 97/97; `node
  --test test/s3-finish-wake.test.ts test/s4-steering.test.ts test/s2-herdr.test.ts` → 13/13 (AC-1–AC-6).
- AC-7: `git ls-files --error-unmatch src/commands/rule.ts` and `… src/project/seat-rules.ts` → exit 1 (`did not match
  any file(s) known to git`). AC-8: `git grep -q 'movedBy: "R-102"' -- src/registry.ts` → exit 1. AC-9: `git grep -q -e
  endDueRules -e activeRules -e liveCoordinators -e holdingRules -- src hook seat` → exit 1.
- The new and changed tests, written first and run on the working tree before any code changed (so against `HEAD`'s
  code):
  - `node --test --test-name-pattern="REMOVED: limen rule and each" test/cli/old-names.test.ts` → 1 fail: actual
    `[0, ok, 'no active rules\n']`, `[0, ok, 'rule x set until Wed 25 Nov, 07:50 CET\n']`, `[0, ok, 'rule x
    ended\n']`, `[0, ok, '']` against `[2, {class: 'usage', code: 'REMOVED', next: null}, <the line>]` four times.
  - `node --test test/integrations/coordinator-refusals.test.ts` → does not load: `ERR_MODULE_NOT_FOUND: Cannot find
    module '…/src/integrations/coordinator-refusals.ts'` (the module is new).
  - `node --test --test-name-pattern="refusal|BAD_DATA line" test/cli/status.test.ts` → 4 tests, 1 pass, 3 fail: the
    line test got `[]`, the newline test `[undefined, 0, false]`, the BAD_DATA test `[[], true]` (no line from
    `.limen/refusals/`); the T-04 snapshot test passes there, as a read of an absent folder writes nothing either.
  - `node --test --test-name-pattern="lands in .limen/refusals" test/runtime/pi-api.test.ts` → 1 fail: no file in
    `.limen/refusals/` (`names` empty), no fields.
  - `node --test --test-name-pattern="coordinators folder" test/project/leftovers.test.ts` → 1 fail: actual `[]`,
    expected `[{ path: '.limen/coordinators', feature: 'seat rules (R-102)' }]`.
  - `node --test --test-name-pattern="seat-rules block" test/hook/communication.test.ts` → 1 fail: actual
    `[true, true, true]`, expected `[true, false, false]` (the cue held the block and the rule's text).
  - `node --test --test-name-pattern="whatever the seat folder holds" test/runtime/start-queue.test.ts` → 2 fail: gate
    off, `enterStartQueue` returned `{ since: …, detail: null, ahead: null }` instead of `undefined`; gate open, the
    wait gave `'still waiting'` after its bound instead of `'started'`.
- The implementer's own runs of `node adrian-rebuild/tools/fails-before.mjs` on the final tree: a second run, its
  output discarded, → exit 0; the first, piped through `tail`, printed the first line
  `fails-before: test/cli/group.test.ts, test/cli/old-names.test.ts, test/cli/status.test.ts, test/help.test.ts,
  test/hook/communication.test.ts, test/integrations/coordinator-refusals.test.ts, test/job/group-control.test.ts,
  test/project/leftovers.test.ts, test/registry.test.ts, test/runtime/pi-api.test.ts, test/runtime/start-queue.test.ts,
  test/s2-herdr.test.ts, test/s3-finish-wake.test.ts, test/s4-steering.test.ts, test/structure.test.ts fail at HEAD
  (exit 1)`; its tail is `test/structure.test.ts` at `HEAD`: the ISO time scan finds `src/commands/rule.ts:206` and the
  code-check scan finds `src/project/seat-rules.ts:52`, which the changed lists no longer except. The tool reports the
  one run of all 15 files; `test/cli/group.test.ts`, `test/job/group-control.test.ts`, `test/s2-herdr.test.ts` and
  `test/s4-steering.test.ts` change comments or remove rule assertions only and are not expected to fail at `HEAD`.

## Fails before

By day, before review round 3 (2026-11-25, `limen-rebuild-31`, after the night's round 3 was cut): `node
adrian-rebuild/tools/gate.mjs` → exit 0, tests 1189, pass 1189, fail 0 (309.5 s), `.limen/refusals/` with the same six
files; `node adrian-rebuild/tools/fails-before.mjs` → exit 0 with the same 19-file first line.

AC-10, the night's last run, after the fixes of review round 2 (2026-11-25, 08:50): `node
adrian-rebuild/tools/fails-before.mjs` → exit 0, with the same 19-file first line and tail as the run below. The main
session's gate before it: `node adrian-rebuild/tools/gate.mjs` → exit 0, tests 1189, pass 1189, fail 0 (361.7 s); after
it, `.limen/refusals/` lists the same six files, the newest of 07:21:10.

The main session's run after the fixes of review round 1 (2026-11-25, 08:20): `node
adrian-rebuild/tools/fails-before.mjs` → exit 0, first line: `fails-before: test/cli/group.test.ts,
test/cli/old-names.test.ts, test/cli/status.test.ts, test/cli/stop.test.ts, test/help.test.ts,
test/hook/communication.test.ts, test/hook/group-peer.test.ts, test/hook/wake.test.ts,
test/integrations/coordinator-refusals.test.ts, test/job/group-control.test.ts, test/project/leftovers.test.ts,
test/registry.test.ts, test/runtime/pi-api.test.ts, test/runtime/start-queue.test.ts, test/runtime/wrapper.test.ts,
test/s2-herdr.test.ts, test/s3-finish-wake.test.ts, test/s4-steering.test.ts, test/structure.test.ts fail at HEAD (exit
1)` (19 files; F1 and F4 added `stop`, `group-peer`, `wake` and `wrapper`), with the same tail as the run below. The main session's gate before it: `node adrian-rebuild/tools/gate.mjs` → exit 0, tests 1188, pass
1188, fail 0 (431.9 s); after it, `ls -la --time-style=full-iso .limen/refusals` lists the same six files, the newest
of 07:21:10, so the gate wrote nothing into the checkout (F1).

The main session's run after the implementer's first `DONE` (2026-11-25, 07:25): `node
adrian-rebuild/tools/fails-before.mjs` → exit 0, first line: `fails-before: test/cli/group.test.ts,
test/cli/old-names.test.ts, test/cli/status.test.ts, test/help.test.ts, test/hook/communication.test.ts,
test/integrations/coordinator-refusals.test.ts, test/job/group-control.test.ts, test/project/leftovers.test.ts,
test/registry.test.ts, test/runtime/pi-api.test.ts, test/runtime/start-queue.test.ts, test/s2-herdr.test.ts,
test/s3-finish-wake.test.ts, test/s4-steering.test.ts, test/structure.test.ts fail at HEAD (exit 1)`. The tail of its
output is `test/structure.test.ts` at `HEAD`: the ISO-time scan finds `src/commands/rule.ts:206`, and the T-25 scan of
error codes finds `src/project/seat-rules.ts:52`, both lines the change removes. The tool reports one run of the 15
files, so it shows that the set fails at `HEAD`, not that each file does (`## Proof` names the files that change
comments or remove assertions only). The main session's gate before it: `node adrian-rebuild/tools/gate.mjs` → exit 0,
tests 1182, pass 1182, fail 0 (277.7 s). The implementer's own run is the last item of `## Proof`.

## Deviations

1. `commandHelp` is removed, not only its subcommand branch: without the branch it returned `entryHelp(entry)`, so
   `src/main.ts` calls `entryHelp`, and `entryHelp`'s comment names `limen <name> --help`.
2. `enterStartQueue(jobDir)` loses its `record` parameter, which only the rule hold read (the job's priority); its one
   caller, `src/runtime/wrapper.ts`, follows.
3. Beyond `SWALLOWED` and `UNTYPED_THROWS`, the ratchets `JSON_PARSE` (`- 1`, the reader of `rule.json`) and
   `CASTS.runtime` (`- 6`: `span[2] as keyof …` in `rule.ts`, three in `seat-rules.ts`, the two `[] as string[]` of the
   registration module) are lowered by the removed sites, under (e)'s "the scans and ratchets follow". All four are
   lowered by the sites removed, from their baselines, not set to the counts now: at `HEAD` the code held 68 `catch {`,
   17 `.catch(() => {})` and 101 `throw new Error(` against baselines 81, 18 and 106; after the change 62, 16 and 97,
   against 75, 17 and 102.
4. `ISO_TIME_EXCEPTIONS` and `READS_WITH_TRANSITIONS` are removed as constants, not emptied, since each held only the
   `rule` entry; the two scans and their test names lose "except …".
5. The new module builds the file's name in a template (`${pid}-${born}.json`), which names no job file, so the three
   `JOB_NAME_EXCEPTIONS` of the registration go with no new ones; the job-file scan's fixture keeps an excepted file
   through the GitHub doctor's listed `state` instead of the registration's `pid`.
6. `test/s3-finish-wake.test.ts`: Decision 4 read as "the rule parts go"; the test keeps the gate's priority order and
   also the start notice and the timeout counted from engine start, which it covered and which stay. Where the rule
   held `timed` while it sampled, the test now writes a closed reading into `timed`'s pipe, so `timed` waits behind the
   gate as long as before; the assertions of the held line in `limen show` and `limen seat queue` went with the hold.
7. `templates/agents.md`: both paragraphs are removed whole, with no sentence in their place: the refusal line names
   the resume, and the paragraph after them already says a job the limit stopped is Limen's to resume.
8. `docs/commands.md`'s `REMOVED` paragraph gains a clause on `rule`'s `null` `next`; `docs/jobs.md`'s "Budget reading"
   says the owner reads the budget and decides what runs, where it said a person sets the rule.
9. The ticket's line form has no case for a file whose name is no `<pid>-<born>.json`; such a file shows as
   `Coordinator process unknown, time unknown: <BAD_DATA message>`, and the sweep leaves it. A temp of an atomic write
   in progress is skipped by `limen status` and left by the sweep.
10. An error the guarded read leaves untyped (`EACCES`, `EIO`) becomes the BAD_DATA line in
    `src/integrations/coordinator-refusals.ts` (`refusalIn`), not in `src/job/record.ts`, whose other readers keep
    letting such an error go on.
11. The comments of `test/registry.test.ts`, `test/cli/group.test.ts` and `test/job/group-control.test.ts` that named
    `endDueRules` are rewritten, not deleted, since their `LIMEN_HERDR: "0"` stays: an in-process run reaches no Herdr
    of the machine.

Review round 1 (choices inside F1–F5 that the fixes did not name):

12. F1: "one of them asserts that its refusal lands there" is the first test of `test/hook/wake.test.ts`, whose name
    now says where the refusal is kept; the group-peer test only runs in its own project. That test also sets
    `LIMEN_JOB` empty, which it left to the environment of the run before, so its refusal takes the path F1 names in
    every environment. Both use one helper, `inTemporaryProject` in `test/environment.ts`, whose first line now names
    the working directory too.
13. F2: the test plants a directory and a link of a dead process's name, since F2's rule names both; only the
    directory failed before (the step's `rm` removed a link).
14. F3: the folder's line takes `unknown` as its process, the form of Deviation 9, so `limen status` keeps one line
    form. The folder is read with `lstat`, so a link in its place is BAD_DATA too and neither reader follows it out of
    the project; for the sweep this is new (it listed the link's target before and removed the files of dead processes
    there), and the step fails on it as on a regular file there.
15. F4: the start notice is two tests (its own wake before the finish wake; carried in the finish wake of a job that
    ended first), since each is checked by its own assertion. The timeout and the queued stop went to the files of
    their subjects (T-29 (1)), `test/runtime/wrapper.test.ts` and `test/cli/stop.test.ts`, each with a plant of its
    own. The priority test no longer reads its head's load from a pipe, which kept `timed` in the queue past its
    timeout for the timeout's check; its jobs run `say` and need no release. Its "no toast yet" check, which belonged to
    the start notice, went, and the stop's printed line moved to the stop test.
16. F5: the whole header of `src/runtime/sweeping.ts` was wrapped again, as its line 6 was 121 columns too.

## Unmeasured

- Step 3.5 on the seat (`## Deployment`): `limen rule` refuses with its line, no `limen rule timer` process runs, and
  Adrian may delete `~/.limen/rules/` by hand; seat only, no M-NN of `## Measurement` covers it.
- A guard refusal in a real coordinator session under Pi 1.5.1 and the bridge reaching `.limen/refusals/` and `limen
  status`: the fake engine runs the real hook (`test/runtime/pi-api.test.ts`), the seat only can show it with Pi; no
  M-NN.
- The coordinator manual (`templates/agents.md`, two paragraphs fewer): its size is M-01, and whether a coordinator
  still runs `limen rule` is M-05's count of owner commands; the role text sits in Pi's system prompt, which the bridge
  drops (E-1).

## Open points

1. For gate 5.3: the words of `## Words for gate 5.3` (Decisions 1 and 3).
2. For gate 5.3 (observed in the code): a BAD_DATA line shows its message through `shownField`, which escapes it as a
   JSON string, so the message's quotes show as `\"` (`… got \"another kind of file\"`), as the damaged
   `refusal.json` of a session folder did at `HEAD`. Options: (a) keep it (recommended: one escape for every text from
   outside, R-029 round 1, note 6); (b) an escape of control characters alone for these lines, a second function
   beside `shownField` (T-25).
3. A temp file that a refusal's write left when its process died mid-write stays in `.limen/refusals/`: `limen status`
   skips it and the sweep leaves it. Not reproduced; the window is one `atomicWrite`.
4. After the deployment both projects' `limen status` list `.limen/coordinators` under `Leftover files` until `limen
   init --drop-leftovers`; its old `refusal.json` files are past sessions' warnings and are not moved (`## Migration`).
5. For Adrian, on the laptop (the main session's text; review round 1, finding 1): the gate runs of the first tree of
   this ticket (07:05 and 07:14 by the implementer, 07:21 by the main session) wrote six test refusals into
   `.limen/refusals/` at the repository root, a folder `.gitignore` ignores and that did not exist before (created at
   07:05:26). `rm` is denied to the sessions, so Adrian removes `.limen/` at the repository root by hand; nothing reads
   it but a `limen status` run in the checkout.
6. For the main session (observed in round 1): no check of the suite finds a test that writes into the checkout; F1's
   proof is the listing of `.limen/refusals/` before and after a gate run. Options: (a) keep that listing as this
   ticket's check; (b) `gate.mjs` compares the checkout's ignored files outside `node_modules/` before and after its
   run and fails on a new one, a `Tools:` commit with its test (recommended: a guarantee in code, z. 14, which finds the
   next such test in any ticket).
7. For gate 5.3 (review round 2, note 4, observed; the main session's text): the writer follows a link in place of
   `.limen/refusals` (`mkdir` recursive, then `atomicWrite` into the link's target), while both readers refuse that
   link as `BAD_DATA`, so a refusal then lands outside the project and `limen status` shows only the link's line;
   `HEAD`'s writer did the same for `.limen/coordinators`. Options: (a) the writer refuses a `.limen/refusals` that is
   not a directory of the project and leaves Pi's message as the trace (recommended: the readers' rule, one place for
   the check); (b) as now.
8. For the main session (observed in round 2, not changed, since G1 names the comment only): the same migration test's
   assertion message `"nothing registered or written"` (`test/hook/wake.test.ts:96`) still says "registered", which at
   `HEAD` meant the coordinator's registration folder in `.limen/`; the assertion itself (`.limen` holds only `jobs`)
   stays right. Options: (a) leave it (recommended: a test message, true as it stands, and G2 was the last round of
   fixes); (b) "nothing written", with the next ticket that touches the file.
9. For gate 5.3 (review round 3, note 1, observed; already at `HEAD`, outside A-010's cut): a start-queue entry counts
   as live on its pid and its job folder's state alone, with nothing tying that folder to a registered project, so a
   process of the agents' account can hold other jobs' starts until their `failAfter` (`src/runtime/start-queue.ts:584`,
   `:621-631`, `:491`). No ticket rewrites that part yet (D-092); options for Adrian: (a) a ticket that checks an
   entry's job folder against the project's jobs (recommended: the queue's own rule, z. 14); (b) accepted risk, since
   the agents' account already runs every job.

## Words for gate 5.3

- Decision 1, the refusal (D-097 (6) (c)): `limen rule`, with any words after it, exits 2 with `{"class":"usage",
  "code":"REMOVED","next":null}` and the line `limen rule was removed with seat rules (R-102); Limen itself resumes a
  job the subscription limit stopped, 5 minutes after the reset (limen seat sweep)`.
- Decision 3, the status line: `Coordinator process <pid>, <time>: a Limen hook refused <the guard's message>`; for a
  file that does not read, `Coordinator process <pid>, time unknown: <its BAD_DATA message>`, and `<pid>` is `unknown`
  when the file's name names no process or when `.limen/refusals` itself does not read (review round 1, F3).
