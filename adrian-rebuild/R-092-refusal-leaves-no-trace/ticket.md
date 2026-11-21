<!-- PL: Ticket R-092 (T-38, D-061, D-070): odmowa nie zostawia śladu. Buduje wspólny kształt operacji: `validate`
dostaje tylko odczyt stanu i zwraca plan albo odmowę, `apply` sprawdza warunki ponownie pod blokadą i przy zmienionym
stanie kończy się kodem 3 przed pierwszym zapisem; jedną migawkę stanu do testów odmów, test typu i test wyścigu.
Przestawia dziewięć poleceń, które dziś zapisują przed odmową, typuje ich odmowy, a pozostałe polecenia zmieniające
stan trafiają na zapadkę, którą R-082 sprowadza do zera. Stan: napisany 21.11 w dzień przy 07ec41b; zamknięty (done) 22.11 po trzech rundach recenzji. -->

# R-092 A refusal leaves no trace: `validate` then `apply`

## Problem

The rule, quoted from `taste.md` → T-38: "Every `change` command follows one shape. (1) A domain operation is
`validate(): Plan | Refusal`, then `apply(plan)`; `validate` gets only a read interface of the state (no write
methods), so the type gives the guarantee (z. 14); a refusal (exit code 1) and a usage error (exit code 2) arise only
in `validate`. (2) `apply` repeats the conditions under the shared lock (A-018) and writes by compare-and-swap
(A-019); a state that changed since `validate` ends the command before the first write with exit code 3. (3) Failures
after the first write (exit codes 3, 4, 5): a single effect is atomic (A-022); several effects are steps in the
record, continued when the command runs again (the pattern of A-021). (4) The refusal tests of T-28 (1) use one shared
state-snapshot function (git refs, the worktree list, the tree status, a digest of `.limen/` and `spec/`): a refusal
leaves the snapshot identical; `test/s1-spawn.test.ts:37-62` is a special case of this." Its Check: "a type test:
`validate` has no access to write methods (a test file that tries to write in `validate` does not compile); every
refusal test of T-28 (1) compares the snapshots before and after; a race test: a state change between `validate` and
`apply` gives exit code 3 with no write; the rerun tests of T-28 (3) for commands with steps."

Adrian's decisions, quoted from `plan.md` → `## Decisions`:

- D-061 (2): "the new R-092 takes T-38 (the `validate`/`apply` shape, the type test, the race test, the shared
  snapshot), depends on R-021 and R-023, and R-025, R-030 and R-037 depend on it"; and, settled by the documents: "In
  R-023 and R-092: `ticket done` refuses before any move and `picture build --strict` writes nothing on a refusal
  (T-38 (1), T-01); a partial group roster is a sequence of recorded steps a rerun continues (T-38 (3)); commands with
  `movedBy` (including `group wait`) are exempt from the T-26 scans by that field […]; a converted refusal carries its
  own code (T-01, T-28 (1))."
- D-070 (1): "R-092 builds the mechanism of T-38 (1)–(4) and converts the nine change commands that write before a
  refusal today and have no `movedBy`, except `github poll`, whose state R-057 rewrites: spawn, continue, stop, ticket
  done, picture build, group start, group stop, github review and github work. R-092 stays size L."
- D-070 (2), settled by the documents: "a converted refusal carries its own code, so the `UNTYPED` ratchet of
  `test/structure.test.ts` falls and R-082 types the rest; argument errors of a converted command are usage, exit 2
  (T-02); a state changed since `validate` ends with exit 3 before the first write (T-38 (2)); commands with `movedBy`
  are exempt (D-061); the wrapper's `endDueRules` goes with seat rules (A-010, R-034) and T-04's housekeeping with
  R-032; the shape check over the other 18 change commands without `movedBy` starts as a ratchet, a list that may only
  shrink, which R-082 brings to zero (`## Stages` → conventions), and a ticket that rewrites such a command converts
  it (the reviewer question of T-38)."

Facts at `07ec41b` (the read-only inventory `adrian-rebuild/evidence/inventories/R-092.md`; the main session checked
its count of 35 `kind: "change"` entries in `src/registry.ts`, 8 of them with `movedBy`):

1. No `Plan | Refusal` type exists. Precedents: `transition` (`src/job/record.ts:442-470`, the one record writer,
   compare-and-swap under the job lock); `WorktreePlan` with `planWorktree` and `executeWorktree`
   (`src/job/spawning.ts:108-112`, `:519`, `:552`); `SpawnLaunch` (`:150-165`), "what the checks decided before any
   job record exists"; `parseJson` and `checkValue` (`src/boundary.ts:161`, `:172`) return `T | BadData`.
2. Almost every refusal is a plain `throw new Error`, which `failureOf` maps to class `refused`, code `UNTYPED`
   (`src/outcome.ts:117-118`); `test/structure.test.ts` holds that count at most 218 (`UNTYPED_THROWS`). Many
   argument checks of the nine commands are exit 1 today (for example `src/job/spawning.ts:575`, `:580`, `:611`,
   `:617`, `:622`, `:681`; `src/job/continuation.ts:96`; `src/job/group-control.ts:76`, `:86`;
   `src/project/ticket-folders.ts:104`).
3. The writes before a refusal, per command:
   - spawn: `mkdir .limen/jobs` (`spawning.ts:322`), the jobs lock (`:324`) and the `mkdir` of the worktree root
     (`:358`) come before the refusals at `:369`, `:385` and `:529-549`; in a group also the launch lock (`:136`) and
     the member slot (`:373`, `src/job/group-cabinet.ts:249`).
   - continue: the launch lock (`continuation.ts:175`), the jobs lock (`:187`) and the member slot (`:191`) before
     the refusal at `:194`.
   - stop: a log append (`src/job/stopping.ts:21`) and a finalize from `starting` (`:24`) before the refusal at `:34`.
   - ticket done: the renames and the ticket rewrite (`src/project/lanes.ts:129-132`), the board (`:135`) and a git
     commit (`:140`), before the refusal at `src/project/ticket-folders.ts:113`; no lock.
   - picture build: the `--json` file (`src/picture/picture-build.ts:30-31`) before `PICTURE_INVALID`
     (`src/picture/picture-check.ts:35`).
   - group start: `run.json` (`group-control.ts:226-227`), then the team spawns (`:289`); a refused team N writes
     `activation-error.json` (`:300`, read by nothing) and throws (`:304`); a rerun returns the open run without
     starting the missing teams (`:212-213`), and `group advance` then stalls (`src/job/group-rounds.ts:109`).
   - group stop: the stopped flag (`group-control.ts:387-391`), slot transitions (`:418`), member stops (`:430`) and
     `stop-report.json` (`:405`) before the refusal at `:407`.
   - github review and github work: the inflight gate (`src/integrations/github-claims.ts:372-374`), for review also a
     fetch (`:391`, `:395`) and `git branch` (`:399`), before spawn's checks (`:350`, `:364`); the gate is never
     released (manual recovery, `:378`).
4. Snapshot helpers in tests: `traces()` (`test/s1-spawn.test.ts:35-39`: the job folders, worktrees and branches; it
   misses the worktree root that `spawning.ts:358` creates) and `snapshot(dir)` (`test/cli/old-names.test.ts:91-101`:
   path to SHA-256, about 12 call sites); none compares `git status`. `ticket done` has no CLI test at all.
5. Taking a lock writes its lock file and parent folder (`src/lock.ts:167`, `:224`).

## Change

(a) The mechanism, one module (T-25), `src/operation.ts`:
- the types of a domain operation: `validate` takes a read view of the state, which has no write method, and returns
  a plan or a typed refusal (a `LimenError` of class `refused` or `usage`, `src/outcome.ts`); `apply(plan)` takes the
  plan;
- one runner that the converted commands go through: `validate`, then `apply`; `apply` repeats the plan's conditions
  under the shared lock (`src/lock.ts`) and writes by compare-and-swap; a state changed since `validate` ends with
  class `transient`, exit 3, its own code (by T-01's naming; `STATE_CHANGED` unless a better name follows from the
  code), before the first write of the command;
- failures after the first write follow T-38 (3): a single effect is atomic (`src/atomic-write.ts`), several effects
  are recorded steps a rerun continues.
The implementer shapes the read view from the precedents of fact 1; a write that `validate` needs is a defect of the
plan, not of the type.

(b) The type test: a test file that is part of `npx tsc --noEmit` holds a `validate` that tries to call a write method
on the read view, marked `@ts-expect-error`, so the check fails once the read view gains a write method.

(c) One shared snapshot function in `test/snapshot.ts` (T-25), with its own test `test/snapshot.test.ts`: git refs,
the worktree list, `git status --porcelain`, and a digest (path to SHA-256) of `.limen/` and `spec/`. `traces()` of
`test/s1-spawn.test.ts` and `snapshot()` and `traces()` of `test/cli/old-names.test.ts` give way to it.

(d) The race test (`test/operation.test.ts`): a state change between `validate` and `apply` of a converted command
gives exit 3 and leaves the snapshot identical. The lock's own files, if the lock module leaves its folder after the
release, are the only allowed difference, named in the test.

(e) The nine commands of D-070 (1) go through the runner. For each:
- no write before its last refusal check: every write of fact 3 moves after `validate`, and each refusal of fact 3
  that came after a write has a refusal test with the shared snapshot, failing before the change;
- its refusals and usage errors are typed with their own codes (T-01; names by the implementer), argument errors are
  usage, exit 2 (T-02), and the `UNTYPED_THROWS` baseline of `test/structure.test.ts` drops by the throws removed;
- its existing refusal tests use the shared snapshot.
Per command, in addition:
- ticket done refuses before any move (D-061) and gets a success test that the board is correct (gate 2 §6);
- picture build writes nothing on a refusal (D-061), the `--json` file included;
- group start: the checks that can run before the first write run in `validate`; the team spawns after `run.json` are
  recorded steps, and a rerun of the same `group start` starts the missing teams (D-061, T-38 (3)), with a rerun test;
  `activation-error.json`, read by nothing, gives way to the step record;
- group stop: a condition checkable before the first write is a refusal in `validate`; a failure after it is no
  refusal but the class T-02 gives it, and the steps stay idempotent;
- github review and github work: spawn's checks run before the inflight gate; a failure after the gate releases it or
  is a recorded step a rerun continues, so no manual recovery is needed; refs a refusal would leave (the fetch, the
  branch) are not left.

(f) The ratchet of T-38's shape, in `test/structure.test.ts`: a list of the change commands without `movedBy` that do
not go through the runner yet (18 at the end of this ticket); a test fails when a change command without `movedBy`
neither goes through the runner nor is on the list, and when a listed command goes through it, so the list may only
shrink. Whether a command goes through the runner is read from the code (the registry or an import scan, the
implementer's choice), not from the list alone. Its comment names R-082 as the ticket that brings it to zero.

(g) Docs that describe a changed behaviour follow the code (`docs/commands.md`, `docs/jobs.md`, `docs/groups.md`,
`docs/remote.md` where they name it), and so does a role text of `templates/` that names it (A-085: the ticket whose
mechanism a text describes changes it).

## Out of scope

- `github poll` (R-057) and the other 18 change commands without `movedBy` (the ratchet of (f); R-082 or the ticket
  that rewrites each); the commands with `movedBy` (D-061).
- The wrapper's `endDueRules` (R-034) and the housekeeping of read commands (R-032, T-04).
- Declaring refusals in the registry and the registry-derived tests (R-025, T-28 (1)); typing the other untyped throws
  (R-082).
- The atomic closing commit of `ticket done` and its steps after the first write (R-065, A-070); land (R-037).
- A refusing spawn on unlanded work (R-030), which builds on this shape.

## Acceptance

- AC-1: `npx tsc --noEmit` → exit 0 (the type test of (b) holds).
- AC-2: `node --test test/operation.test.ts` → exit 0.
- AC-3: `node --test test/snapshot.test.ts` → exit 0.
- AC-4: `node --test test/s1-spawn.test.ts` → exit 0.
- AC-5: `node --test test/cli/spawn.test.ts` → exit 0.
- AC-6: `node --test test/cli/continue.test.ts` → exit 0.
- AC-7: `node --test test/cli/stop.test.ts` → exit 0.
- AC-8: `node --test test/cli/ticket.test.ts` → exit 0.
- AC-9: `node --test test/cli/picture.test.ts` → exit 0.
- AC-10: `node --test test/cli/group.test.ts` → exit 0.
- AC-11: `node --test test/cli/github.test.ts` → exit 0.
- AC-12: `node --test test/cli/old-names.test.ts` → exit 0.
- AC-13: `node --test test/structure.test.ts` → exit 0 (the lowered `UNTYPED` baseline and the ratchet of (f)).
- AC-14: `node adrian-rebuild/tools/fails-before.mjs` → exit 0, its output in `outcome.md` → `## Fails before`, which
  names every new or changed test that passes at `HEAD`, with the reason.
- AC-15: `node adrian-rebuild/tools/gate.mjs` → exit 0.
- AC-16: `npx biome check --error-on-warnings .` → exit 0; `node adrian-rebuild/tools/check.mjs` → exit 0.
- AC-17 (judgment): for each of the nine commands, no write of fact 3 comes before its last refusal check, every
  refusal and usage error on its path is typed with its own code, and every write after `validate` is either under
  `apply`'s re-check or a recorded step; `outcome.md` lists the codes per command.
- AC-18 (judgment): the docs of (g) say what the code does, and the comments of `src/operation.ts` say why (T-30).

## Migration

- Exit codes and final-line codes of the nine commands change for argument errors (1 to 2) and refusals (`UNTYPED`
  to their own codes); no CLI form changes, so no refusal of an old form is needed. Callers inside Limen that read
  these commands' outcomes go through the client function of the final line (T-26 (4)) and are adjusted in this
  ticket.
- The step record of `group start` is additive: a run written before this ticket reads as today, shown by a fixture
  test of such a run. A change that is not additive (a new required field of `run.json` or `record.json`) is a plan
  change: the implementer stops with `BLOCKED`.

## Risk

- spawn is on every path: a regression there stops every job. The existing spawn tests, the gate and the race test
  cover it; the implementer changes the order of spawn's steps, not their effects.
- Moving checks before the lock opens a window between `validate` and `apply`; T-38 (2)'s re-check under the lock and
  exit 3 close it, and the race test shows it.
- Converting nine commands in one ticket is large; when the implementer cannot finish within its context, it stops
  with `BLOCKED` naming the commands done and left, and the main session asks Adrian how to split.

## Rollback

`git revert $(git log --format=%H --grep='^R-092:' adrian-rebuild --)`. `outcome.md` states whether the reverted code
reads a `group start` run written by this ticket (the step record is additive), with the evidence.

## Decisions

- 2026-11-21 D-061 and D-070 (Adrian): quoted in `## Problem`.
- 2026-11-21 (main session, review round 1, `review.md` → Round 1; the first round of fixes, for the resumed
  `rebuild-implementer`): findings 1–11 and the T-29 question, as decided there: (1) spawn's invalid `--branch` name
  and a `--task-file` that is a folder or unreadable are typed with their own codes in `validate`, a malformed name a
  usage error (T-02); (2) a group start refusal after a write at HEAD (a team whose spawn `validate` refuses) has a
  refusal test with the shared snapshot that fails at HEAD; (3) the refusal tests of converted commands named there
  move onto the shared snapshot, those beside live jobs after settling them or on a written record no process owns,
  and any that cannot is named in `outcome.md` with the reason; (4) a test fixes the exact key set of `StateView`;
  (5) refusal tests assert the code and the snapshot in one assertion; (6) `github review` and `github work` end a
  changed state before their first write, leaving no `.limen/github/inflight/` folder, their test compares the full
  snapshot, and the docs say the review fetch leaves objects but no ref; (7) after the first write the first error
  stays the command's error, a cleanup failure is added to it, and no refusal is thrown after a write; (8) an
  extension path from a record that no longer exists is refused with its own code, the usage error stays for the
  command line, and the test asserts the status; (9) a rerun of `group start` continues a team whose member job failed
  after its `apply`, with a rerun test; (10) no commit SHA outside `// regression: <sha>` in the test files the diff
  touches (T-30 (3)); (11) the shared snapshot holds the project's folders outside `.git`, with a case in
  `test/snapshot.test.ts`; (T-29) the tests at `test/cli/group.test.ts:221` and `:299` are each split in two. Finding
  12 is rejected: `land` is R-037's and took no ticket-lanes lock at HEAD.
- 2026-11-21 (main session, review round 2, `review.md` → Round 2; the second and last round of fixes, for the
  resumed `rebuild-implementer`): findings 1–6: (1) the wake-route reads (`currentNotificationSession`,
  `herdrWakePane`) and picture build's dataset read throw typed errors with their own codes and T-02's class, and
  continue reads its wake route in `validate`, before any write; (2) a group id from a record that names no run is
  refused with its own code, the usage error stays for the command line; (3) `requireGit` throws a typed environment
  error, exit 4; (4) `STATE_CHANGED` and `JOB_PID_PENDING` carry the same command as `next`, with its concrete
  values; (5) `GROUP_EXTENSIONS` becomes two codes, one per condition and class; (6) the `GROUP_PARTIAL_START` test is
  split in two. Each with a test; the refusals with the shared snapshot.
