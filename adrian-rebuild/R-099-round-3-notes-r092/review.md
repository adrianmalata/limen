<!-- PL: Recenzje ticketu R-099 (cztery uwagi rundy 3 recenzji R-092). Runda 1 (noc 22.11): pierwsza odpowiedź
odrzucona przez `review-verdict.mjs` za formę linii AC-6, druga (świeży recenzent) FAIL z jednym znaleziskiem
blokującym: ponowne `github review` po crashu po utworzeniu gałęzi recenzji odmawia `BRANCH_EXISTS`. Do pierwszej rundy
poprawek idą: gałąź recenzji tworzona dopiero po rekordzie joba, bramka zarchiwizowanego joba dalej odmawia,
`github resolve` pod blokadą jobów, dokładniejsze `docs/remote.md`, testy klas `GROUP_STOP_INCOMPLETE`, jeden skan
znacznika claimu, linia o usunięciu tylko po usunięciu i kwalifikowane AC-7; uwaga o repozytorium bez commita
odrzucona. Runda 2: pierwsza odpowiedź odrzucona za formę (punktory), druga PASS z czterema uwagami; do drugiej
i ostatniej rundy poprawek idą: nazwa joba z kopii claimu w komunikacie tylko w formacie id joba, dokładniejsze
`docs/remote.md`, testy porażki gałęzi recenzji po rekordzie i reguły odmowy w `stopCause`, poprawione przesłanki
w `outcome.md`. Runda 3: PASS z dwiema uwagami tylko w `docs/` (kolejność odmów w `docs/remote.md`, tabela kodów
wyjścia w `docs/commands.md`), poprawionymi przez sesję główną bez kolejnej rundy. Stan: recenzja zamknięta. -->

# R-099 review

## Round 1 (2026-11-22, night, the runner's second start, run 1 of `night.mjs`)

- Before: the implementer's run → `review-guard.mjs compare --git` "within its limits", exit 0; the main session's
  `gate.mjs` → exit 0, 722 tests, 722 pass, 0 fail (tsc and Biome first, in `npm run check`); `fails-before.mjs` →
  exit 0 (six files fail at `HEAD` `4cc9eb0`), and `fails-before.mjs test/snapshot.test.ts` → exit 0, recorded in
  `outcome.md` → `## Fails before` before the review.
- First reply: `rebuild-reviewer` with the ticket, `node_modules/.rebuild-review/R-099.diff` and `taste.md`;
  `review-guard.mjs compare` → "unchanged", exit 0; `review-verdict.mjs` → exit 1, rejected for its form: its AC-6 line
  read "met by the implementer's record only", because the reviewer's list has neither `check.mjs` nor Biome. The main
  session then ran `npx biome check --error-on-warnings .` and `check.mjs` (both exit 0), recorded them in
  `outcome.md` → `## Proof`, AC-6, and took a new snapshot and diff.
- Second reply: a fresh `rebuild-reviewer` with the same three paths; `review-guard.mjs compare` → "unchanged", exit 0;
  `review-verdict.mjs` → "consistent", exit 0.
- Verdict: **FAIL**. AC-1–AC-7 met (AC-1 with the eight `github poll` tests that fail outside the gate's private
  `TMPDIR`, platform exception P2 and D-034); one blocking finding.

| # | Finding (short) | Decision |
|---|---|---|
| 1 | blocking · proven: (a) does not reach `github review`: a crash after the spawn's apply made the review's branch (`src/job/spawning.ts:418-420`) and before the record (`:424`) leaves that branch, and the rerun refuses `BRANCH_EXISTS` in validate (`:742-751`), so the branch still needs removing by hand, against `## Change` (a), `docs/remote.md:163` and the header of `src/integrations/github-claims.ts:8`; no test reruns a review after a crash | fix (F1): the review's branch is made after the job record, as a step after the first write (T-38 (3)), so a crash between the gate and the record leaves no branch |
| 2 | note · observed: `outcome.md` → Open point 2 holds today: `limen prune --retire` removes the folder of a finished job whose branch landed (`src/commands/prune.ts:88-102`) and leaves the claim's gate, so a later `github work` of that claim now starts a second job, where `HEAD` refused | fix (F2): a gate is stale only when the claim's copy names no job either; the gate of a retired job keeps refusing, with a message that names the job |
| 3 | note · observed: two test comments cite `AC-7` with no ticket (`test/cli/github.test.ts:294`, `test/integrations/github-claims.test.ts:82`), which resolves nowhere once R-099 is closed (T-30) | fix (F8): the comments name R-099 with it, or say the property in words |
| 4 | note · observed: `#removeStale` prints "removed the handoff gate of claim …" also when the gate is already gone at apply, after a failed start's `leaveWithoutJob` took it (`src/integrations/github-claims.ts:430-433`, `rm` with `force`) | fix (F7): the line only when the rerun removed a gate (T-01) |
| 5 | note · observed: `claimHasJob` repeats the marker scan of `matchedGithubJob` in a second module (`src/integrations/github-claims.ts:469-477`, `src/integrations/github-review.ts:103-108`; T-25 (2)) | fix (F6): one function for the scan, in the module that owns the claim's marker, which both use |
| 6 | note · guessed: the snapshot now throws in a repository with no commit, since `rev-parse -q --verify HEAD` exits 1 on an unborn HEAD (`test/snapshot.ts:46`) | no change: no test takes a snapshot of a repository with no commit; D-077 asks `git()` to report every failure but `symbolic-ref` on a detached HEAD, and a future test there gets an error that names the git call, which is what (d) is for (YAGNI) |
| 7 | note · observed: the transient path of `GROUP_STOP_INCOMPLETE` (exit 3) is checked only by its class in a unit test; no test asserts its exit code, which T-02's Check asks of every failure path (`test/job/group-control.test.ts:10-18`; `test/cli/group.test.ts:413-423` asserts exit 4 now) | fix (F5): a test asserts exit code 3 and the code of that path |

The first, rejected reply had three findings the second does not repeat; the main session read each in the code and
adds them (`src/integrations/github-claims.ts:150-162`, `docs/remote.md:163`, `src/job/group-control.ts:642-647`):

| # | Finding (short) | Decision |
|---|---|---|
| A | note · proven: the take-over weakens the exclusion between a job and a no-job answer: `github resolve` makes the gate and writes its answer outside the jobs lock, so a rerun that reads the gate between those two writes, in validate and again in apply, removes resolve's gate and starts a job while the answer is still written; the comment "the gate's `mkdir` decides, once" is no longer true (`outcome.md` → Open point 1) | fix (F3): `github resolve` makes its gate and writes its answer in one hold of the jobs lock (the lock only; its T-38 shape stays R-082's), and the comment says the new rule |
| B | note · proven: `docs/remote.md:163` says a gate whose claim a job record carries refuses `GITHUB_HANDOFF_GATE`; that holds only for a `starting` record: a running or finished record of the claim makes the command name its job, and a record of another shape refuses `GITHUB_CONFLICT` (`src/integrations/github-claims.ts:303-306`, `src/integrations/github-review.ts:111-123`) | fix (F4): the paragraph says each case, and the new rules of F1–F3 |
| C | note · proven: `stopCause` changes the class of every member failure other than `JOB_NO_PID` (a plain `Error` becomes `environment`, a refusal the internal `REFUSED_AFTER_VALIDATE`, where `HEAD` made all `transient`), and no test covers it: the unit tests pass the class into `incompleteStop` by hand, and `stopCause` is not exported | fix (F5): a test per rule of `stopCause` through the stop of a member, each one mechanism (T-29) |

Taste answers (second reply): T-29 yes (each test fails for one reason; the race test can reach `STATE_CHANGED` with an
equal snapshot only through `#removeStale`'s second read, though it does not assert the message). T-30 yes, but for
finding 3. T-40 no step waits for the owner; (b) ends with exit 4 and `limen sweep` in `next`, a condition the code
reports.

Fixes (for a fresh implementer, `ticket.md` → `## Decisions`; the first round of fixes): F1–F8.

## Round 2 (2026-11-22, night, the runner's second start, run 1 of `night.mjs`)

- The first round of fixes: a fresh implementer (`DONE`; F1–F8); `compare --git` → "within its limits", exit 0.
- Before: the main session's `gate.mjs` → exit 0, 730 tests, 730 pass, 0 fail; `fails-before.mjs` → exit 0 (the same
  six files fail at `HEAD` `4cc9eb0`), and `fails-before.mjs test/cli/github.test.ts` → exit 0; `npx biome check
  --error-on-warnings .` and `check.mjs` → exit 0; all recorded in `outcome.md` before the review.
- First reply: `rebuild-reviewer` with the three paths; `review-guard.mjs compare` → "unchanged", exit 0;
  `review-verdict.mjs` → exit 1, rejected for its form: bullet lines under AC-7 and inside one finding. Its verdict was
  PASS with five notes; four of them return in the second reply, and the fifth (C2 below) the main session read in the
  code.
- Second reply: a fresh `rebuild-reviewer` with the same three paths and the line form spelled out in its prompt;
  `review-guard.mjs compare` → "unchanged", exit 0; `review-verdict.mjs` → "consistent", exit 0.
- Verdict: **PASS**. AC-1–AC-7 met; no blocking finding. Two notes need a fix of code or tests, so the round is not
  closed by the main session alone (D-053 (2)): the second and last round of fixes.

| # | Finding (short) | Decision |
|---|---|---|
| 1 | note · proven: F1's premise is false: the reaper skips a record that is not `running` (`src/runtime/reap.ts:93`), and prune removes a `starting` record with a dead spawner after the 10-minute grace (`src/runtime/pruning.ts:61-65`, `:175`); so a `github review` that crashes after its branch is made (now after the record) and before the wrapper starts refuses `GITHUB_HANDOFF_GATE` until prune, then `BRANCH_EXISTS`; outside (a)'s window and no worse than `HEAD`, but `outcome.md` states the premise as a fact and has no open point for it | fix (G5): `outcome.md` says what the code does and records the case as an open point; `ticket.md` → `## Decisions` corrects F1's sentence (docs and records only) |
| 2 | note · observed: F2's refusal puts the claim copy's `job` field into its message unchecked; `claimOf` is a cast of `JSON.parse`, and the checkout's copy is group-writable in a folder the jobs share (`src/integrations/github-claims.ts:355-359`, `:502-504`; `src/integrations/github-poller.ts:230-233`), so text a job writes reaches the coordinator model in a refusal line | fix (G1): the message names the job only when the value has the form of a job id (`JOB_ID`, `src/job/id.ts`); any other value refuses the same way with a message that does not print it; a test with a value that is no job id |
| 3 | note · observed: `docs/remote.md:163` says a rerun reads the claim's state under the jobs lock "in this order"; validate's reads (`matchedGithubJob`, `refuseHeldGate`) take no lock, and only `#removeStale`'s re-read runs under it | fix (G2): the paragraph says which reads run under the lock |
| 4 | note · observed: making the review's branch is now a step after the record whose failure ends the job `failed` and keeps the gate; no test drives that failure, which T-02's Check asks of every failure path (`src/job/spawning.ts:444-446`, `:463-466`) | fix (G3): a test that makes the branch step fail after the record and asserts the job's end, its reason, the gate and the exit code |

The first, rejected reply had one note the second does not repeat, and one that the second omits; the main session read
both in the code:

| # | Finding (short) | Decision |
|---|---|---|
| C1 | note · observed: a crash between the gate and the record also leaves `.limen/.publishing-<id>`, which `publishJob` removes only in its `catch` (`src/job/publication.ts:84-114`; `git grep -n '\.publishing-' -- src` → only `:86`); it does not block the rerun | no change: publication is outside this ticket; an open point in `outcome.md` (G5) for the ticket that owns publication |
| C2 | note · observed: `stopCause` has a fourth rule with no test: a refusal from a member's stop other than `JOB_NO_PID` becomes the internal `REFUSED_AFTER_VALIDATE`, so `GROUP_STOP_INCOMPLETE` exits 5 (`src/job/group-control.ts:648-660`); T-02's Check asks for the exit code of every failure path | fix (G4): a test of that rule through the stop of a member, with its class and the exit code |

Taste answers (second reply): T-29 yes (each new test fails for one reason; the typed-transient rule test guards
behaviour `HEAD` had). T-30 yes (F8 done; every cited identifier resolves). T-40 no step waits for the owner. T-31 no
waiting of the tests' own beyond the lock's 100 ms bound, the stop's 6 s and file events. T-38 the refusal tests
compare the shared snapshot; the branch is a step after the first write. T-25 F6 done (`markedJob`).

Fixes (for a fresh implementer, `ticket.md` → `## Decisions`; the second and last round of fixes): G1–G5.

## Round 3 (2026-11-22, night, the runner's second start, run 1 of `night.mjs`)

- The second round of fixes: a fresh implementer (`DONE`; G1–G5); `compare --git` → "within its limits", exit 0.
- Before: the main session's `gate.mjs` → exit 0, 733 tests, 733 pass, 0 fail; `fails-before.mjs` → exit 0 (the same
  six files fail at `HEAD` `4cc9eb0`); `npx biome check --error-on-warnings .` and `check.mjs` → exit 0; all recorded
  in `outcome.md` before the review.
- Reviewer: a fresh `rebuild-reviewer` with the three paths and the line form spelled out in its prompt;
  `review-guard.mjs compare` → "unchanged", exit 0; `review-verdict.mjs` → "consistent", exit 0.
- Verdict: **PASS**. AC-1–AC-7 met; no blocking finding; G1–G5 and the correction of F1 made, F1–F8 still hold. Both
  notes touch only `docs/`, so the main session closes the round with its own fixes and no further round (D-053 (2)).

| # | Finding (short) | Decision |
|---|---|---|
| 1 | note · observed: `docs/remote.md:163` reads the claim's state "in this order" but lists the no-job answer before the claim copy's job, while `refuseHeldGate` checks the copy's job first (`src/integrations/github-claims.ts:359-377`); only the message of a gate with both differs | fixed by the main session: the paragraph lists the `starting` record, the copy's job, then the answer, as the code checks them |
| 2 | note · observed: the exit-code table of `docs/commands.md` names, outside class 3, only the no-pid case of `GROUP_STOP_INCOMPLETE`; a member stop that fails in the environment also exits 4 with the same stop in `next`, and one that is refused exits 5 (`src/job/group-control.ts:566`, `:654-661`) | fixed by the main session: rows 4 and 5 of the table name both cases (the table is outside the sections the registry generates, A-084) |

Taste answers: T-06 each fix of rounds 1 and 2 is made. T-29 yes (the `github review` crash test needs both the
take-over and F1's order; the take-over has its own test, so its own reason is the order). T-30 yes (every cited
identifier resolves). T-40 no step waits for the owner. T-38, T-31, T-02 and T-25 as in round 2, with exit codes 3, 4
and 5 of `GROUP_STOP_INCOMPLETE` now tested. Security: the new messages print only the claim id, paths and a value of
the job-id form; the diff holds no home path, host or key name.
