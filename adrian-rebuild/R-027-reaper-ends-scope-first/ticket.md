<!-- PL: Ticket R-027 (A-005, A-056): żniwiarz zapisuje `failed` dopiero wtedy, gdy scope joba (albo, dla rekordu bez
scope, jego grupa procesów) zniknął: najpierw odczyty scope, potem TERM, czas łaski, KILL i potwierdzenie; gdy scope nie
znika, job zostaje `running` z jedną linią w logu i następny przebieg próbuje znowu. Linia porażki mówi, co sprawdzono,
jeden czas łaski obsługuje stop, wyczerpanie i żniwiarza, a test `s9` sprawdza, że silnik nie żyje. Stan: napisany 22.11
przy `9a370ae` z inwentarza `evidence/inventories/R-027.md`, gotowy na noc. -->

# R-027 The reaper ends a job only after its process group is gone

## Problem

Finding A-005 (high), its Decision, quoted from `audit.md`: "Before a terminal state the reaper checks the recorded
process group (with the start-time check used in `contain.ts`); a live group gets TERM, then KILL; only then `failed`,
with a log of what it checked; `pid` stays until the group is gone. Test `s9` asserts the engine is dead."

Finding A-056 (low), its Decision: "Process identity `{pid, start time, boot_id}` is a record field, written
synchronously in the transition to `running` (A-019); a missing identity means 'unknown', never 'alive'; the reaper
(A-005) compares `boot_id` and start time, and a mismatch means dead." R-021 made the field and its synchronous write
(`R-021-one-record-per-job/outcome.md`); what is left of A-056 is the reaper's side.

T-28 (5), quoted: "Behaviour that depends on Pi, the bridge, Herdr or systemd: a test on the fake engine and a
verification step in `plan.md` → `## Deployment`." T-31 (4): "a scan: no real waiting in tests". T-29 (1) and (6): the
tests of a module live in its mirror file, renamed in the ticket that rewrites the module. T-01: an error never
vanishes. R-026 (`d033016`) runs every job in `limen-job-<id>.scope` and has the winner of every terminal transition
end the whole scope; its `ticket.md` → Out of scope leaves "the reaper's group checks" to this ticket.

Facts at `9a370ae` (the read-only inventory `adrian-rebuild/evidence/inventories/R-027.md`; the main session checked
the ones it quotes):
1. `ownerState` (`src/runtime/reap.ts:20-40`) decides from the wrapper's recorded identity only: `unknown` without a
   pid or `born`; `dead` for another boot, a pid that does not answer, or a process whose start time differs; `alive`
   when the system cannot describe the pid (`unavailable`) or the start time matches. Its `query` parameter (`:22`) is
   used by no caller.
2. `reapDeadJobs` (`:75-119`) skips every record that is not `running` or is live, confirms a dead one after
   `reapConfirmMs()` (10 s, the test knob `LIMEN_REAP_CONFIRM_MS`, `:140-143`), takes the recovery claim, checks
   `liveJob` again and calls `finalizeJob(jobDir, "failed", "process group gone")` (`:113`). It never reads the
   process group or the job's scope.
3. `finalizeJob` (`src/job/finalize.ts:51-109`) reads the scope's readings (`:63-75`), writes the terminal transition
   (log line, `failure` of kind `reaped` through the pattern `/^process group gone\b/` of `src/job/record.ts:612`),
   runs `afterEnd` (the coordinator's wake, the group events, the tab), and only then, in a `finally`, ends the scope
   (`:101-107`, `:118-128`) with a SIGKILL and no TERM (`src/platform/linux.ts:305-315`). A failed end only logs
   `scope <unit> was not ended: …`; the reaper passes no `onScopeNotEnded`.
4. So after a reap the engine can run on under `failed` while `afterEnd` runs, and for good when the scope's end
   fails; meanwhile `limen prune` or another job's setup prune may remove a clean worktree (`jobKeeps` is true only
   for a non-terminal job, `src/runtime/pruning.ts:109-111`) and `spawn --branch` may reuse it
   (`src/job/spawning.ts:798-803`).
5. The platform adapter (`src/platform/platform.ts:74-119`) has `endScope` (`ended`, `gone` or `failed`; `gone` when
   the cgroup folder is missing or `systemctl --user is-active --quiet` exits 3, `linux.ts:42`), `processGroupAlive`,
   `signalProcessGroup` and `scopeReadings`; no member reads a scope's state without killing it, and none sends TERM to
   a scope. Every call is a synchronous `spawnSync` with a 10 s bound (`linux.ts:38`).
6. The fake `systemctl` of `test/plant.ts:175-203` emulates only `--user is-active --quiet` and `--user kill
   --signal=SIGKILL`; the fake engine records no pid of its own (`test/fake-engine.mjs`); `deaf` ignores TERM.
7. The grace of `limen stop` is a literal `5_000` (`src/job/stopping.ts:104`), the exhaustion's is `STOP_GRACE_MS =
   5_000` (`src/runtime/wrapper.ts:23`).
8. Tests: `test/u9-process-identity.test.ts` holds the reaper's tests (`:53`, `:72`, `:79`, `:93`, `:103`);
   `test/s9-housekeeping.test.ts:227` kills a wrapper and checks only the orphan's pid (`:246-247`). No test checks
   that a reaped job's engine is dead, that the record stays `running` while the scope lives, or a reap whose scope end
   fails. There is no `test/runtime/reap.test.ts`.
9. Callers: `limen status`, `limen show`, `limen sweep` and the wake hook's 500 ms tick (`hook/wake.ts:752`);
   R-032 makes `status` and `show` reads and runs the reaper from the seat's sweep (T-04).

## Change

(a) Platform (`src/platform/`): a member that reads a scope's state without signalling it, `active`, `gone` or `failed`
with the first line of the call's stderr, by the rules `endScope` uses today (a missing cgroup folder or `is-active`
exit 3 is `gone`); a member that sends TERM or KILL to a whole scope (`systemctl --user kill --signal=<signal> <unit>`).
`endScope` is built on both, so the rule for `gone` has one place. The fake `systemctl` of `test/plant.ts` emulates
`--signal=SIGTERM` (a TERM to the scope's members; the folder stays until no member lives).

(b) The reaper: once a running job is confirmed dead by its wrapper's identity (as today), it ends what is left of the
job before any terminal write:
1. it reads the scope's readings first, and these are the readings the terminal record holds (after the kill the
   folder may be gone);
2. a job whose record has `scope`: when the scope is `active`, TERM to the scope, a wait of at most the grace of (c)
   for `gone`, then KILL and a wait of at most 1 s for `gone`; a record without `scope` (written before R-026; none
   runs after a deployment, `## Deployment` 0.2) gets the same steps on the wrapper's process group;
3. only when the scope or group is gone, `failed` with the detail `process group gone: <checks>`, where the checks name
   the wrapper's pid and what ended the scope or group (`was gone`, `ended after TERM`, `ended after KILL`); the
   prefix keeps kind `reaped` and every older record's pattern;
4. when it is not gone, or its state cannot be read, the reaper writes no terminal state: the job stays `running`
   with its identity, one log line `reap: <unit or group> not ended: <reason>` is appended per attempt (T-01), and a
   later pass tries again after its confirmation.

(c) One grace constant for `limen stop`, the exhaustion and the reaper, 5 s, in one module, replacing the literal of
`src/job/stopping.ts:104` and `STOP_GRACE_MS` of `src/runtime/wrapper.ts:23` (R-028 sets A-020's value). A test knob of
`src/config.ts` (kind `test`, read through `testKnob` as `LIMEN_REAP_CONFIRM_MS` is) shortens it, so no test waits
the grace (T-31 (4)).

(d) The unused `query` parameter of `ownerState` goes.

(e) Tests, each failing before the change: `git mv` `test/u9-process-identity.test.ts` `test/runtime/reap.test.ts`
(T-29 (1), (6)), with its header naming the module, and new tests there: a job whose wrapper is killed alone and
whose engine still runs stays `running` until its scope is gone, then ends `failed` with the checks in its log line,
and its engine is dead; a `deaf` engine is ended by the KILL after the grace; a scope whose end fails
(`pathWithFailingScopeEnd`) leaves the job `running` with one log line and no terminal state; a record without
`scope` is ended by its process group. `test/s9-housekeeping.test.ts:227` also asserts that the reaped job's engine is
dead (A-005): the fake engine writes its pid as an event in `fake-events.jsonl` (`test/fake-engine.mjs`). Tests of
the two platform members on the fake in `test/platform/linux.test.ts`.

(f) Text that becomes false: `docs/jobs.md:222`, `templates/agents.md:202` (with the new hash in
`templates/.history/agents.md`), `docs/herdr-status.md:64-65` and `:101-102`, the comments of `src/runtime/reap.ts:1-4`,
`:60-63`, `:71-74` and `src/runtime/pruning.ts:105-107`.

## Out of scope

- Who runs the reaper: `status` and `show` stop reaping and the seat's sweep reaps (R-032, T-04); the wake hook's tick.
- `liveJob` and `ownerState` for their other callers (the deployment gate `seat/deploy.ts:291`, the migration's
  `folderLive`, `BRANCH_LIVE_JOB`, the group's `memberLive`, the keeper, the activity line); a terminal job of any
  finisher whose scope end failed; prune of a terminal job whose scope is still active (all three in R-032's notes).
- An `unavailable` process counted as alive and a null `bootId` (`reap.ts:32-35`); the recovery claim's empty `born`
  (`src/runtime/recovery.ts:36-39`), the coordinator registration's (`coordinator-registration.ts:133-134`) and
  `oldJobLive` (`src/job/migration.ts:201-203`).
- Signals, stop requests and failure kinds (R-028); the scope's TERM for `limen stop` and the exhaustion (they keep
  their group signals until R-028).

## Acceptance

- AC-1: `node --test test/runtime/reap.test.ts` → exit 0.
- AC-2: `node --test test/s9-housekeeping.test.ts` → exit 0.
- AC-3: `node --test test/platform/linux.test.ts` → exit 0.
- AC-4: `node --test test/job/finalize.test.ts` → exit 0; `node --test test/cli/stop.test.ts` → exit 0.
- AC-5: `node --test test/structure.test.ts` → exit 0.
- AC-6: `node adrian-rebuild/tools/fails-before.mjs` → exit 0, its output in `outcome.md` → `## Fails before`.
- AC-7: `node adrian-rebuild/tools/gate.mjs` → exit 0.
- AC-8: `npx biome check --error-on-warnings .` → exit 0; `node adrian-rebuild/tools/check.mjs` → exit 0.
- AC-9 (judgment): no path of the reaper writes a terminal state while the job's scope or group can still hold a
  process; the log line names what was checked; the grace has one definition.

## Migration

None. The record gains no field, and the detail keeps the prefix `process group gone`, so `FAILURE_PATTERNS` and the
migration read older records as before.

## Risk

- Until R-032, a reap inside `limen status`, `limen show` or the wake hook's tick takes up to the grace and 1 s more
  per live job, and the platform's calls block for at most 10 s each (R-026).
- A user manager that cannot answer leaves a dead wrapper's job `running`, with one log line per attempt, until it
  answers; the sweep's escalation is R-032's.

## Rollback

`git revert $(git log --format=%H --grep='^R-027:' adrian-rebuild --)`.

## Decisions

Settled by the documents when the ticket was written (2026-11-22, the main session's reading, not a night default):
1. A-005's "recorded process group" is read as the job's scope where the record has one: since R-026 the scope holds
   every process of the job, `setsid` ones included, which the group misses. A record without `scope` keeps A-005's
   group, the only container it has.
2. The order is A-005's: readings, TERM, grace, KILL, confirmed gone, and "only then `failed`"; a job whose scope is not
   gone stays `running` ("`pid` stays until the group is gone"), with T-01's log line, rather than a failure with a
   side failure.
3. One grace for stop, exhaustion and the reaper (T-25: one module per policy), at today's 5 s; R-028 brings A-020's
   10 s, so the two tickets can run in either order.
4. A-056's "unknown, never alive" stays: an unknown identity is reaped as today, now with its scope ended first.
5. The mechanism changes, not its callers (R-032, T-04), so this ticket adds no wait to a command that R-032 will not
   already move.
6. T-28 (5): the reaper's TERM and state reads are systemd behaviour, so the row's API is `systemd` and seat step 3.2
   names the trial (a wrapper killed alone, its engine ended, the record `failed` with its checks).
