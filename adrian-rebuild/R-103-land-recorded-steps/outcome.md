<!-- PL: Wynik R-103 (25.11, przy `4f8dea1`, `limen-rebuild-32`): `limen land` przechodzi przez runner i zapisuje w
rekordzie kroki `merged` (znacznik `landed` z pustym `land`), `closed` (commit zamykający albo `null`) i `cleaned`;
ponowne uruchomienie idzie od pierwszego niezapisanego kroku, nigdy nie scala drugi raz, kończy przerwany checkout po
przesunięciu gałęzi i bierze commit zamykający z historii Gita, także dla starszych rekordów. Gałąź i worktree znikają
dopiero w `cleaned`, który zamyka też karty Herdr joba; ta sama funkcja zamyka karty w `ticket done`, `abandon` i w
dziennym kroku sweepa (z oznaczeniem zamkniętej karty i limitem 60 s). `limen diff` i `limen open` są poleceniami
zmiany, `--help` pokazuje rodzaj, retire nie bierze lądowania bez `cleaned`, a `ticket done` uruchomione ponownie
kończy krok znaczników. Stan: zamknięte; poprawki F1–F6 rundy 1 i G1 rundy 2 zrobione, recenzja rundy 3 PASS, trzy
uwagi w kodzie w `## Open points` 4–6; nowe kody i sformułowania na bramkę 5.3 w `## New codes and wordings`.
-->

# R-103 outcome

## Done

- **(a) Record** (`src/job/record.ts`). New optional field `land: { closed?: { sha: string | null; at }, cleaned?: { at }
  }` in `JobRecord`, `RECORD_FIELDS` (after `landed`), the `Fields` omit list and the validator (`landOf`: a key of no
  step is `BAD_DATA`, as for the record, D-079). `writeMarker` takes three more markers, the steps of a land:
  `{ merged }` writes `landed` and `land: {}` in one write; `{ closed }` and `{ cleaned }` each fill their field of
  `land` in a write of their own, under the job's lock. A step written again with the same commit returns the record
  unchanged (the time is never compared); `closed` with another commit is `MARKER_DIFFERS`; `closed` before `landed`
  and `cleaned` before `closed` are the new internal `MARKER_OUT_OF_ORDER`. A record with `landed` and no `land` takes
  `land` with its first recorded step. `docs/jobs.md` (the record's fields) follows.
- **(b) Land through the runner** (`src/job/landing.ts`, rewritten; `src/commands/land.ts` is an `operationHandler`, so
  `land` left `OUTSIDE_RUNNER`). `validate` refuses a group member first, resolves the job, holds the recorded steps
  (`stepsOf` of the record) and, only while `merged` is not recorded, makes the merge's checks: a done job, a branch
  and a base (`recordedBranch`, `src/job/job.ts`, shared with `limen diff`), the target, the held read of staged files,
  commits to land and uncommitted overlap, the uncommitted-files note, the strict ticket check, the test-line cap and,
  unless `--keep-open`, the close's `TICKETS_UNCOMMITTED`. Each of the 11 `throw new Error(` is a typed refusal with a
  code (`## New codes and wordings`), declared in `refuses`, each with a `CODE:` test that compares the snapshot
  (`test/cli/land-refusals.test.ts`, `test/job/landing.test.ts`). The terminal question comes between `validated` and
  `apply`, only when the plan merges. `apply` runs under the lock module's lock of `<jobDir>/.land`, after the runner
  read the steps again (a change ends it `STATE_CHANGED`, exit 3, before the first write). Steps:
  1. `merged`: the merge (aborted beside dirty files as before), then `writeMarker({ merged })`, then `landed <id>
     onto <target>`.
  2. `closed`: the job's closing commit in the history of the project's HEAD (`landClosingCommits`, now in
     `src/project/lanes.ts` and read by the migration's `closingCommits` too, T-25) is recorded as found, after
     `finishCheckout` brings the checkout to it when HEAD is that commit and the index still holds its paths as its
     parent had them (`stagedAgainst`, `firstParent`, `followCommit`); a read-tree that refuses is `CHECKOUT_BEHIND`
     with R-037's commands in its message (`checkoutBehind`, exported with a `next`). Otherwise R-037's close
     (`closeOperation`) runs and its commit, or `null`, is recorded; `--keep-open` records `null`. A refusal of the
     close's validate here is `STATE_CHANGED` (exit 3); any other failure keeps its class and code, and the message
     says either that the tickets stay active or that the closing commit is on the branch and the land stopped before
     it recorded it (R-037 review round 1, note 6).
  3. `cleaned`: the branch, when it is still there: kept with a line when `unlandedBranches` (retire's rule) names it,
     else `deleteLandedBranches` with today's lines; then `closeJobTabs` (d); then `writeMarker({ cleaned })`.
  Every step's failure keeps its class, code and message and gets the land's own command line as `next`
  (`failedStep`), `CHECKOUT_BEHIND` included. A land whose record holds every step exits 0 with the steps' line.
  Registry: `land` is `irreversible`, `IRREVERSIBLE` lists it with its `again` and `kept` titles in
  `test/cli/land.test.ts`.
- **(c) Older records.** `stepsOf` counts `merged` as recorded for a record with `landed` and no `land`; `closed` is the
  job's closing commit found in Git, or `landed.sha` itself when its subject is a closing subject (`isClosingSubject`),
  otherwise the close runs for the job's active tickets, whose features come from the record's commits (`featuresOf`,
  `limen ticket done`'s rule), since the branch's commits are then on the target; `cleaned` runs as step 3. No
  migration script.
- **(d) Tab close** (`src/integrations/herdr.ts`). The close of one job's recorded tabs is one function,
  `closeRecordedTabs` (both places, the label check, the own `HERDR_TAB_ID` skipped, `closeJobTab`), factored out of
  `closeLeftoverTabs`, which now calls it per leftover job; `closeJobTabs(jobDir)` (land's `cleaned` and `abandon`) and
  `closeTicketTabs(root, codes)` (`ticket done`: every finished job whose `closedJobFeatures` include a code it closed)
  call it too. Decision 23: a tab that closed or that Herdr no longer lists is marked in its place's folder
  (`herdr/closed`, `herdr/diff/closed`, the tab's id); `recordedTabs` skips a marked place, so no close asks Herdr about
  it again; `recordPlace` removes the mark first, so a new tab in that place is asked about. The sweep's close has a
  total bound, `LEFTOVER_CLOSE_MS` = 60 s (test knob `LIMEN_LEFTOVER_TABS_MS`, read only in test mode): each Herdr call
  ends by it (`callBound`), `closeJobTab` takes the deadline (a refusal with no time left for its retry is not retried),
  and once it passes the close asks nothing more, names the tabs it did not reach in one line and is done.
  `abandon` replaces its detached `settleJobTab` with `closeJobTabs`, on every run, its lines after abandon's own;
  `settleJobTab` at a job's end stays.
- **(e) `ticket done`** (`src/project/ticket-folders.ts`). Its validate takes a number with no active ticket when its
  ticket is in `done/` and an earlier `ticket done`'s closing commit names it in the history of HEAD
  (`ticketDoneClosings`, `ticketDoneCodes`, `src/project/lanes.ts`): it holds that close's commit, the ticket's
  `landed` day and the jobs `ticketDoneJobs` still finds; any other number stays `NO_ACTIVE_TICKET`. After the commit,
  the marker step marks the new close's jobs and those of earlier closes (a line when none was left), then
  `closeTicketTabs`; a failure there keeps its class and code with `next` the same `ticket done`. Decision 22: the
  day-only form is `dayOnlyTime` and `isDayOnly` in `src/job/landing.ts`, which `src/job/statistics.ts` imports; a test
  of `test/job/statistics.test.ts` builds its marker through `dayOnlyTime`.
- **(f) `limen diff` and `limen open`** are `change` entries through the runner (`operationHandler`;
  `src/integrations/hunk.ts` `showJobDiff`, `src/integrations/herdr.ts` `openJob`): validate resolves the job and reads
  its record (diff: `JOB_NO_BRANCH`, `JOB_NO_BASE`; open: `HERDR_UNAVAILABLE`), apply opens or focuses the tab and
  records its place. A tab Herdr does not open there is `HERDR_FAILED` (environment; `createTab` with `strict`, the
  side channel of a job's watch tab still logs and goes on); Hunk that fails is `HUNK_FAILED`. Without Herdr or a
  terminal, `diff` prints the `git diff` command and writes nothing. Both left `WITHOUT_SUCCESS_TEST`, `READS_NOT_RUN`
  and `READ_ARGUMENTS`, with success tests on `test/s2-herdr.test.ts`'s fake.
- **(g) Help** (`src/help.ts`): `limen <command> --help` prints `kind: read` or `kind: change` right after the summary,
  before an `internal: run by …` line; the goldens `LAND` and `STATS` follow, and a test checks it for every entry.
  The generated sections of `docs/commands.md` hold no command's own help, so they do not change.
- **(h) Retire** (`src/runtime/retiring.ts`, `markedAt`): a record whose `land` lacks `cleaned` is not taken; a record
  with `landed` and no `land` retires as before.
- **(i) Tests.** `test/s5-land.test.ts` moved by `git mv` to `test/cli/land-refusals.test.ts`, rewritten into one test
  per code, each on a plant of its own and comparing the snapshot, plus the conflict (`MERGE_FAILED`) and the
  fast-forward and merge success; `test/outcome.test.ts` takes a blank `ticket new` title as its UNTYPED example;
  `UNTYPED_THROWS` is `106 - 4 - 17`. Every pointer in `test/cli/land.test.ts` names its ticket (R-030, R-031, R-037, by
  `git blame`). New tests: `test/cli/land.test.ts` (the steps recorded, the rerun after all steps, nothing lost, the
  rerun after a rejected close, a kept branch, the rerun after a failed clean-up on a held worktree lock, the kill after
  the branch move built with `git update-ref`, the lost ticket-lanes lock after the commit, an older record of each
  kind, the tabs in `cleaned`), `test/job/record.test.ts` (six on `land`), `test/integrations/herdr.test.ts` (the shared
  close: both places, own tab, a tab that does not close, Herdr absent, no place; the mark; a reopened place; the bound
  on a hanging Herdr), `test/cli/sweep.test.ts` (the stamp written after the bound), `test/cli/ticket.test.ts` (the
  rerun after a failed marker write, the rerun with nothing left, the tabs), `test/cli/abandon.test.ts` (both tabs,
  synchronously), `test/runtime/retiring.test.ts`, `test/s2-herdr.test.ts` (open, diff, the mark removed, diff without
  Herdr, `HERDR_UNAVAILABLE`), `test/help.test.ts` (the kind line). The fake Herdr of `test/integrations/herdr.test.ts`
  moved to `test/plant.ts` (`herdrFake`, with `hang`, and `recordTab`), which the CLI tests share. Lists that follow:
  `test/registry.test.ts` (`IRREVERSIBLE` gains `land`; `WITHOUT_CODE_TEST` loses `MERGE_FAILED` and `JOB_NO_BRANCH`;
  `WITHOUT_SUCCESS_TEST` loses `diff` and `open`; `READS_NOT_RUN` loses `open`, `READ_ARGUMENTS` `diff`),
  `test/structure.test.ts` (`OUTSIDE_RUNNER` loses `land`; T-20's `MATCHER_EXCEPTIONS` holds the label check's new
  text), `test/config.test.ts` (the knob `LIMEN_LEFTOVER_TABS_MS` in its inventory).
- **(j) Text.** `docs/commands.md` (the shape's list; Inspect jobs; land's steps, refusals, rerun, `cleaned` and its
  tab lines; abandon's tabs; the close's `next`; `ticket done`'s tabs and rerun; the sweep's mark and bound),
  `docs/jobs.md` (the `land` field; Land; retire; abandon's tabs), `docs/herdr-status.md` (which commands close tabs),
  `templates/agents.md` (`limen open`: land, `ticket done` and abandon close the tabs it records; `limen land`: then
  it deletes the job's branch and closes its Herdr tabs) with a new first hash in `templates/.history/agents.md`; its
  lines on `ticket done` and `limen diff` stay, since they are still true and the rerun is code's (T-09); the code
  comments of the inventory's section 8 that became false (`landing.ts`, `land.ts`, `registry.ts`, `git.ts`
  `mergeBranch`, `record.ts`, `ticket-folders.ts`, `abandoning.ts`).
- **Review round 1, F1–F6** (`ticket.md` → `## Decisions`, `review.md` → Round 1).
  - F1: the close that land runs takes the land's own command line as its `retry` (a new optional field of
    `CloseRequest`, passed to `planTicketClose` by `closeOperation`; `src/project/lanes.ts`), so a `TICKETS_UNCOMMITTED`
    of a land run again after its merge says `commit them, then run limen land <id> …` and names the land in `next`;
    land's own check before the merge already named it, and `ticket done` keeps its own. Test:
    `test/cli/land.test.ts` "a land run again after its merge whose ticket folder has uncommitted changes names the
    land again in its message and next".
  - F2: a recorded tab that Herdr no longer lists gets, besides its mark, the job's log line `herdr tab close <tab>:
    already closed` (`noteTabClose`, the closer's one log writer, `src/integrations/herdr.ts`); the output keeps
    R-101's forms (Deviation 11). Test: `test/integrations/herdr.test.ts` "a recorded tab that Herdr no longer lists
    is marked, and the job's log says it was already closed". `docs/commands.md` says it.
  - F3: `finishCheckout`'s comment states the condition the code checks (HEAD is the closing commit and the index holds
    a path the commit changed otherwise than the commit has it) and why a file changed since then keeps
    `CHECKOUT_BEHIND` (z. 29); the code is unchanged.
  - F4: `test/cli/land.test.ts` "CHECKOUT_BEHIND: a land run again after a stop past the branch's move, with a file
    of the close changed in the checkout, exits 4 with the land in next and keeps the file"; `ticket done`'s keeps
    `next` null in `test/project/lanes.test.ts` (unchanged).
  - F5: the bound test of `test/integrations/herdr.test.ts` asserts what the bound decides: the reached tab stays
    open with its failure, the two tabs past the bound are named and Herdr is asked about none of them, and the run
    ends before the 10 s a single call takes without the bound; no more the number of the fake's calls.
  - F6: the comment on the day-only time moved from between `NONE` and `LAND_COMMAND` into `leadTimeOf`'s
    (`src/job/statistics.ts`); `landsWithin`'s already names `isDayOnly`.
- **Review round 2, G1** (`ticket.md` → `## Decisions`, `review.md` → Round 2, finding 1): the closing commit that
  land's `closed` step takes from the history counts only when it is a strict descendant of the merged commit
  (`landsOwnClose` in `src/job/landing.ts`: `landClosingCommits` with a filter, `isAncestor(merged.sha, commit)` and
  not `merged.sha` itself), since land commits its close after its merge and every commit of the job is the merged
  commit or one of its ancestors; the failure message of the close (`closeFailure`) reads the same rule.
  `landClosingCommits` (`src/project/lanes.ts`) takes the filter as an optional argument, so the migration's reading
  is unchanged, and so is Change (c)'s case of an older record whose `landed.sha` itself carries a closing subject
  (Open point 3). Test: `test/cli/land.test.ts` "a land of a job whose own commit carries its closing subject closes
  the ticket and records its own closing commit".

## Index (staged by the implementer)

`git mv test/s5-land.test.ts test/cli/land-refusals.test.ts`, as `## Change` (i) names. Nothing else is staged.

## New codes and wordings (for gate 5.3; Decisions 15, 16, 18, 21, 23)

Codes of land's refusals (Decision 16), each refused (exit 1) unless named otherwise, `next` the land's own command
line where a run again mends it once the checkout changes, else `null`:

| Code | Where | Message | `next` |
|---|---|---|---|
| `LAND_IN_GROUP` | a group member runs land | `group members cannot land; the owner-facing lead owns landing` | null |
| `JOB_NOT_DONE` | the job is not done | `job <id> is <state>; land requires a done job` | null |
| `JOB_NO_BRANCH` | the record names no branch (the code `limen continue` already used for the same fact, T-18) | `job <id> has no recorded branch` | null |
| `JOB_NO_BASE` | the record names no base | `job <id> has no recorded base` | null |
| `TARGET_NOT_CHECKED_OUT` | `--onto` names another branch | `land merges onto the current branch (<current>); checkout <target> first` | land |
| `ON_JOB_BRANCH` | the job's own branch is checked out | `already on job branch <branch>; checkout the branch to land onto first` | land |
| `TARGET_STAGED` | staged changes | as before | land |
| `NOTHING_TO_LAND` | no commit to land | `job <id> has no commits to land` | null |
| `UNCOMMITTED_OVERLAP` | uncommitted edits in a file the merge changes | as before | land |
| `TICKET_CHECK_FAILED` | the strict ticket check (the code of `limen ticket check`, T-18) | as before | land |
| `TEST_LINE_CAP` | the test-line cap | as before | land |
| `LAND_CANCELLED` | the terminal answer is not yes | `the land of job <id> is cancelled: the answer was not yes` | null |

Other codes: `HERDR_UNAVAILABLE` (refused, `limen open`: `limen open opens the job's tab in Herdr, and Herdr is not
available here`); `HERDR_FAILED` (environment, `open`/`diff`: `herdr did not open the tab of job <id>: <words>`);
`HUNK_FAILED` (environment, `diff`: `hunk did not start: …` / `hunk exited with status <n>`); `MARKER_OUT_OF_ORDER`
(internal: `job <id> has no <the landed marker|the closed step>, which comes before the land's <closed|cleaned> step`);
`MERGE_FAILED` changes class, refused → environment (Deviation 1).

Wordings:
- Help (Decision 15): `kind: read` / `kind: change`, the line after the summary.
- The steps' line (Decision 18): `job <id> is landed: merged in <sha>, closed in <sha>, cleaned`, or `…, with no
  closing commit, cleaned`.
- Land: `land: recorded the closing commit <short> of job <id> on <target>`; `kept branch <branch>: it holds commits
  that <target> does not`; `job <id> merged onto <target>, but its tickets stay active: <words>`; `job <id> merged onto
  <target>, and its closing commit <short> is on <target>, but the land stopped before it recorded the commit:
  <words>`.
- Tabs (Decision 21): `closed the Herdr tab <tab> of job <id>`; `the Herdr tab <tab> of job <id> did not close; its log
  says why`; `the Herdr tab <tab> of job <id> stays open: herdr tab get failed (<words>)`; `herdr is not available, so
  the <n> Herdr tab(s) of job <id> stay(s) open`; the job log's new `herdr tab close <tab>: failed with no time left
  for a retry (<words>)`; the sweep's `the close of leftover Herdr tabs reached its bound of 60 s, so <n> tabs wait for
  the next daily run: <tab> of job <id>, …`.
- Decision 23 (A): the bound is 60 s (`LEFTOVER_CLOSE_MS`; at most 120 s by the Decision, so at a 10 s call bound about
  three hung tabs, and prune and retire keep at least 240 s of the unit's 300 s); the mark is a file `closed` in the
  place's folder holding the tab's id.
- `ticket done`: `<FNNN> was closed in <commit> already; no job of it was left to mark`.

## Proof

The main session's runs (2026-11-25, protocol step 4, after `review-guard.mjs compare --git` → exit 0): `node
adrian-rebuild/tools/gate.mjs` → exit 0, tests 1233, pass 1233, fail 0 (310.1 s); `node
adrian-rebuild/tools/fails-before.mjs` → exit 0, the same first line as in `## Fails before`.

Review round 2 fix (the implementer's runs, 2026-11-25):

- `node adrian-rebuild/tools/gate.mjs` → exit 0; tests 1237, pass 1237, fail 0, cancelled 0, skipped 0 (307.3 s; tsc
  and Biome inside it): the 1236 of round 1 and G1's new test.
- `node adrian-rebuild/tools/check.mjs` → exit 0, `0 errors`; `npx biome check --error-on-warnings .` → exit 0 (280
  files); both run after the last write of this file.
- G1's test on the working tree before the fix: `node --test --test-name-pattern='own commit carries its closing
  subject' test/cli/land.test.ts` → 1 test, 0 pass, 1 fail: actual `[0, 'c6e5cf75…', '4989b31d…', true]` against
  `[0, 'c6e5cf75…', 'c6e5cf75…', false]` (exit code, `land.closed.sha`, `HEAD~1`, the active ticket there): the land
  exited 0 and recorded as `closed` the job's own commit `Close F001: landed by <id>`, which the fast-forward had
  made HEAD, so `HEAD~1` was the job's commit before it and the ticket stayed active. After the
  fix: 1 pass, and the eight tests of the `closed` step (the reruns, the kill, the lost lock, `CHECKOUT_BEHIND`, the
  three older records) pass.

Review round 1 fixes (the implementer's runs, 2026-11-25):

- `node adrian-rebuild/tools/gate.mjs` → exit 0; tests 1236, pass 1236, fail 0, cancelled 0, skipped 0 (309.3 s; tsc
  and Biome inside it): the 1233 of the first run and the three new tests of F1, F2 and F4.
- `node adrian-rebuild/tools/check.mjs` → exit 0, `0 errors`; `npx biome check --error-on-warnings .` → exit 0 (280
  files).
- Each fix's test on the working tree without its fix:
  - F1: with `retry: again` taken out of land's close request, `node --test --test-name-pattern='whose ticket folder
    has uncommitted changes names the land again' test/cli/land.test.ts` → 1 test, 0 pass, 1 fail: actual `[3, {
    class: 'transient', code: 'STATE_CHANGED', next: 'limen land <id> --yes' }, false, true]` against `[…, true,
    false]`, the message naming `limen ticket done` and not the land. With it: 1 pass.
  - F2: `node --test test/integrations/herdr.test.ts` before the fix → 15 tests, 14 pass, 1 fail: "a recorded tab that
    Herdr no longer lists is marked, and the job's log says it was already closed", the job's log not written. After:
    15 pass.
  - F4: the test passes on the working tree, since `failedStep` and `checkoutBehind` already name the land; with
    both made to give `null` for `CHECKOUT_BEHIND`, `node --test --test-name-pattern='CHECKOUT_BEHIND'
    test/cli/land.test.ts` → 1 test, 0 pass, 1 fail; restored, 1 pass.
  - F5 rewrites a test (it passes before and after); F3 and F6 change comments.

The implementer's runs before the review (2026-11-25, from the repository root):

- `node adrian-rebuild/tools/gate.mjs` → exit 0; tests 1233, pass 1233, fail 0, cancelled 0, skipped 0 (319.2 s, after
  every edit but this file's; tsc and Biome inside it): the 1189 of `HEAD` and 44 new. The run before the last edits
  (`templates/agents.md` trimmed, two sentences of `docs/commands.md`): exit 0, tests 1233, pass 1233, fail 0 (327.0
  s). The run before that: exit 1, tests 1233, pass 1232, fail 1: T-20's matcher scan named the label check that the
  change had moved into `closeRecordedTabs` (`listed.label === recorded.label`), since its exception in
  `test/structure.test.ts` (`MATCHER_EXCEPTIONS`, R-101) held the old text; the exception now holds the new text, a
  failure the change caused in the code the scan reads, not a flaky one. The baseline at `HEAD` before any change:
  exit 0, tests 1189, pass 1189 (295.0 s).
- `node adrian-rebuild/tools/check.mjs` → exit 0, `0 errors`.
- `npx biome check --error-on-warnings adrian-rebuild` → exit 0 (34 files); `npx biome check --error-on-warnings .` →
  exit 0 (280 files).
- The acceptance commands, each alone (`node --test <file>`): AC-1 `test/cli/land.test.ts` exit 0 (22 tests, 22 pass),
  `test/cli/land-refusals.test.ts` exit 0 (13/13); AC-2 `test/cli/ticket.test.ts` exit 0 (15/15),
  `test/cli/abandon.test.ts` exit 0 (26/26); AC-3 `test/job/record.test.ts` exit 0 (48/48), `test/project/lanes.test.ts`
  exit 0 (9/9); AC-4 `test/registry.test.ts` exit 0 (33/33), `test/structure.test.ts` exit 0 (52/52); AC-5
  `test/help.test.ts` exit 0 (11/11), `test/s2-herdr.test.ts` exit 0 (7/7); AC-6 `test/cli/migrate.test.ts` exit 0
  (28/28; the criterion no longer names `test/cli/prune.test.ts`, Deviation 10, `ticket.md` → Decision 24); AC-15
  `test/integrations/herdr.test.ts` exit 0 (14/14), `test/cli/sweep.test.ts` exit 0 (42/42),
  `test/runtime/retiring.test.ts` exit 0 (3/3), `test/job/statistics.test.ts` exit 0 (7/7).
- AC-7 `git grep -q 'throw new Error(' -- src/job/landing.ts` → exit 1; AC-8 `git grep -q 'nothing of their close was
  written' -- src/job/landing.ts` → exit 1; AC-9 `git grep -q '// Review round' -- test/cli/land.test.ts` → exit 1.

## Fails before

After G1 (review round 2), the main session's run: `node adrian-rebuild/tools/fails-before.mjs` → exit 0, with the
same first line as below (the same 16 files; G1's test is in `test/cli/land.test.ts`). Its gate after G1: `node
adrian-rebuild/tools/gate.mjs` → exit 0, tests 1237, pass 1237, fail 0 (313.3 s).

After the fixes of review round 1: `node adrian-rebuild/tools/fails-before.mjs` → exit 0, with the same first line
as below (the same 16 files; the new tests of F1, F2 and F4 are in `test/cli/land.test.ts` and
`test/integrations/herdr.test.ts`).

AC-10: `node adrian-rebuild/tools/fails-before.mjs` → exit 0. Its first line: `fails-before: test/cli/abandon.test.ts,
test/cli/land-refusals.test.ts, test/cli/land.test.ts, test/cli/sweep.test.ts, test/cli/ticket.test.ts,
test/config.test.ts, test/help.test.ts, test/integrations/herdr.test.ts, test/job/landing.test.ts,
test/job/record.test.ts, test/job/statistics.test.ts, test/outcome.test.ts, test/registry.test.ts,
test/runtime/retiring.test.ts, test/s2-herdr.test.ts, test/structure.test.ts fail at HEAD (exit 1)`. Its tail is
`test/structure.test.ts` at `HEAD`: `OUTSIDE_RUNNER` without `land` against the registry, which still has `land`
outside the runner, and T-20's matcher scan, whose new exception text names a line `HEAD` does not have. The tool runs
the 16 files in one `node --test` and reports that run's exit, so it shows that the set fails at `HEAD`, not that each
file does.

Per file, on a copy of `HEAD` with the changed `test/plant.ts` (`node adrian-rebuild/tools/fails-before.mjs test/plant.ts
<file>` → exit 0 for each of `test/cli/land.test.ts`, `test/integrations/herdr.test.ts`, `test/cli/ticket.test.ts`,
`test/job/landing.test.ts`, `test/cli/abandon.test.ts` (25 pass, 1 fail: the tabs), `test/cli/sweep.test.ts` (41 pass,
1 fail: the bound); without `test/plant.ts`: `test/cli/land-refusals.test.ts`, `test/job/record.test.ts`,
`test/runtime/retiring.test.ts` (2 pass, 1 fail: the record without `cleaned`), `test/s2-herdr.test.ts`).
`test/integrations/herdr.test.ts` and `test/cli/ticket.test.ts` fail at `HEAD` as they load, since `closeJobTabs` and
`dayOnlyTime` do not exist there. `test/cli/land.test.ts` on a copy of `HEAD` with every test's own line (the tool's
copy and environment, its output not cut): exit 1, tests 22, pass 9, fail 13. The 13 that fail are the new
mechanisms: the closed and cleaned steps recorded; the rerun after all steps; `HOOK_REJECTED` with the land in `next`
and the branch kept; the rerun after the rejected close; the kept branch; `LOCK_TIMEOUT` with the land in `next`; the
rerun after the failed clean-up; the kill after the branch move; the lost lock after the commit; the three older
records; the tabs in `cleaned`. The 9 that pass are the unchanged ones and the nothing-lost test, a property `HEAD`'s
land also has (T-28 (3) asks for it, not that it fails before).

## Deviations from the ticket

1. **`MERGE_FAILED` is an environment failure (exit 4), with the land in `next`.** The merge is land's first write, and
   no check before it can decide a conflict without `git merge-tree --write-tree` (git 2.38, above the declared 2.36),
   so by T-38 (1), (3) it cannot exit 1, and the runner would make a refusal there `REFUSED_AFTER_VALIDATE` (exit 5).
   T-02 puts git's failures in class 4, as R-037 put `HOOK_REJECTED`. The ticket's "a failed step keeps its class"
   would keep `refused`; the documents settle it the other way, so it is named here for gate 5.3. Land's `refuses`
   and `WITHOUT_CODE_TEST` drop it.
2. The group member check runs on every land, not only while `merged` is not recorded: it is about the caller, and it
   comes before the job is resolved, as at `HEAD`. The job's own checks (done, branch, base) and the merge's guard
   only the merge, as `## Change` (b) lists them.
3. `JOB_NO_BRANCH` and `TICKET_CHECK_FAILED` are existing codes of the same facts, kept for T-18 (one word per thing)
   rather than new names. Since a change command now declares `TICKET_CHECK_FAILED`, the snapshot scan of T-38 holds
   `limen ticket check`'s two tests of it too, which now compare the snapshot (the scan knows a test's command only by
   its code).
4. `LAND_CANCELLED` arises between `validated` and `apply`, where D-096 (3) (c) puts the question, before any write;
   the other refusals arise in `validate`.
5. With no Herdr the job's close prints one line of the sweep's form (Decision 21), not `herdr skipped: herdr is not
   available` (`## Change` (d)), and only in the output, not the job's log, so a run again of `abandon` leaves the
   snapshot as it was.
6. `ticket done`'s failure in its marker step names the same `ticket done` in `next` (it names none at `HEAD`), since
   that run again goes on with the markers (T-38 (3), `## Change` (e)).
7. The steps' line says `with no closing commit` for `closed: null`, rather than "that nothing closed": in a project
   root that is no Git repository (a workspace) the close moves the folders and makes no commit.
8. On a land run again after its merge, the close's features come from the record's commits, as `limen ticket done`
   reads them, since the branch's commits are then on the target and `HEAD..branch` names none.
9. `test/cli/land-refusals.test.ts` keeps s5's two tests that are no refusals (the conflict, now `MERGE_FAILED`, and
   the fast-forward and merge success), so no test of the moved file is lost.
10. AC-6 names `test/cli/prune.test.ts`, which R-101 removed with `limen prune`; `node --test` of a missing file exits
    1. Retire's tests are in `test/runtime/retiring.test.ts` and `test/cli/sweep.test.ts` (AC-15).
11. Review round 1, F2: a tab that Herdr no longer lists gives the job's log `herdr tab close <tab>: already closed`
    and no output line. The output keeps R-101's forms (Decision 21), which name a tab that closed or that stays open;
    a tab already gone is neither, so the close prints nothing for it, as R-101's sweep printed nothing, and only the
    log says it.

## Unmeasured

- The tab close on the real Herdr (land's `cleaned`, `ticket done`, `abandon`, the sweep's mark and bound): seat only,
  `## Deployment` step 3.9; no M-NN of `## Measurement` covers it.
- The coordinator's manual (`templates/agents.md`: two bullets): its size is M-01, and whether the coordinator runs
  a land again from its `next` is behaviour of the model (M-05).

## Open points

1. Risk 3 holds: a closing subject edited by hand is not found, and the close runs again.
2. A tab Herdr renamed away from the job's label (by a person) is neither closed nor marked, so the sweep asks about it
   once a day; Decision 23 (a) marks only a closed or unlisted tab.
3. Review round 2, G1: a record that `limen ticket done` or the migration marked (`landed` and no `land`) whose
   `landed.sha` is itself a commit with a closing subject is recorded as `closed` by that commit (Change (c)). When
   that commit is a job's own commit that a fast-forward landed and that carries a closing subject, the land records
   it and closes no ticket. The case stays as `ticket.md` → G1 decides; a rule for it would have to tell a job's
   commit from a close made by `ticket done` or by a land before R-103, which the record does not say.
4. Review round 3, note 1 (D-092, the rounds spent): `closeStep`'s doc comment (`src/job/landing.ts:265-266`) still
   calls `landsOwnClose` "the migration's rule", while after G1 it is the migration's reading narrowed to a commit after
   the merge; the main session corrected the same words in `docs/commands.md`. Recommended: the comment fixed by the
   next ticket that touches `src/job/landing.ts` (R-054 or R-071).
5. Review round 3, note 2: G1's filter runs for the closing commit of every land in HEAD's history, not only this
   job's (`landClosingCommits` filters before it keys by job, `src/project/lanes.ts:186-187`), so each land's `closed`
   step makes one `git merge-base --is-ancestor` per earlier land, and `closeFailure` repeats it (50 calls took
   0.073 s in this repository). Recommended: test the job's id first, in the same next ticket.
6. Review round 3, note 3: `isAncestor` fails with `GIT_FAILED` when Git no longer holds `merged.sha` (a target
   rewritten and pruned), so a land run again on such a record ends with exit 4 and `next` the same land each time,
   once HEAD's history holds any land closing commit; before G1 it went on to the close. Nothing is lost, but the job
   cannot reach `cleaned`, and retire keeps its record (Change (h)). It needs the target's history rewritten and the
   merged commit pruned, which no Limen command does. Recommended: a merged commit Git does not hold counts as no closing commit
   (the close runs, and refuses or closes nothing), in the same next ticket; for Adrian at gate 5.3.
