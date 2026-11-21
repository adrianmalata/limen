<!-- PL: Wynik R-092 (21.11, wieczorem; po trzech rundach recenzji): powstał wspólny kształt operacji
`src/operation.ts` (validate z widokiem tylko do odczytu, apply pod blokadą po ponownym odczycie trzymanych faktów,
STATE_CHANGED z kodem 3 przed pierwszym zapisem, a błąd po pierwszym zapisie nigdy nie jest odmową), wspólna migawka
`test/snapshot.ts`, test typu, testy wyścigu i zapadka T-38. Dziewięć poleceń (spawn, continue, stop, ticket done,
picture build, group start, group stop, github review, github work) przechodzi przez runner, ich odmowy mają własne kody,
a licznik UNTYPED spadł z 218 do 110. Runda 1 recenzji dodała typowanie złej nazwy gałęzi i pliku zadania, bramkę
GitHuba jako pierwszy zapis po ponownym odczycie, dołączanie błędów sprzątania, ponowny start zespołu, którego zadanie
nigdy nie ruszyło, foldery projektu w migawce i testy odmów na migawce bez żywych zapisujących. Runda 2: typowane
trasy wybudzenia, odczyt mapy i błąd gita, osłona runnera na zwykły Error w validate (CHECK_FAILED), trasa continue
w validate, polecenie do ponowienia w next dla STATE_CHANGED, run.json grupy zapisany w całości. Runda 3: PASS
z sześcioma uwagami; cztery uwagi z kodem czekają na pytanie Q-26. Stan: zamknięty (done). -->

# R-092 outcome

## Done

(a) The mechanism, `src/operation.ts` (T-25, T-38):
- `StateView`, the read view `validate` gets: `record`, `jobs`, `exists`, `text` and `hold`. It has no method that
  writes. `hold(what, read)` returns what `read` answers now and keeps it with its name.
- `Operation<Plan, Applied>`: `validate(view): Promise<Plan | Refusal>`, an optional `lock(plan)` of the shared lock
  module (`src/lock.ts`), `apply(plan)`, and `again`, the command line of a rerun (the `next` of `STATE_CHANGED`).
- The runner: `validated(operation)` runs `validate` and throws a refusal it returns, so nothing is written; its
  `apply()` takes the lock, reads every held fact again, and only then runs `apply`. A fact that answers otherwise, or
  that refuses now, ends the command in `STATE_CHANGED` (class `transient`, exit 3) before the first write.
  `runOperation` is both in one call. An operation that holds a fact and names no lock is an internal error
  (`OPERATION_UNLOCKED`), and a second `apply()` too (`OPERATION_APPLIED`).
- T-38 (3) in code: `stepFailure` turns a failure after validate into one that exits 3, 4 or 5. A typed refusal there
  is a defect, internal `REFUSED_AFTER_VALIDATE`; an untyped one, which git or the file system gives as a plain
  `Error`, is environment `STEP_FAILED`. The runner applies it to every `apply`, and each command to its steps after
  the lock.
- `operationHandler(handler)` marks a registry handler as going through the runner; a run of it that returns without
  reaching `validated` is an internal error (`OPERATION_SKIPPED`), so the mark the ratchet reads cannot stay on a
  handler that bypasses the shape. It keeps the handler's name, by which `test/structure.test.ts` finds its file.
- `src/outcome.ts` gets the `Refusal` type and the constructors `refused`, `usageError` and `environmentError`.
- `cleanedUp(error, cleanup)` (review round 1, finding 7): after a failed step, the cleanup that undoes it runs; a
  cleanup that fails too is added to the step's failure (same class, code and `next`, both messages, both values in an
  `AggregateError` as the cause), never swapped in (T-01). Spawn (the review's branch, the failed job's finalize),
  continue (the job folder after a failed restore, the finalize), group start (the start's step record) and the GitHub
  handoff (the gate) use it.

(b) The type test: `validateThatWrites` and `writingOperation` in `test/operation.test.ts`, part of `npx tsc --noEmit`.
Six writes on the view (`write`, `transition`, `mkdir`, `rename`, `remove`, `append`) and one in an operation's
`validate`, each under `@ts-expect-error`.

(c) The shared snapshot `test/snapshot.ts` with `test/snapshot.test.ts`: the git refs and HEAD, `git worktree list
--porcelain`, the folder of job worktrees beside the repository (which `traces()` missed), `git status --porcelain
--untracked-files=all`, every folder of the project outside `.git` (an empty new folder, which git's status does not
show; review round 1, finding 11), and path to SHA-256 of `.limen/` and `spec/`; `also` names more folders (`.git/hooks` for the
old `picture watch`). `traces()` of `test/s1-spawn.test.ts`, and `snapshot()` and both `traces()` of
`test/cli/old-names.test.ts` give way to it.

(d) The race tests (`test/operation.test.ts`): a spawn validated, then a commit on main, then its apply: exit 3
(`STATE_CHANGED`) and the snapshot taken after the commit is identical after the apply; a `ticket done` validated,
then its ticket edited and committed, then its apply: the same. The lock of both is a file in `.limen/`, which exists,
so the lock leaves nothing behind; the test says so.

(e) The nine commands go through the runner; per command, below, what validate checks and what follows the lock.
- spawn (`src/job/spawning.ts`): every check of the author's spawn now runs in `validate`, in its order, with the
  worktree chosen before the job has an id (`WorktreeChoice`). Held facts: the base commit, and with `--branch` the
  branch's worktree choice (a branch that gains a live job, a worktree or a commit in between is a change); a worker's
  free slot in its group. The apply, under the jobs lock (`jobsLock`, `newJobId` in `src/job/reference.ts`): the job's
  id, its member slot (`claimMember`, whose re-check under the cabinet lock now ends in `STATE_CHANGED`), the folder
  of job worktrees, the GitHub review's branch (`branchAt`), the published record. Then, as before, the worktree and
  the wrapper; a failure there ends the job `failed` with the reason (T-38 (3)). In a group the launch lock is taken
  after validate. A new worktree is made at the base commit validate checked, not at `HEAD` again. Review round 1: a
  `--branch` that git takes for no branch name (`git check-ref-format --branch`) is the usage error `BAD_BRANCH`; a
  `--task-file` that is a folder is `BAD_TASK_FILE` (2), one the system does not let Limen read is
  `TASK_FILE_UNREADABLE` (4, T-02: permissions); an extension path read from a record (a group's run) that no longer
  holds is the refusal `EXTENSION_GONE` (1), and the usage error `BAD_EXTENSION` stays for the command line.
- continue (`src/job/continuation.ts`): every check in `validate`, the parent's gone worktree and branch (`:194` at
  `07ec41b`) and a member's slot included; held facts: the parent's worktree or branch, the live jobs on a group
  worker's worktree, the slot. The apply: the id, the slot, the record; then the restored worktree and the wrapper.
- stop (`src/job/stopping.ts`): validate resolves the job and refuses a running job with no pid; it holds the state.
  The apply writes the "stop requested" line under the job's lock. The later writes are the record's own
  compare-and-swap transitions, as before. The tests' seam `requested` (D-029's precedent) runs between the first
  write and the first transition.
- ticket done (`src/project/ticket-folders.ts`, `src/project/lanes.ts`): `planTicketClose` reads and refuses,
  `applyTicketClose` moves, rewrites, regenerates the board and commits; `closeTickets` (land's) is the two in a row,
  so land behaves as before. Validate refuses a number with no active ticket before any move (D-061) and holds the
  tickets it found; the apply runs under a lock of the ticket lanes (`.limen/ticket-lanes`).
- picture build (`src/picture/picture-check.ts`): validate reads the map and refuses on `--strict`; the apply writes
  the `--json` model, one atomic effect, with no fact to read again, so no lock. A refused build writes no file and
  its counts line names none.
- group start (`src/job/group-control.ts`): every check of the start in validate, each team's spawn validated against
  the planned run, before `run.json`; it holds the feature's open run. The apply, under the cabinet lock, writes the
  run. The team jobs follow under the run's start lock, each a step that `run.json` records as the team's member; a
  team whose spawn fails is recorded as the run's optional `startFailure`, and the start exits with
  `GROUP_PARTIAL_START` and the same command in `next`. That command run again finds the open run and starts the
  teams with no first-round job (D-061, T-38 (3)); `activation-error.json` is gone; `group status` shows the failure.
  Review round 1, finding 9: a team whose first-round job never ran (no record, or a record that ended without ever
  running: `neverRan` in `src/job/group-cabinet.ts`, from its transitions) is still to start, and the rerun's spawn
  takes that member's slot back (`replaces`; `claimMember` reads under the cabinet lock that the member still never
  ran). The old member stays in the roster as the failed job it is; the round driver reads each team's newest member
  (`findLast`), so the new job is the team's job of the round.
- group stop: validate refuses a caller that is not the lead; the apply sets the stopped flag under the cabinet lock.
  Its steps (the launch lock, the slots, the member stops, `stop-report.json`) are idempotent; a member it cannot
  confirm stopped ends it in `GROUP_STOP_INCOMPLETE`, transient, with `limen group stop <id>` in `next`.
- github review and github work (`src/integrations/github-claims.ts`): `handOffClaim` keeps `deliver` alone; the jobs
  go through `startClaimJob`. Validate makes the claim's checks and the spawn's (`checkedSpawn`) before the handoff
  gate. For a review, `fetchPinnedReview` compares the PR's base and head with `git ls-remote`, then fetches both
  commits with `--no-write-fetch-head --refmap=`, so no ref and no `FETCH_HEAD` is written (checked on git 2.56.1 in
  a scratch repository and by `test/integrations/github-claims.test.ts`); the review's branch is made by the spawn's
  apply. Review round 1, finding 6: the gate (`HandoffGate`) is the first write of the spawn's apply, after its re-check
  under the jobs lock, so `STATE_CHANGED` or `LOCK_TIMEOUT` there ends the handoff before it writes anything, and an
  existing gate is `STATE_CHANGED`. A failure after the gate and before a job record answers the claim removes the
  gate and the folder of gates when this handoff made it (`cleanedUp`), and the spawn's apply removes the branch it
  made, so no recovery by hand is needed. The started job's id comes from the spawn, so no `matchedGithubJob` runs
  after the gate and no `GITHUB_CONFLICT` can come after a write; the conflict refuses in validate.

Typed refusals: the throws on the nine commands' paths are typed, in the domain modules and in the helpers they share
(`src/project/git.ts`, `src/runtime/engine.ts`, `src/runtime/worker-extensions.ts`, `src/job/job.ts`,
`src/runtime/start-queue.ts`, `src/job/group-cabinet.ts`, `src/integrations/github-review.ts`, `src/job/watching.ts`,
`src/picture/dataset.ts`). Untyped `throw new Error(` in `src/` and `hook/`: 218 at `HEAD`, 106 now;
`UNTYPED_THROWS` is 106.

How it was checked that no plain `Error` leaves the nine commands' `validate` (review round 2, finding 1), in two parts:
- By construction: the runner turns a plain `Error` thrown in `validate`, or by a held fact read again under the lock,
  into the environment's `CHECK_FAILED` (exit 4), and keeps a typed failure as it is (`checkFailure` in
  `src/operation.ts`; tests `CHECK_FAILED: …` in `test/operation.test.ts`). Node's own system errors (a file read
  that EACCES or EIO fails, a child that cannot start) are such plain errors; no read of the checks ends `UNTYPED`.
  After validate, `stepFailure` does the same for every step, the lock's own acquisition included (the runner's
  `withLock`, spawn's and continue's launch lock, the group start lock).
- By audit of the author's untyped throws, so that the guard catches no refusal: every one of the 106
  `throw new Error(` sites left in `src/` was listed (`grep -n 'throw new Error(' -r src hook`) and read with its
  function and that function's callers. Those on the paths were typed: `src/job/watching.ts:21` and `:35` (spawn,
  continue, group start: `UNSAFE_PI_SESSION_ID`, `UNSAFE_HERDR_PANE_ID`, environment: Pi and Herdr set them),
  `src/picture/dataset.ts:12` (`PICTURE_NOT_A_FOLDER`, `PICTURE_NO_MAP`, `PICTURE_UNREADABLE`) with `mapFolder`, and
  `requireGit` (`GIT_FAILED`). The rest belong to other commands or to steps after the lock: `github-claims.ts`
  (deliver, ensure, resolve, connect; review and work validate through `readBinding`, `originRepository` and
  `assertUnprivileged`, all typed), `landing.ts`, `keeper.ts`, `herdr.ts` (the job's tab, opened in the launch step),
  `ticket-folders.ts` (ticket new), `github-poller.ts`, `steer-delivery.ts`, `steer-inbox.ts`, `setup.ts`, `rule.ts`,
  `watching.ts:81` (watch), `group-events.ts` (publish), `group-control.ts` (status, close), `contain.ts` (stop's
  steps after its first write), `finalize.ts` (a side failure of the finalize), `job.ts` (`parseJob`, status),
  `hunk.ts` (diff), `launcher.ts` (the launch step), `board-jobs.ts`, `ticket-check.ts`, `picture-serve.ts`,
  `github-doctor.ts`, `wrapper.ts`, `stalled-tool.ts`, `config.ts` (an unknown name, a defect) and the moved
  commands. A `JSON.parse` of a damaged `run.json` throws a `SyntaxError`, an internal error (exit 5), never `UNTYPED`.

(f) The ratchet, `test/structure.test.ts`: `OUTSIDE_RUNNER`, the 18 change commands without `movedBy` whose handler
`operationHandler` did not make; the test fails when the set of such commands differs from the list in either
direction. Its comment names R-082.

(g) Docs: `docs/commands.md` (the exit-code table, a paragraph on the nine commands' shape, `ticket done`'s refusals,
`picture build --strict --json`), `docs/groups.md` (a partial start and its rerun, the stop's failure), `docs/remote.md`
(the review fetch, which leaves the commits' objects but no ref and no `FETCH_HEAD`, and the gate as the spawn's first
write). No role text of `templates/` names these mechanisms (`templates/agents.md:40` says the
review "verifies the pinned head and base", which holds).

### Codes per command (AC-17)

Exit 2 is `usage`, 1 `refused`, 4 `environment`, 3 `transient`, 5 `internal`. Every command also has the parser's
`BAD_ARGUMENT`, `CHECK_FAILED` (4) for a failed read of its checks, and, after validate, `STEP_FAILED` (4) and
`REFUSED_AFTER_VALIDATE` (5); each `STATE_CHANGED` names the same command in `next`. A git failure on any path is
`GIT_FAILED` (4).

| Command | Codes |
|---|---|
| spawn | 2: `BAD_ROLE`, `REVIEW_WITH_ROLE`, `PIN_WITHOUT_REVIEW`, `BAD_LABEL`, `TITLE_TWICE`, `NO_TASK`, `BAD_TASK_FILE`, `BAD_BRANCH`, `BAD_DURATION`, `BAD_PRIORITY`, `BAD_ENGINE`, `REMOVED`, `BAD_EXTENSION`, `GROUP_ROUTE`, `GROUP_LAUNCH_FLAGS`, `GROUP_EXTENSIONS`, `REPO_REQUIRED`, `REPO_OUTSIDE_WORKSPACE`, `BAD_REPO`, `BAD_COMMIT`, `ROLE_UNKNOWN`, `REVIEW_NEEDS_BRANCH`, `BAD_GROUP_ID`, `GROUP_NOT_FOUND`; 1: `SPAWN_LEAD_ROLE`, `GROUP_WORKER_SPAWN`, `GROUP_CONTEXT`, `GROUP_ROSTER`, `GROUP_OTHER_LEAD`, `GROUP_RECORD`, `GROUP_NO_ROUTE`, `GROUP_REVIEW_BRANCH`, `NOT_A_PROJECT`, `NO_COMMIT`, `BRANCH_MISSING`, `BRANCH_EXISTS`, `BRANCH_IN_PRIMARY`, `BRANCH_LIVE_JOB`, `REVIEW_HEAD_MOVED`, `TICKET_NOT_AT_BASE`, `GROUP_CLOSED`, `GROUP_TEAM_UNKNOWN`, `GROUP_ALLOWANCE`, `GROUP_NO_TIME`, `EXTENSION_GONE`, `RECORD_EXTENSIONS`; 4: `ENGINE_MISSING`, `BRIDGE_MISSING`, `GIT_FAILED`, `UNSAFE_PI_SESSION_ID`, `UNSAFE_HERDR_PANE_ID`, `NOT_MIGRATED`, `WRAPPER_NOT_READY`, `TASK_FILE_UNREADABLE`; 3: `STATE_CHANGED`, `LOCK_TIMEOUT` |
| continue | 2: `NO_INSTRUCTION`, `BAD_LABEL`, `BAD_DURATION`, `BAD_PRIORITY`, `JOB_NOT_FOUND`, `JOB_NOT_EXACT`, `JOB_TOKEN_SHARED`, `GROUP_LAUNCH_FLAGS`, `GROUP_ROUTE`, `GROUP_EXTENSIONS`, `ENGINE_MISMATCH`, `BAD_ENGINE`, `BAD_EXTENSION`, `BAD_REPO`; 1: `JOB_OTHER_TEAM`, `GROUP_ROSTER`, `GROUP_CONTEXT`, `GROUP_TEAM_JOB`, `GROUP_NOT_ALLOWED`, `GROUP_NO_ROUTE`, `JOB_NOT_FINISHED`, `JOB_NO_WORKTREE`, `JOB_NO_BRANCH`, `JOB_NO_SESSION`, `LIVE_CONTINUATION`, `GROUP_EXTENSIONS_PARENT`, `RECORD_EXTENSIONS`, `GROUP_GONE`, `RECORD_GROUP_ID`, `ENGINE_UNKNOWN`, `REMOVED`, `ROLE_UNKNOWN`, `JOB_TREE_GONE`, `GROUP_CLOSED`, `GROUP_TEAM_UNKNOWN`, `GROUP_ALLOWANCE`, `GROUP_NO_TIME`, `NOT_A_PROJECT`, `EXTENSION_GONE`; 4: `ENGINE_MISSING`, `BRIDGE_MISSING`, `UNSAFE_PI_SESSION_ID`, `UNSAFE_HERDR_PANE_ID`, `GIT_FAILED`, `WRAPPER_NOT_READY`; 3: `STATE_CHANGED`, `LOCK_TIMEOUT` |
| stop | 2: `JOB_NOT_FOUND`, `JOB_NOT_EXACT`, `JOB_TOKEN_SHARED`; 1: `JOB_OTHER_TEAM`, `JOB_NO_PID`; 3: `STATE_CHANGED`, `JOB_PID_PENDING`, `LOCK_TIMEOUT` |
| ticket done | 2: `BAD_DATE`; 1: `NO_ACTIVE_TICKET`, `TICKETS_UNCOMMITTED`, `GROUP_CONTEXT`, `NOT_A_PROJECT`; 3: `STATE_CHANGED`, `LOCK_TIMEOUT` |
| picture build | 1: `PICTURE_INVALID`, `PICTURE_NO_MAP`, `PICTURE_NOT_A_FOLDER`, `NOT_A_PROJECT`; 4: `PICTURE_UNREADABLE`, `CHECK_FAILED` |
| group start | 2: `BAD_TEAM`, `BAD_TEAM_EXTENSION`, `BAD_FEATURE`, `NO_TEAM`, `BAD_ROUND`, `FINAL_NOT_LAST`, `BAD_WORKERS`, `BAD_DURATION`, `GROUP_TIMEOUT_SHORT`, `BAD_ENGINE`, `REMOVED`, `BAD_EXTENSION`, and each team spawn's usage codes; 1: `GROUP_LEAD_ONLY`, `GROUP_NO_LEAD`, `GROUP_LEAD_HOOK`, `GROUP_PACKET_MISSING`, `GROUP_PACKET_UNCOMMITTED`, `GROUP_RUN_LIVE`, `NOT_A_PROJECT`, and each team spawn's refusals; 4: `ENGINE_MISSING`, `BRIDGE_MISSING`, `UNSAFE_HERDR_PANE_ID`, and each team spawn's, such as `NOT_MIGRATED`; 3: `STATE_CHANGED`, `LOCK_TIMEOUT`; `GROUP_PARTIAL_START` with the class of the team's failure (3, 4 or 5) |
| group stop | 2: `NO_GROUP`, `BAD_GROUP_ID`, `GROUP_NOT_FOUND`; 1: `GROUP_LEAD_ONLY`, `GROUP_OTHER_LEAD`, `GROUP_CONTEXT`, `GROUP_ROSTER`; 3: `GROUP_STOP_INCOMPLETE`, `LOCK_TIMEOUT` |
| github review | 2: `BAD_CLAIM`, `BAD_ROOT`, and spawn's usage codes; 1: `GITHUB_PRIVILEGED`, `GITHUB_DISCONNECTED`, `GITHUB_BINDING`, `GITHUB_ORIGIN`, `GITHUB_NO_CLAIM`, `GITHUB_CLAIM_MISMATCH`, `GITHUB_NOT_COORDINATOR`, `GITHUB_ISSUE_REVIEW`, `GITHUB_CONFLICT`, `GITHUB_HANDOFF_GATE`, `GITHUB_BASE_MOVED`, `GITHUB_HEAD_MOVED`, `BRANCH_EXISTS`, and spawn's refusals; 4: `GITHUB_GIT` and spawn's; 3: `STATE_CHANGED`, `LOCK_TIMEOUT` |
| github work | as review without `GITHUB_ISSUE_REVIEW`, the two `_MOVED` codes, `BRANCH_EXISTS` and `GITHUB_GIT`, and with 2: `NO_TASK` |

## Proof

From the repository root, on the working tree at `972c782` with this change:
- `node adrian-rebuild/tools/gate.mjs` → exit 0; `tsc --noEmit` and `biome check --error-on-warnings .` pass, and
  `node --test`: tests 646, pass 646, fail 0, cancelled 0, skipped 0 (124 s). After the fix of deviation 10, once more:
  exit 0, 646 of 646 (125 s). The gate before it, on the same change
  without the four updates of deviation 6, failed 4 of 646: exactly those four tests, each on the old code it
  asserted; none of them is outside the code this change touches.
- After review round 2's fixes: `node adrian-rebuild/tools/gate.mjs` → exit 0: tests 676, pass 676, fail 0,
  cancelled 0, skipped 0 (135 s). Before it, in the gate's environment, the changed and affected files (those of round 1
  with `test/project/git.test.ts`, `test/s5-land.test.ts`, `test/cli/land.test.ts` and `test/s6-keeper.test.ts`): 238
  tests, 231 pass, 6 fail, the defects of deviation 22 (`PICTURE_NOT_A_FOLDER`'s test and s8's first test, whose
  failure the five later tests of s8 follow, as they read its roster); after their fixes, `test/cli/picture.test.ts`,
  `test/s8-groups.test.ts`, `test/cli/group.test.ts` and `test/group-extensions.test.ts`: 34 of 34, then
  `test/cli/group.test.ts` with the rewritten rerun test: 18 of 18.
- After review round 1's fixes: `node adrian-rebuild/tools/gate.mjs` → exit 0: tests 663, pass 663, fail 0, cancelled 0, skipped 0 (133 s). The changed and affected files
  first, in the gate's environment: `test/operation.test.ts`, `test/snapshot.test.ts`, `test/s1-spawn.test.ts`, the CLI
  tests of spawn, continue, stop, ticket, picture, group, github, old-names and old-hosted, `test/parser.test.ts`,
  `test/group-extensions.test.ts`, `test/s8-groups.test.ts`, `test/s10-doorbell.test.ts`, `test/structure.test.ts`,
  `test/integrations/github-claims.test.ts` and `test/job/group-cabinet.test.ts`: tests 211, pass 211, fail 0.
- `node adrian-rebuild/tools/check.mjs` → exit 0 ("0 errors").
- `npx biome check --error-on-warnings adrian-rebuild` → exit 0; `npx biome check --error-on-warnings .` → exit 0.
- AC-2 to AC-13: each file ran in the gate's environment (`gateEnv` of `adrian-rebuild/tools/gate-env.mjs`, as the gate
  runs it) and passed: `test/operation.test.ts` (11), `test/snapshot.test.ts` (9), `test/s1-spawn.test.ts`,
  `test/cli/spawn.test.ts` (8), `test/cli/continue.test.ts`, `test/cli/stop.test.ts` (3), `test/cli/ticket.test.ts`,
  `test/cli/picture.test.ts`, `test/cli/group.test.ts`, `test/cli/github.test.ts`, `test/cli/old-names.test.ts`,
  `test/structure.test.ts` (41), with `test/s8-groups.test.ts` (6), `test/s10-doorbell.test.ts`,
  `test/integrations/github-claims.test.ts` (3) and the four files of deviation 6. A plain `node --test
  test/cli/github.test.ts` outside that environment fails its `github poll` tests at `HEAD` too: the poller refuses a
  package under the world-writable `/tmp` ("unsafe owner or permissions on /tmp"), which is why the gate sets a private
  `TMPDIR` (D-034's lesson).

## Fails before

`node adrian-rebuild/tools/fails-before.mjs` → exit 0 in the implementer's runs and in the main session's runs (2026-11-21): after the fix of the gate failure and after review round 1's fixes with the 17 files below; after review round 2's fixes with `test/project/git.test.ts` as an 18th (its first line then: "fails-before: test/cli/continue.test.ts, test/cli/github.test.ts, test/cli/group.test.ts, test/cli/old-hosted.test.ts, test/cli/old-names.test.ts, test/cli/picture.test.ts, test/cli/spawn.test.ts, test/cli/stop.test.ts, test/cli/ticket.test.ts, test/group-extensions.test.ts, test/parser.test.ts, test/project/git.test.ts, test/s1-spawn.test.ts, test/s8-groups.test.ts, test/structure.test.ts, test/integrations/github-claims.test.ts, test/operation.test.ts, test/snapshot.test.ts fail at HEAD (exit 1)"). The first line of the earlier runs:

```
fails-before: test/cli/continue.test.ts, test/cli/github.test.ts, test/cli/group.test.ts, test/cli/old-hosted.test.ts, test/cli/old-names.test.ts, test/cli/picture.test.ts, test/cli/spawn.test.ts, test/cli/stop.test.ts, test/cli/ticket.test.ts, test/group-extensions.test.ts, test/parser.test.ts, test/s1-spawn.test.ts, test/s8-groups.test.ts, test/structure.test.ts, test/integrations/github-claims.test.ts, test/operation.test.ts, test/snapshot.test.ts fail at HEAD (exit 1)
```

Its tail shows the cascade of `test/s8-groups.test.ts` (each later test there reads the roster of the slot test,
which fails at `HEAD`) and `test/structure.test.ts`, which cannot load `throughRunner`. A second run of the same
files at `HEAD`, kept whole (a scratch copy of the tool's steps), gave 140 tests, 98 pass, 41 fail. These new or
changed tests fail at `HEAD`, each for the reason its name gives: the race tests and all of
`test/operation.test.ts` (no `src/operation.ts`); `test/integrations/github-claims.test.ts` (no
`fetchPinnedReview`); the T-38 ratchet and the lowered `UNTYPED_THROWS` of `test/structure.test.ts`;
`REVIEW_HEAD_MOVED`, `REVIEW_NEEDS_BRANCH`, `BRANCH_MISSING`, `BRANCH_IN_PRIMARY`, `GROUP_ALLOWANCE` and s1's
refusal test (the folder of job worktrees, the launch lock's folder, the member slot, and `UNTYPED` or exit 1);
`BRANCH_LIVE_JOB` (`UNTYPED`, and the folder of job worktrees: `worktreeFolder` `[]` against `null`); `JOB_TREE_GONE` (the launch lock's folder and the slot); `JOB_NO_PID` (the log line);
the stop race test (no seam, so no signal); `NO_ACTIVE_TICKET` (the moves and the commit), `TICKETS_UNCOMMITTED`,
`BAD_DATE`; `PICTURE_INVALID` with `--json` (the model file); `GROUP_NO_LEAD`, `GROUP_LEAD_ONLY`,
`GROUP_STOP_INCOMPLETE` (exit 1), `GROUP_PARTIAL_START` (the start succeeded), the rerun test (no team started),
the old-run status test (no `Start:` line); `BAD_ENGINE` and `GITHUB_ISSUE_REVIEW` of the GitHub jobs, and
`LOCK_TIMEOUT` (the gate stayed); the four tests of deviation 6 and s8's slot test (the old codes).

New or changed tests that pass at `HEAD`, with the reason:
- the nine tests of `test/snapshot.test.ts`: they test the shared helper in `test/`, which the copy of `HEAD` gets
  with the tests; no source changes under them;
- the tests of `test/cli/old-names.test.ts` that moved onto the shared snapshot (webhook, linear, planning and its
  kin, ticket series, `continue --review`, `group status --json`, picture tick and watch, `picture build --out`,
  `spawn --role picture|scout`, continue of a picture or scout job, the removed engine, the `--tab` refusals): a
  removed name refuses before any write at `HEAD` too; the change is the snapshot they compare (T-38 (4));
- the two removed-engine tests of `test/cli/continue.test.ts`, `JOB_NOT_EXACT` of `test/cli/stop.test.ts` and the
  first `PICTURE_INVALID` test: their refusals come before any write at `HEAD` too; they now compare the snapshot;
- `ticket done moves the ticket to its month …` and `picture build --json of a map with no error …`: success tests
  (gate 2 §6; D-061's "the --json file included" from the other side), whose behaviour the change keeps;
- s8's concurrent-activation test: its assertion now also admits `STATE_CHANGED`, and at `HEAD` both starts exit 0,
  which it admits too.

After review round 1 (a run of the same kind, kept whole, of every changed test file at `HEAD`: 154 tests, 99 pass,
55 fail), these new or changed tests fail at `HEAD` for the reason their names give: `BAD_BRANCH` (a job folder and
its worktree folder, exit 1), `BAD_TASK_FILE` and `TASK_FILE_UNREADABLE` (`UNTYPED`, exit 1), `GROUP_REVIEW_BRANCH`,
`GROUP_WORKER_SPAWN` and the continuation's `GROUP_ALLOWANCE` (the launch lock's folder or `UNTYPED`), `NOT_MIGRATED`
of group start (`run.json` and `activation-error.json`, exit 1), the rerun of a team whose job never ran (no team
started), the `Start:` line test, `GROUP_STOP_INCOMPLETE` (exit 1), `GITHUB_CONFLICT` (`UNTYPED`), `LOCK_TIMEOUT`
and `STEP_FAILED` of the GitHub job (the gate stayed), the GitHub rerun (the gate blocked it), the stale lead of s8
(`UNTYPED`), `EXTENSION_GONE` of the repeated start (exit 2), the parser's running continue (now with the snapshot) and
all of `test/operation.test.ts` (the key set and the cleanup tests among them). Four new or changed ones pass at
`HEAD`, each by what it checks:
- `a new empty folder in the project …` and `a changed file under spec/ …` (renamed) of `test/snapshot.test.ts`: they
  test the shared helper, which the copy of `HEAD` gets with the tests;
- `group status of a run written before R-092 shows the lines it showed before` (T-29's split of the old-run test):
  the compatibility of the step record, which `HEAD` has by construction;
- `group stop run again after GROUP_STOP_INCOMPLETE takes the same steps and ends the same way` (T-29's split of the
  stop test): `HEAD`'s stop was idempotent too (exit 1 twice, the same report); its sibling checks the class.

After review round 2 (the same kind of run at `HEAD`: 166 tests, 102 pass, 64 fail), every test new in this round
fails at `HEAD` for the reason its name gives: the `UNSAFE_PI_SESSION_ID` and `UNSAFE_HERDR_PANE_ID` tests of spawn,
continue and group start (`UNTYPED`; continue's and group start's also a slot in `run.json` or the cabinet lock's
folder), `GROUP_GONE` and `GROUP_EXTENSIONS_PARENT` (`UNTYPED`, the second also the launch lock's folder),
`PICTURE_NOT_A_FOLDER` (`UNTYPED`), `GIT_FAILED` (a plain `Error`), `JOB_PID_PENDING` (a refusal with no `next`), both
`GROUP_PARTIAL_START` tests, and in `test/operation.test.ts` the `CHECK_FAILED` tests, the step's `STATE_CHANGED` with
its command, and the spawn race test's `next`. The two other tests of `test/project/git.test.ts` are unchanged.

The `github poll` tests of `test/cli/github.test.ts` fail in both copies of `HEAD`, unchanged: the copies live under
`/tmp`, which the poller refuses for its package (see Proof); they pass in the gate.

## Deviations

1. A missing engine binary and a missing bridge package at spawn are class `environment`, exit 4 (`ENGINE_MISSING`,
   `BRIDGE_MISSING`), not refusals: T-02 names "a missing tool" as 4, and T-12 (2) calls such a check "a refusal with
   exit code 4". The ticket's `## Migration` lists only 1 to 2 and `UNTYPED` to own codes; `test/s1-spawn.test.ts`
   now expects 4 for both.
2. The R-021 race test of `test/cli/stop.test.ts` held the job's lock to delay the stop's terminal transition and
   waited for the "stop requested" line. The stop now writes that line under the job's lock after its re-check
   (T-38 (2)), so the test uses the seam `requested` of `stopJob` between the first write and the first transition,
   as `src/lock.ts`'s `pause` does (D-029); its assertion is unchanged.
3. Two assertions of `test/s8-groups.test.ts` follow T-38 (2): of two concurrent `group start`s, one that found no run
   while the other wrote one exits 3 with `STATE_CHANGED` (either way one roster in one cabinet); of two workers racing
   for one slot, both found it free in validate, so the loser exits 3 with `STATE_CHANGED`, not 1.
4. `test/cli/stop.test.ts`'s `JOB_NOT_EXACT` test compared the record's bytes; it now compares the shared snapshot.
5. The spawn and ticket done race tests run the operations in the test's process (T-26 (5)): `checkedSpawn` and
   `startChecked`, and the new `ticketDoneOperation`, which `closeDoneTickets` runs.
6. Four existing tests assert the migrated codes (`## Migration`): `test/cli/old-hosted.test.ts` (`GITHUB_CONFLICT`
   instead of a plain `Error`), `test/group-extensions.test.ts` (a mismatched or bad extension selection is a usage
   error, exit 2, in two tests), `test/parser.test.ts` (`JOB_NOT_FINISHED` instead of `UNTYPED`).
7. `T-38 (3)` is a rule in code, not only per command: the runner's `stepFailure`, with `REFUSED_AFTER_VALIDATE` (5)
   and `STEP_FAILED` (4). The ticket asks for the classes; the two codes are this ticket's names (T-01).
8. A worker's spawn in a group is refused in validate when its team has no slot (`GROUP_ALLOWANCE` and the others of
   `memberSlotProblem`); the claim under the cabinet lock then reads the slots again, and a slot gone by then is
   `STATE_CHANGED`, so `claimMember` itself no longer refuses.
9. In-process callers of spawn that the ticket does not convert (keeper, with `movedBy`) reach the same operation
   through `startSpawn`, so their spawn refuses before it writes as well.
10. Fix after the main session's gate run (protocol step 4): `BRANCH_LIVE_JOB` failed once with ENOENT in
    `snapshot()`. Its snapshot read the folder of a running job whose wrapper writes `progress.json` through a temp
    file and a rename, so a listed temp file could go before its read, and the digest could change between the two
    snapshots; the test left that folder out of the comparison only, not out of the reading. The snapshot leaves
    nothing out. Instead no live writer remains during any snapshot: `BRANCH_LIVE_JOB`'s running job is a record
    owned by a sleeping process of the test (`Atomics.wait`), which `liveJob` reads as live
    (`src/runtime/reap.ts:64-69`) and which writes nothing; and the two removed-engine tests of
    `test/cli/continue.test.ts`, which took the snapshot after `ended` (a terminal record, its wrapper possibly
    still writing), now wait with `waitJob`, which returns after the wrapper has exited. `test/snapshot.ts` states the
    rule in its comment.

    Why no live writer remains, per call site of the shared snapshot: the refused command runs through `limen()`
    (`spawnSync`), so it ends before the second snapshot starts. `test/cli/spawn.test.ts`'s other refusal tests,
    `test/s1-spawn.test.ts`'s (the file's first test, before any job), and those of `test/cli/stop.test.ts`,
    `test/cli/ticket.test.ts`, `test/cli/picture.test.ts`, `test/cli/group.test.ts` and `test/cli/github.test.ts` run on
    a plant with no started job, or on written records that no process owns. `JOB_TREE_GONE` is a written record
    with no owner. The race tests of `test/operation.test.ts` start no job, since their apply fails before
    publication. `test/cli/old-names.test.ts` waits for every parent with `waitJob` (its `settled`) before its
    snapshot. `test/integrations/github-claims.test.ts` runs no Limen process. Measured: five runs of
    `test/cli/spawn.test.ts`, `test/cli/continue.test.ts` and `test/snapshot.test.ts` in the gate's environment, each
    25 of 25 passing, then the gate (see Proof).

11. Review round 1, finding 3: the refusal tests named there now compare the shared snapshot, code and snapshot in one
    assertion (finding 5): `test/group-extensions.test.ts`'s invalid selections (no job runs, the lead a written
    registration), `test/cli/picture.test.ts`'s two other `PICTURE_INVALID` tests, `test/parser.test.ts`'s running
    continue (a written record no process owns) and the stale lead of `test/s8-groups.test.ts` (no job runs yet, and
    the lead's hook only touches its registration's time, `hook/group-peer.ts:82`, which the snapshot does not hold).
    Three could not, beside live writers, and are named here: `test/s8-groups.test.ts:152` (a worker's launch; worker1's
    wrapper still writes in `.limen/`) is removed there and is `GROUP_WORKER_SPAWN` of `test/cli/spawn.test.ts` on a
    written run; `test/group-extensions.test.ts:132` and `:136` stay status checks of that scenario (its team jobs'
    finishes start `limen group advance` processes and lifecycle events that write in `.limen/groups/`), and their
    refusals are `GROUP_REVIEW_BRANCH` of `test/cli/spawn.test.ts` and the continuation's `GROUP_ALLOWANCE` of
    `test/cli/continue.test.ts`, both on written runs.
12. Review round 1, finding 2: a group start whose team spawn refuses in validate has its test, `NOT_MIGRATED` (a job
    folder of an older Limen): its class is `environment` (exit 4, D-057 (6)), as the reviewer's example named it.
13. Review round 1, T-29: `test/cli/group.test.ts`'s old-run status test and the stop test are each two tests.
14. Review round 1, finding 10: the test files the diff touches name no commit SHA in a comment but in
    `// regression: <sha>` (`test/s1-spawn.test.ts` and `test/s8-groups.test.ts` keep theirs so); "before R-092"
    replaces `07ec41b`. The token `a1b2c3d4` of `test/cli/old-names.test.ts` is a job token, no commit.
15. Review round 1, finding 9: the status line of a recorded failed start now reads "Start: <team> did not start: …",
    true also of a team whose member exists but whose job never ran.
16. Review round 2, finding 1: the wake route is read in continue's `validate` (`wakeRouting`), so an unsafe
    `PI_SESSION_ID` or `HERDR_PANE_ID` refuses before a group worker's slot is claimed. The class of both is
    `environment` (exit 4): Pi and Herdr set these variables, not the command line. Besides the review's sites, the
    runner's `checkFailure` and the step rule around lock acquisition are this round's additions (see Typed refusals).
17. Review round 2, finding 2: `readRun` takes the id's `source`; a group id from a job's record (`jobMembership`)
    that names no run is the refusal `GROUP_GONE`, a malformed one `RECORD_GROUP_ID`; the command line keeps
    `GROUP_NOT_FOUND` and `BAD_GROUP_ID` (usage).
18. Review round 2, finding 3: `requireGit` throws environment `GIT_FAILED` (exit 4). One caller depended on exit 1:
    land's merge, whose conflict `test/s5-land.test.ts` refuses with exit 1; `mergeBranch` now reads git's result
    itself and throws the refusal `MERGE_FAILED` (exit 1, git's own words), so land's exit code does not change (land
    is R-037's). No caller reads the message's form.
19. Review round 2, finding 4: `STATE_CHANGED` names the same command in `next`: the re-check's through the operation's
    `again`, and one that a step of apply finds (a member slot taken, the GitHub gate entered meanwhile) through the
    runner's `withAgain`. The handlers of spawn, continue, stop, github review and github work pass
    `values.commandLine()` (the shared builder of `src/parser.ts`); `JOB_PID_PENDING` names the same stop. In-process
    callers that have no command line of their own (keeper, a team's spawn of group start, whose failure is
    `GROUP_PARTIAL_START` with the start's own command) pass none. Spawn's in-process options are one object,
    `SpawnCall` (`team`, `firstWrite`, `again`).
20. Review round 2, finding 5: `GROUP_EXTENSIONS` stays the usage error of an `--extension` that differs from the
    team's; the parent's recorded extensions that differ are the refusal `GROUP_EXTENSIONS_PARENT`.
21. Review round 2, finding 6: the `GROUP_PARTIAL_START` test is two: the failed step recorded (the hook that moves
    main), and the rerun, on a written run that holds the recorded step, so it fails at `HEAD` for its own reason.
22. A defect of round 1 found in this round's run of the changed files, and fixed at its cause, not run again for a
    green result (z. 17, D-029): s8's concurrent activations failed once with `GROUP_NOT_FOUND`. Group start's validate
    lists the runs outside the cabinet lock (round 1), and a concurrent start's apply made the run's folder before its
    `run.json`, so the listing read a run with no record. The apply now writes `run.json` into a hidden
    `.limen/groups/.<id>/`, which `runs` skips, and renames it into place (`atomicRename`), so a run appears whole.
    The same run also showed `PICTURE_NOT_A_FOLDER`'s own test failing with an internal `ENOTDIR`: `mapFolder`
    returned a `.limen/picture` that is a file, and git then ran with it as its working folder; `mapFolder` now
    refuses it.
23. Review round 3, note 5 (added by the main session): `requireGit` throws `GIT_FAILED` (round 2, finding 3) for
    every caller, so a git failure of a command outside the nine (`land`, `prune`, `keeper`, `ticket new` and the
    others that call it) moves from exit 1 `UNTYPED` to exit 4, and `land`'s merge conflict from `UNTYPED` to
    `MERGE_FAILED` (still exit 1). The ticket's `## Migration` names only the nine commands; no CLI form changes, and
    the callers inside Limen read these outcomes through the client function of the final line, whose tests the gate
    runs (676/676).

## Unmeasured

- `github review` against GitHub itself: `fetchPinnedReview`'s `ls-remote` and object fetch are tested on a local
  remote only; no M-NN of `plan.md` → `## Measurement` covers it, and the seat's first review shows it.

## Rollback

`git revert $(git log --format=%H --grep='^R-092:' adrian-rebuild --)`. The reverted code reads a run written by this
ticket: `run.json` gains only the optional `startFailure`, and `readRun` at `07ec41b` parses `run.json` with
`JSON.parse(…) as GroupRun` and checks only `teamExtensions` (`src/job/group-cabinet.ts:62-97`), so the extra field
is ignored. Evidence: in the run of the changed tests at `HEAD` (see Fails before), the old-run status test wrote a
`run.json` with `startFailure`, and `HEAD`'s `limen group status` read it and printed the run's member line where the
new code prints its `Start:` line (`'team-1 round 1 draft (…): no job record yet'`), so that test failed only on the
missing line.

## Open points

- A test plant of a run of `test/s8-groups.test.ts` that I stopped midway (`limen-plant-4H9Tqw` under the gate's
  `TMPDIR`, `~/.cache/limen-rebuild-gate/`) stays: its processes are stopped, and removing the folder was refused to
  me.
- Review round 3's notes 1, 2, 6 and the `templates/picture/CONTRACT.md:91` part of note 3 change code, tests or a
  template after the two rounds of fixes, so they wait for Adrian's answer to Q-26 (`review.md` → Round 3): a gate
  left by a crash between the GitHub handoff gate and the job record, the class of `GROUP_STOP_INCOMPLETE` by its
  cause, the template's sentence on a refused `--strict` build, and the snapshot's `git()` that hides a git failure.
