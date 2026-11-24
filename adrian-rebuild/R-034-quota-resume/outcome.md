<!-- PL: Wynik R-034 (implementer i sesja główna, 24.11, przy `09ca25e`, po poprawkach rund 1 i 2, F1–F12, G1–G3): wznowienie
joba po limicie subskrypcji jest krokiem `limen seat sweep` (`src/runtime/resuming.ts`, polityka w `src/job/quota.ts`):
5 min po resecie, przez `startContinue` z wymogiem najnowszego rekordu na worktree pod blokadą jobów, na trasie z rekordu
rodzica, z zadaniem z pól rekordu i polem `quotaAttempt` (najwyżej 3, potem `quota-exhausted`). Budzenie każdego
rodzaju zablokowane przez limit trafia do pola `owedWake` rekordu joba bez zużycia prób, sweep zwalnia je po resecie;
alert `failed:quota` bez znanego resetu od razu, ze znanym po 15 min spóźnienia wznowienia bez kontynuacji (D-100);
usługa sweepu dostaje PATH instalującej powłoki; `quota-resume.ts` wycięty, `movedBy` reguł wskazuje R-102. Bramka:
kod 0, 1068/1068. Słowa do bramki 5.3 w `## Words for gate 5.3`; recenzja zamknięta w rundzie 3 (PASS). -->

# R-034 outcome

## Done

(a) `src/runtime/resuming.ts`, the operation `resume --quota` (T-26 (2)) with no command: `resumeAfterQuota(root, out,
start = startContinue)` is a step of every project's run of `limen seat sweep` (`sweepProject`, after `confirmDeadJobs`
and `endLeftoverScopes`, before `removeDeadCoordinators` and the ring). It reads each record with the reaper's
`eachRecord` (now exported from `src/runtime/reap.ts`), so a record that does not read is that job's failure and stops
no other. The policy lives in one new module, `src/job/quota.ts` (T-25 (1)): `QUOTA_RESUMES = 3`; `quotaResume(record)`,
the resume by the record's fields alone (`failed`, kind `quota`, no `migrated`, `landed` or `abandoned` marker, attempt
≤ 3; `at` = `resetAt` + 5 min, or `null` with no reset); `limitKind`; `quotaRings` (round 1, F8); `owedWakeDue`. A candidate is due when `at` is not
`null` and has passed, and when it is the newest record on its worktree (`newestOnWorktree`, new in
`src/job/unlanded.ts`, the module that owns the newest-record rule, read from the records the step read). A group
member is skipped with `not resumed <id>: a member of group <group>, which only its team continues`. A due job goes
through `startContinue` with the parent's `record.route` (engine, provider, model, thinking), no `--timeout` (so the
wrapper's default of 90 min), the parent's priority, the copied transcript (as `continue` today), the label `<parent
label> · resume <n>` (an earlier `· resume <n>` replaced, not added), the task of `## Words for gate 5.3`, and
`quotaAttempt` (the parent's plus one, 1 without one), and `onlyNewest` (F2). The run prints `resumed <id> after the
subscription limit as <new id>, resume <n> of 3`; `startContinue`'s own lines come prefixed `resume of <id>: `. A `LIVE_CONTINUATION` or `STATE_CHANGED`
from the resume (another continuation won) is the line `not resumed <id>: <message> (<code>)` and no failure; any other
error is that job's failure, and the next jobs go on.

(b) `startContinue` (`src/job/continuation.ts`) holds `assertNoLiveContinuation` under the jobs lock for every job, not
only for group members. The check reads `worktreeJobs(root, worktree, view)` (new in `src/job/unlanded.ts`): it refuses
`LIVE_CONTINUATION` while another record on the parent's worktree has not finished (`starting` or `running`; before,
only `running` of a group worker), with `next` `limen show <that job>`, and the answer it holds is the newest record on
the worktree, so a continuation that another process published between validate and apply ends the later one in
`STATE_CHANGED`, also once that one has ended. A second continuation of a parent whose first one has ended still starts
(the existing `test/s4-steering.test.ts` does this), unless the request sets `onlyNewest`, as the resume does (F2): then
a newer record on the worktree, live or ended, refuses `LIVE_CONTINUATION` too. `startContinue` is now its two halves,
`checkContinue` (validate, no write) and `continueChecked` (the writes), so a test can run two checks before either
write (F3). `readParentJob` lost its unused `membership` parameter.

(c) `finalizeJob` (`src/job/finalize.ts`) passes the record's `quotaAttempt` to `recordedFailure`, which writes
`quota-exhausted` instead of `quota` when it is 3 (`limitKind`); the alert `failed:quota-exhausted` comes from the
existing `failed:<kind>` event.

(d) `seat/alerts.ts`: a `quota` failure with no reset sends `failed:quota` as before; one with a known reset sends it only
when `quotaRings` holds (F8, D-100): the resume is overdue by 15 minutes (`resetAt` + 5 min + `OVERDUE_MS`) while the
job is still the newest record on its worktree and has no `landed` or `abandoned` marker. The alerts read every record
of a project first and take the newest record per worktree with `newestOnWorktree` from those that read; the event's
key stays `<root>/<id>/failed`, so it rings once per job.

(e) Owed wakes. `src/job/record.ts`: optional fields `quotaAttempt` (an integer 1–3) and `owedWake` (`{ since, resetAt
}`, `resetAt` an ISO time or `null`), both in `RECORD_FIELDS` and the validator (D-079: absent in older records, BAD_DATA
when malformed); `owedWake` is out of `Fields`. Its one writer `writeOwedWake` shares with `writeStuck` one private
`writeAnyState` (under the job's lock, any state, no transition, no write when nothing changes) and joins
`STATE_TRANSITIONS` in `test/structure.test.ts`. `publishRecord` and `publishJob` take `quotaAttempt` for a resume.
`isLimitEnd(text)` (the subscription-limit text or the 429 rule) is the one definition that `engineStopKind` and the hook
share. The hook (`hook/wake.ts`): `eventMessage` keeps `errorMessage`; a `message_end` of the assistant with `error` or
`aborted` whose `errorMessage` `isLimitEnd` marks the run with the time and `limitReset(errorMessage, now)`; at
`agent_settled`, each pending wake of every family (completion, advisory, start notice; F7) that the run did not confirm
is owed on the record of the job whose folder holds its claim, instead of `recordUnconfirmed`: `writeOwedWake` (an
earlier owed wake kept), then `releaseOwedClaim` removes its claim with no attempt counted; a write that fails spends
the attempt as before, with the reason in the job's log. While the record holds `owedWake`, every wake of the job waits:
`deliveryLeft` (`src/job/wake-delivery.ts`) answers `nothing`, `observe` returns before any delivery, and the
eligibility of the completion, the advisory and the start notice checks it too; the record's change when the sweep
removes the field reopens the job, and the hook delivers its wakes as any other.
`resumeAfterQuota` releases each `owedWake` once `owedWakeDue` has passed (5 min after `resetAt`, or one hour after
`since` with no reset), checked again under the job's lock, with the line `released the owed wake of <id>`. The refusal of a resume that a newer record overtook (F2): `job <newest> took over the worktree <path> of
job <id> after it, so a resume of <id> would run on work that <newest> holds now`.
`claimedJob` names the job of a claim, which `recordUnconfirmed` now uses too.

(f) `src/job/wake-text.ts`: `jobEnding` prints a `Stop:` section from the record's fields for `quota` and
`quota-exhausted` (`limitStop`) instead of `Stop reason: <provider text>`; `completionWake` of a `quota` job Limen
resumes (no group) replaces the handoff and the instruction (a busy coordinator's fallback instruction still wins). The
words are in `## Words for gate 5.3`. `templates/agents.md:62` drops "what to do on quota exhaustion" and says that such
a job is no board choice; `:68` replaces "follow the recorded quota policy" with the resume sentence; the template names no number
of the resume (F10); the new first hash `ec0efebf…1332` heads `templates/.history/agents.md`, in place of the earlier
draft's line.

(g) `src/platform/systemd-units.ts`: `sweepUnits(packageRoot, path)` adds `Environment="PATH=<path>"` to the service,
quoted whole with each backslash and quote escaped and `%` doubled (systemd splits an unquoted value at white space and
reads specifiers); `installSweepUnits(packageRoot, path)`. `src/runtime/sweeping.ts` passes `process.env.PATH` and
refuses an empty one in validate (`NO_PATH`, exit 4, `next` `limen seat sweep --install`). `placeUnitFiles` already
writes only a changed text, so an install from the same PATH changes nothing and one from another rewrites only the
service. `seat/sweep-units.ts` (deploy's check) renders with its own PATH. `HOME` gets no line (Decision 2).

(h) Cuts: `git rm docs/seat/quota-resume.ts` (the only index change); its `biome.jsonc` entry and its
`JOB_NAME_EXCEPTIONS` entry in `test/structure.test.ts`; its lines in `docs/seat/README.md` (the units line, the
extension list, its bullet, the link and diff commands), with a sentence that a seat still linking it removes the link;
the comment of `SUBSCRIPTION_LIMIT` names `isLimitEnd`, not the file.

(i) `src/registry.ts`: `movedBy: "R-102"` for `rule`, `rule set`, `rule end`, `rule timer`, and "until R-102 cuts it" in
the two comments; `test/registry.test.ts` `MOVED`, `src/runtime/start-queue.ts:43` and `test/structure.test.ts:1199`
name R-102. The `seat sweep` summary becomes "end dead jobs and resume quota jobs after the reset; --install runs it
every minute", in `test/help.test.ts` and the generated section of `docs/commands.md`. `LIVE_CONTINUATION` left
`WITHOUT_CODE_TEST` (it has its CODE test now). `seat/alerts.ts`'s comment drops R-034 from the tickets that add kinds.

(j) Docs: `docs/jobs.md` (the `quota` and `quota-exhausted` kinds in the state table, a new `### Subscription limit`
section: which jobs, once per reset, the wake, owed wakes, alerts, the service's PATH; "One job at a time on a worktree"
under `### Continue a finished job`), `docs/commands.md` (the sweep's resume and release step, `--install`'s PATH and
`NO_PATH`, and `NO_PATH` in row 4 of the exit-code table, F11), `docs/seat/README.md` (alerts, sweep, install,
extensions), and the alert lines of `docs/remote.md` and `docs/seat/agent-setup.md`, which said "each failed job"; the
overdue alert (F8) and the owed wakes of every family (F7) in each of them.

(k) Tests: the new `test/runtime/resuming.test.ts` (12 tests, the step on planted records with a start in place of
`startContinue`, and one race through the real `startContinue`); the new `test/job/continuation.test.ts` (F3);
`test/cli/sweep.test.ts` (a real `limen seat sweep` resumes a due quota job once; `--install` writes the PATH and
rewrites only the service from another PATH; `NO_PATH`); `test/cli/continue.test.ts` (`LIVE_CONTINUATION`);
`test/job/finalize.test.ts`; `test/seat/alerts.test.ts` (five tests of F8); `test/hook/wake.test.ts` (four owed-wake
tests, one mechanism each, F5 and F7; a coordinator's own limit turn wakes nothing); `test/job/wake-text.test.ts` (four
texts); `test/job/record.test.ts` (both fields, the cap's text, two BAD_DATA, `writeOwedWake`);
`test/platform/systemd-units.test.ts` (golden with a fixed PATH, the quoting); `test/registry.test.ts`,
`test/structure.test.ts`, `test/help.test.ts`; `test/seat/deploy.test.ts` follows the new parameter.

## Fixes of review round 1

From `ticket.md` → `## Decisions` (2026-11-24, review round 1); F1 is the main session's.
- F2: `ContinueRequest.onlyNewest`, which the resume sets: `assertNoLiveContinuation` refuses `LIVE_CONTINUATION` when
  another record is the newest on the worktree ("job <newest> took over the worktree … after it"), held under the jobs
  lock as before; the step's line names the parent. Test: `test/runtime/resuming.test.ts` → "a continuation of the job
  published and ended between the step's read and the resume's checks leaves no second resume, and the line names the
  job" (a start that plants an ended continuation, then calls the real `startContinue` in a Git project).
- F3: `checkContinue` and `continueChecked` (above). Test: `test/job/continuation.test.ts` → "two continuations of one
  ordinary job checked before either writes start one job, and the second ends in STATE_CHANGED" (in this process with
  the plant's environment; the first job runs to `done`, the parent has one child).
- F4: the reading test reads `quotaAttempt` 3; the cap test asserts "expected an integer from 1 to 3"; the file
  imports `writeOwedWake` inside its own test, so the file loads at `HEAD`.
- F5: `test/hook/wake.test.ts` imports nothing `HEAD` lacks and plants `owedWake` through the record's JSON
  (`writeRecord`); the owed-wake tests are one mechanism each: a completion wake's limit turn (no attempt, `owedWake`
  with the reset and the turn's time); a held wake (no wake, no damage note); a delivery once the field is gone (the
  wake comes, no damage note). The sweep's release keeps its test in `test/runtime/resuming.test.ts`.
- F6: the exclusions are three tests (the record's fields, the due time, the newest record on the worktree), and the
  race test two, each name with at most one identifier.
- F7: every wake family is owed (above). Test: "an advisory wake whose turn ends on the subscription limit spends no
  attempt and is owed on its running job".
- F8 (D-100): `OVERDUE_MS` (15 min) beside `AFTER_RESET_MS` and `quotaRings` in `src/job/quota.ts`; the alerts (above).
  Tests in `test/seat/alerts.test.ts`: not yet overdue sends nothing; overdue and not continued sends `failed:quota`
  once (two runs); overdue with a newer record on the worktree sends nothing; an overdue group member sends it; a
  `quota-exhausted` job sends its kind. Docs: `docs/jobs.md`, `docs/remote.md`, `docs/seat/agent-setup.md`,
  `docs/seat/README.md`.
- F9: the sweep's lines say "after the subscription limit", and so do the comments of this change; the help keeps
  "quota jobs", the failure kind.
- F10: `templates/agents.md:68`: "… continues it on its recorded route after the reset, a bounded number of times, and
  its wake says when and which resume it is; …", with its hash in `templates/.history/agents.md`.
- F11: row 4 of `docs/commands.md`'s exit-code table names `NO_PATH` beside `NO_LINGER`.
- F12: the headers of `src/runtime/resuming.ts` and `src/job/quota.ts` say why each module exists.

## Fixes of review round 2

From `ticket.md` → `## Decisions` (2026-11-24, review round 2):
- G1: every comment of this change that cites this ticket's decision names it "R-034 Decision N":
  `src/runtime/resuming.ts` (Decision 4), `test/runtime/resuming.test.ts` (three of Decision 4), `src/runtime/sweeping.ts`
  (Decision 1), `src/platform/systemd-units.ts` and `test/cli/sweep.test.ts` (Decision 2).
- G2: the hook test of a held wake is named "a wake of a job whose record owes one is held".
- G3: `hook/wake.ts` clears `limitEnd` with the delivery maps at `session_start` and `session_shutdown`. Test:
  `test/hook/wake.test.ts` → "a limit end of an earlier session owes nothing in the next one: an errored turn there
  spends its attempt, and a limit turn there owes the wake" (a limit `message_end` with no settle, a new session in the
  same hook, a turn that errors on another text, whose wake spends attempt 1, then a limit turn whose wake is owed).
  Without the clear at `session_start` it fails, as run here with that line taken out: the first turn owes the wake, so
  the second wake never comes ("the condition did not hold in time"). At `HEAD`, where the file loads, the second turn
  spends attempt 2 and writes no `owedWake`, so it fails there on the limit turn's owing (read from the code).

## Proof

From the repository root, on the working tree (`HEAD` `09ca25e`; the index holds only the deletion of
`docs/seat/quota-resume.ts`), 2026-11-24:
- AC-10: `node adrian-rebuild/tools/gate.mjs` after the fixes of round 2 → exit 0: tests 1068, pass 1068, fail 0,
  cancelled 0, skipped 0, todo 0 (241.8 s, no `✖` line; its Biome step "Checked 278 files … No fixes applied."). After
  round 1: exit 0, 1067 of 1067 (269.9 s); the first draft's run: exit 0, 1055 of 1055 (280.7 s).
- AC-11: `npx biome check --error-on-warnings .` → exit 0 ("Checked 278 files … No fixes applied."); `npx tsc --noEmit`
  → exit 0; `node adrian-rebuild/tools/check.mjs` → exit 0; `npx biome check --error-on-warnings adrian-rebuild` → exit
  0; all after the fixes of round 2, with this file in place.
- Each file alone, `node --test <file>` (with `--test-timeout=180000` for the CLI and hook files):
  - after the fixes of round 2: `test/hook/wake.test.ts` → pass 14, fail 0 (AC-3); `test/runtime/resuming.test.ts`
    → pass 12, fail 0 (AC-1);
  - after the fixes of round 1: `test/job/continuation.test.ts` → pass 1, fail 0; `test/seat/alerts.test.ts` → pass 50,
    fail 0 (AC-3); `test/job/wake-text.test.ts` → pass 6, fail 0 and
    `test/job/record.test.ts` → pass 38, fail 0 (AC-4); `test/registry.test.ts` → pass 32, fail 0 (AC-5);
    `test/structure.test.ts` → pass 50, fail 0 and `test/help.test.ts` → pass 10, fail 0 (AC-6); each exit 0;
  - from the first draft, whose files the fixes changed only in a line's words or comments, or not at all, and which
    the gate above ran again: `test/cli/sweep.test.ts` → pass 26 (AC-1); `test/cli/continue.test.ts` → pass 14 and
    `test/job/finalize.test.ts` → pass 11 (AC-2); `test/platform/systemd-units.test.ts` → pass 11 (AC-5);
    `test/seat/deploy.test.ts` → pass 32; each exit 0, fail 0.
- AC-7: `git grep -q 'movedBy: "R-034"' -- src/registry.ts` → exit 1.
- AC-8: `git ls-files --error-unmatch docs/seat/quota-resume.ts` → exit 1.
- AC-9: the main session's `node adrian-rebuild/tools/fails-before.mjs` → exit 0 after the fixes of review round 1
  (its first line in `## Fails before`); the implementer's per-file runs are there too.
- AC-12 (judgment), as the tests show it: a due `quota` job is resumed once per reset by the sweep, on its recorded route
  (CLI test: one child, `route` equal to the parent's, `quotaAttempt` 1, a second run resumes nothing), also when a
  continuation won a race before the resume's checks (F2) or between its checks and its write (F3); attempts 2 and 3
  follow, and a limit end at attempt 3 is `quota-exhausted`, which alerts once; a known-reset `quota` alerts only once
  its resume is 15 minutes overdue with no continuation; the wake and the resume's task hold no provider text; a limit
  turn spends no attempt for a completion or an advisory (no `notify/unconfirmed`), the wake waits on the record, and it
  comes once the field is gone, which the sweep's release does.

## Fails before

AC-9, the main session's `node adrian-rebuild/tools/fails-before.mjs` (every new or changed file under `test/`, over a
copy of `HEAD` `09ca25e`), after the fixes of review round 1 (F1) → exit 0, and again after the fixes of round 2 →
exit 0 with the same first line (the same fourteen files):

```
fails-before: test/cli/continue.test.ts, test/cli/sweep.test.ts, test/help.test.ts, test/hook/wake.test.ts, test/job/finalize.test.ts, test/job/record.test.ts, test/job/wake-text.test.ts, test/platform/systemd-units.test.ts, test/registry.test.ts, test/seat/alerts.test.ts, test/seat/deploy.test.ts, test/structure.test.ts, test/job/continuation.test.ts, test/runtime/resuming.test.ts fail at HEAD (exit 1)
```

The main session's gate after the fixes of round 1: `node adrian-rebuild/tools/gate.mjs` → exit 0, 1067 tests, 1067
pass, 0 fail (249.6 s); after the fixes of round 2: exit 0, 1068 tests, 1068 pass, 0 fail (243.9 s).

The implementer's runs: each new or changed test file run alone with the test files of this change and the code of `HEAD` (before any change
under `src/`, `hook/` or `seat/`), 2026-11-24:
- `node --test test/runtime/resuming.test.ts` → exit 1: `Error [ERR_MODULE_NOT_FOUND]: Cannot find module
  '…/src/runtime/resuming.ts' imported from …/test/runtime/resuming.test.ts`.
- `node --test test/job/record.test.ts` → exit 1 at load (`writeOwedWake` is no export of `src/job/record.ts`).
- `node --test test/job/finalize.test.ts` → exit 1, tests 11, pass 10, fail 1: "finalizeJob records kind
  quota-exhausted for a limit end of a job whose quotaAttempt is 3, and quota for attempt 2".
- `node --test test/job/wake-text.test.ts` → exit 1, pass 2, fail 4: the three `jobEnding` texts and the completion
  wake's handoff and instruction.
- `node --test test/seat/alerts.test.ts` → exit 1, pass 45, fail 1: "failed:quota is sent only for a quota failure with
  no reset time; one with a known reset sends nothing, and quota-exhausted rings".
- `node --test test/platform/systemd-units.test.ts` → exit 1, pass 9, fail 2: the service's golden text and the PATH's
  quoting.
- `node --test test/registry.test.ts` → exit 1, pass 31, fail 1: "D-039: the moved entries are exactly the commands a
  subsequent ticket moves, with that ticket".
- `node --test --test-timeout=180000 test/cli/continue.test.ts` → exit 1, tests 14, pass 13, fail 1:
  "LIVE_CONTINUATION: a second continuation of an ordinary job while its first one runs exits 1 and leaves the snapshot
  identical" (the second continuation started).
- `node --test --test-timeout=180000 test/hook/wake.test.ts` → exit 1 at load (`ERR_MODULE_NOT_FOUND` of
  `src/runtime/resuming.ts`).
- `node --test --test-timeout=180000 test/cli/sweep.test.ts` → exit 1, tests 26, pass 23, fail 3: "limen seat sweep:
  resumes a due quota job …" (`Error: waiting for job  failed: … ENOENT … /.limen/jobs/record.json`: no child job),
  "--install writes the PATH it runs with into the service …" and "NO_PATH: --install from a process with no PATH …".

Not run before the change: `test/structure.test.ts` (its removed exception meets `docs/seat/quota-resume.ts` at
`HEAD`), `test/help.test.ts` (new golden summary) and `test/seat/deploy.test.ts`. The deploy test's change passes the
new PATH parameter, which `HEAD`'s `sweepUnits` ignores, so it passes at `HEAD` by design and proves no new mechanism;
likewise the hook test "a coordinator's own turn that ends on the subscription limit … wakes nothing" holds at `HEAD`
too: it asserts an absence `HEAD` has and guards the new hook code against a false owed wake (round 1, rejected note
(a)).

The tests of the round 1 fixes, with the code of `HEAD` (read from the code, not run here; the main session's
`fails-before.mjs` run is the proof, F1):
- `test/job/record.test.ts` now loads at `HEAD`: the reading test fails there (`quotaAttempt` is an unknown field,
  BAD_DATA), the cap test fails on the expectation text (`HEAD` refuses the unknown field, not the range), and
  `writeOwedWake` is undefined in its own test.
- `test/hook/wake.test.ts` now loads at `HEAD`: the completion's and the advisory's limit turn spend an attempt there
  and write no `owedWake` (`reset` and `since` false, `attempts` true); the held and the released wake fail on the
  damage note (`HEAD` reads a record with `owedWake` as damaged).
- `test/seat/alerts.test.ts`: "not yet overdue sends nothing" and "a newer record on the worktree sends nothing" fail
  at `HEAD`, which sends `failed:quota` for any `quota` failure; "overdue … sends failed:quota once", "an overdue group
  member" and "quota-exhausted" hold at `HEAD` too and guard that the new rule does not silence them.
- `test/job/continuation.test.ts` and `test/runtime/resuming.test.ts` import exports `HEAD` lacks (`checkContinue`,
  the module `src/runtime/resuming.ts`); on the mechanism, a second continuation of an ordinary job holds no fact at
  `HEAD`, so it would start a second job, and a resume would not require the newest record.

## Deviations

1. The ticket names `isRateLimit` as "the one definition" the hook reads; fact 1 calls `isRateLimit` and
   `SUBSCRIPTION_LIMIT` together the one definition, and `isRateLimit` alone misses the 5-hour text. The hook reads
   `isLimitEnd`, a new export that is exactly `engineStopKind`'s rule.
2. "The newest-record check" is read as: refuse while another record on the worktree has not finished, and hold the
   newest record's id under the jobs lock; for the resume, also refuse when another record is the newest (F2). A
   sequential second `limen continue` of an ended first one still starts (`test/s4-steering.test.ts` continues one
   parent twice).
3. `test/cli/continue.test.ts`'s first continuation is a planted running record owned by the test process, not a real
   `limen continue`: T-38 (4)'s snapshot needs a state no live wrapper writes into (`test/snapshot.ts`).
4. A `STATE_CHANGED` of a resume is a line, as `LIVE_CONTINUATION` is (Decision 4 names a race; this is the race
   between the checks and the write). Any other refusal of a resume is the job's failure, which the sweep's run turns
   into `REFUSED_AFTER_VALIDATE` (exit 5) as for R-032's steps.
5. Withdrawn by F7: every wake family is owed now.
6. Additions the ticket does not name: the label `· resume <n>`; `NO_PATH`; the quoting of the PATH; the module
   `src/job/quota.ts` for the policy that four modules read (a cycle would follow from `wake-text.ts` importing
   `resuming.ts`, which imports `continuation.ts` → `finalize.ts` → `coordinator-wake.ts` → `wake-text.ts`); the
   alert lines of `docs/remote.md` and `docs/seat/agent-setup.md`; the shorter `seat sweep` summary (the old one and
   the resume did not fit 100 characters, so it drops "notify about job ends nobody heard of", which
   `docs/commands.md` keeps); the split of `startContinue` into `checkContinue` and `continueChecked` for F3's test,
   since no other seat lets a test hold two continuations between their checks and their writes.

## Unmeasured

- M-11 (failure kinds per ticket): the share of `quota` and `quota-exhausted` ends after a0.3.0; B.3 and 9.1.
- Seat step 3.4 (no M-NN): that a resumed job starts from the sweep's service with its PATH (`pi`, `node`, the bridge
  under the home's Pi folder, `herdr`), that a real coordinator turn on the limit carries the limit text in
  `errorMessage` (E-9) so the hook owes its wake, that the owed wake arrives after the reset, and the removal of the
  seat's `~/.pi/agent/extensions/quota-resume.ts` link before a0.3.0 (D-097 (5) (k)). The tests use the fake engine
  and the tests' systemd.

## Open points

1. Closed by F8 (D-100): a group member's overdue `quota` failure rings `failed:quota`.
2. A due job whose resume refuses for a lasting reason (`JOB_TREE_GONE`, `JOB_NO_SESSION`, `EXTENSION_GONE`) still fails
   every minute's run, so `limen status` shows `Sweep not working` until a person resolves it; F8 now rings
   `failed:quota` for it once its resume is 15 minutes overdue.
3. A damaged record of a project fails each resume there too, since `startContinue` reads every record through its view,
   as spawn's checks do (round 1 kept it, rejected note (b)); F8 rings for the overdue job.
4. A parent record with a `null` model resumes on `defaultModel()`, as `continue` without `--model` does (records from
   before D-043's route flags).
5. The service's PATH line is as long as the installing PATH; T-10's width test covers the fixed PATH of the golden.
6. A manual `limen continue` of a resumed job starts a job with no `quotaAttempt`, so its own limit end counts from 1
   again (the ticket's "1 for a job without one").
7. For gate 5.3, with Decision 3's words (review round 2, note 3): an owed completion wake released after the resume
   ran, or after the coordinator's own `limen continue`, names a resume time already past (`src/job/wake-text.ts`
   builds it from the job's own fields; the newest-record check is the sweep's); its guidance, not to continue the job,
   still holds.
8. For R-082's ratchet, as R-002 and R-100 left theirs (review round 2, note C): `observe` and `limenWake` in
   `hook/wake.ts` change here and keep their "split pending" suppressions (T-27 (1)).
9. For the next ticket that edits these tests (review round 3, note 1, D-092): two comments of
   `test/hook/wake.test.ts` cite "review round 1, F7" and "review round 2, G3" without "R-034" (T-30 (2)), as
   `test/seat/alerts.test.ts` and `test/cli/sweep.test.ts` cite their tickets' rounds today.

## Words for gate 5.3

Decision 3: the texts Limen writes, from record fields, in English.

The resume's task (`resumeTask`, `src/runtime/resuming.ts`), for job `<id>`, resume `<n>`, tickets from the label and
the id:

```
Limen resumed job <id> after the subscription limit stopped it: resume <n> of 3 (ticket F012).
The limit reset at <resetAt>. This job continues in the same session and worktree.
Continue the task from the point where the last turn stopped; do not redo work that the worktree already holds.
```

The completion wake's stop section (`limitStop`, `src/job/wake-text.ts`), in place of `Stop reason: <provider text>`:
- known reset: `Stop: the subscription limit, which resets at <resetAt>. Limen resumes the job at <resetAt + 5 min>,
  resume <n> of 3.`
- no reset: `Stop: the subscription limit, with no reset time read. Limen resumes the job once the reset time is known,
  resume <n> of 3.`
- a group member: `Stop: the subscription limit, … . Limen does not resume a member of a group; its team continues it.`
- the cap: `Stop: the subscription limit, after 3 resumes, the most Limen makes. Limen does not resume it again.`

The wake's handoff and instruction for a job Limen resumes:

```
Limen resumes this job by itself; it needs nothing from you now.

Go on with other work, and do not continue this job yourself: Limen resumes it. Only when the owner asks to resume it at once, run limen continue <id> "<instruction>"; Limen then leaves it to that continuation.
```

`templates/agents.md:68` (F10): "A job that ends on the subscription limit is Limen's to resume, not yours: the seat
sweep continues it on its recorded route after the reset, a bounded number of times, and its wake says when and which
resume it is; continue it at once only when the owner asks. If the chosen model cannot run for another reason, preserve the work and ask; never
silently substitute a model." `:62`: "… and what evidence earns proof. A job that the subscription limit stopped is not
one of these choices: Limen resumes it itself (below)."

The sweep's lines (F9): `resumed <id> after the subscription limit as <new id>, resume <n> of 3`; `not resumed <id>: <message>
(<code>)`; `not resumed <id>: a member of group <group>, which only its team continues`; `released the owed wake of
<id>`.
