<!-- PL: Ticket R-034 (A-016 (2)–(6), A-068, D-094 (2), D-097 (5)): wznowienie joba po limicie subskrypcji staje się
krokiem `limen seat sweep` (5 min po resecie, dokładnie jedno, najwyżej 3 razy, potem `quota-exhausted`), z trasą
rodzica i zadaniem zbudowanym z pól rekordu; budzenia zaległe z powodu limitu są polem rekordu, które sweep zwalnia po
resecie; alert `failed:quota` dzwoni tylko bez znanego resetu; unit sweepu dostaje PATH instalującej powłoki;
`docs/seat/quota-resume.ts` znika, a `movedBy` czterech wpisów `rule` wskazuje R-102. Stan: napisany 24.11 przy drzewie
R-032 (przed jego commitem) z inwentarza `evidence/inventories/R-034.md`, odświeżonego przez agenta tylko do odczytu;
decyzje w `## Decisions`. -->

# R-034 Resume after the quota limit in code

## Problem

Finding A-016, its Decision quoted from `audit.md`: "(2) Wakes blocked by the limit go to a durable owed list. (3) A
systemd timer independent of the coordinator runs `limen resume --quota` 5 minutes after the reset: it resumes only
`quota` jobs, with their recorded route and the parent's recorded system prompt (A-079), and delivers owed wakes; the
coordinator gets a summary built from record fields, not quoted error text. Other kinds follow A-001. (4) If the
message is unreadable: try hourly via the usage endpoint (shared poller, A-047) and notify me once. (5) At most 3
quota resumes per job; then `failed`, kind `quota-exhausted`, and the bell. (6) `docs/seat/quota-resume.ts` is cut.
Test: a recorded limit error → exactly one resume after the reset." (1) is R-029's, done. Finding A-068: "fix (via
A-016) — `quota-resume.ts` cut; the lessons are in A-016 (1) and (3)."

Plan decisions the change relies on:
- D-094 (2): "R-034 keeps the resume after the quota limit (A-016 (2)–(6), A-068, §6, step 3.4); the new R-102 cuts
  the seat rules … and depends on R-034, since A-010 cuts them only once the resume holds".
- D-097 (1): "the resume after the quota limit is a step of `limen seat sweep` with no command of its own …; a resume
  at once is `limen continue <id>`, a manual run `limen seat sweep`, and T-26 (2)'s `resume --quota` names the
  operation." (2): the race of a resume with `seat/deploy.ts` "is an accepted risk, named in R-034's `## Risk`".
- D-097 (5), settled for R-034 (items marked (A) were named for Adrian's attention and stand):
  (a) "the resume is a minute step, due once `now ≥ resetAt + 5 min`, with no timer per reset (T-42); the reset is
  R-029's";
  (b) "(A) a `quota` job with `resetAt` `null` is not resumed until R-059's hourly reading …, and A-016 (4)'s "notify
  me once" is the existing alert `failed:quota`; (A) that alert rings only for `resetAt` `null`, and with a known
  reset the bell waits for `quota-exhausted` (A-016 (5))";
  (c) "a resume takes a `failed` job of kind `quota` with a known `resetAt`, not `migrated` (D-057 (4)), with no
  `landed` or `abandoned` marker, that is the newest record on its worktree, with no age bound (z. 19); a group member
  is skipped and named in the run's output (`continue` refuses outside its team)";
  (d) "(A) exactly one resume: the newest-record check under the jobs lock, the one function `limen continue` also
  calls, so `LIVE_CONTINUATION` covers every job, not only group workers (today two continuations of one ordinary job
  can both start; z. 14)";
  (e) "the resumed job gets the parent's recorded route (A-030) and the default timeout of 90 min (the record holds no
  timeout); its context is the copied transcript until R-039 (A-079)";
  (f) "(A) code builds the resume's task from record fields (T-07, A-068), in English (T-13), with no provider text;
  its words for gate 5.3";
  (g) "the cap of 3: the resumed job gets an optional record field with its attempt number (D-079); a job with attempt
  3 that ends on the limit again is written `quota-exhausted` by finalize, so no terminal record is written twice; the
  alert `failed:quota-exhausted` exists";
  (h) "owed wakes are a record field (D-057 (7.2), S1+), written as `advisory` and R-032's `stuck` are; the wake hook
  tells a coordinator turn that ended on the limit from its `errorMessage` by the one definition (T-25), and such a
  turn spends neither of the 2 attempts; the mark holds the reset read by R-029's reader; the sweep releases it at the
  reset + 5 min (with a `null` reset, after one hour, A-016 (4)), and the hook delivers it as today";
  (i) "(A) the completion wake of a `quota` job says, from record fields, when Limen resumes it and that the
  coordinator does not continue it, instead of `Stop reason: <provider text>`; `templates/agents.md:68` changes; a
  coordinator turn of its own that ends on the limit, with no owed wake, wakes nothing (the extension that did goes,
  A-068)";
  (j) "the ticket sets what the sweep's unit needs so that a resumed job's launch finds `pi`, `node` and the bridge;
  the API is `pi, systemd`, and step 3.4 checks that the resumed job started and that an owed wake arrived";
  (k) "(A) `docs/seat/quota-resume.ts` is cut, and step 3.4 has its link removed from the seat's Pi extensions before
  a0.3.0";
  (l) "the `movedBy` of the four `rule` entries becomes `"R-102"`".
- Rules: T-25 (one module per policy; one definition of a limit end), T-26 (2) (commands are thin adapters; the
  operation is `resume --quota`), T-38 (the sweep's steps run inside its `operationHandler` run), T-01 (no silent
  failure), T-02 (exit classes), T-07 and T-13 (texts from fields, English), T-42 (no agent-made timers), D-079 (new
  record fields are optional when read), D-057 (4) (`migrated` records are history).

Facts at the working tree of R-032 (before its commit; the inventory `evidence/inventories/R-034.md` was made at
`6d17130`, and a read-only agent re-located its facts after R-029 and R-032; the main session checked the ones it
quotes):
1. Detection is R-029's: the wrapper's `stopFailure` (`src/runtime/wrapper.ts:474-484`) sets the kind through
   `engineStopKind` (`src/job/record.ts:851-853`) and takes the reset from `record.rateLimit.resetAt` (the
   `kendex:rate-limit` event, `hook/rate-limit.ts:23-28`) or from `limitReset(stop text, stopAt)`
   (`src/job/record.ts:879`); `finalizeJob` stores the failure as given (`src/job/finalize.ts:156`). `FAILURE_KINDS`
   (`src/job/record.ts:59-74`) holds `quota` and `quota-exhausted`. `isRateLimit` (`record.ts:858-860`) and
   `SUBSCRIPTION_LIMIT` (`:835`, its comment `:830-834` naming `docs/seat/quota-resume.ts`) are the one definition.
2. Nothing in code resumes a `quota` job (no `resume` entry; `grep -- --quota src hook seat bin` finds nothing);
   `templates/agents.md:62` and `:68` leave it to the coordinator. `docs/seat/quota-resume.ts` (224 lines) is a Pi
   extension that does it from the coordinator's session; `biome.jsonc:97` and the `state` exception at
   `test/structure.test.ts:720` name it; `docs/seat/README.md:7`, `:56`, `:59`, `:64` describe its link.
3. `startContinue` (`src/job/continuation.ts:76-102`) is the one function `limen continue` calls; it locks the jobs
   (`:85`), but `assertNoLiveContinuation` (`:444-460`) runs only for group members (`:419-423`). The route comes from
   flags or `defaultModel()` (`:218`, `:311-312`; `src/runtime/engine.ts:68-70`), never from the parent's
   `record.route` (`record.ts:138`, `:164`); the timeout only from the flag (`continuation.ts:566-568`).
   `preflightEngine` (`:231`, `engine.ts:83-84`) refuses `ENGINE_MISSING` when `pi` is not on `PATH`.
4. The sweep (R-032): `sweepProject` (`src/runtime/sweeping.ts:192-216`) runs one project's steps through `step()`
   (`:199-205`): `confirmDeadJobs`, `endLeftoverScopes`, `removeDeadCoordinators`, `ringUnheard`; each returns its
   failures, a failure stops no other step, and the run ends with the worst class (`:158-182`). A refusal thrown
   inside a step becomes `internal REFUSED_AFTER_VALIDATE` (`src/operation.ts:175-184`). The service unit
   (`src/platform/systemd-units.ts:63-71`) sets no `Environment=`, so its `PATH` is the user manager's default.
5. Wakes: `WAKE_ATTEMPTS = 2` (`src/job/wake-delivery.ts:11`), `recordUnconfirmed` (`:173-205`); the hook marks a
   failed coordinator turn `pending.errored` (`hook/wake.ts:963-972`), and `eventMessage` (`:1273-1285`) drops
   `errorMessage`; "owed" exists only in comments. The completion wake prints `Stop reason: ${stop}`, provider text
   (`src/job/wake-text.ts:24`).
6. The alerts: `failed:${record.failure?.kind ?? "unknown"}` for every failed job (`seat/alerts.ts:93-97`), so
   `failed:quota` rings for a known reset too.
7. Record-field precedents: `stuck` (`record.ts:122`, `:212`; `writeStuck` `:632-651`, under the job's lock, any
   state, no transition), `queueWait` (`:185`); `STATE_TRANSITIONS` of the T-04 import scan
   (`test/structure.test.ts:1089-1097`) lists every writer a read command must not import.
8. The four `rule` entries name R-034: `movedBy` at `src/registry.ts:762`, `:790`, `:807`, `:824` and the comments
   `:787`, `:804`; `test/registry.test.ts:44-47`, `src/runtime/start-queue.ts:43`, `test/structure.test.ts:1199`.
9. Tests have limit fixtures since R-029: the fake engine's `error [<text>]` and `rate-limit <type> <resetAtMs>`
   (`test/fake-engine.mjs:4`, `:10`, `:254-260`); no test clock exists, so due times come from past reset times.

## Change

(a) A new module `src/runtime/resuming.ts`, the operation `resume --quota` (T-26 (2)), run as a step of every
project's sweep (`sweepProject`, after `endLeftoverScopes` and before the coordinators and the ring), with no command:
- A candidate is a `failed` record of kind `quota` with a known `failure.resetAt`, not `migrated`, with no `landed` or
  `abandoned` marker, the newest record on its worktree, with no age bound; it is due once `now ≥ resetAt + 5 min`.
- A group member is skipped with one output line naming it and why (`continue` refuses outside its team).
- Each due job is resumed through `startContinue` (`src/job/continuation.ts:76`), the function `limen continue`
  calls, so a manual `limen continue <id>` and the sweep resume by one path; a refusal of one job (another resume
  won the race) is a line of the run's output, never the run's failure; a failure to start is that job's failure,
  named, and the other jobs go on (as R-032's steps).
- The resumed job gets the parent's recorded route (provider, model and thinking from `record.route`), the default
  timeout of 90 min, the copied transcript (as `continue` today), and a task built by code from record fields, in
  English, with no provider text (Decision 3).
- The resumed job's record gets an optional field `quotaAttempt` (1, 2 or 3; the parent's plus one, 1 for a job
  without one).

(b) `startContinue` runs the newest-record check (`assertNoLiveContinuation`) under the jobs lock for every job, not
only group members, so two continuations of one ordinary job cannot both start (`LIVE_CONTINUATION`).

(c) `finalizeJob` writes kind `quota-exhausted` instead of `quota` when a job whose `quotaAttempt` is 3 ends on the
limit, so no terminal record is written twice and a fourth resume has no candidate.

(d) The alerts (`seat/alerts.ts`, `EVENTS`): `failed:quota` is sent only for a `quota` failure whose `resetAt` is
`null`; with a known reset nothing rings until `failed:quota-exhausted`.

(e) Owed wakes, an optional record field `owedWake` on the job whose wake is owed (`{ since, resetAt }`, `resetAt` a
time or `null`), written under the job's lock in any state with no transition, as `writeStuck` is (its writer joins
`STATE_TRANSITIONS` of the T-04 import scan):
- The wake hook keeps the coordinator turn's `errorMessage` (`eventMessage`), tells a turn that ended on the limit by
  the one definition (`isRateLimit`, `src/job/record.ts`), and then writes `owedWake` on each job whose wake that turn
  could not take, with `resetAt` from `limitReset` on that text; such a turn spends neither of the 2 attempts.
- The hook does not deliver a wake whose job holds an unreleased `owedWake`.
- The sweep's step releases it (removes the field) once `now ≥ resetAt + 5 min`, or one hour after `since` when
  `resetAt` is `null` (A-016 (4)); the hook then delivers the wake as today.

(f) The completion wake of a `quota` job (`src/job/wake-text.ts`) says, from record fields, when Limen resumes it
(`resetAt` + 5 min, or "once the reset time is known" for `null`), which attempt of 3 that is, and that the
coordinator does not continue it, instead of `Stop reason: <provider text>`; `quota-exhausted` says the cap was
reached. A coordinator turn of its own that ends on the limit, with no owed wake, wakes nothing.
`templates/agents.md:62` and `:68` say the same (with its new first hash in `templates/.history/agents.md`).

(g) The sweep's service unit (`src/platform/systemd-units.ts`) gets `Environment=PATH=<the PATH of the installing
process>`, so a resumed job's `preflightEngine` finds `pi` and `node` and the finisher finds `herdr`; `HOME` is the user
manager's, so the bridge's path under `homedir()` resolves. `--install` run again with the same `PATH` changes nothing;
with another `PATH` it rewrites the service (Decision 2). The golden test renders a fixed `PATH`.

(h) Cuts: `docs/seat/quota-resume.ts` with `git rm`; its entries in `biome.jsonc` (`:97`) and in `test/structure.test.ts`
(`:720`); its lines in `docs/seat/README.md`; the comment `src/job/record.ts:830-834` names the definition, not the
file. `package.json`'s `"docs/seat"` stays (other files remain).

(i) Registry: the `movedBy` of the four `rule` entries becomes `"R-102"` (fact 8, with their comments and the tests that
name it). Help and the generated sections of `docs/commands.md` follow.

(j) Docs: `docs/jobs.md` (the quota kind, the resume, the cap, owed wakes), `docs/commands.md` (the sweep's resume
step), `docs/seat/README.md`.

(k) Tests, each failing before the change:
- `test/runtime/resuming.test.ts` (new): each exclusion of (a) (not due, `resetAt` `null`, `migrated`, a marker, not
  the newest record, a group member with its line); a due job is resumed once with the parent's route and
  `quotaAttempt` 1, a second run resumes nothing; attempts 2 and 3; a refused resume is a line.
- `test/cli/sweep.test.ts`: a `limen seat sweep` run resumes a due `quota` job of a registered project once.
- `test/cli/continue.test.ts`: two continuations of one ordinary job, the second refused `LIVE_CONTINUATION`.
- `test/job/finalize.test.ts`: a job with `quotaAttempt` 3 that ends on the limit is `quota-exhausted`.
- `test/seat/alerts.test.ts`: `failed:quota` only with `resetAt` `null`.
- `test/hook/wake.test.ts`: a coordinator turn ended on the limit spends no attempt and writes `owedWake` with the
  reset; the wake is held until the sweep releases it, then delivered; a limit turn with no owed wake wakes nothing.
- `test/job/wake-text.test.ts`: the `quota` and `quota-exhausted` wake texts from record fields, no provider text.
- `test/job/record.test.ts`: `quotaAttempt` and `owedWake` read when present, refused (`BAD_DATA`) when malformed,
  absent in older records.
- `test/platform/systemd-units.test.ts`: the service's `Environment=PATH=` (golden, fixed `PATH`).
- `test/registry.test.ts`, `test/structure.test.ts`: no `movedBy: "R-034"`; no exception for `quota-resume.ts`; the
  new writers in `STATE_TRANSITIONS`.

## Out of scope

- The seat rules and `limen rule` (R-102, D-094 (2)); `endDueRules` before every command (R-102).
- R-059's hourly usage reading, which resumes a `quota` job with `resetAt` `null` (D-097 (5) (b)).
- The parent's recorded system prompt (A-079, R-039): the resumed job keeps today's copied transcript.
- The daily steps of the sweep (R-101); leftover Herdr tabs (R-101).
- A resume of other failure kinds (A-001).

## Acceptance

- AC-1: `node --test test/runtime/resuming.test.ts` → exit 0; `node --test test/cli/sweep.test.ts` → exit 0.
- AC-2: `node --test test/cli/continue.test.ts` → exit 0; `node --test test/job/finalize.test.ts` → exit 0.
- AC-3: `node --test test/seat/alerts.test.ts` → exit 0; `node --test test/hook/wake.test.ts` → exit 0.
- AC-4: `node --test test/job/wake-text.test.ts` → exit 0; `node --test test/job/record.test.ts` → exit 0.
- AC-5: `node --test test/platform/systemd-units.test.ts` → exit 0; `node --test test/registry.test.ts` → exit 0.
- AC-6: `node --test test/structure.test.ts` → exit 0; `node --test test/help.test.ts` → exit 0.
- AC-7: `git grep -q 'movedBy: "R-034"' -- src/registry.ts` → exit 1.
- AC-8: `git ls-files --error-unmatch docs/seat/quota-resume.ts` → exit 1.
- AC-9: `node adrian-rebuild/tools/fails-before.mjs` → exit 0, its output in `outcome.md` → `## Fails before`.
- AC-10: `node adrian-rebuild/tools/gate.mjs` → exit 0.
- AC-11: `npx biome check --error-on-warnings .` → exit 0; `node adrian-rebuild/tools/check.mjs` → exit 0.
- AC-12 (judgment): a due `quota` job is resumed exactly once per reset, by code, with its recorded route, at most
  three times, then `quota-exhausted` and one alert; no message to the coordinator quotes provider text; a wake the
  limit blocked is kept on the record and delivered after the reset, never lost and never spent by the limit.

## Migration

- `quotaAttempt` and `owedWake` are optional when read (D-079's additive pattern); older records have neither.
- The migrated M1 records with kind `quota` are `migrated` and never resumed (D-057 (4)).
- `docs/seat/quota-resume.ts` is cut; on the seat its link in Pi's extensions folder is removed before a0.3.0 (step
  3.4, D-097 (5) (k)).
- The sweep's service gains a `PATH` line: seat step 3.1's `--install` writes it (both are in a0.3.0).

## Risk

- D-097 (2), accepted: a resume in the seconds between `seat/deploy.ts`'s running-job check and its checkout starts a
  job on mixed code (a `launch` or `internal` failure, nothing lost); after a rollback, a record with a new field is
  `BAD_DATA` for the old code.
- A resume starts a job with nobody watching; the cap of 3 and the alerts bound it.
- The unit's `PATH` is the installing shell's; a tool moved later is found only after `--install` runs again.

## Rollback

`git revert $(git log --format=%H --grep='^R-034:' adrian-rebuild --)`. After a revert, a record with `quotaAttempt` or
`owedWake` is `BAD_DATA` (D-079); the rollback of a format change is the snapshot of `## Deployment` 0.1. The seat's
link to `quota-resume.ts` is not restored (its lessons are in A-016).

## Decisions

Settled by the documents when the ticket was written (2026-11-24, the main session's reading; D-097 (5) settles the
mechanism; items 2, 3 and 5 are named for Adrian's attention at gate 5.3):
1. The step's place: after the reap and the leftover scopes, so a dead job is finalized before it can be a candidate,
   and before the coordinators and the ring; its module is `src/runtime/resuming.ts`, named after the operation as
   `sweeping.ts`, `pruning.ts` and `retiring.ts` are, with a basename no other file has.
2. The unit's `PATH` (D-097 (5) (j)): the installing process's own `PATH`, written into the service, because the
   seat's `pi`, `node` and `herdr` live where the agents' login shell finds them, which the code cannot know; a fixed
   list would miss them. `HOME` needs no line.
3. The task and wake words (D-097 (5) (f), (i)): built from `id`, `resetAt`, `quotaAttempt` and the ticket codes of the
   record; the implementer proposes them in `outcome.md`, for gate 5.3.
4. A refusal of one resume (a race, `LIVE_CONTINUATION`) is an output line and no failure: another path already
   resumed the job, so nothing is lost (T-01 holds: it is named); a failure to start is the job's, named, and the run's
   worst class.
5. `owedWake` lives on the job whose wake is owed (every wake family, F7), not on the coordinator, since the hook
   looks up a job's wake by its job, and a coordinator session has no record (D-057 (7.2)).

2026-11-24, D-099 (1) (Adrian: "oba zgodnie z rekomendacjami"; the precedent is D-089):
6. `compare --git` voided the implementer's run only because (h) wrote the deletion as one span with spaces
   (`git rm` and the path together), which `changePaths` does not read; nothing else differed. Adrian accepted the
   run: (h) names `docs/seat/quota-resume.ts` in its own backticks, a new `snapshot --git` is taken, and `compare --git`
   runs again.

2026-11-24, review round 1 (`review.md` → Round 1; FAIL on AC-9 alone, the findings to fix, each with a test that
fails at `HEAD` on its mechanism where it changes code; D-100 is Adrian's, the rest the main session's reading):
- F1 (blocking, AC-9): `outcome.md` → `## Fails before` holds the first line of the main session's
  `fails-before.mjs` run. The main session writes it after the fixes; the implementer keeps its per-file runs there.
- F2 (D-097 (5) (d), exactly one resume): the resume passes the parent's id into `startContinue` as the record that
  must be the newest on its worktree, and validate's held read under the jobs lock refuses when another record is
  newest (a race, so a line of the run, Decision 4). Test: a continuation of the parent published and ended between
  the step's read and the resume's validate leaves no second resume and names the parent in a line.
- F3: a test drives two continuations of one ordinary job through the window between validate and apply (through
  `startContinue`, as `test/runtime/resuming.test.ts` does): the second is refused `STATE_CHANGED`, one job starts.
- F4 (T-29): the `quotaAttempt` reading test asserts what `HEAD` cannot give: 3 is read, 4 is refused `BAD_DATA` with
  the cap's expectation text.
- F5 (T-29 (3) and check 4): `test/hook/wake.test.ts` loads at `HEAD` (it imports no module or export `HEAD` lacks;
  it plants the fields through the record's JSON), so each owed-wake test fails at `HEAD` on its mechanism, one
  mechanism per test: a limit turn spends no attempt and writes `owedWake` with the reset; a wake is held while
  `owedWake` is on its job; once the field is gone the wake is delivered. The sweep's release keeps its own test in
  `test/runtime/resuming.test.ts`.
- F6 (T-29 (2), (3)): `test/runtime/resuming.test.ts:84` becomes one test per mechanism (the record-field filter:
  `migrated`, `landed`, `abandoned`, exhausted; the due time; the newest record on the worktree); each test name holds
  at most one identifier (`:188`).
- F7 (D-097 (5) (h)): a coordinator turn that ends on the limit spends neither attempt for every wake family
  (`_advisory`, `_start`, `_completion`), each claim lies in its job's folder, so the wake is owed on that job's record,
  held and released the same way. Deviation 5 is withdrawn, and Decision 5 reads "the job whose wake is owed". Test:
  an advisory wake whose turn ends on the limit.
- F8 (D-100): `failed:quota` also rings for a known `resetAt` once the job is overdue (`resetAt` + 5 min + 15 min, a
  named constant beside `AFTER_RESET_MS` in `src/job/quota.ts`) while it has no continuation (still the newest record
  on its worktree, no `landed` or `abandoned` marker), once per job; a group member is covered by the same rule. Tests:
  a known reset not yet overdue sends nothing; overdue and not resumed sends `failed:quota` once; overdue with a newer
  record on the worktree sends nothing; an overdue group member sends it. `docs/jobs.md`, `docs/remote.md` and
  `docs/seat/agent-setup.md` say so.
- F9 (T-18): the sweep's output lines name the limit as the task and the wake do ("the subscription limit"); the help
  keeps "quota jobs", the failure kind `quota`.
- F10 (T-10): `templates/agents.md:68` states no number of the resume (no "5 minutes", no "3 times"), since the wake,
  built from the constants, says when and which resume; its new first hash in `templates/.history/agents.md`.
- F11: the exit-code table of `docs/commands.md` (row 4) names `NO_PATH` beside `NO_LINGER`.
- F12 (T-30 (1)): the headers of `src/runtime/resuming.ts` and `src/job/quota.ts` say why the module exists, not a
  restatement of D-097 (5).
- Rejected: (a) the note that (k)'s "a coordinator's own turn that ends on the limit wakes nothing" passes at `HEAD`:
  it asserts an absence `HEAD` already has and guards the new hook code against a false owed wake, and `outcome.md`
  says so; (k)'s rule is for the tests of a new mechanism. (b) The note that one damaged record refuses every
  `limen continue` of its project: an unreadable record may be a live job on the same worktree, so refusing is the safe
  side (z. 14), as spawn does; the resume's case is now rung by F8. (c) The reviewer's process note (test output in the
  session's scratchpad, outside the tree; `compare` unchanged).
- For gate 5.3, unchanged: the words for a `null` reset until R-059 (D-097 (5) (b), (i)), and `outcome.md`'s open
  points 4–6.

2026-11-24, review round 2 (`review.md` → Round 2; PASS; the second and last round of fixes, D-053 (2)):
- G1 (note 1, T-30 (2)): every comment that cites this ticket's decision names it "R-034 Decision N".
- G2 (note A, T-29 (2)): the hook test of a held wake has a name that claims one thing.
- G3 (note D): the hook clears `limitEnd` with the delivery maps at `session_start` and `session_shutdown`, so no run
  owes a wake on an earlier session's limit. Test: a limit `message_end`, then a new session, then an unconfirmed wake
  spends its attempt as before.
- By the main session: Decision 5 and `## Change` (e) say "the job whose wake is owed" (F7); `outcome.md` →
  `## Open points` names the past resume time of a late owed wake (note 3, for gate 5.3) and the two "split pending"
  suppressions for R-082's ratchet (note C).
- Rejected: notes A (the failure at `HEAD`) and B, for the reasons in `review.md` → Round 2.
