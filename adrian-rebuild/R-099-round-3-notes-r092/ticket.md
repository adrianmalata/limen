<!-- PL: Ticket R-099 (D-077): poprawki czterech uwag rundy 3 recenzji R-092. Ponowne uruchomienie `github review`
i `github work` pod blokadą jobów usuwa bramkę przekazania, którą zostawił crash bez rekordu joba; `GROUP_STOP_INCOMPLETE`
dostaje klasę przyczyny; szablon kontraktu mapy mówi, że odmowa `--strict` nie zapisuje pliku; `git()` migawki testów
zgłasza błąd gita. Stan: napisany 22.11 w nocy przy `50212ef`; zamknięty (done) tej samej nocy; po rundzie 1 recenzji (FAIL) w
`## Decisions` poprawki F1–F8: gałąź recenzji dopiero po rekordzie joba, bramka zarchiwizowanego joba dalej odmawia,
`github resolve` pod blokadą jobów, dokumentacja, testy klas zatrzymania, jeden skan znacznika, linia i komentarze;
po rundzie 2 (PASS z uwagami) poprawki G1–G5: id joba z kopii claimu tylko w formacie id, dokumentacja blokady,
testy porażki gałęzi recenzji i reguły odmowy, sprostowanie przesłanki F1. -->

# R-099 The round-3 notes of R-092: a stale handoff gate, the class of an incomplete stop, the snapshot's git

## Problem

Adrian's decision, quoted from `plan.md` → `## Decisions`:

- D-077 (Q-26, option 1): "a new fix ticket R-099 (S, stage 2, delegated, night, after R-092) for R-092's round-3
  notes 1, 2, 6 and the template line of note 3: a rerun under the jobs lock removes a GitHub handoff gate with no job
  record; `GROUP_STOP_INCOMPLETE` takes its cause's class (T-02); the template's sentence on a refused `--strict`
  build; the snapshot's `git()` reports a git failure except `symbolic-ref` on a detached HEAD; each with a test that
  fails before."

The notes, quoted from `adrian-rebuild/R-092-refusal-leaves-no-trace/review.md` → Round 3:
1. "A crash, as opposed to a thrown failure, between the handoff gate and the job record leaves
   `.limen/github/inflight/<claim>` with no job. A rerun then refuses `GITHUB_HANDOFF_GATE` with `next: limen status
   --all`, which shows no job, so that case still needs manual recovery. The gate and the record are written under
   the same jobs lock, so a rerun holding that lock could tell a stale gate from a live handoff."
2. "`GROUP_STOP_INCOMPLETE` is class `transient` even when its cause is permanent. A running member with no pid makes
   every rerun end the same way, and timers retry exit 3 as safe."
3. "Two docs still say `--json F` writes the model without saying that a build `--strict` refuses writes no file."
   (`docs/picture.md` was fixed with R-092; `templates/picture/CONTRACT.md:91` is left.)
6. "The shared snapshot's `git()` returns \"\" on any git failure. A snapshot taken where git cannot run would compare
   \"\" with \"\" and miss a new branch or worktree. Only `symbolic-ref -q HEAD` on a detached HEAD needs that
   tolerance."

T-38 (3), quoted from `taste.md`: "Failures after the first write (exit codes 3, 4, 5): a single effect is atomic
(A-022); several effects are steps in the record, continued when the command runs again (the pattern of A-021)." T-02:
"3 transient failure: a lock after its wait limit, the network, a rate limit; safe to retry; 4 environment failure:
git, the file system, permissions, a missing tool; 5 internal error […] Timers retry 3 at their next run and ring only
after several in a row; 2, 4 and 5 ring at once".

Facts at `50212ef` (the main session read each at `f541f37` and again at `50212ef`):
1. `src/integrations/github-claims.ts`: `validate` refuses `GITHUB_HANDOFF_GATE` when `handoffGate(root, claim)`
   exists and `matchedGithubJob` finds no job (`:286-296`); the gate is spawn's `firstWrite` (`:315`), entered by
   `enter` (`:359-366`), which ends with `STATE_CHANGED` when the gate exists already.
2. `src/job/group-control.ts:541-549`: any failure of `stopMembers` (`:556-571`, each member's `stopMemberJob`) ends
   with `GROUP_STOP_INCOMPLETE`, class `transient`, `next: limen group stop <id>`; `test/cli/group.test.ts:423`
   asserts that a rerun ends the same way.
3. `templates/picture/CONTRACT.md:91`: "`--strict` exits 1 on any error diagnostic", with no word on the file of
   `--json F`; `docs/picture.md:17` says it since R-092.
4. `test/snapshot.ts:86-96`: `git(root, args)` returns "" on any failure of git.

## Change

(a) `github review` and `github work`: a gate of the claim that no job answers is stale when the jobs lock is held and
still no job record answers the claim, since a live handoff enters the gate and writes its record under that lock; the
rerun then removes the stale gate in its `apply`, under the lock, and enters it again, so a crash between the gate and
the record needs no manual recovery. A gate whose job exists keeps today's behaviour. `docs/remote.md`, where it names
the gate, says so.

(b) `GROUP_STOP_INCOMPLETE`: a member a rerun can still stop keeps class `transient`; a failure no rerun can change (a
running member with no pid) takes the class T-02 gives its cause, with its own code or the same code under that
class (the implementer's choice, named in `outcome.md`), and a `next` that names what the owner can do.

(c) `templates/picture/CONTRACT.md:91` says that a build `--strict` refuses writes no file, `F` included, as
`docs/picture.md:17` does; a history line where the templates' convention keeps one (A-085).

(d) `test/snapshot.ts`: `git()` throws on a failure of git, except the one call that may fail by design
(`symbolic-ref -q HEAD` on a detached HEAD, read as ""); `test/snapshot.test.ts` gets a case where git cannot run and
the snapshot fails.

Each mechanism with a test that fails before its change; the refusal and rerun tests with the shared snapshot.

## Out of scope

- The rest of `github` (R-057 and the commands on the T-38 ratchet); groups beyond `group stop`'s class.

## Acceptance

- AC-1: `node --test test/cli/github.test.ts` → exit 0.
- AC-2: `node --test test/cli/group.test.ts` → exit 0.
- AC-3: `node --test test/snapshot.test.ts` → exit 0.
- AC-4: `node adrian-rebuild/tools/fails-before.mjs` → exit 0, its output in `outcome.md` → `## Fails before`.
- AC-5: `node adrian-rebuild/tools/gate.mjs` → exit 0.
- AC-6: `npx biome check --error-on-warnings .` → exit 0; `node adrian-rebuild/tools/check.mjs` → exit 0.
- AC-7 (judgment): a stale gate is removed only under the jobs lock with no job record of the claim, so a live handoff
  is never taken over.

## Migration

None: a stale gate on the seat is removed by the first rerun of its claim.

## Risk

- Removing a live handoff's gate would start a second job for one claim; AC-7 and a test of a gate whose job exists
  hold it.

## Rollback

`git revert $(git log --format=%H --grep='^R-099:' adrian-rebuild --)`.

## Decisions

- 2026-11-22 D-077 (Adrian): quoted in `## Problem`.
- 2026-11-22, night, review round 1 (`review.md` → Round 1: FAIL, one blocking finding): the first round of fixes, for
  a fresh `rebuild-implementer` (D-026 (2)). The choices in F1–F3 are the main session's night defaults (category A of
  D-054 (2)), for Adrian to confirm in the morning. Each mechanism gets a test that fails before its fix (T-29: one
  mechanism per test; refusal tests compare the shared snapshot, T-38).
  - F1 (finding 1, blocking): the review's branch (`branchAt`, which only `github review` passes) is made after the job
    record is published, as a step after the first write whose failure ends the job `failed` with the reason, as a
    failure to make the worktree does (`launchChecked`, before the worktree; T-38 (3)); `publishSpawn` then makes no
    branch and needs no branch cleanup. So a crash between the gate and the record leaves no branch, and the rerun of
    `github review` starts the job, as `github work`'s does; a crash after the record leaves a `starting` record with
    no pid, which the reaper ends (A-056), and a rerun then names that job. A test: `github review` run again after a
    crash that left the claim's gate with no job record starts the job. If the reorder breaks a guarantee that a test
    or a comment names, stop with `BLOCKED` and that guarantee; do not fall back to deleting a branch.
  - F2 (finding 2): a gate is stale only when, besides no job record and no no-job answer, the claim's copy that
    validate reads (`claimPath`) names no job: the poller's reconcile writes `job` there once it sees the job's record
    (`src/integrations/github-poller.ts:387-391`, `persist` → `mirror`), so a job that `limen prune --retire` removed
    leaves a gate that is not stale. That gate refuses `GITHUB_HANDOFF_GATE` with a message that names the job and says
    that a new job needs a new request on GitHub, `next: null`, and the same rule holds in `#removeStale`'s read under
    the lock. A test: a gate whose claim copy names a job with no record refuses and leaves the snapshot identical.
  - F3 (finding A): `github resolve` makes its gate and writes its answer in one hold of the jobs lock (`withLock` of
    `jobsLock`, the lock only; its T-38 shape stays R-082's), so a take-over under that lock never meets a resolve
    between its two writes; the comment at `src/integrations/github-claims.ts:150` says the new rule. Check first that
    no caller of `recordNoJobAnswer` holds the jobs lock already. A test that fails before, if one can show it with no
    waiting (T-31); otherwise `outcome.md` says why there is none.
  - F4 (finding B): `docs/remote.md:163` says each case as the code has it: a `starting` record of the claim or a no-job
    answer refuses `GITHUB_HANDOFF_GATE`; a running or finished job of the claim is named; a record of another shape
    refuses `GITHUB_CONFLICT`; a gate whose claim copy names a job refuses (F2); and F1's order (no branch before the
    record). The header of `src/integrations/github-claims.ts` says the same in short.
  - F5 (findings 7 and C): a test per rule of `stopCause` through the stop of a member (a typed transient failure stays
    `transient`, a plain `Error` is `environment`, `JOB_NO_PID` is `environment` with `limen sweep`), and a test that
    asserts exit code 3 and the code `GROUP_STOP_INCOMPLETE` of the path where every member may still stop (T-02's
    Check); with no wait longer than the stop's own, or through the shared wrapper on the error if a live member cannot
    be planted without one, named in `outcome.md`.
  - F6 (finding 5): one function scans the job records for the claim's marker, in the module that owns the marker;
    `claimHasJob` and `matchedGithubJob` both use it (T-25 (2)).
  - F7 (finding 4): `#removeStale` prints its line only when it removed a gate.
  - F8 (finding 3): the test comments that cite `AC-7` name R-099 with it, or say the property in words (T-30).
  - No change for finding 6 (`review.md` → Round 1). `outcome.md` is updated: the new tests, the deviations, and Open
    points 1 and 2, which F2 and F3 close.
- 2026-11-22, night, review round 2 (`review.md` → Round 2: PASS with four notes, two of which need a fix of code or
  tests): the second and last round of fixes, for a fresh `rebuild-implementer` (D-026 (2)). After it, review round 3;
  a finding of round 3 that needs another fix of code goes to Adrian (protocol step 6).
  - Correction of F1 (finding 1): its sentence "a crash after the record leaves a `starting` record with no pid, which
    the reaper ends (A-056), and a rerun then names that job" is false: the reaper skips a record that is not
    `running` (`src/runtime/reap.ts:93`), and prune removes a `starting` record whose spawner is gone after the
    10-minute grace (`src/runtime/pruning.ts:61-65`, `:175`). F1's change stands; the case is G5's open point.
  - G1 (finding 2): F2's refusal names the job of the claim's copy only when the value has the form of a job id
    (`JOB_ID`, `src/job/id.ts`); any other value refuses the same way, `GITHUB_HANDOFF_GATE` with `next: null`, with a
    message that says the copy names a job and does not print the value, since a job can write that copy and the
    message reaches the coordinator model. A test with a value that is no job id: the refusal, an identical snapshot,
    and a message without the value.
  - G2 (finding 3): `docs/remote.md:163` says which reads run under the jobs lock: validate decides the named job,
    `GITHUB_CONFLICT` and the gate's refusals with no lock, and only the stale gate's facts (a job record of the claim,
    the copy's job, the answer) are read again under it before the gate is removed.
  - G3 (finding 4): a test that makes the review's branch step fail after the job record (for example a branch of that
    name made between the apply and the step, through the seam of `startCheckedClaim`) and asserts the job's `failed`
    end with the reason, the gate kept, and the command's exit code and `code`.
  - G4 (C2): a test of `stopCause`'s refusal rule through the stop of a member (a refusal other than `JOB_NO_PID` is
    the internal `REFUSED_AFTER_VALIDATE`), asserting the class and, through the shared wrapper or the CLI, exit code 5.
  - G5 (finding 1 and C1): `outcome.md` says what the code does after a crash between the record and the wrapper's
    start (`GITHUB_HANDOFF_GATE` until prune removes the `starting` record, then `BRANCH_EXISTS` for `github review`,
    as at `HEAD`), as an open point, and records C1 (`.limen/.publishing-<id>` left by a crash between the gate and
    the record, publication's own) as an open point.
